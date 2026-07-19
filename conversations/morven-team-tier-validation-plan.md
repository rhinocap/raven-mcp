# Morven team-tier validation plan (rev 2, post-adverse)

*2026-07-19, morven-loop it36. Rev 1 was rejected by the Sol adverse pass (16 findings, 2 P0) and rewritten. Doc-only; commits no price and starts no outreach. Sources: `morven-commercial-migration.md` (it17), `morven-team-decision-graph-spec.md` (it23), `morven-commercial-handoff.md` + /tmp/drafts WTP artifacts (raven-studio loop), `morven-competitor-matrix.md` (2026-07-18, pricing cells). Nothing here is newly researched.*

## 1. The question this plan answers

Would the bound paying team (designers + engineers, IT/procurement in the room) pay for a hosted Morven team tier when Raven is free? Every current price anchor is labeled hypothetical (it17: "No final price points are set here"). This plan defines the cheapest test that produces directional evidence — with its limits stated, because the available sample cannot produce proof.

## 2. What WTP must be tested against

It17's modeled example: a specific 15-person Org→Professional downgrade mix saves $3,816/yr in seats, and $5,016/yr only if a hypothetical $1,200 plugin retirement also holds; the downgrade applies only to teams that do not require Organization-tier governance. Most of those modeled savings are **non-attributable to Morven or Raven** — a team can capture them without buying anything. Strictly Morven-attributable near-term savings are ≈ $2k/yr, itself hypothetical/conditional (it17).

So seat savings are not the paid tier's value proposition. The paid delta is what free explicitly does not include (it23 §1b): hosted org decision graph; SSO/SCIM and lifecycle governance; consent, retention, deletion, and audit controls; ingest redaction and org admin. A WTP conversation framed around savings would overstate demand; the test prices the governance-and-sharing delta only.

## 3. Precondition — an anchor must exist before any call

**Step 0 RESOLVED (Andrew, 2026-07-19): the test price is $500/mo flat per team ($6K/yr)** — anchored above the Penpot counter-anchor (~$175/mo cap) to test whether the governance/decision-graph delta carries a premium, below typical heavy-procurement thresholds so a level-4 procurement action is reachable; branch B permits one downward revision (fallback $350/mo) if price dominates the objections. The price is hypothetical until a pilot contract exists. Original gate for the record: no Morven price anchor existed (it17 sets none; the handoff's $7.5K is the services pilot, not Morven), so Andrew had to choose ONE flat-per-team test price (flat-per-team per decision `dec_mrqwwhuh_261z`) quoted identically in every conversation — a range would make "accepted price" unmeasurable across calls. Because §2 rules savings out as the value proposition, the anchor is informed by competitor and governance-tool pricing comparables (`morven-competitor-matrix.md`, Feature matrix → Pricing row; e.g. Penpot hosted $7/editor capped at $175/mo — a likely counter-anchor in calls), NOT by the it17 savings model. Without step 0 the WTP question cannot be asked consistently and no result is interpretable.

## 4. Hypothesis (D4D)

We believe that a hosted team decision graph with governance (per the it23 spec) for design-mature product teams will produce real commercial commitment. We'll know this is true when, **among completed Morven-track conversations (minimum 6 completed to evaluate at all), ≥1 reaches commitment level 4 on the discovery kit's ladder (accepted step-0 price + a procurement action: budget approval, security-review start, or signature), and ≥30% reach level 2 (budget owner engaged with a scheduled follow-up), by 2026-09-30.** Conversations that never reach the pricing question are still completed conversations — they count in the denominator and are classified in §8 (usually D). Fewer than 6 completed by the deadline = "insufficient data," not a miss.

Threshold rationale: the ≥1-at-level-4 bar mirrors the services experiment's own "at least one accepted pilot/procurement action" standard. The ≥30%-at-level-2 bar is set by asymmetric decision cost: a rerun of 5 conversations costs ~75 minutes, while org-layer scoping costs weeks — so proceeding requires more than one or two polite-interest outliers (the expected floor from any convenience sample) before the expensive branch is taken. It remains a chosen risk tolerance, not a statistical claim. With a ≤10-team convenience sample, any result is directional evidence — it can justify or defer the next spend; it cannot establish market demand.

## 5. Sample honesty

The 20-prospect list was qualified for agent-written-UI enforcement (the services wedge), not for durable decision memory or hosted governance; participants may be users or recommenders rather than budget owners, and IT/procurement presence is not guaranteed. Consequences, built into the design: (a) results are directional only; (b) **a prospect enters the Morven track only after passing a two-question screen** — (i) will a budget owner (or someone who can bring one) join, and (ii) does the team have a design practice at the scale the hosted graph serves (shared design system, multiple designers + engineers)? Prospects who fail the screen are logged as class D without a conversation; (c) each completed call still logs whether a budget owner and/or security stakeholder was actually present — calls without either support LOFA 1 falsification only weakly and are marked as such on the scorecard.

## 6. Leap-of-faith assumptions

1. **Category LOFA — teams will commit real budget to durable decision memory.** Supported if the level-4 bar is met. NOT falsified by silence alone — a zero can also mean wrong sample, missing anchor, unanswered security gates, or no authority in the room; the outcome classification in §8 separates these before any no-demand conclusion.
2. **The paid delta teams cite is governance/sharing, not savings.** Scored from the scorecard's "what would you be paying for" field: supported if a majority of level-2+ conversations name hosting/governance items; not supported if a majority name savings or say they'd self-host the free repo store (counted, not vibed).
3. **Free-tier cannibalization stays tolerable.** This plan does NOT test it23's LOFA 3 — that requires two weeks of real repo-store use, unprompted missing-needs responses from ≥half, and ≥1 payment statement (it23's behavioral conditions). Interview answers here only flag risk; the behavioral test remains owed.
4. **Procurement gates are answerable pre-pilot.** The full it23 launch-gate list applies: enforced SSO, SCIM/deprovisioning, role mapping, session revocation, separate agent identities, ingest redaction, deletion including backups and a deletion SLA, residency, no-training terms, a DPA, a subprocessor list, immutable audit logging — plus it17 §5's unresolved items. A paper DPA template does not clear this; if security objections dominate, the result measures product unreadiness, not absent demand (§8 branch C).
5. **Flat-per-team pricing holds.** Scored: among conversations that reach the pricing question, count per-seat pushback and counter-anchors (e.g. Penpot-class). "Holds" = fewer than half push to per-seat framing.

## 7. Experiment — a separate Morven track, not a rider

Rev 1 proposed riding the services Phase B calls; the adverse pass correctly killed that (one call, two priced concepts → unattributable responses, contaminating the services probe's single $7.5K anchor). Instead:

- **Test:** a **separate Morven track**: up to 10 conversations, each a **separate call** scheduled only after that prospect's services-track conversation has fully concluded — never an agenda block inside a services call, so the services probe's single $7.5K anchor is never co-presented with a second priced concept. Uses a one-paragraph hosted-graph + governance description and the step-0 price. Own one-page scorecard per call: commitment level (kit's ladder), stakeholders present, "what would you be paying for," pricing-structure reaction, dominant objection category.
- **Owner:** Andrew runs calls. **Scorecard-synthesis owner: the raven-studio loop (assigned by Andrew, 2026-07-19)** — it owns the discovery motion and sits next to the data source; the Morven loop consumes the synthesized read as a build-decision input.
- **Start:** after Andrew's outreach approval — the only remaining gate (step-0 price and synthesis owner resolved 2026-07-19). Adds no new gate to the services motion.
- **Cost:** ~15 min per conversation; zero build.

## 8. Outcome classification and decision rule

Each call's dominant objection is classified: **A** no category pain / incumbent satisfied · **B** price or packaging (incl. per-seat push) · **C** security/governance unreadiness · **D** wrong stakeholder / no authority · **E** wants free repo store, no hosted delta. Branches (evaluated on all completed conversations once ≥6 complete or the deadline hits, in this order):

- **Hypothesis met (§4 bars)** → proceed to scoping the **Morven org layer** (hosted tier). This does NOT green-light it23 phases (i)–(iii): the free repo store is gated on it23's own dogfood LOFAs (repo-file acceptance, consultation behavior, contested-merge usefulness), which hosted-tier WTP calls cannot validate.
- **Bars missed, C dominant** → first produce **paper answers** to the launch-gate list (written policies, committed roadmap dates, DPA/subprocessor drafts — conversation-stage collateral, zero build), then rerun 5 conversations; only if paper answers still bounce does implementation-backed proof enter the picture, and that is a separate investment decision, not part of this test.
- **Bars missed, B dominant** → revise anchor/packaging once, rerun 5.
- **Bars missed, D dominant** → sample problem: requalify prospects for budget authority, rerun 5.
- **Bars missed, A or E dominant** → park the hosted tier; keep free Raven + the services wedge; E additionally raises the LOFA-3 cannibalization flag for the behavioral test.
- **No dominant category / mixed** → one synthesis pass with Andrew before any rerun; do not auto-prescribe.

## 9. What a result changes

A met hypothesis makes the org-layer scoping and pricing decisions evidence-informed rather than assumption-only. A miss routes to its cause instead of a generic pivot, and keeps loop effort on the free tier and the comments pipeline. Either way the it23 phases (i)–(iii) decision stays where it belongs: behind the dogfood LOFAs.

## 10. Coordination

Per the handoff contract: this plan defines a separate Morven track and does not modify or take over the services discovery motion or its artifacts. The handoff ack line records this and states that scorecard-synthesis ownership is unassigned pending Andrew's explicit assignment (a start-gate, §7).
