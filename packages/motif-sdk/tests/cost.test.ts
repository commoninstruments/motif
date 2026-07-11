import { describe, expect, it } from "vitest";
import { estimateCost } from "../src/cost";
import { MODELS } from "../src/models";

function price(model: string): number {
  const value = MODELS[model]?.pricePerImageUsd;
  if (value === undefined) {
    throw new Error(`missing configured price for ${model}`);
  }
  return value;
}

describe("estimateCost", () => {
  it("charges banana2 at fal's published resolution tiers", () => {
    const base = price("banana2");
    expect(estimateCost("banana2", "0.5K")).toBeCloseTo(base * 0.75);
    expect(estimateCost("banana2", "1K")).toBeCloseTo(base);
    expect(estimateCost("banana2", "2K")).toBeCloseTo(base * 1.5);
    expect(estimateCost("banana2", "4K")).toBeCloseTo(base * 2);
  });

  it("doubles banana and gemini3 at 4K only", () => {
    for (const model of ["banana", "gemini3"]) {
      const base = price(model);
      expect(estimateCost(model, "1K")).toBeCloseTo(base);
      expect(estimateCost(model, "2K")).toBeCloseTo(base);
      expect(estimateCost(model, "4K")).toBeCloseTo(base * 2);
    }
  });

  it("multiplies by image count", () => {
    expect(estimateCost("banana2", "4K", 3)).toBeCloseTo(
      price("banana2") * 2 * 3,
    );
  });

  it("ignores resolution for models without tiered pricing", () => {
    expect(estimateCost("seedream4", "4K")).toBeCloseTo(price("seedream4"));
  });
});
