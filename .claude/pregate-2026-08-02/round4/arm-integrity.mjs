// Did any builder reach outside its arm?
//
// Subagents inherit this session's MCP config, so a builder can call mcp__raven__* against
// Andrew's REAL ~/.raven store, bypassing raven-cli.mjs and its arm restriction entirely.
// Arm A is supposed to have no tool access at all; B1 is supposed to have exactly three
// tools. If a builder went around the shim, its arm label is wrong and the round is
// corrupted.
//
// Grepping the transcript for "mcp__raven__" is worthless — the full tool list appears in
// every agent's system prompt. This parses the JSONL and counts actual tool_use blocks.
//
//   node arm-integrity.mjs <tasksDir> <agentId>=<buildId> [...]

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [tasksDir, ...pairs] = process.argv.slice(2);
if (!tasksDir || !pairs.length) {
  console.error('usage: node arm-integrity.mjs <tasksDir> <agentId>=<buildId> [...]');
  process.exit(1);
}

const ASSIGNMENT = JSON.parse(readFileSync(new URL('./assignment.json', import.meta.url), 'utf8'));
const B1_ALLOWED = new Set(['read_design_md', 'get_taste_profile', 'audit_taste']);

const walk = (node, fn) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, fn));
  if (node && typeof node === 'object') {
    fn(node);
    for (const v of Object.values(node)) walk(v, fn);
  }
};

let anyViolation = false;

for (const pair of pairs) {
  const [agentId, buildId] = pair.split('=');
  const file = join(tasksDir, `${agentId}.output`);
  if (!existsSync(file)) { console.log(`${buildId}  MISSING transcript`); continue; }

  const mcpCalls = [];        // real mcp__raven__* invocations
  const cliCalls = [];        // node raven-cli.mjs <arm> <tool>
  const readsOfKey = [];      // fixtures/, measure.mjs, PREREGISTRATION, other builds

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    walk(obj, (n) => {
      if (n.type !== 'tool_use' || typeof n.name !== 'string') return;
      const input = JSON.stringify(n.input ?? {});
      if (n.name.startsWith('mcp__raven__')) mcpCalls.push(n.name.replace('mcp__raven__', ''));
      if (n.name === 'Bash') {
        const m = input.match(/raven-cli\.mjs\s+(B1|B2)\s+([a-z_]+)/);
        if (m) cliCalls.push({ arm: m[1], tool: m[2] });
      }
      if (/fixtures\/(conformant|defective)|measure\.mjs|PREREGISTRATION|SEALED-ASSIGNMENT|COMPOSED-PROMPT|leak-check|analyze4/.test(input)) {
        readsOfKey.push(n.name);
      }
      const other = input.match(/builds\/(b\d\d)\//g) || [];
      for (const o of other) {
        const id = o.slice(7, 10);
        if (id !== buildId) readsOfKey.push(`other-build:${id}`);
      }
    });
  }

  const arm = ASSIGNMENT[buildId];

  // A probe with a deliberately bad tool name is how the shim tells an agent what it has
  // — the prompt invites it. Not a reach for anything.
  const isProbe = (t) => /^_/.test(t) || t === 'list' || t === 'tools';
  const real = cliCalls.filter((c) => !isProbe(c.tool));

  // A BREACH is going around the shim. A REFUSED REACH is asking the shim for something
  // outside the arm and being told no — the gate worked, and what was reached for is a
  // finding in its own right.
  const breaches = [];
  const reaches = [];

  if (mcpCalls.length) breaches.push(`bypassed the shim via MCP: ${[...new Set(mcpCalls)].join(', ')}`);
  if (arm === 'A' && real.length) breaches.push(`arm A used tools: ${[...new Set(real.map((c) => c.tool))].join(', ')}`);
  const wrongArm = real.filter((c) => c.arm !== arm);
  if (wrongArm.length) breaches.push(`ran the CLI as the wrong arm: ${[...new Set(wrongArm.map((c) => c.arm))].join(', ')}`);
  if (readsOfKey.length) breaches.push(`touched withheld material: ${[...new Set(readsOfKey)].join(', ')}`);

  const denied = real.filter((c) => c.tool === 'compose_build_prompt'
    || (arm === 'B1' && !B1_ALLOWED.has(c.tool)));
  if (denied.length) reaches.push([...new Set(denied.map((c) => c.tool))].join(', '));

  if (breaches.length) anyViolation = true;
  const tools = [...new Set(real.map((c) => c.tool))];
  console.log(
    `${buildId} [${arm.padEnd(2)}]  mcp=${mcpCalls.length}  cli=${real.length}` +
    `${tools.length ? ` (${tools.join(', ')})` : ''}\n` +
    (breaches.length ? `    BREACH: ${breaches.join('\n    BREACH: ')}\n` : '') +
    (reaches.length ? `    reached for and was refused: ${reaches.join('; ')}\n` : '') +
    (breaches.length ? '' : '    arm intact\n')
  );
}

console.log(anyViolation
  ? 'At least one build BREACHED its arm. Do not analyse until each is dispositioned.'
  : 'No breaches. Every checked build stayed inside its arm.');
