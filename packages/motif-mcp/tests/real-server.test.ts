/**
 * MCP end-to-end with a REAL MotifServer
 *
 * Uses InMemoryTransport + Client like tools.test.ts, but wires the MCP server
 * to a real `MotifServer` instead of a mock. The generate call below fails
 * inside `buildGenerateBody` (unknown creative option) before any fetch, so no
 * network access is needed. This documents that MCP clients receive a
 * structured tool error end-to-end instead of an unhandled rejection.
 */

import { MotifServer } from "@howells/motif-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createMotifMcpServer } from "../src/create-server.js";

async function makeClient(motif: MotifServer) {
  const server = createMotifMcpServer(motif);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("generate tool with a real MotifServer", () => {
  it("returns a structured tool error for an invalid creative option", async () => {
    const motif = new MotifServer({ apiKey: "test-key" });
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
    const { text } = (result.content as { text: string }[])[0];
    const parsed = JSON.parse(text);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain("Unknown creative lighting");
  });
});
