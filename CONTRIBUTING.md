# Contributing

## Setup

```bash
pnpm install
cp .env.example .env
```

Set `FAL_KEY` when running live generation. Dry runs, schema description, and most tests do not require an API key.

## Project Layout

```text
apps/
  cli/          @howells/motif-cli command package
packages/
  motif-sdk/    canonical public Node SDK
  motif-server/ deprecated compatibility wrapper
  motif-mcp/    MCP server package
```

## Checks

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm check
```

Before publishing, inspect package contents:

```bash
pnpm --filter @howells/motif-cli pack --dry-run
pnpm --filter @howells/motif-sdk pack --dry-run
pnpm --filter @howells/motif-mcp pack --dry-run
```

Packages use strict `files` allowlists. Do not add local environment files, generated images, coverage output, or build cache directories to published artifacts.
