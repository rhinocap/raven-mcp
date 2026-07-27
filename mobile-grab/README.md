# Raven Mobile Grab (Path A — M0)

Isolated workspace for **mobile** two-panel Grab. Does **not** touch `browser/raven-grab.js` or the web grab-bridge.

| Piece | Path | Port / note |
|-------|------|-------------|
| Path A shell + API | `server.mjs` | **49911** (web grab uses ephemeral / other ports) |
| Browser UI | `shell/` | Structure · mirror · Design |
| SwiftUI sample | `sample-swiftui/` | Boot in Simulator via Xcode or `scripts/run-sample.sh` |
| Fixture AX + screen | `fixtures/` | Demo works with no Simulator |

## Quick start (demo, no Simulator)

```bash
cd mobile-grab
node server.mjs
# open http://127.0.0.1:49911
```

Click the mirrored phone → Structure + Design update → **Send to agent** queues a mobile grab payload at `GET /api/queue`.

## With Simulator (optional)

1. Open `sample-swiftui/RavenMobileGrabSample.xcodeproj` in Xcode, Run on a Simulator.
2. Or: `./scripts/run-sample.sh` (builds + boots if Xcode tools are ready).
3. In the shell, click **Refresh from Simulator** to pull a `simctl` screenshot.

## Spec

See `docs/grab-mobile-two-panel-spec.md` (Path A locked, SwiftUI first, phone toggle deferred).
