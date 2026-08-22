// Falsifiability matrix for the settle-cap instrument fix.
// Mutants are string-edited into dist/capture.js, load-checked, run with
// `node --test` directly (NEVER `npm test` — that rebuilds and clobbers the
// mutant), and restored with the restore verified by string equality.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const DIST = 'dist/capture.js';
const SUITE = 'test/capture.test.mjs';
const pristine = readFileSync(DIST, 'utf8');

const MUTANTS = [
  {
    id: 'M1',
    what: 'product stops reporting the field (the assertion must not silently no-op)',
    find: '            viewportAnimationSettleMs: viewportAnimationSettleMs,\n',
    repl: '',
    expectMessage: 'must report viewportAnimationSettleMs',
    expectTest:
      'entrance-animation.html \u2014 infinite spinner does not block animation-settle',
  },
  {
    id: 'M2',
    what: 'settle never reaches quiescence, so every page consumes the full 3s cap',
    find: '            return now - captureWindow.__ravenAnimationQuietSince >= config.quietMs;',
    repl: '            return false;',
    expectMessage: 'must not consume the 3s settle cap',
    expectTest:
      'entrance-animation.html \u2014 infinite spinner does not block animation-settle',
  },
];

function run() {
  const r = spawnSync('node', ['--test', SUITE], {
    encoding: 'utf8',
    env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const num = (k) => {
    const m = out.match(new RegExp(`^ℹ ${k} (\\d+)$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  // A summary that disagrees with the exit status is not a measurement.
  const summary = { pass: num('pass'), fail: num('fail'), skipped: num('skipped'), tests: num('tests') };
  if (summary.fail === null) throw new Error('no summary line — the run did not complete');
  const statusSaysGreen = r.status === 0;
  if (statusSaysGreen !== (summary.fail === 0)) {
    throw new Error(`summary (fail=${summary.fail}) and exit status (${r.status}) disagree`);
  }
  const red = [...new Set([...out.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((m) => m[1]))];
  return { ...summary, red, out };
}

let failures = 0;

// Baseline first. A matrix graded against a baseline that measures nothing
// reports every mutant as a survivor.
const base = run();
console.log(`baseline: tests=${base.tests} pass=${base.pass} fail=${base.fail} skipped=${base.skipped}`);
if (base.fail !== 0) { console.log('ABORT: baseline is not green'); process.exit(1); }
if (base.tests !== 40 || base.skipped !== 1) {
  console.log(`ABORT: baseline shape moved (expected 40 tests / 1 skip). A shortened suite satisfies every count guard.`);
  process.exit(1);
}

for (const m of MUTANTS) {
  if (typeof m.expectTest !== 'string' || typeof m.expectMessage !== 'string') {
    throw new Error(
      `${m.id}: expectTest/expectMessage must both be strings. ` +
        `A missing field makes res.red.includes(undefined) false, which grades a ` +
        `genuinely killed mutant as SURVIVED — a false alarm that reads exactly ` +
        `like a coverage hole.`,
    );
  }

  if (pristine.split(m.find).length - 1 !== 1) {
    console.log(`ABORT ${m.id}: find-string is not unique (a dead anchor is not a survivor)`);
    process.exit(1);
  }
  writeFileSync(DIST, pristine.replace(m.find, m.repl));
  let res;
  try {
    // Load-check: a mutant that fails to load fails every test for the wrong reason.
    await import(`${pathToFileURL(resolve(DIST)).href}?m=${m.id}`);
    res = run();
  } finally {
    writeFileSync(DIST, pristine);
    if (readFileSync(DIST, 'utf8') !== pristine) { console.log('ABORT: restore failed'); process.exit(1); }
  }
  // A kill must be attributable. `out.includes(message)` alone accepts the
  // declared message appearing ANYWHERE in the combined output — including
  // raised by a different test, or by a stack trace — so a mutant that breaks
  // some unrelated assertion is graded KILLED for the wrong reason. Require the
  // DECLARED test to be in the red set as well.
  const hitExpected = res.out.includes(m.expectMessage);
  const hitTest = res.red.includes(m.expectTest);
  const ok = res.fail > 0 && hitExpected && hitTest;
  if (!ok) failures++;
  console.log(`${m.id} ${ok ? 'KILLED' : 'SURVIVED/WRONG'} — fail=${res.fail} radius=${res.red.length} onDeclaredMessage=${hitExpected} onDeclaredTest=${hitTest}`);
  console.log(`     ${m.what}`);
  for (const t of res.red) console.log(`     red: ${t}`);
}

console.log(failures === 0 ? 'MATRIX OK' : `MATRIX FAILED (${failures})`);
process.exitCode = failures === 0 ? 0 : 1;
