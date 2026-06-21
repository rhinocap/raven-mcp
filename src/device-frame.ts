import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import {
  auditImageEdges,
  type ImageEdgeOptions,
  type ImageEdgeSample,
  type ImageEdgeVerdict
} from "./asset-integrity.js";

export type ObjectFit = "fill" | "cover" | "contain" | "none" | "scale-down";

export type DeviceFrameSample = {
  selector: string;
  container: { w: number; h: number };
  media: { w: number; h: number };
  objectFit?: ObjectFit;
  objectPosition?: { x: number; y: number };
};

export type CropAxis = {
  cropped_fraction: number;
  lost_start: number;
  lost_end: number;
};

export type DeviceFrameVerdict = {
  selector: string;
  object_fit: ObjectFit;
  container_ar: number;
  media_ar: number;
  verdict: "fits" | "cropped" | "letterboxed" | "distorted" | "inconclusive";
  cropped_edges: Array<"top" | "bottom" | "left" | "right">;
  crop_fraction: number;
  distortion: number;
  horizontal: CropAxis;
  vertical: CropAxis;
  confidence: number;
  reason: string;
};

export type DeviceFrameOptions = {
  cropThreshold?: number;
  distortionThreshold?: number;
};

export type ClipMotionInput = { label: string; firstFramePath: string; lastFramePath: string };

export type MotionVerdict = {
  label: string;
  verdict: "static" | "pan" | "zoom" | "pan-zoom" | "inconclusive";
  mean_displacement: number;
  zoom_ratio: number;
  pan_vector: { dx: number; dy: number };
  confidence: number;
  warnings: string[];
  reason: string;
};

export type MotionOptions = {
  grid?: number;
  searchRadius?: number;
  downsampleWidth?: number;
  staticThreshold?: number;
  zoomThreshold?: number;
};

export type FrameEdgeInput = { label: string; framePath: string };

type DecodedPng = {
  width: number;
  height: number;
  data: Uint8Array;
};

type PngModule = {
  PNG?: {
    sync?: {
      read?: (buffer: Buffer) => DecodedPng;
    };
  };
};

type LumaImage = {
  width: number;
  height: number;
  data: number[];
};

type MotionVector = {
  dx: number;
  dy: number;
  rx: number;
  ry: number;
  mag: number;
};

const EMPTY_AXIS: CropAxis = { cropped_fraction: 0, lost_start: 0, lost_end: 0 };
const EDGE_EPSILON = 0.000001;

export function auditDeviceFrames(
  samples: DeviceFrameSample[],
  opts: DeviceFrameOptions = {}
): DeviceFrameVerdict[] {
  return (samples || []).map(function (sample) {
    return auditDeviceFrame(sample, opts);
  });
}

export async function auditClipMotion(
  inputs: ClipMotionInput[],
  opts: MotionOptions = {}
): Promise<MotionVerdict[]> {
  // @ts-ignore pngjs is intentionally optional; absence falls back to inconclusive-with-warning.
  const pngMod = (await import("pngjs").catch(() => null)) as PngModule | null;
  const readPng = pngMod?.PNG?.sync?.read;

  return (inputs || []).map(function (input) {
    if (!readPng) {
      return inconclusiveMotion(input.label, [
        "pngjs not installed — cannot analyze clip motion"
      ]);
    }

    return auditClipMotionInput(input, readPng, opts);
  });
}

export async function auditFrameEdges(
  inputs: FrameEdgeInput[],
  opts: ImageEdgeOptions = {}
): Promise<ImageEdgeVerdict[]> {
  // @ts-ignore pngjs is intentionally optional; absence falls back to inconclusive-with-warning.
  const pngMod = (await import("pngjs").catch(() => null)) as PngModule | null;
  const readPng = pngMod?.PNG?.sync?.read;
  const samples: ImageEdgeSample[] = [];
  const results: ImageEdgeVerdict[] = [];

  for (let i = 0; i < (inputs || []).length; i += 1) {
    const input = inputs[i];

    if (!readPng) {
      results.push(inconclusiveEdge(input.label, "pngjs not installed — cannot sample frame edges"));
      continue;
    }

    let png: DecodedPng;
    try {
      png = readPng(readFileSync(input.framePath));
    } catch (error) {
      results.push(inconclusiveEdge(input.label, "Could not read/decode frame PNG: " + errorMessage(error)));
      continue;
    }

    const thickness = Math.max(2, Math.round(Math.min(png.width, png.height) * 0.03));
    samples.push({
      selector: input.label,
      width: png.width,
      height: png.height,
      edges: {
        top: stripLuminanceVariance(png, 0, 0, png.width, Math.min(thickness, png.height)),
        bottom: stripLuminanceVariance(
          png,
          0,
          Math.max(0, png.height - thickness),
          png.width,
          Math.min(thickness, png.height)
        ),
        left: stripLuminanceVariance(png, 0, 0, Math.min(thickness, png.width), png.height),
        right: stripLuminanceVariance(
          png,
          Math.max(0, png.width - thickness),
          0,
          Math.min(thickness, png.width),
          png.height
        )
      },
      tainted: false
    });
  }

  return results.concat(auditImageEdges(samples, opts));
}

function auditDeviceFrame(
  sample: DeviceFrameSample,
  opts: DeviceFrameOptions
): DeviceFrameVerdict {
  const cropThreshold = opts.cropThreshold ?? 0.02;
  const distortionThreshold = opts.distortionThreshold ?? 0.02;
  const objectFit = sample.objectFit ?? "fill";
  const cw = sample.container.w;
  const ch = sample.container.h;
  const mw = sample.media.w;
  const mh = sample.media.h;
  const containerAr = ch > 0 ? cw / ch : 0;
  const mediaAr = mh > 0 ? mw / mh : 0;
  const pos = {
    x: clamp(sample.objectPosition?.x ?? 0.5, 0, 1),
    y: clamp(sample.objectPosition?.y ?? 0.5, 0, 1)
  };

  if (cw <= 0 || ch <= 0 || mw <= 0 || mh <= 0) {
    return {
      selector: sample.selector,
      object_fit: objectFit,
      container_ar: containerAr,
      media_ar: mediaAr,
      verdict: "inconclusive",
      cropped_edges: [],
      crop_fraction: 0,
      distortion: 0,
      horizontal: zeroAxis(),
      vertical: zeroAxis(),
      confidence: 0,
      reason: "container and media dimensions must be positive to audit device-frame crop"
    };
  }

  if (objectFit === "cover") {
    return coverVerdict(sample.selector, objectFit, cw, ch, mw, mh, containerAr, mediaAr, pos, cropThreshold);
  }

  if (objectFit === "contain") {
    return containVerdict(sample.selector, objectFit, cw, ch, mw, mh, containerAr, mediaAr, cropThreshold);
  }

  if (objectFit === "none") {
    return noneVerdict(sample.selector, objectFit, cw, ch, mw, mh, containerAr, mediaAr, pos, cropThreshold);
  }

  if (objectFit === "scale-down") {
    if (mw <= cw && mh <= ch) {
      return noneVerdict(sample.selector, objectFit, cw, ch, mw, mh, containerAr, mediaAr, pos, cropThreshold);
    }
    return containVerdict(sample.selector, objectFit, cw, ch, mw, mh, containerAr, mediaAr, cropThreshold);
  }

  return fillVerdict(sample.selector, objectFit, containerAr, mediaAr, distortionThreshold);
}

function coverVerdict(
  selector: string,
  objectFit: ObjectFit,
  cw: number,
  ch: number,
  mw: number,
  mh: number,
  containerAr: number,
  mediaAr: number,
  pos: { x: number; y: number },
  cropThreshold: number
): DeviceFrameVerdict {
  const scale = Math.max(cw / mw, ch / mh);
  const dispW = mw * scale;
  const dispH = mh * scale;
  const horizontal = splitCrop(Math.max(0, (dispW - cw) / dispW), pos.x);
  const vertical = splitCrop(Math.max(0, (dispH - ch) / dispH), pos.y);
  const cropFraction = clamp(1 - (cw / dispW) * (ch / dispH), 0, 1);
  const verdict = cropFraction > cropThreshold ? "cropped" : "fits";
  const croppedEdges = verdict === "cropped" ? croppedEdgesForAxes(horizontal, vertical, cropThreshold) : [];

  return {
    selector,
    object_fit: objectFit,
    container_ar: containerAr,
    media_ar: mediaAr,
    verdict,
    cropped_edges: croppedEdges,
    crop_fraction: cropFraction,
    distortion: 0,
    horizontal,
    vertical,
    confidence: metricConfidence(cropFraction, cropThreshold, verdict !== "fits"),
    reason:
      verdict === "cropped"
        ? cropReason(croppedEdges, cropFraction)
        : "cover media fits the frame without meaningful crop"
  };
}

function containVerdict(
  selector: string,
  objectFit: ObjectFit,
  cw: number,
  ch: number,
  mw: number,
  mh: number,
  containerAr: number,
  mediaAr: number,
  cropThreshold: number
): DeviceFrameVerdict {
  const scale = Math.min(cw / mw, ch / mh);
  const dispW = mw * scale;
  const dispH = mh * scale;
  const letterboxTrack = clamp(1 - (dispW * dispH) / (cw * ch), 0, 1);
  const verdict = letterboxTrack > cropThreshold ? "letterboxed" : "fits";

  return {
    selector,
    object_fit: objectFit,
    container_ar: containerAr,
    media_ar: mediaAr,
    verdict,
    cropped_edges: [],
    crop_fraction: 0,
    distortion: 0,
    horizontal: zeroAxis(),
    vertical: zeroAxis(),
    confidence: metricConfidence(letterboxTrack, cropThreshold, verdict !== "fits"),
    reason:
      verdict === "letterboxed"
        ? "contain media is fully visible with " + percent(letterboxTrack) + " empty letterbox track"
        : "contain media fits the frame without meaningful letterbox track"
  };
}

function noneVerdict(
  selector: string,
  objectFit: ObjectFit,
  cw: number,
  ch: number,
  mw: number,
  mh: number,
  containerAr: number,
  mediaAr: number,
  pos: { x: number; y: number },
  cropThreshold: number
): DeviceFrameVerdict {
  const horizontal = splitCrop(Math.max(0, (mw - cw) / mw), pos.x);
  const vertical = splitCrop(Math.max(0, (mh - ch) / mh), pos.y);
  const cropFraction = clamp(1 - (Math.min(cw, mw) / mw) * (Math.min(ch, mh) / mh), 0, 1);
  const verdict = cropFraction > cropThreshold ? "cropped" : "fits";
  const croppedEdges = verdict === "cropped" ? croppedEdgesForAxes(horizontal, vertical, cropThreshold) : [];

  return {
    selector,
    object_fit: objectFit,
    container_ar: containerAr,
    media_ar: mediaAr,
    verdict,
    cropped_edges: croppedEdges,
    crop_fraction: cropFraction,
    distortion: 0,
    horizontal,
    vertical,
    confidence: metricConfidence(cropFraction, cropThreshold, verdict !== "fits"),
    reason:
      verdict === "cropped"
        ? cropReason(croppedEdges, cropFraction)
        : objectFit + " media fits the frame without meaningful crop"
  };
}

function fillVerdict(
  selector: string,
  objectFit: ObjectFit,
  containerAr: number,
  mediaAr: number,
  distortionThreshold: number
): DeviceFrameVerdict {
  const distortion = Math.abs(containerAr / mediaAr - 1);
  const verdict = distortion > distortionThreshold ? "distorted" : "fits";

  return {
    selector,
    object_fit: objectFit,
    container_ar: containerAr,
    media_ar: mediaAr,
    verdict,
    cropped_edges: [],
    crop_fraction: 0,
    distortion,
    horizontal: zeroAxis(),
    vertical: zeroAxis(),
    confidence: metricConfidence(distortion, distortionThreshold, verdict !== "fits"),
    reason:
      verdict === "distorted"
        ? "fill stretches media by " + percent(distortion) + " relative aspect-ratio distortion"
        : "fill media does not exceed the distortion threshold"
  };
}

function auditClipMotionInput(
  input: ClipMotionInput,
  readPng: (buffer: Buffer) => DecodedPng,
  opts: MotionOptions
): MotionVerdict {
  const warnings: string[] = [];
  const grid = Math.max(1, Math.round(opts.grid ?? 6));
  const searchRadius = Math.max(0, Math.round(opts.searchRadius ?? 6));
  const downsampleWidth = Math.max(8, Math.round(opts.downsampleWidth ?? 96));
  const staticThreshold = opts.staticThreshold ?? 0.6;
  const zoomThreshold = opts.zoomThreshold ?? 0.02;
  let first: DecodedPng;
  let last: DecodedPng;

  try {
    first = readPng(readFileSync(input.firstFramePath));
  } catch (error) {
    return inconclusiveMotion(input.label, ["Could not read/decode first frame PNG: " + errorMessage(error)]);
  }

  try {
    last = readPng(readFileSync(input.lastFramePath));
  } catch (error) {
    return inconclusiveMotion(input.label, ["Could not read/decode last frame PNG: " + errorMessage(error)]);
  }

  if (first.width <= 0 || first.height <= 0 || last.width <= 0 || last.height <= 0) {
    return inconclusiveMotion(input.label, ["Frame dimensions must be positive to analyze clip motion"]);
  }

  if (first.width !== last.width || first.height !== last.height) {
    warnings.push("Frame dimensions differ — both frames were resampled to the first frame aspect ratio");
  }

  const downsampleHeight = Math.max(1, Math.round(downsampleWidth * first.height / first.width));
  const a = resampleLuma(first, downsampleWidth, downsampleHeight);
  const b = resampleLuma(last, downsampleWidth, downsampleHeight);
  const vectors = blockMotionVectors(a, b, grid, searchRadius);

  if (vectors.length === 0) {
    return inconclusiveMotion(input.label, ["No valid motion blocks could be matched"]);
  }

  let dxTotal = 0;
  let dyTotal = 0;
  let magTotal = 0;
  let dotTotal = 0;
  let radiusSqTotal = 0;
  let radiusTotal = 0;

  for (let i = 0; i < vectors.length; i += 1) {
    const v = vectors[i];
    dxTotal += v.dx;
    dyTotal += v.dy;
    magTotal += v.mag;
    dotTotal += v.dx * v.rx + v.dy * v.ry;
    radiusSqTotal += v.rx * v.rx + v.ry * v.ry;
    radiusTotal += Math.hypot(v.rx, v.ry);
  }

  const panVector = { dx: dxTotal / vectors.length, dy: dyTotal / vectors.length };
  const meanDisplacement = magTotal / vectors.length;
  const zoomRatio = 1 + (radiusSqTotal > 0 ? dotTotal / radiusSqTotal : 0);
  const meanRadius = radiusTotal / vectors.length;
  const panMag = Math.hypot(panVector.dx, panVector.dy);
  const zoomMag = Math.abs(zoomRatio - 1) * meanRadius;
  let verdict: MotionVerdict["verdict"];

  if (meanDisplacement < staticThreshold && Math.abs(zoomRatio - 1) < zoomThreshold) {
    verdict = "static";
  } else if (panMag > staticThreshold && zoomMag > staticThreshold) {
    verdict = "pan-zoom";
  } else if (zoomMag >= panMag) {
    verdict = "zoom";
  } else {
    verdict = "pan";
  }

  const decidingMetric = verdict === "static" ? Math.max(meanDisplacement, Math.abs(zoomRatio - 1)) : Math.max(panMag, zoomMag);
  const confidence =
    verdict === "static"
      ? clamp(1 - Math.max(meanDisplacement / staticThreshold, Math.abs(zoomRatio - 1) / zoomThreshold), 0, 1)
      : Math.max(0.5, clamp(decidingMetric / (staticThreshold * 4), 0, 1));

  return {
    label: input.label,
    verdict,
    mean_displacement: round4(meanDisplacement),
    zoom_ratio: round4(zoomRatio),
    pan_vector: { dx: round4(panVector.dx), dy: round4(panVector.dy) },
    confidence: round2(confidence),
    warnings,
    reason: motionReason(verdict, zoomRatio, panVector, meanDisplacement)
  };
}

function blockMotionVectors(
  a: LumaImage,
  b: LumaImage,
  grid: number,
  searchRadius: number
): MotionVector[] {
  const vectors: MotionVector[] = [];
  const cellW = a.width / grid;
  const cellH = a.height / grid;
  const blockW = Math.max(3, Math.floor(cellW / 4));
  const blockH = Math.max(3, Math.floor(cellH / 4));
  const centerX = (a.width - 1) / 2;
  const centerY = (a.height - 1) / 2;

  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const cx = Math.round((gx + 0.5) * cellW);
      const cy = Math.round((gy + 0.5) * cellH);
      const x0 = clampInt(cx - Math.floor(blockW / 2), 0, a.width - blockW);
      const y0 = clampInt(cy - Math.floor(blockH / 2), 0, a.height - blockH);
      const best = bestBlockOffset(a, b, x0, y0, blockW, blockH, searchRadius);

      vectors.push({
        dx: best.dx,
        dy: best.dy,
        rx: cx - centerX,
        ry: cy - centerY,
        mag: Math.hypot(best.dx, best.dy)
      });
    }
  }

  return vectors;
}

function bestBlockOffset(
  a: LumaImage,
  b: LumaImage,
  x0: number,
  y0: number,
  blockW: number,
  blockH: number,
  searchRadius: number
): { dx: number; dy: number } {
  let bestScore = Number.POSITIVE_INFINITY;
  let best = { dx: 0, dy: 0 };

  for (let dy = -searchRadius; dy <= searchRadius; dy += 1) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
      const bx = x0 + dx;
      const by = y0 + dy;
      if (bx < 0 || by < 0 || bx + blockW > b.width || by + blockH > b.height) {
        continue;
      }

      const score = blockSad(a, b, x0, y0, bx, by, blockW, blockH);
      if (score < bestScore) {
        bestScore = score;
        best = { dx, dy };
      }
    }
  }

  return best;
}

function blockSad(
  a: LumaImage,
  b: LumaImage,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  blockW: number,
  blockH: number
): number {
  let total = 0;

  for (let y = 0; y < blockH; y += 1) {
    for (let x = 0; x < blockW; x += 1) {
      total += Math.abs(
        a.data[(ay + y) * a.width + ax + x] -
        b.data[(by + y) * b.width + bx + x]
      );
    }
  }

  return total;
}

function resampleLuma(png: DecodedPng, targetW: number, targetH: number): LumaImage {
  const data: number[] = [];

  for (let y = 0; y < targetH; y += 1) {
    const yStart = Math.floor(y * png.height / targetH);
    const yEnd = Math.max(yStart + 1, Math.ceil((y + 1) * png.height / targetH));

    for (let x = 0; x < targetW; x += 1) {
      const xStart = Math.floor(x * png.width / targetW);
      const xEnd = Math.max(xStart + 1, Math.ceil((x + 1) * png.width / targetW));
      let total = 0;
      let count = 0;

      for (let sy = yStart; sy < yEnd && sy < png.height; sy += 1) {
        for (let sx = xStart; sx < xEnd && sx < png.width; sx += 1) {
          const index = (sy * png.width + sx) * 4;
          total += pixelLuminance(png.data[index], png.data[index + 1], png.data[index + 2]);
          count += 1;
        }
      }

      data.push(count > 0 ? total / count : 0);
    }
  }

  return { width: targetW, height: targetH, data };
}

function splitCrop(croppedFraction: number, position: number): CropAxis {
  return {
    cropped_fraction: croppedFraction,
    lost_start: croppedFraction * position,
    lost_end: croppedFraction * (1 - position)
  };
}

function croppedEdgesForAxes(
  horizontal: CropAxis,
  vertical: CropAxis,
  cropThreshold: number
): Array<"top" | "bottom" | "left" | "right"> {
  const out: Array<"top" | "bottom" | "left" | "right"> = [];

  if (vertical.cropped_fraction > cropThreshold) {
    if (vertical.lost_start > EDGE_EPSILON) out.push("top");
    if (vertical.lost_end > EDGE_EPSILON) out.push("bottom");
  }

  if (horizontal.cropped_fraction > cropThreshold) {
    if (horizontal.lost_start > EDGE_EPSILON) out.push("left");
    if (horizontal.lost_end > EDGE_EPSILON) out.push("right");
  }

  return out;
}

function zeroAxis(): CropAxis {
  return { ...EMPTY_AXIS };
}

function metricConfidence(metric: number, threshold: number, nonFit: boolean): number {
  if (threshold <= 0) {
    return nonFit ? 1 : 0;
  }
  return nonFit
    ? round2(Math.max(0.5, clamp(metric / (threshold * 4), 0, 1)))
    : round2(clamp(1 - metric / threshold, 0, 1));
}

function cropReason(edges: Array<"top" | "bottom" | "left" | "right">, cropFraction: number): string {
  const edgeText = edges.length > 0 ? edges.join(" and ") : "frame";
  return "content is cropped at the " + edgeText + " edge(s), hiding " + percent(cropFraction) + " of media area";
}

function motionReason(
  verdict: MotionVerdict["verdict"],
  zoomRatio: number,
  panVector: { dx: number; dy: number },
  meanDisplacement: number
): string {
  if (verdict === "static") {
    return "frames are static; mean block displacement is " + round4(meanDisplacement) + " downsampled px";
  }

  if (verdict === "zoom") {
    return "frame zooms " + zoomDirection(zoomRatio) + " ~" + percent(Math.abs(zoomRatio - 1)) + " (Ken Burns) — composition drifts; content near edges is pushed out of frame";
  }

  if (verdict === "pan") {
    return "frame pans by " + round4(panVector.dx) + "×" + round4(panVector.dy) + " downsampled px — composition drifts inside the clip";
  }

  if (verdict === "pan-zoom") {
    return "frame pans and zooms " + zoomDirection(zoomRatio) + " ~" + percent(Math.abs(zoomRatio - 1)) + " (Ken Burns) — content near edges is pushed out of frame";
  }

  return "clip motion could not be analyzed";
}

function zoomDirection(zoomRatio: number): string {
  return zoomRatio >= 1 ? "in" : "out";
}

function inconclusiveMotion(label: string, warnings: string[]): MotionVerdict {
  return {
    label,
    verdict: "inconclusive",
    mean_displacement: 0,
    zoom_ratio: 1,
    pan_vector: { dx: 0, dy: 0 },
    confidence: 0,
    warnings,
    reason: warnings.join("; ")
  };
}

function inconclusiveEdge(label: string, reason: string): ImageEdgeVerdict {
  return {
    selector: label,
    verdict: "inconclusive",
    cut_edge: null,
    confidence: 0,
    edges: { top: 0, bottom: 0, left: 0, right: 0 },
    reason
  };
}

function stripLuminanceVariance(
  png: DecodedPng,
  x0: number,
  y0: number,
  w: number,
  h: number
): number {
  const pixelCount = w * h;
  if (pixelCount <= 0) {
    return 0;
  }

  let lumaTotal = 0;
  const luminances: number[] = [];

  for (let y = y0; y < y0 + h && y < png.height; y += 1) {
    for (let x = x0; x < x0 + w && x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      const luminance = pixelLuminance(png.data[index], png.data[index + 1], png.data[index + 2]);

      luminances.push(luminance);
      lumaTotal += luminance;
    }
  }

  const mean = lumaTotal / luminances.length;
  let squaredDeltaTotal = 0;

  for (let i = 0; i < luminances.length; i += 1) {
    const delta = luminances[i] - mean;
    squaredDeltaTotal += delta * delta;
  }

  return squaredDeltaTotal / luminances.length;
}

function pixelLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function percent(value: number): string {
  return Math.round(value * 1000) / 10 + "%";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
