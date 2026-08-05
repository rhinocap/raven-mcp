# Round 9 adverse pass — falsify, do not confirm

You are the adversarial reviewer. Your job is to REFUTE the claims below, not to
agree with them. Report only — make no edits. If a claim survives your best
attack, say so and say what you attacked it with. Default to "fails" when you are
uncertain: a false alarm costs one round, a missed hole ships.

Repo: `/Users/accunliffe/projects/raven-mcp` (public, Apache-2.0). Read the
working tree at HEAD (`b332f9a`). Round 9 is the disposition of YOUR round-8
verdict, which was `DOES NOT SURVIVE — G1 and G3 hold; G2 and G4 fail, and the
tests encode rather than detect both key boundary mistakes.`

## Context you need

`src/grab-bridge.ts` runs a local HTTP proxy on 127.0.0.1:<port>. It fetches a
third-party site (e.g. github.com) upstream, injects the Raven overlay
(`browser/raven-grab.js`) before `</body>`, and serves the result from its own
loopback origin so the designer can select elements on a real site. Because the
bridge strips `sec-fetch-*` and rewrites `Origin` on the way UPSTREAM (so
Origin-gated SaaS answers at all), upstream can no longer distinguish cross-site
from same-origin — so SameSite semantics are enforced in `proxyGrabRequest` or
nowhere. That is the whole reason the cookie jar logic exists.

Proxy mode is capture-only by design: the authoring routes are withheld from a
proxied third-party origin, and no `batchCommit` ever arrives.

## The four claims to attack

**C1 — Lax now requires a top-level destination.**
`src/grab-bridge.ts`, the `topLevelGet` computation. Lax cookies are released only
when `method === "GET"` AND `sec-fetch-mode === "navigate"` AND
`sec-fetch-dest === "document"`. Round 8 checked mode alone, so a foreign page's
`<iframe src="http://127.0.0.1:PORT/action">` — cross-site + navigate, and
differing from a real top-level load only in `Sec-Fetch-Dest: iframe` — was handed
the whole Lax jar.

Attack this specifically:
- Is `document` the COMPLETE top-level signal, or does some real top-level
  navigation carry a different `Sec-Fetch-Dest`? Consider `fencedframe`, prerender
  / speculation-rules navigations, `Sec-Fetch-Dest: empty`, view transitions, a
  browser that sends `mode` but omits `dest`, and any UA that sends `dest` values
  outside the current fetch spec. An allowlist of one value is deliberately
  conservative — but name any case where it wrongly DENIES a genuine top-level
  load, and say whether that is a real-world outage or a theoretical one.
- Is there any other path in the file that releases the Lax jar without passing
  through `topLevelGet`? Read every `SameSite`/`Lax` reference, not just this one.
- Is GET-only correct? A form POST is a top-level navigation too. Does excluding
  it lose anything a real site needs, or is it correctly conservative?

**C2 — the metadata-less cost is now stated honestly.**
The comment above `topLevelGet` previously claimed a browser with no Fetch
Metadata only loses Lax on its first load, because later navigations carry a
Referer. That was false and is now corrected to say the user can be bounced to a
login screen mid-session. Attack the CURRENT text: is it still overclaiming or
underclaiming anywhere? Does the accepted cost match what the code actually does?

**C3 — an IME commit is separated from a deliberate send.**
`browser/raven-grab.js` (mirrored byte-identically to `web/public/raven-grab.js`).
Background: the overlay deliberately does NOT treat `keyCode === 229` as a
composition signal, because Android stamps 229 on nearly every key including
Enter/Escape/Tab, and reading it as composition silently killed the send key on
that entire platform. The residual case that leaves uncovered is WebKit bug
165004: with the Japanese Hiragana IME, the Enter that COMMITS a candidate arrives
as `key: "Enter"`, `isComposing: false`, `keyCode: 229`, AFTER `compositionend`
has already fired — indistinguishable, by itself, from a deliberate press.

The fix tracks composition LIFECYCLE, not a clock:
- a `compositionend` listener in window capture records the time, but only when
  the event originates inside the Raven overlay;
- a bookkeeping `keydown` listener, also in window capture, CONSUMES that marker
  on the very next keydown whatever key it is, and sets a flag if that key was
  Enter and either `isComposing` was true or the marker was under 100ms old;
- the send handler (`onPanels("keydown", …)`) returns early when the flag is set.

Attack this specifically:
- Does consuming the marker on EVERY keydown open a new hole? Name a real
  sequence where a commit Enter is NOT the next keydown after `compositionend`
  and therefore still sends.
- Can the 100ms residual bound swallow a REAL send? Name the sequence.
- Is window-capture registration order actually load-bearing here, and is it
  guaranteed? The bookkeeping listener must see events the narrow capture guard
  is about to `stopImmediatePropagation`. Same node, same phase — is registration
  order sufficient, and is the injection order (overlay before `</body>`) enough
  to guarantee it against a site that registers its own window-capture listener?
- Is the guard in the RIGHT place? It sits in the send handler rather than the
  capture guard, on the reasoning that the named harm is clicking Send and Enter
  must keep reaching the page by design. Refute that placement if you can.
- Does the fix regress the Android case it was careful not to break?

**C4 — the tests detect rather than encode.**
Round 8's two navigation assertions both omitted `sec-fetch-dest`, so the iframe
attack passed them unchanged — the tests encoded the bug. Round 9 adds paired
document/iframe cases in `test/grab-bridge-proxy-round8.test.mjs`, a
frame/embed/object sweep, an iframe sibling in
`test/grab-bridge-proxy-round4.test.mjs` (that fixture's upstream is https, so it
can assert a `Secure; SameSite=None` cookie DOES ride cross-site), and an IME
assertion in `test/grab-overlay-key-isolation.test.mjs` whose observable is
`event.defaultPrevented` rather than a button click.

Round 7's two Fetch Metadata tests moved from `fetch` to `node:http` after
measuring that Node 26.5.0's `fetch` stamps `sec-fetch-mode` on every request AND
overwrites a supplied value (`navigate` arrives as `cors`) — so the suite named
"no Fetch Metadata at all" was in fact sending some.

Attack this specifically:
- Did round 9 NARROW anything rounds 4 / 7 / 8 used to catch? Diff the trigger
  set, not the prose: enumerate what each modified test caught before, and confirm
  each case still fires. Adding `sec-fetch-dest: document` to an existing
  assertion makes that request MORE specific — name anything that consequently
  stopped being covered.
- Is the round-8 iframe test's same-origin control actually proving the jar was
  live, or is it proving something weaker?
- Is `event.defaultPrevented` a faithful observable for "did not send", or can it
  be true for an unrelated reason?
- Are the new tests genuinely falsifiable? The claim is that neutralising the
  `dest === "document"` clause turns three tests red across rounds 4 and 8;
  deleting the send-handler guard fails the IME assertion; and holding the
  composition marker on a clock instead of consuming it on the next keystroke
  fails `a deliberate Enter stopped sending`. Verify by reading, and say if any
  of those three would in fact stay green.

## Frozen surfaces — flag any violation as P1

- stdio MCP behaviour must stay byte-identical; the tool count is 108 and did not
  move this round.
- the anonymous remote tool list is frozen at 45 tools, sha256 of newline-joined
  sorted names = `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
- `browser/raven-grab.js` and `web/public/raven-grab.js` must be byte-identical.
- this repo is PUBLIC and `.claude/` is tracked — flag any private content
  (home-directory paths, personal rule text, credentials) reachable in the commit.

## Output

For each of C1–C4: `SURVIVES` or `FAILS`, the specific attack you ran, and for a
FAILS the concrete sequence or input that breaks it. Then one overall verdict
line. Rank findings P1/P2/P3. Do not propose diffs — name the defect.
