// Generates builds/<id>/PROMPT.md for all 18 builds from the sealed assignment.
// The information block is the ONLY thing that differs; TASK.md is appended verbatim.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TASK = readFileSync(join(HERE, 'TASK.md'), 'utf8');
const COMPOSED = readFileSync(join(HERE, 'ARM-A-PROMPT.md'), 'utf8');
const CLI = join(HERE, 'raven-cli.mjs');
const ARENA = join(HERE, 'arena');

const ASSIGNMENT = {
  b01: 'A', b02: 'B2', b03: 'A', b04: 'B2', b05: 'A', b06: 'B1',
  b07: 'A', b08: 'B1', b09: 'A', b10: 'B1', b11: 'B2', b12: 'B1',
  b13: 'B2', b14: 'A', b15: 'B2', b16: 'B1', b17: 'B1', b18: 'B2',
};

const TOOLS = (arm) => `
A Raven MCP server is connected. Invoke a tool like this:

    node ${CLI} ${arm} <tool_name> '<json-args>'

Run it with a bad tool name to see the list of tools available to you. The project's design
system lives at \`${ARENA}\`. The taste profile is named \`kettle\` and the project is named
\`kettle\`.
`.trim();

const BLOCK = {
  A: `## Build prompt

The following build prompt was composed for you. Then do the task below.

---

${COMPOSED}`,

  B1: `## Instructions

Call \`read_design_md\`, \`get_taste_profile\` and \`audit_taste\` yourself, then do the task.

${TOOLS('B1')}`,

  B2: `## Instructions

A Raven MCP server is connected with the full local tool surface, including the design system,
the taste profile and its bindings, per-project taste decisions, and the project's Decision
Graph. Use whatever you need, then do the task.

${TOOLS('B2')}`,
};

const RULES = (id) => `
---

## Output

Write exactly two files, both into \`${join(HERE, 'builds', id)}/\`:

- \`index.html\` — the build
- \`NOTES.md\` — as specified in the task brief

## Ground rules

- Do not read anything under this round's directory other than what you are pointed at above.
  Specifically: do not open \`fixtures/\`, \`measure.mjs\`, \`PREREGISTRATION.md\`, or any other
  \`builds/\` directory. They contain the answer key and the scoring harness. A build that
  transcribes them measures nothing.
- Do not ask questions. Everything you need is in this file or reachable from it. Where a
  detail is genuinely unsettled, decide, build, and say so in \`NOTES.md\`.
- Finish. A partial build scores as a partial build.
`;

for (const [id, arm] of Object.entries(ASSIGNMENT)) {
  const dir = join(HERE, 'builds', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'PROMPT.md'), `${BLOCK[arm]}\n\n---\n\n${TASK}\n${RULES(id)}`);
}
console.log(`wrote ${Object.keys(ASSIGNMENT).length} prompts`);
