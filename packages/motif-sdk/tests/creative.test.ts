import { describe, expect, it } from "vitest";

import { enrichPrompt } from "../src/index";

describe("enrichPrompt", () => {
  it("returns the sanitized base prompt unchanged without creative direction", () => {
    const result = enrichPrompt({
      prompt: "  studio portrait\r\n",
    });

    expect(result).toEqual({
      basePrompt: "studio portrait",
      creative: {
        clauses: [],
        selected: {},
      },
      prompt: "studio portrait",
    });
  });

  it("appends creative clauses in canonical field order", () => {
    const result = enrichPrompt({
      creative: {
        lighting: "rim",
        recipe: "cinematic",
        shot: "close-up",
      },
      prompt: "luxury watch on black marble",
    });

    expect(result).toEqual({
      basePrompt: "luxury watch on black marble",
      creative: {
        clauses: [
          "cinematic scene",
          "close-up composition with controlled depth of field",
          "rim lighting with defined edge highlights",
        ],
        selected: {
          lighting: "rim",
          recipe: "cinematic",
          shot: "close-up",
        },
      },
      prompt:
        "luxury watch on black marble, cinematic scene, close-up composition with controlled depth of field, rim lighting with defined edge highlights",
    });
  });

  it("throws a structured error for unknown creative option ids", () => {
    expect(() =>
      enrichPrompt({
        creative: {
          lighting: "rim-light",
        },
        prompt: "studio portrait",
      })
    ).toThrowError(
      expect.objectContaining({
        availableIds: ["rim"],
        code: "INVALID_OPTION",
        field: "lighting",
        value: "rim-light",
      })
    );
  });

  it("supports the initial option set for every creative field", () => {
    const result = enrichPrompt({
      creative: {
        camera: "macro-product",
        color: "monochrome",
        genre: "film-noir",
        lighting: "rim",
        material: "reflective",
        motion: "still",
        recipe: "cinematic",
        shot: "close-up",
      },
      prompt: "luxury watch on black marble",
    });

    expect(result.creative).toEqual({
      clauses: [
        "cinematic scene",
        "close-up composition with controlled depth of field",
        "rim lighting with defined edge highlights",
        "film noir mood with high contrast shadows",
        "macro product photography with crisp surface detail",
        "monochrome palette with tonal contrast",
        "reflective material surfaces with controlled highlights",
        "still composition with no motion blur",
      ],
      selected: {
        camera: "macro-product",
        color: "monochrome",
        genre: "film-noir",
        lighting: "rim",
        material: "reflective",
        motion: "still",
        recipe: "cinematic",
        shot: "close-up",
      },
    });
  });
});
