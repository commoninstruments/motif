/**
 * video command — generate a video from an image (or the last generation)
 * using Kling v3 Pro via fal, polling until the job completes.
 */

import { resolve } from "node:path";

import { estimateVideoCost } from "@howells/motif-sdk";
import chalk from "chalk";
import ora from "ora";

import { submitVideo, waitForVideo } from "../api/fal";
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
import { downloadImage, getFileSize } from "../utils/image";
import {
  parseIntegerOption,
  parseNumberOption,
  validateEditPath,
} from "../utils/input";
import { emit, emitError, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";

export async function generateVideo(
  imagePath: string | undefined,
  options: CliOptions,
  stdinData: StdinPayload | null,
  _config: Awaited<ReturnType<typeof loadConfig>>,
  emitOpts: EmitOptions
): Promise<void> {
  // Resolve source image
  const resolvedPath = imagePath || stdinData?.imagePath;
  let sourceImagePath: string;

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
        {
          code: "NO_PREVIOUS",
          message:
            "No previous generation. Provide an image path: motif --video image.png",
        },
        emitOpts.format
      );
      exitForErrorCode("NO_PREVIOUS");
    }
    sourceImagePath = last.output;
  }

  const prompt =
    stdinData?.prompt || "cinematic motion, smooth camera movement";
  const duration = validateOption(emitOpts.format, () =>
    parseIntegerOption(
      stdinData?.duration ?? options.videoDuration ?? 5,
      "video duration",
      { max: 15, min: 3 }
    )
  );
  const generateAudio = stdinData?.generateAudio ?? !options.videoNoAudio;

  const cost = estimateVideoCost(duration, generateAudio);
  const rawOutput = options.output || stdinData?.output;
  const outputPath = rawOutput
    ? validateOutput(emitOpts.format, rawOutput)
    : `motif-video-${new Date().toISOString().slice(0, 19).replaceAll(/[-:T]/g, "")}.mp4`;

  // -- Dry run --
  if (options.dryRun) {
    const dryResult = {
      command: "video",
      dryRun: true,
      duration,
      estimatedCost: cost,
      generateAudio,
      model: "kling",
      output: resolve(outputPath),
      prompt,
      source: sourceImagePath,
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
      `Duration: ${duration}s | Audio: ${generateAudio ? "yes" : "no"}`
    );
    console.log(`Est. cost: ${chalk.yellow(`$${cost.toFixed(2)}`)}`);
  }

  const spinner = isStructured(emitOpts.format)
    ? null
    : ora("Submitting video job...").start();

  try {
    const job = await submitVideo({
      duration,
      generateAudio,
      imageUrl: sourceImagePath,
      prompt,
      ...(stdinData?.videoNegativePrompt && {
        negativePrompt: stdinData.videoNegativePrompt,
      }),
      ...(options.videoNegative && {
        negativePrompt: options.videoNegative,
      }),
      ...(stdinData?.videoCfgScale !== undefined && {
        cfgScale: validateOption(emitOpts.format, () =>
          parseNumberOption(stdinData.videoCfgScale ?? 0, "video CFG scale", {
            max: 1,
            min: 0,
          })
        ),
      }),
      ...(options.videoCfgScale !== undefined && {
        cfgScale: validateOption(emitOpts.format, () =>
          parseNumberOption(options.videoCfgScale ?? 0, "video CFG scale", {
            max: 1,
            min: 0,
          })
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
      }
    );

    spinner?.succeed("Video generated!");

    // Download the video
    const actualOutputPath = await downloadImage(video.url, outputPath);

    const fileSize = getFileSize(actualOutputPath);

    if (!isStructured(emitOpts.format)) {
      console.log(
        chalk.green(`✓ Saved: ${actualOutputPath}`) +
          chalk.dim(` (${duration}s, ${fileSize})`)
      );
    }

    // Record in history
    await addGeneration({
      aspect: "1:1",
      cost,
      editedFrom: sourceImagePath,
      id: generateId(),
      model: "kling",
      output: resolve(actualOutputPath),
      prompt: `[video ${duration}s] ${prompt}`,
      resolution: "1K",
      timestamp: new Date().toISOString(),
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "video",
          cost,
          duration,
          generateAudio,
          model: "kling",
          path: resolve(actualOutputPath),
          prompt,
          size: fileSize,
          source: sourceImagePath,
        },
        emitOpts
      );
    }
  } catch (error) {
    spinner?.fail("Video generation failed");
    handleError(error, "VIDEO_FAILED", emitOpts.format);
  }
}
