# Morven competitor matrix

**Date:** 2026-07-17  
**Purpose:** Raven → Morven license-replacement tracking. This compares current Raven MCP v1.17.1 capability with design tools covered by the supplied mid-2026 research.  
**Refresh rule:** Treat this matrix as stale after two weeks; refresh on or before 2026-07-31.

## Reading the matrix

- Competitor claims come only from the supplied research and its cited sources. “Not established” means the research did not support a claim.
- Morven status is judged against Raven MCP v1.17.1 as registered on `main` (78 tools): audit/review tools; Taste Engine; design-system generation/composition; brand, content, and service-design knowledge; creative scoring and generation jobs; Raven Grab; DESIGN.md tools; templates; and Talon rules. ~~The Decision Graph (`decision_*`) and `gap_scan` are NOT in the shipped surface~~ **Baseline update 2026-07-18: PRs #22–#34 merged to main (fa0671e); the shipped stdio surface is now 93 tools including the Decision Graph (`decision_*` ×11, `decision_import`), `review_diff`, `polish_diff`, and `audit_taste` `source_text`. Matrix cells were scored against the 78-tool baseline and have NOT been re-scored — treat any cell touching decision memory or W2 review as conservative (understated) until the ≤2026-07-31 refresh.**
- Status terms: **absent** = no current equivalent; **parity** = usable current coverage; **differentiated** = Raven's coverage is broader/distinct in kind, but no shared benchmark proves better outcomes; **N-A / not comparable** = no sound basis for comparison; **parity?** marks incomplete or indirect coverage. (Adverse review 2026-07-18 removed all unbenchmarked "better" claims.)

## Tool profiles

### Figma

- **Positioning:** Mature collaborative vector canvas with prototyping, component libraries, design systems, FigJam, Dev Mode, Figma AI, Make, Sites, and Weave media tasks. [Figma releases][R11] [Weave integration][R12] [Dev Mode][R13]
- **Pricing:** Free starter tier; Professional, Organization, and Enterprise paid seat tiers (per-editor pricing on the cited page) including 3,000, 3,500, and 4,250 monthly AI credits respectively. [Figma pricing][R1]
- **Learning curve:** Moderate for experienced designers; frames, auto layout, and variants remain nontrivial for non-designers. Dev Mode narrows the interface for engineers. [Dev Mode][R13]
- **AI / agent / MCP:** AI generation and web search; Dev Mode MCP sends component, spec, and intent context to agents for design-to-code. Code-backed screens are mentioned but code-to-design detail is limited. [Figma MCP research source][R2] [Figma releases][R11]
- **Weaknesses:** Closed, canvas-first ecosystem; metered AI usage; no evidence in the research of a cross-repo audit layer or durable taste model outside Figma. [Figma pricing][R1] [Figma MCP research source][R2]

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
- **Pricing:** Free includes $5 monthly credits. Popular is $30/user/month with $30 monthly credits and $2 daily login credits. [v0 pricing][R8]
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

- **Positioning:** Agent vocabulary and command layer for directing design work in production, not an identified Figma-like canvas or plugin. [Impeccable][R10]
- **Pricing / learning curve / MCP:** Not established beyond its role as an agent-language adjunct. [Impeccable][R10]
- **Weaknesses:** Does not appear to store or manipulate a persistent design workspace. Treat as an adjacent capability, not a seat-replacement platform. [Impeccable][R10]

### Cloth / Cloth Design

- **Unresolved lead:** The supplied research could not identify a recognized design review, polish, canvas, or MCP product under this name. No positioning, pricing, capability, or weakness claim is supportable from the dataset.

## Feature matrix

Competitor cells summarize the cited profiles above. The combined final competitor column preserves material differences among Magic Patterns (product-matched generation), v0 (code generation), and Stitch (agentic canvas + MCP).

| Workstream | Capability | Figma | Paper | Dessn | Open Design | Penpot | Magic Patterns / v0 / Stitch | Morven status |
|---|---|---|---|---|---|---|---|---|
| **W1 — creation speed** | UI generation | Figma AI, Make; generative media via Weave | Agents generate/modify HTML/CSS UI | Prompt-to-prototype in production context | Agent-generated prototypes and production files | Agents can create high-fidelity artifacts | **MP:** product-matched UI; **v0:** code UI; **Stitch:** conversational UI | **absent** — creative jobs generate media, not product UI |
| W1 | Canvas editing | Mature vector canvas | HTML/CSS canvas plus vector tools | Live product is the editing surface | No traditional canvas; files + rendered output | Collaborative vector canvas | **MP:** not full canvas; **v0:** code/preview; **Stitch:** infinite canvas | **absent** — Grab is a live-page overlay, not a persistent canvas |
| W1 | Design systems / tokens | Mature systems, libraries, components | Token/style/component sync between code and canvas | Not established | DESIGN.md contract | Design systems plus open formats | **MP:** matches product context; **v0/Stitch:** no strict governance established | **parity?** — systems generate/compose + DESIGN.md token tools, but no canvas component library or bidirectional sync |
| W1 | Templates / starting points | UI kits + large community template library | Not established | Not established | Rendering-template, skill, plugin, and design-system catalog | Not established | Not established | **parity?** — D4D templates, creative presets, token-system starters; no broad UI template gallery |
| **W2 — engineering review** | Audits | Local Figma assistance; no cross-tool audit layer established | No dedicated cross-repo audit layer established | Not established | Possible through skills; no built-in org layer | Requires custom agents/plugins | **MP/v0:** not established; **Stitch:** real-time critique, not portfolio audit | **differentiated** — 28 registered audit/review tools, broadest enumerated coverage; outcomes unbenchmarked vs competitors |
| W2 | Taste / brand review | Preferences and component rules; no durable external taste model | Tokens/components, no dedicated taste engine | Not established | DESIGN.md brand contract | Custom-agent territory | **MP:** product matching; **v0:** prompt context; **Stitch:** critique/suggestions | **differentiated** — profiles, interviews, bindings, decisions, precedents, portraits, brand-aware audits; no competitor equivalent established, no shared benchmark |
| W2 | Automatic polish | AI suggestions and generation; systematic audit→fix loop not established | Agents handle layouts, variations, repetitive work | Not established | Agents can modify artifacts when skills direct them | Agents can write/refactor designs | **MP/v0/Stitch:** generation/refinement; no cross-repo governed polish | **absent** — findings and fix guidance exist, but no autonomous code-write polish loop |
| **W3 — intent self-serve** | Pull tokens, specs, decisions | Dev Mode specs, components, annotations; no decision graph established | Tokens/styles/components synchronized | Production context; structured pull not established | DESIGN.md + filesystem artifacts | Open formats, systems, inspection | **MP:** unclear; **v0:** code context; **Stitch:** design export, no decision memory | **parity?** — design systems + DESIGN.md shipped; Decision Graph + `gap_scan` built but on unmerged branches, not in v1.17.1 |
| W3 | Design-to-code | Strong Dev Mode/MCP handoff | Design is HTML/CSS code | Changes occur against production code | Production-ready file outputs | Explicit multi-directional workflow | **MP:** not established; **v0:** core; **Stitch:** export bridge | **parity?** — Grab supplies selector/styles/tokens/intent to an agent; no full design-file compiler |
| W3 | Code-to-design | Early code-backed-screen support; detail limited | Explicit code↔design shared layer | Live code is the visual surface | Agents analyze repos and generate artifacts | Explicit code-to-design | **MP:** unclear; **v0:** code preview; **Stitch:** mediated by developer-tool exports | **absent** — no canvas or design document reconstructed from code |
| W3 | MCP / agent access | Dev Mode MCP | MCP-native | Not established | MCP + CLI + skills | Agent-agnostic MCP | **MP:** none established; **v0:** no generalized design MCP established; **Stitch:** MCP + SDK | **parity?** — broad MCP tool surface, but no agent-writable design canvas |
| **Cross-cutting** | Collaboration | Mature multiplayer canvas and whiteboard | Shared design space for teams and agents | Collaborative editing in product context | Local-first; no rich shared canvas established | Collaborative teams/projects | **MP:** team collaboration offered; **v0:** paid team collaboration; **Stitch:** collaborative canvas | **absent** — no multiplayer visual workspace |
| Cross-cutting | Pricing | Seat tiers + AI credits; base seat prices not in research | Free; Pro $20 | Not stated | Free OSS; BYO model cost | Free self-host; $7/editor hosted, $175 cap | **MP/Stitch:** not stated; **v0:** free or $30/user | **not comparable** — MIT/free local (78 tools), anonymous remote gates to 45; TCO (hosting, model costs, setup, support) not established vs seat pricing |

## Top gaps for license replacement

Ranked against the wedges (W2 engineering review and W3 self-serve intent lead; W1 canvas parity is the long pole, not the wedge). Reordered 2026-07-18 after adverse review.

1. **Ship the Decision Graph (W3, moat) — built but unmerged.** `decision_*` + `gap_scan` exist on `f23-templates-layers` / `wip/designer-journey-audit-fixes` but are not in v1.17.1. The matrix's core W3 claim is unshippable until this merges. Cheapest cell to move.
2. **Repo/PR design-review workflow (W2) — absent.** No tool ingests an actual diff/PR, connects it to design intent, preserves findings + dispositions, and returns a CI-quality verdict. This is the "designers evaluate engineers' work in minutes" wedge, and no competitor has it either.
3. **Audit-driven automatic polish (W2) — absent.** Audits return findings and fix guidance but never safely apply + verify code changes as one workflow.
4. **Evidence attachment / provenance on decisions (W3) — absent.** Decisions need sources, currency, ownership, and stale-intent detection to be trusted by engineers pulling them.
5. **Review-outcome benchmark (W2 credibility) — absent.** "Differentiated" can only become "better" with a shared task suite / accuracy measure vs Figma review assistant, Stitch critique, and Open Design lint. Without it every comparative claim overreaches.
6. **Direct product-UI generation (W1) — absent.** Raven orchestrates creative media and systems, not prompt-to-editable application screens.
7. **Persistent visual canvas + multiplayer (W1) — absent.** Grab edits a running page; it does not replace freeform composition or shared canvas state.
8. **Code-to-design reconstruction (W1/W3 bridge) — absent.** No maintained design document generated from an existing codebase.

**Full-replacement risks the matrix does not yet model (needed before any "cancel Figma" claim):** interactive prototyping, comments/feedback threads, version history + branching/merging, permissions/admin/security, file import/migration fidelity, plugin ecosystem, library adoption analytics, whiteboarding. A team-lens migration-risk section is owed in the next matrix refresh.

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
