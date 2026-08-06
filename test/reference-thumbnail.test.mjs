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
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    // TWO dangerous characters per value, deliberately. A `.replace(/[<>{}]/, "")`
    // that lost its `g` flag strips the first and leaves the second, and an
    // assertion phrased as "the original string is absent" passes on that mutant
    // because the half-stripped string is not the original one either. The
    // question is whether ANY of these characters reach the rule, so that is what
    // is asserted — on the emitted style block, not on the whole document, since
    // the captured markup below it legitimately contains `<`.
    styles: { color: 'red}#a{x:1}#b{y:2', 'font-family': 'a</style><script>b</script>' }
  });
  const styleBlock = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  assert.ok(styleBlock.length > 0, 'no style block was emitted');
  const declarations = styleBlock.slice(styleBlock.indexOf('#raven-reference-host{') + '#raven-reference-host{'.length);
  const firstClose = declarations.indexOf('}');
  assert.ok(firstClose !== -1, 'the host rule was never closed');
  const body = declarations.slice(0, firstClose);
  assert.equal(/[<>{}]/.test(body), false,
    'a structural character survived into the declaration body: ' + JSON.stringify(body));
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

  // The reported width/height are CSS pixels and stay 120×60 whatever the render
  // resolution is, so they cannot see deviceScaleFactor at all — delete it and
  // every assertion above still passes while the picture is half the resolution.
  // The IHDR is where the actual pixel count lives (PNG spec §11.2.2: bytes
  // 16–23 of the file, big-endian width then height).
  const pixels = Buffer.from(result.png.slice(0, 24));
  assert.equal(pixels.readUInt32BE(16), 240,
    'the PNG is not 2× the CSS width — deviceScaleFactor is what makes a thumbnail ' +
    'legible on a retina screen, and nothing else in this test can see it');
  assert.equal(pixels.readUInt32BE(20), 120);
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
    // Three different request kinds, not one. A route handler narrowed to
    // `resourceType === 'image'` blocks the <img> and passes this test while
    // stylesheets, fonts and everything else still leave the machine — the
    // single-probe version could not tell a blanket abort from an image-only one.
    const result = await renderReferenceThumbnail({
      html: '<div style="width:80px;height:40px;background:#111">'
        + '<link rel="stylesheet" href="' + origin + '/style.css">'
        + '<img src="' + origin + '/should-never-be-requested.png" alt="">'
        + '<div style="background-image:url(' + origin + '/bg.png);width:10px;height:10px"></div>'
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

test('captured markup does not execute in the render', { skip: !chromiumAvailable && 'chromium did not launch' }, async () => {
  // input.html is another site's markup, and it authors the whole document —
  // <script>, event handlers, frames, everything. Stripping `<>{}` out of the
  // style VALUES never touched that and was never a boundary; this is the
  // boundary. With scripting off the element is laid out and painted and
  // nothing in it runs.
  //
  // The instrument is a script that CHANGES the rendered geometry, because
  // geometry is the one thing this function reports back. A script that only
  // set a flag would be unobservable from outside the browser, and the test
  // would pass whether or not it ran.
  //
  // Two details make it an instrument rather than a decoration, and the first
  // draft had neither. The host must stay SHRINK-TO-FIT — passing
  // `display: block` overrides the inline-block base rule, the host then takes
  // the viewport width, and the child's size cannot move it: measured, that
  // version reported 100 with scripting both off AND on. And the viewport must
  // be wider than the grown element, or the clamp hides the difference.
  // Measured against the live mutant: 100 with scripting off, 400 with it on.
  const result = await renderReferenceThumbnail({
    html: '<div id="probe" style="width:100px;height:50px;background:#111"></div>'
      + '<script>document.getElementById("probe").style.width = "400px";</script>',
    styles: {},
    rect: { x: 0, y: 0, width: 600, height: 300 }
  });
  assert.ok(result, 'the render failed outright');
  assert.equal(result.width, 100,
    'the captured markup executed — a script in a stored third-party pattern ran ' +
    'inside the render and changed the element');
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
    // Any temp, not one predicted name: the temp path carries a pid and a random
    // suffix now (a fixed `<ref>.png.tmp` is a collision between two processes
    // attaching to the same reference), so asserting on `file + '.tmp'` would
    // have stopped measuring anything the moment that changed.
    assert.deepEqual(readdirSync(home).filter((name) => name.endsWith('.tmp')), [],
      'a temp file survived the rename');

    // The record on disk carries it too — an in-memory return value that never
    // reached the file would leave every later search imageless.
    assert.deepEqual(store.getReference(reference.ref_id).image, imaged.image);

    // Takedown. A third-party pattern removed from the corpus must not survive
    // as a picture of itself sitting next to a gap in the index.
    assert.equal(store.deleteReference(reference.ref_id), true);
    assert.ok(!existsSync(file),
      'deleting a reference left its image on disk — that is not a delete, and ' +
      'this is the takedown path for third-party patterns');
    // The record too. Asserting only on the PNG passes against a delete that
    // removes the picture and leaves the record — half a takedown, and the half
    // that still names the site.
    assert.equal(store.getReference(reference.ref_id), null,
      'the record survived a delete that reported success');
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
    // Height as well as width. The rule is symmetric and the test was not: drop
    // the height check and every assertion here still passed.
    assert.throws(() => store.attachReferenceImage(reference.ref_id, png, { width: 1, height: 0 }),
      /positive/);
    // A size that ROUNDS to zero. "> 0" accepted 0.4 and Math.round stored it as
    // 0 — a record advertising a 0×0 picture, measured and wrong rather than
    // absent. The check has to run on the rounded value, which is what a
    // consumer actually gets.
    assert.throws(() => store.attachReferenceImage(reference.ref_id, png, { width: 0.4, height: 0.4 }),
      /positive/);
    // Bytes that are not a PNG. "non-empty byte array" accepted a single byte,
    // so the record advertised an image no viewer can open — worse than no
    // image, because the corpus reports a picture it does not have.
    assert.throws(() => store.attachReferenceImage(reference.ref_id, Buffer.from([1]), { width: 10, height: 10 }),
      /non-empty|PNG/);
    assert.throws(() => store.attachReferenceImage(reference.ref_id, Buffer.from('not-an-image-at-all'), { width: 10, height: 10 }),
      /PNG/);
    // …and none of the rejections left a file behind.
    assert.ok(!existsSync(store.referenceImagePath(reference.ref_id)),
      'a rejected attach still wrote a PNG');
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test('a PNG whose record write fails is not left behind', async () => {
  // The attach writes the picture first and the record that points at it
  // second. If the second write fails, the bytes on disk are a copy of somebody
  // else's design work with no URL, no owner and no licence beside it — the one
  // thing the attribution half of this corpus exists to prevent. Nothing else
  // will ever find it either: it is not in the index and no record names it.
  //
  // Inducing the failure needs a seam, and the portable one is the `size`
  // object the caller passes. Its `width` is read BEFORE the PNG is written and
  // the record is written AFTER, so a getter on it runs in between. It turns
  // the record's path into a NON-EMPTY DIRECTORY, which `renameSync` cannot
  // replace on any platform — a deterministic failure rather than a permissions
  // or out-of-space trick that needs root on one OS and does nothing on
  // another. The record was already read into memory by then, so making its
  // path unusable afterwards is invisible to everything except the write.
  const home = await mkdtemp(path.join(tmpdir(), 'raven-thumb-'));
  const previous = process.env.RAVEN_REFERENCE_HOME;
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    const reference = store.saveReference({
      url: 'https://example.com/', selector: '.x', styles: {}, owner: 'third-party', tags: ['hero']
    });
    const recordFile = path.join(home, reference.ref_id + '.json');
    const image = store.referenceImagePath(reference.ref_id);
    assert.ok(existsSync(recordFile), 'fixture: the record was not written where this test expects it');

    let sabotaged = false;
    const size = {
      get width() {
        // Read more than once by the product code; the sabotage happens once.
        if (!sabotaged) {
          sabotaged = true;
          rmSync(recordFile);
          mkdirSync(recordFile);
          writeFileSync(path.join(recordFile, 'occupant'), 'x');
        }
        return 10;
      },
      height: 10
    };

    const png = Buffer.concat([PNG_MAGIC, Buffer.from('fixture')]);
    assert.throws(() => store.attachReferenceImage(reference.ref_id, png, size),
      'the record write did not fail — the fixture no longer induces the failure ' +
      'it was built to induce, so this test is measuring nothing');

    // The fixture held: assert what it actually did, not that it ran.
    assert.ok(sabotaged, 'fixture: the size getter never fired');
    assert.ok(statSync(recordFile).isDirectory(),
      'fixture: the record path is not the directory this test made it');

    assert.ok(!existsSync(image),
      'the PNG survived a failed attach — an orphan copy of a third-party ' +
      'pattern with no record beside it naming where it came from');
    assert.deepEqual(readdirSync(home).filter((name) => name.includes('.tmp')), [],
      'a temp file survived the failed attach');
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});
