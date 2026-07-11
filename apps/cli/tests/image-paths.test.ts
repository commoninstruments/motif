import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { indexedOutputPath } from "../src/utils/image";

describe("indexedOutputPath", () => {
  it("indexes a .png path", () => {
    expect(indexedOutputPath("out.png", 0)).toBe("out-1.png");
  });

  it("indexes a .jpg path", () => {
    expect(indexedOutputPath("out.jpg", 1)).toBe("out-2.jpg");
  });

  it("indexes a .webp path with a directory", () => {
    expect(indexedOutputPath("shots/out.webp", 0)).toBe(
      join("shots", "out-1.webp")
    );
  });

  it("defaults to .png for an extensionless path", () => {
    expect(indexedOutputPath("out", 0)).toBe("out-1.png");
  });

  it("keeps the directory of an absolute path", () => {
    expect(indexedOutputPath("/tmp/renders/out.png", 2)).toBe(
      join("/tmp/renders", "out-3.png")
    );
  });
});
