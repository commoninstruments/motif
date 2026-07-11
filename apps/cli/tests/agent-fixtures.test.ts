import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CREATIVE_TAXONOMY } from "@howells/motif-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { exitCodeForStatus } from "../src/utils/errors";

/**
 * Agent task regression fixtures (SURF-7).
 *
 * These spawn the real CLI and pin the machine-readable contract agents depend
 * on: the `--describe` creative enums against the SDK taxonomy, the semantic
 * exit-code mapping (SURF-5), and the structured error envelope shape.
 */

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

const tempHomes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-fixture-test-"));
  tempHomes.push(dir);
  return dir;
}

function runMotif(
  args: string[],
  options: { stdin?: string; home?: string; falKey?: string } = {},
): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: "1",
        FAL_KEY: options.falKey ?? "",
        HOME: options.home ?? tempHome(),
        NO_COLOR: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdin.end(options.stdin ?? "");

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function parseJsonLine(text: string): Record<string, unknown> {
  return JSON.parse(text.trim());
}

interface GenerateDescribeSchema {
  input: { properties: Record<string, { enum?: string[] }> };
}

function parseGenerateSchema(text: string): GenerateDescribeSchema {
  return JSON.parse(text.trim());
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("agent fixtures: describe schema contract", () => {
  it("advertises creative option enums that match the SDK taxonomy ids", async () => {
    const result = await runMotif([
      "--describe",
      "generate",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const generate = parseGenerateSchema(result.stdout);
    const properties = generate.input.properties;

    for (const [field, options] of Object.entries(CREATIVE_TAXONOMY)) {
      const expectedIds = options.map((option) => option.id);
      expect(properties[field]?.enum).toEqual(expectedIds);
    }
  });
});

describe("agent fixtures: semantic exit codes", () => {
  it("maps an unknown model on a dry-run to exit 2 with a structured error", async () => {
    const result = await runMotif([
      "a cat on a windowsill",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "not-a-real-model",
    ]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "UNKNOWN_MODEL",
      error: true,
      status: 400,
    });
  });

  it("maps a missing API key (non-dry-run) to exit 3", async () => {
    const result = await runMotif(
      ["a cat on a windowsill", "--format", "json", "--model", "banana"],
      { falKey: "" },
    );

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "MISSING_API_KEY",
      error: true,
      status: 401,
    });
  });

  it("maps a missing series to exit 4", async () => {
    const result = await runMotif([
      "series",
      "show",
      "this-series-does-not-exist",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(4);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "SERIES_NOT_FOUND",
      error: true,
      status: 404,
    });
  });
});

describe("agent fixtures: structured error envelope", () => {
  it("pins the RFC 7807 envelope keys for a known failure", async () => {
    const result = await runMotif([
      "a cat on a windowsill",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "not-a-real-model",
    ]);

    expect(result.code).toBe(2);

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "UNKNOWN_MODEL",
      type: "urn:motif:error:unknown-model",
      title: "Unknown Model",
      status: 400,
      is_retriable: false,
      doc_uri: "motif://describe/errors#unknown-model",
    });
    for (const key of [
      "code",
      "type",
      "title",
      "status",
      "is_retriable",
      "doc_uri",
    ]) {
      expect(error).toHaveProperty(key);
    }
  });
});

describe("exitCodeForStatus", () => {
  it("maps auth statuses to exit 3", () => {
    expect(exitCodeForStatus(401)).toBe(3);
    expect(exitCodeForStatus(403)).toBe(3);
  });

  it("maps not-found to exit 4", () => {
    expect(exitCodeForStatus(404)).toBe(4);
  });

  it("maps other 4xx to exit 2", () => {
    expect(exitCodeForStatus(400)).toBe(2);
    expect(exitCodeForStatus(422)).toBe(2);
  });

  it("maps 5xx upstream failures to exit 5", () => {
    expect(exitCodeForStatus(500)).toBe(5);
    expect(exitCodeForStatus(502)).toBe(5);
  });

  it("maps anything else to exit 1", () => {
    expect(exitCodeForStatus(200)).toBe(1);
    expect(exitCodeForStatus(0)).toBe(1);
  });
});
