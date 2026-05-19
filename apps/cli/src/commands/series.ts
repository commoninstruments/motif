/**
 * Series commands — consistent styling across related images.
 *
 * motif series create "My Series" --from cover.png --style "watercolor..."
 * motif series ref add "my-series" character.png --tag character
 * motif series gen "my-series" "Luna walks through the forest" --refs character
 * motif series list
 * motif series show "my-series"
 * motif series history "my-series"
 */

import { resolve } from "node:path";
import {
  ASPECT_RATIOS,
  estimateCost,
  GENERATION_MODELS,
  MODELS,
  RESOLUTIONS,
} from "@howells/motif-sdk";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { generate } from "../api/fal";
import {
  addGenerations,
  type Generation,
  generateId,
  getApiKey,
  loadConfig,
} from "../utils/config";
import { handleError } from "../utils/errors";
import {
  downloadImage,
  getFileSize,
  getImageDimensions,
  openImage,
} from "../utils/image";
import {
  parseIntegerOption,
  readStdinJson,
  sanitizePrompt,
  validateEnumOption,
  validateOutputPath,
  validateResourceId,
} from "../utils/input";
import {
  type EmitOptions,
  emit,
  emitError,
  emitStream,
  isStructured,
  resolveFormat,
} from "../utils/output";
import {
  addRef,
  buildSeriesPrompt,
  createSeries,
  deleteSeries,
  listSeries,
  loadSeries,
  recordOutput,
  removeRef,
  resolveRefs,
  type SeriesConfig,
  seriesOutputsDir,
  slugify,
} from "../utils/series";

// -- Helpers --

function seriesAsJson(config: SeriesConfig): Record<string, unknown> {
  return {
    id: config.id,
    name: config.name,
    slug: config.slug,
    model: config.model,
    modelName: MODELS[config.model]?.name ?? config.model,
    stylePrompt: config.stylePrompt,
    defaultAspect: config.defaultAspect,
    defaultResolution: config.defaultResolution,
    refCount: config.refs.length,
    outputCount: config.outputs.length,
    refs: config.refs,
    created: config.created,
    updated: config.updated,
  };
}

function validateSeriesOption<T>(emitOpts: EmitOptions, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    handleError(err, "INVALID_OPTION", emitOpts.format);
  }
}

// -- Commands --

async function cmdCreate(
  name: string,
  opts: {
    from?: string;
    style?: string;
    model?: string;
    aspect?: string;
    resolution?: string;
  },
  emitOpts: EmitOptions,
): Promise<void> {
  try {
    if (opts.model) {
      validateResourceId(opts.model, "model");
    }
    const model = opts.model
      ? validateSeriesOption(emitOpts, () =>
          validateEnumOption(opts.model ?? "", GENERATION_MODELS, "model"),
        )
      : undefined;
    const defaultAspect = opts.aspect
      ? validateSeriesOption(emitOpts, () =>
          validateEnumOption(opts.aspect ?? "", ASPECT_RATIOS, "aspect"),
        )
      : undefined;
    const defaultResolution = opts.resolution
      ? validateSeriesOption(emitOpts, () =>
          validateEnumOption(opts.resolution ?? "", RESOLUTIONS, "resolution"),
        )
      : undefined;

    const config = await createSeries({
      name,
      stylePrompt: opts.style,
      model,
      defaultAspect,
      defaultResolution,
      fromImage: opts.from ? resolve(opts.from) : undefined,
    });

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-create", ...seriesAsJson(config) }, emitOpts);
    } else {
      console.log(chalk.green(`✓ Created series: ${config.name}`));
      console.log(`  Slug:  ${chalk.cyan(config.slug)}`);
      console.log(
        `  Model: ${chalk.dim(MODELS[config.model]?.name ?? config.model)}`,
      );
      if (config.stylePrompt) {
        console.log(
          `  Style: ${chalk.dim(config.stylePrompt.slice(0, 80))}...`,
        );
      }
      if (config.refs.length > 0) {
        console.log(
          `  Refs:  ${config.refs.map((r) => `${r.tag}:${r.filename}`).join(", ")}`,
        );
      }
    }
  } catch (err) {
    handleError(err, "SERIES_CREATE_FAILED", emitOpts.format);
  }
}

async function cmdList(emitOpts: EmitOptions): Promise<void> {
  const series = await listSeries();

  if (emitOpts.format === "ndjson") {
    emitStream(series.map(seriesAsJson), emitOpts);
    return;
  }

  if (isStructured(emitOpts.format)) {
    emit(
      {
        command: "series-list",
        series: series.map(seriesAsJson),
        total: series.length,
      },
      emitOpts,
    );
    return;
  }

  if (series.length === 0) {
    console.log(
      chalk.yellow(
        'No series found. Create one with: motif series create "My Series"',
      ),
    );
    return;
  }

  console.log(chalk.bold(`\nSeries (${series.length}):\n`));
  for (const s of series) {
    console.log(`  ${chalk.cyan(s.slug)} — ${s.name}`);
    console.log(
      `    ${chalk.dim(`${MODELS[s.model]?.name ?? s.model} | ${s.refs.length} refs | ${s.outputs.length} outputs | ${new Date(s.updated).toLocaleDateString()}`)}`,
    );
  }
}

async function cmdShow(slug: string, emitOpts: EmitOptions): Promise<void> {
  try {
    const config = await loadSeries(slug);

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-show",
          ...seriesAsJson(config),
          outputs: config.outputs,
        },
        emitOpts,
      );
      return;
    }

    console.log(chalk.bold(`\n${config.name}`));
    console.log(`  ID:     ${chalk.dim(config.id)}`);
    console.log(`  Slug:   ${chalk.cyan(config.slug)}`);
    console.log(
      `  Model:  ${chalk.green(MODELS[config.model]?.name ?? config.model)}`,
    );
    console.log(
      `  Aspect: ${config.defaultAspect} | Resolution: ${config.defaultResolution}`,
    );
    if (config.stylePrompt) {
      console.log(`  Style:  ${chalk.dim(config.stylePrompt)}`);
    }

    if (config.refs.length > 0) {
      console.log(chalk.bold("\n  References:"));
      for (const ref of config.refs) {
        console.log(`    ${chalk.yellow(ref.tag)} → ${ref.filename}`);
        if (ref.description) {
          console.log(`      ${chalk.dim(ref.description)}`);
        }
      }
    }

    if (config.outputs.length > 0) {
      console.log(chalk.bold(`\n  Outputs (${config.outputs.length}):`));
      for (const out of config.outputs.slice(-5)) {
        console.log(
          `    ${chalk.dim(out.filename)} — ${out.prompt.slice(0, 50)}... ($${out.cost.toFixed(3)})`,
        );
      }
      if (config.outputs.length > 5) {
        console.log(chalk.dim(`    ... and ${config.outputs.length - 5} more`));
      }
    }
  } catch (err) {
    handleError(err, "SERIES_NOT_FOUND", emitOpts.format);
  }
}

async function cmdRefAdd(
  slug: string,
  imagePath: string,
  opts: { tag: string; description?: string },
  emitOpts: EmitOptions,
): Promise<void> {
  try {
    const ref = await addRef(
      slug,
      resolve(imagePath),
      opts.tag,
      opts.description ?? "",
    );

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-ref-add", series: slug, ref }, emitOpts);
    } else {
      console.log(
        chalk.green(
          `✓ Added reference: ${chalk.yellow(ref.tag)} → ${ref.filename}`,
        ),
      );
    }
  } catch (err) {
    handleError(err, "SERIES_REF_ADD_FAILED", emitOpts.format);
  }
}

async function cmdRefRemove(
  slug: string,
  filename: string,
  emitOpts: EmitOptions,
): Promise<void> {
  try {
    await removeRef(slug, filename);

    if (isStructured(emitOpts.format)) {
      emit(
        { command: "series-ref-remove", series: slug, removed: filename },
        emitOpts,
      );
    } else {
      console.log(chalk.green(`✓ Removed reference: ${filename}`));
    }
  } catch (err) {
    handleError(err, "SERIES_REF_REMOVE_FAILED", emitOpts.format);
  }
}

async function cmdGenerate(
  slug: string,
  prompt: string,
  opts: {
    refs?: string;
    aspect?: string;
    resolution?: string;
    model?: string;
    output?: string;
    num?: string;
    noOpen?: boolean;
    dryRun?: boolean;
  },
  emitOpts: EmitOptions,
): Promise<void> {
  try {
    const config = await loadSeries(slug);
    const appConfig = await loadConfig();

    // Validate API key
    getApiKey(appConfig);

    const sanitized = sanitizePrompt(prompt);
    if (!sanitized) {
      emitError(
        { code: "EMPTY_PROMPT", message: "Prompt is empty after sanitization" },
        emitOpts.format,
      );
      process.exit(1);
    }

    // Build the full prompt with style prefix
    const fullPrompt = buildSeriesPrompt(config, sanitized);

    // Resolve which reference images to include
    const refTags = opts.refs?.split(",").map((t) => t.trim());
    const refPaths = resolveRefs(config, refTags);

    if (opts.model) {
      validateResourceId(opts.model, "model");
    }
    const modelId = opts.model ?? config.model;
    const aspect = opts.aspect
      ? validateSeriesOption(emitOpts, () =>
          validateEnumOption(opts.aspect ?? "", ASPECT_RATIOS, "aspect"),
        )
      : config.defaultAspect;
    const resolution = opts.resolution
      ? validateSeriesOption(emitOpts, () =>
          validateEnumOption(opts.resolution ?? "", RESOLUTIONS, "resolution"),
        )
      : config.defaultResolution;
    const numImages = validateSeriesOption(emitOpts, () =>
      parseIntegerOption(opts.num ?? "1", "num images", { min: 1, max: 4 }),
    );

    const modelConfig = MODELS[modelId];
    if (!modelConfig) {
      emitError(
        {
          code: "UNKNOWN_MODEL",
          message: `Unknown model: ${modelId}`,
          details: { available: GENERATION_MODELS },
        },
        emitOpts.format,
      );
      process.exit(1);
    }

    // Check ref count against model limits
    const maxRefs = modelConfig.maxReferenceImages ?? 0;
    if (refPaths.length > maxRefs) {
      emitError(
        {
          code: "TOO_MANY_REFERENCES",
          message: `${modelConfig.name} supports ${maxRefs} references, series has ${refPaths.length}. Use --refs to select specific tags.`,
        },
        emitOpts.format,
      );
      process.exit(1);
    }

    const cost = estimateCost(modelId, resolution, numImages);

    // -- Dry run --
    if (opts.dryRun) {
      const dryResult = {
        dryRun: true,
        command: "series-generate",
        series: slug,
        prompt: fullPrompt,
        scenePrompt: sanitized,
        stylePrompt: config.stylePrompt,
        model: modelId,
        modelName: modelConfig.name,
        aspect,
        resolution,
        numImages,
        refs: refPaths,
        refTags: refTags ?? config.refs.map((r) => r.tag),
        estimatedCost: cost,
        valid: true,
      };
      emit(dryResult, emitOpts);
      if (!isStructured(emitOpts.format)) {
        console.log(chalk.bold(`\n🔍 Dry run — series: ${config.name}\n`));
        console.log(`  Style:   ${chalk.dim(config.stylePrompt || "(none)")}`);
        console.log(`  Scene:   ${chalk.dim(sanitized.slice(0, 80))}`);
        console.log(`  Full:    ${chalk.dim(fullPrompt.slice(0, 100))}...`);
        console.log(`  Model:   ${chalk.green(modelConfig.name)}`);
        console.log(`  Refs:    ${refPaths.length} images`);
        console.log(`  Cost:    ${chalk.yellow(`~$${cost.toFixed(3)}`)}`);
      }
      return;
    }

    // -- Generate --
    const outputDir = seriesOutputsDir(slug);
    const outputNum = String(config.outputs.length + 1).padStart(3, "0");
    const outputFilename = opts.output
      ? opts.output
      : `${outputNum}-${slugify(sanitized.slice(0, 40))}.png`;
    const outputPath = opts.output
      ? validateOutputPath(opts.output)
      : `${outputDir}/${outputFilename}`;

    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold(`\nSeries: ${config.name}`));
      console.log(
        `Model: ${chalk.green(modelConfig.name)} | Refs: ${refPaths.length}`,
      );
      console.log(`Prompt: ${chalk.dim(fullPrompt.slice(0, 100))}...`);
      console.log(`Cost: ${chalk.yellow(`~$${cost.toFixed(3)}`)}`);
    }

    const spinner = isStructured(emitOpts.format)
      ? null
      : ora("Generating...").start();

    const result = await generate({
      prompt: fullPrompt,
      model: modelId,
      aspect,
      resolution,
      numImages,
      editImages: refPaths.length > 0 ? refPaths : undefined,
    });

    spinner?.succeed("Generated!");

    // Build paths and download all images in parallel
    const paths = result.images.map((_, i) =>
      numImages > 1 ? outputPath.replace(".png", `-${i + 1}.png`) : outputPath,
    );
    await Promise.all(
      result.images.map((image, i) =>
        // biome-ignore lint/style/noNonNullAssertion: index guaranteed within map bounds
        downloadImage(image.url, paths[i]!),
      ),
    );

    // Collect metadata and build history records
    const savedImages: Array<{
      path: string;
      width?: number;
      height?: number;
      size: string;
    }> = [];
    const generations: Generation[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < result.images.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: index guaranteed within loop bounds
      const path = paths[i]!;
      const dims = await getImageDimensions(path);
      const size = getFileSize(path);

      savedImages.push({
        path: resolve(path),
        width: dims?.width,
        height: dims?.height,
        size,
      });

      if (!isStructured(emitOpts.format)) {
        console.log(
          chalk.green(`✓ Saved: ${path}`) +
            chalk.dim(
              ` (${dims ? `${dims.width}x${dims.height}` : "?"}, ${size})`,
            ),
        );
      }

      generations.push({
        id: generateId(),
        prompt: fullPrompt,
        model: modelId,
        aspect,
        resolution,
        output: resolve(path),
        cost: estimateCost(modelId, resolution, 1),
        timestamp: now,
      });
    }

    // Batch write to global history
    await addGenerations(generations);

    // Record in series history
    await recordOutput(slug, {
      filename: outputFilename,
      prompt: fullPrompt,
      refsUsed: refTags ?? config.refs.map((r) => r.tag),
      model: modelId,
      aspect,
      resolution,
      cost,
      timestamp: new Date().toISOString(),
    });

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-generate",
          series: slug,
          prompt: fullPrompt,
          scenePrompt: sanitized,
          model: modelId,
          modelName: modelConfig.name,
          aspect,
          resolution,
          images: savedImages,
          cost,
          outputIndex: config.outputs.length + 1,
        },
        emitOpts,
      );
    }

    if (appConfig.openAfterGenerate && !opts.noOpen && savedImages[0]) {
      openImage(savedImages[0].path);
    }
  } catch (err) {
    handleError(err, "SERIES_GENERATE_FAILED", emitOpts.format);
  }
}

async function cmdDelete(slug: string, emitOpts: EmitOptions): Promise<void> {
  try {
    const config = await loadSeries(slug);
    await deleteSeries(slug);

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-delete", slug, name: config.name }, emitOpts);
    } else {
      console.log(chalk.green(`✓ Deleted series: ${config.name}`));
    }
  } catch (err) {
    handleError(err, "SERIES_DELETE_FAILED", emitOpts.format);
  }
}

async function cmdHistory(
  slug: string,
  opts: { limit?: string; offset?: string },
  emitOpts: EmitOptions,
): Promise<void> {
  try {
    const config = await loadSeries(slug);
    const all = [...config.outputs].reverse();
    const limit = validateSeriesOption(emitOpts, () =>
      parseIntegerOption(opts.limit ?? "10", "limit", { min: 1 }),
    );
    const offset = validateSeriesOption(emitOpts, () =>
      parseIntegerOption(opts.offset ?? "0", "offset", { min: 0 }),
    );
    const page = all.slice(offset, offset + limit);

    if (emitOpts.format === "ndjson") {
      emitStream(page as unknown as Record<string, unknown>[], emitOpts);
      return;
    }

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-history",
          series: slug,
          outputs: page,
          total: all.length,
          offset,
          limit,
          hasMore: offset + limit < all.length,
        },
        emitOpts,
      );
      return;
    }

    if (page.length === 0) {
      console.log(chalk.yellow("No outputs yet in this series."));
      return;
    }

    console.log(
      chalk.bold(
        `\n${config.name} — Outputs (${offset + 1}-${offset + page.length} of ${all.length}):\n`,
      ),
    );
    for (const out of page) {
      console.log(`  ${chalk.dim(out.filename)}`);
      console.log(
        `    ${chalk.cyan(out.prompt.slice(0, 70))}${out.prompt.length > 70 ? "..." : ""}`,
      );
      console.log(
        `    ${chalk.dim(`$${out.cost.toFixed(3)} | ${out.model} | refs: ${out.refsUsed.join(",")}`)}`,
      );
    }
  } catch (err) {
    handleError(err, "SERIES_NOT_FOUND", emitOpts.format);
  }
}

// -- Stdin JSON handler --

interface SeriesStdinPayload {
  aspect?: string;
  command:
    | "series-create"
    | "series-list"
    | "series-show"
    | "series-delete"
    | "series-ref-add"
    | "series-ref-remove"
    | "series-generate"
    | "series-history";
  description?: string;
  dryRun?: boolean;
  filename?: string;
  from?: string;
  // Ref
  image?: string;
  // History
  limit?: number;
  model?: string;
  // Create
  name?: string;
  noOpen?: boolean;
  numImages?: number;
  offset?: number;
  output?: string;
  // Generate
  prompt?: string;
  refs?: string;
  resolution?: string;
  // Common
  series?: string;
  stylePrompt?: string;
  tag?: string;
}

// -- Router --

export async function runSeries(args: string[]): Promise<void> {
  const format = resolveFormat(
    args.find((a) => a.startsWith("--format="))?.split("=")?.[1] ??
      (args.includes("--format")
        ? args[args.indexOf("--format") + 1]
        : undefined),
  );
  const fields =
    args.find((a) => a.startsWith("--fields="))?.split("=")?.[1] ??
    (args.includes("--fields")
      ? args[args.indexOf("--fields") + 1]
      : undefined);

  const emitOpts: EmitOptions = { format, fields, sanitize: true };

  // Strip global flags before passing to Commander
  const filteredArgs = args.filter((a, i) => {
    if (a === "--format" || a === "--fields") {
      return false;
    }
    if (i > 0 && (args[i - 1] === "--format" || args[i - 1] === "--fields")) {
      return false;
    }
    if (a.startsWith("--format=") || a.startsWith("--fields=")) {
      return false;
    }
    return true;
  });

  // Check for stdin JSON
  const stdinData = await readStdinJson<SeriesStdinPayload>();
  if (stdinData?.command) {
    await handleStdinCommand(stdinData, emitOpts);
    return;
  }

  const program = new Command()
    .name("motif series")
    .description("Manage image series for consistent styling");

  program
    .command("create <name>")
    .description("Create a new series")
    .option("--from <image>", "Initial style reference image")
    .option("--style <prompt>", "Style prompt prefix for all generations")
    .option("-m, --model <model>", "Preferred model")
    .option("-a, --aspect <ratio>", "Default aspect ratio")
    .option("-r, --resolution <res>", "Default resolution")
    .action(async (name: string, opts) => {
      await cmdCreate(name, opts, emitOpts);
    });

  program
    .command("list")
    .description("List all series")
    .action(async () => {
      await cmdList(emitOpts);
    });

  program
    .command("show <slug>")
    .description("Show series details")
    .action(async (slug: string) => {
      await cmdShow(slug, emitOpts);
    });

  program
    .command("ref-add <slug> <image>")
    .description("Add a reference image to a series")
    .option(
      "-t, --tag <tag>",
      "Tag for the reference (e.g. character, location)",
      "style",
    )
    .option("-d, --description <desc>", "Description of the reference")
    .action(async (slug: string, image: string, opts) => {
      await cmdRefAdd(slug, image, opts, emitOpts);
    });

  program
    .command("ref-remove <slug> <filename>")
    .description("Remove a reference image from a series")
    .action(async (slug: string, filename: string) => {
      await cmdRefRemove(slug, filename, emitOpts);
    });

  program
    .command("gen <slug> <prompt>")
    .description("Generate an image in a series with consistent styling")
    .option(
      "--refs <tags>",
      "Comma-separated ref tags to include (default: all)",
    )
    .option("-a, --aspect <ratio>", "Aspect ratio (overrides series default)")
    .option("-r, --resolution <res>", "Resolution (overrides series default)")
    .option("-m, --model <model>", "Model (overrides series default)")
    .option("-o, --output <file>", "Output filename")
    .option("-n, --num <count>", "Number of images 1-4")
    .option("--no-open", "Don't open after generation")
    .option("--dry-run", "Validate without API call")
    .action(async (slug: string, prompt: string, opts) => {
      await cmdGenerate(slug, prompt, opts, emitOpts);
    });

  program
    .command("history <slug>")
    .description("Show generation history for a series")
    .option("--limit <n>", "Entries per page", "10")
    .option("--offset <n>", "Skip first N entries", "0")
    .action(async (slug: string, opts) => {
      await cmdHistory(slug, opts, emitOpts);
    });

  program
    .command("delete <slug>")
    .description("Delete a series and all its data")
    .action(async (slug: string) => {
      await cmdDelete(slug, emitOpts);
    });

  await program.parseAsync(["node", "motif-series", ...filteredArgs]);
}

async function handleStdinCommand(
  data: SeriesStdinPayload,
  emitOpts: EmitOptions,
): Promise<void> {
  switch (data.command) {
    case "series-create":
      if (!data.name) {
        throw new Error("name is required");
      }
      await cmdCreate(
        data.name,
        {
          from: data.from,
          style: data.stylePrompt,
          model: data.model,
          aspect: data.aspect,
          resolution: data.resolution,
        },
        emitOpts,
      );
      break;
    case "series-list":
      await cmdList(emitOpts);
      break;
    case "series-show":
      if (!data.series) {
        throw new Error("series slug is required");
      }
      await cmdShow(data.series, emitOpts);
      break;
    case "series-delete":
      if (!data.series) {
        throw new Error("series slug is required");
      }
      await cmdDelete(data.series, emitOpts);
      break;
    case "series-ref-add":
      if (!(data.series && data.image && data.tag)) {
        throw new Error("series, image, and tag are required");
      }
      await cmdRefAdd(
        data.series,
        data.image,
        { tag: data.tag, description: data.description },
        emitOpts,
      );
      break;
    case "series-ref-remove":
      if (!(data.series && data.filename)) {
        throw new Error("series and filename are required");
      }
      await cmdRefRemove(data.series, data.filename, emitOpts);
      break;
    case "series-generate":
      if (!(data.series && data.prompt)) {
        throw new Error("series and prompt are required");
      }
      await cmdGenerate(
        data.series,
        data.prompt,
        {
          refs: data.refs,
          model: data.model,
          aspect: data.aspect,
          resolution: data.resolution,
          output: data.output,
          num: data.numImages ? String(data.numImages) : undefined,
          noOpen: data.noOpen,
          dryRun: data.dryRun,
        },
        emitOpts,
      );
      break;
    case "series-history":
      if (!data.series) {
        throw new Error("series slug is required");
      }
      await cmdHistory(
        data.series,
        {
          limit: data.limit ? String(data.limit) : undefined,
          offset: data.offset ? String(data.offset) : undefined,
        },
        emitOpts,
      );
      break;
    default:
      throw new Error(`Unknown series command: ${data.command}`);
  }
}
