/**
 * design-gauntlet.test.mjs — the pure comparator behind design_gauntlet.
 *
 * Every rule gets a FIRE fixture and shares one CONTROL (the on-par base
 * pair): a rule test without a control cannot distinguish "the rule fired"
 * from "everything fires". The browser probe IS exercised here as of the Sol
 * disposition round (2026-08-14) — three real-Chromium fixture tests at the
 * bottom, because "graded by the hand-run e2e" left every probe mechanism
 * (guard predicate, tally caps, lazy-scroll limit) outside the mutation
 * matrix, and a matrix blind to the probe reported 24/24 killed on a feature
 * whose measurement half had three defects (Sol P2). The probe pattern is the
 * house full-probe shape: chromium probed ONCE at module load, outside the
 * product code, walking playwright-import → launch → newPage → file:// goto →
 * close plus mkdtemp/writeFile/rm; a failed probe SKIPS the three browser
 * tests with the probe's own reason, and the matrix baseline pins skips at 0,
 * so a mutant graded on a browserless run aborts instead of surviving.
 * Mutation matrix:
 * .claude/gauntlet-2026-08-14/gauntlet-mutants.mjs (radii in its header).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  vocabularyCount,
  parseTrackingEm,
  primaryTrackingEm,
  compareGauntletMeasurements,
  GAUNTLET_LOOP_PROTOCOL,
  GAUNTLET_DISCIPLINE_NOTICE,
  measureGauntletPage
} from '../dist/design-gauntlet.js';
import { buildServer } from '../dist/index.js';

// n distinct values with equal counts — vocabularyCount reads this as n.
function mkTally(n, count = 10) {
  return Array.from({ length: n }, (_, i) => ({ value: 'v' + i, count }));
}

// A subject/reference pair on which NO rule fires. Every fire fixture below
// is this measurement with exactly one dimension mutated, so a rule that
// fires here is a defect in the rule, not the fixture.
function baseMeasurement(overrides = {}) {
  return {
    url: 'https://example.test/',
    viewport: '1440x900',
    color_scheme: 'light',
    visible_elements: 500,
    fonts_status: 'loaded',
    surfaces: { canvas: '#ffffff', tally: mkTally(2) },
    borders: { tally: mkTally(1) },
    text: { tally: mkTally(3) },
    tracking: {
      display: [{ value: '-0.64px = -0.02em', count: 10 }],
      body: [{ value: 'normal (0em)', count: 40 }]
    },
    accent: { candidates: mkTally(1), usesInFirstViewport: 2 },
    type: { families: mkTally(2), sizes: mkTally(5), weights: mkTally(3) },
    radii: { tally: mkTally(3) },
    elevation: { shadows: [{ value: 'inset 0 0 0 1px rgb(40, 40, 40)', count: 4 }], insetOnly: 4 },
    rhythm: { containers: [{ value: '1200px', count: 12 }], sectionPadding: [{ value: '96px / 96px', count: 6 }] },
    warnings: [],
    ...overrides
  };
}

function failingIds(comparison) {
  // bar carries ids only for the first 7; re-derive from diff for full checks.
  return comparison.bar.map((b) => b.id);
}

// --- vocabularyCount -------------------------------------------------------

test('vocabularyCount: empty tally is 0, not 1 and not NaN', () => {
  assert.equal(vocabularyCount([]), 0);
});

test('vocabularyCount: a dominant value with a long one-off tail reads as 1', () => {
  const tally = [{ value: 'a', count: 100 }].concat(mkTally(8, 1).map((e) => ({ value: 't' + e.value, count: 1 })));
  // total 108, 90% = 97.2 — the top value alone covers it.
  assert.equal(vocabularyCount(tally), 1);
});

test('vocabularyCount: exact 90% boundary is INCLUSIVE (seen >= coverage*total)', () => {
  // 9 of 10 occurrences is exactly 90% — one value suffices.
  assert.equal(vocabularyCount([{ value: 'a', count: 9 }, { value: 'b', count: 1 }]), 1);
  // 8 of 10 is under — both are needed.
  assert.equal(vocabularyCount([{ value: 'a', count: 8 }, { value: 'b', count: 2 }]), 2);
});

test('vocabularyCount: honours a coverage override', () => {
  assert.equal(vocabularyCount([{ value: 'a', count: 9 }, { value: 'b', count: 1 }], 1), 2);
});

test('vocabularyCount: sorts by count itself — input order must not matter', () => {
  const unsorted = [{ value: 'tail', count: 1 }, { value: 'dominant', count: 99 }];
  assert.equal(vocabularyCount(unsorted), 1);
});

// --- tracking parsing ------------------------------------------------------

test('parseTrackingEm: normal is 0, formatted values parse, garbage is null', () => {
  assert.equal(parseTrackingEm('normal (0em)'), 0);
  assert.equal(parseTrackingEm('-0.64px = -0.02em'), -0.02);
  assert.equal(parseTrackingEm('0.5px = 0.031em'), 0.031);
  assert.equal(parseTrackingEm('garbage'), null);
});

test('primaryTrackingEm: empty is null; the top-by-count entry wins', () => {
  assert.equal(primaryTrackingEm([]), null);
  const mixed = [
    { value: '0.5px = 0.031em', count: 2 },
    { value: 'normal (0em)', count: 9 }
  ];
  assert.equal(primaryTrackingEm(mixed), 0);
});

// --- on-par control --------------------------------------------------------

test('CONTROL: the base pair is on_par — 13 diff rows, none worse, empty bar and fixes', () => {
  const c = compareGauntletMeasurements(baseMeasurement(), baseMeasurement());
  assert.equal(c.diff.length, 13, 'one diff row per rule, always emitted');
  assert.equal(c.diff.filter((d) => d.subject_worse).length, 0);
  assert.equal(c.verdict.on_par, true);
  assert.equal(c.verdict.biggest_gap, null);
  assert.deepEqual(c.verdict.failing_mechanisms, []);
  assert.deepEqual(c.bar, []);
  assert.deepEqual(c.fixes, { mechanical: [], needs_a_decision: [] });
});

// --- per-rule fire fixtures ------------------------------------------------

test('surfaces-ladder fires when the reference has a ladder and the subject has none (needs_a_decision, high)', () => {
  const subject = baseMeasurement({ surfaces: { canvas: '#fff', tally: mkTally(1) } });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['surfaces-ladder']);
  assert.equal(c.verdict.on_par, false);
  assert.equal(c.fixes.needs_a_decision.length, 1);
  assert.equal(c.fixes.mechanical.length, 0);
  assert.equal(c.fixes.needs_a_decision[0].effect, 'high');
});

test('surfaces-sprawl fires only past reference + 3 (mechanical)', () => {
  const at = baseMeasurement({ surfaces: { canvas: '#fff', tally: mkTally(5) } });
  assert.equal(compareGauntletMeasurements(at, baseMeasurement()).verdict.on_par, true, '5 vs 2 is within budget');
  const over = baseMeasurement({ surfaces: { canvas: '#fff', tally: mkTally(6) } });
  const c = compareGauntletMeasurements(over, baseMeasurement());
  assert.deepEqual(failingIds(c), ['surfaces-sprawl']);
  assert.equal(c.fixes.mechanical.length, 1);
});

test('hairline-sprawl fires only past reference + 2 (mechanical, high)', () => {
  const at = baseMeasurement({ borders: { tally: mkTally(3) } });
  assert.equal(compareGauntletMeasurements(at, baseMeasurement()).verdict.on_par, true, '3 vs 1 is within budget');
  const over = baseMeasurement({ borders: { tally: mkTally(4) } });
  const c = compareGauntletMeasurements(over, baseMeasurement());
  assert.deepEqual(failingIds(c), ['hairline-sprawl']);
  assert.equal(c.fixes.mechanical[0].effect, 'high');
});

test('text-roles-flat fires when the reference separates roles and the subject does not', () => {
  const subject = baseMeasurement({ text: { tally: mkTally(2) } });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['text-roles-flat']);
  // The inverse must NOT fire: a flat REFERENCE never penalises the subject.
  const flatRef = baseMeasurement({ text: { tally: mkTally(2) } });
  assert.equal(compareGauntletMeasurements(baseMeasurement(), flatRef).verdict.on_par, true);
});

test('text-roles-sprawl fires only past reference + 3', () => {
  const subject = baseMeasurement({ text: { tally: mkTally(7) } });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['text-roles-sprawl']);
});

test('tracking-display fires when the subject tracks >0.005em looser; the check names the reference value', () => {
  const subject = baseMeasurement({
    tracking: { display: [{ value: 'normal (0em)', count: 10 }], body: [{ value: 'normal (0em)', count: 40 }] }
  });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['tracking-display']);
  assert.ok(c.bar[0].check.includes('-0.02em'), 'the bar is derived from the measured reference, never taste');
  assert.equal(c.verdict.biggest_gap, 'display tracking');
});

test('tracking-display: unmeasured on either side is worse:false with an honest note, never a fire', () => {
  const subject = baseMeasurement({
    tracking: { display: [], body: [{ value: 'normal (0em)', count: 40 }] }
  });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.equal(c.verdict.on_par, true, 'unmeasurable must be marked, not counted as a failure');
  const row = c.diff.find((d) => d.metric === 'display letter-spacing');
  assert.equal(row.subject, 'unmeasured');
  assert.ok(row.note.includes('could not be measured'));
});

test('tracking-body fires on positive subject tracking when the reference does not share it', () => {
  const subject = baseMeasurement({
    tracking: { display: [{ value: '-0.64px = -0.02em', count: 10 }], body: [{ value: '0.5px = 0.031em', count: 20 }] }
  });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['tracking-body']);
  // A reference that ALSO tracks positive removes the fire — the bar comes
  // from the reference, and matching it cannot be worse than it.
  const posRef = baseMeasurement({
    tracking: { display: [{ value: '-0.64px = -0.02em', count: 10 }], body: [{ value: '0.5px = 0.031em', count: 20 }] }
  });
  assert.equal(compareGauntletMeasurements(subject, posRef).verdict.on_par, true);
});

test('tracking-body: an unmeasured reference is worse:false with an honest note, never a fire', () => {
  // The first shipped shape treated a missing REFERENCE measurement as
  // license to fire (re === null read as "the reference does not share it"),
  // so a reference whose body text fell outside the 13–20px window produced
  // an on_par:false failure with no benchmark behind it (Sol P1, 2026-08-14).
  const subject = baseMeasurement({
    tracking: { display: [{ value: '-0.64px = -0.02em', count: 10 }], body: [{ value: '0.5px = 0.031em', count: 20 }] }
  });
  const nullRef = baseMeasurement({
    tracking: { display: [{ value: '-0.64px = -0.02em', count: 10 }], body: [] }
  });
  const c = compareGauntletMeasurements(subject, nullRef);
  assert.equal(c.verdict.on_par, true, 'unmeasurable must be marked, not counted as a failure');
  const row = c.diff.find((d) => d.metric === 'body letter-spacing');
  assert.equal(row.reference, 'unmeasured');
  assert.equal(row.subject_worse, false);
  assert.ok(row.note.includes('could not be measured'));
});

test('accent-overuse fires past max(reference, 2) uses; the floor of 2 protects against a zero-accent reference', () => {
  const subject = baseMeasurement({ accent: { candidates: mkTally(1), usesInFirstViewport: 5 } });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['accent-overuse']);
  // Reference uses 0: the budget floors at 2, so a subject at 2 still passes.
  const zeroRef = baseMeasurement({ accent: { candidates: [], usesInFirstViewport: 0 } });
  const twoUses = baseMeasurement({ accent: { candidates: mkTally(1), usesInFirstViewport: 2 } });
  assert.equal(compareGauntletMeasurements(twoUses, zeroRef).verdict.on_par, true);
});

test('type-scale-sprawl needs BOTH >10 sizes and more than the reference', () => {
  // Equal-count tallies meet the 90% coverage bar one value early past n=10,
  // so 12 distinct sizes read as a vocabulary of 11 — the smallest fixture
  // that clears the >10 gate.
  const sprawled = baseMeasurement({ type: { families: mkTally(2), sizes: mkTally(12), weights: mkTally(3) } });
  const c = compareGauntletMeasurements(sprawled, baseMeasurement());
  assert.deepEqual(failingIds(c), ['type-scale-sprawl']);
  // A reference whose own vocabulary is larger absolves the subject.
  const bigRef = baseMeasurement({ type: { families: mkTally(2), sizes: mkTally(13), weights: mkTally(3) } });
  assert.equal(compareGauntletMeasurements(sprawled, bigRef).verdict.on_par, true);
});

test('family-budget fires past max(reference, 2) families (needs_a_decision)', () => {
  const subject = baseMeasurement({ type: { families: mkTally(3), sizes: mkTally(5), weights: mkTally(3) } });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['family-budget']);
  assert.equal(c.fixes.needs_a_decision.length, 1);
});

test('radii-sprawl fires only past reference + 2', () => {
  const subject = baseMeasurement({ radii: { tally: mkTally(6) } });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['radii-sprawl']);
});

test('elevation-strategy fires when the reference grounds with insets and the subject hovers on drop shadows', () => {
  const subject = baseMeasurement({
    elevation: { shadows: [{ value: 'rgba(0, 0, 0, 0.2) 0px 4px 12px 0px', count: 5 }], insetOnly: 0 }
  });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.deepEqual(failingIds(c), ['elevation-strategy']);
  assert.equal(c.fixes.needs_a_decision.length, 1);
  // A shadow-grounded REFERENCE makes drop shadows compatible, not worse.
  const shadowRef = baseMeasurement({
    elevation: { shadows: [{ value: 'rgba(0, 0, 0, 0.2) 0px 4px 12px 0px', count: 5 }], insetOnly: 0 }
  });
  assert.equal(compareGauntletMeasurements(subject, shadowRef).verdict.on_par, true);
});

test('rhythm-container NEVER fires — container width is a choice, not a defect', () => {
  const subject = baseMeasurement({ rhythm: { containers: [{ value: '760px', count: 3 }], sectionPadding: [] } });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.equal(c.verdict.on_par, true);
  const row = c.diff.find((d) => d.dimension === 'rhythm');
  assert.equal(row.subject_worse, false);
  assert.equal(row.subject, '760px');
});

// --- ordering, bar cap, verdict --------------------------------------------

test('ordering: effect first, then perceived-difference dimension rank — display tracking outranks everything', () => {
  const subject = baseMeasurement({
    tracking: { display: [{ value: 'normal (0em)', count: 10 }], body: [{ value: 'normal (0em)', count: 40 }] },
    text: { tally: mkTally(2) },
    borders: { tally: mkTally(4) },
    surfaces: { canvas: '#fff', tally: mkTally(1) },
    accent: { candidates: mkTally(1), usesInFirstViewport: 5 }
  });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  // All five are effect:high; the tie-break is tracking < text < hairlines < surfaces < accent.
  assert.deepEqual(failingIds(c), [
    'tracking-display', 'text-roles-flat', 'hairline-sprawl', 'surfaces-ladder', 'accent-overuse'
  ]);
  assert.equal(c.verdict.biggest_gap, 'display tracking');
  assert.deepEqual(c.verdict.failing_mechanisms, [
    'display tracking', 'text role separation', 'hairline discipline', 'surface elevation ladder', 'accent frequency'
  ]);
});

test('bar caps at 7 while fixes carry every failing mechanism', () => {
  const subject = baseMeasurement({
    surfaces: { canvas: '#fff', tally: mkTally(6) },
    borders: { tally: mkTally(4) },
    text: { tally: mkTally(7) },
    tracking: { display: [{ value: 'normal (0em)', count: 10 }], body: [{ value: '0.5px = 0.031em', count: 20 }] },
    accent: { candidates: mkTally(1), usesInFirstViewport: 5 },
    type: { families: mkTally(3), sizes: mkTally(12), weights: mkTally(3) },
    radii: { tally: mkTally(6) },
    elevation: { shadows: [{ value: 'rgba(0, 0, 0, 0.2) 0px 4px 12px 0px', count: 5 }], insetOnly: 0 }
  });
  const c = compareGauntletMeasurements(subject, baseMeasurement());
  assert.equal(c.verdict.on_par, false);
  assert.equal(c.verdict.failing_mechanisms.length, 10, 'ten mechanisms fail on this fixture');
  assert.equal(c.bar.length, 7, 'the bar stays checkable — capped at 7');
  assert.equal(c.fixes.mechanical.length + c.fixes.needs_a_decision.length, 10, 'fixes are never capped');
  // The join contract: loop-protocol step 2 tells a consumer to find the fix
  // for each failing mechanism BY NAME, so fix entries must be keyed
  // `mechanism` with the same strings verdict.failing_mechanisms carries.
  // (The first shipped shape keyed fixes by `dimension` and this suite stayed
  // green — the real-pair e2e caught the broken join; this assertion owns it now.)
  const fixMechanisms = new Set([...c.fixes.mechanical, ...c.fixes.needs_a_decision].map((f) => f.mechanism));
  for (const m of c.verdict.failing_mechanisms) {
    assert.ok(fixMechanisms.has(m), `a fix entry keyed mechanism="${m}" exists for every failing mechanism`);
  }
  // The three highs lead the bar in dimension order.
  assert.deepEqual(failingIds(c).slice(0, 3), ['tracking-display', 'hairline-sprawl', 'accent-overuse']);
});

// --- embedded protocol -----------------------------------------------------

test('the embedded loop protocol carries the exit gate and the fresh-critic rule', () => {
  assert.equal(GAUNTLET_LOOP_PROTOCOL.length, 6);
  assert.ok(GAUNTLET_LOOP_PROTOCOL.some((s) => s.includes('FRESH context')));
  assert.ok(GAUNTLET_LOOP_PROTOCOL.some((s) => s.includes('NO fixed round count')));
  // The load-bearing sentences are pinned EXACTLY, not by topic substring: an
  // earlier draft matched only includes('on_par'), which a protocol saying
  // "ANY critic passing is enough" or "report done, note on_par later" would
  // still satisfy (Sol P2, 2026-08-14). These three phrases ARE the gate.
  assert.ok(GAUNTLET_LOOP_PROTOCOL[3].includes('ALL critics must pass'), 'step 4 requires every critic to pass');
  assert.ok(GAUNTLET_LOOP_PROTOCOL[4].includes('exits only when verdict.on_par is true'), 'step 5 makes on_par the sole exit');
  assert.ok(GAUNTLET_LOOP_PROTOCOL[5].includes('never report the work finished while verdict.on_par is false'), 'step 6 forbids a false done');
  assert.ok(GAUNTLET_DISCIPLINE_NOTICE.includes('not the identity'));
});

// --- gating ----------------------------------------------------------------

test('design_gauntlet registers locally and is absent from the anonymous remote surface', () => {
  const local = buildServer({ remote: false });
  assert.ok(local._registeredTools.design_gauntlet, 'local stdio server registers design_gauntlet');
  // Remote half in a CHILD PROCESS (house pattern, test/user-systems.test.mjs):
  // setRemoteRuntime() is a one-way per-process latch, and a buildServer
  // ({ remote: true }) here would flip launchAuditChromium() onto the
  // playwright-core/@sparticuz remote path for the three browser tests below —
  // measured: they fail in-suite while passing standalone, and the remote
  // egress-proxy machinery leaks an open handle that hangs the run after the
  // last test. The latch is the reason this cannot be an in-process build.
  const script = `
    const { buildServer } = await import('./dist/index.js');
    const remote = buildServer({ remote: true });
    if (remote._registeredTools.design_gauntlet !== undefined) {
      console.error('design_gauntlet leaked onto the anonymous remote surface');
      process.exit(1);
    }
    console.log('REMOTE_GAUNTLET_ABSENT');
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' },
    encoding: 'utf-8',
    timeout: 60000
  });
  assert.equal(run.status, 0, `remote child failed:\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /REMOTE_GAUNTLET_ABSENT/, 'gated off the anonymous 45-tool surface');
});

// --- browser fixtures (real Chromium) --------------------------------------
//
// Three probe mechanisms live INSIDE page.evaluate and are invisible to every
// unit test above: the visibility predicate the guard now shares with the
// tallies, the TALLY_CAP truncation, and the re-read lazy-scroll limit. Each
// gets a real-Chromium fixture here, because the pre-fix defects all passed a
// green 24-mutant matrix — the matrix was blind to the probe (Sol P2,
// 2026-08-14). House full-probe pattern: chromium probed ONCE at module load,
// OUTSIDE the product code (measureGauntletPage flattens every launch failure
// into CaptureUnavailableError, so probing through it cannot separate "no
// browser" from "the launcher broke"). The probe walks playwright-import →
// launch → newPage → file:// goto → close plus mkdtemp/writeFile/rm, and a
// failed probe SKIPS the three tests carrying its own reason — the matrix
// baseline pins skips at 0, so a browserless run aborts the harness instead
// of grading mutants as survivors.

let gauntletChromiumOk = false;
let gauntletProbeReason = '';
try {
  const { chromium } = await import('playwright');
  const probeDir = await mkdtemp(join(tmpdir(), 'gauntlet-probe-'));
  try {
    const probePath = join(probeDir, 'probe.html');
    await writeFile(probePath, '<!doctype html><title>probe</title>');
    const b = await chromium.launch({ headless: true });
    try {
      const p = await b.newPage();
      await p.goto(pathToFileURL(probePath).href);
    } finally {
      await b.close();
    }
    gauntletChromiumOk = true;
  } finally {
    await rm(probeDir, { recursive: true, force: true });
  }
} catch (e) {
  gauntletProbeReason = e && e.message ? e.message : String(e);
}

const withFixture = async (html, fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'gauntlet-fixture-'));
  try {
    const file = join(dir, 'page.html');
    await writeFile(file, html);
    return await fn(pathToFileURL(file).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

test('guard: sized opacity:0 decoys do not satisfy the visible-element count', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // 30 sized, geometry-passing divs at opacity:0 plus 5 truly visible ones.
  // Pre-fix the guard ran a separate geometry-only count: 35 >= 20, no
  // warning, while every tally measured only the 5 — the exact Sol P1 shape.
  // Post-fix the guard reads the probe's own visibleCount (5-ish), warns, and
  // eats one 2.5s retry; the assertion is the warning PLUS the count.
  // AND the ancestor case (Sol R2 P1): opacity is not inherited, so 30 sized
  // children with EXPLICIT opacity:1 inside an opacity:0 wrapper report own
  // opacity "1" while rendering nothing. Under an own-opacity-only predicate
  // they count (35 >= 20, no warning) and their greens reach the surfaces
  // tally — both assertions below discriminate that revert.
  const html = '<!doctype html><title>decoy</title><body>' +
    Array.from({ length: 30 }, (_, i) =>
      '<div style="width:200px;height:60px;opacity:0;background:rgb(' + (i + 1) + ',0,0)"></div>').join('') +
    '<div style="opacity:0">' +
    Array.from({ length: 30 }, (_, i) =>
      '<div style="width:200px;height:60px;opacity:1;background:rgb(0,' + (i + 1) + ',0)">ghost</div>').join('') +
    '</div>' +
    Array.from({ length: 5 }, () =>
      '<div style="width:200px;height:60px;background:rgb(10,20,30)">visible</div>').join('') +
    '</body>';
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  assert.ok(m.visible_elements < 20, 'opacity:0 decoys (direct AND under an opacity:0 ancestor) are filtered from the count the guard reads (got ' + m.visible_elements + ')');
  assert.ok(m.warnings.some((w) => w.includes('visible elements')), 'the low-count warning fires');
  assert.ok(!m.warnings.some((w) => w.includes('hit the in-page cap')), 'no truncation warning on a tiny page');
  // And the decoys never reached the tallies either — one rule, one function.
  assert.ok(!m.surfaces.tally.some((e) => e.value === '#010000'), 'an opacity:0 background is not tallied');
  assert.ok(!m.surfaces.tally.some((e) => e.value === '#000f00'), 'an opacity:1 background under an opacity:0 ancestor is not tallied');
});

test('tallies: a page past TALLY_CAP truncates at 100 and WARNS instead of silently slicing', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // 120 divs, each a UNIQUE value in EVERY capped dimension — background,
  // border color, text color, font family, font size, radius, shadow — so all
  // seven tallies hold 120 distinct entries pre-cap. Pre-fix the display
  // slice ran silently and the vocabulary comparison consumed a truncated
  // count as if it were the page. Asserting every warning BY NAME is what
  // guards each of cap()'s seven call sites individually: replacing any one
  // with a bare .slice(0, 100) drops exactly its name from the warning list
  // (Sol R2 P2 — B2 used to prove only the surfaces site, and G28 mutates
  // the shared constant, so a per-site silent slice stayed green).
  const html = '<!doctype html><title>sprawl</title><body><script>' +
    'for (let i = 0; i < 120; i++) {' +
    '  const d = document.createElement("div");' +
    '  d.style.cssText = "width:200px;height:20px;' +
    'background:rgb(" + (i+1) + "," + ((i*7)%256) + "," + ((i*13)%256) + ");' +
    'border-top:1px solid rgb(" + ((i*11)%256) + "," + (i+1) + "," + ((i*3)%256) + ");' +
    'color:rgb(" + ((i*5)%256) + "," + ((i*17)%256) + "," + (i+1) + ");' +
    'font-family:fam" + i + ";' +
    'font-size:" + (10 + i * 0.1) + "px;' +
    'border-radius:" + (i + 1) + "px;' +
    'box-shadow:0 1px " + (i + 1) + "px rgba(0,0,0,0.4)";' +
    '  d.textContent = "s" + i;' +
    '  document.body.appendChild(d);' +
    '}' +
    '</script></body>';
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const capped = [
    ['surfaces', m.surfaces.tally],
    ['borders', m.borders.tally],
    ['text colors', m.text.tally],
    ['font families', m.type.families],
    ['font sizes', m.type.sizes],
    ['radii', m.radii.tally],
    ['shadows', m.elevation.shadows]
  ];
  for (const [name, tally] of capped) {
    assert.equal(tally.length, 100, 'the ' + name + ' tally is capped at exactly TALLY_CAP');
    assert.ok(m.warnings.some((w) => w.includes(name + ' tally hit the in-page cap')), 'the truncation warning names ' + name);
  }
  assert.ok(!m.warnings.some((w) => w.includes('visible elements')), '120 visible divs clear the guard');
});

test('lazy-load: content appended DURING the scroll is reached and measured', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // Two-stage growth: stage 1 appends a 3000px div near the bottom of the
  // initial ~2880px page; stage 2 appends the rgb(9,8,7) marker near the
  // bottom of the GROWN page (~5880px). A limit captured once stops at
  // y=2880 (viewport bottom 3780 < 5830), so only the re-read limit ever
  // fires stage 2 — the marker's presence in the surfaces tally IS the fix.
  // 24 visible rows up top keep the low-count retry out of the timing.
  const html = '<!doctype html><title>lazy</title><body>' +
    Array.from({ length: 24 }, (_, i) =>
      '<div style="width:400px;height:120px;background:rgb(200,200,' + (100 + i) + ')">row</div>').join('') +
    '<script>' +
    'let stage = 0;' +
    'window.addEventListener("scroll", () => {' +
    '  const nearBottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 50;' +
    '  if (!nearBottom) return;' +
    '  if (stage === 0) {' +
    '    stage = 1;' +
    '    const d = document.createElement("div");' +
    '    d.style.cssText = "width:400px;height:3000px;background:rgb(1,2,3)";' +
    '    document.body.appendChild(d);' +
    '  } else if (stage === 1) {' +
    '    stage = 2;' +
    '    const d = document.createElement("div");' +
    '    d.style.cssText = "width:400px;height:500px;background:rgb(9,8,7)";' +
    '    d.textContent = "deep lazy content";' +
    '    document.body.appendChild(d);' +
    '  }' +
    '});' +
    '</script></body>';
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  assert.ok(m.surfaces.tally.some((e) => e.value === '#010203'), 'stage-1 lazy content is measured (precondition: the feed grew at all)');
  assert.ok(m.surfaces.tally.some((e) => e.value === '#090807'), 'stage-2 content — appended past the ORIGINAL page height — is measured');
});

// --- device scale factor ---------------------------------------------------

const HAIRLINE_ROWS = (style, extra) => '<body>' +
  Array.from({ length: 24 }, (_, i) =>
    '<div class="row" style="width:400px;height:40px;background:rgb(250,250,250);border-radius:10.5px;' +
    (extra ? extra(i) : '') + style(i) + '">row</div>').join('') + '</body>';

test('hairlines: the engine rounds sub-pixel strokes to 1px at EVERY scale — the authored value is recovered instead', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // Pins a measured engine fact that a plausible-sounding theory got wrong.
  // The theory was a device-pixel-grid collapse — 0.5px unresolvable at dsf 1,
  // recoverable at dsf 2. Measured 2026-08-14 that is FALSE: Blink rounds any
  // non-zero border-width up to 1px in the used value, in getComputedStyle and
  // in layout alike, at dsf 1, 2 AND 3. Scale does not touch it. So the tally
  // is built from the authored CSS, and the dsf pair below is the guard against
  // anyone re-deriving the scale theory: both scales must agree.
  // The radius assertion is the control — it proves the fixture really authors
  // sub-pixel values and that the engine keeps them elsewhere, so a green
  // border assertion cannot be the fixture silently doing nothing.
  const html = '<!doctype html><title>hairline</title>' +
    HAIRLINE_ROWS((i) => 'border-top:0.5px solid rgb(' + (10 + i) + ',20,30)');

  const at1 = await withFixture(html, (url) => measureGauntletPage(url, { device_scale_factor: 1 }));
  const at2 = await withFixture(html, (url) => measureGauntletPage(url, { device_scale_factor: 2 }));

  const widths = (m) => new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  for (const [label, m] of [['scale 1', at1], ['scale 2', at2]]) {
    assert.ok(widths(m).has('0.5px'), 'at ' + label + ' the authored 0.5px hairline is recovered from inline style');
    assert.ok(!widths(m).has('1px'), 'at ' + label + ' the rounded 1px reading does not reach the tally');
    assert.ok(
      m.warnings.some((w) => w.includes('sub-pixel border(s) were recovered')),
      'at ' + label + ' the recovery is disclosed — the tally is finer than the render'
    );
    assert.ok(
      !m.warnings.some((w) => w.includes('Hairline caveat')),
      'at ' + label + ' nothing was unresolvable, so the caveat does NOT fire — it is a real signal, not decoration'
    );
  }
  assert.deepEqual(widths(at1), widths(at2), 'device scale factor does not move the hairline vocabulary');

  // Control: sub-pixel RADIUS is untouched by the engine, so the limitation is
  // width-specific and the recovery is not blanket sub-pixel pessimism.
  assert.ok(
    at2.radii.tally.some((e) => e.value === '10.5px'),
    'border-radius keeps sub-pixel precision — the fixture authored 10.5px and the engine kept it'
  );
  assert.equal(at1.device_scale_factor, 1, 'the measurement reports the scale it was taken at');
  assert.equal(at2.device_scale_factor, 2, 'the measurement reports the scale it was taken at');
});

test('hairlines: authored width is recovered from a STYLESHEET rule, not just inline style', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The inline path is the easy half. Real pages put hairlines in a class, and
  // the `border` SHORTHAND is the common authoring form — the CSSOM expands it
  // into style.borderTopWidth, which is what makes this recoverable. Dropping
  // the stylesheet walk leaves this at 1px while the test above stays green.
  const html = '<!doctype html><title>sheet-hairline</title>' +
    '<style>.row { border-top: 0.5px solid #123456; } ' +
    '@media (min-width: 100px) { .row { border-top-width: 0.5px; } }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('0.5px'), 'a class-authored hairline (and its @media override) is recovered');
  assert.ok(!widths.has('1px'), 'the rounded reading does not reach the tally');
});

test('hairlines: a specificity conflict is reported ambiguous, never guessed', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // Two rules match every row: a LATER 0.5px and an EARLIER higher-specificity
  // 1px. Source order says 0.5px, specificity says 1px, and the probe computes
  // specificity for neither — so the honest answer is "unresolved". Guessing
  // source order here would silently report a hairline vocabulary the page does
  // not have, which is the exact failure this dimension exists to catch.
  const html = '<!doctype html><title>conflict</title>' +
    '<style>body div.row { border-top: 1px solid #123456; } .row { border-top: 0.5px solid #123456; }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('1px'), 'the unresolved element keeps its computed reading');
  assert.ok(!widths.has('0.5px'), 'source order is NOT taken as the winner');
  assert.ok(
    m.warnings.some((w) => w.includes('Hairline caveat') && w.includes('specificity')),
    'the caveat names specificity as the reason the tally is provisional'
  );
});

// --- all four edges --------------------------------------------------------

const SIDE_BASE = 'width:400px;height:40px;background:rgb(250,250,250);';
const SIDE_ROWS = (n, style) =>
  Array.from({ length: n }, () => '<div class="row" style="' + SIDE_BASE + style + '">row</div>').join('');

test('borders: every edge is read, not just the top — a bottom-only divider is the common case', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The probe read borderTopWidth alone, which is the one edge a real page is
  // LEAST likely to use on its own: a divider is authored border-bottom, a
  // sidebar rule border-left, a tab strip border-right. Under the top-only
  // probe this whole fixture reports NO border vocabulary at all — every row
  // has a visible stroke and the tally is empty, which reads to the caller as
  // a page with no border treatments rather than a probe that did not look.
  // Dropping any single side from SIDES reddens exactly its own assertion.
  const html = '<!doctype html><title>sides</title><body>' +
    SIDE_ROWS(8, 'border-bottom:2px solid #111111') +
    SIDE_ROWS(8, 'border-left:3px solid #222222') +
    SIDE_ROWS(8, 'border-right:4px solid #333333') + '</body>';
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const values = new Set(m.borders.tally.map((e) => e.value));
  assert.ok(values.has('2px #111111'), 'a bottom-only border reaches the tally');
  assert.ok(values.has('3px #222222'), 'a left-only border reaches the tally');
  assert.ok(values.has('4px #333333'), 'a right-only border reaches the tally');
});

test('borders: sub-pixel recovery is matched PER SIDE — a thick top does not poison a hairline bottom', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The authored-rule table holds one entry per (selector, side), and the
  // lookup must filter on side. Drop `if (r.side !== side) continue` and the
  // 3px top joins the bottom's candidate list: matched becomes [3, 0.5] in
  // SIDES push order, the last entry is the 0.5 so the `>= 1` early return
  // does not fire, and `matched.some(w => w >= 1)` then reports the row
  // AMBIGUOUS. So the failure is not a wrong number — it is a real hairline
  // silently downgraded to "unresolvable" by a border on an unrelated edge,
  // with the caveat warning firing on a page that has no conflict in it.
  // Both directions are asserted: the hairline is recovered AND the thick
  // edge still reads at its authored width.
  const html = '<!doctype html><title>per-side</title>' +
    '<style>.row { border-bottom: 0.5px solid #123456; border-top: 3px solid #654321; }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const values = new Set(m.borders.tally.map((e) => e.value));
  assert.ok(values.has('0.5px #123456'), 'the bottom hairline is recovered on its own side');
  assert.ok(values.has('3px #654321'), 'the top border is unaffected and keeps its authored width');
  assert.ok(
    m.warnings.some((w) => w.includes('sub-pixel border(s) were recovered')),
    'the recovery is disclosed'
  );
  assert.ok(
    !m.warnings.some((w) => w.includes('Hairline caveat')),
    'nothing is ambiguous here — a second edge is not a specificity conflict'
  );
});

test('borders: one element with four identical edges is ONE treatment, not four', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // Reading four edges multiplies the tally by four on the commonest authoring
  // form there is — the `border` shorthand. The count is what the vocabulary
  // report is built from, so an inflated count does not add a value, it
  // reweights every existing one against the others.
  const html = '<!doctype html><title>dedupe</title><body>' +
    SIDE_ROWS(24, 'border:2px solid #445566') + '</body>';
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const entry = m.borders.tally.find((e) => e.value === '2px #445566');
  assert.ok(entry, 'precondition: the uniform border is measured at all');
  assert.equal(entry.count, 24, 'counted once per ELEMENT — 96 would be once per edge');
});

test('device_scale_factor: defaults to 1 and is REJECTED, never clamped, outside (0, 4]', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // A clamp would report a hairline vocabulary measured at a factor the caller
  // never asked for — the quiet wrongness this dimension exists to catch. The
  // rejection is asserted BEFORE any browser work, so these throw fast.
  const html = '<!doctype html><title>dsf</title><body>' +
    Array.from({ length: 24 }, () =>
      '<div style="width:400px;height:40px;background:rgb(9,9,9)">row</div>').join('') + '</body>';

  await withFixture(html, async (url) => {
    const dflt = await measureGauntletPage(url);
    assert.equal(dflt.device_scale_factor, 1, 'the default stays 1 — raising it would move every existing comparison');

    for (const bad of [0, -1, 5, NaN, Infinity]) {
      await assert.rejects(
        () => measureGauntletPage(url, { device_scale_factor: bad }),
        /device_scale_factor must be a number/,
        'rejects ' + String(bad)
      );
    }
  });
});
