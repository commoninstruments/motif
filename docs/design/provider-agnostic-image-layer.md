# Design: Provider-Agnostic Image Gen + Edit Layer

Status: draft for review · 2026-07-13 · Linear MOT-23 (Phase 0), MOT-24 (this plan)

## 1. Why

Motif is fal-specific today. This proposes making it — or a sibling package — the
**provider-agnostic image generation and editing layer** for Howells projects: the
image counterpart to `@howells/ai` (which already does this for text/vision/embeddings
via the Vercel AI SDK, Gateway-by-default with direct-provider escape hatches).

The driving consumer is **Material Desk / Material Canvas** (`Material-Bank/studio`,
`packages/vision`). Its entire image pipeline is Google Gemini "nano-banana", hand-rolled
around the raw `@google/generative-ai` SDK in `packages/vision/src/render-image.ts`,
deliberately bypassing the AI SDK. Its core operations are **multi-image-in → image-out
editing** (render-room, apply-texture), plus best-of-N + LLM judge.

### Evidence gathered (Phase 0, MOT-23)

- **fal adds model-specific overhead.** gpt-image direct is ~1.9× faster and ~3.2×
  cheaper than via fal ($0.042 vs $0.133); FLUX 1.1 Pro Ultra is the same price both
  routes, ~1.45× faster on Replicate. So provider choice matters, but the win varies
  by model — the value is *routing per model*, not "leave fal".
- **The AI SDK now does Gemini multi-image editing.** Proven live against `ai@7.0.22` +
  `@ai-sdk/google@4`: `generateImage({ prompt: { images: DataContent[], text?, mask? } })`
  returns an edited image (2 inputs + instruction → 1 output, ~10s). The `mask` field maps
  directly onto apply-texture's surface mask. **The reason Materia hand-rolled is obsolete
  at this version.**
- **Material Desk has zero image cost tracking.** A shared layer is the natural home for
  per-call spend metering.

## 2. Goals / non-goals

**Goals**
- One normalized API for text→image, multi-image edit (with optional mask), and best-of-N.
- Built on the Vercel AI SDK image interface (`generateImage`, `@ai-sdk/*`).
- Provider + model selection by tier (fast/balanced/quality/hero) and by explicit id.
- Per-call cost tracking (provider metadata where surfaced, else a pricing table).
- Result-returning error handling, matching `@howells/motif-sdk` conventions.
- Drop-in replacement for `@materia/vision/render-image.ts` — call sites unchanged.

**Non-goals**
- Not a rewrite of Material Desk's scene planning / art-direction orchestration — those
  stay in `@materia/vision`; we replace the generation primitives beneath them.
- Not leaving Gemini — Gemini stays the default workhorse; the point is optionality.
- Not text-LLM routing — that is `@howells/ai`'s job; this layer may *use* it for the
  best-of-N judge.
- Not segmentation/SAM3 — that stays in `@materia/vision` (fal SAM3 + Gemini boxes).

## 3. Packaging decision (needs sign-off)

`@howells/motif-sdk` is fal-specific: fal endpoints, fal queue, fal request shaping, a
fal-priced model registry. Three options:

- **A. New package `@howells/motif-image`** (recommended). A clean AI-SDK-based layer;
  `@howells/motif-sdk` stays the fal specialist and can later be consumed as one provider
  adapter. No disruption to published motif-sdk consumers.
- **B. Evolve `@howells/motif-sdk`** into the multi-provider layer, folding fal to one
  adapter. Cleanest long-term name, but a large breaking change to a published package.
- **C. Fold into `@howells/ai`** as an image sub-export. Maximum ecosystem consistency,
  but couples image gen to the text client's release cadence and scope.

Recommendation: **A** now, with the option to rename toward **B** once proven. Open for
your call — it's mostly a naming/coupling decision.

## 4. Proposed API

```ts
// Create a client (provider keys from env; Gateway/direct like @howells/ai)
const img = createMotifImage({ defaultProvider: "google" });

// text -> image
const r = await img.generate({
  tier: "fast",                 // or model: "gemini-2.5-flash-image"
  prompt: "a plain room, bare concrete wall",
  aspectRatio: "1:1",
});

// multi-image edit (Material Desk's core op) — images + instruction + optional mask
const edit = await img.edit({
  tier: "balanced",
  images: [roomBytes, tileBytes],
  instruction: "Apply the oak texture from image 2 onto the wall in image 1.",
  mask: surfaceMaskBytes,       // optional; maps to AI SDK prompt.mask
});

// best-of-N + judge (variation/quality selection)
const best = await img.bestOfN({
  n: 4,
  tier: "hero",
  images: [...refs],
  instruction: "...",
  judge: "aesthetic",           // judge model routed via @howells/ai
});

// every result carries normalized cost + provenance
edit.value.images;              // GeneratedFile[]
edit.value.cost;                // { usd, source: "provider-metadata" | "table" }
edit.value.provider;            // "google" | "fal" | ...
edit.value.model;               // resolved model id
edit.value.requestId?;          // provider correlation id where available
```

- Result type mirrors `@howells/motif-sdk` (`Result<T, MotifError>` — no throws).
- `tier` resolves through a provider-aware map (Material Desk's
  `RENDER_IMAGE_MODEL_BY_QUALITY` becomes the seed for the Google provider's tiers).

## 5. Provider adapter model

Each provider is a thin wrapper over its `@ai-sdk/*` image model, plus:
- a tier→model map,
- per-model `providerOptions` overrides for endpoint quirks (learned in Phase 0: fal's
  gpt-image wants `image_size` as the string enum, not the SDK's object form),
- a cost function (provider metadata → else pricing table).

Initial providers: **google** (Gemini gen + edit — the workhorse), then **fal**,
**openai**, **replicate**. Adding one is a config entry, not new call-site code.

## 6. Cost tracking

Per call: prefer `result.providerMetadata` cost when present; else a static pricing table
(seeded from the Phase 0 `bench/src/cost.ts` figures and `@howells/motif-sdk` registry
`pricePerImageUsd`). Emit a normalized `{ usd, source }` on every result and expose an
optional sink (callback / logger) so Material Desk can meter spend it currently can't see.

## 7. Material Desk integration

`@materia/vision/render-image.ts` exports `generateImageFromImages`, `generateBestOfN`,
`judgeRenderCandidates`. Map:
- `generateImageFromImages` → `img.edit(...)` / `img.generate(...)`
- `generateBestOfN` → `img.bestOfN(...)`
- judge stays, or routes through the layer's `bestOfN` judge (via `@howells/ai`).

Call sites (`render-room/route.ts`, `apply-texture/route.ts`, `use-apply-texture-flow.ts`)
stay untouched — they call the same `@materia/vision` exports, now backed by this layer.
Region-inpaint and segmentation stay in `@materia/vision`. This is a within-package swap,
low blast radius. (Note: materia's working tree has an untracked-files/pull situation to
resolve before touching it — a prerequisite, not part of this design.)

## 8. Phasing

- **1a — core layer**: `createMotifImage`, `generate` + `edit` (multi-image + mask) on the
  Google provider, Result types, cost tracking, tests (mock the AI SDK image model).
- **1b — providers**: fal / openai / replicate adapters + per-model overrides; tiering.
- **1c — best-of-N + judge**: parallel N + judge (judge via `@howells/ai`).
- **1d — materia integration**: swap `render-image.ts` internals; verify render-room and
  apply-texture unchanged; wire cost metering.

## 9. Open questions / risks

- **Packaging** (§3) — new package vs evolve motif-sdk vs fold into `@howells/ai`.
- **Preview model access** — Material Desk's `gemini-3.1-flash-image-preview` /
  `gemini-3-pro-image-preview` may need allowlist/tier; `gemini-2.5-flash-image` is the
  proven-reachable floor.
- **Mask fidelity** — AI SDK exposes `prompt.mask`; verify `@ai-sdk/google` forwards it to
  Gemini as Material Desk's region masking expects (Phase 1a spike).
- **Latency/slow ops** — hero renders + best-of-N are seconds-to-tens-of-seconds; consider
  streaming/progress and whether any provider needs queue polling (motif-sdk's fal queue).
- **Coexistence with motif-sdk** — keep the fal-specific SDK as-is; this layer is additive.

## 10. Evidence appendix

Phase 0 benchmark (local `bench/` harness, `ai@7` + `@ai-sdk/*`):

| Model | fal | direct | direct advantage |
|---|---|---|---|
| gpt-image (fal-ai/gpt-image-1.5 vs OpenAI gpt-image-1) | 36.8s p50, $0.133 | 19.2s p50, $0.042 | ~1.9× faster, ~3.2× cheaper |
| FLUX 1.1 Pro Ultra (fal vs Replicate) | 10.9s p50, $0.060 | 7.5s p50, $0.060 | ~1.45× faster, same cost |
| Gemini 2.5 flash-image (Google direct, AI SDK) | — | gen ~5–6s; multi-image edit ~10s | — (Material Desk workhorse; multi-image edit proven) |

Full data + methodology: Linear MOT-23.
