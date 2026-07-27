# /loop — build-next (build one backlog spec, then ask)

A self-paced builder that pulls the **top ready spec** from `.claude/linear-backlog-queue.jsonl`, builds it **in an isolated git worktree**, runs the full verification spine (done-gate + adverse + bound-customer lens), and **PREPARES a PR to a preview — then STOPS for Andrew's one-word go (🚀)**. It never merges, never pushes to `main`, never touches npm. By design: raven-mcp is a public project with real external consumers, and merge is the irreversible, human-gated step (same reason `release-readiness` never publishes unattended).

Adopts the spec→build→review→async-merge loop from Alex Finn's "loops" video, but keeps Andrew's spine (done-gate, eyes-overrule-metrics, no-prod-without-approval) and **rejects the video's auto-merge endgame**. Pairs with `release-readiness` (which ships merged work) and the `prioritization-judge` skill (which scores what's allowed to enter this loop).

Run it as:

```
/loop <paste the prompt block below>
```

(No interval → self-paced. Cadence rule: if you `/schedule` or interval it, use **1200–1800s**, never sub-5-min — CLAUDE.md. One spec prepared per run; it stops for you.)

**Before first run — wire once (Andrew-owned):**
- `OPENROUTER_API_KEY` in a dotfile (unlocks the open-weight builder lane — GLM 5.2 default / Kimi K3 ceiling — for design/frontend legs; optional, the loop builds on the normal harness without it).
- Slack incoming-webhook (optional) → flips the ASK step from "print the payload here" to "post to #merge-ready + wait for 🚀". Until wired, the loop just reports in-chat.

---

## The prompt

```
Build the TOP ready spec from raven-mcp's backlog queue, PREPARE a PR to a preview, then
STOP and ask Andrew for the one-word go (🚀). NEVER merge, push to main, or run npm.
One spec per run. This is the build half of the spec→build→review loop; keep the FULL
verification spine (done-gate + adverse + bound-customer lens) — do not skip it to look done.

PRE-FLIGHT (always):
- Parallel-instance collision check: `git fetch origin`; `git log --oneline -5 origin/main`
  and `git for-each-ref --sort=-committerdate refs/remotes/origin | head`. If another instance
  is mid-build on the same spec (a build/<id> branch on origin, or the item's status already
  moved), STOP — reconcile, don't double-build.
- Clean tree on main (local main == origin/main; fast-forward if behind and safe).

PICK the spec (from `.claude/linear-backlog-queue.jsonl`, JSONL, one object/line):
- ELIGIBLE = status=="queued" AND judge_score is not null (prioritization-judge has scored it)
  AND it is a concrete PRODUCT spec with acceptance criteria in `body` — NOT a meta/system item
  (skip entries about building the loop/routing itself), NOT priority=="done-log"/"unscored".
- Among eligible, take the highest judge_score (tie → oldest `captured`).
- If the top queued item is scored but has NO acceptance criteria / non-goals in `body`:
  do NOT guess — mark it `status:"needs-spec"`, log "top item needs /spec first: <id>", STOP
  and tell Andrew to run /spec on it. (v1 does not auto-chain spec→build.)
- If NOTHING eligible: write nothing, log "nothing ready to build — <date>", exit 0.
- On pick: set that item's `status:"building"` in the jsonl (rewrite the one line; leave others
  byte-identical) so a parallel instance won't grab it.

BUILD (isolated — never the shared tree):
- Create a worktree: `git worktree add ../raven-mcp-build-<id> -b build/<id> origin/main`.
  Work ONLY there. (Design/frontend-heavy legs may be delegated to the open-weight lane via
  OpenRouter if OPENROUTER_API_KEY is set — GLM 5.2 default; it's slower, so let it run.)
- Implement against the spec's acceptance criteria as the loop's EXIT CONDITION — build to the
  criteria, not to a step list. Honor the non-goals (don't build outside scope — scope-drift is
  a logged failure mode for this kind of run).
- FROZEN guardrails (raven-mcp ground truth): stdio MCP behavior stays byte-identical; do not
  change the anonymous 45-tool golden hash; `dist/` is gitignored (rebuild after src changes).

VERIFY (the spine — mitigates the false-done failure tag; do all three):
- `RAVEN_NO_USAGE_LOG=1 npm test` must be fully green. Red → STOP, report, do not prepare a PR.
- done-gate on the built artifact. If it renders anything user-visible: eyes-on the real running
  surface (eyes overrule metrics) AND walk it as raven-mcp's bound Target customer (team lens
  first, then the free solo-dev path — see CLAUDE.md "## Target customer"). No visual surface →
  consume the output as its downstream user would.
- Adverse review, report-only: GPT-5.6-Sol medium falsifies the change ("report only, do not
  edit any files"); resolve every real objection. Check `git diff --stat` for stray edits.

PREPARE the PR (local + push the branch ONLY — no merge):
- Commit to build/<id> with an imperative title + what/why body + the Co-Authored-By trailer
  (CLAUDE.md commit format). Commit explicit paths only (`git status --porcelain` first).
- `git push origin build/<id>`. Open a PR against main with `gh pr create` — body: the spec,
  acceptance-criteria checklist (checked), test result, adverse verdict, and step-by-step
  "how to test this yourself". Do NOT merge. Preview URL: the `site` Vercel project builds
  git branches → paste the branch preview URL if it resolves; else say "preview pending".
- Set the item `status:"merge-ready"` in the jsonl.

ASK (the gate — end the turn here):
- If a Slack webhook is wired: post to the merge-ready channel — PR link, preview URL, test
  steps, adverse verdict — and tell Andrew 🚀 = merge.
- Else: report the same in-chat and ask for the one-word go.
- Do NOT merge in the same turn.

ON GO (only when Andrew says go/🚀/merge in a LATER message):
- `gh pr merge <n> --squash --delete-branch` (never --no-verify). `git worktree remove` the
  build dir. Set the item `status:"merged"`. Report the merge commit + (if it triggers one)
  the deploy URL as verification. Merging to main here does NOT publish npm — that stays the
  release-readiness loop's human-gated job.

GUARDRAILS:
- NEVER merge/push-to-main/npm without Andrew's explicit go in the current message.
- NEVER push a branch on red tests. Collision-check before any branch/commit/push.
- One spec prepared per run. Keep the queue jsonl append/rewrite-one-line safe (never reorder or
  drop other lines). Report the prepared PR (or "nothing ready to build").
```
