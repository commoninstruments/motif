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

- `generate` - create images from prompts using Motif model aliases.
- `upscale` - upscale a remote image URL.
- `remove_background` - remove a remote image background.
- `vary` - edit or vary remote reference image URLs.
- `history` - read local Motif CLI history from `~/.motif/history.json`.

## Resources

- `motif://models` - model registry.
- `motif://tools` - normalized fal utility tool registry.
- `motif://leaderboards` - bundled benchmark snapshots.
- `motif://history/schema` - local history JSON schema without user history values.

## Security

The server is local stdio only. It reads `FAL_KEY` from the environment. The `history` tool exposes prompts, costs, and local file paths to connected MCP clients.

See `docs/security.md` in the repository for the full trust boundary.

