// An EMPTY or BLANK audit/generator input must be REFUSED, never graded.
//
// WHY THIS FILE EXISTS (2026-08-19, OpenAI plugin-directory rejection R1 --
// "one or more of your test cases did not produce correct results"). Measured on
// the built tree, every one of these returned isError:false:
//
//   audit_ios_a11y {elements:[]}                    -> score 100, grade A
//   audit_swiftui  {source:""}                      -> score 100, grade A
//   audit_rn       {source:""}                      -> score 100, grade A
//   audit_screen / audit_ios_screen {elements:[]}   -> score 100, grade A
//   audit_page     {html:""}                        -> score  77, grade C
//   score_creative {creative_text:""}               -> score  70, grade C
//   generate_design_system {name:""}                -> an HTML page titled " Design System"
//   generate_service_blueprint {service_name:"",current:[]} -> an HTML blueprint of nothing
//   compose_system {compositions:[]}                -> a token set with no tokens
//
// A schema can say a field is PRESENT; it cannot say there is anything IN it.
// Every grade above is computed from a denominator that is zero on empty input,
// and the `total > 0 ? ... : 100` fallback manufactures the pass -- so nothing
// in the scoring path could ever have caught it. Refusing is the only answer
// that is not an affirmative false claim about work nobody did.
//
// WHITESPACE COUNTS AS EMPTY and that is not cosmetic: `{source:"   \n  "}` was
// MEASURED returning 100/A, so a `=== ""` check would have left the defect
// reachable through one space.
//
// `!elements` is FALSE for `[]`. That single truthiness fact is how an empty
// array walked past `if (!elements || !viewport)` in auditScreenSnapshot() and
// scored 100/A. An array-emptiness guard is `Array.isArray(x) && x.length === 0`,
// never a truthiness test.
//
// THIS SUITE GOES THROUGH THE PUBLIC SCHEMA SEAM (Sol round 3, P3-6, which found
// the first version of this file calling handlers directly with fixtures the real
// endpoint would have rejected -- two of them omitted a REQUIRED field, so they
// measured a code path no caller can reach). `safeParse` runs FIRST and a schema
// rejection is a hard failure of the fixture, not a pass: a refusal only counts
// when the schema ACCEPTED the input and the HANDLER did the refusing.
//
// Each refusal is paired with a POSITIVE control on the same tool, because a
// handler that refused EVERYTHING would satisfy the refusal half alone and this
// suite would report a working audit as fixed. The snapshot tools carry a THIRD
// control: omitting `elements` entirely is the discovery affordance and must
// still return the snapshot-shape instructions, NOT an error.
import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../dist/index.js";
import { FsTasteStore } from "../dist/taste-store.js";

const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const signal = new AbortController().signal;

// The public seam: validate with the tool's OWN inputSchema before invoking it,
// exactly as an MCP client does. Calling t.handler(args) directly bypasses zod
// and can measure a path no caller can reach.
async function call(name, args) {
  const tool = server._registeredTools[name];
  assert.ok(tool, `${name} is not registered`);
  const parsed = tool.inputSchema.safeParse(args);
  assert.ok(parsed.success, `fixture rejected by ${name}'s own schema (so it measures nothing): ` +
    (parsed.success ? "" : parsed.error.issues.map(i => i.path.join(".") + ":" + i.code).join(", ")));
  const result = await tool.handler(parsed.data, { signal });
  const text = result.content.map(c => c.text).join("\n");
  let json = null;
  try { json = JSON.parse(text); } catch { /* a refusal or an HTML export is not JSON */ }
  return { isError: result.isError === true, text, json };
}

const VP = { w: 393, h: 852 };

const EMPTY_CASES = [
  ["audit_ios_a11y", { elements: [], viewport: VP }, "empty elements array"],
  ["audit_swiftui", { source: "" }, "empty source string"],
  ["audit_swiftui", { source: "   \n  " }, "whitespace-only source"],
  ["audit_swiftui", { source: [] }, "empty source array"],
  ["audit_rn", { source: "" }, "empty source string"],
  ["audit_rn", { source: "   \n  " }, "whitespace-only source"],
  ["audit_rn", { source: [] }, "empty source array"],
  ["audit_screen", { elements: [], viewport: VP }, "empty elements array"],
  ["audit_screen", { elements: [], viewport: VP, platform: "android" }, "empty elements array on android"],
  ["audit_ios_screen", { elements: [], viewport: VP }, "empty elements array"],
  ["audit_page", { html: "" }, "empty html string"],
  ["audit_page", { html: "   \n " }, "whitespace-only html"],
  ["score_creative", { creative_text: "" }, "empty creative text"],
  ["score_creative", { creative_text: "   " }, "whitespace-only creative text"],
  ["generate_design_system", { name: "" }, "empty system name"],
  ["generate_design_system", { name: "  " }, "whitespace-only system name"],
  ["generate_service_blueprint", { service_name: "", current: [] }, "empty service name and no steps"],
  ["generate_service_blueprint", { service_name: "Onboarding", current: [] }, "a named service with no steps"],
  ["compose_system", { compositions: [] }, "empty compositions array"],
  // Added 2026-08-19 after Sol round 4 P1-1. `dom_snapshot: []` is schema-valid,
  // so zod cannot see it, and the scorer answered it with an AFFIRMATIVE verdict:
  // aa_fail_count 0 plus "No background rows need review", byte-indistinguishable
  // from a genuinely accessible page. The first version of this suite missed it
  // because it probed `{}` and `elements: []` and this tool uses neither name --
  // an empty-input guard has to be enumerated per PARAMETER, not per tool.
  ["audit_contrast", { dom_snapshot: [] }, "empty dom_snapshot array"],
  // Added 2026-08-19 after Sol round 5 P1-1 -- the SAME all-clear-from-empty
  // class as audit_contrast above, one tool over, and it survived the round-4
  // sweep because that sweep enumerated the tools it already knew about rather
  // than every tool taking a snapshot ARRAY. `dom_snapshot: []` is schema-valid,
  // and the aggregator answered it with total_videos 0 plus the affirmative
  // summary "No <video> elements found." -- byte-indistinguishable from a page
  // that genuinely has no video. `test/video-playback.test.mjs` was BLESSING that
  // output as the contract, which is why the fix had to reach that file too.
  ["audit_video_playback", { dom_snapshot: [] }, "empty dom_snapshot array"],
  // Added 2026-08-19 after Sol round 6 P1-2: audit_tap_targets checked PRESENCE
  // (`elements !== undefined`) and `[]` satisfies it, so an empty snapshot
  // reached the aggregator and came back total 0, failing 0, warnings [] -- a
  // clean tap-target report for a page nobody measured.
  ["audit_tap_targets", { elements: [] }, "empty elements array"],
  // The three below were found 2026-08-19 by sweeping EVERY anonymous tool with
  // empty values for each of its own parameters, rather than by extending the
  // list of tools already known to be affected. That sweep is the reason they
  // exist: rounds 4 and 5 each found one more instance of this class by hand,
  // one tool at a time, and each hand-search missed the rest.
  ["audit_content", { items: [] }, "empty items array"],
  ["audit_typography", { nodes: [] }, "empty nodes array"],
  // The string-side twin, and the worst measured instance in the whole product:
  // a whitespace-only plist is TRUTHY, walked past a `!info_plist` guard, and
  // returned score 100 / grade "A" / "1/1 privacy checks passed - all clear".
  ["audit_ios_privacy", { info_plist: "   \n  " }, "whitespace-only Info.plist"],
  ["audit_ios_privacy", { info_plist: "" }, "empty Info.plist string"],
  ["audit_ios_privacy", { app_json: "  " }, "whitespace-only app.json"],
  // Weaker than the others -- it emits no score or grade -- but it is still an
  // evaluation plan for a design nobody described, so it is refused rather than
  // quietly treated as an omitted field.
  ["evaluate_design", { description: "" }, "empty description"],
  ["evaluate_design", { description: "   \n  " }, "whitespace-only description"]
];

for (const [name, args, label] of EMPTY_CASES) {
  test(`${name} refuses ${label} instead of producing an artifact about nothing`, async () => {
    const { isError, text, json } = await call(name, args);
    assert.equal(isError, true, `expected a refusal, got: ${text.slice(0, 200)}`);
    assert.ok(json && typeof json.error === "string" && json.error.length > 0,
      `refusal must carry an actionable error string, got: ${text.slice(0, 200)}`);
    // The forbidden outcomes, asserted directly rather than via isError alone.
    assert.equal(json.score, undefined, "an empty input must never carry a score");
    assert.equal(json.grade, undefined, "an empty input must never carry a grade");
    assert.ok(!/^<!DOCTYPE/i.test(text.trim()), "an empty input must never render an artifact");
  });
}

// ── Positive controls: real input still works ──────────────────────
// Without these, a handler that refused unconditionally would pass every
// assertion above and this suite would report a broken tool as fixed.

const ELEMENT = { label: "Continue", rect: { x: 0, y: 0, w: 20, h: 20 }, role: "button", fontPt: 11, fgColor: "#999999", bgColor: "#ffffff" };

const POSITIVE_CASES = [
  ["audit_ios_a11y", { elements: [ELEMENT], viewport: VP }],
  ["audit_screen", { elements: [ELEMENT], viewport: VP }],
  ["audit_ios_screen", { elements: [ELEMENT], viewport: VP }],
  ["audit_swiftui", { source: 'Text("hello").font(.system(size: 11))' }],
  ["audit_rn", { source: 'const s = StyleSheet.create({ t: { fontSize: 9, color: "#eee" } });' }],
  ["audit_page", { html: "<html><body><p style='font-size:9px'>hi</p></body></html>" }],
  ["score_creative", { creative_text: "Ship your design system in an afternoon. Try Raven free." }]
];

for (const [name, args] of POSITIVE_CASES) {
  test(`${name} still scores a real input`, async () => {
    const { isError, json, text } = await call(name, args);
    assert.equal(isError, false, `a real input must not be refused: ${text.slice(0, 200)}`);
    assert.equal(typeof json.score, "number", `a real input must produce a score: ${text.slice(0, 200)}`);
  });
}

for (const [name, args] of [
  ["generate_design_system", { name: "Acme" }],
  ["generate_service_blueprint", { service_name: "Free trial signup", current: [{ label: "Sign up", user_action: "Enters email" }] }],
  ["compose_system", { compositions: [{ system: "stripe", group: "color" }] }]
]) {
  test(`${name} still produces its artifact for a real input`, async () => {
    const { isError, text } = await call(name, args);
    assert.equal(isError, false, `a real input must not be refused: ${text.slice(0, 200)}`);
    assert.ok(text.length > 200, "a real input must produce a non-trivial artifact");
  });
}

// audit_contrast carries no `score`, so it cannot ride the POSITIVE_CASES loop
// above; without its own control, a guard that refused every dom_snapshot would
// satisfy the refusal assertion and this suite would report a dead tool as fixed.
test("audit_contrast still scores a real dom_snapshot", async () => {
  const { isError, json, text } = await call("audit_contrast", {
    dom_snapshot: [{ selector: ".faint", color: "#999999", bgColor: "#ffffff", fontPx: 14 }]
  });
  assert.equal(isError, false, `a real snapshot must not be refused: ${text.slice(0, 200)}`);
  assert.equal(json.total_text_elements, 1, `expected the supplied element to be scored: ${text.slice(0, 200)}`);
  // #999 on #fff is 2.85:1 -- below AA for 14px, so a working scorer MUST fail it.
  // Asserting the count is 1 rather than >= 0 is what makes this control able to
  // fail: a scorer that measured nothing would still report aa_fail_count 0.
  assert.equal(json.aa_fail_count, 1, `expected the sub-AA element to fail: ${text.slice(0, 200)}`);
});

// audit_video_playback carries no `score` either, so it needs its own control
// for the same reason audit_contrast does: a guard that refused every
// dom_snapshot would satisfy the refusal assertion above and this suite would
// report a dead tool as fixed.
test("audit_video_playback still classifies a real dom_snapshot", async () => {
  const { isError, json, text } = await call("audit_video_playback", {
    dom_snapshot: [{
      selector: "#hero", hasSource: true, readyState: 4, networkState: 1, errorCode: 0,
      paused: true, autoplayBlocked: true, currentTimeStart: 0, currentTimeEnd: 0
    }]
  });
  assert.equal(isError, false, `a real snapshot must not be refused: ${text.slice(0, 200)}`);
  assert.equal(json.total_videos, 1, `expected the supplied video to be classified: ${text.slice(0, 200)}`);
  // A paused, autoplay-blocked clip whose currentTime never moved is NOT playing.
  // Asserting not_playing_count is 1 rather than >= 0 is what makes this control
  // able to fail: a classifier that measured nothing reports 0 for both counts.
  assert.equal(json.playing_count, 0, `a stalled clip must not read as playing: ${text.slice(0, 200)}`);
  assert.equal(json.not_playing_count, 1, `expected the non-playing clip to be counted: ${text.slice(0, 200)}`);
});

// ── The discovery affordance must survive the guard ────────────────
// Omitting `elements` entirely is how a caller asks audit_screen what shape a
// snapshot has ("Call with no arguments for the expected snapshot shape"). The
// guard must refuse a SUBMITTED empty snapshot without breaking that, which is
// exactly why it tests Array.isArray(elements) && length === 0 rather than
// falsiness -- a truthiness guard cannot tell the two apart.
for (const name of ["audit_screen", "audit_ios_screen"]) {
  test(`${name} with no elements still returns the snapshot-shape instructions, not an error`, async () => {
    const { isError, json, text } = await call(name, {});
    assert.equal(isError, false, `the shape affordance must not be an error: ${text.slice(0, 200)}`);
    assert.ok(json && typeof json.instructions === "string" && json.instructions.length > 0,
      `expected snapshot-shape instructions, got: ${text.slice(0, 200)}`);
  });
}

// ── Controls for the tools added 2026-08-19 ────────────────────────
// None of these four carries a top-level `score` in the shape POSITIVE_CASES
// asserts, so each needs its own control, and each asserts an EXACT count or
// value rather than a bound -- a handler that measured nothing would satisfy
// ">= 0" while reporting the same all-zero shape the refusals exist to prevent.

test("audit_tap_targets still measures a real element", async () => {
  // 20x20 against the default 44pt minimum: a working scorer MUST fail it.
  const { isError, json, text } = await call("audit_tap_targets", {
    elements: [{ selector: ".cta", w: 20, h: 20, role: "button", text: "Go" }]
  });
  assert.equal(isError, false, `a real element must not be refused: ${text.slice(0, 200)}`);
  assert.equal(json.total, 1, `expected the supplied target to be measured: ${text.slice(0, 200)}`);
  assert.equal(json.failing, 1, `20x20 is below the 44pt minimum and must fail: ${text.slice(0, 200)}`);
});

test("audit_content still evaluates a real item", async () => {
  // A metric with no number is the heuristic's own documented failure case.
  const { isError, json, text } = await call("audit_content", {
    items: [{ type: "metric", text: "engagement went way up" }]
  });
  assert.equal(isError, false, `a real item must not be refused: ${text.slice(0, 200)}`);
  assert.equal(json.summary.total, 1, `expected the supplied item to be evaluated: ${text.slice(0, 200)}`);
  assert.equal(json.summary.pass, 0, `a metric carrying no number+unit must not pass: ${text.slice(0, 200)}`);
});

test("audit_typography still measures real nodes", async () => {
  const { isError, json, text } = await call("audit_typography", {
    nodes: [
      { selector: "h1", fontPx: 32, lineHeightPx: 38, fontWeight: 700, tag: "h1" },
      { selector: "p", fontPx: 16, lineHeightPx: 24, fontWeight: 400, tag: "p" }
    ]
  });
  assert.equal(isError, false, `real nodes must not be refused: ${text.slice(0, 200)}`);
  assert.equal(json.nodes_analyzed, 2, `expected both nodes to be analysed: ${text.slice(0, 200)}`);
  assert.deepEqual(json.scale.sizes, [16, 32], `expected the two distinct sizes to be detected: ${text.slice(0, 200)}`);
});

test("audit_ios_privacy still scores a real Info.plist", async () => {
  // Measured, not assumed: an empty usage string is a WARNING here, not an
  // error, so `score` stays 100 and a `score < 100` control would fail on
  // correct code. What separates a real document from a blank one is the number
  // of checks that RAN -- the blank plist reported "1/1 privacy checks passed"
  // with an empty warnings array, this one reports 2/3 with a warning -- so the
  // control asserts exact counts. A handler that measured nothing cannot
  // satisfy them.
  const { isError, json, text } = await call("audit_ios_privacy", {
    info_plist: '<?xml version="1.0"?><plist version="1.0"><dict>' +
      "<key>NSLocationAlwaysAndWhenInUseUsageDescription</key><string></string>" +
      "</dict></plist>"
  });
  assert.equal(isError, false, `a real plist must not be refused: ${text.slice(0, 200)}`);
  assert.equal(typeof json.score, "number", `a real plist must produce a score: ${text.slice(0, 200)}`);
  assert.equal(json.passes.length, 2, `expected the two non-usage checks to pass: ${text.slice(0, 300)}`);
  assert.ok(Array.isArray(json.warnings) && json.warnings.length >= 1,
    `an empty usage string must raise a warning: ${text.slice(0, 300)}`);
  assert.ok(/^2\/3 /.test(json.summary),
    `three checks must have RUN against a real document: ${JSON.stringify(json.summary)}`);
});

test("evaluate_design still evaluates a real description", async () => {
  const { isError, json, text } = await call("evaluate_design", {
    description: "A pricing page with three plan cards and a monthly/annual toggle",
    context: "SaaS pricing page"
  });
  assert.equal(isError, false, `a real description must not be refused: ${text.slice(0, 200)}`);
  assert.equal(json.design_description,
    "A pricing page with three plan cards and a monthly/annual toggle",
    `expected the description to be carried through: ${text.slice(0, 200)}`);
  assert.ok(Array.isArray(json.principles_to_check) && json.principles_to_check.length > 0,
    `a real description must match at least one principle: ${text.slice(0, 300)}`);
});

// evaluate_design's OMITTED-description path is a separate contract from the
// blank-string refusal above, and folding them together is the mistake this
// pair exists to prevent: a caller with only before/after screenshots passes no
// description at all and must still get a diff, so the guard tests
// trim().length === 0 on a SUPPLIED string rather than falsiness.
//
// CORRECTION, recorded rather than quietly rewritten: this test used to pass
// { goals: ["accessibility"] } - which has no screenshots either - so it
// asserted the omitted-description contract with a call that can produce
// nothing at all, and it stood guard over the hollow scaffold described below.
// The comment's REASONING was right and its FIXTURE was wrong. It now passes
// the case the comment actually describes.
//
// Two solid-colour 4x4 PNGs, differing in every pixel. They are literals rather
// than generated so the fixture cannot drift with pngjs; the diff's numbers are
// not asserted here (that is image-diff's own suite), only that the call is
// answered rather than refused and that a diff was produced.
const WHITE_4X4_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAGUlEQVR4AWP8DwQMSICJAQ0wMaABJgY0AAAGXQQEOHaWpAAAAABJRU5ErkJggg==";
const BLACK_4X4_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAGklEQVR4AWNkYGD4z4AEmBjQABMDGmBiQAMAQRQBB4xFJUEAAAAASUVORK5CYII=";

test("evaluate_design with no description but a before/after pair is not refused", async () => {
  const { isError, json, text } = await call("evaluate_design", {
    before_screenshot: WHITE_4X4_PNG,
    after_screenshot: BLACK_4X4_PNG
  });
  assert.equal(isError, false, `an omitted description is not an empty one: ${text.slice(0, 200)}`);
  assert.ok(json.before_after_diff !== undefined,
    `a before/after pair must still produce a diff: ${text.slice(0, 300)}`);
});

// The other half of that guard, and the one no other assertion covers: a call
// carrying NEITHER a description NOR a before/after pair can produce nothing by
// construction - matching is gated on hasDescription, the diff on
// hasBeforeAfterScreenshots - and it used to answer with a scaffold reading
// total_principles: 0, total_patterns: 0 and evaluation_guidance telling the
// caller to "review the design against each principle's common violations".
// Guidance about an empty set reads as an evaluation that happened, which is
// exactly the all-clear-from-nothing shape this file exists to refuse.
//
// goals and context are asserted NOT to rescue it, and that is the measurement
// that makes this a refusal rather than an over-reach: they only widen the
// search text INSIDE the hasDescription branch, so a call with real goals and a
// real context matches zero principles just as an empty one does. A guard
// written against total_principles === 0 would have fired on legitimate calls;
// this one keys on the two inputs that decide whether work is possible at all.
test("evaluate_design refuses a call with neither description nor screenshots", async () => {
  for (const args of [
    {},
    { goals: ["accessibility"] },
    { goals: ["accessibility"], context: "checkout form" },
    { before_screenshot: WHITE_4X4_PNG },
    { after_screenshot: BLACK_4X4_PNG }
  ]) {
    const { isError, text } = await call("evaluate_design", args);
    assert.equal(isError, true,
      `nothing to evaluate must be refused, not answered with an empty scaffold: ${JSON.stringify(args).slice(0, 80)} -> ${text.slice(0, 200)}`);
    assert.match(text, /nothing to evaluate/i,
      `the refusal must name what is missing: ${text.slice(0, 200)}`);
  }
});
