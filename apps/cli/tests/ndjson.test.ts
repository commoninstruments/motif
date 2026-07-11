import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EmitOptions, emitStream } from "../src/utils/output";

describe("emitStream", () => {
  let writtenData: string;

  beforeEach(() => {
    writtenData = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writtenData += chunk;
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one newline-delimited JSON object per item", () => {
    const opts: EmitOptions = { format: "json" };
    emitStream(
      [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ],
      opts,
    );

    const lines = writtenData.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "")).toEqual({ id: 1, name: "a" });
    expect(JSON.parse(lines[1] ?? "")).toEqual({ id: 2, name: "b" });
  });

  it("applies the field mask to every item", () => {
    const opts: EmitOptions = { format: "human", fields: "id" };
    emitStream(
      [
        { id: 1, secret: "x" },
        { id: 2, secret: "y" },
        { id: 3, secret: "z" },
      ],
      opts,
    );

    const lines = writtenData.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    for (const [index, line] of lines.entries()) {
      const parsed = JSON.parse(line);
      expect(parsed).toEqual({ id: index + 1 });
      expect(parsed).not.toHaveProperty("secret");
    }
  });

  it("emits nothing for an empty item list", () => {
    emitStream([], { format: "json" });
    expect(writtenData).toBe("");
  });
});

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

const tempHomes: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-ndjson-test-"));
  tempHomes.push(dir);
  return dir;
}

/** Seed a ~/.motif/history.json with the given generations under a temp HOME. */
function seedHistory(
  home: string,
  generations: Array<Record<string, unknown>>,
): void {
  const motifDir = join(home, ".motif");
  mkdirSync(motifDir, { recursive: true });
  writeFileSync(
    join(motifDir, "history.json"),
    JSON.stringify({
      generations,
      totalCost: { session: 0, today: 0, allTime: 0 },
      lastSessionDate: new Date().toISOString().split("T")[0],
    }),
  );
}

function runMotif(args: string[], home: string): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: "1",
        FAL_KEY: "",
        HOME: home,
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
  child.stdin.end("");

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

afterEach(() => {
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (dir) {
      rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe("history --format ndjson (spawned CLI)", () => {
  it("streams one JSON object per line", async () => {
    const home = tempHome();
    seedHistory(home, [
      {
        id: "gen-one",
        prompt: "a cat",
        model: "banana",
        aspect: "1:1",
        resolution: "2K",
        output: "/tmp/one.png",
        cost: 0.08,
        timestamp: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "gen-two",
        prompt: "a dog",
        model: "flux",
        aspect: "1:1",
        resolution: "2K",
        output: "/tmp/two.png",
        cost: 0.06,
        timestamp: "2026-07-02T00:00:00.000Z",
      },
    ]);

    const result = await runMotif(["--history", "--format", "ndjson"], home);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const lines = result.stdout.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);

    const records = lines.map((line) => JSON.parse(line));
    // History is newest-first.
    expect(records[0]).toMatchObject({
      id: "gen-two",
      modelName: "FLUX Pro Ultra",
    });
    expect(records[1]).toMatchObject({ id: "gen-one" });
    for (const record of records) {
      expect(record).toHaveProperty("prompt");
      expect(record).toHaveProperty("cost");
    }
  });
});
