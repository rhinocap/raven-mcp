# Session: 2026-07-10 — three-feature feasibility spec

## This session
### Feasibility spec: DS gap diff / page templates / layers panel
**What:** `/goal` — feasibility spec for (1) design-system gap diff vs Raven's bundled systems, (2) grab-overlay page templates with designer-marked fixed/flexible slots, (3) Figma-style layers panel with permission-gated reorder. Interviewed Andrew (F1 source configurable at setup; F2/F3 in grab overlay; permissions spec'd both ways; fixed/flex designer-marked). Workflow: 3 Codex ground readers + 2 Claude research legs + 3 Codex spec authors + 3 Codex adversarial verifies (~927k tokens); F1 author's context truncated in the Codex wrapper (wrote the wrong feature) — re-ran via direct `codex exec`, then verified.
**Why:** Andrew's /goal.
**Output:** `docs/feasibility-ds-diff-templates-layers.md` — post-objection verdicts: F1 local-first DESIGN.md experiment (parser migration required; hosted/codebase/Figma need discovery); F2 feasible-with-caveats (3-4d MVP); F3 partially feasible (inspect+ephemeral preview M; source persistence + hosted auth are XL spikes, not phases).

## Mistakes & lessons
| Mistake | Type | Rule added |
|---------|------|-----------|
| Codex workflow wrapper truncated large context payload → agent spec'd the wrong feature | tooling | Pass big context via file + direct codex exec, and check each fan-out result matches its brief before synthesis |

## State at end of session
- Feasibility doc committed ✓
