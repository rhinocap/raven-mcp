import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// saveReference checks the blocklist at ENTRY (so a blocked host is refused for
// being blocked, not incidentally by a later validation) and again immediately
// before the write — a host added to the local file between those two points
// would otherwise be stored by a call that began before the entry landed. This
// test induces exactly that mid-call change: a process.env Proxy hands the
// entry check the real home (no blocklist file) and every later read a decoy
// home whose do-not-capture.json blocks the captured host. The env var is the
// only injectable seam — fs monkeypatching is invisible to ESM named imports
// (measured) — and the re-check recomputes the home freshly on purpose, which
// is both what a re-check means and what makes this test able to fire.
//
// The anchoring assumption, stated: the FIRST read of RAVEN_REFERENCE_HOME
// inside saveReference is the entry check's. If an earlier env read appears,
// the entry check would see the decoy and refuse, and this test would pass
// while measuring the entry check twice — the reads>=2 self-check below cannot
// catch that, so revisit this fixture if saveReference grows an env read ahead
// of the entry check.
//
// Mutation proof: delete the pre-write re-check block in saveReference,
// dist/reference-store.js. Only this test turns red (measured) — the record
// lands in the decoy home and the throws assertion fails.
test('a host added to the do-not-capture list mid-call is refused before the write', () => {
  const realHome = mkdtempSync(path.join(tmpdir(), 'raven-blocklist-real-'));
  const decoyHome = mkdtempSync(path.join(tmpdir(), 'raven-blocklist-decoy-'));
  try {
    writeFileSync(path.join(decoyHome, 'do-not-capture.json'), JSON.stringify(['linear.app']));
    const previousEnv = process.env;
    const state = { reads: 0 };
    process.env = new Proxy({ ...previousEnv, RAVEN_REFERENCE_HOME: realHome }, {
      get(target, prop, receiver) {
        if (prop === 'RAVEN_REFERENCE_HOME') {
          state.reads += 1;
          return state.reads === 1 ? realHome : decoyHome;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    try {
      assert.throws(
        () => store.saveReference(capture()),
        /linear\.app.*do-not-capture list/is,
      );
    } finally {
      process.env = previousEnv;
    }
    // Self-check: the refusal above can only have come from the pre-write
    // re-check, because the entry check read the REAL home, which has no
    // blocklist file. A single read means the proxy never switched and the
    // fixture measured the entry check, not the re-check.
    assert.ok(state.reads >= 2, 'saveReference read RAVEN_REFERENCE_HOME only once — the pre-write re-check never ran');
    const recordFiles = (dir) => readdirSync(dir).filter(
      (name) => name.endsWith('.json') && name !== 'do-not-capture.json' && name !== 'index.json',
    );
    // The refusal must also have STOPPED the write, in whichever home it would
    // have landed — a refusal that still writes the record reads as enforced
    // and is not.
    assert.deepEqual(recordFiles(realHome), []);
    assert.deepEqual(recordFiles(decoyHome), []);
  } finally {
    rmSync(realHome, { recursive: true, force: true });
    rmSync(decoyHome, { recursive: true, force: true });
  }
});

// A corrupt local file must not brick every capture — the inverse failure, and
// the more likely one, since this file is hand-edited.
//
// Mutation proof (measured — an earlier version of this comment claimed "only
// this test turns red" from reading the source, and was wrong by 74×): removing
// the try/catch outright fails 74 tests across the suite, because the catch also
// covers readFileSync's ENOENT and every test's temp reference home lacks
// do-not-capture.json — that mutant makes EVERY saveReference throw, so it
// proves the catch exists, not that this test guards it. The mutant that
// isolates THIS test's mechanism keeps the ENOENT return and rethrows the rest
// (`if (_error.code === "ENOENT") return []; throw _error;`): measured, exactly
// this test turns red and nothing else.
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

// The test above only exercises unparseable JSON — a SyntaxError. A mutant that
// narrows the catch to parse failures would pass it and still brick every
// capture on a permission-denied file, which is at least as likely a hand-edit
// mistake as malformed JSON.
//
// Guard: root bypasses Unix file-mode checks entirely, so the fixture's own
// precondition — that readFileSync actually throws EACCES — is asserted BEFORE
// the property under test, and the root case skips loudly rather than passing
// vacuously.
//
// Mutation proof, both measured, and the first is a lesson in what a wide
// radius proves: narrowing the catch to `if (error instanceof SyntaxError)
// return []; throw error;` fails **81 tests**, because that mutant also
// rethrows ENOENT and every test's temp home lacks do-not-capture.json — it
// proves the catch covers more than parse errors, not that this test guards
// anything. The isolating mutant keeps ENOENT and parse errors silent and
// rethrows only the rest (`if (error.code === "ENOENT" || error instanceof
// SyntaxError) return []; throw error;` — exactly the refactor this test
// exists to catch): measured, exactly this test turns red and nothing else.
test('an unreadable-by-permission local list is ignored rather than blocking all captures', (t) => {
  withReferenceHome((home) => {
    const file = path.join(home, 'do-not-capture.json');
    writeFileSync(file, JSON.stringify(['example.com']));
    chmodSync(file, 0o000);
    try {
      if (process.getuid && process.getuid() === 0) {
        t.skip('running as root — a 0o000 file never throws EACCES here, so this test cannot exercise the path it exists for');
        return;
      }
      let threwEacces = false;
      try {
        readFileSync(file, 'utf8');
      } catch (error) {
        threwEacces = error.code === 'EACCES';
      }
      assert.ok(threwEacces, 'fixture did not reproduce EACCES on a chmod 0o000 file — this filesystem does not enforce mode bits, and the test measures nothing on it');

      const saved = store.saveReference(capture());
      assert.equal(saved.host, 'linear.app');
      assert.deepEqual(blocklist.localBlockedHosts(home), []);
    } finally {
      chmodSync(file, 0o600); // restore before withReferenceHome's rmSync cleanup
    }
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

// Gallery name -> host, transcribed by hand from GALLERY_HOSTS. If the policy
// sentence grows a name this map lacks, the test throws naming the orphan —
// that IS the point: a gallery the document promises to refuse, with no
// code-side host to refuse it, is exactly the drift this test makes visible.
const GALLERY_NAME_TO_HOST = {
  'Mobbin': 'mobbin.com',
  'Refero': 'refero.design',
  'Screensdesign': 'screensdesign.com',
  'Clicky': 'clickyhq.com',
  'Screenlane': 'screenlane.com',
  'Pttrns': 'pttrns.com',
  'UI Patterns': 'ui-patterns.com',
  'Collect UI': 'collectui.com',
  'Land-book': 'land-book.com',
  'Godly': 'godly.website',
  'Lapa': 'lapa.ninja',
  'SiteInspire': 'siteinspire.com',
  'SaaS Landing Page': 'saaslandingpage.com',
  'Awwwards': 'awwwards.com',
  'Dribbble': 'dribbble.com',
  'Behance': 'behance.net',
};

// This test READS docs/PATTERN-LIBRARY-POLICY.md rather than hardcoding the
// names — its predecessor carried a private copy of four names, which checked
// the code against the test's memory of the document and never the document
// itself, so a doc edit could not turn it red. The policy sentence line-wraps
// mid-list, so whitespace is collapsed before parsing; a raw single-line match
// would silently drop the names after the first wrap and pass over half the
// list.
//
// The check is BOTH directions: a name in the doc with no seeded host is a
// promise the code stopped keeping, and a seeded gallery the doc no longer
// names is enforcement the policy stopped disclosing.
//
// Mutation proof, two independent directions, both measured:
// (a) DOC drift — rename Screensdesign in the policy sentence without touching
//     the code. Only this test turns red, on the no-host-for-name assert. (The
//     hardcoded predecessor took no input from the doc at all, so no doc edit
//     could have reddened it — the gap this rewrite closes is structural, not
//     a missed assertion.)
// (b) CODE drift — rename refero.design in GALLERY_HOSTS. Only this test turns
//     red, on the set comparison. (Renaming mobbin.com instead would also
//     redden the capture-fixture tests above that use it as their host.)
// (c) LABEL drift — the first version of this test filtered BLOCKED_HOSTS by
//     reason === 'gallery', so a host appended to GALLERY_HOSTS with a
//     mislabeled reason escaped both directions: refused by the code, named
//     nowhere in the doc, test green (Kimi adverse pass, 2026-08-06, claim 1 —
//     the equality was over the label, not the list). GALLERY_HOSTS is
//     exported now and compared by membership; the label assert below pins
//     the mislabel itself. Measured: append a reason:'takedown' entry to
//     GALLERY_HOSTS in dist and only this test turns red.
test('the policy doc and the seeded gallery list name the same galleries, both directions', () => {
  const policyPath = path.resolve(__dirname, '..', 'docs', 'PATTERN-LIBRARY-POLICY.md');
  const collapsed = readFileSync(policyPath, 'utf8').replace(/\s+/g, ' ');
  const sentenceMatch = collapsed.match(/The seeded list names these galleries — (.+?) — plus anything you add/);
  assert.ok(sentenceMatch, 'the sentence this test parses is gone or reworded in docs/PATTERN-LIBRARY-POLICY.md — update the pattern here to the new wording, do not delete the assertion');

  const names = sentenceMatch[1].split(', ');
  const namedHosts = names.map((name) => {
    const host = GALLERY_NAME_TO_HOST[name];
    assert.ok(host, `the policy names "${name}" but GALLERY_NAME_TO_HOST in this test has no host for it`);
    return host;
  });

  const seededHosts = blocklist.GALLERY_HOSTS.map((entry) => entry.host);
  assert.deepEqual(
    [...namedHosts].sort(), [...seededHosts].sort(),
    'docs/PATTERN-LIBRARY-POLICY.md and GALLERY_HOSTS disagree about which galleries are refused',
  );

  // Membership decides the doc parity above; this pins the label so an entry
  // cannot sit in the gallery array while claiming to be something else.
  assert.ok(
    blocklist.GALLERY_HOSTS.every((entry) => entry.reason === 'gallery'),
    'an entry in GALLERY_HOSTS carries a reason other than "gallery"',
  );

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
