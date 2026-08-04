// The Raven tool entry point for a round-5 build. Deployed next to the build directories;
// forwards to the round's harness, which is where the arm restriction and the path
// redaction actually live.
//
//   node raven-cli.mjs <A|B1|B2> <tool> '<json-args>'
//
// It is a stub rather than a copy so that the fixture store's location is written down in
// exactly one place, inside a directory every arm is forbidden to read.

import { spawnSync } from 'node:child_process';

const TARGET = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round5/raven-cli.mjs';
const r = spawnSync(process.execPath, [TARGET, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
