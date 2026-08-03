// POST-HOC, written after the Sol falsification pass raised it. arm-integrity.mjs only
// looked at MCP tool_use blocks and at `node raven-cli.mjs` invocations. It never asked
// whether a builder simply READ the fixture files from the shell.
//
// That is the breach that matters. Arm A is supposed to hold nothing but the composed
// prompt. B1 is supposed to see the design system only through three tools. If a builder
// ran `cat arena/.raven/decisions/nodes.json` it had the Decision Graph in full, whatever
// its arm said.
//
// The distinction that has to be got right: a shim call carries an arena path as an
// ARGUMENT --
//     node raven-cli.mjs B2 read_design_md '{"path":".../arena/DESIGN.md"}'   <- in arm
//     cat .../arena/DESIGN.md                                                 <- NOT in arm
// so a naive path grep flags every legitimate tool call. This strips the shim invocations
// first, then looks at what reading remains.
//
//   node arm-integrity2.mjs <tasksDir>

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const tasksDir = process.argv[2];
const ASSIGNMENT = JSON.parse(readFileSync(new URL('./assignment.json', import.meta.url), 'utf8'));
const MAP = readFileSync(new URL('./agent-map.txt', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => l.split('='));

const walk = (node, fn) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, fn));
  if (node && typeof node === 'object') { fn(node); for (const v of Object.values(node)) walk(v, fn); }
};

// Fixture material a builder is not supposed to read off disk.
const FIXTURE = /(arena\/DESIGN\.md|arena\/\.raven|round4\/taste\/kettle)/;
// A command that actually reads file contents, as opposed to listing a directory.
const READS = /\b(cat|head|tail|less|more|sed|awk|python3?|node|rg|grep|jq|perl)\b/;
// Listing only — reveals filenames, not content. Recorded separately.
const LISTS = /\b(ls|find|wc|stat|du)\b/;

console.log('build arm  direct-reads  listings   verdict');
const findings = [];

for (const [agentId, buildId] of MAP) {
  const file = join(tasksDir, `${agentId}.output`);
  if (!existsSync(file)) { console.log(`${buildId}  MISSING transcript`); continue; }
  const arm = ASSIGNMENT[buildId];

  const reads = [];
  const lists = [];

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    walk(obj, (n) => {
      if (n.type !== 'tool_use' || typeof n.name !== 'string') return;

      // The Read tool, pointed straight at fixture material.
      if (n.name === 'Read' || n.name === 'Grep' || n.name === 'Glob') {
        const t = JSON.stringify(n.input ?? {});
        if (FIXTURE.test(t)) reads.push(`${n.name}: ${(n.input.file_path || n.input.pattern || t).slice(0, 90)}`);
        return;
      }
      if (n.name !== 'Bash') return;

      const cmd = String(n.input?.command ?? '');
      // Strip every shim invocation, including its JSON argument, before judging what is left.
      const stripped = cmd.replace(/node\s+\S*raven-cli\.mjs\s+B[12]\s+\w+\s+('[^']*'|"[^"]*")?/g, ' ');
      if (!FIXTURE.test(stripped)) return;

      if (READS.test(stripped)) reads.push(cmd.replace(/\s+/g, ' ').slice(0, 110));
      else if (LISTS.test(stripped)) lists.push(cmd.replace(/\s+/g, ' ').slice(0, 110));
    });
  }

  // Arm A holds the prompt and nothing else — any fixture read at all is out of arm.
  // B1 sees the design system through three tools only, so a raw Decision Graph or taste
  // file read is out of arm. B2 has the full surface, so a direct read is redundant with
  // what it could already fetch; recorded, not counted as a breach.
  const outOfArm = arm === 'A' ? reads
                 : arm === 'B1' ? reads.filter((r) => /\.raven|taste\/kettle/.test(r))
                 : [];

  const verdict = outOfArm.length ? `OUT OF ARM (${outOfArm.length})` : 'in arm';
  console.log(`${buildId}  ${arm.padEnd(2)}   ${String(reads.length).padStart(2)}           ${String(lists.length).padStart(2)}        ${verdict}`);
  if (outOfArm.length) findings.push({ buildId, arm, outOfArm });
}

if (findings.length) {
  console.log('\n=== OUT-OF-ARM READS ===');
  for (const f of findings) {
    console.log(`\n${f.buildId} [${f.arm}]`);
    for (const r of [...new Set(f.outOfArm)]) console.log(`   ${r}`);
  }
  console.log(`\n${findings.length} build(s) read fixture material outside their arm.`);
} else {
  console.log('\nNo build read fixture material outside its arm.');
}
