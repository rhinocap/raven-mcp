// create_motion_playground: one self-contained HTML playground built from a
// built-in Motion Lab motif.
//
// What these tests hold: the builder writes a file that parses back to the
// schema it was given; a default that breaks a motif constraint is corrected
// to the nearest valid step and reported, and one that cannot be corrected
// inside its range is an error; unknown motifs and control ids are refused by
// name; caller text cannot leave its context in the written file; the tool is
// gated off both hosted builds; the taste mapping changes only what its
// vocabulary names and says so when it cannot; and the Copy for Raven text the
// page produces is accepted by record_taste_decision as-is.
//
// The remote half runs in a child process: setRemoteRuntime() is a one-way
// per-process latch (see test/remote-click-guard.test.mjs), and the browser
// tests below must keep the local launch path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'data', 'motion');

const { buildServer } = await import('../dist/index.js');
const { FsTasteStore } = await import('../dist/taste-store.js');
const taste = await import('../dist/taste.js');
const mp = await import('../dist/motion-playground/index.js');
const v = await import('../dist/motion-playground/validate.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

// Same discriminator as test/reference-thumbnail.test.mjs: probe chromium once,
// outside the product code, so a skip means the probe did not launch.
let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const b = await chromium.launch();
  await b.close();
} catch {
  chromium = null;
}
const noBrowser = !chromium && 'chromium did not launch';

async function withHome(fn) {
  const prev = process.env.RAVEN_TASTE_HOME;
  const home = await mkdtemp(path.join(tmpdir(), 'raven-motion-'));
  process.env.RAVEN_TASTE_HOME = home;
  try {
    await fn({ home, store: new FsTasteStore() });
  } finally {
    if (prev === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prev;
  }
}

async function withClient(store, fn) {
  const server = buildServer({ remote: false, tasteStore: store });
  const client = new Client({ name: 'motion-playground-test', version: '1.0.0' }, { capabilities: {} });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

const resultJson = (r) => JSON.parse(r.content[0].text);

function embeddedJson(html, id) {
  const m = html.match(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`));
  assert.ok(m, `no #${id} block in the written file`);
  return JSON.parse(m[1]);
}

const schemaId = () => JSON.parse(readFileSync(path.join(DATA, 'keyfob', 'schema.json'), 'utf8')).id;

test('the default build writes one self-contained file under <taste home>/playgrounds', async () => {
  await withHome(async ({ home, store }) => {
    const r = await mp.createMotionPlayground({ store, motif: 'keyfob' });
    assert.match(r.playground_id, /^keyfob-[0-9a-f]{4}$/);
    assert.equal(r.html_path, path.join(home, 'playgrounds', r.playground_id + '.html'));
    assert.equal(r.controls, 12);
    assert.equal(r.client_safe, 9);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.taste_applied, undefined, 'no profile was passed, so nothing reports taste');
    const html = readFileSync(r.html_path, 'utf8');
    assert.equal(r.bytes, Buffer.byteLength(html));
    assert.doesNotMatch(html, /__[A-Z_]+__/, 'a template placeholder was left unfilled');
    assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|@import|url\(\s*["']?https?:/i, 'the file loads something from outside itself');
    const schema = embeddedJson(html, 'schema');
    assert.equal(schema.id, schemaId());
    assert.equal(schema.params.length, 12);
    assert.deepEqual(embeddedJson(html, 'raven-ctx'), {});
  });
});

test('a default that breaks a constraint is raised to the next valid step and reported', async () => {
  await withHome(async ({ home, store }) => {
    const out = path.join(home, 'settle.html');
    const r = await mp.createMotionPlayground({ store, motif: 'keyfob', output_path: out, overrides: { controls: { settleTime: { default: 400 } } } });
    assert.equal(r.playground_id, 'settle');
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /^settleTime default 400 ms is below 1\.82 × .*\(640 ms\); raised to 1200 ms \(1\.82 × 640 = 1164\.8, rounded up to the 100 ms step\)\.$/);
    const schema = embeddedJson(readFileSync(out, 'utf8'), 'schema');
    assert.equal(schema.params.find((p) => p.id === 'settleTime').default, 1200);
  });
});

test('a constraint that cannot be met inside the range is an error, not a silent clamp', async () => {
  await withHome(async ({ home, store }) => {
    const out = path.join(home, 'never.html');
    await assert.rejects(
      mp.createMotionPlayground({ store, motif: 'keyfob', output_path: out, overrides: { controls: { fobPeriod: { default: 1000 }, settleTime: { max: 1600 } } } }),
      /needs 1900 ms, outside .* range 600\.\.1600/,
    );
    assert.equal(existsSync(out), false, 'a refused build must not leave a file behind');
  });
});

test('a slider range that cannot clear the constraint at its far end is refused', async () => {
  await withHome(async ({ home, store }) => {
    const out = path.join(home, 'reach.html');
    // The default fob swing (640 ms) fits under 1600 ms, but dragging Fob swing to 1000 ms needs 1820 ms.
    await assert.rejects(
      mp.createMotionPlayground({ store, motif: 'keyfob', output_path: out, overrides: { controls: { settleTime: { max: 1600 } } } }),
      /settleTime max 1600 ms cannot keep settleTime >= 1\.82 × fobPeriod when fobPeriod is at its max 1000 ms \(needs 1820 ms\)/,
    );
    assert.equal(existsSync(out), false, 'a refused build must not leave a file behind');
    const r = await mp.createMotionPlayground({ store, motif: 'keyfob', output_path: out, overrides: { controls: { settleTime: { max: 1900 } } } });
    assert.deepEqual(r.warnings, []);
  });
});

test('a generated name never replaces an earlier playground', async () => {
  await withHome(async ({ home, store }) => {
    // Occupy every name the 16-bit id can draw, so any non-exclusive write would replace one of them.
    const dir = path.join(home, 'playgrounds');
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 0x10000; i++) writeFileSync(path.join(dir, 'keyfob-' + i.toString(16).padStart(4, '0') + '.html'), '');
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob' }), (err) => err.code === 'EEXIST');
    const written = readdirSync(dir).filter((f) => readFileSync(path.join(dir, f)).length > 0);
    rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(written, [], 'an existing playground was overwritten');
  });
});

test('Copy for Raven promises a recorded decision, not a changed next playground', async () => {
  await withHome(async ({ store }) => {
    const r = await mp.createMotionPlayground({ store, motif: 'keyfob' });
    const html = readFileSync(r.html_path, 'utf8');
    assert.doesNotMatch(html, /next playground/i);
    assert.match(html, /Raven records it against this project\./);
  });
});

test('check:site builds dist/ before comparing the gallery against it', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['check:site'], /^npm run build && node scripts\/check-site-drift\.mjs$/);
});

test('overrides outside the motif range or off its step grid are refused', async () => {
  await withHome(async ({ store }) => {
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { settleTime: { max: 3000 } } } }), /outside the motif's range 600\.\.2400/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { settleTime: { min: 650 } } } }), /not on a step of 100/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { settleTime: { default: 5000 } } } }), /Motion Lab contract/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { swingFeel: { min: 1 } } } }), /only to number controls/);
  });
});

test('unknown motifs, control ids and group ids are refused by name', async () => {
  await withHome(async ({ store }) => {
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'spinner' }), /Unknown motif "spinner"\. Built-in motifs: keyfob\./);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { wobble: { default: 1 } } } }), /Unknown control "wobble" .*Controls: hoverAngle, clickStrength, settleTime/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { extras: 'Extras' } } }), /Unknown group "extras"/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', output_path: '/tmp/x.htm' }), /must end in \.html/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', title: 'x'.repeat(41) }), /title must be 1-40/);
    await withClient(store, async (client) => {
      const r = await client.callTool({ name: 'create_motion_playground', arguments: { motif: 'spinner' } });
      assert.equal(r.isError, true, 'the schema enum must refuse a motif the builder does not have');
    });
  });
});

test('the tool is annotated as a local write that is not idempotent', () => {
  const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
  const t = server._registeredTools.create_motion_playground;
  assert.ok(t, 'create_motion_playground is not registered on the stdio build');
  assert.equal(t.annotations.readOnlyHint, false);
  assert.equal(t.annotations.destructiveHint, true);
  assert.equal(t.annotations.idempotentHint, false);
  assert.equal(t.annotations.openWorldHint, false);
});

test('the tool is absent from the anonymous and the authenticated hosted builds', () => {
  const code = `
    const { buildServer } = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'dist', 'index.js')).href)});
    const { FsTasteStore } = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'dist', 'taste-store.js')).href)});
    const anon = Object.keys(buildServer({ remote: true })._registeredTools);
    const authed = Object.keys(buildServer({ remote: true, tasteStore: new FsTasteStore() })._registeredTools);
    console.log('RESULT:' + JSON.stringify({ anon: anon.length, authed: authed.length, inAnon: anon.includes('create_motion_playground'), inAuthed: authed.includes('create_motion_playground') }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 60000, env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' } });
  const i = out.indexOf('RESULT:');
  assert.ok(i !== -1, `the child printed no result: ${out.slice(0, 300)}`);
  assert.deepEqual(JSON.parse(out.slice(i + 7)), { anon: 45, authed: 56, inAnon: false, inAuthed: false });
});

test('taste notes change only what their terms name, and say so when they cannot', async () => {
  await withHome(async ({ home, store }) => {
    await taste.createTasteProfile(store, { name: 'motion-p', rules: [] });
    await taste.bindTasteSurface(store, 'motion-p', {
      project: 'fob-site', surface: 'product site', voice_note: 'Plain.',
      design_notes: { motion: 'restrained, snappy, no bounce', entrance: 'a slow fade from the left', color: 'restrained greys' },
    });
    const out = path.join(home, 'tasted.html');
    const r = await mp.createMotionPlayground({ store, motif: 'keyfob', profile: 'motion-p', project: 'fob-site', output_path: out, overrides: { controls: { hoverAngle: { default: 12 } } } });
    const byId = Object.fromEntries(embeddedJson(readFileSync(out, 'utf8'), 'schema').params.map((p) => [p.id, p.default]));
    assert.equal(byId.hoverAngle, 12, 'a default set in overrides is kept as given');
    assert.equal(byId.clickStrength, 1, 'restrained lowers amplitude by a third (1.5 -> 1.0)');
    assert.equal(byId.ringAngle, 1.5, 'restrained lowers amplitude by a third, on the 0.5 step (2 -> 1.5)');
    assert.equal(byId.settleTime, 1100, 'snappy shortens duration by a quarter, on the 100 ms step (1400 -> 1100)');
    assert.equal(byId.fobPeriod, 480);
    assert.equal(byId.keyPeriod, 360);
    assert.equal(byId.swingFeel, 'soft', 'no bounce cannot be met by keyfob, so the swing is left as it was');
    assert.equal(byId.fobColor, '#1C1C1E', 'the color note is not a motion note and is not read');
    assert.deepEqual(r.taste_applied, ['restrained: clickStrength, ringAngle lowered by a third', 'snappy: settleTime, fobPeriod, keyPeriod shortened by a quarter']);
    assert.ok(r.warnings.some((w) => /^no bounce: keyfob cannot be critically damped inside its ranges \(highest damping ratio 0\.70, needs 1\.00\)/.test(w)), r.warnings.join('\n'));
    assert.ok(r.warnings.some((w) => /^Taste note entrance \("a slow fade from the left"\) has no playground mapping; ignored\./.test(w)), r.warnings.join('\n'));
    assert.deepEqual(embeddedJson(readFileSync(out, 'utf8'), 'raven-ctx'), { profile: 'motion-p', project: 'fob-site' });
  });
});

// The "no bounce" warning claims keyfob cannot be critically damped. Simulate the
// runtime's own oscillator at the most damped setting the ranges allow and check
// that the swing still crosses rest, so the warning is a fact about the motif.
test('the no-bounce warning is true: the most damped keyfob setting still overshoots rest', () => {
  const runtime = readFileSync(path.join(DATA, 'keyfob', 'runtime.js'), 'utf8');
  assert.match(runtime, /firm/, 'runtime.js no longer names the firm swing; re-derive the damping model in taste-map.ts');
  const period = 1000, settle = 1.82 * period, k = 8; // firm, longest period, shortest legal settle
  const w0 = (2 * Math.PI) / period, beta = k / settle;
  assert.ok(beta / w0 < 1, 'the most damped reachable setting is underdamped');
  let x = 1, v = 0, crossed = false;
  for (let t = 0; t < settle * 2; t += 0.5) {
    const a = -2 * beta * v - w0 * w0 * x;
    v += a * 0.5; x += v * 0.5;
    if (x < 0) { crossed = true; break; }
  }
  assert.ok(crossed, 'the swing never crossed rest, so "no bounce" would have been reachable');
});

test('profile and project go together, and an unknown profile is an error', async () => {
  await withHome(async ({ store }) => {
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', profile: 'p' }), /pass both or neither/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', profile: 'nobody', project: 'x' }), /nobody/);
    await taste.createTasteProfile(store, { name: 'unbound', rules: [] });
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', profile: 'unbound', project: 'bad project' }), /project must match/);
    const r = await mp.createMotionPlayground({ store, motif: 'keyfob', profile: 'unbound', project: 'later' });
    assert.deepEqual(r.taste_applied, []);
    assert.match(r.warnings[0], /^No surface binding for project 'later' on profile 'unbound'/);
  });
});

// Kept inside the 40-character title limit so it reaches the template rather than the length check.
const HOSTILE = '</script><svg onload=__pwned=1><!--';

test('a title or group label that looks like a template marker stays text', async () => {
  await withHome(async ({ store }) => {
    for (const title of ['__SCHEMA__', '__RUNTIME__', '__RAVEN_CTX__', '__TITLE_HTML__', '$$ $1 $0']) {
      const r = await mp.createMotionPlayground({ store, motif: 'keyfob', title });
      const html = readFileSync(r.html_path, 'utf8');
      assert.equal(embeddedJson(html, 'schema').title, title);
      assert.ok(html.includes('<title>' + title + '</title>'), `title ${title} did not land as text`);
    }
  });
});

test('group headings in the ordinary panel follow the designer-vocabulary rule', async () => {
  await withHome(async ({ store }) => {
    await assert.rejects(
      mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { jingle: 'Damping ratio' } } }),
      /group jingle: engine word in a non-advanced label "Damping ratio"/,
    );
    await assert.rejects(
      mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { jingle: 'swingFeel' } } }),
      /group jingle: label "swingFeel" is code-shaped/,
    );
    const r = await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { jingle: 'The swing' } } });
    assert.deepEqual(r.warnings, []);
  });
});

test('shader and easing identifiers are matched by case, so ordinary words starting with u or ease pass', async () => {
  await withHome(async ({ store }) => {
    const schema = JSON.parse(readFileSync(new URL('../src/data/motion/keyfob/schema.json', import.meta.url), 'utf8'));
    const advGroups = new Set(schema.groups.filter((g) => g.advanced).map((g) => g.id));
    const ordinary = schema.params.find((p) => p.type !== 'action' && !p.advanced && !advGroups.has(p.group)).id;
    for (const label of ['Upper pieces', 'Under the ring', 'Useful details', 'Eased start', 'Uniform spacing', 'Keep spacing uniform', 'Uniform images', 'uniform interval']) {
      await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: label } } });
      await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { [ordinary]: { label } } } });
    }
    for (const label of ['uSpeed', 'easeInOut', 'iTime', 'uniform float', 'uniform  float', 'uniform mat2x3', 'uniform highp float', 'uniform uvec2', 'uniform double']) {
      await assert.rejects(
        mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: label } } }),
        new RegExp(`group pendants: engine word in a non-advanced label "${label}"`),
      );
      await assert.rejects(
        mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { [ordinary]: { label } } } }),
        new RegExp(`${ordinary}: engine word in a non-advanced label "${label}"`),
      );
    }
  });
});

test('statement ends, braces and block comments in a label are refused as code', async () => {
  await withHome(async ({ store }) => {
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    for (const label of ['uniform double t;', 'uniform/*x*/float t', 'uniform B{float x;};', 'Lift = 0.5;', 'Lift;Drop', 'Lift ;']) {
      await assert.rejects(
        mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: label } } }),
        new RegExp(`group pendants: label "${esc(label)}" contains code punctuation`),
      );
      await assert.rejects(
        mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { hoverAngle: { label } } } }),
        new RegExp(`hoverAngle: label "${esc(label)}" contains code punctuation`),
      );
    }
    for (const label of ['swingFeel', 'hoverAngle', 'hover_angle', 'Swing_feel']) {
      await assert.rejects(
        mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: label } } }),
        new RegExp(`group pendants: label "${label}" is code-shaped`),
      );
      await assert.rejects(
        mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { hoverAngle: { label } } } }),
        new RegExp(`hoverAngle: label "${label}" is code-shaped`),
      );
    }
  });
});

test('a designer sentence and product names are not code', async () => {
  await withHome(async ({ store }) => {
    for (const label of ['Swing; then settle', 'iPhone tilt', 'iPad swing', 'macOS dock', 'YouTube embed', 'eBay listing']) {
      await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: label } } });
      await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { hoverAngle: { label } } } });
    }
  });
});

test('hinges name a declared parent other than themselves, once each; presets set real params to valid values', () => {
  const keyfob = JSON.parse(readFileSync(path.join(DATA, 'keyfob', 'schema.json'), 'utf8'));
  const h0 = keyfob.interaction.hinges[0].target;
  const cases = [
    [(d) => d.interaction.hinges.push({ ...d.interaction.hinges[0] }), `hinge ${h0} declared twice`],
    [(d) => { d.interaction.hinges[0].parent = h0; }, `hinge ${h0}: is its own parent`],
    [(d) => { d.interaction.hinges[0].parent = 'no-such-hinge'; }, `hinge ${h0}: parent no-such-hinge not declared`],
    [(d) => { d.presets = [{ id: 'wild', label: 'Wild', values: { hoverAngle: 999 } }]; }, 'preset wild: 999 is not a valid value for hoverAngle'],
    [(d) => { d.presets = [{ id: 'wild', label: 'Wild', values: { hoverAngle: 9.5 } }]; }, 'preset wild: 9.5 is not a valid value for hoverAngle'],
    [(d) => { d.presets = [{ id: 'wild', label: 'Wild', values: { noSuchParam: 1 } }]; }, 'preset wild: unknown param noSuchParam'],
    [(d) => { d.presets = [{ id: 'calm', label: 'Calm', values: { hoverAngle: 4 } }, { id: 'calm', label: 'Calm', values: { hoverAngle: 5 } }]; }, 'duplicate preset id calm'],
  ];
  for (const [edit, msg] of cases) {
    const d = structuredClone(keyfob); edit(d);
    assert.ok(v.validateMotionSchema(d).includes(msg), `expected "${msg}"`);
  }
  const good = structuredClone(keyfob); good.presets = [{ id: 'calm', label: 'Calm', values: { hoverAngle: 4 } }];
  assert.deepEqual(v.validateMotionSchema(good), []);
});

test('override limits are the pinned Motion Lab schema limits', async () => {
  const contract = JSON.parse(readFileSync(path.join(DATA, 'playground.schema.json'), 'utf8'));
  assert.equal(mp.TITLE_MAX, contract.properties.title.maxLength);
  assert.equal(mp.CONTROL_LABEL_MAX, contract.$defs.param.properties.label.maxLength);
  assert.equal(mp.GROUP_LABEL_MAX, contract.properties.groups.items.properties.label.maxLength);
  await withHome(async ({ store }) => {
    await mp.createMotionPlayground({ store, motif: 'keyfob', title: 'x'.repeat(mp.TITLE_MAX) });
    await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { hoverAngle: { label: 'x'.repeat(mp.CONTROL_LABEL_MAX) } } } });
    await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: 'x'.repeat(mp.GROUP_LABEL_MAX) } } });
    // The schema counts code points and checks the trimmed label, so the overrides do too.
    await mp.createMotionPlayground({ store, motif: 'keyfob', title: '🌟'.repeat(mp.TITLE_MAX) });
    await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { hoverAngle: { label: '🌟'.repeat(mp.CONTROL_LABEL_MAX) } } } });
    await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: '🌟'.repeat(mp.GROUP_LABEL_MAX) } } });
    await mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: `  ${'x'.repeat(mp.GROUP_LABEL_MAX)}  ` } } });
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', title: '🌟'.repeat(mp.TITLE_MAX + 1) }), /title must be 1-40 characters/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { controls: { hoverAngle: { label: 'x'.repeat(mp.CONTROL_LABEL_MAX + 1) } } } }), /hoverAngle: label must be 1-24 characters/);
    await assert.rejects(mp.createMotionPlayground({ store, motif: 'keyfob', overrides: { groups: { pendants: 'Hanging pieces and more' } } }), /group pendants: label must be 1-20 characters/);
  });
});

test('the validator runs the Motion Lab JSON Schema, so shape rules agree with Motion Lab', () => {
  const keyfob = JSON.parse(readFileSync(path.join(DATA, 'keyfob', 'schema.json'), 'utf8'));
  assert.deepEqual(v.validateMotionSchema(structuredClone(keyfob)), []);
  const withGroup = (label) => { const d = structuredClone(keyfob); d.groups.find((g) => g.id === 'pendants').label = label; return d; };
  const idx = keyfob.groups.findIndex((g) => g.id === 'pendants');
  assert.ok(v.validateMotionSchema(withGroup('Hanging pieces and more')).includes(`shape /groups/${idx}/label must NOT have more than 20 characters`));
  assert.ok(v.validateMotionSchema(withGroup('   ')).includes(`shape /groups/${idx}/label must match pattern "\\S"`));
  const extra = structuredClone(keyfob); extra.notes = 'x';
  assert.ok(v.validateMotionSchema(extra).includes('shape / must NOT have additional properties'));
  const longTitle = structuredClone(keyfob); longTitle.title = 'x'.repeat(41);
  assert.ok(v.validateMotionSchema(longTitle).includes('shape /title must NOT have more than 40 characters'));
  // The player reads canvas.width and canvas.height; the schema requires them and Raven adds nothing on top.
  const noCanvas = structuredClone(keyfob); delete noCanvas.canvas;
  assert.deepEqual(v.validateMotionSchema(noCanvas), ["shape / must have required property 'canvas'"]);
  const noWidth = structuredClone(keyfob); delete noWidth.canvas.width;
  assert.deepEqual(v.validateMotionSchema(noWidth), ["shape /canvas must have required property 'width'"]);
});

test('caller text cannot leave its context in the written file', async () => {
  await withHome(async ({ home, store }) => {
    const out = path.join(home, 'hostile.html');
    await mp.createMotionPlayground({ store, motif: 'keyfob', title: HOSTILE, output_path: out, overrides: { controls: { hoverAngle: { label: '<b>Lift</b>' } }, groups: { finish: '</script><i>' } } });
    const html = readFileSync(out, 'utf8');
    const clean = readFileSync((await mp.createMotionPlayground({ store, motif: 'keyfob', output_path: path.join(home, 'clean.html') })).html_path, 'utf8');
    const closers = (h) => h.split('</script>').length - 1;
    assert.equal(closers(html), closers(clean), 'a </script> in caller text added a script closer to the file');
    assert.ok(!html.includes('<b>Lift</b>') && !html.includes('<i>'), 'a label reached the file as markup');
    assert.ok(html.includes('<title>&lt;/script&gt;&lt;svg onload=__pwned=1&gt;&lt;!--</title>'));
    assert.equal(embeddedJson(html, 'schema').title, HOSTILE, 'the title survives the round trip unchanged');
  });
});

test('in a browser the hostile text renders as text and the embed code does not carry it', { skip: noBrowser }, async () => {
  await withHome(async ({ home, store }) => {
    const out = path.join(home, 'hostile-browser.html');
    await mp.createMotionPlayground({ store, motif: 'keyfob', title: HOSTILE, output_path: out, overrides: { controls: { hoverAngle: { label: '<b>Lift</b>' } } } });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(pathToFileURL(out).href);
      await page.waitForFunction(() => !!window.__ml);
      const got = await page.evaluate(() => ({
        pwned: window.__pwned === 1,
        imgs: document.querySelectorAll('img').length,
        bolds: document.querySelectorAll('#groups b').length,
        title: document.getElementById('title').textContent,
        embed: window.__ml.embedCode(),
      }));
      assert.deepEqual(errors, []);
      assert.equal(got.pwned, false);
      assert.equal(got.imgs, 0);
      assert.equal(got.bolds, 0, 'a control label was parsed as HTML');
      assert.equal(got.title, HOSTILE);
      assert.ok(!got.embed.includes('onerror'), 'the embed code carries caller text');
    } finally {
      await browser.close();
    }
  });
});

test('Copy for Raven text is accepted by record_taste_decision as-is', { skip: noBrowser }, async () => {
  await withHome(async ({ home, store }) => {
    await taste.createTasteProfile(store, { name: 'motion-rt', rules: [] });
    await taste.bindTasteSurface(store, 'motion-rt', { project: 'fob-site', surface: 'product site', voice_note: 'Plain.', design_notes: {} });
    const out = path.join(home, 'roundtrip.html');
    await mp.createMotionPlayground({ store, motif: 'keyfob', profile: 'motion-rt', project: 'fob-site', output_path: out });
    const browser = await chromium.launch();
    let text, unbound;
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(out).href);
      await page.waitForFunction(() => !!window.__ml);
      text = await page.evaluate(() => { window.__ml.setParam('hoverAngle', 14); window.__ml.setParam('swingFeel', 'firm'); return window.__ml.ravenText(); });
      // Without a profile in the file, the page asks for one before it will produce text.
      const bare = path.join(home, 'bare.html');
      await mp.createMotionPlayground({ store, motif: 'keyfob', output_path: bare });
      await page.goto(pathToFileURL(bare).href);
      await page.waitForFunction(() => !!window.__ml);
      unbound = await page.evaluate(async () => {
        document.getElementById('tab-code').click();
        const before = { text: window.__ml.ravenText(), disabled: document.getElementById('copy-raven').disabled, fields: !!document.getElementById('raven-profile') && !!document.getElementById('raven-project') };
        const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); };
        set('raven-profile', 'motion-rt'); set('raven-project', 'Client website');
        await new Promise(requestAnimationFrame);
        const note = document.getElementById('raven-need');
        const invalid = { disabled: document.getElementById('copy-raven').disabled, text: window.__ml.ravenText(), noteShown: !note.hidden, noteNamesRule: /“client-website”, not “Client website”/.test(note.textContent) };
        set('raven-project', 'fob-site');
        return { before, invalid, after: { disabled: document.getElementById('copy-raven').disabled, hasText: window.__ml.ravenText().length > 0, noteShown: !note.hidden } };
      });
    } finally {
      await browser.close();
    }
    assert.deepEqual(unbound, {
      before: { text: '', disabled: true, fields: true },
      invalid: { disabled: true, text: '', noteShown: true, noteNamesRule: true },
      after: { disabled: false, hasText: true, noteShown: false },
    });

    const nl = text.indexOf('\n');
    assert.match(text.slice(0, nl), /record_taste_decision/);
    const args = JSON.parse(text.slice(nl + 1));
    assert.equal(args.profile, 'motion-rt');
    assert.equal(args.project, 'fob-site');
    assert.equal(args.dimension, 'motion');
    assert.equal(args.source, 'user-approved');
    assert.ok(Array.isArray(args.rejected) && args.rejected.length === 2, JSON.stringify(args.rejected));
    await withClient(store, async (client) => {
      const r = await client.callTool({ name: 'record_taste_decision', arguments: args });
      assert.notEqual(r.isError, true, r.content[0].text);
      const listed = resultJson(await client.callTool({ name: 'list_taste_decisions', arguments: { profile: 'motion-rt', project: 'fob-site' } }));
      assert.ok(JSON.stringify(listed).includes(args.decision), 'the recorded decision is not listed back');
    });
  });
});

test('motif copies match the hashes in motifs.lock.json', () => {
  const lock = JSON.parse(readFileSync(path.join(DATA, 'motifs.lock.json'), 'utf8'));
  assert.deepEqual(lock.motifs, [...mp.MOTION_MOTIFS], 'the lock and the tool disagree on which motifs exist');
  const files = Object.keys(lock.files);
  assert.ok(files.length >= 2 * lock.motifs.length);
  for (const rel of files) {
    const got = createHash('sha256').update(readFileSync(path.join(DATA, rel))).digest('hex');
    assert.equal(got, lock.files[rel], `${rel} no longer matches the lock: edit it in Motion Lab and run scripts/sync-motion-motifs.mjs`);
  }
});
