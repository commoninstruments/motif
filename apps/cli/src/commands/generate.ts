/**
 * generate command — build the fal request, run generation, and save results.
 *
 * Security posture: the agent is not a trusted operator.
 * All inputs are validated. Output paths are sandboxed to CWD.
 * Use --dry-run before mutating commands.
 */

import { resolve } from "node:path";

import {
  buildGenerateBody,
  enrichPrompt,
  estimateCost,
  GENERATION_MODELS,
  MODELS,
} from "@howells/motif-sdk";
import type {
  AspectRatio,
  GenerateOptions,
  Resolution,
} from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";

import { deletePayloads, generate } from "../api/fal";
import type { CliOptions, StdinPayload } from "../utils/cli-types";
import {
  addGenerations,
  generateId,
  loadConfig,
  loadHistory,
} from "../utils/config";
import type { Generation } from "../utils/config";
import { resolveCreativeDirection } from "../utils/creative";
import { exitForErrorCode, handleError, validateOption } from "../utils/errors";
import {
  BACKGROUND_MODES,
  OUTPUT_FORMATS,
  parseImageSizeOption,
  QUALITY_LEVELS,
  RENDERING_SPEEDS,
  resolveEditPaths,
  resolvePreset,
  SAFETY_LEVELS,
  THINKING_LEVELS,
} from "../utils/generate-options";
import {
  downloadImage,
  generateFilename,
  getFileSize,
  getImageDimensions,
  indexedOutputPath,
  openImage,
} from "../utils/image";
import {
  parseIntegerOption,
  parseNumberOption,
  validateEnumOption,
  validateOutputPath,
  validateResourceId,
} from "../utils/input";
import { emit, emitError, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { firstText, hasText } from "../utils/text";

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
  historyRecorded = true
): Promise<{
  id: string;
  images: SavedImage[];
  cost: number;
  historyRecorded: boolean;
  timestamp: string;
}> {
  // Build paths for each image
  const paths = images.map((_, i) =>
    numImages > 1 ? indexedOutputPath(outputPath, i) : outputPath
  );

  // Download all images in parallel
  const actualPaths = await Promise.all(
    images.map(
      async (image, i) =>
        // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed within bounds by the map
        await downloadImage(image.url, paths[i]!)
    )
  );

  // Collect metadata sequentially (dims via file command, console output ordering)
  const savedImages: SavedImage[] = [];
  const generations: Generation[] = [];
  const now = new Date().toISOString();
  const firstEditPath = meta.editPaths?.[0];
  const editedFrom = hasText(firstEditPath)
    ? resolve(firstEditPath)
    : undefined;

  for (let i = 0; i < images.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed within bounds by the loop condition
    const path = actualPaths[i]!;
    const dims = await getImageDimensions(path);
    const size = getFileSize(path);

    savedImages.push({
      height: dims?.height,
      path: resolve(path),
      size,
      width: dims?.width,
    });

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${path}`) +
          chalk.dim(
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`
          )
      );
    }

    generations.push({
      aspect: meta.aspect,
      cost: estimateCost(meta.model, meta.resolution, 1),
      editedFrom,
      id: generateId(),
      model: meta.model,
      output: resolve(path),
      prompt: meta.prompt,
      resolution: meta.resolution,
      timestamp: now,
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
        `\nSession: $${history.totalCost.session.toFixed(2)} | Today: $${history.totalCost.today.toFixed(2)}`
      )
    );
  }

  // Open first image after all downloads complete. Use the actual saved path:
  // downloadImage may rewrite the extension when fal returns a different
  // format than the requested filename implies (e.g. .png -> .jpg).
  if (config.openAfterGenerate && noOpen !== true) {
    // biome-ignore lint/style/noNonNullAssertion: actualPaths[0] exists since images is non-empty
    openImage(actualPaths[0]!);
  }

  return {
    cost: totalCost,
    historyRecorded,
    id: lastGen.id,
    images: savedImages,
    timestamp: lastGen.timestamp,
  };
}

export async function generateImage(
  prompt: string,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions
): Promise<void> {
  const { aspect, resolution } = validateOption(emitOpts.format, () =>
    resolvePreset(
      options,
      stdinData?.preset,
      stdinData?.aspect,
      stdinData?.resolution,
      config.defaultAspect,
      config.defaultResolution
    )
  );

  const modelId =
    firstText(options.model, stdinData?.model) ?? config.defaultModel;

  // Validate model name against hallucination patterns
  try {
    validateResourceId(modelId, "model");
  } catch (error) {
    handleError(error, "INVALID_MODEL_ID", emitOpts.format);
  }

  const numImages = validateOption(emitOpts.format, () =>
    parseIntegerOption(stdinData?.numImages ?? options.num ?? 1, "num images", {
      max: 4,
      min: 1,
    })
  );

  let outputPath: string;
  try {
    const rawOutput = firstText(options.output, stdinData?.output);
    outputPath = hasText(rawOutput)
      ? validateOutputPath(rawOutput)
      : generateFilename();
  } catch (error) {
    handleError(error, "INVALID_OUTPUT_PATH", emitOpts.format);
  }

  const modelConfig = MODELS[modelId];
  if (!modelConfig) {
    emitError(
      {
        code: "UNKNOWN_MODEL",
        details: { available: GENERATION_MODELS },
        message: `Unknown model: ${modelId}`,
      },
      emitOpts.format
    );
    exitForErrorCode("UNKNOWN_MODEL");
  }

  const editPaths = resolveEditPaths(
    options.edit ?? stdinData?.editImages,
    modelConfig,
    emitOpts.format
  );

  const cost = estimateCost(modelId, resolution, numImages);

  // Resolve new advanced generation params from CLI flags + stdin
  const seed = validateOption(emitOpts.format, () =>
    options.seed !== undefined || stdinData?.seed !== undefined
      ? parseIntegerOption(options.seed ?? stdinData?.seed ?? 0, "seed")
      : undefined
  );
  const negativePrompt = firstText(options.negative, stdinData?.negativePrompt);
  const style = firstText(options.style, stdinData?.style);
  const outputFormat = validateOption(emitOpts.format, () =>
    hasText(options.outputFormat) || hasText(stdinData?.outputFormat)
      ? validateEnumOption(
          options.outputFormat ?? stdinData?.outputFormat ?? "",
          OUTPUT_FORMATS,
          "output format"
        )
      : undefined
  );
  const background = validateOption(emitOpts.format, () =>
    hasText(options.background) || hasText(stdinData?.background)
      ? validateEnumOption(
          options.background ?? stdinData?.background ?? "",
          BACKGROUND_MODES,
          "background"
        )
      : undefined
  );
  const quality = validateOption(emitOpts.format, () =>
    hasText(options.quality) || hasText(stdinData?.quality)
      ? validateEnumOption(
          options.quality ?? stdinData?.quality ?? "",
          QUALITY_LEVELS,
          "quality"
        )
      : undefined
  );
  if (
    outputFormat &&
    modelConfig.supportedOutputFormats &&
    !modelConfig.supportedOutputFormats.includes(outputFormat)
  ) {
    handleError(
      new Error(
        `${modelConfig.name} supports output formats: ${modelConfig.supportedOutputFormats.join(", ")}`
      ),
      "INVALID_OPTION",
      emitOpts.format
    );
  }
  const safetyTolerance = validateOption(emitOpts.format, () =>
    hasText(options.safety) || hasText(stdinData?.safetyTolerance)
      ? validateEnumOption(
          options.safety ?? stdinData?.safetyTolerance ?? "",
          SAFETY_LEVELS,
          "safety tolerance"
        )
      : undefined
  );
  const enableWebSearch = options.webSearch ?? stdinData?.enableWebSearch;
  const enableGoogleSearch =
    options.googleSearch ?? stdinData?.enableGoogleSearch;
  const enableSafetyChecker =
    options.disableSafetyChecker === true
      ? false
      : (options.safetyChecker ?? stdinData?.enableSafetyChecker);
  const syncMode = options.syncMode ?? stdinData?.syncMode;
  const creative = resolveCreativeDirection(options, stdinData?.creative);
  const creativeResult = creative
    ? validateOption(emitOpts.format, () => enrichPrompt({ creative, prompt }))
    : undefined;
  const requestPrompt = creativeResult?.prompt ?? prompt;
  const imageSize = validateOption(emitOpts.format, () =>
    parseImageSizeOption(options.imageSize ?? stdinData?.imageSize)
  );
  const maskImageUrl = options.mask ?? stdinData?.maskImageUrl;
  const limitGenerations =
    options.disableLimitGenerations === true
      ? false
      : (options.limitGenerations ?? stdinData?.limitGenerations);
  const imagePromptStrength = validateOption(emitOpts.format, () =>
    options.imagePromptStrength !== undefined ||
    stdinData?.imagePromptStrength !== undefined
      ? parseNumberOption(
          options.imagePromptStrength ?? stdinData?.imagePromptStrength ?? 0,
          "image prompt strength",
          { max: 1, min: 0 }
        )
      : undefined
  );
  const thinkingLevel = validateOption(emitOpts.format, () =>
    hasText(options.thinking) || hasText(stdinData?.thinkingLevel)
      ? validateEnumOption(
          options.thinking ?? stdinData?.thinkingLevel ?? "",
          THINKING_LEVELS,
          "thinking level"
        )
      : undefined
  );
  const guidanceScale = validateOption(emitOpts.format, () =>
    options.guidanceScale !== undefined ||
    stdinData?.guidanceScale !== undefined
      ? parseNumberOption(
          options.guidanceScale ?? stdinData?.guidanceScale ?? 0,
          "guidance scale",
          { max: 20, min: 1 }
        )
      : undefined
  );
  const numInferenceSteps = validateOption(emitOpts.format, () =>
    options.steps !== undefined || stdinData?.numInferenceSteps !== undefined
      ? parseIntegerOption(
          options.steps ?? stdinData?.numInferenceSteps ?? 0,
          "inference steps",
          { max: 12, min: 1 }
        )
      : undefined
  );
  const raw = options.raw ?? stdinData?.raw;
  const enhancePrompt = options.enhancePrompt ?? stdinData?.enhancePrompt;
  const renderingSpeed = validateOption(emitOpts.format, () =>
    hasText(options.renderingSpeed) || hasText(stdinData?.renderingSpeed)
      ? validateEnumOption(
          options.renderingSpeed ?? stdinData?.renderingSpeed ?? "",
          RENDERING_SPEEDS,
          "rendering speed"
        )
      : undefined
  );
  const expandPrompt = options.expandPrompt ?? stdinData?.expandPrompt;
  const ephemeral = options.ephemeral ?? stdinData?.ephemeral;
  const dryRunGenerateOptions: GenerateOptions = {
    aspect,
    background,
    creative,
    editImageUrls: editPaths,
    enableGoogleSearch,
    enableSafetyChecker,
    enableWebSearch,
    enhancePrompt,
    ephemeral,
    expandPrompt,
    guidanceScale,
    imagePromptStrength,
    imageSize,
    inputFidelity: options.loose === true ? "low" : stdinData?.inputFidelity,
    limitGenerations,
    maskImageUrl,
    model: modelId,
    negativePrompt,
    numImages,
    numInferenceSteps,
    outputFormat,
    prompt,
    quality,
    raw,
    renderingSpeed,
    resolution,
    safetyTolerance,
    seed,
    style,
    syncMode,
    thinkingLevel,
    transparent: options.transparent ?? stdinData?.transparent,
  };
  const requestPreview = validateOption(emitOpts.format, () =>
    buildGenerateBody(dryRunGenerateOptions)
  );

  // -- Dry run --
  if (options.dryRun === true) {
    const dryResult = {
      dryRun: true,
      command: "generate",
      prompt: requestPrompt,
      ...(creativeResult && {
        basePrompt: creativeResult.basePrompt,
        creative: creativeResult.creative,
      }),
      model: modelId,
      modelName: modelConfig.name,
      aspect,
      resolution,
      numImages,
      output: outputPath,
      editImages: editPaths,
      transparent: options.transparent ?? stdinData?.transparent,
      inputFidelity: options.loose === true ? "low" : stdinData?.inputFidelity,
      endpoint: requestPreview.endpoint,
      body: requestPreview.body,
      ephemeral,
      historyRecorded: ephemeral !== true,
      storeIo: ephemeral !== true,
      // New fields — only include when set
      ...(seed !== undefined && { seed }),
      ...(hasText(background) && { background }),
      ...(hasText(quality) && { quality }),
      ...(hasText(negativePrompt) && { negativePrompt }),
      ...(hasText(style) && { style }),
      ...(hasText(outputFormat) && { outputFormat }),
      ...(hasText(safetyTolerance) && { safetyTolerance }),
      ...(enableWebSearch === true && { enableWebSearch }),
      ...(enableGoogleSearch === true && { enableGoogleSearch }),
      ...(enableSafetyChecker !== undefined && { enableSafetyChecker }),
      ...(syncMode === true && { syncMode }),
      ...(imageSize !== undefined && { imageSize }),
      ...(imagePromptStrength !== undefined && { imagePromptStrength }),
      ...(hasText(maskImageUrl) && { maskImageUrl }),
      ...(limitGenerations !== undefined && { limitGenerations }),
      ...(hasText(thinkingLevel) && { thinkingLevel }),
      ...(guidanceScale !== undefined && { guidanceScale }),
      ...(numInferenceSteps !== undefined && { numInferenceSteps }),
      ...(raw === true && { raw }),
      ...(enhancePrompt === true && { enhancePrompt }),
      ...(hasText(renderingSpeed) && { renderingSpeed }),
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
      if (ephemeral === true) {
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
        `Aspect: ${aspect} | Resolution: ${modelConfig.supportsResolution ? resolution : "N/A"}`
      );
    }
    console.log(
      `Prompt: ${chalk.dim(requestPrompt.slice(0, 80))}${requestPrompt.length > 80 ? "..." : ""}`
    );
    console.log(`Est. cost: ${chalk.yellow(`$${cost.toFixed(3)}`)}`);
    if (ephemeral === true) {
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
      aspect,
      background,
      creative,
      editImages: editPaths,
      enableGoogleSearch,
      enableSafetyChecker,
      enableWebSearch,
      enhancePrompt,
      ephemeral,
      expandPrompt,
      guidanceScale,
      imagePromptStrength,
      imageSize,
      inputFidelity: options.loose === true ? "low" : stdinData?.inputFidelity,
      limitGenerations,
      maskImageUrl,
      model: modelId,
      negativePrompt,
      numImages,
      numInferenceSteps,
      outputFormat,
      prompt,
      quality,
      raw,
      renderingSpeed,
      resolution,
      safetyTolerance,
      seed,
      style,
      syncMode,
      thinkingLevel,
      transparent: options.transparent ?? stdinData?.transparent,
    });

    spinner?.succeed("Generated!");

    const saved = await saveGeneratedImages(
      result.images,
      outputPath,
      numImages,
      { aspect, editPaths, model: modelId, prompt: requestPrompt, resolution },
      config,
      emitOpts,
      options.noOpen === true || stdinData?.noOpen === true,
      ephemeral !== true
    );

    let payloadsDeleted = false;
    let payloadDeleteError: string | undefined;
    if (ephemeral === true) {
      if (hasText(result.requestId)) {
        try {
          await deletePayloads(result.requestId);
          payloadsDeleted = true;
        } catch (error) {
          payloadDeleteError =
            error instanceof Error ? error.message : String(error);
          if (!isStructured(emitOpts.format)) {
            console.warn(
              chalk.yellow(
                `Warning: saved locally, but fal payload deletion failed: ${payloadDeleteError}`
              )
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
          ...(ephemeral === true && {
            payloadsDeleted,
            requestId: result.requestId,
            storeIo: false,
          }),
          ...(hasText(payloadDeleteError) && { payloadDeleteError }),
          prompt: requestPrompt,
          ...(creativeResult && {
            basePrompt: creativeResult.basePrompt,
            creative: creativeResult.creative,
          }),
          model: modelId,
          modelName: modelConfig.name,
          aspect,
          resolution,
          numImages,
        },
        emitOpts
      );
    }
  } catch (error) {
    spinner?.fail("Generation failed");
    handleError(error, "GENERATION_FAILED", emitOpts.format);
  }
}
