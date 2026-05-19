import { describe, expect, it } from "vitest";
import {
  buildFalToolRequest,
  buildGenerateBody,
  estimateCost,
} from "../src/index";

describe("buildGenerateBody", () => {
  it("normalizes GPT Image 1.5 text generation controls", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "gpt",
      prompt: "studio portrait",
      aspect: "16:9",
      background: "transparent",
      quality: "medium",
      outputFormat: "png",
      syncMode: true,
    });

    expect(endpoint).toBe("fal-ai/gpt-image-1.5");
    expect(body).toMatchObject({
      prompt: "studio portrait",
      image_size: "1536x1024",
      background: "transparent",
      quality: "medium",
      output_format: "png",
      sync_mode: true,
      num_images: 1,
    });
  });

  it("normalizes GPT Image 1.5 edit controls and defaults edit size to auto", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "gpt",
      prompt: "replace the product label",
      editImageUrls: ["https://example.com/ref.png"],
      inputFidelity: "high",
      maskImageUrl: "https://example.com/mask.png",
    });

    expect(endpoint).toBe("fal-ai/gpt-image-1.5/edit");
    expect(body).toMatchObject({
      prompt: "replace the product label",
      image_size: "auto",
      quality: "high",
      image_urls: ["https://example.com/ref.png"],
      input_fidelity: "high",
      mask_image_url: "https://example.com/mask.png",
    });
  });

  it("uses fal image_size presets for GPT Image 2", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "gpt2",
      prompt: "minimal square app icon",
      aspect: "1:1",
      outputFormat: "png",
    });

    expect(endpoint).toBe("openai/gpt-image-2");
    expect(body).toMatchObject({
      prompt: "minimal square app icon",
      image_size: "square_hd",
      quality: "high",
      output_format: "png",
    });
    expect(body.image_size).not.toBe("1024x1024");
  });

  it("normalizes GPT Image 2 edit masks, quality, sync mode, and custom image size", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "gpt2",
      prompt: "change the wall color",
      editImageUrls: ["https://example.com/interior.png"],
      imageSize: { width: 1280, height: 720 },
      maskImageUrl: "https://example.com/wall-mask.png",
      quality: "auto",
      syncMode: true,
    });

    expect(endpoint).toBe("openai/gpt-image-2/image-to-image");
    expect(body).toMatchObject({
      prompt: "change the wall color",
      image_size: { width: 1280, height: 720 },
      quality: "auto",
      sync_mode: true,
      image_urls: ["https://example.com/interior.png"],
      mask_image_url: "https://example.com/wall-mask.png",
    });
  });

  it("routes Nano Banana 2 edits through the verified edit endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "banana2",
      prompt: "make it a product photo",
      editImageUrls: ["https://example.com/input.png"],
      aspect: "16:9",
      resolution: "4K",
      outputFormat: "webp",
      safetyTolerance: "3",
      enableWebSearch: true,
      seed: 42,
    });

    expect(endpoint).toBe("fal-ai/nano-banana-2/edit");
    expect(body).toMatchObject({
      prompt: "make it a product photo",
      aspect_ratio: "16:9",
      resolution: "4K",
      output_format: "webp",
      safety_tolerance: "3",
      enable_web_search: true,
      seed: 42,
      num_images: 1,
      image_urls: ["https://example.com/input.png"],
    });
  });

  it("normalizes Nano Banana 2 current API controls", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "banana2",
      prompt: "grounded current product launch poster",
      aspect: "auto",
      resolution: "0.5K",
      limitGenerations: false,
      thinkingLevel: "minimal",
      enableGoogleSearch: true,
      enableWebSearch: true,
      syncMode: true,
    });

    expect(endpoint).toBe("fal-ai/nano-banana-2");
    expect(body).toMatchObject({
      prompt: "grounded current product launch poster",
      aspect_ratio: "auto",
      resolution: "0.5K",
      limit_generations: false,
      thinking_level: "minimal",
      enable_google_search: true,
      enable_web_search: true,
      sync_mode: true,
      num_images: 1,
    });
  });

  it("normalizes FLUX.2 Flex controls to fal field names", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "flux2-flex",
      prompt: "sharp packaging mockup",
      aspect: "4:3",
      enableSafetyChecker: false,
      guidanceScale: 3.5,
      numInferenceSteps: 24,
      outputFormat: "png",
      seed: 7,
    });

    expect(endpoint).toBe("fal-ai/flux-2-flex");
    expect(body).toMatchObject({
      prompt: "sharp packaging mockup",
      image_size: "landscape_4_3",
      guidance_scale: 3.5,
      num_inference_steps: 24,
      output_format: "png",
      enable_safety_checker: false,
      seed: 7,
    });
    expect(body).not.toHaveProperty("num_images");
  });

  it("normalizes FLUX Pro Ultra reference image strength", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "flux",
      prompt: "premium watch campaign",
      editImageUrls: ["https://example.com/watch.png"],
      imagePromptStrength: 0.8,
    });

    expect(endpoint).toBe("fal-ai/flux-pro/v1.1-ultra");
    expect(body).toMatchObject({
      prompt: "premium watch campaign",
      image_url: "https://example.com/watch.png",
      image_prompt_strength: 0.8,
    });
  });

  it("rejects unsupported output formats before fal rejects the request", () => {
    expect(() =>
      buildGenerateBody({
        model: "flux2-flex",
        outputFormat: "webp",
        prompt: "sharp packaging mockup",
      }),
    ).toThrow("FLUX.2 Flex supports output formats: jpeg, png");
  });

  it("rejects options that the selected model does not support", () => {
    expect(() =>
      buildGenerateBody({
        model: "flux-fast",
        prompt: "simple product render",
        quality: "high",
      }),
    ).toThrow("FLUX Schnell does not support quality");

    expect(() =>
      buildGenerateBody({
        model: "gpt",
        prompt: "masked edit without edit image",
        maskImageUrl: "https://example.com/mask.png",
      }),
    ).toThrow("maskImageUrl requires editImageUrls");

    expect(() =>
      buildGenerateBody({
        model: "banana2",
        prompt: "unsupported prompt expansion",
        expandPrompt: true,
      }),
    ).toThrow("Nano Banana 2 does not support expandPrompt");

    expect(() =>
      buildGenerateBody({
        model: "flux",
        prompt: "unsupported custom size",
        imageSize: { width: 1280, height: 720 },
      }),
    ).toThrow("FLUX Pro Ultra does not support imageSize");
  });

  it("normalizes Grok resolution casing for fal", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "grok-image",
      prompt: "fast editorial sketch",
      resolution: "2K",
      numImages: 2,
    });

    expect(endpoint).toBe("xai/grok-imagine-image");
    expect(body).toMatchObject({
      aspect_ratio: "1:1",
      resolution: "2k",
      num_images: 2,
    });
  });
});

describe("estimateCost", () => {
  it("uses registry fal pricing for newly added image models", () => {
    expect(estimateCost("seedream4", "2K", 3)).toBeCloseTo(0.09);
    expect(estimateCost("grok-image", "2K", 4)).toBeCloseTo(0.08);
  });
});

describe("buildFalToolRequest", () => {
  it("normalizes SAM 3 image options into the fal request body", () => {
    const { endpoint, body } = buildFalToolRequest({
      tool: "sam3-image",
      input: "https://example.com/input.png",
      options: {
        apply_mask: false,
        max_masks: 5,
        prompt: "shoe",
      },
    });

    expect(endpoint).toBe("fal-ai/sam-3/image");
    expect(body).toMatchObject({
      image_url: "https://example.com/input.png",
      apply_mask: false,
      max_masks: 5,
      output_format: "png",
      prompt: "shoe",
    });
  });

  it("uses batch image input for the NSFW checker", () => {
    const { endpoint, body } = buildFalToolRequest({
      tool: "nsfw",
      inputs: ["https://example.com/a.png", "https://example.com/b.png"],
    });

    expect(endpoint).toBe("fal-ai/x-ailab/nsfw");
    expect(body).toEqual({
      image_urls: ["https://example.com/a.png", "https://example.com/b.png"],
    });
  });

  it("exposes fal image utility defaults for depth tools", () => {
    const { endpoint, body } = buildFalToolRequest({
      tool: "marigold-depth",
      input: "https://example.com/input.png",
    });

    expect(endpoint).toBe("fal-ai/imageutils/marigold-depth");
    expect(body).toMatchObject({
      image_url: "https://example.com/input.png",
      ensemble_size: 10,
      num_inference_steps: 10,
    });
  });
});
