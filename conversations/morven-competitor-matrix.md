# Morven competitor matrix

**Date:** 2026-07-18 (full refresh; original 2026-07-17)  
**Purpose:** Raven → Morven license-replacement tracking. This compares current Raven capability with design tools covered by the cited research.  
**Refresh rule:** Treat this matrix as stale after two weeks; refresh on or before 2026-08-01.

## Reading the matrix

- Competitor claims come only from the supplied research and its cited sources. “Not established” means the research did not support a claim.
- Morven status is judged against Raven `main` at fa0671e — 93 stdio tools including the Decision Graph (`decision_add/evidence/get/list/draft/commit/supersede/scope/history/import`), `review_diff`, `polish_diff`, and `audit_taste` `source_text` — plus the pre-existing surface: audit tools; Taste Engine; design-system generation/composition; brand, content, and service-design knowledge; creative scoring and generation jobs; Raven Grab; DESIGN.md tools; templates; Talon rules. **Distribution caveat (load-bearing, applies to every cell scored on the 93-tool baseline):** the published npm package is still v1.17.1 from 2026-07-17 pre-landing, and `manifest.json` lists 51 tools until PR #35 merges — everything landed 2026-07-18 is on `main` but in NO published artifact yet. Cells below say "(on main; undistributed)" where this matters.
- Status terms: **absent** = no current equivalent; **parity** = usable current coverage; **differentiated** = Raven's coverage is distinct in kind relative to the cited competitor coverage, with no equivalent established in the research — NOT a proven-better claim, and absence of competitor evidence is evidence only about the research, not the market; **N-A / not comparable** = no sound basis for comparison; **parity?** marks incomplete or indirect coverage. (Adverse review 2026-07-18 removed all unbenchmarked "better" claims.)
- **Morven status scores repo CAPABILITY (main at fa0671e), not product availability.** Availability is a separate, currently-failing dimension tracked by the distribution caveat above and gap 1 below; a cell marked differentiated can simultaneously be unavailable to every published-package consumer. Read every "(on main; undistributed)" tag as "capability true, availability false."

## Tool profiles

### Figma

- **Positioning:** Mature collaborative vector canvas with prototyping, component libraries, design systems, FigJam, Dev Mode, Figma AI, Make, Sites, and Weave media tasks. [Figma releases][R11] [Weave integration][R12] [Dev Mode][R13]
- **Pricing:** Free starter tier; Professional, Organization, and Enterprise paid seat tiers (per-editor pricing on the cited page) including 3,000, 3,500, and 4,250 monthly AI credits respectively. [Figma pricing][R1]
- **Learning curve:** Moderate for experienced designers; frames, auto layout, and variants remain nontrivial for non-designers. Dev Mode narrows the interface for engineers. [Dev Mode][R13]
- **AI / agent / MCP:** AI generation and web search; Dev Mode MCP sends component, spec, and intent context to agents for design-to-code. Code-backed screens are mentioned but code-to-design detail is limited. [Figma MCP research source][R2] [Figma releases][R11] **New since original matrix — Figma Agent (beta, rolled out from 2026-05-20, credit-free during beta, Full seats on paid plans only):** an autonomous agent on the design canvas doing 0→1 generation, remixing, bulk edits, design-system-aware component/variable authoring, plugin generation (Props Kit), comment-context edits, MCP connectors (pull external context AND write back), and design feedback including "design critique from the perspective of different personas." Consumption pricing announced for GA. [Figma Agent announcement][R19] [Figma Agent help][R21] [2026 pricing/credits overview][R20]
- **Pricing detail (2026-07 refresh):** Full seat $16 (Professional) / $55 (Organization) / $90 (Enterprise) per editor/month annual; Dev seat $12/$25/$35; Collab seat $3/$5. AI credits 3,000/3,500/4,250 per Full seat. [2026 pricing/credits overview][R20]
- **Weaknesses:** Closed, canvas-first ecosystem; metered AI usage (agent pricing unresolved until GA); agent critique operates inside Figma files, not across a codebase; no evidence in the research of a cross-repo audit layer or a durable, portable taste/decision model outside Figma. [Figma pricing][R1] [Figma Agent help][R21]

### Paper (paper.design)

- **Positioning:** HTML/CSS design canvas connecting teams, code, data, and agents; June 2026 additions include tokens, vector editing, and folders. [Paper][R3]
- **Pricing:** Free: 100 MCP calls/week and limited image generation. Pro: $20 with annual discounting, 1 million MCP calls/week, and 100× image generation capacity. [Paper pricing][R14]
- **Learning curve:** Lower for web developers; a larger conceptual shift for traditional designers because the canvas uses web primitives. [Paper][R3]
- **AI / agent / MCP:** MCP-native; agents read and write the canvas, synchronize tokens/styles/components, handle responsive layouts, and move between code and design. [Paper][R3]
- **Weaknesses:** Web-centric; newer ecosystem; no dedicated cross-repo audits, longitudinal taste engine, or broad native-mobile surface established in the research. [Paper][R3]

### Dessn (dessn.ai)

- **Positioning:** Collaborative visual design and prototyping directly in a production codebase without opening an IDE. [Dessn][R4]
- **Pricing:** Not stated in the research. [Dessn][R4]
- **Learning curve:** Low for stakeholders editing an existing product in context; more constrained for early freeform exploration. [Dessn][R4]
- **AI / agent / MCP:** Prompt-to-high-fidelity-prototype generation in the production-code context, including brand-new flows; MCP/external-agent access not established. [Dessn][R4]
- **Weaknesses:** Production-code orientation; design-system governance, external-agent access, and portfolio-wide review not established. [Dessn][R4]

### Open Design (open-design.ai)

- **Positioning:** Local-first, open-source agentic workspace for prototypes, sites, dashboards, slides, and HTML video; artifacts remain filesystem-owned. [Open Design][R5] [Open Design repository][R17]
- **Pricing:** Free under Apache-2.0; users bring their own agents, credentials, and model usage. [Open Design][R5]
- **Learning curve:** Natural for CLI- and agent-oriented developers; steeper for designers expecting a direct-manipulation canvas. [Open Design][R5] [Open Design repository][R17]
- **AI / agent / MCP:** Ships skills, CLI, and MCP; agents read and write artifacts and use DESIGN.md as a brand/design contract. Supports code analysis and production-ready file output. [Open Design repository][R17]
- **Weaknesses:** No rich shared canvas or built-in organization-wide adherence dashboard; capability quality depends on external agents and installed skills. [Open Design][R5] [Open Design repository][R17]

### Penpot

- **Positioning:** Open-source collaborative vector design, prototyping, systems, and inspection built on CSS, HTML, SVG, JSON, and an open file format. [Penpot][R6]
- **Pricing:** Self-hosted use is free under MPL 2.0. Hosted Unlimited is $7/editor/month, capped at $175/month; viewers are excluded. Enterprise is €950/month flat, subject to stated exceptions. [Penpot pricing][R15]
- **Learning curve:** Familiar to canvas-tool users; open formats reduce friction for engineers, while MCP/plugin work requires more technical setup. [Penpot][R6] [Penpot MCP][R16]
- **AI / agent / MCP:** Agent-agnostic MCP and plugin API; explicit design-to-code, code-to-design, and design-to-design workflows with agent read/write access. [Penpot MCP][R16]
- **Weaknesses:** No built-in longitudinal taste engine or organization-wide audit layer; smaller ecosystem than Figma; advanced agent workflows require implementation. [Penpot MCP][R16]

### Magic Patterns

- **Positioning:** AI feature-prototyping tool that generates UI intended to match an existing product. [Magic Patterns][R7]
- **Pricing:** Not stated in the research. [Magic Patterns][R7]
- **Learning curve:** Relatively low for PMs, designers, and product engineers using prompts and product context. [Magic Patterns][R7]
- **AI / agent / MCP:** AI generation is core; external-agent access, MCP, open design artifacts, and code round-tripping are not established. [Magic Patterns][R7]
- **Weaknesses:** Specialized ideation tool rather than a complete canvas, system manager, or audit/governance layer. [Magic Patterns][R7]

### Vercel v0

- **Positioning:** Developer-first AI UI generation through code and rendered previews, integrated with Vercel workflows. [v0 pricing][R8]
- **Pricing:** Free includes $5 monthly credits. Plus is $30/user/month with $30 monthly credits and $2 daily login credits; Business/Enterprise tiers exist with procurement controls not enumerated here. [v0 pricing][R8]
- **Learning curve:** Moderate for developers and design engineers; less accessible to nontechnical stakeholders. [v0 pricing][R8]
- **AI / agent / MCP:** Prompt- and code-context-driven UI generation; design-to-code is central. The research does not establish a generalized design MCP or normalized design-artifact model. [v0 pricing][R8]
- **Weaknesses:** Generation rather than governance; no durable taste engine, cross-repo audit layer, or shared canvas established. [v0 pricing][R8]

### Google Stitch

- **Positioning:** AI-native infinite canvas for conversational creation, iteration, critique, and collaboration on high-fidelity UI. [Google Stitch][R9] [March 2026 update][R18]
- **Pricing:** Not stated in the research. [Google Stitch][R9] [March 2026 update][R18]
- **Learning curve:** Low for non-designers because creation and editing use spoken or typed natural language; experienced designers may have less direct pixel control. [Google Stitch][R9]
- **AI / agent / MCP:** Real-time design agent, critique, interviewing, live variations, MCP server and SDK, plus export to AI Studio and Antigravity. [Google Stitch][R9]
- **Weaknesses:** No cross-portfolio audit or strict codebase-wide system enforcement established; downstream workflow is Google-oriented; pricing remains unresolved. [Google Stitch][R9]

### Impeccable

- **Positioning:** Agent vocabulary and command layer — "gives your agent the designer's vocabulary" for directing design work live in a production codebase; positions itself as an upgrade to Anthropic's skill of the same name. [Impeccable][R10]
- **Pricing:** Site copy implies free ("Can't believe it's free" testimonial); formal terms not established. [Impeccable][R10]
- **Learning curve / MCP:** Not established beyond its role as an agent-language adjunct. [Impeccable][R10]
- **Weaknesses:** Does not appear to store or manipulate a persistent design workspace, taste model, or decision memory. Treat as an adjacent capability, not a seat-replacement platform. [Impeccable][R10]

### Cloth / Cloth Design

- **Unresolved lead (2nd attempt 2026-07-18):** A second targeted Perplexity search (query: '"Cloth" design tool AI canvas 2026') again surfaced only apparel/fashion design tools — a negative result with no citable source by nature. No positioning, pricing, capability, or weakness claim is supportable. Ask Andrew for a URL if this stays on the north-star list.

## Feature matrix

Competitor cells summarize the cited profiles above. The combined final competitor column preserves material differences among Magic Patterns (product-matched generation), v0 (code generation), and Stitch (agentic canvas + MCP).

| Workstream | Capability | Figma | Paper | Dessn | Open Design | Penpot | Magic Patterns / v0 / Stitch | Morven status |
|---|---|---|---|---|---|---|---|---|
| **W1 — creation speed** | UI generation | Figma AI, Make, Weave media; **Figma Agent (beta): 0→1 generation + remix on canvas, design-system-aware** | Agents generate/modify HTML/CSS UI | Prompt-to-prototype in production context | Agent-generated prototypes and production files | Agents can create high-fidelity artifacts | **MP:** product-matched UI; **v0:** code UI; **Stitch:** conversational UI | **absent** — creative jobs generate media, not product UI |
| W1 | Canvas editing | Mature vector canvas | HTML/CSS canvas plus vector tools | Live product is the editing surface | No traditional canvas; files + rendered output | Collaborative vector canvas | **MP:** not full canvas; **v0:** code/preview; **Stitch:** infinite canvas | **absent** — Grab is a live-page overlay, not a persistent canvas |
| W1 | Design systems / tokens | Mature systems, libraries, components | Token/style/component sync between code and canvas | Not established | DESIGN.md contract | Design systems plus open formats | **MP:** matches product context; **v0/Stitch:** no strict governance established | **parity?** — systems generate/compose + DESIGN.md token tools, but no canvas component library or bidirectional sync |
| W1 | Templates / starting points | UI kits + large community template library | Not established | Not established | Rendering-template, skill, plugin, and design-system catalog | Not established | Not established | **parity?** — D4D templates, creative presets, token-system starters; no broad UI template gallery |
| **W2 — engineering review** | Audits | Figma Agent design feedback inside files; no cross-repo audit layer | No dedicated cross-repo audit layer established | Not established | Artifact lint + self-critique gate per repo docs; no built-in org layer | Requires custom agents/plugins | **MP/v0:** not established; **Stitch:** real-time critique, not portfolio audit | **differentiated** — ~30 enumerated audit tools on Raven's side (no competitor taxonomy exists for a breadth comparison), now incl. `review_diff` (PR/diff review vs DESIGN.md tokens + recorded decisions, CI-style file/line verdict) (on main; undistributed); outcomes unbenchmarked vs competitors |
| W2 | Taste / brand review | Figma Agent: design critique incl. "from personas" (in-file, beta); no durable external taste model | Tokens/components, no dedicated taste engine | Not established | DESIGN.md brand contract | Custom-agent territory | **MP:** product matching; **v0:** prompt context; **Stitch:** critique/suggestions | **differentiated** — profiles, interviews, bindings, decisions, precedents, portraits, brand-aware audits, plus `source_text` port-fidelity diffing (on main; undistributed); no competitor equivalent established, no shared benchmark — "better" stays unclaimed |
| W2 | Automatic polish | AI suggestions and generation; systematic audit→fix loop not established | Agents handle layouts, variations, repetitive work | Not established | Agents can modify artifacts when skills direct them | Agents can write/refactor designs | **MP/v0/Stitch:** generation/refinement; no cross-repo governed polish | **parity?** — `polish_diff` proposes deterministic token-substitution patches with re-verification (propose-only; caller applies; judgment-heavy findings stay manual) (on main; undistributed); no autonomous apply loop |
| **W3 — intent self-serve** | Pull tokens, specs, decisions | Dev Mode specs, components, annotations; no decision graph established | Tokens/styles/components synchronized | Production context; structured pull not established | DESIGN.md + filesystem artifacts | Open formats, systems, inspection | **MP:** unclear; **v0:** code context; **Stitch:** design export, no decision memory | **differentiated** — design systems + DESIGN.md shipped; Decision Graph on main (add/evidence/scope/history/supersede/import — durable, queryable decision memory with provenance; no competitor equivalent established) (undistributed; per-machine store, no team sharing) |
| W3 | Design-to-code | Strong Dev Mode/MCP handoff | Design is HTML/CSS code | Changes occur against production code | Production-ready file outputs | Explicit multi-directional workflow | **MP:** not established; **v0:** core; **Stitch:** export bridge | **parity?** — Grab supplies selector/styles/tokens/intent to an agent; no full design-file compiler |
| W3 | Code-to-design | Make output copies to editable design layers; Agent↔Make round trip (beta) [R19] | Explicit code↔design shared layer | Live code is the visual surface | Agents analyze repos and generate artifacts | Explicit code-to-design | **MP:** unclear; **v0:** code preview; **Stitch:** mediated by developer-tool exports | **absent** — no canvas or design document reconstructed from code |
| W3 | MCP / agent access | Dev Mode MCP; Figma Agent consumes MCP connectors (pull + write-back, beta) | MCP-native | Not established | MCP + CLI + skills | Agent-agnostic MCP | **MP:** none established; **v0:** no generalized design MCP established; **Stitch:** MCP + SDK | **parity?** — broad MCP tool surface, but no agent-writable design canvas |
| Cross-cutting | Enterprise controls (SSO/ACL/compliance) | Org/Enterprise admin, SSO | Adverse pass reported SAML/SSO + admin controls on Paper's public pages — unverified in this dataset, fold in at next refresh | Adverse pass reported SOC 2 Type II + isolated microVMs — unverified, fold in at next refresh | Local-first; no hosted org surface | Enterprise flat tier exists; controls not enumerated in research | **v0:** adverse pass reported SAML SSO/RBAC/training opt-out — unverified | **absent** — local tier has no org governance surface; Morven team tier must meet this bar (see migration risks) |
| **Cross-cutting** | Collaboration | Mature multiplayer canvas and whiteboard | Shared design space for teams and agents | Collaborative editing in product context | Local-first; no rich shared canvas established | Collaborative teams/projects | **MP:** team collaboration offered; **v0:** paid team collaboration; **Stitch:** collaborative canvas | **absent** — no multiplayer visual workspace |
| Cross-cutting | Pricing | Seat tiers + AI credits (Full $16/$55/$90; see profile) | Free; Pro $20 | Not stated | Free OSS; BYO model cost | Free self-host; $7/editor hosted, $175 cap | **MP/Stitch:** not stated; **v0:** free or $30/user | **not comparable** — MIT/free local (93 tools on main; published npm still pre-landing), anonymous remote gates to 45; TCO (hosting, model costs, setup, support) not established vs seat pricing |

## Top gaps for license replacement

Ranked against the wedges (W2 engineering review and W3 self-serve intent lead; W1 canvas parity is the long pole, not the wedge). Re-ranked 2026-07-18 refresh — of the original list, gaps 1 (Decision Graph shipped), 2 (`review_diff`), and 4 (`decision_evidence`) were closed on `main` by the 2026-07-18 landing; gap 3 (automatic polish) closed only its propose half (`polish_diff`) and continues as #4 below; gap 5 (benchmark) continues as #3.

1. **Distribution (blocks everything above it) — the landed wedge reaches no published-package consumer.** npm still serves pre-landing v1.17.1; `manifest.json` says 51 tools until PR #35; Codex installs silently cancel tools lacking per-tool approval entries (fixed on one machine only; sync script ledgered P2); Claude Code sessions need a reconnect after upgrade (evidence for both client behaviors: it19 record in `conversations/2026-07-18-morven-loop-notes.md`). Until Andrew merges #35 and cuts a release, every "(on main; undistributed)" cell is a claim about a repo, not a product.
2. **Team-shared decision graph + team governance (W3, moat) — absent.** The Decision Graph is a per-machine store. Sharing semantics are necessary but NOT sufficient for the paying team's procurement bounce cluster: consent records, SSO/ACLs, retention controls, deletion, and audit logs are their own requirement set on top of sharing. Spec first (loop it23); build is Morven-platform-side and Andrew-gated.
3. **Comparative review-outcome benchmark (W2 credibility) — still absent.** `bench/` (27 labeled cases, self-authored) is regression infrastructure only — it contains no competitor results, shared tasks, or comparative outcome measure. Until a shared suite exists vs Figma Agent critique, Stitch critique, and Open Design lint, "differentiated" is the ceiling — and Figma Agent's beta persona-critique makes the comparison urgent rather than optional.
4. **Polish apply loop (W2) — propose-only today.** `polish_diff` emits re-verified proposals (re-verification is against the hypothetical post-image, not an applied repository state); application, build, and tests remain the caller's. A governed apply+re-audit+test loop is the remaining distance to "polish in minutes."
5. **Direct product-UI generation (W1) — absent.** Raven orchestrates creative media and systems, not prompt-to-editable application screens. Figma Agent's 0→1 beta widens this gap on the incumbent's side.
6. **Persistent visual canvas + multiplayer (W1) — absent.** Grab edits a running page; it does not replace freeform composition or shared canvas state. (Morven-platform scope per the product boundary.)
7. **Code-to-design reconstruction (W1/W3 bridge) — absent.** No maintained design document generated from an existing codebase.
8. **Figma-comments → decision capture (wedge candidate, from the commercial brief §4.2) — absent.** Converts the incumbent's un-migratable comment history into Morven's moat instead of a migration loss.

## Team-lens migration risks (owed from it17; added 2026-07-18)

Judged as the bound paying team (designers + engineers, existing Figma practice, IT/procurement in the room). Each surface is rated for what actually happens the day the team tries to leave Figma. Ratings: **blocking** = a full cancel fails here today; **mitigable** = a concrete Morven/Raven path exists or the loss is tolerable with process; **repositioned** = Morven's honest answer is complement-not-replacement on this surface.

| Migration surface | What the team loses on cancel | Rating | Notes |
|---|---|---|---|
| Interactive prototyping | Click-through prototypes for research/stakeholder review | **blocking** | No Raven/Morven equivalent; Figma Agent prototyping itself still "coming soon" [R21]. Nearest substitute is prototyping in real code, which changes who can author. |
| Comments / feedback threads | Years of in-context design discussion; no export path established in the research | **blocking (at-risk history)** | Whether history can be exported is UNRESOLVED — absence of an established path is not proof of impossibility; verify at next refresh. Going-forward capture is where Morven can compete (decision_* with evidence), but gap 8 (comments→decision extractor) is unbuilt, so today this surface is a plain loss. |
| Version history + branching | File version history, branching/merging (Org tier), designer-readable canvas history | **blocking for existing history** | Git history on Morven-side artifacts (DESIGN.md, decisions, code) covers only going-forward, non-canvas work — it preserves nothing of existing .fig versions/branches. Same reduced-Figma posture as file migration applies. |
| Permissions / admin / security | Org admin controls, SSO, file ACLs | **blocking (hosted AND local)** | The Morven team tier must answer SSO/ACL/retention at parity with Figma Org before procurement signs; overlaps gap 2's governance cluster. The local tier is NOT exempt: a per-machine decision store still raises endpoint authorization, retention/deletion, employee-departure, and auditability questions the org must answer itself. |
| File import / migration fidelity | Existing .fig libraries and files | **repositioned** | No importer exists or is planned in-scope. Honest posture: teams keep a reduced Figma footprint (downgrade, not cancel) for legacy files; the it17 brief's savings math already assumes this. |
| Plugin ecosystem | Community plugins incl. a11y/handoff tooling | **partially mitigable** | Raven has native contrast/a11y/tap-target audit tools overlapping part of the review/QA plugin category (no feature-level comparison vs Stark et al. has been performed); generative/canvas plugins fall with the canvas surface. Figma's agent-generated plugins deepen incumbent lock-in over time [R19]. |
| Library adoption analytics | Design-system usage analytics (Org tier) | **absent today (candidate wedge)** | Nothing built. `review_diff`/Talon data could produce code-side token-usage analytics later; that is a roadmap possibility, not a mitigation. Whether this drives the bound persona's bounce is unassessed. |
| Whiteboarding (FigJam) | Team ideation surface | **repositioned** | Out of Morven's positioning entirely; commodity category with many substitutes. Excluded from replacement claims. |

**Net migration read (surface-by-surface):** a full "cancel Figma today" fails on prototyping, existing history (files, versions, comments), and admin/security — for hosted and local alike. The supportable near-term posture stays the it17 brief's: seat downgrade + Morven as the intelligence layer. Comments-capture (gap 8) and code-side analytics are candidate surfaces where going-forward capture COULD offset the history loss — both unbuilt, so they carry no weight in today's migration math.

## Research sources

[R1]: https://www.figma.com/pricing/
[R2]: https://www.youtube.com/watch?v=2uTnN0YXgx8&vl=en
[R3]: https://paper.design/
[R4]: https://www.dessn.ai/
[R5]: https://open-design.ai/
[R6]: https://penpot.app/
[R7]: https://www.magicpatterns.com/
[R8]: https://v0.app/pricing
[R9]: https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/
[R10]: https://impeccable.style/
[R11]: https://www.figma.com/release-notes/
[R12]: https://www.figma.com/blog/connecting-figma-and-weave/
[R13]: https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode
[R14]: https://paper.design/pricing
[R15]: https://community.penpot.app/t/penpots-pricing-all-you-need-to-know/8131
[R16]: https://penpot.app/ai/mcp-server
[R17]: https://github.com/nexu-io/open-design
[R18]: https://tech-insider.org/google-stitch-ai-design-tool-march-2026-update/
[R19]: https://www.figma.com/blog/the-figma-agent-is-here/
[R20]: https://www.banani.co/blog/figma-pricing-and-credits
[R21]: https://help.figma.com/hc/en-us/articles/37998629035799-Work-with-the-Figma-agent-in-design-files
