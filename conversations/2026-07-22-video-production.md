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

## Mistakes & lessons

| Mistake | Type | Rule added |
|---------|------|-----------|
| Recorded and assembled an unrelated localhost page instead of the supplied production Raven Design Playground. | Accuracy gap | Capture the literal supplied production URL and verify its opening state full-resolution before assembly; never substitute a locally similar route. |
| Included a template-success beat unsupported by the production bridge. | Accuracy gap | If the live product cannot complete a claimed action, remove the beat rather than mocking or implying success. |

## State at end of session
- Production-source Hyperframes Studio preview: available for Andrew's approval
- Strict/container verification and full-resolution visual review: passed
- Pending (carried forward):
  - Render and open the MP4 only after Andrew approves the Studio preview
