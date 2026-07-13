/**
 * OpenAI (gpt-image) provider adapter.
 *
 * Builds a Vercel AI SDK `ImageModel` from `@ai-sdk/openai`. Building a model
 * performs no network I/O — the request only happens when `generateImage`
 * invokes `model.doGenerate`.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { ImageModel } from "ai";

import { MotifError } from "../server";
import type { ImageProviderAdapter } from "./provider";
import type { ImageTier } from "./types";

/**
 * OpenAI's image API currently exposes a single gpt-image model, so every tier
 * maps to `gpt-image-1`. Tiers will later differ by `quality`
 * (low/medium/high/auto) passed via `providerOptions.openai` (Phase 1c); until
 * then the tier only selects this one model.
 */
const OPENAI_MODEL = "gpt-image-1";

/** Tier → OpenAI image model id (all tiers → the single gpt-image model). */
export const OPENAI_TIER_MODELS: Readonly<Record<ImageTier, string>> = {
  fast: OPENAI_MODEL,
  balanced: OPENAI_MODEL,
  quality: OPENAI_MODEL,
  hero: OPENAI_MODEL,
};

/** Env var read for the OpenAI API key when `apiKey` is not supplied in config. */
export const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

/**
 * Static OpenAI-direct USD/image, keyed by model id.
 *
 * `gpt-image-1` ≈ $0.042/image at medium quality, 1024×1024. OpenAI bills image
 * output by tokens, so the real figure varies with quality (low/medium/high)
 * and size — this is a documented approximation for the common case.
 * Source: https://platform.openai.com/docs/pricing (image generation)
 * Sanity anchor: the Phase 0 benchmark measured gpt-image direct at $0.042
 * (vs $0.133 via fal — see docs/design/provider-agnostic-image-layer.md §10).
 */
const OPENAI_IMAGE_PRICE_USD: Readonly<Record<string, number>> = {
  "gpt-image-1": 0.042,
};

/**
 * Build an OpenAI `ImageModel`. Prefers the passed `apiKey`, else the
 * `OPENAI_API_KEY` env var. Throws `MotifError` when neither is present
 * (callers translate this into a `Result.err`).
 */
export function resolveModel(modelId: string, apiKey?: string): ImageModel {
  const key = apiKey ?? process.env[OPENAI_API_KEY_ENV];
  if (key === undefined || key === "") {
    throw new MotifError(
      `OpenAI image generation requires an API key (config.openai.apiKey or ${OPENAI_API_KEY_ENV})`,
      0
    );
  }
  return createOpenAI({ apiKey: key }).image(modelId);
}

/** The OpenAI provider adapter registered in the provider registry. */
export const openaiAdapter: ImageProviderAdapter = {
  id: "openai",
  tierModels: OPENAI_TIER_MODELS,
  apiKeyEnv: OPENAI_API_KEY_ENV,
  resolveModel,
  priceUsdByModel: OPENAI_IMAGE_PRICE_USD,
};
