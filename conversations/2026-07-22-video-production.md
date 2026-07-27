# Session: 2026-07-22

## Where we left off
The Raven homepage video needed to be rebuilt from the actual production Raven Design Playground rather than the unrelated local host-content demo.

## This session

### Production Raven Design Playground cut
**What:** Re-recorded the usable interaction beats directly from `https://ravenmcp.ai/raven-design` and rebuilt the Hyperframes Studio composition at `raven-homepage-playground-hf`. The cut now opens on the real two-panel Playground, uses sparse focus moves, keeps the mobile view at 1x, removes captions and audio, and uses native Focus Pull transitions without a blue or white interstitial flash. Removed the template-confirmation beat because the live production bridge returned 404; no simulated success state remains.
**Why:** The previous video showed the wrong experience and obscured the story with excessive zoom, captions, and unsupported interactions.
**Pushed:** Not applicable; video project is in iCloud Drafts and is awaiting Studio approval before MP4 render.

### Verification
**What:** Upgraded the project to Hyperframes 0.7.68. The identical strict gate passed in the recorder container with 0 lint errors, 0 warnings, 0 runtime issues, 0 layout issues across 65 samples, 0 motion issues, and 0 contrast issues. Full-resolution beat and transition snapshots were reviewed; the Studio server is live at `http://localhost:4706/#project/raven-homepage-playground-hf`.
**Why:** Host Chromium cannot launch in this environment because macOS rejects its MachPort bootstrap; the container provides the same deterministic browser verification path.
**Pushed:** Not applicable.

### Clean playback surface
**What:** Started the lightweight Hyperframes Player on `http://localhost:4707` to bypass Studio's persisted editor/tab state. Captured that exact player URL at 1600×900; its opening frame visibly shows the Raven Design Playground heading, Northstar Workspace, and both Raven panels, with no Marginalia content.
**Why:** Andrew's Studio playback showed Marginalia even though every current timeline asset and generated contact sheet showed the Playground. A clean player isolates the current composition from any stale Studio render/history state.
**Pushed:** Not applicable.

### Faster cut with an active phone beat
**What:** Tightened the composition from 36.4 seconds to 26.5 seconds and replaced the static 13.4-second phone hold with a 7.4-second production interaction. At exact 414×896 and 1x scale, the phone now selects the Northstar heading, opens Instructions, types `Tighten this heading for mobile.`, and reveals the real pending-change/send state. Started a fresh clean Player at `http://localhost:4708` so persisted playback cannot show the prior cut.
**Why:** The prior pacing was slow and the phone beat did not advance the product story.
**Pushed:** Not applicable; MP4 render remains gated on Andrew's Player approval.

### Faster-cut verification
**What:** Hyperframes strict check passed in the recorder container at 18 targeted moments plus transitions: 0 lint errors, 0 warnings, 0 runtime issues, 0 layout issues across 74 samples, 0 motion issues, and 0 contrast issues. Reviewed the 19-frame full-resolution contact sheet and key 1x phone frames: heading selection at 19.8s, active Instructions field at 21.8s, typed request plus pending change at 23.8s, and native Focus Pull back to the opening at 25.7s. The separate animation-map helper was blocked by macOS Chromium MachPort permissions; it did not replace or invalidate the passing container gate.
**Why:** The load-bearing proof is that the shorter cut advances on each beat, the phone contains a legible real interaction without zoom, and both transition directions remain continuous without blue/white flashes.
**Pushed:** Not applicable.

### Single shallow Layers zoom
**What:** Replaced the Layers beat's 1.18x two-target push/pan with one stationary 1.08x push centered on the full Layers panel. Removed the 1.14x agent-handoff zoom and its unused timing path; the native desktop-to-phone Focus Pull remains unchanged and adds no scale.
**Why:** Andrew wanted one restrained zoom in the entire edit, only on Layers, and less magnification.
**Pushed:** Not applicable; MP4 render remains gated on Andrew's Player approval.

### Single-zoom verification
**What:** Timeline inspection finds exactly one focus invocation and one scale value above 1 (`1.08`). Hyperframes strict check passed in the recorder container: 0 lint errors, 0 warnings, 0 runtime issues, 0 layout issues across 64 samples, 0 motion issues, and 0 contrast issues. Reviewed nine full-resolution frames spanning the full view, push, held reorder interaction, release, full-view agent handoff, and 1x phone; the Layers framing remains stationary while the recorded product state changes.
**Why:** This directly verifies zoom count, depth, target, release, and preservation of the phone/transition behavior.
**Pushed:** Not applicable.

### Smoothed scene transitions
**What:** Extended every outgoing clip through the end of its blend, replaced same-canvas blur pulses with 0.6-second `sine.inOut` cross-dissolves, and retained a restrained 0.8-second low-blur Focus Pull only for desktop-to-phone and phone-to-desktop context changes. Separated the single Layers zoom from adjacent transitions so its release does not collide with the next beat.
**Why:** The prior clips expired mid-transition and whole-screen blur between closely related desktop states made the edit snap and flash despite softened easing.
**Pushed:** Not applicable; MP4 render remains gated on Andrew's Player approval.

### Transition verification
**What:** Asserted all five outgoing clips overlap their full transition endpoints. Hyperframes strict check passed in the recorder container with 0 lint errors, 0 warnings, 0 runtime issues, 0 layout issues across 59 samples, 0 motion issues, and 0 contrast issues. Frame-stepped 30 exact transition moments at full resolution across all five transitions; desktop beats now dissolve continuously and device changes retain the native cinematic Focus Pull without blue or white flashes.
**Why:** Motion correctness requires checking the rendered transition sequence, not just the easing values in source.
**Pushed:** Not applicable.

### Production homepage release
**What:** Rendered the approved 26.5-second composition as a 1600x900 H.264/yuv420p MP4 with no audio, generated its opening-frame poster, updated the homepage accessibility label, and replaced the three homepage assets in an isolated worktree based on exact `origin/main`. Committed and pushed `5f11903`, then deployed the `web/` project to Vercel production. The Ready deployment `dpl_6xoXLxDQ7PWoZTp4iRohu7z35arB` is aliased to `https://ravenmcp.ai`.
**Why:** Andrew approved the final Player cut and explicitly authorized the production promotion.
**Pushed:** `5f11903` (`Replace homepage playground video`)

### Production verification
**What:** Ran the root suite on the exact release worktree (1,012 passed, 0 failed, 50 browser-dependent skipped) and completed the Next.js production build. The canonical MP4 matches the approved render SHA256 `c2fad09f2dc5f46b6134bf6b449663d1737f070970b60bba0f5452f6f7befca1`; the canonical poster matches the committed source SHA256 `49e5c82ec012ba8a76839891773e4a3804b246aefe9816c75ef9654da25cc3c6`. A throttled production byte-range request returned HTTP 206 and the full requested range; FFmpeg decoded the downloaded production MP4 through every frame. Full-resolution production desktop and mobile screenshots show the Northstar poster and correct responsive layout. An independent GPT-5.6-Sol falsification pass accepted the release with the disclosed limitation below after its sole poster-hash objection was resolved.
**Why:** The production proof covers the actual canonical bytes, responsive rendered surface, transport behavior, build, tests, and deployment state rather than relying on localhost or source alone.
**Pushed:** Not applicable.

### Verification limitation
**What:** Direct live H.264 browser playback could not be observed in the available automation environment: Raven's playback/page audits lacked headless Chromium, the in-app browser had no browser available, host Chromium was blocked by macOS MachPort permissions, and the Linux browser lacked H.264 codec support. The exact production bytes, codec/profile, range delivery, full decode, poster, page render, and approved-render frame review all passed.
**Why:** Preserve the boundary between verified production evidence and the one unavailable browser-playback check.
**Pushed:** Not applicable.

## Mistakes & lessons

| Mistake | Type | Rule added |
|---------|------|-----------|
| Recorded and assembled an unrelated localhost page instead of the supplied production Raven Design Playground. | Accuracy gap | Capture the literal supplied production URL and verify its opening state full-resolution before assembly; never substitute a locally similar route. |
| Included a template-success beat unsupported by the production bridge. | Accuracy gap | If the live product cannot complete a claimed action, remove the beat rather than mocking or implying success. |
| Treated the `/raven-design` route as proof that its editable canvas was the Raven Design Playground even though the loaded canvas was Marginalia. | Verification gap | Before recording a product editor, always identify the loaded canvas from visible page-specific content—not the outer route, product chrome, or panel names—so the footage proves the requested page identity. |
| Left the overall edit too slow and used a static phone hold with no product action. | Accuracy gap | Before handing back a product demo, always confirm every beat advances either the product state or the story, and remove or replace any hold that does neither. |
| Patched the host recorder but initially ran the stale script copy inside the container. | Verification gap | Before a container recording pass, copy the edited recorder in and confirm the in-container file is the version being executed. |
| Kept a second agent-handoff zoom and used a two-target pan inside the Layers beat. | Accuracy gap | Before adding editorial camera motion, always assign one load-bearing beat and one stationary target so product-state changes—not repeated camera movement—carry the rest of the story. |
| Let outgoing clips expire before their transition tweens completed and used whole-screen blur between same-canvas states. | Accuracy gap | Verify clip lifecycle overlap at every transition endpoint; cross-dissolve related canvas states and reserve Focus Pull for real context changes. |

## State at end of session
- Production: `https://ravenmcp.ai/#raven-design` on Vercel deployment `dpl_6xoXLxDQ7PWoZTp4iRohu7z35arB` (`Ready`)
- Release commit: `5f11903` on `origin/main`
- Production verification: tests, build, byte identity, HTTP 206 range delivery, full MP4 decode, and desktop/mobile visual review passed
- Pending (carried forward):
  - Direct live H.264 browser-playback observation remains unavailable in this automation environment
