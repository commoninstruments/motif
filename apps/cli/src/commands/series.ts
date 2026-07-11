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

import { basename, resolve } from "node:path";
import {
  ASPECT_RATIOS,
  type CreativeDirection,
  enrichPrompt,
  estimateCost,
  GENERATION_MODELS,
  MODELS,
  RESOLUTIONS,
  sanitizePrompt,
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
import { resolveCreativeDirection } from "../utils/creative";
import { handleError } from "../utils/errors";
import {
  downloadImage,
  getFileSize,
  getImageDimensions,
  indexedOutputPath,
  openImage,
} from "../utils/image";
import {
  parseIntegerOption,
  readStdinJson,
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

const SERIES_RUN_MAX_COUNT = 24;
const SERIES_RUN_SCENE_FOCI = [
  "wide establishing composition",
  "hero subject composition",
  "close material and texture study",
  "human-scale environmental view",
  "low-angle perspective",
  "quiet atmospheric detail",
  "symmetrical frontal composition",
  "oblique side-light composition",
] as const;

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

function splitRefTags(refs: string | undefined): string[] | undefined {
  return refs
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function buildSeriesRunStylePrompt(
  theme: string,
  style?: string,
): string {
  const base = style?.trim();
  if (base) {
    return base;
  }
  return [
    `Cohesive visual series about ${theme}`,
    "consistent tone, style, color palette, lighting, lens language, framing discipline, material treatment, and post-processing across every image",
  ].join(": ");
}

export function buildSeriesRunScenes(theme: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const focus = SERIES_RUN_SCENE_FOCI[index % SERIES_RUN_SCENE_FOCI.length];
    return [
      `Image ${index + 1} of ${count} in a cohesive visual series about ${theme}`,
      focus,
      "shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set",
      "no text, no watermark",
    ].join("; ");
  });
}

export async function loadOrCreateRunSeries(options: {
  aspect: (typeof ASPECT_RATIOS)[number];
  model: string;
  resolution: (typeof RESOLUTIONS)[number];
  series?: string;
  stylePrompt: string;
  theme: string;
}): Promise<SeriesConfig> {
  if (options.series) {
    return loadSeries(options.series);
  }

  const name = options.theme;
  const slug = slugify(name);
  try {
    return await createSeries({
      name,
      stylePrompt: options.stylePrompt,
      model: options.model,
      defaultAspect: options.aspect,
      defaultResolution: options.resolution,
    });
  } catch (err) {
    if (String((err as Error).message).includes("already exists")) {
      return loadSeries(slug);
    }
    throw err;
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
    aspect?: string;
    camera?: string;
    color?: string;
    creative?: CreativeDirection;
    dryRun?: boolean;
    genre?: string;
    lighting?: string;
    material?: string;
    model?: string;
    motion?: string;
    noOpen?: boolean;
    num?: string;
    output?: string;
    recipe?: string;
    refs?: string;
    resolution?: string;
    shot?: string;
  },
  emitOpts: EmitOptions,
): Promise<void> {
  try {
    const config = await loadSeries(slug);
    const appConfig = await loadConfig();

    const sanitized = sanitizePrompt(prompt);
    if (!sanitized) {
      emitError(
        { code: "EMPTY_PROMPT", message: "Prompt is empty after sanitization" },
        emitOpts.format,
      );
      process.exit(1);
    }

    const creative = resolveCreativeDirection(opts, opts.creative);
    const creativeResult = creative
      ? validateSeriesOption(emitOpts, () =>
          enrichPrompt({ prompt: sanitized, creative }),
        )
      : undefined;
    const requestPrompt = creativeResult?.prompt ?? sanitized;

    // Build the full prompt with style prefix
    const fullPrompt = buildSeriesPrompt(config, requestPrompt);

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
        enrichedScenePrompt: requestPrompt,
        stylePrompt: config.stylePrompt,
        model: modelId,
        modelName: modelConfig.name,
        aspect,
        resolution,
        numImages,
        refs: refPaths,
        refTags: refTags ?? config.refs.map((r) => r.tag),
        estimatedCost: cost,
        ...(creativeResult && {
          creative: creativeResult.creative,
        }),
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

    // Validate API key only after dry-run exits.
    getApiKey(appConfig);

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
      numImages > 1 ? indexedOutputPath(outputPath, i) : outputPath,
    );
    const actualPaths = await Promise.all(
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
      const path = actualPaths[i]!;
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
      filename: basename(actualPaths[0] ?? outputFilename),
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
          enrichedScenePrompt: requestPrompt,
          model: modelId,
          modelName: modelConfig.name,
          aspect,
          resolution,
          images: savedImages,
          cost,
          ...(creativeResult && {
            creative: creativeResult.creative,
          }),
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

async function cmdRun(
  theme: string,
  opts: {
    aspect?: string;
    camera?: string;
    color?: string;
    count?: string;
    creative?: CreativeDirection;
    dryRun?: boolean;
    genre?: string;
    lighting?: string;
    material?: string;
    model?: string;
    motion?: string;
    noOpen?: boolean;
    recipe?: string;
    refs?: string;
    resolution?: string;
    series?: string;
    shot?: string;
    style?: string;
  },
  emitOpts: EmitOptions,
): Promise<void> {
  try {
    const sanitizedTheme = sanitizePrompt(theme);
    if (!sanitizedTheme) {
      emitError(
        { code: "EMPTY_PROMPT", message: "Theme is empty after sanitization" },
        emitOpts.format,
      );
      process.exit(1);
    }

    const existingSeries = opts.series ? await loadSeries(opts.series) : null;

    if (opts.model) {
      validateResourceId(opts.model, "model");
    }
    const modelId = opts.model ?? existingSeries?.model ?? "banana";
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

    const count = validateSeriesOption(emitOpts, () =>
      parseIntegerOption(opts.count ?? "4", "series run count", {
        min: 1,
        max: SERIES_RUN_MAX_COUNT,
      }),
    );
    const aspect = opts.aspect
      ? validateSeriesOption(emitOpts, () =>
          validateEnumOption(opts.aspect ?? "", ASPECT_RATIOS, "aspect"),
        )
      : (existingSeries?.defaultAspect ?? "1:1");
    const resolution = opts.resolution
      ? validateSeriesOption(emitOpts, () =>
          validateEnumOption(opts.resolution ?? "", RESOLUTIONS, "resolution"),
        )
      : (existingSeries?.defaultResolution ?? "2K");
    const stylePrompt =
      opts.style ??
      existingSeries?.stylePrompt ??
      buildSeriesRunStylePrompt(sanitizedTheme);
    const refTags = splitRefTags(opts.refs);
    const refPaths = existingSeries ? resolveRefs(existingSeries, refTags) : [];
    const maxRefs = modelConfig.maxReferenceImages ?? 0;

    if (refPaths.length > maxRefs) {
      emitError(
        {
          code: "TOO_MANY_REFERENCES",
          message: `${modelConfig.name} supports ${maxRefs} references, series run selected ${refPaths.length}. Use --refs to select fewer tags.`,
        },
        emitOpts.format,
      );
      process.exit(1);
    }

    const creative = resolveCreativeDirection(opts, opts.creative);
    const baseScenePrompts = buildSeriesRunScenes(sanitizedTheme, count);
    const enrichedScenes = baseScenePrompts.map((baseScenePrompt) =>
      creative
        ? validateSeriesOption(emitOpts, () =>
            enrichPrompt({ prompt: baseScenePrompt, creative }),
          )
        : undefined,
    );
    const scenePrompts = baseScenePrompts.map(
      (baseScenePrompt, index) =>
        enrichedScenes[index]?.prompt ?? baseScenePrompt,
    );
    const fullPrompts = scenePrompts.map((scenePrompt) =>
      stylePrompt ? `${stylePrompt}. ${scenePrompt}` : scenePrompt,
    );
    const estimatedCost = estimateCost(modelId, resolution, count);
    const canUseAnchorReference =
      Boolean(modelConfig.supportsEdit) && refPaths.length < maxRefs;

    if (opts.dryRun) {
      emit(
        {
          command: "series-run",
          count,
          dryRun: true,
          estimatedCost,
          model: modelId,
          modelName: modelConfig.name,
          aspect,
          resolution,
          series: existingSeries?.slug ?? null,
          stylePrompt,
          theme: sanitizedTheme,
          refTags: refTags ?? existingSeries?.refs.map((ref) => ref.tag) ?? [],
          refs: refPaths,
          usesAnchorReference: canUseAnchorReference,
          ...(creative && {
            creative: {
              clauses: enrichedScenes.find(Boolean)?.creative.clauses ?? [],
              selected: creative,
            },
          }),
          scenes: scenePrompts.map((scenePrompt, index) => ({
            baseScenePrompt: baseScenePrompts[index],
            enrichedScenePrompt: scenePrompt,
            index: index + 1,
            scenePrompt,
            prompt: fullPrompts[index],
          })),
          valid: true,
        },
        emitOpts,
      );
      if (!isStructured(emitOpts.format)) {
        console.log(chalk.bold(`\n🔍 Dry run — series run\n`));
        console.log(`  Theme:  ${chalk.dim(sanitizedTheme)}`);
        console.log(`  Count:  ${count}`);
        console.log(`  Model:  ${chalk.green(modelConfig.name)}`);
        console.log(
          `  Cost:   ${chalk.yellow(`~$${estimatedCost.toFixed(3)}`)}`,
        );
      }
      return;
    }

    const appConfig = await loadConfig();
    getApiKey(appConfig);

    const config = await loadOrCreateRunSeries({
      aspect,
      model: modelId,
      resolution,
      series: opts.series,
      stylePrompt,
      theme: sanitizedTheme,
    });
    const outputDir = seriesOutputsDir(config.slug);
    const spinner = isStructured(emitOpts.format)
      ? null
      : ora(`Generating ${count} image series...`).start();
    const savedImages: Array<{
      path: string;
      scenePrompt: string;
      width?: number;
      height?: number;
      size: string;
    }> = [];
    const generations: Generation[] = [];
    const now = new Date().toISOString();
    let anchorPath: string | undefined;

    for (let i = 0; i < count; i++) {
      const outputNum = String(config.outputs.length + i + 1).padStart(3, "0");
      const filename = `${outputNum}-${slugify(sanitizedTheme.slice(0, 40))}-${String(i + 1).padStart(2, "0")}.png`;
      const outputPath = `${outputDir}/${filename}`;
      const editImages =
        anchorPath && canUseAnchorReference
          ? [...refPaths, anchorPath]
          : refPaths.length > 0
            ? refPaths
            : undefined;
      const result = await generate({
        prompt: fullPrompts[i] ?? sanitizedTheme,
        model: modelId,
        aspect,
        resolution,
        numImages: 1,
        editImages,
      });
      const image = result.images[0];
      if (!image) {
        throw new Error("Series run returned no images");
      }
      const actualOutputPath = await downloadImage(image.url, outputPath);
      if (!anchorPath) {
        anchorPath = actualOutputPath;
      }
      const dims = await getImageDimensions(actualOutputPath);
      const size = getFileSize(actualOutputPath);
      savedImages.push({
        path: resolve(actualOutputPath),
        scenePrompt: scenePrompts[i] ?? sanitizedTheme,
        width: dims?.width,
        height: dims?.height,
        size,
      });
      generations.push({
        id: generateId(),
        prompt: fullPrompts[i] ?? sanitizedTheme,
        model: modelId,
        aspect,
        resolution,
        output: resolve(actualOutputPath),
        cost: estimateCost(modelId, resolution, 1),
        timestamp: now,
      });
      await recordOutput(config.slug, {
        filename: basename(actualOutputPath),
        prompt: fullPrompts[i] ?? sanitizedTheme,
        refsUsed: [
          ...(refTags ?? config.refs.map((ref) => ref.tag)),
          ...(anchorPath && i > 0 ? ["series-anchor"] : []),
        ],
        model: modelId,
        aspect,
        resolution,
        cost: estimateCost(modelId, resolution, 1),
        timestamp: new Date().toISOString(),
      });
    }

    await addGenerations(generations);
    spinner?.succeed("Generated series run");

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-run",
          count,
          dryRun: false,
          series: config.slug,
          theme: sanitizedTheme,
          stylePrompt,
          model: modelId,
          modelName: modelConfig.name,
          aspect,
          resolution,
          images: savedImages,
          cost: estimatedCost,
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
    | "series-run"
    | "series-history";
  description?: string;
  count?: number;
  creative?: CreativeDirection;
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
  theme?: string;
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
    .option("--recipe <id>", "Creative recipe id, e.g. cinematic")
    .option("--shot <id>", "Shot/framing id, e.g. close-up")
    .option("--lighting <id>", "Lighting id, e.g. rim")
    .option("--genre <id>", "Genre id")
    .option("--camera <id>", "Camera/lens language id")
    .option("--color <id>", "Color treatment id")
    .option("--material <id>", "Material or texture id")
    .option("--motion <id>", "Motion treatment id")
    .option("--no-open", "Don't open after generation")
    .option("--dry-run", "Validate without API call")
    .action(async (slug: string, prompt: string, opts) => {
      await cmdGenerate(slug, prompt, opts, emitOpts);
    });

  program
    .command("run <theme>")
    .description("Plan and generate a themed multi-image series run")
    .option("-c, --count <n>", "Number of images to generate", "4")
    .option("--series <slug>", "Existing series to run inside")
    .option("--style <prompt>", "Shared style prompt for the run")
    .option(
      "--refs <tags>",
      "Comma-separated ref tags to include from an existing series",
    )
    .option("-a, --aspect <ratio>", "Aspect ratio")
    .option("-r, --resolution <res>", "Resolution")
    .option("-m, --model <model>", "Model")
    .option("--recipe <id>", "Creative recipe id, e.g. cinematic")
    .option("--shot <id>", "Shot/framing id, e.g. close-up")
    .option("--lighting <id>", "Lighting id, e.g. rim")
    .option("--genre <id>", "Genre id")
    .option("--camera <id>", "Camera/lens language id")
    .option("--color <id>", "Color treatment id")
    .option("--material <id>", "Material or texture id")
    .option("--motion <id>", "Motion treatment id")
    .option("--no-open", "Don't open after generation")
    .option("--dry-run", "Validate and plan without API call")
    .action(async (theme: string, opts) => {
      await cmdRun(theme, opts, emitOpts);
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
          creative: data.creative,
        },
        emitOpts,
      );
      break;
    case "series-run":
      if (!(data.theme || data.prompt)) {
        throw new Error("theme is required");
      }
      await cmdRun(
        data.theme ?? data.prompt ?? "",
        {
          refs: data.refs,
          model: data.model,
          aspect: data.aspect,
          resolution: data.resolution,
          count: data.count
            ? String(data.count)
            : data.numImages
              ? String(data.numImages)
              : undefined,
          noOpen: data.noOpen,
          dryRun: data.dryRun,
          creative: data.creative,
          series: data.series,
          style: data.stylePrompt,
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
