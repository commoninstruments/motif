export interface ErrorMetadata {
  docUri: string;
  isRetriable: boolean;
  status: number;
  suggestions?: string[];
  title: string;
  type: string;
}

const ERROR_SUGGESTIONS = {
  describe: ["Run 'motif --describe --format json' to inspect valid commands"],
  models: [
    "Run 'motif --describe generate --format json' to inspect valid models",
  ],
  series: ["Run 'motif series list --format json' to inspect available series"],
  tools: ["Run 'motif tool list --format json' to inspect available fal tools"],
  apiKey: ["Set the FAL_KEY environment variable: export FAL_KEY=your_key"],
  prompt: ["Provide a non-empty prompt as an argument or stdin JSON field"],
} as const;

function titleFromCode(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugFromCode(code: string): string {
  return code.toLowerCase().replace(/_/g, "-");
}

function metadata(
  code: string,
  status: number,
  options: {
    isRetriable?: boolean;
    suggestions?: string[];
    title?: string;
  } = {},
): ErrorMetadata {
  const slug = slugFromCode(code);
  return {
    type: `urn:motif:error:${slug}`,
    title: options.title ?? titleFromCode(code),
    status,
    isRetriable: options.isRetriable ?? false,
    docUri: `motif://describe/errors#${slug}`,
    ...(options.suggestions ? { suggestions: options.suggestions } : {}),
  };
}

export const ERROR_CATALOG = {
  MISSING_API_KEY: metadata("MISSING_API_KEY", 401, {
    suggestions: [...ERROR_SUGGESTIONS.apiKey],
  }),
  UNKNOWN_MODEL: metadata("UNKNOWN_MODEL", 400, {
    suggestions: [...ERROR_SUGGESTIONS.models],
  }),
  UNKNOWN_TOOL: metadata("UNKNOWN_TOOL", 400, {
    suggestions: [...ERROR_SUGGESTIONS.tools],
  }),
  INVALID_MODEL_ID: metadata("INVALID_MODEL_ID", 400, {
    suggestions: [...ERROR_SUGGESTIONS.models],
  }),
  INVALID_TOOL_ID: metadata("INVALID_TOOL_ID", 400, {
    suggestions: [...ERROR_SUGGESTIONS.tools],
  }),
  INVALID_OPTION: metadata("INVALID_OPTION", 400, {
    suggestions: [...ERROR_SUGGESTIONS.describe],
  }),
  INVALID_OUTPUT_PATH: metadata("INVALID_OUTPUT_PATH", 400),
  INVALID_EDIT_PATH: metadata("INVALID_EDIT_PATH", 400),
  INVALID_IMAGE_PATH: metadata("INVALID_IMAGE_PATH", 400),
  INVALID_STDIN: metadata("INVALID_STDIN", 400, {
    suggestions: [
      "Provide valid JSON matching the motif stdin schema; run 'motif --describe --format json' for the schema",
    ],
  }),
  EMPTY_PROMPT: metadata("EMPTY_PROMPT", 400, {
    suggestions: [...ERROR_SUGGESTIONS.prompt],
  }),
  TOO_MANY_REFERENCES: metadata("TOO_MANY_REFERENCES", 400, {
    suggestions: [
      "Reduce the number of reference images; run 'motif --describe generate --format json' to inspect model limits",
    ],
  }),
  NO_PREVIOUS: metadata("NO_PREVIOUS", 404),
  GENERATION_FAILED: metadata("GENERATION_FAILED", 502, {
    isRetriable: true,
    suggestions: [
      "Check that FAL_KEY is valid",
      "Try a different model with --model <model>",
    ],
  }),
  UPSCALE_FAILED: metadata("UPSCALE_FAILED", 502, { isRetriable: true }),
  RMBG_FAILED: metadata("RMBG_FAILED", 502, { isRetriable: true }),
  TOOL_FAILED: metadata("TOOL_FAILED", 502, {
    isRetriable: true,
    suggestions: [...ERROR_SUGGESTIONS.tools],
  }),
  VIDEO_FAILED: metadata("VIDEO_FAILED", 502, { isRetriable: true }),
  DESCRIBE_FAILED: metadata("DESCRIBE_FAILED", 500, {
    isRetriable: true,
    suggestions: [...ERROR_SUGGESTIONS.describe],
  }),
  SERIES_CREATE_FAILED: metadata("SERIES_CREATE_FAILED", 500, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_NOT_FOUND: metadata("SERIES_NOT_FOUND", 404, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_REF_ADD_FAILED: metadata("SERIES_REF_ADD_FAILED", 500, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_REF_REMOVE_FAILED: metadata("SERIES_REF_REMOVE_FAILED", 500, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_GENERATE_FAILED: metadata("SERIES_GENERATE_FAILED", 502, {
    isRetriable: true,
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_DELETE_FAILED: metadata("SERIES_DELETE_FAILED", 500, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
} as const satisfies Record<string, ErrorMetadata>;

export type KnownErrorCode = keyof typeof ERROR_CATALOG;

export function getErrorMetadata(code: string): ErrorMetadata {
  const known = ERROR_CATALOG[code as KnownErrorCode];
  if (known) {
    return known;
  }
  return metadata(code, 500);
}
