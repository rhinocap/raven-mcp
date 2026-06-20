/**
 * typography.ts — Typographic-scale audit module for audit_typography tool.
 *
 * Two modes:
 *   url mode      — renders a page in headless Chromium, collects text node metrics.
 *   snapshot mode — analyzes a pre-collected nodes[] array without rendering.
 *
 * Analysis (all deterministic):
 *   (a) MODULAR SCALE  — distinct fontPx values; consecutive ratios; detect a
 *                        consistent ratio (~1.2/1.25/1.333/1.5); flag off-scale sizes.
 *   (b) LINE-HEIGHT    — unitless lh/fs ratio per node; flag outliers vs dominant.
 *   (c) WEIGHT LADDER  — distinct fontWeights; flag >4 weights or non-standard values.
 */

import { CaptureUnavailableError } from "./capture.js";

export { CaptureUnavailableError };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TypographyNode = {
  selector: string;
  fontPx: number;
  lineHeightPx?: number;
  fontWeight?: number;
  tag?: string;
  text?: string;
};

export type TypographyFinding = {
  rule: string;
  severity: "error" | "warning" | "info";
  selector?: string;
  message: string;
  fix: string;
};

export type TypographyResult = {
  url?: string;
  scale: {
    sizes: number[];
    ratios: number[];
    detected_ratio: number | null;
    off_scale_sizes: number[];
  };
  line_height: {
    dominant_ratio: number | null;
    outliers: Array<{ selector: string; ratio: number; expected: number }>;
  };
  weight_ladder: {
    weights: number[];
    issues: string[];
  };
  nodes_analyzed: number;
  findings: TypographyFinding[];
};

// ---------------------------------------------------------------------------
// Known modular scale ratios (name → value)
// ---------------------------------------------------------------------------

const KNOWN_RATIOS: Array<{ name: string; value: number }> = [
  { name: "minor-second (1.067)", value: 1.067 },
  { name: "major-second (1.125)", value: 1.125 },
  { name: "minor-third (1.2)", value: 1.2 },
  { name: "major-third (1.25)", value: 1.25 },
  { name: "perfect-fourth (1.333)", value: 1.333 },
  { name: "augmented-fourth (1.414)", value: 1.414 },
  { name: "perfect-fifth (1.5)", value: 1.5 },
  { name: "golden-ratio (1.618)", value: 1.618 },
];

// Tolerance band: a ratio is "on scale" if within ±RATIO_TOLERANCE of a known ratio.
const RATIO_TOLERANCE = 0.05;

// Standard font-weight values (CSS spec).
const STANDARD_WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);

// Line-height ratio outlier tolerance.
const LINE_HEIGHT_TOLERANCE = 0.15;

// Maximum acceptable distinct weights before flagging ladder complexity.
const MAX_WEIGHT_COUNT = 4;

// Minimum number of distinct font sizes needed to compute scale ratios.
const MIN_SCALE_SIZES = 2;

// Element cap for URL mode.
const ELEMENT_CAP = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dedupe(arr: number[]): number[] {
  return Array.from(new Set(arr));
}

/**
 * Given a sorted list of distinct font sizes, compute consecutive ratios
 * (larger / smaller for each adjacent pair).
 */
function computeRatios(sorted: number[]): number[] {
  const ratios: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    ratios.push(round2(sorted[i] / sorted[i - 1]));
  }
  return ratios;
}

/**
 * Detect the best-matching known modular scale ratio.
 *
 * Two-pass approach:
 *   1. For each known ratio, project a scale from the smallest input size and
 *      count how many distinct sizes fall "on" it (within RATIO_TOLERANCE * size).
 *      If any ratio explains ≥60% of the sizes, return the best one.
 *   2. Fall back to consecutive-ratio majority vote (≥60% of pairs match).
 *
 * This is more robust than pure consecutive-ratio voting when a few off-scale
 * sizes are present: the projection test ignores the outliers and scores against
 * the full set of canonical steps.
 */
function detectRatio(ratios: number[], sizes?: number[]): number | null {
  // Pass 1: projection fit (requires distinct sizes list)
  if (sizes && sizes.length >= MIN_SCALE_SIZES) {
    let bestRatio: number | null = null;
    let bestScore = 0;
    for (const known of KNOWN_RATIOS) {
      const projected = projectScale(sizes[0], known.value, sizes.length + 2);
      const matchCount = sizes.filter((size) =>
        Array.from(projected).some(
          (p) => Math.abs(p - size) <= RATIO_TOLERANCE * size
        )
      ).length;
      const score = matchCount / sizes.length;
      if (score >= 0.6 && score > bestScore) {
        bestScore = score;
        bestRatio = known.value;
      }
    }
    if (bestRatio !== null) return bestRatio;
  }

  // Pass 2: consecutive-ratio majority vote
  if (ratios.length === 0) return null;
  for (const known of KNOWN_RATIOS) {
    const matching = ratios.filter(
      (r) => Math.abs(r - known.value) <= RATIO_TOLERANCE
    );
    if (matching.length / ratios.length >= 0.6) {
      return known.value;
    }
  }
  return null;
}

/**
 * Given a detected ratio and the smallest size, project the expected
 * modular scale steps. Returns a set of "valid" sizes within tolerance.
 */
function projectScale(baseSize: number, ratio: number, count: number): Set<number> {
  const valid = new Set<number>();
  let cur = baseSize;
  for (let i = 0; i < count + 2; i++) {
    valid.add(round2(cur));
    cur = cur * ratio;
  }
  return valid;
}

/**
 * Identify the most common (modal) value in a number array.
 * Returns null for empty input.
 */
function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = val;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Snapshot audit (pure — no Playwright needed)
// ---------------------------------------------------------------------------

/**
 * Analyze a pre-collected array of text node metrics. No browser required.
 */
export function auditTypographySnapshot(nodes: TypographyNode[]): TypographyResult {
  const findings: TypographyFinding[] = [];

  if (nodes.length === 0) {
    return {
      scale: { sizes: [], ratios: [], detected_ratio: null, off_scale_sizes: [] },
      line_height: { dominant_ratio: null, outliers: [] },
      weight_ladder: { weights: [], issues: [] },
      nodes_analyzed: 0,
      findings: [
        {
          rule: "typography/no-nodes",
          severity: "info",
          message: "No text nodes provided for analysis.",
          fix: "Pass at least one node with fontPx set.",
        },
      ],
    };
  }

  // ── (a) MODULAR SCALE ────────────────────────────────────────────────────

  const allSizes = nodes.map((n) => round2(n.fontPx));
  const distinctSizes = dedupe(allSizes).sort((a, b) => a - b);
  const ratios = distinctSizes.length >= MIN_SCALE_SIZES ? computeRatios(distinctSizes) : [];
  const detectedRatio = detectRatio(ratios, distinctSizes);

  let offScaleSizes: number[] = [];

  if (detectedRatio !== null && distinctSizes.length >= MIN_SCALE_SIZES) {
    const projected = projectScale(distinctSizes[0], detectedRatio, distinctSizes.length);
    offScaleSizes = distinctSizes.filter((size) => {
      // A size is "on scale" if it's within RATIO_TOLERANCE * size of any projected value.
      return !Array.from(projected).some(
        (p) => Math.abs(p - size) <= RATIO_TOLERANCE * size
      );
    });

    if (offScaleSizes.length > 0) {
      for (const size of offScaleSizes) {
        findings.push({
          rule: "typography/off-scale-size",
          severity: "warning",
          message: `Font size ${size}px is not on the detected modular scale (ratio ~${detectedRatio}).`,
          fix: `Align this size to the nearest scale step derived from the base size with ratio ${detectedRatio}.`,
        });
      }
    }
  } else if (ratios.length > 0) {
    // No consistent ratio detected — flag if sizes seem ad-hoc.
    const uniqueRatios = dedupe(ratios.map(round2));
    if (uniqueRatios.length === ratios.length && ratios.length >= 2) {
      findings.push({
        rule: "typography/inconsistent-scale",
        severity: "warning",
        message: `No consistent modular scale ratio detected. Consecutive size ratios are: ${ratios.join(", ")}.`,
        fix: "Choose a single modular scale ratio (e.g. 1.25 Major Third or 1.333 Perfect Fourth) and derive all type sizes from it.",
      });
    }
  }

  if (distinctSizes.length === 1) {
    findings.push({
      rule: "typography/single-size",
      severity: "info",
      message: `Only one distinct font size (${distinctSizes[0]}px) found across all text nodes.`,
      fix: "Introduce a typographic hierarchy with at least 2-3 distinct sizes from a modular scale.",
    });
  }

  // ── (b) LINE-HEIGHT CONSISTENCY ─────────────────────────────────────────

  const lhRatios: Array<{ selector: string; ratio: number }> = [];

  for (const node of nodes) {
    if (node.lineHeightPx != null && node.fontPx > 0) {
      lhRatios.push({
        selector: node.selector,
        ratio: round2(node.lineHeightPx / node.fontPx),
      });
    }
  }

  const dominantLhRatio =
    lhRatios.length > 0 ? mode(lhRatios.map((r) => r.ratio)) : null;

  const lhOutliers: Array<{ selector: string; ratio: number; expected: number }> = [];

  if (dominantLhRatio !== null) {
    for (const { selector, ratio } of lhRatios) {
      if (Math.abs(ratio - dominantLhRatio) > LINE_HEIGHT_TOLERANCE) {
        lhOutliers.push({ selector, ratio, expected: dominantLhRatio });
        findings.push({
          rule: "typography/line-height-outlier",
          severity: "warning",
          selector,
          message: `Line-height ratio ${ratio} at "${selector}" differs from the dominant ratio ${dominantLhRatio} by more than ${LINE_HEIGHT_TOLERANCE}.`,
          fix: `Set line-height to ${round2(dominantLhRatio * (nodes.find((n) => n.selector === selector)?.fontPx ?? 16))}px (ratio ${dominantLhRatio}) to match the dominant body rhythm.`,
        });
      }
    }
  }

  // ── (c) WEIGHT LADDER ────────────────────────────────────────────────────

  const rawWeights = nodes
    .filter((n) => n.fontWeight != null)
    .map((n) => n.fontWeight as number);

  const distinctWeights = dedupe(rawWeights).sort((a, b) => a - b);
  const weightIssues: string[] = [];

  if (distinctWeights.length > MAX_WEIGHT_COUNT) {
    const issue = `${distinctWeights.length} distinct font-weights (${distinctWeights.join(", ")}) exceeds the recommended maximum of ${MAX_WEIGHT_COUNT}.`;
    weightIssues.push(issue);
    findings.push({
      rule: "typography/too-many-weights",
      severity: "warning",
      message: issue,
      fix: `Reduce the weight palette to ≤${MAX_WEIGHT_COUNT} values. A common effective ladder: 400 (body), 500 (medium), 600 (semibold), 700 (bold).`,
    });
  }

  const nonStandard = distinctWeights.filter((w) => !STANDARD_WEIGHTS.has(w));
  if (nonStandard.length > 0) {
    const issue = `Non-standard font-weight values detected: ${nonStandard.join(", ")}.`;
    weightIssues.push(issue);
    findings.push({
      rule: "typography/non-standard-weight",
      severity: "error",
      message: issue,
      fix: `Use only CSS standard font-weight values (100–900 in steps of 100).`,
    });
  }

  return {
    scale: {
      sizes: distinctSizes,
      ratios,
      detected_ratio: detectedRatio,
      off_scale_sizes: offScaleSizes,
    },
    line_height: {
      dominant_ratio: dominantLhRatio,
      outliers: lhOutliers,
    },
    weight_ladder: {
      weights: distinctWeights,
      issues: weightIssues,
    },
    nodes_analyzed: nodes.length,
    findings,
  };
}

// ---------------------------------------------------------------------------
// URL audit (Playwright)
// ---------------------------------------------------------------------------

/**
 * Render a URL in headless Chromium, collect text node font metrics, then
 * analyze them with auditTypographySnapshot.
 */
export async function auditTypographyUrl(
  url: string,
  opts?: { viewport?: { w: number; h: number }; timeoutMs?: number; theme?: "light" | "dark" }
): Promise<TypographyResult> {
  let chromium: import("playwright").BrowserType;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new CaptureUnavailableError(
      "Playwright chromium not available. Run: npx playwright install chromium"
    );
  }

  let browser: import("playwright").Browser | null = null;

  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      throw new CaptureUnavailableError(
        "Playwright chromium not available. Run: npx playwright install chromium"
      );
    }

    const page = await browser.newPage();
    await page.setViewportSize({
      width: opts?.viewport?.w ?? 1440,
      height: opts?.viewport?.h ?? 900,
    });

    if (opts?.theme) {
      try {
        await page.emulateMedia({ colorScheme: opts.theme });
      } catch {
        // best-effort
      }
    }

    await page.goto(url, {
      waitUntil: "load",
      timeout: opts?.timeoutMs ?? 30000,
    });

    if (opts?.theme) {
      try {
        await page.evaluate((t: string) => {
          document.documentElement.setAttribute("data-theme", t);
          document.documentElement.classList.toggle("dark", t === "dark");
          document.documentElement.classList.toggle("light", t === "light");
        }, opts.theme);
        await page.waitForTimeout(120);
      } catch {
        // best-effort
      }
    }

    // Collect per-element computed typography metrics from the live DOM.
    type RawNode = {
      selector: string;
      tag: string;
      fontPx: number;
      lineHeightPx: number | null;
      fontWeight: number;
      text: string;
    };

    const rawNodes: RawNode[] = await page.evaluate((cap: number) => {
      const results: RawNode[] = [];

      function stableSelector(el: Element): string {
        const testid = el.getAttribute("data-testid");
        if (testid) return `[data-testid="${testid}"]`;
        const id = el.getAttribute("id");
        if (id) return `#${id}`;
        const tag = el.tagName.toLowerCase();
        const parent = el.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === el.tagName
          );
          const idx = siblings.indexOf(el) + 1;
          return `${stableSelector(parent)} > ${tag}:nth-of-type(${idx})`;
        }
        return tag;
      }

      function isVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      function hasDirectText(el: Element): boolean {
        for (let i = 0; i < el.childNodes.length; i++) {
          const node = el.childNodes[i];
          if (
            node.nodeType === Node.TEXT_NODE &&
            node.textContent &&
            node.textContent.trim().length > 0
          ) {
            return true;
          }
        }
        return false;
      }

      const allElements = document.querySelectorAll("*");
      for (let i = 0; i < allElements.length; i++) {
        if (results.length >= cap) break;
        const el = allElements[i];
        if (!hasDirectText(el)) continue;
        if (!isVisible(el)) continue;

        const style = window.getComputedStyle(el);

        const fontPx = parseFloat(style.fontSize) || 16;

        // lineHeight can be "normal" (keyword) or a px value.
        const lhRaw = style.lineHeight;
        let lineHeightPx: number | null = null;
        if (lhRaw && lhRaw !== "normal") {
          const parsed = parseFloat(lhRaw);
          if (!isNaN(parsed)) lineHeightPx = parsed;
        }

        const fwRaw = style.fontWeight;
        const fontWeight = parseInt(fwRaw, 10) || 400;

        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || "").trim().slice(0, 60);
        const selector = stableSelector(el);

        results.push({ selector, tag, fontPx, lineHeightPx, fontWeight, text });
      }

      return results;
    }, ELEMENT_CAP);

    const nodes: TypographyNode[] = rawNodes.map((n) => ({
      selector: n.selector,
      tag: n.tag,
      fontPx: n.fontPx,
      lineHeightPx: n.lineHeightPx ?? undefined,
      fontWeight: n.fontWeight,
      text: n.text,
    }));

    const result = auditTypographySnapshot(nodes);
    result.url = url;
    return result;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
