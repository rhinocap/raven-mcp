// The Motion Lab playground contract, ported from motion-lab/scripts/validate.mjs.
//
// Every schema Raven writes into a playground passes this, including after
// overrides and taste adjustments. The shape check runs Motion Lab's own JSON
// Schema (src/data/motion/playground.schema.json, pinned by motifs.lock.json)
// with Ajv, as Motion Lab does, so lengths, patterns and extra keys agree by
// construction; the contract rules (counts, grouping, label vocabulary, value
// ranges, hinges, presets, constraints at defaults) are ported as written.
// Raven adds rules Motion Lab does not have, each stricter, never looser: 8-16
// controls, at least 2 groups, a non-empty label, a numeric number default, a
// #rrggbb colour default, and (in index.ts, checkConstraintReach) every slider
// range keeping its constraints reachable. A playground Raven accepts therefore
// passes Motion Lab's rules (the corpus comparison below aside).
// The corpus "different menus" comparison is not ported: Raven builds from a
// fixed motif, so every playground of one motif shares a menu by design.
// Schema 2.0 adds the curve control (a bezier or spring value); 1.0 documents
// stay valid unchanged, and a curve control needs schemaVersion "2.0".

import { readFileSync } from "node:fs";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";

export type MotionParam = {
  id: string;
  label: string;
  type: "number" | "enum" | "color" | "boolean" | "action" | "curve";
  group: string;
  role?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: unknown;
  unit?: string;
  widget?: string;
  // Numbers on a segmented number control; labelled curves on a curve control.
  stops?: number[] | CurveStop[];
  kinds?: CurveKind[];
  scale?: string;
  safeMin?: number;
  safeMax?: number;
  options?: Array<{ value: string; label: string }>;
  swatches?: string[];
  help?: string;
  clientSafe?: boolean;
  advanced?: boolean;
};

export type CurveKind = "bezier" | "spring";
export type CurveValue = { kind: "bezier"; points: number[] } | { kind: "spring"; duration: number; bounce: number };
export type CurveStop = { label: string; value: CurveValue };

export type MotionConstraint = { a: string; op: "gte" | "lte" | "neq"; b: string; factor?: number; why?: string };

export type MotionSchema = {
  schemaVersion: string;
  id: string;
  title: string;
  concept?: string;
  motif?: string;
  renderer?: string;
  canvas: { width: number; height: number; background?: string };
  interaction?: { events?: string[]; hinges?: Array<{ target: string; origin?: string; parent?: string }> };
  seed: number;
  groups: Array<{ id: string; label: string; advanced?: boolean }>;
  params: MotionParam[];
  exports: string[];
  constraints?: MotionConstraint[];
  presets?: Array<{ id: string; label?: string; values?: Record<string, unknown> }>;
};

const GENERIC_GROUPS = ["dimensions", "style", "motion", "colors", "colours", "behavior", "behaviour", "settings", "general", "options", "parameters", "controls"];
// Engine and solver vocabulary that does not belong on a designer-facing label.
const ENGINE_WORDS = /\b(noise ?scale|damping|stiffness|lerp|dt|k|octaves?|lacunarity|persistence|gain|zeta|omega|mass|tension|friction|simplex|perlin|cubic-?bezier|bezier|rgba?\(|hsl\(|shader|vec[234]|sin|cos|theta|beta|alpha)\b/i;
// Shader uniforms and easing identifiers are recognised by their case, so this half stays
// case-sensitive: under /i, u[A-Z] matches "Upper" and ease[A-Z] matches "Eased". "uniform"
// counts only as a GLSL declaration (any whitespace, an optional precision qualifier, then a GLSL
// type); "Uniform spacing" and "keep spacing uniform" are a designer's words.
const ENGINE_IDENTIFIERS = /\b(u[A-Z]\w*|iTime|ease[A-Z]\w*|uniform\s+((lowp|mediump|highp)\s+)?(float|double|u?int|bool|[biud]?vec[234]|d?mat[234](x[234])?|[iu]?sampler\w*))\b/;
const hasEngineWord = (label: string) => ENGINE_WORDS.test(label) || ENGINE_IDENTIFIERS.test(label);
// snake_case, or a camelCase identifier: two or more lowercase letters, then a hump into a lowercase
// letter (swingFeel, hoverAngle). Product names pass: iPhone, iPad and eBay have one lowercase letter
// before the hump, macOS has none after it, and YouTube starts with a capital.
const CODE_SHAPED = /_|\b[a-z]{2,}[A-Z][a-z]/;
// Braces, block comments, and a semicolon that ends the label or touches the next token: source code.
// A semicolon followed by a space is punctuation in a sentence ("Swing; then settle").
const CODE_PUNCT = /[{}]|\/\*|\*\/|;\s*$|;\S/;
// These are a lint, not a parser. CSS declarations ("opacity: 0.5") and calls ("translateX(10px)")
// pass; lowercase-led product names ("reMarkable") are refused because they share hoverAngle's shape.
const TIME_UNITS = ["ms", "s", "x", "Hz", "px/s"];
const ROLE_TYPES: Record<string, (p: MotionParam) => boolean> = {
  duration: (p) => p.type === "number" && TIME_UNITS.includes(p.unit ?? ""),
  speed: (p) => p.type === "number" && TIME_UNITS.includes(p.unit ?? ""),
  delay: (p) => p.type === "number" && TIME_UNITS.includes(p.unit ?? ""),
  stagger: (p) => p.type === "number" && TIME_UNITS.includes(p.unit ?? ""),
  loop: (p) => p.type === "boolean" || p.type === "enum",
  easing: (p) => p.type === "enum" || p.type === "curve",
  color: (p) => p.type === "color" || p.type === "enum",
};
const MIN_PARAMS = 8;
const MAX_PARAMS = 16;
const MAX_PER_GROUP = 6;
const MAX_STEPS = 2000;

export const near = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
export const onStep = (p: MotionParam, v: number) =>
  near(Math.round((v - (p.min as number)) / (p.step as number)) * (p.step as number) + (p.min as number), v);

// Ported from motion-lab src/timeline/evaluator.js, so Raven and the playground agree on a curve.
// Bezier x in 0-1, y in -1-2; spring duration 10 ms to MAX_MS, bounce -0.9-0.9; no other keys.
// kinds, when given, lists the kinds the control offers.
const MAX_MS = 60000;
export function curveValueOk(v: unknown, kinds?: string[]): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  if (kinds && !kinds.includes(c.kind as string)) return false;
  const fin = Number.isFinite;
  if (c.kind === "bezier") {
    const p = c.points;
    return Object.keys(c).length === 2 && Array.isArray(p) && p.length === 4 && p.every((n) => fin(n)) &&
      p[0] >= 0 && p[0] <= 1 && p[2] >= 0 && p[2] <= 1 && p[1] >= -1 && p[1] <= 2 && p[3] >= -1 && p[3] <= 2;
  }
  if (c.kind === "spring") {
    return Object.keys(c).length === 3 && fin(c.duration) && (c.duration as number) >= 10 && (c.duration as number) <= MAX_MS &&
      fin(c.bounce) && (c.bounce as number) >= -0.9 && (c.bounce as number) <= 0.9;
  }
  return false;
}
// Curve values compare by content, in a fixed key order.
export const curveKey = (v: CurveValue) => (v.kind === "bezier" ? "b:" + v.points.join(",") : "s:" + v.duration + "," + v.bounce);

export function valueOk(p: MotionParam | undefined, v: unknown): boolean {
  if (!p) return false;
  if (p.type === "number") {
    return typeof v === "number" && Number.isFinite(v) && v >= (p.min as number) && v <= (p.max as number) &&
      (!((p.step as number) > 0) || p.widget === "segmented" || onStep(p, v));
  }
  if (p.type === "boolean") return typeof v === "boolean";
  if (p.type === "color") return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  if (p.type === "enum") return (p.options || []).some((o) => o.value === v);
  if (p.type === "curve") return curveValueOk(v, p.kinds);
  return false;
}

export function constraintHolds(c: MotionConstraint, values: Record<string, unknown>): boolean {
  const a = values[c.a], b = values[c.b];
  const f = c.factor ?? 1;
  if (c.op === "neq") return a !== b;
  if (typeof a !== "number" || typeof b !== "number") return false;
  return c.op === "lte" ? a <= f * b : a >= f * b;
}

// Compiled on first use, so importing this module reads no files.
let checkShape: ValidateFunction | null = null;
function shapeErrors(doc: unknown): string[] {
  checkShape ??= new Ajv2020({ allErrors: true, strict: false }).compile(
    JSON.parse(readFileSync(new URL("../../src/data/motion/playground.schema.json", import.meta.url), "utf8")),
  );
  if (checkShape(doc)) return [];
  return (checkShape.errors ?? []).map((e) => {
    const extra = e.params?.unevaluatedProperty ? ` (${e.params.unevaluatedProperty})` : "";
    return `shape ${e.instancePath || "/"} ${e.message}${extra}`;
  });
}

/** Returns contract violations; an empty list means the schema is a valid playground. */
export function validateMotionSchema(doc: MotionSchema): string[] {
  // Shape is the pinned schema's alone; the checks below are the rules a JSON Schema cannot state.
  const errs: string[] = shapeErrors(doc);
  const params = Array.isArray(doc.params) ? doc.params : [];
  const groups = Array.isArray(doc.groups) ? doc.groups : [];
  const controls = params.filter((p) => p.type !== "action");
  if (controls.length < MIN_PARAMS || controls.length > MAX_PARAMS) {
    errs.push(`${controls.length} controls; a playground has ${MIN_PARAMS}-${MAX_PARAMS}`);
  }

  const byId = new Map<string, MotionParam>();
  const groupIds = new Set<string>();
  for (const g of groups) {
    if (groupIds.has(g.id)) errs.push(`duplicate group id ${g.id}`);
    groupIds.add(g.id);
    if (typeof g.label !== "string" || g.label.trim().length === 0) errs.push(`group ${g.id}: empty label`);
    else if (!g.advanced) {
      // A group heading sits in the same panel as its controls, so the same vocabulary rule applies.
      if (hasEngineWord(g.label)) errs.push(`group ${g.id}: engine word in a non-advanced label "${g.label}"`);
      if (CODE_SHAPED.test(g.label)) errs.push(`group ${g.id}: label "${g.label}" is code-shaped (snake_case or camelCase)`);
      if (CODE_PUNCT.test(g.label)) errs.push(`group ${g.id}: label "${g.label}" contains code punctuation`);
    }
  }
  const advancedGroups = new Set(groups.filter((g) => g.advanced).map((g) => g.id));
  const isAdvanced = (p: MotionParam) => !!(p.advanced || advancedGroups.has(p.group));

  for (const p of params) {
    if (byId.has(p.id)) errs.push(`duplicate param id ${p.id}`);
    byId.set(p.id, p);
    if (typeof p.label !== "string" || p.label.trim().length === 0) errs.push(`${p.id}: empty label`);
    if (!groupIds.has(p.group)) errs.push(`${p.id}: group "${p.group}" not declared`);
    if (!isAdvanced(p)) {
      if (hasEngineWord(p.label)) errs.push(`${p.id}: engine word in a non-advanced label "${p.label}"`);
      if (CODE_SHAPED.test(p.label)) errs.push(`${p.id}: label "${p.label}" is code-shaped (snake_case or camelCase)`);
      if (CODE_PUNCT.test(p.label)) errs.push(`${p.id}: label "${p.label}" contains code punctuation`);
    }
    if (p.role && ROLE_TYPES[p.role] && !ROLE_TYPES[p.role](p)) {
      errs.push(`${p.id}: role "${p.role}" does not fit a ${p.type}${p.unit !== undefined ? ` in "${p.unit}"` : ""}`);
    }
    if (p.type === "number") {
      const min = p.min as number, max = p.max as number, step = p.step as number, def = p.default as number;
      if (!(min < max)) errs.push(`${p.id}: min must be < max`);
      if (typeof def !== "number" || !Number.isFinite(def)) errs.push(`${p.id}: default must be a number`);
      else if (def < min || def > max) errs.push(`${p.id}: default ${def} outside ${min}..${max}`);
      if (step > 0 && (max - min) / step > MAX_STEPS) errs.push(`${p.id}: ${Math.round((max - min) / step)} steps; at most ${MAX_STEPS} are usable by hand`);
      if (step > 0 && p.widget !== "segmented" && typeof def === "number" && !onStep(p, def)) errs.push(`${p.id}: default ${def} is not on a step of ${step} from ${min}`);
      if (p.scale === "log" && !(min > 0)) errs.push(`${p.id}: log scale needs min > 0`);
      const sMin = p.safeMin ?? min, sMax = p.safeMax ?? max;
      if (!(min <= sMin && sMin <= sMax && sMax <= max)) errs.push(`${p.id}: need min <= safeMin <= safeMax <= max`);
      if (p.widget === "segmented") {
        const stops = p.stops as number[] | undefined;
        if (!Array.isArray(stops) || stops.length < 2) errs.push(`${p.id}: segmented number needs stops`);
        else {
          if (!stops.includes(def)) errs.push(`${p.id}: default not one of stops`);
          for (const s of stops) if (s < min || s > max) errs.push(`${p.id}: stop ${s} outside ${min}..${max}`);
          if (new Set(stops).size !== stops.length) errs.push(`${p.id}: duplicate stops`);
        }
      }
    }
    if (p.type === "enum") {
      const options = Array.isArray(p.options) ? p.options : [];
      if (!options.some((o) => o.value === p.default)) errs.push(`${p.id}: default "${String(p.default)}" not in options`);
      if (new Set(options.map((o) => o.value)).size !== options.length) errs.push(`${p.id}: duplicate option values`);
      if ((p.widget ?? "segmented") === "segmented" && options.length > 4) errs.push(`${p.id}: segmented enum has ${options.length} options; use select above 4`);
    }
    if (p.type === "curve") {
      if (doc.schemaVersion !== "2.0") errs.push(`${p.id}: a curve control needs schemaVersion "2.0"`);
      if (!curveValueOk(p.default, p.kinds)) errs.push(`${p.id}: default is not a ${(p.kinds || []).join(" or ")} curve this control offers`);
      const stops = (Array.isArray(p.stops) ? p.stops : []) as CurveStop[];
      for (const s of stops) {
        if (!curveValueOk(s.value, p.kinds)) errs.push(`${p.id}: stop "${s.label}" is not a curve this control offers`);
        if (!isAdvanced(p) && (hasEngineWord(s.label) || CODE_SHAPED.test(s.label) || CODE_PUNCT.test(s.label))) errs.push(`${p.id}: stop label "${s.label}" is not designer language`);
      }
      if (new Set(stops.map((s) => s.label)).size !== stops.length) errs.push(`${p.id}: duplicate stop labels`);
      const keys = stops.filter((s) => curveValueOk(s.value)).map((s) => curveKey(s.value));
      if (new Set(keys).size !== keys.length) errs.push(`${p.id}: two stops hold the same curve`);
    }
    if (p.type === "color" && !valueOk(p, p.default)) errs.push(`${p.id}: default must be a #rrggbb colour`);
  }

  // Grouping: a count cap alone allows a 16-slider wall in one group.
  for (const g of groups) {
    const n = params.filter((p) => p.group === g.id).length;
    if (!n) errs.push(`group ${g.id} is empty`);
    if (n > MAX_PER_GROUP) errs.push(`group ${g.id} has ${n} params; at most ${MAX_PER_GROUP}`);
  }
  if (groups.length < 2) errs.push(`${groups.length} group(s); a playground needs at least 2`);
  const genericCount = groups.filter((g) => GENERIC_GROUPS.includes(String(g.label).toLowerCase())).length;
  if (genericCount > 1 || (groups.length && genericCount === groups.length)) errs.push(`${genericCount} generic settings-sheet group label(s); name groups for the motif`);
  const adv = params.filter(isAdvanced).length;
  if (params.length - adv < 6) errs.push(`only ${params.length - adv} non-advanced params; the default panel needs at least 6`);
  if (adv * 3 > params.length) errs.push(`${adv} of ${params.length} params are advanced; at most one third`);
  const visibleToClient = params.filter((p) => p.type !== "action" && !isAdvanced(p) && p.clientSafe !== false).length;
  if (visibleToClient < 5 || visibleToClient > 12) errs.push(`${visibleToClient} client-safe controls; review mode needs 5-12 (set clientSafe:false on structure and size controls)`);

  // Motion minimum: duration/speed, easing or exit style, loop when looping, stagger/delay where several things move.
  const has = (role: string) => params.some((p) => p.role === role && (!ROLE_TYPES[role] || ROLE_TYPES[role](p)));
  if (!has("duration") && !has("speed")) errs.push("motion minimum: no duration or speed number with a time unit");
  if (!has("easing")) errs.push('motion minimum: no easing/exit-style enum (role "easing")');
  const events = doc.interaction?.events || [];
  if (events.includes("loop") && !has("loop")) errs.push("motion minimum: events include loop but no loop control");
  const hinges = doc.interaction?.hinges || [];
  if ((doc.motif === "pattern" || hinges.length > 1) && !has("stagger") && !has("delay")) errs.push("motion minimum: several elements move but there is no stagger or delay control");

  const hingeTargets = new Set<string>();
  for (const h of hinges) {
    if (hingeTargets.has(h.target)) errs.push(`hinge ${h.target} declared twice`);
    hingeTargets.add(h.target);
  }
  for (const h of hinges) {
    if (h.parent && !hingeTargets.has(h.parent)) errs.push(`hinge ${h.target}: parent ${h.parent} not declared`);
    if (h.parent === h.target) errs.push(`hinge ${h.target}: is its own parent`);
  }

  const presetIds = new Set<string>();
  for (const pr of doc.presets || []) {
    if (presetIds.has(pr.id)) errs.push(`duplicate preset id ${pr.id}`);
    presetIds.add(pr.id);
    for (const [k, v] of Object.entries(pr.values || {})) {
      if (!byId.has(k)) errs.push(`preset ${pr.id}: unknown param ${k}`);
      else if (!valueOk(byId.get(k), v)) errs.push(`preset ${pr.id}: ${JSON.stringify(v)} is not a valid value for ${k}`);
    }
  }

  for (const c of doc.constraints || []) {
    const a = byId.get(c.a), b = byId.get(c.b);
    if (!a || !b) { errs.push(`constraint ${c.a} ${c.op} ${c.b}: unknown param`); continue; }
    // No equality is defined between curves, so a curve control cannot take part in a constraint.
    if (a.type === "curve" || b.type === "curve") { errs.push(`constraint ${c.a} ${c.op} ${c.b}: a curve control cannot be in a constraint`); continue; }
    if (c.op !== "neq" && (a.type !== "number" || b.type !== "number")) { errs.push(`constraint ${c.a} ${c.op} ${c.b}: lte/gte need numbers`); continue; }
    const values = { [c.a]: a.default, [c.b]: b.default };
    if (!constraintHolds(c, values)) errs.push(`constraint ${c.a} ${c.op} ${c.factor ?? 1}*${c.b}: defaults violate it`);
  }

  const exp = Array.isArray(doc.exports) ? doc.exports : [];
  if (exp.includes("svg-frame") && ["canvas2d", "webgl"].includes(doc.renderer ?? "")) errs.push(`svg-frame export on a ${doc.renderer} renderer`);
  if (exp.includes("css-keyframes") && (events.includes("click") || events.includes("drag"))) errs.push("css-keyframes export cannot encode click or drag impulses");
  return errs;
}
