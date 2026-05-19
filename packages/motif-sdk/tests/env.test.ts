import { describe, expect, it } from "vitest";
import { getFalKeyFromEnv, parseMotifEnv } from "../src/index";

describe("Motif env schema", () => {
  it("normalizes missing and empty fal keys as optional", () => {
    expect(getFalKeyFromEnv({})).toBeUndefined();
    expect(getFalKeyFromEnv({ FAL_KEY: "" })).toBeUndefined();
  });

  it("returns a non-empty fal key from the environment", () => {
    expect(getFalKeyFromEnv({ FAL_KEY: "fal-key" })).toBe("fal-key");
    expect(parseMotifEnv({ FAL_KEY: "fal-key" })).toEqual({
      FAL_KEY: "fal-key",
    });
  });
});
