# Correctness review — pattern-library takedown (`forget_references`)

Repo: /Users/accunliffe/projects/raven-mcp (public, Apache-2.0). Commit `cfb4b8f`.
Diff: `.claude/patternlib-2026-08-04/leg3-sol/DIFF.txt` (read it from disk; also read the
files directly in the repo — `src/reference-store.ts`, `src/reference-thumbnail.ts`,
`src/index.ts`, `test/reference-forget.test.mjs`, `test/reference-thumbnail.test.mjs`).

## What the change claims

1. `forget_references` removes one reference by `ref_id`, OR every reference from a host
   including its subdomains, and removes the rendered PNG thumbnails with them.
2. `hostMatches()` matches subdomains only on a label boundary — `notexample.com` must NOT
   match `example.com`.
3. The confirm preview and the actual delete read the SAME function
   (`referencesForHost`), so the count the user is shown is the count that gets removed.
4. The host sweep continues past an individual failure and reports it in `failed[]`.
   `skipped` (unreadable JSON, never attempted) and `failed` (attempted, could not delete)
   are never conflated.
5. `deleteReference` catches ENOENT only when unlinking an image; any other errno means the
   file is still on disk and it throws rather than reporting success.
6. `attachReferenceImage` validates the 8-byte PNG signature, checks size AFTER rounding,
   uses a per-call temp name, and unlinks the PNG if the record write fails.
7. The thumbnail render runs with `javaScriptEnabled: false`, so markup captured from a
   third-party site cannot execute during the render.
8. `search_references` returns `image_path: null` when the PNG is missing from disk.

## Evidence claimed

- `RAVEN_NO_USAGE_LOG=1 npm test` → 1301 tests / 1298 pass / 0 fail / 3 skipped.
- Frozen anon probe → `109 45 f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6`
  (stdio tool count 109, anonymous surface still exactly 45 tools, hash unchanged).
- `node test/e2e-pattern-library.mjs` → 39 checks, ALL CHECKS PASSED.
- Mutation testing: 14 mutants (M1–M7, U1–U7) each injected into `dist/`, `import()`-checked
  to confirm the mutant loads cleanly, and each turned red exactly the test written for it.

## What I want from you

**Report only — change nothing.** Try to FALSIFY the eight claims above. Specifically:

- Is there an input for which `hostMatches` over-matches or under-matches? Consider
  unicode/IDN, ports, trailing dots, uppercase, empty labels, IP literals, `*.` requests.
- Can the confirm preview and the delete still disagree on the set they operate on?
- Can `forget_references` report `removed` for something still on disk, or report success
  for a takedown that did not happen?
- Are `skipped` and `failed` genuinely separable in every path, including the ref_id path?
- Is `javaScriptEnabled: false` sufficient to stop captured markup from executing during a
  render? What else in the render could execute or reach the network?
- Are any of the new TESTS passing for the wrong reason — a fixture that would pass against
  the defect, an assertion that stopped measuring after a refactor, or a fixture that is
  confounded? Two such tests were already found in this leg; assume more exist.
- Does anything here move stdio behaviour or the anonymous 45-tool surface?

Rank findings P1 (correctness/data-loss) / P2 (should fix) / P3 (nit). For each, name the
exact file and line, the input that triggers it, and the observable wrong behaviour. If a
claim survives, say so explicitly rather than staying silent about it.
