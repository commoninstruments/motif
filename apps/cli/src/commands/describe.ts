/**
 * Schema introspection for agent-first CLI design.
 *
 * `motif describe` returns full machine-readable schema for all commands.
 * `motif describe <command>` returns schema for a specific command.
 *
 * Schemas are resolved at runtime from the live model registry,
 * so they always reflect the current API version.
 */

import {
  ASPECT_RATIOS,
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  EDIT_CAPABLE_MODELS,
  FAL_TOOL_IDS,
  FAL_TOOLS,
  FAL_TOOLS_CHECKED_AT,
  GENERATION_MODELS,
  IMAGE_EDITING_TOP_20,
  IMAGE_TEXT_TO_IMAGE_TOP_20,
  MODELS,
  RESOLUTIONS,
  UTILITY_MODELS,
  VIDEO_IMAGE_TO_VIDEO_TOP_15,
  VIDEO_MODELS,
  VIDEO_TEXT_TO_VIDEO_TOP_15,
} from "@howells/motif-sdk";

import { ERROR_CATALOG } from "../utils/error-catalog";
import { emit } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { PACKAGE_VERSION } from "../version";

/**
 * Build creative direction properties for `motif describe` output.
 *
 * The enum metadata includes labels, descriptions, and appended prompt clauses
 * so agents can choose option ids without inspecting SDK source.
 */
function creativeSchemaProperties(): Record<string, object> {
  return Object.fromEntries(
    CREATIVE_FIELDS.map((field) => [
      field,
      {
        description: `Creative direction ${field} id`,
        enum: CREATIVE_TAXONOMY[field].map((option) => option.id),
        enumDescriptions: Object.fromEntries(
          CREATIVE_TAXONOMY[field].map((option) => [
            option.id,
            {
              clause: option.clause,
              description: option.description,
              label: option.label,
            },
          ])
        ),
        type: "string",
      },
    ])
  );
}

/** JSON Schema for the generate command's input */
function generateSchema() {
  return {
    command: "generate",
    description: "Generate an image from a text prompt",
    input: {
      properties: {
        aspect: {
          default: "1:1",
          description: "Aspect ratio of the generated image",
          enum: ASPECT_RATIOS,
          type: "string",
        },
        background: {
          description: "Background mode for GPT Image models",
          enum: ["auto", "transparent", "opaque"],
          type: "string",
        },
        editImages: {
          description:
            "Local file paths for reference/edit images. Uploaded automatically.",
          items: { type: "string" },
          type: "array",
        },
        enableGoogleSearch: {
          description: "Enable fal enable_google_search where supported",
          type: "boolean",
        },
        enableSafetyChecker: {
          description: "Enable or disable fal safety checker where supported",
          type: "boolean",
        },
        enableWebSearch: {
          description: "Enable web search where supported",
          type: "boolean",
        },
        ephemeral: {
          default: false,
          description:
            "Save output locally, send X-Fal-Store-IO: 0, skip Motif history, then delete fal request IO payloads when fal returns a request id",
          type: "boolean",
        },
        imagePromptStrength: {
          description:
            "Reference image strength for models that expose image_prompt_strength",
          maximum: 1,
          minimum: 0,
          type: "number",
        },
        imageSize: {
          description:
            "Direct fal image_size override. WIDTHxHEIGHT is accepted by CLI and normalized to { width, height } where supported.",
          oneOf: [
            {
              enum: [
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
              ],
              type: "string",
            },
            {
              properties: {
                height: { minimum: 1, type: "integer" },
                width: { minimum: 1, type: "integer" },
              },
              required: ["width", "height"],
              type: "object",
            },
          ],
        },
        inputFidelity: {
          description:
            'How closely to follow reference images. "low" = loose inspiration (GPT only)',
          enum: ["low", "high"],
          type: "string",
        },
        limitGenerations: {
          description: "Limit model-internal generation rounds where supported",
          type: "boolean",
        },
        maskImageUrl: {
          description: "Mask image URL for supported edit/inpainting models",
          type: "string",
        },
        model: {
          default: "banana",
          description: "Generation model to use",
          enum: GENERATION_MODELS,
          enumDescriptions: Object.fromEntries(
            GENERATION_MODELS.map((m) => [
              m,
              {
                benchmark: MODELS[m]?.benchmark,
                falPricing: MODELS[m]?.falPricing,
                maxReferenceImages: MODELS[m]?.maxReferenceImages,
                name: MODELS[m]?.name,
                pricing: MODELS[m]?.pricing,
                supportedOutputFormats: MODELS[m]?.supportedOutputFormats,
                supportsAspect: MODELS[m]?.supportsAspect,
                supportsBackground: MODELS[m]?.supportsBackground,
                supportsEdit: MODELS[m]?.supportsEdit,
                supportsGoogleSearch: MODELS[m]?.supportsGoogleSearch,
                supportsImagePromptStrength:
                  MODELS[m]?.supportsImagePromptStrength,
                supportsLimitGenerations: MODELS[m]?.supportsLimitGenerations,
                supportsMaskImage: MODELS[m]?.supportsMaskImage,
                supportsQuality: MODELS[m]?.supportsQuality,
                supportsResolution: MODELS[m]?.supportsResolution,
                supportsSafetyChecker: MODELS[m]?.supportsSafetyChecker,
                supportsSyncMode: MODELS[m]?.supportsSyncMode,
                supportsThinkingLevel: MODELS[m]?.supportsThinkingLevel,
              },
            ])
          ),
          type: "string",
        },
        noOpen: {
          default: false,
          description: "Don't open image in viewer after generation",
          type: "boolean",
        },
        numImages: {
          default: 1,
          description: "Number of images to generate",
          maximum: 4,
          minimum: 1,
          type: "integer",
        },
        output: {
          description:
            "Output filename (must be within CWD). Auto-generated if omitted.",
          type: "string",
        },
        prompt: {
          description: "Text description of the image to generate",
          type: "string",
        },
        quality: {
          description: "Image quality for GPT/OpenAI image models",
          enum: ["auto", "low", "medium", "high"],
          type: "string",
        },
        resolution: {
          default: "2K",
          description: "Output resolution (not all models support this)",
          enum: RESOLUTIONS,
          type: "string",
        },
        syncMode: {
          description:
            "Ask fal to return media as data URI and omit it from request history where supported",
          type: "boolean",
        },
        thinkingLevel: {
          description: "Nano Banana 2 thinking level",
          enum: ["minimal", "high"],
          type: "string",
        },
        transparent: {
          default: false,
          description: "Transparent background (GPT model only)",
          type: "boolean",
        },
        ...creativeSchemaProperties(),
      },
      required: ["prompt"],
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        aspect: { type: "string" },
        cost: { description: "Estimated cost in USD", type: "number" },
        historyRecorded: {
          description: "False for ephemeral generations",
          type: "boolean",
        },
        id: { description: "Generation ID (UUID)", type: "string" },
        images: {
          items: {
            properties: {
              height: { type: "integer" },
              path: { description: "Local file path", type: "string" },
              size: {
                description: 'Human-readable, e.g. "1.2MB"',
                type: "string",
              },
              width: { type: "integer" },
            },
            type: "object",
          },
          type: "array",
        },
        model: { type: "string" },
        payloadsDeleted: {
          description:
            "Whether Motif deleted fal request IO payloads after local download",
          type: "boolean",
        },
        prompt: { type: "string" },
        requestId: {
          description: "fal request id, included when fal returns one",
          type: "string",
        },
        resolution: { type: "string" },
        timestamp: { format: "date-time", type: "string" },
      },
      type: "object",
    },
    presets: {
      cover: {
        aspect: "2:3",
        description: "Kindle/eBook cover",
        resolution: "2K",
      },
      feed: { aspect: "4:5", description: "Instagram Feed" },
      landscape: { aspect: "16:9", description: "Landscape" },
      og: { aspect: "16:9", description: "Open Graph / social share" },
      portrait: { aspect: "2:3", description: "Portrait" },
      reel: { aspect: "9:16", description: "Instagram Reel" },
      square: { aspect: "1:1", description: "Square" },
      story: { aspect: "9:16", description: "Instagram/TikTok Story" },
      ultra: {
        aspect: "21:9",
        description: "Ultra-wide banner",
        resolution: "2K",
      },
      wallpaper: {
        aspect: "9:16",
        description: "iPhone wallpaper",
        resolution: "2K",
      },
      wide: { aspect: "21:9", description: "Cinematic wide" },
    },
    supports_dry_run: true,
  };
}

function upscaleSchema() {
  return {
    command: "upscale",
    description: "Upscale an image to higher resolution",
    input: {
      properties: {
        imagePath: {
          description:
            "Path to image to upscale. Falls back to last generated image.",
          type: "string",
        },
        model: {
          default: "clarity",
          description: "Upscaler model",
          enum: ["clarity", "crystal"],
          type: "string",
        },
        noOpen: {
          default: false,
          type: "boolean",
        },
        output: {
          description:
            "Output filename (CWD-sandboxed). Default: writes alongside source image.",
          type: "string",
        },
        scale: {
          default: 2,
          description: "Upscale factor",
          enum: [2, 4, 6, 8],
          type: "integer",
        },
      },
      required: [],
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        cost: { type: "number" },
        height: { type: "integer" },
        path: { type: "string" },
        size: { type: "string" },
        width: { type: "integer" },
      },
      type: "object",
    },
    supports_dry_run: true,
  };
}

function removeBackgroundSchema() {
  return {
    command: "rmbg",
    description: "Remove background from the last generated image",
    input: {
      properties: {
        model: {
          default: "rmbg",
          description: "Background removal model",
          enum: ["rmbg", "bria"],
          type: "string",
        },
        noOpen: { default: false, type: "boolean" },
        output: { description: "Output filename", type: "string" },
      },
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        cost: { type: "number" },
        height: { type: "integer" },
        path: { type: "string" },
        size: { type: "string" },
        width: { type: "integer" },
      },
      type: "object",
    },
    supports_dry_run: true,
  };
}

function varySchema() {
  return {
    command: "vary",
    description: "Generate variations of the last generated image",
    input: {
      properties: {
        aspect: { enum: ASPECT_RATIOS, type: "string" },
        model: { enum: EDIT_CAPABLE_MODELS, type: "string" },
        numImages: {
          default: 4,
          maximum: 4,
          minimum: 1,
          type: "integer",
        },
        prompt: {
          description: "Custom prompt (defaults to last generation's prompt)",
          type: "string",
        },
        resolution: { enum: RESOLUTIONS, type: "string" },
      },
      type: "object",
    },
    mutating: true,
    output: { $ref: "#/commands/generate/output" },
    supports_dry_run: true,
  };
}

function lastSchema() {
  return {
    command: "last",
    description: "Show information about the last generation",
    input: { properties: {}, type: "object" },
    mutating: false,
    output: {
      properties: {
        aspect: { type: "string" },
        cost: { type: "number" },
        id: { type: "string" },
        model: { type: "string" },
        output: { type: "string" },
        prompt: { type: "string" },
        resolution: { type: "string" },
        timestamp: { format: "date-time", type: "string" },
      },
      type: "object",
    },
  };
}

function historySchema() {
  return {
    command: "history",
    description: "List generation history",
    input: {
      properties: {
        limit: {
          default: 10,
          description: "Number of entries to return",
          type: "integer",
        },
        offset: {
          default: 0,
          description: "Skip first N entries",
          type: "integer",
        },
      },
      type: "object",
    },
    mutating: false,
    output: {
      properties: {
        costs: {
          properties: {
            allTime: { type: "number" },
            session: { type: "number" },
            today: { type: "number" },
          },
          type: "object",
        },
        generations: {
          items: { $ref: "#/commands/last/output" },
          type: "array",
        },
        total: { type: "integer" },
      },
      type: "object",
    },
  };
}

function videoSchema() {
  return {
    command: "video",
    cost_reference: {
      audio_off: "$0.112/sec (5s = $0.56)",
      audio_on: "$0.168/sec (5s = $0.84)",
      note: "Video is significantly more expensive than images. Always use --dry-run first.",
    },
    description: "Generate video from an image using Kling v3 Pro",
    input: {
      properties: {
        duration: {
          default: 5,
          description: "Video duration in seconds",
          maximum: 15,
          minimum: 3,
          type: "integer",
        },
        generateAudio: {
          default: true,
          description: "Generate audio track (costs ~50% more when enabled)",
          type: "boolean",
        },
        imagePath: {
          description:
            "Path to source image. Falls back to last generated image.",
          type: "string",
        },
        noOpen: {
          default: false,
          type: "boolean",
        },
        output: {
          description: "Output filename (.mp4)",
          type: "string",
        },
        prompt: {
          default: "cinematic motion, smooth camera movement",
          description: "Text description of the motion/scene",
          type: "string",
        },
      },
      required: ["imagePath"],
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        cost: { type: "number" },
        duration: { type: "integer" },
        generateAudio: { type: "boolean" },
        model: { type: "string" },
        path: { type: "string" },
        prompt: { type: "string" },
        size: { type: "string" },
        source: { type: "string" },
      },
      type: "object",
    },
    supports_dry_run: true,
  };
}

function toolSchema() {
  return {
    checkedAt: FAL_TOOLS_CHECKED_AT,
    command: "tool",
    description:
      "List, describe, and run fal.ai utility tools such as SAM segmentation, Topaz upscale, Bria background removal, and moderation.",
    input: {
      properties: {
        input: {
          description:
            "Image/video URL or local file path. Local files are uploaded automatically.",
          type: "string",
        },
        inputs: {
          description: "Multiple image inputs for batch tools such as nsfw.",
          items: { type: "string" },
          type: "array",
        },
        options: {
          description:
            "Provider-specific options passed with --json or repeatable --option key=value.",
          type: "object",
        },
        output: {
          description:
            "Download the primary URL-like output to this file when available.",
          type: "string",
        },
        prompt: {
          description:
            "Prompt for SAM segmentation or 3D reconstruction tools.",
          type: "string",
        },
        tool: {
          description: "Registered fal utility tool ID",
          enum: FAL_TOOL_IDS,
          type: "string",
        },
      },
      required: ["tool", "input"],
      type: "object",
    },
    mutating: true,
    subcommands: ["list", "describe", "run"],
    supports_dry_run: true,
    tools: Object.fromEntries(
      FAL_TOOL_IDS.map((id) => [
        id,
        {
          category: FAL_TOOLS[id].category,
          defaultOptions:
            "defaultOptions" in FAL_TOOLS[id]
              ? FAL_TOOLS[id].defaultOptions
              : undefined,
          endpoint: FAL_TOOLS[id].endpoint,
          inputKind: FAL_TOOLS[id].inputKind,
          name: FAL_TOOLS[id].name,
          outputKeys: FAL_TOOLS[id].outputKeys,
          pricing: FAL_TOOLS[id].pricing,
          sourceUrl: FAL_TOOLS[id].sourceUrl,
          task: FAL_TOOLS[id].task,
        },
      ])
    ),
  };
}

function describeSchema() {
  return {
    command: "describe",
    description: "Introspect CLI schema (this command)",
    input: {
      properties: {
        command: {
          description: "Specific command to describe (omit for all)",
          enum: [
            "generate",
            "upscale",
            "rmbg",
            "vary",
            "video",
            "last",
            "history",
            "series",
            "tool",
            "describe",
            "errors",
          ],
          type: "string",
        },
      },
      type: "object",
    },
    mutating: false,
  };
}

function seriesSchema() {
  return {
    command: "series",
    description:
      "Manage reusable image series and run themed multi-image generation plans with shared style, tone, references, and history.",
    examples: [
      'motif series run "brutalist architecture" --count 6 --dry-run --format json',
      'motif series create "Luna Adventure" --style "watercolor children\'s book" -m banana',
      'motif series gen luna-adventure "Luna enters the forest" --refs character,location --dry-run',
    ],
    input: {
      properties: {
        aspect: {
          default: "1:1",
          enum: ASPECT_RATIOS,
          type: "string",
        },
        command: {
          description: "Series command for stdin JSON payloads",
          enum: [
            "series-create",
            "series-list",
            "series-show",
            "series-ref-add",
            "series-ref-remove",
            "series-generate",
            "series-run",
            "series-history",
            "series-delete",
          ],
          type: "string",
        },
        count: {
          default: 4,
          description: "Number of scene prompts/images in a series run",
          maximum: 24,
          minimum: 1,
          type: "integer",
        },
        dryRun: {
          default: false,
          description:
            "Plan prompts, references, and cost without calling fal or requiring FAL_KEY.",
          type: "boolean",
        },
        model: {
          default: "banana",
          description:
            "Generation model. banana is recommended for series because it supports up to 14 references.",
          enum: GENERATION_MODELS,
          type: "string",
        },
        noOpen: { default: false, type: "boolean" },
        numImages: {
          description: "Alias for count in stdin JSON series-run payloads.",
          maximum: 24,
          minimum: 1,
          type: "integer",
        },
        prompt: {
          description:
            "Single scene prompt for series gen, or alias for theme in stdin series-run.",
          type: "string",
        },
        refs: {
          description:
            "Comma-separated reference tags to include from an existing series.",
          type: "string",
        },
        resolution: {
          default: "2K",
          enum: RESOLUTIONS,
          type: "string",
        },
        series: {
          description:
            "Existing series slug. Omit for series run to auto-create or reuse a series from the theme when generating.",
          type: "string",
        },
        stylePrompt: {
          description:
            "Shared style/tone prompt stored on a series or applied to a series run.",
          type: "string",
        },
        theme: {
          description:
            'High-level creative brief for series run, e.g. "brutalist architecture".',
          type: "string",
        },
      },
      type: "object",
    },
    mutating: true,
    output: {
      properties: {
        command: { type: "string" },
        cost: { type: "number" },
        estimatedCost: { type: "number" },
        images: {
          description: "Saved image outputs for non-dry-run series runs.",
          type: "array",
        },
        scenes: {
          description:
            "Series run plan with one scene prompt per generated image.",
          items: {
            properties: {
              index: { type: "integer" },
              prompt: { type: "string" },
              scenePrompt: { type: "string" },
            },
            type: "object",
          },
          type: "array",
        },
        series: { type: ["string", "null"] },
        stylePrompt: { type: "string" },
        theme: { type: "string" },
      },
      type: "object",
    },
    subcommands: [
      "create",
      "list",
      "show",
      "ref-add",
      "ref-remove",
      "gen",
      "run",
      "history",
      "delete",
    ],
    supports_dry_run: true,
  };
}

const COMMAND_SCHEMAS: Record<string, () => object> = {
  describe: describeSchema,
  errors: () => ({
    command: "errors",
    description: "Inspect machine-readable CLI error metadata",
    errors: ERROR_CATALOG,
    mutating: false,
    output: {
      properties: {
        errors: {
          description:
            "Known error codes keyed by code, with status, retryability, local doc URI, and recovery suggestions.",
          type: "object",
        },
      },
      type: "object",
    },
  }),
  generate: generateSchema,
  history: historySchema,
  last: lastSchema,
  rmbg: removeBackgroundSchema,
  series: seriesSchema,
  tool: toolSchema,
  upscale: upscaleSchema,
  vary: varySchema,
  video: videoSchema,
};

/** Full CLI schema with all commands, models, and runtime state */
function fullSchema() {
  return {
    commands: Object.fromEntries(
      Object.entries(COMMAND_SCHEMAS).map(([name, fn]) => [name, fn()])
    ),
    description: "fal.ai image generation CLI",
    enums: {
      aspect_ratios: ASPECT_RATIOS,
      fal_tools: FAL_TOOL_IDS,
      generation_models: GENERATION_MODELS,
      resolutions: RESOLUTIONS,
      utility_models: UTILITY_MODELS,
      video_models: VIDEO_MODELS,
    },
    errors: ERROR_CATALOG,
    global_flags: {
      "--dry-run":
        "Validate inputs and show what would happen without making API calls.",
      "--ephemeral":
        "Save output locally, disable fal IO storage where supported, skip Motif history, and delete fal request payloads after download.",
      "--fields <field1,field2,...>":
        "Comma-separated field names to include in output. Omit for all fields.",
      "--format <json|human|ndjson>":
        "Output format. Default: human (TTY) or json (piped).",
      "--no-open": "Don't open image in viewer after generation.",
    },
    input_modes: {
      combined: "Stdin JSON for base config, flags override specific fields.",
      flags: "Traditional CLI flags (e.g. motif 'a cat' -m gpt --og)",
      stdin_json:
        'Pipe a JSON payload to stdin: echo \'{"prompt":"a cat","model":"gpt"}\' | motif',
    },
    leaderboards: {
      image_editing_top_20: IMAGE_EDITING_TOP_20,
      image_text_to_image_top_20: IMAGE_TEXT_TO_IMAGE_TOP_20,
      video_image_to_video_top_15: VIDEO_IMAGE_TO_VIDEO_TOP_15,
      video_text_to_video_top_15: VIDEO_TEXT_TO_VIDEO_TOP_15,
    },
    models: Object.fromEntries(
      Object.entries(MODELS).map(([key, config]) => [
        key,
        {
          benchmark: config.benchmark,
          capabilities: {
            aspect: config.supportsAspect,
            edit: config.supportsEdit,
            guidanceScale: config.supportsGuidanceScale,
            inferenceSteps: config.supportsInferenceSteps,
            maxReferenceImages: config.maxReferenceImages,
            numImages: config.supportsNumImages,
            outputFormat: config.supportsOutputFormat,
            resolution: config.supportsResolution,
            safetyTolerance: config.supportsSafetyTolerance,
            seed: config.supportsSeed,
            supportedOutputFormats: config.supportedOutputFormats,
            webSearch: config.supportsWebSearch,
          },
          falPricing: config.falPricing,
          name: config.name,
          pricing: config.pricing,
          type: config.type,
        },
      ])
    ),
    name: "motif",
    security_posture:
      "The agent is not a trusted operator. All inputs are validated. Output paths are sandboxed to CWD. Use --dry-run before mutating commands.",
    tools: {
      checkedAt: FAL_TOOLS_CHECKED_AT,
      registry: toolSchema().tools,
    },
    version: PACKAGE_VERSION,
  };
}

/** Run the describe command */
export function runDescribe(
  commandName: string | undefined,
  options: EmitOptions
): void {
  if (commandName) {
    const schemaFn = COMMAND_SCHEMAS[commandName];
    if (!schemaFn) {
      throw new Error(
        `Unknown command: ${commandName}. Available: ${Object.keys(COMMAND_SCHEMAS).join(", ")}`
      );
    }
    emit(schemaFn() as Record<string, unknown>, options);
  } else {
    emit(fullSchema(), options);
  }
}
