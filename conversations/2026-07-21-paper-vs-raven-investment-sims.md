# Paper vs. Raven — Adversarial Investment Simulations

**Date:** 2026-07-21
**Method:** 6 boardroom simulations, each a distinct investor mandate. GPT-5.6-Sol (medium) built the two-sided adversarial brief per lens (report-only); Fable 5 sat as the investment committee and rendered a funding verdict; Fable 5 synthesized all six. 13 agents, 0 errors, ~555k tokens.
**Framing given to every board:** Paper = a native-HTML/CSS *visual canvas* with a local MCP + bi-directional code↔canvas sync (a *place* design happens, no taste/audit/memory). Raven = open-source design-*intelligence* MCP (99 tools) — per-surface Taste Engine, audits, durable Decision Graph, grab-overlay on the real page; open-core with a paid team superset (Morven).

---

## Tally

| Verdict | Boards | Count |
|---|---|---|
| **Raven** | series-a-vc, growth-pe, seed-contrarian, strategic-corpdev, ai-native-fund | **5** |
| Neither (timing) | crossover-hedge | 1 |
| Paper | — | 0 |
| Both | — | 0 |

Zero committees funded Paper. The one non-Raven verdict was a *stage* objection, not a *thesis* objection — the crossover desk called Raven "the only real moat shape in the pair" and watchlisted it with re-entry triggers.

---

## Synthesis memo (Fable 5)

### The consensus crux

**Against Paper (all six, near-verbatim): absorption.** A local MCP canvas with bi-directional HTML/CSS sync is a roadmap item — "a quarter of work for Figma Dev Mode or v0" (corpdev), "a bullet point within two product cycles" (series-a), "an IDE panel" (ai-native). Its core virtue — no proprietary layer, real web code — is also zero switching cost. It accumulates no data asset while it waits. Best case is priced as a feature: $10–25M acqui-target across every board that priced it.

**For Raven (five boards): compounding state.** The decision graph + per-surface taste calibration is the one asset in the pair that gets *more* valuable with tenure and *more* necessary as generation cost goes to zero — "better models make the 'does this match what THIS team decided' bottleneck bigger" (ai-native). It's surface-independent by construction: it survives whichever canvas/IDE wins, including Paper.

**The shared caveat (also five boards): the moat is prospective.** Everyone funded the *shape* of the data asset, not the asset. Nobody had evidence Morven converts.

### Where Paper wins the case

Paper never wins a full board, but it wins every strongest *dissent*, and they rhyme:
- **Platform physics** — in every prior cycle the surface with distribution absorbed the data layer (browsers ate plugins, IDEs ate linters, Figma ate handoff tools). Raven has voluntarily ceded the surface.
- **Hot path vs. advisory** — the canvas is where daily work happens; judgment tools are skippable under deadline pressure. If AI-native dev consolidates around a canvas the way design did around Figma, Paper owns the platform seat and monetization gets invented later.
- **Demoable pull vs. thesis** — Paper solves a felt problem *today* (humans + agents co-editing UI); devs reach for it unprompted. "Figma will absorb it" was also the bear case on Figma. Raven is funded on a conversion story two steps from evidence.

Honest read: Paper is the higher-variance bet on a category-owner outcome. The boards passed because its downside — commodity feature, absorbed — is the *modal* outcome, not the tail.

### Where Raven wins the case

- **Only compounding asset in the deal** — year two > year one; ripping out a team's accumulated decisions costs more than the subscription (the Notion/Linear single→multiplayer replay at the design-decision layer).
- **Rides the capability curve instead of fighting it** — Paper bets agents stay bad at visual iteration (the exact thing labs ship next); Raven's bottleneck (whose taste? which decision?) grows as generation improves.
- **Structural monetization gate** — Morven's paid triggers (multi-user consent, admin approval, shared graph) only exist at team scale, so the free tier stays generous without cannibalizing the org sale.
- **Unforkable in the way that matters** — MIT code clones; the accumulated per-team decision corpus + taste bindings do not (the one thing an incumbent can't ship in a quarter).
- **Why-now is real** — agents ship UI faster than any human review process, and no incumbent owns judgment-and-memory.

Priced across boards at **$18–70M post, checks $4–14M** — a coherent seed-to-early-A band, not a fantasy spread.

### Raven's honest fragility

The sharpest recurring attack (four boards): **the moat is an empty ledger.** The switching cost is *behavioral, not technical* — it only exists if teams actually record decisions densely enough that the graph becomes load-bearing. Today the taste data is "a handful of files, local + Redis, thin and portable." Corollaries:
- **Free-tier cannibalization** — 99 tools, full audits, and the decision graph ship free; small teams may limp along on one shared profile and never convert.
- **Platform memory** — Anthropic/OpenAI/Cursor shipping native project-memory/decision-logging is a *far* smaller lift than a canvas, and zero-friction platform memory strangles an external MCP layer before the graph compounds.
- **Model absorption** — next-gen models infer team taste from the repo, making calibration feel like manual labor.
- **Two-buyer gap** — the free enthusiast (solo dev) and the paying buyer (team + IT + procurement) are different people; no paid logo, no pricing test, team infra lagging the OSS tier.

**What has to be true to beat it:** decision density must arrive *automatically* — agents auto-capturing decisions in the normal flow of work, not humans dutifully logging them. If recording requires discipline, the graph stays thin and Raven is a beloved free tool. If recording is a byproduct of agent workflows Raven already sits inside, the corpus compounds before any incumbent ships a native alternative. Secondarily: 3–5 Morven design partners with a shipped consent/admin flow — every board's tranche gate was the same milestone.

### The verdict

**Raven is the better Series A investment, and it isn't close.** Five of six funded it; the sixth wanted it later at a worse price. Paper's bull case exists only in dissents, its modal outcome is absorption as a feature, and it accretes nothing while it waits. Raven is the only asset whose value compounds *with* the agent capability curve rather than being eroded by it, with a structural (not discretionary) paid gate at the team boundary. The risk you're paying for is *conversion evidence, not thesis validity* — and that risk is priced in at every board's valuation.

**The one move that most improves investability: make decision capture automatic, then instrument it.** Ship agent-side auto-capture — `review_diff`/`polish_diff`/audit flows that draft decisions as a byproduct of work the agent already does, with a human-confirm step — and expose a decision-graph *density* metric per team (decisions/week, gap-closure rate, re-litigation catches). That converts the recurring "empty ledger" attack into the retention cohort every board named as its tranche trigger, and it's the difference between "$40M on a thesis" and "$80M+ on a data asset." The Morven logos matter, but they *follow* from density; density doesn't follow from logos.

**Uncomfortable note for the builder:** the free tier's generosity is currently the bear case's best evidence. Don't shrink it — the boards were unanimous that the solo tier is the distribution engine — but the team-only surface (consent, admin, shared-graph semantics) has to be *visibly ahead* of the OSS tier, not lagging it, before the next raise.

---

## Appendix — six board verdicts

| Board | Funds | Check / stage | Valuation | Load-bearing bet | Killer risk |
|---|---|---|---|---|---|
| **Crossover hedge** | Neither (watchlist) | $0 now; ~$25M Series B on triggers | Raven $40–80M but 2+ yrs from strike zone | Decision graph is a durable data asset models won't absorb | Open-core conversion fails → beloved free tool, never a company |
| **Series A VC** | Raven | ~$10M A, milestone-tranched | $40–55M post | Solo free user becomes internal champion → team lands Morven | Two-buyer gap; zero paid logos / pricing test |
| **Growth / PE** | Raven | $8–10M, half on conversion evidence | $30–45M post | Consent + shared graph is a *hard* team blocker | Free-tier cannibalization stalls conversion |
| **Seed contrarian** | Raven | $4M seed, lead, 15–20% | $18–25M post | Judgment+memory becomes a surface-independent data layer | Surface-owners bundle "good-enough" critique |
| **Strategic / corpdev** | Raven (+ partnership, ROFN) | $8–12M strategic A | $40–60M post | Decision memory becomes the enforcement layer every agent consults | Incumbent forks OSS logic; corpus too thin to lock in first |
| **AI-native fund** | Raven | $10–14M A | $50–70M post | Agents *auto-capture* decisions → graph gets dense | Platform ships native project-memory primitive |

**Cross-board pattern:** every "no/dissent" reduces to the same single risk — *the decision graph is thin today and its lock-in is behavioral*. Every "yes" reduces to the same single strength — *it's the only asset that compounds as agents get better*. Both point at the same lever: **automatic, instrumented decision capture.**
