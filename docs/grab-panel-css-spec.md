# Grab overlay panel — CSS spec

Status: **SPEC ONLY. No code changed.** Authored 2026-08-09.
Scope: the design panels of the Raven Grab overlay (`browser/raven-grab.js`).

---

## 0. What is transcribed and what is derived — read this first

Andrew's ask was to adopt a reference tool's "visual design spacing, layout,
and controls."
**That tool publishes none of those numbers.** Its documentation page was opened
directly; it documents exactly three visual-adjacent things:

| Reference-tool fact | Published? |
|---|---|
| `theme: 'light' \| 'dark' \| 'system'` (default `system`) | **yes** |
| `mode: 'popover' \| 'inline'` — in popover mode the **collapsed bubble** is draggable, and the panel snaps to the nearest side **when opened** | **yes** |
| `position: 'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` (default `top-right`) | **yes** |
| spacing scale, px values | no |
| row heights, panel dimensions | no |
| type scale, weights, line-heights | no |
| border treatment, hairlines, radii | no |
| control chrome, colors, contrast | no |

**The prop is `mode`, not `layout`.** Two earlier drafts of this document called it
`layout` and described the whole panel as draggable with a snap on release. Both
were wrong: re-read from the page 2026-08-09, the draggable object is the
**collapsed bubble**, and the snap happens **when the panel is opened**, not when
the drag ends.

The page links a component demo. It does **not** instruct anyone to
read component source — that was an earlier draft's invention. Reading the source
or measuring the demo's computed styles is *this spec's own* proposal for a
second pass, and should not be attributed to the reference tool's documentation.

So this spec splits into two honestly-labelled halves:

**The reference tool is deliberately not named in this repo, which is public.**
Its identity and documentation URL are recorded outside version control. Nothing
in this spec depends on either — §1–§5 are Raven's own numbers, and §6 cites only
three prop names any consumer of that tool would already have.

- **§1–§5 are DERIVED, not transcribed.** They are a Raven-native scale
  normalised from Raven's own measured values. Nothing in them is a reference-tool
  number and none of it should ever be described as one.
- **§6 is TRANSCRIBED** — the three things the reference tool actually documents, which
  Raven genuinely lacks.

If someone later wants real numbers from it, that is a second measurement pass
against the demo's computed styles or the GitHub source. It has not been run.

---

## 1. The three measured gaps this spec closes

All measured 2026-08-09 against `browser/raven-grab.js` (14,377 lines). The
overlay CSS is one template literal: **`:host {` opens at :774, the literal
closes at :1564.**

### Gap 1 — there is no spacing token at all

Not one `--raven-grab-space-*` exists. Every padding, gap and margin is a
hardcoded literal.

**Inclusion rules — read these before quoting any number below.** Measured over
the whole overlay style literal (`774-1564`), on the longhand and shorthand forms
of `padding*`, `gap`/`row-gap`/`column-gap`, `margin*`, `border-radius`, and the
size properties `min-height`/`height`/`width`/`min-width`. A declaration whose
value contains `var(`, `calc(`, `%`, `auto`, `min(` or `max(` is **excluded** —
those are token-, font-scale- or viewport-derived and a spacing grid does not
govern them. Counts are **distinct values, unweighted by how often each occurs.**

```
spacing (positive, 23 distinct)
  1 · 1.5 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 12 · 14
  16 · 18 · 20 · 22 · 24 · 28 · 32 · 40 · 48 · 54
spacing (negative offsets, 8 distinct — excluded from the grid arithmetic)
  -2 · -4 · -5 · -6 · -8 · -16 · -18 · -24
radius  (16 distinct)  1.5 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 12 · 14
                       16 · 20 · 999 · 9999
sizes   (30 distinct)  1 · 4 · 5 · 6 · 11 · 12 · 14 · 16 · 18 · 19 · 20 · 24
                       26 · 28 · 30 · 32 · 34 · 36 · 38 · 44 · 52 · 56 · 60
                       62 · 64 · 88 · 128 · 132 · 140 · 200
```

Nothing enforces the relationship between any two of them, so every new control
invents its own numbers.

> **Correction — an earlier draft of this block was a SAMPLE presented as an
> inventory.** It listed ten paddings, six gaps and nine radii and called that
> the panel's spacing. It was in fact only the style-row region and its immediate
> controls, and it silently omitted at least the panel's own
> `border-radius: 20px` (:824), the version-grid `gap: 1.5px` (:1228), the empty
> state's `border-radius: 12px` (:1258), the settings dialog's
> `border-radius: 14px` (:1368), the settings pane's `padding: 40px 48px` (:1377)
> and its mobile `28px 22px` (:1449), and the settings row's `gap: 24px` /
> `min-height: 52px` / `padding: 12px 0` (:1380). **The numbers above are the
> panel-wide measurement; §2's grid arithmetic is derived from them, not from the
> sample.** The token scales in §2 are still scoped narrower than this set — see
> the coverage note there, which states exactly what they do not yet cover.

### Gap 2 — `--raven-grab-ui` and `--raven-grab-mono` are byte-identical

`:788-789`, both `"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

And `:773` imports **only** `family=Geist:wght@300;400;500;600;700` from Google
Fonts — **Geist Mono is never requested.** There is no mono face anywhere in the
overlay. Yet **28 declarations** claim mono — `grep -c 'var(--raven-grab-mono)'`
= 28, measured — and **all 28 are enumerated in §3 under Phase B**, with no
"representative" subset anywhere in this document. That count is the reason the
mono swap is its own phase: it is one declaration with a 28-site blast radius,
not a local change.

> Correction: an earlier draft listed a "representative eleven" here whose
> eleventh entry was "the token-inline row". `.raven-grab-token-inline` (:1112)
> declares `gap: 8px` and is **not a mono call site at all**. A sampled list
> invites exactly that error and has been replaced by the exhaustive one in §3.

> Citation note: every line number in this document has now been re-walked
> individually, in two passes. The first pass (2026-08-09) fixed the three
> citations in the paragraph above; it left §3's own call-site citations
> untouched while claiming otherwise, and that claim was false for a round. The
> second pass re-derived all eleven §3 citations from `grep -n` on the selector
> itself: `:1074→:1075`, `:1090→:1089`, `:1097→:1095`, `:1101→:1098`,
> `:1112→:1104`, `:1119→:1110`, `:1122→:1112`, `:1125→:1117`, `:1128→:1125`,
> plus the §3 range (`1073-1130` → `1073-1127`) and the §3.5 state range
> (`:1102-1105` → `:1099-1103`). The offsets were **not** uniform (measured: 0,
> 0, +1, +2, +3, +8, +9, +10 in pass one; −1 to −9 in pass two), so they were
> corrected one at a time rather than by formula. The six mono citations above
> (`:932`, `:940`, `:979`, `:986`, `:990`, `:991`) and the three panel-geometry
> citations in §3.5 measured correct in both passes and were left alone.

This matters most on the style panel, where the entire point of a value cell
(`11px`, `#1a1a22`, `0 2px 8px rgba(...)`) is that digits and hex align. In a
proportional face they do not.

### Gap 3 — the type scale exists but only inline

Every rule reads
`font: <weight> calc(Npx * var(--raven-grab-font-scale))/<lh> var(--raven-grab-ui|mono)`
with

```
N        ∈ {8, 10, 11, 12, 13, 14}
weight   ∈ {400, 500, 600, 700}
line-h   ∈ {1, 1.25, 1.3, 1.4, 1.45, 1.5}
```

The `calc(... * var(--raven-grab-font-scale))` wrapper is repeated at every call
site by hand. Miss it once and that one control stops honouring the user's font
scale — a silent accessibility regression with no guard.

---

## 2. Token additions — the whole of the new surface

**This section is split into 2A and 2B, and the split is load-bearing.**
Everything in **§2A** is geometry and lands in Phase A. **§2B is one declaration**
— `--raven-grab-mono` — and it lands in Phase B, separately, with its own
capture. §7 item 1 says "apply §2A"; it must never say "apply §2", because §2B
sitting inside the same block would drag the 28-site font swap into the phase
whose whole purpose is a four-pixel readable diff.

All of this goes inside the existing `:host { }` block at `:775-800`. **Additive
only** — with one exception, stated plainly: **§2B REPLACES the existing
`--raven-grab-mono` declaration at :789.** It is the only edit in this document
that changes a line rather than adding one.

### 2A — geometry tokens (Phase A)

```css
/* ---- Spacing. 2px-quantised. The number behind that choice, measured
   panel-wide over the 23 distinct POSITIVE values inventoried in §1
   (inclusion rules are stated there; the 8 negative offsets are excluded
   because a spacing scale does not govern pull-backs):
     2px grid moves  6 of 23 (1, 1.5, 3, 5, 7, 9)                  = 26%
     4px grid moves 13 of 23 (1,1.5,2,3,5,6,7,9,10,14,18,22,54)    = 57%
   Unit is DISTINCT VALUES, unweighted by how often each occurs — no
   occurrence weighting was computed, so do not read this as "half the
   pixels on screen". The justification is panel-wide and NOT from §3.
   Re-derived over §3's SIX migrations (9, 5, 10, 5, 5, 7 — this read
   "four migrations, both grids total 5px" before :1096 was added):
     2px grid: 9>8 1, 5>4|6 1, 10 0, 5 1, 5 1, 7>6|8 1  = 5px
     4px grid: 9>8 1, 5>4   1, 10>12 2, 5>4 1, 5>4 1, 7>8 1 = 7px
   A 2px margin across six values is too small to carry the decision, so
   the panel-wide inventory above is still what chooses the grid — but
   it is no longer a tie, and it leans 2px. Phase 1 normalises; a later
   phase can drop to 4px steps if wanted. ---- */
--raven-grab-space-0:  0;
--raven-grab-space-1:  2px;
--raven-grab-space-2:  4px;
--raven-grab-space-3:  6px;
--raven-grab-space-4:  8px;
--raven-grab-space-5:  12px;
--raven-grab-space-6:  16px;
--raven-grab-space-7:  24px;

/* ---- Radius. Collapses the STYLE-PANEL region's nine values to five plus
   a pill. Panel-wide there are 14 finite radii plus two pill spellings
   (999, 9999) — see §1 — so this scale deliberately does NOT yet cover
   1.5, 3, 14 or 20. Those live in the panel shell, the version grid and
   the settings dialog, all out of scope here. Extending the scale to
   them is a later pass, not an omission to be quietly patched. ---- */
--raven-grab-radius-xs:   2px;   /* was 2       */
--raven-grab-radius-sm:   4px;   /* was 4, 5    */
--raven-grab-radius-md:   6px;   /* was 6, 7    */
--raven-grab-radius-lg:   8px;   /* was 8, 9    */
--raven-grab-radius-xl:   12px;  /* was 10, 16  */
--raven-grab-radius-pill: 999px; /* was 50%     */

/* ---- Control heights. 44px is load-bearing — do not fold it into the
   spacing scale. It is NOT the SC 2.5.8 floor: SC 2.5.8 Target Size
   (Minimum, AA) is 24x24 CSS px, which the overlay meets separately via
   the hit-slop at :1090-1091. 44px is SC 2.5.5 Target Size (Enhanced,
   AAA) and is Raven's own chosen floor. Cite 2.5.5, or cite nothing. ---- */
--raven-grab-control-xs:  20px;  /* radius-expand glyph            */
--raven-grab-control-sm:  28px;  /* token-unlink, icon buttons     */
--raven-grab-control-md:  32px;  /* inline style input             */
--raven-grab-control-row: 36px;  /* style row min-height           */
--raven-grab-control-tap: 44px;  /* touch targets — DO NOT SHRINK  */

/* ---- Type. Every size already carries the font-scale multiplier;
   folding it into the token means a call site cannot forget it. ---- */
--raven-grab-text-micro: calc(8px  * var(--raven-grab-font-scale));
--raven-grab-text-2xs:   calc(10px * var(--raven-grab-font-scale));
--raven-grab-text-xs:    calc(11px * var(--raven-grab-font-scale));
--raven-grab-text-sm:    calc(12px * var(--raven-grab-font-scale));
--raven-grab-text-md:    calc(13px * var(--raven-grab-font-scale));
--raven-grab-text-lg:    calc(14px * var(--raven-grab-font-scale));

--raven-grab-leading-flat:  1;
--raven-grab-leading-tight: 1.25;
--raven-grab-leading-snug:  1.3;
--raven-grab-leading-body:  1.4;
--raven-grab-leading-loose: 1.5;
```

**Nothing above changes a rendered glyph.** Every declaration is a new custom
property; none is referenced until §3's call sites migrate, and every §3
substitution that uses one is value-identical or moves a named pixel listed in
§3.4. That is the property Phase A's capture diff depends on.

### 2B — the mono font token (Phase B, separate commit, separate capture)

```css
/* ---- REPLACES the existing declaration at :789, which is byte-identical
   to --raven-grab-ui. --raven-grab-ui itself is unchanged and is shown
   only so the contrast is visible. ---- */
--raven-grab-ui:   "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--raven-grab-mono: "Geist Mono", ui-monospace, SFMono-Regular, "SF Mono",
                   Menlo, Consolas, monospace;
```

### The font decision, and why it is not free

`:773` is `@import url("https://fonts.googleapis.com/css2?family=Geist:...")`
**inside a shadow-root style block injected into a third-party page.** Three
consequences, all real:

1. A page with a strict `style-src`/`font-src` CSP blocks it silently. The whole
   panel already falls back to `-apple-system` today on those pages — nobody has
   measured how often.
2. Adding `family=Geist+Mono` to that same import adds a **second font-family
   payload** to every grab session on every page. **How much is unmeasured** —
   an earlier draft said "doubles", which was never measured and is unlikely to
   be exactly right (the two families ship different weight sets, and the import
   requests five Geist weights). If the number matters to the decision, measure
   the two CSS responses and their referenced woff2 files; do not quote a factor.
3. The fallback chain above is chosen so that **failure is invisible**:
   `ui-monospace` resolves to SF Mono on macOS and Consolas on Windows with no
   network at all. If the Geist Mono request is judged not worth the bytes, drop
   `"Geist Mono"` from the front of the list and the token still does its job —
   digits align, and no external request is added.

**Recommendation: do not add Geist Mono to the import.** Ship the token with
`ui-monospace` leading. It costs zero bytes, zero requests, works under CSP, and
closes the gap the value cells actually have.

---

## 3. Call-site migration — style rows

This is the highest-value migration surface. Current
state is `browser/raven-grab.js:1073-1127`.

**How to read the CSS blocks below.** They are **declaration-level
substitutions**, not complete rules. Each shows only the declarations that
change, and an "AFTER" block silently omits every declaration in the source rule
that is staying as it is — `color`, `background`, `border`, `width`,
`overflow-wrap`, `cursor`, `user-select`, `text-align`, `letter-spacing` and so
on. **Pasting an AFTER block over a whole rule deletes those and breaks the
panel.** Change the named declarations in place.

**§3.1 is the only block in this document DESIGNED to be a complete rule**, and
is labelled as such inline. (§3.4's `:1095` line also happens to show every
declaration its source rule has — but only because that rule has two. Treat it
as a substitution list like its neighbours; nothing marks it otherwise.) Everything else — including §3.2, whose source rule at :1078 also carries
`display: block; grid-template-columns: none; min-height: 0; background:
transparent; pointer-events: none`, and whose label rule at :1081-1085 also
carries `color` and `letter-spacing: .02em` — is a substitution list. Replacing
the :1078 rule wholesale would drop `display: block` and return the category
headings to grid layout, which is a visible break, not a subtle one.

**§3 lands in two phases and they are not interchangeable.**

- **Phase A — geometry only.** Spacing, radius, control-size and type-size
  tokens from **§2A**. Every substitution below is either value-identical or
  moves a named pixel. Blast radius is exactly the rules quoted here, so a
  before/after diff is readable and §5.2 means something.
- **Phase B — the `--raven-grab-mono` swap from §2B.** One declaration, and it
  is **not** local to §3. `var(--raven-grab-mono)` is referenced **28 times**
  across the overlay; §3 migrates four of them (`:1086`, `:1096`, `:1098`,
  `:1107`) and the other 24 change at the same instant because the token is
  global. **The full 24, exhaustively** — the hover label (`:811`), keycaps
  (`:932`), tabs (`:940`), the caret (`:979`), element chips (`:986`),
  placeholders (`:990`), tooltips (`:991`), token names (`:1003`), version counts
  (`:1019`), state token values (`:1049`), inputs and selects (`:1057`), the
  token-picker option (`:1147`), easing and spring presets (`:1170`, `:1174`),
  style select/format/unit (`:1253`), slot selectors (`:1262`), badges (`:1271`),
  layer slots and labels (`:1286`, `:1289`, `:1306`, `:1307`), keycaps in
  settings and shortcuts (`:1347`, `:1392`), and change-copy (`:1467`).
  4 + 24 = 28, which reconciles with the `grep -c` in §1.

> Correction: an earlier draft of that list held only 21 entries while claiming
> 24, silently omitting `.raven-grab-label` (:811),
> `.raven-grab-token-picker-option` (:1147) and
> `.raven-grab-style-select, .raven-grab-style-format, .raven-grab-style-unit`
> (:1253). The total of 28 was right and the enumeration behind it was not —
> which is exactly why the enumeration is now exhaustive and arithmetically
> reconciled rather than "representative".

Landing them together makes the §5.2 capture diff unreadable — every glyph in
the panel changes metrics at once and the six moved pixels (§3.4) cannot be
picked out of it. Land A, capture, then land B and capture again.

**Standing constraint, quoted from the source comment at :1073:**

> `/* Flat hairline-ruled groups — no nested card inside the panel card (Andrew, 2026-07-18). */`

Any redesign that reintroduces a card inside the panel card contradicts a
recorded Andrew taste decision. This spec keeps the flat hairline treatment.

### 3.1 The row

```css
/* BEFORE (:1075) */
.raven-grab-styles li {
  display: grid;
  grid-template-columns: minmax(92px, .8fr) minmax(0, 1.2fr);
  align-items: center;
  gap: 12px;
  min-height: 36px;
  padding: 9px 2px;
}

/* AFTER */
.raven-grab-styles li {
  display: grid;
  grid-template-columns: minmax(92px, .8fr) minmax(0, 1.2fr);
  align-items: center;
  gap: var(--raven-grab-space-5);              /* 12 → 12, no change */
  min-height: var(--raven-grab-control-row);   /* 36 → 36, no change */
  padding: var(--raven-grab-space-4) var(--raven-grab-space-1); /* 9px 2px → 8px 2px */
}
```

**The only pixel that moves is the row's vertical padding: 9px → 8px, i.e. the
row is 2px shorter.** `min-height: 36px` still governs, so a single-line row does
not move at all — this is visible only on a wrapped two-line value. That is the
entire visual cost of the row migration and it should be confirmed on a capture,
not assumed.

### 3.2 Category headings

```css
/* BEFORE (:1078, :1080, :1081-1085) */
.raven-grab-styles li.raven-grab-style-category { padding: 16px 2px 6px; }
.raven-grab-styles li.raven-grab-style-category:first-child { padding-top: 2px; }
.raven-grab-styles li.raven-grab-style-category .raven-grab-style-category-label {
  font: 700 calc(12px * var(--raven-grab-font-scale))/1.3 var(--raven-grab-ui);
}

/* AFTER — every value already on-scale, zero pixels move */
.raven-grab-styles li.raven-grab-style-category {
  padding: var(--raven-grab-space-6) var(--raven-grab-space-1) var(--raven-grab-space-3);
}
.raven-grab-styles li.raven-grab-style-category:first-child {
  padding-top: var(--raven-grab-space-1);
}
.raven-grab-styles li.raven-grab-style-category .raven-grab-style-category-label {
  font: 700 var(--raven-grab-text-sm)/var(--raven-grab-leading-snug) var(--raven-grab-ui);
}
```

### 3.3 The value cell — the one row where Phase B is visible on its own terms

```css
/* BEFORE (:1098) */
.raven-grab-styles code {
  min-height: 18px;
  font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono);
  border-radius: 4px;
}

/* AFTER */
.raven-grab-styles code {
  min-height: 18px;                            /* unchanged */
  font: 400 var(--raven-grab-text-xs)/var(--raven-grab-leading-body) var(--raven-grab-mono);   /* Phase A */
  border-radius: var(--raven-grab-radius-sm);  /* Phase A — 4 → 4 */
  font-variant-numeric: tabular-nums;          /* NEW — Phase B, NOT Phase A */
}
```

**Substitution list, not a complete rule** — the source rule at `:1098` also
carries `display: flex`, `align-items: center`, `justify-content: flex-end`,
`overflow-wrap: anywhere`, `color`, `cursor: pointer` and `text-align: right`,
none of which appear above and all of which stay. **Three of those seven are
load-bearing:** `display: flex`, `justify-content: flex-end` and
`text-align: right` are jointly what right-aligns the value against the row's
label, and an edit that replaced this rule wholesale from the block above would
left-align every value in the panel.

An earlier draft of this note listed `background`, `padding` and
`letter-spacing` — **none of which are on this rule at all** (`background` is on
`code:hover`, `:1099`) — while omitting all five layout declarations above. It
was the note whose stated purpose is preventing a wholesale replacement, naming
the wrong declarations to preserve. Read the source line, do not paraphrase it.

**`font-variant-numeric` lands in Phase B, and this is the one place Phase A's
"geometry only" claim had a hole in it.** An earlier draft marked it `/* NEW */`
inside a block otherwise labelled Phase A. It is not geometry: it selects a
different glyph set, so it changes rendered advance widths on any numeric value
— which is precisely the class of change Phase A exists to keep out of the §5.2
capture diff. It belongs with the mono swap it is hedging for. Phase A's moved-
pixel list in §3.4 is exhaustive **only** with this declaration deferred.

Once `--raven-grab-mono` resolves to a real monospace, this cell renders `16px`,
`#1a1a22` and `0 2px 8px rgba(0,0,0,.4)` in aligned columns for the first time.
`tabular-nums` is belt-and-braces for the fallback case — a proportional fallback
face still aligns digits with it.

**This is the row where the mono swap pays for itself, not the only row it
changes.** The earlier draft of this paragraph said "the only change in §3 a
user will notice", which is false twice over: `.raven-grab-styles span`
(`:1086`) and `.raven-grab-style-input` (`:1107`) are also mono call sites
inside §3, and 24 further call sites outside §3 change with them (see the Phase
B list above). What is true is narrower and still worth stating: this is the
cell whose *purpose* is column alignment, so it is where a real monospace face
is a legibility fix rather than a texture change.

### 3.4 Labels, inputs, controls

```css
/* :1086  */ .raven-grab-styles span      { font: 400 var(--raven-grab-text-xs)/var(--raven-grab-leading-body) var(--raven-grab-mono); }
/* :1088  */ .raven-grab-style-label-wrap { gap: var(--raven-grab-space-2); }   /* 5 → 4 */
/* :1089  */ .raven-grab-radius-expand    { width: var(--raven-grab-control-xs); height: var(--raven-grab-control-xs);
                                            border-radius: var(--raven-grab-radius-sm);
                                            font: 600 var(--raven-grab-text-sm)/var(--raven-grab-leading-flat) var(--raven-grab-ui); }
/* :1095  */ .raven-grab-radius-field > span { font: 600 var(--raven-grab-text-micro)/var(--raven-grab-leading-flat) var(--raven-grab-ui);
                                               letter-spacing: -.01em; }
/* :1096  */ .raven-grab-radius-field input  { padding: var(--raven-grab-space-2) var(--raven-grab-space-3);  /* 4px 5px → 4px 6px */
                                               border-radius: var(--raven-grab-radius-sm);                   /* 5 → 4 */
                                               font: 400 var(--raven-grab-text-2xs)/var(--raven-grab-leading-snug) var(--raven-grab-mono); }
/* :1104  */ .raven-grab-style-input      { min-height: var(--raven-grab-control-md);
                                            padding: var(--raven-grab-space-3) var(--raven-grab-space-5);  /* 6px 10px → 6px 12px */
                                            border-radius: var(--raven-grab-radius-lg);                    /* 8 → 8 */
                                            font: 400 var(--raven-grab-text-xs)/var(--raven-grab-leading-body) var(--raven-grab-mono); }
/* :1110  */ .raven-grab-style-editor     { gap: var(--raven-grab-space-3); }   /* 6 → 6 */
/* :1112  */ .raven-grab-token-inline     { gap: var(--raven-grab-space-4); }   /* 8 → 8 */
/* :1117  */ .raven-grab-token-unlink     { width: var(--raven-grab-control-sm); height: var(--raven-grab-control-sm);
                                            border-radius: var(--raven-grab-radius-md); }  /* 7 → 6 */
/* :1125  */ .raven-grab-token-unlink-row { margin-left: var(--raven-grab-space-2); }       /* 4 → 4 */
```

**`:1095` is a full-shorthand replacement, not an added `font-size`.** The source
declaration is
`font: 600 calc(8px * var(--raven-grab-font-scale))/1 var(--raven-grab-ui); letter-spacing: -.01em;`
— four properties plus tracking. An earlier draft of this line specified
`font-size` alone, which either silently drops weight / line-height / family or
leaves the old `calc()` in place and fails §5.4. The `letter-spacing` is carried
over verbatim; it is not on any token scale and is not being normalised here.

The blocks in §3.4 are **substitution lists**. Each line names only the
declarations that change. An earlier draft covered the rest with a hedged
"`display`, `color`, `background`, `border`, `cursor`, `min-width`,
`align-items` and so on" — which is a paraphrase, and the same paraphrase in
§3.3 was wrong in both directions. Read per rule, and note the three marked
**LOAD-BEARING**: dropping one is a visible break, not a cosmetic loss.

| Rule | Also carries — all staying, none shown above |
|---|---|
| `:1086` `.raven-grab-styles span` | `color` |
| `:1088` `.raven-grab-style-label-wrap` | `display: inline-flex`, `align-items: center`, `min-width: 0` |
| `:1089` `.raven-grab-radius-expand` | **LOAD-BEARING `position: relative`**, `padding: 0`, `color`, `background: transparent`, `border: 0`, `cursor: pointer` |
| `:1095` `.raven-grab-radius-field > span` | nothing — the source rule is exactly the two declarations shown |
| `:1096` `.raven-grab-radius-field input` | `width: 100%`, `min-width: 0`, `color`, `background`, `border: 1px solid rgba(255,255,255,.12)`, `outline: none` |
| `:1104` `.raven-grab-style-input` | `width: 100%`, `min-width: 0`, `color`, `background`, `border: 1px solid var(--raven-grab-accent)`, `outline: none` |
| `:1110` `.raven-grab-style-editor` | `display: flex`, `flex-wrap: wrap`, `align-items: center`, `width: 100%` |
| `:1112` `.raven-grab-token-inline` | `display: grid`, `width: 100%`, **LOAD-BEARING `flex: 1 0 100%`**, `margin-bottom: 2px` |
| `:1117` `.raven-grab-token-unlink` | `flex: 0 0 auto`, `display: inline-flex`, `align-items: center`, `justify-content: center`, `padding: 0`, `color`, `background: transparent`, `border`, `cursor: pointer` |
| `:1125` `.raven-grab-token-unlink-row` | **LOAD-BEARING `opacity: 0`**, `flex: 0 0 auto`, `transition: opacity 120ms ease` |

- **`:1089` `position: relative`** is the containing block for the `::before`
  hit-slop at `:1091`, which is inset `-2px` on all four sides to turn the 20px
  glyph into a 24×24 target. Drop it and the pseudo-element resolves against
  whatever ancestor is positioned instead, so the AA target size in §4 item 4
  silently stops being met while nothing looks different.
- **`:1112` `flex: 1 0 100%`** is what forces the token row onto its own line
  inside the wrapping flex editor at `:1110`. Drop it and the token controls
  share a line with the value input.
- **`:1125` `opacity: 0`** is why the unlink control is invisible until the row
  is hovered or focused (`:1126-1127` raise it to 1). Drop it and every style
  row shows a permanent unlink button.

`:1095` is the one line in §3.4 that happens to be a complete rule, because its
source has exactly two declarations and both are shown. That is a coincidence of
that rule's size, not a guarantee — do not generalise it to its neighbours.

**`:1096` was missing from this section for three rounds, and §5 check 4 is what
caught it.** It is the seventh raw-px `font:` shorthand inside `:1073-1127` — the
spec named four in-range `--raven-grab-mono` sites in §3's header (`:1086`,
`:1096`, `:1098`, `:1104`) and then substituted only three of them. Measured on
the unmigrated file, check 4's first leg counts **7**; applying the six
type substitutions this section used to carry leaves **1**, so the spec's own
acceptance gate failed on a migration that followed the spec exactly. That is
the check working. Do not treat the pass/fail thresholds in §5.4 as descriptive
of §3 — they are independent, and this is the disagreement they exist to find.

**The `5px` horizontal padding is a genuine tie and the choice is stated, not
derived.** 5 is equidistant from `space-2` (4) and `space-3` (6). It goes **up**
to 6 for consistency with `:1104`, the panel's other text input, whose horizontal
padding also moves up (10→12) — two inputs moving the same direction reads as a
decision; one up and one down reads as an accident. The `border-radius: 5px` on
the same rule goes **down** to `radius-sm` (4) because the radius scale in §2A
already declares `radius-sm` as absorbing "4, 5"; that collapse was decided when
the scale was written and is not re-opened here.

**Every pixel Phase A moves, exhaustively:** row padding 9→8; label-wrap gap
5→4; style-input horizontal padding 10→12; radius-field input horizontal padding
5→6; radius-field input radius 5→4; unlink radius 7→6. **Six values, none moving
more than 2px.** (This read "four values" until `:1096` was added. The count is
a consequence of §3's substitution list, so re-derive it from the list rather
than carrying it forward.) **Nothing else in Phase A changes rendering — which
is true only because §3.3's `font-variant-numeric` is deferred to Phase B.** If
it lands in Phase A, this sentence is false and §5.2's pixel diff stops being
readable.

**Deliberately NOT migrated inside the `:1073-1127` range**, so the boundary is
stated rather than left to look like a second omission: the radius editor's own
grid geometry at `:1093-1094` — `gap: 4px`, `gap: 3px`, and
`grid-template-columns: 16px minmax(0, 1fr)`. `3px` has no token on the 2px
scale and quantising it is a rendering change with no call-site justification
here, and `16px` is a grid TRACK width rather than spacing. Migrating those is a
later pass. None of the three is a `font:` shorthand, so none affects §5 check 4.

**Phase B moves no declared pixel and changes glyph metrics on all 28 mono call
sites** — advance widths, and therefore wrap points on any value long enough to
wrap — **plus digit glyphs in the value cell** via `font-variant-numeric`. It is
not enumerable as a pixel list and must not be diffed as one.

### 3.5 Explicitly out of scope

- `--raven-grab-accent`, `--raven-grab-error` and the rest of the colour block
  (`:776-787`). Untouched.
- The `data-edited`, `data-error`, `data-mixed` and `:focus-visible` state
  treatments (`:1099-1103`). They are correct and carry meaning; only their
  radius literals migrate.
- Panel geometry — `width: min(320px, calc(100vw - 32px))` (:838),
  `min(300px, calc(50vw - 20px))` (:842), the mobile sheet's
  `var(--raven-grab-sheet-height, 50vh)` (:853). Those are layout decisions with
  their own history and are not a token cleanup.

---

## 4. Hard prohibitions

1. **Do not touch `STYLE_CATEGORIES`.** It is not a panel-layout list — it is the
   **capture set**. `STYLE_PROPERTIES` derives from it and feeds
   `computedStylesFor()` into the grabbed payload, so a "tidy the panel" edit
   there silently changes the contract every consumer of a Grab payload reads.
   This spec adds no property and removes none.
2. **Do not reintroduce a card inside the panel card** (:1073, Andrew 2026-07-18).
3. **Mirror after every edit:** `cp browser/raven-grab.js web/public/raven-grab.js`.
   `test/grab-bridge.test.mjs` asserts the two are byte-identical and the diff it
   prints on failure is ~580,000 characters.
4. **`--raven-grab-control-tap: 44px` is a floor, not a preference.** It is
   **WCAG 2.2 SC 2.5.5 Target Size (Enhanced, AAA)** — *not* SC 2.5.8, which is
   the AA criterion and asks for 24×24 CSS px, a bar the overlay meets
   separately through the hit-slop at `:1090-1091` — a 20px visual glyph on
   `.raven-grab-radius-expand` with a `::before` inset `-2px` on all four sides,
   giving a 24×24 clickable area with no layout or visual change. (An earlier
   draft cited `:1102` for this, which is
   `.raven-grab-styles li[data-edited="true"] code` and has nothing to do with
   hit targets; `:1102-1105` in the round-1 citation record is a different,
   correctly-fixed reference to the §3.5 state range.) An earlier draft cited
   2.5.8 here and would have justified a 44px floor with a 24px rule. Cite
   2.5.5, or cite nothing. No control migrates down to `control-row`.
5. **Do not remove the `calc(... * --raven-grab-font-scale)` multiplier** when
   migrating a `font:` shorthand — it is folded into the type tokens, so the
   token must be used, never the raw px.

---

## 5. Verification bar

A token rename that changes nothing is the expected outcome, so every check here
has to distinguish three states, not two: **correctly applied**, **silently not
applied**, and **deleted**. A check that passes on an unchanged tree, or on a
tree where the migrated declarations were simply removed, is not a check. Each
item below names the input that makes it fail.

1. **The tree actually moved, and the mirror followed.** Two commands, in order:
   `git diff --stat browser/raven-grab.js web/public/raven-grab.js` must list
   **both** files with a non-zero diff — an empty diff means nothing landed and
   is a FAIL, which the mirror-identity assertion alone cannot see because two
   unchanged files are trivially identical. Then
   `RAVEN_NO_USAGE_LOG=1 npm test`, where `test/grab-bridge.test.mjs` catches a
   forgotten `cp`.
   *Fails on:* an unmodified tree; an overlay edit with no `cp`.
   **Every browser check below runs against the shadow root, not the document.**
   The overlay attaches an **open** shadow root to a host carrying
   `data-raven-grab-overlay` (`:393-400`), so a bare `document.querySelector`
   returns `null` for every selector in checks 2 and 3 — the earlier draft's
   `$()` did exactly that, and `null` throws rather than failing informatively.
   Paste this first, and treat a `null` element as a **FAIL**, never a skip:

   ```js
   const R = document.querySelector('[data-raven-grab-overlay]').shadowRoot;
   const $ = (s) => { const el = R.querySelector(s); if (!el) throw new Error('NOT FOUND: ' + s); return el; };
   ```

2. **Phase A: a rendered before/after capture of the style panel at both
   viewports, diffed.** The six moved pixels in §3.4 must be the only
   differences — and this is only readable because Phase B has not landed yet.
   A byte-identical capture is a FAIL, not a pass. Separate "identical because
   correct" from "identical because inert" by reading six computed values, one
   per moved pixel:
   `getComputedStyle($('.raven-grab-styles li:not(.raven-grab-style-category)')).paddingTop === '8px'`;
   `getComputedStyle($('.raven-grab-style-label-wrap')).gap === '4px'`;
   `getComputedStyle($('.raven-grab-style-input')).paddingLeft === '12px'`;
   `getComputedStyle($('.raven-grab-radius-field input')).paddingLeft === '6px'`;
   `getComputedStyle($('.raven-grab-radius-field input')).borderRadius === '4px'`;
   `getComputedStyle($('.raven-grab-token-unlink')).borderRadius === '6px'`.

   **`:not(.raven-grab-style-category)` is load-bearing.** `renderPanel` pushes
   each category heading `<li>` *before* the rows it heads (`:11648`), so the
   first `.raven-grab-styles li` in the list is **always** a category row — whose
   padding is `16px 2px 6px` and which, being `:first-child`, resolves to
   `padding-top: 2px` (`:1080`). The earlier draft read that row and asserted
   `'8px'`, so it failed on a correctly migrated tree.

   **Four of the six elements checks 2 and 3 query are conditional, and the
   panel must be put into the right state first**, or the `$` helper throws on
   correct code. This list read "two of these four" until check 2 grew the two
   `:1096` reads; it is derived from the selector list above plus check 3's
   `.raven-grab-styles code`, so re-derive it if either changes rather than
   carrying it forward.

   | Selector | Precondition | Source |
   |---|---|---|
   | `.raven-grab-styles li:not(.raven-grab-style-category)` | an element is selected and has style rows | — |
   | `.raven-grab-styles code` | same | — |
   | `.raven-grab-style-label-wrap` | the selected element's `border-radius` is not `Mixed` **and** parses via `parseBorderRadius` | `:11631-11632` |
   | `.raven-grab-radius-field input` | the `⌄` expand button has been CLICKED, opening `beginRadiusEdit` | `:12697-12698`, `:8511-8513` |
   | `.raven-grab-style-input` | a style row is in edit mode | — |
   | `.raven-grab-token-unlink` | the row is token-linked | — |

   **Two of those preconditions are ordered, not independent.** The radius
   corner inputs are built by `beginRadiusEdit` (`:8511-8513`), which is reached
   only by clicking `[data-radius-expand]` (`:12697-12698`) — and that button is
   emitted only inside the `.raven-grab-style-label-wrap` branch, so the
   label-wrap precondition must hold before the radius-field one can be
   satisfied at all. A fixture whose `border-radius` is absent, `Mixed`, or
   unparseable makes **three** of the six reads throw, not one.

   Fixture and steps: select an element that carries a parseable
   `border-radius`, whose DESIGN.md links at least one token; open a style row
   for edit; click the `⌄` beside the `border-radius` label. Then run the
   check.

   *Fails on:* tokens defined but never referenced; any one call site missed.
3. **Phase B: prove a monospace face is RENDERING, not that one is declared.**
   Reading `getComputedStyle(...).fontFamily` only reads back the declared list
   and passes even when no mono face resolved. Measure instead — render `'ii'`
   and `'MM'` in the cell's computed font and compare advance widths; a
   monospace face makes them equal, Geist and `-apple-system` do not.

   **Build the canvas font from the longhands, never from the `font` shorthand.**
   Measured in Chromium: a rule carrying `font-variant-numeric: tabular-nums`
   serialises `getComputedStyle(...).font` to the **empty string**, because the
   shorthand cannot represent that longhand — and §3.3 adds exactly that
   declaration to exactly this rule. Assigning `''` to `canvas.font` is ignored,
   the context keeps its `10px sans-serif` default, and the check reports a
   proportional face on a correct tree. The longhand form was measured against a
   mono and a proportional fixture: `ii`/`MM` came back `13.20`/`13.20` for
   `ui-monospace` and `5.56`/`19.36` for `-apple-system`.

   ```js
   const cs = getComputedStyle($('.raven-grab-styles code'));
   const c  = document.createElement('canvas').getContext('2d');
   c.font   = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
   const m  = (s) => c.measureText(s).width;
   m('ii') === m('MM');   // must be true
   ```

   (Canvas normalises the weight out of `c.font` on read-back. That is expected —
   this check measures which *family* resolved, which is the claim being made.)

   *Fails on:* the token changed but Geist Mono/`ui-monospace` unavailable; the
   token edited in `:host` but the call sites left on `--raven-grab-ui`.
4. **No leftover raw-px font call sites, and the tokens are actually used.**
   Three counts over the migrated region, **piped** — the earlier draft wrote
   the `sed` and the `grep` as two separate commands, which counts over the
   whole 14,377-line file and makes every number meaningless:

   ```sh
   sed -n '1073,1127p' browser/raven-grab.js | grep -c 'calc([0-9]*px \* var(--raven-grab-font-scale))'   # must be 0
   sed -n '1073,1127p' browser/raven-grab.js | grep -c 'var(--raven-grab-text-'                            # must be >= 6
   sed -n '1073,1127p' browser/raven-grab.js | grep -c 'var(--raven-grab-mono)'                            # must be exactly 4
   ```

   The first alone passes on deleted declarations; the second stops that. The
   third is what catches a `font:` shorthand rewritten to a bare `font-size`, or
   one that silently drops its family — the failure §3.4 warns about at `:1095`,
   which neither of the first two can see.
   *Fails on:* a missed call site; a declaration removed instead of migrated; a
   shorthand rewritten in a way that drops the family.

   **Pre-migration counts, measured on the unmigrated file rather than assumed**
   — leg 1 counts **7** and leg 3 counts **4**. Leg 1's 7 is what caught the
   `:1096` omission (see §3.4): the six substitutions §3 used to carry left it at
   1, so the expected 0 is only reachable once all seven are migrated. Leg 3's
   pre-count is already 4 and its expectation is also 4, so **that leg is
   unchanged by a correct migration and is a preservation check, not a progress
   check** — it fails only if a shorthand is rewritten in a way that drops
   `var(--raven-grab-mono)`.

   **What check 4 CANNOT see, stated so it is not read as more than it is.** All
   three legs are shape counts, blind to which token was chosen. A migration that
   substitutes `--raven-grab-text-lg` where §3 says `--raven-grab-text-2xs`
   scores 0 / ≥6 / 4 and passes every leg while rendering the radius corner
   inputs at roughly twice their intended size. Check 4 bounds the SHAPE of the
   migration; check 2's computed reads and the Phase A capture diff are the only
   things that bound the VALUES. Neither check 2 nor check 4 currently reads a
   font SIZE at all — §3.4's exhaustive-pixel claim is the argument that the
   capture diff would show it, and that argument is only as good as the capture.

---

## 6. TRANSCRIBED — what the reference tool documents, and what Raven lacks

These are the only three of its facts with published values. All three are
**structural, not stylistic**, and each is a separate piece of work from §1–§5.

### 6.1 `theme: 'light' | 'dark' | 'system'` — Raven has no light mode

Measured: **`prefers-color-scheme` appears 0 times in `browser/raven-grab.js`.**
The colour block at `:776-787` is unconditionally dark (`#1a1a22` ground,
`#F0F0F2` text). Grab is injected into the user's own page, so on a light-mode
site the panel is a dark slab against a white document.

The token layer in §2 is a prerequisite for fixing this and is not itself the
fix. The shape would be: keep the existing values as the dark theme, add a light
palette, and switch on `@media (prefers-color-scheme: light)` plus an explicit
override so a user can pin it. **Not specced here** — a light palette is a real
design pass with contrast obligations, not a token rename, and it needs its own
Raven `audit_contrast` run.

### 6.2 `mode: 'popover' | 'inline'` — Raven has popover only

In its popover mode the **collapsed bubble** is draggable, and the panel
snaps to the nearest side **when it is opened**. (Not: the whole panel dragging
with a snap on release. Two earlier drafts said that; see §0.)

**Two earlier drafts of this section were also wrong about Raven, in opposite
directions, and the second error is the one that changes the recommendation.**

Draft 1 said `snap`/`dock` appear 0 times in the overlay. False —
`mobileSheetDock` (`:332`), `mobileSheetSnap` (`:354`), `setMobileSheetDock`
(`:2681`), `setMobileSheetSnap` (`:2750`), `nextDock` (`:2981`).

Draft 2 then over-corrected, reading `endMobileSheetDrag`'s three-detent loop as
a working nearest-target snap and recommending it as the pattern to port.
**Read against `pointermove`, that loop cannot respond to the gesture at all.**

- **Mobile sheet — one of its two release behaviours is real, and it is not the
  one that looks like a snap.** Sheet height is `height:
  var(--raven-grab-sheet-height, 50vh)` (`:853`), written only by
  `setMobileSheetSnap` (`:2757`). `pointermove` (`:2960-2968`) writes `top` and
  `bottom: auto` — **it never touches height**, and its own comment says so
  (*"Move the sheet as one object … Resizing from the bottom could never cross
  the viewport midpoint"*). So at release, `getBoundingClientRect().height` is
  still exactly `mobileSheetHeight(currentSnap)` — `box-sizing: border-box` is
  global (`:790`), so the measured box *is* the declared height — and the
  nearest-target loop is comparing that value against a list that contains it.
  Distance 0. **It re-selects the detent the sheet already had, every time.**
  The only gesture-dependent output of `endMobileSheetDrag` is `nextDock`
  (`:2981`): midpoint above or below the viewport midpoint → top or bottom.
  **An earlier draft conceded two narrow cases where the loop is non-inert.
  Both were checked against the source and BOTH ARE CLOSED**, so the inertness
  claim is stronger than that draft stated — this is a correction in the spec's
  own favour, which is why it is written out rather than quietly deleted.
  - *Release inside the 200ms `transition: height`* (`:854`). Closed:
    `beginMobileSheetDrag` sets `data-sheet-dragging="true"` (`:2956`), and
    `:868` matches that attribute with `transition: none` — on the **same
    selector** the transition is declared on
    (`:host([data-mobile-sheet="true"]) .raven-grab-panel:not([data-side="left"])`,
    `:851` vs `:868`), so no height interpolation can be running while a drag
    is in progress.
  - *Viewport resize between the snap and the drag.* Closed: the `resize`
    listener (`:14317-14319`) calls `updateMobileSheetViewport`, which rewrites
    `--raven-grab-sheet-height` from `mobileSheetHeight(mobileSheetSnap)`
    (`:14302`) — recomputed from the **current** `window.innerHeight`
    (`:2747`), so the stored pixel height and the loop's targets are recomputed
    from the same input and cannot disagree.

  **One genuine residual, narrower than either conceded case.** `:14302` is
  guarded by `if (mobileSheetSnap !== "collapsed")`, so a resize while the sheet
  is collapsed leaves the custom property unwritten. Whether that is reachable
  in a way that reaches the loop is **UNMEASURED** — it needs a reproduction
  (collapse the sheet, resize, expand, drag, release) before it is called either
  a hole or a non-issue. Do not upgrade it to a defect on this paragraph alone.
- **Desktop rail — draggable, clamped, and does NOT snap.** `wirePanelDrag`
  (`:2907`) arms on the header only. `placePanel` (`:2884`) writes `right: auto`
  and `left` alone and carries the comment *"Panels are pinned full-height
  (top/bottom 20px); drag moves them horizontally only."* `clampPanelCoordinate`
  holds it 8px inside the viewport. `endPanelDrag` releases the pointer and
  nothing else — no detent, no edge attraction.

So: the panel is not "free-floating" (it is a full-height column moving on one
axis), and Raven is not snapless. What is missing is **horizontal edge-snapping
on the desktop rail**, and the *decision* to port is `nextDock`'s midpoint test
(`:2981`) rewritten for the horizontal axis: on `endPanelDrag`, compare the
panel's horizontal midpoint against the viewport's and pick a side. **Do not
port the three-detent loop** — it is the part that does not work, and copying it
onto `endPanelDrag` would reproduce a no-op.

**But an earlier draft called the mechanism "one line, not a loop" — setting
`data-side` and letting the stylesheet do the movement — and that is wrong in
three independent ways. Each has to be handled or the attribute flips and
nothing moves.**

1. **Inline geometry outranks the stylesheet.** `placePanel` writes
   `el.style.right = "auto"` and `el.style.left = next.left + "px"`
   (`:2888-2889`). `[data-side="left"]` (`:833`) is a stylesheet rule declaring
   the same two properties, so after any drag the inline pair wins and the
   attribute is inert. **The codebase already knows this rule and already has
   the fix for the other direction**: `updateMobileSheetViewport` calls
   `style.removeProperty("left")` / `("right")` on entry to sheet mode, with the
   comment *"inline left/right would outrank the sheet dock"* (`:14296-14300`).
   Snapping needs the same `removeProperty` pair, or an inline `left` written to
   the snapped coordinate instead of an attribute flip.
2. **`__ravenPosition` is restored behind you.** `clampPanelToViewport`
   (`:2893-2904`) reads `el.__ravenPosition` and feeds `pos.left` straight back
   into `placePanel`; it runs on every `resize` (`:14320`). Clearing the inline
   style without clearing or updating `__ravenPosition` means the pre-snap
   coordinate reappears at the next viewport resize.
3. **Nothing animates `left`.** The only declared transition on the panel is
   `transition: transform 200ms ease` (`:831`) — `transform` alone. A `left`
   change, inline or from the stylesheet, is instantaneous. An animated snap
   needs either a `transform`-based move (translate to the snapped side, then
   settle the real coordinate) or `left` added to the transition list; **this
   spec does not choose between them, and the choice is not a token change.**

Consequence for §7: edge-snapping is a small piece of work, not a one-line one,
and its unit is *inline-geometry ownership* rather than *a CSS attribute*.

Note the loop is described here as inert, not as a bug to fix: nothing observable
is currently wrong on mobile, because the detent it re-selects is the correct
one. Whether to delete it is a separate call and is **not specced here**.

Its `inline` mode — the panel rendered in document flow rather than
floating — has no Raven equivalent at all. Whether it is wanted is a product
question, not a CSS one.

### 6.3 `position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'`

**An earlier draft called this "trivial once edge-snapping exists". It is not,
and the reason is geometry, not effort.** Raven's panel has no corner to place:
`:821` declares `position: fixed; top: 20px; right: 20px; bottom: 20px`, so
**top and bottom are both pinned** and the height is whatever the viewport
leaves. The two `@media` blocks re-pin the same three edges at 12px (`:838`) and
10px (`:842`). `placePanel` (`:2884`) writes `right: auto` and `left` and
touches neither vertical edge — it stores a `top` in `el.__ravenPosition` that
is never applied to style.

Raven therefore has **two anchored SIDES plus a continuum of dragged horizontal
positions — not four positions, and not two either.** An earlier draft said
"two positions, not four", which undercounts: `data-side` (`:833`) declares two
anchors, but `placePanel` writes an arbitrary inline `left` (`:2889`) clamped
only by `clampPanelCoordinate`, so the panel rests wherever the drag left it.
What Raven lacks is not positions, it is *vertical* placement.

The "never applied" half was verified and is stronger than stated:
`el.__ravenPosition` stores a `top` (`:2886`) that `clampPanelToViewport` reads
and passes back into `placePanel` (`:2903`), which writes only `right` and
`left` — so `pos.top` round-trips indefinitely and **never reaches the DOM**.
The module-level `panelPosition` (`:352`) is assigned from it at `:2887` and is
**never read anywhere in the file** — a write-only variable. Both are latent
plumbing for a vertical axis that does not exist yet, not evidence one does.

"Bottom-right" is not a variant of
the current panel; it is a different object — one that has a height, and so
needs a scroll boundary, a resize story, and a decision about what happens to
the Layers/Styles lists that currently fill a full-height column.

Sequencing follows from that, and it inverts the earlier claim: horizontal
edge-snapping (§6.2) is **independent** of corner placement rather than a
prerequisite for it, because snapping operates on the axis Raven already has.
Four-corner placement is a panel-geometry redesign and is **not specced here**.

---

## 7. Recommended order

1. **Phase A — tokens + geometry call-site migration (§2A + the Phase A half of
   §3).** Additive, six pixels move (§3.4 enumerates them), fully reversible,
   and it is the
   prerequisite for everything below. **Not "§2–§3"** — §2B is the mono
   declaration and §3.3's `font-variant-numeric` is Phase B; pulling either into
   this commit is what makes the §5.2 diff unreadable. Capture and diff before
   going further (§5.2).
2. **Phase B — the mono font token (§2B) plus §3.3's `font-variant-numeric`.**
   One token declaration and one property, no new network request, and the
   largest visible change in this document — but it lands on **28 call sites at
   once** and must be captured separately (§3, §5.3).
3. **Desktop horizontal edge-snapping (§6.2).** Self-contained but **not a
   one-line change** — an earlier draft of this item said "driving the existing
   `data-side` attribute", and §6.2 now measures three reasons that alone does
   nothing: inline `left`/`right` from `placePanel` (`:2888-2889`) outrank the
   `[data-side="left"]` rule (`:833`); `clampPanelToViewport` (`:2903`) restores
   the pre-snap coordinate from `__ravenPosition` on the next resize (`:14320`);
   and the only declared transition is `transform` (`:831`), so nothing animates
   a `left` change. Port the **`nextDock` midpoint decision** (`:2981`) onto
   `endPanelDrag`; own the inline geometry the way `updateMobileSheetViewport`
   already does (`:14296-14300`); pick an animation mechanism (§6.2 does not).
   **Do not port the three-detent nearest-target loop** — §6.2 measures it as
   inert, because `pointermove` never changes the sheet's height.
4. **Light theme (§6.1).** Real design work. Needs its own pass and its own
   contrast audit. Do not fold it into 1.

**Not in this list, deliberately: four-corner placement (§6.3).** An earlier
draft called it trivial after item 3. It is a panel-geometry redesign — the
panel pins `top`, `right` and `bottom` simultaneously and has no height of its
own — and it is independent of item 3 rather than downstream of it.

Phases A and B together are roughly a single sitting, but they are two commits
and two captures. Items 3 and 4 are separate work.
