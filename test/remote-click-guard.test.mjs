// audit_url drives a real browser at a URL the caller names. On the HOSTED endpoint it
// no longer runs at all, and that is the subject of this file.
//
// Nothing about the tool is unsafe there; it is too slow to finish. One run walks every
// requested viewport and theme, and was MEASURED at 95s in its cheapest single-viewport
// single-theme configuration and past 120s at its defaults — longer than any hosted MCP
// client waits. So the endpoint returned timeouts rather than results, which is the "test
// cases did not produce correct results" half of OpenAI's 2026-08-19 rejection. `url` is
// REQUIRED by audit_url's schema, so putting that one param in REMOTE_ARG_GUARDS turns
// the hosted tool into one that is still REGISTERED — the anonymous 45-name surface is
// frozen and dropping a tool would move it — and always DECLINES, in ~200ms, naming the
// two routes that do work. A decline is a true answer; a timeout is not an answer at all.
//
// WHAT THIS FILE USED TO BE, and why the change is not a deletion of coverage. It was the
// hosted CLICK guard's suite: audit_url ran remotely, refusing only {event:"click"} while
// hover and focus still drove the page. That guard is still in the source and is now
// UNREACHABLE remotely — the arg guard runs first in the same wrapper — so no fixture can
// construct an input that reaches it and no assertion here pretends to. A test whose
// mechanism cannot be triggered is a comment; the guard's own comment says so instead.
//
// THREE properties this file exists to keep from drifting apart:
//   (1) the ENFORCEMENT lives at the shared registration wrapper in buildServer, so a
//       future second registration path cannot bypass it;
//   (2) the remote DESCRIPTION is the guard's OWN message, byte-identical to what the
//       wrapper returns — asserted by comparing the two strings, not by transcribing one;
//   (3) the ANNOTATIONS are derived from the same table. audit_url used to be an
//       unconditional "fires caller interactions", and leaving it that way would have had
//       the endpoint publish readOnly:false / destructive:true / idempotent:false for a
//       tool that can only decline — the annotation-does-not-match-behaviour finding this
//       remediation exists to remove, reintroduced by the fix for it.
// All three are asserted in BOTH directions, plus over-refusal controls: a guard that
// refused everything, or refused on every surface, would satisfy the decline half alone.
//
// Every call goes through the tool's own zod schema (safeParse, then handler) so a fixture
// the schema would reject is a HARD FAILURE of the fixture rather than a silent pass. That
// is not hypothetical: the first draft of the local-direction probe omitted the required
// `delay_ms` and measured nothing.
//
// Measured matrix: .claude/openai-rejection-2026-08-19/click-mutants.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildServer } from '../dist/index.js';
import { FsTasteStore } from '../dist/taste-store.js';

// setRemoteRuntime() is a ONE-WAY PER-PROCESS LATCH, so the moment this file builds a
// remote server every later browser-launching call in this process -- including the local
// build's -- routes through the remote playwright-core / @sparticuz stack and leaks an
// egress-proxy handle that hangs the runner AFTER the last test reports green. Measured
// here: all 15 tests printed pass and the process never exited. So the one assertion that
// actually INVOKES audit_url locally runs in a child process, which is this repo's house
// pattern (test/user-systems.test.mjs). Reading a local DESCRIPTION or annotation is safe
// in-process -- the latch only reaches the browser path.
// NO TEST IN THIS FILE MAY LAUNCH A BROWSER. Correct code never gets near one -- every
// hosted call here is refused by the arg guard before the handler is entered -- but a
// mutant that DELETES that guard makes the five decline cases below fetch PUBLIC_URL for
// real, and audit_url was measured at 95s at its cheapest configuration. Five of those is
// not a red test, it is a run nothing can grade.
//
// MEASURED INERT ON THIS HOST, and kept anyway. On macOS the hosted path never reaches an
// executable lookup at all: the remote build loads @sparticuz/chromium, a Linux/Lambda
// ELF, and dies `spawn ENOEXEC` in ~120-200ms. On Linux -- CI, or anyone re-running this
// matrix on the platform the endpoint actually deploys to -- that binary RUNS, and this
// line is the only thing between an under-refusal mutant and five real 95s page loads
// against example.com. It weakens nothing in either place: a build that correctly
// declines never reaches launch, so the pristine suite cannot see it.
process.env.PLAYWRIGHT_BROWSERS_PATH = new URL('./fixtures/no-browsers-on-purpose', import.meta.url).pathname;

const DIST = pathToFileURL(new URL('../dist/index.js', import.meta.url).pathname).href;
const STORE = pathToFileURL(new URL('../dist/taste-store.js', import.meta.url).pathname).href;

// The old hosted click refusal. Nothing may reach it remotely any more, and the local
// build must never emit it -- both directions are asserted below.
const CLICK_REFUSAL = 'Click interactions are disabled on the hosted (remote) endpoint';
const DECLINE = 'audit_url is disabled on the hosted (remote) endpoint';
// A PUBLIC url, on purpose: this is the shape the reviewer actually submitted, and the
// decline has to be true for it rather than incidentally rescued by an unreachable host.
const PUBLIC_URL = 'https://example.com/';
// Not a public host. Used only to prove ORDERING -- the arg guard answers first, so the
// private-URL guard downstream never gets to.
const PRIVATE_URL = 'http://127.0.0.1:9/nothing';
const URL_GUARD = 'The hosted endpoint only audits public http(s) URLs.';
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

// ── Registered, not dropped ─────────────────────────────────────────────────
test('audit_url is still REGISTERED on the hosted build', () => {
  // Declining is a behaviour change; dropping the tool would be a SURFACE change,
  // and the anonymous 45-name set is hash-frozen. This is the assertion that says
  // which of the two was done.
  assert.ok(remoteServer._registeredTools['audit_url'], 'dropping it would move the frozen 45-name hash');
});

// ── The annotations, per surface ────────────────────────────────────────────
test('the hosted audit_url is published read-only, idempotent and closed-world', () => {
  const a = toolOf(remoteServer, 'audit_url').annotations;
  // It cannot run: every call returns the guard message pre-handler. So it reads
  // nothing, writes nothing, repeats identically, and never leaves the machine.
  assert.equal(a.readOnlyHint, true, 'a tool that can only decline reads nothing and writes nothing');
  assert.equal(a.destructiveHint, false);
  assert.equal(a.idempotentHint, true, 'declining twice leaves the same state as declining once');
  assert.equal(a.openWorldHint, false, 'the hosted build blocks its only route to the open web');
});

test('the local audit_url is published NEITHER read-only NOR idempotent', () => {
  const a = toolOf(localServer, 'audit_url').annotations;
  // Local stdio still drives a real browser at a caller-named url with a
  // caller-supplied interaction list. Playwright hover and focus dispatch real
  // events, so the page runs its own mouseenter/focus handlers (src/capture.ts:499),
  // and a handler can call .click() itself or fire a same-origin request.
  assert.equal(a.readOnlyHint, false, 'readOnlyHint must be an explicit false');
  assert.equal(a.idempotentHint, false, 'idempotentHint must be an explicit false');
  // destructiveHint is TRUE for the same reason readOnlyHint is false (Sol round 5,
  // P1-2): a caller-named hover or focus runs the third-party page's OWN handler, and
  // nothing here can know what that handler does. Publishing `false` would be a positive
  // claim that any update is additive, which cannot be made about arbitrary third-party
  // code. Do not "restore" it to false on the grounds that the side effect belongs to the
  // page -- that is the argument already refused one line up for readOnlyHint.
  assert.equal(a.destructiveHint, true, 'a caller-named interaction runs page code of unknown effect');
  assert.equal(a.openWorldHint, true, 'local stdio reaches whatever host the caller names');
});

// ── The scoping is PER SURFACE, not per tool name ────────────────────────────
// toolFiresCallerInteractions() answers a question about the SURFACE: does this
// build let the caller fire interactions at a page it named -- and it answers it by
// READING REMOTE_ARG_GUARDS, so it cannot disagree with what the wrapper enforces.
// audit_page has always worked this way: the hosted endpoint rejects its `url`
// outright, so hosted audit_page grades pasted HTML and is genuinely read-only, while
// the LOCAL build drives a real browser at a caller-supplied url with a caller-supplied
// interaction list exactly as audit_url does. Covering only one of the two would be the
// fix-one-of-two-call-sites drift this repo documents elsewhere, so both directions are
// pinned here: a future edit that narrows the helper to one tool turns a local half red,
// and one that widens it to every build turns a hosted half red.
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

// ── The decline ─────────────────────────────────────────────────────────────
const DECLINED = [
  ['a bare url, which is the shape the reviewer submitted', { url: PUBLIC_URL }],
  ['a click-only interaction list', { url: PUBLIC_URL, interactions: [click('#a')] }],
  ['a hover-only interaction list', { url: PUBLIC_URL, interactions: [hover('#a')] }],
  ['a focus-only interaction list', { url: PUBLIC_URL, interactions: [focus('#a')] }],
  ['the cheapest configuration there is', { url: PUBLIC_URL, viewports: [{ w: 1440, h: 900, label: 'desktop' }], themes: ['light'], scroll_settle: false, compact: true }]
];
for (const [label, args] of DECLINED) {
  test(`the hosted build declines ${label}`, async () => {
    const { isError, text } = await call(remoteServer, 'audit_url', args);
    assert.equal(isError, true, `expected a decline, got: ${text.slice(0, 200)}`);
    assert.ok(text.includes(DECLINE), `expected the audit_url decline, got: ${text.slice(0, 300)}`);
    // A decline that names no route out is a dead end, which is worse than a timeout
    // for the agent on the other side: it cannot tell "never" from "not right now".
    assert.ok(/raven-mcp/.test(text), 'the decline must name the local route out');
    assert.ok(/audit_page/.test(text), 'the decline must name the hosted alternative');
    assert.ok(!text.includes(CLICK_REFUSAL), 'the click guard is unreachable now and must not answer');
  });
}

test('the hosted decline answers BEFORE the private-URL guard', async () => {
  // Ordering, not decoration. If the URL guard answered first, the decline would be
  // true only for hosts that happen to be unreachable -- and the reviewer submitted a
  // public one. Asserting the URL guard's exact message is ABSENT is what proves the
  // arg guard is the thing that answered.
  const { isError, text } = await call(remoteServer, 'audit_url', { url: PRIVATE_URL });
  assert.equal(isError, true);
  assert.ok(text.includes(DECLINE));
  assert.ok(!text.includes(URL_GUARD), 'the arg guard runs first, so the URL guard must never be reached');
});

// ── Over-refusal controls ───────────────────────────────────────────────────
// Without these, a guard that refused every hosted call, or refused audit_url on every
// surface, would satisfy every assertion above.
test('the guard is keyed per TOOL: another url-taking hosted tool still runs', async () => {
  // audit_contrast is on the anonymous 45 and takes a url. It is NOT arg-guarded, so a
  // private URL reaches the downstream URL guard and gets ITS message -- which is only
  // reachable by a call that was not declined outright.
  const { isError, text } = await call(remoteServer, 'audit_contrast', { url: PRIVATE_URL });
  assert.equal(isError, true, `the fixture URL is private, so this must still be refused: ${text.slice(0, 300)}`);
  assert.ok(text.includes(URL_GUARD), `expected the URL guard, got: ${text.slice(0, 300)}`);
  assert.ok(!text.includes(DECLINE), 'the audit_url decline must not have leaked onto another tool');
});

// The ANNOTATION side of the same over-refusal direction, and it is a separate guard
// rather than a restatement. `openWorldHint` is derived from remoteBlocksNetwork(), so a
// derivation that answers "blocked" for EVERY tool publishes the whole hosted surface as
// closed-world -- including the tools that genuinely do fetch the caller's URL there. That
// mutant (D9) left every assertion in this file green until this test existed: the local
// annotations are gated behind `remote &&` and short-circuit before the derivation is ever
// consulted, so nothing in the local direction can see it either. audit_contrast and
// audit_tap_targets are on the anonymous 45, take a `url`, are NOT arg-guarded, and reach
// the open web on the hosted endpoint -- so openWorldHint:true is the true annotation and
// is what separates them from audit_url one line above.
test('a hosted tool that DOES reach the open web still says so', () => {
  for (const name of ['audit_contrast', 'audit_tap_targets']) {
    const a = toolOf(remoteServer, name).annotations;
    assert.equal(a.openWorldHint, true, `${name} fetches the caller's url on the hosted endpoint`);
  }
  assert.equal(toolOf(remoteServer, 'audit_url').annotations.openWorldHint, false,
    'and audit_url, which cannot, must differ from them -- otherwise this asserts a constant');
});

test('the guard is keyed per SURFACE: local audit_url carries no decline', () => {
  const d = toolOf(localServer, 'audit_url').description;
  assert.ok(!d.includes(DECLINE), 'local stdio still runs audit_url; saying otherwise would be false');
});

// ── The description IS the guard message ────────────────────────────────────
test('the hosted description is the local one plus the guard message VERBATIM', () => {
  // Two strings saying one thing drift the moment one of them is edited, so this does
  // not transcribe the sentence -- it takes the message the wrapper itself returned a
  // few tests above and asserts the description ends with exactly that. Change the
  // guard and both move together or this goes red.
  const local = toolOf(localServer, 'audit_url').description;
  const remote = toolOf(remoteServer, 'audit_url').description;
  assert.ok(remote.startsWith(local + ' '), 'the hosted description is the local one plus an appended clause');
  const appended = remote.slice(local.length + 1);
  assert.ok(appended.startsWith(DECLINE), `the appended clause must be the guard message, got: ${appended.slice(0, 120)}`);
});

test('the appended clause is byte-identical to what a hosted call returns', async () => {
  const local = toolOf(localServer, 'audit_url').description;
  const remote = toolOf(remoteServer, 'audit_url').description;
  const { text } = await call(remoteServer, 'audit_url', { url: PUBLIC_URL });
  assert.equal(remote.slice(local.length + 1), text,
    'the description and the refusal are ONE string; a copy of it would drift');
});

test('the append is derived from the table, not written for audit_url', () => {
  // audit_page is arg-guarded for an unrelated reason (url-capture is an SSRF/file
  // oracle, not a latency problem). Its hosted description must carry ITS OWN message
  // for the same reason audit_url's carries its own -- which is what says the append
  // reads the table rather than naming one tool.
  const local = toolOf(localServer, 'audit_page').description;
  const remote = toolOf(remoteServer, 'audit_page').description;
  assert.ok(remote.startsWith(local + ' '));
  assert.ok(remote.slice(local.length + 1).startsWith('audit_page url-capture is disabled'),
    'audit_page must carry its own guard message, not audit_url\'s');
});

// ── The local direction ─────────────────────────────────────────────────────
test('the local build neither declines nor refuses a click', () => {
  // It fails for its own reasons (the fixture URL is not listening, or chromium is
  // absent) -- what is asserted is that it is NEITHER hosted refusal, in every
  // environment. Run in a CHILD so no remote:true build has ever touched this process;
  // see the latch note at the top of the file.
  const code = `
    const { buildServer } = await import(${JSON.stringify(DIST)});
    const { FsTasteStore } = await import(${JSON.stringify(STORE)});
    const s = buildServer({ remote: false, tasteStore: new FsTasteStore() });
    const t = s._registeredTools['audit_url'];
    const p = t.inputSchema.safeParse({ url: ${JSON.stringify(PRIVATE_URL)}, interactions: [{ selector: '#a', event: 'click', delay_ms: 0 }] });
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
  assert.ok(!text.includes(CLICK_REFUSAL), `local stdio must still accept clicks, got: ${text.slice(0, 300)}`);
  assert.ok(!text.includes(DECLINE), `local stdio must still run audit_url, got: ${text.slice(0, 300)}`);
});
