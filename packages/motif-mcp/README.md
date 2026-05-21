# @howells/motif-mcp

Local stdio MCP server exposing Motif generation, post-processing, history, and registry resources.

## Install

```bash
npm install -g @howells/motif-mcp
```

## Configure

```json
{
  "mcpServers": {
    "motif": {
      "command": "npx",
      "args": ["-y", "@howells/motif-mcp"],
      "env": {
        "FAL_KEY": "${FAL_KEY}"
      }
    }
  }
}
```

## Tools

- `generate` - create images from prompts using Motif generation model aliases. Supports `aspect`, `resolution`, presets, `numImages`, `transparent`, `outputFormat`, `seed`, `enableWebSearch`, and `enableGoogleSearch`.
- `upscale` - upscale a remote image URL with `clarity` or `crystal`.
- `remove_background` - remove a remote image background with `rmbg` or `bria`.
- `vary` - edit or vary remote reference image URLs with models that support image editing.
- `history` - read local Motif CLI history from `~/.motif/history.json`.

The mutating tools call fal.ai and may spend credits. Inspect `motif://models` before selecting a model when you need current capabilities, reference limits, or pricing.

## Resources

- `motif://models` - model registry with aliases, fal endpoints, capabilities, pricing, and benchmark metadata.
- `motif://tools` - normalized fal utility tool registry.
- `motif://leaderboards` - bundled benchmark snapshots.
- `motif://history/schema` - local history JSON schema without user history values.

## Security

The server is local stdio only. It reads `FAL_KEY` from the environment. The `history` tool exposes prompts, costs, and local file paths to connected MCP clients.

See `docs/security.md` in the repository for the full trust boundary.
