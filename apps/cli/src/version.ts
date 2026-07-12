import { readFileSync } from "node:fs";

export function getPackageVersion(): string {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf-8")
    );

    if (parsed !== null && typeof parsed === "object" && "version" in parsed) {
      const { version } = parsed;
      return typeof version === "string" ? version : "unknown";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export const PACKAGE_VERSION = getPackageVersion();
