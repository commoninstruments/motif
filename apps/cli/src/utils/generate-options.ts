/**
 * Option resolution for the generate command: preset/aspect/resolution,
 * edit-reference paths, image-size parsing, and the enum option tables.
 * Extracted from cli.ts so the generate command module stays focused.
 */

import { ASPECT_RATIOS, RESOLUTIONS } from "@howells/motif-sdk";
import type { AspectRatio, ImageSize, Resolution } from "@howells/motif-sdk";

import type { CliOptions, StdinPayload } from "./cli-types";
import { exitForErrorCode, handleError } from "./errors";
import { validateEditPath, validateEnumOption } from "./input";
import { emitError } from "./output";
import type { OutputFormat } from "./output";
import { hasText } from "./text";

// -- Constants --

export const OUTPUT_FORMATS = ["jpeg", "png", "webp"] as const;
export const BACKGROUND_MODES = ["auto", "transparent", "opaque"] as const;
export const QUALITY_LEVELS = ["auto", "low", "medium", "high"] as const;
export const SAFETY_LEVELS = ["1", "2", "3", "4", "5", "6"] as const;
export const THINKING_LEVELS = ["minimal", "high"] as const;
export const RENDERING_SPEEDS = ["TURBO", "BALANCED", "QUALITY"] as const;
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

/** Narrow a raw string to a known preset image-size keyword. */
function isImageSizeString(
  value: string
): value is (typeof IMAGE_SIZE_STRINGS)[number] {
  return (IMAGE_SIZE_STRINGS as readonly string[]).includes(value);
}

export function parseImageSizeOption(
  value: StdinPayload["imageSize"] | string | undefined
): ImageSize | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    const { height, width } = value;
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      throw new TypeError("image size width and height must be integers");
    }
    if (width <= 0 || height <= 0) {
      throw new Error("image size width and height must be positive");
    }
    return { height, width };
  }

  if (isImageSizeString(value)) {
    return value;
  }

  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) {
    throw new Error(
      `image size must be one of ${IMAGE_SIZE_STRINGS.join(", ")} or WIDTHxHEIGHT: ${JSON.stringify(value)}`
    );
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) {
    throw new Error("image size width and height must be positive");
  }
  return { height, width };
}

export function resolvePreset(
  options: CliOptions,
  stdinPreset: string | undefined,
  stdinAspect: string | undefined,
  stdinResolution: string | undefined,
  defaultAspect: AspectRatio,
  defaultResolution: Resolution
): { aspect: AspectRatio; resolution: Resolution } {
  const PRESET_FLAGS = [
    "cover",
    "story",
    "reel",
    "feed",
    "og",
    "wallpaper",
    "ultra",
    "wide",
    "square",
    "landscape",
    "portrait",
  ] as const;
  const cliPreset = PRESET_FLAGS.find((flag) => options[flag] === true);
  const preset = cliPreset ?? stdinPreset;

  const PRESET_MAP: Record<
    string,
    { aspect: AspectRatio; resolution?: Resolution }
  > = {
    cover: { aspect: "2:3", resolution: "2K" },
    feed: { aspect: "4:5" },
    landscape: { aspect: "16:9" },
    og: { aspect: "16:9" },
    portrait: { aspect: "2:3" },
    reel: { aspect: "9:16" },
    square: { aspect: "1:1" },
    story: { aspect: "9:16" },
    ultra: { aspect: "21:9", resolution: "2K" },
    wallpaper: { aspect: "9:16", resolution: "2K" },
    wide: { aspect: "21:9" },
  };

  if (hasText(preset) && preset in PRESET_MAP) {
    // biome-ignore lint/style/noNonNullAssertion: Index is guaranteed to exist due to the `in` check
    const p = PRESET_MAP[preset]!;
    return {
      aspect: p.aspect,
      resolution: p.resolution ?? defaultResolution,
    };
  }
  if (hasText(preset)) {
    throw new Error(
      `preset must be one of ${Object.keys(PRESET_MAP).join(", ")}: ${JSON.stringify(preset)}`
    );
  }

  return {
    aspect: hasText(options.aspect ?? stdinAspect)
      ? validateEnumOption(
          options.aspect ?? stdinAspect ?? "",
          ASPECT_RATIOS,
          "aspect"
        )
      : defaultAspect,
    resolution: hasText(options.resolution ?? stdinResolution)
      ? validateEnumOption(
          options.resolution ?? stdinResolution ?? "",
          RESOLUTIONS,
          "resolution"
        )
      : defaultResolution,
  };
}

export function resolveEditPaths(
  editFiles: string[] | undefined,
  modelConfig: { maxReferenceImages?: number; name: string },
  format: OutputFormat
): string[] | undefined {
  if (editFiles === undefined || editFiles.length === 0) {
    return undefined;
  }

  const maxRef =
    modelConfig.maxReferenceImages !== undefined &&
    modelConfig.maxReferenceImages !== 0
      ? modelConfig.maxReferenceImages
      : 1;
  if (editFiles.length > maxRef) {
    emitError(
      {
        code: "TOO_MANY_REFERENCES",
        message: `${modelConfig.name} supports at most ${maxRef} reference images, got ${editFiles.length}`,
      },
      format
    );
    exitForErrorCode("TOO_MANY_REFERENCES");
  }

  try {
    return editFiles.map((p) => validateEditPath(p));
  } catch (error) {
    handleError(error, "INVALID_EDIT_PATH", format);
  }
}
