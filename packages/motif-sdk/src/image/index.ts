/**
 * `@howells/motif-sdk/image` — provider-agnostic image generation + editing.
 *
 * ESM-only subpath export, built on the Vercel AI SDK image interface
 * (`generateImage`, `@ai-sdk/*`). Additive to the fal-specific `MotifServer`
 * surface; reuses the SDK's Result convention (`Result<T, MotifError>` — no
 * thrown exceptions). Google (Gemini) is the only provider in Phase 1a.
 *
 * @example
 * ```ts
 * import { createMotifImage } from "@howells/motif-sdk/image";
 *
 * const img = createMotifImage({ defaultProvider: "google" });
 * const r = await img.generate({ tier: "fast", prompt: "a bare concrete wall" });
 * if (r.isOk()) console.log(r.value.images[0].mediaType, r.value.cost);
 * ```
 */

import { generateImage } from "ai";
import type { GenerateImageResult, ImageModel, JSONValue } from "ai";
import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import { MotifError } from "../server";
import { costForImages } from "./cost";
import {
  googleModelForTier,
  resolveModel as resolveGoogleModel,
} from "./google";
import type {
  EditImageOptions,
  GenerateImageOptions,
  ImageProviderId,
  ImageTier,
  MotifImageClient,
  MotifImageConfig,
  MotifImageFile,
  MotifImageResult,
} from "./types";

export type {
  EditImageOptions,
  GenerateImageOptions,
  ImageCost,
  ImageCostSource,
  ImageProviderId,
  ImageTier,
  MotifImageClient,
  MotifImageConfig,
  MotifImageFile,
  MotifImageResult,
} from "./types";
export { GOOGLE_API_KEY_ENV, GOOGLE_TIER_MODELS } from "./google";
export { costForImages, costFromProviderMetadata } from "./cost";

const DEFAULT_TIER: ImageTier = "balanced";
const DEFAULT_PROVIDER: ImageProviderId = "google";

/** A model resolver: builds an AI SDK `ImageModel` for a (provider, model, key). */
export type ResolveImageModel = (
  provider: ImageProviderId,
  modelId: string,
  apiKey?: string
) => ImageModel;

/** Internal dependency-injection seam (default: real `generateImage` + adapters). */
export interface MotifImageDeps {
  generateImage?: typeof generateImage;
  resolveModel?: ResolveImageModel;
}

/**
 * Create a provider-agnostic image client.
 *
 * @param config - provider selection + keys (keys fall back to env).
 * @param deps - INTERNAL testing seam. Defaults to the real AI SDK `generateImage`
 *   and the built-in provider adapters; tests inject fakes here to run offline.
 */
export function createMotifImage(
  config: MotifImageConfig = {},
  deps: MotifImageDeps = {}
): MotifImageClient {
  const generateImageFn = deps.generateImage ?? generateImage;
  const resolveModelFn = deps.resolveModel ?? defaultResolveModel;

  function resolveProvider(provider?: ImageProviderId): ImageProviderId {
    return provider ?? config.defaultProvider ?? DEFAULT_PROVIDER;
  }

  function apiKeyFor(provider: ImageProviderId): string | undefined {
    if (provider === "google") {
      return config.google?.apiKey;
    }
    return undefined;
  }

  async function generate(
    opts: GenerateImageOptions
  ): Promise<Result<MotifImageResult, MotifError>> {
    const provider = resolveProvider(opts.provider);
    try {
      const modelId = resolveModelId(provider, opts.model, opts.tier);
      const model = resolveModelFn(provider, modelId, apiKeyFor(provider));
      const result = await generateImageFn({
        model,
        prompt: opts.prompt,
        ...(opts.n === undefined ? {} : { n: opts.n }),
        ...(opts.size === undefined ? {} : { size: opts.size }),
        ...(opts.aspectRatio === undefined
          ? {}
          : { aspectRatio: opts.aspectRatio }),
        ...(opts.providerOptions === undefined
          ? {}
          : { providerOptions: toProviderOptions(opts.providerOptions) }),
      });
      return ok(toMotifImageResult(result, provider, modelId));
    } catch (error) {
      return err(toMotifError(error));
    }
  }

  async function edit(
    opts: EditImageOptions
  ): Promise<Result<MotifImageResult, MotifError>> {
    const provider = resolveProvider(opts.provider);
    try {
      const modelId = resolveModelId(provider, opts.model, opts.tier);
      const model = resolveModelFn(provider, modelId, apiKeyFor(provider));
      const result = await generateImageFn({
        model,
        prompt: {
          images: opts.images,
          text: opts.instruction,
          ...(opts.mask === undefined ? {} : { mask: opts.mask }),
        },
        ...(opts.n === undefined ? {} : { n: opts.n }),
        ...(opts.providerOptions === undefined
          ? {}
          : { providerOptions: toProviderOptions(opts.providerOptions) }),
      });
      return ok(toMotifImageResult(result, provider, modelId));
    } catch (error) {
      return err(toMotifError(error));
    }
  }

  return { generate, edit };
}

/** Default provider dispatch. Only `google` is wired in Phase 1a. */
function defaultResolveModel(
  provider: ImageProviderId,
  modelId: string,
  apiKey?: string
): ImageModel {
  if (provider === "google") {
    return resolveGoogleModel(modelId, apiKey);
  }
  throw new MotifError(`Unsupported image provider: ${provider}`, 0);
}

/** Resolve the model id: explicit `model` wins, else the provider's tier map. */
function resolveModelId(
  provider: ImageProviderId,
  model: string | undefined,
  tier: ImageTier | undefined
): string {
  if (model !== undefined && model !== "") {
    return model;
  }
  const resolvedTier = tier ?? DEFAULT_TIER;
  if (provider === "google") {
    return googleModelForTier(resolvedTier);
  }
  throw new MotifError(`Unsupported image provider: ${provider}`, 0);
}

/** Map the AI SDK result → normalized MotifImageResult (with cost + requestId). */
function toMotifImageResult(
  result: GenerateImageResult,
  provider: ImageProviderId,
  model: string
): MotifImageResult {
  const images: MotifImageFile[] = result.images.map((file) => ({
    uint8Array: file.uint8Array,
    base64: file.base64,
    mediaType: file.mediaType,
  }));
  const cost = costForImages(
    provider,
    model,
    result.providerMetadata,
    images.length
  );
  const requestId = extractRequestId(result);
  return {
    images,
    cost,
    provider,
    model,
    ...(requestId === undefined ? {} : { requestId }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Look for a provider correlation id in providerMetadata, then response headers. */
function extractRequestId(result: GenerateImageResult): string | undefined {
  const fromMetadata = requestIdFromMetadata(result.providerMetadata);
  if (fromMetadata !== undefined) {
    return fromMetadata;
  }
  for (const response of result.responses) {
    const { headers } = response;
    if (headers) {
      const id =
        headers["x-request-id"] ??
        headers["x-goog-request-id"] ??
        headers["x-fal-request-id"];
      if (typeof id === "string" && id !== "") {
        return id;
      }
    }
  }
  return undefined;
}

function requestIdFromMetadata(providerMetadata: unknown): string | undefined {
  if (!isRecord(providerMetadata)) {
    return undefined;
  }
  for (const value of Object.values(providerMetadata)) {
    if (isRecord(value)) {
      const id = value.requestId ?? value.request_id;
      if (typeof id === "string" && id !== "") {
        return id;
      }
    }
  }
  return undefined;
}

/**
 * Coerce a public `providerOptions` (values typed `unknown`) into the AI SDK's
 * JSON-only `Record<string, Record<string, JSONValue>>`, dropping non-JSON
 * values (functions, symbols, undefined) as `null`.
 */
function toProviderOptions(
  input: Record<string, Record<string, unknown>>
): Record<string, Record<string, JSONValue>> {
  const out: Record<string, Record<string, JSONValue>> = {};
  for (const [namespace, options] of Object.entries(input)) {
    const inner: Record<string, JSONValue> = {};
    for (const [key, value] of Object.entries(options)) {
      inner[key] = toJsonValue(value);
    }
    out[namespace] = inner;
  }
  return out;
}

function toJsonValue(value: unknown): JSONValue {
  if (value === null) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      const arr: JSONValue[] = [];
      for (const item of value) {
        arr.push(toJsonValue(item));
      }
      return arr;
    }
    const obj: Record<string, JSONValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      obj[key] = toJsonValue(entry);
    }
    return obj;
  }
  // undefined, function, bigint, symbol → not JSON-representable.
  return null;
}

/**
 * Coerce an unknown thrown value into a `MotifError`, mirroring server.ts's
 * mapping: preserve an existing `MotifError`, lift a string `code`, and mark
 * non-HTTP local failures with status `0`.
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
