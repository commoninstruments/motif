# Surface Scorecard: Motif

Last audited: 2026-07-11

```text
==============================================================================
                           SURFACE SCORECARD
                           Motif
                           2026-07-11
==============================================================================

  1. API Surface          [---]  N/A   No HTTP API surface
  2. CLI Design           [###]  3/3   JSON/schema/dry-run surface plus semantic exit codes (2/3/4/5)
  3. MCP Server           [###]  3/3   Stdio MCP with runtime-validated args, derived enums, structured errors, and mock-free tests
  4. Discovery & AEO      [###]  3/3   README, AGENTS.md, llms.txt, and package docs synced to the registry by a CI doc-sync test
  5. Authentication       [##.]  2/3   FAL_KEY/envy config plus documented MCP, history, and ephemeral boundaries
  6. Error Handling       [##.]  2/3   Structured errors with doc_uri/suggestions and semantic exit codes; no trace_id
  7. Tool Design          [###]  3/3   Enums derived from one registry (EDIT_CAPABLE_MODELS); drift is CI-caught
  8. Context Files        [###]  3/3   Root AGENTS.md, CLAUDE.md overlay, package AGENTS.md, and package READMEs
  9. Multi-Agent          [---]  N/A   Not an agent orchestration system
  10. Testing             [##.]  2/3   159 CLI tests incl. agent fixtures pinning schemas/envelopes/exit codes; no eval dataset
  11. Data Retrievability [---]  N/A   No retrievable knowledge/RAG surface

==============================================================================
  TOTAL: 21/24 (scaled: 26/30)
  RATING: Agent-first

  Human-only        Agent-tolerant      Agent-ready        Agent-first
  0          7      8           14      15        22       23        30
==============================================================================
```

## Changes since 2026-05-21

- CLI Design 2→3: SURF-5 shipped — error-catalog statuses map to exit codes 2/3/4/5, documented in apps/cli/AGENTS.md.
- Discovery & AEO 2→3: creative direction documented across all discovery surfaces; model/error/cost tables regenerated from SDK exports and pinned by docs-sync.test.ts.
- Tool Design 2→3: vary enums derive from EDIT_CAPABLE_MODELS in CLI and MCP; MCP args are runtime-validated (numImages guardrail, enum checks, spec-legal zero-arg calls).
- Testing stays 2/3: agent regression fixtures landed (SURF-7), suite grew 99→159 CLI tests; a scored eval dataset remains the gap to 3.
- Remaining to Agent-first ceiling: trace ids in errors (SURF-5 second half), auth 3/3, eval dataset.
