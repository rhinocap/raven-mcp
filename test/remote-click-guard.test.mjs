// audit_url drives a real browser at a URL the caller names, firing a caller-supplied
// interaction list. The hosted build refuses the CLICK event — a click can submit a
// form, place an order, or delete a record on a host the caller does not own, which is
// a blast radius worth refusing on an endpoint anyone can call anonymously. It was
// MEASURED unguarded before it was fixed: the remote build accepted {event:"click"} on
// a public URL and nothing refused it. Local stdio is unchanged — a local caller drives
// pages they chose.
//
// THE ORIGINAL VERSION OF THIS FILE CLAIMED THAT GUARD FIXED THE ANNOTATION, AND IT DID
// NOT. It read: closed by changing the BEHAVIOUR, not the annotation — hover and focus
// falsify neither hint. They do. Playwright hover and focus dispatch real events, so the
// page runs its own mouseenter/focus handlers (src/capture.ts:499), and a handler can
// call .click() itself or fire a same-origin request. Refusing the literal click event
// narrows the blast radius; it does not make the tool read-only or idempotent. The
// annotation is therefore fixed where an annotation belongs — toolFiresCallerInteractions()
// in src/index.ts publishes audit_url as readOnlyHint:false / idempotentHint:false on BOTH
// surfaces — and this guard is a separate, narrower safety decision. The tests below
// assert both, and the annotation assertion is now the one that would go red if someone
// "restored" readOnlyHint:true on the strength of the click guard.
//
// Two properties this file exists to keep from drifting apart:
//   (1) the ENFORCEMENT lives at the shared registration wrapper in buildServer,
//       so a future second registration path cannot bypass it;
//   (2) the remote DESCRIPTION is derived from the same table, so the description
//       and the published hints can never contradict each other.
// Both are asserted here, in both directions, plus over-refusal controls — a
// guard that refused everything would satisfy the refusal half alone.
//
// Every call goes through the tool's own zod schema (safeParse, then handler) so
// a fixture the schema would reject is a HARD FAILURE of the fixture rather than
// a silent pass. That is not hypothetical: the first draft of the local-direction
// probe omitted the required `delay_ms` and measured nothing.
//
// Measured matrix: .claude/openai-rejection-2026-08-19/click-mutants.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildServer } from '../dist/index.js';
import { FsTasteStore } from '../dist/taste-store.js';

// setRemoteRuntime() is a ONE-WAY PER-PROCESS LATCH, so the moment this file
// builds a remote server every later browser-launching call in this process --
// including the local build's -- routes through the remote playwright-core /
// @sparticuz stack and leaks an egress-proxy handle that hangs the runner AFTER
// the last test reports green. Measured here: all 15 tests printed pass and the
// process never exited. So the one assertion that actually INVOKES audit_url
// locally runs in a child process, which is this repo's house pattern
// (test/user-systems.test.mjs). Reading a local DESCRIPTION is safe in-process --
// the latch only reaches the browser path.
const DIST = pathToFileURL(new URL('../dist/index.js', import.meta.url).pathname).href;
const STORE = pathToFileURL(new URL('../dist/taste-store.js', import.meta.url).pathname).href;

const REFUSAL = 'Click interactions are disabled on the hosted (remote) endpoint';
const DERIVED_SENTENCE = 'On the hosted endpoint click interactions are refused; hover and focus still run and can fire handlers on the page, so this tool is published as neither read-only nor idempotent.';
// Not a public host, so the remote URL guard refuses it. That is deliberate: it
// gives the over-refusal controls a refusal that is DISTINGUISHABLE from the
// click one, which is what lets them prove the click guard let them through.
const FIXTURE_URL = 'http://127.0.0.1:9/nothing';
const signal = new AbortController().signal;

const remoteServer = buildServer({ remote: true });
const localServer = buildServer({ remote: false, tasteStore: new FsTasteStore() });

function toolOf(server, name) {
  const t = server._registeredTools[name];
  assert.ok(t, `${name} is not registered on this build`);
  return t;
}

async function call(server, name, args) {
  const t = toolOf(server, name);
  const parsed = t.inputSchema.safeParse(args);
  assert.ok(parsed.success, `fixture rejected by ${name}'s own schema (so it measures nothing): ` +
    (parsed.success ? '' : parsed.error.issues.map((i) => i.path.join('.') + ':' + i.code).join(', ')));
  const result = await t.handler(parsed.data, { signal });
  return { isError: result.isError === true, text: result.content.map((c) => c.text).join('\n') };
}

const click = (sel) => ({ selector: sel, event: 'click', delay_ms: 0 });
const hover = (sel) => ({ selector: sel, event: 'hover', delay_ms: 0 });
const focus = (sel) => ({ selector: sel, event: 'focus', delay_ms: 0 });

// ── The annotations that make the guard necessary ───────────────────────────
for (const [label, server] of [['remote', remoteServer], ['local', localServer]]) {
  test(`audit_url is published NEITHER read-only NOR idempotent on the ${label} build`, () => {
    const a = toolOf(server, 'audit_url').annotations;
    // Both surfaces, because both fire caller-supplied hover/focus at a live page.
    // The hosted click guard narrows the blast radius; it does not restore either hint.
    assert.equal(a.readOnlyHint, false, 'readOnlyHint must be an explicit false');
    assert.equal(a.idempotentHint, false, 'idempotentHint must be an explicit false');
    // destructiveHint is TRUE for the same reason readOnlyHint is false (Sol round 5,
    // P1-2): a caller-named hover or focus runs the third-party page's OWN handler, and
    // nothing here can know what that handler does. Publishing `false` would be a positive
    // claim that any update is additive, which cannot be made about arbitrary third-party
    // code. Do not "restore" it to false on the grounds that the side effect belongs to the
    // page — that is the argument already refused one line up for readOnlyHint.
    assert.equal(a.destructiveHint, true, 'a caller-named interaction runs page code of unknown effect');
    assert.equal(typeof a.openWorldHint, 'boolean', 'every hint is explicitly set, never null');
  });
}

// ── The scoping is PER SURFACE, not per tool name ────────────────────────────
// toolFiresCallerInteractions() answers a question about the SURFACE: does this
// build let the caller fire interactions at a page it named. For audit_page the
// answer differs by build — the hosted endpoint disables url-capture entirely
// (REMOTE_DISABLED_PARAMS, src/index.ts), so hosted audit_page grades pasted HTML
// and is genuinely read-only, while the LOCAL build drives a real browser at a
// caller-supplied url with a caller-supplied interaction list exactly as audit_url
// does. Covering only audit_url would be the fix-one-of-two-call-sites drift this
// repo documents elsewhere, so both directions are pinned here: a future edit that
// narrows the helper to audit_url alone turns the local half red, and one that
// widens it to every build turns the hosted half red.
test('audit_page is read-only on the hosted build and NOT on the local build', () => {
  const hosted = toolOf(remoteServer, 'audit_page').annotations;
  const local = toolOf(localServer, 'audit_page').annotations;

  assert.equal(hosted.readOnlyHint, true, 'hosted audit_page cannot fetch a url, so it is read-only');
  assert.equal(hosted.idempotentHint, true);

  assert.equal(local.readOnlyHint, false, 'local audit_page drives a real browser at a caller-named url');
  assert.equal(local.idempotentHint, false);
  assert.equal(local.destructiveHint, true, 'local audit_page fires caller interactions, so it can cause a page handler of unknown effect to run');

  for (const a of [hosted, local]) {
    assert.equal(typeof a.openWorldHint, 'boolean', 'every hint is explicitly set, never null');
  }
});

// ── Refusal ─────────────────────────────────────────────────────────────────
const REFUSED = [
  ['a click-only interaction list', [click('#a')]],
  ['a click after a hover', [hover('#a'), click('#b')]],
  ['a click before a hover', [click('#a'), hover('#b')]],
  ['a click buried after a focus', [focus('#a'), hover('#b'), click('#c')]]
];
for (const [label, interactions] of REFUSED) {
  test(`the hosted build refuses ${label}`, async () => {
    const { isError, text } = await call(remoteServer, 'audit_url', { url: FIXTURE_URL, interactions });
    assert.equal(isError, true, `expected a refusal, got: ${text.slice(0, 200)}`);
    assert.ok(text.includes(REFUSAL), `expected the click refusal, got: ${text.slice(0, 300)}`);
    assert.ok(/hover|focus/.test(text), 'the refusal must name the events that DO work, or it is a dead end');
    assert.ok(/raven-mcp/.test(text), 'the refusal must name the local route out');
  });
}

// ── Over-refusal controls ───────────────────────────────────────────────────
// Without these, a guard that refused every interaction list would satisfy every
// assertion above. Each of these IS refused (the URL is not public), so what is
// asserted is that it is refused for a DIFFERENT reason — i.e. the click guard
// let it past and the NEXT check downstream is the one that answered.
//
// "A different reason" used to be asserted as the ABSENCE of the click-refusal
// substring, and that was too weak to carry the claim: a guard that refused every
// non-click interaction with any other wording satisfies an absence check while
// disabling hover and focus completely. The assertion is POSITIVE now — the exact
// URL-guard message, which only a request that cleared the click guard can reach.
//
// Stated rather than papered over: this fixture cannot prove hover and focus reach
// a real browser, because a private URL is refused at validation before anything
// launches. What it proves is that the click guard is not what refused them. The
// executing half is covered by the local build's real launch at the end of this
// file; a hosted equivalent would mean navigating a live third-party page from a
// unit suite.
const URL_GUARD = 'The hosted endpoint only audits public http(s) URLs.';
const ALLOWED = [
  ['hover only', [hover('#a')]],
  ['focus only', [focus('#a')]],
  ['hover and focus together', [hover('#a'), focus('#b')]],
  ['no interactions at all', undefined]
];
for (const [label, interactions] of ALLOWED) {
  test(`the hosted build does not apply the click refusal to ${label}`, async () => {
    const args = interactions === undefined ? { url: FIXTURE_URL } : { url: FIXTURE_URL, interactions };
    const { isError, text } = await call(remoteServer, 'audit_url', args);
    assert.ok(!text.includes(REFUSAL), `the click guard over-refused ${label}: ${text.slice(0, 300)}`);
    assert.equal(isError, true, `the fixture URL is private, so this must still be refused: ${text.slice(0, 300)}`);
    assert.ok(text.includes(URL_GUARD),
      `expected the URL guard (proving the click guard passed it through), got: ${text.slice(0, 300)}`);
  });
}

test('the hosted build refuses a click without ever reaching the URL guard', async () => {
  // Ordering, not decoration: the click is refused on its own terms rather than
  // incidentally rescued by the URL being unreachable, which is what makes the
  // refusal true for a PUBLIC url too — the case the reviewer actually ran.
  const { text } = await call(remoteServer, 'audit_url', { url: FIXTURE_URL, interactions: [click('#a')] });
  assert.ok(text.includes(REFUSAL));
  assert.ok(!/public|not reachable|hosted endpoint only accepts/i.test(text.replace(REFUSAL, '')),
    'the click refusal must not be the URL guard wearing a different message');
});

// ── The description is derived from the same table ──────────────────────────
test('the hosted description states that clicks are refused', () => {
  const d = toolOf(remoteServer, 'audit_url').description;
  assert.ok(d.includes(DERIVED_SENTENCE), 'the remote description must carry the derived sentence');
  assert.equal(d.indexOf(DERIVED_SENTENCE) + DERIVED_SENTENCE.length, d.length,
    'the derived sentence is appended, so it must be last');
});

test('the local description does not claim clicks are refused', () => {
  const d = toolOf(localServer, 'audit_url').description;
  assert.ok(!d.includes(DERIVED_SENTENCE), 'local stdio still drives clicks; saying otherwise would be false');
});

test('the hosted description is the local one plus exactly that sentence', () => {
  // This is what keeps manifest.json still: sentence 1 is byte-identical, and the
  // whole delta between the two builds is the appended clause.
  const local = toolOf(localServer, 'audit_url').description;
  const remote = toolOf(remoteServer, 'audit_url').description;
  assert.equal(remote, local + ' ' + DERIVED_SENTENCE);
});

// ── The local direction ─────────────────────────────────────────────────────
test('the local build does not refuse a click', () => {
  // It fails for its own reasons (the fixture URL is not listening, or chromium
  // is absent) — what is asserted is that it is NOT the hosted click refusal, in
  // every environment. Run in a CHILD so no remote:true build has ever touched
  // this process; see the latch note at the top of the file.
  const code = `
    const { buildServer } = await import(${JSON.stringify(DIST)});
    const { FsTasteStore } = await import(${JSON.stringify(STORE)});
    const s = buildServer({ remote: false, tasteStore: new FsTasteStore() });
    const t = s._registeredTools['audit_url'];
    const p = t.inputSchema.safeParse({ url: ${JSON.stringify(FIXTURE_URL)}, interactions: [{ selector: '#a', event: 'click', delay_ms: 0 }] });
    if (!p.success) throw new Error('fixture rejected by audit_url own schema');
    const r = await t.handler(p.data, { signal: new AbortController().signal });
    process.stdout.write('RAVEN_TEXT:' + r.content.map((c) => c.text).join(' ').replace(/\\s+/g, ' '));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8', timeout: 120000, env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' }
  });
  const marker = out.indexOf('RAVEN_TEXT:');
  assert.ok(marker !== -1, `the child produced no result marker, so it measured nothing: ${out.slice(0, 300)}`);
  const text = out.slice(marker + 'RAVEN_TEXT:'.length);
  assert.ok(!text.includes(REFUSAL), `local stdio must still accept clicks, got: ${text.slice(0, 300)}`);
});
