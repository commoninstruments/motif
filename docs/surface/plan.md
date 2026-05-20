# Surface Plan: Motif

Date: 2026-05-20

Target: move Motif from **Agent-ready** to **Agent-first** by improving discovery, MCP recoverability, and error semantics without expanding scope into a hosted web app or multi-agent runtime.

## Status

Completed in this pass:

- SURF-1: root `AGENTS.md` and `CLAUDE.md` overlay.
- SURF-2: `llms.txt`, README agent entrypoints, and package docs.
- SURF-3: structured MCP tool errors for recoverable failures.
- SURF-4: MCP read-only resources and local `.mcp.json`.
- SURF-6: SDK, MCP, CLI, and compatibility package READMEs.
- SURF-8: `docs/security.md` with auth, MCP, history, and ephemeral boundaries.

Still intentionally open:

- SURF-5: semantic CLI exit codes and trace IDs. This is a CLI contract change and should be done deliberately.
- SURF-7: agent task regression fixtures. Useful next, but lower risk than discovery/MCP correctness.

## Tasks

### SURF-1: Add Root AGENTS.md

Status: completed.

- Description: Create a concise root `AGENTS.md` as the cross-tool baseline, covering package map, exact commands, verification, publishing caution, and permission boundaries.
- Files: `AGENTS.md`, `CLAUDE.md`, optionally `apps/cli/AGENTS.md`.
- Complexity: S
- Score impact: Context Files 2/3 -> 3/3, Discovery 1/3 -> 2/3.
- Dependencies: none.
- Suggested owner: coding worker.
- Verification: `pnpm check`; manually confirm `AGENTS.md` is under 200 lines and links to package-specific docs.

### SURF-2: Add Agent-Readable Discovery Index

Status: completed.

- Description: Add `llms.txt` and a compact “Agent entrypoints” README section linking CLI schema, SDK exports, MCP server, errors, tests, and package docs.
- Files: `llms.txt`, `README.md`, package READMEs if package tarballs should include per-package docs.
- Complexity: S
- Score impact: Discovery 1/3 -> 2/3.
- Dependencies: SURF-1 for canonical context link.
- Suggested owner: docs worker.
- Verification: inspect `llms.txt` for H1, blockquote summary, H2 sections, and descriptive links.

### SURF-3: Return Structured MCP Tool Errors

Status: completed.

- Description: Replace recoverable `McpError` throws inside tool execution with `{ isError: true, content: [...] }` responses that include code, message, retryability, and recovery hints.
- Files: `packages/motif-mcp/src/create-server.ts`, `packages/motif-mcp/tests/tools.test.ts`.
- Complexity: M
- Score impact: MCP Server 2/3 -> 3/3 candidate, Error Handling 2/3 -> 3/3 candidate.
- Dependencies: define shared MCP error envelope.
- Suggested owner: coding worker.
- Verification: `pnpm --filter @howells/motif-mcp test`; add tests asserting `result.isError === true`.

### SURF-4: Add MCP Resources And Local Manifest

Status: completed.

- Description: Expose read-only MCP resources for model registry, utility tool registry, leaderboards, error catalog, and history schema; add `.mcp.json` for local stdio discovery.
- Files: `packages/motif-mcp/src/create-server.ts`, `.mcp.json`, `README.md`, `packages/motif-mcp/tests/tools.test.ts`.
- Complexity: M
- Score impact: MCP Server 2/3 -> 3/3 candidate, Discovery 2/3 -> 3/3 candidate if paired with SURF-2.
- Dependencies: decide whether history values or only history schema should be exposed as resources.
- Suggested owner: coding worker.
- Verification: `pnpm --filter @howells/motif-mcp test`; manually inspect resource list through MCP client.

### SURF-5: Add Semantic CLI Exit Codes And Trace IDs

Status: pending.

- Description: Map error catalog status/classes to semantic exit codes, add `trace_id`/`instance` to structured errors, and document the mapping in `--describe errors`.
- Files: `apps/cli/src/utils/errors.ts`, `apps/cli/src/utils/output.ts`, `apps/cli/src/utils/error-catalog.ts`, `apps/cli/tests/output.test.ts`, `apps/cli/tests/cli-contract.test.ts`.
- Complexity: M
- Score impact: CLI Design 2/3 -> 3/3, Error Handling 2/3 -> 3/3.
- Dependencies: confirm whether non-1 exit codes are acceptable for existing users.
- Suggested owner: coding worker.
- Verification: `pnpm --filter @howells/motif-cli test`; manually run invalid model/path commands and inspect exit codes.

### SURF-6: Publish Package-Local API Docs

Status: completed.

- Description: Add focused READMEs for SDK and MCP packages with import examples, method table, auth requirements, and recovery behavior.
- Files: `packages/motif-sdk/README.md`, `packages/motif-mcp/README.md`, `packages/motif-server/README.md`, `apps/cli/README.md` or generated package README copies.
- Complexity: S
- Score impact: API Surface/Discovery practical improvement, Tool Design 2/3 -> 3/3 candidate.
- Dependencies: none.
- Suggested owner: docs worker.
- Verification: `pnpm --filter @howells/motif-sdk pack --dry-run`; confirm READMEs are included and contain no private references.

### SURF-7: Add Agent Task Regression Fixtures

Status: pending.

- Description: Add JSONL fixtures that encode representative agent tasks and expected CLI/MCP structured outputs, all using dry-run or mocked SDK calls.
- Files: `tests/agent-tasks/*.jsonl`, package test harnesses, CI workflow if desired.
- Complexity: M
- Score impact: Testing 2/3 -> 3/3 candidate.
- Dependencies: SURF-3 improves MCP error assertions.
- Suggested owner: testing worker.
- Verification: `pnpm test`; CI reports fixture pass/fail counts.

### SURF-8: Document Auth And Ephemeral Generation Boundaries

Status: completed.

- Description: Add a security/auth guide that explains `FAL_KEY` precedence, MCP trust boundary, local history exposure, `--ephemeral` behavior, and what fal payload deletion does not guarantee.
- Files: `README.md`, `docs/security.md`, `packages/motif-mcp/README.md`.
- Complexity: S
- Score impact: Authentication 1/3 -> 2/3 practical local-tool score; Discovery improvement.
- Dependencies: none.
- Suggested owner: docs worker.
- Verification: docs review plus a private-term scan to keep public docs clean.
