// Attribution for a corpus of other people's work.
//
// Raven does not own the patterns it stores. The provenance was always recorded,
// but a caller could take the picture and drop the source, and nothing stopped
// it. These tests pin the two things that make that hard: a ready-to-display
// credit rather than parts a caller has to assemble, and — the structural half —
// the image path nested underneath the credit, so the picture cannot be reached
// without carrying the attribution out with it.
//
// A test here that only checks "the credit string contains the host" is nearly
// worthless: it passes on any format. What each test actually pins is named in
// its own comment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = await import(path.resolve(__dirname, '../dist/reference-store.js'));

function withReferenceHome(run) {
  const previous = process.env.RAVEN_REFERENCE_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'raven-attrib-'));
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    return run(home);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
}

function reference(overrides = {}) {
  return {
    ref_id: 'ref_test',
    url: 'https://linear.app/pricing',
    host: 'linear.app',
    owner: 'third-party',
    selector: '.hero',
    styles: {},
    tags: [],
    captured_at: '2026-08-05T10:00:00.000Z',
    raven_version: '2.3.0',
    ...overrides
  };
}

test('a third-party credit names the source URL, not just the host', () => {
  // The host alone is not attribution — "linear.app" does not tell anyone which
  // page, and the URL is the thing a reader can actually follow back. A credit
  // built from the host only would satisfy any looser assertion.
  const attribution = store.referenceAttribution(reference());
  assert.ok(attribution.credit.includes('https://linear.app/pricing'),
    'the credit does not carry the source URL: ' + attribution.credit);
  assert.equal(attribution.source_url, 'https://linear.app/pricing');
  assert.equal(attribution.host, 'linear.app');
});

test('the app name is used when the record has one, and not invented when it does not', () => {
  const named = store.referenceAttribution(reference({ app: 'Linear' }));
  assert.ok(named.credit.includes('Linear'), named.credit);
  assert.ok(named.credit.includes('linear.app'),
    'the app name must not replace the host — the host is the verifiable part: ' + named.credit);

  const unnamed = store.referenceAttribution(reference());
  assert.ok(!/undefined|null|\(\)/.test(unnamed.credit),
    'a record with no app produced a malformed credit: ' + unnamed.credit);
});

test('only third-party records carry the ownership notice', () => {
  // A notice attached to everything is a notice nobody reads, and the user's own
  // product needs no disclaimer. Both directions matter: dropping the notice
  // entirely and attaching it to everything are equally wrong, and a test that
  // only checked the third-party case would pass on the second.
  const third = store.referenceAttribution(reference());
  assert.equal(third.notice, store.THIRD_PARTY_NOTICE);
  assert.ok(/does not|not to Raven|belongs to/i.test(third.notice),
    'the notice does not actually disclaim ownership: ' + third.notice);

  const own = store.referenceAttribution(reference({ owner: 'self', host: 'myapp.com', url: 'https://myapp.com/' }));
  assert.equal(own.notice, undefined, 'the user\'s own pattern was given a third-party disclaimer');
  assert.equal(own.owner, 'self');
});

test('attribution comes off the stored record, so it survives a reload', () => {
  // Not a round-trip formality: if attribution were computed at capture time and
  // stored as a string, a corpus copied between machines or migrated between
  // versions would carry stale credits. It is derived on read, from fields the
  // record already holds.
  withReferenceHome(() => {
    const saved = store.saveReference({
      url: 'https://stripe.com/pricing',
      app: 'Stripe',
      owner: 'third-party',
      selector: '.PricingTable',
      styles: { color: 'rgb(0, 0, 0)' },
      tags: ['pricing']
    });
    const reloaded = store.getReference(saved.ref_id);
    const attribution = store.referenceAttribution(reloaded);
    assert.equal(attribution.source_url, 'https://stripe.com/pricing');
    assert.equal(attribution.captured_at, reloaded.captured_at);
    assert.ok(attribution.credit.includes('Stripe'), attribution.credit);
    assert.equal(attribution.notice, store.THIRD_PARTY_NOTICE);
    // Nothing about the attribution was written into the record itself.
    assert.equal(reloaded.credit, undefined);
    assert.equal(reloaded.notice, undefined);
  });
});
