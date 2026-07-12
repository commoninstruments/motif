import { afterEach, describe, expect, it, vi } from "vitest";

import { MotifServer } from "../src/index";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

// The fetch DOM globals (`HeadersInit`, `RequestInfo`) collide with @types/node
// in this project and resolve to `any`, so this helper narrows the recorded
// call arguments from `unknown` with plain guards instead of DOM types.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function headerRecord(headers: unknown): Record<string, string> {
  if (!isRecord(headers)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      record[key] = value;
    }
  }
  return record;
}

function requestAt(index: number) {
  const call = vi.mocked(fetch).mock.calls[index];
  if (!call) {
    throw new Error(`fetch call ${index} was not made`);
  }
  const input: unknown = call.at(0);
  const init: unknown = call.at(1);
  const initRecord = isRecord(init) ? init : {};
  const { body, method } = initRecord;
  return {
    body: typeof body === "string" ? (JSON.parse(body) as unknown) : undefined,
    headers: headerRecord(initRecord.headers),
    method: typeof method === "string" ? method : undefined,
    url: typeof input === "string" ? input : "",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MotifServer fetch integration", () => {
  it("sends normalized sync generation requests without calling fal in tests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          images: [{ url: "https://example.com/out.png" }],
          prompt: "studio portrait",
        })
      )
    );

    const motif = new MotifServer({ apiKey: "test-key", retries: 0 });
    const result = await motif.generate({
      aspect: "16:9",
      background: "transparent",
      model: "gpt",
      prompt: "studio portrait",
      quality: "medium",
      syncMode: true,
    });

    expect(result.isOk()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    const request = requestAt(0);
    expect(request.url).toBe("https://fal.run/fal-ai/gpt-image-1.5");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe("Key test-key");
    expect(request.body).toMatchObject({
      background: "transparent",
      image_size: "1536x1024",
      num_images: 1,
      prompt: "studio portrait",
      quality: "medium",
      sync_mode: true,
    });
  });

  it("sends no-store headers for ephemeral sync generations and preserves request ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          images: [{ url: "https://example.com/out.png" }],
          request_id: "req_ephemeral_123",
        })
      )
    );

    const motif = new MotifServer({ apiKey: "test-key", retries: 0 });
    const result = await motif.generate({
      ephemeral: true,
      model: "banana",
      prompt: "local-only image",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.requestId).toBe("req_ephemeral_123");
    }

    const request = requestAt(0);
    expect(request.headers["X-Fal-Store-IO"]).toBe("0");
  });

  it("submits queued generation with the same normalized request body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          request_id: "req_123",
          response_url:
            "https://queue.fal.run/openai/gpt-image-2/image-to-image/requests/req_123",
        })
      )
    );

    const motif = new MotifServer({ apiKey: "test-key", retries: 0 });
    const result = await motif.submitGeneration({
      editImageUrls: ["https://example.com/interior.png"],
      imageSize: "1280x720",
      maskImageUrl: "https://example.com/wall-mask.png",
      model: "gpt2",
      prompt: "change the wall color",
      quality: "auto",
      syncMode: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        endpoint: "openai/gpt-image-2/image-to-image",
        requestId: "req_123",
      });
    }

    const request = requestAt(0);
    expect(request.url).toBe(
      "https://queue.fal.run/openai/gpt-image-2/image-to-image"
    );
    expect(request.body).toMatchObject({
      image_size: { height: 720, width: 1280 },
      image_urls: ["https://example.com/interior.png"],
      mask_image_url: "https://example.com/wall-mask.png",
      prompt: "change the wall color",
      quality: "auto",
      sync_mode: true,
    });
  });

  it("deletes fal request payloads by request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    );

    const motif = new MotifServer({ apiKey: "test-key", retries: 0 });
    const result = await motif.deletePayloads("req_ephemeral_123");

    expect(result.isOk()).toBe(true);

    const request = requestAt(0);
    expect(request.url).toBe(
      "https://api.fal.ai/v1/models/requests/req_ephemeral_123/payloads"
    );
    expect(request.method).toBe("DELETE");
    expect(request.headers.Authorization).toBe("Key test-key");
  });

  it("sends normalized fal utility tool requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          image: { url: "https://example.com/mask.png" },
          masks: [],
        })
      )
    );

    const motif = new MotifServer({ apiKey: "test-key", retries: 0 });
    const result = await motif.runTool({
      input: "https://example.com/input.png",
      options: {
        apply_mask: false,
        max_masks: 2,
        prompt: "shoe",
      },
      tool: "sam3-image",
    });

    expect(result.isOk()).toBe(true);

    const request = requestAt(0);
    expect(request.url).toBe("https://fal.run/fal-ai/sam-3/image");
    expect(request.body).toMatchObject({
      apply_mask: false,
      image_url: "https://example.com/input.png",
      max_masks: 2,
      output_format: "png",
      prompt: "shoe",
    });
  });
});
