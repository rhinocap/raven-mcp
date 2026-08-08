# Adverse pass — round 3, on the round-2 FIXES

Report-only. Do not edit any file. Your job is to REFUTE, not to confirm.

Repo: `/Users/accunliffe/projects/raven-mcp` (public, open-source MCP server).
Nothing is committed or pushed. Working tree only.

Round 2 returned DOES NOT SURVIVE with four findings. All four were addressed.
This round grades those responses. A fix that trades one defect for a worse one,
a test that cannot fail, or a header/ledger claim that is now false is the
outcome you are looking for.

## Read these

- `browser/raven-grab.js` — `isStyleValueControl` (~6464), `styleValueControlsInEditor`,
  `setStyleEditorTokenLinked`, `detachTokenFromStyleEditor`, and `bindHandle`'s
  pointerdown (~6978). The mirror `web/public/raven-grab.js` is asserted
  byte-identical.
- `test/grab-overlay-easing-control.test.mjs` — 12 tests, header carries a
  measured 15-mutant matrix (v4).
- `test/grab-overlay-voice-alignment.test.mjs` — 2 tests, header carries a
  measured 8-mutant matrix (v3).
- `CLAUDE.md` lines 5, 22, 23.

## The four responses, stated as claims to attack

**R1 (was P2, product).** The easing editor was the only style control exempt
from the row token lock. Fixed with TWO mechanisms: the preset `<button>`s join
`isStyleValueControl` so `setStyleEditorTokenLinked` disables them; the SVG
handles refuse in their own `pointerdown` on `data-token-linked === "true"`.
Claim: two mechanisms are REQUIRED, because `disabled` is meaningless on an SVG
element and `className` there is an `SVGAnimatedString`.

Attack: is the handle refusal at the right point — can a drag still be armed by
`pointermove`/`pointerup`, by keyboard, by touch, or by a pointerdown that
arrives while the row is unlinked and RELEASES after `detachTokenFromStyleEditor`
or a re-link? Does `detachTokenFromStyleEditor` correctly restore both halves,
and is there any path that sets `data-token-linked` without going through
`setStyleEditorTokenLinked`? Does refusing silently lose anything a user needs to
be told? Is the preset entry in `isStyleValueControl` reachable by any OTHER
consumer of that predicate where disabling is wrong? Is there a THIRD control in
the easing editor (the text input, the curve surface itself, a keyboard handler)
still exempt?

**R2 (was P2, test).** The source-enumeration rule was "a covered opener appears
in the 200-char window", which is blind to a container that opens and closes
before the mic. Replaced with a tag-depth walk requiring depth to return to zero
without going negative. Claim: this is falsifiable, proven by mutants A7 and A8,
and A8 is the load-bearing one because the old rule passed the WHOLE suite on it.

Attack: is the depth walk itself correct? Consider self-closing tags, void
elements not in `VOID_TAGS`, tags inside attribute VALUES or template-literal
expressions, comments, `<!-- -->`, a `>` inside an attribute string, nested
identical openers, and the `lastIndexOf` choice of "nearest covered opener". Can
a mic that is correctly aligned now FAIL (false positive)? Can a misaligned one
still pass? Is the 200-char window still doing anything, or is it now dead?

**R3 (was P3, test).** The probe self-check test was DELETED rather than
repaired, and the probe widened to launch → `newPage` → `goto` → close, with the
probe's error moved into each skip message. Claim: availability is a
module-level gate whose observable is the skip count plus the skip reason, not a
test of its own.

Attack: does anything now go unreported when the probe fails? Is a `goto` of
`about:blank` a meaningful widening or theatre? Can the widened probe fail for a
reason the real tests would not hit (false skip), and is a false skip worse than
the false pass it replaced? Note `test/capture.test.mjs:293` has the SAME
tautology and was deliberately left alone — is leaving it defensible, or does the
inconsistency itself now mislead?

**R4 (was P3, comment).** The E1/E6 note now says two mechanisms with one
observable, in both the test header and `CLAUDE.md` line 5.

Attack: is that actually true — are classification and `timingFunctionCount`
independently reachable, or does one strictly dominate? Is the same claim now
made about E14/E15, and is IT true? Any other header claim that is false?

## Cross-cutting

- Both matrices were re-run WHOLE. Do the recorded radii match what the code and
  test names imply? Any find-string anchor now stale?
- Full suite measured 1481 / 1478 / 0 / 3, exit 0 — and round 2 was +1 test and
  −1 test, so the total is unchanged. Is the ledger's accounting of that honest?
- Are the A4/A5 line numbers (8518, 8552) actually right in the current file?
- `CLAUDE.md` lines 22 and 23 were extended. Is any sentence there a claim the
  code does not support?

## Output

For each finding: severity (P1/P2/P3), the file:line, a concrete input or
sequence producing the wrong behaviour, and what the correct behaviour is.
End with a single line: `VERDICT: SURVIVES` or `VERDICT: DOES NOT SURVIVE`.
Then `sol-exit`.
