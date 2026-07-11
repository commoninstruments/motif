import { resolve } from "node:path";

import {
  buildFalToolRequest,
  FAL_TOOL_IDS,
  FAL_TOOLS,
  FAL_TOOLS_CHECKED_AT,
  isFalToolId,
} from "@howells/motif-sdk";
import type { FalToolRequest } from "@howells/motif-sdk";
import chalk from "chalk";
import { Command } from "commander";

import { runTool } from "../api/fal";
import { handleError } from "../utils/errors";
import { downloadImage, getFileSize } from "../utils/image";
import {
  parseIntegerOption,
  parseNumberOption,
  validateOutputPath,
  validateResourceId,
} from "../utils/input";
import { emit, isStructured, resolveFormat } from "../utils/output";
import type { EmitOptions, OutputFormat } from "../utils/output";

interface ToolOptions {
  applyMask?: boolean;
  backgroundColor?: string;
  coarse?: boolean;
  codec?: string;
  cropToBbox?: boolean;
  detectionThreshold?: string;
  dryRun?: boolean;
  ensembleSize?: string;
  fields?: string;
  format?: string;
  h264?: boolean;
  includeBoxes?: boolean;
  includeScores?: boolean;
  input?: string;
  inputs?: string[];
  json?: string;
  maskOnly?: boolean;
  maxMasks?: string;
  minMaskRegionArea?: string;
  model?: string;
  numInferenceSteps?: string;
  operatingResolution?: string;
  option?: string[];
  output?: string;
  outputFormat?: string;
  pointsPerSide?: string;
  predIouThresh?: string;
  preserveAudio?: boolean;
  prompt?: string;
  providerOptions?: Record<string, unknown>;
  returnMultipleMasks?: boolean;
  scale?: string;
  stabilityScoreThresh?: string;
  targetFps?: string;
  videoOutputType?: string;
}

function emitOptsFromArgs(args: string[]): EmitOptions {
  const format = resolveFormat(
    args.find((a) => a.startsWith("--format="))?.split("=")?.[1] ??
      (args.includes("--format")
        ? args[args.indexOf("--format") + 1]
        : undefined)
  );
  const fields =
    args.find((a) => a.startsWith("--fields="))?.split("=")?.[1] ??
    (args.includes("--fields")
      ? args[args.indexOf("--fields") + 1]
      : undefined);

  return { fields, format, sanitize: true };
}

function stripGlobalFlags(args: string[]): string[] {
  return args.filter((arg, index) => {
    if (arg === "--format" || arg === "--fields") {
      return false;
    }
    if (
      index > 0 &&
      (args[index - 1] === "--format" || args[index - 1] === "--fields")
    ) {
      return false;
    }
    if (arg.startsWith("--format=") || arg.startsWith("--fields=")) {
      return false;
    }
    return true;
  });
}

function parseOptionValue(value: string): unknown {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseOptionPairs(
  values: string[] | undefined
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const pair of values ?? []) {
    const index = pair.indexOf("=");
    if (index === -1) {
      throw new Error(`tool option must be key=value: ${pair}`);
    }
    const key = pair.slice(0, index).trim();
    if (!key) {
      throw new Error(`tool option key is empty: ${pair}`);
    }
    result[key] = parseOptionValue(pair.slice(index + 1).trim());
  }
  return result;
}

function parseJsonOptions(value: string | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--json must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function buildOptions(
  options: ToolOptions,
  format: OutputFormat
): Record<string, unknown> {
  try {
    return {
      ...parseJsonOptions(options.json),
      ...parseOptionPairs(options.option),
      ...options.providerOptions,
      ...(options.prompt ? { prompt: options.prompt } : {}),
      ...(options.outputFormat ? { output_format: options.outputFormat } : {}),
      ...(options.operatingResolution
        ? { operating_resolution: options.operatingResolution }
        : {}),
      ...(options.applyMask === undefined
        ? {}
        : { apply_mask: options.applyMask }),
      ...(options.cropToBbox === undefined
        ? {}
        : { crop_to_bbox: options.cropToBbox }),
      ...(options.coarse === undefined ? {} : { coarse: options.coarse }),
      ...(options.maskOnly === undefined
        ? {}
        : { mask_only: options.maskOnly }),
      ...(options.returnMultipleMasks ? { return_multiple_masks: true } : {}),
      ...(options.includeScores ? { include_scores: true } : {}),
      ...(options.includeBoxes ? { include_boxes: true } : {}),
      ...(options.maxMasks
        ? {
            max_masks: parseIntegerOption(options.maxMasks, "max masks", {
              max: 50,
              min: 1,
            }),
          }
        : {}),
      ...(options.scale
        ? {
            upscale_factor: parseNumberOption(options.scale, "scale", {
              max: 8,
              min: 1,
            }),
          }
        : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.backgroundColor
        ? { background_color: options.backgroundColor }
        : {}),
      ...(options.codec ? { output_container_and_codec: options.codec } : {}),
      ...(options.preserveAudio === undefined
        ? {}
        : { preserve_audio: options.preserveAudio }),
      ...(options.detectionThreshold
        ? {
            detection_threshold: parseNumberOption(
              options.detectionThreshold,
              "detection threshold",
              { max: 1, min: 0 }
            ),
          }
        : {}),
      ...(options.pointsPerSide
        ? {
            points_per_side: parseIntegerOption(
              options.pointsPerSide,
              "points per side",
              { min: 1 }
            ),
          }
        : {}),
      ...(options.predIouThresh
        ? {
            pred_iou_thresh: parseNumberOption(
              options.predIouThresh,
              "predicted IOU threshold",
              { max: 1, min: 0 }
            ),
          }
        : {}),
      ...(options.stabilityScoreThresh
        ? {
            stability_score_thresh: parseNumberOption(
              options.stabilityScoreThresh,
              "stability score threshold",
              { max: 1, min: 0 }
            ),
          }
        : {}),
      ...(options.minMaskRegionArea
        ? {
            min_mask_region_area: parseIntegerOption(
              options.minMaskRegionArea,
              "minimum mask region area",
              { min: 0 }
            ),
          }
        : {}),
      ...(options.numInferenceSteps
        ? {
            num_inference_steps: parseIntegerOption(
              options.numInferenceSteps,
              "number of inference steps",
              { min: 1 }
            ),
          }
        : {}),
      ...(options.ensembleSize
        ? {
            ensemble_size: parseIntegerOption(
              options.ensembleSize,
              "ensemble size",
              { min: 2 }
            ),
          }
        : {}),
      ...(options.targetFps
        ? {
            target_fps: parseIntegerOption(options.targetFps, "target FPS", {
              min: 1,
            }),
          }
        : {}),
      ...(options.h264 ? { H264_output: true } : {}),
      ...(options.videoOutputType
        ? { video_output_type: options.videoOutputType }
        : {}),
    };
  } catch (error) {
    handleError(error, "INVALID_OPTION", format);
  }
}

function primaryUrl(
  result: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = result[key];
    if (typeof value === "string" && value.startsWith("https://")) {
      return value;
    }
    if (value && typeof value === "object" && "url" in value) {
      const { url } = value;
      if (typeof url === "string") {
        return url;
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "url" in item) {
          const { url } = item as { url?: unknown };
          if (typeof url === "string") {
            return url;
          }
        }
      }
    }
  }
  return undefined;
}

function listTools(emitOpts: EmitOptions): void {
  emit(
    {
      checkedAt: FAL_TOOLS_CHECKED_AT,
      command: "tool.list",
      tools: Object.fromEntries(
        FAL_TOOL_IDS.map((id) => [
          id,
          {
            category: FAL_TOOLS[id].category,
            endpoint: FAL_TOOLS[id].endpoint,
            inputKind: FAL_TOOLS[id].inputKind,
            name: FAL_TOOLS[id].name,
            pricing: FAL_TOOLS[id].pricing,
            task: FAL_TOOLS[id].task,
          },
        ])
      ),
    },
    emitOpts
  );

  if (!isStructured(emitOpts.format)) {
    console.log(chalk.bold("\nFal tools\n"));
    for (const id of FAL_TOOL_IDS) {
      const tool = FAL_TOOLS[id];
      console.log(
        `${chalk.green(id)}  ${tool.name}  ${chalk.dim(tool.pricing)}`
      );
    }
  }
}

function describeTool(toolId: string | undefined, emitOpts: EmitOptions): void {
  if (!toolId) {
    listTools(emitOpts);
    return;
  }
  if (!isFalToolId(toolId)) {
    handleError(
      new Error(`Unknown fal tool: ${toolId}`),
      "UNKNOWN_TOOL",
      emitOpts.format
    );
  }
  emit(
    {
      checkedAt: FAL_TOOLS_CHECKED_AT,
      command: "tool.describe",
      id: toolId,
      ...FAL_TOOLS[toolId],
    },
    emitOpts
  );
}

async function runFalTool(
  toolId: string,
  input: string | undefined,
  options: ToolOptions,
  emitOpts: EmitOptions
): Promise<void> {
  try {
    validateResourceId(toolId, "tool");
  } catch (error) {
    handleError(error, "INVALID_TOOL_ID", emitOpts.format);
  }
  if (!isFalToolId(toolId)) {
    handleError(
      new Error(`Unknown fal tool: ${toolId}`),
      "UNKNOWN_TOOL",
      emitOpts.format
    );
  }

  const inputs = options.inputs?.length
    ? options.inputs
    : input
      ? [input]
      : undefined;
  const requestOptions = buildOptions(options, emitOpts.format);
  let request: FalToolRequest;
  try {
    request = buildFalToolRequest({
      input: inputs?.[0],
      inputs,
      options: requestOptions,
      tool: toolId,
    });
  } catch (error) {
    handleError(error, "INVALID_OPTION", emitOpts.format);
  }

  if (options.dryRun) {
    emit(
      {
        body: request.body,
        command: "tool.run",
        dryRun: true,
        endpoint: request.endpoint,
        pricing: request.tool.pricing,
        tool: toolId,
        toolName: request.tool.name,
        valid: true,
      },
      emitOpts
    );
    return;
  }

  try {
    const result = await runTool({
      input: inputs?.[0],
      inputs,
      options: requestOptions,
      tool: toolId,
    });
    let saved: { path: string; size: string } | undefined;
    if (options.output) {
      const outputPath = validateOutputPath(options.output);
      const url = primaryUrl(result, request.tool.outputKeys);
      if (!url) {
        throw new Error(`No downloadable output found for ${toolId}`);
      }
      const actualOutputPath = await downloadImage(url, outputPath);
      saved = {
        path: resolve(actualOutputPath),
        size: getFileSize(actualOutputPath),
      };
    }
    emit(
      {
        command: "tool.run",
        endpoint: request.endpoint,
        result,
        tool: toolId,
        toolName: request.tool.name,
        ...(saved ? { saved } : {}),
      },
      emitOpts
    );
  } catch (error) {
    handleError(error, "TOOL_FAILED", emitOpts.format);
  }
}

export interface ToolStdinPayload extends ToolOptions {
  command?: "tool" | "tool-describe" | "tool-list" | "tool-run";
  options?: Record<string, unknown>;
  tool?: string;
}

export async function runToolPayload(
  payload: ToolStdinPayload,
  emitOpts: EmitOptions
): Promise<void> {
  if (payload.command === "tool-list") {
    listTools(emitOpts);
    return;
  }

  if (payload.command === "tool-describe") {
    describeTool(payload.tool, emitOpts);
    return;
  }

  if (!payload.tool) {
    listTools(emitOpts);
    return;
  }

  await runFalTool(
    payload.tool,
    payload.input,
    { ...payload, providerOptions: payload.options },
    emitOpts
  );
}

export async function runTools(args: string[]): Promise<void> {
  const emitOpts = emitOptsFromArgs(args);
  const filteredArgs = stripGlobalFlags(args);
  if (
    filteredArgs.length > 0 &&
    !["describe", "list", "run"].includes(filteredArgs[0] ?? "")
  ) {
    filteredArgs.unshift("run");
  }

  const program = new Command()
    .name("motif tool")
    .description("Run fal.ai utility tools");

  program
    .command("list")
    .description("List supported fal tools")
    .action(() => {
      listTools(emitOpts);
    });

  program
    .command("describe [tool]")
    .description("Describe a fal tool")
    .action((tool?: string) => {
      describeTool(tool, emitOpts);
    });

  program
    .command("run <tool> [input]")
    .description("Run a fal tool against image/video input")
    .option("--dry-run", "Validate and print request body without an API call")
    .option("-i, --input <url-or-path>", "Input media URL or local path")
    .option("--inputs <items...>", "Multiple input images for batch tools")
    .option("-o, --output <file>", "Download primary output to this file")
    .option("--prompt <text>", "Prompt for segmentation/reconstruction tools")
    .option("--output-format <format>", "Output format, e.g. jpeg, png, webp")
    .option(
      "--operating-resolution <size>",
      "Operating resolution where supported"
    )
    .option("--apply-mask", "Apply mask overlay where supported")
    .option("--no-apply-mask", "Do not apply mask overlay where supported")
    .option(
      "--crop-to-bbox",
      "Crop output to detected foreground box where supported"
    )
    .option(
      "--no-crop-to-bbox",
      "Do not crop output to detected foreground box"
    )
    .option("--coarse", "Use coarse preprocessing where supported")
    .option("--no-coarse", "Disable coarse preprocessing where supported")
    .option("--mask-only", "Return only the mask where supported")
    .option("--no-mask-only", "Return full output rather than mask-only output")
    .option("--return-multiple-masks", "Return multiple masks where supported")
    .option("--include-scores", "Return confidence scores where supported")
    .option("--include-boxes", "Return boxes where supported")
    .option("--max-masks <n>", "Maximum masks to return")
    .option("--scale <n>", "Upscale factor")
    .option("--model <name>", "Provider-specific model/mode")
    .option(
      "--background-color <color>",
      "Background color for video background removal"
    )
    .option(
      "--codec <codec>",
      "Output container/codec for video background removal"
    )
    .option("--preserve-audio", "Preserve audio where supported")
    .option("--no-preserve-audio", "Do not preserve audio where supported")
    .option("--detection-threshold <n>", "Detection threshold 0-1")
    .option(
      "--points-per-side <n>",
      "SAM2 automatic segmentation sample density"
    )
    .option("--pred-iou-thresh <n>", "SAM2 predicted IOU threshold")
    .option("--stability-score-thresh <n>", "SAM2 stability score threshold")
    .option("--min-mask-region-area <n>", "SAM2 minimum mask area")
    .option(
      "--num-inference-steps <n>",
      "Diffusion/preprocessor inference steps"
    )
    .option("--ensemble-size <n>", "Depth ensemble size where supported")
    .option("--target-fps <n>", "Target FPS for video tools")
    .option("--h264", "Request H264 output where supported")
    .option("--video-output-type <type>", "SAM video output type")
    .option("--json <object>", "Raw JSON options merged into the fal request")
    .option(
      "--option <key=value>",
      "Raw option pair; repeatable",
      (value, previous: string[] = []) => [...previous, value]
    )
    .action(
      async (
        tool: string,
        positionalInput: string | undefined,
        options: ToolOptions
      ) => {
        await runFalTool(
          tool,
          options.input ?? positionalInput,
          options,
          emitOpts
        );
      }
    );

  if (filteredArgs.length === 0) {
    listTools(emitOpts);
    return;
  }

  await program.parseAsync(["node", "motif-tool", ...filteredArgs]);
}
