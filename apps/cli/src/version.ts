import { readFileSync } from "node:fs";

export function getPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };

    return typeof packageJson.version === "string"
      ? packageJson.version
      : "unknown";
  } catch {
    return "unknown";
  }
}

export const PACKAGE_VERSION = getPackageVersion();
