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
})();`;

const STYLE = `
:root {
  --bg: #17171d; --panel: #1f1f26; --raised: #2a2a33; --line: #34343e;
  --fg: #f0f0f2; --fg-2: #a6aab3; --fg-3: #8a8e98; --focus: #00bfff;
  --font: "Untitled Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --t-xs: 11px; --t-sm: 12px; --t-md: 13px; --t-lg: 15px; --r: 6px; --list-w: 380px;
  color-scheme: dark;
}
html, body { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font); font-size: var(--t-md); line-height: 1.45; -webkit-font-smoothing: antialiased; }
* { box-sizing: border-box; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
a { color: inherit; }
.app { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); }
header { display: flex; align-items: baseline; gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
header h1 { margin: 0; font-size: var(--t-lg); font-weight: 500; white-space: nowrap; }
header p { margin: 0; color: var(--fg-2); font-size: var(--t-sm); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.work { display: grid; grid-template-columns: minmax(0, 1fr) var(--list-w); min-height: 0; }
.page { overflow: auto; padding: 24px; background: #2b2b31; }
.shot { position: relative; margin: 0 auto; max-width: 100%; }
.shot img { display: block; width: 100%; height: auto; border-radius: 2px; }
.marker { position: absolute; display: block; border: 2px solid #ffffff; border-radius: 4px; box-shadow: 0 0 0 1px rgba(0, 0, 0, .55), inset 0 0 0 1px rgba(0, 0, 0, .35); text-decoration: none; }
.marker .num { position: absolute; left: -2px; top: -2px; transform: translateY(-100%); min-width: 24px; height: 24px; padding: 0 7px; border-radius: 4px 4px 4px 0; background: #ffffff; color: #17171d; font-size: var(--t-sm); font-weight: 500; line-height: 24px; text-align: center; }
.marker:hover, .marker.lit { background: rgba(255, 255, 255, .14); }
aside { background: var(--panel); border-left: 1px solid var(--line); overflow-y: auto; }
.intro { margin: 0; padding: 16px 16px 8px; color: var(--fg-2); }
ol { list-style: none; margin: 0; padding: 0 8px 24px; }
li { padding: 12px 8px; border-bottom: 1px solid var(--line); border-radius: var(--r); }
li:last-child { border-bottom: 0; }
li.lit { background: var(--raised); }
.item-head { display: flex; align-items: baseline; gap: 10px; }
.item-head .n { flex: none; width: 24px; height: 24px; border-radius: 4px; background: var(--fg); color: var(--bg); font-size: var(--t-sm); font-weight: 500; line-height: 24px; text-align: center; }
.item-head a { font-size: var(--t-lg); font-weight: 500; text-decoration: underline; text-decoration-color: var(--fg-3); text-underline-offset: 3px; }
.item-head a:hover { text-decoration-color: var(--fg); }
.trigger { color: var(--fg-3); font-size: var(--t-sm); margin-left: auto; white-space: nowrap; }
.why { margin: 6px 0 0 34px; color: var(--fg); }
.approx { margin: 6px 0 0 34px; padding: 0; list-style: none; color: var(--fg-2); font-size: var(--t-sm); }
.approx li { padding: 0; border: 0; }
.more { margin: 4px 0 0 34px; color: var(--fg-2); font-size: var(--t-sm); }
.more summary { cursor: pointer; color: var(--fg-3); }
.more summary:hover { color: var(--fg-2); }
.more .approx { margin-left: 0; }
.below { margin: 6px 0 0 34px; color: var(--fg-3); font-size: var(--t-sm); }
.empty { margin: 0; padding: 16px; color: var(--fg); }
@media (max-width: 860px) { .work { grid-template-columns: 1fr; } aside { border-left: 0; border-top: 1px solid var(--line); } }
`;

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
    `<div class="app"><header><h1>${escapeHtml("Motion for " + host)}</h1><p>${escapeHtml(input.pageUrl)}</p></header>` +
    `<div class="work"><main class="page"><div class="shot" style="width:${shot.width}px">` +
    `<img src="data:${shot.mime};base64,${shot.base64}" alt="${escapeHtml("The top of " + host)}" width="${shot.width}" height="${shot.height}">${markers}</div></main>` +
    `<aside aria-label="Suggestions">${body}</aside></div></div>\n<script>${SWAP}</script>\n`;
  return wrapPlayground(fragment);
}
