import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, parse, resolve } from "node:path";

const DIMENSION_REGEX = /(\d+)\s*x\s*(\d+)/g;
const SIPS_HEIGHT_REGEX = /pixelHeight:\s*(\d+)/;
const SIPS_WIDTH_REGEX = /pixelWidth:\s*(\d+)/;

/** Minimal environment for child processes — excludes secrets like FAL_KEY */
const SAFE_ENV = { PATH: process.env.PATH ?? "" };

/** Run a command and return { stdout, exitCode } */
async function exec(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; exitCode: number }> {
  return await new Promise((resolve) => {
    execFile(cmd, args, { env: SAFE_ENV }, (error, stdout) => {
      resolve({
        exitCode: error ? ((error.code as number) ?? 1) : 0,
        stdout: stdout ?? "",
      });
    });
  });
}

function detectImageExtension(
  buffer: Buffer,
  contentType: string | null
): ".gif" | ".jpg" | ".png" | ".webp" | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return ".jpg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return ".png";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return ".webp";
  }
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return ".gif";
  }

  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return ".jpg";
  }
  if (normalized === "image/png") {
    return ".png";
  }
  if (normalized === "image/webp") {
    return ".webp";
  }
  if (normalized === "image/gif") {
    return ".gif";
  }

  return null;
}

function withDetectedExtension(outputPath: string, extension: string | null) {
  if (!extension) {
    return outputPath;
  }

  const currentExtension = extname(outputPath).toLowerCase();
  if (
    currentExtension === extension ||
    (currentExtension === ".jpeg" && extension === ".jpg")
  ) {
    return outputPath;
  }

  if (!currentExtension) {
    return `${outputPath}${extension}`;
  }
  return `${outputPath.slice(0, -currentExtension.length)}${extension}`;
}

/** Download an image from a URL and save it to a file */
export async function downloadImage(
  url: string,
  outputPath: string
): Promise<string> {
  if (!url.startsWith("https://")) {
    throw new Error(`Refusing to download from non-HTTPS URL: ${url}`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const actualPath = withDetectedExtension(
    outputPath,
    detectImageExtension(buffer, response.headers.get("content-type"))
  );
  await writeFile(actualPath, buffer);
  return actualPath;
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
  maxSize = 1024
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
  imagePath: string
): Promise<{ width: number; height: number } | null> {
  try {
    const result = await exec("sips", [
      "-g",
      "pixelWidth",
      "-g",
      "pixelHeight",
      imagePath,
    ]);
    const width = SIPS_WIDTH_REGEX.exec(result.stdout)?.[1];
    const height = SIPS_HEIGHT_REGEX.exec(result.stdout)?.[1];

    if (result.exitCode === 0 && width && height) {
      return {
        height: Number.parseInt(height, 10),
        width: Number.parseInt(width, 10),
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
        height: Number.parseInt(match[2], 10),
        width: Number.parseInt(match[1], 10),
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

/** Path for image `index` in a multi-image batch: out.jpg -> out-1.jpg */
export function indexedOutputPath(outputPath: string, index: number): string {
  const { dir, name, ext } = parse(outputPath);
  return join(dir, `${name}-${index + 1}${ext || ".png"}`);
}

/** Generate a timestamped filename */
export function generateFilename(prefix = "motif"): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replaceAll(/[-:T]/g, "");
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
