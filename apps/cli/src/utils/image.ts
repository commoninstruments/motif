import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DIMENSION_REGEX = /(\d+)\s*x\s*(\d+)/g;
const SIPS_HEIGHT_REGEX = /pixelHeight:\s*(\d+)/;
const SIPS_WIDTH_REGEX = /pixelWidth:\s*(\d+)/;

/** Minimal environment for child processes — excludes secrets like FAL_KEY */
const SAFE_ENV = { PATH: process.env.PATH ?? "" };

/** Run a command and return { stdout, exitCode } */
function exec(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { env: SAFE_ENV }, (error, stdout) => {
      resolve({
        stdout: stdout ?? "",
        exitCode: error ? ((error.code as number) ?? 1) : 0,
      });
    });
  });
}

/** Download an image from a URL and save it to a file */
export async function downloadImage(
  url: string,
  outputPath: string,
): Promise<void> {
  if (!url.startsWith("https://")) {
    throw new Error(`Refusing to download from non-HTTPS URL: ${url}`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(buffer));
}

/** Convert a local image file to a base64 data URL */
export async function imageToDataUrl(imagePath: string): Promise<string> {
  if (!existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const buffer = await readFile(imagePath);
  const base64 = buffer.toString("base64");

  // Detect MIME type from file content (magic bytes) rather than extension,
  // because sips can output JPEG data with a .png extension
  let mimeType = "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    mimeType = "image/jpeg";
  } else if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46
  ) {
    mimeType = "image/webp";
  }

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Resize an image using sips (macOS)
 * Returns the path to the resized image (temp file if resized)
 */
export async function resizeImage(
  imagePath: string,
  maxSize = 1024,
): Promise<string> {
  const tempPath = `/tmp/motif-resize-${randomUUID()}.png`;

  try {
    const result = await exec("sips", [
      "-Z",
      String(maxSize),
      imagePath,
      "--out",
      tempPath,
    ]);

    if (result.exitCode === 0 && existsSync(tempPath)) {
      return tempPath;
    }
  } catch {
    // sips not available, fall through
  }

  return imagePath;
}

/** Get image dimensions from a file */
export async function getImageDimensions(
  imagePath: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const result = await exec("sips", [
      "-g",
      "pixelWidth",
      "-g",
      "pixelHeight",
      imagePath,
    ]);
    const width = result.stdout.match(SIPS_WIDTH_REGEX)?.[1];
    const height = result.stdout.match(SIPS_HEIGHT_REGEX)?.[1];

    if (result.exitCode === 0 && width && height) {
      return {
        width: Number.parseInt(width, 10),
        height: Number.parseInt(height, 10),
      };
    }
  } catch {
    // sips not available, fall back to file
  }

  try {
    const result = await exec("file", [imagePath]);
    const matches = [...result.stdout.matchAll(DIMENSION_REGEX)];
    const match = matches.at(-1);

    if (match?.[1] && match[2]) {
      return {
        width: Number.parseInt(match[1], 10),
        height: Number.parseInt(match[2], 10),
      };
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/** Get file size in human-readable format */
export function getFileSize(filePath: string): string {
  const { size: bytes } = statSync(filePath);

  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Generate a timestamped filename */
export function generateFilename(prefix = "motif"): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `${prefix}-${timestamp}.png`;
}

/** Open an image in Preview (macOS) or default viewer */
export function openImage(imagePath: string): void {
  if (!existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const absolutePath = resolve(imagePath);

  if (process.platform === "darwin") {
    execFile("open", [absolutePath], { env: SAFE_ENV }, () => {
      // Fire-and-forget: viewer errors are non-fatal
    });
  } else if (process.platform === "linux") {
    execFile("xdg-open", [absolutePath], { env: SAFE_ENV }, () => {
      // Fire-and-forget: viewer errors are non-fatal
    });
  }
}

/** Delete a temporary file safely */
export function deleteTempFile(filePath: string): void {
  try {
    if (filePath.startsWith("/tmp/motif-") && existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
