import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

const tempHomes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-cli-test-"));
  tempHomes.push(dir);
  return dir;
}

function runMotif(args: string[], stdin = ""): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: "1",
        FAL_KEY: "",
        HOME: tempHome(),
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

  child.stdin.end(stdin);

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function parseJsonLine(text: string): Record<string, unknown> {
  return JSON.parse(text.trim()) as Record<string, unknown>;
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("CLI contract", () => {
  it("shows help when run with no arguments", async () => {
    const result = await runMotif([]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("motif studio");
    expect(result.stdout).toContain("Image generation prompt");
  });

  it("emits the full schema as structured JSON", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const schema = parseJsonLine(result.stdout);
    expect(schema.name).toBe("motif");
    expect(schema).toHaveProperty("commands");
    expect(schema).toHaveProperty("models");
    expect(schema).toHaveProperty("leaderboards");
    expect(schema).toHaveProperty("tools");
    expect(schema).toHaveProperty("errors");
  });

  it("describes local error metadata without a web dependency", async () => {
    const result = await runMotif(["--describe", "errors", "--format", "json"]);

    expect(result.code).toBe(0);
    const schema = parseJsonLine(result.stdout);
    const errors = schema.errors as Record<string, Record<string, unknown>>;

    expect(errors.UNKNOWN_MODEL).toMatchObject({
      status: 400,
      type: "urn:motif:error:unknown-model",
      docUri: "motif://describe/errors#unknown-model",
    });
    expect(errors.SERIES_NOT_FOUND).toMatchObject({
      status: 404,
      type: "urn:motif:error:series-not-found",
    });
  });

  it("allows dry-run generation without FAL_KEY", async () => {
    const result = await runMotif([
      "a cat on a windowsill",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      model: "banana",
      prompt: "a cat on a windowsill",
      valid: true,
    });
    expect(dryRun).toHaveProperty("estimatedCost");
  });

  it("normalizes current fal generation fields in dry-run output", async () => {
    const result = await runMotif([
      "studio portrait",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "gpt",
      "--aspect",
      "16:9",
      "--background",
      "transparent",
      "--quality",
      "medium",
      "--sync-mode",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      endpoint: "fal-ai/gpt-image-1.5",
      model: "gpt",
      valid: true,
    });
    expect(dryRun.body).toMatchObject({
      image_size: "1536x1024",
      background: "transparent",
      quality: "medium",
      sync_mode: true,
    });
  });

  it("normalizes Banana 2 current API fields in dry-run output", async () => {
    const result = await runMotif([
      "current launch poster",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana2",
      "--aspect",
      "auto",
      "--resolution",
      "0.5K",
      "--google-search",
      "--limit-generations",
      "--thinking",
      "minimal",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      endpoint: "fal-ai/nano-banana-2",
      model: "banana2",
      valid: true,
    });
    expect(dryRun.body).toMatchObject({
      aspect_ratio: "auto",
      resolution: "0.5K",
      enable_google_search: true,
      limit_generations: true,
      thinking_level: "minimal",
    });
  });

  it("rejects model-incompatible options during dry-run", async () => {
    const result = await runMotif([
      "simple product render",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "flux-fast",
      "--quality",
      "high",
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "INVALID_OPTION",
      status: 400,
    });
    expect(String(error.message)).toContain(
      "FLUX Schnell does not support quality",
    );
  });

  it("allows stdin JSON dry-run without FAL_KEY", async () => {
    const result = await runMotif(
      ["--format", "json"],
      JSON.stringify({
        command: "generate",
        dryRun: true,
        model: "banana",
        prompt: "stdin cat",
      }),
    );

    expect(result.code).toBe(0);
    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      command: "generate",
      dryRun: true,
      model: "banana",
      prompt: "stdin cat",
      valid: true,
    });
  });

  it("emits structured errors with stable metadata", async () => {
    const result = await runMotif([
      "test prompt",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "missing-model",
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "UNKNOWN_MODEL",
      doc_uri: "motif://describe/errors#unknown-model",
      error: true,
      is_retriable: false,
      status: 400,
      type: "urn:motif:error:unknown-model",
    });
  });

  it("lists fal utility tools as structured JSON", async () => {
    const result = await runMotif(["tool", "list", "--format", "json"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    const tools = payload.tools as Record<string, Record<string, unknown>>;
    expect(tools["sam3-image"]).toMatchObject({
      endpoint: "fal-ai/sam-3/image",
      inputKind: "image",
    });
    expect(tools["depth-anything"]).toMatchObject({
      endpoint: "fal-ai/image-preprocessors/depth-anything/v2",
      inputKind: "image",
    });
  });

  it("describes a specific fal utility tool", async () => {
    const result = await runMotif([
      "tool",
      "describe",
      "sam3-image",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "tool.describe",
      id: "sam3-image",
      endpoint: "fal-ai/sam-3/image",
      pricing: "$0.005/request",
    });
  });

  it("dry-runs fal utility tools without FAL_KEY", async () => {
    const result = await runMotif([
      "tool",
      "sam3-image",
      "https://example.com/input.png",
      "--prompt",
      "person",
      "--max-masks",
      "4",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "tool.run",
      dryRun: true,
      tool: "sam3-image",
      endpoint: "fal-ai/sam-3/image",
      valid: true,
    });
    expect(payload.body).toMatchObject({
      image_url: "https://example.com/input.png",
      max_masks: 4,
      prompt: "person",
    });
  });

  it("accepts fal utility tools through stdin JSON", async () => {
    const result = await runMotif(
      ["--format", "json"],
      JSON.stringify({
        command: "tool",
        dryRun: true,
        input: "https://example.com/input.png",
        options: { max_masks: 2 },
        prompt: "person",
        tool: "sam3-image",
      }),
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "tool.run",
      dryRun: true,
      tool: "sam3-image",
      endpoint: "fal-ai/sam-3/image",
      valid: true,
    });
    expect(payload.body).toMatchObject({
      image_url: "https://example.com/input.png",
      max_masks: 2,
      prompt: "person",
    });
  });

  it("rejects invalid fal utility numeric options before calling fal", async () => {
    const result = await runMotif([
      "tool",
      "marigold-depth",
      "https://example.com/input.png",
      "--ensemble-size",
      "1",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");

    const error = parseJsonLine(result.stderr);
    expect(error).toMatchObject({
      code: "INVALID_OPTION",
      status: 400,
    });
    expect(String(error.message)).toContain("ensemble size must be >= 2");
  });
});
