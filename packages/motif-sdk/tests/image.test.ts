import type { GenerateImageResult, ImageModel } from "ai";
import { describe, expect, it } from "vitest";

import { createMotifImage, PROVIDERS } from "../src/image/index";
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

/**
 * Phase 1b providers. Each case documents its tier→model map, the balanced-tier
 * default model, its static table price for that model, and the env var its real
 * adapter reads. All exercised offline via the injected fake `resolveModel`
 * (dispatch/cost) or the real adapter with the env var removed (missing-key).
 */
interface ProviderCase {
  provider: ImageProviderId;
  apiKeyEnv: string;
  config: Parameters<typeof createMotifImage>[0];
  tierModels: Record<ImageTier, string>;
  /** balanced tier (the default) resolves to this model id. */
  defaultModel: string;
  /** static table USD/image for `defaultModel`. */
  priceUsd: number;
}

const PROVIDER_CASES: ProviderCase[] = [
  {
    provider: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
    config: { openai: { apiKey: "test-key" } },
    tierModels: {
      fast: "gpt-image-1",
      balanced: "gpt-image-1",
      quality: "gpt-image-1",
      hero: "gpt-image-1",
    },
    defaultModel: "gpt-image-1",
    priceUsd: 0.042,
  },
  {
    provider: "replicate",
    apiKeyEnv: "REPLICATE_API_TOKEN",
    config: { replicate: { apiToken: "test-token" } },
    tierModels: {
      fast: "black-forest-labs/flux-1.1-pro-ultra",
      balanced: "black-forest-labs/flux-1.1-pro-ultra",
      quality: "black-forest-labs/flux-1.1-pro-ultra",
      hero: "black-forest-labs/flux-1.1-pro-ultra",
    },
    defaultModel: "black-forest-labs/flux-1.1-pro-ultra",
    priceUsd: 0.06,
  },
  {
    provider: "fal",
    apiKeyEnv: "FAL_KEY",
    config: { fal: { apiKey: "test-key" } },
    tierModels: {
      fast: "fal-ai/flux-pro/v1.1-ultra",
      balanced: "fal-ai/gpt-image-1.5",
      quality: "fal-ai/gpt-image-1.5",
      hero: "fal-ai/gpt-image-1.5",
    },
    defaultModel: "fal-ai/gpt-image-1.5",
    priceUsd: 0.133,
  },
];

describe.each(PROVIDER_CASES)(
  "createMotifImage — $provider provider",
  ({ provider, apiKeyEnv, config, tierModels, defaultModel, priceUsd }) => {
    it("registers an adapter whose tierModels match the documented map", () => {
      const adapter = PROVIDERS[provider];
      expect(adapter).toBeDefined();
      expect(adapter?.id).toBe(provider);
      expect(adapter?.tierModels).toEqual(tierModels);
    });

    it("dispatches each tier through the registry to the right model id", async () => {
      const tiers: ImageTier[] = ["fast", "balanced", "quality", "hero"];
      for (const tier of tiers) {
        const seen: { provider: ImageProviderId; modelId: string }[] = [];
        const img = createMotifImage(config, {
          resolveModel: (resolvedProvider, modelId) => {
            seen.push({ provider: resolvedProvider, modelId });
            return fakeImageModel();
          },
        });

        const result = await img.generate({ prompt: "x", provider, tier });

        expect(result.isOk()).toBe(true);
        expect(seen).toEqual([{ provider, modelId: tierModels[tier] }]);
      }
    });

    it("dispatches edit through the registry to the right ImageModel", async () => {
      const seen: { provider: ImageProviderId; modelId: string }[] = [];
      const img = createMotifImage(config, {
        resolveModel: (resolvedProvider, modelId) => {
          seen.push({ provider: resolvedProvider, modelId });
          return fakeImageModel();
        },
      });

      const result = await img.edit({
        provider,
        images: [new Uint8Array([1, 2, 3])],
        instruction: "apply texture",
      });

      expect(result.isOk()).toBe(true);
      expect(seen).toEqual([{ provider, modelId: defaultModel }]);
      if (result.isOk()) {
        expect(result.value.provider).toBe(provider);
        expect(result.value.model).toBe(defaultModel);
      }
    });

    it("looks up the static table price with source 'table'", async () => {
      const img = createMotifImage(config, {
        resolveModel: () => fakeImageModel(),
      });

      const result = await img.generate({ prompt: "x", provider });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.cost.source).toBe("table");
        expect(result.value.cost.usd).toBe(priceUsd);
      }
    });

    it("returns Result.err (no throw) when the real adapter finds no key", async () => {
      const previous = process.env[apiKeyEnv];
      Reflect.deleteProperty(process.env, apiKeyEnv);
      try {
        // No injected resolveModel: the REAL adapter runs and must throw a
        // MotifError for the missing key, captured as a Result.err.
        const img = createMotifImage(
          { defaultProvider: provider },
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
          expect(result.error.message).toContain(apiKeyEnv);
        }
      } finally {
        if (previous !== undefined) {
          process.env[apiKeyEnv] = previous;
        }
      }
    });
  }
);

describe("image provider registry", () => {
  it("contains all four providers, each keyed by its own id", () => {
    const ids: ImageProviderId[] = ["google", "openai", "replicate", "fal"];
    for (const id of ids) {
      const adapter = PROVIDERS[id];
      expect(adapter, `missing adapter for ${id}`).toBeDefined();
      expect(adapter?.id).toBe(id);
      expect(typeof adapter?.resolveModel).toBe("function");
      expect(typeof adapter?.apiKeyEnv).toBe("string");
    }
    expect(Object.keys(PROVIDERS).sort()).toEqual(
      ["fal", "google", "openai", "replicate"].sort()
    );
  });
});
