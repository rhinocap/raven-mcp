# Session

## Where we left off
Most recent prior log: 2026-07-22 (v2.2.2 changelog, Grab un-sent-changes persistence). This session picked up a /goal: fix the grab-overlay scroll regression on Andrew's portfolio dev server (localhost:3000).

## This session
- **What:** Fixed "scrolling over the Layers/Styles panels scrolls the page instead" — root cause was **Lenis** (portfolio smooth-scroll): its own window wheel listener + `scrollTo()` animation, immune to `preventDefault`. Fix: overlay's capture-phase document wheel listener now calls `stopImmediatePropagation()` on every swallowed wheel; Cmd/Ctrl+scroll and collapsed-panel passthrough keep propagating. Confirmed working on Andrew's Magic Mouse.
- **Why the long road:** two earlier fixes shipped against a wrong compositor-hit-testing theory — bf56028 (wheel listener + Cmd-gating 9aad9bf), 3155dde (removed `mask-image` on the scroller + no-op `backdrop-filter` on the panel; kept — real layerization liability, sticky ::after fade replaces the mask, design-judge PASS). The breakthrough was live-tab forensics: wheel counters (289/289 prevented, page still moved) + stack-trace wrappers on `scrollTo`/`scrollIntoView`/`focus` → every movement traced to `Lenis.setScroll`.
- **Pushed:** raven-mcp main dc39a33 (bridge Cache-Control: no-store) → 3155dde → **a71344e** (the real fix). Tests 1074 pass / 0 fail; both new regression tests kill-proven via `RAVEN_GRAB_TEST_OVERLAY`.
- Also earlier: applied Andrew's grab batch to portfolio work-03 (two image removals), committed **f195c44 in andrewcunliffe-portfolio — local only, not pushed**.
- **Mistakes/Lessons:** shipped two fixes on an unfalsifiable browser-internals theory before instrumenting the live surface; lesson recorded in memory (`forensics-before-theory-on-scroll-bugs`) and grab-falsify-loop Gotchas. Synthetic wheel dispatch + CDP scroll are both unfaithful for this class of bug.

## State at end
- Scroll fix SHIPPED a71344e, verified on Andrew's hardware. Inline text editing fixed earlier (dead bridge → fresh bridge + dev-server restart).
- Andrew's tab now points at another instance's bridge (127.0.0.1:52032); my watch task b40i65e39 / key 45e72a59 is stale — that instance owns further grab batches (two grabs pending re-send + Apply on their side).
- Carried forward: portfolio f195c44 unpushed; crash / "Page Unresponsive" on /work/work-03 PARKED (Andrew: forget for now); bridge no-store header goes live on next MCP reconnect.
