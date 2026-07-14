/**
 * motif-mcp entry point.
 *
 * MCP server exposing Motif image generation as tools.
 * Communicates over stdin/stdout using the MCP protocol.
 *
 * Requires FAL_KEY env var.
 */

import { FalClient, getFalKeyFromEnv } from "@howells/motif-sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMotifMcpServer } from "./create-server.js";

// ─── Bootstrap ──────────────────────────────────────────────────────

const falKey = getFalKeyFromEnv();
if (falKey === undefined || falKey === "") {
  process.stderr.write(
    "[motif-mcp] Fatal: FAL_KEY environment variable is not set.\n"
  );
  process.exit(1);
}

const motif = new FalClient(falKey);
const server = createMotifMcpServer(motif);

const transport = new StdioServerTransport();
await server.connect(transport);
