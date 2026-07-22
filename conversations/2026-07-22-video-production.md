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

## Mistakes & lessons

| Mistake | Type | Rule added |
|---------|------|-----------|
| Recorded and assembled an unrelated localhost page instead of the supplied production Raven Design Playground. | Accuracy gap | Capture the literal supplied production URL and verify its opening state full-resolution before assembly; never substitute a locally similar route. |
| Included a template-success beat unsupported by the production bridge. | Accuracy gap | If the live product cannot complete a claimed action, remove the beat rather than mocking or implying success. |
| Treated the `/raven-design` route as proof that its editable canvas was the Raven Design Playground even though the loaded canvas was Marginalia. | Verification gap | Before recording a product editor, always identify the loaded canvas from visible page-specific content—not the outer route, product chrome, or panel names—so the footage proves the requested page identity. |

## State at end of session
- Production-source Hyperframes Studio preview: rejected because its editable canvas is Marginalia
- Strict/container verification: technically passed but did not verify the requested canvas identity
- Pending (carried forward):
  - Andrew confirms the clean Player is showing the same Playground frame captured in verification
  - Render and open the MP4 only after approval of the clean Player
