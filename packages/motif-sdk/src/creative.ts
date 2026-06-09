// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for prompt sanitization
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Creative direction fields applied to prompts in Motif's canonical order.
 *
 * The order matters when multiple fields are selected because prompt clauses
 * are appended in this sequence for stable dry runs, tests, and history.
 */
export type CreativeField =
  | "recipe"
  | "shot"
  | "lighting"
  | "genre"
  | "camera"
  | "color"
  | "material"
  | "motion";

/**
 * Selected creative option ids keyed by direction field.
 *
 * Values must match option ids from `CREATIVE_TAXONOMY`; unknown ids throw a
 * `CreativeOptionError` before any fal request body is built.
 */
export type CreativeDirection = Partial<Record<CreativeField, string>>;

/** A single selectable creative direction option exposed to CLI and MCP schemas. */
export interface CreativeOption {
  /** Prompt fragment appended when this option is selected. */
  clause: string;
  /** Human-facing explanation used in schema metadata and generated docs. */
  description: string;
  /** Stable machine id accepted by `CreativeDirection`. */
  id: string;
  /** Short display label for UIs and schema enum descriptions. */
  label: string;
}

/** Structured details returned when a creative direction id is not recognized. */
export interface CreativeOptionErrorDetails {
  availableIds: string[];
  code: "INVALID_OPTION";
  field: CreativeField;
  value: string;
}

/**
 * Error thrown when prompt enrichment receives an unknown creative option id.
 *
 * The extra fields make CLI and agent callers able to show field-specific
 * recovery hints without parsing the error message.
 */
export class CreativeOptionError
  extends Error
  implements CreativeOptionErrorDetails
{
  readonly availableIds: string[];
  readonly code = "INVALID_OPTION";
  readonly field: CreativeField;
  readonly value: string;

  constructor(details: Omit<CreativeOptionErrorDetails, "code">) {
    super(
      `Unknown creative ${details.field}: ${details.value}. Available: ${details.availableIds.join(", ")}`,
    );
    this.name = "CreativeOptionError";
    this.availableIds = details.availableIds;
    this.field = details.field;
    this.value = details.value;
  }
}

/** Canonical creative field order used for prompt enrichment and schema output. */
export const CREATIVE_FIELDS = [
  "recipe",
  "shot",
  "lighting",
  "genre",
  "camera",
  "color",
  "material",
  "motion",
] as const satisfies readonly CreativeField[];

/**
 * Built-in creative direction catalog.
 *
 * Each field contains the option ids accepted by `CreativeDirection` and the
 * exact prompt clause that will be appended when selected.
 */
export const CREATIVE_TAXONOMY = {
  recipe: [
    {
      clause: "cinematic scene",
      description: "Frames the prompt as a cinematic still or scene.",
      id: "cinematic",
      label: "Cinematic",
    },
  ],
  shot: [
    {
      clause: "close-up composition with controlled depth of field",
      description: "Tight framing that emphasizes subject detail.",
      id: "close-up",
      label: "Close-up",
    },
  ],
  lighting: [
    {
      clause: "rim lighting with defined edge highlights",
      description: "Back or side light that separates the subject edge.",
      id: "rim",
      label: "Rim",
    },
  ],
  genre: [
    {
      clause: "film noir mood with high contrast shadows",
      description: "High-contrast cinematic mood with shadow-forward drama.",
      id: "film-noir",
      label: "Film noir",
    },
  ],
  camera: [
    {
      clause: "macro product photography with crisp surface detail",
      description: "Product-oriented macro camera language for close detail.",
      id: "macro-product",
      label: "Macro product",
    },
  ],
  color: [
    {
      clause: "monochrome palette with tonal contrast",
      description: "Black-and-white or single-channel tonal treatment.",
      id: "monochrome",
      label: "Monochrome",
    },
  ],
  material: [
    {
      clause: "reflective material surfaces with controlled highlights",
      description: "Emphasizes reflections and highlight control on surfaces.",
      id: "reflective",
      label: "Reflective",
    },
  ],
  motion: [
    {
      clause: "still composition with no motion blur",
      description: "Freezes the subject without implied movement.",
      id: "still",
      label: "Still",
    },
  ],
} as const satisfies Record<CreativeField, readonly CreativeOption[]>;

/** Result of applying creative direction to a base prompt. */
export interface CreativePromptResult {
  /** Sanitized user prompt before Motif adds creative clauses. */
  basePrompt: string;
  creative: {
    /** Clauses appended to the prompt, de-duplicated in canonical field order. */
    clauses: string[];
    /** Validated option ids that were applied. */
    selected: CreativeDirection;
  };
  /** Final prompt sent to fal after creative enrichment. */
  prompt: string;
}

/** Input for Motif's prompt enrichment step. */
export interface EnrichPromptOptions {
  /** Optional selected creative option ids. */
  creative?: CreativeDirection;
  /** User-authored prompt before Motif normalization and enrichment. */
  prompt: string;
}

/**
 * Remove control characters and surrounding whitespace from a prompt.
 *
 * Newline style is normalized to `\n`; other text content is left unchanged.
 */
export function sanitizePrompt(prompt: string): string {
  return prompt.replace(CONTROL_CHAR_REGEX, "").replace(/\r\n/g, "\n").trim();
}

/**
 * Append selected creative direction clauses to a prompt.
 *
 * Options are validated against `CREATIVE_TAXONOMY`, applied in
 * `CREATIVE_FIELDS` order, and returned as metadata alongside the final prompt.
 */
export function enrichPrompt(
  options: EnrichPromptOptions,
): CreativePromptResult {
  const basePrompt = sanitizePrompt(options.prompt);
  const clauses: string[] = [];
  const selected: CreativeDirection = {};

  for (const field of CREATIVE_FIELDS) {
    const optionId = options.creative?.[field];
    if (!optionId) {
      continue;
    }

    const option = CREATIVE_TAXONOMY[field].find(
      (candidate) => candidate.id === optionId,
    );
    if (!option) {
      throw new CreativeOptionError({
        availableIds: CREATIVE_TAXONOMY[field].map((candidate) => candidate.id),
        field,
        value: optionId,
      });
    }

    selected[field] = option.id;
    if (!clauses.includes(option.clause)) {
      clauses.push(option.clause);
    }
  }

  return {
    basePrompt,
    creative: {
      clauses,
      selected,
    },
    prompt: clauses.length ? [basePrompt, ...clauses].join(", ") : basePrompt,
  };
}
