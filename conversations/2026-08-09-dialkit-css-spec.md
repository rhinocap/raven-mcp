# 2026-08-09 — DialKit → Raven Grab panel CSS spec

Per-instance log. Shared log for the day is `conversations/2026-08-09.md` (read-only).

## Where this left off

Spec work only. **Zero code changed.** `browser/raven-grab.js` was read many times and
never edited; `web/public/raven-grab.js` untouched, so the byte-identical mirror test is
not in play.

Changed file: `docs/grab-panel-css-spec.md`, **399 → 511 → 742 lines**. Working tree state is
`MM` (both staged and unstaged hunks, from the `auto-save-on-turn.sh` hook re-staging
mid-session — the usual reason `git show :<path>` is not provenance for anything here).

Blocker at the time of writing: **round 2 read and fully dispositioned; Sol adverse
round 3 not yet launched.** No completion language until it returns.

## What the spec is

A design-token migration for the Grab overlay's CSS, which lives entirely inside ONE
template literal in `browser/raven-grab.js` — `:host {` opens at :774, the literal closes
at :1564. Proposes `--raven-grab-space-*`, `--raven-grab-radius-*`, `--raven-grab-control-*`,
`--raven-grab-text-*`, `--raven-grab-leading-*` where today every value is a hardcoded
literal and the font-scale multiplier `calc(Npx * var(--raven-grab-font-scale))` is
retyped by hand at every call site.

The document splits itself honestly: **§1–§5 DERIVED** (a Raven-native scale, not from
DialKit) and **§6 TRANSCRIBED** (the only three visual-adjacent facts DialKit publishes —
`theme: light|dark|system`, `layout: popover|inline`, `position:` four corners). DialKit
publishes **no** spacing, type, radius or colour numbers, so there is nothing to port;
what it gave us is a prompt to build our own scale.

## Round 1 (Sol, DOES NOT SURVIVE — 2 × P1, 3 × P2, 1 × P3) — all six dispositioned

Raw log: `.claude/cssspec-2026-08-09/agent-output/sol-round1.log` (400,627 bytes).
Every claim was re-verified against `browser/raven-grab.js` directly rather than trusted
from Sol's self-report.

1. **P1 — mono blast radius.** §3.3 claimed the value-cell change was "the only change in
   §3 a user will notice". False twice over. Measured: `grep -c 'var(--raven-grab-mono)'`
   = **28 usages** (+1 definition at :789). Fixed by splitting the migration into
   **Phase A** (geometry tokens — 4 named pixels move, diffable by capture) and
   **Phase B** (the single `--raven-grab-mono` declaration — moves zero declared pixels,
   changes glyph metrics on all 28 sites). Landing them together makes the §5 capture diff
   unreadable. Land A, capture, land B, capture again.
2. **P1 — `:1095` shorthand.** The spec specified a bare `font-size` for the radius-field
   label, whose source declaration is
   `font: 600 calc(8px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); letter-spacing: -.01em;`
   — so a `font-size` edit either drops weight/line-height/family or leaves the old
   `calc()` in place and fails §5.4. Replaced with the full `font:` shorthand + tracking.
3. **P2 — §6.2 "snap/dock appear 0 times" was false.** Rewritten with real evidence:
   `mobileSheetDock` :332, `mobileSheetSnap` :354, `setMobileSheetDock` :2681,
   `setMobileSheetSnap` :2750, `nextDock` :2981. **The mobile sheet already snaps**
   (nearest of collapsed/half/full by absolute difference, plus top/bottom dock by
   midpoint — `endMobileSheetDrag` :2969–2986) while the **desktop rail does not**
   (`wirePanelDrag` :2907; `placePanel` :2884 writes `left` only; `endPanelDrag` releases
   and nothing else). So the missing behaviour is horizontal edge-snapping on the desktop
   rail, and **the pattern to copy is Raven's own `endMobileSheetDrag`, not DialKit's** —
   which makes the recommendation smaller and more internally consistent than the DialKit
   framing suggested.
4. **P2 — citations.** Pass one fixed three citations while *claiming* it had fixed all of
   §3, and that claim was false for a round. Pass two re-derived all eleven from `grep -n`
   on the selector itself: `:1074→:1075`, `:1090→:1089`, `:1097→:1095`, `:1101→:1098`,
   `:1112→:1104`, `:1119→:1110`, `:1122→:1112`, `:1125→:1117`, `:1128→:1125`, plus the §3
   range `1073-1130 → 1073-1127` and the §3.5 state range `:1102-1105 → :1099-1103`.
   Offsets were **not uniform** (0, 0, +1, +2, +3, +8, +9, +10 in pass one; −1 to −9 in
   pass two), so no formula would have worked — corrected one at a time.
5. **P2 — §5 not effect-sensitive.** Rewritten as four checks, each with an explicit
   `*Fails on:*` line naming an input that breaks it. Check 1 requires `git diff --stat` to
   list BOTH files non-empty before `npm test` (the mirror). Check 2 names four
   `getComputedStyle` reads. Check 3 replaced a family-list string read with a canvas
   advance-width measurement (`m('ii') === m('MM')`), because reading the family list only
   proves what was *requested*. Check 4 is bidirectional grep, scoped to
   `sed -n '1073,1127p'`.
6. **P3 — the 2px-vs-4px grid choice was unmeasured** ("~60%"). Computed over the 19
   distinct spacing values `{1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,28,32,36,44}`:
   **2px grid moves 5 of 19 = 26%**, **4px grid moves 10 of 19 = 53%**. Unit stated
   explicitly as DISTINCT VALUES unweighted by occurrence — and the caveat that §3's own
   four migrations total 5px of movement under *both* grids, so §3 alone cannot separate
   them; the justification is panel-wide.

Also fixed, not from Sol: the §0 table carried a malformed row asserting Raven already has
snap/dock, contradicting §6.2's body. Deleted. And my own off-by-one — I had reported 29
mono references; 28 usages + 1 definition.

Final stale-claim sweep came back clean: every surviving match for the old wording is a
deliberate, labelled quotation of a corrected statement (lines 82–85, 308, 457) or a claim
that is still true (441, `prefers-color-scheme` = 0, re-measured).

## Round 2

Brief: `.claude/cssspec-2026-08-09/BRIEF-R2.md` — 10 numbered claims, report-only.
Targets the round-1 fixes themselves: the 28-count, the Phase A/B split, the 26%/53%
measurement, the eleven re-derived citations, the `:1095` shorthand, §5's four
`*Fails on:*` lines, the §6.2 rewrite, and whether any DERIVED section smuggles in an
unsourced DialKit claim.

Launched detached: `codex exec --sandbox read-only -m gpt-5.6-sol -c model_reasoning_effort=medium`
→ `.claude/cssspec-2026-08-09/agent-output/sol-round2.log`.
(First attempt used `--dangerously-bypass-approvals-and-sandbox` and was blocked by the
auto-mode classifier; read-only is correct for a report-only pass anyway.)

## Round 2 (Sol, DOES NOT SURVIVE — 5 × P1, 4 × P2, 2 × P3) — all eleven dispositioned

Raw log: `.claude/cssspec-2026-08-09/agent-output/sol-round2.log` (352,176 bytes; the
`VERDICT:` line appears at 5560 and again at 5668). **Every one of the eleven was
independently confirmed** against `browser/raven-grab.js` or the live DialKit page —
none was refuted. Note the brief itself carried one error: BRIEF-R2 claim 7 said §5
check 3's `m('ii') === m('MM')` "must become false". The spec's "must be **true**" is
correct (equal advance widths = a mono face resolved) and was not changed. Do not carry
that inversion into any later brief.

1. **P1-1 — Phase A is not geometry-only.** §3.3 put `font-variant-numeric: tabular-nums`
   in Phase A, and §7 item 1 said "apply §2" wholesale. `tabular-nums` selects a different
   glyph set, so it moves rendered advance widths — exactly what Phase A exists to keep out
   of §5.2's four-pixel capture diff. Moved to **Phase B**; §3.4's exhaustive-pixel claim
   made explicitly conditional on that deferral; §7 items 1–2 re-scoped to §2A / §2B.
2. **P1-2 — the "verbatim before/after" blocks are lossy.** They are substitution lists,
   not complete rules, and replacing a rule wholesale from one would drop real
   declarations. Global note added to the §3 header naming the specific breakage
   (§3.2's source rule at :1078 also carries `display: block` — dropping it returns the
   category headings to grid layout), plus inline "substitution list, not a complete rule"
   labels on §3.3 and §3.4 enumerating each omitted declaration.
3. **P1-3 — §5 was not executable.** Four separate defects, all now fixed: (a) `$()` was a
   bare `document.querySelector` and the overlay lives behind an **open shadow root**
   (host `[data-raven-grab-overlay]`, `:393-400`), so every check-2/3 selector returned
   `null`; a `R = host.shadowRoot` helper is now mandatory and a `null` element is a
   declared FAIL, not a skip. (b) Check 2 read `.raven-grab-styles li`, but `renderPanel`
   pushes each category heading `<li>` *before* its rows (`:11648`), so the first `li` is
   always a category row whose `:first-child` padding-top is **2px** (`:1080`) — it failed
   on correct code; the selector is `li:not(.raven-grab-style-category)` now. (c) Two of
   check 2's four elements only exist under preconditions (edit mode; a token-linked row),
   now stated. (d) Check 4's `sed` and `grep` were unpiped, so the counts ran over all
   14,377 lines; piped now, plus a third leg (`var(--raven-grab-mono)` in-range must be
   exactly **4**) that catches a shorthand rewritten to drop its family.
4. **P1-4 — DialKit's prop is `mode`, not `layout`.** The page publishes
   `mode: 'popover' | 'inline'`. Fixed in §0 and in the §6.2 heading.
5. **P1-5 — the mobile detent claim was overstated; the height loop is inert.** The
   previous draft recommended porting `endMobileSheetDrag`'s three-detent nearest-target
   loop to the desktop rail. Reading `pointermove` (`:2960-2968`) against it: the drag
   writes `top` and `bottom: auto` and **never touches height**; height is written only by
   `setMobileSheetSnap` (`:2757`) into `--raven-grab-sheet-height` (`:853`), and
   `box-sizing: border-box` is global (`:790`). So at release
   `getBoundingClientRect().height` is still exactly `mobileSheetHeight(currentSnap)`,
   distance is 0, and the loop **re-selects the detent the sheet already had, every time**.
   The only gesture-dependent output is `nextDock` (`:2981`). Two narrow non-inert cases
   documented (a release inside the 200ms `transition: height` at `:854`, and a viewport
   resize between snap and drag) — both drift, not intent. Recommendation corrected: port
   `nextDock`'s **one-line midpoint test** onto `endPanelDrag` for the horizontal axis,
   driving the existing `data-side` attribute. The inert loop is not itself a bug (the
   detent it re-selects is the correct one) and deleting it is not specced here.
6. **P2-1 — the 19-value spacing inventory was a scoped subset.** Re-measured panel-wide:
   **23 positive spacing values / 16 radii / 30 sizes**. 2px grid moves 6 of 23 = **26%**,
   4px grid moves 13 of 23 = **57%**.
7. **P2-2 — the 28-count enumeration omitted :811, :1147, :1253.** Re-enumerated
   exhaustively with a 4-inside-§3 + 24-outside = 28 reconciliation.
8. **P2-3 — 44px is SC 2.5.5 (AAA), not SC 2.5.8.** SC 2.5.8 is the AA criterion at
   24×24 CSS px, which the overlay meets separately via the hit-slop at `:1102`. Citing
   2.5.8 would have justified a 44px floor with a 24px rule. Fixed in §2 and §4 item 4.
9. **P2-4 — four-corner placement is not trivial.** `:821` declares
   `position: fixed; top: 20px; right: 20px; bottom: 20px` — top **and** bottom are pinned,
   re-pinned at 12px (`:838`) and 10px (`:842`); `placePanel` (`:2884`) writes `right: auto`
   + `left` and stores a `top` in `el.__ravenPosition` that is never applied. Raven has
   **two** positions, not four. Bottom-anchoring is a different object needing a height, a
   scroll boundary and a resize story — and it is **independent** of edge-snapping rather
   than downstream of it, inverting the old claim. Explicitly not specced.
10. **P3-1 — "doubles the font payload" was unmeasured.** Fixed.
11. **P3-2 — the DialKit page contains no "read the component source" instruction.** Fixed.

### Two measurements taken rather than reasoned

Both via throwaway Playwright scripts written **inside the repo** (ESM resolves imports
from the script's own location, so a scratchpad script throws `ERR_MODULE_NOT_FOUND`),
deleted after.

- **`font-variant-numeric` empties the `font` shorthand.** The P1-1 fix I had just written
  would have broken §5 check 3 on *correct* post-Phase-B code. Measured in Chromium:
  without `tabular-nums`, `getComputedStyle(el).font` = `"11px / 15.4px Geist, monospace"`;
  **with** it, `""` — and assigning `''` to `canvas.font` is ignored, leaving the context on
  its `10px sans-serif` default, so the check would report a proportional face on a correct
  tree. This is the class of self-inflicted regression an adverse round exists to find: the
  defect was introduced by my own fix to an earlier finding, in the same session.
- **The longhand-built replacement works and discriminates.** Building
  `` `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` ``:
  `ui-monospace` gives `ii` 13.2021484375 === `MM` 13.2021484375; `-apple-system` gives
  5.564453125 vs 19.357421875. (Canvas normalises the weight out on read-back —
  `11px ui-monospace, monospace` — which is fine, since the check's claim is about which
  *family* resolved.)

Stale-claim sweep after all eleven fixes: clean. Every surviving match for `layout:`,
`2.5.8`, `§2–§3`, `trivial` and `three-detent` is a deliberate, labelled quotation of a
corrected statement.

## Carried forward

1. Launch **Sol adverse round 3** on the 742-line spec, detached to
   `.claude/cssspec-2026-08-09/agent-output/sol-round3.log`, with a corrected BRIEF-R3 —
   do **not** carry BRIEF-R2's inverted claim 7.
2. **No completion language about the spec until that round returns and is dispositioned.**
3. Implementation of §2/§3 has **not** started and must not start until the spec survives.
4. When it does: Phase A as its own commit + capture, then Phase B as its own commit +
   capture. `cp browser/raven-grab.js web/public/raven-grab.js` after every overlay edit —
   the mirror-test failure diff is ~580,000 characters.

## Lessons

- A citation note that claims a sweep it did not perform is worse than no note — it
  suppresses the next reader's check. Round 1 caught exactly that.
- A "user-visible change" claim scoped to the section you happen to be editing is a scope
  error, not a wording error. The 28-site count is what turned a sentence into a phase split.
- Non-uniform line-number drift means a formula is always wrong; re-derive each citation
  from the selector.
- **A verification check that has never been executed is a claim, not a check.** Three of
  §5's four checks were unrunnable — a selector that could not cross the shadow root, a
  selector matching the wrong row, and a `sed`/`grep` pair that was never piped. All three
  read fine and all three would have reported a result. Paste and run the checks in a spec
  before shipping the spec.
- **A fix to one finding can break another section, in the same pass.** Deferring
  `font-variant-numeric` to Phase B (P1-1) silently invalidated §5 check 3, because the
  CSSOM refuses to serialise a `font` shorthand once that longhand is non-initial. Caught
  by measuring rather than reasoning; would have shipped otherwise.
- **A brief is a claim like any other.** BRIEF-R2's claim 7 inverted the expected direction
  of the canvas check. Sol did not act on the inversion, but it could have, and the finding
  would have been a fabrication traceable to me.

---

## Round 3 — verdict DOES NOT SURVIVE (4 × P1, 2 × P2, 1 × P3)

Log: `.claude/cssspec-2026-08-09/agent-output/sol-round3.log` (266,359 bytes).
Brief: `.claude/cssspec-2026-08-09/BRIEF-R3.md`.

All seven confirmed against `browser/raven-grab.js` directly rather than taken on the
report's word — which paid off twice: F1 had two consequences Sol never named, and F7
turned out to REFUTE the spec in the spec's own favour.

Two of the seven were already pre-fixed by edits that landed after round 3 launched:
- **F2** — §3.3's omission list. Already correct.
- **F6** — the two `:1102` → `:1090-1091` hit-slop citations at spec `:204` and `:501`.
  Already corrected.

### F1 (P1) — §3 omitted `:1096` entirely. FIXED.

§3's header named four in-range `--raven-grab-mono` sites (`:1086`, `:1096`, `:1098`,
`:1104`) and then substituted only three. Measured on the unmigrated file, §5 check 4's
first leg counts **7** raw-px `font:` shorthands inside `:1073-1127`, so the six
substitutions §3 carried would leave 1 — **the spec's own acceptance gate failing on a
migration that followed the spec exactly.**

Two knock-on consequences Sol did not name, found by reading `:1096`:
- It also carries `padding: 4px 5px` and `border-radius: 5px`, both of which move. The
  "exactly four pixels" exhaustive claim in §3.4 was therefore wrong — it is **six**.
- §2A's 2px-vs-4px grid arithmetic was computed over four migrations. Re-derived over six:
  2px grid moves 5, 4px grid moves 7. Still leans 2px, no longer a tie.

The `5px` horizontal padding is a genuine tie (equidistant from 4 and 6); it goes **up** to
6 for consistency with `:1104`, the panel's other text input, which also moves up. Stated
as a choice, not derived.

### F4 (P1) — §5 undercounted its conditional selectors. FIXED.

Checks 2 and 3 query **six** elements, **four** conditional, not "two of four". The new one
is `.raven-grab-style-label-wrap`, emitted only when the selected element's `border-radius`
is non-`Mixed` and passes `parseBorderRadius` (`:11631-11632`) — plus
`.raven-grab-radius-field input`, which check 2 gained this round.

Two preconditions are **ordered**: the radius corner inputs are built by `beginRadiusEdit`
(`:8511-8513`), reached only by clicking `[data-radius-expand]` (`:12697-12698`), a button
emitted only inside the label-wrap branch. A fixture without a parseable `border-radius`
makes three of the six reads throw, not one.

### F3 (P1) — §6.2/§7's "one-line `data-side` change" is wrong. FIXED.

Three independent reasons flipping the attribute moves nothing, all verified:
1. `placePanel` writes inline `right: auto` + `left` (`:2888-2889`), outranking the
   stylesheet rule `[data-side="left"]` (`:833`). **The codebase already knows this** —
   `updateMobileSheetViewport` does `removeProperty("left")`/`("right")` with the comment
   *"inline left/right would outrank the sheet dock"* (`:14296-14300`). That is the
   precedent for the fix.
2. `clampPanelToViewport` (`:2893-2904`) restores `pos.left` from `__ravenPosition`, and
   runs on every resize (`:14320`).
3. The only declared transition is `transform 200ms ease` (`:831`). Nothing animates `left`.

§7 item 3 rewritten to match. The unit of work is *inline-geometry ownership*, not a CSS
attribute.

### F5 (P2) — §6.3's "two positions, not four" undercounts. FIXED.

Two anchored **sides** plus a continuum of dragged horizontal positions. Added the verified
supporting fact: `pos.top` round-trips `clampPanelToViewport` → `placePanel` forever and
never reaches the DOM, and `panelPosition` (`:352`, assigned `:2887`) is **never read
anywhere in the file** — a write-only variable. Latent plumbing for a vertical axis that
does not exist.

### F7 (P3) — §6.2's two conceded exceptions are CLOSED. FIXED (in the spec's favour).

- In-flight `transition: height` (`:854`): killed during a drag by
  `data-sheet-dragging="true"` (`:2956`) + `:868` `transition: none`, on the **same
  selector** the transition is declared on (`:851` vs `:868`).
- Viewport resize: `updateMobileSheetViewport` rewrites `--raven-grab-sheet-height` from
  `mobileSheetHeight(mobileSheetSnap)` (`:14302`), recomputed from current `innerHeight`
  (`:2747`). Stored height and loop targets share one input and cannot disagree.

**One genuine residual, recorded as UNMEASURED:** `:14302` is guarded by
`if (mobileSheetSnap !== "collapsed")`, so a resize while collapsed leaves the property
unwritten. Needs a reproduction (collapse → resize → expand → drag → release) before it is
called a hole or a non-issue.

### Sol's own check-4 blind spot — found by me, not by round 3. RECORDED in §5.

All three legs are shape counts, blind to which token was chosen. A migration using
`--raven-grab-text-lg` where §3 says `--raven-grab-text-2xs` scores 0 / ≥6 / 4 and passes
every leg while rendering the radius inputs at roughly twice their size. Check 4 bounds
SHAPE; check 2's computed reads and the capture diff are the only things bounding VALUES.
Also recorded: pre-migration counts are 7 (leg 1) and 4 (leg 3), so **leg 3 is a
preservation check, not a progress check** — its expected value is its pre-value.

## Edits made this session (all in `docs/grab-panel-css-spec.md`, 742 → 880 lines)

1. §3.4 code block — added the missing `:1096` substitution.
2. §3.4 omission table — new row for `:1096` (ten rows now).
3. §3.4 exhaustive-pixel paragraph — rewritten: six values, the `5px` tie stated as a
   choice, and the three declarations deliberately NOT migrated inside `:1073-1127` named
   (`:1093-1094`'s `gap: 4px`, `gap: 3px`, `grid-template-columns: 16px minmax(0, 1fr)`).
4. §2A grid comparison — re-derived over six migrations.
5. §2A — removed a duplicated `---- */` comment terminator that edit 4 created. **It would
   have produced a broken stylesheet if the token block were pasted.** Caught by reading
   the region back immediately after editing.
6. §5 check 2 — four computed reads → six.
7. §5 — the conditional-selector table (six selectors, four conditional, ordering stated).
8. §5 check 4 — pre-migration counts + the shape-vs-value blind spot.
9. §6.2 — the three-reason refutation of "one line, not a loop".
10. §6.2 — the two conceded exceptions restated as closed, plus the `collapsed` residual.
11. §6.3 — "two anchored sides plus a continuum", plus `panelPosition` write-only.
12. §7 items 1 and 3 — six pixels; edge-snapping is not one line.
13. §0 — "four moved pixels" → six.

## Where this stands

- **No code has been changed.** `browser/raven-grab.js` and `web/public/raven-grab.js` are
  untouched and byte-identical. There is nothing to release; this is a document.
- **Sol round 4 is running detached** → `.claude/cssspec-2026-08-09/agent-output/sol-round4.log`,
  brief at `.claude/cssspec-2026-08-09/BRIEF-R4.md`. **No round has yet audited the current
  text** — round 3 audited a 742-line snapshot and nine edits landed after it launched, so
  round 4 is mandatory regardless of what it returns.
- Next session: read the round-4 log, disposition it, and only then consider Phase A.

## Lessons (round 3)

- **A spec's own acceptance gate is falsifiable, and running it is how you find the gap in
  the spec.** F1 was found by Sol computing check 4's first leg against §3's own
  substitution list and getting 1 instead of 0. The check worked; the instructions it
  graded did not.
- **A count that appears in five places is five claims.** "Four pixels" was in §0, §2A,
  §3.4, §5 check 2 and §7. Fixing the arithmetic in one and not the rest would have been
  the drift this repo documents for code, in prose.
- **An adverse finding can strengthen the claim it attacks.** F7 asked for more
  counterexamples to the inertness argument and the source produced fewer — both conceded
  cases are closed. Recorded as a correction rather than silently deleted, because the
  reasoning is what a future reader needs.
- **My own fix introduced a broken-stylesheet defect.** Edit 4 duplicated a comment
  terminator. Read the region back after any edit that rewrites a code block, not just
  after edits you are unsure of.
