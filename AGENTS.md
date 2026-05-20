# Motif

Motif is the public SDK, CLI, and MCP server for fal.ai image, video, editing, and utility endpoints.

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm check
```

Focused checks:

```bash
pnpm --filter @howells/motif-sdk test
pnpm --filter @howells/motif-cli test
pnpm --filter @howells/motif-mcp test
pnpm --filter @howells/motif-server test
```

Fal canaries are opt-in and spend credits:

```bash
RUN_FAL_CANARY=1 pnpm --filter @howells/motif-sdk test -- tests/fal-canary.test.ts
```

## Packages

- `apps/cli` - `@howells/motif-cli`, the `motif` command and terminal Studio. See `apps/cli/AGENTS.md`.
- `packages/motif-sdk` - `@howells/motif-sdk`, the canonical Node SDK and fal request normalization.
- `packages/motif-mcp` - `@howells/motif-mcp`, local stdio MCP tools backed by the SDK.
- `packages/motif-server` - deprecated compatibility wrapper that re-exports `@howells/motif-sdk`.

## Public Surface

- CLI: `motif --describe --format json`, `motif --dry-run --format json`, stdin JSON, `--fields`, `--format ndjson`.
- SDK: `MotifServer`, `buildGenerateBody`, model metadata, fal utility tools, and Result-returning methods.
- MCP: stdio server exposing generate, upscale, remove background, vary, history, and read-only registry resources.
- Discovery: `README.md`, `llms.txt`, `docs/security.md`, and `docs/surface/`.

## Environment

`FAL_KEY` is the only public Motif environment variable. The CLI can also read `apiKey` from `~/.motif/config.json`; environment values take precedence.

Never print or commit real API keys. Do not run live fal canaries unless explicitly asked.

## Architecture Rules

- Dependencies flow toward `packages/motif-sdk`; do not import CLI, MCP, local history, or filesystem helpers into the SDK.
- Keep fal endpoint normalization and model metadata in `packages/motif-sdk`.
- Keep local paths, downloads, history, and terminal UX in `apps/cli`.
- Keep MCP handlers thin and backed by SDK methods or read-only local history helpers.
- Preserve strict package `files` allowlists and run `npm pack --dry-run` checks before publishing changes.

## Permission Boundaries

Always:

- Read repo files and package docs.
- Run focused tests, typecheck, lint, build, and `pnpm check`.
- Use `--dry-run` before any command that would call fal.

Ask first:

- Install new dependencies.
- Run live fal canaries or any command that spends credits.
- Publish npm packages, change GitHub repo visibility, or delete remote repositories.
- Change package names, package versions, or public exports.

Never:

- Commit secrets or print secret values.
- Copy private Studio code, private service dependencies, database details, canvas implementation details, or private web app references into this public repo.
- Reintroduce private web app directories or private Studio topology docs.
- Delete local files outside this repo unless the user explicitly asks.

## Verification Expectations

For code changes, run the narrow package test first, then `pnpm check` before declaring completion. For docs-only changes, run `git diff --check` and inspect package allowlists if published files changed.
