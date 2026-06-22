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

/**
 * Composite an ordered stack of CSS color strings onto an opaque white base.
 *
 * @param layers - CSS color strings ordered **nearest ancestor first → furthest last**.
 *   Each is parsed with parseColor. Fully-transparent layers (a === 0) are skipped.
 *   The stack is composited alpha-over from furthest→nearest onto white [255,255,255].
 * @returns An opaque [r, g, b] triple. Empty or all-transparent input → [255,255,255].
 */
export function compositeBackground(layers: string[]): [number, number, number] {
  // Start with an opaque white base
  let baseR = 255;
  let baseG = 255;
  let baseB = 255;

  // Parse all layers, skipping fully transparent ones
  const parsed: Array<[number, number, number, number]> = [];
  for (const layer of layers) {
    const [r, g, b, a] = parseColor(layer);
    if (a === 0) continue; // skip transparent
    parsed.push([r, g, b, a]);
  }

  if (parsed.length === 0) {
    return [255, 255, 255];
  }

  // Composite furthest→nearest (reverse order) onto the base
  for (let i = parsed.length - 1; i >= 0; i--) {
    const [r, g, b, a] = parsed[i];
    baseR = Math.round(r * a + baseR * (1 - a));
    baseG = Math.round(g * a + baseG * (1 - a));
    baseB = Math.round(b * a + baseB * (1 - a));
  }

  return [baseR, baseG, baseB];
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
    bgColors?: string[];
    fontPx?: number;
    bold?: boolean;
    text?: string;
  }>
): ContrastResult {
  const warnings: string[] = [];
  const rows: ContrastRow[] = [];

  for (const el of elements) {
    const [fr, fg, fb, fa] = parseColor(el.color);

    // Composite fg over white if semi-transparent
    const fgRgb: [number, number, number] =
      fa < 1 ? compositeOverWhite(fr, fg, fb, fa) : [fr, fg, fb];

    // Background: use ancestor stack when available, else fall back to single bgColor path
    let bgRgb: [number, number, number];
    let bgDisplay: string;
    if (el.bgColors && el.bgColors.length > 0) {
      bgRgb = compositeBackground(el.bgColors);
      bgDisplay = `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`;
    } else {
      const [br, bg, bb, ba] = parseColor(el.bgColor);
      // Composite bg over white if semi-transparent (existing path, unchanged)
      bgRgb = ba < 1 ? compositeOverWhite(br, bg, bb, ba) : [br, bg, bb];
      // Report the effective opaque color the ratio was computed against, not
      // the raw translucent input (AC4). Opaque inputs are reported verbatim.
      bgDisplay = ba < 1 ? `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})` : el.bgColor;
    }

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
      background: bgDisplay,
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
      bgColors: string[];
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
       * Walk ancestors and collect the ordered background color stack.
       * Returns CSS color strings ordered nearest ancestor first → furthest last.
       * Includes each non-transparent background up to and including the first
       * fully-opaque background (alpha === 1), or to the root if none opaque.
       */
      function effectiveBgColors(el: Element): string[] {
        const stack: string[] = [];
        let node: Element | null = el;
        while (node) {
          const style = window.getComputedStyle(node);
          const bg = style.backgroundColor;
          if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
            // Check alpha: rgba(..., alpha) or rgb(...) which is fully opaque
            const rgbaMatch = bg.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
            if (rgbaMatch) {
              const alpha = parseFloat(rgbaMatch[1]);
              if (alpha > 0) {
                stack.push(bg);
                if (alpha >= 1) {
                  break; // stop at the first fully-opaque background
                }
              }
              // alpha === 0: skip (fully transparent)
            } else {
              // rgb(...) form — fully opaque
              stack.push(bg);
              break; // stop at the first fully-opaque background
            }
          }
          node = node.parentElement;
        }
        return stack;
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
        const bgColors = effectiveBgColors(el);
        // Back-compat: bgColor is the first (nearest) entry, or white if empty
        const bgColor = bgColors.length > 0 ? bgColors[0] : "rgb(255, 255, 255)";
        const fontPx = parseFloat(style.fontSize) || 16;
        const fw = style.fontWeight;
        const bold = parseInt(fw) >= 600 || fw === "bold";
        const text = (el.textContent || "").trim().slice(0, 60);
        const selector = stableSelector(el);

        results.push({ selector, color, bgColor, bgColors, fontPx, bold, text });
      }

      return results;
    }, ELEMENT_CAP);

    if (raw.length >= ELEMENT_CAP) {
      warnings.push(
        `Element count capped at ${ELEMENT_CAP}. Some text elements were not audited.`
      );
    }

    // Back-compat contract: each element's single `bgColor` must be the
    // composited OPAQUE result of its ancestor stack (not the raw nearest,
    // possibly-translucent layer) — so any consumer reading `bgColor` alone
    // gets the true effective background instead of re-running the over-white
    // path. (compositeBackground isn't reachable inside the page.evaluate
    // browser context, so we resolve it here on the Node side.)
    const normalized = raw.map((el) => {
      if (el.bgColors && el.bgColors.length > 0) {
        const [r, g, b] = compositeBackground(el.bgColors);
        return { ...el, bgColor: `rgb(${r}, ${g}, ${b})` };
      }
      return el;
    });
    const result = auditContrastSnapshot(normalized);
    result.url = url;
    result.warnings.push(...warnings);
    return result;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
