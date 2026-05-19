import { afterEach, describe, expect, it, vi } from "vitest";
import { MotifServer } from "../src/index";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function requestAt(index: number) {
  const call = vi.mocked(fetch).mock.calls[index];
  if (!call) {
    throw new Error(`fetch call ${index} was not made`);
  }
  const [url, init] = call;
  return {
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    headers: init?.headers as Record<string, string>,
    method: init?.method,
    url: String(url),
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
        }),
      ),
    );

    const motif = new MotifServer({ apiKey: "test-key", retries: 0 });
    const result = await motif.generate({
      model: "gpt",
      prompt: "studio portrait",
      aspect: "16:9",
      background: "transparent",
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
      prompt: "studio portrait",
      image_size: "1536x1024",
      background: "transparent",
      quality: "medium",
      sync_mode: true,
      num_images: 1,
    });
  });

  it("submits queued generation with the same normalized request body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          request_id: "req_123",
          response_url:
            "https://queue.fal.run/openai/gpt-image-2/image-to-image/requests/req_123",
        }),
      ),
    );

    const motif = new MotifServer({ apiKey: "test-key", retries: 0 });
    const result = await motif.submitGeneration({
      model: "gpt2",
      prompt: "change the wall color",
      editImageUrls: ["https://example.com/interior.png"],
      imageSize: "1280x720",
      maskImageUrl: "https://example.com/wall-mask.png",
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
      "https://queue.fal.run/openai/gpt-image-2/image-to-image",
    );
    expect(request.body).toMatchObject({
      prompt: "change the wall color",
      image_size: { width: 1280, height: 720 },
      quality: "auto",
      sync_mode: true,
      image_urls: ["https://example.com/interior.png"],
      mask_image_url: "https://example.com/wall-mask.png",
    });
  });

  it("sends normalized fal utility tool requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          image: { url: "https://example.com/mask.png" },
          masks: [],
        }),
      ),
    );

    const motif = new MotifServer({ apiKey: "test-key", retries: 0 });
    const result = await motif.runTool({
      tool: "sam3-image",
      input: "https://example.com/input.png",
      options: {
        apply_mask: false,
        max_masks: 2,
        prompt: "shoe",
      },
    });

    expect(result.isOk()).toBe(true);

    const request = requestAt(0);
    expect(request.url).toBe("https://fal.run/fal-ai/sam-3/image");
    expect(request.body).toMatchObject({
      image_url: "https://example.com/input.png",
      output_format: "png",
      apply_mask: false,
      max_masks: 2,
      prompt: "shoe",
    });
  });
});
