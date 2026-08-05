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
