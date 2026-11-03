// The motion map (Site Motion Spec Part E): one self-contained page with the captured screenshot, a numbered
// marker on each suggestion's box, and a list beside it. Same CSP as a playground (wrapPlayground).
//
// Links point at the playground files, so the map works opened as a file. Each also carries the playground's
// served path; when the map itself is served over http by the motion session, a small script swaps the
// links to those paths, so the playgrounds open on the same origin and Send reaches the agent.

import { escapeHtml, wrapPlayground } from "../motion-playground/index.js";
import type { Box } from "./candidates.js";

export type MapItem = {
  number: number;
  label: string;
  why: string;
  triggerWords: string;
  approximations: string[];
  box: Box;
  /** File name of the playground, beside the map. */
  file: string;
  /** "/p/<id>" when the playground is registered with the motion session. */
  served?: string;
};

export type MapInput = {
  pageUrl: string;
  /** JPEG or PNG of the top of the page, as captured (CSS px, scale 1). */
  screenshot: { mime: "image/jpeg" | "image/png"; base64: string; width: number; height: number };
  items: MapItem[];
  message?: string;
};

const SWAP = `(function () {
  if (location.protocol !== "http:") return;
  var links = document.querySelectorAll("a[data-served]");
  for (var i = 0; i < links.length; i++) links[i].setAttribute("href", links[i].getAttribute("data-served"));
})();
(function () {
  var items = document.querySelectorAll("[data-n]");
  function mark(n, on) {
    var all = document.querySelectorAll("[data-n='" + n + "']");
    for (var j = 0; j < all.length; j++) all[j].classList.toggle("lit", on);
  }
  for (var i = 0; i < items.length; i++) {
    (function (el) {
      var n = el.getAttribute("data-n");
      el.addEventListener("mouseenter", function () { mark(n, true); });
      el.addEventListener("mouseleave", function () { mark(n, false); });
      el.addEventListener("focusin", function () { mark(n, true); });
      el.addEventListener("focusout", function () { mark(n, false); });
    })(items[i]);
  }
})();
(function () {
  // The tiles open or close the list, as in Raven Grab; Cmd+. or Ctrl+. switches, and the edge tab reopens it.
  var app = document.querySelector(".app"), panel = document.querySelector(".fp"), tab = document.querySelector(".edge-tab");
  if (!app || !panel) return;
  var tiles = document.querySelectorAll(".tiles button"), narrow = matchMedia("(max-width: 760px)");
  function set(name, focus) {
    var had = panel.contains(document.activeElement);
    app.setAttribute("data-layout", name);
    panel.inert = name === "page" && !narrow.matches;
    for (var i = 0; i < tiles.length; i++) {
      var on = tiles[i].getAttribute("data-layout") === name;
      tiles[i].setAttribute("aria-checked", String(on)); tiles[i].tabIndex = on ? 0 : -1;
    }
    if (panel.inert && had) tab.focus();
    else if (focus) focus.focus();
  }
  for (var i = 0; i < tiles.length; i++) {
    (function (b, i) {
      b.addEventListener("click", function () { set(b.getAttribute("data-layout")); });
      b.addEventListener("keydown", function (e) {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) < 0) return;
        e.preventDefault();
        var n = tiles[(i + 1) % tiles.length]; set(n.getAttribute("data-layout"), n);
      });
    })(tiles[i], i);
  }
  tab.addEventListener("click", function () { set("list", tiles[0]); });
  document.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key !== ".") return;
    e.preventDefault();
    set(app.getAttribute("data-layout") === "page" ? "list" : "page");
  });
  // Crossing the phone width shows or hides the panel by CSS, so inert and focus follow it here.
  narrow.addEventListener("change", function () { set(app.getAttribute("data-layout")); });
})();`;

const STYLE = `
:root {
  --bg: #1a1a22; --panel: #212129; --raised: #2a2a33; --line: rgba(255, 255, 255, .12); --hair: rgba(255, 255, 255, .06);
  --fg: #f0f0f2; --fg-2: #9498a0; --fg-3: #8e929c; --accent: #00bfff; --on-accent: #0a1018; --focus: #00bfff;
  --font: "Untitled Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --t-xs: 11px; --t-sm: 12px; --t-md: 13px; --t-lg: 14px; --r: 8px;
  --edge: 20px; --panel-w: 360px; --panel-r: 20px; --gap: 12px;
  --shadow: 0 1px 2px rgba(0, 0, 0, .25), 0 0 32px rgba(0, 191, 255, .06), 0 8px 16px -4px rgba(0, 0, 0, .35), 0 24px 48px -12px rgba(0, 0, 0, .5);
  color-scheme: dark;
}
@media (max-width: 1280px) { :root { --panel-w: 320px; --edge: 12px; --panel-r: 16px; } }
@media (max-width: 1024px) { :root { --panel-w: 300px; --edge: 10px; } }
html, body { height: 100%; }
body { margin: 0; background: #2b2b31; color: var(--fg); font-family: var(--font); font-size: var(--t-md); line-height: 1.45; -webkit-font-smoothing: antialiased; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
a { color: inherit; }
/* The Raven Grab panel pattern: the page fills the window and the list floats over it on the right. */
.app { height: 100%; --rt: calc(var(--edge) + var(--panel-w) + var(--gap)); }
.app[data-layout="page"] { --rt: calc(44px + var(--gap)); }
.page { position: fixed; inset: 0; overflow: auto; padding: var(--edge) var(--rt) var(--edge) var(--edge); transition: padding-right 200ms ease; }
.shot { position: relative; margin: 0 auto; max-width: 100%; }
.shot img { display: block; width: 100%; height: auto; border-radius: 2px; }
.marker { position: absolute; display: block; border: 2px solid var(--accent); border-radius: 4px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .45); text-decoration: none; }
.marker .num { position: absolute; left: -2px; top: -2px; transform: translateY(-100%); min-width: 24px; height: 22px; padding: 0 7px; border-radius: 4px 4px 4px 0; background: var(--accent); color: var(--on-accent); font-size: var(--t-xs); font-weight: 500; line-height: 22px; text-align: center; }
.marker:hover, .marker.lit { background: rgba(0, 191, 255, .14); }
.fp { position: fixed; top: var(--edge); right: var(--edge); bottom: var(--edge); z-index: 2; width: var(--panel-w); display: flex; flex-direction: column; overflow: hidden; background: var(--panel); border: 1px solid var(--line); border-radius: var(--panel-r); box-shadow: var(--shadow); transition: transform 200ms ease; }
.app[data-layout="page"] .fp { transform: translateX(calc(100vw + 100%)); pointer-events: none; }
.fp-head { flex: none; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 12px 16px; background: rgba(255, 255, 255, .01); border-bottom: 1px solid var(--hair); }
.fp-head .titles { flex: 1; min-width: 0; }
.fp-head h1 { margin: 0; font-size: var(--t-lg); font-weight: 500; line-height: 1.3; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-head p { margin: 2px 0 0; color: var(--fg-3); font-size: var(--t-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tiles { display: flex; gap: 4px; }
.tiles button { position: relative; width: 26px; height: 19px; padding: 0; cursor: pointer; background: rgba(255, 255, 255, .05); border: 1px solid var(--line); border-radius: 4px; }
.tiles button::before { content: ""; position: absolute; top: -12.5px; bottom: -12.5px; left: 0; right: 0; }
.tiles button:hover { border-color: rgba(255, 255, 255, .28); }
.tiles button[aria-checked="true"] { background: rgba(0, 191, 255, .12); border-color: var(--accent); }
.tiles i { position: absolute; top: 3px; bottom: 3px; right: 3px; width: 5px; border-radius: 1.5px; background: var(--fg-2); }
.tiles i.off { opacity: .18; }
.tiles button[aria-checked="true"] i { background: var(--accent); }
.edge-tab { position: fixed; top: 33px; right: 0; z-index: 2; display: none; align-items: center; justify-content: center; width: 44px; min-height: 44px; padding: 0; cursor: pointer; color: var(--accent); background: rgba(22, 44, 66, .9); border: 1px solid var(--accent); border-right: 0; border-radius: 12px 0 0 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, .3); }
.edge-tab svg { width: 18px; height: 18px; }
.app[data-layout="page"] .edge-tab { display: flex; }
.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #3c3c47 var(--panel); -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 16px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 16px), transparent); }
.intro { margin: 0; padding: 16px 16px 8px; color: var(--fg-3); font-size: var(--t-sm); font-weight: 500; letter-spacing: -.01em; }
ol { list-style: none; margin: 0; padding: 0 16px 24px; }
ol > li { position: relative; padding: 12px 10px; border-bottom: 1px solid var(--hair); }
ol > li:last-child { border-bottom: 0; }
ol > li.lit { background: rgba(0, 191, 255, .08); box-shadow: inset 2px 0 0 var(--accent); }
.item-head { display: flex; align-items: baseline; gap: 10px; }
.item-head .n { flex: none; width: 22px; height: 22px; border-radius: 4px; background: var(--accent); color: var(--on-accent); font-size: var(--t-xs); font-weight: 500; line-height: 22px; text-align: center; }
.item-head a { font-size: var(--t-lg); font-weight: 500; letter-spacing: -.01em; text-decoration: underline; text-decoration-color: rgba(255, 255, 255, .25); text-underline-offset: 3px; }
.item-head a:hover { color: var(--accent); text-decoration-color: rgba(0, 191, 255, .5); }
.trigger { color: var(--fg-3); font-size: var(--t-xs); margin-left: auto; white-space: nowrap; }
.why { margin: 6px 0 0 32px; color: var(--fg); font-size: var(--t-sm); }
.approx { margin: 6px 0 0 32px; padding: 0; list-style: none; color: var(--fg-2); font-size: var(--t-xs); }
.approx li { padding: 0; border: 0; }
.more { margin: 4px 0 0 32px; color: var(--fg-2); font-size: var(--t-xs); }
.more summary { cursor: pointer; color: var(--fg-3); }
.more summary:hover { color: var(--accent); }
.more .approx { margin-left: 0; }
.below { margin: 6px 0 0 32px; color: var(--fg-3); font-size: var(--t-xs); }
.empty { margin: 0; padding: 16px; color: var(--fg); }
@media (prefers-reduced-motion: reduce) { .fp, .page { transition: none; } }
/* Phones: the picture, then the list below it; no tiles. */
@media (max-width: 760px) {
  .page { position: static; padding: 10px; }
  .fp { position: static; width: auto; margin: 0 10px 10px; transform: none !important; pointer-events: auto !important; }
  .tiles, .edge-tab { display: none !important; }
  .body { -webkit-mask-image: none; mask-image: none; }
  /* Touch: links and the more-differences toggle are at least 44px tall on a phone. */
  .item-head a { display: inline-block; padding: 12px 0; }
  summary { padding: 14px 0; }
}
`;

const TILES =
  `<button type="button" role="radio" data-layout="list" aria-checked="true" tabindex="0" aria-label="Show suggestions" title="Show suggestions"><i></i></button>` +
  `<button type="button" role="radio" data-layout="page" aria-checked="false" tabindex="-1" aria-label="Close suggestions" title="Close suggestions"><i class="off"></i></button>`;

function hostOf(url: string): string {
  try { return new URL(url).host || url; } catch { return url; }
}
const pct = (v: number, of: number) => (Math.max(0, Math.min(1, v / of)) * 100).toFixed(4) + "%";

export function buildMotionMap(input: MapInput): string {
  const { screenshot: shot, items } = input;
  const host = hostOf(input.pageUrl);
  const shown = (b: Box) => b.y < shot.height && b.x < shot.width;
  // Larger boxes first, so a marker inside another (a button in the hero) sits on top and can be clicked.
  const markers = items.filter((it) => shown(it.box)).sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).map((it) => {
    const b = it.box;
    const w = Math.min(b.w, shot.width - b.x), h = Math.min(b.h, shot.height - b.y);
    const style = `left:${pct(b.x, shot.width)};top:${pct(b.y, shot.height)};width:${pct(w, shot.width)};height:${pct(h, shot.height)}`;
    return `<a class="marker" data-n="${it.number}" href="${escapeHtml(it.file)}"${it.served ? ` data-served="${escapeHtml(it.served)}"` : ""} style="${style}" aria-label="${escapeHtml(`${it.number}. ${it.label}`)}"><span class="num">${it.number}</span></a>`;
  }).join("");
  const list = items.map((it) => {
    // Three differences show; the rest open on request, so a long list does not bury the reason.
    const lines = it.approximations.map((a) => `<li>${escapeHtml(a)}</li>`);
    const more = lines.length > 3
      ? `<details class="more"><summary>${lines.length - 3} more ${lines.length - 3 === 1 ? "difference" : "differences"} from your page</summary><ul class="approx">${lines.slice(3).join("")}</ul></details>`
      : "";
    const approx = lines.length ? `<ul class="approx">${lines.slice(0, 3).join("")}</ul>${more}` : "";
    const below = shown(it.box) ? "" : `<p class="below">This one is further down the page than the picture shows.</p>`;
    return `<li data-n="${it.number}"><div class="item-head"><span class="n" aria-hidden="true">${it.number}</span>` +
      `<a href="${escapeHtml(it.file)}"${it.served ? ` data-served="${escapeHtml(it.served)}"` : ""}>${escapeHtml(it.label)}</a>` +
      `<span class="trigger">${escapeHtml(it.triggerWords)}</span></div>` +
      `<p class="why">${escapeHtml(it.why)}</p>${approx}${below}</li>`;
  }).join("");
  const intro = items.length
    ? "Here's where motion could help. Open one to try it on your page."
    : "";
  const body = items.length
    ? `<p class="intro">${intro}</p><ol>${list}</ol>`
    : `<p class="empty">${escapeHtml(input.message || "There are no motion suggestions for this page.")}</p>`;
  const fragment =
    `<title>${escapeHtml("Motion for " + host)}</title>\n<style>${STYLE}</style>\n` +
    `<div class="app" data-layout="list"><main class="page"><div class="shot" style="width:${shot.width}px">` +
    `<img src="data:${shot.mime};base64,${shot.base64}" alt="${escapeHtml("The top of " + host)}" width="${shot.width}" height="${shot.height}">${markers}</div></main>` +
    `<aside class="fp" aria-label="Suggestions"><div class="fp-head"><div class="titles"><h1>${escapeHtml("Motion for " + host)}</h1><p>${escapeHtml(input.pageUrl)}</p></div>` +
    `<div class="tiles" role="radiogroup" aria-label="Panel">${TILES}</div></div><div class="body">${body}</div></aside>` +
    `<button class="edge-tab" type="button" aria-label="Open suggestions"><svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.75" y="3.75" width="12.5" height="10.5" rx="2"/><path d="M11 4v10"/></svg></button>` +
    `</div>\n<script>${SWAP}</script>\n`;
  return wrapPlayground(fragment);
}
