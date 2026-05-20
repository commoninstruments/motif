# @howells/motif-cli

Agent-first fal.ai CLI with structured output, dry runs, stdin JSON, local history, series, utility tools, and terminal Studio.

## Install

```bash
npm install -g @howells/motif-cli
```

## Agent Entry Points

```bash
motif --help
motif --describe --format json
motif "prompt" --model banana2 --dry-run --format json
motif "prompt" --model banana2 --ephemeral --output out.png
motif tool sam3-image --input ./image.png --prompt "shoe" --dry-run --format json
```

## Package Development

```bash
pnpm --filter @howells/motif-cli test
pnpm --filter @howells/motif-cli typecheck
pnpm --filter @howells/motif-cli build
```

See `apps/cli/AGENTS.md` for the detailed agent integration guide.

