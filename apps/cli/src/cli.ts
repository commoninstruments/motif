/**
 * motif CLI — agent-first image generation.
 *
 * Security posture: the agent is not a trusted operator.
 * All inputs are validated. Output paths are sandboxed to CWD.
 * Use --dry-run before mutating commands.
 */

import { basename, resolve } from "node:path";
import {
  ASPECT_RATIOS,
  type AspectRatio,
  buildGenerateBody,
  estimateCost,
  estimateVideoCost,
  GENERATION_MODELS,
  type GenerateOptions,
  type ImageSize,
  MODELS,
  RESOLUTIONS,
  type Resolution,
} from "@howells/motif-sdk";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import {
  deletePayloads,
  generate,
  removeBackground,
  submitVideo,
  upscale,
  waitForVideo,
} from "./api/fal";
import { runDescribe } from "./commands/describe";
import { runHistory } from "./commands/history";
import { runToolPayload } from "./commands/tools";
import {
  addGeneration,
  addGenerations,
  type Generation,
  generateId,
  getApiKey,
  getLastGeneration,
  loadConfig,
  loadHistory,
} from "./utils/config";
import { handleError } from "./utils/errors";
import {
  downloadImage,
  generateFilename,
  getFileSize,
  getImageDimensions,
  imageToDataUrl,
  openImage,
} from "./utils/image";
import {
  parseIntegerOption,
  parseNumberOption,
  readStdinJson,
  sanitizePrompt,
  validateEditPath,
  validateEnumOption,
  validateOutputPath,
  validateResourceId,
} from "./utils/input";
import {
  type EmitOptions,
  emit,
  emitError,
  isStructured,
  type OutputFormat,
  resolveFormat,
} from "./utils/output";
import { PACKAGE_VERSION } from "./version";

// -- Constants --

/** Regex to match image file extensions for upscale output naming */
const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|webp)$/i;
const OUTPUT_FORMATS = ["jpeg", "png", "webp"] as const;
const BACKGROUND_MODES = ["auto", "transparent", "opaque"] as const;
const QUALITY_LEVELS = ["auto", "low", "medium", "high"] as const;
const SAFETY_LEVELS = ["1", "2", "3", "4", "5", "6"] as const;
const THINKING_LEVELS = ["minimal", "high"] as const;
const RENDERING_SPEEDS = ["TURBO", "BALANCED", "QUALITY"] as const;
const SCALE_FACTORS = ["2", "4", "6", "8"] as const;
const IMAGE_SIZE_STRINGS = [
  "auto",
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9",
  "1024x1024",
  "1536x1024",
  "1024x1536",
] as const;

function validateOption<T>(format: OutputFormat, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    handleError(err, "INVALID_OPTION", format);
  }
}

function validateOutput(format: OutputFormat, outputPath: string): string {
  try {
    return validateOutputPath(outputPath);
  } catch (err) {
    handleError(err, "INVALID_OUTPUT_PATH", format);
  }
}

function derivedOutputPath(sourcePath: string, suffix: string): string {
  const preferred = sourcePath.replace(IMAGE_EXT_REGEX, `${suffix}.png`);
  try {
    return validateOutputPath(preferred);
  } catch {
    const name = basename(sourcePath).replace(IMAGE_EXT_REGEX, "") || "motif";
    return validateOutputPath(`${name}${suffix}.png`);
  }
}

function parseImageSizeOption(
  value: StdinPayload["imageSize"] | string | undefined,
): ImageSize | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    const { height, width } = value;
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error("image size width and height must be integers");
    }
    if (width <= 0 || height <= 0) {
      throw new Error("image size width and height must be positive");
    }
    return { height, width };
  }

  if (
    IMAGE_SIZE_STRINGS.includes(value as (typeof IMAGE_SIZE_STRINGS)[number])
  ) {
    return value as ImageSize;
  }

  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new Error(
      `image size must be one of ${IMAGE_SIZE_STRINGS.join(", ")} or WIDTHxHEIGHT: ${JSON.stringify(value)}`,
    );
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) {
    throw new Error("image size width and height must be positive");
  }
  return { height, width };
}

// -- Types --

interface CliOptions {
  aspect?: string;
  background?: string;
  cfgScale?: string;
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
  limit?: string;
  limitGenerations?: boolean;
  loose?: boolean;
  mask?: string;
  model?: string;
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
  raw?: boolean;
  reel?: boolean;
  renderingSpeed?: string;
  resolution?: string;
  rmbg?: boolean;
  safety?: string;
  safetyChecker?: boolean;
  scale?: string;
  seed?: string;
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
interface StdinPayload {
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

// -- Preset resolution --

function resolvePreset(
  options: CliOptions,
  stdinPreset: string | undefined,
  stdinAspect: string | undefined,
  stdinResolution: string | undefined,
  defaultAspect: AspectRatio,
  defaultResolution: Resolution,
): { aspect: AspectRatio; resolution: Resolution } {
  const cliPreset =
    (options.cover && "cover") ||
    (options.story && "story") ||
    (options.reel && "reel") ||
    (options.feed && "feed") ||
    (options.og && "og") ||
    (options.wallpaper && "wallpaper") ||
    (options.ultra && "ultra") ||
    (options.wide && "wide") ||
    (options.square && "square") ||
    (options.landscape && "landscape") ||
    (options.portrait && "portrait");
  const preset = cliPreset || stdinPreset;

  const PRESET_MAP: Record<
    string,
    { aspect: AspectRatio; resolution?: Resolution }
  > = {
    cover: { aspect: "2:3", resolution: "2K" },
    story: { aspect: "9:16" },
    reel: { aspect: "9:16" },
    feed: { aspect: "4:5" },
    og: { aspect: "16:9" },
    wallpaper: { aspect: "9:16", resolution: "2K" },
    ultra: { aspect: "21:9", resolution: "2K" },
    wide: { aspect: "21:9" },
    square: { aspect: "1:1" },
    landscape: { aspect: "16:9" },
    portrait: { aspect: "2:3" },
  };

  if (preset && preset in PRESET_MAP) {
    // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed to exist due to the `in` check
    const p = PRESET_MAP[preset]!;
    return {
      aspect: p.aspect,
      resolution: p.resolution ?? defaultResolution,
    };
  }
  if (preset) {
    throw new Error(
      `preset must be one of ${Object.keys(PRESET_MAP).join(", ")}: ${JSON.stringify(preset)}`,
    );
  }

  return {
    aspect:
      (options.aspect ?? stdinAspect)
        ? validateEnumOption(
            options.aspect ?? stdinAspect ?? "",
            ASPECT_RATIOS,
            "aspect",
          )
        : defaultAspect,
    resolution:
      (options.resolution ?? stdinResolution)
        ? validateEnumOption(
            options.resolution ?? stdinResolution ?? "",
            RESOLUTIONS,
            "resolution",
          )
        : defaultResolution,
  };
}

// -- Edit path resolution --

function resolveEditPaths(
  editFiles: string[] | undefined,
  modelConfig: { maxReferenceImages?: number; name: string },
  format: OutputFormat,
): string[] | undefined {
  if (!editFiles?.length) {
    return undefined;
  }

  const maxRef = modelConfig.maxReferenceImages || 1;
  if (editFiles.length > maxRef) {
    emitError(
      {
        code: "TOO_MANY_REFERENCES",
        message: `${modelConfig.name} supports at most ${maxRef} reference images, got ${editFiles.length}`,
      },
      format,
    );
    process.exit(1);
  }

  try {
    return editFiles.map((p) => validateEditPath(p));
  } catch (err) {
    handleError(err, "INVALID_EDIT_PATH", format);
  }
}

// -- Structured result for saved images --

interface SavedImage {
  height?: number;
  path: string;
  size: string;
  width?: number;
}

async function saveGeneratedImages(
  images: { url: string }[],
  outputPath: string,
  numImages: number,
  meta: {
    prompt: string;
    model: string;
    aspect: AspectRatio;
    resolution: Resolution;
    editPaths?: string[];
  },
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions,
  noOpen?: boolean,
  historyRecorded = true,
): Promise<{
  id: string;
  images: SavedImage[];
  cost: number;
  historyRecorded: boolean;
  timestamp: string;
}> {
  // Build paths for each image
  const paths = images.map((_, i) =>
    numImages > 1 ? outputPath.replace(".png", `-${i + 1}.png`) : outputPath,
  );

  // Download all images in parallel
  const actualPaths = await Promise.all(
    images.map((image, i) =>
      // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed within bounds by the map
      downloadImage(image.url, paths[i]!),
    ),
  );

  // Collect metadata sequentially (dims via file command, console output ordering)
  const savedImages: SavedImage[] = [];
  const generations: Generation[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < images.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed within bounds by the loop condition
    const path = actualPaths[i]!;
    const dims = await getImageDimensions(path);
    const size = getFileSize(path);

    savedImages.push({
      path: resolve(path),
      width: dims?.width,
      height: dims?.height,
      size,
    });

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${path}`) +
          chalk.dim(
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`,
          ),
      );
    }

    generations.push({
      id: generateId(),
      prompt: meta.prompt,
      model: meta.model,
      aspect: meta.aspect,
      resolution: meta.resolution,
      output: resolve(path),
      cost: estimateCost(meta.model, meta.resolution, 1),
      timestamp: now,
      editedFrom: meta.editPaths?.[0] ? resolve(meta.editPaths[0]) : undefined,
    });
  }

  if (historyRecorded) {
    await addGenerations(generations);
  }

  const totalCost = generations.reduce((sum, g) => sum + g.cost, 0);
  // biome-ignore lint/style/noNonNullAssertion: generations is non-empty since images is non-empty
  const lastGen = generations.at(-1)!;

  if (historyRecorded && !isStructured(emitOpts.format)) {
    const history = await loadHistory();
    console.log(
      chalk.dim(
        `\nSession: $${history.totalCost.session.toFixed(2)} | Today: $${history.totalCost.today.toFixed(2)}`,
      ),
    );
  }

  // Open first image after all downloads complete
  if (config.openAfterGenerate && !noOpen) {
    // biome-ignore lint/style/noNonNullAssertion: paths[0] exists since images is non-empty
    openImage(paths[0]!);
  }

  return {
    id: lastGen.id,
    images: savedImages,
    cost: totalCost,
    historyRecorded,
    timestamp: lastGen.timestamp,
  };
}

// -- Commands --

async function generateImage(
  prompt: string,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions,
): Promise<void> {
  const { aspect, resolution } = validateOption(emitOpts.format, () =>
    resolvePreset(
      options,
      stdinData?.preset,
      stdinData?.aspect,
      stdinData?.resolution,
      config.defaultAspect,
      config.defaultResolution,
    ),
  );

  const modelId = options.model || stdinData?.model || config.defaultModel;

  // Validate model name against hallucination patterns
  try {
    validateResourceId(modelId, "model");
  } catch (err) {
    handleError(err, "INVALID_MODEL_ID", emitOpts.format);
  }

  const numImages = validateOption(emitOpts.format, () =>
    parseIntegerOption(stdinData?.numImages ?? options.num ?? 1, "num images", {
      min: 1,
      max: 4,
    }),
  );

  let outputPath: string;
  try {
    const rawOutput = options.output || stdinData?.output;
    outputPath = rawOutput ? validateOutputPath(rawOutput) : generateFilename();
  } catch (err) {
    handleError(err, "INVALID_OUTPUT_PATH", emitOpts.format);
  }

  const modelConfig = MODELS[modelId];
  if (!modelConfig) {
    emitError(
      {
        code: "UNKNOWN_MODEL",
        message: `Unknown model: ${modelId}`,
        details: { available: GENERATION_MODELS },
      },
      emitOpts.format,
    );
    process.exit(1);
  }

  const editPaths = resolveEditPaths(
    options.edit || stdinData?.editImages,
    modelConfig,
    emitOpts.format,
  );

  const cost = estimateCost(modelId, resolution, numImages);

  // Resolve new advanced generation params from CLI flags + stdin
  const seed = validateOption(emitOpts.format, () =>
    options.seed !== undefined || stdinData?.seed !== undefined
      ? parseIntegerOption(options.seed ?? stdinData?.seed ?? 0, "seed")
      : undefined,
  );
  const negativePrompt = options.negative || stdinData?.negativePrompt;
  const style = options.style || stdinData?.style;
  const outputFormat = validateOption(emitOpts.format, () =>
    options.outputFormat || stdinData?.outputFormat
      ? validateEnumOption(
          options.outputFormat ?? stdinData?.outputFormat ?? "",
          OUTPUT_FORMATS,
          "output format",
        )
      : undefined,
  );
  const background = validateOption(emitOpts.format, () =>
    options.background || stdinData?.background
      ? validateEnumOption(
          options.background ?? stdinData?.background ?? "",
          BACKGROUND_MODES,
          "background",
        )
      : undefined,
  );
  const quality = validateOption(emitOpts.format, () =>
    options.quality || stdinData?.quality
      ? validateEnumOption(
          options.quality ?? stdinData?.quality ?? "",
          QUALITY_LEVELS,
          "quality",
        )
      : undefined,
  );
  if (
    outputFormat &&
    modelConfig.supportedOutputFormats &&
    !modelConfig.supportedOutputFormats.includes(outputFormat)
  ) {
    handleError(
      new Error(
        `${modelConfig.name} supports output formats: ${modelConfig.supportedOutputFormats.join(", ")}`,
      ),
      "INVALID_OPTION",
      emitOpts.format,
    );
  }
  const safetyTolerance = validateOption(emitOpts.format, () =>
    options.safety || stdinData?.safetyTolerance
      ? validateEnumOption(
          options.safety ?? stdinData?.safetyTolerance ?? "",
          SAFETY_LEVELS,
          "safety tolerance",
        )
      : undefined,
  );
  const enableWebSearch = options.webSearch || stdinData?.enableWebSearch;
  const enableGoogleSearch =
    options.googleSearch || stdinData?.enableGoogleSearch;
  const enableSafetyChecker = options.disableSafetyChecker
    ? false
    : (options.safetyChecker ?? stdinData?.enableSafetyChecker);
  const syncMode = options.syncMode || stdinData?.syncMode;
  const imageSize = validateOption(emitOpts.format, () =>
    parseImageSizeOption(options.imageSize ?? stdinData?.imageSize),
  );
  const maskImageUrl = options.mask ?? stdinData?.maskImageUrl;
  const limitGenerations = options.disableLimitGenerations
    ? false
    : (options.limitGenerations ?? stdinData?.limitGenerations);
  const imagePromptStrength = validateOption(emitOpts.format, () =>
    options.imagePromptStrength !== undefined ||
    stdinData?.imagePromptStrength !== undefined
      ? parseNumberOption(
          options.imagePromptStrength ?? stdinData?.imagePromptStrength ?? 0,
          "image prompt strength",
          { min: 0, max: 1 },
        )
      : undefined,
  );
  const thinkingLevel = validateOption(emitOpts.format, () =>
    options.thinking || stdinData?.thinkingLevel
      ? validateEnumOption(
          options.thinking ?? stdinData?.thinkingLevel ?? "",
          THINKING_LEVELS,
          "thinking level",
        )
      : undefined,
  );
  const guidanceScale = validateOption(emitOpts.format, () =>
    options.guidanceScale !== undefined ||
    stdinData?.guidanceScale !== undefined
      ? parseNumberOption(
          options.guidanceScale ?? stdinData?.guidanceScale ?? 0,
          "guidance scale",
          { min: 1, max: 20 },
        )
      : undefined,
  );
  const numInferenceSteps = validateOption(emitOpts.format, () =>
    options.steps !== undefined || stdinData?.numInferenceSteps !== undefined
      ? parseIntegerOption(
          options.steps ?? stdinData?.numInferenceSteps ?? 0,
          "inference steps",
          { min: 1, max: 12 },
        )
      : undefined,
  );
  const raw = options.raw || stdinData?.raw;
  const enhancePrompt = options.enhancePrompt || stdinData?.enhancePrompt;
  const renderingSpeed = validateOption(emitOpts.format, () =>
    options.renderingSpeed || stdinData?.renderingSpeed
      ? validateEnumOption(
          options.renderingSpeed ?? stdinData?.renderingSpeed ?? "",
          RENDERING_SPEEDS,
          "rendering speed",
        )
      : undefined,
  );
  const expandPrompt = options.expandPrompt ?? stdinData?.expandPrompt;
  const ephemeral = options.ephemeral || stdinData?.ephemeral;
  const dryRunGenerateOptions: GenerateOptions = {
    prompt,
    model: modelId,
    aspect,
    resolution,
    numImages,
    editImageUrls: editPaths,
    ephemeral,
    transparent: options.transparent || stdinData?.transparent,
    inputFidelity: options.loose ? "low" : stdinData?.inputFidelity,
    seed,
    outputFormat,
    background,
    quality,
    negativePrompt,
    style,
    renderingSpeed,
    guidanceScale,
    numInferenceSteps,
    raw,
    enhancePrompt,
    safetyTolerance,
    enableWebSearch,
    enableGoogleSearch,
    enableSafetyChecker,
    syncMode,
    imageSize,
    imagePromptStrength,
    maskImageUrl,
    limitGenerations,
    thinkingLevel,
    expandPrompt,
  };
  const requestPreview = validateOption(emitOpts.format, () =>
    buildGenerateBody(dryRunGenerateOptions),
  );

  // -- Dry run --
  if (options.dryRun) {
    const dryResult = {
      dryRun: true,
      command: "generate",
      prompt,
      model: modelId,
      modelName: modelConfig.name,
      aspect,
      resolution,
      numImages,
      output: outputPath,
      editImages: editPaths,
      transparent: options.transparent || stdinData?.transparent,
      inputFidelity: options.loose ? "low" : stdinData?.inputFidelity,
      endpoint: requestPreview.endpoint,
      body: requestPreview.body,
      ephemeral,
      historyRecorded: !ephemeral,
      storeIo: !ephemeral,
      // New fields — only include when set
      ...(seed !== undefined && { seed }),
      ...(background && { background }),
      ...(quality && { quality }),
      ...(negativePrompt && { negativePrompt }),
      ...(style && { style }),
      ...(outputFormat && { outputFormat }),
      ...(safetyTolerance && { safetyTolerance }),
      ...(enableWebSearch && { enableWebSearch }),
      ...(enableGoogleSearch && { enableGoogleSearch }),
      ...(enableSafetyChecker !== undefined && { enableSafetyChecker }),
      ...(syncMode && { syncMode }),
      ...(imageSize && { imageSize }),
      ...(imagePromptStrength !== undefined && { imagePromptStrength }),
      ...(maskImageUrl && { maskImageUrl }),
      ...(limitGenerations !== undefined && { limitGenerations }),
      ...(thinkingLevel && { thinkingLevel }),
      ...(guidanceScale !== undefined && { guidanceScale }),
      ...(numInferenceSteps !== undefined && { numInferenceSteps }),
      ...(raw && { raw }),
      ...(enhancePrompt && { enhancePrompt }),
      ...(renderingSpeed && { renderingSpeed }),
      ...(expandPrompt !== undefined && { expandPrompt }),
      estimatedCost: cost,
      valid: true,
    };
    emit(dryResult, emitOpts);
    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold("\n🔍 Dry run — no API call made\n"));
      console.log(`  Model:  ${chalk.green(modelConfig.name)}`);
      console.log(`  Aspect: ${aspect} | Resolution: ${resolution}`);
      console.log(`  Images: ${numImages}`);
      console.log(`  Output: ${chalk.dim(outputPath)}`);
      console.log(`  Cost:   ${chalk.yellow(`~$${cost.toFixed(3)}`)}`);
      if (ephemeral) {
        console.log("  Fal IO: not retained after local download");
      }
      if (editPaths) {
        console.log(`  Edit:   ${chalk.dim(editPaths.join(", "))}`);
      }
    }
    return;
  }

  // -- Human progress output --
  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold(`\nModel: ${modelConfig.name}`));
    if (modelConfig.supportsAspect) {
      console.log(
        `Aspect: ${aspect} | Resolution: ${modelConfig.supportsResolution ? resolution : "N/A"}`,
      );
    }
    console.log(
      `Prompt: ${chalk.dim(prompt.slice(0, 80))}${prompt.length > 80 ? "..." : ""}`,
    );
    console.log(`Est. cost: ${chalk.yellow(`$${cost.toFixed(3)}`)}`);
    if (ephemeral) {
      console.log("Fal IO: not retained after local download");
    }
    if (editPaths) {
      console.log(`References: ${chalk.dim(editPaths.join(", "))}`);
    }
  }

  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Generating...").start();

  try {
    const result = await generate({
      prompt,
      model: modelId,
      aspect,
      resolution,
      numImages,
      editImages: editPaths,
      ephemeral,
      transparent: options.transparent || stdinData?.transparent,
      inputFidelity: options.loose ? "low" : stdinData?.inputFidelity,
      seed,
      background,
      quality,
      outputFormat,
      negativePrompt,
      style,
      renderingSpeed,
      guidanceScale,
      numInferenceSteps,
      raw,
      enhancePrompt,
      safetyTolerance,
      enableWebSearch,
      enableGoogleSearch,
      enableSafetyChecker,
      syncMode,
      imageSize,
      imagePromptStrength,
      maskImageUrl,
      limitGenerations,
      thinkingLevel,
      expandPrompt,
    });

    spinner?.succeed("Generated!");

    const saved = await saveGeneratedImages(
      result.images,
      outputPath,
      numImages,
      { prompt, model: modelId, aspect, resolution, editPaths },
      config,
      emitOpts,
      options.noOpen || stdinData?.noOpen,
      !ephemeral,
    );

    let payloadsDeleted = false;
    let payloadDeleteError: string | undefined;
    if (ephemeral) {
      if (result.requestId) {
        try {
          await deletePayloads(result.requestId);
          payloadsDeleted = true;
        } catch (error) {
          payloadDeleteError =
            error instanceof Error ? error.message : String(error);
          if (!isStructured(emitOpts.format)) {
            console.warn(
              chalk.yellow(
                `Warning: saved locally, but fal payload deletion failed: ${payloadDeleteError}`,
              ),
            );
          }
        }
      } else {
        payloadDeleteError = "fal response did not include a request_id";
      }
    }

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "generate",
          ...saved,
          ephemeral,
          ...(ephemeral && {
            payloadsDeleted,
            requestId: result.requestId,
            storeIo: false,
          }),
          ...(payloadDeleteError && { payloadDeleteError }),
          prompt,
          model: modelId,
          modelName: modelConfig.name,
          aspect,
          resolution,
          numImages,
        },
        emitOpts,
      );
    }
  } catch (err) {
    spinner?.fail("Generation failed");
    handleError(err, "GENERATION_FAILED", emitOpts.format);
  }
}

async function generateVariations(
  customPrompt: string | undefined,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions,
): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message: "No previous generation to create variations of",
      },
      emitOpts.format,
    );
    process.exit(1);
  }

  const prompt = customPrompt || stdinData?.prompt || last.prompt;
  const numImages = validateOption(emitOpts.format, () =>
    parseIntegerOption(stdinData?.numImages ?? options.num ?? 4, "num images", {
      min: 1,
      max: 4,
    }),
  );

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nGenerating variations..."));
    console.log(`Base: ${chalk.dim(last.prompt.slice(0, 50))}...`);
  }

  await generateImage(
    prompt,
    {
      ...options,
      model: options.model || stdinData?.model || last.model,
      aspect: options.aspect || stdinData?.aspect || last.aspect,
      resolution:
        options.resolution || stdinData?.resolution || last.resolution,
      num: String(numImages),
    },
    null, // Don't pass stdinData again (already merged into options)
    config,
    emitOpts,
  );
}

async function upscaleLast(
  imagePath: string | undefined,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions,
): Promise<void> {
  let sourceImagePath: string;
  let sourcePrompt = "[upscale]";
  let sourceAspect: AspectRatio = "1:1";
  let sourceResolution: Resolution = "1K";

  const resolvedPath = imagePath || stdinData?.imagePath;

  if (resolvedPath) {
    try {
      sourceImagePath = validateEditPath(resolvedPath);
    } catch (err) {
      handleError(err, "INVALID_IMAGE_PATH", emitOpts.format);
    }
  } else {
    const last = await getLastGeneration();
    if (!last) {
      emitError(
        { code: "NO_PREVIOUS", message: "No previous generation to upscale" },
        emitOpts.format,
      );
      process.exit(1);
    }
    sourceImagePath = last.output;
    sourcePrompt = last.prompt;
    sourceAspect = last.aspect;
    sourceResolution = last.resolution;
  }

  const scaleFactor = validateOption(emitOpts.format, () =>
    Number(
      validateEnumOption(
        String(stdinData?.scale ?? options.scale ?? 2),
        SCALE_FACTORS,
        "scale factor",
      ),
    ),
  );
  const rawOutput = options.output || stdinData?.output;
  const outputPath = rawOutput
    ? validateOutput(emitOpts.format, rawOutput)
    : derivedOutputPath(sourceImagePath, `-up${scaleFactor}x`);

  // -- Dry run --
  if (options.dryRun) {
    const dryResult = {
      dryRun: true,
      command: "upscale",
      source: sourceImagePath,
      scale: scaleFactor,
      model: config.upscaler,
      output: outputPath,
      estimatedCost: 0.02,
      valid: true,
    };
    emit(dryResult, emitOpts);
    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold("\n🔍 Dry run — no API call made\n"));
      console.log(`  Source: ${chalk.dim(sourceImagePath)}`);
      console.log(`  Scale:  ${scaleFactor}x`);
      console.log(`  Model:  ${config.upscaler}`);
      console.log(`  Output: ${chalk.dim(outputPath)}`);
      console.log(`  Cost:   ${chalk.yellow("~$0.02")}`);
    }
    return;
  }

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nUpscaling..."));
    console.log(`Source: ${chalk.dim(sourceImagePath)}`);
    console.log(`Scale: ${scaleFactor}x | Model: ${config.upscaler}`);
  }

  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Upscaling...").start();

  try {
    const imageData = await imageToDataUrl(sourceImagePath);

    const result = await upscale({
      imageUrl: imageData,
      model: config.upscaler,
      scaleFactor,
      // Clarity upscale params from stdin (power-user API access)
      ...(stdinData?.upscalePrompt && { prompt: stdinData.upscalePrompt }),
      ...(stdinData?.upscaleNegativePrompt && {
        negativePrompt: stdinData.upscaleNegativePrompt,
      }),
      ...(stdinData?.upscaleResemblance !== undefined && {
        resemblance: stdinData.upscaleResemblance,
      }),
      ...(stdinData?.upscaleNumInferenceSteps !== undefined && {
        numInferenceSteps: stdinData.upscaleNumInferenceSteps,
      }),
      ...(stdinData?.upscaleGuidanceScale !== undefined && {
        guidanceScale: stdinData.upscaleGuidanceScale,
      }),
    });

    spinner?.succeed("Upscaled!");

    // biome-ignore lint/style/noNonNullAssertion: API always returns at least one image
    const image = result.images[0]!;
    const actualOutputPath = await downloadImage(image.url, outputPath);

    const dims = await getImageDimensions(actualOutputPath);
    const size = await getFileSize(actualOutputPath);

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${actualOutputPath}`) +
          chalk.dim(
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`,
          ),
      );
    }

    await addGeneration({
      id: generateId(),
      prompt: `[upscale ${scaleFactor}x] ${sourcePrompt}`,
      model: config.upscaler,
      aspect: sourceAspect,
      resolution: sourceResolution,
      output: resolve(actualOutputPath),
      cost: 0.02,
      timestamp: new Date().toISOString(),
      editedFrom: sourceImagePath,
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "upscale",
          path: resolve(actualOutputPath),
          source: sourceImagePath,
          scale: scaleFactor,
          model: config.upscaler,
          width: dims?.width,
          height: dims?.height,
          size,
          cost: 0.02,
        },
        emitOpts,
      );
    }

    if (config.openAfterGenerate && !options.noOpen && !stdinData?.noOpen) {
      await openImage(actualOutputPath);
    }
  } catch (err) {
    spinner?.fail("Upscale failed");
    handleError(err, "UPSCALE_FAILED", emitOpts.format);
  }
}

async function removeBackgroundLast(
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions,
): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message: "No previous generation to remove background from",
      },
      emitOpts.format,
    );
    process.exit(1);
  }

  const rawOutput = options.output || stdinData?.output;
  const outputPath = rawOutput
    ? validateOutput(emitOpts.format, rawOutput)
    : derivedOutputPath(last.output, "-nobg");

  // -- Dry run --
  if (options.dryRun) {
    const dryResult = {
      dryRun: true,
      command: "rmbg",
      source: last.output,
      model: config.backgroundRemover,
      output: outputPath,
      estimatedCost: 0.02,
      valid: true,
    };
    emit(dryResult, emitOpts);
    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold("\n🔍 Dry run — no API call made\n"));
      console.log(`  Source: ${chalk.dim(last.output)}`);
      console.log(`  Model:  ${config.backgroundRemover}`);
      console.log(`  Output: ${chalk.dim(outputPath)}`);
      console.log(`  Cost:   ${chalk.yellow("~$0.02")}`);
    }
    return;
  }

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nRemoving background..."));
    console.log(`Source: ${chalk.dim(last.output)}`);
    console.log(`Model: ${config.backgroundRemover}`);
  }

  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Processing...").start();

  try {
    const imageData = await imageToDataUrl(last.output);

    const result = await removeBackground({
      imageUrl: imageData,
      model: config.backgroundRemover,
      // BiRefNet params from stdin
      ...(stdinData?.rmbgVariant && {
        variant: stdinData.rmbgVariant as
          | "General Use (Light)"
          | "General Use (Heavy)"
          | "Portrait",
      }),
      ...(stdinData?.rmbgOperatingResolution && {
        operatingResolution: stdinData.rmbgOperatingResolution as
          | "1024x1024"
          | "2048x2048",
      }),
      ...(stdinData?.rmbgOutputFormat && {
        outputFormat: stdinData.rmbgOutputFormat as "png" | "webp" | "gif",
      }),
      ...(stdinData?.rmbgRefineForeground !== undefined && {
        refineForeground: stdinData.rmbgRefineForeground,
      }),
      ...(stdinData?.rmbgOutputMask !== undefined && {
        outputMask: stdinData.rmbgOutputMask,
      }),
    });

    spinner?.succeed("Background removed!");

    // biome-ignore lint/style/noNonNullAssertion: API always returns at least one image
    const image = result.images[0]!;
    const actualOutputPath = await downloadImage(image.url, outputPath);

    const dims = await getImageDimensions(actualOutputPath);
    const size = await getFileSize(actualOutputPath);

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${actualOutputPath}`) +
          chalk.dim(
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`,
          ),
      );
    }

    await addGeneration({
      id: generateId(),
      prompt: `[rmbg] ${last.prompt}`,
      model: config.backgroundRemover,
      aspect: last.aspect,
      resolution: last.resolution,
      output: resolve(actualOutputPath),
      cost: 0.02,
      timestamp: new Date().toISOString(),
      editedFrom: last.output,
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "rmbg",
          path: resolve(actualOutputPath),
          source: last.output,
          model: config.backgroundRemover,
          width: dims?.width,
          height: dims?.height,
          size,
          cost: 0.02,
        },
        emitOpts,
      );
    }

    if (config.openAfterGenerate && !options.noOpen && !stdinData?.noOpen) {
      await openImage(actualOutputPath);
    }
  } catch (err) {
    spinner?.fail("Background removal failed");
    handleError(err, "RMBG_FAILED", emitOpts.format);
  }
}

async function generateVideo(
  imagePath: string | undefined,
  options: CliOptions,
  stdinData: StdinPayload | null,
  _config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions,
): Promise<void> {
  // Resolve source image
  const resolvedPath = imagePath || stdinData?.imagePath;
  let sourceImagePath: string;

  if (resolvedPath) {
    try {
      sourceImagePath = validateEditPath(resolvedPath);
    } catch (err) {
      handleError(err, "INVALID_IMAGE_PATH", emitOpts.format);
    }
  } else {
    const last = await getLastGeneration();
    if (!last) {
      emitError(
        {
          code: "NO_PREVIOUS",
          message:
            "No previous generation. Provide an image path: motif --video image.png",
        },
        emitOpts.format,
      );
      process.exit(1);
    }
    sourceImagePath = last.output;
  }

  const prompt =
    stdinData?.prompt || "cinematic motion, smooth camera movement";
  const duration = validateOption(emitOpts.format, () =>
    parseIntegerOption(
      stdinData?.duration ?? options.videoDuration ?? 5,
      "video duration",
      { min: 3, max: 15 },
    ),
  );
  const generateAudio = stdinData?.generateAudio ?? !options.videoNoAudio;

  const cost = estimateVideoCost(duration, generateAudio);
  const rawOutput = options.output || stdinData?.output;
  const outputPath = rawOutput
    ? validateOutput(emitOpts.format, rawOutput)
    : `motif-video-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}.mp4`;

  // -- Dry run --
  if (options.dryRun) {
    const dryResult = {
      dryRun: true,
      command: "video",
      source: sourceImagePath,
      prompt,
      duration,
      generateAudio,
      model: "kling",
      output: resolve(outputPath),
      estimatedCost: cost,
      valid: true,
    };
    emit(dryResult, emitOpts);
    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold("\n🔍 Dry run — no API call made\n"));
      console.log(`  Source:   ${chalk.dim(sourceImagePath)}`);
      console.log(`  Prompt:   ${chalk.dim(prompt.slice(0, 80))}`);
      console.log(`  Duration: ${duration}s`);
      console.log(`  Audio:    ${generateAudio ? "yes" : "no"}`);
      console.log("  Model:    Kling v3 Pro");
      console.log(`  Cost:     ${chalk.yellow(`~$${cost.toFixed(2)}`)}`);
    }
    return;
  }

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nGenerating video..."));
    console.log(`Source: ${chalk.dim(sourceImagePath)}`);
    console.log(
      `Duration: ${duration}s | Audio: ${generateAudio ? "yes" : "no"}`,
    );
    console.log(`Est. cost: ${chalk.yellow(`$${cost.toFixed(2)}`)}`);
  }

  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Submitting video job...").start();

  try {
    const job = await submitVideo({
      imageUrl: sourceImagePath,
      prompt,
      duration,
      generateAudio,
      ...(stdinData?.videoNegativePrompt && {
        negativePrompt: stdinData.videoNegativePrompt,
      }),
      ...(options.videoNegative && {
        negativePrompt: options.videoNegative,
      }),
      ...(stdinData?.videoCfgScale !== undefined && {
        cfgScale: validateOption(emitOpts.format, () =>
          parseNumberOption(stdinData.videoCfgScale ?? 0, "video CFG scale", {
            min: 0,
            max: 1,
          }),
        ),
      }),
      ...(options.videoCfgScale !== undefined && {
        cfgScale: validateOption(emitOpts.format, () =>
          parseNumberOption(options.videoCfgScale ?? 0, "video CFG scale", {
            min: 0,
            max: 1,
          }),
        ),
      }),
    });

    if (spinner) {
      spinner.text = "Generating video (this takes 30-120s)...";
    }

    const video = await waitForVideo(
      job.endpoint,
      job.requestId,
      (status, position) => {
        if (spinner) {
          spinner.text =
            status === "queued"
              ? `Queued${position ? ` (position ${position})` : ""}...`
              : "Generating video...";
        }
      },
    );

    spinner?.succeed("Video generated!");

    // Download the video
    const actualOutputPath = await downloadImage(video.url, outputPath);

    const fileSize = getFileSize(actualOutputPath);

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${actualOutputPath}`) +
          chalk.dim(` (${duration}s, ${fileSize})`),
      );
    }

    // Record in history
    await addGeneration({
      id: generateId(),
      prompt: `[video ${duration}s] ${prompt}`,
      model: "kling",
      aspect: "1:1",
      resolution: "1K",
      output: resolve(actualOutputPath),
      cost,
      timestamp: new Date().toISOString(),
      editedFrom: sourceImagePath,
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "video",
          path: resolve(actualOutputPath),
          source: sourceImagePath,
          prompt,
          duration,
          generateAudio,
          model: "kling",
          size: fileSize,
          cost,
        },
        emitOpts,
      );
    }
  } catch (err) {
    spinner?.fail("Video generation failed");
    handleError(err, "VIDEO_FAILED", emitOpts.format);
  }
}

async function showLastGeneration(emitOpts: EmitOptions): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    if (isStructured(emitOpts.format)) {
      emit({ command: "last", result: null }, emitOpts);
    } else {
      console.log(chalk.yellow("No previous generations found"));
    }
    return;
  }

  if (isStructured(emitOpts.format)) {
    emit(
      {
        command: "last",
        ...last,
        modelName: MODELS[last.model]?.name ?? last.model,
      },
      emitOpts,
    );
    return;
  }

  console.log(chalk.bold("\nLast Generation:"));
  console.log(
    `  Prompt: ${chalk.cyan(last.prompt.slice(0, 60))}${last.prompt.length > 60 ? "..." : ""}`,
  );
  console.log(
    `  Model:  ${chalk.green(MODELS[last.model]?.name || last.model)}`,
  );
  console.log(`  Aspect: ${last.aspect} | Resolution: ${last.resolution}`);
  console.log(`  Output: ${chalk.dim(last.output)}`);
  console.log(`  Cost:   ${chalk.yellow(`$${last.cost.toFixed(3)}`)}`);
  console.log(`  Time:   ${new Date(last.timestamp).toLocaleString()}`);
}

// -- Main entry --

export async function runCli(
  args: string[],
  preloadedConfig?: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  const config = preloadedConfig ?? (await loadConfig());

  const program = new Command()
    .name("motif")
    .description("fal.ai image generation CLI — agent-first design")
    .version(PACKAGE_VERSION)
    .argument("[prompt]", "Image generation prompt")
    .addHelpText(
      "after",
      "\nCommands:\n  motif studio               Launch interactive terminal Studio",
    )
    // Agent-first global flags
    .option(
      "--format <format>",
      "Output format: json, human, ndjson (default: auto-detect from TTY)",
    )
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in output (e.g. --fields id,cost,path)",
    )
    .option("--dry-run", "Validate inputs without making API calls")
    .option(
      "--ephemeral",
      "Save output locally, then delete fal request IO payloads when possible",
    )
    // Model & generation
    .option(
      "-m, --model <model>",
      `Model to use (${GENERATION_MODELS.join(", ")})`,
    )
    .option("-e, --edit <files...>", "Reference image(s) for editing")
    .option("--loose", "Use reference as loose inspiration (GPT only)")
    .option(
      "-a, --aspect <ratio>",
      `Aspect ratio (${ASPECT_RATIOS.join(", ")})`,
    )
    .option("-r, --resolution <res>", `Resolution (${RESOLUTIONS.join(", ")})`)
    .option("-o, --output <file>", "Output filename")
    .option("-n, --num <count>", "Number of images 1-4")
    // Format presets
    .option("--cover", "Kindle/eBook cover: 2:3, 2K (1600×2400)")
    .option("--square", "Square: 1:1")
    .option("--landscape", "Landscape: 16:9")
    .option("--portrait", "Portrait: 2:3")
    // Social media presets
    .option("--story", "Instagram/TikTok Story: 9:16 (1080×1920)")
    .option("--reel", "Instagram Reel: 9:16 (1080×1920)")
    .option("--feed", "Instagram Feed portrait: 4:5 (1080×1350)")
    .option("--og", "Open Graph / social share: 16:9 (1200×630)")
    // Device presets
    .option("--wallpaper", "iPhone wallpaper: 9:16")
    // Cinematic presets
    .option("--wide", "Cinematic wide: 21:9")
    .option("--ultra", "Ultra-wide banner: 21:9, 2K")
    // Output options
    .option("--transparent", "Transparent background (PNG, GPT model only)")
    .option(
      "--background <mode>",
      "GPT background mode: auto, transparent, opaque",
    )
    .option("--quality <quality>", "Image quality: auto, low, medium, high")
    .option(
      "--image-size <size>",
      "Direct fal image_size override, e.g. auto, square_hd, 1536x1024",
    )
    .option("--sync-mode", "Ask fal to return media as data URI")
    .option("--mask <url>", "Mask image URL for supported edit models")
    .option("--last", "Show last generation info")
    .option("--vary", "Generate variations of last image")
    .option("--up", "Upscale image (provide path, or uses last)")
    .option("--rmbg", "Remove background from last image")
    .option("--scale <factor>", "Upscale factor (for --up)")
    .option("--no-open", "Don't open image after generation")
    // Video
    .option("--video", "Generate video from image (provide path)")
    .option("--video-duration <seconds>", "Video duration 3-15 (default 5)")
    .option("--video-no-audio", "Disable audio generation (cheaper)")
    // Advanced generation
    .option("--seed <n>", "Reproducible generation seed")
    .option(
      "--negative <text>",
      "Negative prompt — what NOT to include (ideogram)",
    )
    .option(
      "--style <style>",
      "Style preset: recraft 70+ styles (realistic_image, digital_illustration/pixel_art, etc.) or ideogram AUTO|GENERAL|REALISTIC|DESIGN",
    )
    .option("--output-format <format>", "Output format: jpeg, png, webp")
    .option(
      "--safety <level>",
      "Safety tolerance 1–6 (1=strictest) — selected Gemini/FLUX models",
    )
    .option(
      "--web-search",
      "Enable web search for generative context (banana2, banana, gemini3)",
    )
    .option(
      "--google-search",
      "Enable fal enable_google_search alias where supported",
    )
    .option(
      "--limit-generations",
      "Limit model-internal generation rounds where supported",
    )
    .option(
      "--disable-limit-generations",
      "Disable model-internal generation limiting where supported",
    )
    .option(
      "--thinking <level>",
      "Thinking level where supported: minimal, high",
    )
    .option("--safety-checker", "Enable fal safety checker where supported")
    .option(
      "--disable-safety-checker",
      "Disable fal safety checker where supported",
    )
    .option(
      "--image-prompt-strength <n>",
      "Reference image strength where supported, 0–1",
    )
    .option(
      "--guidance-scale <n>",
      "CFG guidance scale (controllable FLUX models, 1–20)",
    )
    .option(
      "--steps <n>",
      "Inference step count (controllable FLUX models, 1–12)",
    )
    .option("--raw", "Generate less processed, more natural output (flux only)")
    .option(
      "--enhance-prompt",
      "Auto-enhance the prompt before generation (flux only)",
    )
    .option(
      "--rendering-speed <speed>",
      "Speed/quality trade-off: TURBO, BALANCED, QUALITY (ideogram)",
    )
    .option("--expand-prompt", "Enable MagicPrompt prompt expansion (ideogram)")
    .option(
      "--no-expand-prompt",
      "Disable MagicPrompt prompt expansion (ideogram)",
    )
    // Video advanced
    .option("--video-negative <text>", "Negative prompt for video generation")
    .option(
      "--video-cfg-scale <n>",
      "CFG guidance scale for video (0–1, kling)",
    )
    // Introspection & history
    .option("--describe [command]", "Show CLI schema as JSON (for agents)")
    .option("--history", "Show generation history")
    .option("--limit <n>", "History: number of entries (default 10)")
    .option("--offset <n>", "History: skip first N entries");

  program.parse(args);

  const options = program.opts<CliOptions>();
  const prompt = program.args[0];

  // Resolve output format (TTY detection + explicit flag)
  const format = resolveFormat(options.format);
  const emitOpts: EmitOptions = {
    format,
    fields: options.fields,
    sanitize: true, // Always sanitize API responses
  };

  // -- Read stdin JSON if piped --
  let stdinData: StdinPayload | null = null;
  try {
    stdinData = await readStdinJson<StdinPayload>();
  } catch (err) {
    handleError(err, "INVALID_STDIN", format);
  }

  // Stdin can specify a command
  const stdinCommand = stdinData?.command;
  if (stdinData?.dryRun) {
    options.dryRun = true;
  }

  // -- Describe (schema introspection) --
  if (options.describe !== undefined || stdinCommand === "describe") {
    const cmdName =
      typeof options.describe === "string" ? options.describe : undefined;
    try {
      runDescribe(cmdName, emitOpts);
    } catch (err) {
      handleError(err, "DESCRIBE_FAILED", format);
    }
    return;
  }

  // -- History --
  if (options.history || stdinCommand === "history") {
    await runHistory(
      {
        limit:
          stdinData?.limit ??
          (options.limit ? Number.parseInt(options.limit, 10) : undefined),
        offset:
          stdinData?.offset ??
          (options.offset ? Number.parseInt(options.offset, 10) : undefined),
      },
      emitOpts,
    );
    return;
  }

  // -- Last --
  if (options.last || stdinCommand === "last") {
    await showLastGeneration(emitOpts);
    return;
  }

  // -- Fal utility tools --
  const isToolCommand =
    stdinCommand === "tool" ||
    stdinCommand === "tool-run" ||
    stdinCommand === "tool-list" ||
    stdinCommand === "tool-describe";
  if (stdinData && isToolCommand) {
    if (
      stdinData?.tool &&
      stdinCommand !== "tool-list" &&
      stdinCommand !== "tool-describe" &&
      !options.dryRun
    ) {
      try {
        getApiKey(config);
      } catch (err) {
        handleError(err, "MISSING_API_KEY", format);
      }
    }
    await runToolPayload(
      {
        command: stdinCommand,
        dryRun: options.dryRun,
        input: stdinData.input,
        inputs: stdinData.inputs,
        options: stdinData.options,
        output: stdinData.output,
        outputFormat: stdinData.outputFormat,
        prompt: stdinData.prompt,
        scale: stdinData.scale?.toString(),
        tool: stdinData.tool,
      },
      emitOpts,
    );
    return;
  }

  // Validate API key for operations that need it
  const wouldCallFal =
    prompt ||
    stdinData?.prompt ||
    options.vary ||
    options.up ||
    options.rmbg ||
    options.video ||
    options.edit?.length ||
    stdinCommand === "generate" ||
    stdinCommand === "vary" ||
    stdinCommand === "upscale" ||
    stdinCommand === "rmbg" ||
    stdinCommand === "video";
  const requiresApiKey = wouldCallFal && !options.dryRun;

  if (requiresApiKey) {
    try {
      getApiKey(config);
    } catch (err) {
      handleError(err, "MISSING_API_KEY", format);
    }
  }

  // -- Video --
  if (options.video || stdinCommand === "video") {
    await generateVideo(prompt, options, stdinData, config, emitOpts);
    return;
  }

  // -- Vary --
  if (options.vary || stdinCommand === "vary") {
    await generateVariations(prompt, options, stdinData, config, emitOpts);
    return;
  }

  // -- Upscale --
  if (options.up || stdinCommand === "upscale") {
    await upscaleLast(prompt, options, stdinData, config, emitOpts);
    return;
  }

  // -- Remove background --
  if (options.rmbg || stdinCommand === "rmbg") {
    await removeBackgroundLast(options, stdinData, config, emitOpts);
    return;
  }

  // -- Generate --
  const resolvedPrompt = prompt || stdinData?.prompt;
  if (resolvedPrompt) {
    const sanitized = sanitizePrompt(resolvedPrompt);
    if (!sanitized) {
      emitError(
        { code: "EMPTY_PROMPT", message: "Prompt is empty after sanitization" },
        format,
      );
      process.exit(1);
    }
    await generateImage(sanitized, options, stdinData, config, emitOpts);
    return;
  }

  // No prompt and no command = show help.
  program.help();
}

export function showHelp(): void {
  console.log(`
${chalk.bold("motif")} - fal.ai image generation CLI

${chalk.bold("Usage:")}
  motif                           Show help
  motif studio                    Launch interactive terminal Studio
  motif "prompt" [options]        Generate image from prompt
  motif --last                    Show last generation info
  motif --vary                    Generate variations of last image
  motif --up                      Upscale last image
  motif --rmbg                    Remove background from last image

${chalk.bold("Agent-First Flags:")}
  --format <json|human|ndjson>  Output format (auto-detects TTY)
  --fields <f1,f2,...>          Select output fields
  --dry-run                     Validate without API calls
  --ephemeral                   Save locally, then delete fal IO payloads
  --describe [command]          Show CLI schema as JSON
  --history                     Generation history with pagination
  --limit <n>                   History entries per page (default 10)
  --offset <n>                  History pagination offset

${chalk.bold("Stdin JSON:")}
  echo '{"prompt":"a cat","model":"gpt"}' | motif
  echo '{"command":"history","limit":5}' | motif

${chalk.bold("Options:")}
  -m, --model <model>      Model ID, e.g. banana2, gpt2, seedream4, flux2-pro
  -e, --edit <files...>    Reference image(s) for editing
  --loose                  Use reference as loose inspiration (GPT only)
  -a, --aspect <ratio>     Aspect ratio (see below)
  -r, --resolution <res>   Resolution: 1K, 2K, 4K
  -o, --output <file>      Output filename
  -n, --num <count>        Number of images (1-4)
  --transparent            Transparent background PNG (GPT only)
  --ephemeral              Save locally, skip history, delete fal IO payloads
  --no-open                Don't auto-open image after generation

${chalk.bold("Post-processing:")}
  --last                   Show last generation info
  --vary                   Generate variations of last image
  --up                     Upscale last image
  --rmbg                   Remove background from last image
  --scale <factor>         Upscale factor: 2, 4, 6, 8 (with --up)

${chalk.bold("Presets:")}
  ${chalk.dim("Format:")}
  --cover                  Kindle/eBook cover: 2:3, 2K
  --square                 Square: 1:1
  --landscape              Landscape: 16:9
  --portrait               Portrait: 2:3
  ${chalk.dim("Social Media:")}
  --story                  Instagram/TikTok Story: 9:16
  --reel                   Instagram Reel: 9:16
  --feed                   Instagram Feed: 4:5
  --og                     Open Graph / social share: 16:9
  ${chalk.dim("Devices:")}
  --wallpaper              iPhone wallpaper: 9:16, 2K
  ${chalk.dim("Cinematic:")}
  --wide                   Cinematic wide: 21:9
  --ultra                  Ultra-wide banner: 21:9, 2K

${chalk.bold("Aspect Ratios:")}
  21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16

${chalk.bold("Examples:")}
  motif "a cat on a windowsill" -m gpt
  motif "urban landscape" --landscape -r 4K
  motif "add rain" -e photo.png
  motif --vary -n 4
  motif --up --scale 4
  motif --describe generate           # Agent: introspect schema
  motif --dry-run "a cat" -m gpt      # Agent: validate without API call
  echo '{"prompt":"a cat"}' | motif   # Agent: raw JSON input
`);
}
