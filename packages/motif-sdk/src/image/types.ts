/**
 * Public types for the provider-agnostic image generation + editing layer
 * (`@howells/motif-sdk/image`).
 *
 * This layer is additive: it sits alongside the fal-specific `FalClient`
 * surface and reuses the SDK's Result convention (`Result<T, MotifError>` — no
 * thrown exceptions). See docs/design/provider-agnostic-image-layer.md.
 */

import type { Result } from "neverthrow";

import type { MotifError } from "../server";

/**
 * Quality/latency tier. Resolves through a provider-aware tier→model map when no
 * explicit `model` id is given. `balanced` is the default when a tier is omitted.
 */
export type ImageTier = "fast" | "balanced" | "quality" | "hero";

/**
 * Image provider id. All four Phase 1b adapters are implemented
 * (`google`, `openai`, `replicate`, `fal`); the type keeps an open union tail so
 * further adapters can slot in without a breaking type change.
 */
export type ImageProviderId =
  | "google"
  | "openai"
  | "replicate"
  | "fal"
  | (string & Record<never, never>);

/** Source that produced a normalized per-call cost. */
export type ImageCostSource = "provider-metadata" | "table" | "unknown";

/** Normalized per-call spend attached to every result. */
export interface ImageCost {
  /** Total USD for the call (all images), best-effort. */
  usd: number;
  /** Where the figure came from: the provider's metadata, the static table, or unknown. */
  source: ImageCostSource;
}

/**
 * Client configuration. Every provider key is optional and falls back to that
 * provider's environment variable (see each adapter's `apiKeyEnv`). The config
 * field name mirrors each SDK's own option name — notably Replicate calls its
 * credential `apiToken`, not `apiKey`.
 */
export interface MotifImageConfig {
  /** Provider used when a call does not specify one. Defaults to `google`. */
  defaultProvider?: ImageProviderId;
  /** Google provider overrides. `apiKey` falls back to `GOOGLE_GENERATIVE_AI_API_KEY`. */
  google?: {
    apiKey?: string;
  };
  /** OpenAI provider overrides. `apiKey` falls back to `OPENAI_API_KEY`. */
  openai?: {
    apiKey?: string;
  };
  /**
   * Replicate provider overrides. Replicate's SDK names the credential
   * `apiToken` (not `apiKey`); it falls back to `REPLICATE_API_TOKEN`.
   */
  replicate?: {
    apiToken?: string;
  };
  /** fal provider overrides. `apiKey` falls back to `FAL_KEY`. */
  fal?: {
    apiKey?: string;
  };
}

/** Options for a text→image generation. */
export interface GenerateImageOptions {
  /** The text prompt. */
  prompt: string;
  /** Quality/latency tier. Ignored when `model` is set. */
  tier?: ImageTier;
  /** Explicit provider model id. Overrides `tier`. */
  model?: string;
  /** Provider override for this call. */
  provider?: ImageProviderId;
  /**
   * Aspect ratio, e.g. `"1:1"`. An alternative to {@link size}; pass one or the
   * other. If both are passed the provider decides which to honor and typically
   * surfaces a warning (see {@link MotifImageResult.warnings}).
   */
  aspectRatio?: `${number}:${number}`;
  /**
   * Explicit pixel size, e.g. `"1024x1024"`. An alternative to
   * {@link aspectRatio}; pass one or the other. If both are passed the provider
   * decides which to honor and typically surfaces a warning (see
   * {@link MotifImageResult.warnings}).
   */
  size?: `${number}x${number}`;
  /** Number of images to generate. */
  n?: number;
  /** Seed for reproducible generation, where the provider supports it. */
  seed?: number;
  /** Abort signal to cancel the in-flight request. */
  signal?: AbortSignal;
  /**
   * Extra HTTP headers forwarded to the provider request. Fal's non-retained IO
   * (paired with FalClient.deletePayloads) is
   * `headers: { "X-Fal-Store-IO": "0" }`.
   */
  headers?: Record<string, string>;
  /**
   * Provider-specific options, passed straight through to the underlying model
   * as body parameters. Outer key = provider name, inner key = option name.
   * Values must be JSON-representable; a non-JSON value (undefined, function,
   * bigint, symbol) makes the call fail with a `MotifError`.
   */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/** Options for a multi-image edit (images in → image out), with an optional mask. */
export interface EditImageOptions {
  /**
   * Input images. Each entry is raw bytes (`Uint8Array`) or a string. A string
   * may be base64, a `data:` URL, OR a remote `http(s)://` URL. Remote URLs are
   * FETCHED by the provider — and on some providers (e.g. OpenAI) that fetch
   * happens from the local process running this SDK. Callers that accept
   * untrusted URLs should fetch and validate the bytes themselves before
   * passing them here (SSRF / local-network exposure otherwise).
   */
  images: (Uint8Array | string)[];
  /** Natural-language edit instruction. */
  instruction: string;
  /**
   * Optional mask constraining the edited region. Same accepted forms as
   * {@link EditImageOptions.images} (bytes, base64, `data:` URL, or a remote
   * `http(s)://` URL that the provider fetches — see the images note on
   * untrusted URLs). When multiple images are passed, the mask applies to
   * `images[0]`.
   */
  mask?: Uint8Array | string;
  /** Quality/latency tier. Ignored when `model` is set. */
  tier?: ImageTier;
  /** Explicit provider model id. Overrides `tier`. */
  model?: string;
  /** Provider override for this call. */
  provider?: ImageProviderId;
  /** Number of images to generate. */
  n?: number;
  /** Seed for reproducible generation, where the provider supports it. */
  seed?: number;
  /** Abort signal to cancel the in-flight request. */
  signal?: AbortSignal;
  /**
   * Extra HTTP headers forwarded to the provider request. Fal's non-retained IO
   * (paired with FalClient.deletePayloads) is
   * `headers: { "X-Fal-Store-IO": "0" }`.
   */
  headers?: Record<string, string>;
  /** Provider-specific options (see {@link GenerateImageOptions.providerOptions}). */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/** A single generated image, mirroring the AI SDK's `GeneratedFile`. */
export interface MotifImageFile {
  uint8Array: Uint8Array;
  base64: string;
  mediaType: string;
}

/** Normalized result of a generate/edit call. */
export interface MotifImageResult {
  /** Generated images. */
  images: MotifImageFile[];
  /** Normalized per-call cost + provenance. */
  cost: ImageCost;
  /** Resolved provider. */
  provider: ImageProviderId;
  /** Resolved model id. */
  model: string;
  /** Provider correlation id, where the provider surfaces one. */
  requestId?: string;
  /**
   * Degraded-success warnings from the provider (a requested setting was
   * ignored or adjusted — e.g. passing both `size` and `aspectRatio`). Each is a
   * readable string. Omitted entirely when the provider returned none.
   */
  warnings?: readonly string[];
}

/**
 * Picks the winning candidate for a {@link MotifImageClient.bestOfN} call.
 *
 * Receives the successful candidates (index-aligned to
 * {@link BestOfNResult.candidates}) and the request context, and returns the
 * chosen index (plus an optional human-readable reason). May be sync or async.
 * The judge is caller-provided so the image layer stays decoupled from any text
 * client — it pairs well with `@howells/ai`'s vision client, but that dependency
 * is not required.
 */
export type ImageJudge = (
  candidates: readonly MotifImageResult[],
  context: { readonly prompt?: string; readonly instruction?: string }
) =>
  | Promise<{ index: number; reason?: string }>
  | { index: number; reason?: string };

/**
 * Options for a best-of-N generation. Extends either {@link GenerateImageOptions}
 * (text→image) or {@link EditImageOptions} (multi-image edit) — the presence of
 * `images` selects the edit path — with the candidate count and an optional judge.
 */
export type BestOfNOptions = (GenerateImageOptions | EditImageOptions) & {
  /** How many candidates to generate (>= 1). */
  n: number;
  /** Chooses the winner. Omit → candidate 0 wins. */
  judge?: ImageJudge;
};

/** Result of a {@link MotifImageClient.bestOfN} call. */
export interface BestOfNResult {
  /** The winning candidate (its single-image {@link MotifImageResult}). */
  best: MotifImageResult;
  /** The index of `best` within `candidates`. */
  chosenIndex: number;
  /** Judge's rationale, if it returned one. */
  reason?: string;
  /** All successful candidates, in generation order. */
  candidates: readonly MotifImageResult[];
  /** Total USD across all candidates that were generated (successes only). */
  totalCostUsd: number;
}

/** The provider-agnostic image client. Every method returns a Result — no throws. */
export interface MotifImageClient {
  /** Text→image generation. */
  generate: (
    opts: GenerateImageOptions
  ) => Promise<Result<MotifImageResult, MotifError>>;
  /** Multi-image edit (with optional mask). */
  edit: (
    opts: EditImageOptions
  ) => Promise<Result<MotifImageResult, MotifError>>;
  /**
   * Generate N candidates (in parallel) and pick the best via an optional
   * injectable judge. Discriminates generate vs edit by the presence of
   * `images`. Returns the winner plus all successful candidates and total spend.
   */
  bestOfN: (opts: BestOfNOptions) => Promise<Result<BestOfNResult, MotifError>>;
}
