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

/**
 * Tier → fal model id. For fal, explicit `model:` endpoint ids are the primary
 * path (any fal endpoint resolves via passthrough); this tier map is a
 * convenience covering the two most common (FLUX Pro Ultra + gpt-image).
 */
export const FAL_TIER_MODELS: Readonly<Record<ImageTier, string>> = {
  fast: FAL_FLUX_MODEL,
  balanced: FAL_GPT_IMAGE_MODEL,
  quality: FAL_GPT_IMAGE_MODEL,
  hero: FAL_GPT_IMAGE_MODEL,
};

/** Env var read for the fal key when `apiKey` is not supplied in config. */
export const FAL_API_KEY_ENV = "FAL_KEY";

/**
 * Static fal USD/image, keyed by the fal ENDPOINT id. Explicit `model:` endpoint
 * ids are fal's primary path (the tier map covers only two), so cost tracking
 * must price the endpoints consumers actually pass — kiln uses
 * `fal-ai/flux/schnell`, `fal-ai/flux-2-pro`, `fal-ai/flux-2-max`. Every price is
 * sourced from the fal registry snapshot in `../models`
 * (`MODELS[...].pricePerImageUsd`) so this table stays in sync rather than
 * drifting to a second hand-maintained copy; the `??` fallbacks are the registry
 * values at time of writing, used only if a registry entry loses its optional
 * price. Each key is `MODELS[x].endpoint`; the trailing comment cites the
 * `MODELS` key it comes from. Covers the flux/flux2 family, banana, seedream, and
 * the other priced fal generation endpoints.
 */
const FAL_IMAGE_PRICE_USD: Readonly<Record<string, number>> = {
  // FLUX family.
  [FAL_FLUX_MODEL]: MODELS.flux?.pricePerImageUsd ?? 0.06, // MODELS.flux
  "fal-ai/flux/schnell": MODELS["flux-fast"]?.pricePerImageUsd ?? 0.003, // MODELS["flux-fast"]
  // FLUX.2 family.
  "fal-ai/flux-2-max": MODELS["flux2-max"]?.pricePerImageUsd ?? 0.07, // MODELS["flux2-max"]
  "fal-ai/flux-2-pro": MODELS["flux2-pro"]?.pricePerImageUsd ?? 0.03, // MODELS["flux2-pro"]
  "fal-ai/flux-2-flex": MODELS["flux2-flex"]?.pricePerImageUsd ?? 0.05, // MODELS["flux2-flex"]
  "fal-ai/flux-2": MODELS["flux2-dev"]?.pricePerImageUsd ?? 0.012, // MODELS["flux2-dev"]
  "fal-ai/flux-2/turbo": MODELS["flux2-turbo"]?.pricePerImageUsd ?? 0.008, // MODELS["flux2-turbo"]
  // gpt-image (fal adds overhead vs OpenAI-direct — see design doc §10).
  [FAL_GPT_IMAGE_MODEL]: MODELS.gpt?.pricePerImageUsd ?? 0.133, // MODELS.gpt
  "openai/gpt-image-2": MODELS.gpt2?.pricePerImageUsd ?? 0.211, // MODELS.gpt2
  // Nano Banana (Gemini image) family.
  "fal-ai/nano-banana-2": MODELS.banana2?.pricePerImageUsd ?? 0.08, // MODELS.banana2
  "fal-ai/nano-banana-pro": MODELS.banana?.pricePerImageUsd ?? 0.15, // MODELS.banana
  "fal-ai/gemini-25-flash-image": MODELS.gemini?.pricePerImageUsd ?? 0.0398, // MODELS.gemini
  "fal-ai/gemini-3-pro-image-preview": MODELS.gemini3?.pricePerImageUsd ?? 0.15, // MODELS.gemini3
  // Seedream family.
  "fal-ai/bytedance/seedream/v4/text-to-image":
    MODELS.seedream4?.pricePerImageUsd ?? 0.03, // MODELS.seedream4
  "fal-ai/bytedance/seedream/v4.5/text-to-image":
    MODELS.seedream45?.pricePerImageUsd ?? 0.04, // MODELS.seedream45
  "bytedance/seedream/v5/pro/text-to-image":
    MODELS.seedream5?.pricePerImageUsd ?? 0.0675, // MODELS.seedream5
  "fal-ai/bytedance/seedream/v5/lite/text-to-image":
    MODELS["seedream5-lite"]?.pricePerImageUsd ?? 0.035, // MODELS["seedream5-lite"]
  // Other priced fal generation endpoints.
  "fal-ai/recraft-v3": MODELS.recraft?.pricePerImageUsd ?? 0.04, // MODELS.recraft
  "fal-ai/recraft/v4/text-to-image": MODELS.recraft4?.pricePerImageUsd ?? 0.04, // MODELS.recraft4
  "fal-ai/ideogram/v3": MODELS.ideogram?.pricePerImageUsd ?? 0.03, // MODELS.ideogram
  "ideogram/v4": MODELS.ideogram4?.pricePerImageUsd ?? 0.03, // MODELS.ideogram4
  "xai/grok-imagine-image": MODELS["grok-image"]?.pricePerImageUsd ?? 0.02, // MODELS["grok-image"]
  "fal-ai/qwen-image": MODELS.qwen?.pricePerImageUsd ?? 0.02, // MODELS.qwen
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
