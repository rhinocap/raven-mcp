// Exploratory, decides nothing. Classification is taken from what each control check READS,
// per its implementation in measure5.mjs — not from how the arms scored on it.
//   TREATMENT-DEPENDENT (needs DESIGN.md content arm A cannot obtain):
//     C3 exact type ramp {12,13,15,19,26}; C4 the seven exact ds-* names
//   NAME-DEPENDENT (composer does emit token names): C2
//   ARM-NEUTRAL (generic craft, no DESIGN.md content): C1 C5 C6 C7 C8
import { readFileSync } from 'node:fs';
const scores = Object.fromEntries(JSON.parse(readFileSync('/tmp/r5-scores.json','utf8')).results.map((r)=>[r.build,r]));
const A = JSON.parse(readFileSync('./assignment.json','utf8'));
const SETS = { neutral:['C1','C5','C6','C7','C8'], nameDep:['C2'], treatmentDep:['C3','C4'] };
const byArm = (arm, set) => Object.entries(A).filter(([,a])=>a===arm)
  .map(([id])=>set.filter(c=>scores[id].checks[c]).length);
const stat=(v)=>{const m=v.reduce((s,x)=>s+x,0)/v.length;
  const sd=Math.sqrt(v.reduce((s,x)=>s+(x-m)**2,0)/(v.length-1));return {m,sd};};
for (const [name,set] of Object.entries(SETS)) {
  console.log(`\n## ${name}  (${set.join(',')})  max ${set.length}`);
  for (const arm of ['A','B1','B2']) {
    const v=byArm(arm,set), {m,sd}=stat(v);
    console.log(`  ${arm.padEnd(2)} mean ${m.toFixed(2)} sd ${sd.toFixed(2)}  [${v.join(', ')}]`);
  }
}
