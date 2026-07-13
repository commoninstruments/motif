/**
 * Per-call cost tracking for the image layer.
 *
 * Preference order:
 *   1. A cost surfaced by the provider on `result.providerMetadata` (most image
 *      providers do NOT surface one today, so this is usually absent).
 *   2. A static per-model table, owned per-adapter (`priceUsdByModel`) and read
 *      from the provider registry (see sources in each adapter).
 *   3. Unknown → `{ usd: 0, source: "unknown" }`.
 */

import { PROVIDERS } from "./provider";
import type { ImageCost, ImageProviderId } from "./types";

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
  const adapter = PROVIDERS[provider];
  if (adapter === undefined) {
    return undefined;
  }
  return adapter.priceUsdByModel[modelId];
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
  // Cost contract: a provider-metadata cost is returned AS-IS. It MUST be the
  // call total (already across all `n` images), NOT a per-image figure — unlike
  // the static table below, which is per-image and multiplied by the image
  // count. No adapter populates `providerMetadata.cost` today; any adapter that
  // starts doing so must honor this "call total, already ×n" contract.
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
