import { aspectToFalImageSize, aspectToGptSize } from "./aspects";
import { enrichPrompt } from "./creative";
import { MODELS } from "./models";
import type {
  GenerateOptions,
  ImageSize,
  ModelConfig,
  SizeMode,
} from "./types";

const GPT_IMAGE_SIZES = ["auto", "1024x1024", "1536x1024", "1024x1536"];
const FAL_IMAGE_SIZE_PRESETS = [
  "auto",
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9",
];

function normalizeImageSize(
  imageSize: ImageSize | undefined,
  sizeMode: SizeMode
): ImageSize | undefined {
  if (imageSize === undefined) {
    return undefined;
  }

  if (typeof imageSize !== "string") {
    if (sizeMode === "gpt_size") {
      throw new Error("GPT Image 1.5 image_size must be auto or a fixed size");
    }
    return imageSize;
  }

  if (sizeMode === "gpt_size") {
    if (!GPT_IMAGE_SIZES.includes(imageSize)) {
      throw new Error(
        `GPT Image 1.5 image_size must be one of ${GPT_IMAGE_SIZES.join(", ")}`
      );
    }
    return imageSize;
  }

  if (FAL_IMAGE_SIZE_PRESETS.includes(imageSize)) {
    return imageSize;
  }

  const match = /^(\d+)x(\d+)$/.exec(imageSize);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    return { height, width };
  }

  throw new Error(
    `fal image_size must be one of ${FAL_IMAGE_SIZE_PRESETS.join(", ")} or WIDTHxHEIGHT`
  );
}

function unsupported(config: ModelConfig, option: string): never {
  throw new Error(`${config.name} does not support ${option}`);
}

function validateGenerateOptions(
  options: GenerateOptions,
  config: ModelConfig,
  sizeMode: SizeMode,
  hasEditImages: boolean
): void {
  if (
    options.editImageUrls !== undefined &&
    options.editImageUrls.length > 0 &&
    config.maxReferenceImages !== undefined &&
    options.editImageUrls.length > config.maxReferenceImages
  ) {
    throw new Error(
      `${config.name} supports at most ${config.maxReferenceImages} reference images`
    );
  }

  if (
    options.editImageUrls !== undefined &&
    options.editImageUrls.length > 0 &&
    !config.supportsEdit
  ) {
    unsupported(config, "image editing");
  }
  if (options.aspect !== undefined && sizeMode === "none") {
    unsupported(config, "aspect");
  }
  if (
    options.resolution !== undefined &&
    options.resolution !== "2K" &&
    !config.supportsResolution
  ) {
    unsupported(config, "resolution");
  }
  if (
    options.numImages !== undefined &&
    options.numImages !== 1 &&
    !config.supportsNumImages
  ) {
    unsupported(config, "numImages");
  }
  if (options.background !== undefined && config.supportsBackground !== true) {
    unsupported(config, "background");
  }
  if (
    options.transparent === true &&
    !(
      config.supportsBackground === true || config.supportsOutputFormat === true
    )
  ) {
    unsupported(config, "transparent output");
  }
  if (options.inputFidelity !== undefined) {
    if (!hasEditImages) {
      throw new Error("inputFidelity requires editImageUrls");
    }
    if (config.sizeMode !== "gpt_size" && config.name !== "GPT Image 2") {
      unsupported(config, "inputFidelity");
    }
  }
  if (
    options.imageSize !== undefined &&
    sizeMode !== "gpt_size" &&
    sizeMode !== "image_size_enum"
  ) {
    unsupported(config, "imageSize");
  }
  if (
    options.imagePromptStrength !== undefined &&
    config.supportsImagePromptStrength !== true
  ) {
    unsupported(config, "imagePromptStrength");
  }
  if (options.imagePromptStrength !== undefined && !hasEditImages) {
    throw new Error("imagePromptStrength requires editImageUrls");
  }
  if (options.maskImageUrl !== undefined && config.supportsMaskImage !== true) {
    unsupported(config, "maskImageUrl");
  }
  if (options.maskImageUrl !== undefined && !hasEditImages) {
    throw new Error("maskImageUrl requires editImageUrls");
  }
  if (options.seed !== undefined && config.supportsSeed !== true) {
    unsupported(config, "seed");
  }
  if (
    options.outputFormat !== undefined &&
    config.supportsOutputFormat !== true
  ) {
    unsupported(config, "outputFormat");
  }
  if (options.quality !== undefined && config.supportsQuality !== true) {
    unsupported(config, "quality");
  }
  if (
    options.negativePrompt !== undefined &&
    config.supportsNegativePrompt !== true
  ) {
    unsupported(config, "negativePrompt");
  }
  if (options.style !== undefined && config.supportsStyle !== true) {
    unsupported(config, "style");
  }
  if (options.syncMode !== undefined && config.supportsSyncMode !== true) {
    unsupported(config, "syncMode");
  }
  if (
    options.renderingSpeed !== undefined &&
    config.supportsRenderingSpeed !== true
  ) {
    unsupported(config, "renderingSpeed");
  }
  if (
    options.guidanceScale !== undefined &&
    config.supportsGuidanceScale !== true
  ) {
    unsupported(config, "guidanceScale");
  }
  if (
    options.numInferenceSteps !== undefined &&
    config.supportsInferenceSteps !== true
  ) {
    unsupported(config, "numInferenceSteps");
  }
  if (options.raw !== undefined && config.supportsRaw !== true) {
    unsupported(config, "raw");
  }
  if (
    options.enhancePrompt !== undefined &&
    config.supportsEnhancePrompt !== true
  ) {
    unsupported(config, "enhancePrompt");
  }
  if (
    options.safetyTolerance !== undefined &&
    config.supportsSafetyTolerance !== true
  ) {
    unsupported(config, "safetyTolerance");
  }
  if (
    options.enableWebSearch !== undefined &&
    config.supportsWebSearch !== true
  ) {
    unsupported(config, "enableWebSearch");
  }
  if (
    options.enableGoogleSearch !== undefined &&
    config.supportsGoogleSearch !== true
  ) {
    unsupported(config, "enableGoogleSearch");
  }
  if (
    options.enableSafetyChecker !== undefined &&
    config.supportsSafetyChecker !== true
  ) {
    unsupported(config, "enableSafetyChecker");
  }
  if (
    options.limitGenerations !== undefined &&
    config.supportsLimitGenerations !== true
  ) {
    unsupported(config, "limitGenerations");
  }
  if (
    options.thinkingLevel !== undefined &&
    config.supportsThinkingLevel !== true
  ) {
    unsupported(config, "thinkingLevel");
  }
  if (
    options.expandPrompt !== undefined &&
    config.supportsExpandPrompt !== true
  ) {
    unsupported(config, "expandPrompt");
  }
}

/**
 * Build the fal.ai request body for a generation request.
 * Shared between sync generate() (CLI) and queue-based submit (web).
 *
 * Models use different sizing APIs:
 * - `gpt_size`: GPT's fixed dimensions (1024x1024, 1536x1024, etc.)
 * - `aspect_ratio`: string like "16:9" (Gemini, Grok, FLUX Pro Ultra)
 * - `image_size_enum`: named presets like "landscape_4_3" (FLUX.2, Seedream, Recraft, Ideogram, GPT Image 2)
 * - `none`: no size control (video models)
 */
export function buildGenerateBody(options: GenerateOptions): {
  endpoint: string;
  body: Record<string, unknown>;
} {
  const {
    prompt,
    model,
    creative,
    aspect = "1:1",
    resolution = "2K",
    numImages = 1,
    background,
    editImageUrls,
    enableGoogleSearch,
    enableSafetyChecker,
    transparent,
    inputFidelity,
    imageSize,
    imagePromptStrength,
    limitGenerations,
    maskImageUrl,
    seed,
    outputFormat,
    quality,
    negativePrompt,
    style,
    syncMode,
    thinkingLevel,
    renderingSpeed,
    guidanceScale,
    numInferenceSteps,
    raw,
    enhancePrompt,
    safetyTolerance,
    enableWebSearch,
    expandPrompt,
  } = options;

  const config = MODELS[model];
  if (!config) {
    throw new Error(`Unknown model: ${model}`);
  }

  let { endpoint } = config;
  const enrichedPrompt = creative
    ? enrichPrompt({ creative, prompt }).prompt
    : prompt;
  const body: Record<string, unknown> = { prompt: enrichedPrompt };
  const hasEditImages = Boolean(editImageUrls?.length);
  const editImages = editImageUrls ?? [];
  const explicitAspect = options.aspect !== undefined;

  // Apply dimension control based on model's size mode
  const sizeMode = config.sizeMode ?? "aspect_ratio";
  validateGenerateOptions(options, config, sizeMode, hasEditImages);
  const normalizedImageSize = normalizeImageSize(imageSize, sizeMode);

  switch (sizeMode) {
    case "gpt_size": {
      body.image_size =
        normalizedImageSize ??
        (hasEditImages && !explicitAspect ? "auto" : aspectToGptSize(aspect));
      break;
    }

    case "image_size_enum": {
      body.image_size = normalizedImageSize ?? aspectToFalImageSize(aspect);
      break;
    }

    case "aspect_ratio": {
      if (config.supportsAspect) {
        body.aspect_ratio = aspect;
      }
      if (config.supportsResolution) {
        body.resolution =
          model === "grok-image" ? resolution.toLowerCase() : resolution;
      }
      break;
    }

    case "none": {
      break;
    }
  }

  if (config.supportsQuality === true) {
    body.quality = quality ?? "high";
  }

  if (config.supportsBackground === true && background) {
    body.background = background;
  }
  if (config.supportsBackground === true && transparent === true) {
    body.background = "transparent";
  }
  if (transparent === true && config.supportsOutputFormat === true) {
    body.output_format = "png";
  }

  if (syncMode !== undefined && config.supportsSyncMode === true) {
    body.sync_mode = syncMode;
  }

  // ── Seed ──────────────────────────────────────────────────────────
  if (seed !== undefined && config.supportsSeed === true) {
    body.seed = seed;
  }

  // ── Output format ──────────────────────────────────────────────────
  // transparent mode already forces output_format = "png" where supported.
  if (
    outputFormat &&
    config.supportsOutputFormat === true &&
    transparent !== true
  ) {
    if (
      config.supportedOutputFormats &&
      !config.supportedOutputFormats.includes(outputFormat)
    ) {
      throw new Error(
        `${config.name} supports output formats: ${config.supportedOutputFormats.join(", ")}`
      );
    }
    body.output_format = outputFormat;
  }

  if (config.supportsRaw === true && raw !== undefined) {
    body.raw = raw;
  }
  if (config.supportsEnhancePrompt === true && enhancePrompt !== undefined) {
    body.enhance_prompt = enhancePrompt;
  }
  if (
    config.supportsImagePromptStrength === true &&
    imagePromptStrength !== undefined
  ) {
    body.image_prompt_strength = imagePromptStrength;
  }
  if (model === "flux") {
    if (safetyTolerance !== undefined && safetyTolerance !== "") {
      body.safety_tolerance = safetyTolerance;
    }
  }

  if (config.supportsGuidanceScale === true && guidanceScale !== undefined) {
    body.guidance_scale = guidanceScale;
  }
  if (
    config.supportsInferenceSteps === true &&
    numInferenceSteps !== undefined
  ) {
    body.num_inference_steps = numInferenceSteps;
  }

  // ── Shared safety / web-search controls ────────────────────────────
  if (config.supportsSafetyTolerance === true) {
    if (safetyTolerance !== undefined && safetyTolerance !== "") {
      body.safety_tolerance = safetyTolerance;
    }
  }
  if (config.supportsWebSearch === true) {
    if (enableWebSearch !== undefined) {
      body.enable_web_search = enableWebSearch;
    }
  }
  if (config.supportsGoogleSearch === true) {
    if (enableGoogleSearch !== undefined) {
      body.enable_google_search = enableGoogleSearch;
    }
  }
  if (config.supportsSafetyChecker === true) {
    if (enableSafetyChecker !== undefined) {
      body.enable_safety_checker = enableSafetyChecker;
    }
  }
  if (config.supportsLimitGenerations === true) {
    if (limitGenerations !== undefined) {
      body.limit_generations = limitGenerations;
    }
  }
  if (config.supportsThinkingLevel === true) {
    if (thinkingLevel) {
      body.thinking_level = thinkingLevel;
    }
  }

  // ── Recraft: style ────────────────────────────────────────────────
  if (config.supportsStyle === true && style !== undefined && style !== "") {
    body.style = style;
  }

  // ── Ideogram: negative_prompt, style, rendering_speed, expand_prompt
  if (config.supportsNegativePrompt === true) {
    if (negativePrompt !== undefined && negativePrompt !== "") {
      body.negative_prompt = negativePrompt;
    }
  }
  if (model === "ideogram") {
    if (style !== undefined && style !== "") {
      body.style = style;
    }
  }
  if (config.supportsRenderingSpeed === true) {
    if (renderingSpeed) {
      body.rendering_speed = renderingSpeed;
    }
  }
  if (config.supportsExpandPrompt === true) {
    if (expandPrompt !== undefined) {
      body.expand_prompt = expandPrompt;
    }
  }

  // FLUX Pro Ultra reference image
  if (model === "flux" && hasEditImages) {
    body.image_url = editImages[0];
    body.image_prompt_strength = imagePromptStrength ?? 0.5;
  }

  if (config.supportsNumImages) {
    body.num_images = numImages;
  }

  if (hasEditImages && sizeMode !== "gpt_size" && model !== "flux") {
    if (!config.supportsEdit) {
      throw new Error(`Model ${model} does not support image editing`);
    }
    endpoint = config.editEndpoint ?? `${endpoint}/edit`;
    const editImagesField = config.editImagesField ?? "image_urls";
    body[editImagesField] =
      editImagesField === "image_url" ? editImages[0] : editImages;
    if (model === "gpt2" && inputFidelity) {
      body.input_fidelity = inputFidelity;
    }
  }

  // GPT Image 1 edit mode
  if (hasEditImages && sizeMode === "gpt_size") {
    endpoint = config.editEndpoint ?? `${endpoint}/edit`;
    body.image_urls = editImages;
    if (inputFidelity) {
      body.input_fidelity = inputFidelity;
    }
  }

  if (
    maskImageUrl !== undefined &&
    maskImageUrl !== "" &&
    config.supportsMaskImage === true
  ) {
    body.mask_image_url = maskImageUrl;
  }

  return { body, endpoint };
}
