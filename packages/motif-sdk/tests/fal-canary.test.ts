import { describe, expect, it } from "vitest";
import { getFalKeyFromEnv, MotifServer } from "../src/index";

const describeCanary =
  process.env.RUN_FAL_CANARY === "1" ? describe : describe.skip;

describeCanary("fal live canaries", () => {
  it("generates one low-cost image with advanced generation controls", async () => {
    const apiKey = getFalKeyFromEnv();
    expect(apiKey, "FAL_KEY is required when RUN_FAL_CANARY=1").toBeTruthy();

    const motif = new MotifServer({ apiKey: apiKey ?? "", retries: 1 });
    const result = await motif.generate({
      model: "flux-fast",
      prompt:
        "plain product photo of a matte blue cube on white seamless, centered",
      aspect: "4:3",
      guidanceScale: 3,
      numInferenceSteps: 4,
      numImages: 1,
      outputFormat: "jpeg",
      seed: 1234,
      syncMode: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.images).toHaveLength(1);
      expect(result.value.images[0]?.url).toMatch(/^https?:\/\//);
    }
  }, 120_000);

  it("runs one live SAM 3 image tool request with non-default options", async () => {
    const apiKey = getFalKeyFromEnv();
    expect(apiKey, "FAL_KEY is required when RUN_FAL_CANARY=1").toBeTruthy();

    const motif = new MotifServer({ apiKey: apiKey ?? "", retries: 1 });
    const result = await motif.runTool({
      tool: "sam3-image",
      input:
        "https://raw.githubusercontent.com/facebookresearch/segment-anything/main/notebooks/images/truck.jpg",
      options: {
        apply_mask: false,
        max_masks: 1,
        output_format: "png",
        prompt: "truck",
      },
    });

    expect(result.isOk(), result.isErr() ? result.error.message : "").toBe(
      true,
    );
    if (result.isOk()) {
      expect(result.value).toEqual(expect.any(Object));
      expect(Object.keys(result.value).length).toBeGreaterThan(0);
    }
  }, 120_000);
});
