import type { AspectRatio, Resolution } from "./types";

/** Ordered by popularity: square first, then common ratios */
export const ASPECT_RATIOS: AspectRatio[] = [
  "auto",
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
  "4:1",
  "1:4",
  "8:1",
  "1:8",
];

export const RESOLUTIONS: Resolution[] = ["0.5K", "1K", "2K", "4K"];

/** Map aspect ratio to GPT image_size (GPT doesn't support arbitrary aspects) */
export function aspectToGptSize(aspect: AspectRatio): string {
  switch (aspect) {
    case "auto": {
      return "auto";
    }
    case "9:16":
    case "1:8":
    case "1:4":
    case "2:3":
    case "4:5":
    case "3:4": {
      return "1024x1536";
    }
    case "16:9":
    case "8:1":
    case "4:1":
    case "3:2":
    case "5:4":
    case "4:3":
    case "21:9": {
      return "1536x1024";
    }
    default: {
      return "1024x1024";
    }
  }
}

/**
 * Map aspect ratio to fal.ai image_size enum.
 * Used by FLUX Schnell, Recraft, Ideogram, and other models that accept
 * named size presets rather than aspect ratio strings.
 */
export function aspectToFalImageSize(aspect: AspectRatio): string {
  switch (aspect) {
    case "auto": {
      return "auto";
    }
    case "16:9":
    case "21:9":
    case "4:1":
    case "8:1": {
      return "landscape_16_9";
    }
    case "3:2":
    case "5:4": {
      return "landscape_4_3";
    }
    case "4:3": {
      return "landscape_4_3";
    }
    case "9:16":
    case "1:4":
    case "1:8": {
      return "portrait_16_9";
    }
    case "2:3":
    case "4:5": {
      return "portrait_4_3";
    }
    case "3:4": {
      return "portrait_4_3";
    }
    default: {
      return "square_hd";
    }
  }
}

/** Format presets that set aspect + resolution in one click */
export const FORMAT_PRESETS: Record<
  string,
  { label: string; aspect: AspectRatio; resolution?: Resolution }
> = {
  cover: { aspect: "2:3", label: "Cover", resolution: "2K" },
  landscape: { aspect: "16:9", label: "Landscape" },
  og: { aspect: "16:9", label: "OG Image" },
  portrait: { aspect: "2:3", label: "Portrait" },
  square: { aspect: "1:1", label: "Square" },
  story: { aspect: "9:16", label: "Story" },
  wide: { aspect: "21:9", label: "Wide" },
};
