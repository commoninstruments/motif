import { describe, expect, it } from "vitest";

import {
  buildFalToolRequest,
  buildGenerateBody,
  estimateCost,
} from "../src/index";

describe("buildGenerateBody", () => {
  it("enriches creative direction before building the fal request body", () => {
    const { body } = buildGenerateBody({
      creative: {
        lighting: "rim",
        recipe: "cinematic",
      },
      model: "banana",
      prompt: "luxury watch on black marble",
    });

    expect(body.prompt).toBe(
      "luxury watch on black marble, cinematic scene, rim lighting with defined edge highlights"
    );
    expect(body).not.toHaveProperty("creative");
  });

  it("normalizes GPT Image 1.5 text generation controls", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "16:9",
      background: "transparent",
      model: "gpt",
      outputFormat: "png",
      prompt: "studio portrait",
      quality: "medium",
      syncMode: true,
    });

    expect(endpoint).toBe("fal-ai/gpt-image-1.5");
    expect(body).toMatchObject({
      background: "transparent",
      image_size: "1536x1024",
      num_images: 1,
      output_format: "png",
      prompt: "studio portrait",
      quality: "medium",
      sync_mode: true,
    });
  });

  it("normalizes GPT Image 1.5 edit controls and defaults edit size to auto", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/ref.png"],
      inputFidelity: "high",
      maskImageUrl: "https://example.com/mask.png",
      model: "gpt",
      prompt: "replace the product label",
    });

    expect(endpoint).toBe("fal-ai/gpt-image-1.5/edit");
    expect(body).toMatchObject({
      image_size: "auto",
      image_urls: ["https://example.com/ref.png"],
      input_fidelity: "high",
      mask_image_url: "https://example.com/mask.png",
      prompt: "replace the product label",
      quality: "high",
    });
  });

  it("uses fal image_size presets for GPT Image 2", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "1:1",
      model: "gpt2",
      outputFormat: "png",
      prompt: "minimal square app icon",
    });

    expect(endpoint).toBe("openai/gpt-image-2");
    expect(body).toMatchObject({
      image_size: "square_hd",
      output_format: "png",
      prompt: "minimal square app icon",
      quality: "high",
    });
    expect(body.image_size).not.toBe("1024x1024");
  });

  it("normalizes GPT Image 2 edit masks, quality, sync mode, and custom image size", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/interior.png"],
      imageSize: { height: 720, width: 1280 },
      maskImageUrl: "https://example.com/wall-mask.png",
      model: "gpt2",
      prompt: "change the wall color",
      quality: "auto",
      syncMode: true,
    });

    expect(endpoint).toBe("openai/gpt-image-2/image-to-image");
    expect(body).toMatchObject({
      image_size: { height: 720, width: 1280 },
      image_urls: ["https://example.com/interior.png"],
      mask_image_url: "https://example.com/wall-mask.png",
      prompt: "change the wall color",
      quality: "auto",
      sync_mode: true,
    });
  });

  it("routes Nano Banana 2 edits through the verified edit endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "16:9",
      editImageUrls: ["https://example.com/input.png"],
      enableWebSearch: true,
      model: "banana2",
      outputFormat: "webp",
      prompt: "make it a product photo",
      resolution: "4K",
      safetyTolerance: "3",
      seed: 42,
    });

    expect(endpoint).toBe("fal-ai/nano-banana-2/edit");
    expect(body).toMatchObject({
      aspect_ratio: "16:9",
      enable_web_search: true,
      image_urls: ["https://example.com/input.png"],
      num_images: 1,
      output_format: "webp",
      prompt: "make it a product photo",
      resolution: "4K",
      safety_tolerance: "3",
      seed: 42,
    });
  });

  it("normalizes Nano Banana 2 current API controls", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "auto",
      enableGoogleSearch: true,
      enableWebSearch: true,
      limitGenerations: false,
      model: "banana2",
      prompt: "grounded current product launch poster",
      resolution: "0.5K",
      syncMode: true,
      thinkingLevel: "minimal",
    });

    expect(endpoint).toBe("fal-ai/nano-banana-2");
    expect(body).toMatchObject({
      aspect_ratio: "auto",
      enable_google_search: true,
      enable_web_search: true,
      limit_generations: false,
      num_images: 1,
      prompt: "grounded current product launch poster",
      resolution: "0.5K",
      sync_mode: true,
      thinking_level: "minimal",
    });
  });

  it("normalizes FLUX.2 Flex controls to fal field names", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "4:3",
      enableSafetyChecker: false,
      guidanceScale: 3.5,
      model: "flux2-flex",
      numInferenceSteps: 24,
      outputFormat: "png",
      prompt: "sharp packaging mockup",
      seed: 7,
    });

    expect(endpoint).toBe("fal-ai/flux-2-flex");
    expect(body).toMatchObject({
      enable_safety_checker: false,
      guidance_scale: 3.5,
      image_size: "landscape_4_3",
      num_inference_steps: 24,
      output_format: "png",
      prompt: "sharp packaging mockup",
      seed: 7,
    });
    expect(body).not.toHaveProperty("num_images");
  });

  it("normalizes FLUX Pro Ultra reference image strength", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/watch.png"],
      imagePromptStrength: 0.8,
      model: "flux",
      prompt: "premium watch campaign",
    });

    expect(endpoint).toBe("fal-ai/flux-pro/v1.1-ultra");
    expect(body).toMatchObject({
      image_prompt_strength: 0.8,
      image_url: "https://example.com/watch.png",
      prompt: "premium watch campaign",
    });
  });

  it("rejects unsupported output formats before fal rejects the request", () => {
    expect(() =>
      buildGenerateBody({
        model: "flux2-flex",
        outputFormat: "webp",
        prompt: "sharp packaging mockup",
      })
    ).toThrow("FLUX.2 Flex supports output formats: jpeg, png");
  });

  it("rejects options that the selected model does not support", () => {
    expect(() =>
      buildGenerateBody({
        model: "flux-fast",
        prompt: "simple product render",
        quality: "high",
      })
    ).toThrow("FLUX Schnell does not support quality");

    expect(() =>
      buildGenerateBody({
        maskImageUrl: "https://example.com/mask.png",
        model: "gpt",
        prompt: "masked edit without edit image",
      })
    ).toThrow("maskImageUrl requires editImageUrls");

    expect(() =>
      buildGenerateBody({
        expandPrompt: true,
        model: "banana2",
        prompt: "unsupported prompt expansion",
      })
    ).toThrow("Nano Banana 2 does not support expandPrompt");

    expect(() =>
      buildGenerateBody({
        imageSize: { height: 720, width: 1280 },
        model: "flux",
        prompt: "unsupported custom size",
      })
    ).toThrow("FLUX Pro Ultra does not support imageSize");
  });

  it("normalizes Grok resolution casing for fal", () => {
    const { endpoint, body } = buildGenerateBody({
      model: "grok-image",
      numImages: 2,
      prompt: "fast editorial sketch",
      resolution: "2K",
    });

    expect(endpoint).toBe("xai/grok-imagine-image");
    expect(body).toMatchObject({
      aspect_ratio: "1:1",
      num_images: 2,
      resolution: "2k",
    });
  });

  it("maps Seedream 5.0 Pro aspect to a fal image_size preset", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "16:9",
      model: "seedream5",
      prompt: "editorial hero shot",
      seed: 11,
      syncMode: true,
    });

    expect(endpoint).toBe("bytedance/seedream/v5/pro/text-to-image");
    expect(body).toMatchObject({
      image_size: "landscape_16_9",
      num_images: 1,
      prompt: "editorial hero shot",
      seed: 11,
      sync_mode: true,
    });
  });

  it("routes Seedream 5.0 Pro edits through the edit endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/a.png", "https://example.com/b.png"],
      model: "seedream5",
      prompt: "swap the background",
    });

    expect(endpoint).toBe("bytedance/seedream/v5/pro/edit");
    expect(body).toMatchObject({
      image_urls: ["https://example.com/a.png", "https://example.com/b.png"],
      prompt: "swap the background",
    });
  });

  it("maps Seedream 5.0 Lite to its text-to-image endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "1:1",
      model: "seedream5-lite",
      numImages: 2,
      prompt: "sticker sheet",
    });

    expect(endpoint).toBe("fal-ai/bytedance/seedream/v5/lite/text-to-image");
    expect(body).toMatchObject({
      image_size: "square_hd",
      num_images: 2,
      prompt: "sticker sheet",
    });
  });

  it("routes Seedream 5.0 Lite edits through the edit endpoint", () => {
    const { endpoint, body } = buildGenerateBody({
      editImageUrls: ["https://example.com/logo.png"],
      model: "seedream5-lite",
      prompt: "recolor the logo",
    });

    expect(endpoint).toBe("fal-ai/bytedance/seedream/v5/lite/edit");
    expect(body).toMatchObject({
      image_urls: ["https://example.com/logo.png"],
    });
  });

  it("normalizes FLUX.2 Turbo controls to fal field names", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "4:3",
      enableSafetyChecker: false,
      guidanceScale: 2.5,
      model: "flux2-turbo",
      outputFormat: "webp",
      prompt: "fast concept sketch",
      seed: 3,
    });

    expect(endpoint).toBe("fal-ai/flux-2/turbo");
    expect(body).toMatchObject({
      enable_safety_checker: false,
      guidance_scale: 2.5,
      image_size: "landscape_4_3",
      num_images: 1,
      output_format: "webp",
      prompt: "fast concept sketch",
      seed: 3,
    });
  });

  it("maps Recraft V4 aspect and style to fal fields", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "16:9",
      model: "recraft4",
      prompt: "flat brand illustration",
      style: "vector_illustration",
    });

    expect(endpoint).toBe("fal-ai/recraft/v4/text-to-image");
    expect(body).toMatchObject({
      image_size: "landscape_16_9",
      prompt: "flat brand illustration",
      style: "vector_illustration",
    });
    expect(body).not.toHaveProperty("num_images");
  });

  it("normalizes Ideogram V4 rendering speed and size", () => {
    const { endpoint, body } = buildGenerateBody({
      aspect: "2:3",
      model: "ideogram4",
      numImages: 2,
      prompt: "bold typographic poster",
      renderingSpeed: "QUALITY",
      seed: 5,
    });

    expect(endpoint).toBe("ideogram/v4");
    expect(body).toMatchObject({
      image_size: "portrait_4_3",
      num_images: 2,
      prompt: "bold typographic poster",
      rendering_speed: "QUALITY",
      seed: 5,
    });
  });
});

describe("estimateCost", () => {
  it("uses registry fal pricing for newly added image models", () => {
    expect(estimateCost("seedream4", "2K", 3)).toBeCloseTo(0.09);
    expect(estimateCost("grok-image", "2K", 4)).toBeCloseTo(0.08);
  });

  it("tiers Seedream 5.0 Pro pricing by resolution", () => {
    expect(estimateCost("seedream5", "1K", 1)).toBeCloseTo(0.0675);
    expect(estimateCost("seedream5", "2K", 1)).toBeCloseTo(0.135);
    expect(estimateCost("seedream5", "4K", 2)).toBeCloseTo(0.27);
  });

  it("prices the other July 2026 additions from the registry", () => {
    expect(estimateCost("seedream5-lite", "4K", 2)).toBeCloseTo(0.07);
    expect(estimateCost("flux2-turbo", "2K", 1)).toBeCloseTo(0.008);
    expect(estimateCost("recraft4", "2K", 1)).toBeCloseTo(0.04);
    expect(estimateCost("ideogram4", "2K", 3)).toBeCloseTo(0.09);
  });
});

describe("buildFalToolRequest", () => {
  it("normalizes SAM 3 image options into the fal request body", () => {
    const { endpoint, body } = buildFalToolRequest({
      input: "https://example.com/input.png",
      options: {
        apply_mask: false,
        max_masks: 5,
        prompt: "shoe",
      },
      tool: "sam3-image",
    });

    expect(endpoint).toBe("fal-ai/sam-3/image");
    expect(body).toMatchObject({
      apply_mask: false,
      image_url: "https://example.com/input.png",
      max_masks: 5,
      output_format: "png",
      prompt: "shoe",
    });
  });

  it("uses batch image input for the NSFW checker", () => {
    const { endpoint, body } = buildFalToolRequest({
      inputs: ["https://example.com/a.png", "https://example.com/b.png"],
      tool: "nsfw",
    });

    expect(endpoint).toBe("fal-ai/x-ailab/nsfw");
    expect(body).toEqual({
      image_urls: ["https://example.com/a.png", "https://example.com/b.png"],
    });
  });

  it("exposes fal image utility defaults for depth tools", () => {
    const { endpoint, body } = buildFalToolRequest({
      input: "https://example.com/input.png",
      tool: "marigold-depth",
    });

    expect(endpoint).toBe("fal-ai/imageutils/marigold-depth");
    expect(body).toMatchObject({
      ensemble_size: 10,
      image_url: "https://example.com/input.png",
      num_inference_steps: 10,
    });
  });
});
