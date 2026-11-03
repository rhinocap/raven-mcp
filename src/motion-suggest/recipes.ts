// One recipe per kind of moment (Site Motion Spec D4). Each turns a captured candidate into a Motion Lab
// timeline on element targets plus its fragment tree. Controls are in designer words, three to six per recipe.
//
// Defaults: the recipe's starting values, then the taste terms in the bound notes (restrained or subtle lowers
// how far things move by a third, snappy shortens timing by a quarter, no bounce takes the bounce out of the
// feel), then any values the designer tuned and sent before for this kind (recorded motion decisions).

import type { MotionCandidate, MotionKind } from "./candidates.js";
import type { TasteTermHit } from "../motion-playground/taste-map.js";
import {
  type FNode, type FragmentContext, type FragmentStyle,
  freshId, settleSpacing, serialize, toFNode, unionBox,
} from "./fragment.js";

export const STAGE_MARGIN = 48;

type Curve = { kind: "bezier"; points: [number, number, number, number] } | { kind: "spring"; duration: number; bounce: number };
type Param = Record<string, unknown> & { id: string; type: string; default: unknown };

export type TriggerDoc = "load" | { on: "hover"; target: string; leave: "reverse" } | { on: "scroll"; threshold: number; once: boolean };

export type RecipeResult = {
  kind: MotionKind;
  doc: Record<string, unknown> & { params: Param[]; trigger: TriggerDoc; styles: Record<string, FragmentStyle>; targets: Record<string, unknown> };
  fragment: string;
  approximations: string[];
  /** Plain words for the trigger, e.g. "On hover". */
  triggerWords: string;
  /** Which taste terms changed a default, for citations. */
  termsApplied: TasteTermHit[];
  /** Param ids whose defaults came from a recorded decision. */
  restored: string[];
  /** Defaults after taste and decisions, by param id. */
  values: Record<string, unknown>;
  warnings: string[];
};

export type RecipeOptions = {
  /** Suggestion number on the page, from 1. */
  index: number;
  terms: TasteTermHit[];
  /** Tuned values from the latest recorded decision for this kind. */
  tuned?: Record<string, unknown>;
};

// ── colour ───────────────────────────────────────────────────────────────────

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}
function luminance(h: string): number {
  const [r, g, b] = hexToRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}
/** The hover shade of a colour: 15% darker, or 15% lighter when it is already dark. */
export function hoverShade(h: string): string {
  return luminance(h) > 0.12 ? mix(h, "#000000", 0.15) : mix(h, "#ffffff", 0.15);
}

// ── params and taste ─────────────────────────────────────────────────────────

const SMOOTH: Curve = { kind: "bezier", points: [0.2, 0.8, 0.2, 1] };
const GLIDE: Curve = { kind: "bezier", points: [0.16, 1, 0.3, 1] };
const EVEN: Curve = { kind: "bezier", points: [0.4, 0, 0.6, 1] };

function feel(id: string, label: string, group: string, stops: { label: string; value: Curve }[], help: string): Param {
  return { id, label, type: "curve", group, role: "easing", kinds: ["spring", "bezier"], default: stops[0].value, stops, help };
}
function num(id: string, label: string, group: string, role: string, min: number, max: number, step: number, def: number, unit: string, help: string): Param {
  return { id, label, type: "number", group, role, min, max, step, default: def, unit, help };
}
function colour(id: string, label: string, group: string, def: string, swatches: string[], help: string): Param {
  const sw = Array.from(new Set([def, ...swatches].map((s) => s.toLowerCase()))).slice(0, 8);
  return { id, label, type: "color", group, role: "color", default: def.toLowerCase(), swatches: sw, help };
}

function snap(p: Param, v: number): number {
  const min = p.min as number, max = p.max as number, step = p.step as number;
  const s = Math.round((v - min) / step) * step + min;
  return Number(Math.min(max, Math.max(min, s)).toFixed(6));
}

/** Params whose resting value is 1 (a scale): taste changes their distance from 1. */
const SCALE_PARAMS = new Set(["zoom"]);

function applyTerms(params: Param[], terms: TasteTermHit[]): TasteTermHit[] {
  const used: TasteTermHit[] = [];
  for (const t of terms) {
    let changed = false;
    for (const p of params) {
      if (t.id === "restrained" && p.type === "number" && p.role === "amplitude") {
        const d = p.default as number;
        p.default = SCALE_PARAMS.has(p.id) ? snap(p, 1 + (d - 1) * (2 / 3)) : snap(p, d * (2 / 3));
        changed = true;
      } else if (t.id === "snappy" && p.type === "number" && p.role === "duration") {
        p.default = snap(p, (p.default as number) * 0.75);
        changed = true;
      } else if (t.id === "no-bounce" && p.type === "curve") {
        const stops = (p.stops as { label: string; value: Curve }[]).filter((s) => s.value.kind !== "spring" || s.value.bounce <= 0);
        p.stops = stops;
        const d = p.default as Curve;
        if (d.kind === "spring" && d.bounce > 0) p.default = stops[0].value;
        changed = true;
      }
    }
    if (changed) used.push(t);
  }
  return used;
}

function validCurve(v: unknown): v is Curve {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  if (c.kind === "bezier") {
    const p = c.points;
    return Array.isArray(p) && p.length === 4 && p.every((x) => typeof x === "number" && Number.isFinite(x)) && p[0] >= 0 && p[0] <= 1 && p[2] >= 0 && p[2] <= 1;
  }
  if (c.kind === "spring") {
    return typeof c.duration === "number" && c.duration >= 10 && c.duration <= 10000 && typeof c.bounce === "number" && c.bounce >= -0.9 && c.bounce <= 0.9;
  }
  return false;
}

function applyTuned(params: Param[], tuned: Record<string, unknown> | undefined, warnings: string[]): string[] {
  const restored: string[] = [];
  if (!tuned) return restored;
  for (const [id, v] of Object.entries(tuned)) {
    const p = params.find((q) => q.id === id);
    if (!p) continue; // a control this recipe no longer has
    if (p.type === "number" && typeof v === "number" && Number.isFinite(v)) { p.default = snap(p, v); restored.push(id); }
    else if (p.type === "color" && typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) {
      p.default = v.toLowerCase();
      const sw = p.swatches as string[];
      if (!sw.includes(p.default as string)) p.swatches = [p.default as string, ...sw].slice(0, 8);
      restored.push(id);
    } else if (p.type === "curve" && validCurve(v)) { p.default = v; restored.push(id); }
    else warnings.push(`A saved value for ${String(p.label)} could not be used, so it starts from the usual default.`);
  }
  return restored;
}

// ── shared pieces ────────────────────────────────────────────────────────────

function shortText(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max / 2 ? cut.slice(0, sp) : cut) + "…";
}

function findNode(n: FNode, pred: (x: FNode) => boolean): FNode | null {
  if (pred(n)) return n;
  for (const c of n.children) { const f = findNode(c, pred); if (f) return f; }
  return null;
}
function parentOf(root: FNode, target: FNode): FNode | null {
  for (const c of root.children) {
    if (c === target) return root;
    const p = parentOf(c, target);
    if (p) return p;
  }
  return null;
}
function allText(n: FNode): string {
  return [n.text || "", ...n.children.map(allText)].filter(Boolean).join(" ");
}

function stageFor(c: MotionCandidate, root: FNode): Record<string, unknown> {
  const w = (root.styles.width ?? root.box?.w ?? c.box.w);
  const h = (root.styles.height ?? root.box?.h ?? c.box.h);
  const clampDim = (v: number) => Math.max(64, Math.min(8192, Math.ceil(v + 2 * STAGE_MARGIN)));
  return { width: clampDim(w), height: clampDim(h), background: c.section.background, fragmentPosition: [STAGE_MARGIN, STAGE_MARGIN] };
}

function timelineId(kind: MotionKind, index: number): string {
  return (kind + "-" + index).slice(0, 40);
}

function finish(
  c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions, root: FNode, split: Set<string>,
  parts: { title: string; concept: string; trigger: TriggerDoc; triggerWords: string; targets: Record<string, unknown>; phases: unknown[]; tracks: unknown[]; groups: unknown[]; params: Param[] },
  extraApprox: string[] = [],
): RecipeResult {
  settleSpacing(ctx, root, split);
  const { html, styles } = serialize(root);
  const warnings: string[] = [];
  const termsApplied = applyTerms(parts.params, opts.terms);
  const restored = applyTuned(parts.params, opts.tuned, warnings);
  const values: Record<string, unknown> = {};
  for (const p of parts.params) values[p.id] = p.default;
  const doc = {
    schemaVersion: 1,
    id: timelineId(c.kind, opts.index),
    title: shortText(parts.title, 40),
    concept: shortText(parts.concept, 240),
    stage: stageFor(c, root),
    seed: 1,
    trigger: parts.trigger,
    styles,
    targets: parts.targets,
    phases: parts.phases,
    tracks: parts.tracks,
    groups: parts.groups,
    params: parts.params,
  };
  const approximations = Array.from(new Set([...c.approximations, ...ctx.approximations, ...extraApprox]));
  return { kind: c.kind, doc, fragment: html, approximations, triggerWords: parts.triggerWords, termsApplied, restored, values, warnings };
}

// ── the six recipes ──────────────────────────────────────────────────────────

function heroEntrance(c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions): RecipeResult {
  const root = toFNode(ctx, c.node);
  const heading = findNode(root, (n) => n.role === "heading") || findNode(root, (n) => /^h[1-6]$/.test(n.tag)) || root;
  const extra: string[] = [];
  // The headline's words become the parts that rise.
  const words = allText(heading).split(/\s+/).filter(Boolean).slice(0, 40);
  if (heading.children.length) extra.push("The headline's inline styling is shown plain.");
  heading.text = undefined;
  heading.children = words.map((w, i) => ({ id: freshId(ctx, heading.id + "-w" + i), tag: "span" as const, text: w, tail: i < words.length - 1 ? " " : undefined, styles: {}, children: [] }));

  const targets: Record<string, unknown> = { words: { kind: "element", id: heading.id, split: "children", label: "Headline", origin: [0.5, 1] } };
  const tracks: unknown[] = [
    { target: "words", phase: "words", property: "opacity", from: 0, to: 1, duration: { param: "timing" }, easing: "ease-out", stagger: { each: { param: "wordGap" }, order: "forward" } },
    { target: "words", phase: "words", property: "translateY", from: { param: "rise" }, to: 0, duration: { param: "timing" }, easing: { param: "feel" }, stagger: { each: { param: "wordGap" }, order: "forward" } },
  ];
  const phases: unknown[] = [{ id: "words", label: "Headline rises", duration: "auto" }];

  // Everything after the headline, in its parent, fades in after it.
  const parent = heading === root ? null : parentOf(root, heading);
  const split = new Set<string>([heading.id]);
  if (parent) {
    const at = parent.children.indexOf(heading);
    const after = parent.children.slice(at + 1);
    if (after.length) {
      const ps = parent.styles;
      const rs: FragmentStyle = {};
      if (ps.display === "flex") {
        rs.display = "flex";
        if (ps.flexDirection) rs.flexDirection = ps.flexDirection;
        if (ps.gap !== undefined) rs.gap = ps.gap;
        if (ps.alignItems) rs.alignItems = ps.alignItems;
        if (ps.justifyContent) rs.justifyContent = ps.justifyContent;
      }
      const rest: FNode = { id: freshId(ctx, parent.id + "-rest"), tag: "div", styles: rs, children: after, box: unionBox(after) };
      parent.children = [...parent.children.slice(0, at + 1), rest];
      split.add(rest.id);
      targets.rest = { kind: "element", id: rest.id, split: "children", label: "Rest of the section", origin: [0.5, 0.5] };
      tracks.push(
        { target: "rest", phase: "rest", property: "opacity", from: 0, to: 1, duration: { param: "timing" }, easing: "ease-out", stagger: { each: { param: "wordGap" }, order: "forward" } },
        { target: "rest", phase: "rest", property: "translateY", from: { param: "rise", times: 0.5 }, to: 0, duration: { param: "timing" }, easing: { param: "feel" }, stagger: { each: { param: "wordGap" }, order: "forward" } },
      );
      phases.push({ id: "rest", label: "Rest fades in", duration: "auto" });
    }
  }
  const g = "entrance";
  return finish(c, ctx, opts, root, split, {
    title: "Hero entrance: " + words.slice(0, 4).join(" "),
    concept: "When the page opens, the headline's words rise and fade in one after another, then the rest of the section follows.",
    trigger: "load", triggerWords: "When the page opens",
    targets, phases, tracks,
    groups: [{ id: g, label: "Entrance" }],
    params: [
      num("rise", "Rise", g, "amplitude", 0, 80, 2, 24, "px", "How far below its place each word starts."),
      num("timing", "Timing", g, "duration", 200, 1400, 20, 560, "ms", "How long each word takes to arrive."),
      num("wordGap", "Word gap", g, "stagger", 0, 240, 10, 70, "ms", "Wait before the next word starts."),
      feel("feel", "Feel", g, [
        { label: "Settle", value: { kind: "spring", duration: 560, bounce: 0 } },
        { label: "Soft bounce", value: { kind: "spring", duration: 560, bounce: 0.15 } },
        { label: "Glide", value: GLIDE },
      ], "How the words move into place."),
    ],
  }, extra);
}

function buttonHover(c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions): RecipeResult {
  const root = toFNode(ctx, c.node);
  root.tag = "div";
  const g = "hover";
  const bg = root.styles.background;
  const textColour = root.styles.color || "#1d1d1f";
  const base = bg || textColour;
  const shade = hoverShade(base);
  const prop = bg ? "background" : "color";
  const name = root.text ? shortText(root.text, 24) : "the button";
  return finish(c, ctx, opts, root, new Set(), {
    title: "Button hover: " + name,
    concept: "When the pointer is over the button it lifts a little and its colour deepens; when the pointer leaves it settles back.",
    trigger: { on: "hover", target: "button", leave: "reverse" }, triggerWords: "On hover",
    targets: { button: { kind: "element", id: root.id, label: "Button", origin: [0.5, 0.5] } },
    phases: [{ id: "lift", label: "Button lifts", duration: "auto" }],
    tracks: [
      { target: "button", phase: "lift", property: "translateY", from: 0, to: { param: "lift", times: -1 }, duration: { param: "timing" }, easing: { param: "feel" } },
      { target: "button", phase: "lift", property: prop, from: base, to: { param: "hoverColour" }, duration: { param: "timing" }, easing: "ease-out" },
    ],
    groups: [{ id: g, label: "On hover" }],
    params: [
      num("lift", "Lift", g, "amplitude", 0, 8, 1, 2, "px", "How far the button rises."),
      num("timing", "Timing", g, "duration", 80, 600, 10, 180, "ms", "How long the lift takes. Leaving takes as long."),
      feel("feel", "Feel", g, [
        { label: "Smooth", value: SMOOTH },
        { label: "Springy", value: { kind: "spring", duration: 260, bounce: 0.25 } },
        { label: "Even", value: EVEN },
      ], "How the button moves as it lifts."),
      colour("hoverColour", "Hover colour", g, shade, [base, mix(base, "#000000", 0.3), mix(base, "#ffffff", 0.2)], bg ? "The colour the button turns to under the pointer." : "The colour the text turns to under the pointer."),
    ],
  });
}

function cardHover(c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions): RecipeResult {
  const root = toFNode(ctx, c.node);
  const g = "hover";
  const img = findNode(root, (n) => n.role === "image" || (n.source?.tag === "img"));
  const targets: Record<string, unknown> = { card: { kind: "element", id: root.id, label: "Card", origin: [0.5, 0.5] } };
  const tracks: unknown[] = [
    { target: "card", phase: "lift", property: "translateY", from: 0, to: { param: "lift", times: -1 }, duration: { param: "timing" }, easing: { param: "feel" } },
  ];
  const params: Param[] = [
    num("lift", "Lift", g, "amplitude", 0, 12, 1, 4, "px", "How far the card rises."),
  ];
  if (img) {
    const parent = parentOf(root, img);
    if (parent) {
      const frame: FNode = {
        id: freshId(ctx, img.id + "-frame"), tag: "div", children: [img], box: img.box,
        styles: { overflow: "hidden", ...(img.styles.width !== undefined ? { width: img.styles.width } : {}), ...(img.styles.height !== undefined ? { height: img.styles.height } : {}), ...(img.styles.borderRadius ? { borderRadius: img.styles.borderRadius } : {}) },
      };
      parent.children = parent.children.map((k) => (k === img ? frame : k));
      targets.image = { kind: "element", id: img.id, label: "Image", origin: [0.5, 0.5] };
      tracks.push({ target: "image", phase: "lift", property: "scale", from: 1, to: { param: "zoom" }, duration: { param: "timing" }, easing: { param: "feel" } });
      params.push(num("zoom", "Image zoom", g, "amplitude", 1, 1.12, 0.01, 1.04, "", "How much the image grows inside the card. 1 keeps it still."));
    }
  }
  params.push(
    num("timing", "Timing", g, "duration", 80, 800, 10, 240, "ms", "How long the lift takes. Leaving takes as long."),
    feel("feel", "Feel", g, [
      { label: "Smooth", value: SMOOTH },
      { label: "Springy", value: { kind: "spring", duration: 320, bounce: 0.2 } },
      { label: "Even", value: EVEN },
    ], "How the card moves as it lifts."),
  );
  const heading = findNode(root, (n) => n.role === "heading");
  return finish(c, ctx, opts, root, new Set(), {
    title: "Card hover" + (heading?.text ? ": " + shortText(heading.text, 24) : ""),
    concept: img
      ? "When the pointer is over a card it lifts and its image grows a little inside its frame; leaving settles it back."
      : "When the pointer is over a card it lifts; leaving settles it back.",
    trigger: { on: "hover", target: "card", leave: "reverse" }, triggerWords: "On hover",
    targets, phases: [{ id: "lift", label: "Card lifts", duration: "auto" }], tracks,
    groups: [{ id: g, label: "On hover" }], params,
  });
}

function sectionReveal(c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions): RecipeResult {
  const root = toFNode(ctx, c.node);
  const g = "reveal";
  const heading = findNode(root, (n) => n.role === "heading");
  return finish(c, ctx, opts, root, new Set([root.id]), {
    title: "Section reveal" + (heading?.text ? ": " + shortText(heading.text, 24) : ""),
    concept: "As the section scrolls into view, its heading and then each item rise and fade in one after another.",
    trigger: { on: "scroll", threshold: 0.25, once: true }, triggerWords: "When it scrolls into view",
    targets: { items: { kind: "element", id: root.id, split: "children", label: "Section items", origin: [0.5, 0.5] } },
    phases: [{ id: "reveal", label: "Items rise", duration: "auto" }],
    tracks: [
      { target: "items", phase: "reveal", property: "opacity", from: 0, to: 1, duration: { param: "timing" }, easing: "ease-out", stagger: { each: { param: "itemGap" }, order: "forward" } },
      { target: "items", phase: "reveal", property: "translateY", from: { param: "rise" }, to: 0, duration: { param: "timing" }, easing: { param: "feel" }, stagger: { each: { param: "itemGap" }, order: "forward" } },
    ],
    groups: [{ id: g, label: "Reveal" }],
    params: [
      num("rise", "Rise", g, "amplitude", 0, 80, 2, 24, "px", "How far below its place each item starts."),
      num("timing", "Timing", g, "duration", 200, 1400, 20, 520, "ms", "How long each item takes to arrive."),
      num("itemGap", "Gap between items", g, "stagger", 0, 300, 10, 80, "ms", "Wait before the next item starts."),
      feel("feel", "Feel", g, [
        { label: "Settle", value: { kind: "spring", duration: 520, bounce: 0 } },
        { label: "Glide", value: GLIDE },
        { label: "Even", value: EVEN },
      ], "How each item moves into place."),
    ],
  });
}

function navHover(c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions): RecipeResult {
  const root = toFNode(ctx, c.node);
  const g = "hover";
  const findItem = (n: FNode): FNode | undefined => {
    for (const k of n.children) { if (k.role === "item") return k; const d = findItem(k); if (d) return d; }
    return undefined;
  };
  const link = findItem(root) || root.children[0] || root;
  const lineColour = link.styles.color || root.styles.color || "#1d1d1f";
  const bw = link.styles.width;
  const line: FNode = { id: freshId(ctx, link.id + "-line"), tag: "div", styles: { height: 2, background: lineColour, ...(bw !== undefined ? { width: bw } : {}) }, children: [] };
  link.children = [...link.children, line];
  // The line sits 2 px under the text and is 2 px tall: the link and the nav grow by 4 px.
  if (link.styles.height !== undefined) link.styles.height = Math.round((link.styles.height + 4) * 100) / 100;
  if (link !== root && root.styles.height !== undefined) root.styles.height = Math.round((root.styles.height + 4) * 100) / 100;
  if (link.text && link.children.length === 1) {
    // Text first, then the line, each on its own row.
    const label: FNode = { id: freshId(ctx, link.id + "-text"), tag: "div", text: link.text, styles: {}, children: [] };
    link.text = undefined;
    link.children = [label, line];
    link.styles.display = "flex";
    link.styles.flexDirection = "column";
    link.styles.gap = 2;
    delete link.styles.alignItems;
    delete link.styles.justifyContent;
  }
  return finish(c, ctx, opts, root, new Set(), {
    title: "Navigation hover" + (link.source?.text ? ": " + shortText(link.source.text, 20) : ""),
    concept: "When the pointer is over a link, a line draws in beneath it from the left; leaving draws it back out.",
    trigger: { on: "hover", target: "link", leave: "reverse" }, triggerWords: "On hover",
    targets: {
      link: { kind: "element", id: link.id, label: "Link", origin: [0.5, 0.5] },
      line: { kind: "element", id: line.id, label: "Underline", origin: [0, 0.5] },
    },
    phases: [{ id: "draw", label: "Line draws in", duration: "auto" }],
    tracks: [
      { target: "line", phase: "draw", property: "clip", from: { top: 0, right: 1, bottom: 0, left: 0 }, to: { top: 0, right: 0, bottom: 0, left: 0 }, duration: { param: "timing" }, easing: { param: "feel" } },
      { target: "line", phase: "draw", property: "background", from: { param: "lineColour" }, to: { param: "lineColour" }, duration: { param: "timing" }, easing: "linear" },
    ],
    groups: [{ id: g, label: "On hover" }],
    params: [
      num("timing", "Timing", g, "duration", 80, 800, 10, 220, "ms", "How long the line takes to draw in."),
      feel("feel", "Feel", g, [
        { label: "Smooth", value: SMOOTH },
        { label: "Glide", value: GLIDE },
        { label: "Even", value: EVEN },
      ], "How the line moves as it draws."),
      colour("lineColour", "Underline colour", g, lineColour, [mix(lineColour, "#ffffff", 0.4), "#1d1d1f"], "The colour of the line under the link."),
    ],
  }, ["Only the first link responds here; on your site every link would."]);
}

function imageReveal(c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions): RecipeResult {
  const img = toFNode(ctx, c.node);
  const g = "reveal";
  const frame: FNode = {
    id: freshId(ctx, img.id + "-frame"), tag: "div", children: [img], box: img.box, role: undefined,
    styles: { overflow: "hidden", ...(img.styles.width !== undefined ? { width: img.styles.width } : {}), ...(img.styles.height !== undefined ? { height: img.styles.height } : {}), ...(img.styles.borderRadius ? { borderRadius: img.styles.borderRadius } : {}) },
  };
  return finish(c, ctx, opts, frame, new Set(), {
    title: "Image reveal" + (c.node.text ? ": " + shortText(c.node.text, 24) : ""),
    concept: "As the image scrolls into view it is uncovered from the bottom up while it settles from slightly larger to its size.",
    trigger: { on: "scroll", threshold: 0.25, once: true }, triggerWords: "When it scrolls into view",
    targets: {
      frame: { kind: "element", id: frame.id, label: "Image frame", origin: [0.5, 0.5] },
      image: { kind: "element", id: img.id, label: "Image", origin: [0.5, 0.5] },
    },
    phases: [{ id: "reveal", label: "Image opens", duration: "auto" }],
    tracks: [
      { target: "frame", phase: "reveal", property: "clip", from: { top: 1, right: 0, bottom: 0, left: 0 }, to: { top: 0, right: 0, bottom: 0, left: 0 }, duration: { param: "timing" }, easing: { param: "feel" } },
      { target: "image", phase: "reveal", property: "scale", from: { param: "zoom" }, to: 1, duration: { param: "timing" }, easing: { param: "feel" } },
    ],
    groups: [{ id: g, label: "Reveal" }],
    params: [
      num("timing", "Timing", g, "duration", 300, 2000, 20, 900, "ms", "How long the image takes to open."),
      num("zoom", "Zoom", g, "amplitude", 1, 1.2, 0.01, 1.06, "", "How much larger the image starts. 1 keeps its size."),
      feel("feel", "Feel", g, [
        { label: "Glide", value: GLIDE },
        { label: "Smooth", value: SMOOTH },
        { label: "Even", value: EVEN },
      ], "How the image opens and settles."),
    ],
  });
}

const RECIPES: Record<MotionKind, (c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions) => RecipeResult> = {
  "hero-entrance": heroEntrance,
  "cta-hover": buttonHover,
  "card-hover": cardHover,
  "section-reveal": sectionReveal,
  "nav-hover": navHover,
  "image-reveal": imageReveal,
};

export function buildRecipe(c: MotionCandidate, ctx: FragmentContext, opts: RecipeOptions): RecipeResult {
  return RECIPES[c.kind](c, ctx, opts);
}
