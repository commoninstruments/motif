import { defineConfig } from "tsup";

/**
 * Two independent build entries:
 *
 *  1. The core `.` entry (`src/index.ts`) keeps its existing dual CJS+ESM build
 *     with declaration files. It must emit the same outputs as before this file
 *     existed: dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts, and
 *     dist/index.d.cts.
 *
 *  2. The provider-agnostic image layer (`src/image/index.ts`) ships ESM-only
 *     (the Vercel AI SDK `ai@7` is ESM-only), as the `./image` subpath export:
 *     dist/image.js + dist/image.d.ts. No CJS/`require` condition.
 *
 * The `entry` object form fixes the output basenames (`index` / `image`) so the
 * two entries never collide on `dist/index.*`.
 *
 * Both entries set `clean: false`: tsup runs the two entries in parallel over a
 * shared `dist/`, so letting either one `clean` could race and wipe the other's
 * artifacts. `dist/` is instead cleaned deterministically BEFORE tsup by the
 * `build`/`dev` scripts in package.json (a dependency-free `node -e rmSync`).
 */
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: true,
    clean: false,
    sourcemap: false,
  },
  {
    entry: { image: "src/image/index.ts" },
    format: ["esm"],
    dts: true,
    clean: false,
    sourcemap: false,
  },
]);
