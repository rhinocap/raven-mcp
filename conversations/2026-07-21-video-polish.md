# Session: 2026-07-21

## Where we left off
The restrained Raven demo reduced camera motion, but still carried synthetic title cards, save labels, cyan seam flashes, an over-tight typography crop, and an unwanted music bed.

## This session

### Clean silent V3
**What:** Removed every synthetic text layer, cyan seam flash, and audio track; kept typography full-page; retimed and rendered a 64.27-second V3.
**Why:** Let the recorded product UI carry the story without editorial clutter.
**Pushed:** Not applicable; the video artifact and Hyperframes source live outside the repo.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Left editorial text, cyan flash transitions, a side-panel typography crop, and a poor music bed in a product demo that should let the recorded UI explain itself. | Accuracy gap | Before rendering a restrained product demo, always remove nonessential editorial layers, use clean cuts, frame state changes around their visible product result, and choose deliberate silence when the score is not clearly excellent. |

## State at end of session
- Final artifact: `/Users/accunliffe/Desktop/RAVEN_MARGINALIA_2_0_1_CLEAN_SILENT_V3_HYPERFRAMES.mp4` (11,831,957 bytes; SHA-256 `266bde59fe3e540d06a3b5c007fdebec511fff643f83f27ccbe459dcafd22437`)
- Hyperframes Docker check: passed with 0 errors and 0 warnings
- Visual verification: 20 full-resolution frames checked across every beat and cut; no synthetic text, blue flash, or iPhone camera move; typography changes remain visible on the canvas
- Customer walkthrough and two independent adversarial passes: passed
- Pending (carried forward): none
