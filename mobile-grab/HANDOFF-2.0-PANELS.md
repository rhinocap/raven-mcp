# Handoff: reuse RavenMCP 2.0 two-panel chrome in Mobile Grab

**Decision (2026-07-19):** Do **not** continue polishing `mobile-grab/shell/` as a second panel implementation. The shipping Raven Grab **Structure + Design** panels (RavenMCP 2.0 / `f23-templates-layers` lineage, `browser/raven-grab.js`) are canonical. Mobile Grab Path A should **host/reuse** that chrome once it lands.

## What this folder owns (keep here)

- Path A host: Simulator mirror + AX hit-test (`server.mjs`, `lib/ax-hit-test.mjs`, fixtures)
- SwiftUI sample (`sample-swiftui/`)
- Mobile selection schema (`platform: "ios"`, AX identifiers, rect in points)
- Dedicated port **49911** (no collision with web grab-bridge)
- Deferred: phone full-viewport Structure ↔ Design toggle (spec §6.1)

## What 2.0 owns (do not fork)

- Exact two-panel Structure + Design UI (tabs, tokens, styles, scope Instance/All siblings, Send animation, settings)
- Grab payload fields that already exist on web (instruction, tokens, editScope, etc.)
- Visual tokens / panel CSS inside `raven-grab.js`

## Integration contract (for the 2.0 instance)

1. **Extract or mode-gate** panel chrome so it can run without a DOM page under inspect — e.g. `RavenGrabConfig.mode = "mobile-shell"` with a provided selection object + tree, instead of `document` hit-testing.
2. **Selection adapter:** mobile host supplies:
   ```ts
   {
     platform: "ios",
     source: "ax",
     selector, label, role, identifier,
     rect: { x, y, w, h },
     styles?, tokens?, instruction?, editScope?, ancestors?
   }
   ```
3. **Tree adapter:** Structure panel reads AX (or RN) tree from `/api/tree` (or injected `session.tree`), not DOM layers.
4. **Send:** POST to mobile queue (`POST /api/grab` on :49911) **or** multiplex into existing grab-bridge with `platform` discriminant — pick one; don’t invent a third queue.
5. **Delete/replace** the stand-in `mobile-grab/shell/{index.html,shell.css,shell.js}` once real panels mount here (or load `raven-grab.js` into this host page).

## Current stand-in

`http://127.0.0.1:49911` — proof of Path A loop only (mirror + tree + send). **Not** visual/product parity with web Grab.

## Spec

`docs/grab-mobile-two-panel-spec.md` — Path A locked, SwiftUI first, phone toggle deferred.
