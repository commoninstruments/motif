/**
 * MCP end-to-end with a REAL FalClient
 *
 * Uses InMemoryTransport + Client like tools.test.ts, but wires the MCP server
 * to a real `FalClient` instead of a mock. The generate call below fails
 * inside `buildGenerateBody` (unknown creative option) before any fetch, so no
 * network access is needed. This documents that MCP clients receive a
 * structured tool error end-to-end instead of an unhandled rejection.
 */

import { FalClient } from "@howells/motif-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { createMotifMcpServer } from "../src/create-server.js";

/** Typed view of Motif's structured tool error payload. */
interface ErrorPayload {
  error: boolean;
  message: string;
}

/** Parse the structured error JSON from the first text content block. */
function parseErrorPayload(result: CallToolResult): ErrorPayload {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error("Expected text tool content");
  }
  // oxlint-disable-next-line no-unsafe-type-assertion -- JSON.parse returns `any`; structured tool errors pin this shape and the assertions verify it at runtime
  return JSON.parse(first.text) as ErrorPayload;
}

async function makeClient(motif: FalClient) {
  const server = createMotifMcpServer(motif);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("generate tool with a real FalClient", () => {
  it("returns a structured tool error for an invalid creative option", async () => {
    const motif = new FalClient({ apiKey: "test-key" });
    const client = await makeClient(motif);

    const result = await client.callTool({
      arguments: {
        creative: { lighting: "not-a-real-id" },
        model: "banana",
        prompt: "x",
      },
      name: "generate",
    });

    expect(result.isError).toBe(true);
    const parsed = parseErrorPayload(result);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain("Unknown creative lighting");
  });
});
