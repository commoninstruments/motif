# Improvement Backlog

Vetted, prioritized backlog for the public SDK/CLI/MCP repo. Built 2026-07-11 from a five-dimension expert review (architecture, security, test quality, MCP/agent surface, senior sweep) against `main` @ `b80a826`. Mechanical baseline was green (`pnpm check`, 8/8 tasks, 99 CLI tests passing).

Tracked in Linear (Motif team). Statuses here mirror Linear; update both when an item moves.

## P1 — Bugs (published behavior is wrong)

### IMP-1 SDK `generate()`/`submitGeneration()` throw instead of returning Result
- **Status:** open · **Linear:** MOT-8
- **Evidence:** `packages/motif-sdk/src/server.ts:93,149` call `buildGenerateBody` unguarded; it throws (`CreativeOptionError`, unsupported-option errors, unknown model) despite the class doc promising "no thrown exceptions". Confirmed by runtime probe. MCP handlers (`packages/motif-mcp/src/create-server.ts:697,806`) have no try/catch, so an invalid `creative` id from an MCP client becomes an unhandled rejection instead of the structured `INVALID_OPTION` tool error. CLI only survives via duplicated pre-validation (`apps/cli/src/cli.ts:699-702`).
- **Fix:** wrap `buildGenerateBody`/`enrichPrompt` in try/catch inside `generate()`/`submitGeneration()`, map to `err(new MotifError(...))` (mirror `runTool`, `server.ts:488-498`). Add a mock-free MCP test: invalid creative id → structured `isError: true` response with field details.
- **Verify:** new SDK unit test (invalid creative → `Result.err`), new MCP integration test, `pnpm check`.

### IMP-2 Multi-image output collision silently destroys images
- **Status:** open · **Linear:** MOT-9
- **Evidence:** `apps/cli/src/cli.ts:486` and `apps/cli/src/commands/series.ts:577` build per-image paths via `outputPath.replace(".png", "-N.png")` — a no-op for `.jpg`/`.webp`/extensionless paths, so `--num 4 --output out.jpg` writes 4 images to one path; only the last survives. History records 4 entries pointing at 1 file, hiding the loss.
- **Fix:** shared helper using `path.parse` → `${name}-${i+1}${ext || ".png"}`; use in both call sites.
- **Verify:** unit test for the helper incl. `.jpg`/no-extension; dry-run contract test asserting distinct paths.

## P2 — Agent-surface correctness

### IMP-3 MCP tool args are cast, not validated (cost guardrail missing)
- **Status:** open · **Linear:** MOT-10
- **Evidence:** `packages/motif-mcp/src/create-server.ts:664-709` destructures `args as {...}`; advertised `numImages` max of 4 (line 305-309) is unenforced — `numImages: 500` reaches fal. CLI enforces the identical bound (`apps/cli/src/cli.ts:1016`). Enum args (`model`, `aspect`, `preset`, …) also unchecked. Bonus bug: the universal `!args` guard (line 653-659) rejects spec-legal zero-argument `history` calls.
- **Fix:** validate/clamp args in handlers using SDK-exported enums (mirror `validateEnumOption`); clamp `limit`/`offset` in `readHistory`; default `args` to `{}` instead of erroring when the tool has no required fields.
- **Verify:** MCP tests: `numImages: 500` → structured error; `history` with no arguments → default page.

### IMP-4 Vary model enum drift — export `EDIT_CAPABLE_MODELS` from the SDK
- **Status:** open · **Linear:** MOT-11
- **Evidence:** `apps/cli/src/commands/describe.ts:409` advertises all 18 models for `vary`, but `recraft`, `ideogram`, `qwen`, `flux-fast` have `supportsEdit: false` → guaranteed runtime failure for agents trusting `--describe`. MCP's vary enum (`create-server.ts:459-477`) is a hand-typed 14-model literal that matches only by coincidence.
- **Fix:** export `EDIT_CAPABLE_MODELS` (derived from `MODELS` filtered by `supportsEdit`) from the SDK; use in `describe.ts` and `create-server.ts`; test asserting both equal the derived set.
- **Verify:** new test fails if a model's `supportsEdit` changes without enum updates.

### IMP-5 Agent docs drift: creative direction invisible, models/errors stale
- **Status:** open · **Linear:** MOT-12
- **Evidence:** zero mentions of `creative` in README.md, llms.txt, AGENTS.md, apps/cli/AGENTS.md, packages/motif-mcp/README.md, docs/surface/*. `apps/cli/AGENTS.md:42,73` list 9 of 18 models; error-code list (lines 45-47) has 14 of 24 codes — all 6 series codes missing despite the doc's own series section. Cost table also incomplete.
- **Fix:** document creative direction in the three READMEs/guides; regenerate model + error-code lists; prefer a test asserting documented lists match SDK exports over one-off prose fixes. Refresh `docs/surface/scorecard.md` (stale since 2026-05-21) once done.
- **Verify:** doc-sync test in CI; grep for `creative` hits in each doc surface.

## P3 — Safety net & consolidation

### IMP-6 Test gaps: series execution, ref guards, ndjson, real flag wiring
- **Status:** open · **Linear:** MOT-13
- **Evidence:** every `series run`/`series gen` test uses `--dry-run` — anchor chaining, output numbering, duplicate-name fallback (`series.ts:180-193,781-865`) untested. `series ref-add`/`ref-remove` path-traversal guards (`apps/cli/src/utils/series.ts:236,266`) never invoked by any test. `--format ndjson` (`utils/output.ts:97-104`) unexercised. `cli-options.test.ts` tests a replica Commander program, not `cli.ts` — ~14 real flags unverified end-to-end.
- **Fix:** `series.test.ts` against temp HOME (incl. path-escape attempt); mocked-fal non-dry-run series tests; one `emitStream` unit + one `--format ndjson` e2e; migrate flag assertions onto the real program or dry-run contract tests.

### IMP-7 Deduplicate creative + sanitize logic (SDK canonical)
- **Status:** open · **Linear:** MOT-14
- **Evidence:** `sanitizePrompt`/`CONTROL_CHAR_REGEX` byte-identical in `packages/motif-sdk/src/creative.ts:186-188` and `apps/cli/src/utils/input.ts:19-24`. `resolveCreativeDirection` duplicated verbatim (`cli.ts:167-183`, `series.ts:118-140`) with hand-listed field names; `describe.ts` correctly iterates `CREATIVE_FIELDS`. A 9th creative field would silently not be flag-selectable.
- **Fix:** CLI re-exports `sanitizePrompt` from SDK; extract one `resolveCreativeDirection` into `apps/cli/src/utils/creative.ts` deriving fields from `CREATIVE_FIELDS`.

### IMP-8 Verify banana2 4K pricing in `estimateCost`
- **Status:** fixed 2026-07-11 (uncommitted) · **Linear:** MOT-15 (Done)
- **Resolution:** fal's nano-banana-2 page confirms tiers 0.5K 0.75× / 1K 1× / 2K 1.5× / 4K 2×. `cost.ts` now applies the full curve; new `packages/motif-sdk/tests/cost.test.ts` pins all tiers.
- **Evidence:** `packages/motif-sdk/src/cost.ts:12` doubles 4K price for `banana`/`gemini3` only; `banana2` supports resolution but is excluded — likely undercounts real spend in dry-run/MCP estimates/history.
- **Fix:** check fal pricing page for banana2 4K; add to doubling branch or comment the intentional exclusion.

### IMP-9 SURF-5 semantic exit codes + SURF-7 agent regression fixtures
- **Status:** open · **Linear:** MOT-16
- **Evidence:** both pending in `docs/surface/plan.md:73-107` since 2026-05-20. `apps/cli/src/utils/errors.ts:68` and `src/index.ts:85` hardcode `process.exit(1)` despite computed error codes. No agent-task fixtures exist; SURF-7-style registry-vs-output fixtures would have mechanically caught IMP-4/IMP-5.
- **Fix:** map error catalog `status` → exit codes; add fixture tests asserting CLI/MCP structured output against SDK registry.

### IMP-10 Extract generation orchestration from 1,977-line `cli.ts`
- **Status:** open · **Linear:** MOT-17
- **Evidence:** `generateImage`, `generateVariations`, `upscaleLast`, `removeBackgroundLast`, `generateVideo`, `saveGeneratedImages` all inline in `apps/cli/src/cli.ts` while `describe`/`history`/`series`/`tools` are properly extracted into `src/commands/`.
- **Fix:** extract to `src/commands/generate.ts` (etc.) matching the established pattern. Do after IMP-1/2/7 to avoid churn. Optional companion: split MCP schema literals into `schemas.ts` if `create-server.ts` keeps growing.

### IMP-11 Refresh model registry with July 2026 fal catalog
- **Status:** open · **Linear:** MOT-18
- **Evidence:** 2026-07-11 web research (fal.ai pages + Artificial Analysis leaderboards): nothing pinned is deprecated and all prices match, but Seedream 5.0 Pro/Lite, Ideogram 4, Recraft V4, and FLUX.2 Turbo shipped since the June registry update; Seedream v4, Ideogram v3, Recraft v3 are soft-superseded. Tier-2 candidates (Reve 2.0, Krea 2, ImagineArt 2.0, HunyuanImage 3.0) and video alternatives (Seedance 2.0, HappyHorse 1.1) listed in MOT-18.
- **Fix:** add tier-1 models to `models.ts` after fetching each endpoint's live API schema; keep superseded versions; reconcile clarity/gpt2 cost fallbacks. Changes public exports — sequence after IMP-4 so vary enums derive automatically.
- **Verify:** dry-run contract tests for each new model; no live canaries without approval.

## Explicitly not planned

- Studio/canvas anything — parked 2026-07-11, repo archived.
- MCP `history.ts` duplication of CLI history reading — documented intentional tradeoff (`packages/motif-mcp/src/history.ts:1-7`).
- `motif-server` package changes — deprecated thin wrapper, verified clean.
