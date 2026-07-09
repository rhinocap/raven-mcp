INTERNAL ONLY — do not quote, link, or paraphrase in `SPEC.md`, `CHANGELOG.md`, commit messages, PR descriptions, docs, or marketing copy. This document names a competitor and reasons about competitive distance; that framing must never leak into a public-facing artifact. Every public artifact for these four workstreams is written from scratch from Raven's own narrative (see "Framing" at the end).

# RavenMCP Parity Roadmap

## Framing

Raven is missing four capabilities that a competing design-review tool ships and Raven doesn't: a deterministic rule-based detector, an installer that reaches every AI coding tool on a machine, a live iteration loop against a running page, and a memorable vocabulary of one-word commands. Closing these gaps matters because they're genuinely useful independent of any competitor — a mechanical detector layer, single-command install across hosts, and a live scan-fix loop are all things Raven's own users would benefit from regardless of what else exists in the market.

The non-negotiable constraint: everything below must be **independently derived**, not a port. Raven's actual architecture — a stateful MCP server with per-person taste state and a cited knowledge base, versus a file-distribution product that copies skills and hooks into each tool's config directory — gives every one of the four workstreams a real, structural reason to be built differently, not just named differently. That structural difference is the design constraint for each section below, not an afterthought applied after the fact. Where a proposed feature would blur that line (an injected human-facing panel, an unenforceable naming check, files that duplicate what server state already does better), the fix is built into the plan directly, not flagged as a caveat to remember later.

Grounding: this spec is written against Raven's actual codebase (`/Users/accunliffe/projects/raven-mcp`). Relevant existing assets: a pure, browser-free rule engine (`src/page-checks.ts`) shared verbatim by `audit_page`/`audit_url`, a category scorer built on it (`src/score-page.ts`), deterministic measurement audits (`src/contrast.ts`, `src/tap-targets.ts`, `src/typography.ts`, `src/layout-orphans.ts`, `src/responsive.ts`), a hardened server-side browser runtime with egress guards (`src/browser-launch.ts`, `src/capture.ts`), the Taste Engine with per-surface bindings and URL-host auto-matching (`src/taste.ts`, `src/taste-store.ts`), and an existing `.mcpb` one-click install path plus `claude mcp add raven -- npx -y raven-mcp`.

---

## Gap 1 — Deterministic detector engine

**Codename: Talon** (Raven's mechanical edge — no LLM, no judgment, just measurement). Rule IDs `TAL-###`.

### What to build
Talon is an expansion of the rule engine Raven already ships — `page-checks.ts` is already pure, deterministic, and browser-free, and `audit_url` already runs it over rendered DOM per viewport/theme. The work is to grow it from the current corpus into a comprehensive computed-style/geometry detector layer, exposed as:

- `talon_scan` (MCP tool): takes HTML, a rendered-DOM capture, or a URL (reusing the existing capture pipeline), returns machine findings with element anchors, measured values, and the rule's provenance.
- `talon_rules` (MCP tool): enumerates the rule corpus with citations, so any client can display "why."
- Rule families, derived from Raven's own knowledge layers rather than a curated external list: color-system discipline (palette-size limits from the existing `color-systems` principle data), spacing-grid conformance (from `spacing-systems`), type-scale and rhythm (from typography principles), contrast (already built), geometry/overflow/orphan checks (already built, extend), motion-duration/easing sanity via computed animation properties, and heading/landmark structure (extend the existing checks).

**Output contract — mandatory, not descriptive:** every finding `talon_scan` returns MUST carry a `source` field pointing at a knowledge-layer entry ID. This is a hard schema requirement, not prose in a spec — the internal "we derived this from a cited principle" story is invisible to anyone diffing finding text unless the citation ships in the payload itself. Do not read or port any external rule set or its thresholds; derive every threshold from the principle data Raven already has (e.g. base-unit grid from spacing-systems) and cite it.

**Blocklist:** the word "slop" (and close synonyms used as a branded value proposition) is banned from all Talon-facing copy — tool descriptions, docs, marketing, changelog — even used descriptively. It reads as a private contrast term in an internal spec; it reads as a lifted tagline in a tool description.

### Why architecturally different
1. **Cited provenance as a schema field**, not just an authoring discipline — see above.
2. **Taste-parameterized thresholds.** Talon consults the caller's surface binding (from `bind_taste_surface`): a monochrome portfolio legitimately violates palette-diversity rules; a brutalist surface legitimately violates softness rules. Findings that a binding waives are returned as `waived_by_taste`, not suppressed. This requires per-person state a stateless file-based detector cannot have — it's the strongest "not a copy" proof in the whole roadmap, and the headline argument for this workstream, not a footnote.
3. **Server-side, MCP-native.** No CLI-first, no devtools-extension-first. `talon_scan` is a tool call available in every MCP host at once. A thin `npx raven-mcp talon <url|file>` CLI wrapper for CI is a fine P2 convenience; the engine's home is the server.
4. **Feedback loop.** `label_finding` (already exists) lets a person mark a Talon finding as wrong-for-me; that flows into the Taste Engine as a recorded decision. Talon gets personally quieter over time.

**Effort:** Medium (3–5 weeks). Mostly rule authorship + tests; the engine, capture, and scoring scaffolding exist. **Risk:** Low technically. Main risk is threshold quality — mitigated by deriving every threshold from a citable principle and shipping each rule with a fixture test.

---

## Gap 2 — Multi-harness installer

**Codename: Roost** — `npx raven-mcp roost`. A raven settles into every nest on the machine.

### What to build
A single interactive command that detects which MCP-capable hosts are installed (Claude Code, Claude Desktop, Cursor, Codex CLI, Gemini CLI, Windsurf, Zed, VS Code/Copilot, OpenCode, etc.), shows what it found, and writes/updates the **one MCP registration** each host needs — plus `raven-mcp roost --check` as a doctor mode (is Raven registered, reachable, which version, is a taste profile present). Include team mode: emit a repo-committed `.mcp.json` entry for shared projects.

**Export format — pinned now, not left open:** `roost --export` writes `.raven/taste-export.json` — a structured JSON snapshot of the caller's taste binding, for diffing or backup only. This file is explicitly never intended to be read or hand-edited as project design context; that sentence goes in the file's own header comment and in the command's help text. Pinning this now closes the obvious path of least resistance an implementer under time pressure would otherwise take (a markdown file describing the project — exactly the shape rejected in Gap 4).

### Why architecturally different
A file-distribution product's installer must copy skill files and hook scripts into a dozen-plus tool-specific directories because its product *is* files — every tool gets a duplicated payload that can drift. Raven's product is a server: installation is **N pointers to one endpoint**, not N copies of content. Roost therefore:
- writes only host config (each host's MCP registration format), never behavioral content into the host;
- means every host is always on the same version with the same taste state — there is no propagation problem to solve;
- keeps the existing `.mcpb` double-click path for Claude Desktop and the plugin-marketplace path as additional front doors, not the mechanism.

Explicitly do **not** build skill-file adapters for non-MCP tools. Exporting static skill files to chase a larger "harnesses supported" count would abandon the Taste Engine and knowledge layers (which require the live server) and would be imitation for its own sake. Raven's honest coverage claim is "one registration, every MCP host" — that's a different and, for MCP hosts, complete claim, not a partial answer to a "12+ harnesses" framing.

**Effort:** Small–Medium (2–3 weeks; the long tail is host config formats + tests). **Risk:** Low. Config formats change; keep host adapters data-driven and covered by fixture tests.

---

## Gap 3 — Live browser iteration

**Codename: Perch** — Raven perched on your running page.

### What to build
A persistent, server-managed live session over the existing hardened browser runtime (`browser-launch.ts` already handles pooling and egress guarding):

- `perch_open` (url, project) → session id; browser stays warm across tool calls.
- `perch_scan` → runs Talon + relevant audits against the *current* live DOM state (post-interaction, post-scroll), returning findings with element anchors, plus a **one-shot `annotated_screenshot` field** — a static image with outlines and finding badges baked in, returned once per scan call, the same pattern every other Raven audit tool already uses for screenshots.
- `perch_diff` → before/after re-scan of the same session, reusing the existing `image-diff.ts` / `fix_confirmed` machinery, so the agent loop is: edit code → HMR → `perch_scan` → confirm fix mechanically.

For pages running in the user's own Chrome (auth walls, local dev with cookies), support attaching to a user-provided CDP endpoint rather than shipping a browser extension.

**Deliberately cut from v1:** a persistent, toggleable, injected in-page overlay pair (open/clear a live annotation layer a human directly manipulates in the page). A human-visible, in-page, outlined-and-badged live view of a page's rule violations is functionally the same interaction shape as a published devtools panel regardless of whether it's delivered via a shipped extension or injected via CDP — the transport differs, the user-visible artifact doesn't. Folding the visible output into `perch_scan`'s one-shot return preserves "the human sees what Raven sees" without a live, persistent, human-manipulated panel, which is the actual line between an agent session with a verification artifact and a devtools tool. If a genuinely live/toggleable overlay is wanted later, build it as a thin client of the server session at that point — not inside Perch v1.

### Why architecturally different
The live iteration loop runs through MCP tool calls, agent-driven, not human-driven: person or agent calls `perch_scan`, gets findings plus a rendered artifact, calls `perch_diff` after a fix, moves on. Every scan is taste-parameterized via the session's project binding. Session state (findings history, diffs, the warm browser) lives server-side, which a client-side extension architecture cannot offer. Different consumer (the agent loop, not a human's devtools panel), different transport (MCP session vs. extension messaging), different memory model (server session vs. none) — and, per the cut above, a different UI shape too, not just a different delivery mechanism for the same one.

**Deliberately not chase:** a published browser-extension-store devtools panel. That is a different product's product shape (human-in-devtools, offline, no account) and its distribution channel; matching it forfeits everything server-side that makes Raven's approach worth building. Revisit only if Perch proves demand for a human-facing viewer, and then build it as a thin client of the server session.

**Effort:** Medium–Large (4–6 weeks; session lifecycle + one-shot annotated capture + diff integration — no overlay injection/removal state machine to build or maintain). **Risk:** Medium — session lifetime management in the remote/hosted runtime (`remote-runtime.ts` constraints), and CDP-attach security needs the same guard treatment as `remote-url-guard.ts`.

---

## Gap 4 — Shared command vocabulary

**Codename: Calls** — a raven's vocabulary of calls. Delivered as **MCP Prompts**, not files.

### What to build
Register a set of server-published prompts via the MCP prompts primitive. In Claude Code they surface automatically as slash commands (`/raven:...`); in any other MCP host they appear through that host's prompt UI — one implementation, every harness, zero install payload. Each Call is not static text: the server assembles it at request time from (a) the caller's taste profile and surface binding, (b) the relevant knowledge-layer entries, (c) which Raven tools to run and in what order.

A starter vocabulary of ~10, named from Raven's own register (final naming is Andrew's; the constraint below is the enforcement mechanism, not the words):
- `preen` — full grooming pass: Talon scan + taste audit + fix loop.
- `appraise` — structured critique against the person's own taste portrait, findings ranked by their recorded priorities.
- `temper` / `kindle` — pull a design quieter / push it more expressive, relative to the surface binding's calibrated position.
- `cadence` — type + rhythm pass (typography audit + type-scale principles).
- `plumage` — color-system pass (palette discipline, contrast, brand system).
- `fledge` — first-run/onboarding experience pass built on the service-design layer.
- `waymark` — navigation/IA pass.
- `truesight` — mechanical-only Talon report, no LLM judgment.
- `perch` — open a live session (bridges to Gap 3).

**Naming-clearance process — clean-room, not self-verification:** a "check the name list before shipping" step is not executable if implementers are also instructed never to look at what they'd be checking against. The actual process:
1. One designated reviewer (Andrew, or an agent instance not touching Talon/Calls implementation) looks at the relevant competitor's public verb/command list exactly once and produces a **blocklist**: forbidden words and near-synonyms only — not a description of what they do, not their file structure, nothing else.
2. That blocklist — not the source it came from — is handed to implementers, who otherwise stay fully firewalled from that competitor's product throughout.
3. The blocklist covers more than the ~10-item verb list: any distinctively-branded page, section, or score name the competitor uses gets the same treatment (the "slop" ban in Gap 1 is one instance of this, not the only one).
4. Re-run the review any time the competitor's public surface changes — a recurring pre-release gate, not a one-time check.

### Why architecturally different
A file-distribution product's vocabulary is a set of markdown skill files copied per-tool, plus repo-committed context files describing the project. Raven's Calls are **server-generated, taste-parameterized prompt templates** — the same call produces different instructions for different people and different surfaces, and updating a Call updates it everywhere instantly. That's a capability difference, not a rename.

**Deliberately not chase: repo-committed context files.** Raven already solved the problem project-context files solve — durable per-project design context — with surface bindings (`bind_taste_surface` + kickoff interview), which are richer (per-dimension calibration, voice register, URL-host matching) and portable across every repo and host because they live server-side. Adding Raven-branded context files would be strictly worse architecture adopted only for resemblance. The one file worth having is the `roost --export` snapshot pinned in Gap 2 — an export of server state for diffing/backup, explicitly not a human-edited source of truth.

**Effort:** Small (1–2 weeks for the prompts plumbing + first 6 calls; ongoing authorship). **Risk:** Low technically; the clean-room naming process above is the control that keeps naming risk low without requiring an unenforceable self-check.

---

## Cross-cutting: document and public-artifact framing

The single largest residual risk isn't in any workstream — it's how this work is talked about outside this document. This spec itself names a competitor and reasons about relative distance from it; that's appropriate for an internal planning document and inappropriate anywhere else. Concretely:

- This document (and any direct descendant of it) is internal only — never quoted, linked, or paraphrased in `SPEC.md`, `CHANGELOG.md`, commit messages, PR descriptions, docs, or marketing copy. If a per-workstream `SPEC.md` is written from this roadmap, it is written from scratch in Raven's own product narrative — "extending the Taste Engine," "deepening the server model," "one endpoint, every host" — with zero reference to a competitor, a gap number, or "parity" language of any kind.
- Independence guardrails for whoever implements this: never open a competing product's repo or site during implementation, except the single designated clean-room reviewer in Gap 4, and only for the narrow blocklist task described there; derive all Talon thresholds from Raven's own `src/data/principles` entries with citations in each rule (enforced as a schema field, per Gap 1); apply the terminology blocklist from Gap 1 and Gap 4 to all shipped copy; document each workstream's design rationale in terms of Raven's own server architecture, not in terms of what it's closing distance to.

---

## Phased punch list — P1/P2/P3, all four workstreams, ordered by leverage

**P1 — highest leverage, lowest risk, ship first**
1. **DONE** — Talon engine + rule corpus, with the `source` citation field enforced in the schema from the first shipped rule (Gap 1). Shipped: 15 rules, `talon_scan`/`talon_rules` MCP tools, cited `source` field verified populated on live findings.
2. Talon terminology blocklist applied to all copy before any public description is written (Gap 1).
3. **DONE** — Calls / MCP Prompts plumbing + first ~6 calls (Gap 4) — cheapest visible product-shaped win, makes Raven feel complete in every host immediately. Shipped 5 prompts: `preen`, `appraise`, `cadence`, `plumage`, `truesight` — no naming-clearance issues since these 5 were already vetted in the original roadmap review above.
4. Calls clean-room naming pass: one designated reviewer produces the blocklist once, before any Call ships publicly (Gap 4).

**P2 — ship once P1 gives them something to distribute/build on**
5. Roost installer + `--check` doctor mode (Gap 2) — distribution multiplier, more valuable once Talon and Calls exist to distribute.
6. Roost `--export` to the pinned `.raven/taste-export.json` format, with its non-human-edited-context disclaimer in place from the first release (Gap 2).
7. Thin `npx raven-mcp talon` CLI wrapper for CI use (Gap 1, deferred convenience — not the engine's home).

**P3 — largest build, depends on P1/P2 groundwork**
8. Perch session lifecycle (`perch_open`/`perch_scan`/`perch_diff`) with the one-shot `annotated_screenshot` field from day one — no overlay-injection state machine to build (Gap 3).
9. CDP-attach support for user-owned Chrome sessions, with the same guard treatment as the existing remote-URL guard (Gap 3).

**Not building — explicit, with reasons carried forward from each section above**
- A published browser-extension-store devtools panel, and any persistent human-manipulated in-page overlay that reproduces its interaction shape (Gap 3) — different product's distribution moat; revisit only as a thin client of the Perch session if real demand emerges.
- Skill-file adapters for non-MCP tools (Gap 2) — abandons server state for a bigger harness-count number; "one registration, every MCP host" is the honest and sufficient claim.
- Repo-committed project-context files as a source of truth (Gap 4) — surface bindings already solve this problem better and server-side; the only file that exists is the pinned, explicitly-not-context `--export` snapshot.
- Any self-verification naming check that requires implementers to consult a competitor's product while also being told not to (Gap 4) — replaced by the clean-room blocklist process.
