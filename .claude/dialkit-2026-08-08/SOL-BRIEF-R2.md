# Adverse pass — round 2, on the round-1 FIXES

Report-only. Do not edit any file. Your job is to REFUTE, not to confirm.

Repo: `/Users/accunliffe/projects/raven-mcp` (public, open-source MCP server).
Nothing here is committed or pushed. Working tree only.

Round 1 returned DOES NOT SURVIVE with four findings. All four were fixed. This
round grades the FIXES. A fix that trades one defect for a worse one, or that is
guarded by a test that cannot fail, is the outcome you are looking for.

## Read these

- `browser/raven-grab.js` — `formatBezierNumber` (~5292), the easing editor
  `beginStyleEdit` block (~6744–7080), especially `bindHandle`'s `cancelDrag`
  (~6986) and the preset handler (~7023).
- `test/grab-overlay-easing-control.test.mjs` — 11 tests, header carries a
  measured 13-mutant matrix.
- `test/grab-overlay-voice-alignment.test.mjs` — 3 tests, header carries a
  measured 6-mutant matrix.
- `CLAUDE.md` lines 5, 22, 23 (ledger + the two extended landmines).

## The four fixes, stated as claims to attack

**F1.** `formatBezierNumber` returns `String(n)` instead of rounding to three
decimals. Claim: rounding belongs at the point a PIXEL becomes a number
(`setEasingFromPointer`), not at the point a number becomes text, so a parsed
coordinate round-trips its author's literal and a dragged one was already
quantised at capture. Attack: can `String(n)` now emit something CSS rejects or
that a later parse changes — exponential notation (`1e-7`), `-0`, `Infinity`,
`NaN`, a 17-significant-digit float artefact? What is the actual reachable range
of `n` on both paths? Does any consumer of the committed string (DESIGN.md
write, token compare, payload) care about length or format?

**F2.** `cancelDrag` restores `easingPoints`, `input.value`, the drawing and the
preview state, snapshotted at pointerdown BEFORE that pointerdown's own preview.
Claim: the restore point must be this drag's start, not `previousValue`.
Attack: is the snapshot actually taken before anything mutates? Is
`rollbackPreviewState()` the correct inverse when the editor had NOT previewed
at drag start? Can `previewValue(dragStartValue)` fail and leave `previewed`
stale? What happens on pointercancel for a handle that was never dragged (no
pointermove)? What about a pointercancel arriving after pointerup? Two handles
dragged with two pointers? Does the restore interact with `pendingTokenPick` or
with a token-linked row?

**F3.** A source-enumeration test asserts every `voiceButtonMarkup(` call site
sits within 200 characters after one of three covered container openers, and
that there are exactly 8. Attack: is the 200-character reach and the
"most-recent opener wins" logic sound — can a covered opener 200 chars back
belong to a DIFFERENT element than the mic? Can a new mic be added in a covered
container and still render misaligned? Is the exclusion of the function
DEFINITION itself (`/function\s+$/` lookbehind on 12 chars) robust? Does reading
`RAVEN_GRAB_ASSET_PATH` open any hole in a normal run?

**F4.** The alignment suite probes Chromium once at module load and only skips
on a genuine `browserType.launch` / `Executable doesn't exist` failure. Attack:
can a partially-working Chromium make the probe succeed and the real tests fail
for an environment reason, reported as a product defect? Can the probe succeed
and a later launch fail (resource exhaustion) — is that failure or skip, and is
that the right answer? Does the probe's own self-check test measure anything?

## Cross-cutting

- Both matrices were re-run WHOLE. Are the recorded radii consistent with the
  test names? Is any "one mechanism, not two guards" claim in either header
  actually wrong?
- Is any comment in either file a CLAIM that is now false?
- The mirror `web/public/raven-grab.js` is asserted byte-identical. Is it?

## Output

For each finding: severity (P1/P2/P3), the file:line, a concrete input or
sequence that produces the wrong behaviour, and what the correct behaviour is.
End with a single line: `VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`.
Then `sol-exit`.
