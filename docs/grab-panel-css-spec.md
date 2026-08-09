# Grab overlay panel — CSS spec

Status: **SPEC ONLY. No code changed.** Authored 2026-08-09.
Scope: the design panels of the Raven Grab overlay (`browser/raven-grab.js`).

---

## 0. What is transcribed and what is derived — read this first

Andrew's ask was to adopt "DialKit's visual design spacing, layout, and controls."
**DialKit publishes none of those numbers.** `https://joshpuckett.me/dialkit` was
opened directly; it documents exactly three visual-adjacent things:

| DialKit fact | Published? |
|---|---|
| `theme: 'light' \| 'dark' \| 'system'` (default `system`) | **yes** |
| layout `'popover'` (draggable, snaps to nearest edge when opened) / `'inline'` | **yes** |
| `position: 'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` (default `top-right`) | **yes** |
| spacing scale, px values | no |
| row heights, panel dimensions | no |
| type scale, weights, line-heights | no |
| border treatment, hairlines, radii | no |
| control chrome, colors, contrast | no |

The page itself says to read the component source or the `/dialkit/photostack` demo.

So this spec splits into two honestly-labelled halves:

- **§1–§5 are DERIVED, not transcribed.** They are a Raven-native scale
  normalised from Raven's own measured values. Nothing in them is a DialKit
  number and none of it should ever be described as one.
- **§6 is TRANSCRIBED** — the three things DialKit actually documents, which
  Raven genuinely lacks.

If someone later wants real DialKit numbers, that is a second measurement pass
against the demo's computed styles or the GitHub source. It has not been run.

---

## 1. The three measured gaps this spec closes

All measured 2026-08-09 against `browser/raven-grab.js` (14,377 lines). The
overlay CSS is one template literal: **`:host {` opens at :774, the literal
closes at :1564.**

### Gap 1 — there is no spacing token at all

Not one `--raven-grab-space-*` exists. Every padding, gap and margin is a
hardcoded literal. Measured values in use:

```
padding : 5px 8px · 3px 8px · 12px 6px · 7px 9px · 1px 5px · 9px 2px
          16px 2px 6px · 6px 10px · 4px 5px · 12px 14px
gap     : 3 · 4 · 5 · 6 · 8 · 12
margin  : 0 0 8px · 0 0 12px
radius  : 2 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 16 · 50%
height  : 44 (tap floor) · 36 · 32 · 28 · 20 · 18
```

Ten distinct paddings, six gaps, nine radii. Nothing enforces the relationship
between any two of them, so every new control invents its own numbers.

### Gap 2 — `--raven-grab-ui` and `--raven-grab-mono` are byte-identical

`:788-789`, both `"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

And `:773` imports **only** `family=Geist:wght@300;400;500;600;700` from Google
Fonts — **Geist Mono is never requested.** There is no mono face anywhere in the
overlay. Yet eleven surfaces claim mono: tabs (:940), keycaps (:932), the caret
(:979), element chips (:986), placeholders (:990), tooltips (:991), style-row
labels (:1086), radius inputs (:1098), style values (:1101), style inputs
(:1112), and the token-inline row.

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

All of this goes inside the existing `:host { }` block at `:775-800`. **Additive
only.** No existing token is renamed or removed in this phase.

```css
/* ---- Spacing. 2px-quantised because the existing values cluster on odds
   (3/5/7/9) and a strict 4px grid would move ~60% of the panel at once.
   Phase 1 normalises; a later phase can drop to 4px steps if wanted. ---- */
--raven-grab-space-0:  0;
--raven-grab-space-1:  2px;
--raven-grab-space-2:  4px;
--raven-grab-space-3:  6px;
--raven-grab-space-4:  8px;
--raven-grab-space-5:  12px;
--raven-grab-space-6:  16px;
--raven-grab-space-7:  24px;

/* ---- Radius. Collapses nine values to five plus a pill. ---- */
--raven-grab-radius-xs:   2px;   /* was 2       */
--raven-grab-radius-sm:   4px;   /* was 4, 5    */
--raven-grab-radius-md:   6px;   /* was 6, 7    */
--raven-grab-radius-lg:   8px;   /* was 8, 9    */
--raven-grab-radius-xl:   12px;  /* was 10, 16  */
--raven-grab-radius-pill: 999px; /* was 50%     */

/* ---- Control heights. 44px is the WCAG 2.2 SC 2.5.8 floor and is
   load-bearing — do not fold it into the spacing scale. ---- */
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

/* ---- Fonts. Two real families, not one family twice. ---- */
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
2. Adding `family=Geist+Mono` to that same import doubles the font payload for
   every grab session on every page.
3. The fallback chain above is chosen so that **failure is invisible**:
   `ui-monospace` resolves to SF Mono on macOS and Consolas on Windows with no
   network at all. If the Geist Mono request is judged not worth the bytes, drop
   `"Geist Mono"` from the front of the list and the token still does its job —
   digits align, and no external request is added.

**Recommendation: do not add Geist Mono to the import.** Ship the token with
`ui-monospace` leading. It costs zero bytes, zero requests, works under CSP, and
closes the gap the value cells actually have.

---

## 3. Call-site migration — style rows, verbatim before/after

This is the DialKit-adjacent surface and the highest-value migration. Current
state is `browser/raven-grab.js:1073-1130`.

**Standing constraint, quoted from the source comment at :1073:**

> `/* Flat hairline-ruled groups — no nested card inside the panel card (Andrew, 2026-07-18). */`

Any redesign that reintroduces a card inside the panel card contradicts a
recorded Andrew taste decision. This spec keeps the flat hairline treatment.

### 3.1 The row

```css
/* BEFORE (:1074) */
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
/* BEFORE (:1078, :1080-1084) */
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

### 3.3 The value cell — the one real visual change

```css
/* BEFORE (:1101) */
.raven-grab-styles code {
  min-height: 18px;
  font: 400 calc(11px * var(--raven-grab-font-scale))/1.4 var(--raven-grab-mono);
  border-radius: 4px;
}

/* AFTER */
.raven-grab-styles code {
  min-height: 18px;                            /* unchanged */
  font: 400 var(--raven-grab-text-xs)/var(--raven-grab-leading-body) var(--raven-grab-mono);
  border-radius: var(--raven-grab-radius-sm);  /* 4 → 4 */
  font-variant-numeric: tabular-nums;          /* NEW */
}
```

Once `--raven-grab-mono` resolves to a real monospace, this cell renders `16px`,
`#1a1a22` and `0 2px 8px rgba(0,0,0,.4)` in aligned columns for the first time.
`tabular-nums` is belt-and-braces for the fallback case.

**This is the only change in §3 a user will notice.** Everything else is a
rename. That asymmetry is the point: the token layer is cheap to land and the
font is where the value is.

### 3.4 Labels, inputs, controls

```css
/* :1086  */ .raven-grab-styles span      { font: 400 var(--raven-grab-text-xs)/var(--raven-grab-leading-body) var(--raven-grab-mono); }
/* :1088  */ .raven-grab-style-label-wrap { gap: var(--raven-grab-space-2); }   /* 5 → 4 */
/* :1090  */ .raven-grab-radius-expand    { width: var(--raven-grab-control-xs); height: var(--raven-grab-control-xs);
                                            border-radius: var(--raven-grab-radius-sm);
                                            font: 600 var(--raven-grab-text-sm)/var(--raven-grab-leading-flat) var(--raven-grab-ui); }
/* :1097  */ .raven-grab-radius-field > span { font-size: var(--raven-grab-text-micro); }
/* :1112  */ .raven-grab-style-input      { min-height: var(--raven-grab-control-md);
                                            padding: var(--raven-grab-space-3) var(--raven-grab-space-5);  /* 6px 10px → 6px 12px */
                                            border-radius: var(--raven-grab-radius-lg);                    /* 8 → 8 */
                                            font: 400 var(--raven-grab-text-xs)/var(--raven-grab-leading-body) var(--raven-grab-mono); }
/* :1119  */ .raven-grab-style-editor     { gap: var(--raven-grab-space-3); }   /* 6 → 6 */
/* :1122  */ .raven-grab-token-inline     { gap: var(--raven-grab-space-4); }   /* 8 → 8 */
/* :1125  */ .raven-grab-token-unlink     { width: var(--raven-grab-control-sm); height: var(--raven-grab-control-sm);
                                            border-radius: var(--raven-grab-radius-md); }  /* 7 → 6 */
/* :1128  */ .raven-grab-token-unlink-row { margin-left: var(--raven-grab-space-2); }       /* 4 → 4 */
```

**Every pixel that moves, exhaustively:** row padding 9→8; label-wrap gap 5→4;
input horizontal padding 10→12; unlink radius 7→6. Four values, none over 2px.
Nothing else in §3 changes rendering.

### 3.5 Explicitly out of scope

- `--raven-grab-accent`, `--raven-grab-error` and the rest of the colour block
  (`:776-787`). Untouched.
- The `data-edited`, `data-error`, `data-mixed` and `:focus-visible` state
  treatments (`:1102-1105`). They are correct and carry meaning; only their
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
4. **`--raven-grab-control-tap: 44px` is a floor, not a preference.** WCAG 2.2
   SC 2.5.8. No control migrates down to `control-row`.
5. **Do not remove the `calc(... * --raven-grab-font-scale)` multiplier** when
   migrating a `font:` shorthand — it is folded into the type tokens, so the
   token must be used, never the raw px.

---

## 5. Verification bar

A token rename that changes nothing is the expected outcome, so the test has to
be able to tell "correctly identical" from "silently not applied".

1. `RAVEN_NO_USAGE_LOG=1 npm test` — the mirror-identity assertion in
   `test/grab-bridge.test.mjs` is the guard that catches a forgotten `cp`.
2. **A rendered before/after capture of the style panel at both viewports**,
   diffed. The four moved pixels in §3.4 must be the *only* differences. A
   capture that is byte-identical means the tokens did not take effect — that is
   a failure, not a pass, and the way to tell them apart is to check one computed
   value in the browser (`getComputedStyle(row).paddingTop` must read `8px`).
3. **`font-family` on `.raven-grab-styles code` must resolve to a monospace
   family**, read from `getComputedStyle`, not from the source. Today it resolves
   to Geist or `-apple-system`; if it still does after the change, the token did
   not land.
4. `grep -c 'calc([0-9]*px \* var(--raven-grab-font-scale))'` on the migrated
   region must reach 0 — a leftover literal is a call site that will drift.

---

## 6. TRANSCRIBED — what DialKit actually documents, and what Raven lacks

These are the only three DialKit facts with published values. All three are
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

### 6.2 `layout: 'popover' | 'inline'` — Raven has popover only

DialKit's popover is draggable **and snaps to the nearest edge when opened**.
Measured: `snap`/`dock` appear **0 times** in the overlay. Raven's panel is
draggable and free-floating; it can be left mid-canvas covering the element being
edited. Edge-snapping is a small, self-contained behaviour and is the single
DialKit idea most worth stealing.

DialKit's `inline` mode — the panel rendered in document flow rather than
floating — has no Raven equivalent at all. Whether it is wanted is a product
question, not a CSS one.

### 6.3 `position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'`

Raven has a single default corner. Four-corner initial placement is trivial once
edge-snapping exists and pointless before it.

---

## 7. Recommended order

1. **Tokens + call-site migration (§2–§3).** Additive, four pixels move, fully
   reversible, and it is the prerequisite for everything below.
2. **The mono font token (§2).** One line, no new network request, and it is the
   only change in this document a user will actually see.
3. **Edge-snapping (§6.2).** Self-contained, genuinely DialKit-derived, small.
4. **Light theme (§6.1).** Real design work. Needs its own pass and its own
   contrast audit. Do not fold it into 1.

Items 1 and 2 together are roughly a single sitting. Items 3 and 4 are not.
