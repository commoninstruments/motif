// biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for prompt sanitization
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export type CreativeField =
  | "recipe"
  | "shot"
  | "lighting"
  | "genre"
  | "camera"
  | "color"
  | "material"
  | "motion";

export type CreativeDirection = Partial<Record<CreativeField, string>>;

export interface CreativeOption {
  clause: string;
  description: string;
  id: string;
  label: string;
}

export interface CreativeOptionErrorDetails {
  availableIds: string[];
  code: "INVALID_OPTION";
  field: CreativeField;
  value: string;
}

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

export interface CreativePromptResult {
  basePrompt: string;
  creative: {
    clauses: string[];
    selected: CreativeDirection;
  };
  prompt: string;
}

export interface EnrichPromptOptions {
  creative?: CreativeDirection;
  prompt: string;
}

export function sanitizePrompt(prompt: string): string {
  return prompt.replace(CONTROL_CHAR_REGEX, "").replace(/\r\n/g, "\n").trim();
}

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
