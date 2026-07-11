import { getErrorMetadata } from "./error-catalog";
import { emitError } from "./output";
import type { OutputFormat } from "./output";

/** Map a catalog HTTP-style status to a semantic process exit code. */
export function exitCodeForStatus(status: number): number {
  if (status === 401 || status === 403) {
    return 3; // authentication / authorization
  }
  if (status === 404) {
    return 4; // resource not found
  }
  if (status >= 400 && status < 500) {
    return 2; // invalid input / usage
  }
  if (status >= 500) {
    return 5; // upstream (fal) failure
  }
  return 1; // unknown
}

/**
 * Exit the process with the semantic code for a known error code's catalog
 * status. Use after emitting a structured error so exit codes stay aligned
 * with the RFC 7807 `status` field agents already receive.
 */
export function exitForErrorCode(code: string): never {
  process.exit(exitCodeForStatus(getErrorMetadata(code).status));
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "Unknown error";
}

function hasProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function getStructuredDetails(err: unknown): unknown {
  if (
    hasProperty(err, "code") &&
    err.code === "INVALID_OPTION" &&
    hasProperty(err, "field") &&
    typeof err.field === "string" &&
    hasProperty(err, "value") &&
    typeof err.value === "string" &&
    hasProperty(err, "availableIds") &&
    isStringArray(err.availableIds)
  ) {
    return {
      availableIds: err.availableIds,
      field: err.field,
      value: err.value,
    };
  }

  return undefined;
}

export function handleError(
  err: unknown,
  code: string,
  format: OutputFormat
): never {
  const metadata = getErrorMetadata(code);
  emitError(
    {
      code,
      details: getStructuredDetails(err),
      doc_uri: metadata.docUri,
      is_retriable: metadata.isRetriable,
      message: getErrorMessage(err),
      status: metadata.status,
      suggestions: metadata.suggestions,
      title: metadata.title,
      type: metadata.type,
    },
    format
  );
  process.exit(exitCodeForStatus(metadata.status));
}
