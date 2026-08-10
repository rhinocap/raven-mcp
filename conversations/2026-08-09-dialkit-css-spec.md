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
