/**
 * JSON trust boundary for local, user-owned inputs.
 *
 * The CLI parses JSON from three local sources the user controls: config
 * files (`~/.motif/config.json`, `.motifrc`), the local history file, and
 * stdin payloads. These are trusted-shape boundaries: the CLI has always
 * merged/consumed whatever the user wrote, preserving unknown keys, and
 * validating individual fields at point of use. Funneling every parse
 * through this helper keeps that behavior and confines the single
 * unavoidable assertion to one documented line.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- return-only T lets each call site declare the trusted shape once instead of asserting
export function parseJsonAs<T>(raw: string): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- trusted local JSON (user-owned config/history/stdin); callers merge onto typed defaults and validate fields at point of use
  return JSON.parse(raw) as T;
}
