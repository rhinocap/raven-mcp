import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const base = '/private/tmp/claude-501/-Users-accunliffe-projects-raven-mcp/597ce6a8-fd03-4b4e-badf-6f00d1dc327e/scratchpad/pregate';
const { buildServer } = await import('/Users/accunliffe/projects/raven-mcp/dist/index.js');
const { FsTasteStore } = await import('/Users/accunliffe/projects/raven-mcp/dist/taste-store.js');
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });

async function call(name, args) {
  const res = await server._registeredTools[name].handler(args, {});
  return JSON.parse(res.content[0].text);
}

const summary = {};
for (const arm of ['arm-a', 'arm-b']) {
  const html = readFileSync(path.join(base, arm, 'index.html'), 'utf8');
  const taste = await call('audit_taste', { profile: 'andrew', html, surface: 'portfolio editor surface' });
  const talon = await call('talon_scan', { html });
  writeFileSync(path.join(base, arm, 'audit-taste.json'), JSON.stringify(taste, null, 2));
  writeFileSync(path.join(base, arm, 'talon-scan.json'), JSON.stringify(talon, null, 2));
  summary[arm] = {
    bytes: html.length,
    taste_verdict: taste.verdict,
    taste_findings: (taste.findings || []).map(f => `${f.severity}:${f.rule_id}`),
    taste_not_assessed: (taste.not_assessed || []).length,
    talon_findings: (talon.findings || []).map(f => `${f.severity ?? ''}:${f.rule_id ?? f.rule ?? ''}`),
  };
}
console.log(JSON.stringify(summary, null, 2));
