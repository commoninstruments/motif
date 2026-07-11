import { describe, expect, it } from "vitest";
import { EDIT_CAPABLE_MODELS, GENERATION_MODELS, MODELS } from "../src/models";

describe("EDIT_CAPABLE_MODELS", () => {
  it("includes exactly the generation models whose config supports editing", () => {
    for (const id of GENERATION_MODELS) {
      expect(EDIT_CAPABLE_MODELS.includes(id)).toBe(
        Boolean(MODELS[id]?.supportsEdit),
      );
    }
  });

  it("excludes text-to-image-only models", () => {
    expect(EDIT_CAPABLE_MODELS).not.toContain("recraft");
    expect(EDIT_CAPABLE_MODELS).not.toContain("ideogram");
    expect(EDIT_CAPABLE_MODELS).not.toContain("qwen");
    expect(EDIT_CAPABLE_MODELS).not.toContain("flux-fast");
  });

  it("includes edit-capable models", () => {
    expect(EDIT_CAPABLE_MODELS).toContain("banana");
    expect(EDIT_CAPABLE_MODELS).toContain("gpt");
  });
});
