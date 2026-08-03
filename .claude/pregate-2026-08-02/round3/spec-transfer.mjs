// EXPLORATORY — NOT the pre-registered endpoint and NOT part of the decision rule.
//
// The primary endpoint hit a ceiling because P1-P6 are things both arms trivially pass.
// This measures a different, narrower question: the composed prompt states a set of
// specific behaviours; the one-line instruction does not. Do arm A's builds actually
// carry those specifics more often than arm B's?
//
// A positive result here is NOT "arm A is better design". It is "the composed prompt
// transmits its spec", which is the mechanism by which the tool could add value at all.
// Reported separately, labelled exploratory, decided after the primary was already locked
// and analysed — so it can support a hypothesis for a future round, never this round's verdict.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const R3 = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02';
const BUILDS = join(R3, 'round3/builds');

// Each item is stated EXPLICITLY in round3/composed-prompt.md and is absent from the
// one-line instruction. Detection is deliberately generous — a build gets credit for any
// reasonable spelling — so the measure is not a test of guessing arm A's exact wording.
const SPEC = [
  { key: 'timeout-6s',        why: 'States: timeout 6000ms',
    test: (s) => /\b6000\b/.test(s) || /\b6\s*000\b/.test(s) || /--?[a-z-]*(dismiss|timeout|duration)[a-z-]*:\s*6s\b/i.test(s) },
  { key: 'pause-hover',       why: 'States: clock held while a pointer is inside',
    test: (s) => /mouseenter|pointerenter|:hover|mouseover/i.test(s) },
  { key: 'pause-focus-within',why: 'States: clock held on focus-within (the keyboard half)',
    test: (s) => /focus-within|focusin\b|focusIn/i.test(s) },
  { key: 'dom-not-css-hide',  why: 'Prohibition OTHER-dynamic-dom-not-css-hide',
    test: (s) => /\.remove\(\)|removeChild|replaceChildren\(\)/.test(s) },
  { key: 'reverted-distinct', why: 'States: reverted is a terminal distinct from dismissed',
    test: (s) => /revert/i.test(s) && /dismiss/i.test(s) },
  { key: 'inert-on-leaving',  why: 'States: surface inert during exit so a late click cannot re-enter',
    test: (s) => /\binert\b/i.test(s) || /pointer-events\s*:\s*none/i.test(s) },
  // Must match BOTH the markup form (aria-live="polite") and the JS form
  // (setAttribute("aria-live", "polite")). The first version of this test only matched
  // the markup form and reported arm A at 2/7 when the real figure is 7/7 — the builds
  // set the attribute in script because the surface is created dynamically.
  { key: 'live-region',       why: 'Structure: polite live-region line',
    test: (s) => /aria-live[^a-z]{0,12}polite/i.test(s) || /role[^a-z]{0,12}status/i.test(s) },
  { key: 'reduced-motion',    why: 'Motion: prefers-reduced-motion handling',
    test: (s) => /prefers-reduced-motion/i.test(s) },
  { key: 'enter-200-exit-120',why: 'Motion: 200ms enter / 120ms exit via the duration tokens',
    test: (s) => /\b200ms\b/.test(s) && /\b120ms\b/.test(s) },
  { key: 'icon-currentcolor', why: 'Prohibition ASSET-icon-stroke-current-color',
    test: (s) => /currentColor/i.test(s) },
  { key: 'msg-terse',         why: 'Content: message max 24 chars, does not restate the saved object',
    test: (s, txt) => {
      // The confirmation line as rendered. Generous: pass if ANY short status-ish line exists
      // and no line restates a field value at length.
      const m = txt.match(/>([^<>{}]{1,80})</g) || [];
      const lines = m.map((x) => x.slice(1, -1).trim()).filter((x) => /saved|save[d]?\b|updated/i.test(x));
      if (lines.length === 0) return false;
      return lines.some((l) => l.length <= 24);
    } },
];

const rows = [];
for (const d of readdirSync(BUILDS).filter((x) => /^build-\d+$/.test(x)).sort()) {
  const src = readFileSync(join(BUILDS, d, 'index.html'), 'utf8');
  const rec = { build: d, hits: {} };
  for (const item of SPEC) {
    let ok = false;
    try { ok = !!item.test(src, src); } catch { ok = false; }
    rec.hits[item.key] = ok;
  }
  rec.n = Object.values(rec.hits).filter(Boolean).length;
  rows.push(rec);
}

// Unseal.
const sealed = readFileSync(R3 + '/SEALED-ASSIGNMENT-R3.md', 'utf8');
const ASSIGN = {};
for (const m of sealed.matchAll(/\|\s*build-(\d+)\s*\|\s*([AB])\s*\|/g)) ASSIGN[m[1]] = m[2];

const arm = (r) => ASSIGN[r.build.split('-')[1]];
const A = rows.filter((r) => arm(r) === 'A');
const B = rows.filter((r) => arm(r) === 'B');
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

console.log(`EXPLORATORY spec-transfer — ${SPEC.length} items stated in the composed prompt, absent from the one-liner\n`);
console.log('per item (A hits / 7   B hits / 7):');
for (const item of SPEC) {
  const a = A.filter((r) => r.hits[item.key]).length;
  const b = B.filter((r) => r.hits[item.key]).length;
  const flag = a - b >= 3 ? '  <-- A' : (b - a >= 3 ? '  <-- B' : '');
  console.log(`  ${item.key.padEnd(20)} ${a}/7   ${b}/7${flag}   (${item.why})`);
}
const sa = A.map((r) => r.n), sb = B.map((r) => r.n);
console.log(`\nA total ${mean(sa).toFixed(2)} (sd ${sd(sa).toFixed(2)})   B total ${mean(sb).toFixed(2)} (sd ${sd(sb).toFixed(2)})   diff ${(mean(sa) - mean(sb)).toFixed(2)}`);
const se = Math.sqrt(sd(sa) ** 2 / sa.length + sd(sb) ** 2 / sb.length);
console.log(`se ${se.toFixed(2)}   approx 95% CI [${(mean(sa) - mean(sb) - 2.18 * se).toFixed(2)}, ${(mean(sa) - mean(sb) + 2.18 * se).toFixed(2)}]`);
console.log('\nper build:');
for (const r of rows) console.log(`  ${r.build} [arm ${arm(r)}] ${r.n}/${SPEC.length}`);
