# Decision store — dogfood + consultation log

This is raven-mcp dogfooding its own Decision Graph. The store here (`nodes.json` /
`edges.json`) holds raven-mcp's genuinely-locked project decisions, seeded so the
repo becomes a **non-author consumer** of its own decision graph.

## Why this exists (it51, 2026-07-19)

The leading metric for the team-decision-graph bet is **decisions consulted-per-week
by an agent OTHER than the author** — and it has been **0**. it49 shipped the shareable
repo-store substrate; the it50 zoom-out (Sol-adverse) then flagged that we were about
to build concurrency infrastructure (slice ii) for a graph nobody had been shown to
consult. This is the mandated cheap check that must precede that build: seed real
decisions, then see whether a non-author agent actually consults them and it changes
an output. No merge driver, no schema change.

## How the store is consulted (verified)

On `main` today, `decisionsHome()` resolves `RAVEN_DECISIONS_HOME` first, so any agent
can point a raven server at this store:

```sh
RAVEN_DECISIONS_HOME="$PWD/.raven/decisions" RAVEN_NO_USAGE_LOG=1 node dist/index.js
# then: decision_list  → 7 active decisions
#       decision_list status=candidate → the telemetry candidate
```

Verified via `scripts/verify-dogfood.mjs`: a fresh non-author server process read all 8
seeded decisions back through the real `decision_list` tool (7 active by default; the
`candidate` telemetry decision reachable via explicit status). `decision_list` correctly
defaults to active-only.

## Status of the leading metric: STILL 0

it51 was Sol-adverse'd (report-only) and came back FLAWED-7. The adverse is right on the
load-bearing point, and this log records it honestly rather than around it: **the metric
did NOT move.** What it51 actually delivered is narrower than "consultation proven":

- **Verified:** a fresh server process, pointed at this repo-local store, retrieves all 8
  decisions through the real `decision_list` tool on `main`. That proves the *retrieval
  substrate* works. It does not prove independent consultation.
- **Self-dealing, acknowledged (Sol #1):** the same loop authored the decisions, ran the
  reader, and would log the read. A staged read by an actor that isn't independent of the
  author is not a metric event. The metric stays 0 until an agent that did not author a
  decision, and was not staged to read it, consults it in its normal workflow.
- **The illustrative datum below is NOT evidence (Sol #2):** earlier this session the
  main-session agent, answering "is anything blocking 2.0?", did read these locked
  decisions and it shaped the answer — but that was a manual read from context, post-hoc
  attributed, with no contemporaneous tool trace. Kept as an illustration of the *shape*
  of a consultation, explicitly not counted.

| date | decisions | author | reader | independent? | tool-traced? | counts? |
|------|-----------|--------|--------|--------------|--------------|---------|
| 2026-07-19 | telemetry, stdio-freeze, anon-45 | andrew/project | loop main-session agent | no (same loop) | no (manual) | **no — illustrative only** |

## The bigger correction (Sol #3): infra decisions are the wrong dogfood content

These 8 are raven-mcp's *engineering/governance* constraints (stdio, deploy, auth,
release). Retrieving them tests plumbing, not the product hypothesis — which is that a
**design team's design judgment** (taste rulings, token choices, component/interaction
decisions) gets consulted by coding agents. Proving that needs DESIGN decisions in the
store, consulted by an agent other than their author. That is the it52 re-seed.

## Anti-gaming definition of "consultation" (Sol #7) — the bar the metric must meet

A consultation counts toward the leading metric ONLY when ALL hold:
1. **independently initiated** — the query is not made by the decision's author and not
   staged for the purpose of the count;
2. **tool-traced** — a durable server-side log records reader identity, decision id, and
   timestamp (retrieval ≠ reading ≠ application — the trace is the query event);
3. **outcome-linked** — the consulted decision demonstrably changed the reader's action,
   recorded contemporaneously, not attributed after the fact.

Instrumentation to enforce this (an `author` field + a consultation counter in the read
path) is deferred to the it49 branch, where `decision-graph.ts` already diverges — adding
it on main would fork that surface and collide with Andrew's pending review. Until it
lands, the metric is honestly **unmeasurable**, therefore reported as 0.
