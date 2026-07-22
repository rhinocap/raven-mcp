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

### Homepage video audience correction
**What:** Bound the homepage-video audience as any builder whose coding velocity has outrun their design confidence—especially designers trying to keep up—and locked the silent cut to transformation first, with reuse and agent handoff as supporting proof.
**Why:** The story is about an urgent design-quality gap created by accelerating code output—not skepticism about Raven or the MCP category.
**Pushed:** Pending; storyboard interview and homepage implementation remain in progress.

### Homepage Hyperframes cut
**What:** Authored a separate 1600×900, 39.339-second Hyperframes composition at `raven-homepage-playground-hf`: full-canvas typography transformation; wide component/template reuse beats; only two camera accents (layer reorder and desktop handoff); locked 1× iPhone coda; native Focus Pulls into mobile and back to a pixel-matched opening frame; no added text or audio.
**Why:** Preserve the approved LinkedIn product story while making the homepage loop shorter, clearer, and legible without narration.
**Pushed:** Not applicable; the source is an external Hyperframes draft and the render awaits Andrew's Studio preview approval before homepage wiring.

### Raven Design Playground source correction
**What:** Re-recorded all five product beats on the real `/raven-design` Playground, normalized them to H.264, replaced every active Marginalia source with uniquely named `playground-*` assets, and retimed the selective camera accents plus native desktop/mobile Focus Pulls.
**Why:** The approved story only works if the product being demonstrated is the Raven Design Playground itself.
**Pushed:** Not applicable; the corrected Hyperframes Studio preview is local and still awaits Andrew's visual approval before render or homepage wiring.

### Rejected `/raven-design` capture
**What:** Andrew rejected the replacement because `/raven-design` is the marketing demonstration page, not the Raven Design Playground. A follow-up live check also proved the older `http://localhost:4705/scratchpad/host-content-site.html` page is Marginalia, so it is not the current target either.
**Why:** Neither a route name, Raven branding, nor a stale earlier URL proves current product-surface identity; the rendered page must match the current named target before capture.
**Pushed:** Not applicable; the rejected cut will not be rendered or wired.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Left editorial text, cyan flash transitions, a side-panel typography crop, and a poor music bed in a product demo that should let the recorded UI explain itself. | Accuracy gap | Before rendering a restrained product demo, always remove nonessential editorial layers, use clean cuts, frame state changes around their visible product result, and choose deliberate silence when the score is not clearly excellent. |
| Initially ended V4 on two seconds of pixel-static `Applying changes...`, which read as a hung workflow. | Accuracy gap | Motion QA must compare the final seconds frame-to-frame and remove or fade any frozen loading tail before handoff. |
| Narrowed the homepage video audience to a skeptical solo evaluator when Andrew meant any builder feeling design judgment fall behind code velocity. | Accuracy gap | Before framing a product story, always name the customer's active pressure in their words so the narrative centers the felt problem rather than an inferred attitude toward the category. |
| Reused the LinkedIn master's Marginalia footage even though the homepage demo had to show the Raven Design Playground host-content page. | Accuracy gap | Before adapting a product demo, always verify the exact recorded product surface and URL; reuse the approved story and motion grammar without substituting the demonstrated product. |
| Repeated the wrong-surface mistake by declaring the `/raven-design` marketing demo to be the Playground even though Andrew had already supplied the exact host-content URL. | Accuracy gap | Before naming or recording a product surface, always bind the literal user-supplied URL as the source of truth and compare its rendered opening frame with the requested surface before assembling any footage. |
| Reacted to the `/raven-design` correction by blindly rebinding an older localhost URL before checking it; live inspection showed that page was Marginalia too. | Accuracy gap | Before treating any prior URL as current source truth, always render it and reconcile it with the user's latest named surface so stale instructions do not override a newer correction. |

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
- Homepage-video draft: `http://localhost:4706` (Hyperframes Studio); 1600×900, 39.339s, silent, no synthetic text
- Homepage-video verification: containerized strict `hyperframes check` passed with 0 lint/runtime/layout/motion/contrast errors or warnings; 300 motion samples; 27 full-resolution beat frames inspected; corrected opening/loop SSIM 0.998201
- Homepage-video rejected sources: the current `playground-*` assets show `/raven-design`; the older host-content URL shows Marginalia; neither may be rendered or wired
- Homepage-video pending: identify the actual Raven Design Playground from rendered/source evidence, record it, replace every rejected runtime asset, run source/vision/Hyperframes verification, then return a new Studio preview for Andrew's approval
