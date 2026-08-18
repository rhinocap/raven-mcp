/**
 * design-gauntlet.ts — design_gauntlet implementation
 *
 * Compare a subject page to a reference (benchmark) page from live computed
 * CSS, across the nine dimensions that decide perceived polish: surfaces,
 * hairlines, text roles, letter spacing, accent, type scale, radii,
 * elevation, rhythm. The first four account for most of the perceived
 * difference. Output is a measured diff, a checkable bar derived from the
 * reference, fixes split mechanical vs needs-a-decision, and a binary
 * on_par verdict — the exit gate for the gauntlet loop the response embeds.
 *
 * Measurement rules (from the teardown protocol):
 * - Measure, never recall: every number comes off the live DOM.
 * - Zero-height trap: wait for layout, verify a healthy visible count.
 * - Lazy-load trap: scroll the full page once, return to top, then probe.
 * - Long-tail trap: vocabulary is read from the top of each tally
 *   (smallest set of values covering 90% of occurrences), never raw counts.
 * - Webfont trap: wait on document.fonts.ready, report fonts_status.
 * - Color-scheme trap: the scheme is emulated explicitly and reported.
 */

import { CaptureUnavailableError } from "./capture.js";
import { launchAuditChromium } from "./browser-launch.js";

export { CaptureUnavailableError };

export type TallyEntry = { value: string; count: number };

export type GauntletMeasurement = {
  url: string;
  viewport: string;
  device_scale_factor: number;
  color_scheme: string;
  visible_elements: number;
  fonts_status: string;
  surfaces: { canvas: string; tally: TallyEntry[] };
  borders: { tally: TallyEntry[] };
  text: { tally: TallyEntry[] };
  tracking: { display: TallyEntry[]; body: TallyEntry[] };
  accent: { candidates: TallyEntry[]; usesInFirstViewport: number };
  type: { families: TallyEntry[]; sizes: TallyEntry[]; weights: TallyEntry[] };
  radii: { tally: TallyEntry[] };
  elevation: { shadows: TallyEntry[]; insetOnly: number };
  rhythm: { containers: TallyEntry[]; sectionPadding: TallyEntry[] };
  warnings: string[];
};

export type GauntletDiffRow = {
  dimension: string;
  metric: string;
  subject: string;
  reference: string;
  subject_worse: boolean;
  note: string;
};

export type GauntletBarCheck = {
  id: string;
  mechanism: string;
  check: string;
};

// Keyed by `mechanism` — the SAME string bar[].mechanism and
// verdict.failing_mechanisms carry, because loop-protocol step 2 tells a
// consumer to join fixes to failing mechanisms by name. A fix entry keyed by
// any other field breaks that join silently (caught by the real-pair e2e).
export type GauntletFix = {
  fix: string;
  mechanism: string;
  effect: "high" | "medium" | "low";
};

export type GauntletComparison = {
  diff: GauntletDiffRow[];
  bar: GauntletBarCheck[];
  fixes: { mechanical: GauntletFix[]; needs_a_decision: GauntletFix[] };
  verdict: { on_par: boolean; failing_mechanisms: string[]; biggest_gap: string | null };
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * The real vocabulary of a tally: the smallest number of top values that
 * covers `coverage` of all occurrences. Third-party embeds, cookie banners
 * and chat widgets contribute a long tail of one-off values that are not
 * part of the site's design system — a raw distinct count reads that tail
 * as if it were the system.
 */
export function vocabularyCount(tally: TallyEntry[], coverage = 0.9): number {
  const sorted = tally.slice().sort((a, b) => b.count - a.count);
  const total = sorted.reduce((sum, e) => sum + e.count, 0);
  if (total === 0) return 0;
  let seen = 0;
  for (let i = 0; i < sorted.length; i++) {
    seen += sorted[i].count;
    if (seen >= coverage * total) return i + 1;
  }
  return sorted.length;
}

/** Parse the em value out of a tracking tally entry ("−0.32px = -0.020em" or "normal (0em)"). */
export function parseTrackingEm(value: string): number | null {
  if (/^normal/.test(value)) return 0;
  const m = value.match(/=\s*(-?[\d.]+)em/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** The most common tracking value's em, or null when nothing was measured. */
export function primaryTrackingEm(tally: TallyEntry[]): number | null {
  if (tally.length === 0) return null;
  const top = tally.slice().sort((a, b) => b.count - a.count)[0];
  return parseTrackingEm(top.value);
}

const EFFECT_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Dimension order for tie-breaks mirrors "the first four account for most of
// the perceived difference": tracking / text roles / hairlines / surfaces
// carry the most visible effect per hour.
const DIMENSION_RANK: Record<string, number> = {
  tracking: 0, text: 1, hairlines: 2, surfaces: 3,
  accent: 4, radii: 5, type: 6, elevation: 7, rhythm: 8
};

type RuleResult = {
  subject: string;
  reference: string;
  worse: boolean;
  note: string;
  mechanism: string;
  check: string;
  fix: string;
  kind: "mechanical" | "needs_a_decision";
  effect: "high" | "medium" | "low";
};

type Rule = {
  id: string;
  dimension: string;
  metric: string;
  evaluate: (s: GauntletMeasurement, r: GauntletMeasurement) => RuleResult;
};

const RULES: Rule[] = [
  {
    id: "surfaces-ladder", dimension: "surfaces", metric: "elevation ladder (surface vocabulary)",
    evaluate(s, r) {
      const sv = vocabularyCount(s.surfaces.tally);
      const rv = vocabularyCount(r.surfaces.tally);
      const worse = rv >= 2 && sv <= 1;
      return {
        subject: sv + " surface value" + (sv === 1 ? "" : "s"),
        reference: rv + " surface value" + (rv === 1 ? "" : "s"),
        worse,
        note: worse
          ? "Reference builds an elevation ladder from distinct panel backgrounds; subject has no ladder — panels sit on the canvas."
          : "Both sides carry a comparable surface vocabulary.",
        mechanism: "surface elevation ladder",
        check: "Subject renders at least 2 distinct panel/canvas background values (vocabulary at 90% coverage).",
        fix: "Decide an elevation ladder: canvas plus at least one raised panel value, applied consistently.",
        kind: "needs_a_decision", effect: "high"
      };
    }
  },
  {
    id: "surfaces-sprawl", dimension: "surfaces", metric: "surface sprawl",
    evaluate(s, r) {
      const sv = vocabularyCount(s.surfaces.tally);
      const rv = vocabularyCount(r.surfaces.tally);
      const worse = sv > rv + 3;
      return {
        subject: sv + " in vocabulary", reference: rv + " in vocabulary", worse,
        note: worse
          ? "Subject's background vocabulary has sprawled well past the reference's."
          : "Surface vocabulary is within range of the reference.",
        mechanism: "surface vocabulary budget",
        check: "Subject's surface vocabulary is within 3 of the reference's (" + rv + ").",
        fix: "Consolidate panel backgrounds down to a declared set of at most " + (rv + 3) + " values.",
        kind: "mechanical", effect: "medium"
      };
    }
  },
  {
    id: "hairline-sprawl", dimension: "hairlines", metric: "border vocabulary",
    evaluate(s, r) {
      const sv = vocabularyCount(s.borders.tally);
      const rv = vocabularyCount(r.borders.tally);
      const worse = sv > rv + 2;
      return {
        subject: sv + " border value" + (sv === 1 ? "" : "s"),
        reference: rv + " border value" + (rv === 1 ? "" : "s"),
        worse,
        note: worse
          ? "Subject draws edges with more distinct border colors/widths than the reference — hairlines stop reading as one system."
          : "Border vocabulary is within range of the reference.",
        mechanism: "hairline discipline",
        check: "Subject's border vocabulary is within 2 of the reference's (" + rv + ").",
        fix: "Unify border colors and widths to one hairline value (plus at most one emphasis value) via find-and-replace.",
        kind: "mechanical", effect: "high"
      };
    }
  },
  {
    id: "text-roles-flat", dimension: "text", metric: "text role hierarchy",
    evaluate(s, r) {
      const sv = vocabularyCount(s.text.tally);
      const rv = vocabularyCount(r.text.tally);
      const worse = rv >= 3 && sv < 3;
      return {
        subject: sv + " text color" + (sv === 1 ? "" : "s"),
        reference: rv + " text color" + (rv === 1 ? "" : "s"),
        worse,
        note: worse
          ? "Reference separates heading/body/muted roles by color; subject's hierarchy is doing no work."
          : "Text-role separation is comparable.",
        mechanism: "text role separation",
        check: "Subject renders at least 3 distinct text colors (heading / body / muted).",
        fix: "Introduce distinct heading, body and muted text colors — a token assignment, not a redesign.",
        kind: "mechanical", effect: "high"
      };
    }
  },
  {
    id: "text-roles-sprawl", dimension: "text", metric: "text color sprawl",
    evaluate(s, r) {
      const sv = vocabularyCount(s.text.tally);
      const rv = vocabularyCount(r.text.tally);
      const worse = sv > rv + 3;
      return {
        subject: sv + " in vocabulary", reference: rv + " in vocabulary", worse,
        note: worse
          ? "Subject uses far more distinct text colors than the reference — roles have leaked."
          : "Text color count is within range.",
        mechanism: "text color budget",
        check: "Subject's text-color vocabulary is within 3 of the reference's (" + rv + ").",
        fix: "Collapse stray text colors onto the declared role set via find-and-replace.",
        kind: "mechanical", effect: "medium"
      };
    }
  },
  {
    id: "tracking-display", dimension: "tracking", metric: "display letter-spacing",
    evaluate(s, r) {
      const se = primaryTrackingEm(s.tracking.display);
      const re = primaryTrackingEm(r.tracking.display);
      if (se === null || re === null) {
        return {
          subject: se === null ? "unmeasured" : se + "em",
          reference: re === null ? "unmeasured" : re + "em",
          worse: false,
          note: "Display tracking could not be measured on " + (se === null ? "subject" : "reference") + " — no headings in range, or canvas/WebGL content.",
          mechanism: "display tracking", check: "", fix: "", kind: "mechanical", effect: "high"
        };
      }
      const worse = se - re > 0.005;
      return {
        subject: se + "em", reference: re + "em", worse,
        note: worse
          ? "Subject's headlines track looser than the reference's — tighter display tracking is the single highest effect-per-hour change."
          : "Display tracking is at or tighter than the reference.",
        mechanism: "display tracking",
        check: "Subject's most common display tracking is within 0.005em of the reference's (" + re + "em).",
        fix: "Tighten display letter-spacing to ~" + re + "em on headings — touches every screen, takes an hour.",
        kind: "mechanical", effect: "high"
      };
    }
  },
  {
    id: "tracking-body", dimension: "tracking", metric: "body letter-spacing",
    evaluate(s, r) {
      const se = primaryTrackingEm(s.tracking.body);
      const re = primaryTrackingEm(r.tracking.body);
      // Unmeasured on either side is worse:false with an honest note — the
      // same rule tracking-display already enforces. The first shipped shape
      // treated a missing REFERENCE measurement as license to fire (re ===
      // null counted as "the reference does not share it"), so a reference
      // whose body text simply fell outside the 13–20px window produced an
      // on_par:false failure with no benchmark behind it (Sol P1, 2026-08-14).
      // A check that claims comparison to a value nobody measured is invented,
      // which is the one thing GAUNTLET_DISCIPLINE_NOTICE forbids.
      if (se === null || re === null) {
        return {
          subject: se === null ? "unmeasured" : se + "em",
          reference: re === null ? "unmeasured" : re + "em",
          worse: false,
          note: "Body tracking could not be measured on " + (se === null ? "subject" : "reference") + " — no body-range text, or canvas/WebGL content.",
          mechanism: "body tracking", check: "", fix: "", kind: "mechanical", effect: "medium"
        };
      }
      const worse = se > 0.001 && re <= 0.001;
      return {
        subject: se + "em",
        reference: re + "em",
        worse,
        note: worse
          ? "Subject's body text carries positive tracking — almost always a mistake on screen."
          : "Body tracking is fine.",
        mechanism: "body tracking",
        check: "Subject's most common body tracking is not positive (≤ 0.001em).",
        fix: "Remove positive letter-spacing from body text.",
        kind: "mechanical", effect: "medium"
      };
    }
  },
  {
    id: "accent-overuse", dimension: "accent", metric: "accent frequency in first viewport",
    evaluate(s, r) {
      const budget = Math.max(r.accent.usesInFirstViewport, 2);
      const worse = s.accent.usesInFirstViewport > budget;
      return {
        subject: s.accent.usesInFirstViewport + " use" + (s.accent.usesInFirstViewport === 1 ? "" : "s"),
        reference: r.accent.usesInFirstViewport + " use" + (r.accent.usesInFirstViewport === 1 ? "" : "s"),
        worse,
        note: worse
          ? "Above the reference's budget the accent stops functioning as an accent."
          : "Accent frequency is disciplined.",
        mechanism: "accent frequency",
        check: "Subject uses its accent at most " + budget + " times in the first viewport.",
        fix: "Reduce first-viewport accent uses to " + budget + " — demote the rest to neutral styling.",
        kind: "mechanical", effect: "high"
      };
    }
  },
  {
    id: "type-scale-sprawl", dimension: "type", metric: "type scale size count",
    evaluate(s, r) {
      const sv = vocabularyCount(s.type.sizes);
      const rv = vocabularyCount(r.type.sizes);
      const worse = sv > 10 && sv > rv;
      return {
        subject: sv + " size" + (sv === 1 ? "" : "s"), reference: rv + " size" + (rv === 1 ? "" : "s"), worse,
        note: worse
          ? "Above roughly ten distinct sizes the scale has sprawled — and the subject exceeds the reference."
          : "Type scale is within budget.",
        mechanism: "type scale budget",
        check: "Subject's rendered size vocabulary is at most max(10, " + rv + ").",
        fix: "Collapse rendered font sizes onto the declared scale via find-and-replace.",
        kind: "mechanical", effect: "medium"
      };
    }
  },
  {
    id: "family-budget", dimension: "type", metric: "font family count",
    evaluate(s, r) {
      const sv = vocabularyCount(s.type.families);
      const rv = vocabularyCount(r.type.families);
      const budget = Math.max(rv, 2);
      const worse = sv > budget;
      return {
        subject: sv + " famil" + (sv === 1 ? "y" : "ies"), reference: rv + " famil" + (rv === 1 ? "y" : "ies"), worse,
        note: worse
          ? "Subject ships more font families than the reference's budget allows."
          : "Family budget holds.",
        mechanism: "font family budget",
        check: "Subject renders at most " + budget + " font families.",
        fix: "Choose which families stay (usually one sans plus one mono) and remove the rest.",
        kind: "needs_a_decision", effect: "medium"
      };
    }
  },
  {
    id: "radii-sprawl", dimension: "radii", metric: "radius vocabulary",
    evaluate(s, r) {
      const sv = vocabularyCount(s.radii.tally);
      const rv = vocabularyCount(r.radii.tally);
      const worse = sv > rv + 2;
      return {
        subject: sv + " rad" + (sv === 1 ? "ius" : "ii"), reference: rv + " rad" + (rv === 1 ? "ius" : "ii"), worse,
        note: worse
          ? "Subject ships more distinct radii than its system declares — corners stop agreeing with each other."
          : "Radius vocabulary is within range.",
        mechanism: "radius discipline",
        check: "Subject's radius vocabulary is within 2 of the reference's (" + rv + ").",
        fix: "Collapse radii to the declared set via find-and-replace.",
        kind: "mechanical", effect: "medium"
      };
    }
  },
  {
    id: "elevation-strategy", dimension: "elevation", metric: "shadow vs hairline grounding",
    evaluate(s, r) {
      const rShadows = r.elevation.shadows.reduce((sum, e) => sum + e.count, 0);
      const sShadows = s.elevation.shadows.reduce((sum, e) => sum + e.count, 0);
      const rInsetRatio = rShadows > 0 ? r.elevation.insetOnly / rShadows : 0;
      const sInsetRatio = sShadows > 0 ? s.elevation.insetOnly / sShadows : 0;
      const worse = rShadows > 0 && rInsetRatio >= 0.5 && sShadows >= 2 && sInsetRatio < 0.25;
      return {
        subject: sShadows + " shadows, " + s.elevation.insetOnly + " inset-only",
        reference: rShadows + " shadows, " + r.elevation.insetOnly + " inset-only",
        worse,
        note: worse
          ? "Reference grounds elements with inset hairlines; subject's drop shadows make things hover."
          : "Elevation strategies are compatible.",
        mechanism: "elevation strategy",
        check: "Subject grounds elements the way the reference does (inset hairlines over drop shadows).",
        fix: "Decide the elevation strategy: replace drop shadows with inset hairline treatment, or commit to shadows deliberately.",
        kind: "needs_a_decision", effect: "medium"
      };
    }
  },
  {
    id: "rhythm-container", dimension: "rhythm", metric: "container width",
    evaluate(s, r) {
      const sTop = s.rhythm.containers[0] ? s.rhythm.containers[0].value : "unmeasured";
      const rTop = r.rhythm.containers[0] ? r.rhythm.containers[0].value : "unmeasured";
      return {
        subject: sTop, reference: rTop,
        worse: false,
        note: "Container width is a deliberate choice, not a defect — compare and decide, never auto-flag.",
        mechanism: "content rhythm", check: "", fix: "", kind: "needs_a_decision", effect: "low"
      };
    }
  }
];

export function compareGauntletMeasurements(
  subject: GauntletMeasurement,
  reference: GauntletMeasurement
): GauntletComparison {
  const diff: GauntletDiffRow[] = [];
  const failing: RuleResult[] = [];
  const failingIds: string[] = [];

  for (const rule of RULES) {
    const res = rule.evaluate(subject, reference);
    diff.push({
      dimension: rule.dimension,
      metric: rule.metric,
      subject: res.subject,
      reference: res.reference,
      subject_worse: res.worse,
      note: res.note
    });
    if (res.worse) {
      failing.push(res);
      failingIds.push(rule.id);
    }
  }

  const ordered = failing
    .map((res, i) => ({ res, id: failingIds[i] }))
    .sort((a, b) => {
      const e = EFFECT_RANK[a.res.effect] - EFFECT_RANK[b.res.effect];
      if (e !== 0) return e;
      return (DIMENSION_RANK[diffDimension(a.id)] ?? 9) - (DIMENSION_RANK[diffDimension(b.id)] ?? 9);
    });

  // The bar is 5–7 checkable mechanisms when the gap is wide; when fewer
  // mechanisms fail, the bar is exactly those. Cap at 7 — a bar longer than
  // that stops being checkable and starts being a backlog.
  const bar: GauntletBarCheck[] = ordered.slice(0, 7).map(({ res, id }) => ({
    id,
    mechanism: res.mechanism,
    check: res.check
  }));

  const mechanical: GauntletFix[] = [];
  const needsDecision: GauntletFix[] = [];
  for (const { res } of ordered) {
    const fix: GauntletFix = { fix: res.fix, mechanism: res.mechanism, effect: res.effect };
    if (res.kind === "mechanical") mechanical.push(fix);
    else needsDecision.push(fix);
  }

  return {
    diff,
    bar,
    fixes: { mechanical, needs_a_decision: needsDecision },
    verdict: {
      on_par: failing.length === 0,
      failing_mechanisms: ordered.map(({ res }) => res.mechanism),
      biggest_gap: ordered.length > 0 ? ordered[0].res.mechanism : null
    }
  };
}

function diffDimension(ruleId: string): string {
  const rule = RULES.find((r) => r.id === ruleId);
  return rule ? rule.dimension : "rhythm";
}

// ---------------------------------------------------------------------------
// The gauntlet loop protocol embedded in every response. The tool measures;
// the loop is how a calling agent uses the measurement. Fresh-context
// critics and a binary exit are what separate a gauntlet from a review.
// ---------------------------------------------------------------------------

export const GAUNTLET_LOOP_PROTOCOL: string[] = [
  "1. BAR: the `bar` array above is the exit gate — each entry is a checkable mechanism derived from the reference's measured values, never taste.",
  "2. BUILD: fix the highest-effect failing mechanism first (fixes.mechanical are find-and-replace; fixes.needs_a_decision require a human choice — ask, never guess).",
  "3. CRITIQUE with FRESH context: after each build round, spawn critics that have NOT seen the build conversation — one against the user's brief, one against the project's design system/DESIGN.md, one against the bar using RENDERS (screenshots), never code. Blind side-by-side against the reference beats a checklist.",
  "4. VERDICT: each critic answers pass/fail per mechanism — binary, no scores. ALL critics must pass. A soft critic is a broken gauntlet.",
  "5. RE-MEASURE: re-run design_gauntlet with the same pair. The loop has NO fixed round count — it exits only when verdict.on_par is true.",
  "6. DONE means on_par: never report the work finished while verdict.on_par is false. If a mechanism cannot reach the bar, say so explicitly rather than lowering the bar silently."
];

export const GAUNTLET_DISCIPLINE_NOTICE =
  "Take the discipline, not the identity: never copy the reference's copy, marks, imagery or brand color. " +
  "The reference is a standard, not a source — where the subject's own choices are already strong, keep them. " +
  "Every number here was measured off the live DOM; anything unmeasurable is marked, never invented.";

// ---------------------------------------------------------------------------
// Browser measurement
// ---------------------------------------------------------------------------

export type GauntletMeasureOptions = {
  viewport?: { width: number; height: number };
  color_scheme?: "light" | "dark";
  device_scale_factor?: number;
  timeout_ms?: number;
};

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
// Deliberately 1, matching a plain desktop display: raising the default would
// silently move the hairline vocabulary of every existing comparison. A design
// that draws sub-pixel strokes opts IN.
const DEFAULT_DEVICE_SCALE_FACTOR = 1;
const MAX_DEVICE_SCALE_FACTOR = 4;
const DEFAULT_TIMEOUT_MS = 30000;
// A normal marketing page renders hundreds of visible elements; single digits
// means layout has not settled and every tally below would be empty-but-
// plausible (the zero-height trap). Threshold is deliberately low so dense
// minimal pages still pass — the point is catching ~0, not grading richness.
const MIN_VISIBLE_ELEMENTS = 20;

export async function measureGauntletPage(
  url: string,
  opts: GauntletMeasureOptions = {}
): Promise<GauntletMeasurement> {
  const viewport = opts.viewport || DEFAULT_VIEWPORT;
  const colorScheme = opts.color_scheme || "light";
  const timeoutMs = opts.timeout_ms || DEFAULT_TIMEOUT_MS;
  // Rejected, never clamped: a silently-corrected scale would report a hairline
  // vocabulary measured at a factor the caller did not ask for, which is the
  // exact class of quiet wrongness this dimension exists to catch.
  const dsfRaw = opts.device_scale_factor;
  if (dsfRaw !== undefined && (!Number.isFinite(dsfRaw) || dsfRaw <= 0 || dsfRaw > MAX_DEVICE_SCALE_FACTOR)) {
    throw new Error(
      "device_scale_factor must be a number in (0, " + MAX_DEVICE_SCALE_FACTOR + "] — got " + String(dsfRaw)
    );
  }
  const deviceScaleFactor = dsfRaw === undefined ? DEFAULT_DEVICE_SCALE_FACTOR : dsfRaw;
  const warnings: string[] = [];

  let browser: Awaited<ReturnType<typeof launchAuditChromium>> | null = null;
  try {
    try {
      browser = await launchAuditChromium();
    } catch {
      throw new CaptureUnavailableError(
        "Playwright chromium not available. Run: npx playwright install chromium"
      );
    }

    // viewport and deviceScaleFactor are set together at page creation:
    // setViewportSize() afterwards is a size-only call and cannot carry a
    // scale, so the factor has to ride along here or it is silently 1.
    const page = await browser.newPage({ viewport, deviceScaleFactor });
    await page.emulateMedia({ colorScheme });
    // A CLOSED shadow root is invisible to the hairline probe's own scan:
    // `host.shadowRoot` is null BY DEFINITION for `{ mode: "closed" }`, so a
    // `:host { border-top-width: 1px !important }` inside one beats an inline
    // 0.5px with nothing to count, and the probe hands back a CONFIDENT 0.5px
    // for an edge painted at 1px. That is the false-recovery direction this
    // whole feature exists to refuse. The root object is only ever reachable
    // at the moment it is created, so `attachShadow` is wrapped here and every
    // closed root is stashed for the scan to read. Running as an init script
    // is what makes the wrapper win: it is installed before any page script.
    //
    // This is a CORRECTNESS mechanism against ordinary pages, NOT a security
    // boundary. A page that deletes or replaces the stash afterwards is back
    // to the silent false recovery — the same unclosable pre-injection class
    // this repo already documents for the Grab overlay, stated here rather
    // than defended against.
    await page.addInitScript(() => {
      try {
        const proto = Element.prototype as any;
        const native = proto.attachShadow;
        if (typeof native !== "function") return;
        const stash: any[] = [];
        Object.defineProperty(window, "__ravenClosedShadowRoots", {
          value: stash, writable: false, enumerable: false, configurable: false,
        });
        proto.attachShadow = function (this: Element, init: any) {
          const root = native.call(this, init);
          try { if (init && init.mode === "closed") stash.push(root); } catch { /* ignore */ }
          return root;
        };
      } catch { /* engine without shadow DOM: nothing to wrap */ }
    });
    const mainResponse = await page.goto(url, { waitUntil: "load", timeout: timeoutMs });

    // A DECLARATIVE closed shadow root never calls Element.prototype.attachShadow
    // at all — the HTML parser runs the internal algorithm directly — so the
    // wrapper installed above cannot see it and `host.shadowRoot` is null the
    // same way. Measured: `<template shadowrootmode="closed">` carrying
    // `:host { border-top-width: 1px !important }` over an inline 0.5px paints
    // at 1px with an EMPTY stash, which is the confident false recovery the
    // wrapper exists to prevent, arriving through a door the wrapper does not
    // cover. Nothing inside the page can detect it, so it is detected from
    // OUTSIDE, in the main document's own response bytes — the one place the
    // attribute is still visible. Best effort by construction and stated as
    // such: a root injected later via setHTMLUnsafe(), or arriving in a
    // subframe or a fetched fragment, is not in these bytes and is not caught.
    // Presence alone forces the refusal because a closed root's contents cannot
    // be inspected at all — there is no way to ask whether it declares a width.
    let declarativeClosedRoots = 0;
    try {
      const body = mainResponse ? await mainResponse.text() : "";
      const hits = body.match(/shadowrootmode\s*=\s*(?:"closed"|'closed'|closed\b)/gi);
      declarativeClosedRoots = hits ? hits.length : 0;
    } catch { /* a response with no readable body: nothing to inspect */ }

    // Webfont trap: wait for fonts (bounded) so families/tracking are not the
    // fallback's. Status is reported either way.
    await page
      .evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]))
      .catch(() => undefined);

    // Lazy-load trap: scroll the full page once, then return to the top.
    // The limit is RE-READ each pass, never captured once: lazy loads append
    // content below the point the first snapshot measured, so a one-time limit
    // stops exactly where the page grows and everything appended past the
    // original height goes unmeasured (Sol P2, 2026-08-14). Bounded at 60
    // steps so an infinite-scroll feed still terminates.
    await page.evaluate(async () => {
      const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
      const limitNow = () =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      let y = 0;
      for (let steps = 0; y <= limitNow() && steps < 60; steps++, y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 600));
    });

    // Zero-height trap: the probe itself reports how many elements survived
    // its OWN visibility filter — geometry AND computed style. The guard used
    // to run a separate geometry-only count, which 30 sized opacity:0
    // elements satisfied while every tally below measured nothing (Sol P1,
    // 2026-08-14). One rule, one function: the count the guard reads is the
    // count the tallies use. Retry once after a settle wait.
    const runProbe = () =>
      page.evaluate(probeInPage, { vpW: viewport.width, vpH: viewport.height, declarativeClosedRoots });
    let raw = await runProbe();
    if (raw.visibleCount < MIN_VISIBLE_ELEMENTS) {
      await page.waitForTimeout(2500);
      raw = await runProbe();
    }
    if (raw.visibleCount < MIN_VISIBLE_ELEMENTS) {
      warnings.push(
        "Only " + raw.visibleCount + " visible elements survived the layout filter — the page may not have " +
        "finished rendering (or is canvas/WebGL, which the probe cannot see). Tallies below may be empty " +
        "for that reason rather than because the site has no borders or type."
      );
    }

    const fontsStatus = await page.evaluate(() => document.fonts.status as string);
    if (fontsStatus !== "loaded") {
      warnings.push("document.fonts.status is '" + fontsStatus + "' — families and tracking may reflect fallback fonts.");
    }

    const { visibleCount, truncated, hairlines, ...dimensions } = raw;

    // Hairline provenance. Blink rounds a non-zero border-width up to 1px in
    // the used value — getComputedStyle AND getBoundingClientRect both report
    // 1px, at EVERY device scale factor (measured 2026-08-14 at dsf 1/2/3;
    // border-RADIUS by contrast keeps 10.5px, so the limit is width-specific).
    // The probe recovers the authored width from the CSSOM. These two warnings
    // report what that recovery did and, more importantly, where it could not
    // run — an unread stylesheet means a 1px entry may still be a rounded
    // hairline, and the caller has to know which tally it is holding.
    if (hairlines.subPixelRecovered > 0) {
      warnings.push(
        "Hairlines: " + hairlines.subPixelRecovered + " sub-pixel border(s) were recovered from the authored " +
        "CSS. Computed style reports every one of them as 1px — the engine rounds sub-pixel widths up — so " +
        "this tally is finer-grained than the rendered page can show."
      );
    }
    if (hairlines.subPixelAmbiguous > 0 || hairlines.sheetsBlocked > 0 || hairlines.ruleOverflow) {
      const causes: string[] = [];
      if (hairlines.sheetsBlocked > 0) {
        causes.push(hairlines.sheetsBlocked + " cross-origin stylesheet(s) could not be read");
      }
      // A shadow rule gets its OWN cause sentence rather than riding on the
      // specificity one below. The specificity wording says the winner depends
      // on a rule this probe COLLECTED and could not rank; a shadow rule was
      // never collectable at all, because its selector is not evaluable from
      // outside its tree. Two different reasons for the same refusal, and a
      // caller reading "specificity" would go looking for a conflict that is
      // not on the page.
      if (hairlines.shadowRules > 0) {
        causes.push(hairlines.shadowRules + " shadow root(s) declare a border width this probe cannot attribute");
      }
      // Same reasoning as the shadow sentence, one door over: a nested rule
      // whose selector this probe could not turn back into a standalone
      // selector was never rankable either, and naming specificity would send
      // the caller looking for a collision that is not there.
      if (hairlines.nestingUnattributable > 0) {
        causes.push(
          hairlines.nestingUnattributable + " nested rule(s) declare a border width whose selector this probe " +
          "could not reconstruct"
        );
      }
      // A closed root the wrapper never saw, because the HTML parser created it.
      // It gets its own sentence for the same reason the two above do: the
      // reason it cannot be ranked is that it cannot be READ, not that two
      // collected rules collided.
      if (hairlines.declarativeClosedShadow > 0) {
        causes.push(
          hairlines.declarativeClosedShadow + " declarative closed shadow root(s) whose contents cannot be inspected"
        );
      }
      if (hairlines.ruleOverflow) causes.push("the authored-rule scan hit its cap");
      // These two SPLIT what used to be one sentence, and the split is the
      // fix. `subPixelAmbiguous` is the total refusal count across all eight
      // reasons; only `subPixelConflict` is a specificity conflict. Narrating
      // the total as "the winner depends on specificity" told a caller with a
      // shadow root, a blocked sheet or an animated border to go hunting for a
      // rule collision that is not on their page. The remainder gets a
      // sentence that states the refusal WITHOUT naming a mechanism it does
      // not know — the reason is usually one of the causes already listed
      // above it. Both fire when both are live; neither is skipped to keep the
      // list short, because an unlisted refusal is an unexplained number.
      // TWO CORRECTIONS LIVE IN THESE TWO SENTENCES, both from Sol round 8.
      // (a) The counter is incremented per EDGE, not per element — `hairlineFor`
      //     runs once per side and a single element can raise it four times — so
      //     "element(s)" overstated nothing but named the wrong unit, and a
      //     caller reconciling the number against a list of elements would find
      //     it did not add up.
      // (b) It said the winner "depends on specificity", and the increment site
      //     asks nothing of the kind: it fires when two MATCHED rules declare
      //     DIFFERENT widths, which includes an equal-specificity pair separated
      //     only by source order, and an `!important` pair separated by origin.
      //     Specificity is one of several tie-breaks and the probe ranks none of
      //     them. The sentence now says what the code measured.
      if (hairlines.subPixelConflict > 0) {
        causes.push(
          hairlines.subPixelConflict + " edge(s) matched more than one authored width and this probe does not " +
          "rank the cascade"
        );
      }
      const otherAmbiguous = hairlines.subPixelAmbiguous - hairlines.subPixelConflict;
      if (otherAmbiguous > 0) {
        causes.push(otherAmbiguous + " edge(s) render at 1px with an authored width this probe could not resolve");
      }
      warnings.push(
        "Hairline caveat: " + causes.join("; ") + ". A 1px entry in this tally may therefore be an authored " +
        "1px border OR a rounded sub-pixel hairline, so treat a hairline-vocabulary difference as unproven."
      );
    }
    for (const name of truncated) {
      warnings.push(
        "The " + name + " tally hit the in-page cap — vocabulary counts for that dimension may read LOW, " +
        "so a sprawl comparison against this page is conservative, never inflated."
      );
    }

    return {
      url,
      viewport: viewport.width + "x" + viewport.height,
      device_scale_factor: deviceScaleFactor,
      color_scheme: colorScheme,
      visible_elements: visibleCount,
      fonts_status: fontsStatus,
      warnings,
      ...dimensions
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

// The nine-dimension probe. Runs inside page.evaluate, so it must be fully
// self-contained — no closure over module scope.
function probeInPage({ vpW, vpH, declarativeClosedRoots }: { vpW: number; vpH: number; declarativeClosedRoots: number }) {
  type Entry = { value: string; count: number };

  const tally = (values: string[]): Entry[] => {
    const map = new Map<string, number>();
    for (const v of values) map.set(v, (map.get(v) || 0) + 1);
    // Array.from, never Array.prototype.slice.call — slice on a Map iterator
    // silently returns [] and the whole dimension reads as absent.
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  };

  const parseColor = (c: string): { r: number; g: number; b: number; a: number } | null => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };

  const toHex = (c: string): string => {
    const p = parseColor(c);
    if (!p) return c;
    if (p.a === 0) return "transparent";
    const hex = "#" + [p.r, p.g, p.b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return p.a < 1 ? hex + " @ " + p.a : hex;
  };

  const saturation = (c: string): number => {
    const p = parseColor(c);
    if (!p || p.a < 0.5) return 0;
    const max = Math.max(p.r, p.g, p.b);
    const min = Math.min(p.r, p.g, p.b);
    return max === 0 ? 0 : (max - min) / max;
  };

  // Opacity is NOT inherited: a sized child inside an opacity:0 ancestor
  // reports its own computed opacity as "1" while rendering nothing, so an
  // own-opacity check alone lets whole invisible subtrees inflate
  // visible_elements and every tally (Sol R2 P1, 2026-08-14). display:none
  // subtrees are caught by geometry (zero rect) and visibility IS an
  // inherited property (and a visibility:visible child of a hidden parent
  // genuinely renders, so inheriting is the CORRECT answer there) — opacity
  // is the one ancestor leak. Verdicts are memoized so the walk is O(n):
  // querySelectorAll returns document order, so a parent's verdict is always
  // cached before its children ask.
  const opacityHidden = new Map<Element, boolean>();
  const hiddenByOpacity = (el: Element): boolean => {
    const cached = opacityHidden.get(el);
    if (cached !== undefined) return cached;
    const parent = el.parentElement;
    const verdict =
      getComputedStyle(el).opacity === "0" ||
      (parent !== null && hiddenByOpacity(parent));
    opacityHidden.set(el, verdict);
    return verdict;
  };

  const els = Array.from(document.querySelectorAll("body *"));
  const visible = els.filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && !hiddenByOpacity(el);
  });

  // Surfaces
  const canvas = toHex(getComputedStyle(document.body).backgroundColor);
  const surfaceValues: string[] = [];
  for (const el of visible) {
    const bg = toHex(getComputedStyle(el).backgroundColor);
    if (bg !== "transparent") surfaceValues.push(bg);
  }

  // Hairlines
  //
  // Blink rounds any non-zero border-width UP to 1px in the used value, so
  // getComputedStyle reports a 0.5px hairline as 1px at every device scale
  // factor (measured 2026-08-14 at dsf 1/2/3; getBoundingClientRect agrees).
  // The authored value survives only in the CSSOM, so sub-pixel strokes are
  // recovered from there — inline style first, then matching stylesheet rules —
  // and every case that cannot be resolved is COUNTED rather than guessed, so
  // the caller is told the tally is provisional instead of being handed a
  // confident 1px. All four edges are read, not just the top: a border can be
  // authored on any single side (a bottom-only divider is the common case),
  // and each side rounds to 1px independently under the same Blink behavior.
  // The cap counts ENTRIES, and reading four edges means one rule can now
  // contribute four of them — so the 300 that bounded 300 rules would bound 75.
  // Raised to 4x to hold the per-rule reach exactly where it was. Hitting it is
  // not a quiet loss: the cap can stop MID-RULE, so the collected set past that
  // point is not a prefix of the cascade and no value drawn from it can be
  // trusted. `ruleOverflow` therefore turns OFF stylesheet-derived recovery
  // entirely rather than narrowing it — every 1px edge reads as unresolvable,
  // which is a legible "this probe stopped looking" and never a confident
  // wrong hairline.
  const AUTHORED_RULE_CAP = 1200;
  let sheetsBlocked = 0;
  let ruleOverflow = false;
  // Hosts whose shadow root declares a border width. See the scan below for
  // why this counts rather than collects.
  let shadowBorderRules = 0;
  type Side = "Top" | "Right" | "Bottom" | "Left";
  const SIDES: Side[] = ["Top", "Right", "Bottom", "Left"];
  // Rules declaring a LOGICAL border width, which no physical read can see.
  // Measured on Chromium: `border-inline-start-width: 1px` leaves
  // style.borderLeftWidth === "" and enumerates only the logical longhand, while
  // the engine PAINTS left: 1px. So the physical-longhand reads below are blind
  // to it in both directions — a document `!important` logical rule outranked an
  // inline `border-left: 0.5px` invisibly, and the fast path recovered 0.5px for
  // an edge rendering at 1px. Confirmed independently by two adverse legs.
  //
  // The detection is a four-name SET rather than a shorthand parser because the
  // CSSOM expands every logical authoring form to these longhands — measured:
  // `border-block: 1px solid` enumerates border-block-{start,end}-{width,style,
  // color}, `border-block-start: 1px solid` the start triple, and neither leaves
  // an unexpanded shorthand behind. Enumeration is read rather than named
  // properties so an engine storing a form this list does not name still trips
  // the generic prefix test.
  const LOGICAL_WIDTHS = [
    "border-block-start-width", "border-block-end-width",
    "border-inline-start-width", "border-inline-end-width",
  ];
  const declaresLogicalWidth = (style: any): boolean => {
    if (!style) return false;
    try {
      for (const name of Array.from(style) as string[]) {
        const n = String(name).toLowerCase();
        if (LOGICAL_WIDTHS.indexOf(n) !== -1) return true;
        // A form the list does not name (an unexpanded logical shorthand on
        // some other engine) still has to refuse: it is the direction that
        // costs a recovery rather than inventing one.
        if (/^border-(block|inline)(-(start|end))?$/.test(n)) return true;
      }
    } catch { /* a shimmed declaration may not be iterable: fall through */ }
    return false;
  };
  const authoredRules: { selector: string; side: Side; width: number; important: boolean }[] = [];
  // A width the CSSOM hands back unresolved — var(), calc(), env() — parses to
  // NaN and is NOT a value this probe can compare. Dropping it silently is the
  // false-recovery direction, and it is the likeliest real case there is: a
  // tokenised `--hairline: .5px` renders at 1px, matches no collected rule, and
  // the report calls that a confident 1px. Recorded instead, so a matching
  // element is declared unresolved rather than answered.
  const unresolvedRules: { selector: string; side: Side; important: boolean }[] = [];

  // A border-width is comparable to a computed px reading only when it IS a px
  // length. `parseFloat` reads "0.5em" as 0.5, so an edge authored `.5em` at a
  // 2px font-size — which renders, and computes, at 1px — was reported as a
  // recovered 0.5px hairline: a confident wrong number, the one outcome this
  // whole probe exists to avoid. Keywords are engine-defined integers and can
  // never be the sub-pixel case, so they are DROPPED rather than flagged;
  // every other non-px form is UNRESOLVED, because "not a px length" and "not
  // authored at all" are different answers and only one of them is safe.
  const pxLength = (raw: string): number | "keyword" | "unresolved" => {
    const t = String(raw).trim();
    if (/^(thin|medium|thick)$/i.test(t)) return "keyword";
    // A bare 0 is the one unitless length CSS accepts here.
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(t)) return parseFloat(t) === 0 ? 0 : "unresolved";
    const m = /^([+-]?(?:\d+\.?\d*|\.\d+))px$/i.exec(t);
    return m ? parseFloat(m[1]) : "unresolved";
  };

  // `unevaluable` marks a subtree whose enclosing condition this probe could not
  // decide (an @container query today). Its widths are recorded as UNRESOLVED
  // rather than authored, so they can force an honest ambiguity but can never
  // be handed back as a recovered answer.
  // Does any rule in this tree declare a border width? Recursive, because a
  // shadow sheet can nest its declaration inside @media/@layer/@supports just
  // like any other. It asks only WHETHER, never how much: the value cannot be
  // attributed to an element from outside the shadow tree, so the only thing
  // worth knowing is that one exists.
  const declaresBorderWidth = (rules: CSSRuleList): boolean => {
    for (const rule of Array.from(rules) as any[]) {
      if (rule.style && SIDES.some((side) => rule.style["border" + side + "Width"])) return true;
      // A shadow rule declaring a LOGICAL width is exactly as unattributable as
      // a physical one, and this predicate only ever asks WHETHER.
      if (rule.style && declaresLogicalWidth(rule.style)) return true;
      if (rule.styleSheet) {
        // A cross-origin shadow import is unreadable, and unreadable is
        // treated as "might declare one" — the refusing direction.
        try { if (declaresBorderWidth(rule.styleSheet.cssRules)) return true; } catch { return true; }
        continue;
      }
      if (rule.cssRules) {
        try { if (declaresBorderWidth(rule.cssRules)) return true; } catch { return true; }
      }
    }
    return false;
  };
  // A nested rule this probe could not turn back into a standalone selector.
  // Counted rather than collected, and it forces a document-wide refusal for the
  // same reason a shadow rule does: an unattributable `!important` width could
  // win on any edge, so there is no element it is safe to answer for.
  let nestingUnattributable = 0;
  // Is this a selector the engine can parse at all? `CSS.supports("selector()")`
  // asks the parser directly and costs a parse rather than a DOM walk, which
  // matters because the check runs per nested rule up to the rule cap. A false
  // answer is a refusal, never a drop: `el.matches` swallows a bad selector in a
  // catch downstream, and a silently skipped `!important` rule is the
  // false-recovery direction.
  const selectorParses = (sel: string): boolean => {
    try {
      if (typeof CSS !== "undefined" && (CSS as any).supports) {
        const ok = (CSS as any).supports("selector(" + sel + ")");
        if (typeof ok === "boolean") return ok;
      }
    } catch { /* engine without selector(): fall through to the DOM test */ }
    try { document.createElement("div").matches(sel); return true; } catch { return false; }
  };
  // CSS NESTING STORES A SELECTOR THAT CANNOT BE TESTED STANDALONE. Chromium
  // serializes every nested rule `&`-prefixed, and a standalone `&` behaves as
  // `:scope`, which in Element.matches() is the element itself. Measured, that
  // splits into two opposite wrong answers:
  //   `.card { .row { 1px !important } }`  -> stored `& .row`, matches() FALSE
  //       on a row that the rule really styles => silent MISS, inline recovered
  //       over a 1px edge.
  //   `.absent { &.row { .25px !important } }` -> stored `&.row`, matches() TRUE
  //       on a row the rule does NOT style => FALSE MATCH, recovering a width
  //       that appears nowhere on the render.
  // The fix reconstructs the real selector by substituting the parent, and
  // `:is()` is load-bearing rather than cosmetic: a parent selector LIST pasted
  // raw (`.a, .b` -> `.a, .b .row`) regroups the selector, and `:is()` also
  // carries the parent's specificity the way `&` does. Measured correct in four
  // arms — applies, orphan, parent list, two-deep.
  //
  // Both guards below refuse rather than substitute, and each was measured:
  //   - a quote in the child selector means the `&` may live inside an attribute
  //     value (`& [title="a&b"]`), where substitution corrupts the value;
  //   - `::` in the parent means the resolved selector carries a pseudo-element
  //     inside `:is()`, which measured as matches() returning FALSE WITHOUT
  //     THROWING — a silent unmatchable rule, the false-recovery direction, so
  //     the guard cannot wait for a throw.
  const resolveNested = (authored: string, parent: string): string | null => {
    if (authored.indexOf('"') !== -1 || authored.indexOf("'") !== -1) return null;
    if (parent.indexOf("::") !== -1) return null;
    const resolved = authored.indexOf("&") === -1
      // A nested selector with no `&` is implicitly parent-descendant. Chromium
      // always writes the `&`, so this arm is defensive rather than exercised.
      ? ":is(" + parent + ") " + authored
      : authored.replace(/&/g, ":is(" + parent + ")");
    return selectorParses(resolved) ? resolved : null;
  };
  const collectRules = (rules: CSSRuleList, unevaluable = false, parentSelector: string | null = null): void => {
    for (const rule of Array.from(rules) as any[]) {
      // Both collections are bounded by the ONE cap — they are two halves of the
      // same scan, and counting only one of them lets the other grow unbounded.
      if (authoredRules.length + unresolvedRules.length >= AUTHORED_RULE_CAP) { ruleOverflow = true; return; }
      // Collect BEFORE recursing, and never treat "has cssRules" as "is a group".
      // CSS nesting gave CSSStyleRule its own .cssRules, so a group-first check
      // skips every plain style rule on a modern engine and the whole recovery
      // silently reads empty (measured: the stylesheet fixture stayed at 1px).
      // The selector this rule can be TESTED by, which is its own selectorText
      // only at the top level. Computed once and reused for the nested recursion
      // below, so a two-deep rule resolves against its already-resolved parent.
      let ownSelector: string | null = null;
      if (rule.selectorText) {
        ownSelector = parentSelector === null
          ? rule.selectorText
          : resolveNested(rule.selectorText, parentSelector);
      }
      if (rule.selectorText && rule.style && ownSelector === null) {
        // Unattributable: refuse document-wide rather than drop. Recorded once
        // per rule, not per side — the rule is what could not be placed.
        nestingUnattributable++;
      }
      if (rule.selectorText && rule.style && ownSelector !== null) {
        // A LOGICAL width cannot be mapped to a physical side from here: the
        // mapping depends on the matched element's writing-mode and direction,
        // which this rule-level scan is not looking at. So it is recorded as
        // unresolved on ALL FOUR sides — the rule really could be governing any
        // one of them, and naming the wrong side would be a confident wrong
        // attribution rather than an honest ambiguity.
        if (declaresLogicalWidth(rule.style)) {
          for (const side of SIDES) {
            if (authoredRules.length + unresolvedRules.length >= AUTHORED_RULE_CAP) { ruleOverflow = true; break; }
            let important = false;
            try {
              important = LOGICAL_WIDTHS.some((p) => rule.style.getPropertyPriority(p) === "important");
            } catch { /* a shimmed declaration may not implement it: assume not */ }
            unresolvedRules.push({ selector: ownSelector, side, important });
          }
        }
        // Populated by the `border` shorthand too — the CSSOM expands it.
        for (const side of SIDES) {
          if (authoredRules.length + unresolvedRules.length >= AUTHORED_RULE_CAP) { ruleOverflow = true; break; }
          const w = rule.style["border" + side + "Width"];
          if (!w) continue;
          // `!important` is recorded because it is the one thing that beats an
          // inline declaration, and the inline fast path below is trustworthy
          // only in its absence.
          let important = false;
          try { important = rule.style.getPropertyPriority("border-" + side.toLowerCase() + "-width") === "important"; }
          catch { /* a shimmed declaration may not implement it: assume not */ }
          const n = pxLength(w);
          // Keywords are engine-defined integers, never the sub-pixel case this
          // recovers, so they are dropped. Anything else that is not a px length
          // is an unresolved expression and is recorded as one.
          if (typeof n === "number" && !unevaluable) authoredRules.push({ selector: ownSelector, side, width: n, important });
          // A keyword stays DROPPED even under an unevaluable condition: it is
          // an engine-defined integer and can never be the sub-pixel case, so
          // demoting it would manufacture ambiguity out of nothing.
          else if (n === "unresolved" || (unevaluable && typeof n === "number")) unresolvedRules.push({ selector: ownSelector, side, important });
        }
      }
      // @import is a THIRD rule source and it is reached through a different
      // property: CSSOM gives CSSImportRule no `cssRules` at all, exposing the
      // imported sheet as `rule.styleSheet` instead, so the recursion below
      // never saw one — while the cascade places an imported sheet's rules as
      // though substituted at the @import. An imported `!important` width
      // therefore outranked the inline declaration invisibly and the inline
      // fast path confidently recovered a 0.5px edge rendering at 1px: the
      // adopted-stylesheet defect again, through a third door. A cross-origin
      // import throws on .cssRules exactly like a cross-origin <link> and is
      // counted the same way, which is what makes it stop every recovery.
      if (rule.styleSheet) {
        if (rule.media && rule.media.mediaText) {
          try { if (!matchMedia(rule.media.mediaText).matches) continue; } catch { /* unparsable: fall through */ }
        }
        try { collectRules(rule.styleSheet.cssRules, unevaluable); } catch { sheetsBlocked++; }
        continue;
      }
      // @media / @supports / @container / @layer carry nested rules, as does a
      // nesting style rule. A block that does not currently apply is skipped:
      // its widths are not on this render.
      if (rule.cssRules) {
        // Discriminate by rule TYPE, never by shape. The previous check asked
        // for `rule.media && rule.conditionText`, and CSSSupportsRule has
        // conditionText and NO media — so every @supports branch was recursed
        // into as though active, false ones included. A shape test also cannot
        // separate @supports from @container: `CSS.supports("(min-width:400px)")`
        // answers TRUE about a DECLARATION while the identical text is a
        // container query about a box.
        const isSupports = typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule;
        const isContainer = typeof (window as any).CSSContainerRule !== "undefined" && rule instanceof (window as any).CSSContainerRule;
        if (isSupports) {
          // Only the engine can evaluate a supports condition; this probe
          // cannot parse one, and a condition it cannot decide must not CLAIM
          // the block applies.
          let applies: boolean | null = null;
          try { applies = CSS.supports(rule.conditionText); } catch { applies = null; }
          if (applies === false) continue;
          // A conditional group can itself be NESTED inside a style rule, so the
          // parent selector travels through it unchanged — dropping it here
          // would make `.card { @supports(...) { .row { … } } }` read as a
          // top-level `& .row` again, which is the defect one layer in.
          collectRules(rule.cssRules, unevaluable || applies === null, parentSelector);
          continue;
        }
        if (isContainer) {
          // A container query's answer depends on a box this probe is not
          // looking at, so it is UNEVALUABLE rather than false — recorded as
          // unresolved, which degrades to a stated ambiguity and never to a
          // recovery.
          collectRules(rule.cssRules, true, parentSelector);
          continue;
        }
        // A NESTING style rule is not a conditional group at all: CSS nesting
        // gave CSSStyleRule its own .cssRules, it was already collected above,
        // and its nested rules apply exactly as authored.
        const isNesting = !!rule.selectorText;
        const isMedia = typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule;
        // @layer changes PRIORITY, never applicability — every rule inside one
        // is on this render — so it recurses as authored.
        const isLayer = typeof (window as any).CSSLayerBlockRule !== "undefined"
          && rule instanceof (window as any).CSSLayerBlockRule;
        if (!isNesting && !isMedia && !isLayer) {
          // AN UNKNOWN CONDITIONAL GROUP IS UNEVALUABLE, NOT ACTIVE. This used
          // to fall through to the plain recursion below, and the comment above
          // called that "a false ambiguity: a known, bounded residual in the
          // honest direction" — which was exactly backwards. The fallthrough
          // recursed with `unevaluable` unchanged, i.e. as AUTHORED, so the
          // rules of a group that does not apply were handed back as a
          // confident recovery. `@scope (.absent) { .row { border-top-width:
          // .25px } }` is the counterexample: the scope condition is dropped
          // here and only `r.selector` is ever tested with el.matches(), so
          // .25px is recovered for an edge that renders at 1px. Same defect for
          // @starting-style. Discriminating by TYPE means the platform's NEXT
          // conditional at-rule degrades to a stated ambiguity by default
          // rather than to a wrong answer — the direction this probe is
          // required to fail in. Widen this list only for a group whose rules
          // genuinely always apply.
          collectRules(rule.cssRules, true, parentSelector);
          continue;
        }
        if (isMedia && rule.conditionText) {
          try { if (!matchMedia(rule.conditionText).matches) continue; } catch { /* unparsable: fall through */ }
        }
        // A NESTING rule becomes the parent for everything inside it; @media and
        // @layer are not style rules and introduce no new parent, so they pass
        // the one they were handed straight through. When the nesting rule's own
        // selector could NOT be reconstructed, the subtree is skipped rather than
        // recursed with a null parent — recursing would make every descendant
        // read as top-level `&`, which is the false-match direction. Skipping
        // costs nothing, because the increment above has already forced the
        // document-wide refusal.
        if (isNesting && ownSelector === null) continue;
        collectRules(rule.cssRules, unevaluable, isNesting ? ownSelector : parentSelector);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    // A cross-origin sheet throws on .cssRules. Counted, never swallowed.
    try { collectRules(sheet.cssRules); } catch { sheetsBlocked++; }
  }
  // `document.adoptedStyleSheets` is a SEPARATE collection from
  // `document.styleSheets` — CSSOM defines constructed sheets outside the
  // stylesheet list while the cascade includes both. Scanning only the latter
  // meant an adopted `!important` rule was invisible, so the inline fast path
  // below saw no conflict and confidently recovered a 0.5px edge that renders
  // at 1px: a false RECOVERY, the one outcome this probe exists to avoid.
  // Constructed sheets are same-origin by construction, so the catch here is
  // for a shimmed or exotic object, not for the cross-origin case.
  try {
    for (const sheet of Array.from((document as any).adoptedStyleSheets || [])) {
      try { collectRules((sheet as CSSStyleSheet).cssRules); } catch { sheetsBlocked++; }
    }
  } catch { /* engine without adoptedStyleSheets: nothing to add */ }
  // A SHADOW ROOT IS A FOURTH RULE SOURCE, and both loops above read
  // `document`. CSSOM gives every DocumentOrShadowRoot its OWN `styleSheets`
  // and `adoptedStyleSheets`, so a shadow sheet is in neither collection —
  // while `:host` explicitly matches the host element, which IS measured
  // (`querySelectorAll("body *")` returns hosts; it just does not descend into
  // them). So `:host { border-top-width: 1px !important }` beat an inline
  // 0.5px invisibly and the inline fast path recovered 0.5px for an edge
  // rendering at 1px: the adopted-stylesheet defect through a FOURTH door.
  //
  // THAT EXAMPLE IS ONE INSTANCE AND THE GATE'S REACH IS WIDER (GLM R7c P3-3,
  // 2026-08-17). The `!important` in it is doing real work -- a plain `:host`
  // rule cannot outrank an inline declaration, so it is what the OVERRIDE case
  // requires -- but reading the justification as "only `!important` matters"
  // is too narrow in the direction that costs a wrong answer. With NOTHING
  // declared on the element or in any document sheet, an ordinary
  // `:host { border-top-width: 0.5px }` decides that edge outright: the scan
  // above finds no authored sub-pixel width anywhere it can see, so the probe
  // reports the edge as settled rather than refusing it. No importance is
  // involved and no inline declaration is being beaten -- the shadow rule is
  // simply the only declaration there is. Both shapes land in the same
  // false-recovery direction, which is why the gate is a page-wide refusal
  // rather than an importance test.
  //
  // These rules are COUNTED rather than collected, and that is deliberate. A
  // shadow rule's selector is not evaluable from outside its tree — `:host`
  // and `::slotted()` are meaningless to `el.matches()` on the host, which
  // answers false (or throws) and would silently drop the very rule that wins.
  // Recording them as authored would be a false recovery and recording them as
  // unresolved against an unmatchable selector would be no record at all, so
  // the honest answer is the one `sheetsBlocked` already uses: refuse every
  // recovery document-wide. The count is gated on a border-width declaration
  // actually being present, so an ordinary shadow-DOM page with no hairline
  // rules is unaffected — a page-wide refusal fires only where a shadow rule
  // could really change a border.
  try {
    const measured = new Set(els);
    const roots: any[] = [];
    for (const host of els) {
      const open = (host as any).shadowRoot;
      if (open) roots.push(open);
    }
    // Closed roots come from the `attachShadow` wrapper installed as an init
    // script before any page script ran. `host.shadowRoot` answers null for
    // every one of them, so this stash is the ONLY way they are seen at all.
    // Membership in `measured` is re-checked rather than assumed, so the
    // closed path refuses exactly what the open path above refuses — a stash
    // entry whose host is not measured (detached, or outside `body *`) cannot
    // change any border this tally reports, and counting it would be a
    // page-wide refusal bought for nothing.
    const closed = (window as any).__ravenClosedShadowRoots;
    if (closed && typeof closed.length === "number") {
      for (const root of Array.from(closed) as any[]) {
        if (root && root.host && measured.has(root.host)) roots.push(root);
      }
    }
    for (const root of roots) {
      const shadowSheets = [
        ...Array.from(root.styleSheets || []),
        ...Array.from(root.adoptedStyleSheets || []),
      ] as CSSStyleSheet[];
      for (const sheet of shadowSheets) {
        try {
          if (declaresBorderWidth(sheet.cssRules)) { shadowBorderRules++; break; }
        } catch { shadowBorderRules++; break; }
      }
    }
  } catch { /* engine without shadow DOM: nothing to add */ }

  let subPixelRecovered = 0;
  let subPixelAmbiguous = 0;
  // `subPixelAmbiguous` counts every 1px edge this probe refused, and it is
  // refused for EIGHT different reasons — a blocked sheet, a shadow rule, an
  // overflowed scan, an active animation, an unreadable inline expression, an
  // `!important` rule outranking an inline declaration, a matched rule whose
  // own width would not parse, and a genuine specificity conflict. Only the
  // LAST of those is what "the winner depends on specificity" describes, so
  // the caveat cannot narrate that count as a specificity conflict without
  // being wrong seven ways out of eight. This counter is incremented at the
  // one site that IS one, and the caveat says "specificity" only about it.
  let subPixelConflict = 0;

  // Is this side's border-width under an active animation or transition? The
  // property name is read from the effect's own keyframes (camelCase keys, per
  // the Web Animations `getKeyframes` contract) and from a transition's
  // `transitionProperty`, so a `border-radius` animation on the same element
  // does not poison a hairline reading — the per-side discipline the rest of
  // this probe already keeps. Anything unreadable answers TRUE, because the
  // question being asked is "can I trust the cascade here", and a probe that
  // cannot see the animation list cannot answer it.
  const animatedSide = (el: Element, side: Side): boolean => {
    const prop = "border" + side + "Width";
    const hyphen = "border-" + side.toLowerCase() + "-width";
    let anims: any[];
    try {
      if (typeof (el as any).getAnimations !== "function") return true;
      anims = (el as any).getAnimations({ subtree: false }) || [];
    } catch { return true; }
    for (const a of anims) {
      try {
        // An idle animation contributes nothing. FINISHED does not mean gone:
        // `animation-fill-mode: forwards|both` keeps applying the final
        // keyframe value after the animation ends, and an animation-origin
        // value outranks EVERY normal author declaration, inline included — so
        // skipping on `finished` handed back a confident 0.5px for an edge the
        // engine paints at 1px. A finished animation is skippable only when its
        // resolved fill cannot reach past the end (`none` or `backwards`); a
        // fill this probe cannot read falls through and refuses, like every
        // other unreadable thing here. Falling THROUGH rather than returning
        // true keeps the per-property discipline: a finished forwards animation
        // on border-radius still must not poison a border-width reading.
        const state = a.playState;
        if (state === "idle") continue;
        if (state === "finished") {
          let fill: string | null = null;
          try {
            const t = a.effect && typeof a.effect.getComputedTiming === "function" ? a.effect.getComputedTiming() : null;
            fill = t && typeof t.fill === "string" ? t.fill : null;
          } catch { fill = null; }
          if (fill === "none" || fill === "backwards") continue;
        }
        if (a.transitionProperty) {
          if (a.transitionProperty === hyphen || a.transitionProperty === "all") return true;
          continue;
        }
        const frames = a.effect && typeof a.effect.getKeyframes === "function" ? a.effect.getKeyframes() : null;
        if (!frames) return true;
        for (const f of frames) if (Object.prototype.hasOwnProperty.call(f, prop)) return true;
      } catch { return true; }
    }
    return false;
  };

  // Returns the authored sub-pixel width for ONE side; "unresolved" when this
  // probe cannot answer and must SAY so; null when nothing authored matched,
  // which the caller may still qualify. Specificity is deliberately not
  // resolved, so any disagreement among matching rules is unresolved rather
  // than guessed. Rules for other sides are ignored entirely.
  const authoredSubPixel = (el: Element, side: Side): number | "unresolved" | null => {
    // BOTH gates sit ahead of the inline read, and that ordering IS the fix.
    // Inline style does not win the cascade outright — a stylesheet declaration
    // marked `!important` beats it — so an inline 0.5px is only trustworthy
    // once the whole cascade has been read. A blocked sheet or an overflowed
    // scan means it has not been, and neither can be narrowed to "stylesheet-
    // derived values only" while an unread `!important` can still override the
    // element's own style attribute.
    //
    // An unreadable cross-origin sheet may carry the rule that actually wins.
    // Recovering 0.5px from the sheets that DID parse hands the caller a number
    // for an edge whose real authored width is unknown; the caller already
    // counts every unrecovered 1px edge as ambiguous when sheetsBlocked > 0, so
    // this only stops the recovered ones from being the exception.
    if (sheetsBlocked > 0) return "unresolved";
    // A shadow rule this scan could not attribute may be the one that wins on
    // this very edge, and it can only be an unread `!important` away from
    // beating the inline declaration below. Same reasoning as the line above,
    // one rule source over.
    if (shadowBorderRules > 0) return "unresolved";
    // A nested rule whose selector could not be reconstructed is unattributable
    // in exactly the same way: it may carry an `!important` width that wins on
    // this edge, and there is no element it is safe to answer for. Same
    // reasoning as the two lines above, one rule source over.
    if (nestingUnattributable > 0) return "unresolved";
    // A declarative closed shadow root, detected from the response bytes rather
    // than from inside the page. Its contents cannot be read at ALL — not even
    // to ask whether they declare a width — so presence is the whole signal and
    // the refusal is document-wide.
    if (declarativeClosedRoots > 0) return "unresolved";
    // An overflowed scan is not a partial answer, it is an untrustworthy one.
    // The cap can stop MID-RULE, so a later rule's 1px on this side can be
    // missing while an earlier rule's 0.5px on the same side was kept — and the
    // retained value then reads as a confident recovery of an edge that really
    // renders at 1px. A false RECOVERY is worse than a false ambiguity, so past
    // the cap nothing is trusted for any element. That is also what makes SIDES
    // order unobservable here: with recovery off past the cap, which sides of a
    // truncated rule survived cannot change an answer.
    if (ruleOverflow) return "unresolved";
    // An animation or transition declaration outranks EVERY normal author
    // declaration — inline style included — and its value lives in no rule this
    // scan collects, so a side under active animation cannot be answered from
    // the collected rules at all. That is why this gate sits ahead of BOTH
    // doors rather than inside the inline branch: the stylesheet path is wrong
    // for the same reason the inline path is. An engine with no
    // `getAnimations` cannot be asked, and "cannot be asked" is unresolved on
    // this probe's own rule — a false ambiguity is the survivable direction.
    if (animatedSide(el, side)) return "unresolved";
    // Does any `!important` rule for THIS side match? That is the only thing
    // that can outrank the element's own style attribute.
    let importantConflict = false;
    for (const r of authoredRules) {
      if (r.side !== side || !r.important) continue;
      try { if (el.matches(r.selector)) { importantConflict = true; break; } } catch { /* exotic selector */ }
    }
    if (!importantConflict) for (const r of unresolvedRules) {
      if (r.side !== side || !r.important) continue;
      try { if (el.matches(r.selector)) { importantConflict = true; break; } } catch { /* exotic selector */ }
    }
    // THE THIRD LOGICAL-PROPERTY DOOR, and the only one on the element itself.
    // Measured on Chromium: an inline `border-inline-start-width: 0.5px` leaves
    // style.borderTopWidth/borderLeftWidth EMPTY and enumerates only the logical
    // longhand, while the engine paints the left edge. So the physical read
    // below sees nothing at all, falls through to the stylesheet scan, and can
    // answer confidently for an edge whose real authored width is sitting on the
    // element unread. Refusing is the only honest answer available here: mapping
    // a logical side to a physical one needs the element's writing-mode and
    // direction, and even resolved it would still have to be reconciled with
    // whatever the physical longhand says.
    if ((el as HTMLElement).style && declaresLogicalWidth((el as HTMLElement).style)) return "unresolved";
    const inline = (el as HTMLElement).style && ((el as HTMLElement).style as any)["border" + side + "Width"];
    if (inline && !importantConflict) {
      // With no important rule in play the inline declaration DOES win, so it
      // decides this side outright and the stylesheet scan below is skipped —
      // including when it is a keyword (an engine integer, never sub-pixel) or
      // an expression this probe cannot read. Falling through on an unreadable
      // inline `var(--hairline)` is the false-recovery direction: it would let
      // a losing stylesheet rule answer for the edge, or report a confident
      // 1px for the likeliest tokenised hairline there is.
      const n = pxLength(inline);
      if (typeof n === "number") return n > 0 && n < 1 ? n : null;
      return n === "unresolved" ? "unresolved" : null;
    }
    // An inline declaration that an `!important` rule outranks is a cascade
    // this probe does not resolve. With NO inline declaration, importance
    // changes nothing: the agreement test below already refuses any matched set
    // that disagrees, and where every matched rule agrees the winner carries
    // that same width whatever its priority. So the refusal is scoped to the
    // one case where importance can change the answer.
    if (inline && importantConflict) return "unresolved";
    const matched: number[] = [];
    for (const r of authoredRules) {
      if (r.side !== side) continue;
      try { if (el.matches(r.selector)) matched.push(r.width); } catch { /* exotic selector */ }
    }
    for (const r of unresolvedRules) {
      if (r.side !== side) continue;
      try { if (el.matches(r.selector)) return "unresolved"; } catch { /* exotic selector */ }
    }
    if (matched.length === 0) return null;
    // "Last wins" is a SOURCE-ORDER proxy while the cascade is decided by
    // specificity, so it is only safe where every matching rule agrees. Any
    // disagreement — .25 against .5 just as much as .5 against 2 — is a value
    // this probe cannot resolve without implementing the cascade. The previous
    // rule tested only the mixed sub-pixel/full-pixel case, so two conflicting
    // SUB-PIXEL declarations were silently answered with whichever happened to
    // come last in the sheet.
    // The ONE genuine specificity conflict: two or more rules matched this
    // side with DIFFERENT widths, so the winner is decided by a cascade this
    // probe does not implement. Counted separately because it is the only
    // refusal the caveat's "winner depends on specificity" wording describes.
    if (new Set(matched).size > 1) { subPixelConflict++; return "unresolved"; }
    const only = matched[0];
    return only > 0 && only < 1 ? only : null;
  };

  const borderValues: string[] = [];
  for (const el of visible) {
    const s = getComputedStyle(el);
    // Distinct "width color" treatments per element, deduped so a uniform
    // 4-side border contributes ONE vocabulary entry (not four) and a box
    // ruled on a single side still contributes exactly one. This keeps the
    // tally a count of border TREATMENTS, which is what the 90%-coverage
    // calculation is meant to measure — undeduped, every uniform box would
    // quadruple its own weight against boxes with a border on only one edge.
    const elTreatments = new Set<string>();
    for (const side of SIDES) {
      const styleProp = s["border" + side + "Style" as "borderTopStyle"];
      const widthProp = s["border" + side + "Width" as "borderTopWidth"];
      const colorProp = s["border" + side + "Color" as "borderTopColor"];
      if (styleProp !== "none" && parseFloat(widthProp) > 0) {
        let width = widthProp;
        // 1px is the ONLY ambiguous reading — it is what every sub-pixel width
        // rounds to. Anything else is already the authored value.
        if (width === "1px") {
          const authored = authoredSubPixel(el, side);
          // `ruleOverflow` is NOT re-tested here: it now returns "unresolved"
          // from inside, so testing it again would count the same edge twice.
          if (typeof authored === "number") { width = authored + "px"; subPixelRecovered++; }
          else if (authored === "unresolved" || sheetsBlocked > 0) subPixelAmbiguous++;
        }
        elTreatments.add(width + " " + toHex(colorProp));
      }
    }
    for (const treatment of elTreatments) borderValues.push(treatment);
  }

  // Text roles + tracking + type scale (elements with direct text)
  const hasDirectText = (el: Element): boolean => {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3 && (node.textContent || "").trim().length > 0) return true;
    }
    return false;
  };
  const textColors: string[] = [];
  const displayTracking: string[] = [];
  const bodyTracking: string[] = [];
  const sizes: string[] = [];
  const weights: string[] = [];
  const families: string[] = [];
  const formatTracking = (spacing: string, fontSize: number): string => {
    if (spacing === "normal") return "normal (0em)";
    const px = parseFloat(spacing);
    if (!Number.isFinite(px)) return "normal (0em)";
    const em = fontSize > 0 ? px / fontSize : 0;
    return px + "px = " + (Math.round(em * 1000) / 1000) + "em";
  };
  for (const el of visible) {
    if (!hasDirectText(el)) continue;
    const s = getComputedStyle(el);
    textColors.push(toHex(s.color));
    const fontSize = parseFloat(s.fontSize);
    sizes.push(s.fontSize);
    weights.push(s.fontWeight);
    const family = (s.fontFamily.split(",")[0] || "").trim().replace(/^["']|["']$/g, "");
    if (family) families.push(family);
    if (fontSize >= 32 && fontSize <= 200) displayTracking.push(formatTracking(s.letterSpacing, fontSize));
    else if (fontSize >= 13 && fontSize <= 20) bodyTracking.push(formatTracking(s.letterSpacing, fontSize));
  }

  // Accent
  const accentValues: string[] = [];
  let accentFirstViewport = 0;
  for (const el of visible) {
    const s = getComputedStyle(el);
    const candidates = [s.backgroundColor, s.color, s.borderTopColor];
    let saturated = false;
    for (const c of candidates) {
      if (saturation(c) > 0.45) {
        accentValues.push(toHex(c));
        saturated = true;
      }
    }
    if (saturated) {
      const r = el.getBoundingClientRect();
      if (r.top < vpH && r.bottom > 0 && r.left < vpW && r.right > 0) accentFirstViewport++;
    }
  }

  // Radii
  const radiusValues: string[] = [];
  for (const el of visible) {
    const radius = getComputedStyle(el).borderRadius;
    if (radius && radius !== "0px") {
      const first = radius.split(" ")[0];
      radiusValues.push(parseFloat(first) >= 999 ? "pill" : first);
    }
  }

  // Elevation
  const shadowValues: string[] = [];
  let insetOnly = 0;
  for (const el of visible) {
    const shadow = getComputedStyle(el).boxShadow;
    if (shadow && shadow !== "none") {
      shadowValues.push(shadow.length > 120 ? shadow.slice(0, 120) + "…" : shadow);
      const parts = shadow.split(/,(?![^(]*\))/);
      if (parts.every((p) => p.includes("inset"))) insetOnly++;
    }
  }

  // Rhythm
  const containerValues: string[] = [];
  for (const el of visible) {
    const mw = parseFloat(getComputedStyle(el).maxWidth);
    if (Number.isFinite(mw) && mw > 600 && mw < 2000) containerValues.push(mw + "px");
  }
  const paddingValues: string[] = [];
  for (const el of Array.from(document.querySelectorAll("section, main > div, [class*='section']"))) {
    const s = getComputedStyle(el);
    const t = parseFloat(s.paddingTop);
    const b = parseFloat(s.paddingBottom);
    if (t > 24) paddingValues.push(t + "px / " + b + "px");
  }

  // Tallies that feed a comparison rule (a .length, vocabularyCount, or a
  // summed count) are capped HIGH and flag when the cap bites, because a
  // display-sized .slice() run BEFORE the computation silently biased the
  // comparison: a subject with 30 real surfaces read as 8, vocabularyCount
  // could never exceed the slice, and elevation-strategy summed counts over a
  // truncated shadows list (Sol P1, 2026-08-14). Display-only tallies
  // (tracking/accent/weights/rhythm) keep their small slices unflagged —
  // every rule touching them reads the top-by-count entry or a separately
  // counted scalar, verified per rule, and a sorted tally's top entry does
  // not move under truncation.
  const TALLY_CAP = 100;
  const truncated: string[] = [];
  const cap = (name: string, entries: Entry[]): Entry[] => {
    if (entries.length > TALLY_CAP) truncated.push(name);
    return entries.slice(0, TALLY_CAP);
  };

  return {
    visibleCount: visible.length,
    truncated,
    surfaces: { canvas, tally: cap("surfaces", tally(surfaceValues)) },
    borders: { tally: cap("borders", tally(borderValues)) },
    hairlines: { subPixelRecovered, subPixelAmbiguous, subPixelConflict, sheetsBlocked, ruleOverflow, shadowRules: shadowBorderRules, nestingUnattributable, declarativeClosedShadow: declarativeClosedRoots },
    text: { tally: cap("text colors", tally(textColors)) },
    tracking: { display: tally(displayTracking).slice(0, 4), body: tally(bodyTracking).slice(0, 4) },
    accent: { candidates: tally(accentValues).slice(0, 5), usesInFirstViewport: accentFirstViewport },
    type: {
      families: cap("font families", tally(families)),
      sizes: cap("font sizes", tally(sizes)),
      weights: tally(weights).slice(0, 8)
    },
    radii: { tally: cap("radii", tally(radiusValues)) },
    elevation: { shadows: cap("shadows", tally(shadowValues)), insetOnly },
    rhythm: { containers: tally(containerValues).slice(0, 4), sectionPadding: tally(paddingValues).slice(0, 4) }
  };
}
