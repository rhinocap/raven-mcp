/**
 * tap-targets.ts — WCAG 2.5.5 / Apple 44pt tap-target audit module.
 *
 * Two input modes:
 *   url mode      — renders a page with Playwright, collects every interactive
 *                   element's getBoundingClientRect w/h via page.evaluate.
 *   snapshot mode — accepts a caller-supplied elements[] array (no browser needed).
 *
 * For each element: pass = (w >= minSize && h >= minSize). Failures include a
 * concrete fix suggestion. Results sorted worst-first (largest combined deficit).
 */

import { CaptureUnavailableError } from "./capture.js";

export { CaptureUnavailableError };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TapTargetElement = {
  selector: string;
  role?: string;
  text?: string;
  w: number;
  h: number;
  x?: number;
  y?: number;
};

export type TapTargetRow = {
  selector: string;
  role: string;
  text: string;
  w: number;
  h: number;
  deficit_w: number;
  deficit_h: number;
  fix: string;
};

export type TapTargetResult = {
  url?: string;
  viewport?: { w: number; h: number };
  minSize: number;
  total: number;
  passing: number;
  failing: number;
  fix_table: TapTargetRow[];
  warnings: string[];
};

export type TapTargetOptions = {
  viewport?: { w: number; h: number };
  timeoutMs?: number;
  minSize?: number;
};

// ---------------------------------------------------------------------------
// Fix suggestion generator
// ---------------------------------------------------------------------------

function suggestFix(w: number, h: number, minSize: number): string {
  const deficit_w = Math.max(0, minSize - w);
  const deficit_h = Math.max(0, minSize - h);
  const parts: string[] = [];

  if (deficit_w > 0) {
    const pad = Math.ceil(deficit_w / 2);
    parts.push(`min-width: ${minSize}px (or add padding-left/right: ${pad}px)`);
  }
  if (deficit_h > 0) {
    const pad = Math.ceil(deficit_h / 2);
    parts.push(`min-height: ${minSize}px (or add padding-top/bottom: ${pad}px)`);
  }

  if (parts.length === 0) return "already meets minimum";
  return `add ${parts.join("; ")}`;
}

// ---------------------------------------------------------------------------
// Snapshot audit (pure — no Playwright needed)
// ---------------------------------------------------------------------------

/**
 * Score a pre-collected snapshot of interactive elements. No browser required.
 */
export function auditTapTargetsSnapshot(
  elements: TapTargetElement[],
  minSize = 44
): TapTargetResult {
  const warnings: string[] = [];
  const fix_table: TapTargetRow[] = [];
  let passing = 0;

  for (const el of elements) {
    const { w, h } = el;
    const pass = w >= minSize && h >= minSize;

    if (pass) {
      passing++;
    } else {
      const deficit_w = Math.max(0, minSize - w);
      const deficit_h = Math.max(0, minSize - h);
      fix_table.push({
        selector: el.selector,
        role: el.role ?? "interactive",
        text: el.text ?? "",
        w,
        h,
        deficit_w: Math.round(deficit_w * 10) / 10,
        deficit_h: Math.round(deficit_h * 10) / 10,
        fix: suggestFix(w, h, minSize),
      });
    }
  }

  // Sort worst-first: largest combined deficit first
  fix_table.sort((a, b) => (b.deficit_w + b.deficit_h) - (a.deficit_w + a.deficit_h));

  return {
    minSize,
    total: elements.length,
    passing,
    failing: fix_table.length,
    fix_table,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// URL audit (Playwright)
// ---------------------------------------------------------------------------

const ELEMENT_CAP = 500;

// CSS selector covering all standard interactive elements
const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "[role='button']",
  "input[type='submit']",
  "input[type='button']",
  "input[type='checkbox']",
  "input[type='radio']",
  "select",
  "summary",
  "label[for]",
  "[onclick]",
  "[tabindex]",
].join(", ");

/**
 * Render a URL in headless Chromium, collect every interactive element's
 * computed rect and ARIA role, then score with auditTapTargetsSnapshot.
 */
export async function auditTapTargetsUrl(
  url: string,
  opts?: TapTargetOptions
): Promise<TapTargetResult> {
  let chromium: import("playwright").BrowserType;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new CaptureUnavailableError(
      "Playwright chromium not available. Run: npx playwright install chromium"
    );
  }

  const viewport = opts?.viewport ?? { w: 1440, h: 900 };
  const minSize = opts?.minSize ?? 44;
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
    await page.setViewportSize({ width: viewport.w, height: viewport.h });
    await page.goto(url, {
      waitUntil: "load",
      timeout: opts?.timeoutMs ?? 30000,
    });

    type RawEl = {
      selector: string;
      role: string;
      text: string;
      w: number;
      h: number;
      x: number;
      y: number;
    };

    const raw: RawEl[] = await page.evaluate(
      ({ cap, interactiveSel }: { cap: number; interactiveSel: string }) => {
        const results: RawEl[] = [];

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

        function inferRole(el: Element): string {
          const explicit = el.getAttribute("role");
          if (explicit) return explicit;
          const tag = el.tagName.toLowerCase();
          if (tag === "a") return "link";
          if (tag === "button") return "button";
          if (tag === "select") return "combobox";
          if (tag === "summary") return "button";
          if (tag === "label") return "label";
          const type = (el as HTMLInputElement).type?.toLowerCase() ?? "";
          if (tag === "input") {
            if (type === "checkbox") return "checkbox";
            if (type === "radio") return "radio";
            if (type === "submit" || type === "button") return "button";
          }
          return "interactive";
        }

        function isVisible(el: Element): boolean {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 || rect.height > 0;
        }

        // Collect by the interactive selector
        const seen = new Set<Element>();
        const bySelector = document.querySelectorAll(interactiveSel);
        for (let i = 0; i < bySelector.length; i++) {
          if (results.length >= cap) break;
          const el = bySelector[i];
          if (seen.has(el)) continue;
          seen.add(el);

          // Filter tabindex: only tabindex >= 0 counts as intentionally interactive
          if (el.hasAttribute("tabindex")) {
            const ti = parseInt(el.getAttribute("tabindex") ?? "-1", 10);
            if (ti < 0) continue;
          }

          if (!isVisible(el)) continue;

          const rect = el.getBoundingClientRect();
          results.push({
            selector: stableSelector(el),
            role: inferRole(el),
            text: (el.textContent ?? "").trim().slice(0, 60),
            w: Math.round(rect.width * 10) / 10,
            h: Math.round(rect.height * 10) / 10,
            x: Math.round(rect.x),
            y: Math.round(rect.y),
          });
        }

        return results;
      },
      { cap: ELEMENT_CAP, interactiveSel: INTERACTIVE_SELECTOR }
    );

    if (raw.length >= ELEMENT_CAP) {
      warnings.push(
        `Element count capped at ${ELEMENT_CAP}. Some interactive elements were not audited.`
      );
    }

    const result = auditTapTargetsSnapshot(raw, minSize);
    result.url = url;
    result.viewport = viewport;
    result.warnings.push(...warnings);
    return result;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
