# Spec — team-shared Decision Graph (Morven)

Status: SPEC ONLY — no build without Andrew's go. 2026-07-18, morven-loop it23 (rev 2, post-adverse: 13 Sol findings folded in).
Boundary: Raven ⊂ Morven. This spec proposes exactly one piece for free Raven (the repo-local store); everything org-level is Morven paid.

## Goal

A team's design decisions — currently trapped per-machine in `~/.raven/decisions/` — become a shared, queryable graph that every teammate's agent (and every teammate) consults and extends, with the consent/admin controls the paying team requires. This is matrix top-10 gap #2, with its own caveat carried forward: **sharing is necessary but not sufficient — governance (who can commit/supersede, retention, audit) is part of the feature, not phase 2.**

## Current state (verified against src/decision-graph.ts + src/index.ts, main cd861f8)

- Single global store: `~/.raven/decisions/nodes.json` + `edges.json` (`RAVEN_DECISIONS_HOME` overridable), atomic temp-file writes, file lock for the single local writer. One module-global store per server process; most decision tools take no project argument.
- Node kinds: decision / evidence / source. Decisions carry scope, component_ref, status (candidate/active/superseded/contested), and a **singular** `superseded_by` pointer. **Not append-only:** commit/supersede/scope mutate fields on existing nodes, and history traversal follows a single successor chain. (This kills naive union merge — see §2.)
- IDs: `dec_<time36>_<4-char random>` — adequate single-writer, collision-plausible across concurrent team writers.
- 13 local Decision Graph tools total (11 `decision_*` + the ingest pair + `gap_scan`); `review_diff`/`polish_diff` consume **active** decisions only.

## Customer (bound lens — project CLAUDE.md `## Target customer`)

Primary: the paying team — decisions scattered in Slack/heads get re-litigated; they want them durable and enforceable across people AND agents; evaluated with IT/admin in the room. Bounces on: broad data access without consent controls, unclear retention/LLM handling, per-seat pricing with no team-level win over free.
Constraint: don't regress the solo indie dev's free local path — no new required setup, existing behavior unchanged when the feature isn't opted into.

## Design

### 1. Substrate: git-backed repo store first, hosted org graph second

**(a) Repo store — ships in free Raven.** A project opts in with a checked-in `.raven/decisions/` directory (same schema, version field bumped). When present, `decision_*` tools read/write the repo store; sync = git, review = PRs, history = git log, offline = free.
- **Project selection (was undefined — Sol F4):** the repo store is discovered by walking up from the server process cwd to the nearest `.raven/decisions/` (the normal one-server-per-project MCP config). An explicit `RAVEN_DECISIONS_HOME` still wins. **Shadowing, not union:** when a repo store is present it fully shadows the global store for all decision tools; global records reach it only via explicit export → import. A long-lived server that must serve multiple repos is out of scope for v1 and documented as such.
- Free/paid rationale, softened (Sol F10): the repo store deepens adoption along the existing advocate→team motion, and file-in-repo sharing is *hard* (not impossible) to defend as paid. Whether a git-centric org ever converts to the org graph is LOFA 3 — the spec does not assume it.

**(b) Org graph — Morven paid.** Hosted multi-repo/team graph with what git can't do: cross-repo scope, non-git members, Slack/transcript ingestion (own override, own spec), admin console, org-wide agent query. **Enterprise requirements (Sol F7/F8 — gating for any paid launch, listed here, designed in the Morven spec):** enforced-SSO option + directory sync (SCIM) with immediate deprovisioning and session revocation; IdP-group→role mapping; service/agent identity distinct from humans; secret-scan/redaction on all ingest paths (consent language is a control problem, not a UI promise — rationales and Slack text can carry secrets/PII); DPA + subprocessor list + no-training policy + deletion SLA covering backups; residency statement; immutable audit log reconciled with deletion obligations.

### 2. Merge semantics (repo store) — requires a schema change first

Sol F1/F2/F3 falsified the rev-1 "union merge" story. Corrected model:

- **Prerequisite schema change (v2):** make decision nodes immutable-after-create by moving all mutable state out of node fields and into edges/events — supersession becomes only an edge (`superseded_by` field dropped or derived), status becomes derived (active = no outgoing supersede edge; contested = 2+ outgoing supersede edges). History traversal becomes DAG-aware (multiple successors legal). With that, nodes.json and edges.json really are append-only sets and union merge is sound.
- **One reconciler, not two file drivers (F2):** a single `raven-decisions-merge` driver handles both files in one transaction (git invokes it per file; the driver operates on the pair via the worktree and stages both), then runs **fail-closed invariant validation**: endpoint existence, acyclicity of the supersede DAG (F3 — two branches can individually pass the cycle check and union into A↔B; the reconciler breaks the cycle by marking both contested and surfacing it), no duplicate IDs, kind/edge-type legality. ID collisions with different content get a deterministic rewrite applied to both files in the same transaction.
- **Competing supersedes** merge to a contested decision with both successor edges intact — surfacing the disagreement is the feature.
- ID hardening: 10+ chars entropy or content-hash at mint.

### 3. Identity & attribution

- Repo store: optional `author` on nodes from `git config user.email`; **opt-out** via `RAVEN_DECISIONS_NO_AUTHOR=1` (F9 — attribution is PII in durable history; the team chooses).
- Org graph: directory-backed identity, non-optional, every mutation in the audit log (see §1b requirements).

### 4. Repo-store trust & governance (Sol F9)

- The graph files are **untrusted input**: tools validate on read and fail closed (malformed or invariant-violating store → explicit error, never silent fallback to global).
- Docs must state the threat model plainly: a PR that edits `.raven/decisions/` changes what agents enforce — protect it like CI config (branch protection + CODEOWNERS on the directory); decisions propagate with forks/clones like all repo content; git history is forever (don't put secrets in rationales — and the docs say so).
- What leaves the machine: nothing beyond the team's own git remote. That sentence, plus the threat-model paragraph, IS the IT story for the free tier.

### 5. Setup honesty (Sol F5)

`git pull` alone does NOT activate merge safety or enforcement. Real setup: one-time per-clone `git config merge.raven-decisions.driver ...` (shipped as `npx raven-mcp setup-decisions`, also wired into docs and optionally a repo bootstrap script), and enforcement happens when CI or an agent calls `review_diff` — a sample GitHub Action ships with the build. Without the driver, concurrent edits produce ordinary text conflicts (ugly but recoverable). The spec claims "one command setup," not "no setup."

### 6. Compatibility (Sol F6)

New tools (`decision_export`, setup command) land as a normal **versioned, release-noted addition** — exactly how the tool surface grew 45→93. The compatibility promise is scoped precisely: with no repo store present, existing tools' responses are unchanged and existing tests pass untouched; `tools/list` grows at the release boundary like every prior release. No claim of absolute byte-identity across versions.

### 7. Migration & coexistence

`decision_export` (the two JSON files + version) + existing `decision_import`. Local → repo store is explicit and one-way per the shadowing rule. Repo store ↔ org graph sync is Morven-side, out of scope.

## Acceptance criteria (repo-store build — the only Raven-side piece)

1. Repo with `.raven/decisions/` → all decision tools read/write it; **shadowing verified**: a global store with same-project decisions is ignored while the repo store exists, and reachable again when it's removed.
2. No repo store → behavior identical to today: existing tests pass unchanged **plus golden wire-output comparisons** on a sample of decision-tool responses (F11).
3. Merge matrix (F1/F2/F3/F11): disjoint adds merge clean; same-target competing supersedes → contested with both edges; ID collision with cross-file evidence references → deterministic rewrite, zero dangling edges; crafted A↔B supersede union → reconciler flags both contested, store stays valid; malformed/invariant-violating store → tools fail closed with a clear error; merge driver absent → plain-text conflict, documented recovery.
4. `review_diff` in CI (the shipped Action) enforces repo-store active decisions; contested decisions surface as warnings, not silently dropped (today it reads active only — F11).
5. Setup is one command; docs carry the IT paragraph (what leaves the machine) and the threat-model paragraph (protect the directory like CI config).

## LOFAs (falsifiable, by risk — thresholds per Sol F12)

1. Teams accept decisions-as-repo-files. Test: dogfood on raven-mcp + 1–2 design partners. **Pass: ≥2 distinct authors commit ≥5 decisions within 2 weeks without being individually prompted per decision.**
2. Contested-on-merge reads as a feature. Test: seed one competing supersede in dogfood; structured question to each participant ("what did you expect to happen? is this state useful?"). **Pass: ≥2 of 3 say the contested surfacing is what they'd want; fail triggers a redesign before partners.**
3. Git-centric teams still want the org graph (cannibalization check — F10). Test: after 2 weeks of repo-store use, ask "what's missing for org-wide use?" **Pass: ≥half name a cross-repo / non-git-member / ingestion need unprompted AND at least one says they'd pay; otherwise the paid line moves (e.g. managed merge correctness + compliance reporting become the paid layer).**

## Scrappy experiment

Dogfood: check `.raven/decisions/` into raven-mcp itself (schema v2), import this repo's recorded decisions, run the loop's future design choices through it. Decision rule: advance to design partners if the graph is **consulted** (not just written) in ≥3 real sessions in week one; otherwise revisit shape before any team pitch.

## Out of scope (this spec)

Org-graph implementation (its requirements are listed in §1b as launch gates), Slack ingestion, pricing, embeddings sync, real-time collab, any UI, multi-repo single-server processes. Repo-store build is Andrew-gated and re-sized post-adverse: **schema v2 migration + reconciler + validation + export + setup command + CI action + tests — materially larger than rev 1's estimate; decompose into (i) schema v2 + validation, (ii) merge driver + matrix tests, (iii) export/setup/docs.**
