// Image type sniffing and header dimension readers for grab attachments.
// Contract stub — L11 replaces every body. No dependencies; pure byte reads.
export type ImageKind = "png" | "jpeg" | "webp" | "gif" | "avif" | "svg";

export var IMAGE_MIME_BY_KIND: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml"
};

export var ACCEPTED_IMAGE_MIMES: string[] = Object.keys(IMAGE_MIME_BY_KIND).map(function (k) { return IMAGE_MIME_BY_KIND[k as ImageKind]; });

// Case-insensitive; strips ";charset=..." parameters; "image/jpg" counts as jpeg.
export function imageKindForMime(_mime: string): ImageKind | null {
  throw new Error("stub: imageKindForMime");
}

// From the file name's extension: .png .jpg .jpeg .webp .gif .avif .svg
export function imageKindForExtension(_name: string): ImageKind | null {
  throw new Error("stub: imageKindForExtension");
}

// Magic bytes. PNG 89 50 4E 47; JPEG FF D8 FF; GIF "GIF87a"/"GIF89a";
// WebP "RIFF"....."WEBP"; AVIF ISO-BMFF ftyp with brand avif/avis;
// SVG: optional BOM/whitespace/<?xml/<!--/<!DOCTYPE then "<svg".
export function sniffImageKind(_bytes: Uint8Array): ImageKind | null {
  throw new Error("stub: sniffImageKind");
}

// Header-only dimension read. Returns nulls when the header does not carry a
// size (SVG with no viewBox and no width/height, truncated headers).
export function readImageDimensions(_bytes: Uint8Array, _kind: ImageKind): { width: number | null; height: number | null } {
  throw new Error("stub: readImageDimensions");
}
