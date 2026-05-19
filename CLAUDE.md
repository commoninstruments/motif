# Motif

Motif is the public SDK, CLI, and MCP server for fal.ai image, video, editing,
and utility endpoints.

## Packages

- `apps/cli` — `@howells/motif`, the `motif` command.
- `packages/motif-sdk` — `@howells/motif-sdk`, the canonical Node SDK.
- `packages/motif-server` — deprecated compatibility wrapper that re-exports the SDK.
- `packages/motif-mcp` — `@howells/motif-mcp`, MCP tools backed by the SDK.

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm check
```

Focused package checks:

```bash
pnpm --filter @howells/motif-sdk test
pnpm --filter @motif/cli test
pnpm --filter @howells/motif-mcp test
```

## Environment

`FAL_KEY` is the only public Motif environment variable. The CLI can also read
the API key from `~/.motif/config.json`.

## Architecture

Dependencies flow one way:

```text
apps/cli       -> packages/motif-sdk
packages/mcp   -> packages/motif-sdk
motif-server   -> packages/motif-sdk
motif-sdk      -> neverthrow + platform fetch APIs
```

Do not import app, CLI, MCP, or filesystem-history helpers from the SDK. The SDK
should contain fal request construction, endpoint metadata, result types, upload,
queue polling, and generic tool execution only.

## Public Surface

`@howells/motif-sdk` methods return `Result<T, MotifError>` from neverthrow.
Check `.isOk()` / `.isErr()` rather than relying on thrown exceptions.

The MCP history tool exposes local prompts, costs, and file paths from the
user's `~/.motif/history.json` to connected MCP clients. Keep that behavior
explicit in docs and tool descriptions.
