import { describe, expect, it } from "vitest";

import { MODELS, MotifServer } from "../src/index";

describe("@howells/motif-server compatibility wrapper", () => {
  it("re-exports the SDK surface", () => {
    // oxlint-disable-next-line no-deprecated -- deliberate: this wrapper exists to preserve the deprecated `MotifServer` alias; asserting it stays exported is the compat contract.
    expect(MotifServer).toBeTypeOf("function");
    expect(MODELS).toHaveProperty("banana");
  });
});
