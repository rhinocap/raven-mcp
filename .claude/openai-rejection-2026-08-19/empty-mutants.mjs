// Mutation matrix for the OpenAI-rejection remediation (v4 — fourteen R1 guards
// plus the R2 annotation flips), re-run WHOLE rather than extended.
//
// Each mutant reverts ONE empty-input guard in dist/index.js (the built artifact
// the suite imports), runs the suite directly with `node --test` (NEVER `npm
// test`, which runs `clean && tsc` and would clobber the mutant), and requires
// the run to go red. A DECLARED baseline runs first — declared, not compared to
// itself, because a suite that silently stopped registering tests would satisfy
// any relative check and print SURVIVED for a reason that has nothing to do with
// the product. The file is restored by string equality after every mutant, and
// every find-string is asserted UNIQUE in the pristine file before it is used.
//
// The exit STATUS and the summary must AGREE: `node --test` can print fail 0 and
// still exit non-zero.
//
// C1 is a behaviour-NEUTRAL control. A red-only matrix is structurally blind to
// a false fail, and two of these mutants (E7, E14) are separators whose whole
// point is which SUBSET goes red — so the matrix has to be able to tell a real
// red from a broken harness.
//
// v3 (Sol round 5, P2): a mutant run is graded the way the BASELINE is already
// graded, not by `fail > 0` alone. Two things that are not kills used to count as
// one: a mutant that SHORTENS the suite (fewer tests registered, so the guard's
// own test never ran) and a mutant that reddens some OTHER test. So every run
// must still register EXPECTED_TESTS with EXPECTED_SKIP skips -- a moved shape
// ABORTS the matrix rather than being scored, because it is a broken measurement
// and not a result -- and each mutant DECLARES the test it is supposed to redden,
// which must appear in that run's red set. A radius alone says how many tests
// failed and never which, so without the declared name a kill is unattributable.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const FILE = "dist/index.js";
// v4: TWO suites under one runner. The R2 idempotency work is graded by
// test/idempotent-annotations.test.mjs, and a mutant that flips a
// TOOL_IDEMPOTENT entry is invisible to the refusal suite -- so a matrix that
// ran only the refusal suite would print SURVIVED for every annotation mutant
// and the flips would be guarded by nothing.
const SUITE = ["test/empty-input-refusal.test.mjs", "test/idempotent-annotations.test.mjs"];
// Re-DECLARED from a measurement this round (refusal 49 + annotations 13), not
// carried forward: the refusal suite grew by 14 and the annotations suite is new.
const EXPECTED_TESTS = 63, EXPECTED_PASS = 63, EXPECTED_SKIP = 0;

const SWIFT_G = `if (typeof src !== "string" || src.trim() === "") {\n            return refuseEmptyInput("No SwiftUI source`;
const RN_G = `if (typeof src !== "string" || src.trim() === "") {\n            return refuseEmptyInput("No React Native source`;
const SCREEN_G = `if (Array.isArray(elements) && elements.length === 0) {`;
const PAGE_G = `if (html !== undefined && html !== null && isBlankString(html) && !url) {`;
const CREATIVE_G = `if (isBlankString(params.creative_text)) {`;
const GDS_G = `if (isBlankString(params.name)) {`;
const BP_G = `if (isBlankString(service_name) || !Array.isArray(current) || current.length === 0) {`;
const COMPOSE_G = `return refuseEmptyInput("Nothing to compose.`;
// audit_contrast and audit_video_playback carry the SAME predicate one tool
// apart, so the bare guard line matches TWICE and the uniqueness pre-flight
// (correctly) aborts on it. Each find-string is anchored on the refusal line
// beneath it instead -- the anchor is what names the tool.
const CONTRAST_G = `if (Array.isArray(dom_snapshot) && dom_snapshot.length === 0) {\n            return refuseEmptyInput("dom_snapshot is empty - no elements to score.`;
const VIDEO_G = `if (Array.isArray(dom_snapshot) && dom_snapshot.length === 0) {\n                // An empty dom_snapshot is a caller who collected nothing`;
const BLANK_FN = `function isBlankString(v) {\n    return typeof v !== "string" || v.trim().length === 0;\n}`;

// v4 anchors — the five guards added this round plus one annotation entry.
// Each is asserted unique by the pre-flight below; the three array guards are
// anchored on their own refusal LINE rather than on the bare
// `Array.isArray(x) && x.length === 0` shape, which three tools now share.
const TAP_G = `if (elements.length === 0) {\n                return refuseEmptyInput("elements is empty`;
const CONTENT_G = `if (Array.isArray(items) && items.length === 0) {\n            return refuseEmptyInput("items is empty`;
const TYPO_G = `if (nodes.length === 0) {\n                return refuseEmptyInput("nodes is empty`;
const PRIV_G = `if (isBlankString(info_plist) && isBlankString(app_json)) {`;
const EVAL_G = `if (description !== undefined && description !== null && description.trim().length === 0) {`;
const NOTHING_G = `if (!hasDescription && !hasBeforeAfterScreenshots) {`;
const IDEM_DG = `decision_get: false,`;

const MUTANTS = [
  ["E1  audit_ios_a11y guard deleted", `if (!Array.isArray(elements) || elements.length === 0) {`, `if (false) {`, "red",
   "audit_ios_a11y refuses empty elements array instead of producing an artifact about nothing"],
  ["E2  audit_swiftui guard deleted", SWIFT_G, `if (false) {` + SWIFT_G.slice(SWIFT_G.indexOf("{") + 1), "red",
   "audit_swiftui refuses empty source string instead of producing an artifact about nothing"],
  ["E3  audit_rn guard deleted", RN_G, `if (false) {` + RN_G.slice(RN_G.indexOf("{") + 1), "red",
   "audit_rn refuses empty source string instead of producing an artifact about nothing"],
  ["E4  swiftui whitespace not empty", SWIFT_G, SWIFT_G.replace(`src.trim() === ""`, `src === ""`), "red",
   "audit_swiftui refuses whitespace-only source instead of producing an artifact about nothing"],
  ["E5  rn whitespace not empty", RN_G, RN_G.replace(`src.trim() === ""`, `src === ""`), "red",
   "audit_rn refuses whitespace-only source instead of producing an artifact about nothing"],
  // ONE guard covers audit_screen AND audit_ios_screen (both platforms route
  // through auditScreenSnapshot), so E6's radius is a fact about that shared
  // mechanism and NOT evidence of three independent guards.
  ["E6  audit_screen/ios_screen guard deleted", SCREEN_G, `if (false) {`, "red",
   "audit_screen refuses empty elements array instead of producing an artifact about nothing"],
  // E7 is the separator that makes the shape-affordance control load-bearing:
  // `!elements` is FALSE for [], so a truthiness guard cannot tell a SUBMITTED
  // empty snapshot from a caller ASKING what shape a snapshot has. It keeps
  // every refusal green and breaks only the affordance.
  ["E7  screen guard widened to truthiness", SCREEN_G, `if (!elements || (Array.isArray(elements) && elements.length === 0)) {`, "red",
   "audit_screen with no elements still returns the snapshot-shape instructions, not an error"],
  ["E8  audit_page guard deleted", PAGE_G, `if (false) {`, "red",
   "audit_page refuses empty html string instead of producing an artifact about nothing"],
  ["E9  audit_page whitespace not empty", PAGE_G, PAGE_G.replace(`isBlankString(html)`, `html === ""`), "red",
   "audit_page refuses whitespace-only html instead of producing an artifact about nothing"],
  ["E10 score_creative guard deleted", CREATIVE_G, `if (false) {`, "red",
   "score_creative refuses empty creative text instead of producing an artifact about nothing"],
  ["E11 score_creative whitespace not empty", CREATIVE_G, `if (params.creative_text === "") {`, "red",
   "score_creative refuses whitespace-only creative text instead of producing an artifact about nothing"],
  ["E12 generate_design_system guard deleted", GDS_G, `if (false) {`, "red",
   "generate_design_system refuses empty system name instead of producing an artifact about nothing"],
  ["E13 generate_service_blueprint guard deleted", BP_G, `if (false) {`, "red",
   "generate_service_blueprint refuses empty service name and no steps instead of producing an artifact about nothing"],
  // E14 separates the two halves of the blueprint guard: a named service with
  // zero steps is still a document about nothing.
  ["E14 blueprint name-half only", BP_G, `if (isBlankString(service_name)) {`, "red",
   "generate_service_blueprint refuses a named service with no steps instead of producing an artifact about nothing"],
  ["E15 compose_system guard deleted", COMPOSE_G, `if (false) return refuseEmptyInput("Nothing to compose.`, "red",
   "compose_system refuses empty compositions array instead of producing an artifact about nothing"],
  // E16/E17 are TWO MUTANTS ON ONE MECHANISM, separated by DIRECTION rather than
  // by radius -- the pattern this repo already uses for V14/V16 and Q21/Q23.
  // E16 removes the guard, so the empty snapshot is scored and the affirmative
  // all-clear comes back; only the REFUSAL test can see it. E17 widens the guard
  // to refuse every snapshot, which satisfies that same refusal test perfectly
  // and is caught only by the positive control -- which is the measurement that
  // the control is load-bearing and not decoration.
  ["E16 audit_contrast empty-snapshot guard deleted", CONTRAST_G, `if (false) {` + CONTRAST_G.slice(CONTRAST_G.indexOf("{") + 1), "red",
   "audit_contrast refuses empty dom_snapshot array instead of producing an artifact about nothing"],
  ["E17 audit_contrast guard refuses every snapshot", CONTRAST_G, CONTRAST_G.replace(`dom_snapshot.length === 0`, `dom_snapshot.length >= 0`), "red",
   "audit_contrast still scores a real dom_snapshot"],
  // E18/E19 are the audit_video_playback pair -- the same two DIRECTIONS on the
  // same mechanism as E16/E17, one tool over. E18 removes the guard, so the empty
  // snapshot is classified and the affirmative "No <video> elements found." comes
  // back; only the refusal test can see it. E19 widens the guard to refuse EVERY
  // snapshot, which satisfies that refusal test perfectly and is caught only by
  // the positive control -- which is the measurement that the control is
  // load-bearing. That control asserts a NON-ZERO total_videos rather than a
  // score, because this tool has no score field and a classifier that measured
  // nothing also reports zero.
  ["E18 audit_video_playback empty-snapshot guard deleted", VIDEO_G, `if (false) {` + VIDEO_G.slice(VIDEO_G.indexOf("{") + 1), "red",
   "audit_video_playback refuses empty dom_snapshot array instead of producing an artifact about nothing"],
  ["E19 audit_video_playback guard refuses every snapshot", VIDEO_G, VIDEO_G.replace(`dom_snapshot.length === 0`, `dom_snapshot.length >= 0`), "red",
   "audit_video_playback still classifies a real dom_snapshot"],
  // ---- v4: the five guards added this round, in BOTH directions wherever a
  // positive control exists. The delete direction is caught by the refusal test;
  // the refuse-everything direction satisfies that refusal test perfectly and is
  // caught ONLY by the positive control -- which is what MEASURES the control as
  // load-bearing rather than decoration. Same E16/E17 pattern, five tools over.
  ["E20 audit_tap_targets guard deleted", TAP_G, `if (false) {` + TAP_G.slice(TAP_G.indexOf("{") + 1), "red",
   "audit_tap_targets refuses empty elements array instead of producing an artifact about nothing"],
  ["E21 audit_tap_targets guard refuses every snapshot", TAP_G, TAP_G.replace(`elements.length === 0`, `elements.length >= 0`), "red",
   "audit_tap_targets still measures a real element"],
  ["E22 audit_content guard deleted", CONTENT_G, `if (false) {` + CONTENT_G.slice(CONTENT_G.indexOf("{") + 1), "red",
   "audit_content refuses empty items array instead of producing an artifact about nothing"],
  ["E23 audit_content guard refuses every batch", CONTENT_G, CONTENT_G.replace(`items.length === 0`, `items.length >= 0`), "red",
   "audit_content still evaluates a real item"],
  ["E24 audit_typography guard deleted", TYPO_G, `if (false) {` + TYPO_G.slice(TYPO_G.indexOf("{") + 1), "red",
   "audit_typography refuses empty nodes array instead of producing an artifact about nothing"],
  ["E25 audit_typography guard refuses every snapshot", TYPO_G, TYPO_G.replace(`nodes.length === 0`, `nodes.length >= 0`), "red",
   "audit_typography still measures real nodes"],
  ["E26 audit_ios_privacy guard deleted", PRIV_G, `if (false) {`, "red",
   "audit_ios_privacy refuses whitespace-only Info.plist instead of producing an artifact about nothing"],
  // E27 is the WHITESPACE separator, and it is the reason the guard uses
  // isBlankString rather than a falsiness test: "   \n  " is TRUTHY, so a
  // `!info_plist && !app_json` guard refuses "" and waves a whitespace-only
  // document straight through to a 1/1 all-clear. It keeps the empty-string
  // refusals green and breaks only the whitespace ones.
  ["E27 ios_privacy blankness weakened to falsiness", PRIV_G, `if (!info_plist && !app_json) {`, "red",
   "audit_ios_privacy refuses whitespace-only Info.plist instead of producing an artifact about nothing"],
  // E28/E29 are the evaluate_design pair, and the direction that matters here is
  // the SECOND one: the contract is that a BLANK description is refused while an
  // OMITTED one is not (it routes to the screenshot pixel-diff path). E29 widens
  // the guard to swallow the omitted case, which every refusal test still passes
  // and only the omitted-vs-blank control can see.
  ["E28 evaluate_design blank-description guard deleted", EVAL_G, `if (false) {`, "red",
   "evaluate_design refuses empty description instead of producing an artifact about nothing"],
  ["E29 evaluate_design guard swallows the omitted case", EVAL_G, `if (isBlankString(description)) {`, "red",
   "evaluate_design with no description but a before/after pair is not refused"],
  // E31/E32 are the NOTHING-TO-EVALUATE guard, and they pull in opposite
  // directions on purpose. E31 deletes it, restoring the hollow scaffold. E32 is
  // the one that matters: weakening && to || refuses every call that is missing
  // EITHER input, which takes out the legitimate screenshot-only pixel diff and
  // the ordinary description-only evaluation. A guard "fixed" by simply refusing
  // more would pass E31 and die here -- which is why the omitted-description
  // control had to be rewritten onto a real before/after pair first. Under the
  // old fixture ({ goals: [...] }, no screenshots) E32 was invisible.
  ["E31 nothing-to-evaluate guard deleted", NOTHING_G, `if (false) {`, "red",
   "evaluate_design refuses a call with neither description nor screenshots"],
  ["E32 nothing-to-evaluate guard widened to either-missing", NOTHING_G, `if (!hasDescription || !hasBeforeAfterScreenshots) {`, "red",
   "evaluate_design with no description but a before/after pair is not refused"],
  // ---- v4: the R2 half. A TOOL_IDEMPOTENT entry is consulted ONLY in
  // toolAnnotations()'s "destructive" branch, so a flip on a readOnly-classified
  // tool would be a SILENT NO-OP -- E30 is what proves the entry is reached and
  // that the published annotation actually changed, rather than that a constant
  // was edited in a file nobody reads.
  ["E30 decision_get re-claimed as idempotent", IDEM_DG, `decision_get: true,`, "red",
   "decision_get is NOT published as idempotent"],
  // C1 CONTROL — .trim().length === 0 and .trim() === "" are the same predicate.
  ["C1  CONTROL blank predicate rephrased", BLANK_FN, BLANK_FN.replace(`v.trim().length === 0`, `v.trim() === ""`), "green", null]
];

function run() {
  const r = spawnSync("node", ["--test", ...SUITE], {
    encoding: "utf8", env: { ...process.env, RAVEN_NO_USAGE_LOG: "1" }
  });
  const out = r.stdout + r.stderr;
  const num = (k) => { const m = out.match(new RegExp(`^. ${k} (\\d+)$`, "m")); return m ? Number(m[1]) : null; };
  // node --test emits ✖ (not ✘) and repeats each failure in its trailing
  // summary, so the names are deduped or every radius reads double.
  const red = [...out.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((m) => m[1]);
  // Sol round 4, P3-5: a child that DIED is not a mutant that was killed. A
  // spawn error or a signal termination yields status null, which `status !== 0`
  // reads as red -- so the harness would print KILLED for a run that measured
  // nothing at all. `dead` is carried out and grading refuses it explicitly.
  const dead = !!r.error || r.signal !== null || r.status === null || num("tests") === null;
  return { tests: num("tests"), pass: num("pass"), fail: num("fail"), skipped: num("skipped"),
           status: r.status, signal: r.signal, error: r.error, dead, red: [...new Set(red)], out };
}

const original = readFileSync(FILE, "utf8");
const base = run();
if (base.dead) { console.error(`BASELINE CHILD DIED: status=${base.status} signal=${base.signal} error=${base.error && base.error.message}`); process.exit(1); }
if (base.tests !== EXPECTED_TESTS || base.pass !== EXPECTED_PASS || base.fail !== 0 ||
    base.skipped !== EXPECTED_SKIP || base.status !== 0) {
  console.error(`BASELINE NOT GREEN: tests=${base.tests} pass=${base.pass} fail=${base.fail} skipped=${base.skipped} status=${base.status}`);
  process.exit(1);
}
console.log(`baseline: ${base.tests} tests / ${base.pass} pass / 0 fail / ${base.skipped} skipped, status 0`);

// Presence and uniqueness are answerable without launching anything — check
// every mutant BEFORE spending a run, so a dead find-string aborts in seconds.
for (const [label, find] of MUTANTS) {
  const n = original.split(find).length - 1;
  if (n !== 1) { console.error(`ABORT ${label}: find-string matched ${n} times, expected 1`); process.exit(1); }
}

let survived = 0, falseFails = 0, wrongTest = 0;
for (const [label, find, replace, expect, declared] of MUTANTS) {
  writeFileSync(FILE, original.replace(find, replace));
  const r = run();
  writeFileSync(FILE, original);
  if (readFileSync(FILE, "utf8") !== original) { console.error("ABORT: restore failed"); process.exit(1); }
  if (r.dead) {
    console.error(`ABORT ${label}: child died rather than reported - status=${r.status} signal=${r.signal} error=${r.error && r.error.message}`);
    process.exit(1);
  }
  // Grade the SHAPE the way the baseline is graded. A mutant that registers fewer
  // tests, or turns one into a skip, is a broken measurement rather than a kill --
  // the guard's own test may never have run at all.
  if (r.tests !== EXPECTED_TESTS || r.skipped !== EXPECTED_SKIP) {
    console.error(`ABORT ${label}: run shape moved — tests=${r.tests} skipped=${r.skipped}, expected ${EXPECTED_TESTS}/${EXPECTED_SKIP}. A suite that shortened is not a mutant that was killed.`);
    process.exit(1);
  }
  const isRed = r.fail > 0 || r.status !== 0;
  if (expect === "green") {
    if (isRed) { falseFails++; console.log(`FALSE-FAIL ${label} — fail ${r.fail} status ${r.status} — red: ${r.red.join(" | ")}`); }
    else console.log(`NEUTRAL  ${label} — ${r.pass} pass / 0 fail, status 0`);
    continue;
  }
  if (!isRed) { survived++; console.log(`SURVIVED ${label} — radius 0`); continue; }
  // A radius says how many tests failed and never WHICH, so a mutant reddening
  // some other test would read as a kill. The declared name is the attribution.
  if (!r.red.includes(declared)) {
    wrongTest++;
    console.log(`WRONG-TEST ${label} — declared "${declared}" is NOT in the red set — red: ${r.red.join(" | ") || "(none)"}`);
    continue;
  }
  console.log(`KILLED  ${label} — radius ${r.fail} — red: ${r.red.join(" | ")}`);
}
console.log(`${MUTANTS.filter(m => m[3] === "red").length} mutants, ${survived} survived, ${wrongTest} killed the wrong test; ${MUTANTS.filter(m => m[3] === "green").length} control(s), ${falseFails} false-failed`);
process.exitCode = (survived === 0 && falseFails === 0 && wrongTest === 0) ? 0 : 1;
