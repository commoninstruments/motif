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
