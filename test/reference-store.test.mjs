import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const referenceStore = await import(path.resolve(__dirname, '../dist/reference-store.js'));

function withReferenceHome(run) {
  const previous = process.env.RAVEN_REFERENCE_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'raven-reference-'));
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    return run(home);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
}

function input(overrides = {}) {
  return {
    url: 'https://linear.app/features',
    app: 'Linear',
    owner: 'third-party',
    selector: '.hero > button',
    html: '<button>Start</button>',
    rect: { x: 10, y: 20, width: 120, height: 40 },
    styles: { color: 'rgb(0, 0, 0)', display: 'flex' },
    state_styles: { hover: { color: 'rgb(255, 255, 255)', background: 'black' } },
    note: 'I like the restrained hover treatment.',
    tags: [' Hero ', 'Button', 'hero'],
    ...overrides,
  };
}

test('save and get round-trip every captured field', () => {
  withReferenceHome(() => {
    const saved = referenceStore.saveReference(input());
    assert.deepEqual(referenceStore.getReference(saved.ref_id), saved);
    assert.equal(saved.host, 'linear.app');
    assert.deepEqual(saved.tags, ['hero', 'button']);
    assert.deepEqual(saved.state_styles, {
      hover: { color: 'rgb(255, 255, 255)', background: 'black' },
    });
    assert.match(saved.captured_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof saved.raven_version, 'string');
  });
});

test('two saves of the same URL and selector receive unique ids', () => {
  withReferenceHome(() => {
    const first = referenceStore.saveReference(input());
    const second = referenceStore.saveReference(input());
    assert.notEqual(first.ref_id, second.ref_id);
    assert.equal(referenceStore.listReferences().total, 2);
    assert.deepEqual(referenceStore.getReference(first.ref_id), first);
    assert.deepEqual(referenceStore.getReference(second.ref_id), second);
  });
});

test('html is truncated only above 8000 characters', () => {
  withReferenceHome(() => {
    const long = referenceStore.saveReference(input({ html: 'x'.repeat(20000) }));
    const short = referenceStore.saveReference(input({ html: 'y'.repeat(100) }));
    assert.equal(long.html.length, 8000);
    assert.equal(long.html_truncated, true);
    assert.equal(short.html, 'y'.repeat(100));
    assert.notEqual(short.html_truncated, true);
  });
});

test('styles over 200 properties are rejected with the count', () => {
  withReferenceHome(() => {
    const styles = Object.fromEntries(Array.from({ length: 201 }, (_, index) => ['prop-' + index, 'value']));
    assert.throws(() => referenceStore.saveReference(input({ styles })), /201/);
    assert.equal(referenceStore.listReferences().total, 0);
  });
});

test('search includes the positive control and excludes the negative control', () => {
  withReferenceHome(() => {
    const target = referenceStore.saveReference(input({ note: 'The command palette is unusually calm.' }));
    const negative = referenceStore.saveReference(input({
      url: 'https://example.com/dashboard',
      app: 'Example',
      selector: '.account-table',
      note: 'Dense account data.',
      tags: ['table'],
    }));
    const result = referenceStore.searchReferences({ query: 'command palette' });
    assert.deepEqual(result.results.map((item) => item.reference.ref_id), [target.ref_id]);
    assert.equal(result.results.some((item) => item.reference.ref_id === negative.ref_id), false);
    assert.equal(result.results[0].score, 4);
    assert.match(result.results[0].why, /note/i);
  });
});

test('tag and host filters compose with AND semantics', () => {
  withReferenceHome(() => {
    const both = referenceStore.saveReference(input({ tags: ['navigation'] }));
    referenceStore.saveReference(input({ url: 'https://example.com/', tags: ['navigation'] }));
    referenceStore.saveReference(input({ tags: ['footer'] }));
    const result = referenceStore.searchReferences({ host: 'LINEAR.APP', tags: [' Navigation '] });
    assert.deepEqual(result.results.map((item) => item.reference.ref_id), [both.ref_id]);
  });
});

test('a corrupt record is skipped without hiding good records', () => {
  withReferenceHome((home) => {
    const good = referenceStore.saveReference(input());
    writeFileSync(path.join(home, 'broken.json'), '{', 'utf8');
    writeFileSync(path.join(home, 'invalid-shape.json'), '{}', 'utf8');
    writeFileSync(path.join(home, 'mismatch.json'), JSON.stringify({ ...good, ref_id: 'different' }), 'utf8');
    writeFileSync(path.join(home, 'tags.json'), JSON.stringify({ ...good, ref_id: 'tags', tags: [' Hero '] }), 'utf8');
    const result = referenceStore.listReferences();
    assert.deepEqual(result.references.map((reference) => reference.ref_id), [good.ref_id]);
    assert.deepEqual(result.skipped, ['broken.json', 'invalid-shape.json', 'mismatch.json', 'tags.json']);
  });
});

test('equal-scoring search results keep deterministic order across calls', () => {
  withReferenceHome(() => {
    referenceStore.saveReference(input({ selector: '.shared first', note: undefined, app: undefined, tags: [] }));
    referenceStore.saveReference(input({ selector: '.shared second', note: undefined, app: undefined, tags: [] }));
    const first = referenceStore.searchReferences({ query: 'shared' });
    const second = referenceStore.searchReferences({ query: 'shared' });
    assert.equal(first.results.length, 2);
    assert.deepEqual(
      first.results.map((item) => item.reference.ref_id),
      second.results.map((item) => item.reference.ref_id),
    );
  });
});

// Mutation proof: remove "mouse wheel icon" from scroll-cue.aliases in
// dist/reference-taxonomy.js. Only this test turns red in this file.
test('scroll cue in a hero finds a record tagged only mouse wheel icon', () => {
  withReferenceHome(() => {
    const target = referenceStore.saveReference(input({
      note: undefined,
      app: undefined,
      selector: '.wheel-symbol',
      tags: ['mouse wheel icon'],
    }));
    const result = referenceStore.searchReferences({ query: 'scroll cue in a hero' });
    assert.deepEqual(result.results.map((item) => item.reference.ref_id), [target.ref_id]);
    const naturalLanguage = referenceStore.searchReferences({ query: 'examples of a scrolling mouse icon in a hero image from around the web' });
    assert.deepEqual(naturalLanguage.results.map((item) => item.reference.ref_id), [target.ref_id]);
  });
});

// The test above cannot see an over-matching search, because a ONE-record
// corpus returns "1 of 1" whether the query discriminated or matched everything.
// It passed against the shipped defect for exactly that reason.
//
// Measured before the fix on this three-record fixture: "scroll cue in a hero"
// matched 3 of 3 and ranked `.pricing-table` at 7.0 ABOVE `.wheel-symbol` at
// 6.9 — "in" is a substring of "pricing", "a" of "annual", both scoring as
// exact hits at full weight, while the one correct record reached its tag
// through an alias and paid the 0.1 penalty. The alias penalty was demoting the
// right answer beneath noise.
//
// TWO mutants are needed, because the stop-word filter lives at two independent
// seams and either one alone reproduces the defect: (a) the filter in
// expandQuery, (b) the filter in originalQueryTerms. Each turns this test red on
// its own — measured.
//
// An earlier version of this comment named the fieldMatchesTerm revert as the
// second half. Measured, and it is FALSE: with stop words gone, `.includes` on
// "scroll cue" and "hero" reaches neither the pricing record nor the footer, so
// that mutant leaves this test green and turns only its own word-start test red.
// The two fixes are independent, not two halves of one — the substring bug is
// what makes "cue" hit "rescue", and no query in this fixture exercises it.
// A mutation claim is falsifiable exactly like an assertion; this one was wrong.
test('an intent query discriminates instead of matching the whole corpus', () => {
  withReferenceHome(() => {
    const cue = referenceStore.saveReference(input({
      url: 'https://stripe.com/x', app: undefined, selector: '.wheel-symbol',
      tags: ['mouse wheel icon'], note: 'animated scroll hint at the bottom',
    }));
    referenceStore.saveReference(input({
      url: 'https://figma.com/y', app: undefined, selector: '.pricing-table',
      tags: ['pricing'], note: 'annual toggle saves money',
    }));
    referenceStore.saveReference(input({
      url: 'https://linear.app/z', app: undefined, selector: '.footer-legal',
      tags: ['footer'], note: 'tiny legal print',
    }));

    const result = referenceStore.searchReferences({ query: 'scroll cue in a hero' });
    assert.equal(result.corpus_size, 3, 'fixture must hold three records to be able to discriminate');
    assert.equal(result.total, 1, 'the pricing table and the footer must not match');
    assert.equal(result.results[0].reference.ref_id, cue.ref_id);
  });
});

// A term must not match letters sitting inside an unrelated word. This is the
// half of the fix that stop words alone do NOT cover: "cue" is not a stop word,
// and under raw substring matching it hits "rescue".
//
// Mutation proof: revert fieldMatchesTerm to `field.includes(term)`. Only this
// test turns red.
test('a term matches at a word start, not anywhere inside a word', () => {
  withReferenceHome(() => {
    referenceStore.saveReference(input({
      app: undefined, selector: '.rescue-banner', tags: ['rescue'],
      note: 'account rescue flow',
    }));
    assert.equal(referenceStore.searchReferences({ query: 'cue' }).total, 0, '"cue" must not match "rescue"');
    // The prefix half stays deliberately loose so a searcher's word still finds
    // an inflected note.
    assert.equal(referenceStore.searchReferences({ query: 'rescu' }).total, 1, 'a word-start prefix still matches');
  });
});

// This asserted `total === 0` when the constituent words were DISCARDED. That
// bought precision with a recall cliff — see partialQueryTerms. The property it
// was actually reaching for is RANK: a record matching the whole phrase must
// beat one carrying a single word of it. That is now what is measured, and it
// is the stronger claim, because exclusion is satisfied by a search that finds
// nothing at all.
//
// Mutation proof: change the partial penalty in weightedMatch from 0.5 to 0.
// Only this test turns red.
test('a phrase outranks a record carrying one word of it alone', () => {
  withReferenceHome(() => {
    // Both selectors are inert to this query and neither record has a note or
    // app name, so the ONLY field in play is tags — otherwise the fragment
    // picks up a second partial hit on its own selector and ties the score.
    const whole = referenceStore.saveReference(input({
      note: undefined, app: undefined, selector: '.alpha', tags: ['scroll down arrow'],
    }));
    const fragment = referenceStore.saveReference(input({
      note: undefined, app: undefined, selector: '.beta', tags: ['arrow'],
    }));
    const result = referenceStore.searchReferences({ query: 'scroll down arrow' });
    const ranked = result.results.map((item) => item.reference.ref_id);
    assert.equal(ranked[0], whole.ref_id, 'the full phrase match ranks first');
    assert.ok(ranked.includes(fragment.ref_id), 'the fragment is still findable, just below');
    const wholeScore = result.results.find((r) => r.reference.ref_id === whole.ref_id).score;
    const fragmentScore = result.results.find((r) => r.reference.ref_id === fragment.ref_id).score;
    assert.ok(wholeScore > fragmentScore, `${wholeScore} must beat ${fragmentScore}`);
  });
});

// The recall cliff itself, pinned. Measured before partialQueryTerms existed:
// "pricing" found the record, "toggle" found the record, and "pricing toggle"
// found NOTHING — because the phrase is a taxonomy entry, was consumed
// atomically, and no record was bound to it.
//
// Mutation proof: make partialQueryTerms return []. Measured — this test AND
// the ranking test above go red, because discarding the held-back words removes
// the fragment record from the result set entirely instead of ranking it below.
// That is why the ranking test's own proof is the PENALTY mutant (0.5 → 0),
// which is the one that isolates rank from presence.
test('adding a word to a query does not delete every result', () => {
  withReferenceHome(() => {
    referenceStore.saveReference(input({
      app: undefined, selector: '.pricing-table', tags: ['pricing'],
      note: 'annual toggle saves money',
    }));
    assert.equal(referenceStore.searchReferences({ query: 'pricing' }).total, 1);
    assert.equal(referenceStore.searchReferences({ query: 'toggle' }).total, 1);
    assert.equal(
      referenceStore.searchReferences({ query: 'pricing toggle' }).total, 1,
      'the more specific query must not return fewer results than either word alone',
    );
  });
});

// Mutation proof: change the alias penalty in weightedMatch from 0.1 to 0 in
// dist/reference-store.js. Only this test turns red.
test('an exact term outranks an alias on the same field', () => {
  withReferenceHome(() => {
    const alias = referenceStore.saveReference(input({ note: undefined, app: undefined, selector: '.alias', tags: ['command menu'] }));
    const exact = referenceStore.saveReference(input({ note: undefined, app: undefined, selector: '.exact', tags: ['command palette'] }));
    const result = referenceStore.searchReferences({ query: 'command palette' });
    assert.deepEqual(result.results.map((item) => item.reference.ref_id), [exact.ref_id, alias.ref_id]);
    assert.equal(result.results[0].score, 2);
    assert.equal(result.results[1].score, 1.9);
  });
});

// Mutation proof: replace "Near matches:" with "Known ids:" in the unknown-id
// error in dist/reference-store.js. Only this test turns red.
test('an unknown taxonomy id is rejected with the id and near matches', () => {
  withReferenceHome(() => {
    assert.throws(
      () => referenceStore.saveReference(input({ taxonomy: ['sticky-navigation'] })),
      /sticky-navigation.*Near matches:.*sticky-nav/i,
    );
    assert.equal(referenceStore.listReferences().total, 0);
  });
});

// Mutation proof: always write taxonomy=[] when it was omitted in
// dist/reference-store.js. Only this compatibility test turns red.
test('a pre-existing record with no taxonomy still searches and returns', () => {
  withReferenceHome(() => {
    const legacy = referenceStore.saveReference(input({ note: 'A legacy pattern.', taxonomy: undefined }));
    assert.equal(Object.hasOwn(legacy, 'taxonomy'), false);
    const result = referenceStore.searchReferences({ query: 'legacy pattern' });
    assert.deepEqual(result.results.map((item) => item.reference.ref_id), [legacy.ref_id]);
  });
});

// Mutation proof: make matchReason always return field in
// dist/reference-store.js. Only this test turns red.
test('why distinguishes literal and alias matches', () => {
  withReferenceHome(() => {
    referenceStore.saveReference(input({ note: undefined, app: undefined, selector: '.literal', tags: ['hero'] }));
    referenceStore.saveReference(input({ note: undefined, app: undefined, selector: '.alias', tags: ['masthead'] }));
    const result = referenceStore.searchReferences({ query: 'hero' });
    const literal = result.results.find((item) => item.reference.tags.includes('hero'));
    const alias = result.results.find((item) => item.reference.tags.includes('masthead'));
    assert.equal(literal.why, 'Matched tags.');
    assert.equal(alias.why, 'Matched tags via alias "masthead".');
  });
});

// Mutation proof: remove the taxonomy concat from the tag field in
// dist/reference-store.js. Only this test turns red.
test('bound taxonomy ids search at the tags weight and round-trip', () => {
  withReferenceHome(() => {
    const saved = referenceStore.saveReference(input({ note: undefined, app: undefined, selector: '.cue', tags: [], taxonomy: ['scroll-cue', 'hero'] }));
    assert.deepEqual(saved.taxonomy, ['scroll-cue', 'hero']);
    const result = referenceStore.searchReferences({ query: 'hero image' });
    assert.deepEqual(result.results.map((item) => item.reference.ref_id), [saved.ref_id]);
    assert.ok(result.results[0].score > 1 && result.results[0].score <= 2);
  });
});

test('non-http URLs are rejected', () => {
  withReferenceHome(() => {
    assert.throws(() => referenceStore.saveReference(input({ url: 'file:///tmp/pattern.html' })), /http:.*https:|http: or https:/);
    assert.equal(referenceStore.listReferences().total, 0);
  });
});

test('a corrupt index is rebuilt from the record files instead of blocking every capture', () => {
  // listReferences already recovered by scanning record files, but saveReference
  // called the throwing readIndex first — so one half-written index meant the
  // store could never accept another capture. It has to self-heal.
  withReferenceHome((home) => {
    const first = referenceStore.saveReference(input());
    writeFileSync(path.join(home, 'index.json'), '{"version":1,"ref_ids":[', 'utf8');

    const second = referenceStore.saveReference(input({ note: 'after the corruption' }));
    assert.ok(second.ref_id);

    const listed = referenceStore.listReferences();
    assert.equal(listed.skipped.length, 0, 'the repaired index must not leave the store in a degraded read');
    const ids = listed.references.map((reference) => reference.ref_id).sort();
    assert.deepEqual(ids, [first.ref_id, second.ref_id].sort());
  });
});

test('the corrupt index is kept for diagnosis rather than overwritten silently', () => {
  withReferenceHome((home) => {
    referenceStore.saveReference(input());
    writeFileSync(path.join(home, 'index.json'), 'not json at all', 'utf8');
    referenceStore.saveReference(input({ note: 'second' }));
    const preserved = readdirSync(home).filter((file) => file.startsWith('index.corrupt-'));
    assert.equal(preserved.length, 1);
  });
});

// The corpus now keeps a PNG beside every imaged record, in the SAME directory
// the index is rebuilt from. The rebuild takes its ref_ids off the filenames, so
// the `.json` filter is the only thing stopping every thumbnail from becoming a
// phantom id: `ref_x.png` would enter the index as `ref_x.png`, fail the id
// pattern or fail to read as a record, and turn one corruption into a store
// where every search is half skipped[]. Loosen that filter to `!index*` and this
// is the test that goes red.
test('rebuilding the index ignores the thumbnails sitting beside the records', () => {
  withReferenceHome((home) => {
    const first = referenceStore.saveReference(input());
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const imaged = referenceStore.attachReferenceImage(first.ref_id, png, { width: 40, height: 20 });
    assert.ok(imaged.image, 'the fixture never attached an image, so this measures nothing');

    writeFileSync(path.join(home, 'index.json'), '{"version":1,"ref_ids":[', 'utf8');
    const second = referenceStore.saveReference(input({ note: 'after the corruption' }));

    const listed = referenceStore.listReferences();
    assert.deepEqual(listed.skipped, [], 'a thumbnail was read as a record');
    assert.deepEqual(listed.references.map((reference) => reference.ref_id).sort(),
      [first.ref_id, second.ref_id].sort());
    // …and the picture survived the rebuild, or the corpus silently stops being
    // pickable the first time an index is repaired.
    const recovered = listed.references.find((reference) => reference.ref_id === first.ref_id);
    assert.deepEqual(recovered.image, imaged.image);
  });
});

// Sol round 2, defect #12. Capture self-healed a corrupt index; delete still
// called the throwing readIndex first, so the one operation you reach for to
// clean up a broken store was the one the broken store refused.
test('a corrupt index does not stop you deleting a reference', () => {
  withReferenceHome((home) => {
    const first = referenceStore.saveReference(input());
    const second = referenceStore.saveReference(input({ note: 'keep me' }));
    writeFileSync(path.join(home, 'index.json'), '{"version":1,"ref_ids":[', 'utf8');

    assert.equal(referenceStore.deleteReference(first.ref_id), true);

    const listed = referenceStore.listReferences();
    assert.equal(listed.skipped.length, 0);
    assert.deepEqual(listed.references.map((reference) => reference.ref_id), [second.ref_id]);
  });
});

// A zero-result search is where this feature dead-ends for the person it was
// built for: they asked for "a scrolling mouse cue in a hero", got nothing, and
// cannot tell an empty corpus from a missed query. The vocabulary answers the
// second case with words the corpus can actually honour.
//
// Mutation proof: return a fixed id list from corpusVocabulary instead of the
// ids present. Measured — BOTH this test and the round-trip test below turn red.
// I predicted one and was wrong: this test deepEquals the exact list, so it
// catches a wrong list as readily as a wrong RULE. Which means it is the
// round-trip test that carries the design decision, not this one — widen this
// assertion to a superset check and the mutant survives here while the
// round-trip test still kills it.
test('a zero-result search reports what the corpus can answer to', () => {
  withReferenceHome(() => {
    referenceStore.saveReference(input({
      url: 'https://linear.app/x', note: undefined, tags: ['hero'], taxonomy: ['hero'],
    }));
    referenceStore.saveReference(input({
      url: 'https://stripe.com/y', note: undefined, tags: ['nav'], taxonomy: ['top-nav'],
    }));
    const miss = referenceStore.searchReferences({ query: 'quantum harmonica' });
    assert.equal(miss.total, 0);
    assert.equal(miss.corpus_size, 2);
    assert.deepEqual(miss.vocabulary.taxonomy, ['hero', 'top-nav']);
    assert.deepEqual(miss.vocabulary.hosts, ['linear.app', 'stripe.com']);
    assert.ok(miss.vocabulary.tags.includes('hero') && miss.vocabulary.tags.includes('nav'));
  });
});

// The property that makes the vocabulary worth printing, and the only one that
// separates it from handing back the 36-id taxonomy: every value in it returns
// something. A suggestion list containing a term that matches nothing is worse
// than no suggestion, because the caller spends a round-trip proving it.
test('every term the vocabulary suggests actually returns a record', () => {
  withReferenceHome(() => {
    referenceStore.saveReference(input({
      url: 'https://linear.app/x', note: undefined, tags: ['hero'], taxonomy: ['hero'],
    }));
    referenceStore.saveReference(input({
      url: 'https://stripe.com/y', note: undefined, tags: ['nav'], taxonomy: ['top-nav'],
    }));
    const vocabulary = referenceStore.searchReferences({ query: 'quantum harmonica' }).vocabulary;
    for (const id of vocabulary.taxonomy) {
      assert.ok(referenceStore.searchReferences({ query: id }).total > 0, `taxonomy id "${id}" returns nothing`);
    }
    for (const host of vocabulary.hosts) {
      assert.ok(referenceStore.searchReferences({ host }).total > 0, `host "${host}" returns nothing`);
    }
    for (const tag of vocabulary.tags) {
      assert.ok(referenceStore.searchReferences({ query: tag }).total > 0, `tag "${tag}" returns nothing`);
    }
  });
});

// Both omissions are deliberate and are different from each other. With hits,
// the results ARE the answer and a vocabulary beside them is noise. With an
// empty corpus there is no vocabulary to report, and an empty object would read
// as "the corpus has nothing to say about this" when the true answer is "capture
// something first" — a distinction the tool seam turns into two sentences.
//
// Mutation proof: drop either half of the guard. Measured — EACH half turns
// only this test red, and no other test in the file moves. I predicted the
// has-hits half would also take the two tests above with it; it does not, and
// the reason is worth keeping: both of those assert on a MISS, where the
// vocabulary is present under the mutant and under the fix alike. A test that
// exercises the true branch of a guard can never see the false branch go wrong,
// however thoroughly it exercises it — which is the entire reason this test
// exists separately rather than being folded into them.
test('the vocabulary is omitted when there are hits, and when there is no corpus', () => {
  withReferenceHome(() => {
    assert.equal(referenceStore.searchReferences({ query: 'anything' }).vocabulary, undefined);
    referenceStore.saveReference(input({ tags: ['hero'], taxonomy: ['hero'] }));
    const hit = referenceStore.searchReferences({ query: 'hero' });
    assert.ok(hit.total > 0);
    assert.equal(hit.vocabulary, undefined);
  });
});
