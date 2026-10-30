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
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTasteProfile, resolveSurfaceBinding } from "../taste.js";
import { tasteHome, type TasteStore } from "../taste-store.js";
import { applyTasteNotes } from "./taste-map.js";
import { near, validateMotionSchema, type MotionParam, type MotionSchema } from "./validate.js";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOTION_DIR = join(PKG_ROOT, "src", "data", "motion");

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
  motif: string;
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
  motif: MotionMotif;
  controls: number;
  client_safe: number;
  bytes: number;
  warnings: string[];
  taste_applied?: string[];
  next: string[];
};

const NEXT = [
  "Open html_path in a browser.",
  "After tuning, use Copy for Raven on the Get code tab and paste the text back here to record it with record_taste_decision.",
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

export async function createMotionPlayground(input: MotionPlaygroundInput): Promise<MotionPlaygroundResult> {
  if (!(MOTION_MOTIFS as readonly string[]).includes(input.motif)) {
    throw new Error(`Unknown motif "${String(input.motif)}". Built-in motifs: ${MOTION_MOTIFS.join(", ")}. Raven builds playgrounds only from these.`);
  }
  const motif = input.motif as MotionMotif;
  const { schema, runtime } = readMotif(motif);
  const warnings: string[] = [];

  if (input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length === 0 || chars(title) > TITLE_MAX) throw new Error(`title must be 1-${TITLE_MAX} characters`);
    schema.title = title;
  }
  if (input.seed !== undefined) {
    if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > U32) throw new Error(`seed must be an integer in 0..${U32}`);
    schema.seed = input.seed;
  }

  // 1. overrides
  const pinned = applyOverrides(schema, input.overrides);

  // 2. taste
  const profileArg = typeof input.profile === "string" ? input.profile.trim() : "";
  const projectArg = typeof input.project === "string" ? input.project.trim() : "";
  if ((profileArg === "") !== (projectArg === "")) throw new Error("profile and project go together: pass both or neither");
  // Same rule record_taste_decision applies, so the Copy for Raven text it prefills can be recorded.
  if (projectArg && !/^[a-z0-9][a-z0-9-_.]{0,63}$/i.test(projectArg)) throw new Error("project must match /^[a-z0-9][a-z0-9-_.]{0,63}$/i");
  let ctx: { profile?: string; project?: string } = {};
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
  const html = fillTemplate(template, {
    TITLE_HTML: escapeHtml(schema.title),
    SCHEMA: jsonForScript(schema),
    RAVEN_CTX: jsonForScript(ctx),
    RUNTIME: runtime,
  });

  let htmlPath: string;
  let playgroundId: string;
  if (typeof input.output_path === "string" && input.output_path.trim().length > 0) {
    if (!/\.html$/i.test(input.output_path)) throw new Error("output_path must end in .html");
    htmlPath = resolve(input.output_path);
    playgroundId = basename(htmlPath).replace(/\.html$/i, "");
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, html, "utf8");
  } else {
    // A generated name must never replace an earlier playground: create exclusively and draw a new id on a collision.
    const dir = join(tasteHome(), "playgrounds");
    mkdirSync(dir, { recursive: true });
    for (let attempt = 0; ; attempt++) {
      playgroundId = motif + "-" + randomBytes(2).toString("hex");
      htmlPath = join(dir, playgroundId + ".html");
      try {
        writeFileSync(htmlPath, html, { encoding: "utf8", flag: "wx" });
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= MAX_NAME_ATTEMPTS - 1) throw err;
      }
    }
  }

  const controls = schema.params.filter((p) => p.type !== "action");
  const advancedGroups = new Set(schema.groups.filter((g) => g.advanced).map((g) => g.id));
  const result: MotionPlaygroundResult = {
    tool: "create_motion_playground",
    html_path: htmlPath,
    playground_id: playgroundId,
    motif,
    controls: controls.length,
    client_safe: controls.filter((p) => !p.advanced && !advancedGroups.has(p.group) && p.clientSafe !== false).length,
    bytes: Buffer.byteLength(html, "utf8"),
    warnings,
    next: NEXT,
  };
  if (tasteApplied !== undefined) result.taste_applied = tasteApplied;
  return result;
}
