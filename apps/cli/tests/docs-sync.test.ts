import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GENERATION_MODELS } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { ERROR_CATALOG } from "../src/utils/error-catalog";

const testDir = import.meta.dirname;
const repoRoot = resolve(testDir, "../../..");

const cliAgentsPath = resolve(testDir, "../AGENTS.md");
const readmePath = resolve(repoRoot, "README.md");
const mcpReadmePath = resolve(repoRoot, "packages/motif-mcp/README.md");

function read(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("docs sync", () => {
  it("documents every generation model id in the CLI agent guide", () => {
    const agents = read(cliAgentsPath);
    for (const model of GENERATION_MODELS) {
      expect(agents, `missing model id: ${model}`).toContain(model);
    }
  });

  it("documents every error code in the CLI agent guide", () => {
    const agents = read(cliAgentsPath);
    for (const code of Object.keys(ERROR_CATALOG)) {
      expect(agents, `missing error code: ${code}`).toContain(code);
    }
  });

  it("mentions creative direction in the user-facing docs", () => {
    const docs: [string, string][] = [
      ["README.md", readmePath],
      ["apps/cli/AGENTS.md", cliAgentsPath],
      ["packages/motif-mcp/README.md", mcpReadmePath],
    ];
    for (const [label, path] of docs) {
      expect(
        read(path).toLowerCase(),
        `missing creative in ${label}`
      ).toContain("creative");
    }
  });
});
