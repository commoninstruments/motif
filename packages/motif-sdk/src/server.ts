import { err, ok, type Result } from "neverthrow";
import { estimateCost, estimateVideoCost } from "./cost";
import { buildGenerateBody } from "./generate";
import { GENERATION_MODELS, MODELS, UTILITY_MODELS } from "./models";
import { buildFalToolRequest, FAL_TOOLS, type FalToolRequest } from "./tools";
import type {
  GenerateOptions,
  JobStatus,
  MotifImage,
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

function endpointFromQueueUrl(
  url: string | undefined,
  fallback: string,
): string {
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/(.+)\/requests\//);
    return match?.[1] ?? fallback;
  } catch {
    return fallback;
  }
}

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
    options: GenerateOptions,
  ): Promise<Result<MotifResponse, MotifError>> {
    const config = MODELS[options.model];
    if (config?.useQueue) {
      return this.generateQueued(options);
    }

    const { endpoint, body } = buildGenerateBody(options);
    const response = await this.request(`${FAL_BASE_URL}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: this.ephemeralHeaders(options),
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data = await response.value.json();
    return this.normalizeResponse(data);
  }

  private async generateQueued(
    options: GenerateOptions,
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
        job.value.requestId,
      );
      if (status.isErr()) {
        return err(status.error);
      }

      if (status.value.status === "completed") {
        return this.getJobResult(job.value.endpoint, job.value.requestId);
      }

      if (status.value.status === "failed") {
        return err(
          new MotifError(status.value.error ?? "Queued generation failed", 0),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return err(new MotifError("Queued generation timed out", 0));
  }

  /** ─── Queue-Based Generation ──────────────────────────────── */

  /** Submit a generation to the fal.ai queue (returns immediately). */
  async submitGeneration(
    options: GenerateOptions,
  ): Promise<Result<QueuedJob, MotifError>> {
    const { endpoint, body } = buildGenerateBody(options);

    const response = await this.request(`${FAL_QUEUE_URL}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: this.ephemeralHeaders(options),
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data = (await response.value.json()) as {
      request_id: string;
      response_url: string;
    };

    return ok({
      requestId: data.request_id,
      endpoint: endpointFromQueueUrl(data.response_url, endpoint),
      estimatedCost: estimateCost(
        options.model,
        options.resolution,
        options.numImages,
      ),
    });
  }

  /** Check the status of a queued generation. */
  async getJobStatus(
    endpoint: string,
    requestId: string,
  ): Promise<Result<JobStatus, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}/status?logs=1`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data = (await response.value.json()) as {
      detail?: string;
      error?: string;
      status: string;
      queue_position?: number;
      logs?: Array<{ message: string; timestamp: string }>;
    };

    let status: JobStatus["status"];
    if (data.status === "IN_QUEUE") {
      status = "queued";
    } else if (data.status === "IN_PROGRESS") {
      status = "processing";
    } else if (data.status === "COMPLETED") {
      status = "completed";
    } else if (
      data.status === "FAILED" ||
      data.status === "ERROR" ||
      data.status === "CANCELED"
    ) {
      status = "failed";
    } else {
      return err(new MotifError(`Unknown job status: ${data.status}`, 0));
    }

    return ok({
      status,
      error: data.error ?? data.detail,
      queuePosition: data.queue_position,
      logs: data.logs,
    });
  }

  /** Fetch the completed result from the queue. */
  async getJobResult(
    endpoint: string,
    requestId: string,
  ): Promise<Result<MotifResponse, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data = await response.value.json();
    return this.normalizeResponse(data, requestId);
  }

  /** ─── Processing ──────────────────────────────────────────── */

  /** Upscale an image using clarity or crystal upscaler. */
  async upscale(
    options: UpscaleOptions,
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
      if (scaleFactor !== undefined) body.scale_factor = scaleFactor;
      if (creativity !== undefined) body.creativity = creativity;
    } else {
      // clarity (default)
      if (scaleFactor !== undefined) body.upscale_factor = scaleFactor;
      if (creativity !== undefined) body.creativity = creativity;
      if (resemblance !== undefined) body.resemblance = resemblance;
      if (upscalePrompt) body.prompt = upscalePrompt;
      if (negativePrompt) body.negative_prompt = negativePrompt;
      if (numInferenceSteps !== undefined)
        body.num_inference_steps = numInferenceSteps;
      if (guidanceScale !== undefined) body.guidance_scale = guidanceScale;
    }

    const response = await this.request(`${FAL_BASE_URL}/${config.endpoint}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data = await response.value.json();
    return this.normalizeResponse(data);
  }

  /** Remove the background from an image. */
  async removeBackground(
    options: RemoveBackgroundOptions,
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
        new MotifError(`Invalid background removal model: ${model}`, 0),
      );
    }

    const rbBody: Record<string, unknown> = { image_url: imageUrl };
    if (model === "rmbg") {
      // birefnet model supports these extra params
      if (variant) rbBody.model = variant;
      if (operatingResolution)
        rbBody.operating_resolution = operatingResolution;
      if (outputFormat) rbBody.output_format = outputFormat;
      if (refineForeground !== undefined)
        rbBody.refine_foreground = refineForeground;
      if (outputMask !== undefined) rbBody.output_mask = outputMask;
    }

    const response = await this.request(`${FAL_BASE_URL}/${config.endpoint}`, {
      method: "POST",
      body: JSON.stringify(rbBody),
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data = await response.value.json();
    return this.normalizeResponse(data);
  }

  /** ─── Video Generation ───────────────────────────────────── */

  /**
   * Generate a video from an image using Kling v3 Pro.
   * This uses the queue API since video generation takes 30-120s.
   * Returns immediately with a job — poll with getJobStatus/getVideoResult.
   */
  async submitVideo(
    options: VideoOptions,
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
      start_image_url: imageUrl,
      prompt,
      duration: String(duration),
      generate_audio: generateAudio,
    };

    if (endImageUrl) {
      body.end_image_url = endImageUrl;
    }
    if (negativePrompt) body.negative_prompt = negativePrompt;
    if (cfgScale !== undefined) body.cfg_scale = cfgScale;

    const response = await this.request(`${FAL_QUEUE_URL}/${config.endpoint}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (response.isErr()) {
      return err(response.error);
    }

    const data = (await response.value.json()) as {
      request_id: string;
      response_url: string;
    };

    return ok({
      requestId: data.request_id,
      endpoint: endpointFromQueueUrl(data.response_url, config.endpoint),
      estimatedCost: estimateVideoCost(duration, generateAudio),
    });
  }

  /** Fetch the completed video result from the queue. */
  async getVideoResult(
    endpoint: string,
    requestId: string,
  ): Promise<Result<VideoResponse, MotifError>> {
    const url = `${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}`;
    const response = await this.request(url);
    if (response.isErr()) {
      return err(response.error);
    }

    const data = (await response.value.json()) as {
      video?: {
        url: string;
        content_type: string;
        file_name: string;
        file_size: number;
      };
    };

    if (!data.video) {
      return err(new MotifError("No video in response", 0));
    }

    return ok({
      url: data.video.url,
      contentType: data.video.content_type,
      fileName: data.video.file_name,
      fileSize: data.video.file_size,
    });
  }

  /** ─── File Upload ─────────────────────────────────────────── */

  /**
   * Upload a file to fal.ai CDN storage and return the public URL.
   * Uses the two-step initiate + PUT flow.
   */
  async uploadToFalCdn(
    file: ArrayBuffer | Uint8Array,
    options: { contentType: string; fileName: string },
  ): Promise<Result<string, MotifError>> {
    const initiateResponse = await this.request(
      `${FAL_REST_URL}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      {
        method: "POST",
        body: JSON.stringify({
          content_type: options.contentType,
          file_name: options.fileName,
        }),
      },
    );
    if (initiateResponse.isErr()) {
      return err(initiateResponse.error);
    }

    const { file_url, upload_url } = (await initiateResponse.value.json()) as {
      file_url: string;
      upload_url: string;
    };

    let putResponse: Response;
    try {
      const body = Buffer.from(
        file instanceof Uint8Array ? file : new Uint8Array(file),
      );
      putResponse = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": options.contentType },
        body,
      });
    } catch (error) {
      return err(
        new MotifError(
          `Upload PUT failed: ${error instanceof Error ? error.message : String(error)}`,
          0,
        ),
      );
    }

    if (!putResponse.ok) {
      return err(
        new MotifError(
          `Upload PUT failed: ${putResponse.status}`,
          putResponse.status,
        ),
      );
    }

    return ok(file_url);
  }

  /** ─── Utilities ───────────────────────────────────────────── */

  /** Run a registered fal utility/tool endpoint. */
  async runTool(
    options: ToolRunOptions,
  ): Promise<Result<ToolResponse, MotifError>> {
    let request: FalToolRequest;
    try {
      request = buildFalToolRequest(options);
    } catch (error) {
      return err(
        new MotifError(
          error instanceof Error ? error.message : String(error),
          0,
        ),
      );
    }

    const response = await this.request(`${FAL_BASE_URL}/${request.endpoint}`, {
      method: "POST",
      body: JSON.stringify(request.body),
    });
    if (response.isErr()) {
      return err(response.error);
    }

    return ok((await response.value.json()) as ToolResponse);
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
      { method: "DELETE" },
    );
    if (response.isErr()) {
      return err(response.error);
    }
    return ok(undefined);
  }

  /** Estimate cost for a generation (no API call). */
  estimateCost(
    model: string,
    resolution?: Resolution,
    numImages?: number,
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
    options: RequestInit = {},
  ): Promise<Result<Response, MotifError>> {
    let lastError: MotifError | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: `Key ${this.apiKey}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        // Retry on 429 or 5xx
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < this.retries
        ) {
          const delay = 1000 * 2 ** attempt; // 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!response.ok) {
          const text = await response.text();
          return err(
            new MotifError(
              `Request failed: ${response.status} ${text}`,
              response.status,
            ),
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
          0,
        );

        // Retry on network errors
        if (attempt < this.retries) {
          const delay = 1000 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    return err(lastError ?? new MotifError("Request failed after retries", 0));
  }

  private ephemeralHeaders(options: { ephemeral?: boolean }): HeadersInit {
    return options.ephemeral ? { "X-Fal-Store-IO": "0" } : {};
  }

  /**
   * Normalize fal.ai responses.
   * Some APIs return `{ image: {...} }` instead of `{ images: [...] }`.
   */
  private normalizeResponse(
    data: unknown,
    fallbackRequestId?: string,
  ): Result<MotifResponse, MotifError> {
    const obj = data as Record<string, unknown>;
    const requestId =
      (obj.request_id as string | undefined) ??
      (obj.requestId as string | undefined) ??
      fallbackRequestId;

    if ("detail" in obj) {
      return err(
        new MotifError((obj as { detail: string }).detail, 0, "FAL_ERROR"),
      );
    }

    if ("image" in obj && !("images" in obj)) {
      return ok({
        images: [obj.image as MotifImage],
        seed: obj.seed as number | undefined,
        prompt: obj.prompt as string | undefined,
        requestId,
      });
    }

    return ok({
      ...(obj as unknown as MotifResponse),
      requestId,
    });
  }
}

export class MotifError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "MotifError";
    this.status = status;
    this.code = code;
  }
}
