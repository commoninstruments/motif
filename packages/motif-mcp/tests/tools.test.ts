/**
 * MCP tools — InMemoryTransport tests
 *
 * Tests the MCP server using InMemoryTransport + Client so the full
 * protocol stack is exercised (capability handshake, ListTools, CallTool)
 * without stdio, subprocesses, or real fal.ai API calls.
 */

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
  return { isOk: () => true, isErr: () => false, value };
}

function makeErr(message: string) {
  return {
    isOk: () => false,
    isErr: () => true,
    error: { message, code: "GENERATION_FAILED" },
  };
}

const MOCK_IMAGES = [
  { url: "https://fal.media/img.png", width: 1024, height: 1024 },
];

function makeMockMotif() {
  return {
    generate: vi
      .fn()
      .mockResolvedValue(makeOk({ images: MOCK_IMAGES, seed: 42 })),
    upscale: vi.fn().mockResolvedValue(
      makeOk({
        images: [
          {
            url: "https://fal.media/upscaled.png",
            width: 2048,
            height: 2048,
          },
        ],
      }),
    ),
    removeBackground: vi
      .fn()
      .mockResolvedValue(
        makeOk({ images: [{ url: "https://fal.media/transparent.png" }] }),
      ),
    estimateCost: vi.fn().mockReturnValue(0.13),
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
        `${tool.name} should have annotations`,
      ).toBeDefined();
    }
  });

  it("generation tools have readOnlyHint: false and openWorldHint: true", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const generationTools = tools.filter((t) => t.name !== "history");
    for (const tool of generationTools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(
        false,
      );
      expect(
        tool.annotations?.openWorldHint,
        `${tool.name} openWorldHint`,
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
        `${tool.name} should have outputSchema`,
      ).toBeDefined();
    }
  });

  it("generate tool requires prompt", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const generate = tools.find((t) => t.name === "generate");
    expect(generate?.inputSchema.required).toContain("prompt");
  });

  it("vary tool requires prompt and imageUrls", async () => {
    const client = await makeClient(makeMockMotif());
    const { tools } = await client.listTools();
    const vary = tools.find((t) => t.name === "vary");
    expect(vary?.inputSchema.required).toContain("prompt");
    expect(vary?.inputSchema.required).toContain("imageUrls");
  });
});

// ─── generate tool ───────────────────────────────────────────────────

describe("generate tool", () => {
  it("calls motif.generate with prompt and default model", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      name: "generate",
      arguments: { prompt: "a red fox" },
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "a red fox", model: "gpt" }),
    );
  });

  it("returns images array in structuredContent", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({
      name: "generate",
      arguments: { prompt: "a fox" },
    });

    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].url).toBe("https://fal.media/img.png");
  });

  it("includes cost_estimate in response", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({
      name: "generate",
      arguments: { prompt: "a fox" },
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(typeof parsed.cost_estimate).toBe("number");
  });

  it("resolves preset to aspect ratio", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      name: "generate",
      arguments: { prompt: "a fox", preset: "landscape" },
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({ aspect: "16:9" }),
    );
  });

  it("throws InternalError when generate fails", async () => {
    const motif = makeMockMotif();
    (motif.generate as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeErr("fal.ai 502"),
    );
    const client = await makeClient(motif);

    await expect(
      client.callTool({ name: "generate", arguments: { prompt: "a fox" } }),
    ).rejects.toThrow();
  });
});

// ─── upscale tool ────────────────────────────────────────────────────

describe("upscale tool", () => {
  it("calls motif.upscale with imageUrl and default model", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      name: "upscale",
      arguments: { imageUrl: "https://example.com/img.png" },
    });

    expect(motif.upscale).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://example.com/img.png",
        model: "clarity",
      }),
    );
  });

  it("returns upscaled image URL", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({
      name: "upscale",
      arguments: { imageUrl: "https://example.com/img.png" },
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
      name: "remove_background",
      arguments: { imageUrl: "https://example.com/img.png" },
    });

    expect(motif.removeBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://example.com/img.png",
        model: "rmbg",
      }),
    );
  });

  it("returns transparent PNG URL", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({
      name: "remove_background",
      arguments: { imageUrl: "https://example.com/img.png" },
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
      name: "vary",
      arguments: {
        prompt: "make it blue",
        imageUrls: ["https://example.com/ref.png"],
      },
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "make it blue",
        editImageUrls: ["https://example.com/ref.png"],
      }),
    );
  });

  it("passes inputFidelity when provided", async () => {
    const motif = makeMockMotif();
    const client = await makeClient(motif);

    await client.callTool({
      name: "vary",
      arguments: {
        prompt: "variation",
        imageUrls: ["https://example.com/ref.png"],
        inputFidelity: "high",
      },
    });

    expect(motif.generate).toHaveBeenCalledWith(
      expect.objectContaining({ inputFidelity: "high" }),
    );
  });
});

// ─── history tool ────────────────────────────────────────────────────

describe("history tool", () => {
  it("calls readHistory with default limit and offset", async () => {
    const { readHistory } = await import("../src/history.js");
    const client = await makeClient(makeMockMotif());

    await client.callTool({ name: "history", arguments: {} });

    expect(readHistory).toHaveBeenCalledWith(10, 0);
  });

  it("passes custom limit and offset to readHistory", async () => {
    const { readHistory } = await import("../src/history.js");
    const client = await makeClient(makeMockMotif());

    await client.callTool({
      name: "history",
      arguments: { limit: 5, offset: 20 },
    });

    expect(readHistory).toHaveBeenCalledWith(5, 20);
  });

  it("returns generations array in response", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({ name: "history", arguments: {} });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.generations).toHaveLength(1);
    expect(parsed.generations[0].prompt).toBe("a red fox");
    expect(parsed.generations[0].filePath).toBe("/Users/example/motif-abc.png");
  });

  it("returns pagination metadata", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({ name: "history", arguments: {} });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.total).toBe(1);
    expect(parsed.hasMore).toBe(false);
    expect(typeof parsed.offset).toBe("number");
    expect(typeof parsed.limit).toBe("number");
  });

  it("returns cost summary", async () => {
    const client = await makeClient(makeMockMotif());
    const result = await client.callTool({ name: "history", arguments: {} });

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
      client.callTool({ name: "nonexistent", arguments: {} }),
    ).rejects.toThrow();
  });
});
