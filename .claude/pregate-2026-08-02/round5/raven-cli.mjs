// Round 5 tool access. The arm restriction is enforced HERE, in code, for all three arms.
//
//   node raven-cli.mjs <arm> <tool> '<json-args>'
//
//   A   compose_build_prompt, and nothing else
//   B1  exactly the three tools §13's original one-liner names, and nothing else
//   B2  the full local surface, minus the composer
//
// compose_build_prompt is the independent variable: arm A has only it, the B arms cannot
// reach it at all.
//
// TWO CHANGES FROM ROUND 4, both of them fixes for things that invalidated that round.
//
// 1. Arm A is a TOOL ARM. In round 4 arm A was handed a pre-composed block of text with no
//    tools, while B1 and B2 got a working shim — so the arms differed in workflow as well
//    as in information, and arm A's own prompt told it to make a second composer call it
//    had no way to make. Here every arm drives the same shim, and arm A runs the composer's
//    real two-call workflow itself: once for grounding, again with the skeleton it derives.
//
// 2. ABSOLUTE PATHS ARE REDACTED from every tool result, in every arm, uniformly. Round 4's
//    composed prompt cited the fixture's filesystem path, and all six arm-A builds simply
//    opened the file — which is not misconduct, it is what the treatment pointed at. The
//    round measured "composed prompt plus the design system" against "tools", and the
//    contrast it was built to test did not exist. Redacting the path removes the side
//    channel without removing any content: what a tool RETURNS is still returned in full.

import { join } from 'node:path';

const REPO = '/Users/accunliffe/projects/raven-mcp';
// This file stays inside the round's harness directory, which every arm is forbidden to
// read. What sits next to the build directories is a two-line stub that forwards here
// (`raven-cli-stub.mjs`). That is the whole reason for the indirection: the store path is
// written down exactly once, behind a boundary that `arm-integrity5.mjs` already treats as
// an invalidating breach — so there is no route to it that is not also a detected one. In
// round 4 the fixture's path was handed to arm A in its own prompt.
const STORE = '/Users/accunliffe/.pregate-r5-8f3a2c';
const ARENA = join(STORE, 'arena');

const [arm, tool, rawArgs] = process.argv.slice(2);

const A_ALLOWED = new Set(['compose_build_prompt']);
const B1_ALLOWED = new Set(['read_design_md', 'get_taste_profile', 'audit_taste']);

const die = (msg) => { console.error(msg); process.exit(1); };

if (!arm || !tool) die('usage: node raven-cli.mjs <A|B1|B2> <tool> \'<json-args>\'');
if (!['A', 'B1', 'B2'].includes(arm)) die(`unknown arm "${arm}" (expected A, B1 or B2)`);

if (arm === 'A' && !A_ALLOWED.has(tool)) {
  die(`"${tool}" is not available in this configuration. Available tools: compose_build_prompt.`);
}
if (arm !== 'A' && tool === 'compose_build_prompt') {
  die(`"${tool}" is not available. Use the tools you have.`);
}
if (arm === 'B1' && !B1_ALLOWED.has(tool)) {
  die(`"${tool}" is not available in this configuration. Available tools: ${[...B1_ALLOWED].join(', ')}.`);
}

process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_TASTE_HOME = join(STORE, 'taste');
process.env.RAVEN_DECISIONS_HOME = join(ARENA, '.raven', 'decisions');
// decision_list writes a consultation trace on any non-empty result. A builder should not
// be silently mutating the fixture store mid-round.
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

// A filesystem path is the one argument a builder cannot supply, because no path is ever
// disclosed to any arm. Fill them in from the tool's own declared schema — asking the zod
// shape rather than keeping a hand-maintained list, so a tool that takes a path never
// silently receives nothing. An explicitly passed path is overridden rather than honoured:
// otherwise a builder who went looking for the store could point the tools elsewhere and
// the redaction below would be decoration.
//
// `design_file_path` is filled in for the same reason, and it closes a real round-4
// asymmetry: inventory_design_system and diff_design_system throw ENOENT on a project with
// no configured source, while the composer catches that and falls back. In round 4 that was
// disclosed as favouring arm A and left in place. Here it is removed, because with arm A
// now a tool arm there is no longer any reason to keep a handicap in the B arms.
const shape = registered.inputSchema?.shape ?? {};
if ('project_dir' in shape) args.project_dir = ARENA;
if ('design_file_path' in shape) args.design_file_path = join(ARENA, 'DESIGN.md');
if (tool === 'read_design_md' && 'path' in shape) args.path = join(ARENA, 'DESIGN.md');

// Uniform redaction, applied to every arm. Content is untouched; only the location of the
// files on disk is removed, in both raw and JSON-escaped form.
const redact = (s) => s
  .split(STORE.replace(/\//g, '\\/')).join('<store>')
  .split(STORE).join('<store>')
  .split(REPO.replace(/\//g, '\\/')).join('<repo>')
  .split(REPO).join('<repo>')
  .split('/Users/accunliffe').join('<home>');

// Some handlers throw rather than returning an isError result — get_taste_profile does it
// on a bad argument name. An uncaught throw prints a node stack trace, and a stack trace
// carries absolute paths straight past the redaction above. Catch, redact, and hand back
// the message the tool actually raised: the builder still learns it called the tool wrong,
// and still learns nothing about where anything lives on disk.
let res;
try {
  res = await registered.handler(args, {});
} catch (err) {
  console.error(redact(`${tool} failed: ${err?.message ?? String(err)}`));
  process.exit(2);
}

const text = redact(res?.content?.[0]?.text ?? '');
process.stdout.write(text.endsWith('\n') ? text : text + '\n');
if (res?.isError) process.exit(2);
