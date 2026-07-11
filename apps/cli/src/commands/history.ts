/**
 * History command with pagination and field masks.
 * Supports NDJSON streaming for large histories.
 */

import { MODELS } from "@howells/motif-sdk";
import chalk from "chalk";

import { loadHistory } from "../utils/config";
import { emit, emitStream, isStructured } from "../utils/output";
import type { EmitOptions } from "../utils/output";

export interface HistoryOptions {
  limit?: number;
  offset?: number;
}

export async function runHistory(
  historyOpts: HistoryOptions,
  emitOpts: EmitOptions
): Promise<void> {
  const history = await loadHistory();

  // Generations are stored oldest-first, reverse for newest-first display
  const allGenerations = [...history.generations].reverse();
  const total = allGenerations.length;
  const offset = historyOpts.offset ?? 0;
  const limit = historyOpts.limit ?? 10;
  const page = allGenerations.slice(offset, offset + limit);

  if (emitOpts.format === "ndjson") {
    // Stream each generation as a separate NDJSON line
    emitStream(
      page.map((g) => ({
        ...g,
        modelName: MODELS[g.model]?.name ?? g.model,
      })),
      emitOpts
    );
    return;
  }

  if (isStructured(emitOpts.format)) {
    emit(
      {
        costs: history.totalCost,
        generations: page.map((g) => ({
          ...g,
          modelName: MODELS[g.model]?.name ?? g.model,
        })),
        hasMore: offset + limit < total,
        limit,
        offset,
        total,
      },
      emitOpts
    );
    return;
  }

  // Human format
  if (page.length === 0) {
    console.log(chalk.yellow("No generations found."));
    return;
  }

  console.log(
    chalk.bold(
      `\nGeneration History (${offset + 1}-${offset + page.length} of ${total}):\n`
    )
  );

  for (const gen of page) {
    const modelName = MODELS[gen.model]?.name ?? gen.model;
    const date = new Date(gen.timestamp).toLocaleString();
    console.log(
      `  ${chalk.dim(gen.id.slice(0, 8))} ${chalk.cyan(gen.prompt.slice(0, 50))}${gen.prompt.length > 50 ? "..." : ""}`
    );
    console.log(
      `    ${chalk.green(modelName)} | ${gen.aspect} | $${gen.cost.toFixed(3)} | ${chalk.dim(date)}`
    );
    console.log(`    ${chalk.dim(gen.output)}`);
    console.log();
  }

  console.log(
    chalk.dim(
      `Session: $${history.totalCost.session.toFixed(2)} | Today: $${history.totalCost.today.toFixed(2)} | All time: $${history.totalCost.allTime.toFixed(2)}`
    )
  );

  if (offset + limit < total) {
    console.log(chalk.dim(`\nUse --offset ${offset + limit} to see more.`));
  }
}
