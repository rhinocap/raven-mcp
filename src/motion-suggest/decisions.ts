// Recorded motion decisions (Site Motion Spec Revision 13).
//
// A decision on dimension `motion` carries a canonical line at the start of `decision` (a choice) or of an
// entry in `rejected` (a turn-down): `motion:<kind> {"<param id>":<value>,…}`. The JSON is optional on a
// rejection. The latest decision that names a kind wins: a rejection removes the kind until a later choice
// brings it back, and a choice's values become the recipe's defaults where the control still exists.

import type { MotionKind } from "./candidates.js";
import { MOTION_KIND_LABELS } from "./candidates.js";

export type DecisionLike = { decision: string; rejected: string[]; recorded_at: string };

export type MotionDecisionState = {
  rejectedKinds: MotionKind[];
  tuned: Partial<Record<MotionKind, Record<string, unknown>>>;
  warnings: string[];
};

const LINE = /^\s*motion:([a-z-]+)(?:\s+(\{[\s\S]*\}))?\s*$/;

function firstLine(s: string): string {
  return (s.split("\n")[0] || "").trim();
}

/** Parses one canonical line; null when the text does not start with one. */
export function parseMotionLine(text: string): { kind: MotionKind; values?: Record<string, unknown>; bad?: string } | null {
  if (typeof text !== "string") return null;
  const m = LINE.exec(firstLine(text));
  if (!m) return null;
  const kind = m[1] as MotionKind;
  if (!(kind in MOTION_KIND_LABELS)) return { kind, bad: `unknown kind "${m[1]}"` };
  if (!m[2]) return { kind };
  try {
    const v = JSON.parse(m[2]);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { kind, bad: "values are not an object" };
    return { kind, values: v as Record<string, unknown> };
  } catch {
    return { kind, bad: "values are not valid JSON" };
  }
}

/** The canonical line for a choice, as get_motion_sends' next text asks the agent to record it. */
export function motionLine(kind: MotionKind, values?: Record<string, unknown>): string {
  return "motion:" + kind + (values && Object.keys(values).length ? " " + JSON.stringify(values) : "");
}

export function readMotionDecisions(decisions: DecisionLike[]): MotionDecisionState {
  const latest = new Map<MotionKind, { at: number; order: number; chose: boolean; values?: Record<string, unknown> }>();
  const warnings: string[] = [];
  decisions.forEach((d, order) => {
    const at = Date.parse(d.recorded_at) || 0;
    const entries: { chose: boolean; text: string }[] = [{ chose: true, text: d.decision }, ...(d.rejected || []).map((r) => ({ chose: false, text: r }))];
    for (const e of entries) {
      const p = parseMotionLine(e.text);
      if (!p) continue;
      if (p.bad) { warnings.push(`A recorded motion decision could not be read (${p.bad}), so it was left out.`); continue; }
      const prev = latest.get(p.kind);
      if (!prev || at > prev.at || (at === prev.at && order >= prev.order)) latest.set(p.kind, { at, order, chose: e.chose, values: p.values });
    }
  });
  const rejectedKinds: MotionKind[] = [];
  const tuned: MotionDecisionState["tuned"] = {};
  for (const [kind, v] of latest) {
    if (!v.chose) rejectedKinds.push(kind);
    else if (v.values) tuned[kind] = v.values;
  }
  return { rejectedKinds, tuned, warnings };
}
