# Comments-pipeline composition smoke (it38)

*2026-07-19, morven-loop it38. Prep artifact for it35 top-10 #4 ("comments-pipeline real smoke"). Runs no shipped surface; grows no PR queue. Files: `it38-comments-smoke/smoke.mjs` + `it38-comments-smoke/comments-fixture.txt`.*

## Why this exists

The three comments-pipeline legs live on **independent, never-composed branches**:

- `comments-archive` (#38) — PAT archive → `figma-comments-archive/<key>.md`
- `comments-paste-path` (#42) — `--paste <label>`: pasted Figma comments → `<label>.md`, zero credentials
- `comments-to-decisions` (#43) — teaches `decision_import` to detect those archives and chunk per-thread with `#Thread n` provenance

`git merge-base` confirms **#43 is not stacked on #42** — each ships only its own unit tests, and those hand-write the archive `.md`. So the load-bearing question behind it35's "on merge + one smoke, gap-8 closes" was never checked: **does #42's real paste output actually satisfy the format contract #43's detection keys on?** If not, pasted archives silently import as plain docs with no thread provenance, and gap-8 does *not* close for the credential-free path (the whole point of #42).

## Finding: the contract composes (at the format level)

Running the **real** #42 paste script on a realistic 3-thread fixture and feeding its output to the **real** #43 `decision_import` tool passes:

```
[smoke] default import returned; kinds=figma-comments      ← detected as archive, NOT plain doc
[smoke] src ok kind=figma-comments threads=3               ← thread_count correct
[smoke] caveat: 4/7 small-cap chunks are headerless thread continuations
SMOKE PASS: #42 paste -> #43 archive detection composes; 3 threads, per-thread provenance intact.
```

Asserted: detection as `figma-comments` (not `doc`); `thread_count = 3`; all three `## Thread n` anchors present in the extractor material at the default cap; the provenance validator accepts `#Thread 1` and strips out-of-range `#Thread 4` with the correct reason. The format contract (`# Figma comments archive: <label>` first line + `## Thread n` headings) matches on real paste output — confirmed dynamically, not just by inspection.

## What it proves — and what it does NOT (Sol adverse, VERDICT: SOUND)

This is a **format-contract** result. It proves the two branches compose on well-formed input at the default chunk cap. It does **not** prove:

- **Real Figma clipboard text parses cleanly.** The fixture is synthetic. No capture of actual Figma-comments-panel clipboard text exists — that still needs Andrew's Figma seat (the it33/#42 residual). The #42 parser is known to fabricate replies from timestamp-looking message lines and to split a thread on a blank line inside one comment; a real paste can hit both. **This smoke does not exercise that.**
- **Production robustness** — labels with spaces, empty threads, CRLF, huge archives, etc. are unexercised.

Three recorded caveats, all non-blocking to the composition claim:

1. **No `resolved` signal from pasted archives.** `parsePastedComments` never sets a `resolved` field, so #43's extraction prompt ("`[resolved]` marks settled threads; extract only settled decisions") gets no settled marker from *pasted* archives — it falls back to prose-conclusion only. PAT-archived comments (#38) can carry it; pasted ones can't. Semantic limitation, not a composition failure.
2. **Small-cap continuation heading loss.** At `max_chunk_chars: 200`, a single thread longer than the cap sub-splits into `[continuation k/n]` pieces where continuations 2..n lose the `## Thread n` heading (measured 4/7 chunks headerless). A decision extracted from a headerless continuation has no in-material thread anchor. **The default cap does not sub-split these threads**, so normal operation is unaffected; only an oversized single thread under a deliberately small cap is exposed.
3. Chunk **count** at a small cap is size-driven, not one-per-thread — the guarantee is one-thread-*per-chunk* boundary, not one-chunk-per-thread.

## Reproduce

The smoke needs a tree containing **both** #42 and #43, built. They aren't stacked, so compose them in a throwaway worktree:

```sh
cd ~/projects/raven-mcp
WT=/tmp/comments-smoke-wt
git worktree add --detach "$WT" origin/comments-to-decisions           # #43 (detection)
git show origin/comments-paste-path:scripts/figma-comments-archive.mjs \
  > "$WT/scripts/figma-comments-archive.mjs"                            # overlay #42 (stdlib-only, safe)
ln -s ~/projects/raven-mcp/node_modules "$WT/node_modules"             # same lineage, no dep change
cp conversations/it38-comments-smoke/{smoke.mjs,comments-fixture.txt} "$WT/"
cd "$WT" && RAVEN_NO_USAGE_LOG=1 npm run build
RAVEN_NO_USAGE_LOG=1 node smoke.mjs                                     # exit 0 = pass
# cleanup: git worktree remove --force "$WT"
```

When #42 + #43 actually merge to main, `smoke.mjs` belongs in `test/` as a real end-to-end test (drop the `process.exit(0)`; it exists only to sidestep an unrelated open-handle hang in single-file `node --test` runs).

## What Andrew still owes on gap-8

- The **real-Figma-clipboard smoke** — one copy-paste from a live Figma comments panel through `--paste`, eyeballing the `.md` (it33 residual; needs his Figma seat). That is the piece this synthetic smoke cannot stand in for.
- Merging #38 + #42 + #43 (off the 2.0 release path per the release-readiness doc). Matrix cells move only on merge (it30 ruling).
