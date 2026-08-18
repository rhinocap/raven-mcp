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
import { createServer } from 'node:http';

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
    // A loopback LISTEN is a second environmental prerequisite as of round 6:
    // `withHttpFixture` needs one, and a probe narrower than the tests it gates
    // reports an environment failure as a product defect (this repo's own
    // round-6 alignment lesson, arrived at here independently). `listen` gets
    // its own 'error' listener because an emitted 'error' with nothing
    // listening throws from the EVENT LOOP, outside any surrounding try/catch,
    // and can therefore never be classified.
    const probeServer = createServer((_req, res) => { res.end('probe'); });
    await new Promise((resolve, reject) => {
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', resolve);
    });
    try {
      const b = await chromium.launch({ headless: true });
      try {
        const p = await b.newPage();
        await p.goto(pathToFileURL(probePath).href);
        const r = await p.goto('http://127.0.0.1:' + probeServer.address().port + '/');
        if (!r || !r.ok()) throw new Error('loopback probe navigation failed');
      } finally {
        await b.close();
      }
    } finally {
      await new Promise((resolve) => probeServer.close(resolve));
    }
    gauntletChromiumOk = true;
  } finally {
    await rm(probeDir, { recursive: true, force: true });
  }
} catch (e) {
  gauntletProbeReason = e && e.message ? e.message : String(e);
}

// `extra` writes SIBLING files next to page.html. It exists for exactly one
// case and the mechanism was MEASURED rather than assumed: from a file:// page
// a sibling file:// <link rel=stylesheet> LOADS and applies, and then throws
// SecurityError on .cssRules — which is what makes sheetsBlocked increment.
// The obvious alternative, a `data:text/css` link, is READABLE and leaves
// sheetsBlocked at 0, so a fixture built that way would measure nothing.
const withFixture = async (html, fn, extra) => {
  const dir = await mkdtemp(join(tmpdir(), 'gauntlet-fixture-'));
  try {
    const file = join(dir, 'page.html');
    await writeFile(file, html);
    for (const [name, body] of Object.entries(extra || {})) await writeFile(join(dir, name), body);
    return await fn(pathToFileURL(file).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

// The SAME-ORIGIN counterpart, and it exists because a measurement showed the
// file:// @import fixture below can only ever exercise ONE of the two arms its
// comment claimed to cover. Measured with a standalone probe: from a file://
// page, `'cssRules' in importRule` is FALSE (the imported sheet hangs off
// `rule.styleSheet`, which is the whole reason the recursion missed it) and
// `importRule.styleSheet.cssRules` THROWS SecurityError — so that fixture is
// deterministically the sheetsBlocked path, and `sheetsBlocked > 0` refuses
// every recovery globally. The CONFLICT arm — an imported !important rule
// COLLECTED and outranking the inline width — was exercised by nothing. Served
// over loopback http the import is same-origin and readable, which is the only
// way to reach it. Each response carries an explicit Content-Type: a stylesheet
// served as text/html is not applied in standards mode, and the fixture would
// then measure nothing while still looking like a passing test.
const withHttpFixture = async (files, fn) => {
  const server = createServer((req, res) => {
    const name = (req.url || '/').replace(/^\//, '').split('?')[0] || 'page.html';
    const body = files[name];
    if (body === undefined) { res.statusCode = 404; res.end('no ' + name); return; }
    res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    return await fn('http://127.0.0.1:' + server.address().port + '/page.html');
  } finally {
    await new Promise((resolve) => server.close(resolve));
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
    m.warnings.some((w) => w.includes('Hairline caveat') && w.includes('does not rank the cascade')),
    'the caveat names the UNRANKED CASCADE as the reason the tally is provisional. It deliberately ' +
    'does not say "specificity": this fixture happens to be a specificity conflict, but the ' +
    'increment site fires on any pair of matched rules declaring different widths — including an ' +
    'equal-specificity pair separated only by source order — and the probe ranks none of those ' +
    'tie-breaks, so naming one of them would send a caller looking for the wrong collision'
  );
});

test('hairlines: two SUB-PIXEL rules that disagree are unresolved, not last-wins', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The conflict test above pairs a sub-pixel rule with a FULL-pixel one, which
  // the old guard caught with `matched.some(w => w >= 1)`. That guard is blind
  // to the case where both candidates are sub-pixel: 0.25px against 0.5px is
  // decided by specificity exactly as much as 0.5px against 1px, and the probe
  // computes specificity for neither — yet source order silently answered 0.5px
  // with no caveat at all, which is a fabricated hairline vocabulary reported
  // with full confidence. Two DIFFERENT wrong answers are available here, so
  // neither may appear.
  const html = '<!doctype html><title>subpixel-conflict</title>' +
    '<style>body div.row { border-top: 0.25px solid #123456; } ' +
    '.row { border-top: 0.5px solid #123456; }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'), 'source order is NOT taken as the winner');
  assert.ok(!widths.has('0.25px'), 'specificity is NOT taken as the winner either — neither is computed');
  assert.ok(widths.has('1px'), 'the unresolved element keeps its computed reading');
  assert.ok(
    m.warnings.some((w) => w.includes('Hairline caveat') && w.includes('does not rank the cascade')),
    'the caveat fires — this is a declared unknown, not a silent one'
  );
});

test('hairlines: a width the CSSOM hands back unresolved is declared, not read as 1px', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // `border-top-width: var(--hairline)` is how a tokenised design system writes
  // this, so it is the LIKELIEST real case, not an exotic one. The CSSOM hands
  // the rule back with the reference unresolved, parseFloat gives NaN, and
  // dropping it means the row matches no collected rule — which the probe would
  // then answer as a confident 1px, exactly inverting the feature. The engine's
  // own computed value is 1px here (0.5px rounds up), so a page authored at
  // half a pixel is reported as having a 1px vocabulary it does not have.
  const html = '<!doctype html><title>unresolved-width</title>' +
    '<style>:root { --hairline: 0.5px; } ' +
    '.row { border-top-style: solid; border-top-color: #123456; border-top-width: var(--hairline); }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('1px'), 'precondition: the engine really does round this to 1px');
  assert.ok(
    m.warnings.some((w) => w.includes('Hairline caveat')),
    'the 1px reading is disclosed as provisional rather than reported as measured'
  );
});

test('hairlines: past the rule-scan cap NOTHING is recovered — a partial scan is not a partial answer', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The cap can stop MID-SCAN, so what was collected is not a prefix of the
  // cascade — it is an arbitrary truncation of it. Here the 0.5px rule is
  // collected and the higher-specificity 1px rule that actually wins is cut
  // off, so a probe that trusts its truncated table reports a confident 0.5px
  // hairline on a page that renders at 1px. That is a false RECOVERY, which is
  // strictly worse than a false ambiguity: the caller is handed a number rather
  // than a warning. Past the cap no stylesheet-derived value is trusted at all.
  const filler = Array.from({ length: 400 }, (_, i) =>
    '.f' + i + ' { border: 0.5px solid #abcdef; }').join(' ');
  const html = '<!doctype html><title>overflow</title>' +
    '<style>.row { border-top: 0.5px solid #123456; } ' + filler +
    ' body div.row { border-top: 1px solid #123456; }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'), 'the truncated table does not produce a confident hairline');
  assert.ok(widths.has('1px'), 'the computed reading stands');
  assert.ok(
    m.warnings.some((w) => w.includes('Hairline caveat') && w.includes('cap')),
    'the caveat names the cap, so the caller can tell a busy page from a conflicted one'
  );
});

test('hairlines: a BLOCKED stylesheet stops every recovery, not just the elements it touched', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The cap case above and this one are the same defect through two doors, and
  // only the cap door was closed. An unreadable cross-origin sheet may carry
  // the rule that actually WINS, so a value recovered from the sheets that did
  // parse is a confident number for an edge whose authored width is unknown —
  // a false RECOVERY, strictly worse than a false ambiguity, because the caller
  // is handed a number instead of a warning. The caller already counted every
  // UNrecovered 1px edge as ambiguous when sheetsBlocked > 0; the recovered
  // ones were the exception, which is precisely backwards.
  // Here the readable sheet says 0.5px and the blocked one says 1px, so the
  // page renders at 1px and a pre-fix run reports a 0.5px vocabulary it does
  // not have.
  const html = '<!doctype html><title>blocked-sheet</title>' +
    '<link rel="stylesheet" href="blocked.css">' +
    '<style>.row { border-top: 0.5px solid #123456; }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url),
    { 'blocked.css': 'body div.row { border-top: 1px solid #123456; }' });
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(
    m.warnings.some((w) => w.includes('Hairline caveat') && w.includes('cross-origin')),
    'precondition AND assertion: the sheet really was unreadable, and that is disclosed'
  );
  assert.ok(!widths.has('0.5px'), 'no value is recovered from a partially-read cascade');
  assert.ok(widths.has('1px'), 'the computed reading stands');
});

test('hairlines: inline style is trusted only when no !important rule can outrank it', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The inline fast path shipped with a comment claiming a style attribute
  // "stays trustworthy" whatever the sheets say. It does not: a declaration
  // marked !important beats inline, so the element renders at the sheet's
  // width while the probe reports the inline one. Same false-recovery
  // direction as the two above, reached without any blocked sheet or cap.
  // The fix reads the whole cascade for `!important` on THIS side before
  // trusting the attribute, which is also why both gates now sit AHEAD of the
  // inline read rather than beside it.
  const html = '<!doctype html><title>important-vs-inline</title>' +
    '<style>.row { border-top-style: solid; border-top-color: #123456; ' +
    'border-top-width: 1px !important; }</style>' +
    HAIRLINE_ROWS(() => 'border-top-width:0.5px;');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'), 'the losing inline declaration is not reported as the authored width');
  assert.ok(widths.has('1px'), 'the computed reading stands');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the refusal is disclosed');
});

test('hairlines: an inline width this probe cannot read refuses outright — it never falls through', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // `style="border-top-width: var(--hairline)"` is ordinary tokenised
  // authoring. Parsing it gives NaN, and falling through to the stylesheet
  // scan then answers the edge with a rule the inline declaration OVERRIDES —
  // here 0.25px, a width that appears nowhere on the rendered page. The inline
  // declaration WINS (no !important above it), so it decides the side outright
  // and an unreadable one is unresolved, never an invitation to guess.
  const html = '<!doctype html><title>inline-var</title>' +
    '<style>:root { --hairline: 0.5px; } ' +
    '.row { border-top: 0.25px solid #123456; }</style>' +
    HAIRLINE_ROWS(() => 'border-top-width:var(--hairline);');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.25px'), 'an overridden stylesheet rule never answers for an inline edge');
  assert.ok(!widths.has('0.5px'), 'nor is the token resolved by guesswork');
  assert.ok(widths.has('1px'), 'the computed reading stands');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the refusal is disclosed');
});

// HAIRLINE_ROWS fixes class="row"; the animation fixtures need a SECOND class
// on the same elements, so they build their own rows off the same geometry.
const ANIM_ROWS = (cls) => '<body>' +
  Array.from({ length: 24 }, () =>
    '<div class="row ' + cls + '" style="width:400px;height:40px;' +
    'background:rgb(250,250,250);border-radius:10.5px;' +
    'border-top:0.5px solid #123456;">row</div>').join('') + '</body>';

test('hairlines: an ADOPTED stylesheet is part of the cascade this probe reads', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // `document.adoptedStyleSheets` is a SEPARATE collection from
  // `document.styleSheets`, and the cascade includes both. Scanning only the
  // latter left an adopted `!important` rule invisible: the inline fast path
  // saw no conflict and confidently recovered 0.5px on an edge rendering at
  // 1px. Byte-identical in effect to the `<style>` case one test above, and
  // that is the point — the SOURCE of the rule is what the old scan missed, so
  // a mutant confined to the importantConflict branch cannot see this at all.
  const html = '<!doctype html><title>adopted-important</title>' +
    HAIRLINE_ROWS(() => 'border-top-width:0.5px;') +
    '<script>const s = new CSSStyleSheet();' +
    "s.replaceSync('.row { border-top-style: solid; border-top-color: #123456; " +
    "border-top-width: 1px !important; }');" +
    'document.adoptedStyleSheets = [s];<\/script>';
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  // HARM FIRST. `assert` aborts at the first failure, so a probe-derived
  // precondition placed above the harm assertion is graded INSTEAD of it: G51
  // regresses the scan, the tally loses its 1px, and the reader is told the
  // FIXTURE is broken. The readings are indistinguishable from this output
  // alone — a fixture whose adopted sheet never applied, and one that applied
  // the WRONG value, both produce the identical tally — so the harm message
  // names all THREE and the fixture check follows it. The third reading was a
  // Sol round-5 P3: naming two readings when a third exists mis-attributes a
  // fixture defect as product harm just as confidently as naming one.
  assert.ok(!widths.has('0.5px'),
    'an adopted !important rule outranks the inline declaration — a 0.5px here is EITHER the probe ' +
    'trusting inline over an adopted rule, OR a fixture whose adopted sheet never applied, OR a ' +
    'fixture whose adopted rule declares the wrong width; the next assertion separates the first from ' +
    'the other two');
  assert.ok(widths.has('1px'), 'fixture: the adopted rule actually renders at 1px');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the refusal is disclosed');
});

test('hairlines: a side under an ACTIVE animation is unresolved, never recovered', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // An animation declaration outranks every normal author declaration, inline
  // included, and its value is in no rule this scan collects — so the old
  // "!important is the only thing that can outrank inline" claim was false by
  // a second, independent path. The gate therefore sits ahead of BOTH doors.
  // The second row proves the check is PER-PROPERTY: an element animating
  // border-radius is still recovered normally, so the fix is not a blanket
  // refusal for any animated element.
  const html = '<!doctype html><title>animated-width</title>' +
    '<style>@keyframes force-width { from, to { border-top-width: 1px } } ' +
    '.anim { animation: force-width 1000s linear infinite; } ' +
    '@keyframes wobble { from, to { border-radius: 4px } } ' +
    '.other { animation: wobble 1000s linear infinite; }</style>' +
    ANIM_ROWS('anim');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  // HARM FIRST — see the adopted-stylesheet test above. Measured: with the
  // precondition on top, G52 was graded by it and reported as a broken fixture.
  assert.ok(!widths.has('0.5px'),
    'an animated border-width is not answered from the inline declaration — a 0.5px here is EITHER ' +
    'the gate missing, OR a fixture whose animation never applied, OR a fixture whose keyframe ' +
    'declares the wrong width; the next assertion separates the first from the other two');
  assert.ok(widths.has('1px'), 'fixture: the animation actually forces 1px');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the refusal is disclosed');

  const other = '<!doctype html><title>animated-radius</title>' +
    '<style>@keyframes wobble { from, to { border-radius: 4px } } ' +
    '.other { animation: wobble 1000s linear infinite; }</style>' +
    ANIM_ROWS('other');
  const m2 = await withFixture(other, (url) => measureGauntletPage(url));
  const w2 = new Set(m2.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(w2.has('0.5px'), 'an animation on ANOTHER property does not poison the reading');
});

test('hairlines: an @import is a THIRD rule source, reached through a different property', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // Round 4 closed `document.adoptedStyleSheets` and called the scan complete
  // for the sources this probe can read. It was not: CSSOM gives a
  // `CSSImportRule` NO `cssRules` at all — the imported sheet hangs off
  // `rule.styleSheet` — so the recursion that walks nested rules never saw one,
  // while the cascade places the imported rules as though substituted at the
  // @import. An imported `!important` width therefore outranked the inline
  // declaration invisibly and the inline fast path confidently recovered a
  // 0.5px edge the engine paints at 1px. The adopted-stylesheet defect again,
  // through a third door.
  // WHICH ARM THIS FIXTURE EXERCISES IS MEASURED, NOT A DISJUNCTION. The first
  // version of this comment said either reading was fine — readable sheet gives
  // an !important conflict, blocked sheet increments sheetsBlocked — and that
  // is true of the ASSERTIONS and false of this fixture: probed directly, a
  // file:// import throws SecurityError on `.cssRules` every time, so this test
  // is deterministically the BLOCKED path and the conflict arm was exercised by
  // nothing at all. `sheetsBlocked` is asserted below so the reading is pinned
  // rather than assumed, and the http test that follows covers the other arm.
  // A disjunction in a comment is not coverage of both branches.
  const html = '<!doctype html><title>imported-important</title>' +
    '<style>@import url("imported.css");</style>' +
    HAIRLINE_ROWS(() => 'border-top-width:0.5px;');
  const m = await withFixture(html, (url) => measureGauntletPage(url), {
    'imported.css': '.row { border-top-style: solid; border-top-color: #123456; ' +
      'border-top-width: 1px !important; }',
  });
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  // HARM FIRST — see the adopted-stylesheet test above.
  assert.ok(!widths.has('0.5px'),
    'an imported !important rule outranks the inline declaration — a 0.5px here is EITHER the probe ' +
    'never reaching CSSImportRule.styleSheet, OR a fixture whose import never loaded, OR a fixture ' +
    'whose imported rule declares the wrong width; the next assertion separates the first from the ' +
    'other two');
  assert.ok(widths.has('1px'), 'fixture: the imported rule actually renders at 1px');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the refusal is disclosed');
  // The reading is PINNED through the caveat's own wording, because `hairlines`
  // is destructured out of the measurement (src/design-gauntlet.ts:617) and
  // never re-emitted — the counters surface only as warning text. That is the
  // better discriminator here anyway: the two causes are separately worded, so
  // the assertion names the mechanism rather than a number.
  assert.ok(m.warnings.some((w) => w.includes('cross-origin stylesheet(s) could not be read')),
    'fixture reading is PINNED: a file:// import is unreadable, so this test grades the BLOCKED ' +
    'accounting — if this cause ever disappears the import became readable and this test silently ' +
    'moved to the conflict arm, which is the http test\'s job');
});

test('hairlines: a READABLE imported !important rule is the conflict arm, not the blocked one', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The other half of the @import fix, and the only test that reaches it. The
  // file:// fixture above refuses for a BLUNT reason — `sheetsBlocked > 0`
  // returns "unresolved" for every edge on the page, so it would still pass if
  // the import walk collected nothing useful. Same-origin, the imported rules
  // are actually COLLECTED, the !important width outranks the inline 0.5px, and
  // the refusal comes from that conflict. The ABSENCE of the cross-origin cause
  // in the caveat is the whole discriminator: without it a mutant that forces
  // the blocked path (G60) keeps this test green while deleting the mechanism
  // it exists to guard, because a blanket refusal satisfies every other
  // assertion here for entirely the wrong reason.
  const m = await withHttpFixture({
    'page.html': '<!doctype html><title>imported-readable</title>' +
      '<style>@import url("imported.css");</style>' +
      HAIRLINE_ROWS(() => 'border-top-width:0.5px;'),
    'imported.css': '.row { border-top-style: solid; border-top-color: #123456; ' +
      'border-top-width: 1px !important; }',
  }, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!m.warnings.some((w) => w.includes('cross-origin stylesheet(s) could not be read')),
    'fixture: served same-origin the imported sheet is READABLE — this cause appearing means the ' +
    'test fell back to the blocked path and is measuring the file:// test over again');
  assert.ok(!widths.has('0.5px'),
    'a COLLECTED imported !important rule outranks the inline declaration — a 0.5px here is the ' +
    'import walk never reaching CSSImportRule.styleSheet, with the blunt blocked-sheet refusal ' +
    'ruled out by the assertion above');
  assert.ok(widths.has('1px'), 'fixture: the imported rule actually renders at 1px');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the refusal is disclosed');
});

test('hairlines: a FINISHED animation still filling forwards is unresolved, never recovered', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // Round 4's gate skipped `playState === "finished"` on the reading that a
  // finished animation contributes nothing. `animation-fill-mode: forwards`
  // (and `both`) keeps applying the final keyframe value AFTER the animation
  // ends, and an animation-origin value outranks every normal author
  // declaration, inline included — so finished is not gone, and the probe
  // handed back a confident 0.5px for an edge painted at 1px. A finished
  // animation is skippable only when its RESOLVED fill cannot reach past the
  // end (`none` or `backwards`); a fill this probe cannot read falls through
  // and refuses, like every other unreadable thing here.
  const html = '<!doctype html><title>finished-forwards</title>' +
    '<style>@keyframes force-width { from, to { border-top-width: 1px } } ' +
    '.anim { animation: force-width 0.01s linear forwards; }</style>' +
    ANIM_ROWS('anim');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'a finished-but-filling animation is not answered from the inline declaration — a 0.5px here is ' +
    'EITHER the finished branch skipping a live fill, OR a fixture whose animation never applied, OR ' +
    'a fixture whose keyframe declares the wrong width; the next assertion separates the first from ' +
    'the other two');
  assert.ok(widths.has('1px'), 'fixture: the filled final keyframe actually renders at 1px');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the refusal is disclosed');
});

test('hairlines: a FALSE @supports branch is skipped — its rules are not on this render', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The conditional-group test asked `rule.media && rule.conditionText`, and a
  // CSSSupportsRule has `conditionText` and NO `media` — so every @supports
  // block was recursed into as though active, false ones included, and a
  // declaration that is not on this render was collected as authored. Here that
  // manufactures a false AMBIGUITY: the phantom `!important` rule outranks the
  // inline width and the honest 0.5px is refused. Discriminate by rule TYPE,
  // never by shape — a shape test also cannot separate @supports from
  // @container, because `CSS.supports("(min-width:400px)")` answers TRUE about a
  // DECLARATION while the identical text is a container query about a box.
  const html = '<!doctype html><title>false-supports</title>' +
    '<style>@supports (border-top-width: nonsense-value-zz) { ' +
    '.row { border-top-width: 0.25px !important; } }</style>' +
    HAIRLINE_ROWS(() => 'border-top:0.5px solid #123456;');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.25px'), 'a rule inside a false @supports is never the authored width');
  assert.ok(widths.has('0.5px'),
    'the inline width is recovered — a miss here is the false-ambiguity direction: an inactive ' +
    '@supports branch collected as though it applied');
});

test('hairlines: an @container block is UNRESOLVED — its condition is about a box this probe is not reading', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // A container query's answer depends on a containing box, not on the document
  // — `CSS.supports` cannot decide it and this probe does not measure it. The
  // deliberate trade: the whole subtree is recorded as UNRESOLVED, so it can
  // force an honest ambiguity and can never be handed back as a recovered
  // answer. That costs a correct recovery here — the query DOES apply and 0.25px
  // IS the authored width — and it is the survivable direction, because the same
  // code path with a FALSE query would otherwise recover a width that is not on
  // the render at all. Degrade to unresolved, never to a recovery.
  const html = '<!doctype html><title>container-query</title>' +
    '<style>body { container-type: inline-size; } ' +
    '@container (min-width: 100px) { .row { border-top: 0.25px solid #123456; } }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.25px'),
    'a width declared inside @container is not recovered — a 0.25px here is EITHER the unevaluable ' +
    'FLAG not being set at the call site, OR the PUSH that honours it demoting nothing (two doors ' +
    'on one rule, and this message names both because hand-grading found G58 and G59 failing on ' +
    'this same assertion), OR a fixture whose query did not apply; the next assertion separates the ' +
    'fixture reading from the two mechanism readings');
  assert.ok(widths.has('1px'), 'fixture: the query applies and the engine paints the sub-pixel edge at 1px');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the ambiguity is disclosed');
});

// A shadow host carrying an inline sub-pixel width, whose own shadow root
// declares an `!important` width that beats it. Built by script because
// `attachShadow` has no markup form.
// `mode` and `adopted` are parameters rather than three near-identical
// helpers because they are the two axes the probe reaches the sheet through,
// and each is separately breakable: a CLOSED root answers null on
// `host.shadowRoot` (so it is only ever seen via the `attachShadow` wrapper
// installed as an init script), and an ADOPTED sheet lives in a different
// collection from a `<style>` element. Fixing one and leaving the other is a
// half-state that compiles and passes, which this feature has now shipped
// twice.
const SHADOW_ROWS = (shadowCss, { mode = 'open', adopted = false } = {}) => '<body>' +
  Array.from({ length: 24 }, () =>
    '<div class="row" style="width:400px;height:40px;background:rgb(250,250,250);' +
    'border-top:0.5px solid #123456;">row</div>').join('') +
  '<script>' +
  'for (const el of document.querySelectorAll(".row")) {' +
  '  const r = el.attachShadow({ mode: ' + JSON.stringify(mode) + ' });' +
  (adopted
    ? '  const s = new CSSStyleSheet();' +
      '  s.replaceSync(' + JSON.stringify(shadowCss) + ');' +
      '  r.adoptedStyleSheets = [s];' +
      '  r.innerHTML = "<slot></slot>";'
    : '  r.innerHTML = ' + JSON.stringify('<style>' + shadowCss + '</style><slot></slot>') + ';') +
  '}' +
  '</scr' + 'ipt></body>';

test('hairlines: a shadow root that declares a border width stops every recovery', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // A FOURTH rule source. Both stylesheet loops read `document`, and CSSOM gives
  // every DocumentOrShadowRoot its OWN `styleSheets` and `adoptedStyleSheets`, so
  // a shadow sheet appears in neither — while `:host` matches the host element,
  // which IS measured (`querySelectorAll("body *")` returns hosts; it just does
  // not descend into them). So `:host { border-top-width: 1px !important }` beat
  // the inline 0.5px invisibly and the inline fast path handed back 0.5px for an
  // edge painted at 1px: the adopted-stylesheet defect through a fourth door.
  //
  // The fix COUNTS these rules rather than collecting them, because a shadow
  // selector is not evaluable from outside its tree — `el.matches(":host")`
  // answers false on the host and would silently drop the very rule that wins.
  // So the refusal is document-wide, gated on a border width actually being
  // declared, which is why the caveat gets its own cause sentence: a caller told
  // a cascade conflict would go looking for a collision that is not on the page.
  const m = await withFixture(
    '<!doctype html><title>shadow-host</title>' +
      SHADOW_ROWS(':host { border-top-width: 1px !important }'),
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'the inline 0.5px is NOT recovered — a 0.5px here is EITHER the shadow scan never running, OR ' +
    'its refusal gate missing (the counter incrementing and nothing reading it), OR a fixture whose ' +
    'shadow roots never attached; the next assertion separates the fixture reading from the two ' +
    'mechanism readings');
  assert.ok(widths.has('1px'),
    'fixture: the shadow !important rule actually wins and the edge renders at 1px');
  assert.ok(
    m.warnings.some((w) => w.includes('shadow root(s) declare a border width this probe cannot attribute')),
    'the caveat names the SHADOW cause by its own wording — a bare "Hairline caveat" check would pass ' +
    'on the conflict sentence and could not tell this refusal from any other');
  // ABSENCE, not just presence. Every shadow refusal also increments the
  // generic ambiguity counter, and that counter used to be narrated as a
  // CONFLICT — so this exact fixture, which has no collected conflict anywhere
  // on it, emitted BOTH sentences and sent a caller hunting for a rule
  // collision that does not exist. Asserting only the shadow sentence's
  // presence could never see it.
  //
  // The string this names is the CONFLICT sentence and nothing else. Round 9
  // rewrote it (it used to claim the winner "depends on specificity", which the
  // increment site never asked), and that rewrite silently turned this
  // assertion into a tautology: a negative `!includes(...)` on a string no
  // warning can ever contain cannot fail, and no run reports it. It is pinned
  // to the current wording deliberately, and the positive control below is what
  // keeps it falsifiable — if that control ever goes red because the sentence
  // moved again, THIS assertion has stopped measuring at the same moment.
  assert.ok(
    !m.warnings.some((w) => w.includes('does not rank the cascade')),
    'and does NOT also claim a cascade conflict — there is no collected conflict on this page, ' +
    'so the conflict sentence here would be a fabricated mechanism');
});

test('hairlines: a CLOSED shadow root stops every recovery too', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // `host.shadowRoot` is null BY DEFINITION for `{ mode: "closed" }`, so the
  // scan above walks straight past a closed root and the inline 0.5px is
  // recovered for an edge the closed `:host !important` rule paints at 1px —
  // a CONFIDENT WRONG ANSWER, which is the one direction this probe is not
  // allowed to fail in. The root object is reachable only at creation, so it
  // is captured by wrapping `attachShadow` in an init script that runs before
  // any page script. This fixture differs from the open one by ONE WORD.
  const m = await withFixture(
    '<!doctype html><title>shadow-closed</title>' +
      SHADOW_ROWS(':host { border-top-width: 1px !important }', { mode: 'closed' }),
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'the inline 0.5px is NOT recovered from a CLOSED root — a 0.5px here means the attachShadow ' +
    'wrapper never installed, never recorded the closed root, or the scan never reads its stash');
  assert.ok(widths.has('1px'),
    'fixture: the closed shadow !important rule actually wins and the edge renders at 1px');
  assert.ok(
    m.warnings.some((w) => w.includes('shadow root(s) declare a border width this probe cannot attribute')),
    'and the caveat names the shadow cause for a closed root exactly as it does for an open one');
});

test('hairlines: a shadow ADOPTED stylesheet stops every recovery too', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The scan spreads BOTH `styleSheets` and `adoptedStyleSheets`, and every
  // other shadow fixture here delivers its CSS through a `<style>` element —
  // so dropping the adopted half left all of them green while a constructed
  // sheet, which is how every serious component library ships its styles,
  // went unseen. Another compile-and-pass half-state; this is the assertion
  // that separates the two collections.
  const m = await withFixture(
    '<!doctype html><title>shadow-adopted</title>' +
      SHADOW_ROWS(':host { border-top-width: 1px !important }', { adopted: true }),
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'the inline 0.5px is NOT recovered from an ADOPTED shadow sheet — a 0.5px here is the ' +
    'adoptedStyleSheets half of the scan missing, which no <style>-delivered fixture can see');
  assert.ok(widths.has('1px'),
    'fixture: the adopted !important rule actually wins and the edge renders at 1px');
});

test('hairlines: a REAL cascade conflict is the one thing that fires the conflict sentence', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The positive control for the sentence the shadow test above asserts the
  // ABSENCE of. Without it, deleting the conflict sentence outright would
  // satisfy that absence assertion — a refusal-to-say-anything passing as a fix.
  // Two rules match the same side with DIFFERENT sub-pixel widths, so the
  // winner is decided by a cascade this probe does not implement; both round
  // to 1px in the used value, which is what keeps the edge in the 1px branch
  // where the recovery runs at all.
  const html = '<!doctype html><title>specificity</title><style>' +
    '.row { border-top: 0.5px solid #123456 }' +
    'div.row { border-top-width: 0.75px }' +
    '</style><body>' +
    Array.from({ length: 24 }, () =>
      '<div class="row" style="width:400px;height:40px;background:rgb(250,250,250);">row</div>').join('') +
    '</body>';
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('1px'),
    'fixture: both widths are sub-pixel and the engine paints the winner at 1px, so the edge ' +
    'reaches the recovery branch at all');
  assert.ok(!widths.has('0.5px') && !widths.has('0.75px'),
    'neither conflicting width is handed back as a confident recovery');
  assert.ok(
    m.warnings.some((w) => w.includes('does not rank the cascade')),
    'and the CONFLICT sentence DOES fire here — this is what stops the absence assertion above ' +
    'from passing vacuously, and it is the only assertion in the suite that pins the sentence\'s ' +
    'current wording in the positive direction');
});

test('hairlines: an ordinary shadow root that declares NO border width costs nothing', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The other direction, and the reason the count is gated on a border-width
  // declaration rather than on a shadow root existing at all: a page-wide
  // refusal that fired on every shadow-DOM page would make the whole recovery
  // useless on any component-based site. A refusal that never lifts is not a
  // refusal, it is an outage — so this fixture is the control on the one above.
  const m = await withFixture(
    '<!doctype html><title>shadow-benign</title>' +
      // No border width ANYWHERE in this sheet, `0` included: a `border-width: 0`
      // is still a declaration that can outrank the inline one and delete the
      // edge, so it counts like any other and is deliberately not used here.
      SHADOW_ROWS(':host { color: #222222 } span { letter-spacing: 0.01px }'),
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('0.5px'),
    'the inline 0.5px is still recovered — a miss here is the shadow gate firing on a root that ' +
    'declares no width, i.e. refusing the whole page for the presence of shadow DOM');
  assert.ok(
    !m.warnings.some((w) => w.includes('shadow root(s) declare a border width')),
    'and the shadow cause is not claimed');
});

test('hairlines: a DETACHED closed root is stashed but not counted — the re-check is the guard', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The `attachShadow` wrapper stashes EVERY closed root, including roots whose
  // host is not measured at all — detached, or outside `body *`. Such a root
  // cannot change any border in this tally, so counting it would be a page-wide
  // refusal bought for nothing: the same outage the benign-shadow control above
  // exists to prevent, arriving through the stash instead of through the gate.
  // `measured.has(root.host)` is the clause that refuses it, and without this
  // fixture that clause is guarded by nothing — every other closed-root fixture
  // attaches to a measured host, so deleting the re-check leaves them all green.
  //
  // The detached host declares a `1px !important` border width, i.e. exactly the
  // rule that WOULD stop every recovery if it were counted. That is what makes
  // the assertion a measurement rather than a restatement.
  const html = '<!doctype html><title>shadow-detached</title><body>' +
    Array.from({ length: 24 }, () =>
      '<div class="row" style="width:400px;height:40px;background:rgb(250,250,250);' +
      'border-top:0.5px solid #123456;">row</div>').join('') +
    '<script>' +
    'const orphan = document.createElement("div");' +
    'const r = orphan.attachShadow({ mode: "closed" });' +
    'r.innerHTML = "<style>:host { border-top-width: 1px !important }</style>";' +
    '</scr' + 'ipt></body>';
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('0.5px'),
    'the inline 0.5px is still recovered — a miss here is the closed-root stash being counted ' +
    'without asking whether its host is measured, i.e. an unmeasurable rule refusing the whole page');
  assert.ok(
    !m.warnings.some((w) => w.includes('shadow root(s) declare a border width')),
    'and the shadow cause is not claimed for a root that cannot affect any measured border');
});

test('hairlines: an UNKNOWN conditional group is unresolved, never collected as authored', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // @supports, @container, @media and @layer were each decided by TYPE and
  // everything else FELL THROUGH to the plain recursion — with `unevaluable`
  // unchanged, i.e. collected as AUTHORED. A comment called that "a false
  // ambiguity in the honest direction"; it was the opposite. `@scope (.absent)`
  // never applies, the scope condition is dropped at collection, and only
  // `r.selector` is ever tested with `el.matches()` — so `.row` matched and a
  // 0.25px !important width that is on NO render outranked the inline
  // declaration and was handed back as a confident recovery. The fix inverts the
  // default: an at-rule group that is not on the known list degrades to
  // unresolved, so the platform's next conditional at-rule costs an ambiguity
  // rather than a wrong answer.
  const html = '<!doctype html><title>unknown-group</title>' +
    '<style>@scope (.absent) { .row { border-top-width: 0.25px !important } }</style>' +
    HAIRLINE_ROWS(() => 'border-top:0.5px solid #123456;');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.25px'),
    'a width from a scope that does not exist is never the recovered answer');
  assert.ok(widths.has('1px'),
    'fixture: @scope PARSED (an engine that dropped the block would leave the inline 0.5px recovered ' +
    'and this assertion is the only thing that would say so) and the row renders its rounded 0.5px ' +
    'at 1px, so the honest answer here is an ambiguity');
  assert.ok(!widths.has('0.5px'),
    'and the inline width is not recovered either — the group is UNEVALUABLE, so its rule demotes the ' +
    'edge rather than being ignored; recovering 0.5px here would be the fix skipping unknown groups ' +
    'instead of degrading them');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the ambiguity is disclosed');
});

test('hairlines: a non-px length is unresolved — parseFloat is not a unit check', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // `parseFloat("0.5em")` is 0.5, so an edge authored .5em at a 2px font-size —
  // which computes, and renders, at exactly 1px — was reported as a recovered
  // 0.5px hairline. A confident wrong number, from a value the probe never had
  // the font context to resolve. Keywords (thin/medium/thick) are the one
  // non-px form that is DROPPED rather than flagged: they are engine-defined
  // integers and can never be the sub-pixel case.
  const html = '<!doctype html><title>em-width</title>' +
    '<style>.row { font-size: 2px; border-top: 0.5em solid #123456; }</style>' +
    HAIRLINE_ROWS(() => '');
  const m = await withFixture(html, (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'), 'an em length is not read as a px length');
  assert.ok(widths.has('1px'), 'the computed reading stands');
  assert.ok(m.warnings.some((w) => w.includes('Hairline caveat')), 'the refusal is disclosed');
});

// --- all four edges --------------------------------------------------------

const SIDE_BASE = 'width:400px;height:40px;background:rgb(250,250,250);';
const SIDE_ROWS = (n, style) =>
  Array.from({ length: n }, () => '<div class="row" style="' + SIDE_BASE + style + '">row</div>').join('');

// ---------------------------------------------------------------------------
// Round 9. Every mechanism below was measured with a standalone Playwright
// probe BEFORE the product code was written (probe-r9-logical.mjs and
// probe-r9-nesting-fix.mjs, .claude/gauntlet-2026-08-14/agent-output/), and
// three of the five measurements changed the design. The fixtures here reuse
// the measured shapes verbatim so the test and the probe cannot drift.
// ---------------------------------------------------------------------------

// Rows carrying an inline PHYSICAL hairline, for the fixtures whose subject is
// a stylesheet rule rather than the inline declaration.
const R9_ROWS = (n = 24) => Array.from({ length: n }, () =>
  '<div class="row" style="width:400px;height:40px;background:rgb(250,250,250);' +
  'border-top:0.5px solid #123456;">row</div>').join('');

test('hairlines: a DECLARATIVE closed shadow root refuses every recovery', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The `attachShadow` wrapper that covers every OTHER closed-root fixture in
  // this file structurally cannot see this one: a declarative root is built by
  // the HTML parser running the internal algorithm, so `Element.prototype.
  // attachShadow` is never called and the stash stays EMPTY. Measured:
  // shadowRootIsNull true, stashLen 0, inline 0.5px, painted 1px — the
  // confident false recovery the wrapper exists to prevent, arriving through a
  // door the wrapper does not cover.
  //
  // This is why the fixture cannot use SHADOW_ROWS: that helper always creates
  // its roots THROUGH the wrapped attachShadow, which is precisely the path
  // this case does not take. The template markup is hand-written.
  //
  // It is also why the fixture must be served over http rather than file://.
  // The only detector available is the main document's own RESPONSE BYTES, and
  // Playwright returns a null response for a file:// navigation, so a file://
  // version of this fixture would pass for the wrong reason on a build with no
  // detector at all.
  const rows = Array.from({ length: 24 }, () =>
    '<div class="row" style="width:400px;height:40px;background:rgb(250,250,250);' +
    'border-top:0.5px solid #123456;">' +
    '<template shadowrootmode="closed">' +
    '<style>:host { border-top-width: 1px !important }</style><slot></slot>' +
    '</template>row</div>').join('');
  const m = await withHttpFixture(
    { 'page.html': '<!doctype html><title>decl-closed</title><body>' + rows + '</body>' },
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'the inline 0.5px is NOT recovered past a DECLARATIVE closed root — a 0.5px here is the ' +
    'response-byte detector missing, and it is a CONFIDENT WRONG width, not a missing one');
  assert.ok(widths.has('1px'),
    'fixture: the declarative closed root\'s :host !important rule actually wins and the edge ' +
    'renders at 1px. Without this the case above would pass on a page where nothing happened');
  assert.ok(
    m.warnings.some((w) => w.includes('declarative closed shadow root(s) whose contents cannot be inspected')),
    'and the caveat names the DECLARATIVE cause specifically. It cannot reuse the ordinary shadow ' +
    'sentence: that one says a root DECLARES a border width, and a closed root\'s contents cannot ' +
    'be inspected at all, so this probe does not know whether it declares one');
});

test('hairlines: a declarative closed root is caught even when it declares NOTHING', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The refusal is on PRESENCE, not on content, and that is the load-bearing
  // half rather than a coarse approximation: a closed root cannot be opened, so
  // there is no way to ask whether it declares a width. The test above alone
  // would stay green under a detector that somehow inspected the root and
  // refused only on a real declaration — this one is what pins presence.
  const rows = Array.from({ length: 24 }, () =>
    '<div class="row" style="width:400px;height:40px;background:rgb(250,250,250);' +
    'border-top:0.5px solid #123456;">' +
    '<template shadowrootmode="closed"><style>:host { color: red }</style><slot></slot></template>' +
    'row</div>').join('');
  const m = await withHttpFixture(
    { 'page.html': '<!doctype html><title>decl-closed-empty</title><body>' + rows + '</body>' },
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('1px') && !widths.has('0.5px'),
    'the recovery is refused for a closed root that declares no border width at all — the edge ' +
    'paints at 1px from the inline 0.5px and stays 1px, unrecovered');
  assert.ok(
    m.warnings.some((w) => w.includes('declarative closed shadow root(s) whose contents cannot be inspected')),
    'and it says so, rather than refusing silently');
});

test('hairlines: a CLOSED root delivering an ADOPTED sheet stops every recovery', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The two shadow dimensions are ORTHOGONAL and were covered only one at a
  // time: `{ mode: "closed" }` with a <style>, and `{ adopted: true }` with an
  // open root. Their composition — the shape a real closed web component
  // actually ships — was reached by neither, so the stashed-root scan reading
  // `adoptedStyleSheets` off a CLOSED root worked by accident and was guarded
  // by nothing. This is the assertion that grades the composition.
  const m = await withFixture(
    '<!doctype html><title>shadow-closed-adopted</title>' +
      SHADOW_ROWS(':host { border-top-width: 1px !important }', { mode: 'closed', adopted: true }),
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'the inline 0.5px is NOT recovered from an adopted sheet on a CLOSED root — a 0.5px here is ' +
    'the stash and the adoptedStyleSheets read failing to compose, which neither single-axis ' +
    'fixture above can see');
  assert.ok(widths.has('1px'),
    'fixture: the adopted !important rule on the closed root actually wins');
  assert.ok(
    m.warnings.some((w) => w.includes('shadow root(s) declare a border width this probe cannot attribute')),
    'and the ordinary shadow caveat fires — this root IS inspectable through the stash, so it is ' +
    'the DECLARES sentence here, not the declarative-closed one');
});

test('hairlines: a LOGICAL border width in a rule is unresolved, never read as absent', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // Measured on Chromium: every logical authoring form — `border-block-start`,
  // `border-block`, `border-inline`, and the four longhands — expands in the
  // CSSOM to LOGICAL longhands, and `rule.style.borderTopWidth` reads EMPTY for
  // all of them. So a rule-scan that asks only the physical longhand does not
  // see this rule at all: no authored width, no `!important` conflict, and the
  // inline 0.5px is recovered for an edge the rule paints at 1px. A confident
  // wrong answer, which is the one direction this probe may not fail in.
  //
  // The refusal covers all FOUR sides rather than mapping block-start to top,
  // because that mapping needs the element's writing-mode and direction, which
  // a rule-level scan is not reading.
  const m = await withFixture(
    '<!doctype html><title>logical-rule</title>' +
      '<style>.row { border-block-start-width: 1px !important }</style>' +
      '<body>' + R9_ROWS() + '</body>',
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'the inline 0.5px is NOT recovered against a logical !important rule — a 0.5px here means the ' +
    'rule scan asked borderTopWidth, got "", and concluded no rule touches this edge');
  assert.ok(widths.has('1px'),
    'fixture: the logical rule actually wins and the edge renders at 1px');
});

test('hairlines: a logical SHORTHAND is caught by the same four-name set', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // `border-block-start: 1px solid` is the form a human actually writes, and it
  // is the one a longhand-only detector would be most likely to miss. It does
  // not: the measurement above established that the CSSOM expands EVERY logical
  // shorthand to logical longhands, which is why the detector is a four-name
  // SET and not a shorthand parser. This fixture is what makes that a
  // measurement in the suite rather than a claim in a comment.
  const m = await withFixture(
    '<!doctype html><title>logical-shorthand</title>' +
      '<style>.row { border-block-start: 1px solid #654321 !important }</style>' +
      '<body>' + R9_ROWS() + '</body>',
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'the shorthand is detected exactly as the longhand is — a 0.5px here means the enumeration ' +
    'walked past a form that expands to the very names it is looking for');
  assert.ok(widths.has('1px'), 'fixture: the shorthand rule actually wins');
});

test('hairlines: an INLINE logical width refuses — the third door, on the element itself', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The two rule-scan doors do nothing for a width sitting on the element's own
  // style attribute in logical form: `el.style.borderLeftWidth` reads EMPTY
  // while the engine paints the left edge, so the inline branch falls through,
  // the stylesheet scan matches nothing, and the edge is answered as a
  // CONFIDENT 1px with the real authored 0.5px unread on the element.
  //
  // The observable here is the WARNING, not the tally, and deliberately so: the
  // old behaviour and the new one both leave 1px in the tally, and the whole
  // difference is whether the caller is told that 1px is provisional. An
  // assertion on the tally alone could not see this fix in either direction.
  const rows = Array.from({ length: 24 }, () =>
    '<div class="row" style="width:400px;height:40px;background:rgb(250,250,250);' +
    'border-inline-start-width:0.5px;border-inline-start-style:solid;' +
    'border-inline-start-color:#123456;">row</div>').join('');
  const m = await withFixture(
    '<!doctype html><title>logical-inline</title><body>' + rows + '</body>',
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('1px'),
    'fixture: the logical inline width paints the LEFT edge at 1px, so the edge is in the ' +
    'ambiguous branch at all — without this the assertion below could pass on an empty tally');
  assert.ok(!widths.has('0.5px'),
    'and it is not recovered: refusing is the only honest answer, since mapping inline-start to a ' +
    'physical side needs writing-mode and direction this probe is not reading');
  assert.ok(
    m.warnings.some((w) => w.includes('Hairline caveat') && w.includes('could not resolve')),
    'the 1px is DECLARED provisional. This is the only assertion that separates the third door ' +
    'from no door at all — both leave 1px in the tally, and only one of them says so');
});

test('hairlines: a NESTED rule is resolved against its parent, not tested standalone', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // Chromium serializes a nested rule's `selectorText` with a leading `&`, and
  // `&` tested STANDALONE degrades to `:scope` — the element itself — so the
  // collected selector answers a question about the wrong element in BOTH
  // directions. Measured, all four arms: a rule that applies is silently MISSED
  // (authoredMatch false), and an ORPHAN rule under an absent parent FALSELY
  // matches (authoredMatch true). The second is the dangerous one.
  //
  // The fix substitutes `:is(<parent>)`, not a bare paste: measured, a parent
  // selector LIST (`.a, .b`) pasted raw regroups the selector, and `:is()` also
  // carries the parent's specificity the way `&` does.
  //
  // This is the APPLIES arm: the rule really does win, so a probe that missed
  // it would recover the inline 0.5px for an edge painted at 1px.
  const m = await withFixture(
    '<!doctype html><title>nesting-applies</title>' +
      '<style>.card { .row { border-top-width: 1px !important } }</style>' +
      '<body><div class="card">' + R9_ROWS() + '</div></body>',
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'a nested !important rule that APPLIES is seen — a 0.5px here means the collected selector ' +
    'was the bare `&` form, which matched nothing, and the inline width was trusted against a ' +
    'rule that outranks it');
  assert.ok(widths.has('1px'), 'fixture: the nested rule actually wins and the edge renders at 1px');
});

test('hairlines: a nested rule under an ABSENT parent does not falsely match', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // The other measured direction, and the one that produces a WRONG NUMBER
  // rather than a missed refusal: `&.row` under `.absent` serializes as
  // `&.row`, which standalone reads as `:scope.row` and matches every row on
  // the page — so a rule that is not on this render at all forces a refusal.
  // The applies-arm test above cannot see this: it grades whether a rule is
  // FOUND, and this grades whether a rule that should not be found is absent.
  const m = await withFixture(
    '<!doctype html><title>nesting-orphan</title>' +
      '<style>.absent { &.row { border-top-width: 0.25px !important } }</style>' +
      '<body>' + R9_ROWS() + '</body>',
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(widths.has('0.5px'),
    'the orphan rule does NOT match, so the inline 0.5px is recovered normally — a missing 0.5px ' +
    'here means a rule under a parent that is nowhere on the page silently suppressed a recovery ' +
    'it has no bearing on');
});

test('hairlines: a nested rule this probe cannot resolve is unresolved, never dropped', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // A guard cannot wait for a throw. Measured on Chromium:
  // `el.matches(':is(main::before) .row')` returns FALSE and does NOT throw —
  // a silently unmatchable rule, which is the FALSE-RECOVERY direction, since
  // a `try/catch` around the match would never fire and the rule would be
  // quietly discarded. So a parent carrying a pseudo-element is refused
  // TEXTUALLY, before any selector is constructed.
  //
  // The observable is the refusal, and the fixture is built so that dropping
  // the rule and refusing on it give OPPOSITE answers: the nested rule really
  // does apply (through the real `.card` parent it is written under), so a
  // silent drop recovers 0.5px and the refusal does not.
  const m = await withFixture(
    '<!doctype html><title>nesting-unresolvable</title>' +
      '<style>.card::before { .row { border-top-width: 1px !important } }</style>' +
      '<body><div class="card">' + R9_ROWS() + '</div></body>',
    (url) => measureGauntletPage(url));
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'an unresolvable nested parent forces a refusal rather than a silent drop — a 0.5px here is ' +
    'the probe discarding a rule it could not construct a selector for and then answering ' +
    'confidently, which is exactly the shape a try/catch would have shipped');
  assert.ok(
    m.warnings.some((w) => w.includes('Hairline caveat')),
    'and the refusal is narrated rather than silent');
});

test('hairlines: the pseudo-element refusal holds on an engine with no CSS.supports', async (t) => {
  if (!gauntletChromiumOk) { t.skip('chromium probe failed: ' + gauntletProbeReason); return; }
  // WHY THIS FIXTURE EXISTS, measured rather than argued.
  //
  // `resolveNested` refuses a parent carrying `::` TEXTUALLY, and on Chromium
  // that clause has NO reachable trigger: `selectorParses` asks
  // `CSS.supports('selector(:is(.card::before) .row)')`, which measures FALSE,
  // so the selector is rejected one line later whether or not the textual guard
  // is there. The test above therefore cannot kill a mutant on that clause.
  //
  // But `selectorParses` has a SECOND path, for an engine without
  // `CSS.supports`, and on that path the clause is the only thing standing:
  // the fallback returns true whenever `matches()` does not THROW, and
  // `matches(':is(.card::before) .row')` returns FALSE WITHOUT THROWING
  // (measured). So the selector is accepted, matches nothing, the rule is
  // silently discarded, and the probe answers 0.5px confidently — the
  // false-recovery direction the guard exists to prevent.
  //
  // A claim that a clause cannot be tested is itself a claim. The engine is
  // simulated by deleting `CSS.supports` in the document's own first script,
  // which runs before the probe evaluates anything.
  const m = await withFixture(
    '<!doctype html><title>nesting-no-css-supports</title>' +
      '<script>delete CSS.supports;</script>' +
      '<style>.card::before { .row { border-top-width: 1px !important } }</style>' +
      '<body><div class="card">' + R9_ROWS() + '</div></body>',
    (url) => measureGauntletPage(url));
  assert.equal(typeof m.borders, 'object', 'the probe still ran with CSS.supports removed');
  const widths = new Set(m.borders.tally.map((e) => e.value.split(' ')[0]));
  assert.ok(!widths.has('0.5px'),
    'with CSS.supports gone the DOM fallback accepts an unmatchable selector, so the TEXTUAL ' +
    'refusal is the only guard left — a 0.5px here is the silent drop it exists to prevent');
});

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
  // 3px top joins the bottom's candidate list: matched becomes [3, 0.5], the
  // set has two members, and the disagreement rule reports the row
  // UNRESOLVED. So the failure is not a wrong number — it is a real hairline
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
