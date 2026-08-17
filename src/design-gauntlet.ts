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
    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });

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
      page.evaluate(probeInPage, { vpW: viewport.width, vpH: viewport.height });
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
      if (hairlines.ruleOverflow) causes.push("the authored-rule scan hit its cap");
      if (hairlines.subPixelAmbiguous > 0) {
        causes.push(hairlines.subPixelAmbiguous + " element(s) matched conflicting widths whose winner depends on specificity");
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
function probeInPage({ vpW, vpH }: { vpW: number; vpH: number }) {
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
  type Side = "Top" | "Right" | "Bottom" | "Left";
  const SIDES: Side[] = ["Top", "Right", "Bottom", "Left"];
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

  const collectRules = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules) as any[]) {
      // Both collections are bounded by the ONE cap — they are two halves of the
      // same scan, and counting only one of them lets the other grow unbounded.
      if (authoredRules.length + unresolvedRules.length >= AUTHORED_RULE_CAP) { ruleOverflow = true; return; }
      // Collect BEFORE recursing, and never treat "has cssRules" as "is a group".
      // CSS nesting gave CSSStyleRule its own .cssRules, so a group-first check
      // skips every plain style rule on a modern engine and the whole recovery
      // silently reads empty (measured: the stylesheet fixture stayed at 1px).
      if (rule.selectorText && rule.style) {
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
          if (typeof n === "number") authoredRules.push({ selector: rule.selectorText, side, width: n, important });
          else if (n === "unresolved") unresolvedRules.push({ selector: rule.selectorText, side, important });
        }
      }
      // @media / @supports / @layer carry nested rules, as does a nesting style
      // rule. A media block that does not currently apply is skipped: its
      // widths are not on this render.
      if (rule.cssRules) {
        if (rule.media && rule.conditionText) {
          try { if (!matchMedia(rule.conditionText).matches) continue; } catch { /* unparsable: fall through */ }
        }
        collectRules(rule.cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    // A cross-origin sheet throws on .cssRules. Counted, never swallowed.
    try { collectRules(sheet.cssRules); } catch { sheetsBlocked++; }
  }

  let subPixelRecovered = 0;
  let subPixelAmbiguous = 0;

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
    // An overflowed scan is not a partial answer, it is an untrustworthy one.
    // The cap can stop MID-RULE, so a later rule's 1px on this side can be
    // missing while an earlier rule's 0.5px on the same side was kept — and the
    // retained value then reads as a confident recovery of an edge that really
    // renders at 1px. A false RECOVERY is worse than a false ambiguity, so past
    // the cap nothing is trusted for any element. That is also what makes SIDES
    // order unobservable here: with recovery off past the cap, which sides of a
    // truncated rule survived cannot change an answer.
    if (ruleOverflow) return "unresolved";
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
    if (new Set(matched).size > 1) return "unresolved";
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
    hairlines: { subPixelRecovered, subPixelAmbiguous, sheetsBlocked, ruleOverflow },
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
