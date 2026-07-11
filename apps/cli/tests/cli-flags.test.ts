import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

/**
 * Verifies that advanced generation flags survive parsing and normalization,
 * landing in the fal request body of a `--dry-run --format json` invocation.
 * Each flag is paired with a model whose config actually supports it.
 */

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

const tempHomes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-cli-flags-"));
  tempHomes.push(dir);
  return dir;
}

async function runMotif(args: string[]): Promise<CliResult> {
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
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end("");

  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stderr, stdout });
    });
  });
}

async function dryRunBody(
  model: string,
  flags: string[]
): Promise<Record<string, unknown>> {
  const result = await runMotif([
    "a test prompt",
    "--dry-run",
    "--format",
    "json",
    "--model",
    model,
    ...flags,
  ]);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const payload = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
  return payload.body as Record<string, unknown>;
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("advanced generation flags reach the request body", () => {
  it("--seed lands as body.seed (banana)", async () => {
    const body = await dryRunBody("banana", ["--seed", "42"]);
    expect(body.seed).toBe(42);
  });

  it("--negative lands as body.negative_prompt (ideogram)", async () => {
    const body = await dryRunBody("ideogram", [
      "--negative",
      "blurry, low-res",
    ]);
    expect(body.negative_prompt).toBe("blurry, low-res");
  });

  it("--style lands as body.style (recraft)", async () => {
    const body = await dryRunBody("recraft", ["--style", "realistic_image"]);
    expect(body.style).toBe("realistic_image");
  });

  it("--output-format lands as body.output_format (qwen)", async () => {
    const body = await dryRunBody("qwen", ["--output-format", "png"]);
    expect(body.output_format).toBe("png");
  });

  it("--safety lands as body.safety_tolerance (flux)", async () => {
    const body = await dryRunBody("flux", ["--safety", "4"]);
    expect(body.safety_tolerance).toBe("4");
  });

  it("--guidance-scale and --steps land on flux-fast", async () => {
    const body = await dryRunBody("flux-fast", [
      "--guidance-scale",
      "7",
      "--steps",
      "8",
    ]);
    expect(body.guidance_scale).toBe(7);
    expect(body.num_inference_steps).toBe(8);
  });

  it("--raw lands as body.raw (flux)", async () => {
    const body = await dryRunBody("flux", ["--raw"]);
    expect(body.raw).toBe(true);
  });

  it("--rendering-speed lands as body.rendering_speed (ideogram)", async () => {
    const body = await dryRunBody("ideogram", ["--rendering-speed", "TURBO"]);
    expect(body.rendering_speed).toBe("TURBO");
  });
});
