# Resume state — pattern library, post-Sol-integration

Written at the moment Andrew's usage reset, to survive a `/clear`. Everything
below is measured unless marked GUESSED.

## Repo state

- Local `main` is ONE commit ahead of `origin/main` (`1c42ccc`). That commit is
  the one this file was added in — everything listed below is committed, not
  loose, and **not pushed**. Pushing is Andrew's call: `main` touching `src/`
  deploys the live `mcp.ravenmcp.ai` endpoint.
- What that commit contains:
  - `M CLAUDE.md` — ground-truth test count + new landmines
  - `M src/reference-store.ts` — vocabulary work (committed-adjacent) **plus an
    UNTESTED `verification_failed` fix added minutes ago**
  - `M src/index.ts` — `next_step` + `vocabulary` at the search seam, **plus the
    UNTESTED `cleared` guard and its note sentence**
  - `M test/reference-store.test.mjs`, `M test/pattern-library-tools.test.mjs`
  - `A scripts/find-scroll-cues.mjs`, `A scripts/seed-reference.mjs`
  - `A .claude/patternlib-2026-08-04/mobbin-posture/SOL-INTEGRATION-BRIEF.md`
- `dist/` is clean (a mutant was attempted and did NOT apply — exit 9 — so
  nothing was written).
- Full suite re-run WITH the `verification_failed` edit in the tree:
  **1353 total / 1350 pass / 0 fail / 3 skipped** (44.4s). Identical to the count
  before the edit — the edit breaks nothing and is covered by nothing. An
  unchanged count is not evidence that nothing moved; it is evidence that no test
  looks at this.

## What the last edit did (uncommitted, untested)

Sol's sharpest P1: `deleteReferencesByHost` swallowed any error from the
post-sweep re-read, leaving `still_present: []`, and `forget_references` computes
`cleared` from four empty arrays — so an unreadable reference directory reported
a takedown **cleared** with the same words as a verified-clean one. That is the
one forbidden outcome for a takedown.

Changes made:
1. `ForgetResult.verification_failed?: string` (new field + comment).
2. The `catch` now records the message and sets `remaining = []` instead of
   swallowing.
3. `src/index.ts`: `cleared` additionally requires `!result.verification_failed`.
4. `src/index.ts`: a note sentence saying the check did not run, deliberately
   worded so it cannot be read as "records were left behind".

**No test covers any of this yet.** That is the first job on resume.

## Sol verdict — DOES NOT SURVIVE (basis `1c42ccc`)

Two caveats that bound every claim below: Sol audited the tree BEFORE the
vocabulary work, and its 34 file-backed tests never ran (`mkdtemp` EPERM), so
every mutation blast-radius it states is source-reasoning, **not measurement**.

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | P1 | `attachReferenceImage` TOCTOU: existence check at :955, rewrite at :963 — a takedown landing between them is reported clean and then resurrected | OPEN. Round 3 narrowed this window; Sol says a residual remains. Needs a decision, not necessarily a lock. |
| 2 | P1 | Block check (:117) and persistence (:185) not atomic; `attachReferenceImage` is a second full-record writer, so `saveReference` is not the sole convergence point → C1's "cannot be bypassed" is too strong | OPEN. Cheap mitigation: re-check the blocklist immediately before the write, narrowing the window to a few syscalls (same shape as the `still_present` re-read). Full cross-process locking is out of scope. |
| 3 | P1 | Failed verification → false all-clear | **FIXED, untested** (above). |
| 4 | P1 | Policy says "not any other curated library"; code enforces a finite list and says so | OPEN. Fix is to narrow the POLICY wording to what the code enforces, not to widen the code. |
| 5 | P2 | Policy claims captures come "from a page the user is already looking at"; `capture_reference` accepts an arbitrary URL | OPEN. Narrow the wording; binding to a live session id would break the legitimate drain path. |
| 6 | P2 | Tests that cannot exercise their named property: the "unreadable local list" test covers malformed JSON but not EACCES/EPERM; "every gallery the policy names" hardcodes four hosts instead of reading the doc; the round-trip test compares `saveReference`'s own return so a dropped field stays green; the 8000-char and 200-style limits omit the exact boundaries (`>`→`>=` survives); the monotonicity fixture holds both `pricing` and `toggle` in one record so a middle-only mutant survives | OPEN. The monotonicity and boundary ones are the sharpest — fix those first. |
| 7 | P3 | Prefix matching: `nav` matches tag `navy`, `hero` matches `.heroku-deploy-button` | ACCEPT + document. Sol's remedy breaks the deliberate `scroll`→`scrolling` behaviour. |
| 8 | P3 | The `localBlockedHosts` try/catch comment claims "only this test turns red"; Sol says ≥7 tests fail because the catch also covers `readFileSync` ENOENT and every temp home lacks the file | **LOOKS RIGHT on inspection, NOT yet measured.** The mutant regex failed to apply against the compiled `dist/` — rewrite it to match the emitted `(0, node_fs_1.readFileSync)` form, or mutate `src/` and rebuild. |

Sol also notes `src/reference-forget.ts` does not exist — takedown lives in
`src/reference-store.ts`. C2, C3, C8 survive; C4 survives in source but its test
proof is insufficient.

Full output: `.claude/patternlib-2026-08-04/agent-output/SOL-INTEGRATION.out`
(10,048 lines, gitignored).

## The seed-corpus thread

Goal: put ONE real pattern in the corpus so Andrew can test his own use case
("examples of a scrolling mouse icon in a hero").

- `scripts/find-scroll-cues.mjs` — discovery, captures nothing. Twelve sites
  scanned; **exactly one** has a real hero scroll cue.
- `lusion.co` → `div#home-hero-scroll`, "scroll to explore", score 13, click at
  **(720, 875)**. Re-measured at the apex after the reset: same coordinate, so it
  was never stale.
- `scripts/seed-reference.mjs` — captures through the REAL overlay (a
  hand-written selection is fiction; the e2e proved it three ways).
- Three failed attempts, each diagnosed: (1) `www` → apex is a cross-origin
  redirect the bridge deliberately refuses to follow, so the overlay never
  booted; (2) a fixed 4s sleep lost the bet on a WebGL preloader and stored a
  loading screen tagged "scroll cue" (record deleted); (3) the readiness guard
  asserted the expected selector against `elementFromPoint`, which returns the
  LEAF — on this page the cue's text is split into per-word divs, so it saw
  `div.word` and refused.
- Attempt 3's guard was working correctly; the assertion was on the wrong signal.
  **Already fixed, not yet re-run:** the point-check is now readiness only (not a
  preloader), and the hard verdict moved to the overlay's own selection, which is
  what actually gets stored.
- Live corpus at `~/.raven/references` is **empty** — both bad records deleted.

Re-entry command (attempt four, the cap — stop and report if it fails):

```
SEED_EXPECT="home-hero-scroll" RAVEN_NO_USAGE_LOG=1 node scripts/seed-reference.mjs \
  "https://lusion.co" 720 875 "scroll cue,hero,scroll to explore" "scroll-cue,hero" \
  "Scroll-to-explore cue centred under a full-bleed hero."
```

## A product finding Andrew has not seen yet

Twelve sites scanned, one hero scroll cue. Modern SaaS landing pages have
largely abandoned the pattern — it survives on design-forward and agency sites.
The natural way to FIND those sites is a gallery, and the galleries are exactly
what the new blocklist refuses. That is a real product fork for the seed-corpus
decision, sharper than the "may we commit third-party captures to a public repo"
question it was blocked on.

## Gates that are Andrew's, not mine

- **The MCP server is running STALE code** — a probe capture silently dropped
  `taxonomy`. He must reconnect/restart it before any hands-on test.
- `npm publish` (passkey 2FA, his terminal). npm is still 2.3.0 / 105 tools.
- `cd web && vercel deploy --prod` for the apex site and public `.mcpb`.
- **Any push to `main` touching `src/` or `api/` deploys the live
  `mcp.ravenmcp.ai` endpoint and is his call.** The earlier "go ahead and push"
  authorized one specific push and does not carry forward.
- The force-push decision on published history.
- Whether he wants a dedicated takedown address instead of GitHub issues.
- A grab session on port 63499 (proxying github.com) may still be up — offer to
  stop it.

## Standing constraints

- Repo is PUBLIC and `.claude/` is tracked. Raw agent output goes in
  `.claude/**/agent-output/` (gitignored by CLASS). Never add a negation; move
  the file. Never add to `KNOWN_PUBLISHED`.
- Commit explicit paths after a fresh `git status`; co-author trailer required.
- `stash@{0}` must stay intact (accidental release.sh 2.3.0 bump, recoverable).
- Tool count **109 stdio / 64 gated**; golden anonymous-45 hash
  `f64bb18…2bb0a6` is frozen. Six test files assert the count.
- **Codex is out of credits (Andrew, 2026-08-06).** Adversarial and falsification
  passes route to `ow-run moonshotai/kimi-k3` or `ow-run z-ai/glm-5.2` instead of
  `codex exec -m gpt-5.6-sol`. This changes the EXECUTOR, not the gate: an
  orchestrator-owned adversarial pass still runs before any completion claim
  reaches Andrew, and legs still never self-gate. Read
  `~/.claude/reference/routing-ladder.md` for the exact `ow-run` invocation
  before launching one.
- An open-weight refuter is weaker than Sol, so give it a SHORT, specific claim
  to refute rather than a whole tree to audit — and hand big context by file
  path, never inline. The Sol pass above cost 294k tokens and its 34 file-backed
  tests still never ran; a narrower brief is not just cheaper here, it is more
  likely to produce a measurable answer.
- Every non-interactive `codex exec` gets `< /dev/null` (if credits return).
