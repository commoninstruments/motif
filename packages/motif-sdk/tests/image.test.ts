import type { GenerateImageResult, ImageModel } from "ai";
import { describe, expect, it } from "vitest";

import { createMotifImage } from "../src/image/index";
import type {
  ImageProviderId,
  ImageTier,
  MotifImageDeps,
} from "../src/image/index";
import { MotifError } from "../src/index";

/** The options object the underlying `generateImage` (or its fake) receives. */
type GenerateImageArgs = Parameters<
  NonNullable<MotifImageDeps["generateImage"]>
>[0];

/**
 * A cast-free fake `ImageModel` (ImageModelV4 shape). It performs no network
 * I/O — `doGenerate` resolves (or rejects) locally — so the REAL `generateImage`
 * from `ai` can be driven fully offline (mirroring bench/test/runner.test.ts).
 */
function fakeImageModel(opts: { throwErr?: boolean } = {}): ImageModel {
  return {
    specificationVersion: "v4",
    provider: "google",
    modelId: "fake",
    maxImagesPerCall: 4,
    async doGenerate() {
      await Promise.resolve();
      if (opts.throwErr === true) {
        throw new Error("fake provider failure");
      }
      // PNG signature bytes so `generateImage` detects an image/png media type.
      return {
        images: [
          new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ],
        warnings: [],
        response: {
          timestamp: new Date(0),
          modelId: "fake",
          headers: undefined,
        },
      };
    },
  };
}

/** Build a typed `GenerateImageResult` for fake `generateImage` injections. */
function fakeResult(
  overrides: Partial<GenerateImageResult> = {}
): GenerateImageResult {
  const file = {
    base64: "AAAA",
    uint8Array: new Uint8Array([1, 2, 3]),
    mediaType: "image/png",
  };
  return {
    image: file,
    images: [file],
    warnings: [],
    responses: [
      { timestamp: new Date(0), modelId: "fake", headers: undefined },
    ],
    providerMetadata: {},
    usage: {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    },
    ...overrides,
  };
}

describe("createMotifImage.generate", () => {
  it("resolves ok against a fake ImageModel via the real generateImage seam", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel() }
    );

    const result = await img.generate({ prompt: "a bare concrete wall" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.images).toHaveLength(1);
      expect(result.value.images[0]?.uint8Array.length).toBeGreaterThan(0);
      expect(result.value.provider).toBe("google");
      // balanced tier (default) resolves to the flash preview id.
      expect(result.value.model).toBe("gemini-3.1-flash-image-preview");
      expect(result.value.cost.source).toBe("table");
      expect(result.value.cost.usd).toBeGreaterThan(0);
    }
  });

  it("surfaces a requestId when the provider metadata carries one", async () => {
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async () => {
          await Promise.resolve();
          return fakeResult({
            providerMetadata: { google: { images: [], requestId: "req_123" } },
          });
        },
      }
    );

    const result = await img.generate({ prompt: "x" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.requestId).toBe("req_123");
    }
  });

  it("lets an explicit model override the tier", async () => {
    const seen: { provider: ImageProviderId; modelId: string }[] = [];
    const img = createMotifImage(
      {},
      {
        resolveModel: (provider, modelId) => {
          seen.push({ provider, modelId });
          return fakeImageModel();
        },
      }
    );

    const result = await img.generate({
      prompt: "x",
      tier: "fast",
      model: "custom-model-x",
    });

    expect(result.isOk()).toBe(true);
    expect(seen).toEqual([{ provider: "google", modelId: "custom-model-x" }]);
    if (result.isOk()) {
      expect(result.value.model).toBe("custom-model-x");
    }
  });

  it("maps each tier to the documented Gemini model id", async () => {
    const cases: { tier: ImageTier; modelId: string }[] = [
      { tier: "fast", modelId: "gemini-2.5-flash-image" },
      { tier: "balanced", modelId: "gemini-3.1-flash-image-preview" },
      { tier: "quality", modelId: "gemini-3-pro-image-preview" },
      { tier: "hero", modelId: "gemini-3-pro-image-preview" },
    ];

    for (const { tier, modelId } of cases) {
      const seen: string[] = [];
      const img = createMotifImage(
        {},
        {
          resolveModel: (_provider, resolvedId) => {
            seen.push(resolvedId);
            return fakeImageModel();
          },
        }
      );

      const result = await img.generate({ prompt: "x", tier });

      expect(result.isOk()).toBe(true);
      expect(seen).toEqual([modelId]);
    }
  });

  it("prefers a provider-metadata cost over the static table", async () => {
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async () => {
          await Promise.resolve();
          return fakeResult({
            providerMetadata: { google: { images: [], cost: 0.5 } },
          });
        },
      }
    );

    const result = await img.generate({ prompt: "x", tier: "fast" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.cost.source).toBe("provider-metadata");
      expect(result.value.cost.usd).toBe(0.5);
    }
  });

  it("returns Result.err when the model throws — no exception escapes", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel({ throwErr: true }) }
    );

    const result = await img.generate({ prompt: "x", tier: "fast" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
    }
  });

  it("propagates a missing-key error as Result.err via the real adapter", async () => {
    // No apiKey in config and no env key — the google adapter throws, which must
    // be captured as a Result.err rather than escaping.
    const previous = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    try {
      const img = createMotifImage(
        { defaultProvider: "google" },
        {
          generateImage: async () => {
            await Promise.resolve();
            return fakeResult();
          },
        }
      );
      const result = await img.generate({ prompt: "x" });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(MotifError);
        expect(result.error.message).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
      }
    } finally {
      if (previous !== undefined) {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = previous;
      }
    }
  });
});

describe("createMotifImage.edit", () => {
  it("passes images + instruction (text) + mask into the underlying call", async () => {
    const roomBytes = new Uint8Array([1, 1, 1]);
    const tileBytes = new Uint8Array([2, 2, 2]);
    const maskBytes = new Uint8Array([3, 3, 3]);

    let lastCall: GenerateImageArgs | undefined;
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async (options) => {
          await Promise.resolve();
          lastCall = options;
          return fakeResult();
        },
      }
    );

    const result = await img.edit({
      tier: "balanced",
      images: [roomBytes, tileBytes],
      instruction:
        "Apply the oak texture from image 2 onto the wall in image 1.",
      mask: maskBytes,
    });

    expect(result.isOk()).toBe(true);
    if (!lastCall || typeof lastCall.prompt === "string") {
      throw new Error("expected an object prompt with images/text/mask");
    }
    const { prompt } = lastCall;
    expect(prompt.images).toEqual([roomBytes, tileBytes]);
    expect(prompt.text).toBe(
      "Apply the oak texture from image 2 onto the wall in image 1."
    );
    expect(prompt.mask).toBe(maskBytes);
  });

  it("resolves ok end-to-end through the real generateImage seam", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel() }
    );

    const result = await img.edit({
      images: [new Uint8Array([9, 9, 9])],
      instruction: "brighten the wall",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.images).toHaveLength(1);
      expect(result.value.provider).toBe("google");
    }
  });
});
