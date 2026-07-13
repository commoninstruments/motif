# 1d Approach (for review): fold MotifServer into the provider model

Status: PROPOSED — under review before implementation. MOT-24 Phase 1d. Breaking → 1.0.

## The one-line plan (from the design doc §8)

> Fold the rich fal client (`MotifServer`: queue, upload, upscale, rmbg, video, tools)
> into the provider model; keep the old `MotifServer` as a deprecated facade; migrate
> CLI/MCP; remove the facade at 1.0.

## The concrete surfaces this touches

`MotifServer` (packages/motif-sdk/src/server.ts) — 11 public async methods:
- generation: `generate`, `submitGeneration`, `getJobStatus`, `getJobResult` (fal queue)
- post-process: `upscale`, `removeBackground`
- video: `submitVideo`, `getVideoResult`
- infra: `uploadToFalCdn`, `runTool` (fal utility tools), `deletePayloads`

`ImageProviderAdapter` (image layer, Phases 1a-1c) — generation-only:
- `id`, `tierModels`, `apiKeyEnv`, `resolveModel(modelId, apiKey) → ImageModel`, `priceUsdByModel`

Consumers:
- CLI: singleton `new MotifServer(getApiKey())` in `apps/cli/src/api/fal.ts` (~10 call sites across generate/upscale/rmbg/video/tools).
- MCP: `new MotifServer(falKey)` in `packages/motif-mcp/src/index.ts`; calls `generate`, `upscale`, `removeBackground`.

## The central tension (the thing to review)

The image layer's adapter interface is **generate/edit-shaped**. `MotifServer` is a
**multi-operation fal client**. Upscale, background-removal, video, fal utility tools,
CDN upload, and queue/payload lifecycle are NOT image-generation operations and do not
fit an `ImageProviderAdapter` that only knows `resolveModel → ImageModel`. "Fold the rich
client into the provider model" is not a clean 1:1 — it's a category mismatch.

## Candidate strategies (to be evaluated, not yet chosen)

- **A. Full fold**: extend the adapter/provider model to cover every MotifServer op
  (upscale, rmbg, video, tools, upload). Large, invents provider-agnostic contracts for
  operations only fal offers today. High effort, unclear payoff.
- **B. Generation-only fold**: fold ONLY generate/edit onto the image layer; leave
  upscale/rmbg/video/tools as fal-specific APIs (they stay on `MotifServer` or move to a
  `fal`-namespaced client). The image layer already does generation across 4 providers;
  the fal-only operations simply aren't provider-agnostic yet.
- **C. Facade-only / do nothing**: keep `MotifServer` as-is (it works, it's tested, it's
  the fal specialist); the image layer coexists. No 1.0 break. Revisit only if a second
  provider ever offers upscale/rmbg/video worth abstracting.

## Migration cost (either fold path)

- CLI: rewire `api/fal.ts` + the generate/postprocess/video/tools command modules.
- MCP: rewire `create-server.ts` generate/upscale/rmbg handlers.
- A deprecated `MotifServer` facade to avoid breaking published consumers until 1.0.

## Questions for review

1. Is folding even the right goal, given the category mismatch — or is the honest state
   that only *generation* is provider-agnostic and the rest is legitimately fal-specific?
2. Does the benchmark evidence (fal is the right home for several models; direct wins only
   for some) argue against demoting `MotifServer` at all right now?
3. Is a 1.0 breaking change + CLI/MCP migration justified by the payoff, or is coexistence
   (strategy C) the pragmatic answer until a real second-provider need appears?
4. If we fold generation only (B), what's the honest end state of upscale/rmbg/video/tools
   — a `fal` namespace? left on MotifServer? And does that leave a coherent public API?
