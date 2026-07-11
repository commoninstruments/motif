import react from "@howells/lint/oxlint/react";
import { disabledReactDoctorRules } from "@howells/lint/oxlint/react-doctor-rules";

// Single root config for the whole monorepo, per the @howells/lint README's
// mixed-monorepo pattern (one root config extending the largest needed preset,
// with per-glob overrides for narrower packages). A single root config is also
// required mechanically: `options.typeAware` is only legal in the root config,
// while per-package turbo runs (`howells-check .` from a package dir) discover
// this file by walking upward, and root-cwd runs (lint-staged / pre-commit) read
// it directly — so both contexts resolve the same configuration.
//
// Lane choice: `react` (not `core`) because apps/cli's Studio screens are
// genuine React (.tsx) rendered through ink, keeping hook-correctness rules
// (rules-of-hooks, exhaustive-deps, jsx-key) and no-generic-component-suffix.
// React Doctor's rules, however, target react-dom web apps: on ink (terminal
// renderer, no DOM, its own reconciler) rules like rerender-functional-setstate,
// no-giant-component, prefer-useReducer, no-event-handler, and react-compiler
// fire as noise rather than real defects, and the node-only packages have no
// React at all. Per MIGRATIONS.md they are disabled as a documented migration
// exception with a removal path.
export default {
  extends: [react],
  options: {
    // Migration exception (see MIGRATIONS.md): the codebase is not yet clean
    // under Oxlint type-aware mode — strict-boolean-expressions and no-unsafe-*
    // fire in the hundreds against fal's untyped responses and ink's loose
    // props. Disabled temporarily to adopt the lane; removal + type-aware
    // cleanup tracked as follow-up tech debt.
    typeAware: false,
  },
  rules: {
    // Migration exception: React Doctor rules are DOM-oriented (see header note).
    ...disabledReactDoctorRules,
    // React Compiler targets react-dom builds; ink is not compiled by it.
    "react/react-compiler": "off",
    // Repo convention: function declarations, not expressions. Flipping every
    // top-level helper is a convention change, not a mechanical fix.
    "func-style": "off",
    // Repo relies on function hoisting; helpers are defined below their callers.
    "no-use-before-define": "off",
    // MotifServer/tool handlers intentionally expose methods that don't use `this`.
    "class-methods-use-this": "off",
    // Repo imports named members from node builtins (e.g. node:path).
    "unicorn/import-style": "off",
    // Object key order in model/schema metadata is semantic (rank, tiers), not
    // alphabetical.
    "sort-keys": "off",
    // Sequential awaits are intentional (queue polling, ordered generation,
    // pagination).
    "no-await-in-loop": "off",
    // Promise-based sleep/poll helpers (`new Promise(r => setTimeout(r, ...))`)
    // are legitimate.
    "no-promise-executor-return": "off",
    "promise/avoid-new": "off",
    "promise/param-names": "off",
    // Adding the `u` flag changes regex matching semantics — not
    // behavior-preserving.
    "require-unicode-regexp": "off",
    // Data/metadata modules (models, leaderboards) repeat display literals by
    // design.
    "sonarjs/no-duplicate-string": "off",
    // Large validate/build/dispatch functions are inherently branchy; refactoring
    // them is not a behavior-preserving mechanical change.
    "sonarjs/cognitive-complexity": "off",
    // Platform constraint: the tsconfig targets ES2022 (via
    // @howells/typescript-config), so Array#toReversed/#toSorted are not in the
    // type lib. `[...arr].reverse()` / local `arr.sort()` are the intended
    // idioms. (Re-enable if the target moves to ES2023.)
    "unicorn/no-array-reverse": "off",
    "unicorn/no-array-sort": "off",
    // Style-only rules that conflict with existing control flow / expressions.
    "unicorn/no-lonely-if": "off",
    "sonarjs/no-collapsible-if": "off",
    "no-nested-ternary": "off",
    "unicorn/no-nested-ternary": "off",
    "sonarjs/no-nested-conditional": "off",
    "no-plusplus": "off",
    "no-inline-comments": "off",
    "prefer-named-capture-group": "off",
    "prefer-destructuring": "off",
    "unicorn/prefer-response-static-json": "off",
    // Types legitimately model more than 3 union members (model ids, aspects,
    // tools).
    "sonarjs/max-union-size": "off",
    // Small related classes (server + error type) are colocated intentionally.
    "max-classes-per-file": "off",
    // Exhaustive switches over string-literal unions; TS covers missing cases.
    "default-case": "off",
  },
  overrides: [
    {
      // apps/cli-specific relaxations (kept scoped so the packages stay stricter).
      files: ["apps/cli/**"],
      rules: {
        // Repo uses non-null assertions after explicit validation/guards.
        "no-non-null-assertion": "off",
        // Async functions kept async for signature/interface consistency even
        // without await.
        "require-await": "off",
        // Style-only expression/branch preferences that conflict with existing
        // code.
        "sonarjs/no-nested-template-literals": "off",
        "sonarjs/expression-complexity": "off",
        "sonarjs/no-duplicated-branches": "off",
        "sonarjs/no-nested-incdec": "off",
        "sonarjs/bool-param-default": "off",
        "unicorn/no-await-expression-member": "off",
        "unicorn/prefer-logical-operator-over-ternary": "off",
        "unicorn/prefer-number-coercion": "off",
        "promise/prefer-await-to-then": "off",
        "promise/prefer-await-to-callbacks": "off",
        "github/no-then": "off",
        "no-shadow": "off",
        "consistent-return": "off",
        // Mixed type/value imports; type-only marking is a style choice here.
        "typescript/consistent-type-imports": "off",
      },
    },
    {
      // Deliberate compatibility barrel re-exporting the entire
      // @howells/motif-sdk surface (see AGENTS.md). The wildcard re-export is
      // the whole point of this deprecated wrapper package.
      files: ["packages/motif-server/src/index.ts"],
      rules: {
        "oxc/no-barrel-file": "off",
        "sonarjs/no-wildcard-import": "off",
      },
    },
    {
      // Env-access boundaries: the SDK env schema module (the rule's diagnostic
      // explicitly permits env schema files) and the CLI's FAL_KEY/config
      // resolution boundary.
      files: [
        "packages/motif-sdk/src/env.ts",
        "apps/cli/src/api/fal.ts",
        "apps/cli/src/utils/image.ts",
      ],
      rules: {
        "no-restricted-properties": "off",
      },
    },
    {
      // image.ts opens generated files with the platform viewer and stages files
      // in the OS temp dir — both intentional for a local image CLI.
      files: ["apps/cli/src/utils/image.ts"],
      rules: {
        "sonarjs/no-os-command-from-path": "off",
        "sonarjs/publicly-writable-directories": "off",
      },
    },
    {
      // Exact-file max-lines exceptions: models.ts is a metadata table (data,
      // not logic); create-server.ts registers every MCP tool inline; the CLI
      // command/screen files are oversized god files whose split is a real
      // follow-up refactor, out of scope for the lint migration.
      files: [
        "packages/motif-sdk/src/models.ts",
        "packages/motif-mcp/src/create-server.ts",
        "apps/cli/src/cli.ts",
        "apps/cli/src/commands/describe.ts",
        "apps/cli/src/commands/series.ts",
        "apps/cli/src/studio/screens/generate.tsx",
      ],
      rules: {
        "max-lines": "off",
      },
    },
    {
      // Test files: the shared preset's test overlay only relaxes
      // size/complexity. Tests also legitimately read env, use temp dirs, `new`,
      // and dynamic imports.
      files: ["**/*.test.{js,jsx,ts,tsx}", "**/*.spec.{js,jsx,ts,tsx}"],
      rules: {
        "no-restricted-properties": "off",
        "sonarjs/publicly-writable-directories": "off",
        "sonarjs/no-undefined-assignment": "off",
        "promise/avoid-new": "off",
        "howells/no-runtime-dynamic-imports": "off",
        "unicorn/prefer-module": "off",
        // Second arg to expect() is a debug label vitest ignores; test-quality
        // finding, not a runtime issue.
        "vitest/valid-expect": "off",
        // Broad integration test files legitimately exceed the line budget.
        "max-lines": "off",
      },
    },
  ],
};
