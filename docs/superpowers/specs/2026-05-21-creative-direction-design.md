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

1. Add SDK-owned creative taxonomy and enrichment modules in `packages/motif-sdk`.
2. Export stable creative option ids, metadata, TypeScript types, schema descriptors, and `enrichPrompt(input)` from `@howells/motif-sdk`.
3. Wire the function into the normal generate command first by mapping CLI flags and stdin JSON into the shared `creative` object.
4. Expose the new options through `motif --describe generate --format json` using SDK-exported schema metadata.
5. Extend Series and MCP in later slices by calling the same SDK function and rendering the same SDK schema metadata.

This keeps the feature explainable, testable, and cheap. It also lets agents inspect the exact enriched prompt during dry runs.

## SDK Contract

The SDK owns the creative direction contract so CLI, MCP, and future SDK consumers cannot drift.

Initial public exports:

```ts
export type CreativeField =
  | "recipe"
  | "shot"
  | "lighting"
  | "genre"
  | "camera"
  | "color"
  | "material"
  | "motion";

export interface CreativeOption {
  id: string;
  label: string;
  description: string;
  clause: string;
}

export type CreativeDirection = Partial<Record<CreativeField, string>>;

export interface CreativePromptResult {
  basePrompt: string;
  creative: {
    selected: CreativeDirection;
    clauses: string[];
  };
  prompt: string;
}

export interface CreativeOptionError {
  code: "INVALID_OPTION";
  field: CreativeField;
  value: string;
  availableIds: string[];
}
```

The taxonomy should be typed with `satisfies` so option ids are inferred as literal unions without broad casts. The canonical field order is `recipe`, `shot`, `lighting`, `genre`, `camera`, `color`, `material`, `motion`.

`GenerateOptions` should use `creative?: CreativeDirection` as Motif-only metadata. The fal request body must only receive the final enriched prompt, not the `creative` object itself. If implementation keeps `buildGenerateBody` as the public request builder, it must either consume `creative` before building the body or be paired with a small `prepareGenerateOptions` helper that returns `{ options, creativeResult? }`.

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

- Sanitize the base prompt using SDK-owned prompt sanitation before enrichment. CLI can delegate to the SDK sanitizer rather than duplicating prompt cleanup logic.
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

The canonical structured shape is:

```json
{
  "prompt": "luxury watch on black marble",
  "creative": {
    "recipe": "cinematic",
    "shot": "close-up",
    "lighting": "rim"
  }
}
```

CLI flags such as `--recipe cinematic` map into this same object. If both flags and stdin JSON provide a value for the same creative field, explicit CLI flags take precedence, matching existing CLI option behavior.

Dry-run JSON should include:

- `prompt`: the final enriched prompt used for request validation.
- `basePrompt`: the sanitized user prompt before enrichment.
- `creative`: selected option ids and generated clauses, emitted only when creative options are present.
- Existing dry-run fields such as model, endpoint, request body, and estimated cost.

When creative options are present, `prompt` and `body.prompt` must both contain the enriched prompt. `basePrompt` contains the sanitized original. With no creative options, dry-run output should remain backward compatible and omit `basePrompt` and `creative`.

Successful structured generate output should also include `basePrompt` and `creative` whenever creative options were used, so agents can connect saved outputs back to the user-supplied prompt and deterministic enrichment.

Text output should stay concise and only show creative direction when options are present.

`motif --describe generate --format json` should expose each creative field as an enum derived from the SDK taxonomy. The schema metadata should include ids, labels, descriptions, and clause previews so agents can choose valid options without scraping prose.

## Series Integration

Series should reuse the same creative direction layer, but not own it.

- `series gen` enriches its single `baseScenePrompt` into an `enrichedScenePrompt`, then applies the Series style prefix to produce `finalPromptWithSeriesStyle`.
- `series run` can enrich each generated `baseScenePrompt` with the same selected direction before final Series prompt assembly.
- Existing Series terms remain unchanged: Theme, Scene Prompt, Series Run, Reference.

This should be a later slice after the generate command proves the API shape.

## MCP Integration

MCP tools should expose the same creative fields for compatible tools:

- `generate`
- `vary`

The MCP schema should describe creative options as deterministic prompt enrichment, not as model-specific parameters.

MCP schemas should be rendered from the SDK-exported taxonomy metadata rather than duplicating option ids locally.

## Error Handling

Unknown creative option ids should produce a typed structured error that carries:

```json
{
  "code": "INVALID_OPTION",
  "field": "lighting",
  "value": "rim-light",
  "availableIds": ["rim", "rembrandt", "softbox"]
}
```

CLI and MCP should adapt that typed error into their existing structured error formats and error catalog entries.

Empty prompts should continue using existing prompt validation behavior.

If a creative option is passed to a command that does not support prompt enrichment, the command should reject it rather than silently ignoring it.

## Testing

Use test-first implementation.

Initial tests:

- `enrichPrompt` returns the sanitized base prompt unchanged when no options are supplied.
- `enrichPrompt` appends expected clauses in stable order.
- Unknown option ids fail with a helpful error.
- Generate dry-run JSON includes `basePrompt`, `creative`, and the enriched `prompt`.
- Generate dry-run JSON has `prompt` and `body.prompt` set to the enriched prompt when creative options are present.
- Generate stdin JSON accepts the canonical `creative` object.
- CLI creative flags override matching stdin JSON creative fields.
- Existing generate dry-run behavior remains unchanged when no creative options are supplied.
- Successful structured generate output includes `basePrompt` and `creative` when creative options are present.
- `--describe generate --format json` lists creative options as SDK-derived enums with metadata.
- SDK package exports include the creative taxonomy, types, sanitizer, schema metadata, and enrichment function.

Later tests:

- `series gen` and `series run` apply the same enrichment.
- MCP `generate` and `vary` schemas expose the same options.
- MCP tools pass enriched prompts to `MotifServer`.

## Rollout

Slice 1: SDK taxonomy module, exported creative types/schema metadata, SDK sanitizer, `enrichPrompt`, generate CLI flags and stdin JSON support, describe schema, focused tests.

Slice 2: Series command support.

Slice 3: MCP schema and tool support.

Slice 4: More taxonomy entries from the photography document after the first option shape is validated.
