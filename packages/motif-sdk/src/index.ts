/**
 * Local fal.ai client used by the Motif CLI.
 *
 * SDK-style wrapper for AI image generation via fal.ai.
 *
 * @example
 * ```typescript
 * import { FalClient } from "./fal";
 *
 * const motif = new FalClient(process.env.FAL_KEY!);
 *
 * // Synchronous generation (CLI use case)
 * const result = await motif.generate({ prompt: "a red balloon", model: "banana" });
 * if (result.isOk()) console.log(result.value.images[0].url);
 *
 * // Queue-based generation
 * const job = await motif.submitGeneration({ prompt: "sunset", model: "gpt" });
 * if (job.isErr()) throw job.error;
 * const status = await motif.getJobStatus(job.value.endpoint, job.value.requestId);
 * ```
 */

export type { Result, ResultAsync } from "neverthrow";

// ─── Result Types (re-exported from neverthrow) ─────────────────
export { err, ok } from "neverthrow";
// ─── Model Data ──────────────────────────────────────────────────
export {
  ASPECT_RATIOS,
  aspectToFalImageSize,
  aspectToGptSize,
  FORMAT_PRESETS,
  RESOLUTIONS,
} from "./aspects";
export { estimateCost, estimateVideoCost } from "./cost";
export {
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  type CreativeDirection,
  type CreativeField,
  type CreativeOption,
  CreativeOptionError,
  type CreativeOptionErrorDetails,
  type CreativePromptResult,
  type EnrichPromptOptions,
  enrichPrompt,
  sanitizePrompt,
} from "./creative";
export {
  getFalKeyFromEnv,
  type MotifEnv,
  motifEnvSchema,
  parseMotifEnv,
} from "./env";
export { buildGenerateBody } from "./generate";
export {
  IMAGE_EDITING_TOP_20,
  IMAGE_TEXT_TO_IMAGE_TOP_20,
  type LeaderboardEntry,
  type LeaderboardSnapshot,
  VIDEO_IMAGE_TO_VIDEO_TOP_15,
  VIDEO_TEXT_TO_VIDEO_TOP_15,
} from "./leaderboards";
export {
  EDIT_CAPABLE_MODELS,
  GENERATION_MODELS,
  type GenerationModelName,
  IDEOGRAM_STYLES,
  MODELS,
  RECRAFT_STYLES,
  UTILITY_MODELS,
  VIDEO_MODELS,
} from "./models";
export { FalClient, MotifError } from "./server";
export {
  buildFalToolRequest,
  FAL_TOOL_IDS,
  FAL_TOOLS,
  FAL_TOOLS_CHECKED_AT,
  type FalToolConfig,
  type FalToolId,
  type FalToolInputKind,
  type FalToolRequest,
  type FalToolRunOptions,
  isFalToolId,
} from "./tools";

// ─── Types ───────────────────────────────────────────────────────
export type {
  AspectRatio,
  BackgroundMode,
  CustomImageSize,
  FalClientConfig,
  FalImageSizePreset,
  GenerateOptions,
  GptImageSize,
  ImageOutputFormat,
  ImageQuality,
  ImageSize,
  JobStatus,
  ModelConfig,
  ModelType,
  MotifImage,
  MotifResponse,
  QueuedJob,
  RemoveBackgroundOptions,
  Resolution,
  SizeMode,
  ThinkingLevel,
  ToolResponse,
  ToolRunOptions,
  UpscaleOptions,
  VideoOptions,
  VideoResponse,
} from "./types";
