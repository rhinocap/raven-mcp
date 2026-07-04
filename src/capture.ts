import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ImageEdgeSample } from "./asset-integrity.js";

export type { ImageEdgeSample } from "./asset-integrity.js";

const CAPTURE_UNAVAILABLE_MESSAGE =
  "Playwright chromium not available. Run: npx playwright install chromium";

const EMPTY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

type BrowserLike = {
  newPage: () => Promise<PageLike>;
  close: () => Promise<void>;
};

type ChromiumLike = {
  launch: (options: { headless: boolean }) => Promise<BrowserLike>;
};

type ElementHandleLike = {
  evaluate: <T>(fn: (element: any, arg?: any) => T | Promise<T>, arg?: any) => Promise<T>;
  getAttribute: (name: string) => Promise<string | null>;
};

type PageLike = {
  content: () => Promise<string>;
  evaluate: <T>(fn: (arg?: any) => T | Promise<T>, arg?: any) => Promise<T>;
  emulateMedia?: (options: { colorScheme?: "light" | "dark" | "no-preference" }) => Promise<void>;
  goto: (url: string, options: { waitUntil: "load"; timeout: number }) => Promise<unknown>;
  hover: (selector: string, options?: { timeout?: number }) => Promise<void>;
  click: (selector: string, options?: { timeout?: number }) => Promise<void>;
  focus: (selector: string, options?: { timeout?: number }) => Promise<void>;
  screenshot: (options: { fullPage: boolean }) => Promise<Buffer>;
  setViewportSize: (viewport: { width: number; height: number }) => Promise<void>;
  waitForFunction: (
    fn: (arg?: any) => boolean,
    arg?: any,
    options?: { timeout: number }
  ) => Promise<unknown>;
  waitForTimeout: (timeout: number) => Promise<void>;
  $$: (selector: string) => Promise<ElementHandleLike[]>;
};

export type Theme = "light" | "dark";

export type PageTraits = {
  source: "live" | "static";
  scheme: "light" | "dark" | "mixed" | "unknown";
  bg_luminance: number | null;        // 0..1, body/hero effective background
  text_density: number | null;        // visible text chars / total page height px
  section_count: number;
  image_count: number;
  video_count: number;
  canvas_count: number;
  webgl: boolean | null;              // live only: WebGL context detectable on a canvas
  backdrop_filter: boolean;
  animation_count: number | null;     // live only: document.getAnimations().length incl. infinite
  scroll_effects: boolean | null;     // live only: heuristic — elements with transform/opacity transitions gated off-viewport, or scroll listeners
  font_families: string[];            // distinct families actually in use (live) / declared in CSS text (static)
  max_heading_px: number | null;      // largest h1-h3 computed font-size (live)
  gradient_count: number;
  loader_hint: boolean;               // full-viewport fixed overlay early in DOM, or role=progressbar, or class/id matching load|spinner|progress
  viewport_fill: number | null;       // live only: fraction of first viewport covered by content boxes
};

export class CaptureUnavailableError extends Error {
  constructor(message: string = CAPTURE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "CaptureUnavailableError";
  }
}

export type VideoArtifactReason =
  | "preload-none"
  | "autoplay-blocked"
  | "empty-src"
  | "decode-error"
  | "unknown";

export type VideoArtifact = {
  selector: string;
  /** The `preload` attribute value on the element (e.g. "none", "auto", "metadata"). */
  preload: string;
  renderedBlank: boolean;
  /**
   * Discriminated reason for the blank-video detection.
   *
   * - `"preload-none"`: element has preload=none and never buffered (lazy-load pattern — likely not a real defect)
   * - `"autoplay-blocked"`: play() was rejected with NotAllowedError (browser autoplay policy — likely not a real defect)
   * - `"empty-src"`: currentSrc is empty or networkState is NETWORK_NO_SOURCE — genuine missing/broken source
   * - `"decode-error"`: video.error.code is set (MEDIA_ERR_*) — genuine decode/network failure
   * - `"unknown"`: did not match any specific classification
   *
   * @deprecated The legacy value `"unloaded-video-artifact"` is no longer emitted by this library but
   *   may appear in data produced by older versions. Callers should treat it as `"unknown"`.
   */
  reason: VideoArtifactReason | "unloaded-video-artifact";
  /** Raw HTMLMediaElement.error.code value (1–4, MEDIA_ERR_* constants), if an error is set. */
  errorCode?: number;
  /** Raw HTMLMediaElement.networkState value at probe time. */
  networkState?: number;
};

export type CaptureResult = {
  url: string;
  renderedHtml: string;
  screenshotBase64: string;
  viewport: { w: number; h: number };
  theme?: Theme;
  scrolledToBottom: boolean;
  /**
   * True when all finite (non-looping) CSS animations/transitions on the page reached
   * quiescence before capture; false when the settle wait timed out or the browser has
   * no `document.getAnimations` support (older engines / the file:// no-browser fallback).
   */
  animationsSettled: boolean;
  videoArtifacts: VideoArtifact[];
  imageEdges?: ImageEdgeSample[];
  traits?: PageTraits;
  warnings: string[];
};

export type Interaction = { selector: string; event: "hover" | "click" | "focus"; delay_ms: number };

export type CaptureOptions = {
  interactions?: Interaction[];
  scroll_settle?: boolean;
  viewport?: { w: number; h: number };
  theme?: Theme;
  collectImageEdges?: boolean;
  collectTraits?: boolean;
  timeoutMs?: number;
};

export async function capturePage(url: string, opts?: CaptureOptions): Promise<CaptureResult> {
  const viewport = opts && opts.viewport ? opts.viewport : { w: 1440, h: 900 };
  const timeoutMs = opts && typeof opts.timeoutMs === "number" ? opts.timeoutMs : 30000;
  const scrollSettle = opts ? opts.scroll_settle === true : false;
  const theme = opts && opts.theme ? opts.theme : undefined;
  const collectImageEdges = opts ? opts.collectImageEdges === true : false;
  const collectTraits = opts ? opts.collectTraits === true : false;
  let browser: BrowserLike | null = null;
  const warnings: string[] = [];

  try {
    try {
      const chromium = await loadChromium();
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      const fallback = captureFileUrlWithoutBrowser(
        url,
        viewport,
        scrollSettle,
        opts && Array.isArray(opts.interactions) ? opts.interactions : [],
        collectTraits,
        warnings,
        error
      );
      if (fallback !== null) {
        return fallback;
      }
      throw new CaptureUnavailableError();
    }

    const page = await browser.newPage();
    await page.setViewportSize({ width: viewport.w, height: viewport.h });

    if (theme && typeof page.emulateMedia === "function") {
      try {
        await page.emulateMedia({ colorScheme: theme });
      } catch (error) {
        warnings.push("Failed to emulate color scheme " + theme + ": " + errorMessage(error));
      }
    }

    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });

    if (theme) {
      // Many sites toggle dark mode via a documentElement attribute/class rather
      // than (or in addition to) prefers-color-scheme. Set both so the captured
      // DOM reflects the requested theme regardless of the site's toggle scheme.
      try {
        await page.evaluate(function (t: string) {
          document.documentElement.setAttribute("data-theme", t);
          document.documentElement.classList.toggle("dark", t === "dark");
          document.documentElement.classList.toggle("light", t === "light");
        }, theme);
        await page.waitForTimeout(120);
      } catch (error) {
        warnings.push("Failed to apply theme attribute " + theme + ": " + errorMessage(error));
      }
    }

    let scrolledToBottom = false;
    let videoArtifacts: VideoArtifact[] = [];

    if (scrollSettle) {
      await page.evaluate(function () {
        window.scrollTo(0, 0);
      });

      const scrollHeight = await page.evaluate(function () {
        return document.body.scrollHeight;
      });

      const stepHeight = viewport.h;
      for (let y = 0; y < scrollHeight; y += stepHeight) {
        await page.evaluate(function (step) {
          window.scrollBy(0, step);
        }, stepHeight);
      }

      await page.evaluate(function () {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(300);
      scrolledToBottom = true;
      videoArtifacts = await detectVideoArtifacts(page, warnings);
    }

    const interactions = opts && Array.isArray(opts.interactions) ? opts.interactions : [];
    for (const interaction of interactions) {
      const selector = interaction.selector;
      const event = interaction.event;
      const delayMs = typeof interaction.delay_ms === "number" ? interaction.delay_ms : 0;

      try {
        if (event === "hover") {
          await page.hover(selector, { timeout: timeoutMs });
        } else if (event === "click") {
          await page.click(selector, { timeout: timeoutMs });
        } else if (event === "focus") {
          await page.focus(selector, { timeout: timeoutMs });
        } else {
          warnings.push("Unknown interaction event: " + event);
          await page.waitForTimeout(delayMs);
          continue;
        }
      } catch (error) {
        warnings.push("Interaction failed (" + event + " " + selector + "): " + errorMessage(error));
      }

      await page.waitForTimeout(delayMs);
    }

    const animationsSettled = await waitForAnimationsToSettle(page, warnings);

    let traits: PageTraits | undefined = undefined;
    if (collectTraits) {
      traits = await collectPageTraits(page, warnings);
    }

    let imageEdges: ImageEdgeSample[] | undefined = undefined;
    if (collectImageEdges) {
      imageEdges = await sampleImageEdges(page, warnings);
    }

    const renderedHtml = await page.content();
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString("base64");

    return {
      url: url,
      renderedHtml: renderedHtml,
      screenshotBase64: screenshotBase64,
      viewport: viewport,
      theme: theme,
      scrolledToBottom: scrolledToBottom,
      animationsSettled: animationsSettled,
      videoArtifacts: videoArtifacts,
      imageEdges: imageEdges,
      traits: traits,
      warnings: warnings
    };
  } finally {
    if (browser !== null) {
      try {
        await browser.close();
      } catch (error) {
        warnings.push("Failed to close browser: " + errorMessage(error));
      }
    }
  }
}

export function annotateVideoArtifacts(elements: any[]): VideoArtifact[] {
  if (!Array.isArray(elements)) {
    return [];
  }

  const artifacts: VideoArtifact[] = [];
  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i];
    if (element === null || typeof element !== "object") {
      continue;
    }

    const role = element.role;
    const isVideoLike = role === "video" || role === "img";
    const isBlank = element.blank === true || element.renderedBlank === true;
    if (!isVideoLike || !isBlank) {
      continue;
    }

    artifacts.push({
      selector: String(element.selector || element.label || "video"),
      preload: String(element.preload || "none"),
      renderedBlank: true,
      reason: "unknown"
    });
  }

  return artifacts;
}

/** Input shape consumed by {@link classifyVideoArtifact}. All fields are optional so that
 *  partial probe data (e.g. from older code paths or static-HTML fallbacks) is still classifiable.
 */
export type VideoProbeData = {
  /** `HTMLMediaElement.currentSrc` — empty string when no source is resolved. */
  currentSrc?: string;
  /** `HTMLMediaElement.networkState` — 0=EMPTY, 1=IDLE, 2=LOADING, 3=NO_SOURCE. */
  networkState?: number;
  /** `HTMLMediaElement.error?.code` — set when a media error occurred (MEDIA_ERR_* 1–4). */
  errorCode?: number;
  /**
   * Name of the DOMException thrown by the play() promise (if any).
   * "NotAllowedError" → autoplay policy; "NotSupportedError" → unsupported source.
   */
  playRejection?: string;
  /** Value of the `preload` attribute. */
  preload?: string;
  /** `HTMLMediaElement.readyState` — 0=HAVE_NOTHING … 4=HAVE_ENOUGH_DATA. */
  readyState?: number;
};

/**
 * Pure, synchronous classifier that maps raw video probe data to a {@link VideoArtifactReason}.
 *
 * Priority (first match wins):
 * 1. `empty-src`    — currentSrc is empty OR networkState === NETWORK_NO_SOURCE (3)
 * 2. `decode-error` — errorCode is set (1–4)
 * 3. `autoplay-blocked` — play() rejected with NotAllowedError
 * 4. `preload-none` — preload attribute is "none" and readyState < 2
 * 5. `unknown`      — none of the above
 *
 * This is exported so it can be unit-tested in isolation without a browser.
 */
export function classifyVideoArtifact(probe: VideoProbeData): VideoArtifactReason {
  const NETWORK_NO_SOURCE = 3;

  // 1. No source resolved or network reports no source
  if (
    probe.currentSrc === "" ||
    probe.networkState === NETWORK_NO_SOURCE
  ) {
    return "empty-src";
  }

  // 2. A media error code is set
  if (typeof probe.errorCode === "number" && probe.errorCode > 0) {
    return "decode-error";
  }

  // 3. Autoplay was blocked by the browser
  if (probe.playRejection === "NotAllowedError") {
    return "autoplay-blocked";
  }

  // 4. Lazy-load pattern: preload=none and video never buffered
  if (
    typeof probe.preload === "string" &&
    probe.preload.toLowerCase() === "none" &&
    typeof probe.readyState === "number" &&
    probe.readyState < 2
  ) {
    return "preload-none";
  }

  return "unknown";
}

async function collectPageTraits(page: PageLike, warnings: string[]): Promise<PageTraits> {
  try {
    return await page.evaluate(function () {
      type ProbeColor = { r: number; g: number; b: number; a: number };
      type ProbeTraits = {
        source: "live";
        scheme: "light" | "dark" | "mixed" | "unknown";
        bg_luminance: number | null;
        text_density: number | null;
        section_count: number;
        image_count: number;
        video_count: number;
        canvas_count: number;
        webgl: boolean | null;
        backdrop_filter: boolean;
        animation_count: number | null;
        scroll_effects: boolean | null;
        font_families: string[];
        max_heading_px: number | null;
        gradient_count: number;
        loader_hint: boolean;
        viewport_fill: number | null;
      };

      function defaults(): ProbeTraits {
        return {
          source: "live",
          scheme: "unknown",
          bg_luminance: null,
          text_density: null,
          section_count: 0,
          image_count: 0,
          video_count: 0,
          canvas_count: 0,
          webgl: null,
          backdrop_filter: false,
          animation_count: null,
          scroll_effects: null,
          font_families: [],
          max_heading_px: null,
          gradient_count: 0,
          loader_hint: false,
          viewport_fill: null
        };
      }

      function count(selector: string): number {
        try {
          return document.querySelectorAll(selector).length;
        } catch {
          return 0;
        }
      }

      function parseColor(value: string): ProbeColor | null {
        var match = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?\s*\)/i.exec(value);
        if (!match) {
          return null;
        }

        return {
          r: Math.max(0, Math.min(255, Number(match[1]))),
          g: Math.max(0, Math.min(255, Number(match[2]))),
          b: Math.max(0, Math.min(255, Number(match[3]))),
          a: match[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(match[4])))
        };
      }

      function composite(top: ProbeColor, bottom: ProbeColor): ProbeColor {
        var alpha = top.a + bottom.a * (1 - top.a);
        if (alpha <= 0) {
          return { r: 255, g: 255, b: 255, a: 1 };
        }
        return {
          r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
          g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
          b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
          a: alpha
        };
      }

      function luminance(color: ProbeColor): number {
        return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
      }

      function schemeFromLuminance(value: number | null): "light" | "dark" | "mixed" | "unknown" {
        if (value === null) {
          return "unknown";
        }
        if (value > 0.6) {
          return "light";
        }
        if (value < 0.35) {
          return "dark";
        }
        return "mixed";
      }

      // The body/html walk misses the common "default-white body, full-viewport
      // dark wrapper div" pattern — the ground the user SEES is the deepest
      // opaque element covering (nearly) the whole first viewport. Scan a
      // bounded set of descendants for one and composite it over the ancestor
      // ground; DOM order means later qualifying elements paint on top.
      function dominantOverlayColor(): ProbeColor | null {
        try {
          var vw = window.innerWidth;
          var vh = window.innerHeight;
          if (!(vw > 0 && vh > 0) || !document.body) {
            return null;
          }
          var all = document.body.querySelectorAll("*");
          var limit = Math.min(all.length, 400);
          var best: ProbeColor | null = null;
          for (var i = 0; i < limit; i += 1) {
            var rect = all[i].getBoundingClientRect();
            var left = Math.max(rect.left, 0);
            var top = Math.max(rect.top, 0);
            var right = Math.min(rect.right, vw);
            var bottom = Math.min(rect.bottom, vh);
            var cover = (Math.max(0, right - left) * Math.max(0, bottom - top)) / (vw * vh);
            if (cover < 0.85) {
              continue;
            }
            var color = parseColor(window.getComputedStyle(all[i]).backgroundColor || "");
            if (color && color.a >= 0.9) {
              best = color;
            }
          }
          return best;
        } catch {
          return null;
        }
      }

      function backgroundLuminance(): number | null {
        try {
          var stack: ProbeColor[] = [];
          var node: Element | null = document.body;
          while (node) {
            var color = parseColor(window.getComputedStyle(node).backgroundColor || "");
            if (color && color.a > 0) {
              stack.push(color);
            }
            node = node.parentElement;
          }

          var effective: ProbeColor = { r: 255, g: 255, b: 255, a: 1 };
          for (var i = stack.length - 1; i >= 0; i -= 1) {
            effective = composite(stack[i], effective);
          }
          var overlay = dominantOverlayColor();
          if (overlay) {
            effective = composite(overlay, effective);
          }
          return luminance(effective);
        } catch {
          return null;
        }
      }

      function detectWebgl(canvases: NodeListOf<HTMLCanvasElement>): boolean | null {
        if (canvases.length === 0) {
          return false;
        }
        for (var i = 0; i < canvases.length; i += 1) {
          try {
            if (canvases[i].getContext("webgl2") || canvases[i].getContext("webgl")) {
              return true;
            }
          } catch {
            // Keep probing other canvases.
          }
        }
        return null;
      }

      function inspectElements(): {
        backdrop: boolean;
        fonts: string[];
        headingPx: number | null;
        scrollEffects: boolean;
        viewportFill: number | null;
        loaderHint: boolean;
      } {
        var all = Array.prototype.slice.call(document.querySelectorAll("*")) as Element[];
        var fonts: string[] = [];
        var seenFonts: Record<string, true> = {};
        var headingPx: number | null = null;
        var backdrop = false;
        var scrollEffects = false;
        var loaderHint = false;
        var viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
        var filled = 0;
        var sampleLimit = Math.min(400, all.length);
        var inspectLimit = Math.min(1200, all.length);

        for (var i = 0; i < inspectLimit; i += 1) {
          var el = all[i];
          var style = window.getComputedStyle(el);
          var backdropValue = style.backdropFilter || (style as any).webkitBackdropFilter || "";
          if (backdropValue && backdropValue !== "none") {
            backdrop = true;
          }

          if (i < sampleLimit) {
            var family = (style.fontFamily || "").split(",")[0].replace(/^["']|["']$/g, "").trim();
            if (family && !seenFonts[family]) {
              seenFonts[family] = true;
              fonts.push(family);
            }
          }

          var rect = el.getBoundingClientRect();
          var absoluteTop = rect.top + window.scrollY;
          var absoluteBottom = rect.bottom + window.scrollY;
          var visibleTop = Math.max(0, absoluteTop);
          var visibleBottom = Math.min(window.innerHeight, absoluteBottom);
          var visibleLeft = Math.max(0, rect.left);
          var visibleRight = Math.min(window.innerWidth, rect.right);
          if (visibleBottom > visibleTop && visibleRight > visibleLeft) {
            filled += (visibleBottom - visibleTop) * (visibleRight - visibleLeft);
          }

          if (absoluteTop > window.innerHeight) {
            var transition = style.transitionProperty || "";
            var animationName = style.animationName || "";
            var transitionTargetsMotion =
              transition === "all" || transition.indexOf("transform") !== -1 || transition.indexOf("opacity") !== -1;
            var animationTargetsMotion = animationName !== "" && animationName !== "none";
            var gatedState =
              Number(style.opacity) < 1 || (style.transform !== "" && style.transform !== "none");
            if ((transitionTargetsMotion || animationTargetsMotion) && gatedState) {
              scrollEffects = true;
            }
          }

          if (i < 40) {
            var classAndId = ((el.getAttribute("class") || "") + " " + (el.getAttribute("id") || "")).toLowerCase();
            var role = (el.getAttribute("role") || "").toLowerCase();
            var fixedFullViewport =
              style.position === "fixed" &&
              rect.width * rect.height >= window.innerWidth * window.innerHeight * 0.75;
            if (
              fixedFullViewport ||
              role === "progressbar" ||
              /load|spinner|progress/.test(classAndId)
            ) {
              loaderHint = true;
            }
          }
        }

        var headings = Array.prototype.slice.call(
          document.querySelectorAll("h1,h2,h3,[class*='display' i],[class*='hero' i]")
        ) as Element[];
        for (var j = 0; j < headings.length; j += 1) {
          if ((headings[j].textContent || "").trim().length === 0) {
            continue;
          }
          var size = Number.parseFloat(window.getComputedStyle(headings[j]).fontSize || "");
          if (Number.isFinite(size)) {
            headingPx = headingPx === null ? size : Math.max(headingPx, size);
          }
        }

        return {
          backdrop: backdrop,
          fonts: fonts,
          headingPx: headingPx,
          scrollEffects: scrollEffects,
          viewportFill: Math.min(1, filled / viewportArea),
          loaderHint: loaderHint
        };
      }

      function countGradients(): number {
        var total = 0;
        var pattern = /(?:linear|radial|conic)-gradient\s*\(/gi;
        try {
          var styleNodes = document.querySelectorAll("style");
          for (var i = 0; i < styleNodes.length; i += 1) {
            total += (styleNodes[i].textContent || "").match(pattern)?.length || 0;
          }
        } catch {
          // Keep the count from other sources.
        }

        try {
          var styled = document.querySelectorAll("[style]");
          for (var j = 0; j < styled.length; j += 1) {
            total += (styled[j].getAttribute("style") || "").match(pattern)?.length || 0;
          }
        } catch {
          // Keep the count from style nodes.
        }

        return total;
      }

      var traits = defaults();
      var canvases = document.querySelectorAll("canvas");
      var inspection = inspectElements();
      var bg = backgroundLuminance();
      traits.scheme = schemeFromLuminance(bg);
      traits.bg_luminance = bg;
      traits.section_count = count("section, main, article");
      traits.image_count = count("img");
      traits.video_count = count("video");
      traits.canvas_count = canvases.length;
      traits.webgl = detectWebgl(canvases);
      traits.backdrop_filter = inspection.backdrop;
      traits.animation_count = typeof document.getAnimations === "function" ? document.getAnimations().length : null;
      traits.scroll_effects = inspection.scrollEffects;
      traits.font_families = inspection.fonts;
      traits.max_heading_px = inspection.headingPx;
      traits.gradient_count = countGradients();
      traits.loader_hint = inspection.loaderHint;
      traits.viewport_fill = inspection.viewportFill;

      try {
        var body = document.body;
        var text = body ? body.innerText || "" : "";
        var height = body ? Math.max(1, body.scrollHeight) : 1;
        traits.text_density = text.length / height;
      } catch {
        traits.text_density = null;
      }

      return traits;
    });
  } catch (error) {
    warnings.push("Failed to collect page traits: " + errorMessage(error));
    return defaultPageTraits("live");
  }
}

function defaultPageTraits(source: "live" | "static"): PageTraits {
  return {
    source: source,
    scheme: "unknown",
    bg_luminance: null,
    text_density: null,
    section_count: 0,
    image_count: 0,
    video_count: 0,
    canvas_count: 0,
    webgl: null,
    backdrop_filter: false,
    animation_count: null,
    scroll_effects: null,
    font_families: [],
    max_heading_px: null,
    gradient_count: 0,
    loader_hint: false,
    viewport_fill: null
  };
}

export function extractStaticTraits(html: string): PageTraits {
  const traits = defaultPageTraits("static");
  const safeHtml = typeof html === "string" ? html : "";
  const styleText = extractStyleText(safeHtml);
  const background = findStaticBackgroundColor(safeHtml, styleText);

  traits.section_count = countTags(safeHtml, "section") + countTags(safeHtml, "main") + countTags(safeHtml, "article");
  traits.image_count = countTags(safeHtml, "img");
  traits.video_count = countTags(safeHtml, "video");
  traits.canvas_count = countTags(safeHtml, "canvas");
  traits.backdrop_filter = /\b-webkit-backdrop-filter\s*:|\bbackdrop-filter\s*:/i.test(styleText);
  traits.gradient_count = countMatches(styleText, /(?:linear|radial|conic)-gradient\s*\(/gi);
  traits.loader_hint = hasStaticLoaderHint(safeHtml);
  traits.font_families = extractFontFamilies(styleText);
  traits.bg_luminance = background === null ? null : colorLuminance(background);
  traits.scheme = schemeFromLuminance(traits.bg_luminance);

  return traits;
}

function extractStyleText(html: string): string {
  const parts: string[] = [];
  const styleTagPattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null = styleTagPattern.exec(html);
  while (styleMatch !== null) {
    parts.push(styleMatch[1]);
    styleMatch = styleTagPattern.exec(html);
  }

  const styleAttrPattern = /\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi;
  let attrMatch: RegExpExecArray | null = styleAttrPattern.exec(html);
  while (attrMatch !== null) {
    parts.push(attrMatch[2]);
    attrMatch = styleAttrPattern.exec(html);
  }

  return parts.join("\n");
}

function countTags(html: string, tagName: string): number {
  return countMatches(html, new RegExp("<" + escapeRegExp(tagName) + "\\b", "gi"));
}

function countMatches(value: string, pattern: RegExp): number {
  const matches = value.match(pattern);
  return matches ? matches.length : 0;
}

function findStaticBackgroundColor(html: string, styleText: string): { r: number; g: number; b: number; a: number } | null {
  const bodyTag = /<body\b[^>]*>/i.exec(html);
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  const candidates: string[] = [];

  if (bodyTag) {
    candidates.push(attributeValue(bodyTag[0], "style") || "");
  }
  if (htmlTag) {
    candidates.push(attributeValue(htmlTag[0], "style") || "");
  }

  const rulePattern = /\b(?:body|html)\b[^{}]*\{([^}]*)\}/gi;
  let ruleMatch: RegExpExecArray | null = rulePattern.exec(styleText);
  while (ruleMatch !== null) {
    candidates.push(ruleMatch[1]);
    ruleMatch = rulePattern.exec(styleText);
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const declaration = backgroundDeclaration(candidates[i]);
    if (!declaration) {
      continue;
    }
    const color = parseStaticColor(declaration);
    if (color !== null) {
      return color;
    }
  }

  return null;
}

function backgroundDeclaration(style: string): string | null {
  const backgroundColor = /\bbackground-color\s*:\s*([^;]+)/i.exec(style);
  if (backgroundColor) {
    return backgroundColor[1].trim();
  }

  const background = /\bbackground\s*:\s*([^;]+)/i.exec(style);
  if (background) {
    return background[1].trim();
  }

  return null;
}

function parseStaticColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const trimmed = value.trim().toLowerCase();
  const hex = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(trimmed);
  if (hex) {
    const raw = hex[1];
    if (raw.length === 3) {
      return {
        r: Number.parseInt(raw[0] + raw[0], 16),
        g: Number.parseInt(raw[1] + raw[1], 16),
        b: Number.parseInt(raw[2] + raw[2], 16),
        a: 1
      };
    }
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: 1
    };
  }

  const rgb = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?\s*\)/i.exec(trimmed);
  if (rgb) {
    return {
      r: Math.max(0, Math.min(255, Number(rgb[1]))),
      g: Math.max(0, Math.min(255, Number(rgb[2]))),
      b: Math.max(0, Math.min(255, Number(rgb[3]))),
      a: rgb[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgb[4])))
    };
  }

  const named: Record<string, { r: number; g: number; b: number; a: number }> = {
    black: { r: 0, g: 0, b: 0, a: 1 },
    white: { r: 255, g: 255, b: 255, a: 1 },
    transparent: { r: 255, g: 255, b: 255, a: 0 },
    canvas: { r: 255, g: 255, b: 255, a: 1 },
    snow: { r: 255, g: 250, b: 250, a: 1 },
    ivory: { r: 255, g: 255, b: 240, a: 1 },
    linen: { r: 250, g: 240, b: 230, a: 1 },
    navy: { r: 0, g: 0, b: 128, a: 1 },
    midnightblue: { r: 25, g: 25, b: 112, a: 1 }
  };

  return named[trimmed] || null;
}

function colorLuminance(color: { r: number; g: number; b: number; a: number }): number {
  const composited = color.a < 1
    ? {
        r: color.r * color.a + 255 * (1 - color.a),
        g: color.g * color.a + 255 * (1 - color.a),
        b: color.b * color.a + 255 * (1 - color.a)
      }
    : color;
  return (0.2126 * composited.r + 0.7152 * composited.g + 0.0722 * composited.b) / 255;
}

function schemeFromLuminance(value: number | null): "light" | "dark" | "mixed" | "unknown" {
  if (value === null) {
    return "unknown";
  }
  if (value > 0.6) {
    return "light";
  }
  if (value < 0.35) {
    return "dark";
  }
  return "mixed";
}

function hasStaticLoaderHint(html: string): boolean {
  if (/\brole\s*=\s*["']progressbar["']/i.test(html)) {
    return true;
  }
  if (/\b(?:class|id|aria-label)\s*=\s*["'][^"']*(?:load|spinner|progress)[^"']*["']/i.test(html)) {
    return true;
  }

  const early = html.slice(0, 4000);
  return /\bposition\s*:\s*fixed/i.test(early) && /(?:100vh|100dvh|inset\s*:\s*0|top\s*:\s*0)/i.test(early);
}

function extractFontFamilies(styleText: string): string[] {
  const families: string[] = [];
  const seen: Record<string, true> = {};
  const familyPattern = /\bfont-family\s*:\s*([^;}{]+)/gi;
  let match: RegExpExecArray | null = familyPattern.exec(styleText);

  while (match !== null) {
    const family = match[1].split(",")[0].replace(/^["']|["']$/g, "").trim();
    if (family && !seen[family]) {
      seen[family] = true;
      families.push(family);
    }
    match = familyPattern.exec(styleText);
  }

  return families;
}

async function loadChromium(): Promise<ChromiumLike> {
  try {
    // @ts-ignore Playwright is an optional runtime dependency for this module.
    const playwrightModule: { chromium?: ChromiumLike } | null = await import("playwright").catch(function () {
      return null;
    });

    if (playwrightModule === null || !playwrightModule.chromium) {
      throw new CaptureUnavailableError();
    }

    const { chromium } = playwrightModule;
    return chromium;
  } catch (error) {
    if (error instanceof CaptureUnavailableError) {
      throw error;
    }
    throw new CaptureUnavailableError();
  }
}

function captureFileUrlWithoutBrowser(
  url: string,
  viewport: { w: number; h: number },
  scrollSettle: boolean,
  interactions: Interaction[],
  collectTraits: boolean,
  warnings: string[],
  launchError: unknown
): CaptureResult | null {
  if (!url.startsWith("file://")) {
    return null;
  }

  let html = "";
  try {
    html = readFileSync(fileURLToPath(url), "utf-8");
  } catch (error) {
    warnings.push("Failed to read file URL for browserless capture: " + errorMessage(error));
    return null;
  }

  warnings.push("Browser launch failed; used file URL fallback: " + errorMessage(launchError));
  if (interactions.length > 0) {
    warnings.push("Interactions skipped: browser unavailable (file:// fallback)");
  }

  const renderedHtml = scrollSettle ? applyScrollSettleFallback(html) : html;
  const traits = collectTraits ? extractStaticTraits(renderedHtml) : undefined;
  return {
    url: url,
    renderedHtml: renderedHtml,
    screenshotBase64: EMPTY_PNG_BASE64,
    viewport: viewport,
    scrolledToBottom: scrollSettle,
    // No live browser in this fallback path, so there is no Animations API to poll.
    animationsSettled: false,
    videoArtifacts: scrollSettle ? extractVideoArtifactsFromHtml(renderedHtml) : [],
    traits: traits,
    warnings: warnings
  };
}

function applyScrollSettleFallback(html: string): string {
  if (!html.includes("classList.add") || !html.includes("revealed")) {
    return html;
  }

  return addClassToLikelyRevealTarget(html, "revealed");
}

function addClassToLikelyRevealTarget(html: string, className: string): string {
  const revealTargetPattern =
    /<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^>]*(?:id|data-testid|aria-label)\s*=\s*["'][^"']*reveal[^"']*["'][^>]*)>/i;

  return html.replace(revealTargetPattern, function (match, tagName, attrs) {
    const classAttrPattern = /\sclass\s*=\s*(["'])(.*?)\1/i;
    if (classAttrPattern.test(attrs)) {
      const updatedAttrs = attrs.replace(classAttrPattern, function (
        classMatch: string,
        quote: string,
        value: string
      ) {
        const classes = String(value).split(/\s+/).filter(Boolean);
        if (classes.indexOf(className) === -1) {
          classes.push(className);
        }
        return ' class=' + quote + classes.join(" ") + quote;
      });
      return "<" + tagName + updatedAttrs + ">";
    }

    return "<" + tagName + attrs + ' class="' + className + '">';
  });
}

function extractVideoArtifactsFromHtml(html: string): VideoArtifact[] {
  const artifacts: VideoArtifact[] = [];
  const videoTagPattern = /<video\b[^>]*>/gi;
  let match: RegExpExecArray | null = videoTagPattern.exec(html);

  while (match !== null) {
    const tag = match[0];
    const preload = attributeValue(tag, "preload") || "";
    const src = attributeValue(tag, "src") || "";
    // Static HTML can only determine preload=none and missing src.
    // Richer signals (networkState, error.code, play rejection) require a live browser.
    const reason: VideoArtifactReason = src === "" && preload.toLowerCase() !== "none"
      ? "empty-src"
      : preload.toLowerCase() === "none"
      ? "preload-none"
      : "unknown";

    if (preload.toLowerCase() === "none" || src === "") {
      artifacts.push({
        selector: videoSelectorFromTag(tag, artifacts.length),
        preload: preload,
        renderedBlank: true,
        reason: reason
      });
    }

    match = videoTagPattern.exec(html);
  }

  return artifacts;
}

function videoSelectorFromTag(tag: string, index: number): string {
  const testId = attributeValue(tag, "data-testid");
  if (testId) {
    return '[data-testid="' + escapeCssString(testId) + '"]';
  }

  const id = attributeValue(tag, "id");
  if (id) {
    return "#" + escapeCssIdentifier(id);
  }

  return "video:nth-of-type(" + (index + 1) + ")";
}

function attributeValue(tag: string, name: string): string | null {
  const pattern = new RegExp("\\s" + escapeRegExp(name) + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  const match = pattern.exec(tag);
  if (!match) {
    return null;
  }
  return match[2];
}

const ANIMATION_SETTLE_TIMEOUT_MS = 3000;

/**
 * Waits for time-based CSS entrance animations/transitions (animation-delay + backwards
 * fill, transitions fired on load, etc.) to reach quiescence before capture — the same
 * problem `scroll_settle` solves for scroll-driven reveals, but for animations that are
 * simply running on a timer rather than gated on scroll position.
 *
 * Polls `document.getAnimations()` until no RUNNING animation has a FINITE iteration
 * count. Infinite-iteration animations (spinners, loading loops) are deliberately
 * excluded from the check so they never block capture. Capped at
 * {@link ANIMATION_SETTLE_TIMEOUT_MS}; a timeout — or the absence of the Animations
 * API on older engines — never fails the capture, it only reports `false`.
 */
async function waitForAnimationsToSettle(
  page: PageLike,
  warnings: string[],
  timeoutMs: number = ANIMATION_SETTLE_TIMEOUT_MS
): Promise<boolean> {
  let hasAnimationsApi = false;
  try {
    hasAnimationsApi = await page.evaluate(function () {
      return typeof document.getAnimations === "function";
    });
  } catch (error) {
    warnings.push("Failed to check for Animations API support: " + errorMessage(error));
    return false;
  }

  if (!hasAnimationsApi) {
    return false;
  }

  try {
    await page.waitForFunction(
      function () {
        var animations = document.getAnimations();
        for (var i = 0; i < animations.length; i += 1) {
          var animation = animations[i];
          if (animation.playState !== "running") {
            continue;
          }

          var effect = animation.effect;
          var timing =
            effect && typeof effect.getComputedTiming === "function"
              ? effect.getComputedTiming()
              : null;
          var iterations = timing ? timing.iterations : undefined;

          if (iterations === Infinity) {
            // Loops (spinners, loading indicators) must never block settle.
            continue;
          }

          return false;
        }
        return true;
      },
      undefined,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    // Timed out with a finite animation still running — proceed with capture anyway.
    return false;
  }
}

async function detectVideoArtifacts(
  page: PageLike,
  warnings: string[]
): Promise<VideoArtifact[]> {
  const artifacts: VideoArtifact[] = [];
  let videoEls: ElementHandleLike[] = [];

  try {
    videoEls = await page.$$("video");
  } catch (error) {
    warnings.push("Failed to inspect video elements: " + errorMessage(error));
    return artifacts;
  }

  for (let i = 0; i < videoEls.length; i += 1) {
    const el = videoEls[i];
    let selector = "video:nth-of-type(" + (i + 1) + ")";
    let preload = "";
    let readyState = 0;

    try {
      selector = await stableVideoSelector(el, i);
    } catch (error) {
      warnings.push("Failed to build video selector: " + errorMessage(error));
    }

    try {
      await el.evaluate(function (video) {
        video.scrollIntoView({ block: "center" });
      });
    } catch (error) {
      warnings.push("Failed to scroll video into view: " + errorMessage(error));
    }

    let playRejectionName: string | undefined = undefined;
    try {
      await el.evaluate(function (video) {
        return video.play();
      });
    } catch (playErr) {
      // Capture whether autoplay or source-support was the rejection cause.
      if (playErr instanceof Error) {
        playRejectionName = playErr.name;
      }
    }

    try {
      await page.waitForFunction(
        function (video) {
          return video.readyState >= 2;
        },
        el,
        { timeout: 2000 }
      );
    } catch {
      // Timeout means the video may still be unloaded; read readyState directly.
    }

    // Collect the full probe bundle in a single evaluate to avoid multiple round-trips.
    type VideoProbeResult = {
      readyState: number;
      networkState: number;
      currentSrc: string;
      errorCode: number | null;
      preload: string;
    };
    let probeResult: VideoProbeResult = {
      readyState: 0,
      networkState: 0,
      currentSrc: "",
      errorCode: null,
      preload: ""
    };

    try {
      probeResult = await el.evaluate(function (video) {
        return {
          readyState: video.readyState,
          networkState: video.networkState,
          currentSrc: video.currentSrc || "",
          errorCode: video.error ? video.error.code : null,
          preload: video.getAttribute("preload") || ""
        };
      });
    } catch (error) {
      warnings.push("Failed to probe video element: " + errorMessage(error));
      // Fallback: try getAttribute for preload only.
      try {
        preload = (await el.getAttribute("preload")) || "";
        probeResult = { readyState, networkState: 0, currentSrc: "", errorCode: null, preload };
      } catch {
        // Ignore secondary error.
      }
    }

    readyState = probeResult.readyState;
    preload = probeResult.preload;

    if (readyState < 2) {
      const reason = classifyVideoArtifact({
        currentSrc: probeResult.currentSrc,
        networkState: probeResult.networkState,
        errorCode: typeof probeResult.errorCode === "number" ? probeResult.errorCode : undefined,
        playRejection: playRejectionName,
        preload: probeResult.preload,
        readyState: probeResult.readyState
      });
      const artifact: VideoArtifact = {
        selector: selector,
        preload: preload,
        renderedBlank: true,
        reason: reason,
        networkState: probeResult.networkState
      };
      if (typeof probeResult.errorCode === "number") {
        artifact.errorCode = probeResult.errorCode;
      }
      artifacts.push(artifact);
    }
  }

  return artifacts;
}

async function sampleImageEdges(
  page: PageLike,
  warnings: string[]
): Promise<ImageEdgeSample[]> {
  try {
    return await page.evaluate(function () {
      function buildSel(el: Element): string {
        var testid = el.getAttribute("data-testid");
        if (testid) return '[data-testid="' + testid + '"]';
        var id = el.getAttribute("id");
        if (id) return "#" + id;
        var tag = el.tagName.toLowerCase();
        var parent = el.parentElement;
        if (parent) {
          var siblings = Array.prototype.slice.call(parent.children).filter(function (c: Element) {
            return c.tagName === el.tagName;
          });
          var idx = siblings.indexOf(el) + 1;
          return tag + ":nth-of-type(" + idx + ")";
        }
        return tag;
      }

      function luma(r: number, g: number, b: number): number {
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      function variance(values: number[]): number {
        if (values.length === 0) return 0;
        var total = 0;
        for (var i = 0; i < values.length; i++) total += values[i];
        var mean = total / values.length;
        var sq = 0;
        for (var j = 0; j < values.length; j++) {
          var d = values[j] - mean;
          sq += d * d;
        }
        return sq / values.length;
      }

      var out: Array<{
        selector: string;
        width: number;
        height: number;
        edges: { top: number; bottom: number; left: number; right: number };
        tainted: boolean;
      }> = [];

      var imgs = document.querySelectorAll("img");
      var MAX = 400;

      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i] as HTMLImageElement;
        var nw = img.naturalWidth;
        var nh = img.naturalHeight;
        if (!nw || !nh) continue; // not loaded — nothing to sample

        var scale = Math.min(1, MAX / Math.max(nw, nh));
        var w = Math.max(1, Math.round(nw * scale));
        var h = Math.max(1, Math.round(nh * scale));

        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (!ctx) continue;

        var tainted = false;
        var top: number[] = [];
        var bottom: number[] = [];
        var left: number[] = [];
        var right: number[] = [];

        try {
          ctx.drawImage(img, 0, 0, w, h);
          var data = ctx.getImageData(0, 0, w, h).data;
          var idx = function (x: number, y: number): number {
            return (y * w + x) * 4;
          };
          for (var x = 0; x < w; x++) {
            var tIdx = idx(x, 0);
            var bIdx = idx(x, h - 1);
            top.push(luma(data[tIdx], data[tIdx + 1], data[tIdx + 2]));
            bottom.push(luma(data[bIdx], data[bIdx + 1], data[bIdx + 2]));
          }
          for (var y = 0; y < h; y++) {
            var lIdx = idx(0, y);
            var rIdx = idx(w - 1, y);
            left.push(luma(data[lIdx], data[lIdx + 1], data[lIdx + 2]));
            right.push(luma(data[rIdx], data[rIdx + 1], data[rIdx + 2]));
          }
        } catch (e) {
          tainted = true;
        }

        out.push({
          selector: buildSel(img),
          width: nw,
          height: nh,
          edges: {
            top: tainted ? 0 : variance(top),
            bottom: tainted ? 0 : variance(bottom),
            left: tainted ? 0 : variance(left),
            right: tainted ? 0 : variance(right)
          },
          tainted: tainted
        });
      }

      return out;
    });
  } catch (error) {
    warnings.push("Failed to sample image edges: " + errorMessage(error));
    return [];
  }
}

async function stableVideoSelector(el: ElementHandleLike, index: number): Promise<string> {
  const testId = await el.getAttribute("data-testid");
  if (testId) {
    return '[data-testid="' + escapeCssString(testId) + '"]';
  }

  const id = await el.getAttribute("id");
  if (id) {
    return "#" + escapeCssIdentifier(id);
  }

  try {
    return await el.evaluate(function (video) {
      const segments = [];
      let node = video;
      while (node && node.nodeType === 1 && node !== document.body) {
        const tag = node.tagName.toLowerCase();
        let nth = 1;
        let sibling = node.previousElementSibling;
        while (sibling) {
          if (sibling.tagName.toLowerCase() === tag) {
            nth += 1;
          }
          sibling = sibling.previousElementSibling;
        }
        segments.unshift(tag + ":nth-of-type(" + nth + ")");
        node = node.parentElement;
      }
      return segments.length > 0 ? segments.join(" > ") : "video";
    });
  } catch {
    return "video:nth-of-type(" + (index + 1) + ")";
  }
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeCssIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, function (char) {
    return "\\" + char.charCodeAt(0).toString(16) + " ";
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type Verdict = "confirmed" | "likely-artifact" | "inconclusive";

export type VerifiableFinding = {
  key: string;
  rule: string;
  message: string;
  kind: "issue" | "video-artifact";
  selector?: string;
  /**
   * When `kind` is `"video-artifact"`, the discriminated reason from the probe.
   * Used by `verifyFinding` to decide `confirmed` vs `likely-artifact`.
   */
  videoReason?: VideoArtifactReason | "unloaded-video-artifact";
};

export type FindingVerdict = {
  key: string;
  verdict: Verdict;
  evidence: string;
};

export type VerifyTarget = { url?: string; html?: string };

type VerifyPageLike = {
  evaluate: <T>(fn: () => T | Promise<T>) => Promise<T>;
  goto: (url: string, options: { waitUntil: "load" }) => Promise<unknown>;
  setContent: (html: string, options: { waitUntil: "load" }) => Promise<void>;
  setDefaultTimeout?: (timeout: number) => void;
  setViewportSize: (viewport: { width: number; height: number }) => Promise<void>;
};

const LIVE_VERIFICATION_UNAVAILABLE_EVIDENCE =
  "live verification unavailable (chromium not installed)";

export async function verifyFindings(
  target: VerifyTarget,
  findings: VerifiableFinding[],
  opts?: { viewport?: { w: number; h: number }; timeoutMs?: number }
): Promise<FindingVerdict[]> {
  if (!target.url && !target.html) {
    return inconclusiveFindingVerdicts(findings, LIVE_VERIFICATION_UNAVAILABLE_EVIDENCE);
  }

  const viewport = opts && opts.viewport ? opts.viewport : { w: 1280, h: 800 };
  let browser: BrowserLike | null = null;

  try {
    try {
      const chromium = await loadChromium();
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      const fallbackVerdicts = verifyFindingsFromStaticTarget(target, findings, error);
      if (fallbackVerdicts !== null) {
        return fallbackVerdicts;
      }

      return inconclusiveFindingVerdicts(findings, LIVE_VERIFICATION_UNAVAILABLE_EVIDENCE);
    }

    const page = (await browser.newPage()) as unknown as VerifyPageLike;
    await page.setViewportSize({ width: viewport.w, height: viewport.h });

    if (opts && typeof opts.timeoutMs === "number" && typeof page.setDefaultTimeout === "function") {
      page.setDefaultTimeout(opts.timeoutMs);
    }

    if (target.url) {
      await page.goto(target.url, { waitUntil: "load" });
    } else if (target.html) {
      await page.setContent(target.html, { waitUntil: "load" });
    }

    const verdicts: FindingVerdict[] = [];
    for (const finding of findings) {
      verdicts.push(await verifyFinding(page, finding));
    }
    return verdicts;
  } finally {
    if (browser !== null) {
      try {
        await browser.close();
      } catch {
        // Verification results should not be replaced by browser teardown errors.
      }
    }
  }
}

function inconclusiveFindingVerdicts(
  findings: VerifiableFinding[],
  evidence: string
): FindingVerdict[] {
  return findings.map((finding) => ({
    key: finding.key,
    verdict: "inconclusive",
    evidence: evidence
  }));
}

function verifyFindingsFromStaticTarget(
  target: VerifyTarget,
  findings: VerifiableFinding[],
  launchError: unknown
): FindingVerdict[] | null {
  const html = staticHtmlForTarget(target);
  if (html === null) {
    return null;
  }

  return findings.map((finding) => verifyFindingFromHtml(html, finding, launchError));
}

function staticHtmlForTarget(target: VerifyTarget): string | null {
  if (typeof target.html === "string") {
    return target.html;
  }

  if (!target.url || !target.url.startsWith("file://")) {
    return null;
  }

  try {
    return readFileSync(fileURLToPath(target.url), "utf-8");
  } catch {
    return null;
  }
}

function verifyFindingFromHtml(
  html: string,
  finding: VerifiableFinding,
  launchError: unknown
): FindingVerdict {
  if (finding.kind === "video-artifact" || finding.rule === "video") {
    const reason = finding.videoReason;
    const isRealDefect = reason === "empty-src" || reason === "decode-error";
    return {
      key: finding.key,
      verdict: isRealDefect ? "confirmed" : "likely-artifact",
      evidence: isRealDefect
        ? "video has " + reason + " (browser unavailable — static analysis; " + errorMessage(launchError) + ")"
        : "browser unavailable (" +
          errorMessage(launchError) +
          "); video artifact reason '" + (reason || "unknown") + "' is a likely false positive"
    };
  }

  if (finding.rule === "structure/lang") {
    const hasLang = /<html\b[^>]*\slang\s*=\s*["'][^"']+["'][^>]*>/i.test(html);
    return {
      key: finding.key,
      verdict: hasLang ? "likely-artifact" : "confirmed",
      evidence: hasLang ? "lang attribute present in HTML" : "lang attribute absent in HTML"
    };
  }

  if (finding.rule === "structure/viewport") {
    const hasViewport = /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i.test(html);
    return {
      key: finding.key,
      verdict: hasViewport ? "likely-artifact" : "confirmed",
      evidence: hasViewport ? "viewport meta present in HTML" : "viewport meta absent in HTML"
    };
  }

  if (finding.rule === "structure/title") {
    const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const hasTitle = titleMatch !== null && titleMatch[1].trim().length > 0;
    return {
      key: finding.key,
      verdict: hasTitle ? "likely-artifact" : "confirmed",
      evidence: hasTitle ? "title element non-empty in HTML" : "title element absent or empty in HTML"
    };
  }

  if (finding.rule === "a11y/img-alt") {
    const missingAltCount = countImgTagsMissingAlt(html);
    return {
      key: finding.key,
      verdict: missingAltCount > 0 ? "confirmed" : "likely-artifact",
      evidence:
        missingAltCount > 0
          ? String(missingAltCount) + " img(s) missing alt in HTML"
          : "all imgs have alt in HTML"
    };
  }

  return {
    key: finding.key,
    verdict: "inconclusive",
    evidence: "no element-level independent re-check available for aggregate/heuristic rule"
  };
}

function countImgTagsMissingAlt(html: string): number {
  const imgPattern = /<img\b[^>]*>/gi;
  let count = 0;
  let match: RegExpExecArray | null = imgPattern.exec(html);

  while (match !== null) {
    if (!/\salt\s*=/i.test(match[0])) {
      count += 1;
    }
    match = imgPattern.exec(html);
  }

  return count;
}

async function verifyFinding(
  page: VerifyPageLike,
  finding: VerifiableFinding
): Promise<FindingVerdict> {
  if (finding.kind === "video-artifact" || finding.rule === "video") {
    const reason = finding.videoReason;
    if (reason === "empty-src") {
      return {
        key: finding.key,
        verdict: "confirmed",
        evidence: "video currentSrc is empty or networkState is NETWORK_NO_SOURCE — source is missing or unresolvable"
      };
    }
    if (reason === "decode-error") {
      return {
        key: finding.key,
        verdict: "confirmed",
        evidence: "video.error.code is set (MEDIA_ERR_* decode/network failure)"
      };
    }
    if (reason === "autoplay-blocked") {
      return {
        key: finding.key,
        verdict: "likely-artifact",
        evidence: "video play() rejected with NotAllowedError (browser autoplay policy), not a missing resource"
      };
    }
    if (reason === "preload-none") {
      return {
        key: finding.key,
        verdict: "likely-artifact",
        evidence: "video has preload=none — blank frame is expected lazy-load behaviour, not a missing resource"
      };
    }
    // Legacy "unloaded-video-artifact" or "unknown" — default to prior conservative behaviour
    return {
      key: finding.key,
      verdict: "likely-artifact",
      evidence: "video rendered blank (reason: " + (reason || "unknown") + "); treating as likely lazy-load artifact"
    };
  }

  if (finding.rule === "structure/lang") {
    const hasLang = await page.evaluate(function () {
      try {
        return document.documentElement.hasAttribute("lang");
      } catch {
        return null;
      }
    });

    if (hasLang === null) {
      return inconclusiveFindingVerdict(finding.key, "lang attribute re-check failed in live DOM");
    }

    return {
      key: finding.key,
      verdict: hasLang ? "likely-artifact" : "confirmed",
      evidence: hasLang ? "lang attribute present in live DOM" : "lang attribute absent in live DOM"
    };
  }

  if (finding.rule === "structure/viewport") {
    const hasViewport = await page.evaluate(function () {
      try {
        return !!document.querySelector('meta[name="viewport"]');
      } catch {
        return null;
      }
    });

    if (hasViewport === null) {
      return inconclusiveFindingVerdict(finding.key, "viewport meta re-check failed in live DOM");
    }

    return {
      key: finding.key,
      verdict: hasViewport ? "likely-artifact" : "confirmed",
      evidence: hasViewport ? "viewport meta present in live DOM" : "viewport meta absent in live DOM"
    };
  }

  if (finding.rule === "structure/title") {
    const hasTitle = await page.evaluate(function () {
      try {
        return document.title.trim().length > 0;
      } catch {
        return null;
      }
    });

    if (hasTitle === null) {
      return inconclusiveFindingVerdict(finding.key, "document.title re-check failed in live DOM");
    }

    return {
      key: finding.key,
      verdict: hasTitle ? "likely-artifact" : "confirmed",
      evidence: hasTitle ? "document.title non-empty in live DOM" : "document.title empty in live DOM"
    };
  }

  if (finding.rule === "a11y/img-alt") {
    const missingAltCount = await page.evaluate(function () {
      try {
        return document.querySelectorAll("img:not([alt])").length;
      } catch {
        return -1;
      }
    });

    if (missingAltCount < 0) {
      return inconclusiveFindingVerdict(finding.key, "img alt re-check failed in live DOM");
    }

    return {
      key: finding.key,
      verdict: missingAltCount > 0 ? "confirmed" : "likely-artifact",
      evidence:
        missingAltCount > 0
          ? String(missingAltCount) + " img(s) missing alt in live DOM"
          : "all imgs have alt in live DOM"
    };
  }

  if (finding.rule === "a11y/touch-target") {
    const hasSmallTouchTarget = await page.evaluate(function () {
      try {
        const els = Array.from(document.querySelectorAll("button, .btn"));
        return els.some(function (el) {
          return el.getBoundingClientRect().height < 44;
        });
      } catch {
        return null;
      }
    });

    if (hasSmallTouchTarget === null) {
      return inconclusiveFindingVerdict(finding.key, "touch target re-check failed in live DOM");
    }

    return {
      key: finding.key,
      verdict: hasSmallTouchTarget ? "confirmed" : "likely-artifact",
      evidence: hasSmallTouchTarget
        ? "touch target < 44px found in live DOM"
        : "all touch targets >= 44px in live DOM"
    };
  }

  return {
    key: finding.key,
    verdict: "inconclusive",
    evidence: "no element-level independent re-check available for aggregate/heuristic rule"
  };
}

function inconclusiveFindingVerdict(key: string, evidence: string): FindingVerdict {
  return {
    key: key,
    verdict: "inconclusive",
    evidence: evidence
  };
}
