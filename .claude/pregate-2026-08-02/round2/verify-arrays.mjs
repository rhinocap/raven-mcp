// Re-derives every number in VERDICT.md's three tables from raw/, so the arrays stop
// being a memory reconstruction and become a reproducible computation that FAILS LOUDLY.
// Run from .claude/pregate-2026-08-02/round2/:  node verify-arrays.mjs   (exit 1 on any mismatch)
//
// One step is not mechanized: ABL_MAP and R2_ARMS are transcribed BY HAND from
// ARM-MAPPING.md and ABLATION-MAPPING.md, because those files are prose tables. The
// integrity checks below constrain the transcription (right cardinality, no duplicates,
// every id present in raw/, both arms balanced) but they cannot prove an arm label was
// not swapped — read the two mapping files if that is the thing you are checking.
import { readFileSync } from "node:fs";

function index(rows, label) {
  const map = {};
  for (const row of rows) {
    if (map[row.build] !== undefined) throw new Error(`${label}: duplicate build id ${row.build}`);
    map[row.build] = row;
  }
  return map;
}

const R2 = index(JSON.parse(readFileSync("raw/round2-judges-refuters.json", "utf8")).result.builds, "round2");
const ABL = index(JSON.parse(readFileSync("raw/ablation-judges-refuters.json", "utf8")).result.rows, "ablation");

// From ARM-MAPPING.md / ABLATION-MAPPING.md: [source build, arm, was ablated]
const ABL_MAP = {
  "abl-01": ["build-08", "B", false], "abl-02": ["build-03", "A", true],
  "abl-03": ["build-10", "B", false], "abl-04": ["build-02", "A", false],
  "abl-05": ["build-06", "A", true],  "abl-06": ["build-01", "B", false],
  "abl-07": ["build-12", "A", true],  "abl-08": ["build-05", "B", false],
  "abl-09": ["build-09", "A", true],  "abl-10": ["build-11", "B", false],
  "abl-11": ["build-07", "A", true],  "abl-12": ["build-04", "B", false],
};
const R2_ARMS = {
  A: ["build-02", "build-03", "build-06", "build-07", "build-09", "build-12"],
  B: ["build-01", "build-04", "build-05", "build-08", "build-10", "build-11"],
};

// Integrity: the maps must account for every raw row exactly once, and no more.
function checkCoverage(label, ids, raw) {
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new Error(`${label}: map lists an id twice`);
  const rawIds = Object.keys(raw);
  const missing = ids.filter(id => raw[id] === undefined);
  const extra = rawIds.filter(id => !unique.has(id));
  if (missing.length) throw new Error(`${label}: mapped ids absent from raw/: ${missing.join(", ")}`);
  if (extra.length) throw new Error(`${label}: raw/ rows no map claims: ${extra.join(", ")}`);
}
checkCoverage("round2", [...R2_ARMS.A, ...R2_ARMS.B], R2);
checkCoverage("ablation", Object.keys(ABL_MAP), ABL);
for (const arm of ["A", "B"]) {
  if (R2_ARMS[arm].length !== 6) throw new Error(`round2 arm ${arm} is not 6 builds`);
  if (Object.keys(ABL_MAP).filter(k => ABL_MAP[k][1] === arm).length !== 6) throw new Error(`ablation arm ${arm} is not 6 rows`);
}

const num = (v, where) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${where}: score is not a finite number (${JSON.stringify(v)})`);
  return v;
};
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const median = a => { const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const highDefects = d => (d || []).filter(x => x.severity === "high").length;
const fmt = (n, p = 1) => n.toFixed(p);

// Transcribed from VERDICT.md's three tables. Every produced line must match its
// expected line character for character, or this exits 1.
const EXPECTED = [
  "A [83,64,64,60,72,64] mean 67.8 median 64.0 range 60-83 refuted 67.5 ship 1/6 high 5",
  "B [83,85,76,85,87,85] mean 83.5 median 85.0 range 76-87 refuted 82.5 ship 5/6 high 0",
  "diff A-B -15.7",
  "A [85,76,88,83,79,80] mean 81.8 median 81.5 range 76-88 refuted 81.7 ship 4/6 high 1",
  "B [87,74,83,85,87,87] mean 83.8 median 86.0 range 74-87 refuted 82.7 ship 5/6 high 1",
  "deltas [0,-7,2,9,2,-13,2]",
  "n=7 mean -0.7 mean |delta| 5.0 sample sd 7.16 max |delta| 13",
];
const produced = [];
const emit = line => { produced.push(line); return line; };

console.log("## Round 2 — as shipped");
const r2mean = {};
for (const [arm, ids] of Object.entries(R2_ARMS)) {
  const s = ids.map(i => num(R2[i].score, `round2 ${i}`));
  r2mean[arm] = mean(s);
  console.log(" " + emit(`${arm} ${JSON.stringify(s)} mean ${fmt(mean(s))} median ${fmt(median(s))}`
    + ` range ${Math.min(...s)}-${Math.max(...s)} refuted ${fmt(mean(ids.map(i => num(R2[i].refute_score, `round2 refute ${i}`))))}`
    + ` ship ${ids.filter(i => R2[i].ship_ready).length}/6`
    + ` high ${ids.reduce((t, i) => t + highDefects(R2[i].defects), 0)}`));
}
console.log(" " + emit(`diff A-B ${fmt(r2mean.A - r2mean.B)}`));

console.log("\n## Ablation round");
for (const arm of ["A", "B"]) {
  const ids = Object.keys(ABL_MAP).filter(k => ABL_MAP[k][1] === arm);
  const s = ids.map(k => num(ABL[k].verdict.overall_score, `ablation ${k}`));
  console.log(" " + emit(`${arm} ${JSON.stringify(s)} mean ${fmt(mean(s))} median ${fmt(median(s))}`
    + ` range ${Math.min(...s)}-${Math.max(...s)}`
    + ` refuted ${fmt(mean(ids.map(k => num(ABL[k].refutation.corrected_score, `ablation refute ${k}`))))}`
    + ` ship ${ids.filter(k => ABL[k].verdict.ship_ready).length}/6`
    + ` high ${ids.reduce((t, k) => t + highDefects(ABL[k].verdict.defects), 0)}`));
}

console.log("\n## Instrument noise floor (UNABLATED artifacts, judged twice)");
const deltas = [];
for (const k of Object.keys(ABL_MAP).filter(k => !ABL_MAP[k][2]).sort((a, b) => ABL_MAP[a][0] < ABL_MAP[b][0] ? -1 : 1)) {
  const [src, arm] = ABL_MAP[k];
  const before = num(R2[src].score, `noise before ${src}`), after = num(ABL[k].verdict.overall_score, `noise after ${k}`);
  deltas.push(after - before);
  console.log(` ${src} (${arm}) ${before} -> ${after}  ${after - before >= 0 ? "+" : ""}${after - before}`);
}
const m = mean(deltas);
// Sample sd, n-1. The second figure is the mean ABSOLUTE CHANGE (mean |delta|), i.e. the
// typical size of a re-judge swing on byte-identical input — NOT mean absolute deviation
// about the mean, which for these deltas is 5.3. The noise floor wants the former.
const sd = Math.sqrt(deltas.reduce((t, d) => t + (d - m) ** 2, 0) / (deltas.length - 1));
console.log(" " + emit(`deltas ${JSON.stringify(deltas)}`));
console.log(" " + emit(`n=${deltas.length} mean ${fmt(m)} mean |delta| ${fmt(mean(deltas.map(Math.abs)))}`
  + ` sample sd ${fmt(sd, 2)} max |delta| ${Math.max(...deltas.map(Math.abs))}`));

console.log("\n## Against VERDICT.md");
let failed = 0;
for (let i = 0; i < EXPECTED.length; i++) {
  if (produced[i] === EXPECTED[i]) { console.log(` ok   ${EXPECTED[i]}`); continue; }
  failed++;
  console.log(` FAIL expected: ${EXPECTED[i]}`);
  console.log(`      produced: ${produced[i]}`);
}
if (produced.length !== EXPECTED.length) { failed++; console.log(` FAIL line count ${produced.length} != ${EXPECTED.length}`); }
console.log(failed === 0
  ? `\nAll ${EXPECTED.length} published figures reproduce from raw/.`
  : `\n${failed} figure(s) do NOT reproduce.`);
process.exit(failed === 0 ? 0 : 1);
