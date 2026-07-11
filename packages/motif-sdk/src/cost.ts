import { MODELS } from "./models";
import type { Resolution } from "./types";

/** Estimate cost based on model and settings */
export function estimateCost(
  model: string,
  resolution?: Resolution,
  numImages = 1
): number {
  const configuredPrice = MODELS[model]?.pricePerImageUsd;
  if (configuredPrice !== undefined) {
    if ((model === "banana" || model === "gemini3") && resolution === "4K") {
      return configuredPrice * 2 * numImages;
    }
    if (model === "seedream5" && (resolution === "2K" || resolution === "4K")) {
      // fal tiers Seedream v5 Pro: $0.0675 up to 1536², $0.135 up to 2048²
      // (2K/4K settings map to the larger, doubled tier).
      return configuredPrice * 2 * numImages;
    }
    if (model === "banana2") {
      // fal tiers nano-banana-2 by resolution: 0.5K $0.06, 1K $0.08, 2K $0.12, 4K $0.16
      const multiplier =
        resolution === "4K"
          ? 2
          : resolution === "2K"
            ? 1.5
            : resolution === "0.5K"
              ? 0.75
              : 1;
      return configuredPrice * multiplier * numImages;
    }
    return configuredPrice * numImages;
  }

  switch (model) {
    case "gpt2": {
      // Blended estimate: fal bills gpt-image-2 on a $0.005–$0.401 tiered scale
      // (by size/quality); 0.211 is a representative mid-point per image.
      return 0.211 * numImages;
    }
    case "gpt": {
      return 0.133 * numImages;
    }
    case "banana":
    case "gemini3": {
      return (resolution === "4K" ? 0.3 : 0.15) * numImages;
    }
    case "gemini": {
      return 0.039 * numImages;
    }
    case "flux":
    case "ideogram": {
      return 0.06 * numImages;
    }
    case "recraft": {
      return 0.04 * numImages;
    }
    case "flux-fast": {
      return 0.003 * numImages;
    }
    case "clarity": {
      // fal bills clarity-upscaler at $0.03/MP.
      return 0.03 * numImages;
    }
    case "crystal":
    case "rmbg":
    case "bria": {
      return 0.02 * numImages;
    }
    default: {
      return 0.1 * numImages;
    }
  }
}

/** Estimate cost for video generation */
export function estimateVideoCost(
  durationSeconds = 5,
  generateAudio = true
): number {
  const perSecond = generateAudio ? 0.168 : 0.112;
  return perSecond * durationSeconds;
}
