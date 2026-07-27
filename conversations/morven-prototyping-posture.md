# Morven prototyping posture (spec, it37 — rev 2, post-adverse)

*2026-07-19, morven-loop it37. Doc-only; no build starts without Andrew's directional nod (interpretive work → cheap check first). Rev 1 was rejected by an adverse pass (3 P0) for pinning a "small gap" claim to primitives that don't exist on main and to a bridge that doesn't serve HTML; this rev states the dependency chain honestly. Sources: `morven-competitor-matrix.md` (2026-07-18 — prototyping rated **blocking**, "No Raven/Morven equivalent"; UI generation rated **absent**), it23 team decision-graph spec.*

## 1. The problem

Interactive prototyping is one of three surfaces that make "cancel Figma today" fail for the team designer (with history and admin/security). Figma's click-through prototypes serve two jobs: (a) research/stakeholder walkthroughs, (b) interaction-design exploration — overlays, transitions, scroll behavior, variables, not just linked screens. The matrix's note frames the fork: the nearest substitute is prototyping in real code — "which changes who can author." That authorship shift is the design problem; getting a browser to render the screens is the smaller, better-understood part.

## 2. Posture: the prototype is a live code artifact, not a canvas simulation

Morven should not build a canvas click-through simulator — that chases Figma's most mature surface at parity, which the loop's own bar forbids. The proposed posture: **prototypes are live HTML/code artifacts, authored through the agent + grab loop, grounded in the team's tokens and recorded decisions.**

The intended advantage (stated as a hypothesis, not established): a code-based prototype is real markup on real tokens, so `audit_taste`/`review_diff` can judge it and `decision_*` can record what it settled, and the path from prototype to production is a diff rather than a rebuild. Whether any competitor already connects prototyping to a decision graph is not established — the matrix's own epistemics note that absence of competitor evidence is evidence about the research, not the market, so this is a direction to test, not a proven differentiator. Market context (from the matrix's sourced profiles): Dessn does prompt-to-prototype in the production codebase [R4], Open Design generates local-first artifacts [R5], Figma Agent prototyping is "coming soon" [R21]. Code-prototyping is the converging direction; the bet is that taste/decision grounding is where Morven differs, and that bet is unproven.

## 3. The authorability gap is LARGE, not small (corrected)

Rev 1 called the gap "small and specific." It is not. A Figma prototype is authorable by a designer alone, live in front of a stakeholder, with zero setup. Reaching that on main requires three capabilities, two of which do not exist and one the matrix rates absent:

| Job | State on main (HEAD c3e0e02) | Size |
|---|---|---|
| Generate the screen UI | **absent** — matrix W1 rates UI generation "absent; creative jobs generate media, not product UI." Screens today come through the agent, not designer-solo. | large — the core blocker |
| Scaffold/annotate a screen's slots | `list_templates`/`get_page_template`/`set_template_slot` are **NOT on main** — they live only on the unmerged `f23-templates-layers` branch and a feasibility doc, and even there they annotate slots on an already-existing page (no HTML generation) | large — off-main + wrong shape |
| Serve a flow to a browser | grab bridge serves its API routes + `/raven-grab.js`, and in proxy mode injects the overlay into HTML relayed from a **running local dev server** (`proxy_target`). What's absent is serving a standalone `flows/` dir of HTML files with no dev server behind it | small — a static-file route is new code, size not yet estimated |
| Link screens / toggle states solo | no gesture exists; edits route through the agent | medium |
| Judge / record the result | `audit_taste`, `audit_page`, `score_page`, `decision_*` all real on main | done |

So the honest picture: the prototype-in-code posture depends on **UI generation** (Morven's biggest W1 gap, rated absent) before flow-linking is even reachable. Flow linking is not the missing piece; screen authoring is.

## 4. What's Raven vs what's Morven

- **Raven (free, this repo, if built):** the single-player loop — screen authoring, flow linking, a local preview, audit/score against tokens. Its precondition is closing the W1 UI-generation gap, which is a separate, larger track.
- **Morven (paid, separate surface):** shareable hosted prototype links with stakeholder comments that ingest into the org decision graph — reusing the comments pipeline **once PRs #38/#42/#43 merge** (all currently open; unbuilt today) — plus access controls per the governance spec. Sharing + capture is the team-priced delta; authoring stays free.

## 5. Phases (all Andrew-gated; none started; each names its real dependency)

1. **P0-dep — UI generation for product screens (Raven, W1).** The precondition. Until a designer can produce a screen without hand-authoring HTML through the agent, prototyping-in-code has no author. This is the actual next W1 investment; prototyping rides on it, not before it.
2. **P1 — flow format + preview (Raven).** A `flows/` convention (screens as HTML files + a small JSON flow map). Preview needs a static-file server: either a new route on the grab bridge or the existing proxy mode against a dev server the user already runs (size TBD at spec time). Acceptance: a 3-screen flow, navigable in a browser, passing `audit_taste`. **Depends on P0-dep for the screens to exist.**
3. **P2 — grab-session linking (Raven).** Overlay gesture to create/edit flow edges and simple state toggles without touching the agent. **Depends on P1 (the flow format/preview it edits) and transitively on P0-dep.** Acceptance: designer links two screens solo, file diff is readable. Note: "simple states" covers linked screens only — overlays/transitions/scroll/variables (Figma job b) stay out of scope, so this is a partial replacement of click-through, not a full one.
4. **P3 — hosted share + comment capture (Morven).** Stakeholder link + comments→decision-graph ingest. The team-tier WTP result (`morven-team-tier-validation-plan.md`) is a **necessary-not-sufficient** gate: a met hypothesis authorizes only org-layer *scoping*, not a P3 build (it23 phases stay behind their own dogfood LOFAs). If teams won't pay for governance, P3 has no buyer; P1/P2 still stand as free-tier W1 value — but only after P0-dep.

## 6. Verification bar (when built)

Per-phase: tests + eyes-on vision of the rendered flow, customer pass as BOTH personas (designer authors a flow solo; engineer opens the flow files and can implement from them without asking anything), independent adverse pass before any done claim. P1's cheap directional check for Andrew: one 3-screen demo flow, before any tool-surface work.

## 7. What this changes now

Nothing ships from this doc. Its corrected finding: the matrix's "blocking, no equivalent" prototyping cell is not a short hop — it sits behind the W1 UI-generation gap the matrix rates absent, plus off-main scaffolding and a bridge that doesn't yet serve standalone flow HTML. The useful reprioritization: **prototyping is downstream of UI generation, so UI generation is the item that unlocks it.** Matrix cell moves only when P1 merges (which needs P0-dep first). Andrew owes: a directional nod on the posture (prototype-in-code + grab-loop authoring, gated behind W1 generation) before any of it is specced into a PR.
