import { CREATIVE_FIELDS } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { resolveCreativeDirection } from "../src/utils/creative";

describe("resolveCreativeDirection", () => {
  it("prefers flag values over base values per field", () => {
    const result = resolveCreativeDirection(
      { camera: "flag-camera", color: "flag-color" },
      { camera: "base-camera", color: "base-color", genre: "base-genre" }
    );

    expect(result).toEqual({
      camera: "flag-camera",
      color: "flag-color",
      genre: "base-genre",
    });
  });

  it("fills fields the flags omit from the base", () => {
    const result = resolveCreativeDirection(
      {},
      { lighting: "golden hour", shot: "wide" }
    );

    expect(result).toEqual({ lighting: "golden hour", shot: "wide" });
  });

  it("returns undefined when both flags and base are empty", () => {
    expect(resolveCreativeDirection({})).toBeUndefined();
    expect(resolveCreativeDirection({}, {})).toBeUndefined();
  });

  it("honors every field in CREATIVE_FIELDS", () => {
    for (const field of CREATIVE_FIELDS) {
      const result = resolveCreativeDirection({ [field]: "x" });
      expect(result).toBeDefined();
      expect(result?.[field]).toBe("x");
    }
  });
});
