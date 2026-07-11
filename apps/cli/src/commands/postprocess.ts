/**
 * Post-processing commands operating on the last generation (or a given path):
 * vary (variations), upscale, and background removal.
 */

import { basename, resolve } from "node:path";

import type { AspectRatio, Resolution } from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";

import { removeBackground, upscale } from "../api/fal";
import type { CliOptions, StdinPayload } from "../utils/cli-types";
import {
  addGeneration,
  generateId,
  getLastGeneration,
  loadConfig,
} from "../utils/config";
import {
  exitForErrorCode,
  handleError,
  validateOption,
  validateOutput,
} from "../utils/errors";
import {
  downloadImage,
  getFileSize,
  getImageDimensions,
  imageToDataUrl,
  openImage,
} from "../utils/image";
import {
  parseIntegerOption,
  validateEditPath,
  validateEnumOption,
  validateOutputPath,
} from "../utils/input";
import { emit, emitError, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { generateImage } from "./generate";

// -- Constants --

/** Regex to match image file extensions for upscale output naming */
const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|webp)$/i;
const SCALE_FACTORS = ["2", "4", "6", "8"] as const;

function derivedOutputPath(sourcePath: string, suffix: string): string {
  const preferred = sourcePath.replace(IMAGE_EXT_REGEX, `${suffix}.png`);
  try {
    return validateOutputPath(preferred);
  } catch {
    const name = basename(sourcePath).replace(IMAGE_EXT_REGEX, "") || "motif";
    return validateOutputPath(`${name}${suffix}.png`);
  }
}

export async function generateVariations(
  customPrompt: string | undefined,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions
): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message: "No previous generation to create variations of",
      },
      emitOpts.format
    );
    exitForErrorCode("NO_PREVIOUS");
  }

  const prompt = customPrompt || stdinData?.prompt || last.prompt;
  const numImages = validateOption(emitOpts.format, () =>
    parseIntegerOption(stdinData?.numImages ?? options.num ?? 4, "num images", {
      max: 4,
      min: 1,
    })
  );

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nGenerating variations..."));
    console.log(`Base: ${chalk.dim(last.prompt.slice(0, 50))}...`);
  }

  await generateImage(
    prompt,
    {
      ...options,
      aspect: options.aspect || stdinData?.aspect || last.aspect,
      model: options.model || stdinData?.model || last.model,
      num: String(numImages),
      resolution:
        options.resolution || stdinData?.resolution || last.resolution,
    },
    null, // Don't pass stdinData again (already merged into options)
    config,
    emitOpts
  );
}

export async function upscaleLast(
  imagePath: string | undefined,
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions
): Promise<void> {
  let sourceImagePath: string;
  let sourcePrompt = "[upscale]";
  let sourceAspect: AspectRatio = "1:1";
  let sourceResolution: Resolution = "1K";

  const resolvedPath = imagePath || stdinData?.imagePath;

  if (resolvedPath) {
    try {
      sourceImagePath = validateEditPath(resolvedPath);
    } catch (error) {
      handleError(error, "INVALID_IMAGE_PATH", emitOpts.format);
    }
  } else {
    const last = await getLastGeneration();
    if (!last) {
      emitError(
        { code: "NO_PREVIOUS", message: "No previous generation to upscale" },
        emitOpts.format
      );
      exitForErrorCode("NO_PREVIOUS");
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
        "scale factor"
      )
    )
  );
  const rawOutput = options.output || stdinData?.output;
  const outputPath = rawOutput
    ? validateOutput(emitOpts.format, rawOutput)
    : derivedOutputPath(sourceImagePath, `-up${scaleFactor}x`);

  // -- Dry run --
  if (options.dryRun) {
    const dryResult = {
      command: "upscale",
      dryRun: true,
      estimatedCost: 0.02,
      model: config.upscaler,
      output: outputPath,
      scale: scaleFactor,
      source: sourceImagePath,
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
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`
          )
      );
    }

    await addGeneration({
      aspect: sourceAspect,
      cost: 0.02,
      editedFrom: sourceImagePath,
      id: generateId(),
      model: config.upscaler,
      output: resolve(actualOutputPath),
      prompt: `[upscale ${scaleFactor}x] ${sourcePrompt}`,
      resolution: sourceResolution,
      timestamp: new Date().toISOString(),
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "upscale",
          cost: 0.02,
          height: dims?.height,
          model: config.upscaler,
          path: resolve(actualOutputPath),
          scale: scaleFactor,
          size,
          source: sourceImagePath,
          width: dims?.width,
        },
        emitOpts
      );
    }

    if (config.openAfterGenerate && !options.noOpen && !stdinData?.noOpen) {
      await openImage(actualOutputPath);
    }
  } catch (error) {
    spinner?.fail("Upscale failed");
    handleError(error, "UPSCALE_FAILED", emitOpts.format);
  }
}

export async function removeBackgroundLast(
  options: CliOptions,
  stdinData: StdinPayload | null,
  config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions
): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    emitError(
      {
        code: "NO_PREVIOUS",
        message: "No previous generation to remove background from",
      },
      emitOpts.format
    );
    exitForErrorCode("NO_PREVIOUS");
  }

  const rawOutput = options.output || stdinData?.output;
  const outputPath = rawOutput
    ? validateOutput(emitOpts.format, rawOutput)
    : derivedOutputPath(last.output, "-nobg");

  // -- Dry run --
  if (options.dryRun) {
    const dryResult = {
      command: "rmbg",
      dryRun: true,
      estimatedCost: 0.02,
      model: config.backgroundRemover,
      output: outputPath,
      source: last.output,
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
            ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`
          )
      );
    }

    await addGeneration({
      aspect: last.aspect,
      cost: 0.02,
      editedFrom: last.output,
      id: generateId(),
      model: config.backgroundRemover,
      output: resolve(actualOutputPath),
      prompt: `[rmbg] ${last.prompt}`,
      resolution: last.resolution,
      timestamp: new Date().toISOString(),
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "rmbg",
          cost: 0.02,
          height: dims?.height,
          model: config.backgroundRemover,
          path: resolve(actualOutputPath),
          size,
          source: last.output,
          width: dims?.width,
        },
        emitOpts
      );
    }

    if (config.openAfterGenerate && !options.noOpen && !stdinData?.noOpen) {
      await openImage(actualOutputPath);
    }
  } catch (error) {
    spinner?.fail("Background removal failed");
    handleError(error, "RMBG_FAILED", emitOpts.format);
  }
}
