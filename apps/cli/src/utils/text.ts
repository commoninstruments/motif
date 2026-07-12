/**
 * String truthiness helpers.
 *
 * These encode the exact truthiness semantics of `if (str)` / `strA || strB`
 * for optional string values, so the codebase can satisfy
 * `strict-boolean-expressions` and `prefer-nullish-coalescing` without
 * silently changing how empty strings behave in flag/stdin merging.
 *
 * `if (str)` is falsy for both `undefined`/`null` and the empty string `""`.
 * `strA || strB` falls through to `strB` for both cases too. `hasText` and
 * `firstText` preserve that behavior explicitly.
 */

/** True when a value is a non-empty string (matches the truthiness of `if (str)`). */
export function hasText(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value !== "";
}

/**
 * First non-empty string among the arguments, else `undefined`.
 *
 * Behaviorally identical to a `strA || strB || …` chain of optional strings:
 * each `undefined`/`null`/`""` operand is skipped. Terminate with `?? fallback`
 * when a required (non-optional) default should apply.
 */
export function firstText(
  ...values: (string | null | undefined)[]
): string | undefined {
  for (const value of values) {
    if (hasText(value)) {
      return value;
    }
  }
  return undefined;
}
