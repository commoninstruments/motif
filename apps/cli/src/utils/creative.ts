import {
  CREATIVE_FIELDS,
  type CreativeDirection,
  type CreativeField,
} from "@howells/motif-sdk";

/** Merge per-field CLI flags over a base creative direction (flags win). */
export function resolveCreativeDirection(
  flags: Partial<Record<CreativeField, string>>,
  base?: CreativeDirection,
): CreativeDirection | undefined {
  const creative: CreativeDirection = {};
  for (const field of CREATIVE_FIELDS) {
    const value = flags[field] ?? base?.[field];
    if (value !== undefined) {
      creative[field] = value;
    }
  }
  return Object.values(creative).some(Boolean) ? creative : undefined;
}
