// Did any builder get its design material from somewhere other than its own arm's tools?
//
// This is the check that invalidated round 4, and it is stricter here. In round 4 a direct
// read was judged per-arm — tolerated for B2 on the grounds that B2 could fetch the same
// content through tools anyway. Round 5 does not make that allowance for anyone. The store
// path is disclosed to no arm and redacted out of every tool result, so touching it at all
// means a builder went looking, which the ground rules forbid for every arm equally. An
// information breach and a workflow breach are both breaches of the thing being measured.
//
// The distinction that has to be got right: a shim invocation legitimately carries the arm
// name and a tool name on a `node .../raven-cli.mjs` command line, and after round 5's schema
// injection it carries no path at all. So shim calls are stripped first, and what remains is
// judged.
//
//   node arm-integrity5.mjs <tasksDir>

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const tasksDir = process.argv[2];
if (!tasksDir) { console.error('usage: node arm-integrity5.mjs <tasksDir>'); process.exit(1); }

const ASSIGNMENT = JSON.parse(readFileSync(new URL('./assignment.json', import.meta.url), 'utf8'));
const MAP = readFileSync(new URL('./agent-map.txt', import.meta.url), 'utf8')
  .trim().split('\n').filter(Boolean).map((l) => l.split('='));

const walk = (node, fn) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, fn));
  if (node && typeof node === 'object') { fn(node); for (const v of Object.values(node)) walk(v, fn); }
};

// Anything belonging to the experiment that a builder is not supposed to touch: the fixture
// store, the round's harness directory (which is also where the store's path is written
// down), and any build directory that is not its own. The builder's own workspace root is
// NOT forbidden — it is the directory it was told to write into.
const forbidden = (buildId) => new RegExp(
  `(\\.pregate-r5-8f3a2c|pregate-2026-08-02|/builds/(?!${buildId})b\\d\\d)`);
const READS = /\b(cat|head|tail|less|more|sed|awk|python3?|node|rg|grep|jq|perl|open)\b/;
const LISTS = /\b(ls|find|wc|stat|du|tree)\b/;

console.log('build arm  reads  listings  verdict');
const findings = [];

for (const [agentId, buildId] of MAP) {
  const candidates = [join(tasksDir, `${agentId}.output`), join(tasksDir, `${agentId}.jsonl`),
    join(tasksDir, `agent-${agentId}.jsonl`)];
  const file = candidates.find((f) => existsSync(f));
  if (!file) { console.log(`${buildId}  MISSING transcript (looked for ${agentId}.*)`); continue; }
  const arm = ASSIGNMENT[buildId];
  const FORBIDDEN = forbidden(buildId);

  const reads = [], lists = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    walk(obj, (n) => {
      if (n.type !== 'tool_use' || typeof n.name !== 'string') return;

      if (n.name === 'Read' || n.name === 'Grep' || n.name === 'Glob') {
        const t = JSON.stringify(n.input ?? {});
        if (FORBIDDEN.test(t)) reads.push(`${n.name}: ${(n.input.file_path || n.input.path || n.input.pattern || t).slice(0, 100)}`);
        return;
      }
      if (n.name !== 'Bash') return;

      const cmd = String(n.input?.command ?? '');
      // Strip shim invocations, including any JSON argument, before judging what is left.
      const stripped = cmd.replace(/node\s+\S*raven-cli\.mjs\s+(A|B1|B2)\s+\w+\s*('[^']*'|"[^"]*")?/g, ' ');
      if (!FORBIDDEN.test(stripped)) return;
      if (READS.test(stripped)) reads.push(cmd.replace(/\s+/g, ' ').slice(0, 120));
      else if (LISTS.test(stripped)) lists.push(cmd.replace(/\s+/g, ' ').slice(0, 120));
    });
  }

  const verdict = reads.length ? `OUT OF ARM (${reads.length})` : lists.length ? 'listings only' : 'in arm';
  console.log(`${buildId}  ${arm.padEnd(2)}   ${String(reads.length).padStart(2)}     ${String(lists.length).padStart(2)}       ${verdict}`);
  if (reads.length) findings.push({ buildId, arm, reads });
  else if (lists.length) findings.push({ buildId, arm, reads: [], lists });
}

if (findings.some((f) => f.reads.length)) {
  console.log('\n=== OUT-OF-ARM READS ===');
  for (const f of findings.filter((x) => x.reads.length)) {
    console.log(`\n${f.buildId} [${f.arm}]`);
    for (const r of [...new Set(f.reads)]) console.log(`   ${r}`);
  }
  const n = findings.filter((f) => f.reads.length).length;
  console.log(`\n${n} build(s) read experiment material outside their arm. Per §2 and §10 of`);
  console.log('PREREGISTRATION-R5.md that is an invalidating breach, not a caveat — the same');
  console.log('finding that ended round 4.');
  process.exit(1);
}
const listOnly = findings.filter((f) => f.lists?.length);
if (listOnly.length) {
  console.log('\n=== LISTINGS ONLY (filenames seen, no content read) ===');
  for (const f of listOnly) { console.log(`\n${f.buildId} [${f.arm}]`); for (const l of [...new Set(f.lists)]) console.log(`   ${l}`); }
  console.log('\nRecorded, not counted as a breach: a listing reveals names, not decisions.');
}
console.log('\nNo build read experiment material outside its arm.');
