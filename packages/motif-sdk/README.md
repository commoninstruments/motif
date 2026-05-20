# @howells/motif-sdk

Public Node SDK for Motif fal.ai generation, editing, utility tools, and model metadata.

## Install

```bash
npm install @howells/motif-sdk
```

## Usage

```ts
import { MotifServer, FAL_TOOLS, MODELS } from "@howells/motif-sdk";

const motif = new MotifServer(process.env.FAL_KEY!);

const result = await motif.generate({
  model: "banana2",
  prompt: "editorial product photo",
  ephemeral: true,
});

if (result.isErr()) {
  throw result.error;
}

console.log(result.value.images[0]?.url);
```

## Main Exports

- `MotifServer` - Result-returning fal client for generation, queue jobs, upload, utility tools, and payload deletion.
- `buildGenerateBody` - Pure fal request normalization for dry runs and tests.
- `MODELS` - Motif model aliases, fal endpoints, capabilities, pricing, and benchmarks.
- `FAL_TOOLS` - Normalized fal utility endpoints such as SAM, depth, upscaling, moderation, and background removal.
- `getFalKeyFromEnv` - `@howells/envy` backed `FAL_KEY` parsing.

## Testing

```bash
pnpm --filter @howells/motif-sdk test
pnpm --filter @howells/motif-sdk typecheck
```

Live fal canaries are opt-in:

```bash
RUN_FAL_CANARY=1 pnpm --filter @howells/motif-sdk test -- tests/fal-canary.test.ts
```

