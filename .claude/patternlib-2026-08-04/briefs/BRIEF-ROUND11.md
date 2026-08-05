# Sol round 11 — adverse falsification pass

You are an adversarial reviewer. Your job is to **refute** the claims below, not
to confirm them. Report only — do not edit any file. **Default to FAILS when you
are uncertain.** A claim you cannot actively verify from the code has not
survived.

Repo: `/Users/accunliffe/projects/raven-mcp` (public, Apache-2.0, real external
consumers; the remote endpoint handles real user identities).

Round 10's verdict was `DOES NOT SURVIVE — C1, C2, C3, and C4 all fail.` Round 11
is the disposition of all four. Check whether each disposition is real or
cosmetic, **and whether any of them introduced a new defect.** Two prior rounds
shipped a regression through a fully green suite, so treat "the tests pass" as
worth nothing here. Prefer arguing from the code and from event/HTTP semantics
over arguing from test output.

A note on environment: this repo's `test/capture.test.mjs` needs Chromium. If you
have none, those tests SKIP (that was itself a round-11 fix — see the last
section). Do not report a skip as a failure, and do not report a total test count
as evidence of anything.

---

## C1 — The IME guard no longer fires on a CANCELLED composition, no longer
## crosses element boundaries, and no longer leaks its decision through a global

Files: `browser/raven-grab.js` (~line 419–480), mirrored byte-identically to
`web/public/raven-grab.js`. Test: `test/grab-overlay-key-isolation.test.mjs`
(9 tests; needs real Chromium).

Round 10 found the round-9 guard armed on ANY `compositionend`. The UI Events
spec fires `compositionend` on cancellation too — Escape, blur, focus change,
IME dismissal — so an Escape-cancelled composition armed the marker and the very
next Enter was eaten as a "commit".

The claim, in three parts:
1. **Cancellation.** The marker arms only when `event.data` is a non-empty
   string. A cancellation carries empty `data`; a commit carries the committed
   text.
2. **Element scope.** The marker records `origin` from `composedPath()[0]` and
   the keydown only honours it when `pending.origin === ravenEventOrigin(event)`.
   Both sides use `composedPath()[0]` because from `window` a shadow-tree target
   retargets to the host, so `event.target` would make two elements inside the
   overlay indistinguishable.
3. **No global read.** The verdict is stamped on the event itself
   (`event.__ravenCompositionCommit`) in a window-capture keydown listener, and
   `ravenIsCompositionCommit` reads only the event. A module global would be
   readable by anything that runs between the bookkeeping listener and the send
   handler — including a page capture handler that synchronously dispatches
   another keydown.

Also: `compositionstart` clears both `ravenCommitEnterAlreadySeen` and
`ravenCompositionEnd`, so a commit in the PAGE's own field cannot disarm Raven's
next composition.

Attack it:
- Name an IME/browser pairing where a cancellation delivers non-empty `data`, or
  a commit delivers empty `data`. macOS Japanese/Chinese/Korean, Windows IME,
  Android GBoard, iOS. Reading the spec is not enough — say what actually ships.
- The 100ms `RAVEN_COMPOSITION_COMMIT_MS` bound: find a real machine or IME where
  the WebKit `compositionend` → keydown gap exceeds it (fix silently lost), or a
  path where a fast typist's *deliberate* Enter lands inside it (send eaten).
  Note the marker is also consumed on the next keydown regardless — argue whether
  ordering or the clock is load-bearing, and whether either alone suffices.
- `composedPath()` is empty for an event dispatched on a detached node, and the
  code falls back to `event.target`. Is there a path where the two listeners
  disagree about the origin, so a real commit is missed or a foreign one honoured?
- The window-capture keydown listener runs on EVERY keydown on the page,
  including in the site's own fields. It writes `event.__ravenCompositionCommit`
  on a page-owned event object. Is that observable to the page, and does it
  matter? Does it break a frozen/sealed event object anywhere?
- Registration order: `compositionstart`, `compositionend`, keydown-bookkeeping,
  the narrow capture guard, and the host bubble guard. Can a page script
  registering a window-capture listener BEFORE the overlay loads (the overlay is
  injected before `</body>`) defeat any of them? The comment claims one such case
  cannot be closed from inside the page — is that scope right, or wider?
- The comment documents three residuals. Find a fourth.

## C2 — The Fetch Metadata cost comment is now accurate

File: `src/grab-bridge.ts` (~1319–1360), the paragraph above the SameSite
classification in `proxyGrabRequest`.

Round 10 found the round-9 rewrite wrong in the opposite direction from the
round-8 version. The comment has now been rewritten a THIRD time and opens by
saying so. It now claims:
- `Origin` is set on every non-GET **and non-HEAD** request (the Fetch spec
  exempts both, not just GET).
- `Referrer-Policy: no-referrer` suppresses `Referer` on same-origin links and
  subresources too, not only cross-origin ones.
- A no-CORS POST under `no-referrer` sends `Origin: null`, which throws at
  `new URL("null")` and falls through to the cross-site default.
- A bare top-level navigation (address bar, bookmark) carries no `Origin` and no
  `Referer`, so it loses the Lax jar — and this is NOT limited to the first load.
- `Secure; SameSite=None` rides only over https (verified at
  `proxyCookieHeader:1772`).
- A reload recovers only if the page's referrer policy still emits a `Referer`.

Attack it: find a factual error, a browser that contradicts a claim, or a case
the paragraph implies is covered but is not. Check each claim against the actual
code path, not just against the spec — a true statement about the web that
misdescribes THIS code is still a failure. Then answer separately: does the
comment describe a boundary the code actually enforces, or is it still asserting
a guarantee the code cannot make?

## C3 — Three test gaps closed, each detecting rather than encoding

1. `test/grab-bridge-proxy-round4.test.mjs` — a `Sec-Fetch-Dest: fencedframe`
   navigation gets no Lax jar. The claim: this is the case that separates an
   allowlist of exactly `document` from an enumerated denylist of
   `iframe|frame|embed|object`, and round 8's existing loop does NOT separate
   them. (An earlier version of this comment claimed the opposite and was wrong;
   check the current one.)
2. `test/grab-bridge-proxy-round7.test.mjs` — a POST with `sec-fetch-mode:
   navigate` and no `sec-fetch-site` gets no Strict cookie. Claim: this pins the
   mutation `if (!fetchSite && fetchMode === "navigate") crossSite = false;`,
   which the existing `cors` case leaves green.
3. `test/grab-bridge-proxy-round9.test.mjs` (new, 2 tests) — the cookie jar is
   observed CHANGING: a session rotated three times, and a cookie deleted by an
   expired `Set-Cookie`. Claim: before this, making `storeProxyCookies` ignore
   every `Set-Cookie` once the jar is non-empty left every existing proxy test
   green while logout and session rotation were silently broken upstream.

Attack each: state a concrete one-line product edit that keeps the new test green
while breaking real behaviour. For (3), check whether the fixtures actually
exercise the jar's replace path or merely its insert path, and whether the
deletion test's control is load-bearing.

## C4 — The private-path gate closes the class rather than the last instance

File: `test/no-private-paths.test.mjs` (4 tests). Round 10 found the previous
gate scanned the WORKTREE, so staging a leaking blob and then cleaning the
worktree passed cleanly while the staged content is what publishes.

The claim: it now enumerates `git ls-files -s -z` (the INDEX), reads every blob
through a single `git cat-file --batch`, and matches
`/(?:\/Users|\/home)\/[A-Za-z0-9._-]+\/\.(?:claude|codex|agents|gstack|cursor)\b`
against the staged bytes. It asserts the batch walk did not desynchronise
(`contents.size === entries.length`), asserts the gate file scans ITSELF (its own
literals are split so it is not its own false positive), and freezes the
quarantine with `assert.deepEqual([...KNOWN_PUBLISHED], [])` — because a `<= N`
cap is not a quarantine when a new offender can take a departed one's slot.

Attack it:
- A private-context leak this does not catch. The header names four
  (prose with no absolute path; encoded/escaped forms; `$HOME` and Windows
  paths; `SKIP_EXT`/8MB/NUL skips) and says explicitly "do not read a green run
  as 'nothing private is committed'." Find a fifth, or show one of the four is
  understated.
- The `git cat-file --batch` framing: is the offset arithmetic correct for a blob
  containing the byte `0x0a` at the boundary, an empty blob, a missing OID, or a
  blob larger than `MAX_BYTES`? What happens if `git` writes a `<oid> missing`
  line?
- `maxBuffer` is 512MB. What is the failure mode when the repo exceeds it — a
  loud error, or a truncated scan that reports PASS?
- Submodules are filtered by `mode !== '160000'`. Anything else in the index this
  silently skips?
- Does the regex have a false-negative on a path with a character class it
  excludes (spaces, unicode, `~`)?

## Outside defect from round 10 — `test/capture.test.mjs`

`assert.rejects` swallows the original error and throws its own `AssertionError`
when the predicate returns false, so on a machine with no Chromium the
`overall_timeout_ms` test reported a hard FAILURE instead of letting `runOrSkip`
skip. The predicate now re-throws `CaptureUnavailableError` and returns a boolean
otherwise. Measured with `PLAYWRIGHT_BROWSERS_PATH` pointed at a nonexistent
directory: before, 1 fail; after, 0 fail / 13 skipped.

Attack: is the re-throw correct, or does it now mask a genuine failure that
happens to surface as `CaptureUnavailableError`? Are there other `assert.rejects`
call sites in the suite with the same shape?

---

## Frozen surfaces — confirm these are intact

- stdio tool count: 108. Anonymous remote: 45.
- Golden anon hash:
  `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`
  (sha256 of newline-joined sorted anonymous tool names).
- `browser/raven-grab.js` and `web/public/raven-grab.js` byte-identical.

Note `src/index.ts` falls back to `process.env.RAVEN_REMOTE` unless `opts.remote`
is an explicit boolean, so any probe must pass it explicitly.

## Output format

For each of C1, C2, C3, C4 and the outside defect: `SURVIVES` or `FAILS`, then
the concrete reason — an event ordering, an HTTP exchange, a one-line code edit
the tests miss, or a file the gate would pass. End with one line:
`OVERALL: SURVIVES` or `OVERALL: DOES NOT SURVIVE`.
