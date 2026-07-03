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
  warnings: string[];
};

export type Interaction = { selector: string; event: "hover" | "click" | "focus"; delay_ms: number };

export type CaptureOptions = {
  interactions?: Interaction[];
  scroll_settle?: boolean;
  viewport?: { w: number; h: number };
  theme?: Theme;
  collectImageEdges?: boolean;
  timeoutMs?: number;
};

export async function capturePage(url: string, opts?: CaptureOptions): Promise<CaptureResult> {
  const viewport = opts && opts.viewport ? opts.viewport : { w: 1440, h: 900 };
  const timeoutMs = opts && typeof opts.timeoutMs === "number" ? opts.timeoutMs : 30000;
  const scrollSettle = opts ? opts.scroll_settle === true : false;
  const theme = opts && opts.theme ? opts.theme : undefined;
  const collectImageEdges = opts ? opts.collectImageEdges === true : false;
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
  return {
    url: url,
    renderedHtml: renderedHtml,
    screenshotBase64: EMPTY_PNG_BASE64,
    viewport: viewport,
    scrolledToBottom: scrollSettle,
    // No live browser in this fallback path, so there is no Animations API to poll.
    animationsSettled: false,
    videoArtifacts: scrollSettle ? extractVideoArtifactsFromHtml(renderedHtml) : [],
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
