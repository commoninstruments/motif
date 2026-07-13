/**
 * Internal dependency-injection seam for the image layer.
 *
 * These types are INTERNAL: they are consumed by `createMotifImage`'s `deps`
 * parameter and by the offline tests, but they are deliberately NOT re-exported
 * from the public `@howells/motif-sdk/image` subpath, so they never appear in
 * `dist/image.d.ts`. Import them from `./deps` inside the package (and from
 * `../src/image/deps` in tests).
 */

import type { generateImage, ImageModel } from "ai";

import type { ImageProviderId } from "./types";

/** A model resolver: builds an AI SDK `ImageModel` for a (provider, model, key). */
export type ResolveImageModel = (
  provider: ImageProviderId,
  modelId: string,
  apiKey?: string
) => ImageModel;

/** Internal dependency-injection seam (default: real `generateImage` + adapters). */
export interface MotifImageDeps {
  generateImage?: typeof generateImage;
  resolveModel?: ResolveImageModel;
}
