import { Buffer } from "node:buffer";

export type DimensionChange = {
  dimension: string;
  before: number;
  after: number;
  delta: number;
  direction: "improved" | "regressed" | "changed";
};

export type ScreenshotDiff = {
  fix_confirmed: boolean;
  changed_ratio: number;
  changed_region: { x: number; y: number; w: number; h: number } | null;
  dimensions: DimensionChange[];
  dimensions_note: string;
  warnings: string[];
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
const DIMENSIONS_NOTE =
  "Dimensions are image-derived proxies (pixel-level), not Raven principle scores. fix_confirmed reflects whether the rendered output actually changed.";

export async function diffScreenshots(
  beforeBase64: string = "",
  afterBase64: string = ""
): Promise<ScreenshotDiff> {
  let beforePngBase64 = beforeBase64;
  let afterPngBase64 = afterBase64;

  try {
    beforePngBase64 = stripPngPrefix(beforePngBase64);
    afterPngBase64 = stripPngPrefix(afterPngBase64);

    // @ts-ignore pngjs is intentionally optional; absence falls back to byte comparison.
    const pngModule = (await import("pngjs").catch(() => null)) as PngModule | null;
    const PNG = pngModule?.PNG;

    if (!PNG) {
      return fallbackDiff(beforePngBase64, afterPngBase64, [
        "pngjs not installed — install for region-level pixel diff; fell back to byte comparison"
      ]);
    }

    const readPng = PNG.sync?.read;
    if (!readPng) {
      return fallbackDiff(beforePngBase64, afterPngBase64, [
        "pngjs not installed — install for region-level pixel diff; fell back to byte comparison"
      ]);
    }

    let beforePng: DecodedPng;
    let afterPng: DecodedPng;
    try {
      beforePng = readPng(Buffer.from(beforePngBase64, "base64"));
      afterPng = readPng(Buffer.from(afterPngBase64, "base64"));
    } catch (error) {
      return fallbackDiff(beforePngBase64, afterPngBase64, [
        "Failed to decode PNG: " + errorMessage(error)
      ]);
    }

    return comparePngs(beforePng, afterPng);
  } catch (error) {
    return fallbackDiff(beforePngBase64, afterPngBase64, [
      "Image diff failed: " + errorMessage(error)
    ]);
  }
}

function stripPngPrefix(base64: string): string {
  return base64.replace(DATA_URL_PREFIX, "");
}

function fallbackDiff(
  beforeBase64: string,
  afterBase64: string,
  warnings: string[]
): ScreenshotDiff {
  return {
    fix_confirmed: beforeBase64 !== afterBase64,
    changed_ratio: 0,
    changed_region: null,
    dimensions: [],
    dimensions_note: DIMENSIONS_NOTE,
    warnings
  };
}

function comparePngs(beforePng: DecodedPng, afterPng: DecodedPng): ScreenshotDiff {
  const warnings: string[] = [];
  const dimensions: DimensionChange[] = [];
  const comparedWidth = Math.min(beforePng.width, afterPng.width);
  const comparedHeight = Math.min(beforePng.height, afterPng.height);

  if (beforePng.width !== afterPng.width || beforePng.height !== afterPng.height) {
    warnings.push(
      "Image dimensions differ: before " +
        beforePng.width +
        "x" +
        beforePng.height +
        ", after " +
        afterPng.width +
        "x" +
        afterPng.height +
        "; compared overlapping " +
        comparedWidth +
        "x" +
        comparedHeight +
        " region"
    );

    const beforeArea = beforePng.width * beforePng.height;
    const afterArea = afterPng.width * afterPng.height;
    dimensions.push({
      dimension: "canvas_size",
      before: beforeArea,
      after: afterArea,
      delta: afterArea - beforeArea,
      direction: "changed"
    });
  }

  const comparedPixels = comparedWidth * comparedHeight;
  if (comparedPixels <= 0) {
    warnings.push("Compared PNG region is empty");
    return {
      fix_confirmed: false,
      changed_ratio: 0,
      changed_region: null,
      dimensions,
      dimensions_note: DIMENSIONS_NOTE,
      warnings
    };
  }

  let changedCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let beforeLumaTotal = 0;
  let afterLumaTotal = 0;
  let colorShiftTotal = 0;

  for (let y = 0; y < comparedHeight; y += 1) {
    for (let x = 0; x < comparedWidth; x += 1) {
      const beforeIndex = (y * beforePng.width + x) * 4;
      const afterIndex = (y * afterPng.width + x) * 4;
      const beforeR = beforePng.data[beforeIndex];
      const beforeG = beforePng.data[beforeIndex + 1];
      const beforeB = beforePng.data[beforeIndex + 2];
      const afterR = afterPng.data[afterIndex];
      const afterG = afterPng.data[afterIndex + 1];
      const afterB = afterPng.data[afterIndex + 2];
      const redDelta = afterR - beforeR;
      const greenDelta = afterG - beforeG;
      const blueDelta = afterB - beforeB;

      beforeLumaTotal += pixelLuma(beforeR, beforeG, beforeB);
      afterLumaTotal += pixelLuma(afterR, afterG, afterB);
      colorShiftTotal += Math.sqrt(
        redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta
      ) / 255;

      if (
        Math.abs(redDelta) > 16 ||
        Math.abs(greenDelta) > 16 ||
        Math.abs(blueDelta) > 16
      ) {
        changedCount += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const changedRatio = changedCount / comparedPixels;
  const beforeLuma = beforeLumaTotal / comparedPixels;
  const afterLuma = afterLumaTotal / comparedPixels;
  const meanColorShift = colorShiftTotal / comparedPixels;

  dimensions.push(
    {
      dimension: "overall_change",
      before: 0,
      after: changedRatio,
      delta: changedRatio,
      direction: "changed"
    },
    {
      dimension: "brightness",
      before: beforeLuma,
      after: afterLuma,
      delta: afterLuma - beforeLuma,
      direction: "changed"
    },
    {
      dimension: "color_shift",
      before: 0,
      after: meanColorShift,
      delta: meanColorShift,
      direction: "changed"
    }
  );

  return {
    fix_confirmed: changedRatio > 0.001,
    changed_ratio: changedRatio,
    changed_region:
      changedCount > 0
        ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
        : null,
    dimensions,
    dimensions_note: DIMENSIONS_NOTE,
    warnings
  };
}

function pixelLuma(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
