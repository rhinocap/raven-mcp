import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = await import(path.resolve(__dirname, '../dist/reference-store.js'));
const blocklist = await import(path.resolve(__dirname, '../dist/reference-blocklist.js'));

function withReferenceHome(run) {
  const previous = process.env.RAVEN_REFERENCE_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'raven-blocklist-'));
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    return run(home);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
}

function capture(overrides = {}) {
  return {
    url: 'https://linear.app/features',
    owner: 'third-party',
    selector: '.hero',
    styles: { color: 'rgb(0, 0, 0)' },
    tags: ['hero'],
    ...overrides,
  };
}

// Mutation proof: delete the refusal in saveReference. Measured, SIX tests go
// red — every capture-path test in this file. That breadth is correct and is
// also why it proves little on its own: the mutant that removes the whole gate
// cannot tell you which test guards which property. The per-property mutants
// below are the ones that carry the weight.
test('a capture from a curated gallery is refused, not quietly stored', () => {
  withReferenceHome(() => {
    assert.throws(
      () => store.saveReference(capture({ url: 'https://mobbin.com/apps/linear' })),
      /mobbin\.com.*curated pattern gallery/is,
    );
    // A refusal that still writes the record is the only outcome worse than no
    // refusal at all — it reads as enforced and is not.
    assert.equal(store.listReferences().total, 0);
  });
});

// The refusal must SAY what to do instead. A blocked host with no route forward
// is an obstacle the user routes around by disabling the check.
//
// Mutation proof: drop `entry.note` from the ReferenceBlockedError message.
// Only this test turns red.
test('the refusal names the live product as the thing to capture instead', () => {
  withReferenceHome(() => {
    assert.throws(
      () => store.saveReference(capture({ url: 'https://dribbble.com/shots/123' })),
      /uploaded image, not a running interface.*Capture from the live product/is,
    );
  });
});

// Subdomain coverage is the whole reason the matcher is passed in rather than
// re-implemented. A takedown at example.com that keeps accepting captures from
// www.example.com reports a site cleared while it is still being captured.
//
// Mutation proof: replace `hostMatches` with `(a, b) => a === b` at the
// saveReference call site. Only this test turns red — every other fixture here
// names the host exactly, which is precisely why this one has to exist.
test('a blocked host covers its subdomains, by the same rule a takedown uses', () => {
  withReferenceHome(() => {
    assert.throws(
      () => store.saveReference(capture({ url: 'https://www.mobbin.com/apps/linear' })),
      /mobbin\.com/i,
    );
    // Both directions, or "block everything" passes: a host that merely ENDS in
    // a blocked host's name is a different site and must still be capturable.
    const ok = store.saveReference(capture({ url: 'https://notmobbin.com/x' }));
    assert.equal(ok.host, 'notmobbin.com');
  });
});

// Mutation proof: make localBlockedHosts return []. Measured — three tests go
// red, this one plus the two below, since all three read the file.
test('a host added to the local list is refused without waiting for a release', () => {
  withReferenceHome((home) => {
    // Capturable first, so the test proves the FILE did it rather than some
    // pre-existing entry — a fixture that was blocked all along measures nothing.
    const before = store.saveReference(capture({ url: 'https://example.com/a' }));
    assert.equal(before.host, 'example.com');
    writeFileSync(path.join(home, 'do-not-capture.json'), JSON.stringify(['example.com']));
    assert.throws(
      () => store.saveReference(capture({ url: 'https://example.com/b' })),
      /example\.com.*do-not-capture list/is,
    );
  });
});

// The list is re-read per capture on purpose. Cached, a host added mid-session
// keeps being captured until the process restarts, which is the one behaviour a
// do-not-capture list must not have.
//
// Mutation proof: memoize localBlockedHosts on first call. It IS caught — but
// measured, it turns exactly the same three tests red as the never-read mutant
// above, so no test in this file SEPARATES "cached" from "never read". That is
// not a hole that can be closed: reading once is a strict subset of the observable
// effects of never reading, so any input that distinguishes them would have to
// pass under never-read, and none does. Both are caught; neither is isolated.
// Stated rather than left implied, because the earlier version of this comment
// claimed isolation it does not have.
test('the local list takes effect within the running session', () => {
  withReferenceHome((home) => {
    writeFileSync(path.join(home, 'do-not-capture.json'), JSON.stringify(['first.example']));
    assert.throws(() => store.saveReference(capture({ url: 'https://first.example/a' })), /first\.example/i);
    writeFileSync(path.join(home, 'do-not-capture.json'), JSON.stringify(['second.example']));
    assert.throws(() => store.saveReference(capture({ url: 'https://second.example/a' })), /second\.example/i);
    // And the removed entry stops blocking, or "the file is append-only in
    // effect" would pass the two assertions above.
    const ok = store.saveReference(capture({ url: 'https://first.example/b' }));
    assert.equal(ok.host, 'first.example');
  });
});

// A corrupt local file must not brick every capture — the inverse failure, and
// the more likely one, since this file is hand-edited.
//
// Mutation proof: remove the try/catch in localBlockedHosts. Only this test
// turns red.
test('an unreadable local list is ignored rather than blocking all captures', () => {
  withReferenceHome((home) => {
    writeFileSync(path.join(home, 'do-not-capture.json'), '{not json');
    const saved = store.saveReference(capture());
    assert.equal(saved.host, 'linear.app');
    assert.deepEqual(blocklist.localBlockedHosts(home), []);
    // A JSON file of the wrong SHAPE is a separate path from unparseable text.
    writeFileSync(path.join(home, 'do-not-capture.json'), JSON.stringify({ hosts: ['x.example'] }));
    assert.deepEqual(blocklist.localBlockedHosts(home), []);
  });
});

// Mutation proof: drop the object branch in localBlockedHosts. Only this test
// turns red.
test('a local entry may carry its own note, and a bare string gets a default', () => {
  withReferenceHome((home) => {
    writeFileSync(path.join(home, 'do-not-capture.json'), JSON.stringify([
      'bare.example',
      { host: 'noted.example', note: 'Requested by the owner on 2026-08-06.' },
    ]));
    const entries = blocklist.localBlockedHosts(home);
    assert.equal(entries.length, 2);
    assert.match(entries[0].note, /do-not-capture\.json/);
    assert.equal(entries[1].note, 'Requested by the owner on 2026-08-06.');
    assert.ok(entries.every((entry) => entry.reason === 'takedown'));
  });
});

// There is deliberately no owner:"self" exemption. A Dribbble shot is a static
// image whoever uploaded it, so capturing your OWN shot records the grid, not
// the pattern.
//
// Mutation proof: add `if (input.owner === "self") skip` ahead of the check.
// Only this test turns red.
test('marking a gallery capture as your own does not exempt it', () => {
  withReferenceHome(() => {
    assert.throws(
      () => store.saveReference(capture({ url: 'https://dribbble.com/shots/1', owner: 'self' })),
      /dribbble\.com/i,
    );
  });
});

// blockedEntryFor has no matching rule of its own — that is the design. If it
// grows one, the blocklist and forget_references can drift, which is the defect
// the takedown leg already shipped once in its preview/action pair.
//
// Mutation proof: make blockedEntryFor ignore its `matches` argument and compare
// with ===. Measured — this test and the subdomain test above. Two is the right
// number: this one pins the contract at the unit, that one pins the consequence
// at the capture path, and a mutant hitting only one of them would mean they had
// come apart.
test('blockedEntryFor delegates matching entirely to the function it is handed', () => {
  const entries = [{ host: 'a.example', reason: 'gallery', note: 'n' }];
  const never = () => false;
  const always = () => true;
  assert.equal(blocklist.blockedEntryFor('a.example', entries, never), null);
  assert.equal(blocklist.blockedEntryFor('totally-unrelated.test', entries, always)?.host, 'a.example');
});

// The policy document names four galleries by name. If one is renamed out of the
// seed list, the document is making a promise the code stopped keeping.
//
// Mutation proof: rename mobbin.com in GALLERY_HOSTS. Measured — three tests go
// red, because two capture fixtures also use that host. Renaming a gallery NOT
// used as a fixture (refero.design, screensdesign.com, clickyhq.com) turns only
// this one red, which is the case this test exists for.
test('every gallery the policy names by name is actually in the seed list', () => {
  const hosts = new Set(blocklist.BLOCKED_HOSTS.map((entry) => entry.host));
  for (const named of ['mobbin.com', 'refero.design', 'screensdesign.com', 'clickyhq.com']) {
    assert.ok(hosts.has(named), named + ' is named in docs/PATTERN-LIBRARY-POLICY.md');
  }
  assert.ok(
    blocklist.BLOCKED_HOSTS.every((entry) => entry.note && entry.note.trim()),
    'a blocked host with no note gives the user nowhere to go',
  );
});

// Mutation proof: remove TAKEDOWN_URL from THIRD_PARTY_NOTICE. Only this test
// turns red.
test('the third-party notice carries the takedown route, not just the warning', () => {
  withReferenceHome(() => {
    const saved = store.saveReference(capture());
    const attribution = store.referenceAttribution(saved);
    assert.match(attribution.notice, /github\.com\/rhinocap\/raven-mcp\/issues/);
    // And it stays off the user's own captures, for the reason the notice
    // itself exists: one attached to everything is one nobody reads.
    const own = store.saveReference(capture({ url: 'https://example.test/x', owner: 'self' }));
    assert.equal(store.referenceAttribution(own).notice, undefined);
  });
});
