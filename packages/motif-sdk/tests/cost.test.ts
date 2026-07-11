import { describe, expect, it } from "vitest";
import { estimateCost } from "../src/cost";
import { MODELS } from "../src/models";

describe("estimateCost", () => {
  it("charges banana2 at fal's published resolution tiers", () => {
    const base = MODELS.banana2.pricePerImageUsd;
    expect(base).toBeDefined();
    expect(estimateCost("banana2", "0.5K")).toBeCloseTo(base! * 0.75);
    expect(estimateCost("banana2", "1K")).toBeCloseTo(base!);
    expect(estimateCost("banana2", "2K")).toBeCloseTo(base! * 1.5);
    expect(estimateCost("banana2", "4K")).toBeCloseTo(base! * 2);
  });

  it("doubles banana and gemini3 at 4K only", () => {
    for (const model of ["banana", "gemini3"]) {
      const base = MODELS[model].pricePerImageUsd;
      expect(base).toBeDefined();
      expect(estimateCost(model, "1K")).toBeCloseTo(base!);
      expect(estimateCost(model, "2K")).toBeCloseTo(base!);
      expect(estimateCost(model, "4K")).toBeCloseTo(base! * 2);
    }
  });

  it("multiplies by image count", () => {
    expect(estimateCost("banana2", "4K", 3)).toBeCloseTo(
      MODELS.banana2.pricePerImageUsd! * 2 * 3,
    );
  });

  it("ignores resolution for models without tiered pricing", () => {
    const base = MODELS.seedream4.pricePerImageUsd;
    expect(base).toBeDefined();
    expect(estimateCost("seedream4", "4K")).toBeCloseTo(base!);
  });
});
