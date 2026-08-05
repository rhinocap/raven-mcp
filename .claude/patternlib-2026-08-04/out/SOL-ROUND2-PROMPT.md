# Adverse falsification pass — round 2 (report only, do not edit files)

You are falsifying a completion claim in the repo at `/Users/accunliffe/projects/raven-mcp`.
Report only. Do not modify, build, or commit anything. Do not run `npm publish`.

## Background

Round 1 of your own falsification (`.claude/patternlib-2026-08-04/out/SOL-FALSIFY.md`, read it
first) returned "the claim does not survive" with 13 ranked defects. Every one has now been
dispositioned. This round asks two things:

1. **Did each of your 13 defects actually get fixed** — in the code, not in the commit message?
   Read the implementation for each. A fix that only moves the symptom, only fixes the tested case,
   or introduces a new defect counts as not fixed.
2. **What did BOTH of us miss?** Round 1 was your first read. Attack the new code as new code.

## The claim being falsified

"The pattern-library feature (A: hardened grab-bridge reverse proxy; B: reference persistence +
token mapping) is complete and ready for Andrew to test locally. The 13 defects from round 1 are
fixed. The build is clean, the suite is green at 1194 tests / 1190 pass / 0 fail / 3 skipped, the
end-to-end script passes against live github.com, both .mcpb bundles carry 108 tools, the frozen
anonymous 45-tool surface and its golden hash f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6
are unmoved, and the npm payload contains no stale artefacts."

## What is in scope

- `src/grab-bridge.ts` — proxy hardening: server-side cookie jar, route scoping under proxy,
  http→https redirect handling, /tokens path withholding, start_grab_session warning text.
- `src/reference-tokens.ts` — RGBA colour ranking, colour parsing (named/hsl/space-separated rgb),
  token-family binding, diagnostics for broken $ref chains.
- `src/reference-store.ts` — corrupt-index self-heal.
- `src/index.ts` — the three tools `capture_reference`, `search_references`,
  `map_reference_to_tokens`; the state_styles union accepting Grab's `{declarations:[...]}` shape.
- `test/reference-store.test.mjs`, `test/reference-tokens.test.mjs`,
  `test/pattern-library-tools.test.mjs`, `test/grab-bridge.test.mjs`,
  `test/grab-bridge-proxy-headers.test.mjs`, `test/e2e-pattern-library.mjs`.
- `README.md`, `CLAUDE.md` ground-truth block, `docs/spec-pattern-library.md` status header.

## Specific things to attack hard

- **The cookie jar.** It is a module-level `Map` keyed by cookie name, with no domain or path
  scoping, cleared on session start and stop. Find the case where that is wrong: cookie shadowing
  across paths, `__Host-`/`__Secure-` prefixes, expiry parsing, `HttpOnly`, a cookie the upstream
  sets on a subdomain, concurrent requests, a session that crashes without calling stop.
- **The route scoping.** Under proxy, only `/raven-grab.js`, `/tokens`, `/grab` are served, and
  only with the correct `key` query param; everything else forwards upstream. Does the overlay
  still function? Can a path collision still break a real site? Is there a route that should have
  stayed and did not, or one that leaked through?
- **The same-origin capability leak (round-1 #1).** It was NOT architecturally fixed — it was
  reduced and disclosed. Judge whether the reduction is real and whether the disclosure is honest,
  and say plainly if you think shipping it at all is wrong.
- **The family binding.** `hasAffinityFamily` + a filter, with a gap-with-named-near-miss fallback.
  Find the property/token pair where this now produces a WORSE answer than proximity alone, or
  where a legitimate DESIGN.md naming convention makes every binding fail.
- **The redirect rule.** http→https on the same host moves `currentSession.proxyTarget`; a
  downgrade does not. Find the loop, the wrong-origin fetch, or the session-state corruption.
- **Ledger honesty.** `CLAUDE.md` now claims repo 108/63 vs published 105/60, and 1194/1190/0/3.
  Verify both against the actual tree. Flag any remaining number in the repo that contradicts them.

## Method

Run whatever read-only commands you need (`git diff`, `git status`, `rg`, `node --test` on
individual files). `RAVEN_NO_USAGE_LOG=1` is required for the suite. Note that
`test/e2e-pattern-library.mjs` reaches live github.com and may fail on a sandboxed network — that
is an environment result, not a defect; say so rather than counting it.

## Output

Write to stdout, ranked, in this shape:

1. `ROUND-1 VERDICT TABLE` — one row per original defect #1–#13: FIXED / PARTIAL / NOT FIXED /
   REGRESSED, with the file:line you read and one sentence of evidence.
2. `NEW DEFECTS` — ranked P0/P1/P2, each with file:line, the concrete input that triggers it, and
   the wrong output it produces.
3. `SURVIVING CLAIMS` — what you tried to break and could not.
4. `VERDICT` — does the completion claim survive? One paragraph.

Be adversarial. Assume the claim is wrong and find where.
