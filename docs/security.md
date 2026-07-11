# Motif Security Notes

## Authentication

Motif uses fal.ai API-key authentication. `FAL_KEY` is the only public environment variable. The CLI can also read `apiKey` from `~/.motif/config.json`, but `FAL_KEY` takes precedence.

Use environment variables for headless or agent use. Do not print real keys in logs, test output, MCP responses, or issue comments.

## Local History Exposure

The CLI stores local generation history in `~/.motif/history.json`. It can contain prompts, costs, model names, timestamps, and local file paths.

The MCP `history` tool exposes that history to connected MCP clients. Treat any MCP client with access to Motif as able to read local prompts and paths.

## Ephemeral Generations

`motif --ephemeral` is local-first after generation:

- sends fal `X-Fal-Store-IO: 0`
- downloads the output to disk before deletion
- skips local Motif history
- deletes fal request IO payloads when fal returns a `request_id`

This is not full anonymity. Billing records, service logs, request metadata, already-uploaded input files, and local output files may still exist. Use it for disappearing generated media, not for secret handling.

## MCP Trust Boundary

`@howells/motif-mcp` is a local stdio server. It does not implement OAuth because stdio MCP inherits the local process trust boundary.

Do not connect Motif MCP to untrusted clients if local history or generated media paths are sensitive. Any remote or hosted MCP transport would need a separate auth design, scoped tokens, and protected-resource metadata.

## Live Fal Calls

Live generation spends money. Agents should use `--dry-run` or mocked tests by default. Run `RUN_FAL_CANARY=1` tests only when explicitly requested.
