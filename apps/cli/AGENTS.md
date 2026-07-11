# motif CLI — Agent Integration Guide

> **Security posture**: The agent is not a trusted operator.
> All inputs are validated. Generate output paths are sandboxed to CWD.
> Post-processing (`--up`, `--rmbg`) writes alongside the source image by default.
> Always use `--dry-run` before mutating commands.

## Quick Start

```bash
# Introspect the full CLI schema (models, commands, enums, flags)
motif --describe

# Introspect a specific command
motif --describe generate

# Dry-run to validate without spending money
motif --dry-run "a sunset over mountains" -m gpt --og

# Generate with JSON output (auto-detected when piped)
motif "a sunset over mountains" -m gpt --og | jq .

# Raw JSON input via stdin
echo '{"prompt":"a sunset","model":"gpt","preset":"og"}' | motif

# History with pagination and field masks
motif --history --limit 5 --fields id,prompt,cost
```

## Output Format

motif auto-detects the output context:

| Context | Default Format | Override |
|---------|---------------|----------|
| Interactive terminal (TTY) | `human` (colored, spinners) | `--format json` |
| Piped / redirected | `json` (one JSON object) | `--format human` |
| Streaming large results | n/a | `--format ndjson` |

**Always structured errors**: In JSON mode, errors are written to stderr as:
```json
{"error":true,"code":"UNKNOWN_MODEL","message":"Unknown model: foo","is_retriable":false,"details":{"available":["gpt2","gpt","banana2","banana","gemini","gemini3","seedream4","seedream45","seedream5","seedream5-lite","flux2-max","flux2-pro","flux2-flex","flux2-dev","flux2-turbo","flux","flux-fast","recraft","recraft4","ideogram","ideogram4","grok-image","qwen"]}}
```

Error codes are grouped below. Every code the CLI can emit is listed; the live
catalog is available from `motif --describe --format json`.

- General: `MISSING_API_KEY`, `UNKNOWN_MODEL`, `INVALID_MODEL_ID`, `INVALID_OPTION`,
  `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`,
  `EMPTY_PROMPT`, `TOO_MANY_REFERENCES`, `NO_PREVIOUS`, `GENERATION_FAILED`,
  `UPSCALE_FAILED`, `RMBG_FAILED`, `VIDEO_FAILED`, `DESCRIBE_FAILED`.
- Tools: `UNKNOWN_TOOL`, `INVALID_TOOL_ID`, `TOOL_FAILED`.
- Series: `SERIES_CREATE_FAILED`, `SERIES_NOT_FOUND`, `SERIES_REF_ADD_FAILED`,
  `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`.

## Input Modes

### 1. CLI Flags (human-friendly)
```bash
motif "a cat" -m gpt --landscape -r 2K -n 2
```

### 2. Stdin JSON (agent-friendly)
```bash
echo '{"prompt":"a cat","model":"gpt","aspect":"16:9","resolution":"2K","numImages":2}' | motif
```

### 3. Combined (stdin base + flag overrides)
```bash
echo '{"prompt":"a cat","model":"gpt"}' | motif --landscape -r 4K
```

Flag values override stdin JSON values for the same field.

### Stdin JSON Schema

```json
{
  "prompt": "string (required for generate)",
  "model": "gpt2 | gpt | banana2 | banana | gemini | gemini3 | seedream4 | seedream45 | seedream5 | seedream5-lite | flux2-max | flux2-pro | flux2-flex | flux2-dev | flux2-turbo | flux | flux-fast | recraft | recraft4 | ideogram | ideogram4 | grok-image | qwen",
  "aspect": "1:1 | 16:9 | 9:16 | 2:3 | 3:2 | 4:3 | 3:4 | 4:5 | 5:4 | 21:9",
  "resolution": "1K | 2K | 4K",
  "numImages": 1,
  "output": "filename.png",
  "editImages": ["path/to/ref.png"],
  "transparent": false,
  "inputFidelity": "low | high",
  "preset": "cover | square | landscape | portrait | story | reel | feed | og | wallpaper | wide | ultra",
  "noOpen": true,
  "command": "generate | upscale | rmbg | vary | video | last | history | describe",
  "limit": 10,
  "offset": 0,
  "imagePath": "path/to/image.png",
  "scale": 2,
  "duration": 5,
  "generateAudio": true
}
```

## Creative Direction

Creative direction enriches the prompt with predefined clauses before the request
body is built. There are eight fields, applied in this canonical order:

| Field | CLI flag | Purpose |
|-------|----------|---------|
| `recipe` | `--recipe <id>` | Overall creative recipe |
| `shot` | `--shot <id>` | Shot and framing |
| `lighting` | `--lighting <id>` | Lighting treatment |
| `genre` | `--genre <id>` | Genre and mood |
| `camera` | `--camera <id>` | Camera and lens language |
| `color` | `--color <id>` | Color treatment |
| `material` | `--material <id>` | Material or texture |
| `motion` | `--motion <id>` | Motion treatment |

Pass fields as CLI flags or as a `creative` object in stdin JSON:

```bash
# CLI flags
motif "a ceramic desk lamp" -m banana2 --shot close-up --lighting rim

# Stdin JSON
echo '{"prompt":"a ceramic desk lamp","model":"banana2","creative":{"shot":"close-up","lighting":"rim"}}' | motif
```

Per-field flags override the matching key in the stdin `creative` object. Only the
fields you set are applied; the rest are left untouched.

An unknown option id fails before any fal request with a structured `INVALID_OPTION`
error whose details include the field and the available ids for that field.

Option ids are versioned with the taxonomy. Do not hardcode them; read the live
ids from `motif --describe --format json`.

The `generate` and `vary` commands both accept creative direction. Vary operates on
the edit-capable model subset (`EDIT_CAPABLE_MODELS`) — the generation models whose
fal endpoints support image editing.

## Schema Introspection

```bash
# Full schema (all commands, models, enums, flags)
motif --describe

# Single command schema
motif --describe generate
motif --describe upscale

# Via stdin
echo '{"command":"describe"}' | motif
```

The schema includes:
- All command input/output types with JSON Schema
- All model capabilities (aspect, resolution, edit support, pricing)
- All enum values (aspect ratios, resolutions, model names)
- Preset definitions
- Global flag documentation

## Agent Invariants

**ALWAYS do these things:**

1. **Always use `--dry-run` first** for any mutating command (generate, upscale, rmbg, vary).
   Generations cost real money ($0.02–$0.30 per image). Validate before spending.

2. **Always use `--fields`** when you only need specific output fields.
   Full output includes paths, dimensions, costs, timestamps — most calls only need `id` and `path`.

3. **Always specify `--model`** explicitly. Don't rely on defaults — they're user-configured
   and may change between sessions.

4. **Always use `--no-open`** in automated pipelines. The default opens images in Preview.app,
   which will interrupt the agent.

5. **Always validate model names** against `motif --describe` output. Model names are short
   aliases (`gpt`, `banana`, `gemini`, `gemini3`), not full fal.ai endpoint names.

**NEVER do these things:**

1. **Never pass fal.ai endpoint strings as model names.** Use `gpt`, not `fal-ai/gpt-image-1.5`.

2. **Never use `../` or `%2e` in output paths.** Output is sandboxed to CWD. Traversal attempts
   are rejected with `INVALID_OUTPUT_PATH`.

3. **Never assume the last generation exists.** Always handle `NO_PREVIOUS` errors when using
   `--vary`, `--up`, or `--rmbg`.

4. **Never parse human-formatted output.** Always use `--format json` or pipe the command.
   Human output contains ANSI color codes, spinner animations, and emoji.

5. **Never send prompts with control characters.** They are stripped during sanitization,
   which may change the intended meaning.

## Recommended Field Masks

Use `--fields` to limit output to what you need. This protects your context window
and reduces token usage in multi-step workflows.

| Workflow | Command | Recommended `--fields` |
|----------|---------|----------------------|
| Generate and confirm | `generate` | `id,path,cost` |
| Batch exploration | `generate` | `id,path` |
| Cost tracking | `generate` | `id,cost,model` |
| Upscale/rmbg result | `upscale`, `rmbg` | `path,size` |
| Video result | `video` | `path,duration,cost` |
| History scan | `history` | `id,prompt,model,cost` |
| Last generation check | `last` | `id,prompt,output` |
| Pipeline chaining | `generate` | `path` (minimal — just the file path) |

### Examples

```bash
# Batch: generate 4 images, only get paths
motif "sunset over mountains" -m flux-fast -n 4 --fields path

# Pipeline: generate → upscale (chain by path)
PATH=$(motif "a cat" -m flux --fields path | jq -r .path)
motif --up "$PATH" --fields path,size

# Cost audit: check recent spending
motif --history --limit 20 --fields model,cost
```

## Cost Reference

### Image Generation

| Model | Per Image | Notes |
|-------|-----------|-------|
| `flux-fast` | $0.003 | Near-instant, great for iterations |
| `flux2-turbo` | $0.008/MP | Fastest FLUX.2, ~6s at 1MP |
| `flux2-dev` | ~$0.012 | Open FLUX.2, billed per compute second ($0.00167/sec) |
| `grok-image` | $0.02 | Fast, cheap generation and edits |
| `qwen` | $0.02/MP | Low-cost open-weight generation |
| `seedream4` | $0.03 | Low-cost, high-ranked generation and edits |
| `flux2-pro` | $0.03/MP | Production FLUX quality per megapixel |
| `ideogram` | $0.03 | Best text rendering in images |
| `ideogram4` | $0.03 | Per-MP tiers: TURBO $0.03 / BALANCED $0.06 / QUALITY $0.10 per MP |
| `seedream5-lite` | $0.035 | Flat per image up to Auto 3K (~9.4MP), generation and edits |
| `gemini` | $0.0398 | Cheap, no resolution control |
| `recraft` | $0.04 | Best for design/brand work, vector art |
| `recraft4` | $0.04 | Recraft V4 design generation |
| `seedream45` | $0.04 | Current Seedream generation and edits |
| `flux2-flex` | $0.05/MP | FLUX with guidance and step controls |
| `flux` | $0.06 | Photorealism benchmark |
| `flux2-max` | $0.07/MP | Highest-quality FLUX |
| `seedream5` | $0.0675 / $0.135 | $0.0675 up to 1536², $0.135 up to 2048² (2K/4K); generation and edits |
| `banana2` | $0.08 | $0.06 / $0.08 / $0.12 / $0.16 at 0.5K / 1K / 2K / 4K (0.75x / 1x / 1.5x / 2x) |
| `gpt` | $0.133 | Supports transparency, 4 reference images |
| `banana` | $0.15 ($0.30 at 4K) | 14 reference images, best editing |
| `gemini3` | $0.15 ($0.30 at 4K) | Full feature support |
| `gpt2` | $0.211 | Frontier OpenAI generation, transparent PNGs |

### Processing

| Model | Per Use | Notes |
|-------|---------|-------|
| `clarity` (upscale) | $0.03/MP | Default upscaler |
| `crystal` (upscale) | $0.02 | Alternative upscaler |
| `rmbg` | $0.02 | Background removal |
| `bria` | $0.02 | Alternative background removal |

### Video

| Model | Per Second | Notes |
|-------|-----------|-------|
| `kling` (audio off) | $0.112/sec | 5s clip = $0.56 |
| `kling` (audio on) | $0.168/sec | 5s clip = $0.84 |

**Tip**: Use `--dry-run` to see the exact estimated cost before committing.
**Warning**: Video is 5-10x more expensive than images. Always dry-run first.

## Video Generation

Generate video from an image using Kling v3 Pro:

```bash
# Generate 5s video from an image
motif --video image.png "camera slowly zooms in"

# Without audio (cheaper)
motif --video image.png "smooth pan left" --video-no-audio

# Custom duration (3-15 seconds)
motif --video image.png "cinematic motion" --video-duration 10

# From last generation
motif --video "camera orbits around the subject"

# Dry-run first (video is expensive!)
motif --dry-run --video image.png "slow zoom"

# Via stdin JSON
echo '{"command":"video","imagePath":"image.png","prompt":"zoom in","duration":5}' | motif
```

### Video Invariants

- **Always `--dry-run` first.** A 10s video with audio costs $1.68.
- **Generation takes 30-120 seconds.** The CLI polls automatically.
- **Output is `.mp4`.** Use `--video-no-audio` for silent video (40% cheaper).
- **Duration range is 3-15 seconds.**
- **Aspect ratio is determined by the source image dimensions.**

## Pagination

History supports offset-based pagination:

```bash
# First page
motif --history --limit 10

# Next page
motif --history --limit 10 --offset 10

# Stream all as NDJSON
motif --history --limit 100 --format ndjson
```

JSON response includes `hasMore: true` when more pages exist.

## Series — Consistent Styling Across Related Images

Series let you lock a visual style and generate multiple images that look like they belong together.

### Quick Start

```bash
# One-shot themed run: plan 6 cohesive images before spending credits
motif series run "brutalist architecture" --count 6 --dry-run --format json

# Create a series from a cover image
motif series create "Luna's Adventure" --from cover.png \
  --style "children's book, watercolor, soft pastels" -m banana -a 3:2

# Add character references
motif series ref-add luna-s-adventure character-luna.png --tag character -d "Luna front view"
motif series ref-add luna-s-adventure forest-clearing.png --tag location -d "Forest clearing"

# Generate with consistent styling (style prompt + refs auto-included)
motif series gen luna-s-adventure "Luna discovers a glowing mushroom in the forest clearing" \
  --refs character,location --dry-run

# After validating, generate for real
motif series gen luna-s-adventure "Luna discovers a glowing mushroom" --refs character,location

# View series state
motif series show luna-s-adventure
motif series history luna-s-adventure
```

### Stdin JSON

```bash
echo '{"command":"series-run","theme":"brutalist architecture","numImages":6,"dryRun":true}' | motif series --format json
echo '{"command":"series-generate","series":"luna-s-adventure","prompt":"Luna meets the fox","refs":"character"}' | motif series
```

### How It Works

1. **Series run** turns a theme into one shared style prompt and one scene prompt per requested image
2. **Reference images** (tagged) are passed as `--edit` images to the model
3. **Outputs** are tracked per-series with full provenance (prompt, refs used, cost)
4. **Live series runs** reuse the first generated image as a style anchor for later images when the model supports references
5. **banana model** is recommended for series (14 reference images, best consistency)

### Series Invariants

- **Always `--dry-run` first.** Series generations cost real money.
- **Build refs before generating.** Style and character refs must exist before chapter illustrations.
- **Use `--refs` to select specific tags.** Don't send all refs if the model has a low limit.
- **banana supports 14 refs**, gpt supports 4, gemini/gemini3 support 4.
- Series data stored in `~/.motif/series/<slug>/`.

### All Series Commands

```bash
motif series create <name> [--from <img>] [--style <prompt>] [-m model] [-a aspect] [-r res]
motif series list
motif series show <slug>
motif series ref-add <slug> <image> [-t tag] [-d description]
motif series ref-remove <slug> <filename>
motif series gen <slug> "prompt" [--refs tags] [--dry-run] [-m model] [-a aspect] [-o output]
motif series run "theme" [--count n] [--series slug] [--refs tags] [--dry-run] [-m model] [-a aspect]
motif series history <slug> [--limit n] [--offset n]
motif series delete <slug>
```

## Response Sanitization

All API response data is sanitized before output to defend against prompt injection
embedded in image metadata or API responses. Patterns matching known injection
formats (SYSTEM, INSTRUCTION, etc.) are replaced with `[FILTERED]`.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `FAL_KEY` | Yes | fal.ai API key. Also configurable in `~/.motif/config.json` |

## Auth

- **Headless**: Set `FAL_KEY` environment variable. No browser redirect needed.
- **Config file**: Add `"apiKey": "..."` to `~/.motif/config.json`.
- **Local override**: Create `.motifrc` in CWD with project-specific config.
