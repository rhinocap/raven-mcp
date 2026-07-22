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

## Mistakes & lessons

| Mistake | Type | Rule added |
|---------|------|-----------|
| Recorded and assembled an unrelated localhost page instead of the supplied production Raven Design Playground. | Accuracy gap | Capture the literal supplied production URL and verify its opening state full-resolution before assembly; never substitute a locally similar route. |
| Included a template-success beat unsupported by the production bridge. | Accuracy gap | If the live product cannot complete a claimed action, remove the beat rather than mocking or implying success. |
| Treated the `/raven-design` route as proof that its editable canvas was the Raven Design Playground even though the loaded canvas was Marginalia. | Verification gap | Before recording a product editor, always identify the loaded canvas from visible page-specific content—not the outer route, product chrome, or panel names—so the footage proves the requested page identity. |
| Left the overall edit too slow and used a static phone hold with no product action. | Accuracy gap | Before handing back a product demo, always confirm every beat advances either the product state or the story, and remove or replace any hold that does neither. |
| Patched the host recorder but initially ran the stale script copy inside the container. | Verification gap | Before a container recording pass, copy the edited recorder in and confirm the in-container file is the version being executed. |
| Kept a second agent-handoff zoom and used a two-target pan inside the Layers beat. | Accuracy gap | Before adding editorial camera motion, always assign one load-bearing beat and one stationary target so product-state changes—not repeated camera movement—carry the rest of the story. |

## State at end of session
- Current clean Player: `http://localhost:4708` (26.5-second Playground cut with one shallow Layers zoom and active phone interaction)
- Strict/container verification: passed; single zoom, production Playground identity, and phone interaction checked full-resolution
- Pending (carried forward):
  - Andrew approves the faster clean Player
  - Render and open the MP4 only after Player approval
