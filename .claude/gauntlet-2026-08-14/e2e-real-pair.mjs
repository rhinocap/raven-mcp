#!/usr/bin/env node
/**
 * Real-pair e2e for design_gauntlet — NOT in npm test (live network + real
 * Chromium, like test/e2e-pattern-library.mjs). Drives the REGISTERED TOOL
 * HANDLER (not the module functions), so the wiring the unit suite cannot see
 * — schema → handler → probe → comparator → response shape — is what is
 * graded. Subject: https://ravenmcp.ai  Reference: https://linear.app
 * Run by hand: node .claude/gauntlet-2026-08-14/e2e-real-pair.mjs
 */
import assert from 'node:assert/strict';
import { buildServer } from '../../dist/index.js';
import { FsTasteStore } from '../../dist/taste-store.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; console.log(`  ✓ ${msg}`); };

// A real MCP client over an in-memory pair, so the zod schema layer runs —
// calling the handler directly would skip exactly the seam this e2e exists for.
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
ok(server._registeredTools.design_gauntlet, 'design_gauntlet is registered on the local stdio server');
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'gauntlet-e2e', version: '1.0.0' }, { capabilities: {} });
await server.connect(serverTransport);
await client.connect(clientTransport);

console.log('measuring https://ravenmcp.ai vs https://linear.app (live, headless Chromium)…');
const res = await client.callTool(
  { name: 'design_gauntlet', arguments: { subject_url: 'https://ravenmcp.ai', reference_url: 'https://linear.app' } },
  undefined,
  { timeout: 240000 },
);
const text = res.content[0].text;
ok(!text.startsWith('Playwright chromium not available'), 'chromium launched (capture path exercised, not the fallback message)');
const out = JSON.parse(text);

ok(out.tool === 'design_gauntlet', 'response names the tool');
ok(typeof out.discipline === 'string' && out.discipline.length > 0, 'discipline notice embedded');
ok(Array.isArray(out.loop_protocol) && out.loop_protocol.length === 6, 'loop protocol embedded, 6 steps');

for (const [label, m] of [['subject', out.subject], ['reference', out.reference]]) {
  ok(m.url.includes(label === 'subject' ? 'ravenmcp.ai' : 'linear.app'), `${label} measured the right URL`);
  ok(m.viewport === '1440x900', `${label} used the default viewport`);
  ok(m.color_scheme === 'light', `${label} reports the emulated color scheme`);
  ok(m.visible_elements > 50, `${label} saw a laid-out page (${m.visible_elements} visible elements — the zero-height trap did not fire)`);
  ok(typeof m.fonts_status === 'string' && m.fonts_status.length > 0, `${label} reports fonts_status (${m.fonts_status})`);
  ok(m.surfaces.tally.length > 0, `${label} surfaces tally populated`);
  ok(m.text.tally.length > 0, `${label} text-color tally populated`);
  ok(m.type.sizes.length > 0 && m.type.families.length > 0, `${label} type scale populated`);
  ok(m.rhythm.containers.length > 0, `${label} rhythm containers measured`);
  ok(m.tracking.body.length > 0, `${label} body tracking measured`);
}

ok(out.diff.length === 13, `diff has 13 rows (got ${out.diff.length})`);
for (const row of out.diff) ok2(row);
function ok2(row) {
  assert.ok(typeof row.subject_worse === 'boolean' && row.dimension && row.metric, `diff row well-formed: ${row.dimension}/${row.metric}`);
}
console.log(`  ✓ all 13 diff rows well-formed`); checks++;

const failing = out.diff.filter((r) => r.subject_worse);
ok(out.verdict.on_par === (failing.length === 0), `verdict.on_par (${out.verdict.on_par}) agrees with the diff's worse-count (${failing.length})`);
ok(out.bar.length === Math.min(failing.length, 7), `bar carries min(failing, 7) checks (${out.bar.length})`);
const mechs = new Set([...out.fixes.mechanical, ...out.fixes.needs_a_decision].map((f) => f.mechanism));
ok(out.verdict.failing_mechanisms.every((m) => mechs.has(m)), 'every failing mechanism has a fix entry');
if (!out.verdict.on_par) ok(out.verdict.biggest_gap !== null, `biggest_gap named: ${out.verdict.biggest_gap}`);
for (const b of out.bar) ok(b.check.length > 0, `bar check is concrete: [${b.id}] ${b.check.slice(0, 90)}`);

console.log(`\nverdict.on_par = ${out.verdict.on_par}; biggest_gap = ${out.verdict.biggest_gap}`);
console.log(`bar: ${out.bar.map((b) => b.id).join(', ') || '(empty)'}`);
console.log(`fixes: ${out.fixes.mechanical.length} mechanical / ${out.fixes.needs_a_decision.length} needs_a_decision`);
console.log(`subject warnings: ${JSON.stringify(out.subject.warnings)}`);
console.log(`reference warnings: ${JSON.stringify(out.reference.warnings)}`);
console.log(`\nALL ${checks} CHECKS PASSED`);
await client.close();
await server.close();
