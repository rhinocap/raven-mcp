// Re-derives every number in VERDICT.md's three tables from raw/, so the arrays
// stop being a memory reconstruction and become a reproducible computation.
// Run from .claude/pregate-2026-08-02/round2/:  node verify-arrays.mjs
import { readFileSync } from "node:fs";

const R2 = Object.fromEntries(
  JSON.parse(readFileSync("raw/round2-judges-refuters.json", "utf8")).result.builds.map(b => [b.build, b]));
const ABL = Object.fromEntries(
  JSON.parse(readFileSync("raw/ablation-judges-refuters.json", "utf8")).result.rows.map(r => [r.build, r]));

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

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const median = a => { const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const highDefects = d => (d || []).filter(x => x.severity === "high").length;
const fmt = (n, p = 1) => n.toFixed(p);

console.log("## Round 2 — as shipped");
const r2mean = {};
for (const [arm, ids] of Object.entries(R2_ARMS)) {
  const s = ids.map(i => R2[i].score);
  r2mean[arm] = mean(s);
  console.log(` ${arm} ${JSON.stringify(s)} mean ${fmt(mean(s))} median ${fmt(median(s))}`
    + ` range ${Math.min(...s)}-${Math.max(...s)} refuted ${fmt(mean(ids.map(i => R2[i].refute_score)))}`
    + ` ship ${ids.filter(i => R2[i].ship_ready).length}/6`
    + ` high ${ids.reduce((t, i) => t + highDefects(R2[i].defects), 0)}`);
}
console.log(` diff A-B ${fmt(r2mean.A - r2mean.B)}`);

console.log("\n## Ablation round");
for (const arm of ["A", "B"]) {
  const ids = Object.keys(ABL_MAP).filter(k => ABL_MAP[k][1] === arm);
  const s = ids.map(k => ABL[k].verdict.overall_score);
  console.log(` ${arm} ${JSON.stringify(s)} mean ${fmt(mean(s))} median ${fmt(median(s))}`
    + ` range ${Math.min(...s)}-${Math.max(...s)}`
    + ` refuted ${fmt(mean(ids.map(k => ABL[k].refutation.corrected_score)))}`
    + ` ship ${ids.filter(k => ABL[k].verdict.ship_ready).length}/6`
    + ` high ${ids.reduce((t, k) => t + highDefects(ABL[k].verdict.defects), 0)}`);
}

console.log("\n## Instrument noise floor (UNABLATED artifacts, judged twice)");
const deltas = [];
for (const k of Object.keys(ABL_MAP).filter(k => !ABL_MAP[k][2]).sort((a, b) => ABL_MAP[a][0] < ABL_MAP[b][0] ? -1 : 1)) {
  const [src, arm] = ABL_MAP[k];
  const before = R2[src].score, after = ABL[k].verdict.overall_score;
  deltas.push(after - before);
  console.log(` ${src} (${arm}) ${before} -> ${after}  ${after - before >= 0 ? "+" : ""}${after - before}`);
}
const m = mean(deltas);
const sd = Math.sqrt(deltas.reduce((t, d) => t + (d - m) ** 2, 0) / (deltas.length - 1));
console.log(` n=${deltas.length} mean ${fmt(m)} mean-abs-dev ${fmt(mean(deltas.map(Math.abs)))}`
  + ` sample sd ${fmt(sd, 2)} max |delta| ${Math.max(...deltas.map(Math.abs))}`);
