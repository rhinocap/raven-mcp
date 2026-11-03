// Candidate detection for suggest_motion (Site Motion Spec D1, D3, Revisions 4 and 11).
//
// Two halves:
//   - collectMotionCandidatesInPage: a self-contained function evaluated in the
//     captured page. It finds the six kinds of moment and serialises each one's
//     element tree into typed style keys only. It never returns HTML, style
//     strings, script content, or any URL except a node's resolved @font-face
//     source (`fontSrc`).
//   - rankCandidates: the pure Node-side ranking and motion-note gate.
// cropImages screenshots image boxes for the fragment's PNG crops.

import { inflateSync } from "node:zlib";

export type MotionKind =
  | "hero-entrance"
  | "cta-hover"
  | "card-hover"
  | "section-reveal"
  | "nav-hover"
  | "image-reveal";

export const MOTION_KIND_LABELS: Record<MotionKind, string> = {
  "hero-entrance": "Hero entrance",
  "cta-hover": "Button hover",
  "card-hover": "Card hover",
  "section-reveal": "Section reveal",
  "nav-hover": "Navigation hover",
  "image-reveal": "Image reveal"
};

/** Page CSS px, relative to the top-left of the document. */
export type Box = { x: number; y: number; w: number; h: number };

export type MotionNodeStyles = {
  width?: number;
  height?: number;
  padding?: number | [number, number, number, number];
  gap?: number;
  fontSize?: number;
  /** 100–900, step 100. */
  fontWeight?: number;
  /** Unitless multiplier of fontSize. */
  lineHeight?: number;
  /** px. */
  letterSpacing?: number;
  /** #rrggbb. */
  color?: string;
  /** #rrggbb. */
  background?: string;
  borderRadius?: number;
  /** #rrggbb. */
  borderColor?: string;
  borderWidth?: number;
  display?: "block" | "flex" | "inline-block";
  flexDirection?: "row" | "column";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
  textAlign?: "left" | "center" | "right" | "justify";
  /** The first family name of the computed font-family. */
  fontFamily?: string;
  /** The resolved http(s) @font-face src for that family and weight, when one was found. */
  fontSrc?: string;
};

export type MotionNodeRole = "heading" | "item" | "image" | "action";

export type MotionNode = {
  /** Unique across one detection pass ("m0", "m1", …); crops are keyed by it. */
  id: string;
  /** Lower-case tag name, [a-z0-9-] only. */
  tag: string;
  /** Direct text of the element (not its descendants), whitespace collapsed, at most 400 characters. For img, the alt text. */
  text: string;
  box: Box;
  styles: MotionNodeStyles;
  /** What the recipe animates: the heading, a staggered item, an image, or the hover target. */
  role?: MotionNodeRole;
  /** img only. `crop` is false when the box is larger than 2400 × 2400 CSS px. */
  image?: { natural: { w: number; h: number }; crop: boolean };
  children: MotionNode[];
};

export type MotionCandidate = {
  kind: MotionKind;
  label: string;
  box: Box;
  section: { box: Box; background: string };
  node: MotionNode;
  /** Element nodes in `node`, at most 40. */
  nodeCount: number;
  /** Plain sentences, e.g. "The button's shadow is not shown." */
  approximations: string[];
  signals: { firstViewport: boolean; mainAction: boolean; area: number };
  /** Document order of the candidate's element; ties in ranking break by it. */
  order: number;
  /** card-hover: how many matching cards were found. */
  count?: number;
};

export type MotionCandidatePass = {
  viewport: { w: number; h: number };
  candidates: MotionCandidate[];
  warnings: string[];
};

export const MAX_FRAGMENT_NODES = 40;
export const MAX_CROP_CSS_PX = 2400;
export const MAX_SUGGESTIONS = 8;

type EvaluatePage = {
  evaluate: <R, A>(fn: (arg: A) => R | Promise<R>, arg: A) => Promise<R>;
};

/** Runs the DOM pass on a loaded Playwright page. */
export async function findMotionCandidates(page: unknown): Promise<MotionCandidatePass> {
  const pass = await (page as EvaluatePage).evaluate(collectMotionCandidatesInPage, {
    maxNodes: MAX_FRAGMENT_NODES,
    maxCrop: MAX_CROP_CSS_PX
  });
  for (const c of pass.candidates) c.label = MOTION_KIND_LABELS[c.kind];
  return pass;
}

// ── Ranking ──────────────────────────────────────────────────────────────────

export type RankOptions = {
  /** 1–8, default 5. */
  max?: number;
  /** Kinds the designer rejected in recorded motion decisions. */
  rejectedKinds?: string[];
  /** design_notes.motion (and any other motion note) as stored. */
  motionNote?: string;
};

export type MotionGate = "none" | "restrained" | "cinematic" | null;

export type RankResult = {
  candidates: MotionCandidate[];
  /** Which note rule applied, so the caller can cite the note. */
  gate: MotionGate;
  /** Set when the result is empty: one or two plain sentences. */
  message?: string;
};

const HOVER_OR_REVEAL: ReadonlySet<MotionKind> = new Set<MotionKind>([
  "cta-hover",
  "card-hover",
  "nav-hover",
  "section-reveal",
  "image-reveal"
]);

export function motionGate(note: string | undefined): MotionGate {
  if (typeof note !== "string") return null;
  const n = note.toLowerCase();
  if (/none[\s-]*instant|\bno[\s-]+motion\b/.test(n)) return "none";
  if (/\brestrained\b|\bsubtle\b/.test(n)) return "restrained";
  if (/\bcinematic\b/.test(n)) return "cinematic";
  return null;
}

/** Revision 11: first-viewport (2) + main-action (2) + size (0–1). */
export function candidateScore(c: MotionCandidate): number {
  const area = Math.max(0, Math.min(1, Number(c.signals.area) || 0));
  return (c.signals.firstViewport ? 2 : 0) + (c.signals.mainAction ? 2 : 0) + area;
}

function overlapsMoreThanHalf(a: Box, b: Box): boolean {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 && inter / smaller > 0.5;
}

function quoteNote(note: string): string {
  const flat = note.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? flat.slice(0, 117) + "…" : flat;
}

/**
 * Revision 11 order of work: (detected) → drop a candidate whose box overlaps an
 * earlier candidate (document order) of the same kind by more than half of the
 * smaller box → drop rejected kinds → motion-note gate → sort by score, ties by
 * document order (cinematic puts hero entrances first) → cut to max.
 */
export function rankCandidates(cands: MotionCandidate[], opts: RankOptions = {}): RankResult {
  const rawMax = typeof opts.max === "number" && Number.isFinite(opts.max) ? Math.floor(opts.max) : 5;
  let max = Math.max(1, Math.min(MAX_SUGGESTIONS, rawMax));
  const gate = motionGate(opts.motionNote);

  if (gate === "none") {
    return {
      candidates: [],
      gate: gate,
      message: "Your motion note says “" + quoteNote(opts.motionNote as string) + "”, so there are no motion suggestions for this page."
    };
  }

  const inOrder = cands.slice().sort(function (a, b) { return a.order - b.order; });
  const kept: MotionCandidate[] = [];
  for (const c of inOrder) {
    const dup = kept.some(function (k) { return k.kind === c.kind && overlapsMoreThanHalf(k.box, c.box); });
    if (!dup) kept.push(c);
  }

  const rejected = new Set(opts.rejectedKinds || []);
  let list = kept.filter(function (c) { return !rejected.has(c.kind); });

  if (gate === "restrained") {
    list = list.filter(function (c) { return HOVER_OR_REVEAL.has(c.kind); });
    max = Math.min(max, 3);
  }

  list.sort(function (a, b) {
    if (gate === "cinematic") {
      const ah = a.kind === "hero-entrance" ? 1 : 0;
      const bh = b.kind === "hero-entrance" ? 1 : 0;
      if (ah !== bh) return bh - ah;
    }
    const d = candidateScore(b) - candidateScore(a);
    if (d !== 0) return d;
    return a.order - b.order;
  });

  const out = list.slice(0, max);
  const result: RankResult = { candidates: out, gate: gate };
  if (out.length === 0) {
    result.message = cands.length === 0
      ? "I could not find a heading, button, card, section or image on this page to animate."
      : "Every moment found on this page was one you have turned down before, so there is nothing new to suggest.";
  }
  return result;
}

// ── Image crops (Revision 4) ─────────────────────────────────────────────────

export type ImageCropRequest = { id: string; box: Box };
export type ImageCrop =
  | { id: string; png: Buffer }
  | { id: string; color: string; approximation: string };

type ScreenshotPage = {
  screenshot: (options: {
    clip: { x: number; y: number; width: number; height: number };
    fullPage: boolean;
    scale?: "css" | "device";
    animations?: "disabled" | "allow";
    type?: "png";
  }) => Promise<Buffer>;
  evaluate: <R, A>(fn: (arg: A) => R | Promise<R>, arg: A) => Promise<R>;
};

/** Every img node across the candidates, as crop requests. */
export function imageCropRequests(cands: MotionCandidate[]): ImageCropRequest[] {
  const out: ImageCropRequest[] = [];
  const seen = new Set<string>();
  const walk = function (n: MotionNode): void {
    if (n.image && !seen.has(n.id)) {
      seen.add(n.id);
      out.push({ id: n.id, box: n.box });
    }
    for (const c of n.children) walk(c);
  };
  for (const c of cands) walk(c.node);
  return out;
}

/**
 * Screenshots each box at device scale 1 (one PNG pixel per CSS px) when it is
 * at most 2400 × 2400 CSS px. A larger box, or one that cannot be captured,
 * comes back as a flat colour sampled from its centre with a plain
 * approximation sentence.
 */
export async function cropImages(page: unknown, items: ImageCropRequest[]): Promise<ImageCrop[]> {
  const p = page as ScreenshotPage;
  const doc = await p.evaluate(function () {
    const d = document.documentElement;
    return {
      w: Math.max(d.scrollWidth, document.body ? document.body.scrollWidth : 0),
      h: Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0)
    };
  }, undefined);
  const out: ImageCrop[] = [];
  for (const item of items) {
    const clip = clampClip(item.box, doc);
    if (clip === null) {
      out.push({ id: item.id, color: "#cccccc", approximation: "An image outside the page is shown as a grey block." });
      continue;
    }
    if (item.box.w <= MAX_CROP_CSS_PX && item.box.h <= MAX_CROP_CSS_PX) {
      try {
        const png = await p.screenshot({ clip: clip, fullPage: true, scale: "css", animations: "disabled", type: "png" });
        out.push({ id: item.id, png: png });
        continue;
      } catch {
        // fall through to a flat colour
      }
    }
    const big = item.box.w > MAX_CROP_CSS_PX || item.box.h > MAX_CROP_CSS_PX;
    const color = await sampleColor(p, clip);
    out.push({
      id: item.id,
      color: color,
      approximation: big
        ? "The large image is shown as a flat colour block."
        : "An image could not be captured and is shown as a flat colour block."
    });
  }
  return out;
}

function clampClip(box: Box, doc: { w: number; h: number }): { x: number; y: number; width: number; height: number } | null {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const right = Math.min(doc.w, x + Math.round(box.w));
  const bottom = Math.min(doc.h, y + Math.round(box.h));
  if (right - x < 1 || bottom - y < 1) return null;
  return { x: x, y: y, width: right - x, height: bottom - y };
}

async function sampleColor(p: ScreenshotPage, clip: { x: number; y: number; width: number; height: number }): Promise<string> {
  const size = Math.min(32, clip.width, clip.height);
  const sx = clip.x + Math.floor((clip.width - size) / 2);
  const sy = clip.y + Math.floor((clip.height - size) / 2);
  try {
    const png = await p.screenshot({
      clip: { x: sx, y: sy, width: size, height: size },
      fullPage: true,
      scale: "css",
      animations: "disabled",
      type: "png"
    });
    return averagePngColor(png) || "#cccccc";
  } catch {
    return "#cccccc";
  }
}

/** Average colour of an 8-bit RGB/RGBA non-interlaced PNG, as #rrggbb. Null for anything else. */
export function averagePngColor(png: Buffer): string | null {
  if (png.length < 33 || png.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat: Buffer[] = [];
  while (off + 8 <= png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("latin1", off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6) || width === 0 || height === 0) return null;
  if (width * height > 2400 * 2400) return null;
  const bpp = colorType === 6 ? 4 : 3;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) return null;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let r = 0, g = 0, b = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const ul = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) {
        const pp = left + up - ul;
        const pa = Math.abs(pp - left), pb = Math.abs(pp - up), pc = Math.abs(pp - ul);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      r += cur[x * bpp];
      g += cur[x * bpp + 1];
      b += cur[x * bpp + 2];
    }
    cur.copy(prev);
  }
  const n = width * height;
  const hex = function (v: number): string { return Math.round(v / n).toString(16).padStart(2, "0"); };
  return "#" + hex(r) + hex(g) + hex(b);
}

// ── The DOM pass ─────────────────────────────────────────────────────────────

/**
 * Evaluated in the page. Self-contained: it may not reference anything outside
 * its own body. Returns only typed values.
 */
export async function collectMotionCandidatesInPage(arg: { maxNodes: number; maxCrop: number }): Promise<MotionCandidatePass> {
  const maxNodes = arg.maxNodes;
  const maxCrop = arg.maxCrop;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sx = window.scrollX;
  const sy = window.scrollY;
  const warnings: string[] = [];
  let nodeCounter = 0;

  const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "link", "meta", "head", "title", "iframe", "object", "embed", "canvas", "source", "track"]);
  const SECTION_SEL = "section, header, footer, article, aside, [role=region], [role=banner]";
  const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

  // ── colour ──
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
  const colorCache = new Map<string, { hex: string; alpha: number } | null>();
  const hex2 = function (v: number): string { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); };
  function parseColor(value: string): { hex: string; alpha: number } | null {
    if (!value) return null;
    if (colorCache.has(value)) return colorCache.get(value) as any;
    let out: { hex: string; alpha: number } | null = null;
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value);
    if (m) {
      let a = 1;
      if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      out = { hex: "#" + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3]), alpha: a };
    } else if (value === "transparent") {
      out = { hex: "#000000", alpha: 0 };
    } else if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000000";
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out = { hex: "#" + hex2(d[0]) + hex2(d[1]) + hex2(d[2]), alpha: d[3] / 255 };
    }
    colorCache.set(value, out);
    return out;
  }
  function firstGradientColor(image: string): { hex: string; alpha: number } | null {
    const m = /(rgba?|hsla?|oklch|oklab|lab|lch|color|hwb)\([^()]*\)|#[0-9a-f]{3,8}\b/i.exec(image);
    return m ? parseColor(m[0]) : null;
  }
  const px = function (v: string): number {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };
  const r2 = function (v: number): number { return Math.round(v * 100) / 100; };

  function boxOf(el: Element): { x: number; y: number; w: number; h: number } {
    const r = el.getBoundingClientRect();
    return { x: r2(r.left + sx), y: r2(r.top + sy), w: r2(r.width), h: r2(r.height) };
  }
  function visible(el: Element): boolean {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const anyEl = el as any;
    if (typeof anyEl.checkVisibility === "function") {
      return anyEl.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    }
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  }
  function inFirstViewport(b: { x: number; y: number; w: number; h: number }): boolean {
    return b.y < vh && b.y + b.h > 0;
  }
  function tagOf(el: Element): string {
    const t = el.localName.toLowerCase();
    return /^[a-z][a-z0-9-]*$/.test(t) ? t.slice(0, 40) : "div";
  }
  function directText(el: Element): string {
    let s = "";
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) s += n.nodeValue || "";
    }
    s = s.replace(/\s+/g, " ").trim();
    return s.length > 400 ? s.slice(0, 400) : s;
  }

  // ── sections and backgrounds ──
  function opaqueBackground(el: Element | null): string | null {
    for (let e = el; e; e = e.parentElement) {
      const c = parseColor(getComputedStyle(e).backgroundColor);
      if (c && c.alpha >= 1) return c.hex;
    }
    return null;
  }
  function pageBackground(): string {
    const b = document.body ? parseColor(getComputedStyle(document.body).backgroundColor) : null;
    if (b && b.alpha > 0) return b.hex;
    const h = parseColor(getComputedStyle(document.documentElement).backgroundColor);
    if (h && h.alpha > 0) return h.hex;
    return "#ffffff";
  }
  const PAGE_BG = pageBackground();
  function backgroundBehind(el: Element): string {
    return opaqueBackground(el.parentElement) || PAGE_BG;
  }
  function sectionOf(el: Element, inclusive: boolean): Element {
    const start = inclusive ? el : el.parentElement;
    const s = start ? start.closest(SECTION_SEL) : null;
    if (s && s !== document.body && s !== document.documentElement) return s;
    // The body child that contains the element, else the body.
    let e: Element | null = el;
    while (e && e.parentElement && e.parentElement !== document.body) e = e.parentElement;
    return e && e.parentElement === document.body ? e : (document.body || document.documentElement);
  }

  // ── fonts ──
  type Face = { min: number; max: number; italic: boolean; src: string; rank: number };
  const faces = new Map<string, Face[]>();
  let blockedSheets = 0;
  function familyKey(f: string): string {
    return f.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
  }
  function weightRange(v: string): [number, number] {
    const parts = v.trim().split(/\s+/).map(function (p) {
      if (p === "normal") return 400;
      if (p === "bold") return 700;
      const n = parseFloat(p);
      return Number.isFinite(n) ? n : 400;
    });
    if (parts.length === 0) return [400, 400];
    return [parts[0], parts.length > 1 ? parts[1] : parts[0]];
  }
  function pickSrc(src: string, base: string): { src: string; rank: number } | null {
    let best: { src: string; rank: number } | null = null;
    const re = /url\(\s*(["']?)([^"')]+)\1\s*\)\s*(?:format\(\s*["']?([\w-]+)["']?\s*\))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      let abs: URL;
      try { abs = new URL(m[2], base); } catch { continue; }
      if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
      const fmt = (m[3] || "").toLowerCase();
      const path = abs.pathname.toLowerCase();
      const rank = fmt === "woff2" || path.endsWith(".woff2") ? 4
        : fmt === "woff" || path.endsWith(".woff") ? 3
        : fmt === "truetype" || fmt === "opentype" || /\.(ttf|otf)$/.test(path) ? 2 : 1;
      if (!best || rank > best.rank) best = { src: abs.href, rank: rank };
    }
    return best;
  }
  function walkRules(rules: CSSRuleList, base: string, depth: number): void {
    if (depth > 6) return;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as any;
      if (typeof CSSFontFaceRule !== "undefined" && rule instanceof CSSFontFaceRule) {
        const st = (rule as CSSFontFaceRule).style;
        const fam = familyKey(st.getPropertyValue("font-family"));
        const sheetBase = rule.parentStyleSheet && rule.parentStyleSheet.href ? rule.parentStyleSheet.href : base;
        const picked = pickSrc(st.getPropertyValue("src"), sheetBase);
        if (!fam || !picked) continue;
        const range = weightRange(st.getPropertyValue("font-weight") || "400");
        const italic = /italic|oblique/.test(st.getPropertyValue("font-style") || "");
        const list = faces.get(fam) || [];
        list.push({ min: range[0], max: range[1], italic: italic, src: picked.src, rank: picked.rank });
        faces.set(fam, list);
      } else if (rule && rule.styleSheet && typeof CSSImportRule !== "undefined" && rule instanceof CSSImportRule) {
        try {
          walkRules(rule.styleSheet.cssRules, rule.styleSheet.href || base, depth + 1);
        } catch {
          blockedSheets++;
        }
      } else if (rule && rule.cssRules) {
        try { walkRules(rule.cssRules, base, depth + 1); } catch { /* ignore */ }
      }
    }
  }
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    try {
      walkRules(sheet.cssRules, sheet.href || document.baseURI, 0);
    } catch {
      blockedSheets++;
    }
  }
  if (blockedSheets > 0) {
    warnings.push("Some of the page's stylesheets come from another site and could not be read, so a web font may be missing.");
  }
  function fontSrcFor(family: string, weight: number, italic: boolean): string | undefined {
    const list = faces.get(familyKey(family));
    if (!list || list.length === 0) return undefined;
    let best: Face | null = null;
    let bestScore = Infinity;
    for (const f of list) {
      const dist = weight < f.min ? f.min - weight : weight > f.max ? weight - f.max : 0;
      const score = dist * 10 + (f.italic === italic ? 0 : 5000) - f.rank;
      if (score < bestScore) { bestScore = score; best = f; }
    }
    return best ? best.src : undefined;
  }

  // ── styles ──
  function nameFor(el: Element, role: string | undefined, rootName: string | null): string {
    if (rootName) return rootName;
    const t = el.localName.toLowerCase();
    if (t === "img" || t === "picture") return "image";
    if (t === "svg") return "icon";
    if (HEADING_TAGS.has(t)) return "heading";
    if (t === "button" || el.getAttribute("role") === "button" || role === "action") return "button";
    if (t === "a") return "link";
    if (t === "nav") return "navigation";
    if (t === "p" || t === "span" || t === "li") return "text";
    return "box";
  }

  function mapStyles(el: Element, box: { w: number; h: number }, name: string, approx: Set<string>): any {
    const cs = getComputedStyle(el);
    const out: any = {};
    out.width = box.w;
    out.height = box.h;
    const pad = [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)];
    if (pad.some(function (p) { return p !== 0; })) {
      out.padding = pad[0] === pad[1] && pad[1] === pad[2] && pad[2] === pad[3] ? pad[0] : pad;
    }
    const display = cs.display;
    const isFlex = display === "flex" || display === "inline-flex";
    const isGrid = display === "grid" || display === "inline-grid";
    if (isFlex || isGrid) {
      const g = cs.columnGap !== "normal" ? px(cs.columnGap) : cs.rowGap !== "normal" ? px(cs.rowGap) : 0;
      if (g > 0) out.gap = g;
    }
    out.fontSize = px(cs.fontSize);
    const w = Math.round(parseFloat(cs.fontWeight) / 100) * 100;
    out.fontWeight = Number.isFinite(w) ? Math.max(100, Math.min(900, w)) : 400;
    if (cs.lineHeight === "normal") out.lineHeight = 1.2;
    else if (out.fontSize > 0) out.lineHeight = r2(px(cs.lineHeight) / out.fontSize);
    out.letterSpacing = cs.letterSpacing === "normal" ? 0 : px(cs.letterSpacing);

    const color = parseColor(cs.color);
    if (color && color.alpha > 0) {
      out.color = color.hex;
      if (color.alpha < 1) approx.add("The " + name + "'s text colour is shown without its transparency.");
    }
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.alpha > 0) {
      out.background = bg.hex;
      if (bg.alpha < 1) approx.add("The " + name + "'s see-through background is shown solid.");
    }
    if (cs.backgroundImage && cs.backgroundImage !== "none") {
      if (/gradient\(/.test(cs.backgroundImage)) {
        // The gradient paints over the background colour, so its first stop is the closer flat colour.
        const first = firstGradientColor(cs.backgroundImage);
        if (first && first.alpha > 0) out.background = first.hex;
        approx.add("The " + name + "'s gradient is shown as a flat colour.");
      } else {
        approx.add("The " + name + "'s background image is not shown.");
      }
    }
    const radius = px(cs.borderTopLeftRadius);
    let radiusPx = radius;
    if (/%$/.test(cs.borderTopLeftRadius)) radiusPx = r2(Math.min(box.w, box.h) * parseFloat(cs.borderTopLeftRadius) / 100);
    if (radiusPx > 0) out.borderRadius = radiusPx;
    if (cs.borderTopLeftRadius !== cs.borderTopRightRadius || cs.borderTopLeftRadius !== cs.borderBottomLeftRadius ||
        cs.borderTopLeftRadius !== cs.borderBottomRightRadius) {
      approx.add("The " + name + "'s corners are shown with one radius.");
    }
    const sides = ["Top", "Right", "Bottom", "Left"].map(function (s) {
      return {
        style: (cs as any)["border" + s + "Style"] as string,
        width: px((cs as any)["border" + s + "Width"]),
        color: (cs as any)["border" + s + "Color"] as string
      };
    });
    const drawn = sides.filter(function (s) { return s.style !== "none" && s.style !== "hidden" && s.width > 0; });
    if (drawn.length > 0) {
      const c = parseColor(drawn[0].color);
      if (c && c.alpha > 0) {
        out.borderWidth = drawn[0].width;
        out.borderColor = c.hex;
        if (c.alpha < 1) approx.add("The " + name + "'s border is shown without its transparency.");
      }
      const same = drawn.length === 4 && drawn.every(function (s) { return s.width === drawn[0].width && s.color === drawn[0].color; });
      if (!same) approx.add("The " + name + "'s border is shown the same on every side.");
      if (drawn.some(function (s) { return s.style !== "solid"; })) approx.add("The " + name + "'s border is shown as a solid line.");
    }

    if (isFlex) {
      out.display = "flex";
      out.flexDirection = cs.flexDirection.indexOf("column") === 0 ? "column" : "row";
      if (/reverse/.test(cs.flexDirection)) approx.add("The " + name + "'s reversed order is not shown.");
      if (cs.flexWrap === "wrap" || cs.flexWrap === "wrap-reverse") approx.add("The " + name + "'s wrapping is not shown.");
    } else if (isGrid) {
      out.display = "flex";
      const cols = cs.gridTemplateColumns === "none" ? 1 : cs.gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      out.flexDirection = cols > 1 ? "row" : "column";
      approx.add("The " + name + "'s grid is shown as a " + (cols > 1 ? "row" : "column") + ".");
    } else if (display === "inline-block" || display === "inline" || display === "inline-flow-root") {
      out.display = "inline-block";
    } else {
      out.display = "block";
    }
    if (out.display === "flex") {
      const ai = cs.alignItems;
      out.alignItems = ai === "center" ? "center"
        : ai === "flex-end" || ai === "end" || ai === "self-end" ? "flex-end"
        : ai === "flex-start" || ai === "start" || ai === "self-start" ? "flex-start"
        : ai === "baseline" || ai === "first baseline" || ai === "last baseline" ? "baseline"
        : "stretch";
      const jc = cs.justifyContent;
      out.justifyContent = jc === "center" ? "center"
        : jc === "flex-end" || jc === "end" || jc === "right" ? "flex-end"
        : jc === "space-between" || jc === "space-around" || jc === "space-evenly" ? jc
        : "flex-start";
    }
    const ta = cs.textAlign;
    out.textAlign = ta === "center" || ta === "-webkit-center" ? "center"
      : ta === "right" || ta === "end" || ta === "-webkit-right" ? "right"
      : ta === "justify" ? "justify" : "left";

    const fam = (cs.fontFamily.split(",")[0] || "").trim().replace(/^["']|["']$/g, "").trim();
    if (fam && fam.length <= 80) {
      out.fontFamily = fam;
      const src = fontSrcFor(fam, out.fontWeight, /italic|oblique/.test(cs.fontStyle));
      if (src) out.fontSrc = src;
    }

    if (cs.boxShadow && cs.boxShadow !== "none") approx.add("The " + name + "'s shadow is not shown.");
    if (cs.textShadow && cs.textShadow !== "none") approx.add("The " + name + "'s text shadow is not shown.");
    if (cs.mixBlendMode && cs.mixBlendMode !== "normal") approx.add("The " + name + "'s blend mode is not shown.");
    if (cs.backgroundBlendMode && cs.backgroundBlendMode !== "normal") approx.add("The " + name + "'s blend mode is not shown.");
    if (cs.filter && cs.filter !== "none") approx.add("The " + name + "'s filter effect is not shown.");
    const backdrop = (cs as any).backdropFilter || (cs as any).webkitBackdropFilter;
    if (backdrop && backdrop !== "none") approx.add("The " + name + "'s background blur is not shown.");
    if ((cs.transform && cs.transform !== "none") || (cs.rotate && cs.rotate !== "none") || (cs.scale && cs.scale !== "none")) {
      approx.add("The " + name + "'s rotation or scale is not shown.");
    }
    const op = parseFloat(cs.opacity);
    if (Number.isFinite(op) && op < 1) approx.add("The " + name + "'s transparency is not shown.");
    return out;
  }

  // ── tree ──
  type Built = { node: any; count: number; approx: string[]; truncated: boolean; elements: Element[] };
  function buildTree(
    root: Element,
    rootName: string,
    roles: Map<Element, string>,
    onlyChildren: Element[] | null
  ): Built {
    const approx = new Set<string>();
    let count = 0;
    let truncated = false;
    const elements: Element[] = [];
    function visit(el: Element, isRoot: boolean): any | null {
      if (count >= maxNodes) { truncated = true; return null; }
      const tag = tagOf(el);
      if (SKIP_TAGS.has(tag)) return null;
      if (!isRoot && !visible(el)) return null;
      count++;
      elements.push(el);
      const box = boxOf(el);
      const role = roles.get(el);
      const name = nameFor(el, role, isRoot ? rootName : null);
      const node: any = {
        id: "m" + (nodeCounter++),
        tag: tag,
        text: "",
        box: box,
        styles: mapStyles(el, box, name, approx),
        children: []
      };
      if (role) node.role = role;
      if (tag === "img") {
        const img = el as HTMLImageElement;
        node.text = (img.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 400);
        node.image = {
          natural: { w: img.naturalWidth || 0, h: img.naturalHeight || 0 },
          crop: box.w <= maxCrop && box.h <= maxCrop
        };
        if (!node.role) node.role = "image";
        if (!node.image.crop) approx.add("The large image is shown as a flat colour block.");
        return node;
      }
      if (tag === "svg") {
        approx.add("The icon is shown as a plain shape.");
        return node;
      }
      if (tag === "video") approx.add("The video is shown as a still frame.");
      node.text = directText(el);
      const kids = isRoot && onlyChildren ? onlyChildren : Array.prototype.slice.call(el.children);
      for (const k of kids) {
        const child = visit(k, false);
        if (child) node.children.push(child);
        if (count >= maxNodes) {
          if (k !== kids[kids.length - 1]) truncated = true;
          break;
        }
      }
      return node;
    }
    const node = visit(root, true);
    if (truncated) approx.add("Only the first " + maxNodes + " parts of the " + rootName + " are shown.");
    return { node: node, count: count, approx: Array.from(approx), truncated: truncated, elements: elements };
  }

  // ── detection ──
  type Raw = { kind: MotionKind; root: Element; rootName: string; roles: Map<Element, string>; only: Element[] | null; box?: any; count?: number; heroInclusive?: boolean };
  const raws: Raw[] = [];
  const all = Array.prototype.slice.call(document.body ? document.body.querySelectorAll("*") : []) as Element[];
  const visibleCache = new Map<Element, boolean>();
  const isVisible = function (el: Element): boolean {
    let v = visibleCache.get(el);
    if (v === undefined) { v = visible(el); visibleCache.set(el, v); }
    return v;
  };

  // hero-entrance
  let heroText: Element | null = null;
  for (const h of Array.prototype.slice.call(document.querySelectorAll("h1")) as Element[]) {
    if (isVisible(h) && inFirstViewport(boxOf(h))) { heroText = h; break; }
  }
  if (!heroText) {
    let bestSize = 0;
    for (const el of all) {
      if (SKIP_TAGS.has(el.localName) || !directText(el)) continue;
      if (!isVisible(el) || !inFirstViewport(boxOf(el))) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs > bestSize) { bestSize = fs; heroText = el; }
    }
  }
  if (heroText) {
    const s = heroText.closest(SECTION_SEL);
    let root: Element = heroText;
    if (s && s !== document.body) root = s;
    else if (heroText.parentElement && heroText.parentElement !== document.body) root = heroText.parentElement;
    const roles = new Map<Element, string>([[heroText, "heading"]]);
    raws.push({ kind: "hero-entrance", root: root, rootName: "hero", roles: roles, only: null, heroInclusive: true });
  }

  // cta-hover and the main action
  function hasFill(el: Element): boolean {
    const cs = getComputedStyle(el);
    const behind = backgroundBehind(el);
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.alpha >= 0.5 && bg.hex !== behind) return true;
    return /gradient\(/.test(cs.backgroundImage || "");
  }
  const actionSel = "a[href], button, [role=button], input[type=submit], input[type=button]";
  const actions = (Array.prototype.slice.call(document.querySelectorAll(actionSel)) as Element[]).filter(isVisible);
  const ctas: Element[] = [];
  for (const a of actions) {
    if (ctas.length >= 4) break;
    if (inFirstViewport(boxOf(a)) && hasFill(a)) ctas.push(a);
  }
  let mainAction: Element | null = ctas.length > 0 ? ctas[0] : null;
  if (!mainAction) {
    const firstButton = (Array.prototype.slice.call(document.querySelectorAll("button")) as Element[]).filter(isVisible)[0];
    if (firstButton) { mainAction = firstButton; ctas.push(firstButton); }
  }
  for (const c of ctas) {
    raws.push({ kind: "cta-hover", root: c, rootName: "button", roles: new Map([[c, "action"]]), only: null });
  }

  // card-hover
  const navLike = function (el: Element): boolean { return !!el.closest("nav, header"); };
  const cardGroups: Element[][] = [];
  const parents = new Set<Element>();
  for (const el of all) if (el.children.length >= 3) parents.add(el);
  const NOT_CARD = new Set(["section", "header", "footer", "main", "nav", "body", "html", "script", "style", "option", "tr", "td", "th"]);
  parents.forEach(function (parent) {
    if (cardGroups.length >= 4 || navLike(parent)) return;
    const groups = new Map<string, Element[]>();
    for (const k of Array.prototype.slice.call(parent.children) as Element[]) {
      const tag = k.localName.toLowerCase();
      if (NOT_CARD.has(tag) || SKIP_TAGS.has(tag) || !isVisible(k)) continue;
      const key = tag + "." + Array.prototype.slice.call(k.classList).sort().join(".");
      const list = groups.get(key) || [];
      list.push(k);
      groups.set(key, list);
    }
    groups.forEach(function (list) {
      if (list.length < 3 || cardGroups.length >= 4) return;
      const ok = list.every(function (k) {
        const b = boxOf(k);
        return b.w < vw * 0.75 && (k.localName === "img" || !!k.querySelector("img, h1, h2, h3, h4, h5, h6"));
      });
      if (ok) cardGroups.push(list);
    });
  });
  for (const g of cardGroups) {
    const card = g[0];
    const roles = new Map<Element, string>();
    const img = card.localName === "img" ? card : card.querySelector("img");
    if (img) roles.set(img, "image");
    const head = card.querySelector("h1, h2, h3, h4, h5, h6");
    if (head) roles.set(head, "heading");
    raws.push({ kind: "card-hover", root: card, rootName: "card", roles: roles, only: null, count: g.length });
  }

  // section-reveal (a heading inside a card belongs to the card, not a section)
  const cardEls = new Set<Element>();
  for (const g of cardGroups) for (const k of g) cardEls.add(k);
  const inCard = function (el: Element): boolean {
    for (let e: Element | null = el; e; e = e.parentElement) if (cardEls.has(e)) return true;
    return false;
  };
  let sectionCount = 0;
  for (const h of Array.prototype.slice.call(document.querySelectorAll("h2, h3")) as Element[]) {
    if (sectionCount >= 6) break;
    if (!isVisible(h) || h.closest("nav") || inCard(h)) continue;
    const hb = boxOf(h);
    if (hb.y < vh) continue;
    let unit: Element = h;
    if (!unit.nextElementSibling && unit.parentElement && unit.parentElement !== document.body &&
        unit.parentElement.nextElementSibling) {
      unit = unit.parentElement;
    }
    const following: Element[] = [];
    for (let s = unit.nextElementSibling; s && following.length < 6; s = s.nextElementSibling) {
      if (!SKIP_TAGS.has(s.localName) && isVisible(s)) following.push(s);
    }
    if (following.length === 0 || !unit.parentElement) continue;
    const roles = new Map<Element, string>([[h, "heading"]]);
    if (unit !== h) roles.set(unit, "heading");
    for (const f of following) roles.set(f, "item");
    const parts = [unit].concat(following);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of parts) {
      const b = boxOf(p);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    raws.push({
      kind: "section-reveal", root: unit.parentElement, rootName: "section", roles: roles, only: parts,
      box: { x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) }
    });
    sectionCount++;
  }

  // nav-hover
  let navs = (Array.prototype.slice.call(document.querySelectorAll("nav")) as Element[]).filter(isVisible);
  if (navs.length === 0) navs = (Array.prototype.slice.call(document.querySelectorAll("header")) as Element[]).filter(isVisible);
  let navCount = 0;
  for (const n of navs) {
    if (navCount >= 2) break;
    const links = (Array.prototype.slice.call(n.querySelectorAll("a[href]")) as Element[]).filter(isVisible);
    if (links.length < 2) continue;
    const roles = new Map<Element, string>();
    for (const l of links) roles.set(l, "item");
    raws.push({ kind: "nav-hover", root: n, rootName: "navigation", roles: roles, only: null });
    navCount++;
  }

  // image-reveal
  let imageCount = 0;
  for (const img of Array.prototype.slice.call(document.querySelectorAll("img")) as Element[]) {
    if (imageCount >= 4) break;
    if (!isVisible(img)) continue;
    const b = boxOf(img);
    if (b.w < vw * 0.3 || b.y < vh) continue;
    raws.push({ kind: "image-reveal", root: img, rootName: "image", roles: new Map([[img, "image"]]), only: null });
    imageCount++;
  }

  // Load lazy images that will be cropped, so the crop is not blank.
  const lazy: Promise<unknown>[] = [];

  // ── serialise ──
  const ordered = raws.slice().sort(function (a, b) {
    if (a.root === b.root) return 0;
    return a.root.compareDocumentPosition(b.root) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  const orderOf = new Map<Raw, number>();
  ordered.forEach(function (r, i) { orderOf.set(r, i); });
  const vArea = Math.max(1, vw * vh);
  const candidates: MotionCandidate[] = [];
  for (const r of raws) {
    const built = buildTree(r.root, r.rootName, r.roles, r.only);
    if (!built.node) continue;
    for (const el of built.elements) {
      if (el.localName === "img") {
        const img = el as HTMLImageElement;
        if (img.loading === "lazy") img.loading = "eager";
        if (typeof img.decode === "function") lazy.push(img.decode().catch(function () {}));
      }
    }
    const box = r.box || built.node.box;
    const section = sectionOf(r.root, r.heroInclusive === true);
    const c: MotionCandidate = {
      kind: r.kind,
      label: r.kind,
      box: box,
      section: { box: boxOf(section), background: backgroundBehind(r.root) },
      node: built.node,
      nodeCount: built.count,
      approximations: built.approx,
      signals: {
        firstViewport: inFirstViewport(box),
        mainAction: r.kind === "cta-hover" && r.root === mainAction,
        area: r2(Math.min(1, (box.w * box.h) / vArea))
      },
      order: orderOf.get(r) as number
    };
    if (r.count !== undefined) c.count = r.count;
    candidates.push(c);
  }
  if (lazy.length > 0) {
    await Promise.race([
      Promise.all(lazy),
      new Promise(function (res) { setTimeout(res, 1500); })
    ]);
  }
  return { viewport: { w: vw, h: vh }, candidates: candidates, warnings: warnings };
}
