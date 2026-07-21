# Session: 2026-07-20

## Where we left off
A host-content-only Raven demo was rerecorded and rendered, but its handoff path opened the predecessor video for Andrew.

## This session

### Host-content video rerecord
**What:** Recorded the host-content page and authored interaction-centered camera beats.
**Why:** Make Assets, Layers, inspection, and typing understandable without captions.
**Pushed:** Not applicable; artifact work lives outside the repo.

### Credible Raven Design story rebuild
**What:** Re-scoped and recorded the demo around Andrew's exact desktop and iPhone XR workflow, with real Marginalia tokens and Raven 2.0.1. Captured separate truthful takes for typography/component/token, Layers reorder, template/send, and the responsive pass; verified the resulting component, template, and sent batches against the 2.0.1 bridge.
**Why:** The prior click tour did not resemble how someone would actually use Raven Design.
**Pushed:** Not applicable; page fixture and media work live in `/private/tmp/raven-f23` and `/tmp/drafts`.

### Hyperframes edit and music
**What:** Authored a 70.45-second Hyperframes composition with nine labeled beats, cue-driven focus/release camera moves for every panel interaction and input, a Raven-language DevTools handoff, a local Hyperframes MusicGen score, and a collision-proof final filename. Re-encoded all four captures to H.264/30 fps with 1-second keyframe intervals after the first render warned about sparse WebM keyframes.
**Why:** Preserve the real host-page workflow while making each state change readable and preventing seek freezes in the final render.
**Pushed:** Not applicable; composition and render live outside the repo.

### Corrected final render and handoff
**What:** Re-recorded the desktop send beat so the filmed Raven UI visibly transitions to `Applying 2 changes...`; rerendered the full Hyperframes composition, inspected first/mid/last full-resolution frames across every chapter, and copied the byte-identical export to `/Users/accunliffe/Desktop/RAVEN_MARGINALIA_REAL_WORKFLOW_2_0_1_HYPERFRAMES.mp4`. Final SHA-256: `fcdae300ecde759804feecc0b0954bc2dae574c982594eb121adf4e0c62be479`.
**Why:** The preceding take clicked Send while still showing pending changes, which did not prove the desktop dispatch in the footage.
**Pushed:** Not applicable; no product source changed.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Handed off a media path without proving Andrew's click resolved to the newly rendered bytes, so he saw the original video. | Verification gap | Before handing off media, always verify the resolved path, metadata, and first frame against the new render, then use a collision-proof filename. |
| Built an arbitrary panel click tour instead of a coherent design task, making the demo story unrealistic. | Comm gap | Before recording a product demo, always script one credible end-to-end user job with observable state changes so the story matches real product use. |
| The first desktop send take stopped on `3 pending`; the blockquote token draft prevented a filmed transition despite independent bridge receipt. | Verification gap | A demo send beat must visibly reach the product's post-click state in the shipped footage; external transport proof cannot substitute for that causal visual proof. |

## State at end of session
- Corrected artifact: 1440x900, 30 fps, H.264 + 48 kHz stereo AAC, 70.485 seconds, zero black/silent events, 70/70 unique sampled frames, byte-identical Desktop copy
- Visual verification: full-resolution chapter frames inspected; desktop and mobile both visibly reach `Applying 2 changes...`
- Adversarial verification: two independent report-only done-gate reviewers passed the corrected artifact with no material blockers
- Product verification: Raven suite 1001 passing, 0 failing, 50 Playwright skips because local Chromium is unavailable; localhost host page and Hyperframes player both return HTTP 200
- QuickTime automation: name-based and bundle-based Launch Services calls fail with error `-10827`; direct executable invocation cannot be GUI-confirmed in the sandbox
- Pending (carried forward):
  - None for the artifact; QuickTime window confirmation remains environment-blocked.
