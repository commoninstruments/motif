export type FalToolInputKind = "image" | "images" | "video";

export interface FalToolConfig {
  category:
    | "3d"
    | "background"
    | "depth"
    | "moderation"
    | "preprocess"
    | "segmentation"
    | "upscale";
  defaultOptions?: Record<string, unknown>;
  description: string;
  endpoint: string;
  inputField: "image_url" | "image_urls" | "video_url";
  inputKind: FalToolInputKind;
  name: string;
  outputKeys: string[];
  pricing: string;
  sourceUrl: string;
  task: string;
}

export interface FalToolRunOptions {
  input?: string;
  inputs?: string[];
  options?: Record<string, unknown>;
  tool: string;
}

export interface FalToolRequest {
  body: Record<string, unknown>;
  endpoint: string;
  tool: FalToolConfig;
}

const FAL_EXPLORE_CHECKED_AT = "2026-05-12";

export const FAL_TOOLS = {
  birefnet: {
    category: "background",
    defaultOptions: {
      model: "General Use (Light)",
      operating_resolution: "1024x1024",
      output_format: "png",
      refine_foreground: true,
    },
    description:
      "High-resolution dichotomous image segmentation and background removal.",
    endpoint: "fal-ai/birefnet/v2",
    inputField: "image_url",
    inputKind: "image",
    name: "BirefNet Background Removal",
    outputKeys: ["image", "mask_image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/birefnet/v2",
    task: "image background removal",
  },
  "bria-rmbg": {
    category: "background",
    description: "Commercial-safe background removal for images.",
    endpoint: "fal-ai/bria/background/remove",
    inputField: "image_url",
    inputKind: "image",
    name: "Bria RMBG 2.0",
    outputKeys: ["image"],
    pricing: "$0.02/image",
    sourceUrl: "https://fal.ai/models/fal-ai/bria/background/remove",
    task: "image background removal",
  },
  "bria-video-rmbg": {
    category: "background",
    defaultOptions: {
      background_color: "Black",
      output_container_and_codec: "webm_vp9",
      preserve_audio: true,
    },
    description: "Remove video backgrounds with configurable output container.",
    endpoint: "bria/video/background-removal",
    inputField: "video_url",
    inputKind: "video",
    name: "Bria Video Background Removal",
    outputKeys: ["video"],
    pricing: "$0.14/sec",
    sourceUrl: "https://fal.ai/models/bria/video/background-removal",
    task: "video background removal",
  },
  "depth-anything": {
    category: "preprocess",
    description: "Generate Depth Anything v2 depth maps from input images.",
    endpoint: "fal-ai/image-preprocessors/depth-anything/v2",
    inputField: "image_url",
    inputKind: "image",
    name: "Depth Anything v2 Preprocessor",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl:
      "https://fal.ai/models/fal-ai/image-preprocessors/depth-anything/v2",
    task: "depth preprocessing",
  },
  lineart: {
    category: "preprocess",
    defaultOptions: {
      coarse: false,
    },
    description: "Generate line art/control-style edges from an input image.",
    endpoint: "fal-ai/image-preprocessors/lineart",
    inputField: "image_url",
    inputKind: "image",
    name: "Line Art Preprocessor",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/image-preprocessors/lineart",
    task: "image preprocessing",
  },
  "marigold-depth": {
    category: "depth",
    defaultOptions: {
      ensemble_size: 10,
      num_inference_steps: 10,
    },
    description: "Create depth maps using Marigold depth estimation.",
    endpoint: "fal-ai/imageutils/marigold-depth",
    inputField: "image_url",
    inputKind: "image",
    name: "Marigold Depth Estimation",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/imageutils/marigold-depth",
    task: "depth map",
  },
  "midas-depth": {
    category: "depth",
    defaultOptions: {
      a: Math.PI * 2,
      bg_th: 0.1,
    },
    description: "Create MiDaS depth maps from input images.",
    endpoint: "fal-ai/imageutils/depth",
    inputField: "image_url",
    inputKind: "image",
    name: "MiDaS Depth Estimation",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/imageutils/depth",
    task: "depth map",
  },
  "midas-preprocessor": {
    category: "preprocess",
    description: "Generate MiDaS depth and normal maps for image workflows.",
    endpoint: "fal-ai/image-preprocessors/midas",
    inputField: "image_url",
    inputKind: "image",
    name: "MiDaS Preprocessor",
    outputKeys: ["depth_map", "normal_map"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/image-preprocessors/midas",
    task: "depth and normal preprocessing",
  },
  nsfw: {
    category: "moderation",
    description: "Predict whether one or more images contain NSFW concepts.",
    endpoint: "fal-ai/x-ailab/nsfw",
    inputField: "image_urls",
    inputKind: "images",
    name: "NSFW Checker",
    outputKeys: ["has_nsfw_concepts"],
    pricing: "$0.001/image",
    sourceUrl: "https://fal.ai/models/fal-ai/x-ailab/nsfw",
    task: "vision moderation",
  },
  rembg: {
    category: "background",
    defaultOptions: {
      crop_to_bbox: false,
    },
    description: "Generic image background removal utility.",
    endpoint: "fal-ai/imageutils/rembg",
    inputField: "image_url",
    inputKind: "image",
    name: "Remove Background",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/imageutils/rembg",
    task: "image background removal",
  },
  "sam-preprocessor": {
    category: "preprocess",
    description:
      "Generate a SAM segmentation map for ControlNet-style workflows.",
    endpoint: "fal-ai/image-preprocessors/sam",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM Preprocessor",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/image-preprocessors/sam",
    task: "segmentation preprocessing",
  },
  "sam2-auto": {
    category: "segmentation",
    defaultOptions: {
      min_mask_region_area: 100,
      output_format: "png",
      points_per_side: 32,
      pred_iou_thresh: 0.88,
      stability_score_thresh: 0.95,
    },
    description:
      "Automatically segment an image into combined and individual masks.",
    endpoint: "fal-ai/sam2/auto-segment",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 2 Auto Segment",
    outputKeys: ["combined_mask", "individual_masks"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/sam2/auto-segment",
    task: "automatic image segmentation",
  },
  "sam3-1-image": {
    category: "segmentation",
    defaultOptions: {
      apply_mask: true,
      max_masks: 3,
      output_format: "png",
    },
    description:
      "Segment image objects with text, point, or box prompts. SAM 3.1 adds Object Multiplex for faster multi-object tracking.",
    endpoint: "fal-ai/sam-3-1/image",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3.1 Image",
    outputKeys: ["image", "masks", "metadata", "scores", "boxes"],
    pricing: "$0.005/request",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3-1/image",
    task: "promptable image segmentation",
  },
  "sam3-1-video": {
    category: "segmentation",
    defaultOptions: {
      apply_mask: true,
      prompt: "person",
    },
    description:
      "SAM 3.1 video segmentation with Object Multiplex tracking for multiple objects.",
    endpoint: "fal-ai/sam-3-1/video",
    inputField: "video_url",
    inputKind: "video",
    name: "SAM 3.1 Video",
    outputKeys: ["video", "boundingbox_frames_zip"],
    pricing: "fal pricing varies by frame count",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3-1/video",
    task: "multi-object video segmentation",
  },
  "sam3-3d-align": {
    category: "3d",
    description: "Align SAM 3D objects and bodies into a shared scene.",
    endpoint: "fal-ai/sam-3/3d-align",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3D Align",
    outputKeys: ["scene_glb", "metadata", "artifacts_zip"],
    pricing: "fal pricing varies by scene",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/3d-align",
    task: "3D scene alignment",
  },
  "sam3-3d-body": {
    category: "3d",
    defaultOptions: {
      export_meshes: true,
      include_3d_keypoints: true,
      include_mhr_params: true,
    },
    description:
      "Reconstruct human body meshes and keypoints from a single image.",
    endpoint: "fal-ai/sam-3/3d-body",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3D Body",
    outputKeys: ["model_glb", "visualization", "meshes", "metadata"],
    pricing: "$0.015/inference",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/3d-body",
    task: "single-image 3D body reconstruction",
  },
  "sam3-3d-objects": {
    category: "3d",
    defaultOptions: {
      prompt: "car",
    },
    description:
      "Reconstruct one or more 3D objects from an image and prompts.",
    endpoint: "fal-ai/sam-3/3d-objects",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3D Objects",
    outputKeys: [
      "gaussian_splat",
      "model_glb",
      "metadata",
      "individual_splats",
      "individual_glbs",
      "artifacts_zip",
    ],
    pricing: "$0.02/generation",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/3d-objects",
    task: "single-image 3D object reconstruction",
  },
  "sam3-image": {
    category: "segmentation",
    defaultOptions: {
      apply_mask: true,
      max_masks: 3,
      output_format: "png",
    },
    description: "Segment image objects with text, point, or box prompts.",
    endpoint: "fal-ai/sam-3/image",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3 Image",
    outputKeys: ["image", "masks", "metadata", "scores", "boxes"],
    pricing: "$0.005/request",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/image",
    task: "promptable image segmentation",
  },
  "sam3-image-rle": {
    category: "segmentation",
    defaultOptions: {
      apply_mask: true,
      max_masks: 3,
    },
    description: "Segment image objects and return run-length encoded masks.",
    endpoint: "fal-ai/sam-3/image-rle",
    inputField: "image_url",
    inputKind: "image",
    name: "SAM 3 Image RLE",
    outputKeys: ["rle_masks", "metadata", "scores", "boxes"],
    pricing: "$0.005/request",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/image-rle",
    task: "promptable image segmentation to RLE",
  },
  "sam3-video": {
    category: "segmentation",
    defaultOptions: {
      apply_mask: true,
      detection_threshold: 0.5,
      prompt: "person",
      video_output_type: "X264 (.mp4)",
    },
    description: "Segment and track prompted objects across video frames.",
    endpoint: "fal-ai/sam-3/video",
    inputField: "video_url",
    inputKind: "video",
    name: "SAM 3 Video",
    outputKeys: ["video", "boundingbox_frames_zip"],
    pricing: "$0.005/16 frames",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/video",
    task: "promptable video segmentation",
  },
  "sam3-video-rle": {
    category: "segmentation",
    defaultOptions: {
      apply_mask: true,
      detection_threshold: 0.5,
      prompt: "person",
    },
    description: "Track prompted video objects and return RLE mask data.",
    endpoint: "fal-ai/sam-3/video-rle",
    inputField: "video_url",
    inputKind: "video",
    name: "SAM 3 Video RLE",
    outputKeys: ["rle_masks", "metadata"],
    pricing: "$0.005/16 frames",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/video-rle",
    task: "promptable video segmentation to RLE",
  },
  "topaz-image": {
    category: "upscale",
    defaultOptions: {
      model: "Standard V2",
      output_format: "jpeg",
      upscale_factor: 2,
    },
    description: "Professional Topaz image enhancement and upscaling.",
    endpoint: "fal-ai/topaz/upscale/image",
    inputField: "image_url",
    inputKind: "image",
    name: "Topaz Image Upscale",
    outputKeys: ["image"],
    pricing: "$0.08+ by output megapixels",
    sourceUrl: "https://fal.ai/models/fal-ai/topaz/upscale/image",
    task: "image enhancement",
  },
  "topaz-video": {
    category: "upscale",
    defaultOptions: {
      model: "Proteus",
      upscale_factor: 2,
    },
    description: "Professional Topaz video enhancement and upscaling.",
    endpoint: "fal-ai/topaz/upscale/video",
    inputField: "video_url",
    inputKind: "video",
    name: "Topaz Video Upscale",
    outputKeys: ["video"],
    pricing: "$0.01-$0.08/sec by output resolution",
    sourceUrl: "https://fal.ai/models/fal-ai/topaz/upscale/video",
    task: "video enhancement",
  },
} as const satisfies Record<string, FalToolConfig>;

export const FAL_TOOLS_CHECKED_AT = FAL_EXPLORE_CHECKED_AT;
export const FAL_TOOL_IDS = Object.keys(
  FAL_TOOLS
) as (keyof typeof FAL_TOOLS)[];
export type FalToolId = (typeof FAL_TOOL_IDS)[number];

export function isFalToolId(tool: string): tool is FalToolId {
  return Object.hasOwn(FAL_TOOLS, tool);
}

export function buildFalToolRequest(
  options: FalToolRunOptions
): FalToolRequest {
  if (!isFalToolId(options.tool)) {
    throw new Error(`Unknown fal tool: ${options.tool}`);
  }
  const tool = FAL_TOOLS[options.tool];
  const values = options.inputs ?? (options.input ? [options.input] : []);
  if (values.length === 0) {
    throw new Error(`${options.tool} requires input media`);
  }

  const mediaValue = tool.inputKind === "images" ? values : values[0];
  const defaultOptions =
    "defaultOptions" in tool ? tool.defaultOptions : undefined;
  const body = {
    ...defaultOptions,
    ...options.options,
    [tool.inputField]: mediaValue,
  };

  return { body, endpoint: tool.endpoint, tool };
}
