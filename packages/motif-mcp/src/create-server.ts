/**
 * createMotifMcpServer
 *
 * Factory function — creates and configures the Motif MCP server without
 * binding to a transport. Extracted for testability (InMemoryTransport tests).
 */

import {
  ASPECT_RATIOS,
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  EDIT_CAPABLE_MODELS,
  FAL_TOOLS,
  GENERATION_MODELS,
  IMAGE_EDITING_TOP_20,
  IMAGE_TEXT_TO_IMAGE_TOP_20,
  MODELS,
  RESOLUTIONS,
  VIDEO_IMAGE_TO_VIDEO_TOP_15,
  VIDEO_TEXT_TO_VIDEO_TOP_15,
} from "@howells/motif-sdk";
import type {
  AspectRatio,
  CreativeDirection,
  FalClient,
  ImageOutputFormat,
} from "@howells/motif-sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { readHistory } from "./history.js";

// ─── Preset → aspect resolution ─────────────────────────────────────

const PRESET_MAP: Record<string, AspectRatio> = {
  cover: "2:3",
  feed: "4:5",
  landscape: "16:9",
  og: "16:9",
  portrait: "2:3",
  reel: "9:16",
  square: "1:1",
  story: "9:16",
  ultra: "21:9",
  wallpaper: "9:16",
  wide: "21:9",
};

// ─── Shared outputSchema shapes ──────────────────────────────────────

const IMAGE_ITEM_SCHEMA = {
  properties: {
    height: { description: "Image height in pixels", type: "number" },
    url: {
      description: "Direct URL to the generated image",
      format: "uri",
      type: "string",
    },
    width: { description: "Image width in pixels", type: "number" },
  },
  required: ["url"],
  type: "object",
};

const IMAGES_ARRAY_SCHEMA = {
  description: "Generated images",
  items: IMAGE_ITEM_SCHEMA,
  type: "array",
};

const HISTORY_SCHEMA = {
  properties: {
    costs: {
      properties: {
        allTime: { type: "number" },
        session: { type: "number" },
        today: { type: "number" },
      },
      required: ["allTime", "session", "today"],
      type: "object",
    },
    generations: {
      items: {
        properties: {
          aspect: { type: "string" },
          cost: { type: "number" },
          editedFrom: { type: "string" },
          filePath: { type: "string" },
          id: { type: "string" },
          model: { type: "string" },
          prompt: { type: "string" },
          resolution: { type: "string" },
          timestamp: { type: "string" },
        },
        required: [
          "aspect",
          "cost",
          "filePath",
          "id",
          "model",
          "prompt",
          "resolution",
          "timestamp",
        ],
        type: "object",
      },
      type: "array",
    },
    hasMore: { type: "boolean" },
    limit: { type: "number" },
    offset: { type: "number" },
    total: { type: "number" },
  },
  required: ["costs", "generations", "hasMore", "limit", "offset", "total"],
  type: "object",
};

const RESOURCES = [
  {
    description:
      "Read-only registry of Motif model aliases, fal endpoints, pricing, and capabilities.",
    mimeType: "application/json",
    name: "models",
    title: "Motif Model Registry",
    uri: "motif://models",
  },
  {
    description:
      "Read-only registry of normalized fal utility tools exposed by the SDK.",
    mimeType: "application/json",
    name: "tools",
    title: "Motif Fal Utility Tool Registry",
    uri: "motif://tools",
  },
  {
    description:
      "Read-only Artificial Analysis leaderboard snapshots bundled with Motif metadata.",
    mimeType: "application/json",
    name: "leaderboards",
    title: "Motif Leaderboard Snapshots",
    uri: "motif://leaderboards",
  },
  {
    description:
      "JSON schema for local generation history. This resource does not expose user history values.",
    mimeType: "application/json",
    name: "history_schema",
    title: "Motif Local History Schema",
    uri: "motif://history/schema",
  },
];

function resourcePayload(uri: string): unknown {
  switch (uri) {
    case "motif://models": {
      return MODELS;
    }
    case "motif://tools": {
      return FAL_TOOLS;
    }
    case "motif://leaderboards": {
      return {
        image_editing_top_20: IMAGE_EDITING_TOP_20,
        image_text_to_image_top_20: IMAGE_TEXT_TO_IMAGE_TOP_20,
        video_image_to_video_top_15: VIDEO_IMAGE_TO_VIDEO_TOP_15,
        video_text_to_video_top_15: VIDEO_TEXT_TO_VIDEO_TOP_15,
      };
    }
    case "motif://history/schema": {
      return HISTORY_SCHEMA;
    }
    default: {
      return null;
    }
  }
}

function toolError(
  code: string,
  message: string,
  options: {
    isRetriable?: boolean;
    suggestions?: string[];
    traceId?: string;
  } = {}
) {
  const structured = {
    code,
    error: true,
    is_retriable: options.isRetriable ?? false,
    message,
    suggestions: options.suggestions ?? [],
    ...(options.traceId === undefined ? {} : { trace_id: options.traceId }),
  };

  return {
    content: [{ text: JSON.stringify(structured), type: "text" as const }],
    isError: true,
    structuredContent: structured,
  };
}

function invalidParams(message: string, suggestions: string[]) {
  return toolError("INVALID_PARAMS", message, { suggestions });
}

/**
 * Result of narrowing an optional enum argument.
 *
 * `ok: true` carries the matched member (or `undefined` when the argument was
 * absent); `ok: false` carries the user-facing validation message.
 */
type ParsedEnum<T> = { error: string; ok: false } | { ok: true; value?: T };

/**
 * Narrow an optional value to a member of `allowed`.
 *
 * Absent values are accepted as `undefined`; present values must match a
 * member exactly, otherwise a validation message is returned. Replaces blind
 * `args as {...}` casts with a real type guard now that MOT-10 added runtime
 * validation upstream.
 */
function parseOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): ParsedEnum<T> {
  if (value === undefined) {
    return { ok: true };
  }
  const match = allowed.find((option) => option === value);
  if (match === undefined) {
    return { error: `Invalid ${field}: ${JSON.stringify(value)}`, ok: false };
  }
  return { ok: true, value: match };
}

/** Narrow an optional value to a member of `allowed`, or `undefined`. */
function optionalOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  return allowed.find((option) => option === value);
}

/** Narrow an optional MCP argument to a boolean, or `undefined`. */
function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Narrow an optional MCP argument to a number, or `undefined`. */
function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/**
 * Recognize a creative-direction object.
 *
 * Only the object shape is checked here; option ids are validated by the SDK
 * (`buildGenerateBody`), which throws `CreativeOptionError` for unknown ids.
 */
function isCreativeDirection(value: unknown): value is CreativeDirection {
  return typeof value === "object" && value !== null;
}

/** Recognize an array whose members are all strings. */
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

const OUTPUT_FORMATS: readonly ImageOutputFormat[] = ["jpeg", "png", "webp"];
const INPUT_FIDELITIES = ["low", "high"] as const;
const UPSCALE_MODELS = ["clarity", "crystal"] as const;
const REMOVE_BACKGROUND_MODELS = ["rmbg", "bria"] as const;

/** Build a suggestion string listing valid enum values (truncated if long). */
function enumSuggestion(field: string, allowed: readonly string[]): string {
  const shown = allowed.slice(0, 20);
  const suffix = allowed.length > shown.length ? ", …" : "";
  return `Valid ${field} values: ${shown.join(", ")}${suffix}`;
}

function imageContent(image: {
  height?: null | number;
  url: string;
  width?: null | number;
}) {
  return {
    url: image.url,
    ...(typeof image.width === "number" && { width: image.width }),
    ...(typeof image.height === "number" && { height: image.height }),
  };
}

/**
 * Build the reusable creative direction input schema for MCP tools.
 *
 * The schema mirrors the SDK taxonomy so agents can discover valid option ids
 * before spending credits on `generate` or `vary`.
 */
function creativeInputSchema() {
  return {
    additionalProperties: false,
    description:
      "Optional creative direction choices that enrich the prompt before generation.",
    properties: Object.fromEntries(
      CREATIVE_FIELDS.map((field) => [
        field,
        {
          description: `Creative ${field} direction`,
          enum: CREATIVE_TAXONOMY[field].map((option) => option.id),
          type: "string",
        },
      ])
    ),
    type: "object",
  };
}

// ─── Tool definitions ────────────────────────────────────────────────

const TOOLS = [
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Generate Images",
    },
    description:
      "Generate images from a prompt using Motif's normalized fal model registry. Use when the user explicitly asks to create new image media and has accepted fal credit spend. Do not use for inspecting available models or past generations; read motif://models or call history instead. This calls fal.ai and returns remote image URLs.",
    inputSchema: {
      properties: {
        aspect: {
          description: "Aspect ratio for the output image",
          enum: ASPECT_RATIOS,
          type: "string",
        },
        creative: creativeInputSchema(),
        enableGoogleSearch: {
          description: "Enable fal enable_google_search where supported",
          type: "boolean",
        },
        enableWebSearch: {
          description: "Enable web search context where supported",
          type: "boolean",
        },
        model: {
          description:
            "Motif generation model alias. Read motif://models for current pricing, endpoints, and capabilities. Default: gpt",
          enum: GENERATION_MODELS,
          type: "string",
        },
        numImages: {
          description: "Number of images to generate (1-4, default 1)",
          maximum: 4,
          minimum: 1,
          type: "number",
        },
        outputFormat: {
          description: "Output image format where supported",
          enum: ["jpeg", "png", "webp"],
          type: "string",
        },
        preset: {
          description:
            "Named preset that sets aspect ratio. cover=2:3 (book), square=1:1, landscape=16:9, portrait=2:3, story/reel/wallpaper=9:16, feed=4:5, og=16:9, wide/ultra=21:9",
          enum: [
            "cover",
            "square",
            "landscape",
            "portrait",
            "story",
            "reel",
            "feed",
            "og",
            "wallpaper",
            "wide",
            "ultra",
          ],
          type: "string",
        },
        prompt: {
          description: "Description of the image to generate",
          type: "string",
        },
        resolution: {
          description: "Output resolution where supported",
          enum: RESOLUTIONS,
          type: "string",
        },
        seed: {
          description: "Reproducible generation seed where supported",
          type: "number",
        },
        transparent: {
          description:
            "Generate with transparent background (PNG output, GPT models only)",
          type: "boolean",
        },
      },
      required: ["prompt"],
      type: "object" as const,
    },
    name: "generate",
    outputSchema: {
      properties: {
        cost_estimate: { description: "Estimated cost in USD", type: "number" },
        images: IMAGES_ARRAY_SCHEMA,
        seed: {
          description: "Seed used for generation (where supported)",
          type: "number",
        },
      },
      required: ["images"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Upscale Image",
    },
    description:
      "Upscale an existing image URL to higher resolution. Use when the user already has a remote image URL and wants enhancement or enlargement. Do not use for local file paths unless another tool has uploaded them first. This calls fal.ai and returns remote image URLs.",
    inputSchema: {
      properties: {
        imageUrl: {
          description: "URL of the image to upscale",
          type: "string",
        },
        model: {
          description:
            "Upscale model to use. clarity=faster ($0.02), crystal=AI-enhanced detail ($0.02). Default: clarity",
          enum: ["clarity", "crystal"],
          type: "string",
        },
      },
      required: ["imageUrl"],
      type: "object" as const,
    },
    name: "upscale",
    outputSchema: {
      properties: {
        images: {
          description: "Upscaled image(s)",
          items: IMAGE_ITEM_SCHEMA,
          type: "array",
        },
      },
      required: ["images"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Remove Background",
    },
    description:
      "Remove the background from an existing image URL and return a transparent PNG. Use for product cutouts, masks, and compositing inputs. Do not use for prompt-based generation or local file paths unless another tool has uploaded them first. This calls fal.ai.",
    inputSchema: {
      properties: {
        imageUrl: {
          description: "URL of the image to process",
          type: "string",
        },
        model: {
          description:
            "Background removal model. rmbg=BiRefNet ($0.02), bria=Bria RMBG 2.0 ($0.02). Default: rmbg",
          enum: ["rmbg", "bria"],
          type: "string",
        },
      },
      required: ["imageUrl"],
      type: "object" as const,
    },
    name: "remove_background",
    outputSchema: {
      properties: {
        images: {
          description: "Processed image(s) with background removed",
          items: {
            properties: {
              url: {
                description: "URL to the PNG with transparent background",
                format: "uri",
                type: "string",
              },
            },
            required: ["url"],
            type: "object",
          },
          type: "array",
        },
      },
      required: ["images"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
      title: "Generate Variation",
    },
    description:
      "Generate prompt-guided variations or edits from one or more reference image URLs. Use when the user wants an existing image transformed while preserving some visual context. Do not use for pure text-to-image generation; use generate instead. This calls fal.ai and returns remote image URLs.",
    inputSchema: {
      properties: {
        creative: creativeInputSchema(),
        imageUrls: {
          description: "Reference image URLs to use as a base (at least one)",
          items: { type: "string" },
          minItems: 1,
          type: "array",
        },
        inputFidelity: {
          description:
            "How closely to follow the reference image. low=loose inspiration, high=faithful reproduction",
          enum: ["low", "high"],
          type: "string",
        },
        model: {
          description:
            "Model to use for variation. Must support image editing. Read motif://models for current reference limits and capabilities. Default: gpt",
          enum: EDIT_CAPABLE_MODELS,
          type: "string",
        },
        prompt: {
          description:
            "Prompt describing the desired changes or new image based on the reference(s)",
          type: "string",
        },
      },
      required: ["prompt", "imageUrls"],
      type: "object" as const,
    },
    name: "vary",
    outputSchema: {
      properties: {
        cost_estimate: { description: "Estimated cost in USD", type: "number" },
        images: IMAGES_ARRAY_SCHEMA,
      },
      required: ["images"],
      type: "object",
    },
  },
  {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
      title: "Generation History",
    },
    description:
      "List recent image generations from the local CLI history (~/.motif/history.json). Use only when the user wants local Motif history, costs, prompts, or file paths exposed to this MCP client. Do not call for model metadata; read motif://models instead.",
    inputSchema: {
      properties: {
        limit: {
          description:
            "Maximum number of generations to return (1-50, default 10)",
          maximum: 50,
          minimum: 1,
          type: "number",
        },
        offset: {
          description:
            "Number of generations to skip for pagination (default 0)",
          minimum: 0,
          type: "number",
        },
      },
      required: [],
      type: "object" as const,
    },
    name: "history",
    outputSchema: {
      properties: {
        costs: {
          properties: {
            allTime: {
              description: "Total spend across all time (USD)",
              type: "number",
            },
            session: {
              description: "Spend in the current session (USD)",
              type: "number",
            },
            today: { description: "Spend today (USD)", type: "number" },
          },
          required: ["allTime", "session", "today"],
          type: "object",
        },
        generations: {
          description: "Generations, newest first",
          items: {
            properties: {
              aspect: { description: "Aspect ratio used", type: "string" },
              cost: {
                description: "Cost of this generation (USD)",
                type: "number",
              },
              editedFrom: {
                description:
                  "ID of the source generation if this was a variation",
                type: "string",
              },
              filePath: {
                description: "Local file path where the image was saved",
                type: "string",
              },
              id: { description: "Unique generation ID", type: "string" },
              model: { description: "Model alias used", type: "string" },
              prompt: {
                description: "Prompt used to generate the image",
                type: "string",
              },
              resolution: {
                description: "Resolution setting used",
                type: "string",
              },
              timestamp: {
                description: "ISO 8601 timestamp of the generation",
                type: "string",
              },
            },
            required: [
              "aspect",
              "cost",
              "filePath",
              "id",
              "model",
              "prompt",
              "resolution",
              "timestamp",
            ],
            type: "object",
          },
          type: "array",
        },
        hasMore: {
          description: "Whether more generations exist beyond this page",
          type: "boolean",
        },
        limit: { description: "Limit applied to this page", type: "number" },
        offset: { description: "Offset applied to this page", type: "number" },
        total: {
          description: "Total number of generations in history",
          type: "number",
        },
      },
      required: ["costs", "generations", "hasMore", "limit", "offset", "total"],
      type: "object",
    },
  },
];

// ─── Server factory ──────────────────────────────────────────────────

/**
 * Create a Motif MCP server without binding it to a transport.
 *
 * The caller owns the `FalClient` instance and chooses stdio, in-memory, or
 * another MCP transport; this factory only registers Motif resources and tools.
 */
// oxlint-disable-next-line no-deprecated -- Deliberate, not pending: the SDK's own deprecation note blesses the low-level Server for "advanced use cases", which this is. McpServer.registerTool requires zod (ZodRawShapeCompat) schemas; adopting it would add a zod runtime dependency to this lean package and rewrite every hand-authored tool schema — schemas that are derived from the SDK model registry and mirrored byte-for-byte by `motif --describe`. The low-level Server keeps that single source of truth. Revisit only if the SDK hard-removes Server.
export function createMotifMcpServer(motif: FalClient): Server {
  // oxlint-disable-next-line no-deprecated -- See createMotifMcpServer note above: deliberate low-level Server use.
  const server = new Server(
    { name: "motif", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} } }
  );

  // ── List tools ────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

  // ── List resources ────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: RESOURCES,
  }));

  // ── Read resource ─────────────────────────────────────────────────

  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    const { uri } = request.params;
    const payload = resourcePayload(uri);

    if (payload === null) {
      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }

    return {
      contents: [
        {
          mimeType: "application/json",
          text: JSON.stringify(payload),
          uri,
        },
      ],
    };
  });

  // ── Call tool ─────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = request.params.arguments ?? {};

    // ── generate ──────────────────────────────────────────────────

    if (name === "generate") {
      const prompt = args.prompt;
      if (typeof prompt !== "string" || prompt.trim() === "") {
        return invalidParams("generate requires a non-empty string prompt.", [
          "Pass a prompt describing the image to generate.",
        ]);
      }
      const modelParse = parseOptionalEnum(
        args.model,
        GENERATION_MODELS,
        "model"
      );
      if (!modelParse.ok) {
        return invalidParams(modelParse.error, [
          enumSuggestion("model", GENERATION_MODELS),
        ]);
      }
      const model = modelParse.value ?? "gpt";

      const numImagesArg = args.numImages;
      const numImages = numImagesArg === undefined ? 1 : numImagesArg;
      if (
        typeof numImages !== "number" ||
        !Number.isInteger(numImages) ||
        numImages < 1 ||
        numImages > 4
      ) {
        return invalidParams(
          `Invalid numImages: ${JSON.stringify(numImages)}. Must be an integer between 1 and 4.`,
          ["Choose numImages in the range 1-4."]
        );
      }

      const preset = args.preset;
      if (
        preset !== undefined &&
        (typeof preset !== "string" || !(preset in PRESET_MAP))
      ) {
        return invalidParams(`Invalid preset: ${JSON.stringify(preset)}`, [
          enumSuggestion("preset", Object.keys(PRESET_MAP)),
        ]);
      }
      const aspectParse = parseOptionalEnum(
        args.aspect,
        ASPECT_RATIOS,
        "aspect"
      );
      if (!aspectParse.ok) {
        return invalidParams(aspectParse.error, [
          enumSuggestion("aspect", ASPECT_RATIOS),
        ]);
      }
      const resolutionParse = parseOptionalEnum(
        args.resolution,
        RESOLUTIONS,
        "resolution"
      );
      if (!resolutionParse.ok) {
        return invalidParams(resolutionParse.error, [
          enumSuggestion("resolution", RESOLUTIONS),
        ]);
      }

      const resolvedAspect =
        (preset === undefined ? undefined : PRESET_MAP[preset]) ??
        aspectParse.value ??
        "1:1";

      const result = await motif.generate({
        aspect: resolvedAspect,
        creative: isCreativeDirection(args.creative)
          ? args.creative
          : undefined,
        enableGoogleSearch: optionalBoolean(args.enableGoogleSearch),
        enableWebSearch: optionalBoolean(args.enableWebSearch),
        model,
        numImages,
        outputFormat: optionalOneOf(args.outputFormat, OUTPUT_FORMATS),
        prompt,
        resolution: resolutionParse.value,
        seed: optionalNumber(args.seed),
        transparent: optionalBoolean(args.transparent),
      });

      if (result.isErr()) {
        return toolError("GENERATION_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: [
            "Check that FAL_KEY is valid.",
            "Try a cheaper or simpler model if fal rejects the request.",
          ],
          traceId: result.error.requestId,
        });
      }

      const costEstimate = motif.estimateCost(model, undefined, numImages);

      const structured = {
        cost_estimate: costEstimate,
        images: result.value.images.map(imageContent),
        seed: result.value.seed,
      };

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    // ── upscale ───────────────────────────────────────────────────

    if (name === "upscale") {
      const imageUrl = args.imageUrl;
      if (typeof imageUrl !== "string") {
        return invalidParams("upscale requires a string imageUrl.", [
          "Pass the URL of the image to upscale.",
        ]);
      }
      const modelParse = parseOptionalEnum(args.model, UPSCALE_MODELS, "model");
      if (!modelParse.ok) {
        return invalidParams(modelParse.error, [
          enumSuggestion("model", UPSCALE_MODELS),
        ]);
      }

      const result = await motif.upscale({
        imageUrl,
        model: modelParse.value ?? "clarity",
      });

      if (result.isErr()) {
        return toolError("UPSCALE_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: ["Check the input image URL and retry."],
          traceId: result.error.requestId,
        });
      }

      const structured = {
        images: result.value.images.map(imageContent),
      };

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    // ── remove_background ─────────────────────────────────────────

    if (name === "remove_background") {
      const imageUrl = args.imageUrl;
      if (typeof imageUrl !== "string") {
        return invalidParams("remove_background requires a string imageUrl.", [
          "Pass the URL of the image to process.",
        ]);
      }
      const modelParse = parseOptionalEnum(
        args.model,
        REMOVE_BACKGROUND_MODELS,
        "model"
      );
      if (!modelParse.ok) {
        return invalidParams(modelParse.error, [
          enumSuggestion("model", REMOVE_BACKGROUND_MODELS),
        ]);
      }

      const result = await motif.removeBackground({
        imageUrl,
        model: modelParse.value ?? "rmbg",
      });

      if (result.isErr()) {
        return toolError("REMOVE_BACKGROUND_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: ["Check the input image URL and retry."],
          traceId: result.error.requestId,
        });
      }

      const structured = {
        images: result.value.images.map((img) => ({ url: img.url })),
      };

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    // ── vary ──────────────────────────────────────────────────────

    if (name === "vary") {
      const prompt = args.prompt;
      if (typeof prompt !== "string" || prompt.trim() === "") {
        return invalidParams("vary requires a non-empty string prompt.", [
          "Pass a prompt describing the desired changes.",
        ]);
      }
      const imageUrls = args.imageUrls;
      if (!isStringArray(imageUrls) || imageUrls.length === 0) {
        return invalidParams("vary requires a non-empty imageUrls array.", [
          "Pass at least one reference image URL in imageUrls.",
        ]);
      }
      const modelParse = parseOptionalEnum(
        args.model,
        EDIT_CAPABLE_MODELS,
        "model"
      );
      if (!modelParse.ok) {
        return invalidParams(modelParse.error, [
          enumSuggestion("model", EDIT_CAPABLE_MODELS),
        ]);
      }
      const model = modelParse.value ?? "gpt";

      const result = await motif.generate({
        creative: isCreativeDirection(args.creative)
          ? args.creative
          : undefined,
        editImageUrls: imageUrls,
        inputFidelity: optionalOneOf(args.inputFidelity, INPUT_FIDELITIES),
        model,
        prompt,
      });

      if (result.isErr()) {
        return toolError("VARIATION_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: [
            "Check that each reference URL is reachable.",
            "Try a model that supports image editing.",
          ],
          traceId: result.error.requestId,
        });
      }

      const costEstimate = motif.estimateCost(model, undefined, 1);

      const structured = {
        cost_estimate: costEstimate,
        images: result.value.images.map(imageContent),
      };

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    // ── history ───────────────────────────────────────────────────

    if (name === "history") {
      const limitArg = args.limit;
      const limit = limitArg === undefined ? 10 : limitArg;
      const offsetArg = args.offset;
      const offset = offsetArg === undefined ? 0 : offsetArg;

      if (
        typeof limit !== "number" ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50
      ) {
        return invalidParams(
          `Invalid limit: ${JSON.stringify(limit)}. Must be an integer between 1 and 50.`,
          ["Choose limit in the range 1-50."]
        );
      }
      if (
        typeof offset !== "number" ||
        !Number.isInteger(offset) ||
        offset < 0
      ) {
        return invalidParams(
          `Invalid offset: ${JSON.stringify(offset)}. Must be a non-negative integer.`,
          ["Choose offset >= 0."]
        );
      }

      const structured = readHistory(limit, offset);

      return {
        content: [{ text: JSON.stringify(structured), type: "text" }],
        structuredContent: structured,
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  });

  return server;
}
