import type { GenerateImageResult, ImageModel } from "ai";
import { describe, expect, it } from "vitest";

import type { MotifImageDeps } from "../src/image/deps";
import { createMotifImage, PROVIDERS } from "../src/image/index";
import type { ImageProviderId, ImageTier } from "../src/image/index";
import { MODELS, MotifError } from "../src/index";

/**
 * A minimal stand-in for the AI SDK's `APICallError`: an `Error` subclass that
 * carries the HTTP status on `statusCode` (a number) and NOT in the message —
 * exactly the shape the phase-A live spike confirmed. Used to prove
 * `toMotifError` lifts `statusCode` onto `MotifError.status`.
 */
class FakeApiCallError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    // Mirrors the AI SDK APICallError name ("AI_APICallError"); `toMotifError`
    // keys off `statusCode`, not the name, so the exact string is immaterial.
    this.name = "FakeApiCallError";
    this.statusCode = statusCode;
  }
}

/** The options object the underlying `generateImage` (or its fake) receives. */
type GenerateImageArgs = Parameters<
  NonNullable<MotifImageDeps["generateImage"]>
>[0];

/**
 * The options object an AI SDK `ImageModelV4`'s `doGenerate` receives. Derived
 * from the `ImageModel` union (no `@ai-sdk/provider` import, which is nested).
 */
type DoGenerateOptions = Parameters<
  Extract<ImageModel, { specificationVersion: "v4" }>["doGenerate"]
>[0];

/**
 * A cast-free fake `ImageModel` (ImageModelV4 shape). It performs no network
 * I/O — `doGenerate` resolves (or rejects) locally — so the REAL `generateImage`
 * from `ai` can be driven fully offline (mirroring bench/test/runner.test.ts).
 */
function fakeImageModel(
  opts: {
    throwErr?: boolean;
    onCall?: (options: DoGenerateOptions) => void;
  } = {}
): ImageModel {
  return {
    specificationVersion: "v4",
    provider: "google",
    modelId: "fake",
    maxImagesPerCall: 4,
    async doGenerate(options: DoGenerateOptions) {
      await Promise.resolve();
      opts.onCall?.(options);
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

  it("passes the generate prompt string down to the model's doGenerate", async () => {
    let captured: DoGenerateOptions | undefined;
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      {
        resolveModel: () =>
          fakeImageModel({
            onCall: (options) => {
              captured = options;
            },
          }),
      }
    );

    const result = await img.generate({ prompt: "a bare concrete wall" });

    expect(result.isOk()).toBe(true);
    expect(captured?.prompt).toBe("a bare concrete wall");
    // A text→image call carries no input files.
    expect(captured?.files).toBeUndefined();
  });

  it("returns Result.err naming an unknown provider", async () => {
    const img = createMotifImage({}, { resolveModel: () => fakeImageModel() });

    const result = await img.generate({ prompt: "x", provider: "not-real" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.message).toContain("not-real");
    }
  });

  it("forwards n, size, seed, signal, and providerOptions to generateImage", async () => {
    const controller = new AbortController();
    let call: GenerateImageArgs | undefined;
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async (options) => {
          await Promise.resolve();
          call = options;
          return fakeResult();
        },
      }
    );

    const result = await img.generate({
      prompt: "x",
      n: 3,
      size: "512x512",
      seed: 42,
      signal: controller.signal,
      providerOptions: { google: { style: "vivid" } },
    });

    expect(result.isOk()).toBe(true);
    expect(call?.n).toBe(3);
    expect(call?.size).toBe("512x512");
    expect(call?.seed).toBe(42);
    expect(call?.abortSignal).toBe(controller.signal);
    expect(call?.providerOptions).toEqual({ google: { style: "vivid" } });
  });

  it("forwards aspectRatio to generateImage", async () => {
    let call: GenerateImageArgs | undefined;
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async (options) => {
          await Promise.resolve();
          call = options;
          return fakeResult();
        },
      }
    );

    const result = await img.generate({ prompt: "x", aspectRatio: "16:9" });

    expect(result.isOk()).toBe(true);
    expect(call?.aspectRatio).toBe("16:9");
  });

  it("extracts a requestId from an x-goog-request-id response header", async () => {
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async () => {
          await Promise.resolve();
          return fakeResult({
            providerMetadata: {},
            responses: [
              {
                timestamp: new Date(0),
                modelId: "fake",
                headers: { "x-goog-request-id": "goog_req_9" },
              },
            ],
          });
        },
      }
    );

    const result = await img.generate({ prompt: "x" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.requestId).toBe("goog_req_9");
    }
  });

  it("reports cost source 'unknown' for a model absent from the price table", async () => {
    const img = createMotifImage({}, { resolveModel: () => fakeImageModel() });

    const result = await img.generate({
      prompt: "x",
      model: "totally-unpriced-model",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.cost.source).toBe("unknown");
      expect(result.value.cost.usd).toBe(0);
    }
  });

  it("surfaces provider warnings on the result", async () => {
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async () => {
          await Promise.resolve();
          return fakeResult({
            warnings: [
              {
                type: "unsupported",
                feature: "size",
                details: "ignored; aspectRatio wins",
              },
              { type: "other", message: "adjusted aspect ratio" },
            ],
          });
        },
      }
    );

    const result = await img.generate({ prompt: "x" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.warnings).toHaveLength(2);
      expect(result.value.warnings?.[0]).toContain("size");
      expect(result.value.warnings?.[1]).toBe("adjusted aspect ratio");
    }
  });

  it("omits the warnings field when the provider returns none", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel() }
    );

    const result = await img.generate({ prompt: "x" });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.warnings).toBeUndefined();
    }
  });

  it("returns Result.err when providerOptions carries a bigint (non-JSON)", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel() }
    );

    const result = await img.generate({
      prompt: "x",
      providerOptions: { google: { big: 10n } },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.message).toContain("providerOptions");
    }
  });

  it("returns Result.err when providerOptions carries a function (non-JSON)", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel() }
    );

    const result = await img.generate({
      prompt: "x",
      providerOptions: { google: { cb: () => 1 } },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
    }
  });

  it("lifts an AI-SDK APICallError statusCode onto MotifError.status", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async () => {
          await Promise.resolve();
          throw new FakeApiCallError("Too Many Requests", 429);
        },
      }
    );

    const result = await img.generate({ prompt: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      // Callers branch on `error.status === 429`, not the message text.
      expect(result.error.status).toBe(429);
      expect(result.error.message).toBe("Too Many Requests");
    }
  });

  it("maps a plain Error (no statusCode) to status 0", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async () => {
          await Promise.resolve();
          throw new Error("local failure");
        },
      }
    );

    const result = await img.generate({ prompt: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(0);
      expect(result.error.message).toBe("local failure");
    }
  });

  it("forwards headers to generateImage (fal non-retained IO)", async () => {
    let call: GenerateImageArgs | undefined;
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async (options) => {
          await Promise.resolve();
          call = options;
          return fakeResult();
        },
      }
    );

    const result = await img.generate({
      prompt: "x",
      headers: { "X-Fal-Store-IO": "0" },
    });

    expect(result.isOk()).toBe(true);
    expect(call?.headers).toEqual({ "X-Fal-Store-IO": "0" });
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

  it("maps edit images/text/mask to the model's files/prompt/mask (real generateImage)", async () => {
    const roomBytes = new Uint8Array([1, 1, 1]);
    const tileBytes = new Uint8Array([2, 2, 2]);
    const maskBytes = new Uint8Array([3, 3, 3]);

    let captured: DoGenerateOptions | undefined;
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      {
        resolveModel: () =>
          fakeImageModel({
            onCall: (options) => {
              captured = options;
            },
          }),
      }
    );

    const result = await img.edit({
      images: [roomBytes, tileBytes],
      instruction: "Apply the oak texture from image 2 onto image 1.",
      mask: maskBytes,
    });

    expect(result.isOk()).toBe(true);
    expect(captured?.prompt).toBe(
      "Apply the oak texture from image 2 onto image 1."
    );
    expect(captured?.files).toHaveLength(2);
    const file0 = captured?.files?.[0];
    expect(file0?.type).toBe("file");
    if (file0?.type === "file") {
      expect(file0.data).toStrictEqual(roomBytes);
    }
    const file1 = captured?.files?.[1];
    if (file1?.type === "file") {
      expect(file1.data).toStrictEqual(tileBytes);
    }
    const mask = captured?.mask;
    expect(mask?.type).toBe("file");
    if (mask?.type === "file") {
      expect(mask.data).toStrictEqual(maskBytes);
    }
  });

  it("returns Result.err when the model throws in edit()", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel({ throwErr: true }) }
    );

    const result = await img.edit({
      images: [new Uint8Array([9, 9, 9])],
      instruction: "brighten the wall",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
    }
  });

  it("forwards headers to generateImage in edit()", async () => {
    let call: GenerateImageArgs | undefined;
    const img = createMotifImage(
      {},
      {
        resolveModel: () => fakeImageModel(),
        generateImage: async (options) => {
          await Promise.resolve();
          call = options;
          return fakeResult();
        },
      }
    );

    const result = await img.edit({
      images: [new Uint8Array([9, 9, 9])],
      instruction: "brighten the wall",
      headers: { "X-Fal-Store-IO": "0" },
    });

    expect(result.isOk()).toBe(true);
    expect(call?.headers).toEqual({ "X-Fal-Store-IO": "0" });
  });
});

describe("createMotifImage — fal explicit-model pricing", () => {
  it("prices an explicit fal endpoint from the MODELS registry (source 'table')", async () => {
    const img = createMotifImage(
      { fal: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel() }
    );

    const result = await img.generate({
      prompt: "x",
      provider: "fal",
      model: "fal-ai/flux/schnell",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.model).toBe("fal-ai/flux/schnell");
      expect(result.value.cost.source).toBe("table");
      // FLUX Schnell price comes from MODELS["flux-fast"], not 0/"unknown".
      expect(result.value.cost.usd).toBe(MODELS["flux-fast"]?.pricePerImageUsd);
      expect(result.value.cost.usd).toBeGreaterThan(0);
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

/**
 * State captured across candidate calls by {@link countingImageModel}: a shared
 * call counter (so each candidate returns DISTINCT bytes), plus the seed, file
 * presence, mask presence, and abort signal each candidate's `doGenerate` saw.
 */
interface CountingState {
  calls: number;
  /** 1-based call number that should throw (simulates a partial failure). */
  throwOnCall?: number;
  seeds: (number | undefined)[];
  sawFiles: boolean[];
  sawMask: boolean[];
  signals: (AbortSignal | undefined)[];
}

/**
 * A fake `ImageModel` that returns DISTINCT bytes per call (keyed off a shared
 * call counter) so best-of-N candidates are distinguishable, and records the
 * seed / files / mask / abortSignal each call saw. All candidates share one
 * `CountingState` so the whole fan-out is observable from the test.
 */
function countingImageModel(state: CountingState): ImageModel {
  return {
    specificationVersion: "v4",
    provider: "google",
    modelId: "fake",
    maxImagesPerCall: 4,
    async doGenerate(options: DoGenerateOptions) {
      await Promise.resolve();
      const callNo = (state.calls += 1);
      state.seeds.push(options.seed);
      state.sawFiles.push(options.files !== undefined);
      state.sawMask.push(options.mask !== undefined);
      state.signals.push(options.abortSignal);
      if (state.throwOnCall === callNo) {
        throw new Error(`fake failure on call ${callNo}`);
      }
      // Full PNG signature (so the media type is detected) plus a trailing byte
      // unique to this call, making every candidate's bytes distinct.
      return {
        images: [
          new Uint8Array([
            0x89,
            0x50,
            0x4e,
            0x47,
            0x0d,
            0x0a,
            0x1a,
            0x0a,
            callNo,
          ]),
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

function newCountingState(
  overrides: Partial<CountingState> = {}
): CountingState {
  return {
    calls: 0,
    seeds: [],
    sawFiles: [],
    sawMask: [],
    signals: [],
    ...overrides,
  };
}

describe("createMotifImage.bestOfN", () => {
  it("generates n candidates and lets a judge pick the winner", async () => {
    const state = newCountingState();
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({
      prompt: "a bare concrete wall",
      n: 3,
      judge: (candidates) => {
        expect(candidates).toHaveLength(3);
        return { index: 1, reason: "second is sharpest" };
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { value } = result;
      expect(value.candidates).toHaveLength(3);
      expect(value.chosenIndex).toBe(1);
      expect(value.best).toBe(value.candidates[1]);
      expect(value.reason).toBe("second is sharpest");
      // balanced google default = gemini-3.1-flash-image-preview @ $0.039/image.
      expect(value.totalCostUsd).toBeCloseTo(0.117, 6);
      // Candidates are distinguishable: distinct trailing bytes per call.
      const trailingBytes = value.candidates.map((candidate) =>
        candidate.images[0]?.uint8Array.at(-1)
      );
      expect(new Set(trailingBytes).size).toBe(3);
    }
  });

  it("defaults chosenIndex to 0 when no judge is given", async () => {
    const state = newCountingState();
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({ prompt: "x", n: 2 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.chosenIndex).toBe(0);
      expect(result.value.reason).toBeUndefined();
      expect(result.value.best).toBe(result.value.candidates[0]);
    }
  });

  it("routes an images-bearing request through the edit path", async () => {
    const state = newCountingState();
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({
      images: [new Uint8Array([1, 2, 3])],
      instruction: "apply the oak texture",
      mask: new Uint8Array([4, 5, 6]),
      n: 2,
      judge: (_candidates, context) => {
        expect(context.instruction).toBe("apply the oak texture");
        expect(context.prompt).toBeUndefined();
        return { index: 0 };
      },
    });

    expect(result.isOk()).toBe(true);
    // Every candidate went through the edit path: files + mask reached the model.
    expect(state.sawFiles).toHaveLength(2);
    expect(state.sawFiles.every(Boolean)).toBe(true);
    expect(state.sawMask.every(Boolean)).toBe(true);
  });

  it("passes a distinct seed (seed + index) to each candidate", async () => {
    const state = newCountingState();
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({ prompt: "x", n: 3, seed: 100 });

    expect(result.isOk()).toBe(true);
    // Order across the parallel fan-out is not guaranteed; assert the set.
    expect([...state.seeds].sort((a, b) => Number(a) - Number(b))).toEqual([
      100, 101, 102,
    ]);
  });

  it("judges among the successes when some candidates fail", async () => {
    const state = newCountingState({ throwOnCall: 2 });
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({
      prompt: "x",
      n: 3,
      judge: (candidates) => {
        // One of three candidates failed; the judge sees only the survivors.
        expect(candidates).toHaveLength(2);
        return { index: 0 };
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.candidates).toHaveLength(2);
      // Two successes @ $0.039 each.
      expect(result.value.totalCostUsd).toBeCloseTo(0.078, 6);
    }
  });

  it("returns Result.err when every candidate fails", async () => {
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => fakeImageModel({ throwErr: true }) }
    );

    const result = await img.bestOfN({ prompt: "x", n: 2 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
    }
  });

  it("returns Result.err when the judge throws", async () => {
    const state = newCountingState();
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({
      prompt: "x",
      n: 2,
      judge: () => {
        throw new Error("judge blew up");
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.message).toContain("judge blew up");
    }
  });

  it("returns Result.err when the judge picks an out-of-range index", async () => {
    const state = newCountingState();
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({
      prompt: "x",
      n: 3,
      judge: () => ({ index: 5 }),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
      expect(result.error.message).toContain("out-of-range");
    }
  });

  it("returns Result.err for a non-positive n", async () => {
    const state = newCountingState();
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({ prompt: "x", n: 0 });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(MotifError);
    }
    // No candidate calls were made.
    expect(state.calls).toBe(0);
  });

  it("forwards the abort signal to every candidate call", async () => {
    const controller = new AbortController();
    const state = newCountingState();
    const img = createMotifImage(
      { google: { apiKey: "test-key" } },
      { resolveModel: () => countingImageModel(state) }
    );

    const result = await img.bestOfN({
      prompt: "x",
      n: 3,
      signal: controller.signal,
    });

    expect(result.isOk()).toBe(true);
    expect(state.signals).toHaveLength(3);
    expect(state.signals.every((signal) => signal === controller.signal)).toBe(
      true
    );
  });
});

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
