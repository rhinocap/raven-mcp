# Grab panels under DevTools device mode — research finding

**2026-07-20 · research only, no product source touched**

> **Branch provenance:** every `browser/raven-grab.js` citation below is on **`f23-templates-layers`**
> (10,311 lines), not `main` (2,107 lines). On main, `:237` is a CSS hover rule and `coldCollapsed`
> does not exist. Read this doc against f23.

## The answer

No — the panels cannot move into the gray letterbox around the emulated device. That area is not part
of the page's coordinate space, so nothing in `raven-grab.js` can reach it.

There is already a shipped setting that solves the obstruction with no code: **Settings → On page
load → Closed**. Everything below is about whether the default should change, and whether anything
else is worth building. On the evidence, probably not much.

## Why the letterbox is unreachable

The letterbox is DOM inside the DevTools frontend document — a privileged
`devtools://devtools/bundled/devtools_app.html` WebUI page, rendered by devtools-frontend's
`panels/emulation/DeviceModeView` (toolbar, rulers, outline, gray surround). The inspected page is a
separate WebContents composited into the rectangle that view reserves for it.

Page script has no window handle to it, no same-origin access, and no scheme access — `devtools://`
is privileged WebUI that page content cannot script. The page's universe is
`0..innerWidth × 0..innerHeight`; everything outside is clipped by the compositor, not by CSS. Negative
`position:fixed` coordinates and transforms were tested and clip as expected.

Confirmed with a headed Chromium + CDP `Emulation.setDeviceMetricsOverride` probe at 414×896.

**Corollary:** page script also cannot reliably *detect* device emulation versus a genuinely narrow
window. `setDeviceMetricsOverride` is what device mode itself uses and presents the same page-side
signals. Any fix keyed on "is this device mode" is keyed on viewport width instead — blunt by
construction.

## Options

| | Design unobstructed | 1-min install | Effort | Note |
|---|---|---|---|---|
| **E** flip the existing setting | fully | yes | **zero** | Ships today. Persisted. Covered by the E2E gate. |
| **C** make it the default at ≤640px | fully | yes | trivial | One line. Touches the 2026-07-19 cold-open call. |
| **A** popout window | fully | yes | large | Can't align to the emulated rectangle; popup blocker forces opt-in; ~700–1,200 new lines. |
| **B** bridge-served device preview | fully | yes | medium–large | Weaker emulation than the status quo it replaces. See below. |
| **D** extension / DevTools panel | fully | no | large | Web Store review; gives up the single-script-tag install. |

A and D do genuinely unobstruct the design — an earlier draft wrongly marked them "no" by conflating
*cannot inhabit the letterbox* with *cannot unobstruct*. They are rejected on cost and precision, not
capability: neither can align to the emulated rectangle (no API exposes DevTools' dock geometry).

## Recommendation

**Flip the setting (E). Consider C only as a default change. Don't scope B yet.**

### E — it already ships

`startupControlMarkup()` (`f23:1194–1199`) renders a "On page load" control with Open/Closed;
`setStartupState()` persists to localStorage (`f23:1477–1481`); `startupState` feeds `coldCollapsed`
(`f23:233`, `:237`). The E2E release gate already asserts it:
`PASS "On page load: Closed" survives reload (panels mount collapsed)`.

So the situation in the screenshot is solvable right now, by one settings flip, touching no code and
no prior decision. This is the first ladder rung and it holds.

**One qualifier, found by eyes-on at 414×896 on a responsive page** (`host-content-site.html`; the
earlier capture used the non-responsive app fixture, which understated the open-state obstruction —
two 360×388 panels leave ~6 lines of copy visible). In the collapsed state the design reads fine, but
both edge tabs are placed at `top=33`, overlapping the host header (`0,0,414,56`) on the nav row.
E is still the answer for obstruction; the header overlap is a separate small placement bug.

**RETRACTED (same session, 2026-07-20):** this paragraph originally also reported the right edge tab
at `left=406` on a 414px viewport — 8px of its 44px width reachable — and raised a design-judge BLOCK
on `SPACING-tap-targets-44px`. That finding was false. It was an artifact of my own capture harness:
Playwright's `isMobile: true` yields a 450px *layout* viewport inside a 414px *visual* viewport, so
the tab was measured against the wrong width. Re-probed without `isMobile` (`deviceScaleFactor: 3`
only): `innerWidth 414 / visualViewport 414`, and the tabs measure exactly 44×44 fully on-screen. The
BLOCK is withdrawn — there was no tap-target defect. Lesson: never set `isMobile` on a Playwright
context used for geometry assertions.

### C — a better default, not a fix

The remaining question is whether someone who hasn't found that setting should hit an obstructed
414px viewport at all. `openPanel()` already collapses at `innerWidth <= 640` (`f23:1517`), but only
on element-selection (`:10069`) and re-arm (`:1575–1580`); cold load calls `renderPanel()` only
(`:10288`). Extending `coldCollapsed` (`f23:237`) with the same test makes the narrow-viewport
behavior consistent between cold load and selection. Verified: nothing re-expands afterward.

Two constraints on that:

- **It touches a day-old call.** `f23:238–239` records *"Cold open: BOTH panels start expanded
  (Andrew, 2026-07-19), reversing the 2026-07-18 call that they start collapsed."* The change narrows
  that to desktop-only, and the 2026-07-19 call set a *default* the setting can already override — but
  it is close enough that it shouldn't be made autonomously.
- **It only fires at init.** It helps if you reload inside device mode; it does nothing if you switch
  into device mode on an already-loaded page. A resize listener would cover that, and is not proposed
  because it can override a state the user deliberately set.

### B — not a next step; a question for Andrew

`start_grab_session({ proxy_target })` proxies the app through the bridge's own origin
(`src/grab-bridge.ts:988` → `:1016`), so a device-width iframe in a bridge-served shell would be
same-origin and keep `contentDocument` access. That property is real and specific to Raven.

It still shouldn't be scoped, for three reasons the research itself produced:

- **It is worse emulation than what it replaces.** Once the panels are collapsed, DevTools device mode
  *is* a working mobile-review path — with real UA, dpr, touch, and correct 980px no-meta-viewport
  layout. An iframe preview has none of those. Its only unique win is panels-expanded and design
  unobstructed at the same time.
- **Two blockers that don't exist as code today.** `copyProxyResponseHeaders`
  (`src/grab-bridge.ts:1093`) strips only `content-length`, `content-encoding`, `transfer-encoding`,
  `connection` — upstream `X-Frame-Options: DENY` or `frame-ancestors 'none'` passes through and blocks
  even same-origin framing. Absolute upstream redirects can navigate the iframe off the bridge origin.
- **"Panels mount unchanged" is false.** The overlay is document-bound: it appends its host to its own
  `document` (`f23:291`) and installs selection listeners on it (`:10169`). In the iframe it obstructs
  as before; in the host shell it inspects the shell. B requires splitting panel rendering from
  inspected-document binding — a refactor, not a mount-point change.

A shared device-width review URL also reads like a team surface, which the 2026-07-18 boundary puts in
Morven. So the question is Morven-or-drop, not when to build it.

## What it would touch

**C:** `f23:browser/raven-grab.js:237`, one line. The E2E gate already covers cold-collapse persistence
and 390px non-overlap; add a case for a cold mount at ≤640px.

**B:** not scoped — see above.

## Open questions

1. **Is E enough?** If flipping "On page load → Closed" solves it for you, C is optional polish for
   users who never find the setting, and B is moot.
2. **C's decision status** — does narrowing the 2026-07-19 call to "expanded on desktop, collapsed at
   ≤640px" match the intent?
3. **Do you hit this by reloading in device mode, or by switching into it on a loaded page?** Only the
   first is fixed by C's one line.
4. **640 vs 812** — `openPanel()` uses 640; `applyDeviceEmulation` treats ≤812 as mobile. Two mobile
   thresholds now exist. Reconcile, or deliberately different?
5. **Decision-graph gap (dogfood)** — the 2026-07-19 cold-open call exists only as a source comment;
   `decision_list` has no record of it. Raven's decision graph isn't capturing Raven's decisions.
