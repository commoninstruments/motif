# Creative Direction Prompt Enrichment Design

## Context

Motif already accepts creative prompts through the CLI, SDK-backed generation flow, MCP tools, video generation, variations, and Series commands. The imported AI photography document is useful, but it should not become Midjourney-specific syntax inside Motif. Its value is as a model-agnostic taxonomy of photographic and cinematic direction: shot type, lighting, camera language, genre, color, material, motion, and reusable recipes.

The feature should make prompts more deliberate before Motif spends fal credits. It must work with dry-run output first, preserve current behavior when no creative options are passed, and expose machine-readable schema for agents.

## Goal

Add a shared creative direction layer that can enrich any compatible Motif prompt, starting with the normal `motif "<prompt>"` generate path and then reusing the same layer in Series, variation/edit prompts, video prompts, and MCP tools.

Example target CLI:

```bash
motif "luxury watch on black marble" \
  --recipe cinematic \
  --shot close-up \
  --lighting rim \
  --genre film-noir \
  --camera macro-product \
  --dry-run \
  --format json
```

The dry-run payload should show the original prompt, creative options, and enriched prompt so users and agents can inspect the request before spending credits.

## Non-Goals

- Do not import the Notion document as a large prose blob.
- Do not add Midjourney parameters such as `--v`, `--style raw`, or Midjourney-specific aspect syntax.
- Do not apply creative options to non-creative utility commands such as history, describe, background removal without prompt guidance, or pure upscaling.
- Do not call external LLMs to rewrite prompts in the first implementation.

## Approach

Use a shared taxonomy plus deterministic prompt enrichment function.

1. Add a creative taxonomy module with stable option ids and short prompt phrases.
2. Add `enrichPrompt(input)` that accepts a base prompt and optional creative direction fields.
3. Wire the function into the normal generate command first.
4. Expose the new options through `motif --describe generate --format json`.
5. Extend Series and MCP in later slices by calling the same function.

This keeps the feature explainable, testable, and cheap. It also lets agents inspect the exact enriched prompt during dry runs.

## Creative Options

Initial supported fields:

- `recipe`: high-level prompt recipe such as `cinematic`, `editorial`, `product`, `documentary`, `fashion`, `architectural`.
- `shot`: framing and camera angle such as `close-up`, `wide`, `macro`, `overhead`, `low-angle`, `dutch-angle`.
- `lighting`: lighting treatment such as `rim`, `rembrandt`, `softbox`, `golden-hour`, `neon`, `low-key`, `high-key`.
- `genre`: cinematic or photographic genre such as `film-noir`, `sci-fi`, `western`, `period-drama`, `horror`, `romantic-comedy`.
- `camera`: camera/lens language such as `macro-product`, `portrait-50mm`, `wide-angle`, `telephoto`, `film-grain`, `drone`.
- `color`: palette treatment such as `monochrome`, `desaturated`, `warm`, `cool`, `high-contrast`, `pastel`.
- `material`: texture or surface emphasis such as `matte`, `glossy`, `reflective`, `translucent`, `weathered`, `polished`.
- `motion`: movement treatment such as `still`, `dynamic`, `motion-blur`, `action`, `slow-cinematic`.

Each option id maps to a concise phrase. For example, `lighting=rim` can add `rim lighting with defined edge highlights`; `shot=close-up` can add `close-up composition with controlled depth of field`.

## Prompt Enrichment Rules

The enrichment function should:

- Sanitize the base prompt using the existing prompt sanitation path before enrichment.
- Return the original sanitized prompt unchanged when no creative options are provided.
- Append creative direction as concise comma-separated clauses.
- Avoid duplicate clauses when the same option is supplied more than once through different inputs.
- Preserve user intent by keeping the base prompt first.
- Avoid artist-likeness phrasing such as `in the style of living artist`. Taxonomy entries should describe observable photographic qualities instead.
- Return structured metadata: selected option ids, appended clauses, and the final prompt.

Example:

```ts
enrichPrompt({
  prompt: "luxury watch on black marble",
  recipe: "cinematic",
  shot: "close-up",
  lighting: "rim",
  genre: "film-noir",
});
```

Resulting prompt:

```txt
luxury watch on black marble, cinematic scene, close-up composition with controlled depth of field, rim lighting with defined edge highlights, film noir mood with high contrast shadows
```

## CLI Integration

Generation should accept the shared creative options directly:

```bash
motif "prompt" --recipe cinematic --shot close-up --lighting rim --dry-run
```

Dry-run JSON should include:

- `prompt`: the final enriched prompt used for request validation.
- `basePrompt`: the sanitized user prompt before enrichment.
- `creative`: selected option ids and generated clauses.
- Existing dry-run fields such as model, endpoint, request body, and estimated cost.

Text output should stay concise and only show creative direction when options are present.

## Series Integration

Series should reuse the same creative direction layer, but not own it.

- `series gen` enriches its single scene prompt before applying the series style prefix.
- `series run` can enrich each generated scene prompt with the same selected direction.
- Existing Series terms remain unchanged: Theme, Scene Prompt, Series Run, Reference.

This should be a later slice after the generate command proves the API shape.

## MCP Integration

MCP tools should expose the same creative fields for compatible tools:

- `generate`
- `vary`

The MCP schema should describe creative options as deterministic prompt enrichment, not as model-specific parameters.

## Error Handling

Unknown creative option ids should produce a structured `INVALID_OPTION` error with available ids for that field.

Empty prompts should continue using existing prompt validation behavior.

If a creative option is passed to a command that does not support prompt enrichment, the command should reject it rather than silently ignoring it.

## Testing

Use test-first implementation.

Initial tests:

- `enrichPrompt` returns the sanitized base prompt unchanged when no options are supplied.
- `enrichPrompt` appends expected clauses in stable order.
- Unknown option ids fail with a helpful error.
- Generate dry-run JSON includes `basePrompt`, `creative`, and the enriched `prompt`.
- Existing generate dry-run behavior remains unchanged when no creative options are supplied.
- `--describe generate --format json` lists the creative options.

Later tests:

- `series gen` and `series run` apply the same enrichment.
- MCP `generate` and `vary` schemas expose the same options.
- MCP tools pass enriched prompts to `MotifServer`.

## Rollout

Slice 1: taxonomy module, `enrichPrompt`, generate CLI options, describe schema, focused tests.

Slice 2: Series command support.

Slice 3: MCP schema and tool support.

Slice 4: More taxonomy entries from the photography document after the first option shape is validated.
