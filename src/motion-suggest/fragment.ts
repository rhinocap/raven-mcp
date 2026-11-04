// Fragment building for suggest_motion (Site Motion Spec D3).
//
// A captured MotionNode tree becomes:
//   - fragment HTML inside Motion Lab's allow-list (div, span, p, h1–h6, img), with ids, escaped text and
//     data PNG images only; Motion Lab's sanitiser cleans it again at build;
//   - the timeline's `styles` map, in the schema's typed keys;
//   - `fonts`, each an absolute path to a font fetched from the page.
//
// Motion Lab sets box-sizing to border-box and margin 0 on headings and paragraphs, so a page's margins are
// lost. `settleSpacing` makes the measured space up: it adds it to the padding (and size) of a child with no
// background or border, else of the previous sibling, else inserts a spacer, except inside a target that is
// split into its children, where a spacer would become a part.

import type { Box, MotionNode, MotionNodeStyles } from "./candidates.js";

export type FragmentStyle = {
  width?: number;
  height?: number;
  padding?: number | [number, number] | [number, number, number, number];
  gap?: number;
  fontSize?: number;
  font?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  display?: "block" | "flex" | "inline-block";
  flexDirection?: "row" | "column";
  flexWrap?: "wrap";
  alignItems?: "start" | "center" | "end" | "stretch";
  justifyContent?: "start" | "center" | "end" | "between";
  textAlign?: "left" | "center" | "right";
  overflow?: "hidden" | "visible";
  whiteSpace?: "nowrap";
};

export type FTag = "div" | "span" | "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "img";

/** A fragment element. `box` is the measured page box, kept for spacing; added wrappers take their children's. */
export type FNode = {
  id: string;
  tag: FTag;
  text?: string;
  /** Text written after the element, inside its parent (the space between split words). */
  tail?: string;
  src?: string;
  alt?: string;
  styles: FragmentStyle;
  children: FNode[];
  box?: Box;
  role?: MotionNode["role"];
  /** The source node, for recipes that need its words or image. */
  source?: MotionNode;
};

export type FontRef = { family: string; src?: string; weight?: number };
export type FontPlan = {
  /** key -> font reference; keys are a0, a1, … (schema pattern ^[a-z][a-zA-Z0-9]*$). */
  keys: Map<string, FontRef>;
  /** family + src -> key */
  byRef: Map<string, string>;
};

export type ImageData = { png?: Buffer; color?: string; approximation?: string };

export type FragmentContext = {
  images: Map<string, ImageData>;
  fonts: FontPlan;
  approximations: string[];
  /** Running total of image bytes in this fragment (Motion Lab caps 1 MB each, 2 MB together). */
  imageBytes: number;
  /** Ids already used, so wrappers and spacers get unique ones. */
  ids: Set<string>;
};

export const IMAGE_MAX_BYTES = 1024 * 1024;
export const IMAGE_TOTAL_MAX_BYTES = 2 * 1024 * 1024;
// Headroom under Motion Lab's 2 MB total for base64 decoding rounding and anything a recipe adds.
const IMAGE_BUDGET = IMAGE_TOTAL_MAX_BYTES - 64 * 1024;

const PHRASING = new Set<FTag>(["span", "p", "h1", "h2", "h3", "h4", "h5", "h6"]);
const KEEP_TAGS = new Set<string>(["div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "img"]);
const INHERITED: (keyof FragmentStyle)[] = ["font", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "textAlign"];

export function newFontPlan(): FontPlan {
  return { keys: new Map(), byRef: new Map() };
}

export function newContext(images: Map<string, ImageData>, fonts: FontPlan, usedIds: Iterable<string> = []): FragmentContext {
  return { images, fonts, approximations: [], imageBytes: 0, ids: new Set(usedIds) };
}

export function freshId(ctx: FragmentContext, base: string): string {
  let id = base, n = 1;
  while (ctx.ids.has(id)) id = base + "-" + n++;
  ctx.ids.add(id);
  return id;
}

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function mapAlign(v: MotionNodeStyles["alignItems"]): FragmentStyle["alignItems"] {
  switch (v) {
    case "flex-start": return "start";
    case "flex-end": return "end";
    case "center": return "center";
    case "stretch": return "stretch";
    // baseline has no schema value; start is the nearest for a row of text.
    case "baseline": return "start";
    default: return undefined;
  }
}
function mapJustify(v: MotionNodeStyles["justifyContent"]): FragmentStyle["justifyContent"] {
  switch (v) {
    case "flex-start": return "start";
    case "flex-end": return "end";
    case "center": return "center";
    case "space-between": case "space-around": case "space-evenly": return "between";
    default: return undefined;
  }
}

const GENERIC_FAMILY = /^(system-ui|-apple-system|blinkmacsystemfont|ui-sans-serif|ui-serif|ui-monospace|sans-serif|serif|monospace|helvetica|helvetica neue|arial|segoe ui|roboto|georgia|times|times new roman)$/i;
const SERIF_HINT = /\bserif\b|georgia|times|garamond|caslon|baskerville|didot|bodoni|playfair|merriweather|lora|tiempos/i;

/** sans or serif, for a family with no font file. */
export function fallbackKeyword(family: string | undefined): "sans" | "serif" {
  if (!family) return "sans";
  if (/sans/i.test(family)) return "sans";
  return SERIF_HINT.test(family) ? "serif" : "sans";
}

function fontKeyFor(ctx: FragmentContext, st: MotionNodeStyles): string | undefined {
  const family = st.fontFamily;
  if (!family) return undefined;
  if (!st.fontSrc) return fallbackKeyword(family);
  const ref = family + "\u0000" + st.fontSrc;
  let key = ctx.fonts.byRef.get(ref);
  if (!key) {
    key = "a" + ctx.fonts.keys.size;
    ctx.fonts.keys.set(key, { family, src: st.fontSrc, weight: st.fontWeight });
    ctx.fonts.byRef.set(ref, key);
  }
  return key;
}

/** Collector styles to schema styles. Width and height come from the measured box. */
export function mapStyles(ctx: FragmentContext, st: MotionNodeStyles): FragmentStyle {
  const out: FragmentStyle = {};
  if (typeof st.width === "number") out.width = clamp(r2(st.width), 0, 8192);
  if (typeof st.height === "number") out.height = clamp(r2(st.height), 0, 8192);
  if (st.padding !== undefined) {
    out.padding = Array.isArray(st.padding)
      ? st.padding.map((v) => clamp(r2(v), 0, 1000)) as [number, number, number, number]
      : clamp(r2(st.padding), 0, 1000);
  }
  if (typeof st.gap === "number" && st.gap > 0) out.gap = clamp(r2(st.gap), 0, 1000);
  if (typeof st.fontSize === "number") out.fontSize = clamp(r2(st.fontSize), 1, 1000);
  const font = fontKeyFor(ctx, st);
  if (font) out.font = font;
  if (typeof st.fontWeight === "number") out.fontWeight = clamp(Math.round(st.fontWeight / 100) * 100, 100, 900);
  if (typeof st.lineHeight === "number") out.lineHeight = clamp(Math.round(st.lineHeight * 1000) / 1000, 0.5, 4);
  if (typeof st.letterSpacing === "number") out.letterSpacing = clamp(r2(st.letterSpacing), -50, 200);
  if (st.color) out.color = st.color;
  if (st.background) out.background = st.background;
  if (st.borderColor) out.borderColor = st.borderColor;
  if (typeof st.borderWidth === "number" && st.borderWidth > 0) out.borderWidth = clamp(r2(st.borderWidth), 0, 100);
  if (typeof st.borderRadius === "number" && st.borderRadius > 0) out.borderRadius = clamp(r2(st.borderRadius), 0, 4096);
  if (st.display) out.display = st.display;
  if (st.display === "flex") {
    if (st.flexDirection) out.flexDirection = st.flexDirection;
    if (st.flexWrap === "wrap") out.flexWrap = "wrap";
    const a = mapAlign(st.alignItems);
    if (a) out.alignItems = a;
    const j = mapJustify(st.justifyContent);
    if (j) out.justifyContent = j;
  }
  if (st.textAlign) out.textAlign = st.textAlign === "justify" ? "left" : st.textAlign;
  if (st.whiteSpace === "nowrap") out.whiteSpace = "nowrap";
  return out;
}

function tagFor(tag: string, parent: FTag | null): FTag {
  if (parent && PHRASING.has(parent)) return tag === "img" ? "img" : "span";
  return KEEP_TAGS.has(tag) ? tag as FTag : "div";
}

function imageNode(ctx: FragmentContext, n: MotionNode, node: FNode): void {
  const data = ctx.images.get(n.id);
  const png = data && data.png;
  if (png && png.length <= IMAGE_MAX_BYTES && ctx.imageBytes + png.length <= IMAGE_BUDGET) {
    ctx.imageBytes += png.length;
    node.src = "data:image/png;base64," + png.toString("base64");
    if (n.text) node.alt = n.text.slice(0, 200);
    return;
  }
  // No usable crop: a block of the image's colour, the same size.
  node.tag = "div";
  node.styles.background = (data && data.color) || "#d4d4d4";
  if (data && data.approximation) ctx.approximations.push(data.approximation);
  else if (png) ctx.approximations.push("An image is shown as a flat colour because it is too large to carry.");
  else ctx.approximations.push("An image is shown as a flat colour because it could not be captured.");
}

/** MotionNode tree to an FNode tree (styles mapped, images resolved). Spacing is settled later. */
export function toFNode(ctx: FragmentContext, n: MotionNode, parent: FTag | null = null): FNode {
  ctx.ids.add(n.id);
  const node: FNode = { id: n.id, tag: tagFor(n.tag, parent), styles: mapStyles(ctx, n.styles), children: [], box: n.box, role: n.role, source: n };
  if (n.tag === "img") {
    node.tag = "img";
    imageNode(ctx, n, node);
    return node;
  }
  if (n.text) node.text = n.text;
  node.children = n.children.map((c) => toFNode(ctx, c, node.tag));
  return node;
}

// ── Spacing ──────────────────────────────────────────────────────────────────

function pad(st: FragmentStyle): [number, number, number, number] {
  const p = st.padding;
  if (p === undefined) return [0, 0, 0, 0];
  if (typeof p === "number") return [p, p, p, p];
  return p.length === 2 ? [p[0], p[1], p[0], p[1]] : [p[0], p[1], p[2], p[3]];
}
function setPad(st: FragmentStyle, p: [number, number, number, number]): void {
  const q = p.map((v) => clamp(r2(v), 0, 1000)) as [number, number, number, number];
  if (q.every((v) => v === 0)) delete st.padding;
  else st.padding = q;
}
const plain = (n: FNode) => n.tag !== "img" && !n.styles.background && !n.styles.borderWidth && !n.styles.borderColor && n.styles.overflow !== "hidden";

/** The union of the children's boxes, for an added wrapper. */
export function unionBox(nodes: FNode[]): Box | undefined {
  const boxes = nodes.map((n) => n.box).filter((b): b is Box => !!b);
  if (!boxes.length) return undefined;
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w)), y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

function grow(n: FNode, side: 0 | 1 | 2 | 3, by: number): void {
  const p = pad(n.styles);
  p[side] += by;
  setPad(n.styles, p);
  if (side === 0 || side === 2) { if (n.styles.height !== undefined) n.styles.height = r2(n.styles.height + by); }
  else if (n.styles.width !== undefined) n.styles.width = r2(n.styles.width + by);
}

const sameRow = (a: Box, b: Box) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) / 2;

/**
 * Makes up lost margins in block-flow parents, deepest first. `split` holds ids of targets split into their
 * children: no spacer goes inside one.
 */
export function settleSpacing(ctx: FragmentContext, root: FNode, split: Set<string>): void {
  const visit = (n: FNode) => {
    for (const c of n.children) visit(c);
    if (n.tag === "img" || !n.box || n.styles.display === "flex") return;
    const kids = n.children.filter((c) => c.box);
    if (!kids.length) return;
    const [pt, , , pl] = pad(n.styles);
    const bw = n.styles.borderWidth || 0;
    const top = n.box.y + pt + bw, left = n.box.x + pl + bw;
    const isSplit = split.has(n.id);
    const out: FNode[] = [];
    let cursorY = top;
    let prev: FNode | null = null;
    let lost = false;
    for (const c of n.children) {
      if (!c.box) { out.push(c); continue; }
      const b = c.box;
      const row = prev && prev.box && sameRow(prev.box, b);
      if (row && prev && prev.box) {
        // Side by side: the space between them, on the left.
        const gapX = b.x - (prev.box.x + prev.box.w);
        if (gapX > 0.5) {
          if (plain(c)) grow(c, 3, gapX);
          else if (!isSplit) out.push(spacer(ctx, n.id, { display: "inline-block", width: r2(gapX), height: 1 }));
          else lost = true;
        }
      } else {
        const gapY = b.y - cursorY;
        if (gapY > 0.5) {
          if (plain(c)) grow(c, 0, gapY);
          else if (prev && plain(prev)) grow(prev, 2, gapY);
          else if (!isSplit) out.push(spacer(ctx, n.id, { width: 0, height: r2(gapY) }));
          else lost = true;
        } else if (gapY < -1) lost = true;
        const gapX = b.x - left;
        if (gapX > 0.5 && plain(c)) grow(c, 3, gapX);
      }
      out.push(c);
      cursorY = Math.max(cursorY, b.y + b.h);
      prev = c;
    }
    n.children = out;
    if (lost) ctx.approximations.push("Some of the space between items is tighter than on the page.");
  };
  visit(root);
}

function spacer(ctx: FragmentContext, parentId: string, styles: FragmentStyle): FNode {
  return { id: freshId(ctx, parentId + "-space"), tag: "div", styles, children: [] };
}

// ── Output ───────────────────────────────────────────────────────────────────

/** Drops inherited values equal to the parent's, so the styles map stays small. */
function pruneInherited(n: FNode, parent: FragmentStyle | null): void {
  const own = { ...n.styles };
  if (parent) for (const k of INHERITED) if (own[k] !== undefined && own[k] === parent[k]) delete n.styles[k];
  const effective: FragmentStyle = { ...(parent || {}), ...own };
  for (const c of n.children) pruneInherited(c, effective);
}

export type FragmentOutput = { html: string; styles: Record<string, FragmentStyle> };

export function serialize(root: FNode): FragmentOutput {
  pruneInherited(root, null);
  const styles: Record<string, FragmentStyle> = {};
  const write = (n: FNode): string => {
    if (Object.keys(n.styles).length) styles[n.id] = n.styles;
    const tail = n.tail ? escapeText(n.tail) : "";
    if (n.tag === "img") {
      return '<img id="' + escapeAttr(n.id) + '" src="' + n.src + '"' + (n.alt ? ' alt="' + escapeAttr(n.alt) + '"' : "") + ">" + tail;
    }
    const inner = (n.text ? escapeText(n.text) : "") + n.children.map(write).join("");
    return "<" + n.tag + ' id="' + escapeAttr(n.id) + '">' + inner + "</" + n.tag + ">" + tail;
  };
  const html = write(root);
  return { html, styles };
}

/** Number of element nodes in a tree. */
export function countNodes(n: FNode): number {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}
