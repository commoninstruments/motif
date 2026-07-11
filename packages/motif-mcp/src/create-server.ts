/**
 * createMotifMcpServer
 *
 * Factory function — creates and configures the Motif MCP server without
 * binding to a transport. Extracted for testability (InMemoryTransport tests).
 */

import type { MotifServer } from "@howells/motif-sdk";
import {
  ASPECT_RATIOS,
  type AspectRatio,
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  type CreativeDirection,
  EDIT_CAPABLE_MODELS,
  FAL_TOOLS,
  GENERATION_MODELS,
  IMAGE_EDITING_TOP_20,
  IMAGE_TEXT_TO_IMAGE_TOP_20,
  type ImageOutputFormat,
  MODELS,
  RESOLUTIONS,
  type Resolution,
  VIDEO_IMAGE_TO_VIDEO_TOP_15,
  VIDEO_TEXT_TO_VIDEO_TOP_15,
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
  square: "1:1",
  landscape: "16:9",
  portrait: "2:3",
  story: "9:16",
  reel: "9:16",
  feed: "4:5",
  og: "16:9",
  wallpaper: "9:16",
  wide: "21:9",
  ultra: "21:9",
};

// ─── Shared outputSchema shapes ──────────────────────────────────────

const IMAGE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    url: {
      type: "string",
      format: "uri",
      description: "Direct URL to the generated image",
    },
    width: { type: "number", description: "Image width in pixels" },
    height: { type: "number", description: "Image height in pixels" },
  },
  required: ["url"],
};

const IMAGES_ARRAY_SCHEMA = {
  type: "array",
  items: IMAGE_ITEM_SCHEMA,
  description: "Generated images",
};

const HISTORY_SCHEMA = {
  type: "object",
  properties: {
    costs: {
      type: "object",
      properties: {
        allTime: { type: "number" },
        session: { type: "number" },
        today: { type: "number" },
      },
      required: ["allTime", "session", "today"],
    },
    generations: {
      type: "array",
      items: {
        type: "object",
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
      },
    },
    hasMore: { type: "boolean" },
    limit: { type: "number" },
    offset: { type: "number" },
    total: { type: "number" },
  },
  required: ["costs", "generations", "hasMore", "limit", "offset", "total"],
};

const RESOURCES = [
  {
    uri: "motif://models",
    name: "models",
    title: "Motif Model Registry",
    description:
      "Read-only registry of Motif model aliases, fal endpoints, pricing, and capabilities.",
    mimeType: "application/json",
  },
  {
    uri: "motif://tools",
    name: "tools",
    title: "Motif Fal Utility Tool Registry",
    description:
      "Read-only registry of normalized fal utility tools exposed by the SDK.",
    mimeType: "application/json",
  },
  {
    uri: "motif://leaderboards",
    name: "leaderboards",
    title: "Motif Leaderboard Snapshots",
    description:
      "Read-only Artificial Analysis leaderboard snapshots bundled with Motif metadata.",
    mimeType: "application/json",
  },
  {
    uri: "motif://history/schema",
    name: "history_schema",
    title: "Motif Local History Schema",
    description:
      "JSON schema for local generation history. This resource does not expose user history values.",
    mimeType: "application/json",
  },
];

function resourcePayload(uri: string): unknown {
  switch (uri) {
    case "motif://models":
      return MODELS;
    case "motif://tools":
      return FAL_TOOLS;
    case "motif://leaderboards":
      return {
        image_text_to_image_top_20: IMAGE_TEXT_TO_IMAGE_TOP_20,
        image_editing_top_20: IMAGE_EDITING_TOP_20,
        video_text_to_video_top_15: VIDEO_TEXT_TO_VIDEO_TOP_15,
        video_image_to_video_top_15: VIDEO_IMAGE_TO_VIDEO_TOP_15,
      };
    case "motif://history/schema":
      return HISTORY_SCHEMA;
    default:
      return null;
  }
}

function toolError(
  code: string,
  message: string,
  options: {
    isRetriable?: boolean;
    suggestions?: string[];
  } = {},
) {
  const structured = {
    error: true,
    code,
    message,
    is_retriable: options.isRetriable ?? false,
    suggestions: options.suggestions ?? [],
  };

  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
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
    type: "object",
    description:
      "Optional creative direction choices that enrich the prompt before generation.",
    additionalProperties: false,
    properties: Object.fromEntries(
      CREATIVE_FIELDS.map((field) => [
        field,
        {
          type: "string",
          enum: CREATIVE_TAXONOMY[field].map((option) => option.id),
          description: `Creative ${field} direction`,
        },
      ]),
    ),
  };
}

// ─── Tool definitions ────────────────────────────────────────────────

const TOOLS = [
  {
    name: "generate",
    description:
      "Generate images from a prompt using Motif's normalized fal model registry. Use when the user explicitly asks to create new image media and has accepted fal credit spend. Do not use for inspecting available models or past generations; read motif://models or call history instead. This calls fal.ai and returns remote image URLs.",
    annotations: {
      title: "Generate Images",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    outputSchema: {
      type: "object",
      properties: {
        images: IMAGES_ARRAY_SCHEMA,
        seed: {
          type: "number",
          description: "Seed used for generation (where supported)",
        },
        cost_estimate: { type: "number", description: "Estimated cost in USD" },
      },
      required: ["images"],
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "Description of the image to generate",
        },
        creative: creativeInputSchema(),
        model: {
          type: "string",
          enum: GENERATION_MODELS,
          description:
            "Motif generation model alias. Read motif://models for current pricing, endpoints, and capabilities. Default: gpt",
        },
        aspect: {
          type: "string",
          enum: ASPECT_RATIOS,
          description: "Aspect ratio for the output image",
        },
        resolution: {
          type: "string",
          enum: RESOLUTIONS,
          description: "Output resolution where supported",
        },
        preset: {
          type: "string",
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
          description:
            "Named preset that sets aspect ratio. cover=2:3 (book), square=1:1, landscape=16:9, portrait=2:3, story/reel/wallpaper=9:16, feed=4:5, og=16:9, wide/ultra=21:9",
        },
        numImages: {
          type: "number",
          minimum: 1,
          maximum: 4,
          description: "Number of images to generate (1-4, default 1)",
        },
        transparent: {
          type: "boolean",
          description:
            "Generate with transparent background (PNG output, GPT models only)",
        },
        outputFormat: {
          type: "string",
          enum: ["jpeg", "png", "webp"],
          description: "Output image format where supported",
        },
        seed: {
          type: "number",
          description: "Reproducible generation seed where supported",
        },
        enableWebSearch: {
          type: "boolean",
          description: "Enable web search context where supported",
        },
        enableGoogleSearch: {
          type: "boolean",
          description: "Enable fal enable_google_search where supported",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "upscale",
    description:
      "Upscale an existing image URL to higher resolution. Use when the user already has a remote image URL and wants enhancement or enlargement. Do not use for local file paths unless another tool has uploaded them first. This calls fal.ai and returns remote image URLs.",
    annotations: {
      title: "Upscale Image",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    outputSchema: {
      type: "object",
      properties: {
        images: {
          type: "array",
          items: IMAGE_ITEM_SCHEMA,
          description: "Upscaled image(s)",
        },
      },
      required: ["images"],
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        imageUrl: {
          type: "string",
          description: "URL of the image to upscale",
        },
        model: {
          type: "string",
          enum: ["clarity", "crystal"],
          description:
            "Upscale model to use. clarity=faster ($0.02), crystal=AI-enhanced detail ($0.02). Default: clarity",
        },
      },
      required: ["imageUrl"],
    },
  },
  {
    name: "remove_background",
    description:
      "Remove the background from an existing image URL and return a transparent PNG. Use for product cutouts, masks, and compositing inputs. Do not use for prompt-based generation or local file paths unless another tool has uploaded them first. This calls fal.ai.",
    annotations: {
      title: "Remove Background",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    outputSchema: {
      type: "object",
      properties: {
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: {
                type: "string",
                format: "uri",
                description: "URL to the PNG with transparent background",
              },
            },
            required: ["url"],
          },
          description: "Processed image(s) with background removed",
        },
      },
      required: ["images"],
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        imageUrl: {
          type: "string",
          description: "URL of the image to process",
        },
        model: {
          type: "string",
          enum: ["rmbg", "bria"],
          description:
            "Background removal model. rmbg=BiRefNet ($0.02), bria=Bria RMBG 2.0 ($0.02). Default: rmbg",
        },
      },
      required: ["imageUrl"],
    },
  },
  {
    name: "vary",
    description:
      "Generate prompt-guided variations or edits from one or more reference image URLs. Use when the user wants an existing image transformed while preserving some visual context. Do not use for pure text-to-image generation; use generate instead. This calls fal.ai and returns remote image URLs.",
    annotations: {
      title: "Generate Variation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    outputSchema: {
      type: "object",
      properties: {
        images: IMAGES_ARRAY_SCHEMA,
        cost_estimate: { type: "number", description: "Estimated cost in USD" },
      },
      required: ["images"],
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description:
            "Prompt describing the desired changes or new image based on the reference(s)",
        },
        creative: creativeInputSchema(),
        imageUrls: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "Reference image URLs to use as a base (at least one)",
        },
        model: {
          type: "string",
          enum: EDIT_CAPABLE_MODELS,
          description:
            "Model to use for variation. Must support image editing. Read motif://models for current reference limits and capabilities. Default: gpt",
        },
        inputFidelity: {
          type: "string",
          enum: ["low", "high"],
          description:
            "How closely to follow the reference image. low=loose inspiration, high=faithful reproduction",
        },
      },
      required: ["prompt", "imageUrls"],
    },
  },
  {
    name: "history",
    description:
      "List recent image generations from the local CLI history (~/.motif/history.json). Use only when the user wants local Motif history, costs, prompts, or file paths exposed to this MCP client. Do not call for model metadata; read motif://models instead.",
    annotations: {
      title: "Generation History",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        costs: {
          type: "object",
          properties: {
            allTime: {
              type: "number",
              description: "Total spend across all time (USD)",
            },
            session: {
              type: "number",
              description: "Spend in the current session (USD)",
            },
            today: { type: "number", description: "Spend today (USD)" },
          },
          required: ["allTime", "session", "today"],
        },
        generations: {
          type: "array",
          description: "Generations, newest first",
          items: {
            type: "object",
            properties: {
              aspect: { type: "string", description: "Aspect ratio used" },
              cost: {
                type: "number",
                description: "Cost of this generation (USD)",
              },
              editedFrom: {
                type: "string",
                description:
                  "ID of the source generation if this was a variation",
              },
              filePath: {
                type: "string",
                description: "Local file path where the image was saved",
              },
              id: { type: "string", description: "Unique generation ID" },
              model: { type: "string", description: "Model alias used" },
              prompt: {
                type: "string",
                description: "Prompt used to generate the image",
              },
              resolution: {
                type: "string",
                description: "Resolution setting used",
              },
              timestamp: {
                type: "string",
                description: "ISO 8601 timestamp of the generation",
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
          },
        },
        hasMore: {
          type: "boolean",
          description: "Whether more generations exist beyond this page",
        },
        limit: { type: "number", description: "Limit applied to this page" },
        offset: { type: "number", description: "Offset applied to this page" },
        total: {
          type: "number",
          description: "Total number of generations in history",
        },
      },
      required: ["costs", "generations", "hasMore", "limit", "offset", "total"],
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          minimum: 1,
          maximum: 50,
          description:
            "Maximum number of generations to return (1-50, default 10)",
        },
        offset: {
          type: "number",
          minimum: 0,
          description:
            "Number of generations to skip for pagination (default 0)",
        },
      },
      required: [],
    },
  },
];

// ─── Server factory ──────────────────────────────────────────────────

/**
 * Create a Motif MCP server without binding it to a transport.
 *
 * The caller owns the `MotifServer` instance and chooses stdio, in-memory, or
 * another MCP transport; this factory only registers Motif resources and tools.
 */
export function createMotifMcpServer(motif: MotifServer): Server {
  const server = new Server(
    { name: "motif", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} } },
  );

  // ── List tools ────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: TOOLS };
  });

  // ── List resources ────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, () => {
    return { resources: RESOURCES };
  });

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
          uri,
          mimeType: "application/json",
          text: JSON.stringify(payload),
        },
      ],
    };
  });

  // ── Call tool ─────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
      return toolError("INVALID_PARAMS", "No arguments provided", {
        suggestions: [
          "Pass an arguments object matching the tool input schema.",
        ],
      });
    }

    // ── generate ──────────────────────────────────────────────────

    if (name === "generate") {
      const {
        prompt,
        model = "gpt",
        aspect,
        resolution,
        preset,
        numImages = 1,
        transparent,
        outputFormat,
        seed,
        enableWebSearch,
        enableGoogleSearch,
        creative,
      } = args as {
        prompt: string;
        creative?: CreativeDirection;
        model?: string;
        aspect?: string;
        resolution?: Resolution;
        preset?: string;
        numImages?: number;
        transparent?: boolean;
        outputFormat?: ImageOutputFormat;
        seed?: number;
        enableWebSearch?: boolean;
        enableGoogleSearch?: boolean;
      };

      const resolvedAspect =
        (preset ? PRESET_MAP[preset] : undefined) ??
        (aspect as AspectRatio | undefined) ??
        "1:1";

      const result = await motif.generate({
        prompt,
        model,
        aspect: resolvedAspect,
        resolution,
        numImages,
        transparent,
        outputFormat,
        seed,
        enableWebSearch,
        enableGoogleSearch,
        creative,
      });

      if (result.isErr()) {
        return toolError("GENERATION_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: [
            "Check that FAL_KEY is valid.",
            "Try a cheaper or simpler model if fal rejects the request.",
          ],
        });
      }

      const costEstimate = motif.estimateCost(model, undefined, numImages);

      const structured = {
        images: result.value.images.map(imageContent),
        seed: result.value.seed,
        cost_estimate: costEstimate,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(structured) }],
        structuredContent: structured,
      };
    }

    // ── upscale ───────────────────────────────────────────────────

    if (name === "upscale") {
      const { imageUrl, model = "clarity" } = args as {
        imageUrl: string;
        model?: "clarity" | "crystal";
      };

      const result = await motif.upscale({ imageUrl, model });

      if (result.isErr()) {
        return toolError("UPSCALE_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: ["Check the input image URL and retry."],
        });
      }

      const structured = {
        images: result.value.images.map(imageContent),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(structured) }],
        structuredContent: structured,
      };
    }

    // ── remove_background ─────────────────────────────────────────

    if (name === "remove_background") {
      const { imageUrl, model = "rmbg" } = args as {
        imageUrl: string;
        model?: "rmbg" | "bria";
      };

      const result = await motif.removeBackground({ imageUrl, model });

      if (result.isErr()) {
        return toolError("REMOVE_BACKGROUND_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: ["Check the input image URL and retry."],
        });
      }

      const structured = {
        images: result.value.images.map((img) => ({ url: img.url })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(structured) }],
        structuredContent: structured,
      };
    }

    // ── vary ──────────────────────────────────────────────────────

    if (name === "vary") {
      const {
        prompt,
        imageUrls,
        model = "gpt",
        inputFidelity,
        creative,
      } = args as {
        prompt: string;
        creative?: CreativeDirection;
        imageUrls: string[];
        model?: string;
        inputFidelity?: "low" | "high";
      };

      const result = await motif.generate({
        prompt,
        model,
        editImageUrls: imageUrls,
        inputFidelity,
        creative,
      });

      if (result.isErr()) {
        return toolError("VARIATION_FAILED", result.error.message, {
          isRetriable: true,
          suggestions: [
            "Check that each reference URL is reachable.",
            "Try a model that supports image editing.",
          ],
        });
      }

      const costEstimate = motif.estimateCost(model, undefined, 1);

      const structured = {
        images: result.value.images.map(imageContent),
        cost_estimate: costEstimate,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(structured) }],
        structuredContent: structured,
      };
    }

    // ── history ───────────────────────────────────────────────────

    if (name === "history") {
      const { limit = 10, offset = 0 } = (args ?? {}) as {
        limit?: number;
        offset?: number;
      };

      const structured = readHistory(limit, offset);

      return {
        content: [{ type: "text", text: JSON.stringify(structured) }],
        structuredContent: structured,
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  });

  return server;
}
