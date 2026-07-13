import type { JobStatus, MotifImage } from "./types";

/**
 * Boundary parsing for fal.ai HTTP responses.
 *
 * `Response.json()` yields `any`; these helpers narrow that untyped payload into
 * the SDK's response types with runtime guards instead of unchecked assertions.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function toMotifImage(value: unknown): MotifImage {
  if (isRecord(value)) {
    return {
      content_type: asString(value.content_type),
      height: asNumber(value.height),
      url: asString(value.url) ?? "",
      width: asNumber(value.width),
    };
  }
  return { url: "" };
}

export function parseImages(value: unknown): MotifImage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => toMotifImage(entry));
}

export function parseLogs(value: unknown): JobStatus["logs"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries: { message: string; timestamp: string }[] = [];
  for (const entry of value) {
    if (isRecord(entry)) {
      entries.push({
        message: asString(entry.message) ?? "",
        timestamp: asString(entry.timestamp) ?? "",
      });
    }
  }
  return entries;
}

export interface QueueSubmission {
  requestId: string;
  responseUrl?: string;
}

/**
 * Extract the endpoint path from a fal queue `response_url`, falling back to
 * the submitted endpoint when the URL is absent or unparseable.
 */
export function endpointFromQueueUrl(
  url: string | undefined,
  fallback: string
): string {
  if (url === undefined || url === "") {
    return fallback;
  }
  try {
    const parsed = new URL(url);
    const match = /^\/(.+)\/requests\//.exec(parsed.pathname);
    return match?.[1] ?? fallback;
  } catch {
    return fallback;
  }
}

export function parseQueueSubmission(data: unknown): QueueSubmission {
  if (!isRecord(data)) {
    return { requestId: "" };
  }
  return {
    requestId: asString(data.request_id) ?? "",
    responseUrl: asString(data.response_url),
  };
}

/**
 * Normalize `HeadersInit` (which may be a `Headers`, an array of pairs, or a
 * record) into a plain `Record<string, string>` so callers can spread it into
 * an object literal without the array-spread hazard. The record branch narrows
 * cleanly, so no assertion is needed.
 */
export function toHeaderRecord(
  headers: HeadersInit | undefined
): Record<string, string> {
  if (headers === undefined) {
    return {};
  }
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    for (const [key, value] of headers.entries()) {
      record[key] = value;
    }
    return record;
  }
  if (Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (const [key, value] of headers) {
      record[key] = value;
    }
    return record;
  }
  return headers;
}

/**
 * Extract fal's request-correlation id from a non-OK error body.
 *
 * fal error payloads sometimes carry the id under `request_id`, `requestId`,
 * or `trace_id`. Used as a fallback when the `x-fal-request-id` response header
 * is absent; returns `undefined` if the body is not cleanly parseable.
 */
export function requestIdFromBody(text: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  return (
    asString(parsed.request_id) ??
    asString(parsed.requestId) ??
    asString(parsed.trace_id)
  );
}
