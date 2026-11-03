// Build a motion playground: one self-contained HTML file with a motif's
// animation on a stage, its controls in designer language, and exports.
//
// Raven never calls a model here. The calling agent picks the motif and any
// overrides; this module validates and assembles. The correction order for a
// default that breaks a constraint is fixed (docs/spec-motion-playground.md,
// Validation): overrides, then taste, then clamp each constraint, round up to
// the step, fail if that leaves the range, then revalidate the whole schema.
//
// Motif sources are copies from Motion Lab (scripts/sync-motion-motifs.mjs);
// template.html is Raven's fork of the Motion Lab template.
//
// A timeline is the other input: a whole Motion Lab timeline document the agent
// writes. Raven runs Motion Lab's own validator and text outliner on it (the
// synced copies in src/data/motion/timeline/) and fills timeline-template.html,
// Raven's fork of the timeline playground.
import { createHash, randomBytes } from "node:crypto";
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getTasteProfile, resolveSurfaceBinding } from "../taste.js";
import { tasteHome, type TasteStore } from "../taste-store.js";
import { applyTasteNotes } from "./taste-map.js";
import { near, validateMotionSchema, type MotionParam, type MotionSchema } from "./validate.js";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOTION_DIR = join(PKG_ROOT, "src", "data", "motion");
const TIMELINE_DIR = join(MOTION_DIR, "timeline");

/** Motifs with a runtime. The tool's enum is built from this list. */
export const MOTION_MOTIFS = ["keyfob"] as const;
export type MotionMotif = (typeof MOTION_MOTIFS)[number];

// The Motion Lab schema's maxLength values; a test holds them equal to playground.schema.json.
export const TITLE_MAX = 40;
export const CONTROL_LABEL_MAX = 24;
export const GROUP_LABEL_MAX = 20;
// JSON Schema maxLength counts code points, so an emoji is one character here as it is there.
const chars = (s: string) => [...s].length;
const U32 = 4294967295;
// A 16-bit id collides rarely; this many draws in a row all colliding means the folder is close to full.
const MAX_NAME_ATTEMPTS = 8;

export type ControlOverride = { label?: string; default?: unknown; min?: number; max?: number; clientSafe?: boolean };
export type PlaygroundOverrides = { controls?: Record<string, ControlOverride>; groups?: Record<string, string> };

export type MotionPlaygroundInput = {
  store: TasteStore;
  motif?: string;
  timeline?: unknown;
  /** HTML for a timeline's element targets; cleaned by Motion Lab's fragment sanitiser before use. */
  fragment?: unknown;
  title?: string;
  overrides?: PlaygroundOverrides;
  profile?: string;
  project?: string;
  seed?: number;
  output_path?: string;
};

export type MotionPlaygroundResult = {
  tool: "create_motion_playground";
  html_path: string;
  playground_id: string;
  motif?: MotionMotif;
  timeline_id?: string;
  controls: number;
  client_safe: number;
  bytes: number;
  warnings: string[];
  taste_applied?: string[];
  next: string[];
};

const NEXT = [
  "Call open_motion_playground with html_path and give the designer the url it returns, so Send to your agent reaches you. Then call get_motion_sends to receive what they send.",
  "After tuning, the designer can also use Copy for Raven on the Send to agent tab and paste the text back here to record it with record_taste_decision.",
];

function readMotif(motif: MotionMotif): { schema: MotionSchema; runtime: string } {
  const schema = JSON.parse(readFileSync(join(MOTION_DIR, motif, "schema.json"), "utf8")) as MotionSchema;
  const runtime = readFileSync(join(MOTION_DIR, motif, "runtime.js"), "utf8");
  return { schema, runtime };
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** JSON safe inside a <script type="application/json"> element. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function unitSuffix(p: MotionParam): string {
  return p.unit && p.unit !== "x" ? " " + p.unit : p.unit === "x" ? "×" : "";
}

function applyOverrides(schema: MotionSchema, overrides: PlaygroundOverrides | undefined): Set<string> {
  const pinned = new Set<string>();
  if (!overrides) return pinned;
  const byId = new Map(schema.params.map((p) => [p.id, p]));
  for (const [id, o] of Object.entries(overrides.controls || {})) {
    const p = byId.get(id);
    if (!p) throw new Error(`Unknown control "${id}" for motif ${schema.id}. Controls: ${schema.params.map((x) => x.id).join(", ")}.`);
    if (o.label !== undefined) {
      if (typeof o.label !== "string" || o.label.trim().length === 0 || chars(o.label.trim()) > CONTROL_LABEL_MAX) throw new Error(`${id}: label must be 1-${CONTROL_LABEL_MAX} characters`);
      p.label = o.label.trim();
    }
    if (o.min !== undefined || o.max !== undefined) {
      if (p.type !== "number") throw new Error(`${id}: min and max apply only to number controls`);
      const step = p.step as number, hardMin = p.min as number, hardMax = p.max as number;
      for (const [k, v] of [["min", o.min], ["max", o.max]] as const) {
        if (v === undefined) continue;
        if (typeof v !== "number" || !Number.isFinite(v) || v < hardMin || v > hardMax) throw new Error(`${id}: ${k} ${String(v)} is outside the motif's range ${hardMin}..${hardMax}`);
        if (step > 0 && !near(Math.round((v - hardMin) / step) * step + hardMin, v)) throw new Error(`${id}: ${k} ${v} is not on a step of ${step} from ${hardMin}`);
      }
      if (o.min !== undefined) p.min = o.min;
      if (o.max !== undefined) p.max = o.max;
    }
    if (o.default !== undefined) { p.default = o.default; pinned.add(id); }
    if (o.clientSafe !== undefined) {
      if (typeof o.clientSafe !== "boolean") throw new Error(`${id}: clientSafe must be true or false`);
      if (o.clientSafe) delete p.clientSafe; else p.clientSafe = false;
    }
  }
  const groupIds = new Map(schema.groups.map((g) => [g.id, g]));
  for (const [id, label] of Object.entries(overrides.groups || {})) {
    const g = groupIds.get(id);
    if (!g) throw new Error(`Unknown group "${id}" for motif ${schema.id}. Groups: ${schema.groups.map((x) => x.id).join(", ")}.`);
    if (typeof label !== "string" || label.trim().length === 0 || chars(label.trim()) > GROUP_LABEL_MAX) throw new Error(`group ${id}: label must be 1-${GROUP_LABEL_MAX} characters`);
    g.label = label.trim();
  }
  return pinned;
}

/** Steps 3-5 of the correction order. Mutates defaults; returns one warning per correction. */
export function correctConstraints(schema: MotionSchema): string[] {
  const warnings: string[] = [];
  const byId = new Map(schema.params.map((p) => [p.id, p]));
  for (const c of schema.constraints || []) {
    if (c.op === "neq") continue;
    const a = byId.get(c.a), b = byId.get(c.b);
    if (!a || !b || typeof a.default !== "number" || typeof b.default !== "number") continue;
    const f = c.factor ?? 1;
    const target = f * b.default;
    const holds = c.op === "gte" ? a.default >= target : a.default <= target;
    if (holds) continue;
    const min = a.min as number, max = a.max as number, step = a.step as number;
    const units = (target - min) / step;
    // Round toward the side that keeps the constraint; rounding to nearest can land back across it.
    const n = c.op === "gte" ? Math.ceil(units - 1e-9) : Math.floor(units + 1e-9);
    const next = Number((n * step + min).toFixed(6));
    const relation = c.op === "gte" ? "below" : "above";
    const factorText = f !== 1 ? f + " × " : "";
    if (next > max || next < min) {
      throw new Error(
        `${c.a} cannot meet ${c.a} ${c.op === "gte" ? ">=" : "<="} ${factorText}${c.b}: ${factorText}${b.default}${unitSuffix(b)} needs ${next}${unitSuffix(a)}, outside ${a.label}'s range ${min}..${max}. Lower ${c.b} or raise ${c.a}'s range.`,
      );
    }
    warnings.push(
      `${c.a} default ${a.default}${unitSuffix(a)} is ${relation} ${factorText}${b.label.toLowerCase()} (${b.default}${unitSuffix(b)}); ${c.op === "gte" ? "raised" : "lowered"} to ${next}${unitSuffix(a)} (${factorText}${b.default} = ${Number(target.toFixed(4))}, rounded ${c.op === "gte" ? "up" : "down"} to the ${step}${unitSuffix(a)} step).`,
    );
    a.default = next;
  }
  return warnings;
}

/**
 * A slider range the playground cannot honour is refused at build time: every value of a
 * constraint's b must leave a reachable value of a. Otherwise moving b past the limit leaves
 * the constraint broken with no control able to fix it.
 */
export function checkConstraintReach(schema: MotionSchema): void {
  const byId = new Map(schema.params.map((p) => [p.id, p]));
  for (const c of schema.constraints || []) {
    if (c.op === "neq") continue;
    const a = byId.get(c.a), b = byId.get(c.b);
    if (!a || !b || a.type !== "number" || b.type !== "number") continue;
    const f = c.factor ?? 1;
    const worstB = c.op === "gte" ? (b.max as number) : (b.min as number);
    const need = f * worstB;
    const ok = c.op === "gte" ? (a.max as number) >= need - 1e-9 : (a.min as number) <= need + 1e-9;
    if (ok) continue;
    const factorText = f !== 1 ? f + " × " : "";
    const bound = c.op === "gte" ? "max" : "min";
    throw new Error(
      `${c.a} ${bound} ${a[bound]}${unitSuffix(a)} cannot keep ${c.a} ${c.op === "gte" ? ">=" : "<="} ${factorText}${c.b} when ${c.b} is at its ${bound} ${worstB}${unitSuffix(b)} (needs ${Number(need.toFixed(4))}${unitSuffix(a)}). ${c.op === "gte" ? "Raise" : "Lower"} ${c.a}'s ${bound} or ${c.op === "gte" ? "lower" : "raise"} ${c.b}'s ${bound}.`,
    );
  }
}

// A timeline's JSON is held to this size before anything parses it further; Motion Lab's own
// timelines are under 20 KB.
export const TIMELINE_MAX_BYTES = 256 * 1024;
const FONT_EXT = /\.(otf|ttf|woff2?)$/i;

// Kinds the synced evaluator builds today. svg targets are in the schema but refused by the validator
// until artwork boxes are measured at build.
export const TIMELINE_TARGET_KINDS = ["surface", "text", "element"] as const;
// The sanitiser's own limit is 3 MB; this refuses a larger string before it is read.
export const FRAGMENT_MAX_BYTES = 3 * 1024 * 1024;

type TimelineDoc = {
  id: string; title: string; seed?: number; fonts?: Record<string, { path: string }>;
  params: MotionParam[]; groups: { id: string; advanced?: boolean }[];
};
type TimelineCheck = { errs: string[]; warnings: string[]; layout?: unknown };
type TimelineModule = { checkTimeline: (doc: unknown, opts?: { fragmentHtml?: string }) => TimelineCheck };
let timelineModule: Promise<TimelineModule> | null = null;
function loadTimelineValidator(): Promise<TimelineModule> {
  timelineModule ??= import(pathToFileURL(join(TIMELINE_DIR, "scripts", "validate-timeline.mjs")).href) as Promise<TimelineModule>;
  return timelineModule;
}

/** The words the tool description lists, read from the synced schema so they cannot drift from it. */
export function timelineVocabulary(): { properties: string[]; targetKinds: string[]; easings: string[] } {
  const schema = JSON.parse(readFileSync(join(TIMELINE_DIR, "schemas", "timeline.schema.json"), "utf8"));
  const defs = schema.$defs;
  const easings = (defs.easing.oneOf as { enum?: string[] }[]).find((o) => Array.isArray(o.enum))?.enum ?? [];
  const kinds = (defs.target.properties.kind.enum as string[]).filter((k) => (TIMELINE_TARGET_KINDS as readonly string[]).includes(k));
  return { properties: defs.track.properties.property.enum as string[], targetKinds: kinds, easings };
}

function readFragment(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "string") throw new Error("fragment must be a string of HTML");
  const bytes = Buffer.byteLength(input, "utf8");
  if (bytes > FRAGMENT_MAX_BYTES) throw new Error(`fragment is ${bytes} bytes; at most ${FRAGMENT_MAX_BYTES}`);
  return input;
}

function readTimeline(input: unknown): TimelineDoc {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("timeline must be a JSON object: a Motion Lab timeline document");
  let text: string;
  try { text = JSON.stringify(input); } catch { throw new Error("timeline must be plain JSON"); }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > TIMELINE_MAX_BYTES) throw new Error(`timeline is ${bytes} bytes of JSON; at most ${TIMELINE_MAX_BYTES}`);
  // A copy, so nothing below changes the caller's object.
  const doc = JSON.parse(text) as TimelineDoc;
  const fonts = doc.fonts;
  if (fonts && typeof fonts === "object") {
    for (const [name, f] of Object.entries(fonts)) {
      const p = f && typeof f === "object" ? (f as { path?: unknown }).path : undefined;
      if (typeof p !== "string") continue; // the schema check names it
      if (!(p.startsWith("/") || p.startsWith("~/"))) throw new Error(`font ${name}: path must be absolute or start with ~/ (got "${p}")`);
      if (!FONT_EXT.test(p)) throw new Error(`font ${name}: path must end in .otf, .ttf, .woff or .woff2 (got "${p}")`);
    }
  }
  return doc;
}

/**
 * Content-Security-Policy for a generated playground. Inline scripts run only by hash, so injected markup
 * cannot run code or inline handlers. open_motion_playground serves the page from loopback and Send posts back
 * to that same origin. Raven Grab can still be run over a playground on its own, from the bridge proxy (which
 * strips this meta tag) or from the script_tag an agent pastes into a file; the pasted tag's inline config is
 * refused and the overlay reads its bridge from its own script address, so loopback scripts and connections
 * are allowed and nothing else is.
 * Data blocks (type="application/json") are not run, so they need no hash. style-src allows inline styles
 * because the panel builds swatches and the snippet preview with style attributes. The Grab overlay imports
 * its Geist face from Google Fonts, so those two origins are allowed for styles and fonts only.
 */
const LOOPBACK = "http://127.0.0.1:* http://localhost:*";
export function playgroundCsp(html: string): string {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || "";
    if (/\bsrc\s*=/i.test(attrs)) throw new Error("a playground template must not load scripts by src");
    if (/\btype\s*=\s*"application\/json"/i.test(attrs)) continue;
    hashes.push("'sha256-" + createHash("sha256").update(m[2], "utf8").digest("base64") + "'");
  }
  return [
    "default-src 'none'",
    "script-src " + [...hashes, LOOPBACK].join(" "),
    "style-src 'unsafe-inline' " + LOOPBACK + " https://fonts.googleapis.com",
    "img-src data: blob: " + LOOPBACK,
    "font-src data: " + LOOPBACK + " https://fonts.gstatic.com",
    "connect-src 'self' " + LOOPBACK + " ws://127.0.0.1:* ws://localhost:*",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** Wraps a filled template (a fragment that starts with <title> and its <style>) as a full document with the CSP. */
export function wrapPlayground(fragment: string): string {
  const head = fragment.match(/^[\s\S]*?<\/style>/);
  if (!head) throw new Error("playground template must open with its <title> and <style>");
  const csp = playgroundCsp(fragment);
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta http-equiv="Content-Security-Policy" content="' + escapeHtml(csp) + '">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    head[0] + "\n</head>\n<body>" + fragment.slice(head[0].length) + "</body>\n</html>\n";
}

function inlineSource(rel: string): string {
  const s = readFileSync(join(TIMELINE_DIR, rel), "utf8");
  if (/<\/script/i.test(s)) throw new Error(`${rel} contains </script and cannot be inlined`);
  return s;
}

// One pass over the template: a filled slot is never searched again, so caller text that
// looks like a marker (a title of "__SCHEMA__") stays text.
function fillTemplate(template: string, slots: Record<string, string>): string {
  for (const key of Object.keys(slots)) {
    const token = "__" + key + "__";
    const found = template.split(token).length - 1;
    if (found !== 1) throw new Error(`template.html must hold ${token} exactly once (found ${found})`);
  }
  const marker = new RegExp("__(" + Object.keys(slots).join("|") + ")__", "g");
  return template.replace(marker, (_m, key: string) => slots[key]);
}

type Ctx = { profile?: string; project?: string };
type Built = { html: string; idPrefix: string; params: MotionParam[]; groups: { id: string; advanced?: boolean }[]; warnings: string[]; tasteApplied?: string[] };

function readTitle(input: MotionPlaygroundInput): string | undefined {
  if (input.title === undefined) return undefined;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length === 0 || chars(title) > TITLE_MAX) throw new Error(`title must be 1-${TITLE_MAX} characters`);
  return title;
}
function readSeed(input: MotionPlaygroundInput): number | undefined {
  if (input.seed === undefined) return undefined;
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > U32) throw new Error(`seed must be an integer in 0..${U32}`);
  return input.seed;
}
function readCtxArgs(input: MotionPlaygroundInput): { profile: string; project: string } {
  const profile = typeof input.profile === "string" ? input.profile.trim() : "";
  const project = typeof input.project === "string" ? input.project.trim() : "";
  if ((profile === "") !== (project === "")) throw new Error("profile and project go together: pass both or neither");
  // Same rule record_taste_decision applies, so the Copy for Raven text it prefills can be recorded.
  if (project && !/^[a-z0-9][a-z0-9-_.]{0,63}$/i.test(project)) throw new Error("project must match /^[a-z0-9][a-z0-9-_.]{0,63}$/i");
  return { profile, project };
}

export async function createMotionPlayground(input: MotionPlaygroundInput): Promise<MotionPlaygroundResult> {
  const hasMotif = input.motif !== undefined, hasTimeline = input.timeline !== undefined;
  if (hasMotif === hasTimeline) throw new Error("Pass exactly one of motif (a built-in motif) or timeline (a Motion Lab timeline document).");
  const built = hasTimeline ? await buildTimeline(input) : await buildMotif(input);
  return writePlayground(input, built, hasTimeline ? { timeline_id: built.idPrefix } : { motif: built.idPrefix as MotionMotif });
}

async function buildTimeline(input: MotionPlaygroundInput): Promise<Built> {
  if (input.overrides !== undefined) throw new Error("overrides apply to built-in motifs. For a timeline, set labels, defaults and ranges in the timeline document itself.");
  const doc = readTimeline(input.timeline);
  const fragmentHtml = readFragment(input.fragment);
  const title = readTitle(input);
  if (title !== undefined) doc.title = title;
  const seed = readSeed(input);
  if (seed !== undefined) doc.seed = seed;
  const warnings: string[] = [];
  const { profile: profileArg, project: projectArg } = readCtxArgs(input);
  let ctx: Ctx = {};
  let tasteApplied: string[] | undefined;
  if (profileArg) {
    const profile = await getTasteProfile(input.store, profileArg);
    ctx = { profile: profile.name, project: projectArg };
    tasteApplied = [];
    const binding = await resolveSurfaceBinding(input.store, profile.name, { project: projectArg });
    warnings.push(binding
      ? "Taste notes set defaults on built-in motifs only, so this timeline keeps its own defaults. Copy for Raven records against this profile and project."
      : `No surface binding for project '${projectArg}' on profile '${profile.name}'. Copy for Raven still records against this profile and project.`);
  }
  const { checkTimeline } = await loadTimelineValidator();
  const check = checkTimeline(doc, { fragmentHtml });
  if (check.errs.length) throw new Error("The timeline breaks the Motion Lab contract:\n- " + check.errs.join("\n- "));
  warnings.push(...check.warnings);
  const template = readFileSync(join(MOTION_DIR, "timeline-template.html"), "utf8");
  const fragment = fillTemplate(template, {
    TITLE_HTML: escapeHtml(doc.title),
    DOC: jsonForScript(doc),
    LAYOUT: jsonForScript(check.layout),
    RAVEN_CTX: jsonForScript(ctx),
    EVALUATOR: inlineSource("src/timeline/evaluator.js"),
    EXPORT: inlineSource("src/timeline/export.js"),
    SWIFTUI: inlineSource("src/timeline/swiftui.js"),
  });
  return { html: wrapPlayground(fragment), idPrefix: doc.id, params: doc.params, groups: doc.groups, warnings, tasteApplied };
}

async function buildMotif(input: MotionPlaygroundInput): Promise<Built> {
  if (!(MOTION_MOTIFS as readonly string[]).includes(input.motif as string)) {
    throw new Error(`Unknown motif "${String(input.motif)}". Built-in motifs: ${MOTION_MOTIFS.join(", ")}. Raven builds playgrounds only from these.`);
  }
  const motif = input.motif as MotionMotif;
  const { schema, runtime } = readMotif(motif);
  // The contract accepts curve controls (schema 2.0); Raven's template fork has no curve editor yet.
  // No built-in motif has a curve today, so no test reaches this; it is for the next synced motif.
  const curve = schema.params.find((p) => p.type === "curve");
  if (curve) throw new Error(`${motif}: control ${curve.id} is a curve, and Raven's playground template does not render curve controls yet`);
  const warnings: string[] = [];

  const title = readTitle(input);
  if (title !== undefined) schema.title = title;
  const seed = readSeed(input);
  if (seed !== undefined) schema.seed = seed;

  // 1. overrides
  const pinned = applyOverrides(schema, input.overrides);

  // 2. taste
  const { profile: profileArg, project: projectArg } = readCtxArgs(input);
  let ctx: Ctx = {};
  let tasteApplied: string[] | undefined;
  if (profileArg) {
    const profile = await getTasteProfile(input.store, profileArg);
    ctx = { profile: profile.name, project: projectArg };
    const binding = await resolveSurfaceBinding(input.store, profile.name, { project: projectArg });
    if (!binding) {
      warnings.push(`No surface binding for project '${projectArg}' on profile '${profile.name}', so the motif's defaults are used. Copy for Raven still records against this profile and project.`);
      tasteApplied = [];
    } else {
      const adj = applyTasteNotes(schema, binding.design_notes, pinned);
      for (const p of schema.params) if (adj.values[p.id] !== undefined) p.default = adj.values[p.id];
      warnings.push(...adj.warnings);
      tasteApplied = adj.applied;
    }
  }

  // 3-5. constraints
  warnings.push(...correctConstraints(schema));
  checkConstraintReach(schema);

  // 6. full contract
  const errs = validateMotionSchema(schema);
  if (errs.length) throw new Error("The playground breaks the Motion Lab contract:\n- " + errs.join("\n- "));

  if (/<\/script/i.test(runtime)) throw new Error(`${motif}/runtime.js contains </script and cannot be inlined`);
  const template = readFileSync(join(MOTION_DIR, "template.html"), "utf8");
  const fragment = fillTemplate(template, {
    TITLE_HTML: escapeHtml(schema.title),
    SCHEMA: jsonForScript(schema),
    RAVEN_CTX: jsonForScript(ctx),
    RUNTIME: runtime,
  });
  return { html: wrapPlayground(fragment), idPrefix: motif, params: schema.params, groups: schema.groups, warnings, tasteApplied };
}

function writePlayground(input: MotionPlaygroundInput, built: Built, source: { motif?: MotionMotif; timeline_id?: string }): MotionPlaygroundResult {
  const { html, idPrefix, warnings, tasteApplied } = built;

  let htmlPath: string;
  let playgroundId: string;
  if (typeof input.output_path === "string" && input.output_path.trim().length > 0) {
    if (!/\.html$/i.test(input.output_path)) throw new Error("output_path must end in .html");
    htmlPath = resolve(input.output_path);
    playgroundId = basename(htmlPath).replace(/\.html$/i, "");
    mkdirSync(dirname(htmlPath), { recursive: true });
    // Replace only a regular file, never through a link: write a new file beside it, then rename over it.
    let existing: ReturnType<typeof lstatSync> | undefined;
    try { existing = lstatSync(htmlPath); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (existing && !existing.isFile()) {
      throw new Error("output_path " + htmlPath + " is " + (existing.isSymbolicLink() ? "a symbolic link" : "not a regular file") + "; give a path to a new or existing .html file");
    }
    const tmp = join(dirname(htmlPath), "." + basename(htmlPath) + "." + randomBytes(4).toString("hex") + ".tmp");
    // wx: an existing file at tmp is never ours, so a failure there leaves it alone; past that point it is ours to remove.
    let created = false;
    try {
      const fd = openSync(tmp, "wx");
      created = true;
      try { writeFileSync(fd, html, "utf8"); } finally { closeSync(fd); }
      renameSync(tmp, htmlPath);
    } catch (e) {
      if (created) { try { unlinkSync(tmp); } catch { /* already gone */ } }
      throw e;
    }
  } else {
    // A generated name must never replace an earlier playground: create exclusively and draw a new id on a collision.
    const dir = join(tasteHome(), "playgrounds");
    mkdirSync(dir, { recursive: true });
    for (let attempt = 0; ; attempt++) {
      playgroundId = idPrefix + "-" + randomBytes(2).toString("hex");
      htmlPath = join(dir, playgroundId + ".html");
      try {
        writeFileSync(htmlPath, html, { encoding: "utf8", flag: "wx" });
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= MAX_NAME_ATTEMPTS - 1) throw err;
      }
    }
  }

  const controls = built.params.filter((p) => p.type !== "action");
  const advancedGroups = new Set(built.groups.filter((g) => g.advanced).map((g) => g.id));
  const result: MotionPlaygroundResult = {
    tool: "create_motion_playground",
    html_path: htmlPath,
    playground_id: playgroundId,
    ...source,
    controls: controls.length,
    client_safe: controls.filter((p) => !p.advanced && !advancedGroups.has(p.group) && p.clientSafe !== false).length,
    bytes: Buffer.byteLength(html, "utf8"),
    warnings,
    next: NEXT,
  };
  if (tasteApplied !== undefined) result.taste_applied = tasteApplied;
  return result;
}
