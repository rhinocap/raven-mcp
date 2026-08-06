// The image half of the pattern library.
//
// A stored reference is HTML plus a computed-style map. Nobody can pick a
// pattern out of a style map, so the corpus is unusable as a browsing surface
// until each record carries a picture of itself. These tests cover the render,
// the record field, and the two properties that make the render safe to keep:
// it never reaches the network, and it never fails a capture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';

process.env.RAVEN_NO_USAGE_LOG = '1';

const { thumbnailDocument, renderReferenceThumbnail } = await import('../dist/reference-thumbnail.js');
const store = await import('../dist/reference-store.js');

// Same discriminator as test/capture.test.mjs: probe chromium ONCE, outside the
// product code, so a genuine bug in the renderer cannot be mistaken for a
// machine without a browser. If the probe launches, a null render is a FAILURE
// rather than a skip. Read the skip count — it is the only thing separating the
// two environments.
let chromiumAvailable = false;
try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  await browser.close();
  chromiumAvailable = true;
} catch {
  chromiumAvailable = false;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('the render document carries the captured styles onto the host', () => {
  const html = thumbnailDocument({
    html: '<button>Go</button>',
    styles: { 'font-size': '18px', 'border-radius': '8px' }
  });
  assert.match(html, /#raven-reference-host\{display:inline-block;/);
  assert.match(html, /font-size:18px;/);
  assert.match(html, /border-radius:8px;/);
  assert.match(html, /<button>Go<\/button>/);
});

test('a stored style value cannot break out of the declaration block', () => {
  // Styles come from a third-party page. A value containing `}` would close the
  // rule and let the rest of the string author arbitrary CSS against the host
  // document; `<` would close the style element outright. Neither is a
  // theoretical concern for a value the capturing page controls.
  const html = thumbnailDocument({
    html: '<div>x</div>',
    styles: { color: 'red}#raven-reference-host{display:none', 'font-family': 'a</style><script>b' }
  });
  assert.ok(!html.includes('red}#raven-reference-host{display:none'),
    'a `}` in a stored style value survived into the rule — the declaration block ' +
    'is closable from captured third-party content');
  assert.ok(!html.includes('</style><script>'),
    'a `<` in a stored style value survived — the style element is closable from ' +
    'captured third-party content');
  // …and a property name that is not a CSS ident never reaches the output at all.
  const dropped = thumbnailDocument({ html: '<div>x</div>', styles: { 'color;}body{color': 'red' } });
  assert.ok(!dropped.includes('body{color'),
    'a malformed property name was emitted — the ident filter is what keeps the ' +
    'name half of a declaration from authoring its own rules');
});

test('empty or missing html renders nothing rather than an empty picture', async () => {
  assert.equal(await renderReferenceThumbnail({ html: '', styles: {} }), null);
  assert.equal(await renderReferenceThumbnail({ html: '   ', styles: {} }), null);
  assert.equal(await renderReferenceThumbnail({ html: undefined, styles: {} }), null);
});

test('a captured element renders to a PNG at its measured size', { skip: !chromiumAvailable && 'chromium did not launch' }, async () => {
  const result = await renderReferenceThumbnail({
    html: '<div style="width:120px;height:60px;background:#3355ff"></div>',
    styles: { display: 'block' },
    rect: { x: 0, y: 0, width: 120, height: 60 }
  });
  assert.ok(result, 'chromium launched in the probe but the renderer returned null — ' +
    'that is a bug in the renderer, not a missing browser');
  assert.ok(Buffer.from(result.png.slice(0, 8)).equals(PNG_MAGIC),
    'the rendered bytes are not a PNG');
  assert.equal(result.width, 120);
  assert.equal(result.height, 60);
});

test('the render never reaches the network', { skip: !chromiumAvailable && 'chromium did not launch' }, async () => {
  // A stored reference must not phone the site it came from — not at render
  // time, not later, not from a machine that has since lost access to it.
  //
  // The first version of this test pointed an <img> at a port nothing was
  // listening on and asserted the render still succeeded. It passed with the
  // route abort DELETED, because a refused connection and a blocked request
  // produce the same rendered result: a broken image and a successful load. It
  // measured nothing. The only instrument that answers the question is a server
  // that counts what it was actually asked for.
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(PNG_MAGIC);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;

  try {
    const result = await renderReferenceThumbnail({
      html: '<div style="width:80px;height:40px;background:#111">'
        + '<img src="' + origin + '/should-never-be-requested.png" alt="">'
        + '</div>',
      styles: { display: 'block' },
      rect: { x: 0, y: 0, width: 80, height: 40 }
    });
    assert.ok(result, 'a reference containing an external asset failed to render — the ' +
      'route abort has to swallow the request, not the render');
    assert.equal(result.width, 80);
    assert.deepEqual(hits, [],
      'the render fetched an external asset. A stored reference must never reach ' +
      'back out to the site it was captured from, at any later moment: ' +
      JSON.stringify(hits));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a rendered thumbnail attaches to a record, and deleting the record deletes it', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'raven-thumb-'));
  const previous = process.env.RAVEN_REFERENCE_HOME;
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    const reference = store.saveReference({
      url: 'https://example.com/pricing',
      selector: '.hero',
      styles: { color: 'rgb(0, 0, 0)' },
      owner: 'third-party',
      tags: ['hero']
    });
    assert.equal(reference.image, undefined, 'saveReference must not invent an image');

    const png = Buffer.concat([PNG_MAGIC, Buffer.from('fixture')]);
    const imaged = store.attachReferenceImage(reference.ref_id, png, { width: 120.4, height: 60.6 });
    assert.deepEqual(imaged.image, {
      file: reference.ref_id + '.png',
      width: 120,
      height: 61,
      fidelity: 'offline'
    });

    const file = store.referenceImagePath(reference.ref_id);
    assert.ok(existsSync(file), 'the PNG was not written beside the record');
    assert.ok(Buffer.from(readFileSync(file)).equals(png), 'the written bytes are not the ones supplied');
    assert.ok(!existsSync(file + '.tmp'), 'the temp file survived the rename');

    // The record on disk carries it too — an in-memory return value that never
    // reached the file would leave every later search imageless.
    assert.deepEqual(store.getReference(reference.ref_id).image, imaged.image);

    // Takedown. A third-party pattern removed from the corpus must not survive
    // as a picture of itself sitting next to a gap in the index.
    assert.equal(store.deleteReference(reference.ref_id), true);
    assert.ok(!existsSync(file),
      'deleting a reference left its image on disk — that is not a delete, and ' +
      'this is the takedown path for third-party patterns');
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test('attachReferenceImage rejects what it cannot store', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'raven-thumb-'));
  const previous = process.env.RAVEN_REFERENCE_HOME;
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    const reference = store.saveReference({
      url: 'https://example.com/', selector: '.x', styles: {}, owner: 'self', tags: []
    });
    const png = Buffer.concat([PNG_MAGIC, Buffer.from('fixture')]);
    assert.throws(() => store.attachReferenceImage('nope', png, { width: 1, height: 1 }),
      /no reference with ref_id/);
    assert.throws(() => store.attachReferenceImage(reference.ref_id, Buffer.alloc(0), { width: 1, height: 1 }),
      /non-empty/);
    assert.throws(() => store.attachReferenceImage(reference.ref_id, png, { width: 0, height: 1 }),
      /positive/);
    // …and none of the rejections left a file behind.
    assert.ok(!existsSync(store.referenceImagePath(reference.ref_id)),
      'a rejected attach still wrote a PNG');
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});
