/**
 * createMotifMcpServer
 *
 * Factory function — creates and configures the Motif MCP server without
 * binding to a transport. Extracted for testability (InMemoryTransport tests).
 */

import type { MotifServer } from "@howells/motif-sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { readHistory } from "./history.js";

// ─── Preset → aspect resolution ─────────────────────────────────────

type AspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "2:3"
  | "3:2"
  | "4:3"
  | "3:4"
  | "4:5"
  | "5:4"
  | "21:9";

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

// ─── Tool definitions ────────────────────────────────────────────────

const TOOLS = [
  {
    name: "generate",
    description:
      "Generate images using AI. Returns an array of image URLs. Supports 9 models with different capabilities and price points.",
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
        model: {
          type: "string",
          enum: [
            "gpt2",
            "gpt",
            "banana",
            "gemini",
            "gemini3",
            "flux",
            "flux-fast",
            "recraft",
            "ideogram",
          ],
          description:
            "Model to use. gpt2=GPT Image 2 ($0.22), gpt=GPT Image 1.5 ($0.13), banana=Nano Banana Pro ($0.15), gemini=Gemini 2.5 Flash ($0.04), gemini3=Gemini 3 Pro ($0.15), flux=FLUX Pro Ultra ($0.06), flux-fast=FLUX Schnell ($0.003), recraft=Recraft V3 ($0.04), ideogram=Ideogram V3 ($0.06). Default: gpt",
        },
        aspect: {
          type: "string",
          enum: [
            "1:1",
            "16:9",
            "9:16",
            "2:3",
            "3:2",
            "4:3",
            "3:4",
            "4:5",
            "5:4",
            "21:9",
          ],
          description: "Aspect ratio for the output image",
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
      },
      required: ["prompt"],
    },
  },
  {
    name: "upscale",
    description:
      "Upscale an image to higher resolution. clarity model is faster, crystal model adds AI detail enhancement.",
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
      "Remove the background from an image, returning a PNG with transparency.",
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
      "Generate variations of an existing image. Provide reference image URLs and a prompt describing changes.",
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
        imageUrls: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "Reference image URLs to use as a base (at least one)",
        },
        model: {
          type: "string",
          enum: ["gpt2", "gpt", "banana", "gemini3"],
          description:
            "Model to use for variation. Must support image editing. gpt2=GPT Image 2, gpt=GPT Image 1.5, banana=Nano Banana Pro, gemini3=Gemini 3 Pro. Default: gpt",
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
      "List recent image generations from the local CLI history (~/.motif/history.json). Returns prompts, models, costs, and file paths for previously generated images.",
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

export function createMotifMcpServer(motif: MotifServer): Server {
  const server = new Server(
    { name: "motif", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // ── List tools ────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: TOOLS };
  });

  // ── Call tool ─────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new McpError(ErrorCode.InvalidParams, "No arguments provided");
    }

    // ── generate ──────────────────────────────────────────────────

    if (name === "generate") {
      const {
        prompt,
        model = "gpt",
        aspect,
        preset,
        numImages = 1,
        transparent,
      } = args as {
        prompt: string;
        model?: string;
        aspect?: string;
        preset?: string;
        numImages?: number;
        transparent?: boolean;
      };

      const resolvedAspect =
        (preset ? PRESET_MAP[preset] : undefined) ??
        (aspect as AspectRatio | undefined) ??
        "1:1";

      const result = await motif.generate({
        prompt,
        model,
        aspect: resolvedAspect,
        numImages,
        transparent,
      });

      if (result.isErr()) {
        throw new McpError(ErrorCode.InternalError, result.error.message);
      }

      const costEstimate = motif.estimateCost(model, undefined, numImages);

      const structured = {
        images: result.value.images.map((img) => ({
          url: img.url,
          width: img.width,
          height: img.height,
        })),
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
        throw new McpError(ErrorCode.InternalError, result.error.message);
      }

      const structured = {
        images: result.value.images.map((img) => ({
          url: img.url,
          width: img.width,
          height: img.height,
        })),
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
        throw new McpError(ErrorCode.InternalError, result.error.message);
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
      } = args as {
        prompt: string;
        imageUrls: string[];
        model?: string;
        inputFidelity?: "low" | "high";
      };

      const result = await motif.generate({
        prompt,
        model,
        editImageUrls: imageUrls,
        inputFidelity,
      });

      if (result.isErr()) {
        throw new McpError(ErrorCode.InternalError, result.error.message);
      }

      const costEstimate = motif.estimateCost(model, undefined, 1);

      const structured = {
        images: result.value.images.map((img) => ({
          url: img.url,
          width: img.width,
          height: img.height,
        })),
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
