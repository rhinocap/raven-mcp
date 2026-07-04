import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distFidelity = path.resolve(__dirname, '../dist/taste-fidelity.js');

let fidelity;
try {
  fidelity = await import(distFidelity);
} catch (err) {
  const msg = `dist/taste-fidelity.js not found - run \`npm run build\` first. (${err.message})`;
  test('taste-fidelity module available', (t) => { t.skip(msg); });
  process.exit(0);
}

const { assessDesignNotes, restraintGuard, referenceDeltas, buildHints, TECHNIQUE_RECIPES } = fidelity;

function makeTraits(over) {
  return Object.assign({
    source: 'live', scheme: 'light', bg_luminance: 0.98, text_density: 0.4,
    section_count: 5, image_count: 3, video_count: 0, canvas_count: 0,
    webgl: false, backdrop_filter: false, animation_count: 0, scroll_effects: false,
    font_families: ['Inter'], max_heading_px: 48, gradient_count: 0,
    loader_hint: false, viewport_fill: 0.6
  }, over || {});
}

function staticTraits(over) {
  return makeTraits(Object.assign({
    source: 'static', webgl: null, animation_count: null, scroll_effects: null,
    text_density: null, max_heading_px: null, viewport_fill: null
  }, over || {}));
}

function one(notes, traits) {
  const rows = assessDesignNotes(notes, traits);
  assert.equal(rows.length, 1);
  return rows[0];
}

// ---- color ----

test('color: dark note vs measured scheme — present/missing/partial/unverifiable', () => {
  const dark = { color: 'Dark, cinematic palette.' };
  const present = one(dark, makeTraits({ scheme: 'dark', bg_luminance: 0.06 }));
  assert.equal(present.status, 'present');
  assert.match(present.evidence, /scheme=dark/);

  const missing = one(dark, makeTraits({ scheme: 'light', bg_luminance: 0.97 }));
  assert.equal(missing.status, 'missing');
  assert.match(missing.evidence, /bg_luminance=0\.97/, 'missing must cite the measured luminance');

  const partial = one(dark, makeTraits({ scheme: 'mixed', bg_luminance: 0.5 }));
  assert.equal(partial.status, 'partial');

  const unknown = one(dark, makeTraits({ scheme: 'unknown', bg_luminance: null }));
  assert.equal(unknown.status, 'unverifiable');

  // light words vs dark page
  const lightMissing = one({ color: 'Bone white ground.' }, makeTraits({ scheme: 'dark', bg_luminance: 0.05 }));
  assert.equal(lightMissing.status, 'missing');

  // no scheme vocabulary => unverifiable, never a guess
  const noWords = one({ color: 'Warm neutrals with a single accent.' }, makeTraits({}));
  assert.equal(noWords.status, 'unverifiable');
});

// ---- libraries ----

test('libraries: three.js note vs canvas/webgl evidence', () => {
  const note = { libraries: 'three.js hero scene' };
  const missing = one(note, makeTraits({ canvas_count: 0, webgl: false }));
  assert.equal(missing.status, 'missing');
  assert.match(missing.evidence, /canvas_count=0/);

  const present = one(note, makeTraits({ canvas_count: 1, webgl: true }));
  assert.equal(present.status, 'present');

  const partial = one(note, makeTraits({ canvas_count: 1, webgl: null }));
  assert.equal(partial.status, 'partial');
});

test('libraries: gsap/scroll choreography note vs measured motion', () => {
  const note = { libraries: 'GSAP scroll choreography' };
  const present = one(note, makeTraits({ scroll_effects: true }));
  assert.equal(present.status, 'present');

  const viaAnims = one(note, makeTraits({ scroll_effects: false, animation_count: 9 }));
  assert.equal(viaAnims.status, 'present');

  const missing = one(note, makeTraits({ scroll_effects: false, animation_count: 0 }));
  assert.equal(missing.status, 'missing');
  assert.match(missing.evidence, /animation_count=0/);
  assert.match(missing.evidence, /scroll_effects=false/);
});

test('libraries: multi-technique note takes the worst status; vanilla/none is unverifiable', () => {
  // three.js satisfied, gsap absent -> missing wins.
  const combined = one(
    { libraries: 'three.js + GSAP scroll choreography' },
    makeTraits({ canvas_count: 1, webgl: true, scroll_effects: false, animation_count: 0 })
  );
  assert.equal(combined.status, 'missing');
  assert.match(combined.evidence, /canvas_count=1/);
  assert.match(combined.evidence, /scroll_effects=false/);

  const vanilla = one({ libraries: 'none — vanilla JS only' }, makeTraits({}));
  assert.equal(vanilla.status, 'unverifiable');

  // lottie is partial at best when animation exists, missing when nothing animates.
  const lottiePartial = one({ libraries: 'lottie brand marks' }, makeTraits({ animation_count: 2 }));
  assert.equal(lottiePartial.status, 'partial');
  const lottieMissing = one({ libraries: 'lottie brand marks' }, makeTraits({ animation_count: 0, canvas_count: 0 }));
  assert.equal(lottieMissing.status, 'missing');
});

test('libraries: anime.js note — unverifiable static, partial when animating, missing when still', () => {
  const note = { libraries: 'anime.js staggered reveals and SVG timelines' };
  // A static capture cannot count running animations -> unverifiable, never a guess.
  assert.equal(one(note, makeTraits({ animation_count: null })).status, 'unverifiable');
  // A live animation surface exists, but anime.js is not deterministically
  // identifiable (like lottie) -> partial at best, whether via count or scroll.
  assert.equal(one(note, makeTraits({ animation_count: 4 })).status, 'partial');
  assert.equal(one(note, makeTraits({ animation_count: 0, scroll_effects: true })).status, 'partial');
  // Nothing runs -> the anime.js note is missing, with citable trait numbers.
  const missing = one(note, makeTraits({ animation_count: 0, scroll_effects: false }));
  assert.equal(missing.status, 'missing');
  assert.match(missing.evidence, /animation_count=0/);
  assert.match(missing.evidence, /scroll_effects=false/);
});

test('libraries: an anime.js note that also says "choreography" is not mis-graded by the greedy GSAP branch', () => {
  // GSAP_WORDS matches bare "choreograph…"/"scroll…" vocabulary. Before the
  // guard, a note naming anime.js + choreography ran BOTH branches: at
  // animation_count=2/scroll=false the GSAP branch returned `missing`
  // (needs >3 anims or scroll), and combine()'s worst-status pulled the whole
  // note to missing DESPITE live animation. The anime.js branch alone grades
  // this `partial`. A specifically-named engine must own its own motion vocab.
  const animeChoreo = { libraries: 'anime.js staggered entrance choreography and SVG timelines' };
  assert.equal(one(animeChoreo, makeTraits({ animation_count: 2, scroll_effects: false })).status, 'partial');
  // The guard is precise: a note that LITERALLY names gsap still gets the GSAP
  // branch, so at 2 anims / no scroll the GSAP `missing` still dominates.
  const bothNamed = { libraries: 'gsap + anime.js choreography' };
  assert.equal(one(bothNamed, makeTraits({ animation_count: 2, scroll_effects: false })).status, 'missing');
});

// ---- motion ----

test('motion: none-note and cinematic-note against animation evidence', () => {
  const still = { motion: 'none — static page' };
  assert.equal(one(still, makeTraits({ animation_count: 0 })).status, 'present');
  assert.equal(one(still, makeTraits({ animation_count: 12 })).status, 'missing');
  assert.equal(one(still, makeTraits({ animation_count: 2 })).status, 'partial');

  const cinematic = { motion: 'cinematic scroll choreography' };
  assert.equal(one(cinematic, makeTraits({ scroll_effects: true })).status, 'present');
  assert.equal(one(cinematic, makeTraits({ animation_count: 7 })).status, 'present');
  const missing = one(cinematic, makeTraits({ animation_count: 0, scroll_effects: false }));
  assert.equal(missing.status, 'missing');
  assert.match(missing.evidence, /animation_count=0/);

  // both vocabularies -> conservative silence
  assert.equal(one({ motion: 'minimal scroll reveals' }, makeTraits({})).status, 'unverifiable');
});

// ---- aesthetic ----

test('aesthetic: glassmorphic, neon, flat-white, and judgment-only families', () => {
  const glass = { aesthetic: 'glassmorphic panels' };
  assert.equal(one(glass, makeTraits({ backdrop_filter: true })).status, 'present');
  const glassMissing = one(glass, makeTraits({ backdrop_filter: false }));
  assert.equal(glassMissing.status, 'missing');
  assert.match(glassMissing.evidence, /backdrop_filter=false/);

  const neon = { aesthetic: 'neon glow' };
  assert.equal(one(neon, makeTraits({ scheme: 'dark', gradient_count: 3 })).status, 'present');
  assert.equal(one(neon, makeTraits({ scheme: 'dark', gradient_count: 0 })).status, 'partial');
  assert.equal(one(neon, makeTraits({ scheme: 'light', gradient_count: 0 })).status, 'missing');

  const flat = { aesthetic: 'flat-white minimalism' };
  assert.equal(one(flat, makeTraits({ scheme: 'light' })).status, 'present');
  assert.equal(one(flat, makeTraits({ scheme: 'dark' })).status, 'missing');

  assert.equal(one({ aesthetic: 'brutalist' }, makeTraits({})).status, 'unverifiable');
  assert.equal(one({ aesthetic: 'editorial calm' }, makeTraits({})).status, 'unverifiable');
});

// ---- loading ----

test('loading: branded/spinner notes need a loader surface; none needs its absence', () => {
  const branded = { loading: 'branded loader animation' };
  assert.equal(one(branded, makeTraits({ loader_hint: true })).status, 'present');
  const missing = one(branded, makeTraits({ loader_hint: false }));
  assert.equal(missing.status, 'missing');
  assert.match(missing.evidence, /loader_hint=false/);

  const none = { loading: 'none — hold until ready' };
  assert.equal(one(none, makeTraits({ loader_hint: false })).status, 'present');
  assert.equal(one(none, makeTraits({ loader_hint: true })).status, 'missing');
});

// ---- imagery ----

test('imagery: story/scene notes graded by media surface count; none-note inverted', () => {
  const story = { imagery: 'story-driven scene sequences' };
  assert.equal(one(story, makeTraits({ image_count: 3, video_count: 1 })).status, 'present');
  const partial = one(story, makeTraits({ image_count: 1, video_count: 0, canvas_count: 0 }));
  assert.equal(partial.status, 'partial');
  assert.match(partial.evidence, /image_count=1/);
  const missing = one(story, makeTraits({ image_count: 0, video_count: 0, canvas_count: 0 }));
  assert.equal(missing.status, 'missing');

  const none = { imagery: 'none' };
  assert.equal(one(none, makeTraits({ image_count: 0, video_count: 0 })).status, 'present');
  assert.equal(one(none, makeTraits({ image_count: 2 })).status, 'missing');
});

// ---- typography ----

test('typography: mono/serif/display verifiers cite the measured faces and scale', () => {
  const mono = { typography: 'mono kickers over a grotesque' };
  assert.equal(one(mono, makeTraits({ font_families: ['Inter', 'JetBrains Mono'] })).status, 'present');
  const monoMissing = one(mono, makeTraits({ font_families: ['Inter'] }));
  assert.equal(monoMissing.status, 'missing');
  assert.match(monoMissing.evidence, /Inter/);
  assert.equal(one(mono, makeTraits({ font_families: [] })).status, 'unverifiable');

  // serif wanted, but sans-serif in use does not satisfy it.
  const serif = { typography: 'a warm serif for headlines' };
  assert.equal(one(serif, makeTraits({ font_families: ['Georgia serif'] })).status, 'present');
  assert.equal(one(serif, makeTraits({ font_families: ['Inter', 'sans-serif'] })).status, 'missing');
  // "sans-serif" in the NOTE is not a serif expectation.
  assert.equal(one({ typography: 'geometric sans-serif' }, makeTraits({ font_families: ['Inter'] })).status, 'unverifiable');

  const display = { typography: 'dramatic display scale, 96px headlines' };
  assert.equal(one(display, makeTraits({ max_heading_px: 96 })).status, 'present');
  const displayMissing = one(display, makeTraits({ max_heading_px: 32 }));
  assert.equal(displayMissing.status, 'missing');
  assert.match(displayMissing.evidence, /32px/);
  assert.equal(one(display, makeTraits({ max_heading_px: null })).status, 'unverifiable');
});

test('typography: classic faces without a serif/mono substring are recognized', () => {
  // "Times" is a serif and "Courier New" is a mono even though neither family
  // name contains the substring — flagging Times as not-serif was a real false
  // positive caught live on odd-lot.vercel.app.
  const serif = { typography: 'a warm serif for headlines' };
  assert.equal(one(serif, makeTraits({ font_families: ['Times', 'Bricolage Grotesque'] })).status, 'present');
  assert.equal(one(serif, makeTraits({ font_families: ['Playfair Display'] })).status, 'present');
  assert.equal(one(serif, makeTraits({ font_families: ['Inter', 'Helvetica'] })).status, 'missing');
  const mono = { typography: 'mono kickers' };
  assert.equal(one(mono, makeTraits({ font_families: ['Courier New'] })).status, 'present');
  assert.equal(one(mono, makeTraits({ font_families: ['Menlo'] })).status, 'present');
  assert.equal(one(mono, makeTraits({ font_families: ['Georgia'] })).status, 'missing');
});

// ---- spacing (restraint interplay) ----

test('spacing: airy passes only when sparseness is earned by craft', () => {
  const airy = { spacing: 'airy, generous whitespace' };
  // low density + craft (3 images) -> present
  assert.equal(one(airy, makeTraits({ text_density: 0.5, image_count: 3 })).status, 'present');
  // low density but sparse-and-empty (restraint fires) -> partial, citing the guard
  const unearned = one(airy, makeTraits({
    text_density: 0.5, image_count: 0, video_count: 0, canvas_count: 0,
    animation_count: 0, backdrop_filter: false, font_families: ['Inter'],
    max_heading_px: 40, gradient_count: 0
  }));
  assert.equal(unearned.status, 'partial');
  assert.match(unearned.evidence, /unearned/);
  // dense page vs airy note -> missing
  const missing = one(airy, makeTraits({ text_density: 2.5 }));
  assert.equal(missing.status, 'missing');
  assert.match(missing.evidence, /text_density=2\.50/);

  const dense = { spacing: 'compact, dense grid' };
  assert.equal(one(dense, makeTraits({ text_density: 2.0 })).status, 'present');
  assert.equal(one(dense, makeTraits({ text_density: 0.3 })).status, 'missing');
  assert.equal(one(dense, makeTraits({ text_density: null })).status, 'unverifiable');
});

// ---- entrance (never missing from a settled capture) ----

test('entrance: honest partial-at-best — never missing from a post-settle capture', () => {
  const staged = { entrance: 'staged cinematic entrance' };
  const withAnims = one(staged, makeTraits({ animation_count: 4 }));
  assert.equal(withAnims.status, 'partial');
  assert.match(withAnims.evidence, /may have completed before capture/);
  const withoutAnims = one(staged, makeTraits({ animation_count: 0 }));
  assert.equal(withoutAnims.status, 'partial', 'entrance must never be "missing" solely from a settled capture');
  assert.equal(one(staged, staticTraits()).status, 'unverifiable');
  assert.equal(one({ entrance: 'none-instant' }, makeTraits({})).status, 'unverifiable');
});

// ---- reserved / unknown keys ----

test('navigation, special, references, voice, identity, and unknown keys are unverifiable with a reason', () => {
  const rows = assessDesignNotes({
    navigation: 'centered links',
    special: 'a field of tiny dots',
    references: 'mont-fort.com, igloo.inc',
    voice: 'restrained editorial',
    identity: 'vision-app-raven',
    layout: 'single column'
  }, makeTraits({}));
  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.equal(row.status, 'unverifiable', row.key + ' must be unverifiable');
    assert.ok(row.evidence.length > 0, row.key + ' must carry a one-line reason');
  }
});

// ---- static source honesty ----

test('static traits: live-only verifiers answer unverifiable, never missing', () => {
  const rows = assessDesignNotes({
    motion: 'cinematic scroll choreography',
    libraries: 'GSAP scroll timelines',
    spacing: 'airy',
    entrance: 'staged reveal'
  }, staticTraits());
  for (const row of rows) {
    assert.equal(row.status, 'unverifiable', row.key + ' needs live fields on a static capture');
    assert.match(row.evidence, /static HTML|render the url/i);
  }
  // But statically-observable verifiers still work: glass + color read from styles.
  const glass = one({ aesthetic: 'glassmorphic' }, staticTraits({ backdrop_filter: true }));
  assert.equal(glass.status, 'present');
  const color = one({ color: 'dark cinematic' }, staticTraits({ scheme: 'dark', bg_luminance: 0.05 }));
  assert.equal(color.status, 'present');
});

// ---- every missing cites numbers ----

test('every missing assessment carries citable trait numbers in evidence', () => {
  const rows = assessDesignNotes({
    color: 'dark cinematic',
    libraries: 'three.js + GSAP',
    motion: 'cinematic scroll',
    aesthetic: 'glassmorphic',
    loading: 'branded loader',
    imagery: 'story scenes',
    typography: 'mono + dramatic display',
    spacing: 'compact dense'
  }, makeTraits({
    scheme: 'light', canvas_count: 0, scroll_effects: false, animation_count: 0,
    backdrop_filter: false, loader_hint: false, image_count: 0, video_count: 0,
    font_families: ['Inter'], max_heading_px: 32, text_density: 0.4
  }));
  const missing = rows.filter((r) => r.status === 'missing');
  assert.ok(missing.length >= 6, 'expected the dropped-everything build to read mostly missing, got ' + missing.length);
  for (const row of missing) {
    assert.match(row.evidence, /[0-9]|false/, row.key + ' missing must cite trait numbers: ' + row.evidence);
  }
});

// ---- restraintGuard ----

test('restraintGuard: fires on sparse-and-empty, silent on dense or crafted pages', () => {
  const sparseEmpty = restraintGuard(makeTraits({
    text_density: 0.3, image_count: 0, video_count: 0, canvas_count: 0,
    animation_count: 0, backdrop_filter: false, font_families: ['Inter'],
    max_heading_px: 40, gradient_count: 0
  }));
  assert.ok(sparseEmpty, 'sparse-and-empty must fire');
  assert.equal(sparseEmpty.rule_id, 'TASTE-restraint-earned');
  assert.equal(sparseEmpty.severity, 'warn');
  assert.match(sparseEmpty.evidence, /text_density=0\.30/);
  assert.match(sparseEmpty.evidence, /media\(image\+video\+canvas\)=0/);
  assert.match(sparseEmpty.clause_cited, /earned/i);

  // dense page -> silent (not sparse)
  assert.equal(restraintGuard(makeTraits({ text_density: 2.4, image_count: 0 })), null);
  // media-rich -> silent (not sparse)
  assert.equal(restraintGuard(makeTraits({ text_density: 0.3, image_count: 4 })), null);
  // sparse but crafted: each craft signal alone earns the sparseness
  const sparse = { text_density: 0.3, image_count: 0, video_count: 0, canvas_count: 0, animation_count: 0, backdrop_filter: false, font_families: ['Inter'], max_heading_px: 40, gradient_count: 0 };
  assert.equal(restraintGuard(makeTraits(Object.assign({}, sparse, { animation_count: 5 }))), null);
  assert.equal(restraintGuard(makeTraits(Object.assign({}, sparse, { canvas_count: 1 }))), null);
  assert.equal(restraintGuard(makeTraits(Object.assign({}, sparse, { backdrop_filter: true }))), null);
  assert.equal(restraintGuard(makeTraits(Object.assign({}, sparse, { font_families: ['Inter', 'JetBrains Mono'] }))), null);
  assert.equal(restraintGuard(makeTraits(Object.assign({}, sparse, { max_heading_px: 96 }))), null);
  assert.equal(restraintGuard(makeTraits(Object.assign({}, sparse, { gradient_count: 1 }))), null);
  // unknown density -> silent (nothing citable)
  assert.equal(restraintGuard(makeTraits(Object.assign({}, sparse, { text_density: null }))), null);
});

// ---- referenceDeltas ----

test('referenceDeltas: scheme mismatch dedupes across refs and cites both luminances', () => {
  const target = makeTraits({ scheme: 'dark', bg_luminance: 0.05 });
  const refs = [
    { url: 'https://mont-fort.com', traits: makeTraits({ scheme: 'light', bg_luminance: 0.97 }) },
    { url: 'https://igloo.inc', traits: makeTraits({ scheme: 'light', bg_luminance: 0.94 }) }
  ];
  const findings = referenceDeltas(target, refs);
  const scheme = findings.filter((f) => f.rule_id === 'REF-scheme-mismatch');
  assert.equal(scheme.length, 1, 'one deduped finding per dimension');
  assert.match(scheme[0].evidence, /mont-fort\.com/);
  assert.match(scheme[0].evidence, /igloo\.inc/);
  assert.match(scheme[0].evidence, /0\.97/);
  assert.match(scheme[0].evidence, /0\.05/);
  assert.equal(scheme[0].severity, 'warn');
});

// ---- buildHints (technique recipes / build ammunition) ----

test('buildHints: a three.js note gets the three.js recipe with named public examples', () => {
  const hints = buildHints({ libraries: 'three.js WebGL hero' });
  assert.equal(hints.length, 1, 'one deduped hint for the three.js/webgl note');
  assert.equal(hints[0].note_key, 'libraries');
  assert.equal(hints[0].technique, 'three.js hero scene');
  assert.ok(hints[0].recipe.length > 40, 'recipe must be concrete guidance');
  assert.ok(hints[0].examples.length >= 2, 'at least two canonical sources');
  assert.ok(hints[0].examples.every((e) => /https?:\/\//.test(e)), 'each example carries a URL');
  assert.ok(hints[0].examples.some((e) => /threejs\.org/.test(e)), 'names threejs.org');
});

test('buildHints: a vanilla/none note names no expensive technique — no hints', () => {
  assert.deepEqual(buildHints({ libraries: 'none — vanilla JS only' }), []);
  assert.deepEqual(buildHints({ typography: 'a warm grotesque, restrained scale' }), []);
  assert.deepEqual(buildHints({}), []);
});

test('buildHints: a multi-technique binding yields deduped multiple hints in table order', () => {
  const hints = buildHints({
    libraries: 'three.js hero + GSAP scroll choreography',
    aesthetic: 'glassmorphic panels',
    loading: 'branded loader animation'
  });
  const techniques = hints.map((h) => h.technique);
  assert.ok(techniques.includes('three.js hero scene'));
  assert.ok(techniques.includes('GSAP scroll choreography'));
  assert.ok(techniques.includes('glassmorphism'));
  assert.ok(techniques.includes('branded loader'));
  // Deduped: each technique appears exactly once even across notes.
  assert.equal(new Set(techniques).size, techniques.length, 'no duplicate techniques');
  // Table order is stable: three.js precedes GSAP precedes glassmorphism precedes branded loader.
  assert.ok(techniques.indexOf('three.js hero scene') < techniques.indexOf('GSAP scroll choreography'));
  assert.ok(techniques.indexOf('GSAP scroll choreography') < techniques.indexOf('glassmorphism'));
  assert.ok(techniques.indexOf('glassmorphism') < techniques.indexOf('branded loader'));
});

test('buildHints: same technique named on two notes is attributed to the first, once', () => {
  const hints = buildHints({ libraries: 'three.js scene', motion: 'webgl-driven' });
  const three = hints.filter((h) => h.technique === 'three.js hero scene');
  assert.equal(three.length, 1, 'three.js emitted once');
  assert.equal(three[0].note_key, 'libraries', 'attributed to the first note that named it');
});

test('buildHints: lottie, kinetic type, shader, particle, and parallax triggers each resolve', () => {
  assert.equal(buildHints({ libraries: 'lottie brand marks' })[0].technique, 'lottie animation');
  assert.equal(buildHints({ typography: 'kinetic display type, 96px' })[0].technique, 'kinetic / display typography');
  assert.equal(buildHints({ aesthetic: 'aurora shader atmosphere' })[0].technique, 'shader / gradient atmosphere');
  assert.equal(buildHints({ special: 'a drifting particle field' })[0].technique, 'particle / dot field');
  assert.equal(buildHints({ imagery: 'parallax floating device frame' })[0].technique, 'parallax product frame');
});

test('buildHints: an anime.js note gets the anime.js recipe with the v4 module API and animejs.com examples', () => {
  const hints = buildHints({ libraries: 'anime.js staggered reveals and SVG timelines' });
  assert.equal(hints.length, 1, 'exactly one deduped hint — no collision with the scroll/scene recipes');
  assert.equal(hints[0].technique, 'anime.js motion');
  assert.equal(hints[0].note_key, 'libraries');
  assert.ok(hints[0].examples.every((e) => /https?:\/\//.test(e)), 'each example carries a URL');
  assert.ok(hints[0].examples.some((e) => /animejs\.com/.test(e)), 'names the canonical animejs.com source');
  // The recipe must teach the v4 ES-module API, not a stale global-script pattern.
  assert.match(hints[0].recipe, /import \{[^}]*animate/, 'names the v4 module import');
  assert.match(hints[0].recipe, /stagger/, 'names stagger for choreographed cascades');
  assert.match(hints[0].recipe, /prefers-reduced-motion/, 'gates motion behind reduced-motion');
});

test('buildHints: the anime.js trigger is bounded — a substring like "xanime.js" gets no anime recipe', () => {
  // Guards the Gap-3 boundary: an unbounded /anime\.?js/ would match "xanime.js"
  // as a substring. The bounded trigger must reject it — this assertion FAILS if
  // the boundary is reverted, which the happy-path test above does not.
  const bogus = buildHints({ libraries: 'xanime.js fake and notanimejs' });
  assert.ok(!bogus.some((h) => h.technique === 'anime.js motion'), 'no anime recipe for a mid-word substring');
  // But the real separator variants people actually type all DO trigger it.
  for (const spelling of ['anime.js', 'animejs', 'anime-js', 'anime js']) {
    const h = buildHints({ libraries: spelling + ' staggered reveals' });
    assert.ok(h.some((x) => x.technique === 'anime.js motion'), spelling + ' must trigger the anime.js recipe');
  }
});

test('the anime.js interview option is self-consistent with the recognizers (no GSAP cross-contamination)', () => {
  // The literal string a user picks in the libraries interview, stored verbatim
  // as design_notes.libraries. It must NOT name gsap (which would flip the greedy
  // GSAP branch) and MUST be caught by ANIME_WORDS — otherwise the user's anime.js
  // pick grades as "missing GSAP choreography" and gets the wrong build recipe.
  const optionText = 'anime.js: lightweight animation engine — crafted staggered reveals, SVG morphs, and motion timelines';
  assert.doesNotMatch(optionText, /\bgsap\b/i, 'the option label must not name gsap');
  assert.match(optionText, /\banime[.\-\s]?js\b/i, 'the option label must be caught by ANIME_WORDS');
  // Graded with live-but-modest motion, it is the anime.js branch that owns it -> partial, never missing.
  const graded = one({ libraries: optionText }, makeTraits({ animation_count: 2, scroll_effects: false }));
  assert.equal(graded.status, 'partial');
  assert.match(graded.evidence, /anime\.js/i, 'evidence cites the anime.js branch, not GSAP');
  // And it draws the anime.js recipe, not the GSAP scroll recipe.
  const hints = buildHints({ libraries: optionText });
  assert.ok(hints.some((h) => h.technique === 'anime.js motion'), 'the option triggers the anime.js recipe');
  assert.ok(!hints.some((h) => /gsap/i.test(h.technique)), 'the option does NOT trigger a GSAP recipe');
});

test('every recipe in the table is well-formed (concrete recipe + 2-4 URL examples)', () => {
  assert.ok(TECHNIQUE_RECIPES.length >= 10, 'at least ten recipes');
  for (const r of TECHNIQUE_RECIPES) {
    assert.ok(r.technique.length > 0);
    assert.ok(Array.isArray(r.trigger) && r.trigger.length > 0);
    assert.ok(r.recipe.length > 40, r.technique + ' recipe must be concrete');
    assert.ok(r.examples.length >= 2 && r.examples.length <= 4, r.technique + ' needs 2-4 examples');
    assert.ok(r.examples.every((e) => /https?:\/\//.test(e)), r.technique + ' examples must carry URLs');
    // Trigger sources must compile as regexes.
    for (const src of r.trigger) new RegExp(src, 'i');
  }
});

test('referenceDeltas: density, motion, and type-scale deltas; silence on agreement and no-traits', () => {
  const still = makeTraits({ text_density: 0.4, animation_count: 0, scroll_effects: false, max_heading_px: 40 });
  const findings = referenceDeltas(still, [
    { url: 'https://a.com', traits: makeTraits({ text_density: 2.0, animation_count: 14, scroll_effects: true, max_heading_px: 120 }) }
  ]);
  const ids = findings.map((f) => f.rule_id).sort();
  assert.deepEqual(ids, ['REF-density-delta', 'REF-motion-missing', 'REF-type-scale']);
  const density = findings.find((f) => f.rule_id === 'REF-density-delta');
  assert.match(density.evidence, /5\.0x apart/);
  const motion = findings.find((f) => f.rule_id === 'REF-motion-missing');
  assert.match(motion.evidence, /animation_count=14/);

  // Agreement -> no findings.
  assert.deepEqual(referenceDeltas(makeTraits({}), [{ url: 'https://a.com', traits: makeTraits({}) }]), []);
  // No traits on any ref -> silence.
  assert.deepEqual(referenceDeltas(makeTraits({}), [{ url: 'https://a.com' }]), []);
  // Null target fields -> the null-guarded dimensions stay silent.
  const nullTarget = makeTraits({ text_density: null, animation_count: null, max_heading_px: null, scheme: 'unknown' });
  assert.deepEqual(referenceDeltas(nullTarget, [{ url: 'https://a.com', traits: makeTraits({ animation_count: 20, scroll_effects: true, max_heading_px: 120, text_density: 2.0 }) }]), []);
});

// ═══════════════════════════════════════════════════════════════════
// LEG E — mobile parity: screenTraitsFromImage, assessDesignNotesImage,
// assessDesignNotesSource, noteIssuesFromAssessments, image-path refs.
// ═══════════════════════════════════════════════════════════════════

const { screenTraitsFromImage, assessDesignNotesImage, assessDesignNotesSource, noteIssuesFromAssessments } = fidelity;

let PNG = null;
try {
  PNG = (await import('pngjs')).PNG;
} catch {
  test('pngjs available for mobile pixel-trait tests', (t) => {
    t.skip('pngjs not installed - pixel-trait tests skipped; source-verifier tests still run.');
  });
}

function solidPng(width, height, rgb) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

function splitPng(width, height, leftRgb, rightRgb) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgb = x < width / 2 ? leftRgb : rightRgb;
      const i = (y * width + x) * 4;
      png.data[i] = rgb[0]; png.data[i + 1] = rgb[1]; png.data[i + 2] = rgb[2]; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

// ---- screenTraitsFromImage: pixel-derived trait subset ----

test('screenTraitsFromImage: dark screenshot -> scheme dark, live-only fields stay null', { skip: !PNG }, async () => {
  const traits = await screenTraitsFromImage(solidPng(32, 32, [10, 10, 12]));
  assert.equal(traits.source, 'static');
  assert.equal(traits.scheme, 'dark');
  assert.ok(traits.bg_luminance !== null && traits.bg_luminance < 0.1, 'dark luminance, got ' + traits.bg_luminance);
  // The conservatism contract: nothing a screenshot cannot prove is asserted.
  assert.equal(traits.webgl, null);
  assert.equal(traits.animation_count, null);
  assert.equal(traits.scroll_effects, null);
  assert.equal(traits.text_density, null);
  assert.equal(traits.viewport_fill, null);
  assert.equal(traits.image_count, 0);
});

test('screenTraitsFromImage: light screenshot -> scheme light with high luminance', { skip: !PNG }, async () => {
  const traits = await screenTraitsFromImage(solidPng(32, 32, [252, 252, 250]));
  assert.equal(traits.scheme, 'light');
  assert.ok(traits.bg_luminance > 0.9, 'light luminance, got ' + traits.bg_luminance);
});

test('screenTraitsFromImage: half-dark half-light border -> mixed', { skip: !PNG }, async () => {
  const traits = await screenTraitsFromImage(splitPng(32, 32, [0, 0, 0], [255, 255, 255]));
  assert.equal(traits.scheme, 'mixed');
});

test('screenTraitsFromImage: accepts base64 string input', { skip: !PNG }, async () => {
  const b64 = solidPng(16, 16, [8, 8, 8]).toString('base64');
  const traits = await screenTraitsFromImage(b64);
  assert.equal(traits.scheme, 'dark');
  const withPrefix = await screenTraitsFromImage('data:image/png;base64,' + b64);
  assert.equal(withPrefix.scheme, 'dark');
});

test('screenTraitsFromImage: never throws — garbage input returns all-unknown traits', async () => {
  const traits = await screenTraitsFromImage(Buffer.from('this is not a png'));
  assert.equal(traits.scheme, 'unknown');
  assert.equal(traits.bg_luminance, null);
  const fromEmpty = await screenTraitsFromImage('');
  assert.equal(fromEmpty.scheme, 'unknown');
});

// ---- assessDesignNotesImage: the honest pixel subset ----

test('assessDesignNotesImage: verifies color scheme, refuses everything a screenshot cannot prove', { skip: !PNG }, async () => {
  const darkTraits = await screenTraitsFromImage(solidPng(32, 32, [10, 10, 12]));
  const rows = assessDesignNotesImage(
    { color: 'Dark, cinematic palette.', motion: 'cinematic scroll choreography', libraries: 'three.js' },
    darkTraits
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey.color.status, 'present');
  // A screenshot cannot prove motion or a library — never guessed from zero-counts.
  assert.equal(byKey.motion.status, 'unverifiable');
  assert.match(byKey.motion.evidence, /pixel-derived/);
  assert.equal(byKey.libraries.status, 'unverifiable');
});

test('assessDesignNotesImage: dark note vs light screenshot -> missing with cited luminance', { skip: !PNG }, async () => {
  const lightTraits = await screenTraitsFromImage(solidPng(32, 32, [250, 250, 250]));
  const rows = assessDesignNotesImage({ color: 'Dark, cinematic palette.' }, lightTraits);
  assert.equal(rows[0].status, 'missing');
  assert.match(rows[0].evidence, /scheme=light/);
});

// ---- assessDesignNotesSource: per-kind presence verifiers ----

const RICH_SWIFTUI = `
struct HeroView: View {
  @State private var phase = 0.0
  var body: some View {
    TimelineView(.animation) { _ in
      VStack {
        Text("RAVEN").font(.system(size: 64, weight: .bold))
        Text("design intelligence").font(.body)
      }
      .background(.ultraThinMaterial)
      .sensoryFeedback(.impact, trigger: phase)
      .onAppear { withAnimation(.spring()) { phase = 1 } }
    }
  }
}
`;

const BARE_SWIFTUI = `
struct ListView: View {
  var body: some View {
    VStack(alignment: .leading) {
      Text("Item one").font(.body)
      Text("Item two").font(.body)
    }
  }
}
`;

test('assessDesignNotesSource swiftui: rich source satisfies glassmorphic + cinematic + display + haptics notes', () => {
  const rows = assessDesignNotesSource(
    {
      motion: 'cinematic, choreographed transitions',
      aesthetic: 'glassmorphic frosted panels',
      typography: 'dramatic display scale',
      haptics: 'haptic feedback on key actions'
    },
    RICH_SWIFTUI, 'swiftui'
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey.motion.status, 'present');
  assert.match(byKey.motion.evidence, /TimelineView|withAnimation/);
  assert.equal(byKey.aesthetic.status, 'present');
  assert.match(byKey.aesthetic.evidence, /ultraThinMaterial/);
  assert.equal(byKey.typography.status, 'present');
  assert.match(byKey.typography.evidence, /64/);
  assert.equal(byKey.haptics.status, 'present');
  assert.match(byKey.haptics.evidence, /sensoryFeedback/);
});

test('assessDesignNotesSource swiftui: bare VStack list -> missing for glassmorphic + cinematic, citing what was searched', () => {
  const rows = assessDesignNotesSource(
    { motion: 'cinematic, choreographed transitions', aesthetic: 'glassmorphic frosted panels' },
    BARE_SWIFTUI, 'swiftui'
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(byKey.motion.status, 'missing');
  assert.match(byKey.motion.evidence, /searched swiftui source for/, 'missing must cite the searched patterns');
  assert.match(byKey.motion.evidence, /withAnimation/);
  assert.equal(byKey.aesthetic.status, 'missing');
  assert.match(byKey.aesthetic.evidence, /searched swiftui source for/);
  assert.match(byKey.aesthetic.evidence, /ultraThinMaterial/);
});

test('assessDesignNotesSource rn: Reanimated + BlurView present; bare View missing', () => {
  const rich = `
    import { BlurView } from 'expo-blur';
    import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
    export default function Card() { return <BlurView intensity={40}><Animated.View /></BlurView>; }
  `;
  const notes = { motion: 'cinematic entrance choreography', aesthetic: 'glassmorphic translucent cards' };
  const richRows = Object.fromEntries(assessDesignNotesSource(notes, rich, 'rn').map((r) => [r.key, r]));
  assert.equal(richRows.motion.status, 'present');
  assert.equal(richRows.aesthetic.status, 'present');

  const bare = `export default function List() { return <View><Text>one</Text></View>; }`;
  const bareRows = Object.fromEntries(assessDesignNotesSource(notes, bare, 'rn').map((r) => [r.key, r]));
  assert.equal(bareRows.motion.status, 'missing');
  assert.match(bareRows.motion.evidence, /searched rn source for/);
  assert.equal(bareRows.aesthetic.status, 'missing');
});

test('assessDesignNotesSource compose: animate*AsState + Modifier.blur present; bare Column missing', () => {
  const rich = `
    val color by animateColorAsState(target)
    AnimatedVisibility(visible) { Box(Modifier.blur(16.dp)) { Text("hi", fontSize = 48.sp) } }
  `;
  const notes = { motion: 'choreographed transitions', aesthetic: 'glassmorphic panels', typography: 'dramatic display scale' };
  const richRows = Object.fromEntries(assessDesignNotesSource(notes, rich, 'compose').map((r) => [r.key, r]));
  assert.equal(richRows.motion.status, 'present');
  assert.equal(richRows.aesthetic.status, 'present');
  assert.equal(richRows.typography.status, 'present');

  const bare = `Column { Text("one", fontSize = 16.sp); Text("two", fontSize = 16.sp) }`;
  const bareRows = Object.fromEntries(assessDesignNotesSource(notes, bare, 'compose').map((r) => [r.key, r]));
  assert.equal(bareRows.motion.status, 'missing');
  assert.match(bareRows.motion.evidence, /searched compose source for/);
  assert.equal(bareRows.aesthetic.status, 'missing');
  assert.equal(bareRows.typography.status, 'missing');
  assert.match(bareRows.typography.evidence, /16pt/, 'must cite the largest declared size');
});

test('assessDesignNotesSource: 3d/particles note -> scene APIs; loading branded vs stock spinner vs none', () => {
  const sceneRows = assessDesignNotesSource({ imagery: '3d particle starfield' }, 'import SceneKit\nlet view = SCNView()', 'swiftui');
  assert.equal(sceneRows[0].status, 'present');
  const noScene = assessDesignNotesSource({ imagery: '3d particle starfield' }, BARE_SWIFTUI, 'swiftui');
  assert.equal(noScene[0].status, 'missing');

  const branded = assessDesignNotesSource({ loading: 'branded loader' }, 'struct SplashView: View {}', 'swiftui');
  assert.equal(branded[0].status, 'present');
  const stock = assessDesignNotesSource({ loading: 'branded loader' }, 'ProgressView()', 'swiftui');
  assert.equal(stock[0].status, 'partial');
  assert.match(stock[0].evidence, /stock spinner/);
  const nothing = assessDesignNotesSource({ loading: 'branded loader' }, BARE_SWIFTUI, 'swiftui');
  assert.equal(nothing[0].status, 'missing');
});

test('assessDesignNotesSource: static motion note is present on still source, partial when animation APIs exist', () => {
  const still = assessDesignNotesSource({ motion: 'minimal, static' }, BARE_SWIFTUI, 'swiftui');
  assert.equal(still[0].status, 'present');
  const animated = assessDesignNotesSource({ motion: 'minimal, static' }, RICH_SWIFTUI, 'swiftui');
  assert.equal(animated[0].status, 'partial');
});

test('assessDesignNotesSource: notes with no source-observable form are unverifiable, never guessed', () => {
  const rows = assessDesignNotesSource(
    { color: 'Dark, cinematic palette.', spacing: 'airy, generous', entrance: 'fast, confident', special: 'grain texture' },
    RICH_SWIFTUI, 'swiftui'
  );
  for (const row of rows) {
    assert.equal(row.status, 'unverifiable', row.key + ' must be unverifiable from source');
    assert.ok(row.evidence.length > 10, row.key + ' must say why');
  }
});

// ---- noteIssuesFromAssessments: folding into mobile audit verdicts ----

test('noteIssuesFromAssessments: missing notes warn; named library / branded loader escalate to error', () => {
  const notes = { motion: 'cinematic transitions', libraries: 'three.js starfield', loading: 'branded loader' };
  const assessments = [
    { key: 'motion', status: 'missing', expectation: 'animation APIs', evidence: 'none found' },
    { key: 'libraries', status: 'missing', expectation: 'a 3D surface', evidence: 'none found' },
    { key: 'loading', status: 'missing', expectation: 'a branded loader', evidence: 'none found' },
  ];
  const issues = noteIssuesFromAssessments(notes, assessments);
  assert.equal(issues.length, 3);
  const bySeverity = Object.fromEntries(issues.map((i) => [i.rule, i.severity]));
  assert.equal(bySeverity['taste-note/motion'], 'warning');
  assert.equal(bySeverity['taste-note/libraries'], 'error');
  assert.equal(bySeverity['taste-note/loading'], 'error');
  // anime.js is a named library on this shared/mobile path too — a wholly
  // absent anime.js note escalates warn->error, at parity with the web path.
  // Recognition parity: escalation must catch the same separator variants that
  // grading (ANIME_WORDS) does — otherwise "anime-js" grades missing but never
  // escalates. Every spelling a user might type escalates warn->error.
  for (const spelling of ['anime.js', 'animejs', 'anime-js', 'anime js']) {
    const animeIssues = noteIssuesFromAssessments(
      { libraries: spelling + ' staggered reveals and SVG timelines' },
      [{ key: 'libraries', status: 'missing', expectation: 'anime.js-driven motion', evidence: 'none found' }],
    );
    assert.equal(animeIssues.length, 1, spelling + ' produces one issue');
    assert.equal(animeIssues[0].severity, 'error', spelling + ' escalates to error');
  }
  // present/partial/unverifiable never become issues.
  assert.deepEqual(noteIssuesFromAssessments(notes, [
    { key: 'motion', status: 'present', expectation: 'x', evidence: 'y' },
    { key: 'loading', status: 'partial', expectation: 'x', evidence: 'y' },
    { key: 'libraries', status: 'unverifiable', expectation: 'x', evidence: 'y' },
  ]), []);
});

// ---- devil's-advocate regressions (2026-07-03 Codex DA pass) ----

test('buildHints: "three" as a plain word never triggers the three.js recipe', () => {
  assert.deepEqual(buildHints({ layout: 'three-column layout with three sections' }), []);
  assert.deepEqual(buildHints({ spacing: 'three distinct bands of whitespace' }), []);
  const real = buildHints({ libraries: 'threejs particle hero' });
  assert.ok(real.some((h) => h.technique === 'three.js hero scene'));
  const medium = buildHints({ libraries: 'a 3D scene in the hero' });
  assert.ok(medium.some((h) => h.technique === 'three.js hero scene'));
});

test('motion: cinematic-without-scroll note caps at partial post-settle; scroll note stays missing', () => {
  const stillTraits = makeTraits({ animation_count: 0, scroll_effects: false });
  const cinematicOnly = one({ motion: 'cinematic transitions between scenes' }, stillTraits);
  assert.equal(cinematicOnly.status, 'partial', 'finite entrance choreography cannot be called missing from a post-settle capture');
  assert.match(cinematicOnly.evidence, /post-settle/);
  const scrollNote = one({ motion: 'cinematic scroll choreography' }, stillTraits);
  assert.equal(scrollNote.status, 'missing', 'a scroll-driven promise is measurable post-settle and stays missing');
});

test('mobile source: commented-out animation APIs do not count as present', () => {
  const commented = [
    '// withAnimation(.spring()) { self.offset = 0 }',
    '/* .animation(.easeOut, value: phase) */',
    'struct Hero: View { var body: some View { Text("hi") } }',
  ].join('\n');
  const rows = assessDesignNotesSource({ motion: 'cinematic choreographed motion' }, commented, 'swiftui');
  const motion = rows.find((r) => r.key === 'motion');
  assert.equal(motion.status, 'missing', 'comment-only animation code must not verify a motion note');

  const live = 'struct Hero: View { var body: some View { Text("hi").animation(.spring(), value: phase) } }';
  const rows2 = assessDesignNotesSource({ motion: 'cinematic choreographed motion' }, live, 'swiftui');
  assert.equal(rows2.find((r) => r.key === 'motion').status, 'present');
});

test('screenTraitsFromImage: oversized IHDR dimensions are rejected before decode', async () => {
  // Hand-built PNG header claiming 100000x100000 — must return unknown traits, never decode.
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(100000, 8);
  ihdr.writeUInt32BE(100000, 12);
  const traits = await screenTraitsFromImage(Buffer.concat([sig, ihdr]));
  assert.equal(traits.scheme, 'unknown');
  assert.equal(traits.bg_luminance, null);
});
