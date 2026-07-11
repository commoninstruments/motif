/**
 * MCP tools — InMemoryTransport tests
 *
 * Tests the MCP server using InMemoryTransport + Client so the full
 * protocol stack is exercised (capability handshake, ListTools, CallTool)
 * without stdio, subprocesses, or real fal.ai API calls.
 */

import { EDIT_CAPABLE_MODELS } from "@howells/motif-sdk";
import type { MotifServer } from "@howells/motif-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createMotifMcpServer } from "../src/create-server.js";

// ─── History mock ────────────────────────────────────────────────────
// vi.mock is hoisted — inline the value; cannot reference module-scope vars.

vi.mock("../src/history.js", () => ({
  readHistory: vi.fn().mockReturnValue({
    costs: { allTime: 0.26, session: 0.13, today: 0.13 },
    generations: [
      {
        aspect: "16:9",
        cost: 0.13,
        filePath: "/Users/example/motif-abc.png",
        id: "abc123",
        model: "gpt",
        prompt: "a red fox",
        resolution: "2K",
        timestamp: "2026-04-23T10:00:00.000Z",
      },
    ],
    hasMore: false,
    limit: 10,
    offset: 0,
    total: 1,
  }),
}));

// ─── Mock helpers ────────────────────────────────────────────────────

function makeOk<T>(value: T) {
  return { isErr: () => false, isOk: () => true, value };
}

function makeErr(message: string) {
  return {
    error: { code: "GENERATION_FAILED", message },
    isErr: () => true,
    isOk: () => false,
  };
}

const MOCK_IMAGES = [
  { height: 1024, url: "https://fal.media/img.png", width: 1024 },
];

function makeMockMotif() {
  return {
    estimateCost: vi.fn().mockReturnValue(0.13),
    generate: vi
      .fn()
      .mockResolvedValue(makeOk({ images: MOCK_IMAGES, seed: 42 })),
    removeBackground: vi
      .fn()
      .mockResolvedValue(
        makeOk({ images: [{ url: "https://fal.media/transparent.png" }] })
      ),
    upscale: vi.fn().mockResolvedValue(
      makeOk({
        images: [
          {
            height: 2048,
            url: "https://fal.media/upscaled.png",
            width: 2048,
          },
        ],
      })
    ),
  } as unknown as MotifServer;
}

// ─── Connect client ──────────────────────────────────────────────────

async function makeClient(motif: MotifServer) {
  const server = createMotifMcpServer(motif);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

// ─── Tool listing ────────────────────────────────────────────────────

describe("ListTools", () => {
  it("exposes exactly 5 tools", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
  });

  it("tools have expected names", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("generate");
    expect(names).toContain("upscale");
    expect(names).toContain("remove_background");
    expect(names).toContain("vary");
    expect(names).toContain("history");
  });

  it("all tools have annotations", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(
        tool.annotations,
        `${tool.name} should have annotations`
      ).toBeDefined();
    }
  });

  it("generation tools have readOnlyHint: false and openWorldHint: true", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const generationTools = tools.filter((t) => t.name !== "history");
    for (const tool of generationTools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(
        false
      );
      expect(
        tool.annotations?.openWorldHint,
        `${tool.name} openWorldHint`
      ).toBe(true);
    }
  });

  it("history tool has readOnlyHint: true and openWorldHint: false", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const historyTool = tools.find((t) => t.name === "history");
    expect(historyTool?.annotations?.readOnlyHint).toBe(true);
    expect(historyTool?.annotations?.openWorldHint).toBe(false);
  });

  it("all tools have outputSchema", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(
        tool.outputSchema,
        `${tool.name} should have outputSchema`
      ).toBeDefined();
    }
  });

  it("generate tool requires prompt", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const generate = tools.find((t) => t.name === "generate");
    expect(generate?.inputSchema.required).toContain("prompt");
  });

  it("generate schema advertises current model, aspect, and resolution enums", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const generate = tools.find((t) => t.name === "generate");
    const properties = generate?.inputSchema.properties as Record<
      string,
      { enum?: string[] }
    >;

    expect(properties.model?.enum).toContain("banana2");
    expect(properties.model?.enum).toContain("qwen");
    expect(properties.aspect?.enum).toContain("auto");
    expect(properties.aspect?.enum).toContain("8:1");
    expect(properties.resolution?.enum).toContain("0.5K");
  });

  it("vary schema advertises the edit-capable model enum", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const vary = tools.find((t) => t.name === "vary");
    const properties = vary?.inputSchema.properties as Record<
      string,
      { enum?: string[] }
    >;

    expect(properties.model?.enum).toEqual([...EDIT_CAPABLE_MODELS]);
  });

  it("generate schema advertises creative direction options", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const generate = tools.find((t) => t.name === "generate");
    const properties = generate?.inputSchema.properties as Record<
      string,
      { properties?: Record<string, { enum?: string[] }> }
    >;

    expect(properties.creative?.properties?.recipe?.enum).toContain(
      "cinematic"
    );
    expect(properties.creative?.properties?.lighting?.enum).toContain("rim");
    expect(properties.creative?.properties?.material?.enum).toContain(
      "reflective"
    );
  });

  it("vary tool requires prompt and imageUrls", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const vary = tools.find((t) => t.name === "vary");
    expect(vary?.inputSchema.required).toContain("prompt");
    expect(vary?.inputSchema.required).toContain("imageUrls");
  });

  it("vary schema advertises creative direction options", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const vary = tools.find((t) => t.name === "vary");
    const properties = vary?.inputSchema.properties as Record<
      string,
      { properties?: Record<string, { enum?: string[] }> }
    >;

    expect(properties.creative?.properties?.shot?.enum).toContain("close-up");
    expect(properties.creative?.properties?.genre?.enum).toContain("film-noir");
  });
});

// ─── Resources ───────────────────────────────────────────────────────

describe("Resources", () => {
  it("exposes read-only registry resources", async () => {
    const client = await makeClient(makeMockMotif());
    const { resources } = await client.listResources();
    const uris = resources.map((resource) => resource.uri);

    expect(uris).toContain("motif://models");
    expect(uris).toContain("motif://tools");
    expect(uris).toContain("motif://leaderboards");
    expect(uris).toContain("motif://history/schema");
  });

  it("reads model registry resource as JSON", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.readResource({ uri: "motif://models" });

    const content = result.contents[0];
    expect(content?.mimeType).toBe("application/json");
    if (!content || !("text" in content)) {
      throw new Error("Expected text resource content");
    }
    const parsed = JSON.parse(content.text);
    expect(parsed.gpt).toMatchObject({
      endpoint: "fal-ai/gpt-image-1.5",
    });
  });

  it("reads history schema without exposing local history values", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.readResource({ uri: "motif://history/schema" });

    const content = result.contents[0];
    if (!content || !("text" in content)) {
      throw new Error("Expected text resource content");
    }
    const parsed = JSON.parse(content.text);
    expect(parsed.required).toContain("generations");
    expect(JSON.stringify(parsed)).not.toContain("a red fox");
  });
});

// ─── generate tool ───────────────────────────────────────────────────

describe("generate tool", () => {
  it("calls motif.generate with prompt and default model", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: { prompt: "a red fox" },
      name: "generate",
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt", prompt: "a red fox" })
    );
  });

  it("returns images array in structuredContent", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({
      arguments: { prompt: "a fox" },
      name: "generate",
    });

    const { text } = result.content[0] as { text: string };
    const parsed = JSON.parse(text);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].url).toBe("https://fal.media/img.png");
  });

  it("includes cost_estimate in response", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({
      arguments: { prompt: "a fox" },
      name: "generate",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(typeof parsed.cost_estimate).toBe("number");
  });

  it("omits optional dimensions when fal does not return them", async () => {
    const motif = makeMockMotif();
    (motif.generate as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOk({
        images: [
          { height: null, url: "https://fal.media/no-dims.png", width: null },
        ],
      })
    );
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: { prompt: "a fox" },
      name: "generate",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.images[0]).toEqual({ url: "https://fal.media/no-dims.png" });
  });

  it("resolves preset to aspect ratio", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: { preset: "landscape", prompt: "a fox" },
      name: "generate",
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({ aspect: "16:9" })
    );
  });

  it("passes current generation controls through to motif.generate", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        aspect: "auto",
        enableGoogleSearch: true,
        enableWebSearch: true,
        model: "banana2",
        outputFormat: "png",
        prompt: "a fox",
        resolution: "0.5K",
        seed: 42,
      },
      name: "generate",
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect: "auto",
        enableGoogleSearch: true,
        enableWebSearch: true,
        model: "banana2",
        outputFormat: "png",
        prompt: "a fox",
        resolution: "0.5K",
        seed: 42,
      })
    );
  });

  it("passes creative direction through to motif.generate", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        creative: { lighting: "rim", material: "reflective" },
        prompt: "a fox",
      },
      name: "generate",
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        creative: { lighting: "rim", material: "reflective" },
        prompt: "a fox",
      })
    );
  });

  it("returns structured tool errors when generate fails", async () => {
    const motif = makeMockMotif();
    (motif.generate as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeErr("fal.ai 502")
    );
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: { prompt: "a fox" },
      name: "generate",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toMatchObject({
      code: "GENERATION_FAILED",
      error: true,
      is_retriable: true,
      message: "fal.ai 502",
    });
  });
});

// ─── argument validation ─────────────────────────────────────────────

describe("argument validation", () => {
  it("rejects generate with numImages out of range and does not call fal", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: { numImages: 500, prompt: "a fox" },
      name: "generate",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.code).toBe("INVALID_PARAMS");
    expect(motif.generate).not.toHaveBeenCalled();
  });

  it("rejects generate with an unknown model and suggests valid ones", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: { model: "bogus", prompt: "a fox" },
      name: "generate",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.code).toBe("INVALID_PARAMS");
    expect(parsed.suggestions.join(" ")).toContain("model");
    expect(motif.generate).not.toHaveBeenCalled();
  });

  it("rejects generate with an empty prompt", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: { prompt: "" },
      name: "generate",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.code).toBe("INVALID_PARAMS");
    expect(motif.generate).not.toHaveBeenCalled();
  });

  it("rejects vary with an edit-incapable model", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: {
        imageUrls: ["https://example.com/ref.png"],
        model: "recraft",
        prompt: "make it blue",
      },
      name: "vary",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.code).toBe("INVALID_PARAMS");
    expect(motif.generate).not.toHaveBeenCalled();
  });

  it("resolves history with no arguments key to the default page", async () => {
    const { readHistory } = await import("../src/history.js");
    const client = await makeClient(makeMockMotif());

    const result = await client.callTool({ name: "history" });

    expect(result.isError).toBeFalsy();
    expect(readHistory).toHaveBeenCalledWith(10, 0);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.generations).toHaveLength(1);
  });

  it("rejects history with limit 0", async () => {
    const client = await makeClient(makeMockMotif());

    const result = await client.callTool({
      arguments: { limit: 0 },
      name: "history",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.code).toBe("INVALID_PARAMS");
  });

  it("rejects history with limit 51 (schema maximum is 50)", async () => {
    const client = await makeClient(makeMockMotif());

    const result = await client.callTool({
      arguments: { limit: 51 },
      name: "history",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.code).toBe("INVALID_PARAMS");
  });

  it("accepts history with limit 50 (schema maximum)", async () => {
    const { readHistory } = await import("../src/history.js");
    const client = await makeClient(makeMockMotif());

    const result = await client.callTool({
      arguments: { limit: 50 },
      name: "history",
    });

    expect(result.isError).toBeFalsy();
    expect(readHistory).toHaveBeenCalledWith(50, 0);
  });
});

// ─── upscale tool ────────────────────────────────────────────────────

describe("upscale tool", () => {
  it("calls motif.upscale with imageUrl and default model", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: { imageUrl: "https://example.com/img.png" },
      name: "upscale",
    });

    expect(motif.upscale).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://example.com/img.png",
        model: "clarity",
      })
    );
  });

  it("returns upscaled image URL", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({
      arguments: { imageUrl: "https://example.com/img.png" },
      name: "upscale",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.images[0].url).toBe("https://fal.media/upscaled.png");
  });
});

// ─── remove_background tool ──────────────────────────────────────────

describe("remove_background tool", () => {
  it("calls motif.removeBackground with imageUrl and default model", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: { imageUrl: "https://example.com/img.png" },
      name: "remove_background",
    });

    expect(motif.removeBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://example.com/img.png",
        model: "rmbg",
      })
    );
  });

  it("returns transparent PNG URL", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({
      arguments: { imageUrl: "https://example.com/img.png" },
      name: "remove_background",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.images[0].url).toBe("https://fal.media/transparent.png");
  });
});

// ─── vary tool ───────────────────────────────────────────────────────

describe("vary tool", () => {
  it("calls motif.generate with editImageUrls", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        imageUrls: ["https://example.com/ref.png"],
        prompt: "make it blue",
      },
      name: "vary",
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        editImageUrls: ["https://example.com/ref.png"],
        prompt: "make it blue",
      })
    );
  });

  it("passes inputFidelity when provided", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        imageUrls: ["https://example.com/ref.png"],
        inputFidelity: "high",
        prompt: "variation",
      },
      name: "vary",
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({ inputFidelity: "high" })
    );
  });

  it("passes creative direction through to motif.generate", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      arguments: {
        creative: { genre: "film-noir", shot: "close-up" },
        imageUrls: ["https://example.com/ref.png"],
        prompt: "variation",
      },
      name: "vary",
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        creative: { genre: "film-noir", shot: "close-up" },
        editImageUrls: ["https://example.com/ref.png"],
        prompt: "variation",
      })
    );
  });

  it("returns image variation URLs when fal omits dimensions", async () => {
    const motif = makeMockMotif();
    (motif.generate as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeOk({
        images: [
          { height: null, url: "https://fal.media/variation.png", width: null },
        ],
      })
    );
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: {
        imageUrls: ["https://example.com/ref.png"],
        prompt: "variation",
      },
      name: "vary",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.images[0]).toEqual({
      url: "https://fal.media/variation.png",
    });
  });
});

// ─── history tool ────────────────────────────────────────────────────

describe("history tool", () => {
  it("calls readHistory with default limit and offset", async () => {
    const { readHistory } = await import("../src/history.js");
    const client = await makeClient(makeMockMotif());

    await client.callTool({ arguments: {}, name: "history" });

    expect(readHistory).toHaveBeenCalledWith(10, 0);
  });

  it("passes custom limit and offset to readHistory", async () => {
    const { readHistory } = await import("../src/history.js");
    const client = await makeClient(makeMockMotif());

    await client.callTool({
      arguments: { limit: 5, offset: 20 },
      name: "history",
    });

    expect(readHistory).toHaveBeenCalledWith(5, 20);
  });

  it("returns generations array in response", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({ arguments: {}, name: "history" });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.generations).toHaveLength(1);
    expect(parsed.generations[0].prompt).toBe("a red fox");
    expect(parsed.generations[0].filePath).toBe("/Users/example/motif-abc.png");
  });

  it("returns pagination metadata", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({ arguments: {}, name: "history" });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.total).toBe(1);
    expect(parsed.hasMore).toBe(false);
    expect(typeof parsed.offset).toBe("number");
    expect(typeof parsed.limit).toBe("number");
  });

  it("returns cost summary", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({ arguments: {}, name: "history" });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(typeof parsed.costs.allTime).toBe("number");
    expect(typeof parsed.costs.today).toBe("number");
    expect(typeof parsed.costs.session).toBe("number");
  });
});

// ─── Unknown tool ────────────────────────────────────────────────────

describe("unknown tool", () => {
  it("throws MethodNotFound for unknown tool names", async () => {
    const client = await makeClient(makeMockMotif());

    await expect(
      client.callTool({ arguments: {}, name: "nonexistent" })
    ).rejects.toThrow();
  });
});
