import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

export type AssetIntegrityResult = {
  path: string;
  bottom_variance: number;
  verdict: "clean" | "likely-sliced";
  confidence: number;
  warnings: string[];
};

export type AssetIntegrityOptions = {
  bottomFraction?: number;
  minRows?: number;
  varianceThreshold?: number;
};

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

const DATA_URL_PREFIX = /^data:image\/png;base64,/i;

export async function auditAssetIntegrity(
  imagePaths: string[],
  opts: AssetIntegrityOptions = {}
): Promise<AssetIntegrityResult[]> {
  // @ts-ignore pngjs is intentionally optional; absence falls back to clean-with-warning.
  const pngMod = (await import("pngjs").catch(() => null)) as PngModule | null;
  const PNG = pngMod?.PNG;
  const readPng = PNG?.sync?.read;

  return imagePaths.map(function (imagePath) {
    let buffer: Buffer;

    try {
      buffer = readFileSync(imagePath);
    } catch (error) {
      return fallbackResult(imagePath, [
        "Could not read file: " + errorMessage(error)
      ]);
    }

    if (!readPng) {
      return fallbackResult(imagePath, [
        "pngjs not installed — cannot analyze asset integrity"
      ]);
    }

    try {
      return auditPng(imagePath, readPng(buffer), opts);
    } catch (error) {
      return fallbackResult(imagePath, [
        "Failed to decode PNG: " + errorMessage(error)
      ]);
    }
  });
}

function stripPngPrefix(base64: string): string {
  return base64.replace(DATA_URL_PREFIX, "");
}

function fallbackResult(path: string, warnings: string[]): AssetIntegrityResult {
  return {
    path,
    bottom_variance: 0,
    verdict: "clean",
    confidence: 0,
    warnings
  };
}

function auditPng(
  path: string,
  png: DecodedPng,
  opts: AssetIntegrityOptions
): AssetIntegrityResult {
  const threshold = opts.varianceThreshold ?? 100;
  const bottomFraction = opts.bottomFraction ?? 0.05;
  const minRows = opts.minRows ?? 20;
  const stripHeight = Math.min(
    png.height,
    Math.max(minRows, Math.round(png.height * bottomFraction))
  );
  const bottomVariance = bottomLuminanceVariance(png, stripHeight);
  const verdict = bottomVariance > threshold ? "likely-sliced" : "clean";

  // Confidence is monotonic around the variance threshold: clean approaches 1 as
  // variance approaches 0; likely-sliced starts at 0.5 and approaches 1 by 4x threshold.
  const confidence =
    verdict === "clean"
      ? clamp(1 - bottomVariance / threshold, 0, 1)
      : Math.max(0.5, clamp(bottomVariance / (threshold * 4), 0, 1));

  return {
    path,
    bottom_variance: bottomVariance,
    verdict,
    confidence,
    warnings: []
  };
}

function bottomLuminanceVariance(png: DecodedPng, stripHeight: number): number {
  const startY = png.height - stripHeight;
  const pixelCount = png.width * stripHeight;

  if (pixelCount <= 0) {
    return 0;
  }

  let lumaTotal = 0;
  const luminances: number[] = [];

  for (let y = startY; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      const r = png.data[index];
      const g = png.data[index + 1];
      const b = png.data[index + 2];
      const luminance = pixelLuminance(r, g, b);

      luminances.push(luminance);
      lumaTotal += luminance;
    }
  }

  const mean = lumaTotal / pixelCount;
  let squaredDeltaTotal = 0;

  for (let i = 0; i < luminances.length; i += 1) {
    const delta = luminances[i] - mean;
    squaredDeltaTotal += delta * delta;
  }

  return squaredDeltaTotal / pixelCount;
}

function pixelLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ---------------------------------------------------------------------------
// Edge-symmetry analysis — flags rendered <img> whose content is cut at a frame
// edge. A finished image has uniform (low-variance) pixels along every edge
// (background/margin). A sliced export has HIGH-variance content running into
// one edge while the opposite edge stays uniform — an asymmetry no width/height
// ratio check can see. Edge luminance variances are collected in-page (canvas);
// this scorer turns the four numbers into a verdict.
// ---------------------------------------------------------------------------

export type ImageEdgeSample = {
  selector: string;
  width: number;
  height: number;
  edges: { top: number; bottom: number; left: number; right: number };
  tainted: boolean;
};

export type ImageEdgeVerdict = {
  selector: string;
  verdict: "clean" | "likely-sliced" | "inconclusive";
  cut_edge: "top" | "bottom" | "left" | "right" | null;
  confidence: number;
  edges: { top: number; bottom: number; left: number; right: number };
  reason: string;
};

export type ImageEdgeOptions = {
  highVarianceThreshold?: number;
  uniformRatio?: number;
};

export function auditImageEdges(
  samples: ImageEdgeSample[],
  opts: ImageEdgeOptions = {}
): ImageEdgeVerdict[] {
  const highVar = opts.highVarianceThreshold ?? 200;
  const uniformRatio = opts.uniformRatio ?? 0.25;

  return (samples || []).map(function (sample): ImageEdgeVerdict {
    const e = sample.edges;

    if (sample.tainted) {
      return {
        selector: sample.selector,
        verdict: "inconclusive",
        cut_edge: null,
        confidence: 0,
        edges: e,
        reason: "image pixels unreadable (cross-origin canvas taint) — could not sample edges"
      };
    }

    // Opposite-edge pairs: an edge "looks cut" when it carries high-variance
    // content while the edge facing it is near-uniform.
    const pairs: Array<{ edge: "top" | "bottom" | "left" | "right"; v: number; opposite: number }> = [
      { edge: "bottom", v: e.bottom, opposite: e.top },
      { edge: "top", v: e.top, opposite: e.bottom },
      { edge: "right", v: e.right, opposite: e.left },
      { edge: "left", v: e.left, opposite: e.right }
    ];

    let worst: { edge: "top" | "bottom" | "left" | "right"; v: number; opposite: number } | null = null;
    for (const p of pairs) {
      const asymmetric = p.v > highVar && p.opposite < highVar * uniformRatio;
      if (asymmetric && (worst === null || p.v > worst.v)) {
        worst = p;
      }
    }

    if (worst === null) {
      return {
        selector: sample.selector,
        verdict: "clean",
        cut_edge: null,
        confidence: clamp(1 - maxEdge(e) / highVar, 0, 1),
        edges: e,
        reason: "all edges uniform — no content running into a frame edge"
      };
    }

    // Confidence grows with how far the cut edge exceeds the threshold and how
    // uniform the opposite edge is.
    const overshoot = clamp(worst.v / (highVar * 4), 0, 1);
    const oppositeUniformity = clamp(1 - worst.opposite / (highVar * uniformRatio), 0, 1);
    const confidence = Math.max(0.5, (overshoot + oppositeUniformity) / 2);

    return {
      selector: sample.selector,
      verdict: "likely-sliced",
      cut_edge: worst.edge,
      confidence: Math.round(confidence * 100) / 100,
      edges: e,
      reason:
        "high-variance content at the " +
        worst.edge +
        " edge (variance " +
        Math.round(worst.v) +
        ") with a uniform opposite edge (variance " +
        Math.round(worst.opposite) +
        ") — content appears cut off at the " +
        worst.edge +
        " frame edge"
    };
  });
}

function maxEdge(e: { top: number; bottom: number; left: number; right: number }): number {
  return Math.max(e.top, e.bottom, e.left, e.right);
}
