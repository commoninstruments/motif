/**
 * Google (Gemini) provider adapter.
 *
 * Builds a Vercel AI SDK `ImageModel` from `@ai-sdk/google`. Building a model
 * performs no network I/O — the request only happens when `generateImage`
 * invokes `model.doGenerate`. Gemini supports both text→image generation and
 * multi-image-in → image-out editing (with an optional mask), which is the core
 * operation this layer normalizes.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ImageModel } from "ai";

import { MotifError } from "../server";
import type { ImageProviderAdapter } from "./provider";
import type { ImageTier } from "./types";

/**
 * Tier → Gemini image model id.
 *
 * Seeded from Material Desk's `RENDER_IMAGE_MODEL_BY_QUALITY` (the driving
 * consumer, see the design doc). `gemini-2.5-flash-image` is the proven-reachable
 * floor; the preview ids may require allowlist/tier access.
 */
export const GOOGLE_TIER_MODELS: Readonly<Record<ImageTier, string>> = {
  fast: "gemini-2.5-flash-image",
  balanced: "gemini-3.1-flash-image-preview",
  quality: "gemini-3-pro-image-preview",
  hero: "gemini-3-pro-image-preview",
};

/** Env var read for the Google API key when `apiKey` is not supplied in config. */
export const GOOGLE_API_KEY_ENV = "GOOGLE_GENERATIVE_AI_API_KEY";

/** Resolve the Gemini image model id for a tier. */
export function googleModelForTier(tier: ImageTier): string {
  return GOOGLE_TIER_MODELS[tier];
}

/**
 * Static Google-direct USD/image, keyed by model id.
 *
 * Sources (Google direct, not fal-hosted):
 *   - `gemini-2.5-flash-image` ("nano banana"): image output billed at 1290
 *     output tokens/image at $30 / 1M output tokens ≈ $0.039/image.
 *     Source: https://ai.google.dev/gemini-api/docs/pricing
 *     Sanity anchor: fal-hosted `fal-ai/gemini-25-flash-image` is $0.0398
 *     (`MODELS.gemini.pricePerImageUsd` in ../models) — same ballpark.
 *   - `gemini-3-pro-image-preview` ("nano banana pro"): standard 1K/2K image
 *     output ≈ $0.134/image (higher tiers/4K cost more).
 *     Source: https://ai.google.dev/gemini-api/docs/pricing
 *     Sanity anchor: fal-hosted `fal-ai/gemini-3-pro-image-preview` is $0.15
 *     (`MODELS.gemini3`/`MODELS.banana` in ../models) — fal adds overhead.
 *   - `gemini-3.1-flash-image-preview`: flash-tier image output; priced with the
 *     2.5 flash-image line (≈ $0.039/image) pending a distinct published rate.
 */
export const GOOGLE_IMAGE_PRICE_USD: Readonly<Record<string, number>> = {
  "gemini-2.5-flash-image": 0.039,
  "gemini-3.1-flash-image-preview": 0.039,
  "gemini-3-pro-image-preview": 0.134,
};

/**
 * Build a Google Gemini `ImageModel`. Prefers the passed `apiKey`, else the
 * `GOOGLE_GENERATIVE_AI_API_KEY` env var. Throws `MotifError` when neither is
 * present (callers translate this into a `Result.err`).
 */
export function resolveModel(modelId: string, apiKey?: string): ImageModel {
  const key = apiKey ?? process.env[GOOGLE_API_KEY_ENV];
  if (key === undefined || key === "") {
    throw new MotifError(
      `Google image generation requires an API key (config.google.apiKey or ${GOOGLE_API_KEY_ENV})`,
      0
    );
  }
  return createGoogleGenerativeAI({ apiKey: key }).image(modelId);
}

/** The Google (Gemini) provider adapter registered in the provider registry. */
export const googleAdapter: ImageProviderAdapter = {
  id: "google",
  tierModels: GOOGLE_TIER_MODELS,
  apiKeyEnv: GOOGLE_API_KEY_ENV,
  resolveModel,
  priceUsdByModel: GOOGLE_IMAGE_PRICE_USD,
};
