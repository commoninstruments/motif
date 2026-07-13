import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { estimateCost, estimateVideoCost } from "./cost";
import {
  asNumber,
  asString,
  endpointFromQueueUrl,
  isRecord,
  parseImages,
  parseLogs,
  parseQueueSubmission,
  requestIdFromBody,
  toHeaderRecord,
  toMotifImage,
} from "./fal-parse";
import { buildGenerateBody } from "./generate";
import { GENERATION_MODELS, MODELS, UTILITY_MODELS } from "./models";
import { buildFalToolRequest, FAL_TOOLS } from "./tools";
import type { FalToolRequest } from "./tools";
import type {
  GenerateOptions,
  JobStatus,
  MotifResponse,
  MotifServerConfig,
  QueuedJob,
  RemoveBackgroundOptions,
  Resolution,
  ToolResponse,
  ToolRunOptions,
  UpscaleOptions,
  VideoOptions,
  VideoResponse,
} from "./types";

const FAL_BASE_URL = "https://fal.run";
const FAL_QUEUE_URL = "https://queue.fal.run";
const FAL_API_URL = "https://api.fal.ai";
const FAL_REST_URL = "https://rest.alpha.fal.ai";

/**
 * Motif Server SDK
 *
 * Server-side SDK for AI image generation via fal.ai.
 * All async methods return `Result<T, MotifError>` — no thrown exceptions.
 *
 * @example
 * ```typescript
 * import { MotifServer } from "./fal";
 *
 * const motif = new MotifServer(process.env.FAL_KEY!);
 * const result = await motif.generate({ prompt: "a red balloon", model: "banana" });
 *
 * if (result.isOk()) {
 *   console.log(result.value.images[0].url);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export class MotifServer {
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: MotifServerConfig | string) {
    if (typeof config === "string") {
      this.apiKey = config;
      this.timeout = 120_000;
      this.retries = 3;
    } else {
      this.apiKey = config.apiKey;
      this.timeout = config.timeout ?? 120_000;
      this.retries = config.retries ?? 3;
    }

    if (!this.apiKey) {
      throw new MotifError("API key is required", 0);
    }
  }

  /** ─── Synchronous Generation ──────────────────────────────── */

  /** Generate images synchronously (blocks until fal.ai returns). */
  async generate(
    options: GenerateOptions
  ): Promise<Result<MotifResponse, MotifError>> {
    const config = MODELS[options.model];
    if (config?.useQueue === true) {
      return await this.generateQueued(options);
    }

    let built: ReturnType<typeof buildGenerateBody>;
    try {
      built = buildGenerateBody(options);
    } catch (error) {
      return err(toMotifError(error));
    }
    const { endpoint, body } = built;
    const response = await this.request(`${FAL_BASE_URL}/${endpoint}`, {
      body: JSON.stringify(body),
      headers: this.ephemeralHeaders(options),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return this.normalizeResponse(data);
  }

  private async generateQueued(
    options: GenerateOptions
  ): Promise<Result<MotifResponse, MotifError>> {
    const job = await this.submitGeneration(options);
    if (job.isErr()) {
      return err(job.error);
    }

    const pollIntervalMs = 3000;
    const maxAttempts = 160;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getJobStatus(
        job.value.endpoint,
        job.value.requestId
      );
      if (status.isErr()) {
        return err(status.error);
      }

      if (status.value.status === "completed") {
        return await this.getJobResult(job.value.endpoint, job.value.requestId);
      }

      if (status.value.status === "failed") {
        const message = status.value.error ?? "Queued generation failed";
        return err(new MotifError(message, 0, undefined, job.value.requestId));
      }

      await new Promise((resolve) => {
        setTimeout(resolve, pollIntervalMs);
      });
    }

    return err(new MotifError("Queued generation timed out", 0));
  }

  /** ─── Queue-Based Generation ──────────────────────────────── */

  /** Submit a generation to the fal.ai queue (returns immediately). */
  async submitGeneration(
    options: GenerateOptions
  ): Promise<Result<QueuedJob, MotifError>> {
    let built: ReturnType<typeof buildGenerateBody>;
    try {
      built = buildGenerateBody(options);
    } catch (error) {
      return err(toMotifError(error));
    }
    const { endpoint, body } = built;

    const response = await this.request(`${FAL_QUEUE_URL}/${endpoint}`, {
      body: JSON.stringify(body),
      headers: this.ephemeralHeaders(options),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    const submission = parseQueueSubmission(data);

    return ok({
      endpoint: endpointFromQueueUrl(submission.responseUrl, endpoint),
      estimatedCost: estimateCost(
        options.model,
        options.resolution,
        options.numImages
      ),
      requestId: submission.requestId,
    });
  }

  /** Check the status of a queued generation. */
  async getJobStatus(
    endpoint: string,
    requestId: string
  ): Promise<Result<JobStatus, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}/status?logs=1`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    const record = isRecord(data) ? data : {};
    const rawStatus = asString(record.status);

    let status: JobStatus["status"];
    if (rawStatus === "IN_QUEUE") {
      status = "queued";
    } else if (rawStatus === "IN_PROGRESS") {
      status = "processing";
    } else if (rawStatus === "COMPLETED") {
      status = "completed";
    } else if (
      rawStatus === "FAILED" ||
      rawStatus === "ERROR" ||
      rawStatus === "CANCELED"
    ) {
      status = "failed";
    } else {
      return err(new MotifError(`Unknown job status: ${rawStatus}`, 0));
    }

    return ok({
      error: asString(record.error) ?? asString(record.detail),
      logs: parseLogs(record.logs),
      queuePosition: asNumber(record.queue_position),
      status,
    });
  }

  /** Fetch the completed result from the queue. */
  async getJobResult(
    endpoint: string,
    requestId: string
  ): Promise<Result<MotifResponse, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return this.normalizeResponse(data, requestId);
  }

  /** ─── Processing ──────────────────────────────────────────── */

  /** Upscale an image using clarity or crystal upscaler. */
  async upscale(
    options: UpscaleOptions
  ): Promise<Result<MotifResponse, MotifError>> {
    const {
      imageUrl,
      model = "clarity",
      scaleFactor,
      creativity,
      resemblance,
      prompt: upscalePrompt,
      negativePrompt,
      numInferenceSteps,
      guidanceScale,
    } = options;

    const config = MODELS[model];
    if (!config || config.type !== "utility") {
      return err(new MotifError(`Invalid upscale model: ${model}`, 0));
    }

    const body: Record<string, unknown> = { image_url: imageUrl };

    if (model === "crystal") {
      if (scaleFactor !== undefined) {
        body.scale_factor = scaleFactor;
      }
      if (creativity !== undefined) {
        body.creativity = creativity;
      }
    } else {
      // clarity (default)
      if (scaleFactor !== undefined) {
        body.upscale_factor = scaleFactor;
      }
      if (creativity !== undefined) {
        body.creativity = creativity;
      }
      if (resemblance !== undefined) {
        body.resemblance = resemblance;
      }
      if (upscalePrompt !== undefined && upscalePrompt !== "") {
        body.prompt = upscalePrompt;
      }
      if (negativePrompt !== undefined && negativePrompt !== "") {
        body.negative_prompt = negativePrompt;
      }
      if (numInferenceSteps !== undefined) {
        body.num_inference_steps = numInferenceSteps;
      }
      if (guidanceScale !== undefined) {
        body.guidance_scale = guidanceScale;
      }
    }

    const response = await this.request(`${FAL_BASE_URL}/${config.endpoint}`, {
      body: JSON.stringify(body),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return this.normalizeResponse(data);
  }

  /** Remove the background from an image. */
  async removeBackground(
    options: RemoveBackgroundOptions
  ): Promise<Result<MotifResponse, MotifError>> {
    const {
      imageUrl,
      model = "rmbg",
      variant,
      operatingResolution,
      outputFormat,
      refineForeground,
      outputMask,
    } = options;

    const config = MODELS[model];
    if (!config) {
      return err(
        new MotifError(`Invalid background removal model: ${model}`, 0)
      );
    }

    const rbBody: Record<string, unknown> = { image_url: imageUrl };
    if (model === "rmbg") {
      // birefnet model supports these extra params
      if (variant) {
        rbBody.model = variant;
      }
      if (operatingResolution) {
        rbBody.operating_resolution = operatingResolution;
      }
      if (outputFormat) {
        rbBody.output_format = outputFormat;
      }
      if (refineForeground !== undefined) {
        rbBody.refine_foreground = refineForeground;
      }
      if (outputMask !== undefined) {
        rbBody.output_mask = outputMask;
      }
    }

    const response = await this.request(`${FAL_BASE_URL}/${config.endpoint}`, {
      body: JSON.stringify(rbBody),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return this.normalizeResponse(data);
  }

  /** ─── Video Generation ───────────────────────────────────── */

  /**
   * Generate a video from an image using Kling v3 Pro.
   * This uses the queue API since video generation takes 30-120s.
   * Returns immediately with a job — poll with getJobStatus/getVideoResult.
   */
  async submitVideo(
    options: VideoOptions
  ): Promise<Result<QueuedJob, MotifError>> {
    const {
      imageUrl,
      prompt,
      duration = 5,
      generateAudio = true,
      endImageUrl,
      negativePrompt,
      cfgScale,
    } = options;

    const config = MODELS.kling;
    if (!config) {
      return err(new MotifError("Kling video model not found", 0));
    }

    const body: Record<string, unknown> = {
      duration: String(duration),
      generate_audio: generateAudio,
      prompt,
      start_image_url: imageUrl,
    };

    if (endImageUrl !== undefined && endImageUrl !== "") {
      body.end_image_url = endImageUrl;
    }
    if (negativePrompt !== undefined && negativePrompt !== "") {
      body.negative_prompt = negativePrompt;
    }
    if (cfgScale !== undefined) {
      body.cfg_scale = cfgScale;
    }

    const response = await this.request(`${FAL_QUEUE_URL}/${config.endpoint}`, {
      body: JSON.stringify(body),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    const submission = parseQueueSubmission(data);

    return ok({
      endpoint: endpointFromQueueUrl(submission.responseUrl, config.endpoint),
      estimatedCost: estimateVideoCost(duration, generateAudio),
      requestId: submission.requestId,
    });
  }

  /** Fetch the completed video result from the queue. */
  async getVideoResult(
    endpoint: string,
    requestId: string
  ): Promise<Result<VideoResponse, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    const video =
      isRecord(data) && isRecord(data.video) ? data.video : undefined;

    if (video === undefined) {
      return err(new MotifError("No video in response", 0));
    }

    return ok({
      contentType: asString(video.content_type) ?? "",
      fileName: asString(video.file_name) ?? "",
      fileSize: asNumber(video.file_size) ?? 0,
      url: asString(video.url) ?? "",
    });
  }

  /** ─── File Upload ─────────────────────────────────────────── */

  /**
   * Upload a file to fal.ai CDN storage and return the public URL.
   * Uses the two-step initiate + PUT flow.
   */
  async uploadToFalCdn(
    file: ArrayBuffer | Uint8Array,
    options: { contentType: string; fileName: string }
  ): Promise<Result<string, MotifError>> {
    const initiateResponse = await this.request(
      `${FAL_REST_URL}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      {
        body: JSON.stringify({
          content_type: options.contentType,
          file_name: options.fileName,
        }),
        method: "POST",
      }
    );
    if (initiateResponse.isErr()) {
      return err(initiateResponse.error);
    }

    const initiateData: unknown = await initiateResponse.value.json();
    const fileUrl = isRecord(initiateData)
      ? (asString(initiateData.file_url) ?? "")
      : "";
    const uploadUrl = isRecord(initiateData)
      ? asString(initiateData.upload_url)
      : undefined;

    if (uploadUrl === undefined || uploadUrl === "") {
      return err(
        new MotifError("Upload initiate response missing upload_url", 0)
      );
    }

    let putResponse: Response;
    try {
      const body = Buffer.from(
        file instanceof Uint8Array ? file : new Uint8Array(file)
      );
      putResponse = await fetch(uploadUrl, {
        body,
        headers: { "Content-Type": options.contentType },
        method: "PUT",
      });
    } catch (error) {
      return err(
        new MotifError(
          `Upload PUT failed: ${error instanceof Error ? error.message : String(error)}`,
          0
        )
      );
    }

    if (!putResponse.ok) {
      return err(
        new MotifError(
          `Upload PUT failed: ${putResponse.status}`,
          putResponse.status
        )
      );
    }

    return ok(fileUrl);
  }

  /** ─── Utilities ───────────────────────────────────────────── */

  /** Run a registered fal utility/tool endpoint. */
  async runTool(
    options: ToolRunOptions
  ): Promise<Result<ToolResponse, MotifError>> {
    let request: FalToolRequest;
    try {
      request = buildFalToolRequest(options);
    } catch (error) {
      return err(
        new MotifError(
          error instanceof Error ? error.message : String(error),
          0
        )
      );
    }

    const response = await this.request(`${FAL_BASE_URL}/${request.endpoint}`, {
      body: JSON.stringify(request.body),
      method: "POST",
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data: unknown = await response.value.json();
    return ok(isRecord(data) ? data : {});
  }

  /**
   * Delete fal's stored IO payloads for a completed request.
   *
   * This removes request input/output payload files exposed by fal's payloads
   * API. It does not remove billing/account metadata or input files separately
   * uploaded to fal storage before a request.
   */
  async deletePayloads(requestId: string): Promise<Result<void, MotifError>> {
    const response = await this.request(
      `${FAL_API_URL}/v1/models/requests/${encodeURIComponent(requestId)}/payloads`,
      { method: "DELETE" }
    );
    if (response.isErr()) {
      return err(response.error);
    }
    return ok();
  }

  /** Estimate cost for a generation (no API call). */
  estimateCost(
    model: string,
    resolution?: Resolution,
    numImages?: number
  ): number {
    return estimateCost(model, resolution, numImages);
  }

  /** Build the fal.ai request body without sending it. */
  buildRequestBody(options: GenerateOptions): {
    endpoint: string;
    body: Record<string, unknown>;
  } {
    return buildGenerateBody(options);
  }

  /** Model registry. */
  get models() {
    return MODELS;
  }

  /** Generation model keys. */
  get generationModels() {
    return GENERATION_MODELS;
  }

  /** Utility model keys. */
  get utilityModels() {
    return UTILITY_MODELS;
  }

  /** Registered fal utility/tool endpoints. */
  get tools() {
    return FAL_TOOLS;
  }

  /** ─── Private ─────────────────────────────────────────────── */

  /** Authenticated fetch to fal.ai APIs with retry logic. */
  private async request(
    url: string,
    options: RequestInit = {}
  ): Promise<Result<Response, MotifError>> {
    let lastError: MotifError | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeout);

      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Key ${this.apiKey}`,
            "Content-Type": "application/json",
            ...toHeaderRecord(options.headers),
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Retry on 429 or 5xx
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < this.retries
        ) {
          const delay = 1000 * 2 ** attempt; // 1s, 2s, 4s
          await new Promise((r) => {
            setTimeout(r, delay);
          });
          continue;
        }

        if (!response.ok) {
          const text = await response.text();
          const message = `Request failed: ${response.status} ${text}`;
          const requestId =
            response.headers.get("x-fal-request-id") ?? requestIdFromBody(text);
          return err(
            new MotifError(message, response.status, undefined, requestId)
          );
        }

        return ok(response);
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof MotifError) {
          return err(error);
        }

        lastError = new MotifError(
          error instanceof Error ? error.message : String(error),
          0
        );

        // Retry on network errors
        if (attempt < this.retries) {
          const delay = 1000 * 2 ** attempt;
          await new Promise((r) => {
            setTimeout(r, delay);
          });
        }
      }
    }

    return err(lastError ?? new MotifError("Request failed after retries", 0));
  }

  private ephemeralHeaders(options: { ephemeral?: boolean }): HeadersInit {
    return options.ephemeral === true ? { "X-Fal-Store-IO": "0" } : {};
  }

  /**
   * Normalize fal.ai responses.
   * Some APIs return `{ image: {...} }` instead of `{ images: [...] }`.
   */
  private normalizeResponse(
    data: unknown,
    fallbackRequestId?: string
  ): Result<MotifResponse, MotifError> {
    if (!isRecord(data)) {
      return err(
        new MotifError("Unexpected fal response shape", 0, "FAL_ERROR")
      );
    }
    const obj = data;
    const requestId =
      asString(obj.request_id) ?? asString(obj.requestId) ?? fallbackRequestId;

    if ("detail" in obj) {
      return err(new MotifError(asString(obj.detail) ?? "", 0, "FAL_ERROR"));
    }

    if ("image" in obj && !("images" in obj)) {
      return ok({
        images: [toMotifImage(obj.image)],
        prompt: asString(obj.prompt),
        requestId,
        seed: asNumber(obj.seed),
      });
    }

    return ok({
      images: parseImages(obj.images),
      prompt: asString(obj.prompt),
      requestId,
      seed: asNumber(obj.seed),
    });
  }
}

export class MotifError extends Error {
  readonly status: number;
  readonly code?: string;
  /** fal's request-correlation id (from the `x-fal-request-id` header or the
   * error body). Ties a failure back to fal's dashboard/support. */
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    requestId?: string
  ) {
    super(message);
    this.name = "MotifError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Coerce an unknown thrown value into a `MotifError`.
 *
 * Preserves an existing `MotifError`, and lifts a string `code` field (e.g.
 * `CreativeOptionError`'s `"INVALID_OPTION"`) onto the returned error so callers
 * keep structured error metadata. Status `0` marks a non-HTTP local error.
 */
function toMotifError(error: unknown): MotifError {
  if (error instanceof MotifError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  return new MotifError(message, 0, code);
}
