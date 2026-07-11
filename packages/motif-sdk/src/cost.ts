import { MODELS } from "./models";
import type { Resolution } from "./types";

/** Estimate cost based on model and settings */
export function estimateCost(
  model: string,
  resolution?: Resolution,
  numImages = 1,
): number {
  const configuredPrice = MODELS[model]?.pricePerImageUsd;
  if (configuredPrice !== undefined) {
    if ((model === "banana" || model === "gemini3") && resolution === "4K") {
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
    case "gpt2":
      return 0.211 * numImages;
    case "gpt":
      return 0.133 * numImages;
    case "banana":
    case "gemini3":
      return (resolution === "4K" ? 0.3 : 0.15) * numImages;
    case "gemini":
      return 0.039 * numImages;
    case "flux":
    case "ideogram":
      return 0.06 * numImages;
    case "recraft":
      return 0.04 * numImages;
    case "flux-fast":
      return 0.003 * numImages;
    case "clarity":
    case "crystal":
    case "rmbg":
    case "bria":
      return 0.02 * numImages;
    default:
      return 0.1 * numImages;
  }
}

/** Estimate cost for video generation */
export function estimateVideoCost(
  durationSeconds = 5,
  generateAudio = true,
): number {
  const perSecond = generateAudio ? 0.168 : 0.112;
  return perSecond * durationSeconds;
}
