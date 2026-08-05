ROLE: adverse falsification pass. REPORT ONLY — do not edit any file, do not run
builds, do not commit. Your job is to REFUTE the claims below, not confirm them.
Default to "not proven" when uncertain. Rank findings P1/P2/P3 with file:line and
a concrete failure scenario (inputs/state → wrong output). If a claim survives,
say so in one line and move on — do not pad.

REPO: /Users/accunliffe/projects/raven-mcp (public, Apache-2.0). Uncommitted
working tree. `dist/` is gitignored and is built from `src/`.

## The claims under test

**C1 — the overlay's keystroke boundary is correct and both guards are
load-bearing.**
- `browser/raven-grab.js` ~322: a `window` CAPTURE-phase listener on
  keydown/keypress/keyup. Filters to unmodified single printable characters
  whose `composedPath()[0]` is a typing target inside Raven (`ravenContainsNode`),
  then `stopImmediatePropagation()`. Never `preventDefault()`.
- `browser/raven-grab.js` ~1190: a shadow-host BUBBLE-phase listener that calls
  `stopPropagation()` on every key event.
- Claimed: the bubble guard is what fixes the reported github.com bug; the
  capture guard closes document-capture, which nothing on the host can reach;
  window-capture is a knowingly-accepted residual because the overlay is injected
  before `</body>` and same-node ordering is registration order.
- Attack surface for you: is the capture guard's filter wrong in a way that
  breaks a real site or breaks Raven itself? `event.key.length !== 1` — what
  about IME composition, dead keys, `keypress` where `key` is undefined, Android
  `Unidentified`/229? Does `stopImmediatePropagation` on `window` silence
  anything Raven itself registers on `window`? Is `ravenContainsNode` reachable
  at the time the guard fires (it is a function declaration used before its
  textual position — verify the hoisting actually holds inside whatever scope it
  is in, and that `settingsModal`/`host`/`shadow` are not TDZ `let`/`const` at
  first fire)? Can `composedPath()` be empty in a real path, making `origin`
  fall back to a retargeted `event.target` and silently disable the guard?

**C2 — `test/grab-overlay-key-isolation.test.mjs` makes each guard independently
falsifiable.** Claimed: deleting the capture guard turns test 1 red; deleting the
host guard turns test 3 red. Attack: is test 3's bubble assertion actually
sensitive to the host guard, or is something else producing the empty array? Are
the `t.skip` escapes narrow enough that a broken build fails instead of skipping?
Does `page.keyboard.type` with `delay: 5` actually exercise the code path a real
user does?

**C3 — `isProxyGrabSession()` + the proxy branch in `get_grabbed_elements` fixes
the drain protocol contradiction.** `src/grab-bridge.ts` (export near
`queueGrabSelection`), `src/index.ts` ~3159. Attack: is `currentSession.proxyTarget`
the right predicate — can a local session carry one, or a proxy session lack one?
Is the branch ordering right relative to the existing `grabbed.count > 0` branch?
Does anything else in the codebase still tell a proxied agent to wait for
`batchCommit` (search the tool descriptions and `start_grab_session` text)? Is the
new instruction actionable — do `capture_reference` and `map_reference_to_tokens`
exist and accept what the drain returns?

**C4 — the WebSocket `Origin` check in `proxyGrabUpgrade` closes the cookie-jar
bypass.** `src/grab-bridge.ts` ~1122. Claimed: browsers always send `Origin` on
an upgrade, so a mismatch is decisive; a missing `Origin` means a non-browser
client and is waved through deliberately. Attack: is waving through a missing
`Origin` actually safe here — name a browser-reachable path that omits it. Is the
expected-origin list complete (does the overlay page ever load from a hostname
other than `127.0.0.1`/`localhost` on that port)? Does `socket.destroy()` leak or
hang? Is the check placed BEFORE every use of the cookie jar on that code path,
or is there an earlier read? Are there OTHER unauthenticated routes on the bridge
that a foreign page can reach the same way (plain HTTP, not just upgrade)?

**C5 — verification numbers.** `RAVEN_NO_USAGE_LOG=1 npm test` = 1231/1228/0/3;
`node test/e2e-pattern-library.mjs` = ALL CHECKS PASSED (33); stdio tool count
108; live anon endpoint 45 tools hashing to `f64bb18…2bb0a6`. Attack the
METHOD, not the numbers: does anything in this change set move the stdio count,
the anon 45 set, or stdio byte-identity? Note `buildServer()` defaults to the
REMOTE server unless passed `{ remote: false, tasteStore: new FsTasteStore() }`.

## Out of scope — do not report

- Release/deploy mechanics (`release.sh`, `release.yml`, the stale apex `.mcpb`).
  Already dispositioned; deploy is human-gated.
- Anything requiring a push, publish, or Vercel deploy to fix.
- Style/naming/comment-length opinions.

## Output format

For each of C1–C5: SURVIVES or DOES NOT SURVIVE, then findings. End with a single
overall verdict line.
