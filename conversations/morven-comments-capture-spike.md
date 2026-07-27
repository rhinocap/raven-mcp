# Spike — Figma comments → Decision Graph capture

Status: FEASIBILITY SPIKE — build Andrew-gated. 2026-07-18, morven-loop it27 (rev 2, post-Sol-adverse: 12 findings folded, 2 critical). Addresses matrix gap 8 / it25 top-10 #3.
Boundary: Raven ⊂ Morven — archive script + paste path are free Raven; org-wide continuous sync is Morven paid.

## Why this gap

The migration table rates comments/feedback history **blocking (at-risk history)**: teams leaving Figma lose years of in-context design discussion. it25's adverse pass ranked this the biggest *buildable* license-replacement blocker.

## The Sol correction that reshapes the design

Rev 1 framed this as "comments → candidate decisions." Sol's critical finding: **that pipeline is a lossy extractor, not history preservation.** `SourceNode` stores only kind/ref/timestamps; candidate decisions keep a statement + rationale and discard the thread — authors, replies, resolution, coordinates all gone. If the team then cancels Figma, the original conversation is unrecoverable. The exit-risk solver is therefore the **raw archive**, and extraction is a value-add on top of it. Phasing is reordered accordingly: archive first, extract second.

## Feasibility verdict

**Archive: FEASIBLE. Extraction: feasible but a real build, not a prompt tweak. "Comments no longer block leaving": NOT established — only "export-before-cancellation is possible."**

### API facts (corrected per Figma developer docs)
- `GET /v1/files/:key/comments` — scope `file_comments:read`, Tier-2 endpoint, available on all plan tiers (no Enterprise gate). Returns message (`as_md`), user, created_at, resolved state, reactions, threading (`parent_id`), anchoring (`client_meta`: node_id or canvas x/y).
- **Rate limits ARE published** (rev-1 error): plan-, seat-, and endpoint-tier-specific. Comments (Tier 2) has workable limits; **`GET /v1/files/:key/nodes` is Tier 1 and needs a second scope (`file_content:read`)** — viewer/collab seats get as few as ~6 Tier-1 calls/month. Node-name resolution must be **optional/best-effort**, never load-bearing, or it bottlenecks exactly the low-seat customer trying to leave.
- `client_meta.node_id` identifies the attached frame, not necessarily the component under discussion; node requests need chunked IDs, null/deleted-node fallback, and response-size bounds on large files.
- Not guaranteed by the API: deleted comments, historical node names/geometry, access after downgrade. Archive what exists while access exists; that is the honest claim.
- PATs expire (current PAT model) — the script must fail closed and legibly on 401/403, not just read an env var and hope.

### Existing code — what's real and what's missing (verified against src)
- `ingest_transcript` / `ingest_transcript_results` exist and give a zero-credential paste path, BUT: `source_meta.kind` is stored and **never reaches `buildExtractionPrompt(text)`** (index.ts ~6812/6830; decision-graph.ts:414); `ExtractionItem` **has no `component_ref`** — persistence hardcodes it to `source.ref` (decision-graph.ts:350, index.ts ~6867); the generic prompt omits `source_ref`, so the normal path produces a `derived_from` edge but **no imported-provenance EvidenceNode** (index.ts ~6883).
- Correct invariant wording: not "zero writes without review" — sources/candidates/edges ARE written immediately; the invariant is **nothing becomes active without `decision_commit`**, and per-item persistence means partial failures leave earlier writes in place (accepted, documented behavior).
- `ingest_transcript` returns a prompt; **a model must run it** and hand JSON to `ingest_transcript_results`. Any script "feeding comments in" is really producing paste/agent-ready input — the extraction step is the agent's, not the script's.

## Proposed build (Andrew-gated, reordered)

**Phase A — `scripts/figma-comments-archive.mjs` (the exit-risk solver).** Pull `/comments` for given file keys (PAT from `FIGMA_TOKEN` env, never source/args/logs), reconstruct threads via `parent_id`, and write a **complete raw JSON archive** (all fields verbatim) plus a readable Markdown rendering per file — durable, greppable, Figma-independent. Node-name resolution: best-effort only when the token has `file_content:read` and Tier-1 budget; otherwise node_ids pass through raw. Backoff on 429 honoring `Retry-After`, bounded retries, per-file failure report. Acceptance: archive of a real file round-trips every comment field (diff raw JSON against a direct API fetch = byte-equal payloads); run with a comments-only-scope token completes with node names degraded, not failed; token absent/expired → exit nonzero with a one-line remedial message; rerun is idempotent (same content → same files). **Ships as a repo-clone script initially — a bin entry touches package.json/`files` and therefore the release surface (Sol F9), so npm distribution is a separate, release-boundary decision.**

**Phase B — comment-aware extraction (a real build, ~4 surfaces).** Thread `source_meta.kind` through to `buildExtractionPrompt`; add a `figma-comments` prompt branch (thread = one candidate; root = context, replies = rationale; resolved = commit-worthiness hint; skip reaction-only/"fixed" replies); extend `ExtractionItem` + parser with optional `component_ref` and `source_ref` (so imported-provenance evidence actually gets created); persistence honors item-level `component_ref` over `source.ref`; tests for each. Acceptance: on a **blinded gold set** (≥10 real threads, pre-labeled by a human for decision-bearing vs noise): decision recall and candidate precision reported separately; every candidate carries a thread-level `source_ref` that materializes an EvidenceNode; rerun of the same archive does not duplicate candidates.

**Morven side (later, out of scope):** continuous org sync, webhook capture, cross-file rollup — behind it23 §1b identity/consent gates (comment text carries names and occasionally secrets; redaction before org storage).

## Threat/consent notes (team lens)
- The free archive script is self-serve on files the token holder can already read — same trust boundary as the Figma UI. Org-side ingestion inherits the Slack-ingestion consent + redaction gates.
- Extracted candidates never become active without `decision_commit` — a poisoned comment can't silently become an enforced decision. Comment text is untrusted input to the extraction model; the prompt must treat it as data.

## LOFA (rebuilt per Sol F11)
Teams accept comment-derived candidates as worth the triage time. Test on the blinded gold set: measure decision recall, candidate precision, and reviewer-minutes per kept decision. No pre-set pass percentage — the decision rule is comparative: if reviewer-minutes-per-keeper beats re-deriving the decision from scratch (ask the reviewer to do one cold), the extractor earns its place; otherwise the archive alone ships and extraction gets reworked.

## Recommendation
Phase A (archive) is the buildable next slot: standalone script, no server changes, solves the actual at-risk-history blocker, and its honest claim — "your comment history is exportable and durable before you cancel" — survives adversarial review. Phase B is a small multi-surface server build gated on Andrew's decision-graph go/no-go. Matrix correction at next refresh: comments cell moves from "unresolved" to "exportable pre-cancellation (archive); in-product history parity still absent."
