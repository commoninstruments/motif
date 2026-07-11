import { describe, expect, it } from "vitest";

import { MotifError, MotifServer } from "../src/index";

describe("MotifServer builder-error contract", () => {
  const motif = new MotifServer({ apiKey: "test-key" });

  it("generate resolves with an err() for unknown creative option ids", async () => {
    const result = await motif.generate({
      creative: { lighting: "not-a-real-id" },
      model: "banana",
      prompt: "x",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.code).toBe("INVALID_OPTION");
      expect(result.error.message).toContain("Unknown creative lighting");
    }
  });

  it("submitGeneration resolves with an err() for unknown creative option ids", async () => {
    const result = await motif.submitGeneration({
      creative: { lighting: "not-a-real-id" },
      model: "banana",
      prompt: "x",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.code).toBe("INVALID_OPTION");
      expect(result.error.message).toContain("Unknown creative lighting");
    }
  });

  it("generate resolves with an err() for an unknown model", async () => {
    const result = await motif.generate({
      model: "nope",
      prompt: "x",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.message).toContain("Unknown model: nope");
    }
  });

  it("generate resolves with an err() for an option the model does not support", async () => {
    const result = await motif.generate({
      model: "flux-fast",
      prompt: "simple product render",
      quality: "high",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.message).toContain(
        "FLUX Schnell does not support quality"
      );
    }
  });
});
