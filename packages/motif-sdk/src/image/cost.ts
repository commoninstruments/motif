/**
 * Per-call cost tracking for the image layer.
 *
 * Preference order:
 *   1. A cost surfaced by the provider on `result.providerMetadata` (most image
 *      providers do NOT surface one today, so this is usually absent).
 *   2. A static per-model table seeded from Google's published Gemini image
 *      pricing (see sources below).
 *   3. Unknown → `{ usd: 0, source: "unknown" }`.
 */

import type { ImageCost, ImageProviderId } from "./types";

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
const GOOGLE_IMAGE_PRICE_USD: Readonly<Record<string, number>> = {
  "gemini-2.5-flash-image": 0.039,
  "gemini-3.1-flash-image-preview": 0.039,
  "gemini-3-pro-image-preview": 0.134,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extract a provider-reported total cost from a `generateImage` result's
 * `providerMetadata`, if the provider surfaces a numeric `cost`. The shape is
 * `{ [provider]: { ...; cost?: number } }`. Returns undefined otherwise.
 */
export function costFromProviderMetadata(
  providerMetadata: unknown
): number | undefined {
  if (!isRecord(providerMetadata)) {
    return undefined;
  }
  for (const value of Object.values(providerMetadata)) {
    if (isRecord(value)) {
      const cost = value.cost;
      if (typeof cost === "number" && Number.isFinite(cost)) {
        return cost;
      }
    }
  }
  return undefined;
}

/** Static per-image USD for a (provider, model), or undefined if unknown. */
function tablePricePerImage(
  provider: ImageProviderId,
  modelId: string
): number | undefined {
  if (provider === "google") {
    return GOOGLE_IMAGE_PRICE_USD[modelId];
  }
  return undefined;
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Normalized per-call cost for a generation. Prefers a provider-metadata cost,
 * then the static table (× image count), then unknown.
 */
export function costForImages(
  provider: ImageProviderId,
  modelId: string,
  providerMetadata: unknown,
  imageCount: number
): ImageCost {
  const metaCost = costFromProviderMetadata(providerMetadata);
  if (metaCost !== undefined) {
    return { usd: roundUsd(metaCost), source: "provider-metadata" };
  }

  const perImage = tablePricePerImage(provider, modelId);
  if (perImage !== undefined) {
    return {
      usd: roundUsd(perImage * Math.max(imageCount, 1)),
      source: "table",
    };
  }

  return { usd: 0, source: "unknown" };
}
