# Session: 2026-07-21

## Where we left off
The restrained Raven demo reduced camera motion, but still carried synthetic title cards, save labels, cyan seam flashes, an over-tight typography crop, and an unwanted music bed.

## This session

### Clean silent V3
**What:** Removed every synthetic text layer, cyan seam flash, and audio track; kept typography full-page; retimed and rendered a 64.27-second V3.
**Why:** Let the recorded product UI carry the story without editorial clutter.
**Pushed:** Not applicable; the video artifact and Hyperframes source live outside the repo.

### Keynote music and native handoff
**What:** Ingested Mixkit's artist-made `Vastness` by Andrew Ev through Hyperframes media-use, added a restrained -22.2 LUFS bed with soft fades, and replaced the desktop-to-mobile cut with Hyperframes' native Focus Pull while keeping mobile locked at 1x. Trimmed the frozen source tail and faded out immediately after the final click.
**Why:** The product shift needs one premium beat without bringing back repetitive camera motion or generic synthetic music.
**Pushed:** Not applicable; Raven taste-ledger sync was blocked by connector reauthentication, so the decision is preserved here and Andrew will reconnect later.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Left editorial text, cyan flash transitions, a side-panel typography crop, and a poor music bed in a product demo that should let the recorded UI explain itself. | Accuracy gap | Before rendering a restrained product demo, always remove nonessential editorial layers, use clean cuts, frame state changes around their visible product result, and choose deliberate silence when the score is not clearly excellent. |
| Initially ended V4 on two seconds of pixel-static `Applying changes...`, which read as a hung workflow. | Accuracy gap | Motion QA must compare the final seconds frame-to-frame and remove or fade any frozen loading tail before handoff. |

## State at end of session
- Final artifact: `/Users/accunliffe/Desktop/RAVEN_MARGINALIA_2_0_1_CLEAN_SILENT_V3_HYPERFRAMES.mp4` (11,831,957 bytes; SHA-256 `266bde59fe3e540d06a3b5c007fdebec511fff643f83f27ccbe459dcafd22437`)
- Music/native-handoff artifact: `/Users/accunliffe/Desktop/RAVEN_MARGINALIA_2_0_1_KEYNOTE_MIX_NATIVE_HANDOFF_V5_FINAL.mp4` (14,487,464 bytes; SHA-256 `3f6c3cfe045efb9f79b37a6dc0743e09129b7779e523d64773c9c246ec4d3363`)
- Hyperframes lint: passed with 0 errors and 0 warnings; the native renderer encoded all 1,854 output frames and the audio track
- V5 stream verification: H.264 1440×900 at 30fps plus AAC stereo 48kHz; 61.803 seconds; integrated loudness -22.2 LUFS and true peak -8.7 dBFS
- V5 vision verification: first/middle/last, five full-resolution handoff frames, and three end-fade frames inspected; no synthetic text, blue/black flash, sharp mobile pre-pop, camera scale, blur linger, or frozen ending
- Independent adversarial pass: V4 frozen-tail defect found; V5 repair passed with no remaining material defects
- Final independent once-over: passed; no additional or shared material defects
- Cleanup: superseded V4 moved to Trash and temporary render copies removed; three non-running Docker containers from failed mount attempts remain because Docker Desktop hangs when deleting them
- Pending (carried forward): Andrew's taste check on the new music; Raven taste-decision sync after connector reauthentication
