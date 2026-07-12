/**
 * Series management — consistent styling across related images.
 *
 * A series is a named collection with:
 * - A style prompt prefix (prepended to every generation)
 * - Reference images (tagged for selective inclusion)
 * - A preferred model and settings
 * - Output history for cumulative reference
 */

import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import type { AspectRatio, Resolution } from "@howells/motif-sdk";

import { atomicWrite } from "./config";
import { validateEditPath, validateResourceId } from "./input";
import { hasText } from "./text";

const MOTIF_DIR = join(homedir(), ".motif");
const SERIES_DIR = join(MOTIF_DIR, "series");

// -- Types --

export interface SeriesRef {
  /** When the reference was added */
  added: string;
  /** Human description of what this reference represents */
  description: string;
  /** Local filename within the series refs/ directory */
  filename: string;
  /** Tag for selective inclusion (e.g. "character", "location", "style") */
  tag: string;
}

export interface SeriesOutput {
  aspect: AspectRatio;
  /** Cost of this generation */
  cost: number;
  /** Local filename within the series outputs/ directory */
  filename: string;
  /** Full motif generation options */
  model: string;
  /** The prompt used to generate this image */
  prompt: string;
  /** Which ref tags were used */
  refsUsed: string[];
  resolution: Resolution;
  /** When generated */
  timestamp: string;
}

export interface SeriesConfig {
  /** Creation timestamp */
  created: string;
  /** Default aspect ratio */
  defaultAspect: AspectRatio;
  /** Default resolution */
  defaultResolution: Resolution;
  /** Unique series ID */
  id: string;
  /** Preferred model for this series */
  model: string;
  /** Human-readable name */
  name: string;
  /** Generated outputs */
  outputs: SeriesOutput[];
  /** Reference images */
  refs: SeriesRef[];
  /** Slug for directory naming */
  slug: string;
  /** Style prompt prefix — prepended to every generation in this series */
  stylePrompt: string;
  /** Last modified timestamp */
  updated: string;
}

// -- Helpers --

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 64);
}

function ensureSeriesDir(): void {
  if (!existsSync(SERIES_DIR)) {
    mkdirSync(SERIES_DIR, { mode: 0o700, recursive: true });
  }
}

function seriesPath(slug: string): string {
  validateResourceId(slug, "series slug");
  return join(SERIES_DIR, slug);
}

function seriesConfigPath(slug: string): string {
  return join(seriesPath(slug), "series.json");
}

function seriesRefsDir(slug: string): string {
  return join(seriesPath(slug), "refs");
}

function seriesOutputsDir(slug: string): string {
  return join(seriesPath(slug), "outputs");
}

// -- CRUD --

export async function createSeries(options: {
  name: string;
  stylePrompt?: string;
  model?: string;
  defaultAspect?: AspectRatio;
  defaultResolution?: Resolution;
  fromImage?: string;
}): Promise<SeriesConfig> {
  ensureSeriesDir();

  const slug = slugify(options.name);
  const dir = seriesPath(slug);

  if (existsSync(dir)) {
    throw new Error(`Series "${options.name}" already exists (slug: ${slug})`);
  }

  mkdirSync(dir, { mode: 0o700, recursive: true });
  mkdirSync(join(dir, "refs"), { recursive: true });
  mkdirSync(join(dir, "outputs"), { recursive: true });

  const config: SeriesConfig = {
    created: new Date().toISOString(),
    defaultAspect: options.defaultAspect ?? "1:1",
    defaultResolution: options.defaultResolution ?? "2K",
    id: randomUUID(),
    model: options.model ?? "banana",
    name: options.name,
    outputs: [],
    refs: [],
    slug,
    stylePrompt: options.stylePrompt ?? "",
    updated: new Date().toISOString(),
  };

  // Copy the initial style reference image if provided
  if (hasText(options.fromImage)) {
    const sourcePath = validateEditPath(options.fromImage);
    const filename = `style-${basename(sourcePath)}`;
    cpSync(sourcePath, join(dir, "refs", filename));
    config.refs.push({
      added: config.created,
      description: "Initial style reference (from series creation)",
      filename,
      tag: "style",
    });
  }

  await saveSeries(config);
  return config;
}

function isSeriesConfig(value: unknown): value is SeriesConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadSeries(slug: string): Promise<SeriesConfig> {
  const configPath = seriesConfigPath(slug);
  if (!existsSync(configPath)) {
    throw new Error(`Series not found: ${slug}`);
  }
  const raw = await readFile(configPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (!isSeriesConfig(parsed)) {
    throw new Error(`Invalid series config file: ${configPath}`);
  }
  return parsed;
}

export async function saveSeries(config: SeriesConfig): Promise<void> {
  const updated = { ...config, updated: new Date().toISOString() };
  await atomicWrite(
    seriesConfigPath(config.slug),
    JSON.stringify(updated, null, 2)
  );
}

export async function listSeries(): Promise<SeriesConfig[]> {
  ensureSeriesDir();

  const dirs = readdirSync(SERIES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const series: SeriesConfig[] = [];
  for (const slug of dirs) {
    try {
      series.push(await loadSeries(slug));
    } catch {
      // Skip corrupted series
    }
  }

  return series.sort(
    (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
  );
}

export async function deleteSeries(slug: string): Promise<void> {
  const dir = seriesPath(slug);
  if (!existsSync(dir)) {
    throw new Error(`Series not found: ${slug}`);
  }
  rmSync(dir, { force: true, recursive: true });
}

// -- Reference management --

export async function addRef(
  slug: string,
  imagePath: string,
  tag: string,
  description: string
): Promise<SeriesRef> {
  validateResourceId(tag, "ref tag");
  const config = await loadSeries(slug);

  const sourcePath = validateEditPath(imagePath);

  const filename = `${tag}-${basename(sourcePath)}`;
  const refsDir = seriesRefsDir(slug);
  const destPath = join(refsDir, filename);

  // Ensure destination stays within the refs directory
  if (!resolve(destPath).startsWith(`${resolve(refsDir)}/`)) {
    throw new Error(`Ref filename escapes series refs directory: ${filename}`);
  }

  cpSync(sourcePath, destPath);

  const ref: SeriesRef = {
    added: new Date().toISOString(),
    description,
    filename,
    tag,
  };

  config.refs.push(ref);
  await saveSeries(config);
  return ref;
}

export async function removeRef(slug: string, filename: string): Promise<void> {
  const config = await loadSeries(slug);

  const idx = config.refs.findIndex((r) => r.filename === filename);
  if (idx === -1) {
    throw new Error(`Reference not found: ${filename}`);
  }

  const refsDir = seriesRefsDir(slug);
  const refPath = join(refsDir, filename);

  // Ensure path stays within the refs directory
  if (!resolve(refPath).startsWith(`${resolve(refsDir)}/`)) {
    throw new Error(`Ref filename escapes series refs directory: ${filename}`);
  }

  if (existsSync(refPath)) {
    unlinkSync(refPath);
  }

  const updatedRefs = [
    ...config.refs.slice(0, idx),
    ...config.refs.slice(idx + 1),
  ];
  await saveSeries({ ...config, refs: updatedRefs });
}

/** Get absolute paths to reference images matching the given tags */
export function resolveRefs(config: SeriesConfig, tags?: string[]): string[] {
  const refsDir = seriesRefsDir(config.slug);

  const matching = tags
    ? config.refs.filter((r) => tags.includes(r.tag))
    : config.refs;

  return matching
    .map((r) => join(refsDir, r.filename))
    .filter((p) => existsSync(p));
}

// -- Output tracking --

export async function recordOutput(
  slug: string,
  output: SeriesOutput
): Promise<void> {
  const config = await loadSeries(slug);
  config.outputs.push(output);
  await saveSeries(config);
}

/** Build the full prompt by prepending the series style prompt */
export function buildSeriesPrompt(
  config: SeriesConfig,
  scenePrompt: string
): string {
  if (!config.stylePrompt) {
    return scenePrompt;
  }
  return `${config.stylePrompt}. ${scenePrompt}`;
}

export { SERIES_DIR, seriesOutputsDir, seriesRefsDir };
