# 2026-09-22 — grab image attachments (spec docs/spec-grab-image-attachments.md)

Branch: feat/grab-image-attachments (worktree .worktrees/att-main). Do not push.
Scratch: /private/tmp/claude-501/-Users-accunliffe-projects/c3c886ec-f9cd-49c0-b040-0caf7d3f1bdf/scratchpad/att (prompts, logs, patches, L11/L12 json).
Baseline: npm test 1730 tests, 1727 pass, 3 skipped (baseline.log).

## Commits so far
- 6d48d60 contract stubs src/grab-attachments.ts + src/grab-inbox.ts
- 150fb95 L4 (Terra) imageTarget + STYLE_PROPERTIES in browser/raven-grab.js
- 9c70bdf L2 (Terra) src/grab-bridge.ts + 413 fix; 13a8cb0 L1; 0689830 L12 fixtures; 0aeb6e3 L3; L7 + payload expectation; 5e42b47 L11 (deepseek truncated → Terra finished)
- L1 (Terra) src/grab-inbox.ts bodies
- L12 (deepseek v4.1-flash, $0.0045) test/fixtures/attachments/*

## Leg table
| leg | model | file(s) | status |
| L1 | gpt-5.6-terra | src/grab-inbox.ts | done, applied |
| L2 | gpt-5.6-terra | src/grab-bridge.ts | done, applied |
| L3 | gpt-5.6-terra | browser/raven-grab.js (composer drop/paste/chips) | done, applied |
| L4 | gpt-5.6-terra | browser/raven-grab.js (imageTarget) | done, applied |
| L5 | gpt-5.6-terra | test/grab-bridge-attachments.test.mjs | done, applied (+ reader fix 1bb5053) |
| L6 | gpt-5.6-terra | test/grab-overlay-attachments.test.mjs | done, applied (+ 2 overlay fixes cb358c0) |
| L7 | gpt-6-sol | src/index.ts | done, applied |
| L8 | gpt-6-sol | web/public/raven-grab.js + CHANGELOG.md | done, applied 3dcc70b (mirror re-copied after chip fix) |
| L9 | gpt-6-astra | raven-grab.js lifecycle | done, applied 32e6832 minus beforeunload hunk; 10 of 11 tests kept |
| L10 | gpt-6-astra | adverse read-only pass | running, worktree att-L10 (detached at 3dcc70b) |
| L11 | deepseek (truncated, $0.0103) then gpt-5.6-terra | src/grab-attachments.ts + test | done, applied |
| L12 | ow-run deepseek | fixtures | done |
| map | ow-run kimi-k3 ($0.021) | collision map review | done |

## Known deviations (report in handoff)
- L3/L4/L9/L8 sequential on one file; L1/L2 split by contract stub.
- PNG dims from IHDR, no pngjs.
- naturalWidth/Height null for non-img kinds.
- origin strict "drop"/"paste"; path route sets "path".
- spec says resolved path must equal realpath: on macOS /tmp and /var/folders are symlinks, so tests must realpathSync their mkdtemp dirs.

## Incidents
- L9 first launch sat 5 min on "Reading additional input from stdin..." (stdin was a unix socket). Killed, relaunched with `< /dev/null`. Rule: every background `codex exec` gets `< /dev/null`. Memory written: reference-codex-exec-background-needs-stdin-closed.
- Full suite before L9 (S/pre-L9.log): 1752 tests, 1747 pass, 2 fail, 3 skipped. Fails: byte-mirror (cleared by L8) and no-private-paths.test.mjs:592, which resolves `repoRoot/../private.claude/...` — inside a nested worktree `..` is still under raven-mcp, so the finding is absent. Passes in the main checkout at 74cfb7b. Final suite must run from a worktree outside the repo tree.

## Next commands (updated 2026-09-23)
1. DONE: S/final4.log at 1f2a386: 1776 tests, 1773 pass, 0 fail, 3 skipped (baseline three at log lines 121/889/890), exit=0. Sibling worktree removed.
2. Remove the sibling worktree raven-mcp-att-final (git worktree remove, forced, from the main repo path).
3. Handoff (no push). Restart Claude Code afterwards so the session runs 2.1.280 (Opus 5.5 for in-session agents).

## Open questions (defaults, left for Andrew)
Q1 inbox at ~/.raven/grab-inbox (implemented). Q2 no blob live-preview in v1. Q3 cap 4 kept.

## L9 applied (32e6832)
- Kept: thumb revoke on drop/dismiss/send (idempotent), instruction-row removal keeps attachments, uploads block batch send (button + handler), upload-only drafts are not queue work, detached drafts carry ready ids + multi-select/React context, upload-in-flight drafts survive the stale sweep.
- Not applied: a `beforeunload` prompt when attachments are unsent. Not in the spec; the overlay already persists on pagehide. Its test and one assertion dropped.
- Harness fix: L9's `page.route('**/attachment')` never matched because the bridge URL carries `?key=`; three tests timed out. Matcher is now a pathname predicate.
- Regression: all 12 overlay suites, 168/168 pass (S/L9.overlay-all.log).

## Chip fix (a8993bf)
- Live screenshot showed "hero.png16×9" on one line: spans used data attributes only, CSS targeted classes. Classes added; test asserts dims box below name box (observed failing before the fix).

## Live check (test/_live-attachments.mjs, S/live/index.html, untracked; delete before handoff)
- img → kind img, picture → kind picture, background div → kind background; attachments[0].path exists under ~/.raven/grab-inbox/<session>/<sha12>-hero.png, 16×9, origin drop; /grab body has `attachments:[{id}]`, no base64. Screenshots S/live-chip-{0,1,2}.png.

## Orchestrator fixes so far (each with a test and an observed mutant)
- 1bb5053 bridge body reader: for-await early return destroyed the request (ECONNRESET before 413). Test: oversized multipart case.
- cb358c0 overlay: payloadForSend omitted imageTarget; img inside picture reported kind img. Test: overlay send case.
- L6 harness: locator.click blocked by overlay host; fixture placement; one session per send.

## Correction (Andrew, 2026-09-23)
- "Why are you using 5.6 terra, you should be using GPT 6 terra. Also, Opus 5.5 is out, we should use it too." Legs L1–L6, L11 ran on gpt-5.6-terra; lesson: codex legs default to the GPT-6 tier. Probe on codex 0.156.1: gpt-6-terra not supported on the ChatGPT account; gpt-6-sol and gpt-6-astra are. claude-opus-5-5 needs Claude Code ≥ 2.1.280 (installed 2.1.278). Memory: feedback-legs-on-gpt6-tier-and-opus-5-5.

## L10 (Astra adverse pass) applied — 1dce362
- 10 findings; 1–8 and 10 fixed with a failing test observed first. #5 background-image descendant wrappers and #9 path-route thumbnail left open as deviations.
- Also 75d7651 (path-drop test writes its fixture under the session project dir) and 473c794 (isWithin realpaths the project dir; macOS /tmp symlink).
- Overlay regression at 1dce362: 172/172 (S/L10.overlay-all.log). Full suite at 1dce362 (S/final3.log): 1772 tests, 1769 pass, 0 fail, 3 skipped, exit=0; skips at log lines 121/885/886 = baseline three. Delta over baseline +42 = 14 bridge + 22 overlay + 6 grab-attachments unit tests (names diffed against baseline.log).

## Falsification pass (claude-opus-5-5, report-only, S/opus55.log) — VERDICT claim holds, P1 none
- Fixed in 1f2a386, each with a failing test observed first (bridge suite 18/18 after, grab-attachments 6/6, overlay attachments 22/22 in S/overlay4.log):
  P2.1 prune removed any old directory under RAVEN_GRAB_INBOX → only `^[0-9a-f]{8}$` names; dedupe hit now touches the session dir mtime so a sibling session's prune cannot remove a live inbox.
  P2.2 no per-session cap → /attachment refuses the 33rd record with 413 (MAX_SESSION_ATTACHMENTS = 32).
  P3.1 stored name kept any extension → stored name always ends with the sniffed type's extension (evil.html → evil.png, image → image.png); contradicting image extensions still 415.
  P3.3 path route existence oracle → containment checked before existence; 404 no longer echoes the path.
- Left open (report in handoff): P3.2 gradient background-image counts as kind "background"; P3.4 realpath→read race on the path route; P3.5 non-ASCII names sanitise to "-"; P3.6 shell-escaped/quoted pasted paths fail; P3.7 fetch-shim path reads the body before the size check (in-process only).

## Cleanup done
- test/_live-attachments.mjs deleted; worktrees att-L10 and the first raven-mcp-att-final removed. Untouched: /tmp/wt-p4, release-marketing-preview.

## Per-leg model / cost
L1–L6, L11 (finish) gpt-5.6-terra $0 marginal (Codex sub; Andrew's correction: should have been GPT-6 tier); L7, L8 gpt-6-sol/gpt-5.6-sol $0; L9, L10 gpt-6-astra $0; L11 deepseek $0.0103 (truncated); L12 deepseek $0.0045; map kimi-k3 $0.021; falsification claude-opus-5-5 (Anthropic). Total paid: $0.036.

## Batch 2 (2026-09-23): docs/spec-grab-attachments-followups.md, committed f848010
Goal: implement items 1, 3, 4, 5a, 5b via four codex legs; orchestrator applies, builds, runs loopback + Chromium suites, mirrors, live check, one Opus 5.5 falsification pass. Not pushed.
Scratch: S/fu (prompts L{A,B,C,D}.prompt, logs L*.log, reports L*.last.md, live page S/fu/live).
Legs (worktrees .worktrees/fu-A..D detached at f848010, node_modules symlinked):
| A | gpt-6-luna | src/grab-inbox.ts + test/grab-inbox-followups.test.mjs | items 4, 5a, 5b-bridge | running |
| B | gpt-6-luna | src/grab-bridge.ts + test/grab-bridge-thumb.test.mjs | item 1 GET | running |
| C | gpt-6-sol | browser/raven-grab.js + test/grab-overlay-followups.test.mjs | items 1, 3, 5b overlay | running |
| D | gpt-6-luna | src/index.ts + CHANGELOG.md | item 3 text | running |
Next: as each lands, `git -C .worktrees/fu-X diff HEAD --stat`, read the diff, apply with `git -C fu-X diff HEAD | git apply` in att-main, build, run node-only suites; after all four: mirror cp+cmp, overlay suites, live check (S/fu/live), full suite in a sibling worktree, commit explicit paths, Opus 5.5 pass, handoff.

### Batch 2 checkpoint (post-compaction, 2026-09-23)

- Leg D (gpt-6-luna) applied: CHANGELOG + three protocol sentences in src/index.ts. No test from the leg; orchestrator adds the assertion in test/grab-bridge.test.mjs.
- Leg A (gpt-6-luna) applied: O_NOFOLLOW open, ~/ expansion, NFC record name, ASCII disk name. Orchestrator fixes: sanitizeFilename now splits stem/extension (a non-ASCII stem on .jpeg becomes attachment.jpeg, not jpeg.jpg); recordName falls back to the disk name when empty. Two assertions added to test/grab-inbox-followups.test.mjs.
- Legs B (gpt-6-luna, bridge GET /attachment) and C (gpt-6-sol, overlay) exited 0; diffs not yet read or applied.
- Next: read B and C diffs, git apply --check, build, node-only suites, mirror cp+cmp, overlay suites, live Chromium check on scratchpad fu/live, full suite in sibling worktree, commit explicit paths, Opus 5.5 falsification.
