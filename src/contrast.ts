/**
 * contrast.ts — WCAG contrast audit module for audit_contrast tool.
 * Pure WCAG math + Playwright-backed page audit.
 * No new npm dependencies required.
 */

import { CaptureUnavailableError } from "./capture.js";

export { CaptureUnavailableError };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContrastRow = {
  selector: string;
  text: string;
  foreground: string;
  background: string;
  fontPx: number;
  bold: boolean;
  large: boolean;
  ratio: number;
  aa: boolean;
  aaa: boolean;
  required_aa: number;
  delta_to_aa: number;
};

export type ContrastResult = {
  url?: string;
  total_text_elements: number;
  rows: ContrastRow[];
  aa_failures: ContrastRow[];
  aa_fail_count: number;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Pure WCAG math — exported for tests
// ---------------------------------------------------------------------------

/**
 * Parse a CSS colour string into [r, g, b, a] where r/g/b ∈ 0-255, a ∈ 0-1.
 * Handles: #RGB, #RRGGBB, #RGBA, #RRGGBBAA, rgb(), rgba(), black, white, transparent.
 * Unknown/unparseable → [0, 0, 0, 1] (opaque black, safe fallback).
 */
export function parseColor(css: string): [number, number, number, number] {
  const s = css.trim().toLowerCase();

  if (s === "black") return [0, 0, 0, 1];
  if (s === "white") return [255, 255, 255, 1];
  if (s === "transparent") return [0, 0, 0, 0];

  // #hex
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return [r, g, b, 1];
    }
    if (h.length === 4) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      const a = parseInt(h[3] + h[3], 16) / 255;
      return [r, g, b, a];
    }
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return [r, g, b, 1];
    }
    if (h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = parseInt(h.slice(6, 8), 16) / 255;
      return [r, g, b, a];
    }
    return [0, 0, 0, 1];
  }

  // rgb() / rgba()
  const rgbaMatch = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgbaMatch) {
    const r = Math.round(parseFloat(rgbaMatch[1]));
    const g = Math.round(parseFloat(rgbaMatch[2]));
    const b = Math.round(parseFloat(rgbaMatch[3]));
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    return [r, g, b, a];
  }

  return [0, 0, 0, 1];
}

/**
 * Linearise a single 0-255 channel to the sRGB linear scale.
 */
function linearise(c: number): number {
  const c01 = c / 255;
  return c01 <= 0.03928 ? c01 / 12.92 : Math.pow((c01 + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance for an [r,g,b] triple (0-255).
 */
export function relativeLuminance(rgb: [number, number, number]): number {
  const R = linearise(rgb[0]);
  const G = linearise(rgb[1]);
  const B = linearise(rgb[2]);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * WCAG contrast ratio between two [r,g,b] triples (0-255). Range: 1..21.
 * contrastRatio([0,0,0], [255,255,255]) === 21 (±0.01).
 */
export function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number]
): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

// ---------------------------------------------------------------------------
// Composite alpha over white
// ---------------------------------------------------------------------------

function compositeOverWhite(
  r: number,
  g: number,
  b: number,
  a: number
): [number, number, number] {
  const rOut = Math.round(r * a + 255 * (1 - a));
  const gOut = Math.round(g * a + 255 * (1 - a));
  const bOut = Math.round(b * a + 255 * (1 - a));
  return [rOut, gOut, bOut];
}

// ---------------------------------------------------------------------------
// Snapshot audit (pure — no Playwright needed)
// ---------------------------------------------------------------------------

/**
 * Score a pre-collected snapshot of elements. No browser required.
 */
export function auditContrastSnapshot(
  elements: Array<{
    selector: string;
    color: string;
    bgColor: string;
    fontPx?: number;
    bold?: boolean;
    text?: string;
  }>
): ContrastResult {
  const warnings: string[] = [];
  const rows: ContrastRow[] = [];

  for (const el of elements) {
    const [fr, fg, fb, fa] = parseColor(el.color);
    const [br, bg, bb, ba] = parseColor(el.bgColor);

    // Composite fg over white if semi-transparent
    const fgRgb: [number, number, number] =
      fa < 1 ? compositeOverWhite(fr, fg, fb, fa) : [fr, fg, fb];

    // Composite bg over white if semi-transparent
    const bgRgb: [number, number, number] =
      ba < 1 ? compositeOverWhite(br, bg, bb, ba) : [br, bg, bb];

    const fontPx = el.fontPx ?? 16;
    const bold = el.bold ?? false;
    const large = fontPx >= 24 || (fontPx >= 18.66 && bold);
    const required_aa = large ? 3 : 4.5;
    const required_aaa = large ? 4.5 : 7;

    const ratio = contrastRatio(fgRgb, bgRgb);
    const aa = ratio >= required_aa;
    const aaa = ratio >= required_aaa;
    const delta_to_aa = Math.max(0, required_aa - ratio);

    rows.push({
      selector: el.selector,
      text: el.text ?? "",
      foreground: el.color,
      background: el.bgColor,
      fontPx,
      bold,
      large,
      ratio: Math.round(ratio * 100) / 100,
      aa,
      aaa,
      required_aa,
      delta_to_aa: Math.round(delta_to_aa * 100) / 100,
    });
  }

  const aa_failures = rows.filter((r) => !r.aa);

  return {
    total_text_elements: rows.length,
    rows,
    aa_failures,
    aa_fail_count: aa_failures.length,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// URL audit (Playwright)
// ---------------------------------------------------------------------------

const ELEMENT_CAP = 600;

/**
 * Render a URL in headless Chromium, extract all visible text elements with
 * their computed colours, then score them with auditContrastSnapshot.
 */
export async function auditContrastUrl(
  url: string,
  opts?: { viewport?: { w: number; h: number }; timeoutMs?: number; theme?: "light" | "dark" }
): Promise<ContrastResult> {
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
  const warnings: string[] = [];

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
        // emulateMedia is best-effort; contrast still measured under default scheme
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
        // theme-attribute application is best-effort
      }
    }

    // Collect raw element data from the page
    type RawEl = {
      selector: string;
      color: string;
      bgColor: string;
      fontPx: number;
      bold: boolean;
      text: string;
    };

    const raw: RawEl[] = await page.evaluate((cap: number) => {
      const results: RawEl[] = [];

      /**
       * Build a stable selector for an element — prefer data-testid / id,
       * fall back to tag + nth-of-type.
       */
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

      /**
       * Walk ancestors to find the effective opaque background colour.
       * Returns a CSS colour string.
       */
      function effectiveBgColor(el: Element): string {
        let node: Element | null = el;
        while (node) {
          const style = window.getComputedStyle(node);
          const bg = style.backgroundColor;
          if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
            // Check if it has meaningful alpha
            const m = bg.match(/rgba?\([\d.,\s]+,\s*([\d.]+)\)/);
            if (!m || parseFloat(m[1]) > 0) {
              return bg;
            }
          }
          node = node.parentElement;
        }
        return "rgb(255, 255, 255)"; // default white
      }

      /**
       * Check whether an element is visible (non-zero rect, not hidden).
       */
      function isVisible(el: Element): boolean {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      /**
       * Check whether an element has a direct non-empty text node child.
       */
      function hasDirectText(el: Element): boolean {
        for (let i = 0; i < el.childNodes.length; i++) {
          const node = el.childNodes[i];
          if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim().length > 0) {
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
        const color = style.color || "rgb(0,0,0)";
        const bgColor = effectiveBgColor(el);
        const fontPx = parseFloat(style.fontSize) || 16;
        const fw = style.fontWeight;
        const bold = parseInt(fw) >= 600 || fw === "bold";
        const text = (el.textContent || "").trim().slice(0, 60);
        const selector = stableSelector(el);

        results.push({ selector, color, bgColor, fontPx, bold, text });
      }

      return results;
    }, ELEMENT_CAP);

    if (raw.length >= ELEMENT_CAP) {
      warnings.push(
        `Element count capped at ${ELEMENT_CAP}. Some text elements were not audited.`
      );
    }

    const result = auditContrastSnapshot(raw);
    result.url = url;
    result.warnings.push(...warnings);
    return result;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Remediation — minimal WCAG-passing color suggestion (pure)
// ---------------------------------------------------------------------------

export type ContrastFixDetail = {
  color: string;
  ratio: number;
  direction: "lighter" | "darker";
};

export type SuggestContrastFix = {
  fg: string;
  bg: string;
  currentRatio: number;
  targetRatio: number;
  passes: boolean;
  fgFix: ContrastFixDetail | null;
  bgFix: ContrastFixDetail | null;
  reachable: boolean;
  recommendation: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rgbStr(c: [number, number, number]): string {
  return "rgb(" + c[0] + ", " + c[1] + ", " + c[2] + ")";
}

function toOpaque(css: string, over: [number, number, number]): [number, number, number] {
  const [r, g, b, a] = parseColor(css);
  if (a >= 1) return [r, g, b];
  return [
    Math.round(r * a + over[0] * (1 - a)),
    Math.round(g * a + over[1] * (1 - a)),
    Math.round(b * a + over[2] * (1 - a)),
  ];
}

function lerpRgb(
  c: [number, number, number],
  pole: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(c[0] + (pole[0] - c[0]) * t),
    Math.round(c[1] + (pole[1] - c[1]) * t),
    Math.round(c[2] + (pole[2] - c[2]) * t),
  ];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Adjust `color` toward the higher-contrast pole vs the fixed color until target met.
function solveAdjust(
  color: [number, number, number],
  fixed: [number, number, number],
  target: number
): { detail: ContrastFixDetail; reachable: boolean } {
  const black: [number, number, number] = [0, 0, 0];
  const white: [number, number, number] = [255, 255, 255];
  const useBlack = contrastRatio(black, fixed) >= contrastRatio(white, fixed);
  const pole = useBlack ? black : white;
  const direction: "lighter" | "darker" = useBlack ? "darker" : "lighter";
  const poleRatio = contrastRatio(pole, fixed);
  if (poleRatio < target) {
    return { detail: { color: rgbStr(pole), ratio: round2(poleRatio), direction }, reachable: false };
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(lerpRgb(color, pole, mid), fixed) >= target) hi = mid;
    else lo = mid;
  }
  let c = lerpRgb(color, pole, hi);
  let guard = 0;
  // rounding to ints may dip just under target — nudge toward the pole until cleared
  while (contrastRatio(c, fixed) < target && guard < 24) {
    hi = hi + (1 - hi) / 2 + 0.0005;
    if (hi > 1) hi = 1;
    c = lerpRgb(color, pole, hi);
    guard++;
  }
  return { detail: { color: rgbStr(c), ratio: round2(contrastRatio(c, fixed)), direction }, reachable: true };
}

export function suggestContrastFix(
  fg: string,
  bg: string,
  opts?: { targetRatio?: number; level?: "AA" | "AAA"; fontPx?: number; bold?: boolean }
): SuggestContrastFix {
  const options = opts || {};
  const bgOpaque = toOpaque(bg, [255, 255, 255]);
  const fgOpaque = toOpaque(fg, bgOpaque);

  // target derivation
  let target: number;
  if (typeof options.targetRatio === "number") {
    target = options.targetRatio;
  } else {
    const level = options.level || "AA";
    const fontPx = typeof options.fontPx === "number" ? options.fontPx : 0;
    const isLarge = fontPx >= 24 || (fontPx >= 18.66 && options.bold === true);
    if (level === "AAA") target = isLarge ? 4.5 : 7.0;
    else target = isLarge ? 3.0 : 4.5;
  }

  const currentRatio = contrastRatio(fgOpaque, bgOpaque);
  const fgStr = rgbStr(fgOpaque);
  const bgStr = rgbStr(bgOpaque);

  if (currentRatio >= target) {
    return {
      fg: fgStr,
      bg: bgStr,
      currentRatio: round2(currentRatio),
      targetRatio: target,
      passes: true,
      fgFix: null,
      bgFix: null,
      reachable: true,
      recommendation: "Already passes — contrast " + round2(currentRatio) + " meets the " + target + " target.",
    };
  }

  const fgSolved = solveAdjust(fgOpaque, bgOpaque, target);
  const bgSolved = solveAdjust(bgOpaque, fgOpaque, target);
  const reachable = fgSolved.reachable || bgSolved.reachable;

  // recommend the smaller perceptual change among reachable fixes
  const fgDist = rgbDistance(fgOpaque, toOpaque(fgSolved.detail.color, bgOpaque));
  const bgDist = rgbDistance(bgOpaque, toOpaque(bgSolved.detail.color, fgOpaque));
  let recommendation: string;
  if (!reachable) {
    const best = fgSolved.detail.ratio >= bgSolved.detail.ratio ? fgSolved.detail : bgSolved.detail;
    recommendation =
      "Target " + target + " cannot be reached by adjusting one color alone. Best achievable ratio " +
      best.ratio + " (foreground " + best.color + "). Consider changing both colors or lowering the target.";
  } else if (fgSolved.reachable && (!bgSolved.reachable || fgDist <= bgDist)) {
    recommendation =
      "Set foreground to " + fgSolved.detail.color + " (" + fgSolved.detail.direction + ", ratio " +
      fgSolved.detail.ratio + ")." + (bgSolved.reachable ? " Alternatively set background to " + bgSolved.detail.color + " (ratio " + bgSolved.detail.ratio + ")." : "");
  } else {
    recommendation =
      "Set background to " + bgSolved.detail.color + " (" + bgSolved.detail.direction + ", ratio " +
      bgSolved.detail.ratio + ")." + (fgSolved.reachable ? " Alternatively set foreground to " + fgSolved.detail.color + " (ratio " + fgSolved.detail.ratio + ")." : "");
  }

  return {
    fg: fgStr,
    bg: bgStr,
    currentRatio: round2(currentRatio),
    targetRatio: target,
    passes: false,
    fgFix: fgSolved.detail,
    bgFix: bgSolved.detail,
    reachable,
    recommendation,
  };
}
