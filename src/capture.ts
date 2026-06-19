import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
  goto: (url: string, options: { waitUntil: "load"; timeout: number }) => Promise<unknown>;
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

export class CaptureUnavailableError extends Error {
  constructor(message: string = CAPTURE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "CaptureUnavailableError";
  }
}

export type VideoArtifact = {
  selector: string;
  preload: string;
  renderedBlank: boolean;
  reason: "unloaded-video-artifact";
};

export type CaptureResult = {
  url: string;
  renderedHtml: string;
  screenshotBase64: string;
  viewport: { w: number; h: number };
  scrolledToBottom: boolean;
  videoArtifacts: VideoArtifact[];
  warnings: string[];
};

export type CaptureOptions = {
  scroll_settle?: boolean;
  viewport?: { w: number; h: number };
  timeoutMs?: number;
};

export async function capturePage(url: string, opts?: CaptureOptions): Promise<CaptureResult> {
  const viewport = opts && opts.viewport ? opts.viewport : { w: 1440, h: 900 };
  const timeoutMs = opts && typeof opts.timeoutMs === "number" ? opts.timeoutMs : 30000;
  const scrollSettle = opts ? opts.scroll_settle === true : false;
  let browser: BrowserLike | null = null;
  const warnings: string[] = [];

  try {
    try {
      const chromium = await loadChromium();
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      const fallback = captureFileUrlWithoutBrowser(url, viewport, scrollSettle, warnings, error);
      if (fallback !== null) {
        return fallback;
      }
      throw new CaptureUnavailableError();
    }

    const page = await browser.newPage();
    await page.setViewportSize({ width: viewport.w, height: viewport.h });
    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });

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

    const renderedHtml = await page.content();
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString("base64");

    return {
      url: url,
      renderedHtml: renderedHtml,
      screenshotBase64: screenshotBase64,
      viewport: viewport,
      scrolledToBottom: scrolledToBottom,
      videoArtifacts: videoArtifacts,
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
      reason: "unloaded-video-artifact"
    });
  }

  return artifacts;
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

  const renderedHtml = scrollSettle ? applyScrollSettleFallback(html) : html;
  return {
    url: url,
    renderedHtml: renderedHtml,
    screenshotBase64: EMPTY_PNG_BASE64,
    viewport: viewport,
    scrolledToBottom: scrollSettle,
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
    if (preload.toLowerCase() === "none") {
      artifacts.push({
        selector: videoSelectorFromTag(tag, artifacts.length),
        preload: preload,
        renderedBlank: true,
        reason: "unloaded-video-artifact"
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

    try {
      await el.evaluate(function (video) {
        return video.play();
      });
    } catch {
      // Autoplay or media policy failures are expected; readiness polling below
      // determines whether the element still rendered enough to avoid a blank.
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

    try {
      readyState = await el.evaluate(function (video) {
        return video.readyState;
      });
    } catch (error) {
      warnings.push("Failed to read video readyState: " + errorMessage(error));
    }

    try {
      preload = (await el.getAttribute("preload")) || "";
    } catch (error) {
      warnings.push("Failed to read video preload: " + errorMessage(error));
    }

    if (readyState < 2) {
      artifacts.push({
        selector: selector,
        preload: preload,
        renderedBlank: true,
        reason: "unloaded-video-artifact"
      });
    }
  }

  return artifacts;
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
