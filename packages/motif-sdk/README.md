# @howells/motif-sdk

Public Node SDK for Motif fal.ai generation, editing, utility tools, and model metadata.

## Install

```bash
npm install @howells/motif-sdk
```

## Generate Images

```ts
import { MotifServer } from "@howells/motif-sdk";

const motif = new MotifServer({
  apiKey: process.env.FAL_KEY!,
  retries: 3,
  timeout: 120_000,
});

const result = await motif.generate({
  model: "banana2",
  prompt: "editorial product photo",
  resolution: "2K",
  enableGoogleSearch: true,
  ephemeral: true,
});

if (result.isErr()) {
  throw result.error;
}

console.log(result.value.images[0]?.url);
```

Every async SDK method returns `Result<T, MotifError>` from `neverthrow`. Methods do not throw for fal request failures; check `isErr()` / `isOk()`.

## Dry-Run Request Bodies

Use `buildGenerateBody` or `motif.buildRequestBody()` when you need the exact fal endpoint and request body without making an API call.

```ts
import { buildGenerateBody } from "@howells/motif-sdk";

const preview = buildGenerateBody({
  model: "gpt2",
  prompt: "change the wall color",
  editImageUrls: ["https://example.com/interior.png"],
  imageSize: "1536x1024",
  maskImageUrl: "https://example.com/wall-mask.png",
  quality: "auto",
  syncMode: true,
});

console.log(preview.endpoint);
console.log(preview.body);
```

## Queue, Upload, and Cleanup

```ts
const job = await motif.submitGeneration({
  model: "gpt2",
  prompt: "gallery poster",
});

if (job.isOk()) {
  const status = await motif.getJobStatus(
    job.value.endpoint,
    job.value.requestId
  );
  const completed = await motif.getJobResult(
    job.value.endpoint,
    job.value.requestId
  );
}

const uploaded = await motif.uploadToFalCdn(fileBytes, {
  contentType: "image/png",
  fileName: "reference.png",
});

const deleted = await motif.deletePayloads("fal-request-id");
```

## Utility Tools and Video

```ts
const mask = await motif.runTool({
  tool: "sam3-image",
  input: "https://example.com/input.png",
  options: { prompt: "shoe", max_masks: 2 },
});

const videoJob = await motif.submitVideo({
  imageUrl: "https://example.com/frame.png",
  prompt: "slow cinematic push-in",
  duration: 5,
  generateAudio: false,
});
```

## Main Exports

- `MotifServer` - Result-returning fal client for generation, queue jobs, upload, utility tools, and payload deletion.
- `buildGenerateBody` - Pure fal request normalization for dry runs and tests.
- `MODELS`, `GENERATION_MODELS`, `UTILITY_MODELS`, `VIDEO_MODELS` - Motif model aliases, fal endpoints, capabilities, pricing, and benchmarks.
- `FAL_TOOLS`, `FAL_TOOL_IDS`, `buildFalToolRequest`, `isFalToolId` - Normalized fal utility endpoints such as SAM, depth, upscaling, moderation, and background removal.
- `ASPECT_RATIOS`, `RESOLUTIONS`, `FORMAT_PRESETS`, `aspectToGptSize`, `aspectToFalImageSize` - Shared sizing metadata and normalization helpers.
- `IMAGE_TEXT_TO_IMAGE_TOP_20`, `IMAGE_EDITING_TOP_20`, `VIDEO_TEXT_TO_VIDEO_TOP_15`, `VIDEO_IMAGE_TO_VIDEO_TOP_15` - Bundled Artificial Analysis snapshots.
- `estimateCost`, `estimateVideoCost` - Local cost estimates used by CLI dry runs and SDK previews.
- `getFalKeyFromEnv` - `@howells/envy` backed `FAL_KEY` parsing.
- Re-exported `neverthrow` helpers: `ok`, `err`, `Result`, `ResultAsync`.

## Common Types

The package exports public types for generation, processing, queue, metadata, and utility tools:

- `GenerateOptions`, `MotifResponse`, `MotifImage`
- `UpscaleOptions`, `RemoveBackgroundOptions`, `VideoOptions`, `VideoResponse`
- `QueuedJob`, `JobStatus`, `MotifServerConfig`
- `ModelConfig`, `AspectRatio`, `Resolution`, `ImageSize`, `ImageQuality`, `BackgroundMode`, `ThinkingLevel`
- `FalToolConfig`, `FalToolId`, `FalToolRequest`, `FalToolRunOptions`

## Testing

```bash
pnpm --filter @howells/motif-sdk test
pnpm --filter @howells/motif-sdk typecheck
```

Live fal canaries are opt-in:

```bash
RUN_FAL_CANARY=1 pnpm --filter @howells/motif-sdk test -- tests/fal-canary.test.ts
```
