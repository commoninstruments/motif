import type { CreativeDirection } from "./creative";

/** ─── Model Types ─────────────────────────────────────────────── */

export type AspectRatio =
  | "auto"
  | "8:1"
  | "4:1"
  | "21:9"
  | "16:9"
  | "3:2"
  | "4:3"
  | "5:4"
  | "1:1"
  | "4:5"
  | "3:4"
  | "2:3"
  | "9:16"
  | "1:4"
  | "1:8";

export type Resolution = "0.5K" | "1K" | "2K" | "4K";

export type ModelType = "generation" | "utility" | "video";
export type ImageOutputFormat = "jpeg" | "png" | "webp";
export type BackgroundMode = "auto" | "transparent" | "opaque";
export type ImageQuality = "auto" | "low" | "medium" | "high";
export type ThinkingLevel = "minimal" | "high";
export type GptImageSize = "auto" | "1024x1024" | "1536x1024" | "1024x1536";
export type FalImageSizePreset =
  | "auto"
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";
export interface CustomImageSize {
  height: number;
  width: number;
}
export type ImageSize = GptImageSize | FalImageSizePreset | CustomImageSize;

/** How the model accepts image dimensions */
export type SizeMode = "aspect_ratio" | "image_size_enum" | "gpt_size" | "none";

export type QualityTier = "good" | "better" | "best" | "frontier";
export type SpeedTier = "fast" | "balanced" | "slow" | "very_slow" | "unknown";
export type PriceTier =
  | "budget"
  | "standard"
  | "premium"
  | "ultra"
  | "variable";

export interface FalPricing {
  checkedAt: string;
  currency: "USD";
  endpointId: string;
  estimatedCostPerImageUsd?: number;
  source: "fal-pricing-api";
  unit: string;
  unitPrice: number;
}

export interface LeaderboardMetric {
  elo: number;
  pricePer1k?: number | null;
  rank: number;
  winRate?: number;
}

export interface ModelBenchmark {
  artificialAnalysis?: {
    editing?: LeaderboardMetric;
    sourceUrls: string[];
    snapshotDate: string;
    textToImage?: LeaderboardMetric;
  };
  speed?: {
    medianSeconds?: number;
    p95Seconds?: number;
    source: "artificial-analysis-models";
  };
  tiers?: {
    price: PriceTier;
    quality: QualityTier;
    speed: SpeedTier;
  };
  useCase?: string;
}

export interface ModelConfig {
  benchmark?: ModelBenchmark;
  editEndpoint?: string;
  editImagesField?: "image_urls" | "image_url";
  endpoint: string;
  falPricing?: FalPricing;
  maxReferenceImages?: number;
  name: string;
  pricing: string;
  pricePerImageUsd?: number;
  /** How this model accepts dimensions (default: "aspect_ratio") */
  sizeMode?: SizeMode;
  supportsAspect: boolean;
  supportsBackground?: boolean;
  supportsEdit: boolean;
  supportsEnhancePrompt?: boolean;
  supportsExpandPrompt?: boolean;
  supportsGuidanceScale?: boolean;
  supportsGoogleSearch?: boolean;
  supportsImagePromptStrength?: boolean;
  supportsInferenceSteps?: boolean;
  supportsLimitGenerations?: boolean;
  supportsMaskImage?: boolean;
  supportsNegativePrompt?: boolean;
  supportsNumImages: boolean;
  supportsOutputFormat?: boolean;
  supportedOutputFormats?: readonly ImageOutputFormat[];
  supportsQuality?: boolean;
  supportsRaw?: boolean;
  supportsRenderingSpeed?: boolean;
  supportsResolution: boolean;
  supportsSafetyTolerance?: boolean;
  supportsSafetyChecker?: boolean;
  supportsSeed?: boolean;
  supportsStyle?: boolean;
  supportsSyncMode?: boolean;
  supportsThinkingLevel?: boolean;
  supportsWebSearch?: boolean;
  type: ModelType;
  /** Use fal queue submit/status/result even for generate() calls. */
  useQueue?: boolean;
}

/** ─── Generation Types ───────────────────────────────────────── */

export interface GenerateOptions {
  aspect?: AspectRatio;
  /** GPT background mode where supported */
  background?: BackgroundMode;
  /**
   * Motif prompt enrichment choices applied before fal request construction.
   *
   * These options are not sent to fal directly; they append validated creative
   * clauses to `prompt` and are omitted from the final request body.
   */
  creative?: CreativeDirection;
  editImageUrls?: string[];
  /** Ask fal not to store IO payloads, and expose request ids for deletion. */
  ephemeral?: boolean;
  /** Google-search alias for fal models that expose enable_google_search */
  enableGoogleSearch?: boolean;
  /** fal safety checker toggle where supported */
  enableSafetyChecker?: boolean;
  /** Enable web search for generative context where supported */
  enableWebSearch?: boolean;
  /** Auto-enhance the prompt before generation (flux only) */
  enhancePrompt?: boolean;
  /** Enable MagicPrompt expansion (ideogram only) */
  expandPrompt?: boolean;
  /** CFG guidance scale — flux-fast: 1–20 */
  guidanceScale?: number;
  /** Direct fal image_size override, including custom {width,height} where supported */
  imageSize?: ImageSize;
  /** FLUX image prompt/reference strength where supported */
  imagePromptStrength?: number;
  inputFidelity?: "low" | "high";
  /** Nano Banana 2 generation limiting toggle */
  limitGenerations?: boolean;
  /** Mask image URL for inpainting/editing where supported */
  maskImageUrl?: string;
  model: string;
  /** What NOT to include in the image (ideogram only) */
  negativePrompt?: string;
  numImages?: number;
  /** Number of diffusion inference steps — flux-fast: 1–12 */
  numInferenceSteps?: number;
  /** Output image format (default: model-dependent) */
  outputFormat?: ImageOutputFormat;
  prompt: string;
  /** GPT/OpenAI quality where supported */
  quality?: ImageQuality;
  /** Generate less processed, more natural images (flux only) */
  raw?: boolean;
  /** Speed vs. quality trade-off (ideogram only) */
  renderingSpeed?: "TURBO" | "BALANCED" | "QUALITY";
  resolution?: Resolution;
  /** Safety tolerance level "1"–"6", where "1" is strictest */
  safetyTolerance?: string;
  /** Reproducible generation seed */
  seed?: number;
  /** Style preset — recraft: 70+ hierarchical styles; ideogram: "AUTO"|"GENERAL"|"REALISTIC"|"DESIGN" */
  style?: string;
  /** Return media as data URI where supported */
  syncMode?: boolean;
  /** Nano Banana 2 thinking mode */
  thinkingLevel?: ThinkingLevel;
  transparent?: boolean;
}

export interface UpscaleOptions {
  creativity?: number;
  /** CFG guidance scale for upscaling (clarity only, 0–20, default 4) */
  guidanceScale?: number;
  imageUrl: string;
  model?: "clarity" | "crystal";
  /** What NOT to include in the upscaled result (clarity only) */
  negativePrompt?: string;
  /** Number of diffusion steps (clarity only, 4–50, default 18) */
  numInferenceSteps?: number;
  /** Prompt to guide the upscaling process (clarity only) */
  prompt?: string;
  /** How closely to preserve the original image (clarity only, 0–1, default 0.6) */
  resemblance?: number;
  scaleFactor?: number;
}

export interface RemoveBackgroundOptions {
  imageUrl: string;
  model?: "rmbg" | "bria";
  /** BiRefNet operating resolution (rmbg model only, default "1024x1024") */
  operatingResolution?: "1024x1024" | "2048x2048";
  /** Output image format (rmbg model only) */
  outputFormat?: "png" | "webp" | "gif";
  /** Return the alpha mask alongside the result (rmbg model only) */
  outputMask?: boolean;
  /** Apply foreground edge refinement (rmbg model only, default true) */
  refineForeground?: boolean;
  /** BiRefNet model variant (rmbg model only) */
  variant?: "General Use (Light)" | "General Use (Heavy)" | "Portrait";
}

export interface VideoOptions {
  /** CFG guidance scale for video generation (0–1, default 0.5) */
  cfgScale?: number;
  /** Duration in seconds (3-15) */
  duration?: number;
  /** Optional end frame image URL */
  endImageUrl?: string;
  /** Generate audio track (default true, costs more) */
  generateAudio?: boolean;
  /** Source image URL */
  imageUrl: string;
  /** What NOT to include in the video */
  negativePrompt?: string;
  /** Text description of the motion/scene */
  prompt: string;
}

export interface VideoResponse {
  contentType: string;
  fileName: string;
  fileSize: number;
  url: string;
}

export interface ToolRunOptions {
  input?: string;
  inputs?: string[];
  options?: Record<string, unknown>;
  tool: string;
}

export type ToolResponse = Record<string, unknown>;

/** ─── Response Types ─────────────────────────────────────────── */

export interface MotifImage {
  content_type?: string;
  height?: number;
  url: string;
  width?: number;
}

export interface MotifResponse {
  images: MotifImage[];
  prompt?: string;
  requestId?: string;
  seed?: number;
}

/** ─── Queue Types ────────────────────────────────────────────── */

export interface QueuedJob {
  endpoint: string;
  estimatedCost: number;
  requestId: string;
}

export interface JobStatus {
  error?: string;
  logs?: { message: string; timestamp: string }[];
  queuePosition?: number;
  status: "queued" | "processing" | "completed" | "failed";
}

/** ─── Configuration ──────────────────────────────────────────── */

export interface FalClientConfig {
  apiKey: string;
  /** Max retry attempts for 429/5xx errors (default 3, set 0 to disable) */
  retries?: number;
  /** Request timeout in ms (default 120_000) */
  timeout?: number;
}

/** @deprecated Renamed to {@link FalClientConfig}. */
export type MotifServerConfig = FalClientConfig;
