import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const taxonomy = await import(path.resolve(__dirname, '../dist/reference-taxonomy.js'));

// Mutation proof: remove "scroll indicator" from scroll-cue.aliases. Only this
// test turns red.
test('scroll cue and hero intent expand to their human aliases', () => {
  const expanded = taxonomy.expandQuery('Scroll cue, in a HERO!');
  assert.ok(expanded.includes('scroll indicator'));
  assert.ok(expanded.includes('hero image'));
});

// The first version of this file asserted the OPPOSITE — that "in" and "a"
// survive expansion — and passed, because that is what the code did. It is the
// defect, not the property: search matches every expanded term against the
// record's fields, so a term of "a" makes every query match the whole corpus.
//
// Mutation proof: delete the stop-word filter in expandQuery. Measured — this
// test AND 'an intent query discriminates instead of matching the whole corpus'
// in reference-store.test.mjs go red, and nothing else. Two is correct here and
// not a sign of an over-broad test: this file measures the term list, that one
// measures the search result the term list produces, and a mutant that broke
// only one of them would mean the two files had drifted apart.
test('stop words never survive expansion as searchable terms', () => {
  const expanded = taxonomy.expandQuery('scroll cue in a hero');
  assert.equal(expanded.includes('in'), false, '"in" is a substring of "pricing"');
  assert.equal(expanded.includes('a'), false, '"a" is a substring of almost any note');
  // The real terms must survive the filter that removes the connectors.
  assert.ok(expanded.includes('scroll cue'));
  assert.ok(expanded.includes('hero'));
});

// A stop word INSIDE a recognized alias is part of an atomic phrase and must not
// be stripped — phrase matching runs against the RAW words, so the alias is
// consumed whole and its constituents are never re-tested.
//
// The first version of this test used "cmd k menu", which contains no stop word
// at all — it asserted the property against an input that could not exercise it
// and passed under every mutant. Only three aliases in the taxonomy carry a real
// stop word; this is one of them, and the fixture asserts that rather than
// assuming it, because the day someone rewords the alias the test must go red
// rather than quietly stop measuring.
//
// Mutation proof: filter stop words out of `words` in expandQuery before phrase
// matching. Only this test turns red.
test('a stop word inside a recognized alias is not stripped from it', () => {
  const entry = taxonomy.PATTERN_TAXONOMY.find((e) => e.id === 'social-login');
  assert.ok(entry, 'social-login entry exists');
  assert.ok(entry.aliases.includes('sign in with google'));
  assert.equal(taxonomy.isStopWord('in'), true, 'the fixture carries a stop word');
  assert.equal(taxonomy.isStopWord('with'), true, 'the fixture carries a stop word');
  const expanded = taxonomy.expandQuery('sign in with google');
  assert.ok(expanded.includes('sign in with google'), 'the phrase survives intact');
  assert.ok(expanded.includes('social login'), 'and resolves to its entry');
});

// Mutation proof: change `QUERY_STOP_WORDS.has` to always return false. Four
// tests go red, measured — this one, both tests above, and the store's
// discrimination test. That breadth is the point: isStopWord is consumed at
// three separate seams (expansion, phrase matching, and the store's exact-term
// list), so a mutant here is the only one that reaches all of them, and a
// narrower blast radius would mean a seam had stopped consulting it.
test('isStopWord covers the connectors that produced the corpus-wide match', () => {
  for (const word of ['in', 'a', 'the', 'of', 'with', 'show', 'me']) {
    assert.equal(taxonomy.isStopWord(word), true, word + ' is a stop word');
  }
  for (const word of ['scroll', 'hero', 'nav', 'cue', 'pricing']) {
    assert.equal(taxonomy.isStopWord(word), false, word + ' carries intent');
  }
});
