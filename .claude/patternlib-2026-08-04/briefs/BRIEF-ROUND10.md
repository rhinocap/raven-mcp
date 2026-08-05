# Sol round 10 — adverse falsification pass

You are an adversarial reviewer. Your job is to **refute** the claims below, not
to confirm them. Report only — do not edit any file. **Default to FAILS when you
are uncertain.** A claim that you cannot actively verify from the code has not
survived.

Repo: `/Users/accunliffe/projects/raven-mcp` (public, Apache-2.0, real external
consumers; the remote endpoint handles real user identities).

Round 9's verdict was `DOES NOT SURVIVE` — C1 survived, C2/C3/C4 failed. Round 10
is the disposition of those three failures. Your job is to check whether the
dispositions are real or cosmetic, **and whether any of them introduced a new
defect**. Round 9's C3 fix was itself a regression that shipped through a full
green suite, so treat "the tests pass" as worth nothing here.

---

## C1 — The IME guard now separates BOTH commit orderings without eating a send

Files: `browser/raven-grab.js` (~line 370–470), mirrored byte-identically to
`web/public/raven-grab.js`. Test: `test/grab-overlay-key-isolation.test.mjs`.

The claim: `ravenCompositionEndedAt` arms **only** when `compositionend` was not
preceded by a commit Enter (`key === "Enter" && isComposing === true`), tracked
in `ravenCommitEnterAlreadySeen`. This is asserted to (a) preserve the WebKit
bug-165004 fix, where `compositionend` precedes the commit Enter, and (b) stop
swallowing a deliberate Enter on conforming browsers, where the commit Enter
precedes `compositionend`.

Attack it:
- Find an event ordering, on any real browser or IME, where this eats a
  deliberate send or lets a stray commit through. Enumerate the orderings you
  consider; do not stop at the two named.
- `ravenCommitEnterAlreadySeen` is assigned on every keydown. Is there a path
  where it is set and then never cleared, or cleared when it should not be?
  What about a keydown that fires with no `compositionend` ever following?
- The `compositionend` listener returns early when the flag is set — but it
  returns **before** `ravenCompositionEndedAt` is touched. Is there a state where
  a previously-armed marker survives across a composition it should not?
- Both listeners are window-capture. Does registration order between them, or
  against the narrow capture guard and the host bubble guard, matter? Can a
  page's own `compositionend` handler perturb this?
- The mouse-selected-candidate residual is documented in the comment. Is the
  documented scope actually correct, or is it wider than stated?
- Does anything here regress the Android `keyCode 229` case, the Escape/Tab
  passthrough, or Raven's own chords?

## C2 — The Fetch Metadata cost comment is now accurate

File: `src/grab-bridge.ts`, the comment immediately above `var fetchDest` /
`topLevelGet` (~line 1319–1345).

The claim: a metadata-less browser still receives the full jar on a same-origin
POST (Origin is set on every non-GET) and on any in-page link or subresource
(Referer present); the failure is confined to a request with no metadata, no
Origin and no Referer — a bare top-level navigation — which loses the Lax jar,
and an unattributed `Set-Cookie` parses as Lax so that is the session cookie.

Attack it: **this comment has now been wrong twice, in opposite directions.**
Re-derive every sentence against the actual `crossSite` ladder and
`proxyCookieHeader`. Name any case where the comment overstates or understates
what the code does. Check the claim about `Origin` on non-GET, the claim about
`Referer` on subresources, the claim that `Secure; SameSite=None` still rides,
and the claim that a reload from the resulting page works. Check the stated
default of `sameSite` in the parser.

## C3 — The tests now ENCODE the boundary rather than detect it

Files: `test/grab-bridge-proxy-round4.test.mjs`,
`test/grab-bridge-proxy-round7.test.mjs`, `test/grab-bridge-proxy-round8.test.mjs`.

Three changes are claimed:
1. Round 4 gained a cross-site `mode: navigate` request with **no**
   `sec-fetch-dest`, asserted to keep only `none=1`. Claimed to be the only case
   that separates the `dest === "document"` allowlist from a
   `dest !== "iframe"` denylist.
2. Round 7 gained a POST carrying `sec-fetch-mode: cors` with no
   `sec-fetch-site`, asserted to get no Strict cookie.
3. Round 8's fixture upstream now sends `Set-Cookie` on the **first response
   only**, the iframe test's jar control moved to run **before** the assertion it
   defends, and the nested-destination loop gained controls on both sides.

Attack it:
- Is claim 1 true? Find any *other* existing assertion that already separated
  allowlist from denylist. If one exists, the new case is redundant and the
  justification is wrong.
- For each changed test, name a product mutation that the test still **cannot**
  detect. Be specific: give the code edit.
- Does the seed-once fixture break any other test in that file by removing a
  re-population it silently depended on?
- Round 8's upstream is plaintext http, so a `Secure` cookie is unsendable there.
  Does any assertion in that file depend on a cookie that can never be sent,
  making it vacuous?
- Are the new controls themselves falsifiable, or do they pass on an empty jar
  too?

## C4 — The private-path gate closes the leak class

File: `test/no-private-paths.test.mjs` (new), plus `.gitignore`.

The claim: after three failed globs (directory → agent filename → extension), the
gate now matches **content** — an absolute path into `/Users/<name>/.{claude,
codex,agents,gstack,cursor}` in any tracked text file — and this covers the class.

Attack it:
- Name a private-context leak that this gate does **not** catch. Private prose
  with no absolute path? A different tooling directory? A base64 or otherwise
  encoded path? A file extension in `SKIP_EXT` that can hold text?
- The gate skips files >8MB and anything containing a NUL. Is either an escape?
- `KNOWN_PUBLISHED` is capped at 1 by a test. Is the cap enforceable, or trivially
  edited alongside a new entry?
- Does the gate actually run in `npm test`? Confirm the glob picks it up.
- Is the tilde exclusion sound, or does it leave a real disclosure uncovered?

---

## Frozen surfaces — check these were not disturbed

- stdio MCP behavior byte-identical; tool count **108**.
- Anonymous remote tool set **45**, sha256 of newline-joined sorted names =
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`.
- `browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical.
- No new tool registered; `TOOL_ACCESS` / `REMOTE_GATED_TOOLS` untouched.
- Nothing private newly committed.

## Reported verification (re-derive, do not trust)

- `RAVEN_NO_USAGE_LOG=1 npm test` → 1249 tests / 1246 pass / 0 fail / 3 skipped.
- `node test/e2e-pattern-library.mjs` → 33/33, exit 0.
- Each fix proven falsifiable by reverting it and observing exactly the intended
  tests go red.

## Output format

For each claim: `SURVIVES` or `FAILS`, with the specific file, line, and the
concrete failing input or code edit. Then a one-line `OVERALL:`. Include any
defect you find that is outside the four claims.
