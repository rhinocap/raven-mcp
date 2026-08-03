// Machine judge for round 2 — same instruments and args as round 1's judge.mjs
// (audit_taste with the same profile+surface, talon_scan), applied to every build dir.
// Usage: node judge-batch.mjs <dir> [<dir> ...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const { buildServer } = await import('/Users/accunliffe/projects/raven-mcp/dist/index.js');
const { FsTasteStore } = await import('/Users/accunliffe/projects/raven-mcp/dist/taste-store.js');

// buildServer({remote:false}) explicitly — bare buildServer() falls back to RAVEN_REMOTE
// and would silently measure the remote server instead of the stdio one.
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });

async function call(name, args) {
  const res = await server._registeredTools[name].handler(args, {});
  return JSON.parse(res.content[0].text);
}

const dirs = process.argv.slice(2).map((d) => path.resolve(d));
const summary = {};

for (const dir of dirs) {
  const name = path.basename(dir);
  const htmlPath = path.join(dir, 'index.html');
  if (!existsSync(htmlPath)) { summary[name] = { error: 'MISSING index.html' }; continue; }
  const html = readFileSync(htmlPath, 'utf8');
  const taste = await call('audit_taste', { profile: 'andrew', html, surface: 'portfolio editor surface' });
  const talon = await call('talon_scan', { html });
  writeFileSync(path.join(dir, 'audit-taste.json'), JSON.stringify(taste, null, 2));
  writeFileSync(path.join(dir, 'talon-scan.json'), JSON.stringify(talon, null, 2));
  summary[name] = {
    bytes: html.length,
    taste_verdict: taste.verdict,
    taste_findings: (taste.findings || []).map((f) => `${f.severity}:${f.rule_id}`),
    taste_not_assessed: (taste.not_assessed || []).length,
    talon_findings: (talon.findings || []).map((f) => `${f.severity ?? ''}:${f.rule_id ?? f.rule ?? ''}`),
  };
}

writeFileSync(
  path.join(path.dirname(dirs[0]), 'machine-judge.json'),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
