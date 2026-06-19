/**
 * responsive.ts — audit_responsive_visibility implementation
 * Renders a URL at multiple breakpoints and flags content elements
 * that are visible on desktop but hidden on mobile.
 */

import { CaptureUnavailableError } from "./capture.js";

export type VisibilityRow = {
  selector: string;
  hidingClass: string | null;
  isContent: boolean;
  isDecorative: boolean;
  visibleAt: { breakpoint: number; visible: boolean }[];
  mobileVisible: boolean;
  desktopVisible: boolean;
  category: "intentional" | "likely-oversight";
};

export type ResponsiveVisibilityResult = {
  url: string;
  breakpoints: number[];
  flagged: VisibilityRow[];
  flagged_count: number;
  likely_oversight_count: number;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Regex patterns used in page.evaluate (serialised as strings) and host-side
// ---------------------------------------------------------------------------

const HIDING_CLASS_RE =
  /(?:(?:sm|md|lg|xl|2xl):hidden)|(?:hidden\s+(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline|inline-block|table))/;

const DECORATIVE_CLASS_RE =
  /(decoration|divider|spacer|ornament|glow|blur|gradient|accent|bg-)(\s|$)/;

// ---------------------------------------------------------------------------
// Helper: build a stable unique CSS selector for an element
// ---------------------------------------------------------------------------

function buildSelector(el: Element): string {
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  const parts: string[] = [];
  let node: Element | null = el;

  while (node && node !== document.documentElement) {
    const current: Element = node;
    const parent = current.parentElement;
    if (!parent) break;

    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (c) => c.tagName === current.tagName
    );

    if (siblings.length === 1) {
      parts.unshift(tag);
    } else {
      const idx = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${idx})`);
    }

    if (parent === document.body) {
      parts.unshift("body");
      break;
    }

    node = parent;
  }

  return parts.join(" > ") || el.tagName.toLowerCase();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function captureResponsiveVisibility(
  url: string,
  breakpoints?: number[],
  opts?: { viewportHeight?: number; timeoutMs?: number }
): Promise<ResponsiveVisibilityResult> {
  const bps = (breakpoints && breakpoints.length > 0 ? [...breakpoints] : [390, 768, 1440, 2160]).sort(
    (a, b) => a - b
  );
  const viewportHeight = opts?.viewportHeight ?? 900;
  const timeoutMs = opts?.timeoutMs ?? 30_000;

  const warnings: string[] = [];

  // Lazy playwright import
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new CaptureUnavailableError(
      "Playwright chromium not available. Run: npx playwright install chromium"
    );
  }

  let browser: import("playwright").Browser | null = null;

  try {
    try {
      browser = await playwright.chromium.launch({ headless: true });
    } catch {
      throw new CaptureUnavailableError(
        "Playwright chromium not available. Run: npx playwright install chromium"
      );
    }

    const page = await browser.newPage();
    await page.setViewportSize({ width: bps[0], height: viewportHeight });
    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });

    // ----- Step 1: collect candidate elements (at initial viewport) -----
    type CandidateMeta = {
      selector: string;
      hidingClass: string | null;
      isDecorative: boolean;
      isContent: boolean;
      className: string;
    };

    const candidateMetas: CandidateMeta[] = await page.evaluate(
      ({
        hidingClassReStr,
        decorativeClassReStr,
      }: {
        hidingClassReStr: string;
        decorativeClassReStr: string;
      }) => {
        const hidingRe = new RegExp(hidingClassReStr);
        const decorativeRe = new RegExp(decorativeClassReStr);

        const CONTENT_SELECTOR =
          "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,[data-lede]";

        function buildSel(el: Element): string {
          if (el.id) {
            return "#" + CSS.escape(el.id);
          }
          const parts: string[] = [];
          let node: Element | null = el;
          while (node && node !== document.documentElement) {
            const current: Element = node;
            const parent = current.parentElement;
            if (!parent) break;
            const tag = current.tagName.toLowerCase();
            const siblings = Array.from(parent.children).filter(
              (c) => c.tagName === current.tagName
            );
            if (siblings.length === 1) {
              parts.unshift(tag);
            } else {
              const idx = siblings.indexOf(current) + 1;
              parts.unshift(tag + ":nth-of-type(" + idx + ")");
            }
            if (parent === document.body) {
              parts.unshift("body");
              break;
            }
            node = parent;
          }
          return parts.join(" > ") || el.tagName.toLowerCase();
        }

        const seen = new Set<Element>();
        const results: Array<{
          selector: string;
          hidingClass: string | null;
          isDecorative: boolean;
          isContent: boolean;
          className: string;
        }> = [];

        // Content candidates
        document.querySelectorAll(CONTENT_SELECTOR).forEach((el) => {
          if (!seen.has(el)) seen.add(el);
        });

        // Additionally: any element with a tailwind responsive-hide class pattern
        document.querySelectorAll("*").forEach((el) => {
          const cn = (el as HTMLElement).className;
          if (typeof cn === "string" && hidingRe.test(cn) && !seen.has(el)) {
            seen.add(el);
          }
        });

        seen.forEach((el) => {
          const elem = el as HTMLElement;
          const cn = typeof elem.className === "string" ? elem.className : "";
          const ariaHidden = elem.getAttribute("aria-hidden");
          const role = elem.getAttribute("role") ?? "";
          const tag = elem.tagName.toLowerCase();
          const text = (elem.textContent ?? "").trim();
          const hasDataDecorative = elem.hasAttribute("data-decorative");

          const isDecorative =
            ariaHidden === "true" ||
            role === "presentation" ||
            role === "none" ||
            tag === "svg" ||
            tag === "hr" ||
            tag === "canvas" ||
            tag === "path" ||
            text === "" ||
            decorativeRe.test(cn) ||
            hasDataDecorative;

          const isContent = !isDecorative && text.length > 0;

          const hidingMatch = cn.match(hidingRe);
          const hidingClass = hidingMatch ? hidingMatch[0] : null;

          results.push({
            selector: buildSel(el),
            hidingClass,
            isDecorative,
            isContent,
            className: cn,
          });
        });

        return results;
      },
      {
        hidingClassReStr: HIDING_CLASS_RE.source,
        decorativeClassReStr: DECORATIVE_CLASS_RE.source,
      }
    );

    if (candidateMetas.length === 0) {
      warnings.push("No candidate elements found on the page.");
    }

    // ----- Step 2: for each breakpoint, evaluate visibility of each candidate -----
    type BpVisibility = { breakpoint: number; visible: boolean };

    const visibilityMatrix: BpVisibility[][] = [];

    for (const bp of bps) {
      await page.setViewportSize({ width: bp, height: viewportHeight });
      // Small settle for layout recalculation
      await page.waitForTimeout(120);

      const selectors = candidateMetas.map((c) => c.selector);

      const bpResults: boolean[] = await page.evaluate((sels: string[]) => {
        return sels.map((sel) => {
          let el: Element | null = null;
          try {
            el = document.querySelector(sel);
          } catch {
            return false;
          }
          if (!el) return false;
          const elem = el as HTMLElement;
          const style = window.getComputedStyle(elem);
          if (style.display === "none") return false;
          if (style.visibility === "hidden") return false;
          if (parseFloat(style.opacity) === 0) return false;
          const rect = elem.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return true;
        });
      }, selectors);

      visibilityMatrix.push(
        bpResults.map((visible, i) => ({ breakpoint: bps[i] ?? bp, visible }))
      );
    }

    // ----- Step 3: assemble rows and flag -----
    const flagged: VisibilityRow[] = [];

    for (let i = 0; i < candidateMetas.length; i++) {
      const meta = candidateMetas[i];
      if (!meta) continue;

      // visibilityMatrix is indexed [breakpointIndex][elementIndex]
      // Reshape to per-element
      const visibleAt: BpVisibility[] = bps.map((bp, bpIdx) => ({
        breakpoint: bp,
        visible: visibilityMatrix[bpIdx]?.[i]?.visible ?? false,
      }));

      const mobileVisible = visibleAt[0]?.visible ?? false;
      const desktopVisible = visibleAt[visibleAt.length - 1]?.visible ?? false;

      if (desktopVisible && !mobileVisible) {
        const category: "intentional" | "likely-oversight" = meta.isDecorative
          ? "intentional"
          : "likely-oversight";

        flagged.push({
          selector: meta.selector,
          hidingClass: meta.hidingClass,
          isContent: meta.isContent,
          isDecorative: meta.isDecorative,
          visibleAt,
          mobileVisible,
          desktopVisible,
          category,
        });
      }
    }

    const likely_oversight_count = flagged.filter(
      (r) => r.category === "likely-oversight"
    ).length;

    return {
      url,
      breakpoints: bps,
      flagged,
      flagged_count: flagged.length,
      likely_oversight_count,
      warnings,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
