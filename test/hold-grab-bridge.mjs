// Starts one grab-bridge proxy session and holds it open so a human (or a
// browser-automation pass) can look at the actual rendered surface. Run by hand:
//   node test/hold-grab-bridge.mjs https://github.com
// Ctrl-C to stop. Lives inside the project because ESM resolves imports from the
// script's own path, not from NODE_PATH.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bridge = await import('../dist/grab-bridge.js');

const target = process.argv[2] || 'https://github.com';
const dir = await mkdtemp(path.join(tmpdir(), 'raven-hold-'));
const designPath = path.join(dir, 'DESIGN.md');
await writeFile(designPath, `---
color:
  text:
    primary: "#f7f8f8"
type:
  size:
    hero: "64px"
  leading:
    hero: "64px"
space:
  gap:
    md: "24px"
---

# Fixture tokens
`, 'utf8');

const session = await bridge.startGrabSession(designPath, undefined, target, 'consumer');
console.log(JSON.stringify({ url: session.url, target, warning: session.warning }, null, 2));

process.on('SIGINT', async () => { await bridge.stopGrabSession(); process.exit(0); });
process.on('SIGTERM', async () => { await bridge.stopGrabSession(); process.exit(0); });
setInterval(() => {}, 1 << 30);
