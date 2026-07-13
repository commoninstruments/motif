/**
 * Public types for the provider-agnostic image generation + editing layer
 * (`@howells/motif-sdk/image`).
 *
 * This layer is additive: it sits alongside the fal-specific `MotifServer`
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
  /** Aspect ratio, e.g. `"1:1"`. */
  aspectRatio?: `${number}:${number}`;
  /** Explicit pixel size, e.g. `"1024x1024"`. */
  size?: `${number}x${number}`;
  /** Number of images to generate. */
  n?: number;
  /**
   * Provider-specific options, passed straight through to the underlying model
   * as body parameters. Outer key = provider name, inner key = option name.
   */
  providerOptions?: Record<string, Record<string, unknown>>;
}

/** Options for a multi-image edit (images in → image out), with an optional mask. */
export interface EditImageOptions {
  /** Input images. Each is raw bytes, a base64 string, or a data URL. */
  images: (Uint8Array | string)[];
  /** Natural-language edit instruction. */
  instruction: string;
  /** Optional mask (bytes, base64, or data URL) constraining the edited region. */
  mask?: Uint8Array | string;
  /** Quality/latency tier. Ignored when `model` is set. */
  tier?: ImageTier;
  /** Explicit provider model id. Overrides `tier`. */
  model?: string;
  /** Provider override for this call. */
  provider?: ImageProviderId;
  /** Number of images to generate. */
  n?: number;
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
}
