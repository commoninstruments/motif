# Motif

Read `AGENTS.md` first. It is the cross-tool source of truth for commands,
package boundaries, permission rules, and verification expectations.

Claude-specific additions:

- Prefer focused package tests before `pnpm check`.
- Keep `apps/cli/AGENTS.md` as the detailed CLI/MCP operating guide.
- Do not run live fal canaries or npm publish commands without explicit user approval.
