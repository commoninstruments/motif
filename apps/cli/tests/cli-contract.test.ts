import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDIT_CAPABLE_MODELS } from "@howells/motif-sdk";
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

function runMotif(
  args: string[],
  stdin = "",
  home = tempHome(),
): Promise<CliResult> {
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

  it("advertises the edit-capable model enum for the vary command", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);

    expect(result.code).toBe(0);

    const schema = parseJsonLine(result.stdout);
    const commands = schema.commands as Record<string, Record<string, unknown>>;
    const vary = commands.vary as {
      input: { properties: { model: { enum: string[] } } };
    };

    expect(vary.input.properties.model.enum).toEqual([...EDIT_CAPABLE_MODELS]);
  });

  it("advertises series commands in the primary schema", async () => {
    const result = await runMotif(["--describe", "--format", "json"]);

    expect(result.code).toBe(0);

    const schema = parseJsonLine(result.stdout);
    const commands = schema.commands as Record<string, Record<string, unknown>>;
    const describe = commands.describe as {
      input: { properties: { command: { enum: string[] } } };
    };
    const series = commands.series as {
      subcommands: string[];
    };

    expect(describe.input.properties.command.enum).toContain("series");
    expect(series).toMatchObject({
      command: "series",
      supports_dry_run: true,
    });
    expect(series.subcommands).toContain("run");
  });

  it("describes creative direction options as generate enums", async () => {
    const result = await runMotif([
      "--describe",
      "generate",
      "--format",
      "json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const generate = parseJsonLine(result.stdout);
    const properties = (
      generate.input as {
        properties: Record<
          string,
          {
            enum?: string[];
            enumDescriptions?: Record<string, unknown>;
            type?: string;
          }
        >;
      }
    ).properties;
    expect(properties.recipe).toMatchObject({
      enum: ["cinematic"],
      type: "string",
    });
    expect(properties.recipe?.enumDescriptions.cinematic).toMatchObject({
      clause: "cinematic scene",
      label: "Cinematic",
    });
    expect(properties.lighting).toMatchObject({
      enum: ["rim"],
      type: "string",
    });
    expect(properties.genre).toMatchObject({
      enum: ["film-noir"],
      type: "string",
    });
    expect(properties.camera).toMatchObject({
      enum: ["macro-product"],
      type: "string",
    });
    expect(properties.color).toMatchObject({
      enum: ["monochrome"],
      type: "string",
    });
    expect(properties.material).toMatchObject({
      enum: ["reflective"],
      type: "string",
    });
    expect(properties.motion).toMatchObject({
      enum: ["still"],
      type: "string",
    });
  });

  it("dry-runs a themed series run without FAL_KEY", async () => {
    const result = await runMotif([
      "series",
      "run",
      "brutalist architecture",
      "--count",
      "6",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "series-run",
      count: 6,
      dryRun: true,
      model: "banana",
      theme: "brutalist architecture",
      valid: true,
    });
    expect(payload).toHaveProperty("estimatedCost");
    expect(payload.scenes).toHaveLength(6);
    expect(result.stdout).not.toContain("[FILTERED]");
  });

  it("applies creative direction to series run dry-run scene prompts", async () => {
    const result = await runMotif([
      "series",
      "run",
      "luxury watch campaign",
      "--count",
      "2",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana",
      "--recipe",
      "cinematic",
      "--lighting",
      "rim",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "series-run",
      creative: {
        clauses: [
          "cinematic scene",
          "rim lighting with defined edge highlights",
        ],
        selected: {
          lighting: "rim",
          recipe: "cinematic",
        },
      },
    });
    const firstScene = (payload.scenes as Record<string, unknown>[])[0];
    expect(firstScene).toMatchObject({
      baseScenePrompt:
        "Image 1 of 2 in a cohesive visual series about luxury watch campaign; wide establishing composition; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark",
      enrichedScenePrompt:
        "Image 1 of 2 in a cohesive visual series about luxury watch campaign; wide establishing composition; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark, cinematic scene, rim lighting with defined edge highlights",
    });
    expect(String(firstScene?.prompt)).toContain(
      "cinematic scene, rim lighting with defined edge highlights",
    );
  });

  it("applies creative direction to series gen dry-run prompts", async () => {
    const home = tempHome();
    const created = await runMotif(
      [
        "series",
        "create",
        "Studio Campaign",
        "--style",
        "editorial product language",
        "--model",
        "banana",
        "--format",
        "json",
      ],
      "",
      home,
    );
    expect(created.code).toBe(0);
    const series = parseJsonLine(created.stdout);

    const result = await runMotif(
      [
        "series",
        "gen",
        String(series.slug),
        "hero watch on steel table",
        "--dry-run",
        "--format",
        "json",
        "--recipe",
        "cinematic",
        "--lighting",
        "rim",
      ],
      "",
      home,
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "series-generate",
      creative: {
        clauses: [
          "cinematic scene",
          "rim lighting with defined edge highlights",
        ],
        selected: {
          lighting: "rim",
          recipe: "cinematic",
        },
      },
      scenePrompt: "hero watch on steel table",
    });
    expect(payload.prompt).toBe(
      "editorial product language. hero watch on steel table, cinematic scene, rim lighting with defined edge highlights",
    );
  });

  it("accepts themed series runs through stdin JSON", async () => {
    const result = await runMotif(
      ["series", "--format", "json"],
      JSON.stringify({
        command: "series-run",
        count: 3,
        dryRun: true,
        theme: "modular exhibition booths",
      }),
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJsonLine(result.stdout);
    expect(payload).toMatchObject({
      command: "series-run",
      count: 3,
      dryRun: true,
      theme: "modular exhibition booths",
      valid: true,
    });
    expect(payload.scenes).toHaveLength(3);
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

  it("emits creative metadata and enriched prompt during dry-run generation", async () => {
    const result = await runMotif([
      "luxury watch on black marble",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana",
      "--recipe",
      "cinematic",
      "--lighting",
      "rim",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      basePrompt: "luxury watch on black marble",
      command: "generate",
      creative: {
        clauses: [
          "cinematic scene",
          "rim lighting with defined edge highlights",
        ],
        selected: {
          lighting: "rim",
          recipe: "cinematic",
        },
      },
      dryRun: true,
      prompt:
        "luxury watch on black marble, cinematic scene, rim lighting with defined edge highlights",
      valid: true,
    });
    expect((dryRun.body as Record<string, unknown>).prompt).toBe(
      "luxury watch on black marble, cinematic scene, rim lighting with defined edge highlights",
    );
  });

  it("accepts creative direction through stdin JSON dry-run payloads", async () => {
    const result = await runMotif(
      ["--format", "json"],
      JSON.stringify({
        command: "generate",
        creative: {
          lighting: "rim",
          recipe: "cinematic",
        },
        dryRun: true,
        model: "banana",
        prompt: "luxury watch on black marble",
      }),
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      basePrompt: "luxury watch on black marble",
      creative: {
        selected: {
          lighting: "rim",
          recipe: "cinematic",
        },
      },
      prompt:
        "luxury watch on black marble, cinematic scene, rim lighting with defined edge highlights",
    });
  });

  it("lets creative CLI flags override matching stdin JSON fields", async () => {
    const result = await runMotif(
      ["--format", "json", "--recipe", "cinematic", "--lighting", "rim"],
      JSON.stringify({
        command: "generate",
        creative: {
          lighting: "missing",
        },
        dryRun: true,
        model: "banana",
        prompt: "luxury watch on black marble",
      }),
    );

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const dryRun = parseJsonLine(result.stdout);
    expect(dryRun).toMatchObject({
      creative: {
        selected: {
          lighting: "rim",
          recipe: "cinematic",
        },
      },
    });
  });

  it("emits field-specific details for invalid creative options", async () => {
    const result = await runMotif([
      "studio portrait",
      "--dry-run",
      "--format",
      "json",
      "--model",
      "banana",
      "--lighting",
      "rim-light",
    ]);

    expect(result.code).toBe(1);
    const error = JSON.parse(result.stderr.trim()) as {
      code: string;
      details: {
        availableIds: string[];
        field: string;
        value: string;
      };
      error: boolean;
    };
    expect(error).toMatchObject({
      code: "INVALID_OPTION",
      error: true,
      details: {
        availableIds: ["rim"],
        field: "lighting",
        value: "rim-light",
      },
    });
  });

  it("marks ephemeral dry-run generations as local-only after download", async () => {
    const result = await runMotif([
      "a cat on a windowsill",
      "--dry-run",
      "--ephemeral",
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
      ephemeral: true,
      historyRecorded: false,
      model: "banana",
      storeIo: false,
      valid: true,
    });
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
