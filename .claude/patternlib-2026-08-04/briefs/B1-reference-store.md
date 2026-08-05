# Leg B1 — persist a grabbed pattern so it outlives the browser tab

Repo: `/Users/accunliffe/projects/raven-mcp` (TypeScript, ESM, Node built-ins only, no deps).

## Why this exists

Raven's grab bridge can now proxy ANY site and let a designer click an element and type a
note about why they like it. Measured live on linear.app: the drain returns a full
`GrabBridgeSelection` — selector, outerHTML, rect, computed styles, hover-state styles, the
designer's note. **And then it is thrown away.** Nothing persists. The whole point of the
product is "find a pattern on someone else's site, keep it, apply it to my project later,"
and the keep step does not exist. You are building the keep step.

## Read these first

- `src/grab-bridge.ts:256` — `GrabBridgeSelection` (extends `GrabChangeEnvelope`). The
  fields that matter: `selector`, `html`, `rect`, `styles`, `stateStyles`, `tokens`,
  `instruction`, `userNotes`, `intent`, `receivedAt`.
- `src/taste-store.ts:30` — the home-dir convention:
  `process.env.RAVEN_TASTE_HOME || join(homedir(), ".raven", "taste")`. Copy its shape,
  its atomic-write discipline, and its error handling exactly. Do not invent a new one.
- `src/decision-graph.ts` — for how this codebase does a local append-only store, an
  index, and id generation. Match it.

## Build `src/reference-store.ts`

A local, dependency-free store. Home:
`process.env.RAVEN_REFERENCE_HOME || join(homedir(), ".raven", "references")`.
One JSON file per reference; an `index.json` for fast listing. Atomic writes (write temp,
rename), and a corrupt individual record must not take down a list/search call — skip it and
report it in a `skipped[]`, never throw the whole call away.

### The record

```ts
export interface PatternReference {
  ref_id: string;            // stable, content-independent, url-safe
  url: string;               // the page the pattern was grabbed from
  host: string;              // derived from url, lowercased, for filtering
  app?: string;              // human name, e.g. "Linear" — caller-supplied
  owner: "self" | "third-party";
  selector: string;
  html?: string;             // outerHTML, TRUNCATED — see limits
  rect?: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;        // computed styles as captured
  state_styles?: Record<string, Record<string, string>>;  // e.g. { hover: {...} }
  note?: string;             // the designer's own words about why they liked it
  tags: string[];            // normalized: lowercased, trimmed, deduped
  captured_at: string;       // ISO 8601
  raven_version: string;     // import RAVEN_VERSION the way grab-bridge.ts does
}
```

### API (all synchronous, all pure-ish except the named I/O)

- `saveReference(input): PatternReference` — takes the fields above minus the derived ones
  (`ref_id`, `host`, `captured_at`, `raven_version`), validates, persists, returns the
  stored record.
- `getReference(ref_id): PatternReference | null`
- `listReferences(opts?): { references: PatternReference[]; total: number; skipped: string[] }`
- `searchReferences(opts): { results: Array<{ reference; score: number; why: string }>;
   total: number; corpus_size: number; skipped: string[] }`
  — filters on `host`, `owner`, `tags` (AND); free-text `query` matches case-insensitively
  against `note`, `app`, `tags`, and `selector`. Score is a simple, EXPLAINABLE sum —
  a note hit outweighs a selector hit — and `why` names in plain words which fields matched.
  No TF-IDF, no vectors, no cleverness. Deterministic ordering: score desc, then
  `captured_at` desc, then `ref_id` asc, so two equal-scoring records never swap between runs.
- `deleteReference(ref_id): boolean`

### Limits, and they are load-bearing

- `html` truncated to **8000 chars**; when truncated set `html_truncated: true` on the
  record. Reason: the remote MCP body cap is 400,000 bytes and a hero element's outerHTML
  can bust it alone.
- `styles` / `state_styles` — reject a payload over **200 properties** per map with a clear
  error naming the count, rather than silently storing it.
- `searchReferences` returns records, never images or base64.
- Reject a `url` that is not `http:`/`https:` with a clear error.

## Test file: `test/reference-store.test.mjs`

`node:test` + `node:assert/strict`. **Every test sets `RAVEN_REFERENCE_HOME` to a fresh
`mkdtempSync` dir and removes it after — no test may touch the real `~/.raven`.** Set it via
the module-level path convention this repo uses; check how `test/taste-store*.test.mjs` does
it and copy that, because a module-level path global captured at import time will silently
make your env var a no-op and the test will write to Andrew's real home.

Cover, and make each able to fail:
1. save → get round-trips every field, including `state_styles` nesting.
2. `ref_id` is unique across two saves of the SAME url + selector (a designer grabs the same
   thing twice on purpose; the second must not clobber the first).
3. Truncation: 20k of html stores 8000 chars and `html_truncated: true`; 100 chars stores
   verbatim and the flag is absent or false.
4. Over-limit styles (201 props) throws, and the error message contains the number.
5. Search: a positive control AND a negative control on the same corpus — a query that must
   match record X and must NOT match record Y; assert both. (A search that returns everything
   passes a match-only test.)
6. Tag + host filters compose (AND, not OR) — assert a record matching only one filter is excluded.
7. A corrupt record file (write `{` into the dir) → `listReferences` still returns the good
   records and names the bad one in `skipped[]`; it does not throw.
8. Deterministic ordering: two records with identical scores come back in the same order
   across repeated calls.
9. Non-http url throws.

## Constraints — hard

- Create **only** `src/reference-store.ts` and `test/reference-store.test.mjs`.
  Do **not** edit `src/index.ts` — the orchestrator registers the MCP tools and owns the
  frozen tool-count contract. Do not edit `manifest.json`, `package.json`, or any other test.
- **Do not run `npm run build`, `tsc`, `npm test`, or any git command.** Other agents are
  writing this same worktree concurrently. Write source only; the orchestrator builds and tests.
- No new dependencies. Node built-ins only. Match the file style around you.

## Deliverable

Write the code, then write `.claude/patternlib-2026-08-04/out/B1-report.md`: the exported
API signatures verbatim, where you put the store, anything in this brief that was wrong
about the existing code, and any decision you made that the brief did not cover.
