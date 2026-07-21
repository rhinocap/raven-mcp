# Session: 2026-07-20

## Where we left off
A host-content-only Raven demo was rerecorded and rendered, but its handoff path opened the predecessor video for Andrew.

## This session

### Host-content video rerecord
**What:** Recorded the host-content page and authored interaction-centered camera beats.
**Why:** Make Assets, Layers, inspection, and typing understandable without captions.
**Pushed:** Not applicable; artifact work lives outside the repo.

### Credible Raven Design story rebuild
**What:** Re-scoped the demo around Andrew's exact desktop and iPhone XR workflow, with real Marginalia tokens and Raven 2.0.1.
**Why:** The prior click tour did not resemble how someone would actually use Raven Design.
**Pushed:** Pending.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Handed off a media path without proving Andrew's click resolved to the newly rendered bytes, so he saw the original video. | Verification gap | Before handing off media, always verify the resolved path, metadata, and first frame against the new render, then use a collision-proof filename. |
| Built an arbitrary panel click tour instead of a coherent design task, making the demo story unrealistic. | Comm gap | Before recording a product demo, always script one credible end-to-end user job with observable state changes so the story matches real product use. |

## State at end of session
- Artifact path reconciliation: verified with a collision-proof Desktop filename
- QuickTime automation: blocked by macOS Launch Services error `-10827`; file is present and valid on Desktop
- Pending (carried forward):
  - Rebuild and verify the exact Marginalia desktop and iPhone XR demo sequence.
