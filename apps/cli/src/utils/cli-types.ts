/**
 * Shared CLI option and stdin payload types.
 *
 * These describe the parsed Commander options (`CliOptions`) and the JSON
 * payload accepted via stdin (`StdinPayload`). They are shared by the CLI
 * router and the generate/postprocess/video command modules.
 */

import type { CreativeDirection } from "@howells/motif-sdk";

export interface CliOptions {
  aspect?: string;
  background?: string;
  camera?: string;
  cfgScale?: string;
  color?: string;
  cover?: boolean;
  describe?: string | boolean;
  disableLimitGenerations?: boolean;
  disableSafetyChecker?: boolean;
  dryRun?: boolean;
  edit?: string[];
  enableWebSearch?: boolean;
  enhancePrompt?: boolean;
  ephemeral?: boolean;
  expandPrompt?: boolean;
  feed?: boolean;
  fields?: string;
  format?: string;
  googleSearch?: boolean;
  guidanceScale?: string;
  history?: boolean;
  imagePromptStrength?: string;
  imageSize?: string;
  landscape?: boolean;
  last?: boolean;
  lighting?: string;
  limit?: string;
  limitGenerations?: boolean;
  loose?: boolean;
  mask?: string;
  material?: string;
  model?: string;
  motion?: string;
  negative?: string;
  negativePrompt?: string;
  noOpen?: boolean;
  num?: string;
  numInferenceSteps?: string;
  offset?: string;
  og?: boolean;
  output?: string;
  outputFormat?: string;
  portrait?: boolean;
  quality?: string;
  recipe?: string;
  raw?: boolean;
  reel?: boolean;
  renderingSpeed?: string;
  resolution?: string;
  rmbg?: boolean;
  safety?: string;
  safetyChecker?: boolean;
  scale?: string;
  seed?: string;
  genre?: string;
  shot?: string;
  square?: boolean;
  steps?: string;
  story?: boolean;
  style?: string;
  syncMode?: boolean;
  transparent?: boolean;
  thinking?: string;
  ultra?: boolean;
  up?: boolean;
  vary?: boolean;
  video?: boolean;
  videoCfgScale?: string;
  videoDuration?: string;
  videoNegative?: string;
  videoNoAudio?: boolean;
  wallpaper?: boolean;
  webSearch?: boolean;
  wide?: boolean;
}

/** JSON payload accepted via stdin */
export interface StdinPayload {
  aspect?: string;
  background?: string;
  // Subcommands
  command?:
    | "generate"
    | "upscale"
    | "rmbg"
    | "vary"
    | "last"
    | "history"
    | "describe"
    | "video"
    | "tool"
    | "tool-list"
    | "tool-describe"
    | "tool-run";
  dryRun?: boolean;
  creative?: CreativeDirection;
  // Video options
  duration?: number;
  editImages?: string[];
  // Generation params
  enableWebSearch?: boolean;
  enableGoogleSearch?: boolean;
  enableSafetyChecker?: boolean;
  enhancePrompt?: boolean;
  ephemeral?: boolean;
  expandPrompt?: boolean;
  generateAudio?: boolean;
  guidanceScale?: number;
  imagePromptStrength?: number;
  imageSize?: string | { height: number; width: number };
  // Upscale options
  imagePath?: string;
  inputFidelity?: "low" | "high";
  limitGenerations?: boolean;
  maskImageUrl?: string;
  // History options
  limit?: number;
  model?: string;
  negativePrompt?: string;
  noOpen?: boolean;
  numImages?: number;
  numInferenceSteps?: number;
  offset?: number;
  output?: string;
  outputFormat?: string;
  quality?: string;
  preset?: string;
  prompt?: string;
  raw?: boolean;
  renderingSpeed?: string;
  resolution?: string;
  // Background removal params
  rmbgOperatingResolution?: string;
  rmbgOutputFormat?: string;
  rmbgOutputMask?: boolean;
  rmbgRefineForeground?: boolean;
  rmbgVariant?: string;
  safetyTolerance?: string;
  scale?: number;
  seed?: number;
  style?: string;
  syncMode?: boolean;
  thinkingLevel?: string;
  transparent?: boolean;
  // Fal utility tool params
  tool?: string;
  input?: string;
  inputs?: string[];
  options?: Record<string, unknown>;
  // Upscale clarity params
  upscaleGuidanceScale?: number;
  upscaleNegativePrompt?: string;
  upscaleNumInferenceSteps?: number;
  upscalePrompt?: string;
  upscaleResemblance?: number;
  // Video params
  videoCfgScale?: number;
  videoNegativePrompt?: string;
}
