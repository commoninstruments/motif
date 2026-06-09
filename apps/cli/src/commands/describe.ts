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
import { type EmitOptions, emit } from "../utils/output";
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
        type: "string",
        enum: CREATIVE_TAXONOMY[field].map((option) => option.id),
        description: `Creative direction ${field} id`,
        enumDescriptions: Object.fromEntries(
          CREATIVE_TAXONOMY[field].map((option) => [
            option.id,
            {
              label: option.label,
              description: option.description,
              clause: option.clause,
            },
          ]),
        ),
      },
    ]),
  );
}

/** JSON Schema for the generate command's input */
function generateSchema() {
  return {
    command: "generate",
    description: "Generate an image from a text prompt",
    mutating: true,
    supports_dry_run: true,
    input: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: {
          type: "string",
          description: "Text description of the image to generate",
        },
        model: {
          type: "string",
          enum: GENERATION_MODELS,
          default: "banana",
          description: "Generation model to use",
          enumDescriptions: Object.fromEntries(
            GENERATION_MODELS.map((m) => [
              m,
              {
                name: MODELS[m]?.name,
                pricing: MODELS[m]?.pricing,
                falPricing: MODELS[m]?.falPricing,
                benchmark: MODELS[m]?.benchmark,
                supportsEdit: MODELS[m]?.supportsEdit,
                supportsAspect: MODELS[m]?.supportsAspect,
                supportsResolution: MODELS[m]?.supportsResolution,
                supportsBackground: MODELS[m]?.supportsBackground,
                supportsGoogleSearch: MODELS[m]?.supportsGoogleSearch,
                supportsImagePromptStrength:
                  MODELS[m]?.supportsImagePromptStrength,
                supportsLimitGenerations: MODELS[m]?.supportsLimitGenerations,
                supportsMaskImage: MODELS[m]?.supportsMaskImage,
                supportsQuality: MODELS[m]?.supportsQuality,
                supportsSafetyChecker: MODELS[m]?.supportsSafetyChecker,
                supportsSyncMode: MODELS[m]?.supportsSyncMode,
                supportsThinkingLevel: MODELS[m]?.supportsThinkingLevel,
                supportedOutputFormats: MODELS[m]?.supportedOutputFormats,
                maxReferenceImages: MODELS[m]?.maxReferenceImages,
              },
            ]),
          ),
        },
        aspect: {
          type: "string",
          enum: ASPECT_RATIOS,
          default: "1:1",
          description: "Aspect ratio of the generated image",
        },
        resolution: {
          type: "string",
          enum: RESOLUTIONS,
          default: "2K",
          description: "Output resolution (not all models support this)",
        },
        numImages: {
          type: "integer",
          minimum: 1,
          maximum: 4,
          default: 1,
          description: "Number of images to generate",
        },
        output: {
          type: "string",
          description:
            "Output filename (must be within CWD). Auto-generated if omitted.",
        },
        editImages: {
          type: "array",
          items: { type: "string" },
          description:
            "Local file paths for reference/edit images. Uploaded automatically.",
        },
        transparent: {
          type: "boolean",
          default: false,
          description: "Transparent background (GPT model only)",
        },
        background: {
          type: "string",
          enum: ["auto", "transparent", "opaque"],
          description: "Background mode for GPT Image models",
        },
        quality: {
          type: "string",
          enum: ["auto", "low", "medium", "high"],
          description: "Image quality for GPT/OpenAI image models",
        },
        imageSize: {
          oneOf: [
            {
              type: "string",
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
            },
            {
              type: "object",
              required: ["width", "height"],
              properties: {
                width: { type: "integer", minimum: 1 },
                height: { type: "integer", minimum: 1 },
              },
            },
          ],
          description:
            "Direct fal image_size override. WIDTHxHEIGHT is accepted by CLI and normalized to { width, height } where supported.",
        },
        syncMode: {
          type: "boolean",
          description:
            "Ask fal to return media as data URI and omit it from request history where supported",
        },
        ephemeral: {
          type: "boolean",
          default: false,
          description:
            "Save output locally, send X-Fal-Store-IO: 0, skip Motif history, then delete fal request IO payloads when fal returns a request id",
        },
        maskImageUrl: {
          type: "string",
          description: "Mask image URL for supported edit/inpainting models",
        },
        inputFidelity: {
          type: "string",
          enum: ["low", "high"],
          description:
            'How closely to follow reference images. "low" = loose inspiration (GPT only)',
        },
        enableWebSearch: {
          type: "boolean",
          description: "Enable web search where supported",
        },
        enableGoogleSearch: {
          type: "boolean",
          description: "Enable fal enable_google_search where supported",
        },
        enableSafetyChecker: {
          type: "boolean",
          description: "Enable or disable fal safety checker where supported",
        },
        limitGenerations: {
          type: "boolean",
          description: "Limit model-internal generation rounds where supported",
        },
        thinkingLevel: {
          type: "string",
          enum: ["minimal", "high"],
          description: "Nano Banana 2 thinking level",
        },
        imagePromptStrength: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "Reference image strength for models that expose image_prompt_strength",
        },
        noOpen: {
          type: "boolean",
          default: false,
          description: "Don't open image in viewer after generation",
        },
        ...creativeSchemaProperties(),
      },
    },
    output: {
      type: "object",
      properties: {
        id: { type: "string", description: "Generation ID (UUID)" },
        prompt: { type: "string" },
        model: { type: "string" },
        aspect: { type: "string" },
        resolution: { type: "string" },
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Local file path" },
              width: { type: "integer" },
              height: { type: "integer" },
              size: {
                type: "string",
                description: 'Human-readable, e.g. "1.2MB"',
              },
            },
          },
        },
        cost: { type: "number", description: "Estimated cost in USD" },
        historyRecorded: {
          type: "boolean",
          description: "False for ephemeral generations",
        },
        payloadsDeleted: {
          type: "boolean",
          description:
            "Whether Motif deleted fal request IO payloads after local download",
        },
        requestId: {
          type: "string",
          description: "fal request id, included when fal returns one",
        },
        timestamp: { type: "string", format: "date-time" },
      },
    },
    presets: {
      cover: {
        aspect: "2:3",
        resolution: "2K",
        description: "Kindle/eBook cover",
      },
      square: { aspect: "1:1", description: "Square" },
      landscape: { aspect: "16:9", description: "Landscape" },
      portrait: { aspect: "2:3", description: "Portrait" },
      story: { aspect: "9:16", description: "Instagram/TikTok Story" },
      reel: { aspect: "9:16", description: "Instagram Reel" },
      feed: { aspect: "4:5", description: "Instagram Feed" },
      og: { aspect: "16:9", description: "Open Graph / social share" },
      wallpaper: {
        aspect: "9:16",
        resolution: "2K",
        description: "iPhone wallpaper",
      },
      wide: { aspect: "21:9", description: "Cinematic wide" },
      ultra: {
        aspect: "21:9",
        resolution: "2K",
        description: "Ultra-wide banner",
      },
    },
  };
}

function upscaleSchema() {
  return {
    command: "upscale",
    description: "Upscale an image to higher resolution",
    mutating: true,
    supports_dry_run: true,
    input: {
      type: "object",
      required: [],
      properties: {
        imagePath: {
          type: "string",
          description:
            "Path to image to upscale. Falls back to last generated image.",
        },
        model: {
          type: "string",
          enum: ["clarity", "crystal"],
          default: "clarity",
          description: "Upscaler model",
        },
        scale: {
          type: "integer",
          enum: [2, 4, 6, 8],
          default: 2,
          description: "Upscale factor",
        },
        output: {
          type: "string",
          description:
            "Output filename (CWD-sandboxed). Default: writes alongside source image.",
        },
        noOpen: {
          type: "boolean",
          default: false,
        },
      },
    },
    output: {
      type: "object",
      properties: {
        path: { type: "string" },
        width: { type: "integer" },
        height: { type: "integer" },
        size: { type: "string" },
        cost: { type: "number" },
      },
    },
  };
}

function removeBackgroundSchema() {
  return {
    command: "rmbg",
    description: "Remove background from the last generated image",
    mutating: true,
    supports_dry_run: true,
    input: {
      type: "object",
      properties: {
        model: {
          type: "string",
          enum: ["rmbg", "bria"],
          default: "rmbg",
          description: "Background removal model",
        },
        output: { type: "string", description: "Output filename" },
        noOpen: { type: "boolean", default: false },
      },
    },
    output: {
      type: "object",
      properties: {
        path: { type: "string" },
        width: { type: "integer" },
        height: { type: "integer" },
        size: { type: "string" },
        cost: { type: "number" },
      },
    },
  };
}

function varySchema() {
  return {
    command: "vary",
    description: "Generate variations of the last generated image",
    mutating: true,
    supports_dry_run: true,
    input: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Custom prompt (defaults to last generation's prompt)",
        },
        numImages: {
          type: "integer",
          minimum: 1,
          maximum: 4,
          default: 4,
        },
        model: { type: "string", enum: GENERATION_MODELS },
        aspect: { type: "string", enum: ASPECT_RATIOS },
        resolution: { type: "string", enum: RESOLUTIONS },
      },
    },
    output: { $ref: "#/commands/generate/output" },
  };
}

function lastSchema() {
  return {
    command: "last",
    description: "Show information about the last generation",
    mutating: false,
    input: { type: "object", properties: {} },
    output: {
      type: "object",
      properties: {
        id: { type: "string" },
        prompt: { type: "string" },
        model: { type: "string" },
        aspect: { type: "string" },
        resolution: { type: "string" },
        output: { type: "string" },
        cost: { type: "number" },
        timestamp: { type: "string", format: "date-time" },
      },
    },
  };
}

function historySchema() {
  return {
    command: "history",
    description: "List generation history",
    mutating: false,
    input: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          default: 10,
          description: "Number of entries to return",
        },
        offset: {
          type: "integer",
          default: 0,
          description: "Skip first N entries",
        },
      },
    },
    output: {
      type: "object",
      properties: {
        generations: {
          type: "array",
          items: { $ref: "#/commands/last/output" },
        },
        total: { type: "integer" },
        costs: {
          type: "object",
          properties: {
            session: { type: "number" },
            today: { type: "number" },
            allTime: { type: "number" },
          },
        },
      },
    },
  };
}

function videoSchema() {
  return {
    command: "video",
    description: "Generate video from an image using Kling v3 Pro",
    mutating: true,
    supports_dry_run: true,
    input: {
      type: "object",
      required: ["imagePath"],
      properties: {
        imagePath: {
          type: "string",
          description:
            "Path to source image. Falls back to last generated image.",
        },
        prompt: {
          type: "string",
          default: "cinematic motion, smooth camera movement",
          description: "Text description of the motion/scene",
        },
        duration: {
          type: "integer",
          minimum: 3,
          maximum: 15,
          default: 5,
          description: "Video duration in seconds",
        },
        generateAudio: {
          type: "boolean",
          default: true,
          description: "Generate audio track (costs ~50% more when enabled)",
        },
        output: {
          type: "string",
          description: "Output filename (.mp4)",
        },
        noOpen: {
          type: "boolean",
          default: false,
        },
      },
    },
    output: {
      type: "object",
      properties: {
        path: { type: "string" },
        source: { type: "string" },
        prompt: { type: "string" },
        duration: { type: "integer" },
        generateAudio: { type: "boolean" },
        model: { type: "string" },
        size: { type: "string" },
        cost: { type: "number" },
      },
    },
    cost_reference: {
      audio_off: "$0.112/sec (5s = $0.56)",
      audio_on: "$0.168/sec (5s = $0.84)",
      note: "Video is significantly more expensive than images. Always use --dry-run first.",
    },
  };
}

function toolSchema() {
  return {
    command: "tool",
    description:
      "List, describe, and run fal.ai utility tools such as SAM segmentation, Topaz upscale, Bria background removal, and moderation.",
    mutating: true,
    supports_dry_run: true,
    subcommands: ["list", "describe", "run"],
    checkedAt: FAL_TOOLS_CHECKED_AT,
    input: {
      type: "object",
      required: ["tool", "input"],
      properties: {
        tool: {
          type: "string",
          enum: FAL_TOOL_IDS,
          description: "Registered fal utility tool ID",
        },
        input: {
          type: "string",
          description:
            "Image/video URL or local file path. Local files are uploaded automatically.",
        },
        inputs: {
          type: "array",
          items: { type: "string" },
          description: "Multiple image inputs for batch tools such as nsfw.",
        },
        prompt: {
          type: "string",
          description:
            "Prompt for SAM segmentation or 3D reconstruction tools.",
        },
        output: {
          type: "string",
          description:
            "Download the primary URL-like output to this file when available.",
        },
        options: {
          type: "object",
          description:
            "Provider-specific options passed with --json or repeatable --option key=value.",
        },
      },
    },
    tools: Object.fromEntries(
      FAL_TOOL_IDS.map((id) => [
        id,
        {
          name: FAL_TOOLS[id].name,
          endpoint: FAL_TOOLS[id].endpoint,
          category: FAL_TOOLS[id].category,
          task: FAL_TOOLS[id].task,
          inputKind: FAL_TOOLS[id].inputKind,
          defaultOptions:
            "defaultOptions" in FAL_TOOLS[id]
              ? FAL_TOOLS[id].defaultOptions
              : undefined,
          outputKeys: FAL_TOOLS[id].outputKeys,
          pricing: FAL_TOOLS[id].pricing,
          sourceUrl: FAL_TOOLS[id].sourceUrl,
        },
      ]),
    ),
  };
}

function describeSchema() {
  return {
    command: "describe",
    description: "Introspect CLI schema (this command)",
    mutating: false,
    input: {
      type: "object",
      properties: {
        command: {
          type: "string",
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
          description: "Specific command to describe (omit for all)",
        },
      },
    },
  };
}

function seriesSchema() {
  return {
    command: "series",
    description:
      "Manage reusable image series and run themed multi-image generation plans with shared style, tone, references, and history.",
    mutating: true,
    supports_dry_run: true,
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
    input: {
      type: "object",
      properties: {
        command: {
          type: "string",
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
          description: "Series command for stdin JSON payloads",
        },
        theme: {
          type: "string",
          description:
            'High-level creative brief for series run, e.g. "brutalist architecture".',
        },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 24,
          default: 4,
          description: "Number of scene prompts/images in a series run",
        },
        numImages: {
          type: "integer",
          minimum: 1,
          maximum: 24,
          description: "Alias for count in stdin JSON series-run payloads.",
        },
        series: {
          type: "string",
          description:
            "Existing series slug. Omit for series run to auto-create or reuse a series from the theme when generating.",
        },
        prompt: {
          type: "string",
          description:
            "Single scene prompt for series gen, or alias for theme in stdin series-run.",
        },
        stylePrompt: {
          type: "string",
          description:
            "Shared style/tone prompt stored on a series or applied to a series run.",
        },
        refs: {
          type: "string",
          description:
            "Comma-separated reference tags to include from an existing series.",
        },
        model: {
          type: "string",
          enum: GENERATION_MODELS,
          default: "banana",
          description:
            "Generation model. banana is recommended for series because it supports up to 14 references.",
        },
        aspect: {
          type: "string",
          enum: ASPECT_RATIOS,
          default: "1:1",
        },
        resolution: {
          type: "string",
          enum: RESOLUTIONS,
          default: "2K",
        },
        dryRun: {
          type: "boolean",
          default: false,
          description:
            "Plan prompts, references, and cost without calling fal or requiring FAL_KEY.",
        },
        noOpen: { type: "boolean", default: false },
      },
    },
    output: {
      type: "object",
      properties: {
        command: { type: "string" },
        series: { type: ["string", "null"] },
        theme: { type: "string" },
        stylePrompt: { type: "string" },
        scenes: {
          type: "array",
          description:
            "Series run plan with one scene prompt per generated image.",
          items: {
            type: "object",
            properties: {
              index: { type: "integer" },
              scenePrompt: { type: "string" },
              prompt: { type: "string" },
            },
          },
        },
        images: {
          type: "array",
          description: "Saved image outputs for non-dry-run series runs.",
        },
        estimatedCost: { type: "number" },
        cost: { type: "number" },
      },
    },
    examples: [
      'motif series run "brutalist architecture" --count 6 --dry-run --format json',
      'motif series create "Luna Adventure" --style "watercolor children\'s book" -m banana',
      'motif series gen luna-adventure "Luna enters the forest" --refs character,location --dry-run',
    ],
  };
}

const COMMAND_SCHEMAS: Record<string, () => object> = {
  generate: generateSchema,
  upscale: upscaleSchema,
  rmbg: removeBackgroundSchema,
  vary: varySchema,
  video: videoSchema,
  series: seriesSchema,
  tool: toolSchema,
  last: lastSchema,
  history: historySchema,
  describe: describeSchema,
  errors: () => ({
    command: "errors",
    description: "Inspect machine-readable CLI error metadata",
    mutating: false,
    output: {
      type: "object",
      properties: {
        errors: {
          type: "object",
          description:
            "Known error codes keyed by code, with status, retryability, local doc URI, and recovery suggestions.",
        },
      },
    },
    errors: ERROR_CATALOG,
  }),
};

/** Full CLI schema with all commands, models, and runtime state */
function fullSchema() {
  return {
    name: "motif",
    version: PACKAGE_VERSION,
    description: "fal.ai image generation CLI",
    security_posture:
      "The agent is not a trusted operator. All inputs are validated. Output paths are sandboxed to CWD. Use --dry-run before mutating commands.",
    global_flags: {
      "--format <json|human|ndjson>":
        "Output format. Default: human (TTY) or json (piped).",
      "--fields <field1,field2,...>":
        "Comma-separated field names to include in output. Omit for all fields.",
      "--dry-run":
        "Validate inputs and show what would happen without making API calls.",
      "--ephemeral":
        "Save output locally, disable fal IO storage where supported, skip Motif history, and delete fal request payloads after download.",
      "--no-open": "Don't open image in viewer after generation.",
    },
    input_modes: {
      flags: "Traditional CLI flags (e.g. motif 'a cat' -m gpt --og)",
      stdin_json:
        'Pipe a JSON payload to stdin: echo \'{"prompt":"a cat","model":"gpt"}\' | motif',
      combined: "Stdin JSON for base config, flags override specific fields.",
    },
    commands: Object.fromEntries(
      Object.entries(COMMAND_SCHEMAS).map(([name, fn]) => [name, fn()]),
    ),
    models: Object.fromEntries(
      Object.entries(MODELS).map(([key, config]) => [
        key,
        {
          name: config.name,
          type: config.type,
          pricing: config.pricing,
          falPricing: config.falPricing,
          benchmark: config.benchmark,
          capabilities: {
            aspect: config.supportsAspect,
            resolution: config.supportsResolution,
            edit: config.supportsEdit,
            numImages: config.supportsNumImages,
            maxReferenceImages: config.maxReferenceImages,
            outputFormat: config.supportsOutputFormat,
            supportedOutputFormats: config.supportedOutputFormats,
            seed: config.supportsSeed,
            safetyTolerance: config.supportsSafetyTolerance,
            webSearch: config.supportsWebSearch,
            guidanceScale: config.supportsGuidanceScale,
            inferenceSteps: config.supportsInferenceSteps,
          },
        },
      ]),
    ),
    leaderboards: {
      image_text_to_image_top_20: IMAGE_TEXT_TO_IMAGE_TOP_20,
      image_editing_top_20: IMAGE_EDITING_TOP_20,
      video_text_to_video_top_15: VIDEO_TEXT_TO_VIDEO_TOP_15,
      video_image_to_video_top_15: VIDEO_IMAGE_TO_VIDEO_TOP_15,
    },
    tools: {
      checkedAt: FAL_TOOLS_CHECKED_AT,
      registry: toolSchema().tools,
    },
    errors: ERROR_CATALOG,
    enums: {
      aspect_ratios: ASPECT_RATIOS,
      resolutions: RESOLUTIONS,
      generation_models: GENERATION_MODELS,
      utility_models: UTILITY_MODELS,
      fal_tools: FAL_TOOL_IDS,
      video_models: VIDEO_MODELS,
    },
  };
}

/** Run the describe command */
export function runDescribe(
  commandName: string | undefined,
  options: EmitOptions,
): void {
  if (commandName) {
    const schemaFn = COMMAND_SCHEMAS[commandName];
    if (!schemaFn) {
      throw new Error(
        `Unknown command: ${commandName}. Available: ${Object.keys(COMMAND_SCHEMAS).join(", ")}`,
      );
    }
    emit(schemaFn() as Record<string, unknown>, options);
  } else {
    emit(fullSchema() as unknown as Record<string, unknown>, options);
  }
}
