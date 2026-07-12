import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import {
  FAL_TOOLS,
  getFalKeyFromEnv,
  isFalToolId,
  MotifServer,
} from "@howells/motif-sdk";
import type {
  GenerateOptions,
  MotifError,
  MotifResponse,
  RemoveBackgroundOptions,
  Result,
  ToolResponse,
  ToolRunOptions,
  UpscaleOptions,
  VideoOptions,
  VideoResponse,
} from "@howells/motif-sdk";

import { hasText } from "../utils/text";

export type { GenerateOptions, MotifResponse } from "@howells/motif-sdk";

/** CLI-specific generate options that accept local file paths */
export interface CliGenerateOptions extends Omit<
  GenerateOptions,
  "editImageUrls"
> {
  editImages?: string[];
}

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function getMimeType(filePath: string): string {
  return (
    MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

/** Unwrap a Result, re-throwing the MotifError on failure. */
function unwrap<T>(result: Result<T, MotifError>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

let _apiKey: string | null = null;
let _motif: MotifServer | null = null;

export function setApiKey(key: string): void {
  _apiKey = key;
  process.env.FAL_KEY = key;
  _motif = null; // Reset so next call picks up new key
}

export function getApiKey(): string {
  if (hasText(_apiKey)) {
    return _apiKey;
  }

  const envKey = getFalKeyFromEnv();
  if (hasText(envKey)) {
    return envKey;
  }

  throw new Error(
    "FAL_KEY not found. Set FAL_KEY environment variable or configure in ~/.motif/config.json"
  );
}

function getMotif(): MotifServer {
  _motif ??= new MotifServer(getApiKey());
  return _motif;
}

/** Generate an image (CLI-specific: handles local file uploads for edit mode) */
export async function generate(
  options: CliGenerateOptions
): Promise<MotifResponse> {
  const { editImages, ...rest } = options;

  // Upload local files to fal CDN if needed
  let editImageUrls: string[] | undefined;
  if (editImages !== undefined && editImages.length > 0) {
    editImageUrls = await Promise.all(
      editImages.map(async (img) =>
        img.startsWith("http")
          ? await Promise.resolve(img)
          : await uploadFile(img)
      )
    );
  }

  return unwrap(await getMotif().generate({ ...rest, editImageUrls }));
}

/** Delete fal's stored request payloads after local download. */
export async function deletePayloads(requestId: string): Promise<void> {
  unwrap(await getMotif().deletePayloads(requestId));
}

/** Upscale an image */
export async function upscale(options: UpscaleOptions): Promise<MotifResponse> {
  return unwrap(await getMotif().upscale(options));
}

/** Remove background from an image */
export async function removeBackground(
  options: RemoveBackgroundOptions
): Promise<MotifResponse> {
  return unwrap(await getMotif().removeBackground(options));
}

/** Run a registered fal utility/tool endpoint, uploading local inputs first. */
export async function runTool(options: ToolRunOptions): Promise<ToolResponse> {
  if (!isFalToolId(options.tool)) {
    throw new Error(`Unknown fal tool: ${options.tool}`);
  }
  const tool = FAL_TOOLS[options.tool];
  const upload = async (value: string) =>
    value.startsWith("http") || value.startsWith("data:")
      ? await Promise.resolve(value)
      : await uploadFile(value);

  const values =
    options.inputs ?? (hasText(options.input) ? [options.input] : []);
  const uploaded = await Promise.all(
    values.map(async (value) => await upload(value))
  );

  return unwrap(
    await getMotif().runTool({
      ...options,
      input: tool.inputKind === "images" ? undefined : uploaded[0],
      inputs: tool.inputKind === "images" ? uploaded : undefined,
    })
  );
}

/** Submit a video generation job (returns immediately, poll for result) */
export async function submitVideo(
  options: Omit<VideoOptions, "imageUrl"> & { imageUrl: string }
): Promise<{ requestId: string; endpoint: string; estimatedCost: number }> {
  // Upload local file if needed
  const imageUrl = options.imageUrl.startsWith("http")
    ? options.imageUrl
    : await uploadFile(options.imageUrl);

  return unwrap(await getMotif().submitVideo({ ...options, imageUrl }));
}

/** Poll a video job until completion */
export async function waitForVideo(
  endpoint: string,
  requestId: string,
  onProgress?: (status: string, position?: number) => void
): Promise<VideoResponse> {
  const motif = getMotif();
  const pollInterval = 3000;
  const maxAttempts = 120;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusResult = unwrap(await motif.getJobStatus(endpoint, requestId));

    if (statusResult.status === "completed") {
      return unwrap(await motif.getVideoResult(endpoint, requestId));
    }
    if (statusResult.status === "failed") {
      throw new Error(statusResult.error ?? "Video generation failed");
    }

    onProgress?.(statusResult.status, statusResult.queuePosition);
    await new Promise<void>((r) => {
      setTimeout(r, pollInterval);
    });
  }

  throw new Error("Video generation timed out");
}

/**
 * Upload a local file to fal.ai CDN storage and return the public URL.
 */
export async function uploadFile(filePath: string): Promise<string> {
  const contentType = getMimeType(filePath);
  const fileName = filePath.split("/").pop() ?? "upload.bin";
  const buffer = await readFile(filePath);

  return unwrap(
    await getMotif().uploadToFalCdn(buffer, { contentType, fileName })
  );
}
