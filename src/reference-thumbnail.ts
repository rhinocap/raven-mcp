// Render a stored pattern reference back into a picture of itself.
//
// A reference is HTML plus a computed-style map, which is the right thing to
// store (it is the expression, not a depiction of it) and the wrong thing to
// show a human. You cannot pick "that scrolling mouse cue" out of a style map.
// This module closes that gap: rebuild the captured element in headless
// Chromium and screenshot it.
//
// Three properties are deliberate and load-bearing:
//
//   1. OFFLINE. Every external request is aborted at the route layer. A stored
//      reference must never reach back out to the site it was captured from —
//      not at render time, not months later, not from a machine that has since
//      lost access to it. The cost is remote images and webfonts, which is why
//      the record carries `fidelity: "offline"` rather than presenting the
//      result as a faithful picture.
//   2. BEST EFFORT. Every failure path returns null. A capture that fails
//      because its thumbnail did not render is a lost grab, and the grab is the
//      part that cannot be redone — the user has moved on from the page.
//   3. BOUNDED. A render is capped in both wall-clock and output dimensions, so
//      a pathological stored element cannot park a capture or write a
//      hundred-megabyte PNG into the corpus.
import { launchAuditChromium } from "./browser-launch.js";

// Wide enough for a full-bleed hero section, bounded so a stored element with a
// runaway width cannot allocate an enormous surface.
var MAX_WIDTH = 1600;
var MAX_HEIGHT = 1600;
var MIN_SIZE = 1;
var RENDER_TIMEOUT_MS = 15000;

export interface ThumbnailInput {
  html: string;
  styles: Record<string, string>;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface ThumbnailResult {
  png: Uint8Array;
  width: number;
  height: number;
}

// The captured element is dropped into a bare document with the computed styles
// applied to the host. The styles map is what the overlay measured on the real
// page, so applying it to a wrapper reproduces the box the user actually saw
// rather than whatever the markup would default to in an empty document.
//
// The STYLES decide the rendered size, not `rect` — the host is inline-block and
// shrinks to fit, and the overlay always reports a resolved `width` (`640px`,
// never `50%`), which is what makes that correct for a real grab. `rect` only
// sizes the viewport the element is laid out in. A hand-built input with no
// width in its styles therefore renders narrower than its rect, which is the
// honest answer rather than a stretched one.
export function thumbnailDocument(input: ThumbnailInput): string {
  var declarations = Object.keys(input.styles)
    .filter(function(property) { return /^[-A-Za-z][-A-Za-z0-9]*$/.test(property); })
    .map(function(property) {
      // A stored value is third-party text. `}` and `<` are the two characters
      // that could break out of the declaration block or the style element.
      var value = String(input.styles[property]).replace(/[<>{}]/g, "");
      return property + ":" + value + ";";
    })
    .join("");

  return "<!doctype html><html><head><meta charset=\"utf-8\">"
    + "<style>"
    + "html,body{margin:0;padding:0;background:transparent;}"
    + "#raven-reference-host{display:inline-block;" + declarations + "}"
    + "</style></head><body>"
    + "<div id=\"raven-reference-host\">" + input.html + "</div>"
    + "</body></html>";
}

function clampSize(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  var rounded = Math.round(value);
  if (rounded < MIN_SIZE) return null;
  return Math.min(rounded, max);
}

// Returns null on every failure — no chromium, a launch error, a timeout, an
// element that measured to nothing. See property 2 above.
export async function renderReferenceThumbnail(
  input: ThumbnailInput,
): Promise<ThumbnailResult | null> {
  if (typeof input.html !== "string" || input.html.trim().length === 0) return null;

  var width = input.rect ? clampSize(input.rect.width, MAX_WIDTH) : null;
  var height = input.rect ? clampSize(input.rect.height, MAX_HEIGHT) : null;

  var browser: any = null;
  try {
    browser = await launchAuditChromium();
    var page = await browser.newPage({
      viewport: { width: width || 1280, height: height || 800 },
      deviceScaleFactor: 2,
      // The captured HTML is another site's markup. Filtering `<>{}` out of the
      // style VALUES is not a trust boundary and was never one — `input.html`
      // already authors the whole document, including <script>, event handlers
      // and frames. This is the boundary: with scripting off, a captured
      // element is laid out and painted and nothing in it executes. Combined
      // with the route abort below, the render is offline and inert. It costs
      // nothing real — a thumbnail of a static element wants no scripting.
      javaScriptEnabled: false,
    });
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);

    // Property 1. `**/*` catches every scheme the page could reach for; the
    // inline document itself is set with setContent and never goes through the
    // network stack, so nothing legitimate is being blocked here.
    await page.route("**/*", function(route: any) {
      route.abort().catch(function() { /* the render is already tearing down */ });
    });

    await page.setContent(thumbnailDocument(input), { waitUntil: "load" });

    var host = await page.$("#raven-reference-host");
    if (!host) return null;
    var box = await host.boundingBox();
    if (!box || box.width < MIN_SIZE || box.height < MIN_SIZE) return null;

    var png: Uint8Array = await host.screenshot({ type: "png", omitBackground: true });
    if (!png || png.length === 0) return null;

    return {
      png: png,
      width: Math.min(Math.round(box.width), MAX_WIDTH),
      height: Math.min(Math.round(box.height), MAX_HEIGHT),
    };
  } catch (_error) {
    return null;
  } finally {
    if (browser !== null) {
      try {
        await browser.close();
      } catch {
        // A thumbnail must never be the reason a capture reports an error.
      }
    }
  }
}
