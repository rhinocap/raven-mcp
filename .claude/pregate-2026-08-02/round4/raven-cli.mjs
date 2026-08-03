// Round 4 tool access for arms B1 and B2.
//
// Why this exists: the MCP server connected to this session resolves its taste store
// from ~/.raven, which has no `kettle` profile. A B-arm agent calling get_taste_profile
// through it would get "profile not found" and the arm would have no tools at all. This
// shim runs the SAME registered tool handlers against the round-4 fixture stores.
// Andrew's live ~/.raven is never read or written.
//
// The arm restriction is enforced HERE, not in the builder's prompt. A gate that only
// lives in prose is one the next agent talks itself out of.
//
//   node raven-cli.mjs <arm> <tool> '<json-args>'
//
//   B1  exactly the three tools §13's original one-liner names, and nothing else
//   B2  the full local surface, minus the composer
//
// compose_build_prompt is denied to BOTH B arms. That is the independent variable.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = '/Users/accunliffe/projects/raven-mcp';

const [arm, tool, rawArgs] = process.argv.slice(2);

const B1_ALLOWED = new Set(['read_design_md', 'get_taste_profile', 'audit_taste']);
const DENIED_TO_ALL_B = new Set(['compose_build_prompt']);

const die = (msg) => { console.error(msg); process.exit(1); };

if (!arm || !tool) die('usage: node raven-cli.mjs <B1|B2> <tool> \'<json-args>\'');
if (arm !== 'B1' && arm !== 'B2') die(`unknown arm "${arm}" (expected B1 or B2)`);

if (DENIED_TO_ALL_B.has(tool)) {
  die(`"${tool}" is not available. Use the tools you have.`);
}
if (arm === 'B1' && !B1_ALLOWED.has(tool)) {
  die(`"${tool}" is not available in this configuration. Available tools: ${[...B1_ALLOWED].join(', ')}.`);
}

process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_TASTE_HOME = join(HERE, 'taste');
process.env.RAVEN_DECISIONS_HOME = join(HERE, 'arena', '.raven', 'decisions');
// decision_list writes a consultation trace on any non-empty result. A builder
// should not be silently mutating the fixture store mid-round.
process.env.RAVEN_NO_CONSULTATION_TRACE = '1';

const { buildServer } = await import(`${REPO}/dist/index.js`);
const { FsTasteStore } = await import(`${REPO}/dist/taste-store.js`);

const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });

const registered = server._registeredTools[tool];
if (!registered) {
  const names = Object.keys(server._registeredTools).sort();
  die(`no such tool "${tool}". ${names.length} tools available; try one of:\n  ${names.join('\n  ')}`);
}

let args;
try {
  args = rawArgs ? JSON.parse(rawArgs) : {};
} catch (err) {
  die(`arguments must be valid JSON: ${err.message}`);
}

const res = await registered.handler(args, {});
const text = res?.content?.[0]?.text ?? '';
process.stdout.write(text.endsWith('\n') ? text : text + '\n');
if (res?.isError) process.exit(2);
