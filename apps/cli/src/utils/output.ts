/**
 * Structured output system for agent-first CLI design.
 *
 * - TTY (interactive terminal) → human-readable colored output
 * - Piped (non-TTY) → JSON per line (NDJSON)
 * - Explicit --format flag overrides detection
 */

import chalk from "chalk";

import { getErrorMetadata } from "./error-catalog";
import { hasText } from "./text";

/** Narrow an unknown value to a plain (non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type OutputFormat = "human" | "json" | "ndjson";

/** Detect if stdout is an interactive terminal */
export function isInteractive(): boolean {
  return process.stdout.isTTY;
}

/** Resolve the output format from explicit flag or TTY detection */
export function resolveFormat(explicit?: string): OutputFormat {
  if (explicit === "json" || explicit === "ndjson" || explicit === "human") {
    return explicit;
  }
  return isInteractive() ? "human" : "json";
}

/** Filter an object to only include specified fields */
function applyFieldMask(
  data: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in data) {
      result[field] = data[field];
    }
  }
  return result;
}

/**
 * Sanitize a value against prompt injection in API responses.
 * Strips instruction-like patterns from string values before outputting.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Strip common prompt injection patterns from API response data
    return value
      .replaceAll(
        /\b(SYSTEM|INSTRUCTION|IGNORE PREVIOUS)\b.*$/gim,
        "[FILTERED]"
      )
      .replaceAll(/<\/?(?:system|instruction|prompt)[^>]*>/gi, "[FILTERED]");
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (isRecord(value)) {
    return sanitizeObject(value);
  }
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = sanitizeValue(val);
  }
  return result;
}

export interface EmitOptions {
  /** Comma-separated field names to include (omit for all) */
  fields?: string;
  /** Explicit output format */
  format: OutputFormat;
  /** Sanitize response data against prompt injection */
  sanitize?: boolean;
}

/** Emit a single structured result */
export function emit(
  data: Record<string, unknown>,
  options: EmitOptions
): void {
  let output = options.sanitize === true ? sanitizeObject(data) : data;

  if (hasText(options.fields)) {
    const fieldList = options.fields.split(",").map((f) => f.trim());
    output = applyFieldMask(output, fieldList);
  }

  if (options.format === "json" || options.format === "ndjson") {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
  // Human format is handled by callers — this function is for structured output
}

/** Emit multiple items as NDJSON (one JSON object per line) */
export function emitStream(
  items: Record<string, unknown>[],
  options: EmitOptions
): void {
  for (const item of items) {
    emit(item, { ...options, format: "ndjson" });
  }
}

/** Structured error output — RFC 7807 Problem Details for HTTP APIs */
export interface StructuredError {
  /** Problem type URI (RFC 7807 `type`) */
  type: string;
  /** Human-readable summary (RFC 7807 `title`) */
  title: string;
  /** HTTP-equivalent status code (RFC 7807 `status`) */
  status: number;
  /** Machine-readable error code */
  code: string;
  /** Human-readable detail message */
  message: string;
  /** Additional context */
  details?: unknown;
  /** RFC 7807 `instance` — a URI identifying this specific occurrence. Set to
   * the fal request URN when a failure originated at fal. */
  instance?: string;
  /** Stable local documentation pointer for this error code */
  doc_uri: string;
  /** Sentinel: always true */
  error: true;
  /** Whether retrying the same request may succeed */
  is_retriable: boolean;
  /** Recovery hints for agents */
  suggestions?: string[];
}

/** Derive RFC 7807 fields from an error code */
function deriveRfc7807(
  code: string,
  overrides?: {
    doc_uri?: string;
    type?: string;
    title?: string;
    status?: number;
  }
): { doc_uri: string; type: string; title: string; status: number } {
  const metadata = getErrorMetadata(code);
  return {
    doc_uri: overrides?.doc_uri ?? metadata.docUri,
    status: overrides?.status ?? metadata.status,
    title: overrides?.title ?? metadata.title,
    type: overrides?.type ?? metadata.type,
  };
}

/** Emit a structured error */
export function emitError(
  error: {
    code: string;
    message: string;
    details?: unknown;
    doc_uri?: string;
    instance?: string;
    is_retriable?: boolean;
    suggestions?: string[];
    /** RFC 7807 fields — auto-derived from code if omitted */
    type?: string;
    title?: string;
    status?: number;
  },
  format: OutputFormat
): void {
  const rfc = deriveRfc7807(error.code, {
    doc_uri: error.doc_uri,
    status: error.status,
    title: error.title,
    type: error.type,
  });
  const metadata = getErrorMetadata(error.code);

  // Presence check matches the original truthiness: falsy details (undefined,
  // null, "", 0, false) are omitted from the envelope.
  const hasDetails = Boolean(error.details);

  const structured: StructuredError = {
    type: rfc.type,
    title: rfc.title,
    status: rfc.status,
    doc_uri: rfc.doc_uri,
    error: true,
    code: error.code,
    message: error.message,
    ...(hasDetails ? { details: error.details } : {}),
    ...(hasText(error.instance) ? { instance: error.instance } : {}),
    is_retriable: error.is_retriable ?? metadata.isRetriable,
    ...(error.suggestions || metadata.suggestions
      ? { suggestions: error.suggestions ?? metadata.suggestions }
      : {}),
  };

  if (format === "json" || format === "ndjson") {
    process.stderr.write(`${JSON.stringify(structured)}\n`);
  } else {
    process.stderr.write(
      `${chalk.red(`Error [${error.code}]: ${error.message}`)}\n`
    );
  }
}

/** Check if output is structured (agent mode) */
export function isStructured(format: OutputFormat): boolean {
  return format === "json" || format === "ndjson";
}
