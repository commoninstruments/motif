import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Non-dry-run coverage for the series run orchestration.
 *
 * The deterministic helpers (`loadOrCreateRunSeries`, `buildSeriesRunScenes`,
 * `buildSeriesRunStylePrompt`) are exercised directly against a temp HOME.
 * The full `series run` generate loop is driven through the only exported
 * entry point (`runSeries`) with `../src/api/fal` and the image/download
 * side effects mocked, so no fal request is ever made.
 */

vi.mock("../src/api/fal", () => ({
  generate: vi.fn(),
}));

vi.mock("../src/utils/image", async (importActual) => {
  const actual = await importActual<typeof import("../src/utils/image")>();
  return {
    ...actual,
    downloadImage: vi.fn(),
    getFileSize: vi.fn(),
    getImageDimensions: vi.fn(),
    openImage: vi.fn(),
  };
});

vi.mock("../src/utils/input", async (importActual) => {
  const actual = await importActual<typeof import("../src/utils/input")>();
  return {
    ...actual,
    readStdinJson: vi.fn(async () => null),
  };
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalFalKey = process.env.FAL_KEY;

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motif-series-run-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.FAL_KEY = "test-key";
  vi.resetModules();
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  process.env.FAL_KEY = originalFalKey;
  vi.restoreAllMocks();
});

describe("buildSeriesRunStylePrompt", () => {
  it("prefers an explicit style over the generated fallback", async () => {
    const { buildSeriesRunStylePrompt } =
      await import("../src/commands/series");
    expect(buildSeriesRunStylePrompt("towers", "brutalist concrete")).toBe(
      "brutalist concrete"
    );
  });

  it("synthesizes a cohesive style prompt from the theme", async () => {
    const { buildSeriesRunStylePrompt } =
      await import("../src/commands/series");
    const prompt = buildSeriesRunStylePrompt("towers");
    expect(prompt).toContain("Cohesive visual series about towers");
    expect(prompt).toContain("consistent tone");
  });
});

describe("buildSeriesRunScenes", () => {
  it("produces one indexed scene prompt per requested image", async () => {
    const { buildSeriesRunScenes } = await import("../src/commands/series");
    const scenes = buildSeriesRunScenes("towers", 3);
    expect(scenes).toHaveLength(3);
    expect(scenes[0]).toContain("Image 1 of 3");
    expect(scenes[1]).toContain("Image 2 of 3");
    expect(scenes[2]).toContain("Image 3 of 3");
  });

  it("cycles through the scene foci for large counts", async () => {
    const { buildSeriesRunScenes } = await import("../src/commands/series");
    const scenes = buildSeriesRunScenes("towers", 9);
    expect(scenes).toHaveLength(9);
    // Focus list has 8 entries, so scene 9 reuses the first focus.
    expect(scenes[8]).toContain("wide establishing composition");
  });
});

describe("loadOrCreateRunSeries", () => {
  it("loads an existing series when a slug is supplied", async () => {
    const { createSeries } = await import("../src/utils/series");
    const { loadOrCreateRunSeries } = await import("../src/commands/series");

    const created = await createSeries({ name: "Existing Run" });
    const loaded = await loadOrCreateRunSeries({
      aspect: "1:1",
      model: "banana",
      resolution: "2K",
      series: created.slug,
      stylePrompt: "ignored",
      theme: "unused theme",
    });

    expect(loaded.slug).toBe(created.slug);
    expect(loaded.id).toBe(created.id);
  });

  it("creates a new series from the theme when none is supplied", async () => {
    const { loadSeries } = await import("../src/utils/series");
    const { loadOrCreateRunSeries } = await import("../src/commands/series");

    const config = await loadOrCreateRunSeries({
      aspect: "3:2",
      model: "gpt",
      resolution: "4K",
      stylePrompt: "editorial",
      theme: "Glass Towers",
    });

    expect(config.slug).toBe("glass-towers");
    expect(config.model).toBe("gpt");
    expect(config.defaultAspect).toBe("3:2");
    expect(config.stylePrompt).toBe("editorial");
    // Persisted, not just returned.
    await expect(loadSeries("glass-towers")).resolves.toMatchObject({
      slug: "glass-towers",
    });
  });

  it("falls back to loading when the theme slug already exists", async () => {
    const { createSeries } = await import("../src/utils/series");
    const { loadOrCreateRunSeries } = await import("../src/commands/series");

    const first = await createSeries({
      name: "Repeat Theme",
      stylePrompt: "original",
    });

    // No `series` slug, same theme → createSeries throws "already exists",
    // and the helper recovers by loading the existing series.
    const recovered = await loadOrCreateRunSeries({
      aspect: "1:1",
      model: "banana",
      resolution: "2K",
      stylePrompt: "should-be-ignored",
      theme: "Repeat Theme",
    });

    expect(recovered.id).toBe(first.id);
    expect(recovered.stylePrompt).toBe("original");
  });
});

describe("runSeries full generate flow (mocked fal)", () => {
  it("generates each image, reuses the first as an anchor reference, and records outputs", async () => {
    const fal = await import("../src/api/fal");
    const image = await import("../src/utils/image");
    const { runSeries } = await import("../src/commands/series");
    const { loadSeries } = await import("../src/utils/series");

    let counter = 0;
    vi.mocked(fal.generate).mockImplementation(async () => ({
      images: [{ url: `https://cdn.example/generated-${counter++}.png` }],
    }));
    vi.mocked(image.downloadImage).mockImplementation(
      async (_url, outputPath) => outputPath
    );
    vi.mocked(image.getImageDimensions).mockResolvedValue({
      height: 1024,
      width: 1024,
    });
    vi.mocked(image.getFileSize).mockReturnValue("1.0 KB");

    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await runSeries([
      "run",
      "Brutalist Towers",
      "--count",
      "2",
      "--format",
      "json",
      "--model",
      "banana",
    ]);

    const generateMock = vi.mocked(fal.generate);
    expect(generateMock).toHaveBeenCalledTimes(2);

    // First image has no anchor yet; the second reuses the first as a reference.
    expect(generateMock.mock.calls[0]?.[0].editImages).toBeUndefined();
    const secondEdit = generateMock.mock.calls[1]?.[0].editImages;
    expect(secondEdit).toHaveLength(1);
    expect(secondEdit?.[0]).toMatch(/-01\.png$/);

    const payload: unknown = JSON.parse(writes.join("").trim());
    if (!isRecord(payload)) {
      throw new Error("expected a JSON object");
    }
    expect(payload).toMatchObject({
      command: "series-run",
      dryRun: false,
      series: "brutalist-towers",
    });
    expect(payload.images).toHaveLength(2);

    const persisted = await loadSeries("brutalist-towers");
    expect(persisted.outputs).toHaveLength(2);
    expect(persisted.outputs[1]?.refsUsed).toContain("series-anchor");
  });
});
