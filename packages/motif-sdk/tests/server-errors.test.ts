import { describe, expect, it } from "vitest";

import { FalClient, MotifError, MotifServer } from "../src/index";

describe("FalClient builder-error contract", () => {
  const motif = new FalClient({ apiKey: "test-key" });

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

describe("MotifServer deprecated alias", () => {
  it("is the same class as FalClient", () => {
    // oxlint-disable-next-line no-deprecated -- deliberate: this test documents the deprecation-compat contract for the `MotifServer` alias.
    expect(MotifServer).toBe(FalClient);
  });

  it("constructs a working client via the deprecated name", () => {
    // oxlint-disable-next-line no-deprecated -- deliberate: verifies the deprecated alias still constructs a working client.
    const motif = new MotifServer("test-key");
    expect(motif).toBeInstanceOf(FalClient);
  });
});
