/**
 * readHistory
 *
 * Reads recent CLI generations from ~/.motif/history.json.
 * The MCP package can't import from apps/cli, so this duplicates
 * the minimal logic needed to read the shared history file.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HISTORY_PATH = join(homedir(), ".motif", "history.json");

export interface HistoryEntry {
  aspect: string;
  cost: number;
  editedFrom?: string;
  filePath: string;
  id: string;
  model: string;
  prompt: string;
  resolution: string;
  timestamp: string;
}

export interface HistoryResult {
  costs: {
    allTime: number;
    session: number;
    today: number;
  };
  generations: HistoryEntry[];
  hasMore: boolean;
  limit: number;
  offset: number;
  total: number;
}

interface RawGeneration {
  aspect: string;
  cost: number;
  editedFrom?: string;
  id: string;
  model: string;
  output: string;
  prompt: string;
  resolution: string;
  timestamp: string;
}

interface RawHistory {
  generations: RawGeneration[];
  totalCost: { allTime: number; session: number; today: number };
}

const emptyResult = (limit: number, offset: number): HistoryResult => ({
  costs: { allTime: 0, session: 0, today: 0 },
  generations: [],
  hasMore: false,
  limit,
  offset,
  total: 0,
});

export function readHistory(limit = 10, offset = 0): HistoryResult {
  if (!existsSync(HISTORY_PATH)) {
    return emptyResult(limit, offset);
  }

  let history: RawHistory;
  try {
    history = JSON.parse(readFileSync(HISTORY_PATH, "utf-8")) as RawHistory;
  } catch {
    return emptyResult(limit, offset);
  }

  // Stored oldest-first; reverse for newest-first
  const all = [...history.generations].reverse();
  const total = all.length;
  const page = all.slice(offset, offset + limit);

  return {
    costs: history.totalCost,
    generations: page.map((g) => ({
      aspect: g.aspect,
      cost: g.cost,
      filePath: g.output,
      id: g.id,
      model: g.model,
      prompt: g.prompt,
      resolution: g.resolution,
      timestamp: g.timestamp,
      ...(g.editedFrom === undefined ? {} : { editedFrom: g.editedFrom }),
    })),
    hasMore: offset + limit < total,
    limit,
    offset,
    total,
  };
}
