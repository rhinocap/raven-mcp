#!/usr/bin/env node
// Measurement of record for two numbers the spring control's comments cite and
// that no test asserts directly, because both are facts about the SHIPPED
// PRESETS rather than properties of the code:
//
//   1. settle time per preset, against SPRING_MAX_MS — cited by the endpoint-pin
//      comment in browser/raven-grab.js, which documents the unsettled-spring
//      branch as unreachable from the UI rather than guarding it.
//   2. worst vertical deviation of the FORMATTED linear() curve from the exact
//      analytic spring — cited by the 0.0025 bound in the call-site guard in
//      test/grab-bridge.test.mjs.
//
// It slices springPosition, simplifySpringSamples and formatSpringLinear
// VERBATIM out of the overlay and evaluates them, so it grades the product's own
// arithmetic and not a reimplementation. A slice that misses throws rather than
// measuring something else — the failure mode of a text-anchored extractor is
// that it silently grabs the wrong span, so each one is shape-checked.
//
// Run: node scripts/measure-spring-settle.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(repoRoot, 'browser/raven-grab.js'), 'utf8');

function sliceFunction(name, signature) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('no function ' + name + ' in browser/raven-grab.js');
  const end = src.indexOf('\n  }\n', start) + 4;
  const text = src.slice(start, end);
  if (!text.startsWith(signature)) {
    throw new Error(`slice for ${name} does not start with its signature; got ${text.slice(0, 90)}`);
  }
  return text;
}

const springPosition = new Function('return (' + sliceFunction('springPosition', 'function springPosition(t, omega0, zeta)') + ')')();
const simplifySpringSamples = new Function('return (' + sliceFunction('simplifySpringSamples', 'function simplifySpringSamples(points, tolerance)') + ')')();
const formatSpringLinear = new Function('return (' + sliceFunction('formatSpringLinear', 'function formatSpringLinear(points)') + ')')();

const constant = (name) => {
  const found = src.match(new RegExp(name + ' = ([\\d.]+)'));
  if (!found) throw new Error('no constant ' + name);
  return Number(found[1]);
};
const SPRING_SETTLE_EPSILON = constant('SPRING_SETTLE_EPSILON');
const SPRING_MAX_MS = constant('SPRING_MAX_MS');
const RDP_TOLERANCE = Number(src.match(/simplifySpringSamples\(samples, ([\d.]+)\)/)[1]);

const presets = [...src.match(/SPRING_PRESETS = \[[\s\S]*?\];/)[0]
  .matchAll(/\["([a-z]+)", ([\d.]+), ([\d.]+), ([\d.]+)\]/g)]
  .map((m) => [m[1], Number(m[2]), Number(m[3]), Number(m[4])]);
if (presets.length === 0) throw new Error('no SPRING_PRESETS parsed');

// Reproduces springCurve rather than slicing it: springCurve closes over the two
// constants and both helpers, and reconstructing that scope is more fragile than
// restating eleven lines whose only job here is to feed the two measurements.
function curveOf(k, c, m) {
  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  let settleMs = 0;
  for (let probe = 1; probe <= SPRING_MAX_MS; probe += 1) {
    if (Math.abs(springPosition(probe / 1000, omega0, zeta) - 1) >= SPRING_SETTLE_EPSILON) settleMs = probe;
  }
  settleMs = Math.max(settleMs + 1, 1);
  const samples = [];
  for (let i = 0; i <= 100; i += 1) samples.push([i / 100, springPosition(((i / 100) * settleMs) / 1000, omega0, zeta)]);
  const unpinnedEnd = samples[100][1];
  samples[0][1] = 0;
  samples[100][1] = 1;
  return { omega0, zeta, settleMs, unpinnedEnd, points: simplifySpringSamples(samples, RDP_TOLERANCE) };
}

// Parses the emitted string back, the same way the guard in
// test/grab-bridge.test.mjs does — the point of this measurement is the curve a
// browser receives, not the numbers on the way there.
function drawnPoints(str) {
  const parts = str.slice('linear('.length, -1).split(', ');
  return parts.map((part, index) => {
    const [value, stop] = part.split(' ');
    if (stop === undefined) return [index === 0 ? 0 : 1, Number(value)];
    return [Number(stop.replace('%', '')) / 100, Number(value)];
  });
}

function worstDeviation(curve) {
  const drawn = drawnPoints(formatSpringLinear(curve.points));
  let worst = 0;
  for (let i = 0; i <= 100; i += 1) {
    const fraction = i / 100;
    const exact = i === 0 ? 0 : i === 100 ? 1 : springPosition((fraction * curve.settleMs) / 1000, curve.omega0, curve.zeta);
    let seg = 0;
    while (seg < drawn.length - 2 && drawn[seg + 1][0] < fraction) seg += 1;
    const [x0, y0] = drawn[seg];
    const [x1, y1] = drawn[seg + 1];
    const at = x1 === x0 ? y0 : y0 + ((fraction - x0) / (x1 - x0)) * (y1 - y0);
    worst = Math.max(worst, Math.abs(exact - at));
  }
  return worst;
}

console.log(`epsilon ${SPRING_SETTLE_EPSILON}  cap ${SPRING_MAX_MS}ms  rdp tolerance ${RDP_TOLERANCE}\n`);
console.log('preset   settleMs   pin moves   kept/101   chars   worst deviation (FORMATTED)');
let worstOverall = 0;
for (const [label, k, c, m] of presets) {
  const curve = curveOf(k, c, m);
  const emitted = formatSpringLinear(curve.points);
  const deviation = worstDeviation(curve);
  worstOverall = Math.max(worstOverall, deviation);
  console.log(
    `${label.padEnd(8)} ${String(curve.settleMs).padStart(8)}   ${Math.abs(1 - curve.unpinnedEnd).toFixed(6)}` +
    `    ${String(curve.points.length).padStart(3)}/101   ${String(emitted.length).padStart(5)}   ${deviation.toFixed(6)}`
  );
}
console.log(`\nworst across presets: ${worstOverall.toFixed(6)} against the 0.0025 bound in the call-site guard`);

// The unsettled branch, stated at its worst. Not reachable from the UI — there is
// no stiffness/damping/mass input — which is exactly what the endpoint-pin
// comment claims and what this line measures rather than asserts.
const pathological = curveOf(0.0001, 0.02, 1);
console.log(
  `\nunsettled branch  springCurve(0.0001, 0.02, 1): settleMs ${pathological.settleMs} (cap+1), ` +
  `true position there ${pathological.unpinnedEnd.toFixed(6)}, so the pin ends the curve with a ` +
  `${(1 - pathological.unpinnedEnd).toFixed(4)} jump`
);
