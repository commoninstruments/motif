import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface PackFile {
  path: string;
}

interface PackResult {
  files: PackFile[];
  name: string;
}

interface RunResult {
  code: number;
  stderr: string;
  stdout: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPackResult(value: unknown): value is PackResult {
  return typeof value === "object" && value !== null && "files" in value;
}

const repoRoot = resolve(import.meta.dirname, "../../..");

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<RunResult> {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      CI: "1",
      FAL_KEY: "",
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

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

  return await new Promise((resolveResult, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolveResult({ code: code ?? 0, stderr, stdout });
    });
  });
}

async function npmPackDryRun(packagePath: string): Promise<PackResult> {
  const result = await runCommand(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    packagePath
  );
  expect(result.code, result.stderr).toBe(0);
  const parsed: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) {
    throw new TypeError("expected npm pack --json to return an array");
  }
  const first: unknown = parsed[0];
  if (!isPackResult(first)) {
    throw new Error("expected an npm pack result object");
  }
  return first;
}

function expectPublicPackage(pack: PackResult, expectedFiles: string[]) {
  const files = pack.files.map((file) => file.path).toSorted();
  expect(files).toEqual(expectedFiles.toSorted());
  expect(files.some((file) => file.includes("apps/web"))).toBe(false);
  expect(files.some((file) => file.includes(".env"))).toBe(false);
  expect(files.some((file) => file.includes("src/"))).toBe(false);
  expect(
    files.every(
      (file) =>
        file === "package.json" ||
        file === "README.md" ||
        file.startsWith("dist/") ||
        file.startsWith("bin/")
    )
  ).toBe(true);
}

describe("package smoke", () => {
  it("imports the public SDK", async () => {
    const sdk = await import("@howells/motif-sdk");

    expect(sdk.FalClient).toBeTypeOf("function");
    // oxlint-disable-next-line no-deprecated -- deliberate: assert the deprecated `MotifServer` alias is still exported and identical to `FalClient`.
    expect(sdk.MotifServer).toBeTypeOf("function");
    // oxlint-disable-next-line no-deprecated -- deliberate: the alias must remain the same class as `FalClient` for backwards compatibility.
    expect(sdk.MotifServer).toBe(sdk.FalClient);
    expect(sdk.FAL_TOOLS["sam3-image"].endpoint).toBe("fal-ai/sam-3/image");
  });

  it("runs the built CLI binary without a Fal key", async () => {
    const cliBin = resolve(repoRoot, "apps/cli/bin/motif");
    expect(existsSync(resolve(repoRoot, "apps/cli/dist/index.js"))).toBe(true);

    const help = await runCommand(
      process.execPath,
      [cliBin, "--help"],
      repoRoot
    );
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage:");
    expect(help.stdout).toContain("motif studio");

    const dryRun = await runCommand(
      process.execPath,
      [
        cliBin,
        "studio portrait",
        "--model",
        "gpt",
        "--aspect",
        "16:9",
        "--background",
        "transparent",
        "--quality",
        "medium",
        "--dry-run",
        "--format",
        "json",
      ],
      repoRoot
    );
    expect(dryRun.code).toBe(0);
    const payload: unknown = JSON.parse(dryRun.stdout);
    if (!isRecord(payload)) {
      throw new Error("expected a JSON object");
    }
    expect(payload).toMatchObject({
      endpoint: "fal-ai/gpt-image-1.5",
      valid: true,
    });
    expect(payload.body).toMatchObject({
      background: "transparent",
      image_size: "1536x1024",
      quality: "medium",
    });
  });

  it("keeps public package tarballs limited to allowlisted files", async () => {
    const sdkPack = await npmPackDryRun(
      resolve(repoRoot, "packages/motif-sdk")
    );
    expectPublicPackage(sdkPack, [
      "README.md",
      "dist/image.d.ts",
      "dist/image.js",
      "dist/index.cjs",
      "dist/index.d.cts",
      "dist/index.d.ts",
      "dist/index.js",
      "package.json",
    ]);

    const cliPack = await npmPackDryRun(resolve(repoRoot, "apps/cli"));
    expectPublicPackage(cliPack, [
      "README.md",
      "bin/motif",
      "dist/index.js",
      "package.json",
    ]);

    const mcpPack = await npmPackDryRun(
      resolve(repoRoot, "packages/motif-mcp")
    );
    expectPublicPackage(mcpPack, [
      "README.md",
      "bin/motif-mcp",
      "dist/index.js",
      "package.json",
    ]);

    const serverPack = await npmPackDryRun(
      resolve(repoRoot, "packages/motif-server")
    );
    expectPublicPackage(serverPack, [
      "README.md",
      "dist/index.cjs",
      "dist/index.d.cts",
      "dist/index.d.ts",
      "dist/index.js",
      "package.json",
    ]);
  }, 30_000);
});
