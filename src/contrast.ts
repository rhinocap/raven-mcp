/**
 * contrast.ts — WCAG contrast audit module for audit_contrast tool.
 * Pure WCAG math + Playwright-backed page audit.
 * No new npm dependencies required.
 */

import { CaptureUnavailableError } from "./capture.js";
import { launchAuditChromium } from "./browser-launch.js";

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
  status: "pass" | "fail" | "indeterminate";
  ratio: number | null;
  aa: boolean | null;
  aaa: boolean | null;
  required_aa: number;
  delta_to_aa: number | null;
  effective_bg: string;
  bg_indeterminate: boolean;
  indeterminate_reason?: string;
  ratio_min?: number;
  ratio_max?: number;
};

export type ContrastResult = {
  url?: string;
  total_text_elements: number;
  rows: ContrastRow[];
  aa_failures: ContrastRow[];
  aa_fail_count: number;
  indeterminate_bg_rows: ContrastRow[];
  indeterminate_bg_count: number;
  indeterminate_bg_note: string;
  mode_note: string;
  warnings: string[];
};

export type BackgroundLayer = {
  color: string | null;
  image: string | null;
};

type Rgba = [number, number, number, number];
type Rgb = [number, number, number];

const GRADIENT_SAMPLES = 16;
const MAX_BG_CANDIDATES = 64;

// ---------------------------------------------------------------------------
// Glyph / motion-split collapsing — exported for audit_url and tests
// ---------------------------------------------------------------------------

/**
 * One or more aa_failures rows that should be reported as a single finding.
 * `isShortTextGroup` is true when every row's trimmed text is 0-2 characters
 * long (icon glyphs, single letters left over from a motion-split animation,
 * etc.) — these are noisy to report per-letter and are usually not
 * independent contrast bugs, so callers should collapse them into one
 * likely-artifact finding instead of one confirmed error per fragment.
 */
export type ContrastFailureGroup = {
  rows: ContrastRow[];
  isShortTextGroup: boolean;
};

const SHORT_TEXT_MAX_LEN = 2;

/**
 * Group `aa_failures` rows so short-text (glyph/motion-split) fragments that
 * share the same rendering context — (foreground, background, required_aa) —
 * collapse into a single group instead of firing one finding per fragment.
 * Longer-text failures are never grouped with anything else; each keeps its
 * own single-row group so it can still be reported as a confirmed error.
 */
export function collapseShortTextContrastFailures(rows: ContrastRow[]): ContrastFailureGroup[] {
  const groups: ContrastFailureGroup[] = [];
  const shortGroupIndex = new Map<string, number>();

  for (const row of rows) {
    const len = (row.text || "").trim().length;
    if (len <= SHORT_TEXT_MAX_LEN) {
      const key = row.foreground + "|" + row.background + "|" + row.required_aa;
      const idx = shortGroupIndex.get(key);
      if (idx !== undefined) {
        groups[idx].rows.push(row);
      } else {
        shortGroupIndex.set(key, groups.length);
        groups.push({ rows: [row], isShortTextGroup: true });
      }
    } else {
      groups.push({ rows: [row], isShortTextGroup: false });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Pure WCAG math — exported for tests
// ---------------------------------------------------------------------------

/**
 * Parse a CSS colour string into [r, g, b, a] where r/g/b ∈ 0-255, a ∈ 0-1.
 * Handles: #RGB, #RRGGBB, #RGBA, #RRGGBBAA, rgb(), rgba(), black, white, transparent.
 * Unknown/unparseable → [0, 0, 0, 1] for this legacy public helper only.
 * Audit paths use parseKnownColor and surface parse failures as indeterminate.
 */
export function parseKnownColor(css: string): Rgba | null {
  const s = css.trim().toLowerCase();

  if (s === "black") return [0, 0, 0, 1];
  if (s === "white") return [255, 255, 255, 1];
  if (s === "transparent") return [0, 0, 0, 0];

  // #hex
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
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
    return null;
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

  return null;
}

export function parseColor(css: string): Rgba {
  return parseKnownColor(css) ?? [0, 0, 0, 1];
}

function splitTopLevelCommas(value: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return null;
    } else if (ch === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  parts.push(value.slice(start).trim());
  return parts;
}

function parseGradientColorStop(stop: string): Rgba | null {
  const value = stop.trim();
  let colorToken = "";
  let remainder = "";
  const functional = value.match(/^rgba?\([^)]*\)/i);
  const hex = value.match(/^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?=\s|$)/i);
  const named = value.match(/^[a-z]+(?=\s|$)/i);
  const match = functional || hex || named;
  if (!match) return null;
  colorToken = match[0];
  remainder = value.slice(colorToken.length).trim();
  const position = "[-+]?(?:\\d*\\.)?\\d+(?:%|px|em|rem|vh|vw)?";
  if (remainder && !new RegExp("^" + position + "(?:\\s+" + position + ")?$").test(remainder)) {
    return null;
  }
  return parseKnownColor(colorToken);
}

function isSimpleGradientPrelude(kind: "linear" | "radial", value: string): boolean {
  const v = value.trim().toLowerCase();
  if (kind === "linear") {
    return /^to\s+(?:left|right|top|bottom)(?:\s+(?:left|right|top|bottom))?$/.test(v) ||
      /^[-+]?(?:\d*\.)?\d+(?:deg|grad|rad|turn)$/.test(v);
  }
  return /^(?:(?:circle|ellipse)(?:\s+(?:closest-side|closest-corner|farthest-side|farthest-corner))?|(?:closest-side|closest-corner|farthest-side|farthest-corner))(?:\s+at\s+[a-z0-9.%\s-]+)?$/.test(v) ||
    /^(?:circle|ellipse)?\s*at\s+[a-z0-9.%\s-]+$/.test(v);
}

/** Parse the color stops of a deliberately simple linear/radial gradient. */
export function parseGradientStops(image: string): Rgba[] | null {
  const match = image.trim().match(/^(linear-gradient|radial-gradient)\((.*)\)$/i);
  if (!match) return null;
  const kind: "linear" | "radial" = match[1].toLowerCase().startsWith("linear") ? "linear" : "radial";
  const parts = splitTopLevelCommas(match[2]);
  if (!parts || parts.length < 2) return null;
  let start = 0;
  if (parseGradientColorStop(parts[0]) === null) {
    if (!isSimpleGradientPrelude(kind, parts[0])) return null;
    start = 1;
  }
  const stops: Rgba[] = [];
  for (let i = start; i < parts.length; i++) {
    const color = parseGradientColorStop(parts[i]);
    if (!color) return null;
    stops.push(color);
  }
  return stops.length >= 2 ? stops : null;
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
// Alpha compositing and effective backdrop resolution
// ---------------------------------------------------------------------------

function compositeColor(color: Rgba, backdrop: Rgb): Rgb {
  return [
    Math.round(color[0] * color[3] + backdrop[0] * (1 - color[3])),
    Math.round(color[1] * color[3] + backdrop[1] * (1 - color[3])),
    Math.round(color[2] * color[3] + backdrop[2] * (1 - color[3])),
  ];
}

type BackdropResolution = {
  colors: Rgb[];
  indeterminate: boolean;
  reason?: string;
};

function dedupeColors(colors: Rgb[]): Rgb[] {
  const seen = new Set<string>();
  return colors.filter((color) => {
    const key = color.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sampleGradient(stops: Rgba[]): Rgba[] {
  const samples: Rgba[] = [];
  for (let pair = 0; pair < stops.length - 1; pair++) {
    const from = stops[pair];
    const to = stops[pair + 1];
    for (let i = 0; i < GRADIENT_SAMPLES; i++) {
      const t = i / (GRADIENT_SAMPLES - 1);
      samples.push([
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
        from[3] + (to[3] - from[3]) * t,
      ]);
    }
  }
  return samples;
}

function capped(colors: Rgb[]): BackdropResolution | null {
  const unique = dedupeColors(colors);
  return unique.length > MAX_BG_CANDIDATES
    ? { colors: [], indeterminate: true, reason: "candidate-cap" }
    : null;
}

function resolveBackdrop(layers: BackgroundLayer[]): BackdropResolution {
  // CSS paints the root canvas white when html/body provide no backdrop.
  // This is the only intentional assumed-white base in the audit.
  let colors: Rgb[] = [[255, 255, 255]];
  let indeterminate = false;
  let reason: string | undefined;

  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (layer.color) {
      const color = parseKnownColor(layer.color);
      if (!color) {
        colors = [];
        indeterminate = true;
        reason = "unparsed-color";
      } else if (color[3] > 0) {
        if (color[3] >= 1) {
          colors = [[color[0], color[1], color[2]]];
          indeterminate = false;
          reason = undefined;
        } else if (colors.length > 0) {
          colors = colors.map((backdrop) => compositeColor(color, backdrop));
        }
      }
    }

    if (layer.image && layer.image.trim().toLowerCase() !== "none") {
      const imageLayers = splitTopLevelCommas(layer.image);
      if (!imageLayers) {
        colors = [];
        indeterminate = true;
        reason = "unparsed-background-image";
        continue;
      }
      // CSS paints the first image nearest the viewer, so resolve last → first.
      for (let imageIndex = imageLayers.length - 1; imageIndex >= 0; imageIndex--) {
        const stops = parseGradientStops(imageLayers[imageIndex]);
        if (!stops) {
          colors = [];
          indeterminate = true;
          reason = "unparsed-background-image";
          continue;
        }
        const samples = sampleGradient(stops);
        if (indeterminate) {
          if (samples.every((sample) => sample[3] >= 1)) {
            colors = samples.map((sample) => [sample[0], sample[1], sample[2]] as Rgb);
            indeterminate = false;
            reason = undefined;
          } else {
            colors = samples
              .filter((sample) => sample[3] >= 1)
              .map((sample) => [sample[0], sample[1], sample[2]] as Rgb);
          }
        } else {
          const next: Rgb[] = [];
          for (const sample of samples) {
            for (const backdrop of colors) next.push(compositeColor(sample, backdrop));
          }
          const overflow = capped(next);
          if (overflow) {
            colors = [];
            indeterminate = true;
            reason = overflow.reason;
            continue;
          }
          colors = dedupeColors(next);
        }
        const overflow = capped(colors);
        if (overflow) {
          colors = [];
          indeterminate = true;
          reason = overflow.reason;
        }
      }
    }
  }

  return { colors: dedupeColors(colors), indeterminate, reason };
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
  // CSS initial canvas color is white when no authored backdrop exists.
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
    bgLayers?: BackgroundLayer[];
    bgIndeterminateReason?: string;
    fontPx?: number;
    bold?: boolean;
    text?: string;
  }>
): ContrastResult {
  const warnings: string[] = [];
  const rows: ContrastRow[] = [];

  for (const el of elements) {
    const foreground = parseKnownColor(el.color);
    const legacySingleBackground = el.bgLayers === undefined && !(el.bgColors && el.bgColors.length > 0);
    const layers = el.bgLayers ??
      (el.bgColors && el.bgColors.length > 0
        ? el.bgColors.map((color) => ({ color, image: null }))
        : [{ color: el.bgColor, image: null }]);
    const backdrop = resolveBackdrop(layers);

    const fontPx = el.fontPx ?? 16;
    const bold = el.bold ?? false;
    const large = fontPx >= 24 || (fontPx >= 18.66 && bold);
    const required_aa = large ? 3 : 4.5;
    const required_aaa = large ? 4.5 : 7;

    const ratios = foreground
      ? backdrop.colors.map((bg) => contrastRatio(compositeColor(foreground, bg), bg))
      : [];
    const ratioMin = ratios.length > 0 ? Math.min(...ratios) : 1;
    const ratioMax = ratios.length > 0 ? Math.max(...ratios) : 21;
    const worstIndex = ratios.length > 0 ? ratios.indexOf(ratioMin) : -1;
    const allPass = ratios.length > 0 && ratios.every((ratio) => ratio >= required_aa);
    const allFail = ratios.length > 0 && ratios.every((ratio) => ratio < required_aa);
    const indeterminateReason = el.bgIndeterminateReason ||
      (!foreground ? "unparsed-color" : backdrop.reason) ||
      (!allPass && !allFail ? "mixed-background-range" : undefined);
    const bgIndeterminate = indeterminateReason !== undefined || backdrop.indeterminate;
    const status: ContrastRow["status"] = bgIndeterminate
      ? "indeterminate"
      : allPass ? "pass" : "fail";
    const aa = status === "indeterminate" ? null : allPass;
    const aaa = status === "indeterminate"
      ? null
      : ratios.length > 0 && ratios.every((ratio) => ratio >= required_aaa);
    const delta_to_aa = Math.max(0, required_aa - ratioMin);
    const bgValues = backdrop.colors.map((bg) => `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`);
    const effectiveBg = bgValues.length === 0
      ? "indeterminate (background-image)"
      : bgValues.length === 1
        ? bgValues[0]
        : bgValues[0] + " to " + bgValues[bgValues.length - 1];
    const legacyColor = legacySingleBackground ? parseKnownColor(el.bgColor) : null;
    const background = legacyColor && legacyColor[3] >= 1
      ? el.bgColor
      : worstIndex >= 0
        ? bgValues[worstIndex]
        : effectiveBg;

    rows.push({
      selector: el.selector,
      text: el.text ?? "",
      foreground: el.color,
      background,
      fontPx,
      bold,
      large,
      status,
      ratio: status === "indeterminate" ? null : Math.round(ratioMin * 100) / 100,
      aa,
      aaa,
      required_aa,
      delta_to_aa: status === "indeterminate" ? null : Math.round(delta_to_aa * 100) / 100,
      effective_bg: effectiveBg,
      bg_indeterminate: bgIndeterminate,
      ...(indeterminateReason ? { indeterminate_reason: indeterminateReason } : {}),
      ...(ratios.length > 0 && (bgValues.length > 1 || bgIndeterminate)
        ? {
            ratio_min: Math.round(ratioMin * 100) / 100,
            ratio_max: Math.round(ratioMax * 100) / 100,
          }
        : {}),
    });
  }

  const aa_failures = rows.filter((r) => r.status === "fail");
  const indeterminate_bg_rows = rows.filter((r) => r.status === "indeterminate");
  const indeterminate_bg_note = indeterminate_bg_rows.length > 0
    ? "Rows with mixed or unparseable image backdrops need review; they are not counted as AA failures."
    : "No background rows need review.";

  return {
    total_text_elements: rows.length,
    rows,
    aa_failures,
    aa_fail_count: aa_failures.length,
    indeterminate_bg_rows,
    indeterminate_bg_count: indeterminate_bg_rows.length,
    indeterminate_bg_note,
    mode_note: "Snapshot mode uses supplied bgColor/bgColors and the legacy over-white fallback; real DOM-backdrop compositing applies only to URL mode.",
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
  let browser: import("playwright").Browser | null = null;
  const warnings: string[] = [];

  try {
    try {
      browser = await launchAuditChromium();
    } catch (launchError) {
      // Only a genuinely absent/unlaunchable chromium is CaptureUnavailable.
      // acquireBrowserSlot() (src/browser-launch.ts) throws "Hosted browser
      // capacity busy - retry shortly" when the concurrency slot wait times out,
      // and laundering THAT into CaptureUnavailableError makes the tool answer
      // "audit_contrast url mode needs headless chromium" on a host where
      // chromium is present and working. That message is false, unactionable,
      // and — because it only appears under load — reads as an intermittent
      // wrong result rather than as backpressure. Rethrow it unchanged.
      var launchMessage = launchError instanceof Error ? launchError.message : String(launchError);
      if (/capacity busy/i.test(launchMessage)) {
        throw launchError;
      }
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
      bgLayers: BackgroundLayer[];
      bgIndeterminateReason?: string;
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
      function normalizeCssColor(value: string): string | null {
        // Paint a 1x1 pixel and read it back: getImageData returns plain rgba
        // integers for ANY valid color format (oklch/lab/color(srgb ...)),
        // whereas fillStyle readback serializes wide-gamut inputs in formats
        // the Node-side parser cannot handle.
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;
        // Validity probe: an invalid color leaves fillStyle unchanged twice.
        context.fillStyle = "#010203";
        context.fillStyle = value;
        const first = context.fillStyle;
        context.fillStyle = "#040506";
        context.fillStyle = value;
        const second = context.fillStyle;
        if (first === "#010203" && second === "#040506") return null;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const d = context.getImageData(0, 0, 1, 1).data;
        const a = d[3] / 255;
        if (a === 0) return "rgba(0, 0, 0, 0)";
        // getImageData is alpha-premultiplied on write+read; un-premultiply.
        const r = Math.min(255, Math.round(d[0] / a));
        const g = Math.min(255, Math.round(d[1] / a));
        const b = Math.min(255, Math.round(d[2] / a));
        return a >= 1
          ? `rgb(${r}, ${g}, ${b})`
          : `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
      }

      function effectiveBgLayers(el: Element): {
        layers: BackgroundLayer[];
        reason?: string;
      } {
        const stack: BackgroundLayer[] = [];
        let node: Element | null = el;
        let hardReason: string | undefined;
        let positionedBeforeOpaque = false;
        let foundOpaque = false;
        while (node) {
          const style = window.getComputedStyle(node);
          if (parseFloat(style.opacity) < 1 && hardReason === undefined) hardReason = "ancestor-opacity";
          if (!foundOpaque && (style.position === "fixed" || style.position === "absolute" || style.position === "sticky")) {
            positionedBeforeOpaque = true;
          }
          if (style.display === "contents") {
            if (hardReason === undefined) hardReason = "display-contents";
            node = node.parentElement;
            continue;
          }
          if (foundOpaque) {
            node = node.parentElement;
            continue;
          }
          const bg = normalizeCssColor(style.backgroundColor) || style.backgroundColor;
          const image = style.backgroundImage && style.backgroundImage !== "none"
            ? style.backgroundImage
            : null;
          let color: string | null = null;
          let opaqueColor = false;
          if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
            // Check alpha: rgba(..., alpha) or rgb(...) which is fully opaque
            const rgbaMatch = bg.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
            if (rgbaMatch) {
              const alpha = parseFloat(rgbaMatch[1]);
              if (alpha > 0) {
                color = bg;
                opaqueColor = alpha >= 1;
              }
              // alpha === 0: skip (fully transparent)
            } else {
              // rgb(...) form — fully opaque
              color = bg;
              opaqueColor = true;
            }
          }
          if (color || image) stack.push({ color, image });
          if (opaqueColor) {
            foundOpaque = true;
          }
          node = node.parentElement;
        }
        const reason = hardReason ||
          (positionedBeforeOpaque && !foundOpaque ? "positioned-transparent-chain" : undefined);
        return reason ? { layers: stack, reason } : { layers: stack };
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
        const color = normalizeCssColor(style.color || "") || style.color || "unparsed-color";
        const backgroundWalk = effectiveBgLayers(el);
        const bgLayers = backgroundWalk.layers;
        const bgColors = bgLayers.flatMap((layer) => layer.color ? [layer.color] : []);
        // Back-compat only: scoring uses bgLayers. Transparent here lets the
        // Node-side resolver reach the genuine CSS canvas default when empty.
        const bgColor = bgColors.length > 0 ? bgColors[0] : "transparent";
        const fontPx = parseFloat(style.fontSize) || 16;
        const fw = style.fontWeight;
        const bold = parseInt(fw) >= 600 || fw === "bold";
        const text = (el.textContent || "").trim().slice(0, 60);
        const selector = stableSelector(el);

        results.push({
          selector, color, bgColor, bgColors, bgLayers, fontPx, bold, text,
          ...(backgroundWalk.reason ? { bgIndeterminateReason: backgroundWalk.reason } : {}),
        });
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
    result.mode_note = "URL mode composites parseable CSS backgrounds through the DOM ancestor chain; cross-stacking-context siblings are reported indeterminate rather than pixel-sampled.";
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

/** Keep only determinate failures when routing audit rows into remediation. */
export function filterSuggestibleContrastPairs<T extends {
  status?: "pass" | "fail" | "indeterminate";
  ratio?: number | null;
}>(rows: T[]): T[] {
  return rows.filter((row) =>
    row.status !== "indeterminate" &&
    row.status !== "pass" &&
    row.ratio !== null
  );
}

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
  // A standalone translucent background pair has no supplied ancestor stack,
  // so CSS's initial white canvas is the only defined backdrop here.
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
