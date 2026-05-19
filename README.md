<p align="center">
  <img src="https://raw.githubusercontent.com/howells/motif/main/logo.png" width="128" alt="Motif">
</p>
<h1 align="center">Motif</h1>

<p align="center">
  Agent-first image, video, editing, and series CLI for <a href="https://fal.ai">fal.ai</a><br>
  <code>npm install -g @howells/motif-cli</code>
</p>

Motif is a terminal-first creative tool for fal.ai. It generates images, edits from reference images, upscales, removes backgrounds, creates image-to-video clips, keeps local history and cost totals, and exposes structured JSON output for agents and scripts.

## Quick Start

```bash
# Set your fal.ai API key
export FAL_KEY="your-api-key"

# Generate an image with the default model, Nano Banana Pro
motif "a cinematic product photo of a ceramic desk lamp"

# Pick a model, preset, resolution, and output path
motif "mountain vista at dawn" --model gemini3 --landscape --resolution 4K --output vista.png

# Edit using one or more reference images
motif "turn this into a watercolor poster" --edit photo.png --model banana

# Use agent-safe validation before spending money
motif "futuristic city map" --model ideogram --style DESIGN --dry-run --format json
```

Run `motif` with no arguments to launch the interactive terminal studio.

## Install

```bash
npm install -g @howells/motif-cli
```

Or run without installing:

```bash
npx @howells/motif-cli "your prompt"
```

For local development:

```bash
git clone https://github.com/howells/motif.git
cd motif
pnpm install
pnpm build
pnpm link --global
```

## What Motif Does

- Text-to-image generation across OpenAI, Gemini, FLUX, Recraft, Ideogram, and Nano Banana models.
- Reference-image editing with model-specific reference limits.
- Image post-processing with upscaling and background removal.
- Image-to-video generation through Kling v3 Pro.
- Local generation history with IDs, output paths, cost totals, and `--last` / `--history` lookup.
- Series management for consistent characters, styles, and projects across multiple generations.
- Agent-oriented `--format json`, `--format ndjson`, `--fields`, `--dry-run`, stdin JSON, and `--describe` schema introspection.
- CWD-sandboxed output paths and validated inputs.
- Interactive Studio with a concise model selector; detailed benchmark metadata stays in JSON introspection instead of crowding the TUI.

## Models

Motif keeps two model views:

- Runnable fal models in the `MODELS` registry, with normalized CLI arguments where fal exposes matching fields.
- Ranking snapshots from Artificial Analysis so agents can see the broader market context, including models that do not currently have a verified fal route in Motif.

### Recommended Image Models

| Need | Use | Why | Speed | fal price |
| --- | --- | --- | --- | ---: |
| Best overall quality | `gpt2` | #1 text-to-image on Artificial Analysis | Very slow | ~$0.211/image |
| Best edits | `gpt` | #2 editing, strong reference fidelity, transparent PNGs | Slow | ~$0.133/image |
| Best balanced choice | `banana2` | Top-3 quality, top-5 edits, web search, 1K/2K/4K | Varies | $0.08/image |
| Best budget quality | `seedream4` | Top-6 quality at low fal price | Balanced | $0.03/image |
| Fast and cheap | `grok-image` | Top-12 quality, top-7 edits, ~5s median | Fast | $0.02/image |
| Best FLUX | `flux2-max` | Highest-ranked FLUX model | Slow | $0.07/MP |
| Best controllable FLUX | `flux2-flex` | Guidance/steps controls | Balanced | $0.05/MP |
| Cheap open FLUX | `flux2-dev` | Open FLUX.2 route, low average cost | Fast/variable | $0.00167 compute-sec |

### Runnable Image Registry

| ID | Model | Best For | Edit Refs | Sizing | Estimate |
| --- | --- | --- | ---: | --- | ---: |
| `gpt2` | GPT Image 2 | Frontier OpenAI generation, edits, transparent PNGs | 4 | Image size enum | ~$0.211 |
| `gpt` | GPT Image 1.5 | OpenAI edits and transparent PNGs | 4 | GPT fixed sizes | ~$0.133 |
| `banana2` | Nano Banana 2 | Balanced default, web search, strong edits | 4 | Aspect + 1K/2K/4K | $0.08 |
| `banana` | Nano Banana Pro | Premium Gemini generation and multi-reference edits | 14 | Aspect + 1K/2K/4K | $0.15, ~$0.30 at 4K |
| `gemini` | Gemini 2.5 Flash | Fast, low-cost generation and edits | 4 | Aspect | $0.0398 |
| `gemini3` | Gemini 3 Pro | Higher-quality Gemini generation and edits | 4 | Aspect + 1K/2K/4K | $0.15, ~$0.30 at 4K |
| `seedream4` | Seedream 4.0 | Low-cost high-ranked generation and edits | 10 | Image size enum | $0.03 |
| `seedream45` | Seedream 4.5 | Current Seedream generation and edits | 10 | Image size enum | $0.04 |
| `flux2-max` | FLUX.2 Max | Highest-quality FLUX generation and edits | 10 | Image size enum | $0.07/MP |
| `flux2-pro` | FLUX.2 Pro | Production FLUX quality at low MP price | 10 | Image size enum | $0.03/MP |
| `flux2-flex` | FLUX.2 Flex | FLUX with guidance and step controls | 10 | Image size enum | $0.05/MP |
| `flux2-dev` | FLUX.2 Dev | Open FLUX.2 route with variable compute billing | 10 | Image size enum | $0.00167/sec |
| `flux` | FLUX Pro Ultra | Photorealistic FLUX output, raw/enhanced prompts | 1 | Aspect | $0.06 |
| `flux-fast` | FLUX Schnell | Very low-cost rapid drafts | No edit | Image size enum | $0.003 |
| `recraft` | Recraft V3 | Design and illustration styles | No edit | Image size enum | $0.04 |
| `ideogram` | Ideogram V3 | Design/text-aware images, MagicPrompt, rendering speed controls | No edit | Image size enum | $0.03 |
| `grok-image` | Grok Imagine Image | Fast, cheap generation and edits | 4 | Aspect + 1K/2K | $0.02 |
| `qwen` | Qwen Image | Low-cost open-weight image generation | No edit | Image size enum | $0.02/MP |

Fal pricing is captured from the authenticated fal pricing API on 2026-05-12. Artificial Analysis rank and speed snapshots are also captured in the model registry; run `motif --describe --format json` to inspect `falPricing`, `benchmark`, and `leaderboards`.

Motif validates model-specific options before spending credits where fal constraints are known. For example, `flux2-flex` accepts `jpeg` and `png` output formats, not `webp`; `--dry-run --format json` returns a structured `INVALID_OPTION` instead of submitting a doomed request.

### Artificial Analysis Image Top 20

Text-to-image snapshot, 2026-05-12:

| Rank | Model | Elo | Motif |
| ---: | --- | ---: | --- |
| 1 | GPT Image 2 (high) | 1337 | `gpt2` |
| 2 | GPT Image 1.5 (high) | 1268 | `gpt` |
| 3 | Nano Banana 2 | 1263 | `banana2` |
| 4 | Riverflow 2.0 | 1256 | Not routed |
| 5 | Nano Banana Pro | 1220 | `banana` |
| 6 | Seedream 4.0 | 1198 | `seedream4` |
| 7 | MAI-Image-2 | 1198 | Not routed |
| 8 | FLUX.2 Max | 1197 | `flux2-max` |
| 9 | Peanut | 1187 | Not routed |
| 10 | FLUX.2 Pro | 1186 | `flux2-pro` |
| 11 | Imagen 4 Ultra Preview 0606 | 1184 | Not routed |
| 12 | grok-imagine-image | 1182 | `grok-image` |
| 13 | FLUX.2 Flex | 1182 | `flux2-flex` |
| 14 | ImagineArt 2.0 | 1181 | Not routed |
| 15 | Imagen 4 Ultra | 1171 | Not routed |
| 16 | Imagen 4 Preview 0606 | 1169 | Not routed |
| 17 | Seedream 4.5 | 1167 | `seedream45` |
| 18 | FLUX.2 Dev Turbo | 1161 | Not routed |
| 19 | FLUX.2 Dev | 1160 | `flux2-dev` |
| 20 | Qwen Image Max 2512 | 1158 | `qwen` |

Editing snapshot, 2026-05-12:

| Rank | Model | Elo | Motif |
| ---: | --- | ---: | --- |
| 1 | Riverflow 2.0 | 1286 | Not routed |
| 2 | GPT Image 1.5 (high) | 1262 | `gpt` |
| 3 | GPT Image 2 (high) | 1249 | `gpt2` |
| 4 | Nano Banana Pro | 1241 | `banana` |
| 5 | Nano Banana 2 | 1231 | `banana2` |
| 6 | HunyuanImage 3.0 Instruct (Fal) | 1222 | Not routed |
| 7 | grok-imagine-image | 1213 | `grok-image` |
| 8 | grok-imagine-image-pro | 1212 | Not routed |
| 9 | Kling Image 3.0 Omni | 1207 | Not routed |
| 10 | FLUX.2 Max | 1206 | `flux2-max` |
| 11 | Wan 2.7 Pro | 1200 | Not routed |
| 12 | Kling Image 3.0 | 1196 | Not routed |
| 13 | Kling Image O1 | 1193 | Not routed |
| 14 | Wan 2.6 Image | 1188 | Not routed |
| 15 | Riverflow 1 | 1184 | Not routed |
| 16 | Seedream 4.0 | 1184 | `seedream4` |
| 17 | Seedream 4.5 | 1184 | `seedream45` |
| 18 | Wan 2.7 | 1181 | Not routed |
| 19 | Nano Banana | 1173 | `gemini` |
| 20 | Reve V1 (December) | 1172 | Not routed |

Built-in utility and video shortcuts:

| ID | Model | Used By | Estimate |
| --- | --- | --- | ---: |
| `clarity` | Clarity Upscaler | `--up` default | $0.02 |
| `crystal` | Crystal Upscaler | Optional upscaler in config | $0.02 |
| `rmbg` | BiRefNet Background Removal | `--rmbg` default | $0.02 |
| `bria` | Bria RMBG 2.0 | Optional background remover in config | $0.02 |
| `kling` | Kling v3 Pro image-to-video | `--video` | $0.112/sec without audio, $0.168/sec with audio |

Fal utility tool registry, checked 2026-05-12 against [fal Explore](https://fal.ai/explore), [fal Image Utils](https://fal.ai/image-utils), and fal model API pages:

| ID | Endpoint | Use | Input | Pricing note |
| --- | --- | --- | --- | --- |
| `nsfw` | `fal-ai/x-ailab/nsfw` | Moderation | Images | $0.001/image |
| `topaz-image` | `fal-ai/topaz/upscale/image` | Best image upscale | Image | $0.08+ by output MP |
| `topaz-video` | `fal-ai/topaz/upscale/video` | Best video upscale | Video | $0.01-$0.08/sec |
| `bria-rmbg` | `fal-ai/bria/background/remove` | Commercial image background removal | Image | $0.02/image |
| `birefnet` | `fal-ai/birefnet/v2` | General image background removal | Image | fal compute pricing |
| `rembg` | `fal-ai/imageutils/rembg` | Generic image background removal | Image | fal compute pricing |
| `bria-video-rmbg` | `bria/video/background-removal` | Video background removal | Video | $0.14/sec |
| `lineart` | `fal-ai/image-preprocessors/lineart` | Line art preprocessing | Image | fal compute pricing |
| `sam-preprocessor` | `fal-ai/image-preprocessors/sam` | SAM preprocessing map | Image | fal compute pricing |
| `midas-depth` | `fal-ai/imageutils/depth` | MiDaS depth map | Image | fal compute pricing |
| `midas-preprocessor` | `fal-ai/image-preprocessors/midas` | Depth and normal maps | Image | fal compute pricing |
| `marigold-depth` | `fal-ai/imageutils/marigold-depth` | Marigold depth map | Image | fal compute pricing |
| `depth-anything` | `fal-ai/image-preprocessors/depth-anything/v2` | Depth Anything v2 map | Image | fal compute pricing |
| `sam2-auto` | `fal-ai/sam2/auto-segment` | Automatic image segmentation | Image | fal compute pricing |
| `sam3-image` | `fal-ai/sam-3/image` | Promptable image segmentation | Image | $0.005/request |
| `sam3-image-rle` | `fal-ai/sam-3/image-rle` | Promptable image segmentation to RLE | Image | $0.005/request |
| `sam3-video` | `fal-ai/sam-3/video` | Promptable video segmentation | Video | $0.005/16 frames |
| `sam3-video-rle` | `fal-ai/sam-3/video-rle` | Promptable video segmentation to RLE | Video | $0.005/16 frames |
| `sam3-1-video` | `fal-ai/sam-3-1/video` | Multi-object video segmentation | Video | fal frame pricing |
| `sam3-3d-objects` | `fal-ai/sam-3/3d-objects` | Single-image 3D object reconstruction | Image | $0.02/generation |
| `sam3-3d-body` | `fal-ai/sam-3/3d-body` | Single-image 3D body reconstruction | Image | $0.015/inference |
| `sam3-3d-align` | `fal-ai/sam-3/3d-align` | 3D scene alignment | Image | fal scene pricing |

Use `--dry-run` to see the estimated cost for a specific command. Per-megapixel and compute-second models are estimates because the final billed amount depends on output dimensions and runtime.

### Artificial Analysis Video Top 15

Text-to-video snapshot, 2026-05-12:

| Rank | Model | Elo | API pricing |
| ---: | --- | ---: | ---: |
| 1 | HappyHorse-1.0 | 1354 | $14.40/min |
| 2 | Dreamina Seedance 2.0 720p | 1273 | No API |
| 3 | Kling 3.0 1080p (Pro) | 1249 | $13.44/min |
| 4 | Kling 3.0 Omni 1080p (Pro) | 1233 | $13.44/min |
| 5 | grok-imagine-video | 1233 | $4.20/min |
| 6 | Vidu Q3 Pro | 1225 | $9.60/min |
| 7 | Bach-1.0 Preview | 1224 | $3.00/min |
| 8 | Kling 3.0 Omni 720p (Standard) | 1224 | $10.08/min |
| 9 | PixVerse V6 | 1222 | $5.40/min |
| 10 | PixVerse V5.6 | 1221 | $9.00/min |
| 11 | Runway Gen-4.5 | 1220 | No API |
| 12 | Veo 3 | 1218 | $12.00/min |
| 13 | Kling 3.0 720p (Standard) | 1215 | $10.08/min |
| 14 | Veo 3.1 Lite | 1214 | $3.00/min |
| 15 | Kling O1 Pro (January) | 1209 | $10.08/min |

Image-to-video snapshot, 2026-05-12:

| Rank | Model | Elo | API pricing |
| ---: | --- | ---: | ---: |
| 1 | HappyHorse-1.0 | 1395 | Coming soon |
| 2 | Dreamina Seedance 2.0 720p | 1348 | No API |
| 3 | grok-imagine-video | 1326 | $4.20/min |
| 4 | PixVerse V6 | 1322 | $5.40/min |
| 5 | Vidu Q3 Pro | 1287 | $9.60/min |
| 6 | Kling 2.5 Turbo 1080p | 1283 | $4.20/min |
| 7 | Kling 3.0 1080p (Pro) | 1280 | $13.44/min |
| 8 | PixVerse V5.6 | 1279 | $9.00/min |
| 9 | Kling 3.0 Omni 1080p (Pro) | 1277 | $13.44/min |
| 10 | Kling 2.6 Standard (January) | 1271 | Coming soon |
| 11 | PixVerse V5.5 | 1271 | $6.40/min |
| 12 | Veo 3.1 Fast | 1268 | $6.00/min |
| 13 | Runway Gen-4.5 | 1263 | No API |
| 14 | Kling 3.0 Omni 720p (Standard) | 1263 | $10.08/min |
| 15 | Kling 3.0 720p (Standard) | 1263 | $10.08/min |

## Common Commands

```bash
# Generate multiple images
motif "packaging concepts for a matcha drink" --num 4

# Transparent PNG with a GPT model
motif "minimal app icon, white fox" --model gpt2 --square --transparent

# Reproducible generation
motif "brutalist gallery interior" --seed 42

# Model-specific controls
motif "editorial fashion portrait" --model flux --raw --enhance-prompt --safety 3
motif "pixel art ramen shop logo" --model recraft --style digital_illustration/pixel_art
motif "poster for a jazz night" --model ideogram --style DESIGN --rendering-speed QUALITY --expand-prompt

# Use web search context where supported
motif "current F1 champion as a magazine cover" --model gemini3 --web-search
```

## Post-Processing

```bash
# Show the most recent generation
motif --last

# Create variations of the last image
motif --vary --num 4
motif "same scene at night" --vary --num 2

# Upscale the last image, or pass a source path
motif --up --scale 4
motif image.png --up --scale 2 --output image-upscaled.png

# Remove the background from the last image
motif --rmbg --output cutout.png
```

## Fal Tools

`motif tool` exposes fal utility endpoints with a normalized CLI shape. Local images and videos are uploaded automatically; remote `https://` URLs are passed through.

```bash
# Inspect the registered utility tools
motif tool list --format json
motif tool describe sam3-image --format json

# Dry-run the exact fal request body before spending credits
motif tool sam3-image image.png --prompt "person" --dry-run --format json

# Run common utilities
motif tool topaz-image image.png --scale 2 --output upscaled.jpg
motif tool bria-video-rmbg clip.mp4 --background-color Transparent --output cutout.webm
motif tool sam2-auto image.png --points-per-side 64 --output masks.png
motif tool marigold-depth image.png --num-inference-steps 10 --output depth.png
motif tool nsfw --inputs frame1.png frame2.png --format json
```

Shared normalized flags include `--prompt`, `--output-format`, `--scale`, `--model`, `--apply-mask`, `--max-masks`, `--detection-threshold`, `--operating-resolution`, `--num-inference-steps`, and `--ensemble-size`. Provider-specific fields can be passed with `--json '{"field":true}'` or repeatable `--option key=value`.

Utility tool inputs are validated before API calls where constraints are known. For example, `marigold-depth --ensemble-size` must be at least `2`.

## Video

`--video` creates an image-to-video clip with Kling v3 Pro. If you do not pass an image path, Motif uses the last generated image.

```bash
motif image.png --video
motif image.png --video --video-duration 8 --video-no-audio
motif image.png --video --video-negative "jitter, warping" --video-cfg-scale 0.7
```

Video jobs run through the fal.ai queue and can take 30-120 seconds. Use `--dry-run` first for cost estimates.

Motif stores the queue endpoint returned by fal and validates the output path before submitting the video job, so invalid output paths fail before credits are spent. Output paths must stay within the current working directory.

## Presets

| Preset | Aspect | Resolution | Use |
| --- | --- | --- | --- |
| `--cover` | `2:3` | `2K` | Kindle/eBook covers |
| `--square` | `1:1` | Default | Icons, avatars, square posts |
| `--landscape` | `16:9` | Default | Desktop and presentation images |
| `--portrait` | `2:3` | Default | Portrait images |
| `--story` | `9:16` | Default | Stories and vertical social media |
| `--reel` | `9:16` | Default | Reels and vertical video inputs |
| `--feed` | `4:5` | Default | Instagram feed portraits |
| `--og` | `16:9` | Default | Open Graph/social share images |
| `--wallpaper` | `9:16` | `2K` | Phone wallpapers |
| `--wide` | `21:9` | Default | Cinematic wide images |
| `--ultra` | `21:9` | `2K` | Ultra-wide banners |

Supported aspect ratios: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `3:2`, `2:3`, `4:5`, `5:4`, `21:9`.

Supported resolutions: `1K`, `2K`, `4K`. Not every model accepts resolution; unsupported controls are ignored by the model adapter.

## Agent and Script Mode

Motif is designed to be callable by agents and automation.

```bash
# JSON output
motif "a cat on a windowsill" --format json

# NDJSON output for history streams
motif --history --limit 20 --format ndjson

# Return only selected fields
motif "a logo mark" --format json --fields id,cost,images

# Read command input from stdin JSON
echo '{"prompt":"a cat","model":"gpt2","aspect":"1:1","numImages":2}' | motif

# Run fal utility tools from stdin JSON
echo '{"command":"tool","tool":"sam3-image","input":"https://example.com/input.png","prompt":"person","dryRun":true}' | motif --format json

# Inspect the live command schema
motif --describe
motif --describe generate --format json
motif --describe tool --format json
```

When stdout is not a TTY, Motif defaults to structured JSON. Human-readable terminal output is used for interactive sessions.

## Series

Series help keep a consistent style, character, location, or visual system across related images. Series data lives under `~/.motif/series`.

```bash
# Create a series with a style prompt and optional starting reference
motif series create "Luna Book Covers" --from cover-style.png --style "moody watercolor fantasy cover"

# Add tagged references
motif series ref-add luna-book-covers character.png --tag character --description "Luna, red coat"
motif series ref-add luna-book-covers forest.png --tag location

# Generate using all refs, or selected tags
motif series gen luna-book-covers "Luna entering the old forest" --refs character,location

# Inspect and manage
motif series list
motif series show luna-book-covers
motif series history luna-book-covers
motif series delete luna-book-covers
```

Series commands also support `--format json`, `--format ndjson`, `--fields`, and stdin JSON.

## Options Reference

```text
motif [prompt] [options]

Global:
  --format <json|human|ndjson>  Output format, auto-detected by default
  --fields <fields>             Comma-separated output field mask
  --dry-run                     Validate inputs and estimate cost without API calls
  --describe [command]          Emit command schema as JSON
  --no-open                     Do not open generated media after saving

Generation:
  -m, --model <model>           Generation model ID
  -e, --edit <files...>         Reference image paths for editing
  --loose                       Lower input fidelity for GPT reference edits
  -a, --aspect <ratio>          Aspect ratio
  -r, --resolution <res>        Resolution: 1K, 2K, 4K
  -o, --output <file>           Output path within the current working directory
  -n, --num <count>             Number of images, 1-4
  --transparent                 Transparent PNG for GPT models
  --seed <n>                    Reproducible generation seed
  --output-format <format>      jpeg, png, or webp

Model-specific:
  --negative <text>             Negative prompt, ideogram
  --style <style>               Recraft style or ideogram AUTO/GENERAL/REALISTIC/DESIGN
  --safety <level>              Safety tolerance 1-6, supported by selected Gemini/FLUX models
  --web-search                  Web search context, banana2/banana/gemini3
  --guidance-scale <n>          CFG guidance, supported by FLUX controllable models
  --steps <n>                   Inference steps, supported by FLUX controllable models
  --raw                         Less processed output, flux
  --enhance-prompt              Prompt enhancement, flux
  --rendering-speed <speed>     TURBO, BALANCED, or QUALITY, ideogram
  --expand-prompt               Enable MagicPrompt, ideogram
  --no-expand-prompt            Disable MagicPrompt, ideogram

History and post-processing:
  --last                        Show last generation
  --history                     Show generation history
  --limit <n>                   History page size
  --offset <n>                  History offset
  --vary                        Generate variations of the last image
  --up                          Upscale an image path or the last image
  --scale <factor>              Upscale factor: 2, 4, 6, 8
  --rmbg                        Remove background from the last image
  tool list                     List fal utility tools
  tool describe <tool>          Describe one fal utility tool
  tool <tool> <input>           Run a fal utility tool with normalized flags

Video:
  --video                       Generate video from an image path or the last image
  --video-duration <seconds>    Duration, 3-15 seconds
  --video-no-audio              Disable generated audio
  --video-negative <text>       Negative prompt for video
  --video-cfg-scale <n>         Video CFG scale, 0-1
```

## Configuration

Motif reads configuration in this order:

1. Built-in defaults.
2. Global config at `~/.motif/config.json`.
3. Project config at `.motifrc`.
4. `FAL_KEY` from the environment for the API key, which takes precedence over
   any `apiKey` saved in config.

Environment values are parsed through `@howells/envy`; an empty `FAL_KEY` is
treated as missing so dry runs and config fallback keep working.

Example:

```json
{
  "apiKey": "your-api-key",
  "defaultModel": "banana",
  "defaultAspect": "1:1",
  "defaultResolution": "2K",
  "openAfterGenerate": true,
  "upscaler": "clarity",
  "backgroundRemover": "rmbg"
}
```

Generated history is stored in `~/.motif/history.json` and keeps the last 100 generations.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## License

MIT
