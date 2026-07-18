/**
 * score-page.ts — per-category 0–10 design scorer built on the shared audit_page rule engine.
 *
 * Reuses runPageChecks verbatim — no fork, no edit to page-checks.ts.
 * Returns per-category scores (7 assessed categories), the same overall 0–100 / grade
 * audit_page produces, the weakest category, and an honest list of categories Raven
 * does not mechanically assess.
 */

import { runPageChecks } from "./page-checks.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type ScoreGrade = "A" | "B" | "C" | "D";

export type CategoryScore = {
  category: string;
  label: string;
  score: number;      // integer 0–10
  errors: number;
  warnings: number;
  rationale: string;  // one-liner: "all checks passed" or e.g. "1 error, 2 warnings"
};

export type OverallScore = {
  score: number;      // 0–100
  grade: ScoreGrade;
  summary: string;
};

export type NotAssessed = {
  categories: string[];
  note: string;
};

export type ScorePageResult = {
  overall: OverallScore;
  categories: CategoryScore[];
  weakest_category: string;
  not_assessed: NotAssessed;
  contrast: {
    pass_count: number;
    fail_count: number;
    indeterminate_count: number;
    note: string;
  };
};

type ContrastStatusRow = {
  status: "pass" | "fail" | "indeterminate";
  ratio: number | null;
};

// ── Canonical category definitions ───────────────────────────────────────────

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "structure",   label: "Structure" },
  { key: "typography",  label: "Typography" },
  { key: "color",       label: "Color & palette" },
  { key: "spacing",     label: "Spacing & rhythm" },
  { key: "a11y",        label: "Accessibility" },
  { key: "responsive",  label: "Responsive layout" },
  { key: "tokens",      label: "Design tokens" },
];

const NOT_ASSESSED_CATEGORIES = ["brand", "conversion", "motion"];
const NOT_ASSESSED_NOTE =
  "Brand voice, conversion effectiveness, and motion design are not mechanically assessed by " +
  "Raven's rule engine. Use evaluate_design for brand and conversion judgment, and " +
  "score_creative for creative / motion quality.";

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function buildRationale(errors: number, warnings: number): string {
  if (errors === 0 && warnings === 0) return "all checks passed";
  const parts: string[] = [];
  if (errors > 0)   parts.push(errors   + " " + pluralise(errors,   "error",   "errors"));
  if (warnings > 0) parts.push(warnings + " " + pluralise(warnings, "warning", "warnings"));
  return parts.join(", ");
}

// ── Core scorer ───────────────────────────────────────────────────────────────

export function scorePage(
  html: string,
  opts?: { strict?: boolean; containerMaxWidth?: number; contrastRows?: ContrastStatusRow[] }
): ScorePageResult {
  const strict = opts && opts.strict === true;
  const containerMaxWidth = opts ? opts.containerMaxWidth : undefined;

  const checked = runPageChecks(html, { containerMaxWidth });
  const passes = checked.passes;
  const contrastRows = opts?.contrastRows ?? [];
  const contrastPassCount = contrastRows.filter((row) => row.status === "pass" && row.ratio !== null).length;
  const contrastFailCount = contrastRows.filter((row) => row.status === "fail" && row.ratio !== null).length;
  const contrastIndeterminateCount = contrastRows.filter((row) => row.status === "indeterminate" || row.ratio === null).length;
  const contrastIssues = Array.from({ length: contrastFailCount }, () => ({
    severity: "error" as const,
    rule: "a11y/contrast",
    message: "A determinate text/background pair fails WCAG contrast.",
    fix: "Use audit_contrast for the failing selector and concrete ratio.",
  }));
  const issues = checked.issues.concat(contrastIssues);

  const errors  = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");

  // ── Overall (byte-identical to audit_page arithmetic) ─────────────────────
  const totalChecks = passes.length + issues.length + contrastPassCount;
  const failCount   = strict ? issues.length : errors.length;
  const overallScore =
    totalChecks > 0 ? Math.round(((totalChecks - failCount) / totalChecks) * 100) : 100;
  const grade: ScoreGrade =
    failCount === 0 ? "A" :
    failCount <= 2  ? "B" :
    failCount <= 4  ? "C" : "D";

  // ── Per-category ──────────────────────────────────────────────────────────
  const categories: CategoryScore[] = CATEGORIES.map(({ key, label }) => {
    const prefix = key + "/";
    const catErrors   = issues.filter(i => i.severity === "error"   && i.rule.startsWith(prefix));
    const catWarnings = issues.filter(i => i.severity === "warning" && i.rule.startsWith(prefix));
    const eCount = catErrors.length;
    const wCount = catWarnings.length;
    const penalty = eCount * 4 + wCount * 2;
    const score   = clamp(10 - penalty, 0, 10);
    return {
      category: key,
      label,
      score,
      errors:   eCount,
      warnings: wCount,
      rationale: buildRationale(eCount, wCount),
    };
  });

  // ── Weakest category (first in canonical order on ties) ───────────────────
  let weakestScore = Infinity;
  let weakestKey   = CATEGORIES[0].key;
  for (const cat of categories) {
    if (cat.score < weakestScore) {
      weakestScore = cat.score;
      weakestKey   = cat.category;
    }
  }

  // ── Overall summary ───────────────────────────────────────────────────────
  const weakestLabel = categories.find(c => c.category === weakestKey)?.label ?? weakestKey;
  const summary = `Overall ${overallScore}/100 (${grade}) — weakest: ${weakestLabel}`;

  return {
    overall: { score: overallScore, grade, summary },
    categories,
    weakest_category: weakestKey,
    not_assessed: {
      categories: NOT_ASSESSED_CATEGORIES,
      note: NOT_ASSESSED_NOTE,
    },
    contrast: {
      pass_count: contrastPassCount,
      fail_count: contrastFailCount,
      indeterminate_count: contrastIndeterminateCount,
      note: contrastIndeterminateCount === 0
        ? "No contrast rows were indeterminate."
        : contrastIndeterminateCount + " contrast " +
          (contrastIndeterminateCount === 1 ? "row not assessed" : "rows not assessed") +
          " because " + (contrastIndeterminateCount === 1 ? "its" : "their") +
          " rendered backdrop is indeterminate.",
    },
  };
}
