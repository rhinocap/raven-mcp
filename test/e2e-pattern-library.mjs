// Repo-local end-to-end check for the pattern library, run by hand, not by npm test.
// It hits the real network (github.com), so it does not belong in the suite.
// Lives inside the project because ESM resolves imports from the script's own path.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bridge = await import('../dist/grab-bridge.js');
const indexMod = await import('../dist/index.js');
// Only for the teardown check — there is no delete tool, so that one assertion is
// the single place this script is allowed to reach past the tool surface.
const store = await import('../dist/reference-store.js');

process.env.RAVEN_NO_USAGE_LOG = '1';

const fixtureDir = await mkdtemp(path.join(tmpdir(), 'raven-e2e-'));
process.env.RAVEN_REFERENCE_HOME = path.join(fixtureDir, 'references');

const designPath = path.join(fixtureDir, 'DESIGN.md');
await writeFile(designPath, `---
color:
  text:
    primary: "#f7f8f8"
  bg:
    canvas: "#08090a"
type:
  size:
    hero: "64px"
    body: "16px"
  leading:
    hero: "64px"
  weight:
    medium: 510
space:
  gap:
    md: "24px"
---

# Fixture tokens
`, 'utf8');

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

// ── Leg A: does a CSP-strict third-party site come through usable? ──
const TARGET = 'https://github.com';
const session = await bridge.startGrabSession(designPath, undefined, TARGET, 'consumer');
console.log(`\nbridge up at ${session.url} proxying ${TARGET}\n`);

let html = '';
try {
  const res = await fetch(session.url + '/');
  html = await res.text();

  check('upstream reached', res.status === 200, `HTTP ${res.status}, ${html.length} bytes`);
  check('real GitHub HTML, not an error page',
    /<title>[^<]*GitHub[^<]*<\/title>/i.test(html),
    (html.match(/<title>([^<]*)<\/title>/i) || [, '(none)'])[1].trim().slice(0, 70));

  // The whole point of leg A: GitHub's CSP has no 'unsafe-inline', so an inline
  // config script is dropped and the overlay never boots.
  check('upstream CSP header stripped', res.headers.get('content-security-policy') === null,
    String(res.headers.get('content-security-policy')).slice(0, 60));
  check('X-Frame-Options stripped', res.headers.get('x-frame-options') === null);
  check('meta-CSP removed from the document',
    !/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy/i.test(html));

  const overlay = html.match(/<script src="\/raven-grab\.js\?key=[a-f0-9]+&cfg=[^"]+"><\/script>/);
  check('overlay script injected', Boolean(overlay));
  check('overlay carries no inline config', html.indexOf('<script>window.ravenGrabConfig') === -1);
  check('doctype is still the first bytes (no quirks mode)', /^\s*<!doctype/i.test(html),
    html.slice(0, 40).replace(/\n/g, ' '));

  // The overlay asset itself must be servable, or the injected tag 404s.
  if (overlay) {
    const assetUrl = session.url + overlay[0].match(/src="([^"]+)"/)[1].replace(/&amp;/g, '&');
    const asset = await fetch(assetUrl);
    const assetBody = await asset.text();
    check('overlay asset serves with its config prefix', asset.status === 200
      && assetBody.startsWith('window.ravenGrabConfig='), `HTTP ${asset.status}, ${assetBody.length} bytes`);
  }
} finally {
  await bridge.stopGrabSession();
}

// ── Leg B: capture → search → map, THROUGH THE TOOLS ──
//
// This leg used to import reference-store and reference-tokens and call them
// directly, which meant it could print ALL CHECKS PASSED while the seam the
// feature actually ships across — the MCP tool surface — was broken. It was:
// capture_reference declared `state_styles` as record<record<string>> while its
// own description told callers to pass Grab's `stateStyles`, and an MCP schema
// strips unknown keys before the handler runs, so the documented call stored a
// reference with no states and returned success. A module-level check cannot see
// that class of defect by construction. Everything below goes over a real MCP
// client against the stdio server, so schema, handler and serialization are all
// in the path.
console.log('');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const server = indexMod.buildServer({ remote: false });
const client = new Client({ name: 'raven-e2e', version: '1.0.0' }, { capabilities: {} });
await server.connect(serverTransport);
await client.connect(clientTransport);

async function callTool(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

const listed = (await client.listTools()).tools.map((tool) => tool.name);
check('all three pattern-library tools are registered on the stdio server',
  ['capture_reference', 'search_references', 'map_reference_to_tokens'].every((name) => listed.includes(name)),
  `${listed.length} tools listed`);

const captured = {
  'font-size': '64px',
  'line-height': '64px',
  'font-weight': '510',
  'color': 'rgb(247, 248, 248)',
  'letter-spacing': '-1.408px',
  'padding-top': '25px',
  'width': '50%'
};

const saved = await callTool('capture_reference', {
  url: TARGET + '/features',
  app: 'GitHub',
  owner: 'third-party',
  selector: 'h1.hero-title',
  styles: captured,
  // Deliberately the field name and value shape get_grabbed_elements returns,
  // not the tidy one — this is the seam the direct-module version could not test.
  stateStyles: { hover: { declarations: [{ property: 'color', value: 'rgb(255, 255, 255)' }] } },
  note: 'The hero headline weight — 510 is the detail that makes it read tight.',
  tags: ['hero', 'typography']
});
check('capture_reference persisted a record', Boolean(saved.ref_id), `ref_id ${saved.ref_id}, host ${saved.host}`);
check("the grab's own stateStyles survived the tool schema",
  JSON.stringify(saved.reference?.state_styles) === JSON.stringify({ hover: { color: 'rgb(255, 255, 255)' } }),
  JSON.stringify(saved.reference?.state_styles));

const found = await callTool('search_references', { query: 'hero headline weight' });
check('search_references found it by note', found.total === 1 && found.results[0].reference.ref_id === saved.ref_id,
  found.total ? `score ${found.results[0].score}: ${found.results[0].why}` : 'no results');

const reloaded = found.results[0]?.reference;
check('the record survives a fresh read', Boolean(reloaded) && reloaded.note === saved.reference.note);

const mapped = await callTool('map_reference_to_tokens', { ref_id: saved.ref_id, design_file_path: designPath });
console.log('');
for (const b of mapped.bindings) console.log(`  BIND  ${b.property}: ${b.captured} → ${b.token} (${b.verdict}) — ${b.why}`);
for (const g of mapped.gaps) console.log(`  GAP   ${g.property}: ${g.captured} — ${g.why}`);
console.log('');

const bound = Object.fromEntries(mapped.bindings.map(b => [b.property, b.token]));
check('font-size 64px bound to the hero size token', bound['font-size'] === 'type.size.hero', bound['font-size']);
check('color bound to the text token', bound['color'] === 'color.text.primary', bound['color']);
check('font-weight 510 bound to the weight token', bound['font-weight'] === 'type.weight.medium', bound['font-weight']);
check('padding-top 25px near-matched the 24px gap token', bound['padding-top'] === 'space.gap.md', bound['padding-top']);
check('percent width is a stated gap, not a forced match',
  mapped.gaps.some(g => g.property === 'width' && /[Pp]ercent/.test(g.why)));
check('letter-spacing has no token and is a gap',
  mapped.gaps.some(g => g.property === 'letter-spacing'));
// All 7 captured properties are matchable kinds (width counts via the
// min-/max- width|height rule); 5 bind, letter-spacing and width are gaps.
check('coverage counts every matchable property', mapped.coverage.total === 7 && mapped.coverage.bound === 5,
  `${mapped.coverage.bound}/${mapped.coverage.total} = ${mapped.coverage.ratio.toFixed(2)}`);
check('line-height took the leading token, not the font-size token',
  bound['line-height'] === 'type.leading.hero', bound['line-height']);

// There is no delete tool, so this one assertion is module-level by necessity.
check('deleting the record removes it', store.deleteReference(saved.ref_id) && store.getReference(saved.ref_id) === null);

await client.close();
await server.close();
await rm(fixtureDir, { recursive: true, force: true });
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
