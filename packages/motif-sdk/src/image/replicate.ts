/**
 * Replicate provider adapter.
 *
 * Builds a Vercel AI SDK `ImageModel` from `@ai-sdk/replicate`. Building a model
 * performs no network I/O — the request only happens when `generateImage`
 * invokes `model.doGenerate`.
 *
 * NOTE: Replicate's SDK names the credential option `apiToken` (not `apiKey`),
 * and reads `REPLICATE_API_TOKEN` from the environment.
 */

import { createReplicate } from "@ai-sdk/replicate";
import type { ImageModel } from "ai";

import { MotifError } from "../server";
import type { ImageProviderAdapter } from "./provider";
import type { ImageTier } from "./types";

/**
 * Replicate is wired to a single high-quality model for now, so every tier maps
 * to FLUX 1.1 Pro Ultra. (The benchmark found Replicate ~1.45× faster than fal
 * for this model at the same price — see the design doc §10.)
 */
const REPLICATE_MODEL = "black-forest-labs/flux-1.1-pro-ultra";

/** Tier → Replicate model id (all tiers → FLUX 1.1 Pro Ultra for now). */
export const REPLICATE_TIER_MODELS: Readonly<Record<ImageTier, string>> = {
  fast: REPLICATE_MODEL,
  balanced: REPLICATE_MODEL,
  quality: REPLICATE_MODEL,
  hero: REPLICATE_MODEL,
};

/** Env var read for the Replicate API token when `apiToken` is not in config. */
export const REPLICATE_API_KEY_ENV = "REPLICATE_API_TOKEN";

/**
 * Static Replicate USD/image, keyed by model id.
 *
 * `black-forest-labs/flux-1.1-pro-ultra` = $0.06/image (Replicate list price).
 * Source: https://replicate.com/black-forest-labs/flux-1.1-pro-ultra
 * Sanity anchor: fal's `fal-ai/flux-pro/v1.1-ultra` is also $0.06
 * (`MODELS.flux.pricePerImageUsd` in ../models) — same price, both routes.
 */
const REPLICATE_IMAGE_PRICE_USD: Readonly<Record<string, number>> = {
  "black-forest-labs/flux-1.1-pro-ultra": 0.06,
};

/**
 * Build a Replicate `ImageModel`. Prefers the passed `apiKey` (the normalized
 * token), else the `REPLICATE_API_TOKEN` env var. Throws `MotifError` when
 * neither is present (callers translate this into a `Result.err`).
 */
export function resolveModel(modelId: string, apiKey?: string): ImageModel {
  const token = apiKey ?? process.env[REPLICATE_API_KEY_ENV];
  if (token === undefined || token === "") {
    throw new MotifError(
      `Replicate image generation requires an API token (config.replicate.apiToken or ${REPLICATE_API_KEY_ENV})`,
      0
    );
  }
  // Replicate's SDK option is `apiToken`, not `apiKey`.
  return createReplicate({ apiToken: token }).image(modelId);
}

/** The Replicate provider adapter registered in the provider registry. */
export const replicateAdapter: ImageProviderAdapter = {
  id: "replicate",
  tierModels: REPLICATE_TIER_MODELS,
  apiKeyEnv: REPLICATE_API_KEY_ENV,
  resolveModel,
  priceUsdByModel: REPLICATE_IMAGE_PRICE_USD,
};
