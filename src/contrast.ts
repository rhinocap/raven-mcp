/**
 * contrast.ts — WCAG contrast audit module for audit_contrast tool.
 * Pure WCAG math + Playwright-backed page audit.
 * No new npm dependencies required.
 */

import { CaptureUnavailableError } from "./capture.js";

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
  opts?: { viewport?: { w: number; h: number }; timeoutMs?: number }
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

  const browser = await chromium.launch({ headless: true });
  const warnings: string[] = [];

  try {
    const page = await browser.newPage();
    await page.setViewportSize({
      width: opts?.viewport?.w ?? 1440,
      height: opts?.viewport?.h ?? 900,
    });
    await page.goto(url, {
      waitUntil: "load",
      timeout: opts?.timeoutMs ?? 30000,
    });

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
    await browser.close();
  }
}
