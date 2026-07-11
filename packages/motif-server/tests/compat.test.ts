import { describe, expect, it } from "vitest";

import { MODELS, MotifServer } from "../src/index";

describe("@howells/motif-server compatibility wrapper", () => {
  it("re-exports the SDK surface", () => {
    expect(MotifServer).toBeTypeOf("function");
    expect(MODELS).toHaveProperty("banana");
  });
});
