# Session: 2026-06-26 — Deck narrative dictation (Digital Help + IEP)

## Where we left off
No active raven-mcp task; Andrew was ready to dictate portfolio deck narratives.

## This session

### Digital Help deck narrative
**What:** Captured Andrew's dictation of the Digital Help case-study story while he drove, structured it into a full narrative spine + slide-by-slide layout at `/tmp/drafts/2026-06-26-digital-help-deck-story.md`. Did a read-only Figma pass on the Supercharge-Search deck (`pTzu9BqggxVqYRzdh95CHi`) to reconcile details — fixed shipped scope (stationary + mobile web, not native), pulled exact metric values from `slides.ts`, added the ownership-backstory (VEP→CG Jan 2025), customer-quote rationale for the side-rail, QB prototype beat, and the hand-back to TurboTax design after ship.
**Why:** Deck narrative documentation for Apple/OpenAI portfolio interviews.
**Pushed:** Not committed — output is in `/tmp/drafts/`, not in repo.

### IEP Studio deck narrative
**What:** Captured Andrew's dictation of the IEP Studio story, structured it into narrative spine + slide-by-slide layout at `/tmp/drafts/2026-06-26-iep-deck-story.md`. Arc: role/team → QB services strategy → key insight (structure the data, not build new tools) → design definition (service blueprints, fixed vs. flexible) → execution drudgery (45-min guidance cards, 4-hr prototypes, Figma bottleneck) → IEP Studio unlock → tracking affordance + multi-expert continuity → agent-in-progress close.
**Why:** Deck narrative documentation for portfolio interviews.
**Pushed:** Not committed — output is in `/tmp/drafts/`.

### IEP demo decision
**What:** Andrew asked about live-demoing IEP Studio. Advised against copying internal Intuit source to personal machine (NDA/IP risk; interviewers notice). Andrew decided to use videos instead. Searched for IEP sizzle reel — found one real IEP video (`protected-assets/iep/iep-studio--scale-story.mp4`, 37.5s), confirmed `studio-rotate.mp4` was a Porsche unrelated. RavenMCP sizzle reels are separate files.
**Why:** Determining the right demo artifact before interview prep continues.

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Edit collision: searched for a string that a prior in-turn edit had already replaced — tool rejected with "string not found" | Accuracy gap | Sequence edits carefully; when multiple edits to the same file in a single response, verify the anchor string isn't stale before the second call |
| `get_metadata` for a full Figma deck page = 83K chars, exceeded tool limit | Speed gap | For large Figma decks, query at a known sub-tree level (page-level frame list) first, not the full page tree |

## State at end of session
- Digital Help deck story: ✓ drafted, slide-by-slide layout done — in `/tmp/drafts/` (non-durable, warned Andrew)
- IEP Studio deck story: ✓ drafted, slide-by-slide layout done — in `/tmp/drafts/` (non-durable)
- Open confirms: $1.8M vs $900K–$1M TurboTax revenue; IEP acronym; 3 QB service names; QVL; IEP impact numbers
- IEP demo clips: Andrew gathering more from work machine; will inventory when dropped here
- Pending (carried forward):
  - Confirm the two revenue figures and other IEP factual details
  - Copy `/tmp/drafts/` to a durable location (offered but session ended before response)
  - Figma read-only pass for IEP deck to reconcile details (not yet done — need IEP deck URL)
