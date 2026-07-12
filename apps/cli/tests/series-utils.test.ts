import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SeriesRef } from "../src/utils/series";

/**
 * series.ts resolves its base dir once at module load from
 * `join(homedir(), ".motif")`, and `os.homedir()` reads `$HOME` on POSIX.
 * Each test points HOME at a fresh temp dir and re-imports the module so the
 * SERIES_DIR constant rebinds to that sandbox.
 */

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

let home: string;
let series: typeof import("../src/utils/series");

/** Create a throwaway PNG that passes validateEditPath's existence + extension checks. */
function makeImage(name: string): string {
  const path = join(home, name);
  writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return path;
}

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "motif-series-utils-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
  series = await import("../src/utils/series");
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
});

describe("slugify", () => {
  it("lowercases, collapses non-alphanumerics, and trims dashes", () => {
    expect(series.slugify("Luna's Adventure!")).toBe("luna-s-adventure");
    expect(series.slugify("  Hello  World  ")).toBe("hello-world");
  });

  it("caps the slug length at 64 characters", () => {
    const slug = series.slugify("a".repeat(120));
    expect(slug.length).toBe(64);
  });
});

describe("createSeries", () => {
  it("writes a config with defaults and directory scaffolding", async () => {
    const config = await series.createSeries({ name: "My Series" });

    expect(config.slug).toBe("my-series");
    expect(config.model).toBe("banana");
    expect(config.defaultAspect).toBe("1:1");
    expect(config.defaultResolution).toBe("2K");
    expect(config.refs).toEqual([]);
    expect(config.outputs).toEqual([]);

    const dir = join(series.SERIES_DIR, "my-series");
    expect(existsSync(join(dir, "series.json"))).toBe(true);
    expect(existsSync(join(dir, "refs"))).toBe(true);
    expect(existsSync(join(dir, "outputs"))).toBe(true);
  });

  it("honors supplied model, aspect, resolution, and style prompt", async () => {
    const config = await series.createSeries({
      defaultAspect: "3:2",
      defaultResolution: "4K",
      model: "gpt",
      name: "Custom",
      stylePrompt: "watercolor, soft pastels",
    });

    expect(config.model).toBe("gpt");
    expect(config.defaultAspect).toBe("3:2");
    expect(config.defaultResolution).toBe("4K");
    expect(config.stylePrompt).toBe("watercolor, soft pastels");
  });

  it("copies the initial style reference when fromImage is given", async () => {
    const image = makeImage("cover.png");
    const config = await series.createSeries({
      fromImage: image,
      name: "Cover",
    });

    expect(config.refs).toHaveLength(1);
    const ref = config.refs[0];
    expect(ref?.tag).toBe("style");
    expect(ref?.filename).toBe("style-cover.png");
    expect(
      existsSync(join(series.seriesRefsDir("cover"), "style-cover.png"))
    ).toBe(true);
  });

  it("throws when the series already exists", async () => {
    await series.createSeries({ name: "Dupe" });
    await expect(series.createSeries({ name: "Dupe" })).rejects.toThrow(
      /already exists/
    );
  });
});

describe("loadSeries / saveSeries", () => {
  it("round-trips a config and refreshes the updated timestamp", async () => {
    const created = await series.createSeries({ name: "Roundtrip" });
    const loaded = await series.loadSeries("roundtrip");
    expect(loaded.id).toBe(created.id);
    expect(loaded.name).toBe("Roundtrip");

    const before = loaded.updated;
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    await series.saveSeries({ ...loaded, stylePrompt: "updated" });

    const reloaded = await series.loadSeries("roundtrip");
    expect(reloaded.stylePrompt).toBe("updated");
    expect(new Date(reloaded.updated).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime()
    );
  });

  it("throws for a missing series", async () => {
    await expect(series.loadSeries("nope")).rejects.toThrow(/not found/);
  });
});

describe("listSeries / deleteSeries", () => {
  it("lists created series and drops deleted ones", async () => {
    await series.createSeries({ name: "First" });
    await series.createSeries({ name: "Second" });

    const slugs = (await series.listSeries()).map((s) => s.slug);
    expect(slugs).toContain("first");
    expect(slugs).toContain("second");

    await series.deleteSeries("first");
    const afterDelete = (await series.listSeries()).map((s) => s.slug);
    expect(afterDelete).not.toContain("first");
    expect(afterDelete).toContain("second");
  });

  it("throws when deleting a missing series", async () => {
    await expect(series.deleteSeries("ghost")).rejects.toThrow(/not found/);
  });
});

describe("addRef / removeRef / resolveRefs", () => {
  it("adds a reference, copies the file, and resolves its path", async () => {
    await series.createSeries({ name: "Refs" });
    const image = makeImage("luna.png");

    const ref = await series.addRef("refs", image, "character", "Luna front");
    expect(ref.tag).toBe("character");
    expect(ref.filename).toBe("character-luna.png");
    expect(ref.description).toBe("Luna front");

    const config = await series.loadSeries("refs");
    expect(config.refs).toHaveLength(1);

    const resolved = series.resolveRefs(config);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toBe(
      join(series.seriesRefsDir("refs"), "character-luna.png")
    );
    expect(existsSync(resolved[0] ?? "")).toBe(true);
  });

  it("filters resolveRefs by tag and removes references", async () => {
    await series.createSeries({ name: "Tagged" });
    await series.addRef("tagged", makeImage("a.png"), "character", "a");
    await series.addRef("tagged", makeImage("b.png"), "location", "b");

    const config = await series.loadSeries("tagged");
    expect(series.resolveRefs(config, ["character"])).toHaveLength(1);
    expect(series.resolveRefs(config, ["character", "location"])).toHaveLength(
      2
    );
    expect(series.resolveRefs(config, ["missing"])).toHaveLength(0);

    await series.removeRef("tagged", "character-a.png");
    const after = await series.loadSeries("tagged");
    expect(after.refs.map((r) => r.filename)).toEqual(["location-b.png"]);
    expect(
      existsSync(join(series.seriesRefsDir("tagged"), "character-a.png"))
    ).toBe(false);
  });

  it("throws when removing a reference that does not exist", async () => {
    await series.createSeries({ name: "Empty" });
    await expect(series.removeRef("empty", "nope.png")).rejects.toThrow(
      /Reference not found/
    );
  });
});

describe("recordOutput / buildSeriesPrompt", () => {
  it("appends outputs to the series config", async () => {
    await series.createSeries({ name: "Outputs" });
    await series.recordOutput("outputs", {
      aspect: "1:1",
      cost: 0.08,
      filename: "001-scene.png",
      model: "banana",
      prompt: "a scene",
      refsUsed: ["character"],
      resolution: "2K",
      timestamp: new Date().toISOString(),
    });

    const config = await series.loadSeries("outputs");
    expect(config.outputs).toHaveLength(1);
    expect(config.outputs[0]?.filename).toBe("001-scene.png");
  });

  it("prepends the style prompt only when one is set", async () => {
    const styled = await series.createSeries({
      name: "Styled",
      stylePrompt: "noir",
    });
    expect(series.buildSeriesPrompt(styled, "a cat")).toBe("noir. a cat");

    const plain = await series.createSeries({ name: "Plain" });
    expect(series.buildSeriesPrompt(plain, "a cat")).toBe("a cat");
  });
});

describe("path traversal guards", () => {
  it("rejects a crafted ref tag containing traversal before any write", async () => {
    await series.createSeries({ name: "Guarded" });
    const image = makeImage("evil.png");

    await expect(
      series.addRef("guarded", image, "../../escape", "x")
    ).rejects.toThrow(/path traversal/);

    // Nothing escaped the refs directory.
    const refsDir = series.seriesRefsDir("guarded");
    expect(readdirSync(refsDir)).toHaveLength(0);
    expect(existsSync(join(series.SERIES_DIR, "escape"))).toBe(false);
  });

  it("rejects removing a ref whose filename escapes the refs directory", async () => {
    const config = await series.createSeries({ name: "Escape" });

    // A file one level above refs/ that the guard must protect.
    const sentinelDir = join(series.SERIES_DIR, "escape");
    const sentinel = join(sentinelDir, "escape.txt");
    writeFileSync(sentinel, "keep me");

    // Seed a malicious ref entry directly so removeRef reaches the guard.
    const maliciousRef: SeriesRef = {
      added: new Date().toISOString(),
      description: "",
      filename: "../escape.txt",
      tag: "x",
    };
    await series.saveSeries({ ...config, refs: [maliciousRef] });

    await expect(series.removeRef("escape", "../escape.txt")).rejects.toThrow(
      /escapes series refs directory/
    );
    // The guard threw before unlink — the outside file is untouched.
    expect(existsSync(sentinel)).toBe(true);
  });
});
