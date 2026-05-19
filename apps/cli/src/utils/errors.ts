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
