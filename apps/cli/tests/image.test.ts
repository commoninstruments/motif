import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadImage, getImageDimensions } from "../src/utils/image";

const JPEG_16X16_WITH_DENSITY =
  "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A/bsSAj5RmopCR1GD71856f8AHz4V6aLuR/F8F15kEkYjaR+WbGMZUiuW/hGM8R45qbofKz/9k=";

let testDir: string | undefined;

afterEach(() => {
  if (testDir) {
    rmSync(testDir, { force: true, recursive: true });
    testDir = undefined;
  }
});

describe("getImageDimensions", () => {
  it("returns pixel dimensions for JPEGs that also include density metadata", async () => {
    testDir = mkdtempSync(join(tmpdir(), "motif-image-test-"));
    const imagePath = join(testDir, "density.jpg");
    writeFileSync(imagePath, Buffer.from(JPEG_16X16_WITH_DENSITY, "base64"));

    await expect(getImageDimensions(imagePath)).resolves.toEqual({
      height: 16,
      width: 16,
    });
  });
});

describe("downloadImage", () => {
  it("renames .png outputs to .jpg when fal returns JPEG bytes", async () => {
    testDir = mkdtempSync(join(tmpdir(), "motif-image-test-"));
    const requestedPath = join(testDir, "generated.png");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        arrayBuffer: async () =>
          Buffer.from(JPEG_16X16_WITH_DENSITY, "base64").buffer,
        headers: new Headers({ "content-type": "image/jpeg" }),
        ok: true,
        statusText: "OK",
      }))
    );

    const actualPath = await downloadImage(
      "https://example.com/generated.jpg",
      requestedPath
    );

    expect(actualPath).toBe(join(testDir, "generated.jpg"));
    expect(existsSync(actualPath)).toBe(true);
    expect(existsSync(requestedPath)).toBe(false);
  });
});
