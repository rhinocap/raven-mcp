# 2026-09-22 — grab image attachments (spec docs/spec-grab-image-attachments.md)

Branch: feat/grab-image-attachments (worktree .worktrees/att-main). Do not push.
Scratch: /private/tmp/claude-501/-Users-accunliffe-projects/c3c886ec-f9cd-49c0-b040-0caf7d3f1bdf/scratchpad/att (prompts, logs, patches, L11/L12 json).
Baseline: npm test 1730 tests, 1727 pass, 3 skipped (baseline.log).

## Commits so far
- 6d48d60 contract stubs src/grab-attachments.ts + src/grab-inbox.ts
- 150fb95 L4 (Terra) imageTarget + STYLE_PROPERTIES in browser/raven-grab.js
- L2 (Terra) src/grab-bridge.ts + orchestrator 413 fix (Connection: close, destroy on finish)
- L1 (Terra) src/grab-inbox.ts bodies
- L12 (deepseek v4.1-flash, $0.0045) test/fixtures/attachments/*

## Leg table
| leg | model | file(s) | status |
| L1 | gpt-5.6-terra | src/grab-inbox.ts | done, applied |
| L2 | gpt-5.6-terra | src/grab-bridge.ts | done, applied |
| L3 | gpt-5.6-terra | browser/raven-grab.js (composer drop/paste/chips) | running, worktree att-L3 |
| L4 | gpt-5.6-terra | browser/raven-grab.js (imageTarget) | done, applied |
| L5 | gpt-5.6-terra | test/grab-bridge-attachments.test.mjs | prompt written (S/L5.prompt), not launched |
| L6 | gpt-5.6-terra | test/grab-overlay-attachments.test.mjs | after L3 |
| L7 | gpt-6-sol | src/index.ts | prompt written (S/L7.prompt), not launched |
| L8 | gpt-6-sol | web/public/raven-grab.js + CHANGELOG.md | after L9 |
| L9 | gpt-6-astra | raven-grab.js lifecycle | after L3 + L6 |
| L10 | gpt-6-astra | adverse read-only pass | last |
| L11 | ow-run deepseek | src/grab-attachments.ts + test/grab-attachments.test.mjs | running (S/L11.json) |
| L12 | ow-run deepseek | fixtures | done |
| map | ow-run kimi-k3 ($0.021) | collision map review | done |

## Known deviations (report in handoff)
- L3/L4/L9/L8 sequential on one file; L1/L2 split by contract stub.
- PNG dims from IHDR, no pngjs.
- naturalWidth/Height null for non-img kinds.
- origin strict "drop"/"paste"; path route sets "path".
- spec says resolved path must equal realpath: on macOS /tmp and /var/folders are symlinks, so tests must realpathSync their mkdtemp dirs.

## Next commands
1. wait L11 → extract blocks from S/L11.json → npm run build → node --test test/grab-attachments.test.mjs → commit.
2. launch L5 (Terra) + L7 (Sol) in fresh worktrees from feat HEAD.
3. L3 lands → git diff HEAD browser/raven-grab.js in att-L3 → apply → node --check → commit → L6.
4. L9 → L8 (cp + cmp) → L10 → fixes with GLM mutants.
5. nohup env RAVEN_NO_USAGE_LOG=1 npm test > S/final.log; live Chromium check; chip screenshot.

## Open questions (defaults, left for Andrew)
Q1 inbox at ~/.raven/grab-inbox (implemented). Q2 no blob live-preview in v1. Q3 cap 4 kept.
