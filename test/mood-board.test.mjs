// Mood boards from the taste engine.
//
// The board is the taste interview made lookable: design notes as chips, the
// binding's references, and pattern-library thumbnails captured from those same
// sites, one self-contained HTML file plus a best-effort PNG. These tests hold
// the three properties the module claims: self-contained (no scripts, no
// external loads, third-party text escaped), nothing invented (the ground is
// measured from reference traits, never prose), and the approval stop (the
// board names generate_design_system and never runs it).
//
// Mutant radii, MEASURED (18 string-edit mutants against dist/, clean baseline
// first, each import()-load-checked, restore verified by string equality):
// unsafe-href (javascript: kept as an anchor), no-example-banner,
// no-binding-no-throw, ignore-host-filter, no-image-cap, no-total-budget,
// silent-empty-board, never-render-png, footer-drops-next-step,
// interview-drops-question (dist/taste.js), unstable-filename,
// always-claims-measured, silent-missing-image, unescaped-ground and
// unescaped-data-uri-src each redden exactly ONE test. Three redden more, and
// each wide radius is a fact about a shared mechanism, not extra guards:
// escape-nothing reddens 2 (both escaping tests pass through the one
// escapeHtml), tie-reads-dark reddens 2 (the vote and the sparse board's
// provenance line read the same ground), never-embed reddens 3 (the compose,
// per-image-cap and budget tests share the one data-URI assignment). The
// statSync().isFile() clause in embeddablePatterns is deliberately NOT
// mutated: a directory at the image path lands in the same catch via EISDIR
// with or without it — same warning either way — so no test can turn exactly
// that clause red; its own comment says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.RAVEN_NO_USAGE_LOG = '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mood;
let taste;
let tasteStoreMod;
let refStore;
try {
  mood = await import(path.resolve(__dirname, '../dist/mood-board.js'));
  taste = await import(path.resolve(__dirname, '../dist/taste.js'));
  tasteStoreMod = await import(path.resolve(__dirname, '../dist/taste-store.js'));
  refStore = await import(path.resolve(__dirname, '../dist/reference-store.js'));
} catch (err) {
  const msg = `dist mood-board modules not found - run \`npm run build\` first. (${err.message})`;
  test('mood board modules available', (t) => { t.skip(msg); });
  process.exit(0);
}

// Same discriminator as test/reference-thumbnail.test.mjs: probe chromium ONCE,
// outside the product code. If the probe launches, a null board PNG is a
// FAILURE, not a skip — best-effort must not hide a broken render on a machine
// that has a browser.
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

async function withHomes(fn) {
  const prevTaste = process.env.RAVEN_TASTE_HOME;
  const prevRef = process.env.RAVEN_REFERENCE_HOME;
  const tasteHome = await mkdtemp(path.join(tmpdir(), 'raven-mood-taste-'));
  const refHome = await mkdtemp(path.join(tmpdir(), 'raven-mood-refs-'));
  process.env.RAVEN_TASTE_HOME = tasteHome;
  process.env.RAVEN_REFERENCE_HOME = refHome;
  try {
    const store = new tasteStoreMod.FsTasteStore();
    await fn({ tasteHome, refHome, store });
  } finally {
    if (prevTaste === undefined) delete process.env.RAVEN_TASTE_HOME; else process.env.RAVEN_TASTE_HOME = prevTaste;
    if (prevRef === undefined) delete process.env.RAVEN_REFERENCE_HOME; else process.env.RAVEN_REFERENCE_HOME = prevRef;
  }
}

// A stored pattern with a thumbnail on disk, without driving chromium: save the
// record, then add the image field and PNG bytes by hand — the same on-disk
// shape attachReferenceImage leaves behind.
function seedPatternWithImage(refHome, url, note, pngBytes) {
  const saved = refStore.saveReference({
    url,
    owner: 'third-party',
    selector: '.hero',
    html: '<div class="hero">Reference hero</div>',
    styles: { color: 'rgb(20, 20, 24)', width: '640px' },
    note,
    tags: ['hero'],
  });
  const recordPath = path.join(refHome, saved.ref_id + '.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.image = { file: saved.ref_id + '.png', width: 640, height: 320, fidelity: 'offline' };
  writeFileSync(recordPath, JSON.stringify(record, null, 2));
  writeFileSync(
    path.join(refHome, saved.ref_id + '.png'),
    pngBytes || Buffer.concat([PNG_MAGIC, Buffer.from('mood-board-fixture')]),
  );
  return saved.ref_id;
}

// Self-containment, asserted on the DOCUMENT: no script, no external resource
// loads. Anchors are deliberately allowed — a link is navigation the reader
// chooses, not a load the document performs — so the check must not simply ban
// "http" (the hrefs legitimately contain it).
function assertSelfContained(html) {
  assert.ok(!/<script/i.test(html), 'board must carry no script');
  assert.ok(!/<link/i.test(html), 'board must load no external stylesheet');
  assert.ok(!/<iframe|<object|<embed|<frame/i.test(html), 'board must nest no external document');
  assert.ok(!/@import/i.test(html), 'board must import no external CSS');
  assert.ok(!/src\s*=\s*["']?http/i.test(html), 'board must load no external image');
  assert.ok(!/srcset\s*=/i.test(html), 'board must carry no srcset (the emitter never writes one)');
  assert.ok(!/url\(\s*['"]?http/i.test(html), 'board CSS must reference no external URL');
}

test('the ground is measured from reference traits, and a tie or nothing reads light', () => {
  const dark = { references: [
    { url: 'https://a.example', traits: { scheme: 'dark' } },
    { url: 'https://b.example', traits: { scheme: 'dark' } },
    { url: 'https://c.example', traits: { scheme: 'light' } },
  ] };
  assert.equal(mood.moodBoardGround(dark), 'dark');
  const tie = { references: [
    { url: 'https://a.example', traits: { scheme: 'dark' } },
    { url: 'https://b.example', traits: { scheme: 'light' } },
  ] };
  assert.equal(mood.moodBoardGround(tie), 'light');
  assert.equal(mood.moodBoardGround({ references: [] }), 'light');
  assert.equal(mood.moodBoardGround({}), 'light');
  // "mixed"/"unknown" schemes are abstentions, not votes.
  assert.equal(mood.moodBoardGround({ references: [{ url: 'https://a.example', traits: { scheme: 'mixed' } }] }), 'light');
});

test('the document escapes third-party text, drops non-http hrefs, and stays self-contained', () => {
  const html = mood.buildMoodBoardDocument({
    profile: 'p',
    project: 'proj <script>alert("t")</script>',
    surface: 'product site',
    generated_at: '2026-08-07T00:00:00.000Z',
    example: false,
    ground: 'light',
    voice_note: 'Voice with "quotes" & <em>markup</em>',
    notes: [{ key: 'color', text: 'Dark ground</style><script>alert(1)</script>' }],
    references: [
      { url: 'javascript:alert(1)', liked: 'a liked note' },
      { url: 'https://linear.app', liked: 'restraint <b>bold</b>' },
    ],
    patterns: [{ credit: 'Pattern from x — <script>y</script>', source_url: 'https://x.example' }],
  });
  assertSelfContained(html);
  // Every injection above must arrive entity-escaped, never live.
  assert.ok(html.includes('&lt;script&gt;alert(&quot;t&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('Dark ground&lt;/style&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('restraint &lt;b&gt;bold&lt;/b&gt;'));
  // The javascript: URL renders as text — no anchor may carry it.
  assert.ok(!/href="javascript:/i.test(html), 'a non-http URL must never become an href');
  assert.ok(html.includes('javascript:alert(1)'), 'the URL still appears, as inert text');
  assert.ok(/href="https:\/\/linear\.app\/?"/.test(html), 'http(s) references keep their anchor');
});

test('the exported builder holds self-containment against type-violating data, not just its own producer', () => {
  // buildMoodBoardDocument is exported from a public package; the TS types
  // ("light"|"dark", module-built data URIs) are invariants the runtime never
  // checks, so the two sinks that used to ride on them get hostile values here.
  const html = mood.buildMoodBoardDocument({
    profile: 'p',
    project: 'proj',
    surface: 'product site',
    generated_at: '2026-08-07T00:00:00.000Z',
    example: false,
    ground: '<img src=x onerror=alert(1)>',
    voice_note: '',
    notes: [],
    references: [],
    patterns: [{
      credit: 'Pattern from x — https://x.example',
      source_url: 'https://x.example',
      png_data_uri: 'x" onerror="alert(1)',
    }],
  });
  assert.ok(!html.includes('<img src=x'), 'a hostile ground value must not become live markup');
  assert.ok(!html.includes('" onerror="'), 'a quote in a data URI must not break out of the src attribute');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'the hostile ground arrives as inert text');
});

test('a note is text, never a swatch: no hex value the data did not carry appears in a color note chip', () => {
  const html = mood.buildMoodBoardDocument({
    profile: 'p',
    project: 'proj',
    surface: 'product site',
    generated_at: '2026-08-07T00:00:00.000Z',
    example: false,
    ground: 'dark',
    voice_note: '',
    notes: [{ key: 'color', text: 'warm cream ground, one terracotta accent' }],
    references: [],
    patterns: [],
  });
  // The chip carries the prose verbatim; the ONLY colors in the document are
  // the fixed light/dark chrome palette. Nothing terracotta-shaped may appear.
  assert.ok(html.includes('warm cream ground, one terracotta accent'));
  const hexes = new Set((html.match(/#[0-9a-f]{6}\b/gi) || []).map((h) => h.toLowerCase()));
  const chrome = new Set(['#101014', '#f2f0ec', '#9a97a0', '#2a2a31', '#18181d']);
  for (const hex of hexes) {
    assert.ok(chrome.has(hex), `unexpected color ${hex} — a hex the data never carried`);
  }
});

test('mode:example writes a clearly-labeled sample board with the approval stop', async () => {
  await withHomes(async ({ tasteHome, store }) => {
    await taste.createTasteProfile(store, { name: 'mood-example', rules: [] });
    const result = await mood.generateMoodBoard({ store, profile: 'mood-example', mode: 'example' });
    assert.equal(result.example, true);
    assert.equal(result.html_path, path.join(tasteHome, 'moodboards', 'mood-example--example.html'));
    assert.ok(existsSync(result.html_path));
    const html = readFileSync(result.html_path, 'utf8');
    assertSelfContained(html);
    assert.ok(html.includes('EXAMPLE'), 'the sample board must announce itself');
    assert.ok(html.includes('not your project'));
    // An example must not fabricate captures: its pattern cards show the
    // placeholder state, never a data URI.
    assert.ok(!html.includes('data:image/png'), 'an example board embeds no fabricated thumbnails');
    assert.ok(html.includes('generate_design_system'), 'the footer names the next step');
    assert.ok(result.next.includes('generate_design_system'));
    assert.ok(!result.next.includes('runs it automatically'));
  });
});

test('mode:board with no binding throws naming get_taste_interview', async () => {
  await withHomes(async ({ store }) => {
    await taste.createTasteProfile(store, { name: 'mood-unbound', rules: [] });
    await assert.rejects(
      () => mood.generateMoodBoard({ store, profile: 'mood-unbound', project: 'nothing-bound' }),
      /get_taste_interview/,
    );
    // And a missing project is its own message, pointing at the example escape.
    await assert.rejects(
      () => mood.generateMoodBoard({ store, profile: 'mood-unbound' }),
      /mode:'example'/,
    );
  });
});

test('mode:board composes notes and references, and embeds only host-matched pattern thumbnails with their credit', async () => {
  await withHomes(async ({ refHome, store }) => {
    // Patterns exist for the reference host AND for an unrelated host: only the
    // first belongs on this project's board.
    const matchedId = seedPatternWithImage(refHome, 'https://example.com/pricing', 'the pricing toggle');
    seedPatternWithImage(refHome, 'https://other.example/hero', 'someone else’s hero');

    await taste.createTasteProfile(store, { name: 'mood-bound', rules: [] });
    await taste.bindTasteSurface(store, 'mood-bound', {
      project: 'night-product',
      surface: 'product marketing site',
      voice_note: 'Punchy editorial.',
      design_notes: { color: 'near-black ground, one accent', motion: 'subtle only' },
      references: [
        { url: 'https://example.com', liked: 'the restraint', traits: { scheme: 'dark' } },
        { url: 'https://stripe.com', traits: { scheme: 'dark' } },
      ],
    });

    const result = await mood.generateMoodBoard({ store, profile: 'mood-bound', project: 'night-product' });
    assert.equal(result.example, false);
    assert.deepEqual(result.counts, { notes: 2, references: 2, patterns: 1 });
    const html = readFileSync(result.html_path, 'utf8');
    assertSelfContained(html);
    // Measured ground: both references are dark.
    assert.ok(html.includes('dark ground (measured from references)'));
    // Notes as chips, references as rows.
    assert.ok(html.includes('near-black ground, one accent'));
    assert.ok(html.includes('the restraint'));
    // The matched pattern arrives as an embedded picture WITH its credit — the
    // picture and the attribution are one unit, same rule as search_references.
    assert.ok(html.includes('data:image/png;base64,'), 'the host-matched thumbnail is embedded');
    assert.ok(html.includes('Pattern from example.com'), 'the embedded pattern carries its credit');
    assert.ok(html.includes('the pricing toggle'));
    // The unrelated host's pattern is absent in both directions.
    assert.ok(!html.includes('other.example'), 'a pattern from an unrelated host must not appear');
    // A populated board must NOT carry the empty-board warning — this pins the
    // warning to its condition, not just its substring to some code path.
    assert.ok(!result.warnings.some((w) => w.includes('no design notes')), 'the empty-board warning stays off a populated board');
    // The embedded bytes are the seeded PNG, round-tripped through base64.
    const expected = Buffer.concat([PNG_MAGIC, Buffer.from('mood-board-fixture')]).toString('base64');
    assert.ok(html.includes(expected), `the data URI must carry the stored bytes for ${matchedId}`);
  });
});

test('re-running overwrites the same file, and an empty binding is reported honestly', async () => {
  await withHomes(async ({ store }) => {
    await taste.createTasteProfile(store, { name: 'mood-sparse', rules: [] });
    await taste.bindTasteSurface(store, 'mood-sparse', {
      project: 'sparse-proj',
      surface: 'product site',
      voice_note: 'Calm.',
      design_notes: {},
    });
    const first = await mood.generateMoodBoard({ store, profile: 'mood-sparse', project: 'sparse-proj' });
    const second = await mood.generateMoodBoard({ store, profile: 'mood-sparse', project: 'sparse-proj' });
    assert.equal(first.html_path, second.html_path, 'same profile+project lands on the same file');
    assert.ok(existsSync(second.html_path));
    // voice_note is calibration, but the board's SECTIONS are all empty — that
    // is said out loud instead of handing back a bare header as if it were done.
    assert.ok(second.warnings.some((w) => w.includes('no design notes, references, or captured patterns')));
    assert.deepEqual(second.counts, { notes: 0, references: 0, patterns: 0 });
    // And with zero scheme-bearing references, the meta line must not claim a
    // measurement that never happened.
    const html = readFileSync(second.html_path, 'utf8');
    assert.ok(html.includes('light ground (default — no reference schemes to measure)'));
    assert.ok(!html.includes('measured from references'), 'no measurement claim without a measurement');
  });
});

test('a record naming a thumbnail whose file is gone warns by ref_id — never a silent placeholder', async () => {
  await withHomes(async ({ refHome, store }) => {
    // The record says image, the disk says nothing: deleted file, or a corpus
    // copied without its PNGs. The card must survive (credit and note are
    // still real) and the missing picture must be SAID, not implied.
    const goneId = seedPatternWithImage(refHome, 'https://example.com/gone', 'the vanished capture');
    unlinkSync(path.join(refHome, goneId + '.png'));

    await taste.createTasteProfile(store, { name: 'mood-gone', rules: [] });
    await taste.bindTasteSurface(store, 'mood-gone', {
      project: 'gone-proj',
      surface: 'product site',
      voice_note: 'Calm.',
      design_notes: {},
      references: [{ url: 'https://example.com', traits: { scheme: 'light' } }],
    });
    const result = await mood.generateMoodBoard({ store, profile: 'mood-gone', project: 'gone-proj' });
    assert.equal(result.counts.patterns, 1, 'the card survives its missing picture');
    assert.ok(result.warnings.some((w) => w.includes(goneId) && w.includes('placeholder')), 'the missing thumbnail is named');
    const html = readFileSync(result.html_path, 'utf8');
    assert.ok(!html.includes('data:image/png'), 'nothing is embedded');
    assert.ok(html.includes('the vanished capture'), 'the note still shows');
  });
});

test('an oversized thumbnail becomes a placeholder with a named warning, never a silent drop', async () => {
  await withHomes(async ({ refHome, store }) => {
    // One image over the 2,500,000-byte per-image cap, one ordinary — the board
    // must embed the ordinary one, keep the oversized pattern's CARD (credit and
    // note stay), and say why its picture is missing.
    const bigPng = Buffer.concat([PNG_MAGIC, Buffer.alloc(2_600_000, 7)]);
    const bigId = seedPatternWithImage(refHome, 'https://example.com/huge', 'the huge capture', bigPng);
    seedPatternWithImage(refHome, 'https://example.com/small', 'the small capture');

    await taste.createTasteProfile(store, { name: 'mood-caps', rules: [] });
    await taste.bindTasteSurface(store, 'mood-caps', {
      project: 'caps-proj',
      surface: 'product site',
      voice_note: 'Calm.',
      design_notes: {},
      references: [{ url: 'https://example.com', traits: { scheme: 'light' } }],
    });
    const result = await mood.generateMoodBoard({ store, profile: 'mood-caps', project: 'caps-proj' });
    assert.equal(result.counts.patterns, 2, 'both patterns keep their card');
    assert.ok(result.warnings.some((w) => w.includes(bigId) && w.includes('per-image embed cap')));
    const html = readFileSync(result.html_path, 'utf8');
    const embeds = html.match(/data:image\/png;base64,/g) || [];
    assert.equal(embeds.length, 1, 'only the ordinary image is embedded');
    assert.ok(html.includes('the huge capture'), 'the oversized pattern still shows its note');
  });
});

test('the total embed budget caps the board, and the skip is named', async () => {
  await withHomes(async ({ refHome, store }) => {
    // Four images of 2.4MB each: all under the per-image cap, cumulatively past
    // the 8,000,000-byte board budget at the fourth. The assertions are counts,
    // not identities, because search order is not this test's claim.
    for (let i = 0; i < 4; i++) {
      seedPatternWithImage(
        refHome,
        `https://example.com/p${i}`,
        `capture ${i}`,
        Buffer.concat([PNG_MAGIC, Buffer.alloc(2_400_000, i + 1)]),
      );
    }
    await taste.createTasteProfile(store, { name: 'mood-budget', rules: [] });
    await taste.bindTasteSurface(store, 'mood-budget', {
      project: 'budget-proj',
      surface: 'product site',
      voice_note: 'Calm.',
      design_notes: {},
      references: [{ url: 'https://example.com', traits: { scheme: 'light' } }],
    });
    const result = await mood.generateMoodBoard({ store, profile: 'mood-budget', project: 'budget-proj' });
    assert.equal(result.counts.patterns, 4, 'every pattern keeps its card');
    const budgetWarnings = result.warnings.filter((w) => w.includes('total embed budget'));
    assert.equal(budgetWarnings.length, 1, 'exactly one image falls past the budget');
    const html = readFileSync(result.html_path, 'utf8');
    const embeds = html.match(/data:image\/png;base64,/g) || [];
    assert.equal(embeds.length, 3, 'three images fit the budget, the fourth is a placeholder');
  });
});

test('the board PNG is best-effort, and with a working chromium it actually renders', async () => {
  await withHomes(async ({ store }) => {
    await taste.createTasteProfile(store, { name: 'mood-png', rules: [] });
    const result = await mood.generateMoodBoard({ store, profile: 'mood-png', mode: 'example' });
    if (chromiumAvailable) {
      // The probe launched a browser, so null here is a broken render, not a
      // missing one — the reference-thumbnail rule applied to the board.
      assert.ok(result.image_path !== null, 'chromium is available: the board PNG must render');
      const bytes = readFileSync(result.image_path);
      assert.ok(bytes.subarray(0, 8).equals(PNG_MAGIC), 'the written file is a PNG');
      assert.ok(!result.warnings.some((w) => w.includes('PNG not rendered')));
    } else {
      assert.equal(result.image_path, null);
      assert.ok(result.warnings.some((w) => w.includes('PNG not rendered')), 'the missing PNG is named, never silent');
    }
  });
});

test('the kickoff interview offers the mood board as an extended question and the guidance names it', async () => {
  await withHomes(async ({ store }) => {
    await taste.createTasteProfile(store, { name: 'mood-interview', rules: [] });
    const firstRun = await taste.getTasteInterview(store, 'mood-interview', 'proj');
    const moreIds = firstRun.more_questions.map((q) => q.id);
    assert.ok(moreIds.includes('mood_board'), 'first_run defers the mood-board question into more_questions');
    const q = firstRun.more_questions.find((question) => question.id === 'mood_board');
    assert.equal(q.skippable, true);
    assert.equal(q.priority, 'extended');
    assert.ok(q.question.includes("mode:'example'"), 'the question tells a first-timer how to see a sample');
    assert.ok(firstRun.then.includes('generate_mood_board'), 'thenFirstRun mentions the tool');
    const full = await taste.getTasteInterview(store, 'mood-interview', 'proj', 'kickoff', 'full');
    assert.ok(full.questions.some((question) => question.id === 'mood_board'), "depth:'full' asks it inline");
    assert.ok(full.then.includes('generate_mood_board'), 'thenFull mentions the tool');
  });
});
