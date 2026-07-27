# Feasibility spec — three Raven features (2026-07-10)

> **Status 2026-07-19.** Feature 3's ladder is past its first two rungs: rung 1
> (shift-multi-select) shipped 2026-07-10 as noted inline, and rung 2 (the layers
> tree) now ships in the Structure panel. Rung 3 stays where this document left
> it — unnecessary, not deferred. Feature 2 (templates) has UI in the Structure
> panel; the DESIGN.md `templates:` persistence described below is NOT built, so
> the durability caveats here are still the live constraints, not a forecast.
> The three authorization/source-mapping blockers under Feature 3 are unchanged
> and remain the reason nothing writes source. Feature 1 is untouched.

Scope: feasibility only, no implementation. Grounded in the live repo (grab overlay, DESIGN.md machinery, P4 OAuth infra on `origin/p4-remote-taste`) plus prior-art research (VisBug, Builder.io, Plasmic, Webflow, react-grab, Figma library analytics, style-dictionary, react-scanner/omlet). Each feature was spec'd by an independent agent and then adversarially reviewed; the verdicts below are the post-objection verdicts, not the authors' first drafts.

Decisions already made (Andrew, 2026-07-10 interview):
- **F1** project-side source of truth is **configurable at setup** — DESIGN.md/tokens, live codebase scan, or Figma library, chosen when a team first adopts Raven.
- **F2/F3** live in the **grab overlay** (injected on the page, like the grab pill).
- **F3 permissions**: spec both hosted-OAuth and local-config models, recommend one.
- **Fixed vs flexible** is **designer-marked in the panel** (not inferred).

---

## Summary verdicts

| # | Feature | Verdict | Honest MVP | The hard part |
|---|---------|---------|-----------|---------------|
| 1 | Design-system gap diff | **Feasible as a local-first DESIGN.md experiment** (after a parser/schema migration); hosted + codebase/Figma adapters need architecture discovery first | Local DESIGN.md adapter + canonical state taxonomy + audit-style gap report vs a Raven baseline | Bundled systems are token-only (no component/state inventories); two of three adapters are local-only as drawn; DESIGN.md's parser can't represent the component schema today |
| 2 | Page templates, fixed/flexible slots | **Feasible-with-caveats** — manifest-only interpretation | Template tab in overlay; annotations persist to DESIGN.md, applied by agent via `update_design_md` | Selector stability across rebuilds; annotations never live in page source |
| 3 | Layers panel with permission-gated reorder | **Partially feasible** — layers list + clone-measured wireframe preview + intent queue now; source persistence and enforced permissions need separate spikes | Shift-multi-select in grab (S) → layers list with reorder-as-intent + off-screen-clone wireframe preview (M) | DOM→source identity, AST mutation substrate (none exists in the repo), and real (server-side) authorization |

---

## Feature 1 — Design-system gap diff

**Verdict (post-adversarial-review): feasible as a local-first, DESIGN.md-based experiment after a component-schema/parser migration.** Hosted codebase/Figma ingestion feasibility is **not yet established** — before committing to the three-adapter product, Raven must resolve client-vs-server ingestion, tenant-aware persistence, multi-source evidence merging, scanner safety limits, and a measured Figma interchange contract. The diff loop itself is easy; the reference side is a real blocker — Raven's 12 bundled systems are **token libraries only** (`get_design_system` returns token groups; `src/data/tokens/registry.json` carries no component manifest). Token-gap comparison is high-feasibility now.

### Architecture
- **One authoritative source per project, chosen at setup** (per decision): `design-file` (DESIGN.md / DTCG tokens), `codebase` (root + framework scanners), or `figma-library`. Each adapter implements `inspect(source) → DesignSystemInventory` — a versioned, normalized shape with `tokens`, `components` (anatomy, variants, states), per-item **evidence + confidence** (`declared` / `static-code` / `rendered-css` / `figma-variant` / `inferred`), and diagnostics. Persisted in project config (`configure_design_system_source`), not re-supplied per audit.
- **DESIGN.md adapter:** `src/designmd.ts` already parses nested frontmatter and has a `components:` namespace — but with no typed semantics today. Add a versioned component schema (aliases, variants, states). A token-only file yields component coverage `unknown`, never "missing."
- **Codebase adapter:** pluggable framework scanners (React/TSX + Storybook first; CSS pseudo-class rules; Vue/Svelte later; SwiftUI/Compose eventually). Separates declared components / observed usage / declared states / rendered evidence. The grab overlay already extracts winning `hover/focus/active/disabled` declarations (`browser/raven-grab.js:706,792`) — a real rendered-state primitive — but `stateStyles` crosses the bridge as `z.any()` and must be typed first (`src/grab-bridge.ts:14,38`).
- **Figma adapter:** current Figma export is one-way, variables-only (`src/index.ts:3799`) — no components/variants come in today. And one MCP server can't call another: the **client/agent orchestrates** — it calls the Figma MCP, hands Raven a normalized library snapshot, Raven validates/caches/diffs. Direct Figma credentials in Raven is a separate integration, not assumed.
- **Reference layer (new):** `src/data/design-systems/` — `taxonomy.json` (interaction/async/validation/selection/content/disclosure state classes **with applicability rules** — requiring `hover` everywhere false-positives on touch-only patterns), `aliases.json` (Dialog/Modal/Sheet), and per-system `*.components.json` manifests with requirement levels (`core/recommended/optional`), required states, provenance and review dates. Until branded manifests exist, the MVP diffs against a clearly-labeled **Raven canonical baseline**, never implying it "is" Material or Linear.

### Diff algorithm & output
Staged: validate → canonicalize → match (exact ID → explicit aliases → project aliases → structural similarity as *suggestion only*, never auto-accepted) → compare anatomy/variants/applicable states/token bindings → classify (`missing_component/state/variant/anatomy`, `token_mismatch`, `ambiguous_match`, `unverifiable`, `project_only` = informational). Output follows `audit_page`'s score/grade/passes/errors/warnings/fix_priority shape (`src/index.ts:2704,2771`) with **separate coverage dimensions** (components / states / variants / token fidelity / evidence confidence) — no single opaque score; accessibility-critical missing states (e.g. `focus-visible`) should cap the grade regardless of aggregate coverage.

### MCP tool surface
`configure_design_system_source`, `inventory_design_system` (accepts a `figma_snapshot` from the client), `diff_design_system` (the audit), `list_design_system_components` (inspect a reference manifest — new tool rather than changing `get_design_system`'s token-oriented contract), `explain_design_system_gap` (one finding, with provenance — CI-review use).

### Effort (S → M → L sequence; L overall)
| Phase | Size | Deliverable |
|---|---|---|
| 0 Schema foundation | S | Inventory + taxonomy + evidence model + one Raven baseline manifest |
| 1 MVP | M | DESIGN.md adapter, source config, baseline diff, audit-style report |
| 2 Bundled references | M–L | Curated manifests for 2–3 systems, provenance, alias/applicability tables |
| 3 Codebase adapter | M per framework family | React/TSX + Storybook first, optional grab rendered evidence |
| 4 Figma adapter | M | Interchange schema + component-set/variant ingestion |
| 5 Full product | L | More frameworks, CI mode, caching, change-over-time, suppressions |

The dominant cost is **editorial**: curating and maintaining trustworthy reference manifests, not the diff engine.

### Adversarial-review findings folded in (six survived fact-checking)
1. **Verdict-changer — `design-file`/`codebase` sources don't work on hosted Raven as drawn.** DESIGN.md reads use `resolve(path)` + `readFileSync` in the Raven process (`src/designmd.ts:157`); on hosted that resolves inside the Vercel function, and Raven deliberately excludes all caller-path tools from the remote surface (`src/index.ts:1617,1635`) to avoid a server-file oracle. Two of the three adapters are **local-only** under the path-based contract. Fix: split `LocalDesignSystemSource` from `UploadedDesignSystemSource` — hosted tools accept bounded snapshot content, never client paths.
2. **Verdict-changer — the proposed component YAML can't be parsed today.** DESIGN.md uses a custom parser (no YAML dependency): `aliases: [Button, PrimaryButton]` parses as the literal string `"[Button, PrimaryButton]"`, and `flattenDesignTokens` turns component fields into bogus token records (`--component-button-aliases`). Phase 0 is a parser/data-model migration (typed metadata vs tokens vs component manifests, round-trip preservation, malformed-input rejection) — bigger than S.
3. **"Exactly one source" contradicts the evidence model.** With mutually exclusive adapters, a DESIGN.md declaration can never be corroborated by code reachability or grab runtime evidence, so confidence can't be computed honestly. Fix: `{ primary: source, evidenceSources?: [...] }` with deterministic merge/conflict rules and per-field provenance.
4. **Project persistence is load-bearing, not an "open product decision."** The only store abstraction is taste-specific (`src/taste-store.ts`, subject-keyed Redis). A bare `project` string is ambiguous (local dir? tenant record?), and `explain_design_system_gap`'s `finding_id` has no stored report or deterministic ID scheme behind it. Decide local-vs-hosted scope before freezing APIs; hosted MVP estimate is unfixable as stated.
5. **The codebase scanner omits its security/resource boundary** — symlinks, permitted roots, secret exclusion, size/time budgets, monorepo boundaries, whether source content is retained. No React/Vue/Storybook parsing stack exists in dependencies. Repository-snapshot ingestion is its own foundation phase.
6. **Figma phase sized before its interchange contract exists.** `FigmaLibrarySnapshot` has no demonstrated producer; pagination, published-library semantics, alias resolution, payload limits are all unmeasured. Phase 4 is **unknown (likely M–L)** until a spike captures a real fixture that round-trips Raven validation.

### Risks & open questions
- Reference authority/licensing: official vs Raven-curated manifests must be labeled; record source URLs + review dates.
- "Missing" has four meanings — missing / intentionally excluded / adapter-can't-see-it / not-observed — and the report must distinguish them; a static CSS rule proves a state was *authored*, not that it's reachable.
- `pressed`/`active`/`selected` and Figma `State=Hover` vs semantic variants can't be naively collapsed.
- Where does project config persist (`.raven/project.json` vs DESIGN.md metadata)? Platform context (web/iOS/Android) needed for state applicability. Suppression model (owner/reason/expiry) for mature teams. Codebase/Figma snapshots contain proprietary names — remote deployments need retention/redaction rules.

---

## Feature 2 — Full-page templates with fixed/flexible elements (grab overlay panel)

**Verdict: feasible-with-caveats.** Grab already has the overlay UI, DOM inspection, and bridge round-trip; the missing pieces are annotation persistence and (deliberately avoided) source mapping.

### Architecture
- **Annotation storage:** extend DESIGN.md via `src/designmd.ts` (`parseDesignMd` / `update_design_md`) with a `templates:` block: `templates.<templateId>.slots.<slotId> = { role: fixed|flexible, selector, allowedTokens? }`. `data-raven-slot` / `data-raven-fixed` attributes exist only as *live-page markers*, mirrored into DESIGN.md on save.
- **Overlay UI:** a new "Template" tab in `browser/raven-grab.js` (`renderPanel()` / `switchTab()`), toggle fixed/flexible per selected element, slot list per page, identity via `stableSelector()`.
- **Bridge:** new `POST /template` route in `handleGrabRequest` (`src/grab-bridge.ts`), mirroring `/grab`'s Zod-validated queue pattern.
- **MCP tools:** `get_page_template`, `set_template_slot`, `list_templates` — mutations run through `update_design_md` internals (agent-mediated), never direct AST rewriting.

### Why this sidesteps DOM→source (and where it honestly doesn't)
The "component" being edited is the DESIGN.md manifest entry, not the page's JSX/HTML — the registered-schema pattern from Builder.io/Plasmic prior art. **Explicit limitation the panel must state to users:** annotations persist only in DESIGN.md, never in page markup; on reload the live `data-raven-*` markers vanish and slot re-identification depends entirely on `stableSelector()` resolving. Template state is *not* durable against markup reshuffles.

### Adversarial-review findings folded in (all accepted)
1. **MVP must include selector revalidation** — `get_page_template` re-resolves every slot selector and flags orphans; without it templates silently rot. This pushes MVP from ~1–2 days to **3–4 days**.
2. **`allowedTokens` is advisory-only in local mode** — anyone can edit DESIGN.md or POST to the bridge directly; label it as intent, not enforcement (same framing the OAuth docs already use).
3. **New bridge endpoints must be registered in the capability-keyed route set** or proxy mode silently forwards them upstream (documented landmine).
4. **New panel must use `capturePanelDrafts()`** — full innerHTML rerenders wipe form state otherwise (documented gotcha).
5. **Schema must be page-scoped now, not later**: `templates.<templateId>.pages.<path>.slots.<slotId>` — the flat single-`slots` shape can't support multi-page templates and would have to be broken later.
6. **Concurrent-mutation risk:** N slot toggles = N separate `update_design_md` file writes with no atomicity; batch slot writes per save, flag concurrent-editor corruption as a known limitation.
7. Extending grab's outgoing payload touches five documented points: `payloadForSend()`, `GrabPayloadSchema`, `GrabBridgeSelection`, `queueGrabSelection()`, and the literal-string instrumentation in `test/grab-bridge.test.mjs`.

### Effort
- **MVP (S, ~3–4 days):** Template tab, fixed/flexible toggle, page-scoped `templates:` schema in DESIGN.md, `/template` bridge route (capability-registered), 3 MCP tools, selector revalidation on read.
- **Full (M):** `allowedTokens` cross-checks (advisory), multi-page template reuse, batched atomic saves, audit trail (who marked what) for mature teams.

### Risks & open questions
- `stableSelector()` fragility is the load-bearing risk — a rebuild can orphan every slot.
- One DESIGN.md per project: confirm this covers multi-page template registries or introduce per-page sub-keys (schema above assumes it does via `pages.<path>`).
- Solo dev default: zero-config (no template until the tab is touched). Mature teams: want enforcement + audit — explicitly deferred, not silently omitted.

---

## Feature 3 — Layers panel (Figma-style) with fixed/flexible + permissions

**Verdict (post-review): partially feasible.** Layer inspection and *explicitly ephemeral* DOM reorder preview are feasible now (M). Safe source persistence and hosted project-authorized editing are **unproven** — they require separate architecture spikes and must not be committed as roadmap phases yet.

### ROI framing (Andrew, 2026-07-10 discussion)
The value is not cheap instructions — it's **collapsing the spatial-disambiguation loop to zero agent turns**. The expensive failure mode today is 10 chat turns of "move it left — no, not there" where each turn is a full agent round-trip against a frame of reference the user and agent don't share. Element-grounded intents (exact nodes + confirmed target arrangement) turn ten speculative edits into one confirmed one. Reordering is a minority operation but the *worst-converging* one per attempt — optimizing the highest-thrash operation beats optimizing the most frequent one.

### Recommended shape: the escalation ladder (revised 2026-07-10)
Ship in order; each rung is independently useful and its payload feeds the next:
1. **Shift-multi-select in grab (S).** Ordered multi-selection with numbered badges; user types "move 1 above 2" in chat. No new panel — an ordered array instead of one element in the existing grab payload. Cheapest possible test of whether grounded identity kills the thrash.
   - **SHIPPED (branch `grab-multi-select`, 2026-07-10). Usage:** click the first element as usual, then shift-click each additional one — every selection gets a numbered badge (1,2,3…) in click order; a plain click resets to single-select and clears the badges. Type the instruction against the numbers ("move 2 above 1") and Send. The drained payload from `get_grabbed_elements` carries `multiSelect: [{ index, selector, html, rect, styles }]` in selection order (1-based indices); the field is present only when 2+ elements are selected — single-select payloads are byte-identical to before. Prerequisite landed in the same branch: the bridge's `z.any()` boundary (`rect`/`styles`/`tokens`/`stateStyles`/`tokenIntents`/`styleEdits`) is now fully typed Zod with passthrough retained for extensibility. Verified live: 3-element shift-select → badges eyes-on → drain order matched click order → agent applied "move 2 above 1" to the right nodes first try. 588/588 tests.
2. **Layers list with reorder-as-intent + clone-measured wireframe preview (M).** Tree rows reorder in the panel — **the live page is never mutated**, which amputates the React-reconciliation/hydration risk entirely. Visual confirmation comes from an off-screen clone: `parent.cloneNode(true)` into a hidden container pinned to the same computed width, apply the reorder to the clone, read `getBoundingClientRect()` off its children, draw scaled wireframe boxes in a preview strip above the tree. Because the clone lives in the same document it inherits real stylesheets, so the preview is *correct* about flex/grid reflow, `:nth-child`/sibling-combinator restyling caused by the reorder, margin collapse, and wrapping — everything a hand-drawn wireframe would lie about. The measured post-reorder rects ship with the intent ("produce this arrangement"), giving the agent pixel-level ground truth that survives selector drift.
   - Limits (state in UI): JS-driven layout doesn't run in the clone (badge "preview approximate" when the container shows inline positioning); same-parent reorders first — cross-container moves need the nearest common ancestor cloned, so cap clone subtree size; render on drop, not per-pixel drag.
3. **Ephemeral live-page preview — likely permanently unnecessary.** Clone-preview delivers the same confirmation with none of the reconciliation risk; only revisit if real usage shows clone-preview fidelity failing on cases users care about.

### What's feasible now (Phase 1, M)
- **Layer tree:** a new `buildLayerTree()` contract in the overlay (not "extend `stableSelector()`" — that walks upward from one element, caps at 5 ancestors, and returns a string, not a hierarchy). Defined inclusion rules for text nodes, shadow roots, iframes, portals; stable *runtime* IDs per node.
- **Reorder preview via off-screen clone** (see ladder above) — supersedes the earlier VisBug-style live-DOM mutation approach, which carried reconciliation/hydration revert risk for no added fidelity.
- **Fixed/flexible badges** from Feature 2's DESIGN.md annotations — advisory display only. Selector-keyed annotations cannot be authoritative move policy (`:nth-of-type()` indices shift on the very reorder that consults them).
- **Intent queue:** reorder intents (`{ nodeSelector, fromParent, toParent, indices, domSnapshotHash }`) queued through the bridge for a human or coding agent to apply as a reviewed source patch. Framing matters: this is **edit-intent capture + agent-assisted patch proposal**, not "DOM-edit persistence."
- **New MCP tools:** `get_grab_layers`, `move_grab_layer` (queues an intent; never trusts caller-supplied role), `get_grab_operation` — with an explicit operation state machine (`proposed → previewed → applied/rejected`), since the existing `/grab` queue is a bounded submission queue with no status lifecycle.

### What's NOT feasible yet — the three blockers (adversarial review, confirmed against code)
1. **No trusted authorization boundary exists.** The capability key is readable by any same-page script (it sits in the injected `<script src>` URL) and CORS is `*` — page JS could issue writes itself. `role` in `start_grab_session` is caller-supplied; hosted JWT verifies identity (`sub`) only — no role/permission claims exist anywhere in the WorkOS setup. **Any client-gated "designers can move everything" check is spoofable.**
2. **No DOM→source identity or AST mutation substrate exists.** No Babel/SWC/ts-morph/recast in dependencies; the only file writes are DESIGN.md. One AST node ↔ many runtime instances (loops), one component ↔ many DOM nodes; DOM adjacency ≠ source adjacency (fragments, conditionals, portals, CSS `order`). A real source adapter is an **XL spike**, per-framework, with parse→transform→print→verify→atomic-write→rollback.
3. **Hosted mode has no write path at all.** Grab tools are excluded from every remote server build; the hosted endpoint is stateless per-request with no repo checkout, sessions, or write credentials. Hosted collaborative editing is its own roadmap item (XL+), not a phase of this feature.

### Permissions: both models, one recommendation
- **(a) Hosted OAuth roles (WorkOS + Redis):** the only model that can't be client-bypassed — role resolved server-side from verified `sub` + project membership at the *write/apply* boundary. But it requires new infrastructure (role claims, project-scoped Redis namespacing — current storage is subject-namespaced only) and a hosted write path that doesn't exist.
- **(b) Local config / DESIGN.md-declared roles:** trivial to ship, zero auth — a `permissions:` block in DESIGN.md mapping user → designer/engineer. **Cooperative, not security-grade**: it prevents accidents, not adversaries.
- **Recommendation:** ship **(b) now, honestly labeled** — the real enforcement point is the *apply* step, which is agent/human-mediated anyway (the queue-only model means nothing writes source without review). Adopt (a) only when/if hosted source-editing exists; design the intent payload today so a server-resolved role can slot in later without schema breakage.

### Effort (re-estimated per review)
- **Phase 1 (M):** layer tree + ephemeral reorder + badges + intent queue + local cooperative roles.
- **Source persistence:** XL spike per framework — prove a narrow contract (same-parent sibling reorder, one framework, explicit ID annotation) before committing any roadmap phase.
- **Hosted authorized editing:** XL+, separate feasibility spike (repo checkout, durable sessions, write creds, commit/PR flow, audit).

### Shared infrastructure debt both F2 and F3 hit
- Single module-global `currentSession` in `src/grab-bridge.ts` — concurrent sessions evict each other.
- In-memory queue drained with `splice(0)` — no idempotency/ack, lost on restart.
- No revision/staleness model — intents can silently misapply after a framework rerender; any persistence work needs revision-hash preconditions.
- CSP/Trusted Types can block the injected script; HTTPS pages can't reach the HTTP bridge (already warned in the overlay).

---

## Cross-cutting recommendation

Build order: **F3 rung 1 (shift-multi-select, S — ships this week and validates the whole thesis) → F1 local MVP (after the DESIGN.md parser migration) → F2 MVP → F3 rung 2 (layers list + clone preview)**. F1 is standalone and extends Raven's existing audit vocabulary. F2 establishes the annotation schema (`templates:` in DESIGN.md) that F3's badges consume. F3's honest scope (inspect + preview + intent queue) reuses F2's bridge/panel work. The two XL items — AST source persistence and hosted authorized editing — are spikes, not phases: neither should appear on a committed roadmap until a narrow proof exists.
