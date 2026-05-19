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
  nsfw: {
    name: "NSFW Checker",
    endpoint: "fal-ai/x-ailab/nsfw",
    task: "vision moderation",
    category: "moderation",
    description: "Predict whether one or more images contain NSFW concepts.",
    inputKind: "images",
    inputField: "image_urls",
    outputKeys: ["has_nsfw_concepts"],
    pricing: "$0.001/image",
    sourceUrl: "https://fal.ai/models/fal-ai/x-ailab/nsfw",
  },
  "topaz-image": {
    name: "Topaz Image Upscale",
    endpoint: "fal-ai/topaz/upscale/image",
    task: "image enhancement",
    category: "upscale",
    description: "Professional Topaz image enhancement and upscaling.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image"],
    pricing: "$0.08+ by output megapixels",
    sourceUrl: "https://fal.ai/models/fal-ai/topaz/upscale/image",
    defaultOptions: {
      model: "Standard V2",
      output_format: "jpeg",
      upscale_factor: 2,
    },
  },
  "topaz-video": {
    name: "Topaz Video Upscale",
    endpoint: "fal-ai/topaz/upscale/video",
    task: "video enhancement",
    category: "upscale",
    description: "Professional Topaz video enhancement and upscaling.",
    inputKind: "video",
    inputField: "video_url",
    outputKeys: ["video"],
    pricing: "$0.01-$0.08/sec by output resolution",
    sourceUrl: "https://fal.ai/models/fal-ai/topaz/upscale/video",
    defaultOptions: {
      model: "Proteus",
      upscale_factor: 2,
    },
  },
  "bria-rmbg": {
    name: "Bria RMBG 2.0",
    endpoint: "fal-ai/bria/background/remove",
    task: "image background removal",
    category: "background",
    description: "Commercial-safe background removal for images.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image"],
    pricing: "$0.02/image",
    sourceUrl: "https://fal.ai/models/fal-ai/bria/background/remove",
  },
  birefnet: {
    name: "BirefNet Background Removal",
    endpoint: "fal-ai/birefnet/v2",
    task: "image background removal",
    category: "background",
    description:
      "High-resolution dichotomous image segmentation and background removal.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image", "mask_image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/birefnet/v2",
    defaultOptions: {
      model: "General Use (Light)",
      operating_resolution: "1024x1024",
      output_format: "png",
      refine_foreground: true,
    },
  },
  rembg: {
    name: "Remove Background",
    endpoint: "fal-ai/imageutils/rembg",
    task: "image background removal",
    category: "background",
    description: "Generic image background removal utility.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/imageutils/rembg",
    defaultOptions: {
      crop_to_bbox: false,
    },
  },
  "bria-video-rmbg": {
    name: "Bria Video Background Removal",
    endpoint: "bria/video/background-removal",
    task: "video background removal",
    category: "background",
    description: "Remove video backgrounds with configurable output container.",
    inputKind: "video",
    inputField: "video_url",
    outputKeys: ["video"],
    pricing: "$0.14/sec",
    sourceUrl: "https://fal.ai/models/bria/video/background-removal",
    defaultOptions: {
      background_color: "Black",
      output_container_and_codec: "webm_vp9",
      preserve_audio: true,
    },
  },
  lineart: {
    name: "Line Art Preprocessor",
    endpoint: "fal-ai/image-preprocessors/lineart",
    task: "image preprocessing",
    category: "preprocess",
    description: "Generate line art/control-style edges from an input image.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/image-preprocessors/lineart",
    defaultOptions: {
      coarse: false,
    },
  },
  "sam-preprocessor": {
    name: "SAM Preprocessor",
    endpoint: "fal-ai/image-preprocessors/sam",
    task: "segmentation preprocessing",
    category: "preprocess",
    description:
      "Generate a SAM segmentation map for ControlNet-style workflows.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/image-preprocessors/sam",
  },
  "midas-depth": {
    name: "MiDaS Depth Estimation",
    endpoint: "fal-ai/imageutils/depth",
    task: "depth map",
    category: "depth",
    description: "Create MiDaS depth maps from input images.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/imageutils/depth",
    defaultOptions: {
      a: Math.PI * 2,
      bg_th: 0.1,
    },
  },
  "midas-preprocessor": {
    name: "MiDaS Preprocessor",
    endpoint: "fal-ai/image-preprocessors/midas",
    task: "depth and normal preprocessing",
    category: "preprocess",
    description: "Generate MiDaS depth and normal maps for image workflows.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["depth_map", "normal_map"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/image-preprocessors/midas",
  },
  "marigold-depth": {
    name: "Marigold Depth Estimation",
    endpoint: "fal-ai/imageutils/marigold-depth",
    task: "depth map",
    category: "depth",
    description: "Create depth maps using Marigold depth estimation.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/imageutils/marigold-depth",
    defaultOptions: {
      ensemble_size: 10,
      num_inference_steps: 10,
    },
  },
  "depth-anything": {
    name: "Depth Anything v2 Preprocessor",
    endpoint: "fal-ai/image-preprocessors/depth-anything/v2",
    task: "depth preprocessing",
    category: "preprocess",
    description: "Generate Depth Anything v2 depth maps from input images.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl:
      "https://fal.ai/models/fal-ai/image-preprocessors/depth-anything/v2",
  },
  "sam2-auto": {
    name: "SAM 2 Auto Segment",
    endpoint: "fal-ai/sam2/auto-segment",
    task: "automatic image segmentation",
    category: "segmentation",
    description:
      "Automatically segment an image into combined and individual masks.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["combined_mask", "individual_masks"],
    pricing: "$0/compute-second listed by fal",
    sourceUrl: "https://fal.ai/models/fal-ai/sam2/auto-segment",
    defaultOptions: {
      min_mask_region_area: 100,
      output_format: "png",
      points_per_side: 32,
      pred_iou_thresh: 0.88,
      stability_score_thresh: 0.95,
    },
  },
  "sam3-image": {
    name: "SAM 3 Image",
    endpoint: "fal-ai/sam-3/image",
    task: "promptable image segmentation",
    category: "segmentation",
    description: "Segment image objects with text, point, or box prompts.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["image", "masks", "metadata", "scores", "boxes"],
    pricing: "$0.005/request",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/image",
    defaultOptions: {
      apply_mask: true,
      max_masks: 3,
      output_format: "png",
    },
  },
  "sam3-image-rle": {
    name: "SAM 3 Image RLE",
    endpoint: "fal-ai/sam-3/image-rle",
    task: "promptable image segmentation to RLE",
    category: "segmentation",
    description: "Segment image objects and return run-length encoded masks.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["rle_masks", "metadata", "scores", "boxes"],
    pricing: "$0.005/request",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/image-rle",
    defaultOptions: {
      apply_mask: true,
      max_masks: 3,
    },
  },
  "sam3-video": {
    name: "SAM 3 Video",
    endpoint: "fal-ai/sam-3/video",
    task: "promptable video segmentation",
    category: "segmentation",
    description: "Segment and track prompted objects across video frames.",
    inputKind: "video",
    inputField: "video_url",
    outputKeys: ["video", "boundingbox_frames_zip"],
    pricing: "$0.005/16 frames",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/video",
    defaultOptions: {
      apply_mask: true,
      detection_threshold: 0.5,
      prompt: "person",
      video_output_type: "X264 (.mp4)",
    },
  },
  "sam3-video-rle": {
    name: "SAM 3 Video RLE",
    endpoint: "fal-ai/sam-3/video-rle",
    task: "promptable video segmentation to RLE",
    category: "segmentation",
    description: "Track prompted video objects and return RLE mask data.",
    inputKind: "video",
    inputField: "video_url",
    outputKeys: ["rle_masks", "metadata"],
    pricing: "$0.005/16 frames",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/video-rle",
    defaultOptions: {
      apply_mask: true,
      detection_threshold: 0.5,
      prompt: "person",
    },
  },
  "sam3-1-video": {
    name: "SAM 3.1 Video",
    endpoint: "fal-ai/sam-3-1/video",
    task: "multi-object video segmentation",
    category: "segmentation",
    description:
      "SAM 3.1 video segmentation with Object Multiplex tracking for multiple objects.",
    inputKind: "video",
    inputField: "video_url",
    outputKeys: ["video", "boundingbox_frames_zip"],
    pricing: "fal pricing varies by frame count",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3-1/video",
    defaultOptions: {
      apply_mask: true,
      prompt: "person",
    },
  },
  "sam3-3d-objects": {
    name: "SAM 3D Objects",
    endpoint: "fal-ai/sam-3/3d-objects",
    task: "single-image 3D object reconstruction",
    category: "3d",
    description:
      "Reconstruct one or more 3D objects from an image and prompts.",
    inputKind: "image",
    inputField: "image_url",
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
    defaultOptions: {
      prompt: "car",
    },
  },
  "sam3-3d-body": {
    name: "SAM 3D Body",
    endpoint: "fal-ai/sam-3/3d-body",
    task: "single-image 3D body reconstruction",
    category: "3d",
    description:
      "Reconstruct human body meshes and keypoints from a single image.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["model_glb", "visualization", "meshes", "metadata"],
    pricing: "$0.015/inference",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/3d-body",
    defaultOptions: {
      export_meshes: true,
      include_3d_keypoints: true,
      include_mhr_params: true,
    },
  },
  "sam3-3d-align": {
    name: "SAM 3D Align",
    endpoint: "fal-ai/sam-3/3d-align",
    task: "3D scene alignment",
    category: "3d",
    description: "Align SAM 3D objects and bodies into a shared scene.",
    inputKind: "image",
    inputField: "image_url",
    outputKeys: ["scene_glb", "metadata", "artifacts_zip"],
    pricing: "fal pricing varies by scene",
    sourceUrl: "https://fal.ai/models/fal-ai/sam-3/3d-align",
  },
} as const satisfies Record<string, FalToolConfig>;

export const FAL_TOOLS_CHECKED_AT = FAL_EXPLORE_CHECKED_AT;
export const FAL_TOOL_IDS = Object.keys(FAL_TOOLS) as Array<
  keyof typeof FAL_TOOLS
>;
export type FalToolId = (typeof FAL_TOOL_IDS)[number];

export function isFalToolId(tool: string): tool is FalToolId {
  return Object.hasOwn(FAL_TOOLS, tool);
}

export function buildFalToolRequest(
  options: FalToolRunOptions,
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

  return { endpoint: tool.endpoint, body, tool };
}
