import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { getFalKeyFromEnv } from "@howells/motif-sdk";
import type { AspectRatio, Resolution } from "@howells/motif-sdk";

import { parseJsonAs } from "./json";
import { hasText } from "./text";

const MOTIF_DIR = join(homedir(), ".motif");
const CONFIG_PATH = join(MOTIF_DIR, "config.json");
const HISTORY_PATH = join(MOTIF_DIR, "history.json");
const LOCAL_CONFIG_PATH = ".motifrc";

export interface MotifConfig {
  apiKey?: string;
  backgroundRemover: "rmbg" | "bria";
  defaultAspect: AspectRatio;
  defaultModel: string;
  defaultResolution: Resolution;
  openAfterGenerate: boolean;
  upscaler: "clarity" | "crystal";
}

export interface Generation {
  aspect: AspectRatio;
  cost: number;
  editedFrom?: string;
  id: string;
  model: string;
  output: string;
  prompt: string;
  resolution: Resolution;
  timestamp: string;
}

export interface History {
  generations: Generation[];
  lastSessionDate: string;
  totalCost: {
    session: number;
    today: number;
    allTime: number;
  };
}

const DEFAULT_CONFIG: MotifConfig = {
  backgroundRemover: "rmbg",
  defaultAspect: "1:1",
  defaultModel: "banana",
  defaultResolution: "2K",
  openAfterGenerate: true,
  upscaler: "clarity",
};

const DEFAULT_HISTORY: History = {
  generations: [],
  lastSessionDate: new Date().toISOString().split("T")[0] ?? "",
  totalCost: {
    allTime: 0,
    session: 0,
    today: 0,
  },
};

function ensureMotifDir(): void {
  if (!existsSync(MOTIF_DIR)) {
    mkdirSync(MOTIF_DIR, { mode: 0o700, recursive: true });
  }
}

/**
 * Write file atomically using temp-rename pattern
 * Prevents corruption if process is interrupted mid-write
 */
export async function atomicWrite(
  filePath: string,
  data: string
): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    // Write to temp file with restrictive permissions
    writeFileSync(tempPath, data, { mode: 0o600 });
    // Atomic rename (on POSIX systems)
    renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

export async function loadConfig(): Promise<MotifConfig> {
  ensureMotifDir();

  let config = { ...DEFAULT_CONFIG };

  // Load global config
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = await readFile(CONFIG_PATH, "utf-8");
      const globalConfig = parseJsonAs<Partial<MotifConfig>>(raw);
      config = { ...config, ...globalConfig };
    } catch (error) {
      console.error(
        `Warning: Failed to parse ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`
      );
      console.error("Using default configuration.");
    }
  }

  // Load local config (overrides global)
  if (existsSync(LOCAL_CONFIG_PATH)) {
    try {
      const raw = await readFile(LOCAL_CONFIG_PATH, "utf-8");
      const localConfig = parseJsonAs<Partial<MotifConfig>>(raw);
      config = { ...config, ...localConfig };
    } catch (error) {
      console.error(
        `Warning: Failed to parse ${LOCAL_CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return config;
}

export async function saveConfig(config: Partial<MotifConfig>): Promise<void> {
  ensureMotifDir();

  let existing: MotifConfig = DEFAULT_CONFIG;
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = await readFile(CONFIG_PATH, "utf-8");
      existing = parseJsonAs<MotifConfig>(raw);
    } catch {
      // Use defaults if existing config is corrupted
    }
  }

  const merged = { ...existing, ...config };
  await atomicWrite(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

export async function loadHistory(): Promise<History> {
  ensureMotifDir();

  if (!existsSync(HISTORY_PATH)) {
    return { ...DEFAULT_HISTORY };
  }

  try {
    const raw = await readFile(HISTORY_PATH, "utf-8");
    const history = parseJsonAs<History>(raw);

    // Reset session/daily costs if it's a new day
    const today = new Date().toISOString().split("T")[0] ?? "";
    if (history.lastSessionDate !== today) {
      history.totalCost.session = 0;
      history.totalCost.today = 0;
      history.lastSessionDate = today;
    }

    return history;
  } catch (error) {
    console.error(
      `Warning: Failed to load history from ${HISTORY_PATH}: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error("Starting with empty history.");
    return { ...DEFAULT_HISTORY };
  }
}

export async function saveHistory(history: History): Promise<void> {
  ensureMotifDir();
  await atomicWrite(HISTORY_PATH, JSON.stringify(history, null, 2));
}

export async function addGeneration(generation: Generation): Promise<void> {
  await addGenerations([generation]);
}

export async function addGenerations(generations: Generation[]): Promise<void> {
  if (generations.length === 0) {
    return;
  }

  const history = await loadHistory();

  for (const generation of generations) {
    history.generations.push(generation);
    history.totalCost.session += generation.cost;
    history.totalCost.today += generation.cost;
    history.totalCost.allTime += generation.cost;
  }

  history.lastSessionDate = new Date().toISOString().split("T")[0] ?? "";

  // Keep only last 100 generations (remove oldest from front)
  while (history.generations.length > 100) {
    history.generations.shift();
  }

  await saveHistory(history);
}

export async function getLastGeneration(): Promise<Generation | null> {
  const history = await loadHistory();
  // Generations are stored oldest-first, so last element is most recent
  return history.generations.at(-1) ?? null;
}

export function getApiKey(config: MotifConfig): string {
  // Environment variable takes precedence
  const envKey = getFalKeyFromEnv();
  if (hasText(envKey)) {
    return envKey;
  }

  // Fall back to config
  if (hasText(config.apiKey)) {
    return config.apiKey;
  }

  throw new Error(
    "FAL_KEY not found. Set FAL_KEY environment variable or add apiKey to ~/.motif/config.json"
  );
}

export function generateId(): string {
  // Use cryptographically secure UUID for guaranteed uniqueness
  return randomUUID();
}

export { CONFIG_PATH, HISTORY_PATH, MOTIF_DIR };
