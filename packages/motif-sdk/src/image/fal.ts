/**
 * fal provider adapter.
 *
 * Builds a Vercel AI SDK `ImageModel` from `@ai-sdk/fal`. Building a model
 * performs no network I/O — the request only happens when `generateImage`
 * invokes `model.doGenerate`. This is the lightweight fal *image* adapter; the
 * richer `MotifServer` fal client (queue, upload, upscale, rmbg, video, tools)
 * is a separate, later fold (design doc §8, phase 1d).
 *
 * ENDPOINT QUIRK (Phase 0): fal's gpt-image endpoint wants `image_size` as a
 * STRING enum (e.g. "1024x1024"), passed at generate time via
 * `providerOptions.fal.image_size` — NOT the AI SDK's generic `size` object.
 * This adapter does NOT auto-inject it; callers pass `providerOptions` when they
 * need a specific size. Example:
 *   img.generate({
 *     provider: "fal",
 *     tier: "balanced",
 *     prompt: "...",
 *     providerOptions: { fal: { image_size: "1024x1024" } },
 *   });
 */

import { createFal } from "@ai-sdk/fal";
import type { ImageModel } from "ai";

import { MODELS } from "../models";
import { MotifError } from "../server";
import type { ImageProviderAdapter } from "./provider";
import type { ImageTier } from "./types";

/**
 * fal model ids by tier. `fast` uses FLUX Pro Ultra (fast, cheap); the higher
 * tiers use fal's gpt-image endpoint for its edit quality. Both are proven fal
 * endpoints that also exist in the `../models` registry snapshot.
 */
const FAL_FLUX_MODEL = "fal-ai/flux-pro/v1.1-ultra";
const FAL_GPT_IMAGE_MODEL = "fal-ai/gpt-image-1.5";

/** Tier → fal model id. */
export const FAL_TIER_MODELS: Readonly<Record<ImageTier, string>> = {
  fast: FAL_FLUX_MODEL,
  balanced: FAL_GPT_IMAGE_MODEL,
  quality: FAL_GPT_IMAGE_MODEL,
  hero: FAL_GPT_IMAGE_MODEL,
};

/** Env var read for the fal key when `apiKey` is not supplied in config. */
export const FAL_API_KEY_ENV = "FAL_KEY";

/**
 * Static fal USD/image, keyed by model id. Sourced from the existing fal pricing
 * snapshot in `../models` (`MODELS[...].pricePerImageUsd`) so the fal adapter's
 * prices stay in sync with the SDK's fal registry rather than drifting to a
 * second hand-maintained copy. The `??` fallbacks are the registry values at
 * time of writing, used only if a registry entry loses its optional price.
 *   - `fal-ai/flux-pro/v1.1-ultra`: $0.06 (`MODELS.flux`).
 *   - `fal-ai/gpt-image-1.5`: $0.133 (`MODELS.gpt`; fal adds overhead vs $0.042
 *     for OpenAI-direct gpt-image — see the design doc §10).
 */
const FAL_IMAGE_PRICE_USD: Readonly<Record<string, number>> = {
  [FAL_FLUX_MODEL]: MODELS.flux?.pricePerImageUsd ?? 0.06,
  [FAL_GPT_IMAGE_MODEL]: MODELS.gpt?.pricePerImageUsd ?? 0.133,
};

/**
 * Build a fal `ImageModel`. Prefers the passed `apiKey`, else the `FAL_KEY` env
 * var. Throws `MotifError` when neither is present (callers translate this into
 * a `Result.err`).
 */
export function resolveModel(modelId: string, apiKey?: string): ImageModel {
  const key = apiKey ?? process.env[FAL_API_KEY_ENV];
  if (key === undefined || key === "") {
    throw new MotifError(
      `fal image generation requires an API key (config.fal.apiKey or ${FAL_API_KEY_ENV})`,
      0
    );
  }
  return createFal({ apiKey: key }).image(modelId);
}

/** The fal provider adapter registered in the provider registry. */
export const falAdapter: ImageProviderAdapter = {
  id: "fal",
  tierModels: FAL_TIER_MODELS,
  apiKeyEnv: FAL_API_KEY_ENV,
  resolveModel,
  priceUsdByModel: FAL_IMAGE_PRICE_USD,
};
