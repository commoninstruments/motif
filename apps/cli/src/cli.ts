/**
 * motif CLI — agent-first image generation.
 *
 * Security posture: the agent is not a trusted operator.
 * All inputs are validated. Output paths are sandboxed to CWD.
 * Use --dry-run before mutating commands.
 */

import {
  ASPECT_RATIOS,
  GENERATION_MODELS,
  MODELS,
  RESOLUTIONS,
  sanitizePrompt,
} from "@howells/motif-sdk";
import chalk from "chalk";
import { Command } from "commander";

import { runDescribe } from "./commands/describe";
import { generateImage } from "./commands/generate";
import { runHistory } from "./commands/history";
import {
  generateVariations,
  removeBackgroundLast,
  upscaleLast,
} from "./commands/postprocess";
import { runToolPayload } from "./commands/tools";
import { generateVideo } from "./commands/video";
import type { CliOptions, StdinPayload } from "./utils/cli-types";
import { getApiKey, getLastGeneration, loadConfig } from "./utils/config";
import { exitForErrorCode, handleError } from "./utils/errors";
import { readStdinJson } from "./utils/input";
import { emit, emitError, isStructured, resolveFormat } from "./utils/output";
import type { EmitOptions } from "./utils/output";
import { PACKAGE_VERSION } from "./version";

// -- Commands --

async function showLastGeneration(emitOpts: EmitOptions): Promise<void> {
  const last = await getLastGeneration();
  if (!last) {
    if (isStructured(emitOpts.format)) {
      emit({ command: "last", result: null }, emitOpts);
    } else {
      console.log(chalk.yellow("No previous generations found"));
    }
    return;
  }

  if (isStructured(emitOpts.format)) {
    emit(
      {
        command: "last",
        ...last,
        modelName: MODELS[last.model]?.name ?? last.model,
      },
      emitOpts
    );
    return;
  }

  console.log(chalk.bold("\nLast Generation:"));
  console.log(
    `  Prompt: ${chalk.cyan(last.prompt.slice(0, 60))}${last.prompt.length > 60 ? "..." : ""}`
  );
  console.log(
    `  Model:  ${chalk.green(MODELS[last.model]?.name || last.model)}`
  );
  console.log(`  Aspect: ${last.aspect} | Resolution: ${last.resolution}`);
  console.log(`  Output: ${chalk.dim(last.output)}`);
  console.log(`  Cost:   ${chalk.yellow(`$${last.cost.toFixed(3)}`)}`);
  console.log(`  Time:   ${new Date(last.timestamp).toLocaleString()}`);
}

// -- Main entry --

export async function runCli(
  args: string[],
  preloadedConfig?: Awaited<ReturnType<typeof loadConfig>>
): Promise<void> {
  const config = preloadedConfig ?? (await loadConfig());

  const program = new Command()
    .name("motif")
    .description("fal.ai image generation CLI — agent-first design")
    .version(PACKAGE_VERSION)
    .argument("[prompt]", "Image generation prompt")
    .addHelpText(
      "after",
      "\nCommands:\n  motif studio               Launch interactive terminal Studio"
    )
    // Agent-first global flags
    .option(
      "--format <format>",
      "Output format: json, human, ndjson (default: auto-detect from TTY)"
    )
    .option(
      "--fields <fields>",
      "Comma-separated fields to include in output (e.g. --fields id,cost,path)"
    )
    .option("--dry-run", "Validate inputs without making API calls")
    .option(
      "--ephemeral",
      "Save output locally, then delete fal request IO payloads when possible"
    )
    // Model & generation
    .option(
      "-m, --model <model>",
      `Model to use (${GENERATION_MODELS.join(", ")})`
    )
    .option("-e, --edit <files...>", "Reference image(s) for editing")
    .option("--loose", "Use reference as loose inspiration (GPT only)")
    .option(
      "-a, --aspect <ratio>",
      `Aspect ratio (${ASPECT_RATIOS.join(", ")})`
    )
    .option("-r, --resolution <res>", `Resolution (${RESOLUTIONS.join(", ")})`)
    .option("-o, --output <file>", "Output filename")
    .option("-n, --num <count>", "Number of images 1-4")
    // Format presets
    .option("--cover", "Kindle/eBook cover: 2:3, 2K (1600×2400)")
    .option("--square", "Square: 1:1")
    .option("--landscape", "Landscape: 16:9")
    .option("--portrait", "Portrait: 2:3")
    // Social media presets
    .option("--story", "Instagram/TikTok Story: 9:16 (1080×1920)")
    .option("--reel", "Instagram Reel: 9:16 (1080×1920)")
    .option("--feed", "Instagram Feed portrait: 4:5 (1080×1350)")
    .option("--og", "Open Graph / social share: 16:9 (1200×630)")
    // Device presets
    .option("--wallpaper", "iPhone wallpaper: 9:16")
    // Cinematic presets
    .option("--wide", "Cinematic wide: 21:9")
    .option("--ultra", "Ultra-wide banner: 21:9, 2K")
    // Output options
    .option("--transparent", "Transparent background (PNG, GPT model only)")
    .option(
      "--background <mode>",
      "GPT background mode: auto, transparent, opaque"
    )
    .option("--quality <quality>", "Image quality: auto, low, medium, high")
    .option(
      "--image-size <size>",
      "Direct fal image_size override, e.g. auto, square_hd, 1536x1024"
    )
    .option("--sync-mode", "Ask fal to return media as data URI")
    .option("--mask <url>", "Mask image URL for supported edit models")
    .option("--last", "Show last generation info")
    .option("--vary", "Generate variations of last image")
    .option("--up", "Upscale image (provide path, or uses last)")
    .option("--rmbg", "Remove background from last image")
    .option("--scale <factor>", "Upscale factor (for --up)")
    .option("--no-open", "Don't open image after generation")
    // Video
    .option("--video", "Generate video from image (provide path)")
    .option("--video-duration <seconds>", "Video duration 3-15 (default 5)")
    .option("--video-no-audio", "Disable audio generation (cheaper)")
    // Advanced generation
    .option("--seed <n>", "Reproducible generation seed")
    .option(
      "--negative <text>",
      "Negative prompt — what NOT to include (ideogram)"
    )
    .option(
      "--style <style>",
      "Style preset: recraft 70+ styles (realistic_image, digital_illustration/pixel_art, etc.) or ideogram AUTO|GENERAL|REALISTIC|DESIGN"
    )
    .option("--output-format <format>", "Output format: jpeg, png, webp")
    .option(
      "--safety <level>",
      "Safety tolerance 1–6 (1=strictest) — selected Gemini/FLUX models"
    )
    .option(
      "--web-search",
      "Enable web search for generative context (banana2, banana, gemini3)"
    )
    .option(
      "--google-search",
      "Enable fal enable_google_search alias where supported"
    )
    .option(
      "--limit-generations",
      "Limit model-internal generation rounds where supported"
    )
    .option(
      "--disable-limit-generations",
      "Disable model-internal generation limiting where supported"
    )
    .option(
      "--thinking <level>",
      "Thinking level where supported: minimal, high"
    )
    .option("--safety-checker", "Enable fal safety checker where supported")
    .option(
      "--disable-safety-checker",
      "Disable fal safety checker where supported"
    )
    .option(
      "--image-prompt-strength <n>",
      "Reference image strength where supported, 0–1"
    )
    .option(
      "--guidance-scale <n>",
      "CFG guidance scale (controllable FLUX models, 1–20)"
    )
    .option(
      "--steps <n>",
      "Inference step count (controllable FLUX models, 1–12)"
    )
    .option("--raw", "Generate less processed, more natural output (flux only)")
    .option(
      "--enhance-prompt",
      "Auto-enhance the prompt before generation (flux only)"
    )
    .option(
      "--rendering-speed <speed>",
      "Speed/quality trade-off: TURBO, BALANCED, QUALITY (ideogram)"
    )
    .option("--expand-prompt", "Enable MagicPrompt prompt expansion (ideogram)")
    .option(
      "--no-expand-prompt",
      "Disable MagicPrompt prompt expansion (ideogram)"
    )
    // Creative direction
    .option("--recipe <id>", "Creative recipe id, e.g. cinematic")
    .option("--shot <id>", "Shot/framing id, e.g. close-up")
    .option("--lighting <id>", "Lighting id, e.g. rim")
    .option("--genre <id>", "Genre id")
    .option("--camera <id>", "Camera/lens language id")
    .option("--color <id>", "Color treatment id")
    .option("--material <id>", "Material or texture id")
    .option("--motion <id>", "Motion treatment id")
    // Video advanced
    .option("--video-negative <text>", "Negative prompt for video generation")
    .option(
      "--video-cfg-scale <n>",
      "CFG guidance scale for video (0–1, kling)"
    )
    // Introspection & history
    .option("--describe [command]", "Show CLI schema as JSON (for agents)")
    .option("--history", "Show generation history")
    .option("--limit <n>", "History: number of entries (default 10)")
    .option("--offset <n>", "History: skip first N entries");

  program.parse(args);

  const options = program.opts<CliOptions>();
  const prompt = program.args[0];

  // Resolve output format (TTY detection + explicit flag)
  const format = resolveFormat(options.format);
  const emitOpts: EmitOptions = {
    fields: options.fields,
    format,
    sanitize: true, // Always sanitize API responses
  };

  // -- Read stdin JSON if piped --
  let stdinData: StdinPayload | null = null;
  try {
    stdinData = await readStdinJson<StdinPayload>();
  } catch (error) {
    handleError(error, "INVALID_STDIN", format);
  }

  // Stdin can specify a command
  const stdinCommand = stdinData?.command;
  if (stdinData?.dryRun) {
    options.dryRun = true;
  }

  // -- Describe (schema introspection) --
  if (options.describe !== undefined || stdinCommand === "describe") {
    const cmdName =
      typeof options.describe === "string" ? options.describe : undefined;
    try {
      runDescribe(cmdName, emitOpts);
    } catch (error) {
      handleError(error, "DESCRIBE_FAILED", format);
    }
    return;
  }

  // -- History --
  if (options.history || stdinCommand === "history") {
    await runHistory(
      {
        limit:
          stdinData?.limit ??
          (options.limit ? Number.parseInt(options.limit, 10) : undefined),
        offset:
          stdinData?.offset ??
          (options.offset ? Number.parseInt(options.offset, 10) : undefined),
      },
      emitOpts
    );
    return;
  }

  // -- Last --
  if (options.last || stdinCommand === "last") {
    await showLastGeneration(emitOpts);
    return;
  }

  // -- Fal utility tools --
  const isToolCommand =
    stdinCommand === "tool" ||
    stdinCommand === "tool-run" ||
    stdinCommand === "tool-list" ||
    stdinCommand === "tool-describe";
  if (stdinData && isToolCommand) {
    if (
      stdinData?.tool &&
      stdinCommand !== "tool-list" &&
      stdinCommand !== "tool-describe" &&
      !options.dryRun
    ) {
      try {
        getApiKey(config);
      } catch (error) {
        handleError(error, "MISSING_API_KEY", format);
      }
    }
    await runToolPayload(
      {
        command: stdinCommand,
        dryRun: options.dryRun,
        input: stdinData.input,
        inputs: stdinData.inputs,
        options: stdinData.options,
        output: stdinData.output,
        outputFormat: stdinData.outputFormat,
        prompt: stdinData.prompt,
        scale: stdinData.scale?.toString(),
        tool: stdinData.tool,
      },
      emitOpts
    );
    return;
  }

  // Validate API key for operations that need it
  const wouldCallFal =
    prompt ||
    stdinData?.prompt ||
    options.vary ||
    options.up ||
    options.rmbg ||
    options.video ||
    options.edit?.length ||
    stdinCommand === "generate" ||
    stdinCommand === "vary" ||
    stdinCommand === "upscale" ||
    stdinCommand === "rmbg" ||
    stdinCommand === "video";
  const requiresApiKey = wouldCallFal && !options.dryRun;

  if (requiresApiKey) {
    try {
      getApiKey(config);
    } catch (error) {
      handleError(error, "MISSING_API_KEY", format);
    }
  }

  // -- Video --
  if (options.video || stdinCommand === "video") {
    await generateVideo(prompt, options, stdinData, config, emitOpts);
    return;
  }

  // -- Vary --
  if (options.vary || stdinCommand === "vary") {
    await generateVariations(prompt, options, stdinData, config, emitOpts);
    return;
  }

  // -- Upscale --
  if (options.up || stdinCommand === "upscale") {
    await upscaleLast(prompt, options, stdinData, config, emitOpts);
    return;
  }

  // -- Remove background --
  if (options.rmbg || stdinCommand === "rmbg") {
    await removeBackgroundLast(options, stdinData, config, emitOpts);
    return;
  }

  // -- Generate --
  const resolvedPrompt = prompt || stdinData?.prompt;
  if (resolvedPrompt) {
    const sanitized = sanitizePrompt(resolvedPrompt);
    if (!sanitized) {
      emitError(
        { code: "EMPTY_PROMPT", message: "Prompt is empty after sanitization" },
        format
      );
      exitForErrorCode("EMPTY_PROMPT");
    }
    await generateImage(sanitized, options, stdinData, config, emitOpts);
    return;
  }

  // No prompt and no command = show help.
  program.help();
}

export function showHelp(): void {
  console.log(`
${chalk.bold("motif")} - fal.ai image generation CLI

${chalk.bold("Usage:")}
  motif                           Show help
  motif studio                    Launch interactive terminal Studio
  motif "prompt" [options]        Generate image from prompt
  motif --last                    Show last generation info
  motif --vary                    Generate variations of last image
  motif --up                      Upscale last image
  motif --rmbg                    Remove background from last image

${chalk.bold("Agent-First Flags:")}
  --format <json|human|ndjson>  Output format (auto-detects TTY)
  --fields <f1,f2,...>          Select output fields
  --dry-run                     Validate without API calls
  --ephemeral                   Save locally, then delete fal IO payloads
  --describe [command]          Show CLI schema as JSON
  --history                     Generation history with pagination
  --limit <n>                   History entries per page (default 10)
  --offset <n>                  History pagination offset

${chalk.bold("Stdin JSON:")}
  echo '{"prompt":"a cat","model":"gpt"}' | motif
  echo '{"command":"history","limit":5}' | motif

${chalk.bold("Options:")}
  -m, --model <model>      Model ID, e.g. banana2, gpt2, seedream4, flux2-pro
  -e, --edit <files...>    Reference image(s) for editing
  --loose                  Use reference as loose inspiration (GPT only)
  -a, --aspect <ratio>     Aspect ratio (see below)
  -r, --resolution <res>   Resolution: 1K, 2K, 4K
  -o, --output <file>      Output filename
  -n, --num <count>        Number of images (1-4)
  --transparent            Transparent background PNG (GPT only)
  --ephemeral              Save locally, skip history, delete fal IO payloads
  --no-open                Don't auto-open image after generation

${chalk.bold("Post-processing:")}
  --last                   Show last generation info
  --vary                   Generate variations of last image
  --up                     Upscale last image
  --rmbg                   Remove background from last image
  --scale <factor>         Upscale factor: 2, 4, 6, 8 (with --up)

${chalk.bold("Presets:")}
  ${chalk.dim("Format:")}
  --cover                  Kindle/eBook cover: 2:3, 2K
  --square                 Square: 1:1
  --landscape              Landscape: 16:9
  --portrait               Portrait: 2:3
  ${chalk.dim("Social Media:")}
  --story                  Instagram/TikTok Story: 9:16
  --reel                   Instagram Reel: 9:16
  --feed                   Instagram Feed: 4:5
  --og                     Open Graph / social share: 16:9
  ${chalk.dim("Devices:")}
  --wallpaper              iPhone wallpaper: 9:16, 2K
  ${chalk.dim("Cinematic:")}
  --wide                   Cinematic wide: 21:9
  --ultra                  Ultra-wide banner: 21:9, 2K

${chalk.bold("Aspect Ratios:")}
  21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16

${chalk.bold("Examples:")}
  motif "a cat on a windowsill" -m gpt
  motif "urban landscape" --landscape -r 4K
  motif "add rain" -e photo.png
  motif --vary -n 4
  motif --up --scale 4
  motif --describe generate           # Agent: introspect schema
  motif --dry-run "a cat" -m gpt      # Agent: validate without API call
  echo '{"prompt":"a cat"}' | motif   # Agent: raw JSON input
`);
}
