import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const previousNoUsageLog = process.env.RAVEN_NO_USAGE_LOG;
process.env.RAVEN_NO_USAGE_LOG = '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDesignMd = path.resolve(__dirname, '../dist/designmd.js');
const distIndex = path.resolve(__dirname, '../dist/index.js');

let designmd;
let indexMod;
try {
  designmd = await import(distDesignMd);
  indexMod = await import(distIndex);
} catch (err) {
  const msg = `dist/designmd.js or dist/index.js not found - run \`npm run build\` first. (${err.message})`;
  test('designmd module available', (t) => { t.skip(msg); });
  process.exit(0);
} finally {
  if (previousNoUsageLog === undefined) {
    delete process.env.RAVEN_NO_USAGE_LOG;
  } else {
    process.env.RAVEN_NO_USAGE_LOG = previousNoUsageLog;
  }
}

const SAMPLE = `---
colors:
  primary: "#635BFF"
  accent: "{colors.primary}"
rounded:
  md: "8px"
spacing:
  md: "16px"
typography:
  font-family:
    body: "Inter"
    mono: "SF Mono"
  font-size:
    body: "16px"
  font-weight:
    body: 400
  line-height:
    body: 1.5
  letter-spacing:
    body: "0"
components:
  button:
    bg: "{colors.primary}"
    radius: "{rounded.md}"
---
# Sample system

This body must survive updates exactly.

* Notes
* Keep markdown verbatim
`;

test('parse/serialize roundtrip preserves frontmatter semantics and body verbatim', () => {
  const parsed = designmd.parseDesignMd(SAMPLE);
  assert.equal(parsed.body, `# Sample system\n\nThis body must survive updates exactly.\n\n* Notes\n* Keep markdown verbatim\n`);

  const serial = designmd.serializeDesignMd(parsed);
  const reparsed = designmd.parseDesignMd(serial);

  assert.deepEqual(reparsed.frontmatter, parsed.frontmatter);
  assert.equal(reparsed.body, parsed.body);
});

test('flattenDesignTokens returns nested paths and official CSS-var names', () => {
  const parsed = designmd.parseDesignMd(SAMPLE);
  const tokens = designmd.flattenDesignTokens(parsed.frontmatter);
  const byPath = Object.fromEntries(tokens.map((token) => [token.path, token]));

  assert.equal(byPath['colors.primary'].cssVar, '--color-primary');
  assert.equal(byPath['rounded.md'].cssVar, '--radius-md');
  assert.equal(byPath['spacing.md'].cssVar, '--spacing-md');
  assert.equal(byPath['typography.font-family.body'].cssVar, '--font-body');
  assert.equal(byPath['typography.font-size.body'].cssVar, '--text-body');
  assert.equal(byPath['typography.font-weight.body'].cssVar, '--font-weight-body');
  assert.equal(byPath['typography.line-height.body'].cssVar, '--leading-body');
  assert.equal(byPath['typography.letter-spacing.body'].cssVar, '--tracking-body');
  assert.equal(byPath['components.button.bg'].cssVar, '--component-button-bg');
  assert.equal(byPath['components.button.bg'].kind, 'ref');
  assert.equal(byPath['components.button.bg'].ref, 'colors.primary');
});

test('flattenDesignTokens maps official typography properties to CSS-var namespaces', () => {
  const parsed = designmd.parseDesignMd(`---
typography:
  Primary Button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
---
Body`);
  const tokens = designmd.flattenDesignTokens(parsed.frontmatter);
  const byPath = Object.fromEntries(tokens.map((token) => [token.path, token.cssVar]));

  assert.equal(byPath['typography.Primary Button.fontFamily'], '--font-primary-button');
  assert.equal(byPath['typography.Primary Button.fontSize'], '--text-primary-button');
  assert.equal(byPath['typography.Primary Button.fontWeight'], '--font-weight-primary-button');
  assert.equal(byPath['typography.Primary Button.lineHeight'], '--leading-primary-button');
  assert.equal(byPath['typography.Primary Button.letterSpacing'], '--tracking-primary-button');
});

test('parseDesignMd excludes inline comments from unquoted scalar values', () => {
  const parsed = designmd.parseDesignMd(`---
colors:
  primary: #635BFF # brand purple
spacing:
  md: 16px # base unit
---
Body`);

  assert.equal(parsed.frontmatter.colors.primary, '#635BFF');
  assert.equal(parsed.frontmatter.spacing.md, '16px');
});

test('initDesignMd converts a stored system into DESIGN.md and preserves the source body', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-designmd-'));
  const outPath = path.join(dir, 'DESIGN.md');
  const created = await designmd.initDesignMd(outPath, { kind: 'system', id: 'stripe' });
  const raw = await readFile(outPath, 'utf8');
  const parsed = designmd.parseDesignMd(raw);

  assert.equal(created.path, path.resolve(outPath));
  assert.equal(created.source.kind, 'system');
  assert.equal(created.source.id, 'stripe');
  assert.equal(parsed.frontmatter.colors.primary, '#635BFF');
  assert.equal(parsed.frontmatter.rounded.md, '8px');
  assert.match(parsed.body, /^# Stripe/);
  assert.match(parsed.body, /Stripe design system tokens/);
});

async function withClient(fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({});
  const client = new Client({ name: 'designmd-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test('designmd MCP tools roundtrip read/init/update through the compiled server', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-designmd-tool-'));
  const outPath = path.join(dir, 'DESIGN.md');

  await withClient(async (client) => {
    const created = await client.callTool({
      name: 'init_design_md',
      arguments: { path: outPath, from: { kind: 'system', id: 'linear' } }
    });
    assert.ok(!created.isError);
    const initJson = JSON.parse(created.content[0].text);
    assert.equal(initJson.source.kind, 'system');
    assert.equal(initJson.frontmatter.colors.primary, '#5E6AD2');

    const read = await client.callTool({
      name: 'read_design_md',
      arguments: { path: outPath }
    });
    assert.ok(!read.isError);
    const readJson = JSON.parse(read.content[0].text);
    assert.equal(readJson.tokens.find((token) => token.path === 'colors.primary').cssVar, '--color-primary');

    const updated = await client.callTool({
      name: 'update_design_md',
      arguments: {
        path: outPath,
        set: { group: 'colors', name: 'primary', value: '#101010' }
      }
    });
    assert.ok(!updated.isError);
    const updateJson = JSON.parse(updated.content[0].text);
    assert.equal(updateJson.frontmatter.colors.primary, '#101010');
    assert.match(updateJson.body, /Linear/);
  });
});

test('updateDesignMd preserves the Markdown body and can rename and set tokens', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-designmd-'));
  const outPath = path.join(dir, 'DESIGN.md');
  await writeFile(outPath, SAMPLE, 'utf8');

  const updated = designmd.updateDesignMd(outPath, {
    set: { group: 'colors', name: 'primary', value: '#111111' }
  });
  assert.equal(updated.body, designmd.parseDesignMd(SAMPLE).body);
  assert.equal(updated.frontmatter.colors.primary, '#111111');

  const renamed = designmd.updateDesignMd(outPath, {
    rename: { group: 'spacing', from: 'md', to: 'base' }
  });
  assert.equal(renamed.frontmatter.spacing.base, '16px');
  assert.equal(renamed.frontmatter.spacing.md, undefined);
  assert.equal(renamed.body, updated.body);
});

test('updateDesignMd preserves frontmatter comments and untouched lines byte-for-byte', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-designmd-'));
  const outPath = path.join(dir, 'DESIGN.md');
  const raw = `---
# palette notes
colors:
  primary: "#635BFF" # brand purple

  # secondary stays documented
  secondary: "#111111" # untouched inline
spacing:
  md: "16px" # untouched spacing
---
Body
`;
  await writeFile(outPath, raw, 'utf8');

  designmd.updateDesignMd(outPath, {
    set: { group: 'colors', name: 'primary', value: '#101010' }
  });

  const updated = await readFile(outPath, 'utf8');
  assert.equal(updated, raw.replace('  primary: "#635BFF" # brand purple', '  primary: "#101010" # brand purple'));
});

test('updateDesignMd rejects removals that would break a DESIGN.md reference', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-designmd-'));
  const outPath = path.join(dir, 'DESIGN.md');
  await writeFile(outPath, SAMPLE, 'utf8');

  assert.throws(
    () => designmd.updateDesignMd(outPath, { remove: { group: 'colors', name: 'primary' } }),
    /Broken DESIGN\.md reference/
  );
});

test('composite group references are legal ref targets; collisions are guarded', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raven-designmd-'));
  const outPath = path.join(dir, 'DESIGN.md');
  const raw = [
    '---',
    'typography:',
    '  button:',
    '    fontFamily: Inter',
    '    fontSize: 14px',
    'components:',
    '  cta:',
    '    font: "{typography.button}"',
    '---',
    'Body'
  ].join('\n');
  await writeFile(outPath, raw, 'utf8');

  // Composite ref must not be rejected (getdesign.md starters use these).
  const doc = designmd.updateDesignMd(outPath, {
    set: { group: 'colors', name: 'primary', value: '#111111' }
  });
  assert.equal(doc.frontmatter.colors.primary, '#111111');

  // Setting a nested path through an existing scalar must throw, not clobber.
  assert.throws(
    () => designmd.updateDesignMd(outPath, { set: { group: 'colors', name: 'primary.deep', value: '#222222' } }),
    /existing scalar/
  );

  // Rename onto an existing destination must throw, not overwrite.
  assert.throws(
    () => designmd.updateDesignMd(outPath, { rename: { group: 'typography', from: 'button', to: 'button' } }),
    /destination already exists/
  );
});
