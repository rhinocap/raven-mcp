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
| L8 | gpt-6-sol | web/public/raven-grab.js + CHANGELOG.md | after L9 |
| L9 | gpt-6-astra | raven-grab.js lifecycle | running, worktree att-L9 |
| L10 | gpt-6-astra | adverse read-only pass | last |
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

## Next commands
1. L9 lands → `git -C ../att-L9 diff HEAD browser/raven-grab.js test/grab-overlay-attachments.test.mjs` → apply → node --check → node --test overlay attachments + voice-input → commit → drop worktree.
2. L8 (Sol, prompt S/L8.prompt): cp + cmp + CHANGELOG → commit.
3. L10 (Astra, read-only, prompt S/L10.prompt) on a frozen worktree → fix each finding with test + mutant → commit.
4. Final: worktree outside repo tree, `nohup env RAVEN_NO_USAGE_LOG=1 npm test > S/final.log`; live Chromium check on S/live/index.html; chip screenshot; handoff.

## Open questions (defaults, left for Andrew)
Q1 inbox at ~/.raven/grab-inbox (implemented). Q2 no blob live-preview in v1. Q3 cap 4 kept.

## Orchestrator fixes so far (each with a test and an observed mutant)
- 1bb5053 bridge body reader: for-await early return destroyed the request (ECONNRESET before 413). Test: oversized multipart case.
- cb358c0 overlay: payloadForSend omitted imageTarget; img inside picture reported kind img. Test: overlay send case.
- L6 harness: locator.click blocked by overlay host; fixture placement; one session per send.
