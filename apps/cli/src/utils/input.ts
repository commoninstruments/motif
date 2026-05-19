/**
 * Input hardening for agent-first CLI design.
 *
 * Agents hallucinate differently from humans (they don't make typos,
 * they make structurally plausible but wrong inputs). This module
 * defends against those specific failure modes.
 */

import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

// -- Control character filtering --

/** Characters that should never appear in user prompts */
// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for sanitization
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Sanitize a text prompt: strip control chars, normalize whitespace */
export function sanitizePrompt(prompt: string): string {
  return prompt
    .replace(CONTROL_CHAR_REGEX, "")
    .replace(/\r\n/g, "\n") // Normalize line endings
    .trim();
}

// -- Path traversal defense --

/** Percent-encoded path traversal patterns */
const PERCENT_TRAVERSAL_REGEX = /%2e|%2f|%5c/i;

/** Embedded query params that agents might hallucinate into paths */
const EMBEDDED_QUERY_REGEX = /[?#]/;

/**
 * Validate a resource identifier (model name, preset name, etc.)
 * against agent hallucination patterns.
 */
export function validateResourceId(id: string, label: string): string {
  if (CONTROL_CHAR_REGEX.test(id)) {
    throw new Error(
      `${label} contains control characters: ${JSON.stringify(id)}`,
    );
  }
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error(`${label} contains path traversal: ${JSON.stringify(id)}`);
  }
  if (PERCENT_TRAVERSAL_REGEX.test(id)) {
    throw new Error(
      `${label} contains percent-encoded traversal: ${JSON.stringify(id)}`,
    );
  }
  if (EMBEDDED_QUERY_REGEX.test(id)) {
    throw new Error(
      `${label} contains embedded query params: ${JSON.stringify(id)}`,
    );
  }
  return id;
}

export function parseIntegerOption(
  value: number | string,
  label: string,
  options: { max?: number; min?: number } = {},
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer: ${value}`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw new Error(`${label} must be >= ${options.min}: ${value}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`${label} must be <= ${options.max}: ${value}`);
  }
  return parsed;
}

export function parseNumberOption(
  value: number | string,
  label: string,
  options: { max?: number; min?: number } = {},
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a number: ${value}`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw new Error(`${label} must be >= ${options.min}: ${value}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`${label} must be <= ${options.max}: ${value}`);
  }
  return parsed;
}

export function validateEnumOption<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(
      `${label} must be one of ${allowed.join(", ")}: ${JSON.stringify(value)}`,
    );
  }
  return value as T;
}

/**
 * Validate an output path is safe:
 * - No path traversal (../), no percent-encoded traversal (%2e)
 * - Must resolve within CWD (sandbox)
 * - No embedded query params
 */
export function validateOutputPath(outputPath: string): string {
  // Check for percent-encoded traversal before resolving
  if (PERCENT_TRAVERSAL_REGEX.test(outputPath)) {
    throw new Error(
      `Output path contains percent-encoded traversal: ${outputPath}`,
    );
  }
  if (EMBEDDED_QUERY_REGEX.test(outputPath)) {
    throw new Error(
      `Output path contains embedded query params: ${outputPath}`,
    );
  }
  if (CONTROL_CHAR_REGEX.test(outputPath)) {
    throw new Error(
      `Output path contains control characters: ${JSON.stringify(outputPath)}`,
    );
  }

  const resolved = resolve(outputPath);
  const cwd = process.cwd();

  // Ensure path stays within current working directory
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Output path must be within current directory: ${outputPath}`,
    );
  }

  return resolved;
}

/**
 * Validate an edit/reference image path:
 * - Must exist
 * - Must be a supported image format
 * - Must not contain traversal patterns
 */
export function validateEditPath(editPath: string): string {
  if (PERCENT_TRAVERSAL_REGEX.test(editPath)) {
    throw new Error(
      `Edit path contains percent-encoded traversal: ${editPath}`,
    );
  }
  if (CONTROL_CHAR_REGEX.test(editPath)) {
    throw new Error(
      `Edit path contains control characters: ${JSON.stringify(editPath)}`,
    );
  }

  const resolved = resolve(editPath);

  if (!existsSync(resolved)) {
    throw new Error(`Edit image not found: ${editPath}`);
  }

  const ext = resolved.toLowerCase();
  if (
    !(
      ext.endsWith(".png") ||
      ext.endsWith(".jpg") ||
      ext.endsWith(".jpeg") ||
      ext.endsWith(".webp")
    )
  ) {
    throw new Error(`Edit image must be PNG, JPG, or WebP: ${editPath}`);
  }

  return resolved;
}

// -- Stdin JSON parsing --

/**
 * Read JSON from stdin if data is being piped.
 * Returns null if stdin is a TTY (interactive).
 */
export function readStdinJson<T>(): Promise<T | null> {
  if (process.stdin.isTTY) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      if (!data.trim()) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(data) as T);
      } catch (err) {
        reject(
          new Error(
            `Invalid JSON on stdin: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
    process.stdin.on("error", reject);
  });
}
