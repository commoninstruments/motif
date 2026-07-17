import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MotifConfig } from "../src/utils/config";

/**
 * Regression coverage for the generate save flow.
 *
 * fal can return a different image format than the requested output filename
 * implies; `downloadImage` corrects the extension and returns the path it
 * actually wrote. Every consumer after the download must use that actual
 * path — most importantly the post-save viewer open, which previously
 * received the stale requested path, threw "Image not found", and turned a
 * successful (billed) generation into GENERATION_FAILED exit 5.
 */

vi.mock("../src/api/fal", () => ({
  deletePayloads: vi.fn(),
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

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "motif-generate-save-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
});

afterEach(() => {
  rmSync(home, { force: true, recursive: true });
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  vi.restoreAllMocks();
});

const config: MotifConfig = {
  backgroundRemover: "rmbg",
  defaultAspect: "1:1",
  defaultModel: "banana",
  defaultResolution: "2K",
  openAfterGenerate: true,
  upscaler: "clarity",
};

describe("generateImage save flow", () => {
  it("opens and reports the actual saved path when the download corrects the extension", async () => {
    const fal = await import("../src/api/fal");
    const image = await import("../src/utils/image");
    const { generateImage } = await import("../src/commands/generate");

    const requestedPath = resolve("generated.png");
    const actualPath = resolve("generated.jpg");

    vi.mocked(fal.generate).mockResolvedValue({
      images: [{ url: "https://example.com/out" }],
      requestId: "req-1",
    });
    vi.mocked(image.downloadImage).mockResolvedValue(actualPath);
    vi.mocked(image.getImageDimensions).mockResolvedValue({
      height: 16,
      width: 16,
    });
    vi.mocked(image.getFileSize).mockReturnValue("1.0KB");

    const written: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        written.push(String(chunk));
        return true;
      });

    await generateImage(
      "a red circle on white",
      { output: "generated.png" },
      null,
      config,
      { format: "json", sanitize: true }
    );

    expect(image.downloadImage).toHaveBeenCalledWith(
      "https://example.com/out",
      requestedPath
    );

    // The regression: the viewer must open the path that was actually
    // written (.jpg), not the requested one (.png).
    expect(image.openImage).toHaveBeenCalledTimes(1);
    expect(image.openImage).toHaveBeenCalledWith(actualPath);

    // The structured result must also report the actual path.
    stdoutSpy.mockRestore();
    const jsonLine = written.find((chunk) => chunk.trimStart().startsWith("{"));
    expect(jsonLine).toBeDefined();
    const payload: unknown = JSON.parse(jsonLine ?? "{}");
    expect(payload).toMatchObject({
      command: "generate",
      images: [{ path: actualPath }],
    });
  });
});
