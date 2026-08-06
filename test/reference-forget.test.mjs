// Takedown: removing patterns from the corpus.
//
// The corpus holds other people's design work, and the request to stop holding
// it names a SITE, not a ref_id — nobody writes in asking for
// `ref_msh3j20c_ckucnrcp` to be removed. Two failure directions are equally
// bad and each has its own test here: under-deleting (the host is reported
// cleared while records survive) and over-deleting (a takedown from
// `linear.app` also erases `notlinear.app`).
//
// Every test names what it pins in its own comment. A test that only asserted
// "the call returned" would pass against a delete that removed nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.RAVEN_NO_USAGE_LOG = '1';
const store = await import(path.resolve(__dirname, '../dist/reference-store.js'));
const indexMod = await import(path.resolve(__dirname, '../dist/index.js'));

// Probe chromium ONCE, outside the product code, so a renderer bug cannot be
// mistaken for a machine without a browser. Read the skip count — it is the only
// thing separating the two environments.
let chromiumAvailable = false;
try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  await browser.close();
  chromiumAvailable = true;
} catch {
  chromiumAvailable = false;
}

function withReferenceHome(run) {
  const previous = process.env.RAVEN_REFERENCE_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'raven-forget-'));
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    return run(home);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
}

async function withClient(fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = indexMod.buildServer({ remote: false });
  const client = new Client({ name: 'forget-test', version: '1.0.0' }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const previous = process.env.RAVEN_REFERENCE_HOME;
  const home = mkdtempSync(path.join(tmpdir(), 'raven-forget-tool-'));
  process.env.RAVEN_REFERENCE_HOME = home;
  try {
    return await fn(client, home);
  } finally {
    if (previous === undefined) delete process.env.RAVEN_REFERENCE_HOME;
    else process.env.RAVEN_REFERENCE_HOME = previous;
    rmSync(home, { recursive: true, force: true });
    await client.close();
    await server.close();
  }
}

const raw = async (client, name, args) => await client.callTool({ name, arguments: args });
const call = async (client, name, args) => JSON.parse((await raw(client, name, args)).content[0].text);

function save(url, overrides = {}) {
  return store.saveReference({
    url,
    owner: 'third-party',
    selector: '.hero',
    styles: { color: 'rgb(0, 0, 0)' },
    tags: ['hero'],
    ...overrides
  });
}

test('hostMatches takes the host and its subdomains, and nothing that merely ends with it', () => {
  // The whole risk of a host-scoped delete is in this one predicate. A naive
  // endsWith(host) says notlinear.app is Linear's, which turns one site's
  // takedown into somebody else's data loss. The negative cases are the point;
  // a test with only the positives passes against endsWith.
  assert.equal(store.hostMatches('linear.app', 'linear.app'), true);
  assert.equal(store.hostMatches('app.linear.app', 'linear.app'), true);
  assert.equal(store.hostMatches('www.docs.linear.app', 'linear.app'), true);

  assert.equal(store.hostMatches('notlinear.app', 'linear.app'), false);
  assert.equal(store.hostMatches('linear.app.evil.com', 'linear.app'), false);
  assert.equal(store.hostMatches('linear.app', 'app.linear.app'), false, 'a parent host must not be swept by a subdomain request');

  // Case and a trailing root dot are presentation, not identity.
  assert.equal(store.hostMatches('Linear.App', 'linear.app'), true);
  assert.equal(store.hostMatches('linear.app.', 'linear.app'), true);
  assert.equal(store.hostMatches('linear.app', '*.linear.app'), true);

  assert.equal(store.hostMatches('', 'linear.app'), false);
  assert.equal(store.hostMatches('linear.app', ''), false);
});

test('a host-wide delete removes the records for that host and leaves every other host alone', () => {
  withReferenceHome((home) => {
    const a = save('https://linear.app/pricing');
    const b = save('https://app.linear.app/team');
    const keepLookalike = save('https://notlinear.app/pricing');
    const keepOther = save('https://stripe.com/pricing');

    const result = store.deleteReferencesByHost('linear.app');
    assert.deepEqual(result.removed.sort(), [a.ref_id, b.ref_id].sort());
    assert.deepEqual(result.skipped, []);
    assert.equal(result.host, 'linear.app');

    // The verdict is on disk, not on the returned object.
    assert.equal(existsSync(path.join(home, a.ref_id + '.json')), false);
    assert.equal(existsSync(path.join(home, b.ref_id + '.json')), false);
    assert.equal(existsSync(path.join(home, keepLookalike.ref_id + '.json')), true);
    assert.equal(existsSync(path.join(home, keepOther.ref_id + '.json')), true);

    // And in the index, or a later search still lists what was removed.
    const left = store.listReferences().references.map((r) => r.ref_id).sort();
    assert.deepEqual(left, [keepLookalike.ref_id, keepOther.ref_id].sort());
    const indexed = JSON.parse(readFileSync(path.join(home, 'index.json'), 'utf8')).ref_ids.sort();
    assert.deepEqual(indexed, [keepLookalike.ref_id, keepOther.ref_id].sort());
  });
});

test('a host-wide delete takes the rendered thumbnails with it', () => {
  // A pattern removed on request must not survive as a picture of itself. The
  // PNG is the copy of somebody's design work — leaving it behind while the
  // record goes is the worst of both: unattributed and unreachable.
  withReferenceHome(() => {
    const a = save('https://linear.app/pricing');
    const other = save('https://stripe.com/pricing');
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    store.attachReferenceImage(a.ref_id, png, { width: 100, height: 40 });
    store.attachReferenceImage(other.ref_id, png, { width: 100, height: 40 });
    assert.equal(existsSync(store.referenceImagePath(a.ref_id)), true);

    store.deleteReferencesByHost('linear.app');
    assert.equal(existsSync(store.referenceImagePath(a.ref_id)), false,
      'the record was removed but its thumbnail is still on disk');
    assert.equal(existsSync(store.referenceImagePath(other.ref_id)), true,
      'another host lost its thumbnail');
  });
});

test('an unreadable record is reported as skipped and left on disk, not counted as cleared', () => {
  // The dangerous outcome is not the failure — it is answering "linear.app is
  // cleared" while a record that could not be parsed still sits in the
  // directory. It may well be from that host; nothing can say it is not.
  withReferenceHome((home) => {
    const good = save('https://linear.app/pricing');
    const corrupt = path.join(home, 'ref_corrupt0_deadbeef.json');
    writeFileSync(corrupt, '{ not json');

    const result = store.deleteReferencesByHost('linear.app');
    assert.deepEqual(result.removed, [good.ref_id]);
    assert.deepEqual(result.skipped, ['ref_corrupt0_deadbeef.json']);
    assert.equal(existsSync(corrupt), true, 'a record that could not be read was deleted anyway');
  });
});

test('an image that cannot be unlinked leaves the record in place so the takedown is retryable', () => {
  // The one outcome a takedown must never produce is a false all-clear. The
  // unlink caught EVERY error, so an EACCES / EISDIR / busy file left the
  // picture on disk while deleteReference returned true and the caller was told
  // the pattern was gone. Only "it was not there" is fine — most records have no
  // image, and that is the expected case rather than an error.
  //
  // The fixture puts a DIRECTORY at the image path, which is how Sol reproduced
  // it: unlinkSync raises EPERM/EISDIR rather than ENOENT.
  //
  // Surfacing that failure loudly was necessary and NOT sufficient, which is what
  // the second half of this test now pins. The earlier version unlinked the
  // record first, so the throw was honest about THIS call and the next call was
  // silent: no record named the surviving PNG any more, so a retry matched
  // nothing, removed nothing, and returned a clean empty result over a
  // third-party image still on disk. A false all-clear one call later is the
  // same false all-clear. Removing the image first makes every failure
  // retryable — assert the RETRY, not just the throw, because the throw passes
  // under both orderings.
  withReferenceHome((home) => {
    const ref = save('https://linear.app/pricing');
    mkdirSync(store.referenceImagePath(ref.ref_id));

    assert.throws(() => store.deleteReference(ref.ref_id), /could not remove its image/);
    assert.equal(existsSync(path.join(home, ref.ref_id + '.json')), true,
      'the record was removed while its image survived — nothing on disk names the ' +
      'orphan any more and no later takedown can rediscover it');
    assert.deepEqual(JSON.parse(readFileSync(path.join(home, 'index.json'), 'utf8')).ref_ids, [ref.ref_id]);
    assert.equal(existsSync(store.referenceImagePath(ref.ref_id)), true);

    // The retry: still visible, still matched, still reported as unremoved.
    const retry = store.deleteReferencesByHost('linear.app');
    assert.deepEqual(retry.removed, [], 'a second takedown reported removing something it did not');
    assert.equal(retry.failed.length, 1, 'the surviving image was invisible to the second takedown');
    assert.equal(retry.failed[0].ref_id, ref.ref_id);

    // And once the obstruction is gone, the ordinary path finishes the job.
    rmSync(store.referenceImagePath(ref.ref_id), { recursive: true });
    assert.equal(store.deleteReference(ref.ref_id), true);
    assert.equal(existsSync(path.join(home, ref.ref_id + '.json')), false);
  });
});

test('a record that will not delete does not abandon the rest of the takedown', () => {
  // The half-completed sweep is the failure this whole function exists to
  // prevent: you remove four of six and the corpus still holds work somebody
  // asked you to stop holding. One unremovable record is recorded in failed[]
  // and the sweep continues — and failed[] is separate from skipped[], because
  // "could not parse it" and "could not delete it" are different answers and the
  // second is the serious one.
  withReferenceHome(() => {
    const stuck = save('https://linear.app/pricing');
    const ok = save('https://app.linear.app/team');
    mkdirSync(store.referenceImagePath(stuck.ref_id));

    const result = store.deleteReferencesByHost('linear.app');
    assert.deepEqual(result.removed, [ok.ref_id], 'the sweep stopped at the record that failed');
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].ref_id, stuck.ref_id);
    assert.match(result.failed[0].reason, /could not remove its image/);
    assert.deepEqual(result.skipped, [], 'a delete failure was filed as unreadable JSON');
    assert.equal(existsSync(store.referenceImagePath(stuck.ref_id)), true);
  });
});

test('a numeric fragment of an address is not a takedown for the whole address', () => {
  // Suffix matching means "is a subdomain of", and an ADDRESS has no
  // subdomains — so a request that is merely a tail of one must not match it.
  // Under the raw-string rule `"127.0.0.1".endsWith(".0.0.1")` was true, and a
  // takedown typed as `0.0.1` erased a record stored at 127.0.0.1. That record
  // is ordinarily storable (`http://127.0.0.1:3000/`), so this direction is
  // reachable through the tool's own API.
  //
  // WHICH clause closes it, measured rather than assumed: CANONICALIZATION does.
  // WHATWG parses a trailing all-numeric label as an IPv4 candidate, so `0.0.1`,
  // `0.1` and `1` all canonicalize to the address `0.0.0.1`, which is no longer a
  // suffix of anything. The isIpLiteral guard in hostMatches is belt-and-braces
  // behind that and has no reachable trigger left — see its comment. Do not read
  // this test as proof of that clause; it is proof of the canonicalization.
  //
  // The other direction Sol reported — `hostMatches("x.127.0.0.1", "127.0.0.1")`
  // deleting a DNS name that ends in numeric labels — is NOT reachable: the same
  // WHATWG rule makes `x.127.0.0.1` an invalid URL hostname, so validatedUrl
  // rejects it at capture and no record can ever hold it. Asserted below so a
  // future reader does not go looking for the fixture that "should" exist.
  assert.equal(store.hostMatches('127.0.0.1', '0.0.1'), false);
  assert.equal(store.hostMatches('127.0.0.1', '0.1'), false);
  assert.equal(store.hostMatches('127.0.0.1', '1'), false);
  assert.equal(store.hostMatches('127.0.0.1', '127.0.0.1'), true);
  assert.equal(store.hostMatches('[::1]', '[::1]'), true);
  assert.throws(() => new URL('https://x.127.0.0.1/'),
    'x.127.0.0.1 parsed as a hostname — the unreachability argument above no longer holds');

  withReferenceHome(() => {
    const address = save('http://127.0.0.1:3000/pricing');
    assert.equal(address.host, '127.0.0.1', 'fixture: the store did not keep the address as its host');
    const result = store.deleteReferencesByHost('0.0.1');
    assert.deepEqual(result.removed, [],
      'a takedown typed as the fragment 0.0.1 removed a record stored at 127.0.0.1');
    assert.equal(store.listReferences().total, 1);
  });
});

test('the requested host is canonicalized the same way the stored one was', () => {
  // A stored host is `new URL(url).hostname` — punycode, portless, lowercase.
  // The requested host is free text a human typed into a takedown, so comparing
  // them raw compares two different alphabets: measured against dist/, a request
  // for `bücher.example` missed a record stored as `xn--bcher-kva.example`, and
  // `example.com:443` missed `example.com`. Both returned a clean empty result,
  // which reads as "already clear".
  assert.equal(store.hostMatches('xn--bcher-kva.example', 'bücher.example'), true);
  assert.equal(store.hostMatches('example.com', 'example.com:443'), true);
  assert.equal(store.hostMatches('[::1]', '[::1]:443'), true);
  assert.equal(store.hostMatches('example.com', 'EXAMPLE.com.'), true);
  assert.equal(store.hostMatches('app.linear.app', '*.linear.app'), true);

  withReferenceHome(() => {
    const ref = save('https://bücher.example/pricing');
    assert.equal(ref.host, 'xn--bcher-kva.example', 'fixture: the store did not punycode the host');
    const result = store.deleteReferencesByHost('bücher.example');
    assert.deepEqual(result.removed, [ref.ref_id]);
  });
});

test('a host that is not a bare hostname is refused rather than silently widened', () => {
  // `new URL("http://" + raw)` accepts `linear.app/pricing` and hands back the
  // hostname `linear.app`, so canonicalizing without a round-trip check would
  // turn a typo into a whole-site takedown. Refusing is the only safe answer,
  // and it must be a THROW: returning no matches would read as "already clear".
  withReferenceHome(() => {
    save('https://linear.app/pricing');
    assert.throws(() => store.deleteReferencesByHost('linear.app/pricing'), /bare hostname/);
    assert.throws(() => store.deleteReferencesByHost('https://linear.app'), /bare hostname/);
    assert.throws(() => store.deleteReferencesByHost('user@linear.app'), /bare hostname/);
    assert.equal(store.listReferences().total, 1, 'a refused host removed something anyway');
  });
});

test('a record captured after the preview is reported, not removed, when the caller pins the set', () => {
  // The preview and the confirmation are separate calls and each reads the
  // directory for itself, so "the same function computes both" makes them the
  // same RULE and never the same SNAPSHOT. Preview linear.app with one record,
  // capture app.linear.app, confirm: the prompt said one and the delete took
  // two, silently.
  withReferenceHome(() => {
    const shown = save('https://linear.app/pricing');
    const preview = store.referencesForHost('linear.app');
    assert.deepEqual(preview.removed, [shown.ref_id], 'fixture: the preview did not see one record');

    // Between the two calls.
    const late = save('https://app.linear.app/team');

    const result = store.deleteReferencesByHost('linear.app', preview.removed);
    assert.deepEqual(result.removed, [shown.ref_id]);
    assert.deepEqual(result.appeared_since_preview, [late.ref_id],
      'a record that appeared after the preview was deleted under an authorisation ' +
      'that never named it');
    assert.equal(store.getReference(late.ref_id).ref_id, late.ref_id, 'the late record was removed anyway');

    // Unpinned is still the old behaviour, on purpose: a caller who means
    // "everything from this host, now" gets exactly that.
    const second = store.deleteReferencesByHost('linear.app');
    assert.deepEqual(second.removed, [late.ref_id]);
    assert.deepEqual(second.appeared_since_preview, []);
  });
});

test('a corrupt index is not reported as an unreadable record left on disk', () => {
  // `skipped` means "a record I could not read, still on disk" — the sentence
  // built from it says the host is NOT fully cleared. An unreadable INDEX is a
  // different condition with the opposite consequence: recordFiles falls back to
  // scanning the directory, so every record is still found and deleted and the
  // index is rebuilt on the way through. Filing it in `skipped` made a fully
  // successful takedown report a record left behind that was not there — a false
  // NOT-clear, which is as much a lie about the disk as a false all-clear.
  withReferenceHome((home) => {
    const ref = save('https://linear.app/pricing');
    writeFileSync(path.join(home, 'index.json'), '{ not json');

    const result = store.deleteReferencesByHost('linear.app');
    assert.deepEqual(result.removed, [ref.ref_id]);
    assert.deepEqual(result.skipped, [],
      'the corrupt index was counted as an unreadable record, so a complete ' +
      'takedown reported leaving one behind');
    assert.equal(result.index_unreadable, true, 'the corrupt index was not reported at all');
    assert.equal(existsSync(path.join(home, ref.ref_id + '.json')), false);
    assert.deepEqual(JSON.parse(readFileSync(path.join(home, 'index.json'), 'utf8')).ref_ids, [],
      'the index was not rebuilt');
  });
});

test('a host with nothing stored removes nothing and does not throw', () => {
  withReferenceHome(() => {
    save('https://stripe.com/pricing');
    const result = store.deleteReferencesByHost('linear.app');
    assert.deepEqual(result.removed, []);
    assert.equal(store.listReferences().total, 1);
  });
});

test('deleteReferencesByHost refuses an empty host rather than sweeping everything', () => {
  // The catastrophic argument. An empty string reaching a host filter that
  // treats "" as "match all" erases the corpus.
  withReferenceHome(() => {
    save('https://stripe.com/pricing');
    assert.throws(() => store.deleteReferencesByHost(''), /host is required/);
    assert.throws(() => store.deleteReferencesByHost('   '), /host is required/);
    assert.equal(store.listReferences().total, 1);
  });
});

test('forget_references host mode refuses without confirm, and names the count it would remove', async () => {
  // The gate exists because the caller is an agent acting on a sentence a human
  // typed. "Clear out linear" must not be one inferred argument away from
  // erasing a corpus that took real browsing to build. Naming the count is what
  // makes the confirmation informed rather than ceremonial.
  await withClient(async (client) => {
    await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing', selector: '.hero', styles: { color: 'rgb(0, 0, 0)' }, owner: 'third-party', tags: ['hero']
    });
    await call(client, 'capture_reference', {
      url: 'https://app.linear.app/team', selector: '.nav', styles: { color: 'rgb(0, 0, 0)' }, owner: 'third-party', tags: ['hero']
    });

    const refused = await raw(client, 'forget_references', { host: 'linear.app' });
    assert.equal(refused.isError, true);
    // 2, not 1: the prompt must count what confirming actually removes, and the
    // takedown includes subdomains. search_references' host filter is exact by
    // design, so a preview built on it offered "1 record" and removed both.
    assert.match(refused.content[0].text, /2 record\(s\) would be removed/);
    assert.match(refused.content[0].text, /confirm:true/);
    // Refused means nothing happened — a warning that half-deletes is worse than none.
    assert.equal((await call(client, 'search_references', {})).total, 2);

    const done = await call(client, 'forget_references', { host: 'linear.app', confirm: true });
    assert.equal(done.removed.length, 2);
    assert.equal((await call(client, 'search_references', {})).total, 0);
  });
});

test('forget_references removes exactly one record by ref_id, and says so when there is nothing to remove', async () => {
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing', selector: '.hero', styles: { color: 'rgb(0, 0, 0)' }, owner: 'third-party', tags: ['hero']
    });
    const other = await call(client, 'capture_reference', {
      url: 'https://linear.app/method', selector: '.hero', styles: { color: 'rgb(0, 0, 0)' }, owner: 'third-party', tags: ['hero']
    });

    const gone = await call(client, 'forget_references', { ref_id: saved.reference.ref_id });
    assert.deepEqual(gone.removed, [saved.reference.ref_id]);
    // Same host, untouched — a ref_id removal is not a host sweep.
    assert.equal(JSON.parse((await raw(client, 'search_references', { host: 'linear.app' })).content[0].text).total, 1);
    assert.equal(JSON.parse((await raw(client, 'search_references', { host: 'linear.app' })).content[0].text)
      .results[0].reference.ref_id, other.reference.ref_id);

    // A second removal is a no-op that reports itself as one rather than a lie.
    const again = await call(client, 'forget_references', { ref_id: saved.reference.ref_id });
    assert.deepEqual(again.removed, []);
    assert.match(again.note, /nothing was removed/);
  });
});

test('forget_references rejects ref_id and host together instead of guessing which one was meant', async () => {
  // Guessing here is a data-loss coin flip: reading it as the ref_id leaves the
  // host's records behind after a takedown, reading it as the host deletes far
  // more than the caller named.
  await withClient(async (client) => {
    await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing', selector: '.hero', styles: { color: 'rgb(0, 0, 0)' }, owner: 'third-party', tags: ['hero']
    });
    const refused = await raw(client, 'forget_references', {
      ref_id: 'ref_whatever_00000000', host: 'linear.app', confirm: true
    });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /not both/);
    assert.equal(JSON.parse((await raw(client, 'search_references', { host: 'linear.app' })).content[0].text).total, 1);
  });
});

test('search_references does not hand back an image_path whose file is gone', { skip: !chromiumAvailable && 'chromium did not launch' }, async () => {
  // The record says an image was attached; the file is what a consumer opens,
  // and the two come apart — a PNG removed out of band, a corpus copied without
  // its sidecars, a takedown that could not unlink one image. Advertising the
  // path anyway is the same false all-clear the takedown refuses to give, one
  // layer out.
  await withClient(async (client) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing',
      selector: '.hero',
      styles: { color: 'rgb(0, 0, 0)' },
      owner: 'third-party',
      tags: ['hero'],
      html: '<div style="width:60px;height:30px;background:#111"></div>',
      rect: { x: 0, y: 0, width: 60, height: 30 }
    });
    // Same discriminator as the thumbnail suite: chromium is probed once at
    // module load, outside the product code, so "no image came back" cannot be
    // read as "no browser" when there is one. Without this the test degrades
    // into a silent pass on every machine where the renderer is broken.
    assert.ok(saved.image, 'chromium launched in the probe but capture_reference attached no image');

    const withImage = await call(client, 'search_references', {});
    assert.equal(typeof withImage.results[0].display.image_path, 'string');
    assert.equal(existsSync(withImage.results[0].display.image_path), true);

    rmSync(store.referenceImagePath(saved.reference.ref_id));
    const after = await call(client, 'search_references', {});
    assert.equal(after.results[0].display.image_path, null,
      'a path to a file that is not there was handed to the caller');
    // The record still knows it HAD one — this is about what a consumer can open,
    // not about rewriting history.
    assert.ok(after.results[0].reference.image);

    // Absence was the only case covered, and it is not the case this codebase
    // already knows about: the failure it handles elsewhere leaves a DIRECTORY
    // at the image path — that is what makes an unlink come back EPERM/EISDIR in
    // the first place — and existsSync answers true for a directory. The
    // consumer then opens a directory expecting a PNG. Nothing but isFile()
    // separates the two, so this assertion is the whole reason that call changed.
    mkdirSync(store.referenceImagePath(saved.reference.ref_id));
    const asDirectory = await call(client, 'search_references', {});
    assert.equal(asDirectory.results[0].display.image_path, null,
      'a directory sitting at the image path was handed back as an image');
    rmSync(store.referenceImagePath(saved.reference.ref_id), { recursive: true });

    // And a file that is not a PNG at all is still a file, so this stays a path:
    // the check is "something readable is there", not a format validation. Stated
    // so the next reader does not mistake it for one.
    writeFileSync(store.referenceImagePath(saved.reference.ref_id), 'not a png');
    const asJunk = await call(client, 'search_references', {});
    assert.equal(typeof asJunk.results[0].display.image_path, 'string');
  });
});

test('forget_references by ref_id reports a failure in failed[], the same shape the host path uses', async () => {
  // The two modes answer the same question and must answer it the same way. By
  // host, an image that would not unlink lands in failed[] with the ref_id and
  // the reason. By ref_id it fell through to the outer catch and came back as
  // isError plus free text — the caller could see that something went wrong but
  // not, structurally, which record still needs a human, so anything reading
  // failed[] silently saw a clean result.
  await withClient(async (client, home) => {
    const saved = await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing',
      selector: '.hero',
      styles: { color: 'rgb(0, 0, 0)' },
      owner: 'third-party',
      tags: ['hero']
    });
    mkdirSync(store.referenceImagePath(saved.reference.ref_id));

    const result = await call(client, 'forget_references', { ref_id: saved.reference.ref_id });
    assert.deepEqual(result.removed, []);
    assert.equal(result.failed.length, 1, 'the ref_id path reported no structured failure');
    assert.equal(result.failed[0].ref_id, saved.reference.ref_id);
    assert.match(result.failed[0].reason, /could not remove its image/);
    // And the record survives, so this is retryable rather than an orphan.
    assert.equal(existsSync(path.join(home, saved.reference.ref_id + '.json')), true);
  });
});

test('forget_references is registered on stdio and gated off the anonymous remote surface', async () => {
  // A delete tool on a shared no-auth endpoint deletes from whatever store that
  // endpoint can reach. It belongs on the local server only, and the frozen
  // 45-tool anonymous surface is what proves it did not leak there.
  const local = Object.keys(indexMod.buildServer({ remote: false })._registeredTools);
  const remote = Object.keys(indexMod.buildServer({ remote: true })._registeredTools);
  assert.equal(local.includes('forget_references'), true);
  assert.equal(remote.includes('forget_references'), false);
  assert.equal(remote.length, 45);
});

// ---------------------------------------------------------------------------
// Round 3. Five findings from an adverse correctness pass, each with the input
// that produced the wrong outcome.
// ---------------------------------------------------------------------------

test('a hostname that parses but could never name a site is refused, not answered with a clean empty result', () => {
  // The takedown's one forbidden outcome is a false all-clear, and WHATWG
  // hostname parsing hands you one for free: `linear..app` PARSES (measured,
  // Node 26.5.0) and comes back unchanged, so canonicalHost returns it, nothing
  // matches it, and the caller is told "Removed 0 record(s)" with every failure
  // field empty — indistinguishable from a host that really is clear. The typo
  // produced the empty result. So did `.linear.app`, `-x.app`, an over-long
  // label, and an over-long name.
  withReferenceHome(() => {
    save('https://linear.app/pricing');
    for (const typo of [
      'linear..app',
      '.linear.app',
      '-x.app',
      'x-.app',
      'a'.repeat(64) + '.app',
      ('a'.repeat(60) + '.').repeat(5) + 'app',
    ]) {
      assert.throws(
        () => store.deleteReferencesByHost(typo, undefined),
        /cannot name a site/,
        'a takedown for ' + JSON.stringify(typo) + ' must be refused, not reported as clear'
      );
    }
    // Refused means untouched — the record that the typo was aimed at is still here.
    assert.equal(store.listReferences().total, 1);
    // And the well-formed spelling still works, or the check has replaced one
    // false all-clear with a takedown nobody can run.
    assert.equal(store.deleteReferencesByHost('linear.app').removed.length, 1);
  });
});

test('a malformed STORED host is still matchable, because refusing it would hide it', () => {
  // The check above lives at the request seam and deliberately NOT inside
  // canonicalHost. hostMatches canonicalises the stored host through the same
  // function, so moving the check there would make a record captured from
  // `-x.app` unmatchable by any takedown at all — still on disk, never reported,
  // which is the same false all-clear one layer down. `-x.app` is a subdomain of
  // `app` and must come out on a takedown for `app`.
  withReferenceHome(() => {
    save('https://-x.app/hero');
    assert.equal(store.hostMatches('-x.app', 'app'), true);
    const swept = store.deleteReferencesByHost('app', undefined);
    assert.equal(swept.removed.length, 1, 'a record stored at a malformed host must still be removable');
    assert.equal(store.listReferences().total, 0);
  });
});

test('an index entry whose record file is gone is not reported as an unreadable record left on disk', () => {
  // deleteReference unlinks the record and THEN rewrites the index, so any
  // failure between those two lines leaves an id in the index with no file. Every
  // later read hit ENOENT and filed it under `skipped`, which the tool renders as
  // "1 unreadable record(s) were left on disk. This host is NOT fully cleared." —
  // about a disk that is clean. Nothing prunes the index for a file that is not
  // there, so that sentence was permanent: a false NOT-clear with no way out.
  withReferenceHome((home) => {
    const stays = save('https://linear.app/pricing');
    const vanishes = save('https://linear.app/changelog');
    // Exactly the half-state the delete path can leave: file gone, index intact.
    rmSync(path.join(home, vanishes.ref_id + '.json'));
    assert.ok(
      JSON.parse(readFileSync(path.join(home, 'index.json'), 'utf8')).ref_ids.includes(vanishes.ref_id),
      'the fixture must leave the index naming the missing record, or it measures nothing'
    );
    const listed = store.listReferences();
    assert.deepEqual(listed.skipped, [], 'a record that is not on disk is not a record left on disk');
    assert.equal(listed.total, 1);
    assert.equal(listed.references[0].ref_id, stays.ref_id);
    // And the takedown reports the host cleared, which it now is.
    const swept = store.deleteReferencesByHost('linear.app', undefined);
    assert.deepEqual(swept.skipped, []);
    assert.deepEqual(swept.still_present, []);
  });
});

test('what is still on disk is read back after the sweep, and named once or not at all', () => {
  // Everything a sweep reports is computed from ONE scan taken before the first
  // unlink, so the answer describes the directory as it was. still_present is a
  // re-read of the directory as it IS. It must not double-report: a pinned-out
  // record and a record that would not delete are both correctly still there and
  // both already named, and repeating them would make every pinned call look
  // like it left something behind.
  withReferenceHome((home) => {
    const kept = save('https://linear.app/pricing');
    const taken = save('https://linear.app/changelog');
    const pinned = store.deleteReferencesByHost('linear.app', [taken.ref_id]);
    assert.deepEqual(pinned.removed, [taken.ref_id]);
    assert.deepEqual(pinned.appeared_since_preview, [kept.ref_id]);
    assert.deepEqual(pinned.still_present, [], 'a pinned-out record is named in appeared_since_preview, not twice');

    // A record whose image will not unlink survives on purpose, and is already
    // named in failed[].
    mkdirSync(store.referenceImagePath(kept.ref_id), { recursive: true });
    const blocked = store.deleteReferencesByHost('linear.app', undefined);
    assert.deepEqual(blocked.removed, []);
    assert.equal(blocked.failed.length, 1);
    assert.equal(blocked.failed[0].ref_id, kept.ref_id);
    assert.deepEqual(blocked.still_present, [], 'a failed removal is named in failed[], not twice');
  });
  // The positive direction — a record landing between the plan and the sweep and
  // coming back in still_present — needs a genuinely concurrent writer: the
  // sweep is synchronous, so nothing in this process can create a record while
  // it runs. It is stated here rather than left looking covered.
});

test('a clean sweep says the disk is clean, having looked', () => {
  withReferenceHome(() => {
    save('https://linear.app/pricing');
    const swept = store.deleteReferencesByHost('linear.app', undefined);
    assert.equal(swept.removed.length, 1);
    assert.deepEqual(swept.still_present, []);
    assert.deepEqual(swept.failed, []);
    assert.deepEqual(swept.skipped, []);
  });
});

test('an image rendered while its reference was being removed does not put the reference back', () => {
  // attachReferenceImage reads the record, renders in headless Chromium, then
  // writes the record back — and a whole render sits between the read and the
  // write. A takedown landing in that window removed the record and its image and
  // reported success; the write-back then restored BOTH, third-party JSON and a
  // rendered PNG of somebody's design, after they had been told it was gone.
  withReferenceHome((home) => {
    const reference = save('https://linear.app/pricing');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    // The takedown has to land INSIDE the call, after the record is read and
    // before it is written back — deleting first only reproduces the case the
    // opening getReference already catches, which is why the first draft of this
    // test passed against the defect. `size.height` is read after that load, so a
    // getter on it is a real synchronous hook into the middle of the function.
    let sweptDuringRender = null;
    const size = {
      width: 100,
      get height() {
        if (!sweptDuringRender) sweptDuringRender = store.deleteReferencesByHost('linear.app', undefined);
        return 80;
      }
    };
    assert.throws(
      () => store.attachReferenceImage(reference.ref_id, new Uint8Array(png), size),
      /was removed while its image was being rendered/
    );
    assert.deepEqual(sweptDuringRender.removed, [reference.ref_id], 'the fixture must actually remove it mid-call');
    assert.deepEqual(sweptDuringRender.still_present, [], 'and must have reported the host clear at the time');
    assert.equal(existsSync(path.join(home, reference.ref_id + '.json')), false, 'the record must stay deleted');
    assert.equal(existsSync(path.join(home, 'images', reference.ref_id + '.png')), false, 'and so must its image');
    assert.equal(store.listReferences().total, 0);
  });
});

test('forget_references does not claim a repair it did not make, and says when it was not pinned', async () => {
  // Two sentences the tool used to get wrong. The index rebuild happens inside
  // deleteReference, so a run that matched nothing rebuilds nothing — and the
  // note said "was rebuilt" unconditionally, telling the caller a repair had
  // happened on exactly the runs where it had not. And an unpinned removal has
  // no baseline, so appeared_since_preview is empty because nothing was
  // compared, not because nothing arrived; an empty field read as an all-clear.
  await withClient(async (client, home) => {
    await call(client, 'capture_reference', {
      url: 'https://linear.app/pricing', selector: '.hero', styles: { color: 'rgb(0, 0, 0)' }, owner: 'third-party', tags: ['hero']
    });
    writeFileSync(path.join(home, 'index.json'), '{ not json');
    const done = await call(client, 'forget_references', { host: 'linear.app', confirm: true });
    assert.equal(done.index_unreadable, true);
    assert.doesNotMatch(done.note, /was rebuilt/, 'the note must not claim a rebuild this run did not do');
    assert.match(done.note, /the next capture or removal\s+rebuilds it/);
    assert.match(done.note, /not pinned to a preview/);

    // And a pinned call does not carry the unpinned warning.
    await call(client, 'capture_reference', {
      url: 'https://linear.app/changelog', selector: '.nav', styles: { color: 'rgb(0, 0, 0)' }, owner: 'third-party', tags: ['hero']
    });
    const preview = await raw(client, 'forget_references', { host: 'linear.app' });
    // Two-segment shape on purpose: /ref_[a-z0-9_]+/ also matches the "ref_ids"
    // inside the prompt's own "pass expected_ref_ids" sentence, which made this
    // count 2 and the fixture look like it had two records.
    const ids = String(preview.content[0].text).match(/\bref_[a-z0-9]+_[a-z0-9]+\b/g) || [];
    assert.equal(ids.length, 1, 'the preview must name the id the confirm pins to');
    const pinnedRun = await call(client, 'forget_references', { host: 'linear.app', confirm: true, expected_ref_ids: ids });
    assert.doesNotMatch(pinnedRun.note, /not pinned to a preview/);
  });
});
