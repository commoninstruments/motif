/**
 * Provider registry for the image layer.
 *
 * Each provider (google, openai, replicate, fal) contributes exactly one
 * {@link ImageProviderAdapter}. The dispatch functions in `index.ts` and the
 * cost lookup in `cost.ts` read the registry by id, so adding a provider is a
 * single registry entry — not new branches spread across generate/edit/cost.
 */

import type { ImageModel } from "ai";

import { MotifError } from "../server";
import { falAdapter } from "./fal";
import { googleAdapter } from "./google";
import { openaiAdapter } from "./openai";
import { replicateAdapter } from "./replicate";
import type { ImageProviderId, ImageTier } from "./types";

/**
 * A single image provider. A thin wrapper over the provider's `@ai-sdk/*` image
 * model, plus the metadata the layer needs to route by tier, resolve keys, and
 * meter spend.
 */
export interface ImageProviderAdapter {
  /** Provider id, matching the key it is registered under in {@link PROVIDERS}. */
  readonly id: ImageProviderId;
  /** Tier → model id map, used when a call does not pass an explicit `model`. */
  readonly tierModels: Readonly<Record<ImageTier, string>>;
  /** Env var read for the API key when no key is supplied in config. */
  readonly apiKeyEnv: string;
  /**
   * Build the AI SDK `ImageModel` for a model id. Prefers the passed `apiKey`,
   * else the adapter's `apiKeyEnv`. Throws `MotifError` when neither is present
   * (callers translate this into a `Result.err`). Building a model performs no
   * network I/O.
   */
  readonly resolveModel: (modelId: string, apiKey?: string) => ImageModel;
  /** Static per-model USD/image table (best-effort; cited per adapter). */
  readonly priceUsdByModel: Readonly<Record<string, number>>;
}

/**
 * The provider registry. Every id in {@link ImageProviderId}'s closed part maps
 * to its adapter; the open union tail means a lookup can still miss, so access
 * goes through {@link getProviderAdapter}.
 */
export const PROVIDERS: Record<ImageProviderId, ImageProviderAdapter> = {
  google: googleAdapter,
  openai: openaiAdapter,
  replicate: replicateAdapter,
  fal: falAdapter,
};

/**
 * Look up an adapter by provider id, throwing a `MotifError` for an unknown
 * provider (callers catch this into a `Result.err`).
 */
export function getProviderAdapter(
  provider: ImageProviderId
): ImageProviderAdapter {
  const adapter = PROVIDERS[provider];
  if (adapter === undefined) {
    throw new MotifError(`Unsupported image provider: ${provider}`, 0);
  }
  return adapter;
}
