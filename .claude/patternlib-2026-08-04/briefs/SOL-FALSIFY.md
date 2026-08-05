# Falsify this claim. Report only — change nothing.

Repo: /Users/accunliffe/projects/raven-mcp, branch main, uncommitted working tree.

## The claim under test

"Raven now closes the grab loop: you can proxy a third-party site through the local
grab bridge even when it sets a strict CSP, click an element, persist that pattern to
~/.raven/references, search it later, and translate its raw CSS literals onto your own
DESIGN.md tokens. Local tool count 105 -> 108, gated 60 -> 63, anonymous remote surface
still exactly 45 with hash f64bb18...2bb0a6 unchanged. Build clean, 1179 tests /
1176 pass / 0 fail / 3 skipped."

## Read these

- `git diff` (whole working tree) — this is the change under test.
- `src/grab-bridge.ts` — proxy hardening (CSP/frame/permissions-policy header strip,
  meta-CSP removal, base href + meta-refresh rewriting, Location rewriting on host+port,
  Set-Cookie rewriting, Origin/Referer rewriting, sec-fetch stripping, service-worker
  no-op, non-UTF-8 pass-through).
- `src/reference-store.ts`, `src/reference-tokens.ts` — the new persistence and token mapper.
- `src/index.ts` — the three new tool registrations (capture_reference, search_references,
  map_reference_to_tokens) and the tool-count contract.
- `CLAUDE.md` "Ground truth" block — the frozen contracts.

## Attack these specifically

1. **Silent correctness holes in reference-tokens.ts.** It is pure and deterministic and
   claims never to force a match. Find an input where it returns a binding that is wrong,
   or a gap where a correct binding exists. Check the ref-resolution cycle detection, the
   unitless relative-delta division when the captured value is 0, and the tie-break order.
2. **reference-store.ts path handling.** ref_id validation, index.json corruption recovery,
   atomic write behaviour under a partially-written index, and whether a crafted ref_id or
   url can escape ~/.raven/references.
3. **The proxy hardening.** Does any of it break the NON-proxy grab path? Does stripping
   CSP/COEP/CORP on a proxied third-party page create a risk the code does not acknowledge?
   Is the same-origin comparison (host+port, ignoring scheme) exploitable? Does the
   Set-Cookie rewrite (dropping Secure and Domain, SameSite=None -> Lax) ever produce a
   cookie the upstream site would consider a security downgrade the user did not consent to?
4. **The count contract.** Every place asserting 105/60 must now assert 108/63. Find any
   site still saying 105 or 60 — source comments, tests, manifest.json, README, docs,
   site/llms.txt, web/public/llms.txt, .mcpb manifest. Also confirm no NEW tool leaked into
   the anonymous remote surface.
5. **dist/ vs repo.** `npm run build` is `clean && tsc`. Confirm `npm pack --dry-run`
   ships exactly what the repo now contains and no deleted implementation survives.
6. **The tool descriptions.** Are they accurate about what the code actually does?
   capture_reference claims it does NOT drain the grab bridge. map_reference_to_tokens
   claims no network and no model. Verify both against the code, not the prose.

## Output

Write `.claude/patternlib-2026-08-04/out/SOL-FALSIFY.md`: a ranked list of real defects.
For each: file:line, the concrete input/state that triggers it, the wrong output, and the
fix. Say explicitly if a claim above survives. Do not fix anything. Do not run git.
