# Raven 2.0 — multi-instance coordination log

Append-only, newest at bottom. TWO Claude instances work this repo concurrently:
- **release** — cutting the two-panel Raven 2.0 (owns main merges + the release cut).
- **morven-loop** — the self-paced compounding loop (owns named feature branches +
  doc/log updates to main via detached worktree; never merges to main, never touches
  release-path code).

**Handshake (both, every push):** `git fetch origin` → check `git log --oneline origin/main`
→ commit with explicit pathspec (`git commit --file=<msg> -- <files>`), never bare →
never force-push → feature work on branches, not direct code commits to main. Append an
entry here (UTC + instance slug) before and after any push.

**Release-relevant state from the loop (as of this seed):**
- Release-audit gate CLOSED (it47/it48): clean-room pack-smoke of the combined PR tip —
  no dropped tools, `.mcpb` manifest in sync at 93. Details in `conversations/morven-loop.md`.
- One 2.0 checklist item from the loop side: `scripts/postinstall.cjs` is a silent
  opt-out install phone-home to ravenmcp.ai. Andrew is deciding whether to remove it
  (recommended) before publish. Logged as a *candidate* decision on branch
  `it51-dogfood-decisions` (`.raven/decisions/nodes.json`), not yet policy.
- Loop branches on origin awaiting Andrew's review, NOT for 2.0:
  `it49-repo-decision-store` (@ e1d9e02), `it51-dogfood-decisions` (@ df162bc).

## Log

- 2026-07-19T · morven-loop · seeded this coordination log (it51). main @ HEAD is the loop's it50/it51 doc pushes; loop has NOT touched any release-path file. Release instance: this file is yours to write to as well — append your 2.0 cut plan + progress here.
- 2026-07-19T · morven-loop · it52 pushed branch `it52-decision-instrumentation` (@ e92b45d) to origin — NOT main, NOT release-path. Adds decision-graph consultation instrumentation + a real design-decision seed; 778/777/0/1. No release-relevant change. Loop branches now awaiting Andrew's review (all NOT for 2.0): it49-repo-decision-store (@ e1d9e02), it51-dogfood-decisions (@ df162bc), it52-decision-instrumentation (@ e92b45d). Telemetry (scripts/postinstall.cjs) still the one loop-side 2.0 checklist item — remove recommended before publish; still Andrew's call. origin/main unchanged (5ec3c84) — no release-instance push seen yet.
- 2026-07-20T · morven-loop · it53 pushed branch `it53-consultation-proof` (@ 536f866, off it52) to origin — NOT main, NOT release-path. Adds scripts/consult.mjs (decision-graph reader CLI) + a mechanism-proof test; 779/778/0/1. No release-relevant change. Loop branches awaiting Andrew's review (all NOT for 2.0): it49 (@ e1d9e02), it51 (@ df162bc), it52 (@ e92b45d), it53 (@ 536f866). Telemetry (scripts/postinstall.cjs) still the one loop-side 2.0 checklist item. origin/main unchanged (67e8f40) — no release-instance push seen yet.
- 2026-07-20T · morven-loop · it54 pushed branch `it54-consult-first-instruction` (@ 9624bf2, off it53) to origin — NOT main, NOT release-path. Adds scripts/install-agent-instructions.mjs (AGENTS.md consult-first installer) + consult-first-block.md + test + a root AGENTS.md (dogfood); 782/0/1. NOTE for release instance: this commit adds an `AGENTS.md` at repo root — if the 2.0 cut wants its own AGENTS.md, this branch's version is loop-authored (a consult-first block) and is NOT release-path; reconcile at merge, don't assume it's yours. Loop branches awaiting Andrew's review (all NOT for 2.0): it49 (@ e1d9e02), it51 (@ df162bc), it52 (@ e92b45d), it53 (@ 536f866), it54 (@ 9624bf2). Telemetry (scripts/postinstall.cjs) still the one loop-side 2.0 checklist item. origin/main unchanged (6ca382c) — no release-instance push seen yet.
