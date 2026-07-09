import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Same RAVEN_NO_USAGE_LOG-before-import requirement as taste.test.mjs — set
// before dist/index.js is imported so buildServer() doesn't write real usage
// log entries or prepend a digest banner ahead of a tool's JSON payload.
const previousNoUsageLog = process.env.RAVEN_NO_USAGE_LOG;
process.env.RAVEN_NO_USAGE_LOG = '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distTalon = path.resolve(__dirname, '../dist/talon.js');
const distTaste = path.resolve(__dirname, '../dist/taste.js');
const distTasteStore = path.resolve(__dirname, '../dist/taste-store.js');
const distIndex = path.resolve(__dirname, '../dist/index.js');
const principlesDir = path.resolve(__dirname, '../src/data/principles');

let talon, taste, tasteStoreMod, indexMod;
try {
  talon = await import(distTalon);
  taste = await import(distTaste);
  tasteStoreMod = await import(distTasteStore);
  indexMod = await import(distIndex);
} catch (err) {
  const msg = `dist/talon.js not found - run \`npm run build\` first. (${err.message})`;
  test('talon module available', (t) => { t.skip(msg); });
  process.exit(0);
} finally {
  if (previousNoUsageLog === undefined) {
    delete process.env.RAVEN_NO_USAGE_LOG;
  } else {
    process.env.RAVEN_NO_USAGE_LOG = previousNoUsageLog;
  }
}

async function callTool(store, name, args) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({ tasteStore: store });
  const client = new Client({ name: 'talon-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({ name, arguments: args });
    return JSON.parse(result.content[0].text);
  } finally {
    await client.close();
    await server.close();
  }
}

async function withTasteHome(fn) {
  const previous = process.env.RAVEN_TASTE_HOME;
  const home = await mkdtemp(path.join(tmpdir(), 'raven-talon-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    const store = new tasteStoreMod.FsTasteStore();
    await fn(store);
  } finally {
    if (previous === undefined) {
      delete process.env.RAVEN_TASTE_HOME;
    } else {
      process.env.RAVEN_TASTE_HOME = previous;
    }
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────

// 11 distinct hex colors -> fires TAL-001 (palette-budget), all chromatic so
// TAL-002 (diversity-floor) does not also fire.
const busyPaletteHtml = `<html><body>
  <div style="background:#e11d48">a</div>
  <div style="background:#f97316">b</div>
  <div style="background:#eab308">c</div>
  <div style="background:#22c55e">d</div>
  <div style="background:#06b6d4">e</div>
  <div style="background:#3b82f6">f</div>
  <div style="background:#8b5cf6">g</div>
  <div style="background:#ec4899">h</div>
  <div style="background:#14b8a6">i</div>
  <div style="background:#f43f5e">j</div>
  <div style="background:#84cc16">k</div>
</body></html>`;

// 3 neutral-only colors (zero chroma) -> fires TAL-002.
const allNeutralHtml = `<html><body>
  <div style="color:#111111">a</div>
  <div style="color:#888888">b</div>
  <div style="color:#f5f5f5">c</div>
</body></html>`;

// ── Unit tests: dist/talon.js directly ─────────────────────────────────────

test('listTalonRules enumerates a well-cited corpus', () => {
  const rules = talon.listTalonRules();
  assert.ok(rules.length >= 10, `expected >=10 rules, got ${rules.length}`);
  for (const r of rules) {
    assert.match(r.id, /^TAL-\d{3}$/, r.id);
    assert.ok(r.source && r.source.length > 0, `${r.id} missing source`);
    assert.ok(r.message_template && r.message_template.length > 0, `${r.id} missing message_template`);
    assert.ok(r.severity === 'error' || r.severity === 'warning', r.id);
  }
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'rule ids must be unique');
});

test('every rule.source cites a real src/data/principles/*.json entry id', async () => {
  const files = ['color-systems.json', 'spacing-systems.json', 'typography.json', 'accessibility.json', 'gestalt.json', 'mobile-ux.json'];
  const knownIds = new Set();
  for (const f of files) {
    const raw = await readFile(path.join(principlesDir, f), 'utf8');
    for (const entry of JSON.parse(raw)) knownIds.add(entry.id);
  }
  for (const rule of talon.listTalonRules()) {
    assert.ok(knownIds.has(rule.source), `${rule.id} cites unknown principle id: ${rule.source}`);
  }
});

test('a rule fires with the correct source citation (TAL-001, busy palette)', () => {
  const result = talon.runTalon({ html: busyPaletteHtml });
  const finding = result.findings.find((f) => f.rule === 'TAL-001');
  assert.ok(finding, 'expected TAL-001 to fire');
  assert.equal(finding.source, 'color-palette-discipline');
  assert.equal(finding.severity, 'warning');
  assert.ok(finding.message.includes('11'), finding.message);
  assert.equal(finding.waived_by_taste, undefined, 'unwaived finding must not carry the flag');
});

test('a clean page produces no findings and records pass messages', () => {
  const cleanHtml = `<html><body style="color:#222222;background:#ffffff">
    <header><nav>x</nav></header>
    <main><h1>Title</h1><p style="max-width:60ch">body copy</p></main>
    <footer>f</footer>
  </body></html>`;
  const result = talon.runTalon({ html: cleanHtml });
  assert.deepEqual(result.findings, []);
});

test('a rule is flagged waived_by_taste when a matching override is present, and stays visible without one', () => {
  const withOverride = talon.runTalon(
    { html: allNeutralHtml },
    { binding: { overrides: [{ rule_id: 'TAL-002', severity: 'off' }] } }
  );
  const waived = withOverride.findings.find((f) => f.rule === 'TAL-002');
  assert.ok(waived, 'expected TAL-002 to fire on an all-neutral palette');
  assert.equal(waived.waived_by_taste, true);
  assert.equal(waived.source, 'color-palette-discipline');

  const withoutOverride = talon.runTalon({ html: allNeutralHtml });
  const notWaived = withoutOverride.findings.find((f) => f.rule === 'TAL-002');
  assert.ok(notWaived, 'expected TAL-002 to fire without a binding too');
  assert.equal(notWaived.waived_by_taste, undefined, 'no binding means no waiver');
});

test('layout geometry rule (TAL-014 orphan-stretch) fires only when elements are supplied', () => {
  const noElements = talon.runTalon({ html: '<html></html>' });
  assert.equal(noElements.findings.find((f) => f.rule === 'TAL-014'), undefined);

  const elements = [
    { selector: 'card-1', rect: { x: 0, y: 0, w: 280, h: 200 } },
    { selector: 'card-2', rect: { x: 300, y: 0, w: 280, h: 200 } },
    { selector: 'card-3', rect: { x: 600, y: 0, w: 280, h: 200 } },
    { selector: 'orphan', rect: { x: 0, y: 240, w: 880, h: 200 } }
  ];
  const withOrphan = talon.runTalon({ html: '<html></html>', elements });
  const finding = withOrphan.findings.find((f) => f.rule === 'TAL-014');
  assert.ok(finding, 'expected orphan-stretch to fire');
  assert.equal(finding.source, 'gestalt-similarity');
});

// ── End-to-end: MCP tools through the real server ──────────────────────────

test('talon_rules MCP tool enumerates the corpus', async () => {
  await withTasteHome(async (store) => {
    const out = await callTool(store, 'talon_rules', {});
    assert.equal(out.tool, 'talon_rules');
    assert.equal(out.count, out.rules.length);
    assert.ok(out.count >= 10);
    for (const r of out.rules) assert.match(r.id, /^TAL-\d{3}$/);
  });
});

test('talon_scan MCP tool waives a finding via a real bound surface override', async () => {
  await withTasteHome(async (store) => {
    await taste.createTasteProfile(store, {
      name: 'talon-e2e',
      rules: [{
        rule_id: 'TAL-002',
        clause_text: 'Palette must include a primary/accent hue.',
        category: 'color',
        severity_default: 'warn',
        negative_prompt: '',
        owner: 'raven',
        delegate_to: 'talon_scan',
        scope: 'global'
      }]
    });
    await taste.bindTasteSurface(store, 'talon-e2e', {
      project: 'talon-e2e-project',
      surface: 'monochrome-portfolio',
      overrides: [{ rule_id: 'TAL-002', severity: 'off' }],
      uncalibrated_ack: 'test fixture — no real design calibration'
    });

    const out = await callTool(store, 'talon_scan', {
      html: allNeutralHtml,
      project: 'talon-e2e-project',
      profile: 'talon-e2e'
    });

    assert.equal(out.tool, 'talon_scan');
    const finding = out.findings.find((f) => f.rule === 'TAL-002');
    assert.ok(finding, 'TAL-002 must still be returned, not dropped');
    assert.equal(finding.waived_by_taste, true);
    assert.equal(out.waived_by_taste_count, 1);
    assert.equal(out.binding, 'talon-e2e-project');
  });
});
