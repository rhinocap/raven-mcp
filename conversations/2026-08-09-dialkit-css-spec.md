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
- **Sol round 4 came back `DOES NOT SURVIVE`** — 2 × P1, 4 × P2, 3 × P3, none dispositioned
  yet. Log at `.claude/cssspec-2026-08-09/agent-output/sol-round4.log`, brief at
  `.claude/cssspec-2026-08-09/BRIEF-R4.md`. This is the first round to audit the CURRENT
  text (rounds 1–3 each audited a snapshot that nine or more edits landed after).
- Next session: disposition the nine findings below **against `browser/raven-grab.js`
  directly**, never on the report's word — rounds 1 and 3 each produced a claim that was
  wrong in the spec's favour. Only then consider Phase A.

## Sol round 4 findings — ALL OPEN

**P1-1 — `data-side` is structural identity, not a docking state.** A fourth reason the
attribute-only snap fails, beyond §6.2's three: `sideOf()` derives panel identity from the
element object, not the attribute (`:1601`), and the attribute additionally gates the
mobile hide (`:849`), the simple-mode hide (`:1328`) and footer/title routing (`:1320`).
Writing `data-side="right"` would activate unintended narrow-viewport behaviour. §6.2 must
prohibit repurposing it and require a separate dock state.

**P1-2 — §5's six-read fixture omits load-bearing editor preconditions.**
`.raven-grab-style-input` exists only on the generic `beginStyleEdit` path (`:7877`);
several properties route to specialised editors (`:7849`) and enum controls emit
`.raven-grab-style-select` instead (`:7888`). `.raven-grab-token-unlink` needs THAT edited
property to have a matched token (`:7652`), not merely "at least one token in DESIGN.md".
The six reads therefore need two explicit fixture states, not one.

**P2-1 — the `:14302` collapsed residual is REACHABLE, not unmeasured.**
`setMobileSheetSnap("collapsed")` preserves the old height (`:2750`), resize skips the
rewrite while collapsed (`:14302`), and `expandPanel()` (`:2810`) updates neither snap nor
height (`:2760`) — so release compares a stale height against targets derived from the new
viewport (`:2971`) and the loop can select half or full. Narrow the §6.2 claim to "pointer
movement does not change height"; drop "universally inert".

**P2-2 — `.raven-grab-token-choice-row`'s `gap: 6px` (`:1115`) is inside `1073-1127` and
absent from §3 altogether.** Same class as the `:1096` omission that was P1 in round 3.
`6px` maps exactly to `--raven-grab-space-3`, so this adds no seventh moved pixel — but it
must be either substituted or named as deliberately retained.

**P2-3 — §2B specifies two different mono stacks.** The normative block leads with
`"Geist Mono"` (spec `:245`); the recommendation says ship with `ui-monospace` leading
(spec `:270`). Pick one; the zero-request recommendation requires the latter.

**P2-4 — every §5 check passes on a wrong-taxonomy token.** Substituting
`var(--raven-grab-space-2)` for `var(--raven-grab-radius-sm)` is wrong semantically and
both resolve to `4px`, so the capture diff, the computed reads, the mono check and all
three greps stay green. Needs a source-level exact-mapping check. **This is the same blind
spot §5 already documents for font sizes, one level worse** — the spec found the value
case and missed the equal-value case.

**P3-1 — one stale "four-pixel" claim survives at spec `:157`.** Sixth location. The
round-3 lesson ("a count in five places is five claims") was under-counted by one.

**P3-2 — "the only declared transition" is literally false.** The mobile rule declares
`height` and `transform` (`:854`). The no-`left` conclusion is unaffected; the wording is
what is wrong.

**P3-3 — one stale mono call-site citation.** Spec `:517` cites `:1104`, which starts the
rule; the `var(--raven-grab-mono)` declaration is at `:1107`.

### What round 4 CONFIRMED (do not re-audit)

The six moved values and the 5-vs-7 grid arithmetic; the panel-wide inventory (23 spacing /
16 radii / 30 sizes); the mono count of 28 split 4 + 24; the byte-identity of
`--raven-grab-ui` / `--raven-grab-mono` and the Geist-only import; `panelPosition` having
no reader; `pos.top` never reaching style; the omission tables being declaration-complete
for the rules they cover; balanced CSS comments; both mirrors byte-identical; and the WCAG
citations (2.5.5 = 44px AAA, 2.5.8 = 24×24 AA, met via the `-2px` inset at `:1089`).

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

## Checkpoint — push, npm recommendation, font migration

- **Pushed `b46dac5..c7c2bb6`** (5 commits) after a green suite —
  `RAVEN_NO_USAGE_LOG=1 npm test` = **1523 / 1520 pass / 0 fail / 3 skipped, EXIT=0**,
  matching the ledger figure exactly. Established first that the commits touch **no
  `src/` and no `api/`**, so the push could not move what `mcp.ravenmcp.ai` serves;
  re-verified anyway after the deploy — anonymous `tools/list` returned **45 tools,
  hash `f64bb18…2bb0a6`**, golden hash intact.
- Committed with `git commit --only <paths> -F <msgfile>`. The message went through a
  file rather than inline because the destructive-op guard fires on a bare `-f`
  anywhere on the line.
- **npm recommendation delivered, not executed** (publish is Andrew-only, passkey 2FA).
  Recommended **2.4.0 minor**. Basis: npm `2.3.0` published 2026-07-28 at 105 tools /
  60 gated; `origin/main` is 110 / 65 with `manifest.json` in sync
  (`node scripts/sync-manifest-tools.mjs` is a no-op). Five tools have never been
  published — `capture_reference`, `search_references`, `map_reference_to_tokens`,
  `forget_references`, `generate_mood_board` — and because `browser/` is in
  `package.json` `files`, the whole two weeks of overlay work ships with it too
  (drag-and-drop, voice input, easing/spring controls, named style versions,
  detached-draft rescue, precision tiers, scroll preservation, key isolation).
  Two blockers named: the tree was dirty (release.sh refuses that outright), and
  **do not use `bump:auto`** — only 2 conventional commits exist since v2.3.0 because
  the auto-save hook makes the rest non-conventional, so auto misreads the bump.

### The other instance's font migration — committed as `282299a`, one file withheld

Andrew: *"the other instace is done and those changes can ride with, they need to get
opushed to the website though"*. It had **staged** 28 paths and committed none, so
`git log origin/main..HEAD` was empty and nothing was pending push — the work was only
visible through `git status --short`'s first column. **`git diff --stat` showed one
file and that was a misread**: staged changes are invisible to `git diff` without
`--cached`.

Twenty-seven of the 28 are committed. **`site/assets/fonts/untitled-sans-black.otf` is
deliberately withheld** — a 206KB unsubsetted **desktop** OpenType binary of a
commercially licensed typeface, headed for a **public** repo and publicly downloadable
(`vercel.json` sets `outputDirectory: "site"`, and `https://mcp.ravenmcp.ai/index.html`
answers 200). Two things separate it from the three woff2 that did go in: web-format
woff2 of this family are already tracked under `docs/essays/`, so that is established
practice, and CLAUDE.md's own rule names **regular, medium and bold** as the licensed
files — Black is not among them. Stripping it later means force-pushing a public repo,
which this file already records as Andrew's decision and not an agent's, so the cheap
move was not to create that situation.

Cost of withholding, measured not assumed: the `site/*.html` pages declare a fourth
`@font-face` at `font-weight: 800 900` against the `.otf`, and 800/900 **is** used on
headlines there — those resolve to the fallback stack until this is settled. The apex
site is unaffected: `web/app/layout.tsx` registers only the three woff2 (400 /
500-600 / 700) and never referenced Black.

### Website deploy — NOT done, gated

`cd web && vercel deploy --prod` is the **only** route to apex `ravenmcp.ai`; `web` has
no git integration and a push to `main` will never move it. The call was **blocked by
the permission classifier**, so it is Andrew's to run. Not worked around.

### Still open

- Sol round 4's **nine findings are all open** — disposition them against
  `browser/raven-grab.js` directly, never on the report's word. No Phase A until a
  round audits the current text clean.
- The `.otf` decision.
- The npm 2.4.0 release.

## Checkpoint — the Black weight settled, and how

Andrew, mid-turn: *"Yes, i have all wights, save that to the knowledge graph so oyu
guys quit asking me"*. That closes the licensing question the previous checkpoint left
open, and it closes it in the direction that makes the withheld file shippable.

**Written to memory, not just to this log.** The fact went to the CANONICAL
cross-project pool by absolute path —
`~/.claude/projects/-Users-accunliffe-projects/memory/reference_untitled_sans_fully_licensed.md`
— with a pointer line in that pool's `MEMORY.md`, because "which weights may I use"
is a fact about working with Andrew and has to apply in every repo, not only this one.
It states plainly that it **supersedes** the narrower "use only the licensed regular,
medium and bold files" line in the global CLAUDE.md coding rules: that line described
which files were on hand, never what is licensed.

### The conversion was decided by measurement, not by preference

`AskUserQuestion` came back **"Convert to subset woff2, then commit"**, and the first
half of that turned out to be the wrong instruction for this family — which is why the
coverage was measured before anything was converted rather than after. All four files
read **identical**: 502 glyphs, 397 codepoints, U+0020–U+2212. So the three woff2 that
already ship are **not subset** — they are the same coverage, woff2-compressed. A
subsetting pass would have made Black the odd one out, silently missing glyphs its
siblings have. It got a straight `flavor = "woff2"` re-wrap instead.

The converter (`tow2.py`, scratchpad) **reads the output back** rather than trusting
the save, on the standing rule that a tool's success message is GUESSED until the
artifact is read: `flavor=woff2 glyphs=502 codepoints=397 usWeightClass=800
family='Untitled Sans Black'`, **47,516 bytes** — in line with the siblings at 46,456 /
47,512 / 48,152, and down from the .otf's 206,216.

### Nine files repointed — and the first attempt landed ZERO edits silently

```
site/{index,about,ballet,changelog,design-system,docs,og-card}.html
scripts/gen-changelog-html.mjs:101
scripts/build-changelog.mjs:183
```

`url(".../untitled-sans-black.otf") format("opentype")` →
`url(".../untitled-sans-black.woff2") format("woff2")`, on the fourth `@font-face`
block (`font-weight: 800 900`).

**The near-miss is the entry worth carrying: zsh does not word-split an unquoted
parameter expansion.** `for f in $FILES` handed perl all nine newline-joined paths as
ONE filename, and the run "succeeded" with no edits — it only surfaced because perl
named a path that does not exist (`Can't open site/changelog.html\nsite/index.html…`).
A loop that silently iterates once over garbage is this repo's own "a check whose
failure mode is indistinguishable from its success mode" in a shell. The working form
is `grep -rl … | while IFS= read -r f; do … done`, and it was verified in BOTH
directions afterwards: remaining `.otf` references across `site scripts web` — none;
woff2 references — exactly 1 per file, all nine.

### The .otf is gitignored, and that is a distribution call rather than a rights one

`site/assets/fonts/*.otf` added to `.gitignore` with the reasoning in the file. The
licence no longer blocks it, but `vercel.json` sets `outputDirectory: "site"`, so
anything under `site/assets/` is publicly downloadable — and a 206KB unsubsetted
**desktop** binary is the higher-value artifact while serving no purpose now that every
`@font-face` points at the web format. It stays on disk locally as the conversion
source. Side benefit that matters for the release: `release.sh` refuses a dirty tree,
and an untracked-but-ignored source file cannot make it dirty.

### What this fixes on the live pages

The previous checkpoint recorded the measured cost of withholding Black: the
`site/*.html` pages declare a fourth `@font-face` at `font-weight: 800 900` and
**use** 800/900 on headlines, so those were resolving to the fallback stack. Once this
push deploys they resolve to the real weight. The apex site is unaffected either way —
`web/app/layout.tsx` registers only 400 / 500-600 / 700 and never referenced Black.

### Still open, unchanged

- **The apex deploy.** `cd web && vercel deploy --prod` remains the only route to
  `ravenmcp.ai`; `web` has no git integration. The call was blocked by the permission
  classifier and was not worked around — Andrew's to run.
- **Eyes-on.** A 200 on a `.woff2` URL proves the file is served, not that the browser
  chose it. Neither surface has been visually confirmed rendering Untitled Sans.
- Sol round 4's **nine findings**, all still open.
- The npm 2.4.0 release — Andrew's call and Andrew's hands (passkey 2FA).

---

## Checkpoint — the site deploy verified, the apex deploy silently did nothing

State after the previous checkpoint: `89839cd` was written but unpushed, and both
"still open" items above have now been measured rather than assumed. One of them
came back the opposite of what the previous entry implied.

### The push and the site deploy

`f6dc738..89839cd` pushed to `origin/main`. Private-paths gate green (4/4);
`git merge-base --is-ancestor origin/main HEAD` confirmed a clean fast-forward;
committed with `--only` over 12 explicit paths and `-F <msgfile>`. Outgoing
top-level paths were `.gitignore`, `conversations`, `scripts`, `site` — **no
`src/`, no `api/`** — so the MCP endpoint could not move even though a push to
`main` deploys it.

The backgrounded watcher caught the deploy landing on attempt 5:

- `untitled-sans-black.woff2` 404 → **200**, served at exactly **47,516 bytes**,
  `content-type: font/woff2` (matches the local file byte-for-byte)
- `regular` / `medium` / `bold` woff2 all 200
- `untitled-sans-black.otf` **404** — the withheld desktop source is genuinely
  not reachable on the public surface
- anonymous `tools/list`: **45 tools**, hash `f64bb18…2bb0a6` — **MATCH**

### Eyes-on, and why Chrome was the wrong instrument

The first attempt used Chrome MCP and produced a hero that rendered blank. That
was diagnosed rather than accepted: `opacity: 0`, `transform: matrix(1,0,0,1,0,32)`,
class `reveal reveal-delay-1 visible` — the `.visible` class **was** applied, so the
page JS ran correctly; `document.visibilityState === "hidden"`. An automated tab is
backgrounded, so the entrance transition never commits. That is the documented
`visibilityState` throttling artifact, not a product defect. A follow-up attempt to
snap the transitions off froze the renderer (`Runtime.evaluate` timed out at 45s)
and the tab was closed.

Redone with Playwright (`.scratch/font-capture.mjs`, repo-local so ESM resolves),
real Chromium at 1440×900, foreground-equivalent, `document.fonts.ready` awaited:

| | `mcp.ravenmcp.ai` | apex `ravenmcp.ai` |
|---|---|---|
| declared stack | `"Untitled Sans", -apple-system, …` | `__Inter_8b3a0b, __Inter_Fallback_8b3a0b, …` |
| faces loaded | all four, incl. `w=800 900` | Inter 400/500/600/700 |
| hero `h1` | **weight 900 @ 88px** | weight 700 @ 88px |
| width discriminator | 1635.48 vs 1505.33 fallback-only | 1482.09 vs 1419.22 |

The discriminator measures the same string at the same size against the real stack
and against the fallback stack alone — equal widths would mean the fallback is in
use no matter how the picture looks. Both screenshots were then inspected by eye:
the two surfaces are visibly **different typefaces**, and the site hero is rendering
in the new Black weight.

### The finding: the apex deploy produced nothing

Andrew ran `! cd web && vercel deploy --prod` himself. **It created no deployment.**
Measured rather than inferred, because `vercel ls` first reported the *personal*
scope while `web/.vercel/project.json` links a *team* org — a real chance of reading
the wrong project. Resolved by reading the alias directly:

```
vercel inspect ravenmcp.ai
  → dpl_8ZvZcPzVBKy8mHdVtAEEYUBApp8c, project web, Ready
  → created Tue Jul 28 2026 [12d ago]
  → aliases: ravenmcp.ai, www.ravenmcp.ai, next.ravenmcp.ai
```

No deployment newer than 2026-07-28 exists in either scope, and **no ERROR-state
deployment exists either** — so it failed at the CLI level, before a deployment was
ever created, not during a build. `vercel whoami` is authenticated. The apex is
therefore still on Inter, which is exactly what "they need to get opushed to the
website" was about — the font migration had never reached the public marketing site.

The `web` tree itself is correct and ready: `web/app/layout.tsx` registers the three
woff2 via `localFont` (400 / 500–600 / 700, `variable: '--font-inter'` kept so no
consumer had to change), and all three files are present in `web/public/fonts/`. The
apex never referenced Black at all, so nothing there depends on this session's work.

Re-running it here was blocked by the permission classifier a second time and was
not worked around. The likeliest cause of his run doing nothing is an interactive
prompt in a non-interactive shell, so the command to retry carries `--yes`.

### Adjacent, reported not fixed

`mcp.ravenmcp.ai` states **"104 tools"** in the hero. The ledger has repo at 110 /
npm at 105. Commit `dc1b232` was supposed to make the site state one tool count and
assert it at build time; either that assertion does not cover this page or the
number drifted. One line, not a fix — out of scope for a font commit.

### Still open

- **The apex deploy** — the one blocker, Andrew's hands.
- Sol falsification pass on this deploy claim: launched, `.claude/fonts-2026-08-09/`.
- Sol round 4's **nine findings** on the DialKit CSS spec, all still open.
- The npm 2.4.0 release — Andrew's call and Andrew's hands (passkey 2FA).

## Addendum — post-checkpoint state

Nothing on the apex has moved. Re-read at 19:37: `vercel inspect ravenmcp.ai`
still resolves to `dpl_8ZvZcPzVBKy8mHdVtAEEYUBApp8c`, project `web`, Ready,
created Tue Jul 28 2026, aliases `ravenmcp.ai` / `www.ravenmcp.ai` /
`next.ravenmcp.ai`. So the `vercel deploy --prod` Andrew ran created no
deployment at all — there is no newer one, and no ERROR-state one either, which
places the failure at the CLI before a deployment record exists rather than in a
build. `vercel whoami` answers `cunliffeandrewc-8712`, so it is not auth. Retry
is `cd web && vercel deploy --prod --yes`.

The apex font watcher (`b4ft6s682`) ran all ten attempts and never flipped —
every one reported the same `/_next/static/css/097040637a2e6b5e.css` with
`__Inter_` / `__Inter_Fallback_` / `__JetBrains_Mono_` families. That is the
predicate working, not a broken watcher: it was tested against current output
before being armed, and it matches on content rather than position.

The Sol falsification pass on the site-deploy claim is still in flight —
277,525 bytes at 19:37 and the process still alive. It has not been read, so no
completion language about the font migration is permitted yet. A large file and
a zero exit code are not a verdict; the findings have to be read.

Sequence to close this out, in order:

1. Andrew: `cd web && vercel deploy --prod --yes`.
2. Me: re-measure the apex (`.scratch/font-capture.mjs`, absolute path, the
   width discriminator plus a fresh full-size capture) once a deployment newer
   than `dpl_8ZvZ…` exists.
3. Me: read the Sol pass and disposition every real finding before the site half
   is called verified.

## Sol falsification pass — verdict REFUTED, six findings, dispositioned

The pass finished; the `pgrep -f "gpt-5.6-sol"` waiter was matching its OWN
command line and reported STILL RUNNING for ~20 minutes after the verdict had
already been written. Wait on a captured PID with `kill -0`, never on a string.

**P1 — the 45-name hash does not prove the endpoint did not move.** VALID in
principle, mostly closed by measurement. `vercel inspect mcp.ravenmcp.ai` →
`dpl_8WcasrNWA9R1Se7uz3GJBJzurRVA`, project `site`, target production, Ready,
created **Sun Aug 09 19:21 (24m after the push)**, alias list carrying
`mcp.ravenmcp.ai` AND `site-git-main-…`, so it is a git-integrated production
build off `main`. That deployment is also the one that flipped `black.woff2`
404 → 200, which ties the responding build to the pushed content rather than to
a timestamp. The push range touched no `src/` and no `api/`, so the function
source is unchanged. RESIDUAL, stated rather than papered over: the ledger's
stronger check is a byte-identical full `tools/list` payload diff, and no
pre-push payload snapshot was captured for this push, so that specific check
cannot be reconstructed after the fact. Names + deployment identity + unchanged
source is what is actually established.

**P2 — the canvas discriminator is under-specified and can lie.** REFUTED by
reading the script. `.scratch/font-capture.mjs:40` builds the control as
`stack.split(',').slice(1).join(',')` — it takes the REAL computed stack and
drops only the FIRST family, so both sides carry an identical downstream stack
and differ solely by the custom family name. That is exactly the property Sol
demanded. It is also not load-bearing alone: `document.fonts` enumerated
`Untitled Sans w=800 900 loaded` directly, and the capture was inspected by eye.

**P2 — `site/` still contains public Inter consumers.** CONFIRMED, and WIDER
than Sol found. `vercel.json:3` publishes the whole `site/` directory, and
**eight** files under it still load Inter from Google Fonts, not three:
`previews/hero-grid/index.html`, `previews/layout-1-editorial.html`,
`previews/layout-2-cinematic.html`, `previews/layout-3-terminal.html`,
`previews/buttons-concepts.html`, `demos/law-firm.html`, `demos/saas.html`,
`index.html.backup`. All three Sol named answer **200** live. So the true claim
is *the seven main site pages are migrated*, not *the site project is migrated*
— narrow the wording, which is what the claim gets here.
Fix, named but NOT executed: the same `@font-face` block the seven pages carry,
swapped for the Google Fonts `<link>` in those eight files, plus deleting
`index.html.backup` rather than migrating it. Not done because it is unrequested
scope on a pause turn AND because it means another push to `main`, which
deploys the live MCP endpoint and is Andrew-gated.

**P3 — the `.otf` rewrite was not an exhaustive migration sweep.** Same finding
as above; absorbed into it. A post-edit search for stale `.otf` URLs is blind to
files that never referenced the OTF because they still declare Inter.

**P3 — "previously committed OTF" is not supported by this repo.** Confirms the
safe direction: no reachable branch, remote ref, reflog entry or unreachable
commit contains `site/assets/fonts/untitled-sans-black.otf`. The blob exists
locally as an unreachable object, consistent with having been hashed or staged
and then removed, never committed. No history exposure, no action.

**P3 — the internal family-name mismatch is not a defect.** Refutes my own
attack-list worry: CSS Fonts Level 4 makes the `@font-face` `font-family`
descriptor the alias, overriding the name embedded in the font data, so an
internal `Untitled Sans Black` served as `Untitled Sans` is correct. The real
caveat is one layer over and is worth carrying: the file is a STATIC weight-800
face advertised across `800 900`, so a `font-weight: 900` consumer computes 900
and receives the same Black outlines — intended here, and not fallback or a
synthetic bold, but it is not a distinct 900 design either.

## Apex deploy verified — `ravenmcp.ai` now serves Untitled Sans

Andrew ran the retry himself with the `--yes` that was missing the first time:
`cd web && vercel deploy --prod --yes`. It produced a deployment; the earlier
attempt without `--yes` had produced no deployment record at all, which is why
there was neither a newer deployment NOR an ERROR-state one to inspect.

**Deployment identity, read rather than inferred.** `vercel inspect ravenmcp.ai`
resolves to `dpl_BMVBSTpAT4hSMdhjabeTkZsLxa8m`, project `web`, target production,
● Ready, created Sun Aug 09 2026 20:14:03. Its alias list carries `ravenmcp.ai`,
`www.ravenmcp.ai`, `next.ravenmcp.ai`, `web-tau-olive-60.vercel.app` and
`web-cunliffeandrewc-8712s-projects.vercel.app`. The deployment it replaced was
`dpl_8ZvZcPzVBKy8mHdVtAEEYUBApp8c` from Jul 28, which is the one that had been
serving Inter for twelve days. This is the alias-list rule from the ledger: a URL
probe cannot say which project owns a hostname, only the deployment record can.

**Measured, not assumed — before vs after on the same instrument.** Same script
(`.scratch/font-capture.mjs`), same viewport, same hero element:

| | before (`dpl_8ZvZ…`) | after (`dpl_BMVB…`) |
|---|---|---|
| computed stack | `__Inter_8b3a0b, __Inter_Fallback_8b3a0b, …` | `__untitledSans_a2f408, __untitledSans_Fallback_a2f408, …` |
| faces | Inter 400/500/600/700 + JetBrains Mono | untitledSans 400, 500‑600, 700, Fallback + JetBrains Mono; **zero Inter faces of any status** |
| CSS bundle | `097040637a2e6b5e.css` | `13d2bdb9d3d688bb.css` |
| widthReal / fallbackOnly | 1482.09 / 1419.22 | **1525.66 / 1393.91** |

Three independent lines of evidence, not one: `document.fonts` enumerated the
faces directly; the canvas discriminator separated real stack from fallback-only
(control built as `computedStack.split(',').slice(1)`, so both sides share an
identical downstream stack and differ solely by the custom family name — this is
exactly the construction Sol's round-1 P2 demanded, and it was already there);
and the full-size capture at `.scratch/captures/apex.png` was inspected by eye
showing the hero rendering in Untitled Sans.

Live CSS bundle extraction confirms it from the other direction: the only
`font-family:__*` declarations remaining are `__untitledSans_a`,
`__untitledSans_Fallback_a`, `__JetBrains_Mono_` and `__JetBrains_Mono_Fallback_`.
The two case-insensitive `inter` matches left in the apex HTML are inside the
words **interfaces** and **get_taste_interview** — not font references.

**The residual sweep runs on BOTH projects, and the `web` half has the same
finding.** Sol's round-1 P2 named three Inter consumers under `site/`; measuring
rather than trusting the count found **eight**. Running the direct analogue on
`web/` finds **two**: `web/public/demos/law-firm.html` and
`web/public/demos/saas.html`, and `https://ravenmcp.ai/demos/saas.html` answers
**200** serving `css2?family=Inter`. The apex's real routes are clean — `/`,
`/changelog`, `/docs` all 200 with no Inter anywhere.

So the honest scope statement is: **the seven main site pages and every real apex
route are migrated; the two projects' static demo/preview pages are not.** Ten
file-instances across eight unique pages (the two demos exist in both projects).
Reported with the fix named — swap the Google Fonts `<link>` for the same
`@font-face` block the migrated pages already carry, and delete
`site/index.html.backup` rather than migrating it — and deliberately NOT executed:
it is unrequested scope on a pause turn, and the `site/` half needs a push to
`main`, which deploys the live MCP endpoint and is Andrew-gated.

**Watcher lesson, third instance of the same class this session.** The waiter
loop `while pgrep -f "gpt-5.6-sol"` matched **its own command line** — the shell
running the loop contains that literal string — so it reported STILL RUNNING for
~20 minutes after Sol had already written its verdict and printed its token
count. A `pgrep -f` wait is structurally self-matching and its failure mode is
indistinguishable from its success mode. Wait on a **captured PID with `kill -0`**.
What actually broke the deadlock was grepping the in-progress `.out` for
`^(P[123]|FINDING|VERDICT|##)`, which surfaced completed `## Findings` sections
immediately. The apex round was launched with its PID captured (`SOL_PID=6084`).

**Adjacent, one line, not fixed:** `mcp.ravenmcp.ai` states "104 tools" in its
hero while the ledger has repo at 110 and npm at 105.

## Sol round 2 (apex) — verdict REFUTED, no P1; four P2 and five P3 dispositioned

Launched with its PID captured (`SOL_PID=6084`) and waited on with `kill -0`,
which is the fix for the self-matching `pgrep -f` loop recorded above. Sol ran
read-only with no network — `curl` returned `Could not resolve host` — so three
of its findings are "could not independently verify" rather than counter-evidence.
Each was closed here by running the check it named.

**P2 — font identity unproven. CLOSED, and it needed the check.** Sol was right
that `__untitledSans_a2f408` is a name generated from the import identifier and
authenticates nothing about the bytes. Two measurements close it. (a) The three
files served from the apex are hash-identical to the working-tree source:
`b6176541c68c3d95-s.p.woff2` = `untitled-sans-regular.woff2` (46,456 B),
`0d0f58188a5421fe-s.p` = medium (47,512 B), `ef083e45e3ef21a3-s.p` = bold
(48,152 B). (b) Reading the `name` table out of the files **downloaded from the
live apex**, not the local ones: family `Untitled Sans`, version
`1.008;26071026`, `Copyright 2026 Klim Type Foundry. All Rights Reserved.`,
vendor ID `KLIM`, usWeightClass 400/500/700. That is the identity question
answered at the bytes rather than at the alias.

**P2 — deployment binding unproven. CLOSED.** Sol correctly refused alias-list
membership as proof of current routing. `https://ravenmcp.ai/` and
`https://web-tau-olive-60.vercel.app/` — the immutable URL on
`dpl_BMVBSTpAT4hSMdhjabeTkZsLxa8m` — return **byte-identical** HTML,
sha256 `9b1989d3819e7b2667798e95832f7edc11e9cee2a5e2d3b0011adabbb22d6def`.
That is the second of the two proofs Sol named as acceptable.

**P2 — residual inventory incomplete. CONFIRMED, and it REVERSES the fix I
proposed.** My sweep reported 2 Inter demos; there are **5 of 6**. The miss is
mechanical and worth carrying: `coffee-shop`, `fitness` and `wedding` carry Inter
as a *secondary* `&family=` inside a multi-family Google Fonts URL, so a pattern
anchored on the first family walks straight past them. But widening the count is
what makes the right answer visible — **these are not stragglers.** Each demo is
a fictional client brand with a deliberate pairing: DM Serif Display + Inter
(Ember & Grain), Bebas Neue + Inter (FORGE), Playfair Display + Inter (law firm),
Inter + JetBrains Mono (Flux), Cormorant Garamond + Inter (wedding), Cormorant
Garamond + system sans (Oleander Residence). Inter is the *demo brands'* body
font, not Raven's. Migrating them would erase six distinct identities and make
every showcase look like ravenmcp.ai — the opposite of what a demo gallery is for.
**Corrected recommendation: leave all six alone.** All 200 live.

The genuine Raven-brand stragglers are a different set — `site/previews/`
`hero-grid/index.html`, `layout-1-editorial`, `layout-2-cinematic`,
`layout-3-terminal`, `buttons-concepts`, plus `site/index.html.backup`. These are
Raven's OWN homepage explorations rendered in Inter, all answering 200 on
`mcp.ravenmcp.ai`. Six files, and `index.html.backup` should be deleted rather
than migrated. So the earlier "ten files" figure was wrong in both directions:
too many (it swept in demo brands that must not change) and mis-scoped (it never
distinguished Raven surfaces from client surfaces).

**P2 — manual deploy is not commit provenance. Partially closed, rest stated.**
Sol is right in general: `vercel deploy --prod` on a project with no git
integration uploads the working directory, so the deployed tree is not provably
the committed tree. For the thing being claimed it *is* closed — the three font
files are byte-identical live vs working tree, and the HTML is byte-identical to
the immutable deployment. A full uploaded-file manifest was not obtained and that
gap is real for any *other* file in that deploy.

**P3s.** (a) Zero apex consumers request weight 800/900 — the Next pages and
demos top out at 700, and the 800/900 values in `raven-grab.js` are editor
options, not rendered requests. So the three-file family is sufficient for the
apex, and the Black face matters only on `mcp.ravenmcp.ai`, which has it.
(b) `document.fonts` reporting `loaded` does not prove selection for an element,
and computed `font-family` reports the request not the glyph source — agreed,
which is why there were three independent lines rather than one. (c) The width
discriminator is sound but proves only that *a* registered custom face shaped the
text; the name table now closes the identity gap it structurally could not.
(d) Keeping `variable: '--font-inter'` routes correctly (`layout.tsx:204` →
`globals.css:47` `--font-body`); misleading naming, not a defect. (e) The
component-request preview endpoint renders its chrome in system sans — it is
POST-only (GET returns 405), an API render surface, not a brand page.

**One line, adjacent, not fixed:** the Vercel CLI here is 58.7.1 against 58.9.0.

---

## Release prep for v2.4.0 — Sol round 3 and its disposition

**Where this left off:** `main` at `dac1b5a`, clean, pushed. The npm release has
NOT been cut — that is Andrew's step and needs his passkey.

### The Sol pass returned REFUTED, and its P1 was real

Brief at `.claude/release-2026-08-09/SOL-BRIEF-CHANGELOG.md`, raw output at
`.claude/release-2026-08-09/agent-output/SOL-CHANGELOG.out` (gitignored, 15,712
lines). Verdict: "The v2.4 changelog is not release-safe as written."

**P1, verified against the source rather than taken on the agent's word.**
The published `raven-mcp@2.3.0` tarball ships `src/data/content/systems/mailchimp.json`
and its registry lists `mailchimp` as `available`. `main` has neither — the file
is deleted and the registry entry is `conversational-product-voice`. The removal
is commit `3dafabb`, which is AFTER the `v2.3.0` tag (`a1d8cff`, Jul 28), so it
has never been published. `loadContentSystem` returns null and
`get_content_system` answers not-found (`src/index.ts:6272`).

**The strongest form of the break:** the published `dist/index.js:5237` schema
description reads `"Content system ID (e.g. 'mailchimp', 'gov-uk', …)"` — v2.3.0
actively advertised the id to every connected agent.

**Scope measured, not assumed:** `git diff --diff-filter=D --name-only v2.3.0..HEAD -- src/data/`
returns exactly one file, and `--diff-filter=A` exactly one. One id out, one in.

**Restoring or aliasing it was never an option** — the replacement was deliberate.
An alias would also serve *different* content under the old name, which is worse
than a not-found.

**A misread worth recording so the next reader does not repeat it:**
`git tag --contains 3dafabb | head; git describe --tags --abbrev=0 3dafabb`
printed a single `v2.3.0`, which reads as "the tag contains this commit" and
would mean the tag disagreed with the tarball. It was `git describe`'s output —
the nearest tag *reachable from* the commit. `git tag --contains` printed
nothing. **Two commands sharing one output line is not one answer.**

### Andrew's call on the bump

Asked as a fork (minor + Removed note / major / minor with no note). He chose
**2.4.0, drop the Removed section** — the content catalog is treated as internal
data, not API. I had recommended the Removed note and said so in the option text;
he decided otherwise and it is his call. Both the CHANGELOG section and the web
bullet were written and then removed.

### The four claims that were narrowed (all shipped in `dac1b5a`)

None of these were deleted; each was reduced to what the code guarantees.

1. **"every reference carries a picture of itself"** — false. The thumbnail and
   the mood-board PNG both return null on no browser, a render timeout, or an
   element with no box, and `capture_reference` commits the record *before*
   attempting the render. Now stated as best effort, with the ordering named:
   a machine without a browser costs the picture, never the capture.
2. **"a preview computed by the same rule the removal uses … what the prompt
   says will go is what goes"** — the rule is shared, the SNAPSHOT is not. Two
   separate directory reads, so the equivalence holds only when `expected_ref_ids`
   pins the set. Now says so.
3. **"your own local dev server"** — wider than the allowlist, which is exactly
   `127.0.0.1`, `localhost`, `[::1]`. Narrowed to the literal forms.
4. **Omitted feature** — the overlay's panel-field dictation shipped in this
   window and neither entry mentioned it. Added.

`(#PR)` suffixes were deliberately NOT added: this window's work reached `main`
by direct push, not through PRs, so there are no numbers to cite.

### Verification

- `site/changelog.html` regenerated by `node scripts/gen-changelog-html.mjs`,
  never hand-edited (the v1.13.0 failure mode). 32 releases, top entry v2.4.0.
- `web/data/changelog.json` rewritten by script with a guard asserting the top
  entry is v2.4.0 and that exactly one bullet was dropped; `git diff --stat`
  confirmed 5 insertions / 4 deletions, so no reformatting of the other 31.
- `test/no-private-paths.test.mjs` run against the STAGED index: 4/4 pass.
- Push `57604c4..dac1b5a`, docs only — no `src/`, no `api/`.

### Still open

1. `web/lib/counts.ts` `TOOL_COUNT` is 105 and must go to 110 **after** the
   publish, in the same change that adds the five tools to `ACTS` in
   `web/components/tools/ToolsSection.tsx:184` — that file counts its own
   enumeration and throws at build time if the two disagree.
2. The apex `.mcpb` and the public changelog only move on a manual
   `cd web && vercel deploy --prod`; the push to `main` will never move them.
3. Residual Inter sweep, six files, awaiting Andrew's word — NOT the demos,
   which he has settled.
4. DialKit CSS spec round-4 findings still undispositioned.

---

## v2.4.0 published — four-surface verification

Andrew ran `npm login` in a separate terminal because the interactive prompt
would not run inside the Claude Code session. That carries over: npm auth is
user-level, written to `~/.npmrc` as `//registry.npmjs.org/:_authToken=…`, and
`npm whoami` from this session returned `accunliffe` before he ran anything —
measured, not assumed, and the reason step 0 was dropped from his command list.

| surface | measured |
|---|---|
| npm `raven-mcp` | 2.4.0, `time.modified` 2026-08-10T04:19:58Z |
| MCP registry `ai.ravenmcp/raven-mcp` | 2.4.0, pkg `raven-mcp 2.4.0` |
| git tag | `v2.4.0`, HEAD `655417f`, clean, 0 unpushed |
| apex `raven.mcpb` | 200, 2.4.0, 110 tools, 5,352,943 bytes |
| installed package `tools/list` | 110 tools, 5/5 new present |
| anon `mcp.ravenmcp.ai` | 45 tools, `f64bb18…2bb0a6` GOLDEN MATCH |

The anon re-check was not ceremonial: `release.sh` pushes to `main`, and since
the 2026-07-27 unpin that fires a `site` production deploy of the live MCP
endpoint. It did not move.

**Instrument correction — the published count is 110, not 111.** A grep for
`server\.tool\(\s*"([a-z_0-9]+)"` over `dist/` returned 111 unique names and
disagreed with the ledger. The instrument was replaced rather than the ledger
adjusted: the installed package was spawned over stdio and asked for its own
`tools/list`, which answers 110. One matched string is not a registration.
Two things had to be got right to ask at all — an unpacked npm tarball has no
`node_modules`, so running its entry point dies on `ERR_MODULE_NOT_FOUND` for
`@modelcontextprotocol/sdk`; the package must actually be installed. The
published tarball also carries no `mailchimp.json` and no `reference-prompt.*`
leftovers in `dist/`, so the `npm run clean && tsc` fix is holding.

## Site: TOOL_COUNT 105 → 110

Three files, one change, because the enumerations are what make the number
true rather than merely stated.

- `web/lib/counts.ts` — `TOOL_COUNT` 105 → 110.
- `web/components/tools/ToolsSection.tsx` — Act 03 Design gains the four
  pattern-library tools (`capture_reference`, `search_references`,
  `map_reference_to_tokens`, `forget_references`); Act 05 Judge gains
  `generate_mood_board`, beside `generate_taste_portrait`. Design 20 → 24,
  Judge 10 → 11, total 110.
- `web/app/docs/page.tsx` — **found by measuring, not by reading.** Its 19
  layers each declare a count, every declared count equalled its card count,
  and the total was exactly 105. The bump would have left that page stating
  110 in three places over an enumeration of 105 — the "99 / one hundred / 104
  on one page" failure the `counts.ts` comment warns about. Five real tool
  cards added: DESIGN.md & Grab 12 → 16, Taste Engine 10 → 11. Re-measured:
  declared 110, cards 110, every layer agreeing.

**The guard was falsified, not trusted.** A green build only proves the two
numbers agree if the assertion runs at all, so `TOOL_COUNT` was set to 111 and
the build failed with `Error: ToolsSection lists 110 tools but TOOL_COUNT is
111`, then restored. Clean build at 110 afterwards.

Adjacent fix, in the exact list being edited: `list_content_systems` still
named **Mailchimp**, removed from the corpus in `3dafabb`. The shipped set was
read from the installed 2.4.0 package's own content registry — GOV.UK,
Shopify Polaris, Atlassian, conversational-product-voice. The neighbouring
"12 design systems" claim was measured too and is correct (12 entries, 12
files). `web/public/llms.txt` already said 110.

### Still open

1. `cd web && vercel deploy --prod` — apex has no git integration, so nothing
   above reaches ravenmcp.ai until that runs. Andrew's, it publishes.
2. `docs/page.tsx` per-layer counts are hand-maintained with nothing asserting
   them; `ToolsSection.tsx` has a build-time guard and the docs page does not.
   Guarding it means turning hand-written JSX into data — noted, not done.
3. Residual Inter sweep, six files, awaiting Andrew's word — NOT the demos.
4. DialKit CSS spec round-4 findings still undispositioned.

## Checkpoint — push, production verification, eyes-on (2026-08-09)

Written after three segments of compaction pressure; everything below is
measured, not inferred.

**Push.** `655417f..024e81c  main -> main`. Branch `main`, worktree clean.

**Production.** `main` deploys the live MCP endpoint, so the anon hash is the
gate, not a formality. Site prod deployment `dpl_HDKdDiDpze2QHvNz5APoiqRyv1gF`
— commit `024e81c`, branch `main`, READY, and its alias list carries
`https://mcp.ravenmcp.ai`. The alias list is the only thing that says which
build a hostname serves; `vercel inspect --json` on CLI 58.7.1 is trimmed and
carries no git meta, so the REST `v13/deployments/<id>` was read instead. Anon
`tools/list` re-verified against that alias: **45 tools, sha256
`f64bb18…2bb0a6`, GOLDEN MATCH** — unmoved, which is what a `web/`-only change
should do and is not evidence until it is checked.

**Both enumerations measured at the DOM, not read off the source.** The
homepage heading renders `LISTED_TOOL_COUNT` (derived from the array), not the
raw constant, so the two are separate claims:

- Home, per act: Know 18 · Create 15 · Design 24 · Audit 26 · Judge 11 ·
  Decide 14 · Meta 2 = **110**.
- Home, Design act: **24 unique tool names in the DOM** against a declared
  "24 TOOLS" label. Judge: **11 against "11 TOOLS"**. So the labels are
  consistent with what actually renders beneath them, not merely with
  `counts.ts`.
- Docs page: **110 cards, 110 unique ids, 0 duplicates**, 19 layers, declared
  per-layer `[4,1,1,4,4,5,2,3,3,9,14,2,1,11,14,16,12,2,2]` summing to 110.
  110 stated in three places (footer, right-rail register, step 02).
- Stray count literals in `web/`: none. `llms.txt` already 110;
  `data/changelog.json` historical and correct.

All five new tools confirmed rendering **three independent ways** — docs DOM id
sweep, docs element screenshots, and homepage act-list DOM name enumeration.

**design-judge.** Global-only (37 rules; no project overlay, no `DESIGN.md`).
Surface stated **product-site**, so `COLOR-one-warm-orange-accent` (scope
`portfolio-monochrome`) is inactive and the cyan is brand, not a second hue.
Judged the CHANGED regions — the five docs cards and the two expanded acts —
not the page tops, which show none of the new content. **Verdict: PASS.** The
sticky nav crossing `home-design.png` mid-frame is an `elementHandle.
screenshot()` scroll artifact, not a page defect. One report line, not a
finding: the docs page renders literal values with typographic apostrophes
(`mode:’example’`) — 63 page-wide, 12 in the new cards, pre-existing prose
convention; correcting it is a page-wide unrequested edit.

Capture rig (`npx next start -p 4187`, pid 8049) killed. It was a capture rig,
never a preview, and was never handed over as one.

### Next commands

1. Sol falsification pass — brief at `.claude/count-bump-2026-08-09/BRIEF.md`,
   output at `.claude/count-bump-2026-08-09/agent-output/SOL-R1.out`. Read the
   file, never the exit code. **An environment-blocked or budget-exhausted
   adverse output is not "no findings"** — check for a verdict line before
   dispositioning.
2. Andrew, and only Andrew, publishes the apex:
   `cd /Users/accunliffe/projects/raven-mcp/web && vercel deploy --prod --yes`,
   then confirm 110 renders on ravenmcp.ai.

### Adjacent, one line each, not fixed

- `mcp.ravenmcp.ai` hero still states "104 tools".
- Vercel CLI 58.7.1 vs 58.9.0.
- Docs per-layer counts still have no build-time guard.

## Sol round-1 disposition — two fixed, two reported (2026-08-09)

Sol round 1 returned **DOES NOT SURVIVE** with 3 x P2 + 1 x P3. The verdict was
read out of the file at `.claude/count-bump-2026-08-09/agent-output/SOL-R1.out`
(623,049 bytes; report at ~8945-9058), not off the exit code, and it carried a
real verdict line rather than an environment-blocked stub.

Its `## Claims that held` half is worth keeping, because it is the independent
confirmation of the count bump: npm 2.4.0 returns **110 tools, 110 unique names,
no duplicates**; the apparent "111th" source literal is `delete_taste_data`,
registered only under `if (remote && hasUserStore)` and therefore not an npm
stdio tool; both site enumerations contain the same 110 unique names; the docs
parser found 19 paired layers, 110 declared, 110 cards, no duplicate ids, no
orphans; and the endpoint did not move — `api/mcp` function digest identical
across the current and preceding production deployments, anonymous 45 names
frozen at `f64bb185...a0a6`.

### Split: fix what this change authored, report what it merely sits beside

**P2-3 — three overclaiming tool summaries. FIXED.** Copy authored by this very
change, so it is in scope. `capture_reference` said "plus a thumbnail" and
`search_references` "each result carrying its picture"; the thumbnail is BEST
EFFORT and the credit is not — the record commits *before* the render is
attempted and every failure path returns null, so a capture with no markup, or a
machine with no browser, costs a picture and never the pattern. They now read
"where the markup allows" and "where one exists". `forget_references` said
"confirmed and pinned"; pinning is the optional `expected_ref_ids` argument and
the tool reports in its own output when an unpinned sweep may have taken
something captured mid-run (verified at `src/index.ts:3612-3622`), so it reads
"pinnable". Each rewrite carries a comment saying what the old sentence promised.

**P2-2 — Mailchimp. FIXED, and broader than Sol found.** Sol named one call
site; there were **four** live ones, which is this repo's most-documented failure
class arriving in marketing copy: `web/app/page.tsx` (the Content Systems
paragraph **and** its tag chip list), `web/app/docs/page.tsx:300`, and the
file-tree diagram at `:1429`. Mailchimp left the registry in `3dafabb`. The
shipped four were read off `src/data/content/systems/` rather than off any copy:
`gov-uk`, `shopify-polaris`, `atlassian`, `conversational-product-voice`.

The counts were already correct everywhere — the homepage stat says 4, the
diagram comment says 4 — and **that is exactly why nothing caught the drift**: a
guard that counts cannot see a wrong name. Removing the Mailchimp chip also left
three chips under a stat reading 4, so a "Product voice" chip was added; a fix
that leaves the card self-contradicting is not a fix.

Two Mailchimp mentions were left deliberately. `docs/page.tsx:1520` is a
*provenance* claim about where 132 UX-writing principles were curated from — a
different claim from the systems registry, and not falsified by the removal.
`web/data/changelog.json:403` is history and is correct as history.

**P2-1 — corpus counts. REPORTED, not fixed.** The site says 129 principles / 22
pattern sets in six places (`web/app/page.tsx:734,742`, `web/layout.tsx:67,123,
130-131,190`, `web/public/llms.txt:15-16`) while `docs/page.tsx:1520` says 132
and 23 — and `peak-end-rule` is duplicated in the data, so the true figure is 132
total / **131 unique**. Pre-existing, not made wrong by this change, and choosing
132-vs-131 belongs with fixing the duplicate id in the data, not with a copy edit.

**P3-1 — "layers" means two things. REPORTED, not fixed.** The homepage says
"Nine layers" (9 cards) while `LAYER_COUNT` is 19 and the docs page renders 19
groups. Both taxonomies are real; neither page distinguishes them.

### Verification

Build re-run clean; the `LISTED_TOOL_COUNT !== TOOL_COUNT` guard still passes at
110 (it is a module-level throw, so a green `/` route is the evidence it ran).
Private-path gate 4/4.

Pushed `024e81c..fdd912e` (the session-log commit `2f46812` rode with it).
Production `site` deployment `dpl_BtukpjoCwtWrCchDbq7qvfdPBCkd`
(`site-pswgfxxgb-...`), target production, **Ready** in 46s.

**The alias check has an instrument limitation worth recording.** Immediately
after the build the CLI listed only the two auto aliases on the new deployment
while the *previous* deployment still showed `mcp.ravenmcp.ai`; four minutes
later **both** deployments listed it. So `vercel inspect` at CLI 58.7.1 cannot
discriminate which build a hostname serves during the propagation window — do not
read either snapshot as a per-deployment binding. The claim that actually matters
was established two other ways instead: `git show --name-only fdd912e` touches
nothing under `src/` or `api/`, and the anonymous endpoint was re-measured
**after** the deploy reached Ready — 45 tools,
`f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`, GOLDEN MATCH.

### Still Andrew's, unchanged

`ravenmcp.ai` is served by the **`web`** project, which has no git integration, so
none of this reaches the public marketing site until
`cd /Users/accunliffe/projects/raven-mcp/web && vercel deploy --prod --yes`. That
is the same pending deploy the 110-tool bump needs, so one run covers both.

Sol round 2 (auditing this disposition rather than the feature) launched detached
to `.claude/count-bump-2026-08-09/agent-output/SOL-R2.out`; brief alongside it.

## Sol round 2 — DOES NOT SURVIVE (3 P2, 1 P3), all four dispositioned

Round 2 audited the round-1 *disposition* rather than the feature. Verdict at
`SOL-R2.out:3993`. Every finding was verified against the shipped data before
being acted on; none was taken on the report's authority.

**The fifth Mailchimp call site was found and fixed BEFORE round 2 was read.**
While waiting on the detached run I pre-checked its own attack point #1 — "is the
four-call-site count actually complete?" — and it was not. `fdd912e` claimed four
and asserted completeness; there were five. The miss is
`web/app/docs/page.tsx:312`, the documented example for `get_content_system`'s
**required** `id` parameter, which still offered `'mailchimp'` — so a reader
following the docs got a tool error rather than stale prose. The other four were
descriptive; that one was an instruction. Fixed in `4f3e5ba`, pushed, deploy
`dpl_FHtA9YqbLjPaspEp9bX1vnoH1ZTr` Ready.

**This is the one-of-N-call-sites drift this repo documents more than any other
class, committed inside a fix that asserted it had closed exactly that class.**
The count in the commit message was the claim, and nothing measured it.

### P2 — `capture_reference` traded one overclaim for another. FIXED.

Round 1 rewrote "plus a thumbnail" to "where the markup allows". Markup is one of
**four** ways to lose the picture: Chromium absent, launch or render timeout
(`src/index.ts`, `src/reference-thumbnail.ts`), attach failure
(`src/reference-store.ts`), or no markup. **The comment two lines above the copy
already said "a machine with no browser" — it was broader than the sentence it
was defending, and that mismatch is the whole finding.** Now reads "a best-effort
thumbnail rebuilt offline"; naming one cause was the error, so no cause is named.
`search_references` and `forget_references` were independently confirmed accurate
and are untouched.

### P2 — the provenance sentence was NOT defensible. FIXED, reversing round 1.

Round 1 kept `web/app/docs/page.tsx:1520` on the reasoning that provenance is a
different claim from the systems registry and is not falsified by a registry
removal. **The reasoning was sound and the conclusion was still false**, because
it was never checked against the data: `grep -ril mailchimp src/data/` returns
**nothing**. The 11 UX-writing principles in
`src/data/content/principles/ux-writing.json` cite plainlanguage.gov, Shopify
Polaris, NN/g, GOV.UK, Atlassian and Microsoft — no Mailchimp at any of them. The
parenthetical now names the sources actually cited in that file, read off the
JSON rather than off any copy. `web/data/changelog.json:403` stays: it is history
and is correct as history.

### P2 — the `site/` half. REPORTED, human-gated, NOT touched.

Live stale claims remain at `site/index.html:2531-2533,2709` and
`site/docs.html:765,774,778,1045-1046` — including the *same* stale id list at
`:774`, which is the identical "instruction that errors" shape as the `:312` fix.
Not touched because **`site/` is what `mcp.ravenmcp.ai` serves, and any change to
what that host serves is human-gated to Andrew.** `site` is git-integrated, so
the edit and the deploy are one action. Andrew's call, put to him with the
count-reconciliation fork.

### P3 — `site/about.html:511,538` says five brand-voice guides. REPORTED.

The registry holds four. Same gated surface; same question.

### Corpus counts — round 1's P2-1, now measured rather than asserted

Sol independently confirmed **132 loaded / 131 unique** principles (`peak-end-rule`
duplicated at `src/data/principles/laws-of-ux.json:388` and
`src/data/service-design/principles/service-design-principles.json:149`) and **23**
pattern sets. So `docs/page.tsx:1520`'s 132/23 is the CORRECT pair and the
homepage's 129/22 (plus `site/about.html`'s) are the stale ones — the opposite of
what the numbers' relative age suggests. Still not fixed: choosing 132-vs-131
belongs with de-duplicating the id in the data, not with a copy edit.

### Instrument fault worth carrying

The first post-deploy golden-hash watcher reported **43 tools / HASH MOVED** on a
hash that is frozen. It was an ad-hoc `grep -oE '"name":"[a-z_]+"'` pipeline, and
that character class **cannot match a tool name containing a digit** — the two it
silently dropped are `audit_ios_a11y` and `get_d4d_framework`. 45 − 2 = 43,
exactly. Replaced with a real JSON parse (`scratchpad/anon-hash.mjs`), which
re-measured **45 tools, `f64bb18…2bb0a6`, GOLDEN MATCH**, and which *prints the
names the bad regex drops* so the diagnosis is a measurement rather than a theory.
**A new unvalidated instrument disagreeing with a known-good frozen value is an
instrument fault until proven otherwise** — the wrong move was available and
cheap, and it was reporting the frozen hash as broken.

Second, smaller: `pgrep -f "gpt-5.6-sol"` reported the Sol process still RUNNING
after it had exited, because the pattern matched `pgrep`'s own command line.
`ps -eo pid,etime,command | grep -i <pat> | grep -v grep` is the check that works.

### Verification

Build re-run clean, `/` at 54.4 kB — the `LISTED_TOOL_COUNT !== TOOL_COUNT`
module-level throw executed and passed at 110. Private-path gate 4/4.
`git ls-remote` confirms remote `main` = local HEAD.

### Still Andrew's

1. `cd web && vercel deploy --prod --yes` — `ravenmcp.ai` is the `web` project and
   has NO git integration, so neither the 110-tool bump nor any of these copy
   fixes are public until he runs it. One run covers all of it.
2. Whether to fix the `site/` Mailchimp + count claims, which is an edit to what
   `mcp.ravenmcp.ai` serves and therefore his gate, not mine.

### Deploy verification for `d103f78` (post-push, measured)

`site` production deployment `dpl_6DAzR75JvYSLn3maDkDWv59ZaEJK`, url
`site-cj3ykf8gt-cunliffeandrewc-8712s-projects.vercel.app`, **● Ready**,
`target: production`, `meta.githubCommitSha` starting `d103f78` — matched on the
SHA out of `vercel ls site --prod --json`, never on a row position, which is the
rule this log already carries after the `sed -n '5p'` watcher cost 28 minutes.

Frozen anon surface re-measured against the live endpoint with the validated
instrument (`scratchpad/anon-hash.mjs`, JSON-parsed rather than regex-scraped):

```
http status: 200 | content-type: application/json
tools: 45
hash : f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6
GOLDEN MATCH
names a [a-z_]+ regex cannot match: 2  audit_ios_a11y, get_d4d_framework
```

That last line is the instrument fault kept in the output on purpose. The
earlier ad-hoc check reported **43 tools / HASH MOVED** and the cause was the
`[a-z_]+` character class, which cannot match a digit-bearing tool name —
45 − 2 = 43 exactly. A brand-new, unvalidated instrument disagreeing with a
known-good frozen value is an instrument fault until proven otherwise, and the
script now prints its own blind spot every run so the next reader cannot repeat
the reasoning.

`d103f78` touches no `src/` and no `api/`, so the human-gated endpoint path was
never in the commit; the hash measurement is the confirmation of that rather
than its substitute.
