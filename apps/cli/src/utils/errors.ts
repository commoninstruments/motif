import { getErrorMetadata } from "./error-catalog";
import { emitError, type OutputFormat } from "./output";

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
  key: K,
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
  format: OutputFormat,
): never {
  const metadata = getErrorMetadata(code);
  emitError(
    {
      code,
      message: getErrorMessage(err),
      doc_uri: metadata.docUri,
      details: getStructuredDetails(err),
      is_retriable: metadata.isRetriable,
      status: metadata.status,
      suggestions: metadata.suggestions,
      title: metadata.title,
      type: metadata.type,
    },
    format,
  );
  process.exit(1);
}
