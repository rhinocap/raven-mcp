// Maps a taste binding's motion notes to playground defaults.
//
// The vocabulary is fixed and small on purpose: a note either names one of
// these terms or it is ignored and listed in warnings. Nothing here guesses at
// free prose, because a default derived from a misread note would be Raven's
// own taste presented as the designer's.
//
//   restrained / subtle  amplitude defaults lowered by a third
//   snappy               duration and speed defaults shortened by a quarter
//   no bounce            damping ratio at least 1 on every moving part, or a
//                        warning when the motif cannot reach it in its range

import type { MotionParam, MotionSchema } from "./validate.js";

export const TASTE_NOTE_KEYS = ["motion", "entrance", "loading"] as const;

type Term = { id: "restrained" | "snappy" | "no-bounce"; pattern: RegExp };
const TERMS: Term[] = [
  { id: "restrained", pattern: /\b(restrained|subtle)\b/i },
  { id: "snappy", pattern: /\bsnappy\b/i },
  { id: "no-bounce", pattern: /\b(no[- ]bounce|without (a )?bounce)\b/i },
];

export type TasteAdjustment = { values: Record<string, unknown>; applied: string[]; warnings: string[] };

function snap(p: MotionParam, v: number): number {
  const min = p.min as number, max = p.max as number, step = p.step as number;
  const stepped = step > 0 ? Math.round((v - min) / step) * step + min : v;
  return Number(Math.min(max, Math.max(min, stepped)).toFixed(6));
}

// Highest damping ratio the motif can reach anywhere in its hard ranges, or
// null when the motif has no damped motion to speak of.
type DampingModel = { maxRatio: (schema: MotionSchema) => number; settings: (schema: MotionSchema) => Record<string, unknown> | null };

const KEYFOB_FIRM = 8;
const DAMPING: Record<string, DampingModel> = {
  // runtime.js coeffs(): w0 = 2π / period, beta = (firm 8 | soft 5) / settle, so
  // ζ = beta / w0 = k · period / (2π · settle). The fob has the longest period,
  // so it is the most damped part; the settleTime >= f · fobPeriod constraint
  // caps it at k / (2π · f), whatever the ranges are.
  keyfob: {
    maxRatio(schema) {
      const c = (schema.constraints || []).find((k) => k.a === "settleTime" && k.b === "fobPeriod" && k.op === "gte");
      const factor = c?.factor ?? 1;
      return KEYFOB_FIRM / (2 * Math.PI * factor);
    },
    settings() { return null; },
  },
};

/**
 * Applies the recognised terms in `notes` to the schema's defaults. Controls
 * listed in `pinned` (set explicitly through overrides) are left alone.
 */
export function applyTasteNotes(schema: MotionSchema, notes: Record<string, string>, pinned: Set<string>): TasteAdjustment {
  const values: Record<string, unknown> = {};
  for (const p of schema.params) values[p.id] = p.default;
  const applied: string[] = [];
  const warnings: string[] = [];
  const found = new Set<Term["id"]>();

  for (const key of TASTE_NOTE_KEYS) {
    const text = typeof notes[key] === "string" ? notes[key].trim() : "";
    if (!text) continue;
    const hits = TERMS.filter((t) => t.pattern.test(text));
    if (hits.length === 0) {
      warnings.push(`Taste note ${key} ("${text.slice(0, 80)}") has no playground mapping; ignored. Recognised terms: restrained, subtle, snappy, no bounce.`);
      continue;
    }
    for (const h of hits) found.add(h.id);
  }

  const numeric = (p: MotionParam) => p.type === "number" && !pinned.has(p.id) && typeof p.default === "number";
  if (found.has("restrained")) {
    const changed = schema.params.filter((p) => numeric(p) && p.role === "amplitude");
    for (const p of changed) values[p.id] = snap(p, (p.default as number) * (2 / 3));
    if (changed.length) applied.push(`restrained: ${changed.map((p) => p.id).join(", ")} lowered by a third`);
  }
  if (found.has("snappy")) {
    const changed = schema.params.filter((p) => numeric(p) && (p.role === "duration" || p.role === "speed"));
    for (const p of changed) values[p.id] = snap(p, (p.default as number) * 0.75);
    if (changed.length) applied.push(`snappy: ${changed.map((p) => p.id).join(", ")} shortened by a quarter`);
  }
  if (found.has("no-bounce")) {
    const model = DAMPING[schema.id];
    const settings = model?.settings(schema) ?? null;
    if (!model) {
      warnings.push(`no bounce: ${schema.id} has no damped motion to adjust; ignored.`);
    } else if (settings === null || model.maxRatio(schema) < 1) {
      warnings.push(`no bounce: ${schema.id} cannot be critically damped inside its ranges (highest damping ratio ${model.maxRatio(schema).toFixed(2)}, needs 1.00), so its swing defaults are kept.`);
    } else {
      Object.assign(values, settings);
      applied.push(`no bounce: damping ratio at least 1`);
    }
  }
  return { values, applied, warnings };
}
