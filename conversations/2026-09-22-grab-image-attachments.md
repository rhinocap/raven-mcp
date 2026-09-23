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

### Batch 2 committed (2026-09-23)

- d980422: items 1, 3, 4, 5a, 5b. Legs A/B/D gpt-6-luna, C gpt-6-sol; orchestrator fixes to sanitizeFilename (stem/extension split) and the record-name fallback; protocol assertion added to test/grab-bridge.test.mjs inside the start_grab_session MCP test (the first placement, on the batch-commit drain, asserted the wrong protocol string and failed).
- Verification: node suites 321/318/0/2 (grab-bridge, attachments, thumb, inbox followups); overlay suites 30/30; live Chromium check on scratchpad fu/live: gradient false, url() true, layered true, img kind; four pastes (quoted, escaped, ~/, double-quoted) reached ready chips with NFC names and bridge thumbnails (naturalWidth 16), GET direct 200 image/png no-store, unknown id 404, no page errors; chip screenshot viewed. Full suite from sibling worktree raven-mcp-att-final: 1792/1789/0/3 exit 0 (was 1776/1773/0/3).
- Observed: same bytes pasted under two names dedupe to one disk file (batch-1 sha dedupe); each record keeps its own name. Noted as an open item, not changed.
- Falsification on claude-opus-5-5 launched (scratchpad fu/opus55.log). Leg worktrees fu-A..D removed.

### Batch 2 falsification (claude-opus-5-5, cold context, report-only)

Verdict: "Claim fails" on three points; all three fixed, each with the test observed failing first.

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | P1 | FIFO named *.png hangs the bridge: stat pre-check removed, openSync blocks for a writer | Fixed: open with O_NONBLOCK; fstat refuses non-regular files. Test hung the runner pre-fix (killed), passes post-fix |
| 2 | P2 | Final-component symlink test passes without the change (realpath check fires first) | Mapping extracted to exported attachmentOpenError and tested (ELOOP/EMLINK 400, EACCES/EPERM 403, else 404); symlink test now asserts ELOOP from openAttachmentFile. The route-level ELOOP path is only reachable by a race and stays untested by design |
| 3 | P2 | Chip original name and file-chip blob thumb untested | Two overlay assertions added (name on path chip; blob: thumb kept on a file chip) |
| 4 | P3 | .png -> png.png; 80-char stem can end in . or -; spec said Caf-.png | Fixed (dot >= 0; trim after cut); spec examples updated to Caf.png |
| 5 | P3 | EACCES reported as 404 | Fixed via attachmentOpenError (403) |
| 6 | P3 | Backslash unescaped inside single quotes | Fixed: single quotes literal, double quotes unescape only \" and \\, unquoted unescapes all; two overlay cases added |
| 7 | P3 | SVG served without nosniff/CSP; whole-file sync read per fetch | Headers added (nosniff; CSP default-src 'none'; sandbox) and asserted. Sync read left as an open item |
| 8 | P3 | Carried chips persist thumbUrl with key into sessionStorage; stale after restart | Open item |
| 9 | P3 | Proxy protocol branch lacked the gradient sentence | Fixed; asserted in the proxy MCP test |
| 10 | P3 | Tilde test could pass via project containment | Fixed: fixture under ~/Library/Caches, project dir elsewhere |

### Batch 2 closed (2026-09-23)

- Fix commit after the falsification pass; full suite from the sibling worktree 1798/1795/0/3 exit 0 (batch start 1776/1773/0/3; +22 tests). Overlay followups 11/11, live Chromium check green on all four carriers and four paste forms. Sibling worktree removed.
- Open items: bridge thumbnail read is whole-file and synchronous per fetch; carried chips persist a keyed thumbUrl into sessionStorage and go stale after a session restart; same bytes under two names dedupe to one disk file; the route-level ELOOP mapping is reachable only by a symlink race.
- Not pushed.

## Batch 3: open items (2026-09-23)

Spec fdd15f5 docs/spec-grab-attachments-open-items.md. Legs in .worktrees/oi-E (gpt-6-luna: inbox dedupe + open-first symlink), oi-F (gpt-6-sol: overlay blob hydrate + memo without thumbUrl), oi-G (gpt-6-luna: streamed GET /attachment). Logs in scratchpad oi/L{E,F,G}.log. Live check extended (scratchpad oi/live-check.mjs): counts GET /attachment per chip, reloads, screenshots chips after reload. Next: read diffs, apply, build, mirror, suites, live check, mutation check for D, full suite in sibling worktree, commit, Opus 5.5 falsification.
- E applied (leg self-reported "GPT-6 Astra"; launched with -m gpt-6-luna): exact-name dedupe, parent-only realpath, open-first symlink refusal. Mutation check: with O_NOFOLLOW removed from dist, both symlink tests fail (2/9); restored by rebuild. The batch-1 bridge test "same bytes under two names dedupe to one inbox file" encoded the old behaviour and was rewritten to per-name dedupe.
- G applied (gpt-6-luna): GrabResponse.file, createReadStream pipe in the HTTP handler, readFileSync in the sandbox shim, 4 MiB PNG streamed test. Node suites after E+G: 327/325/0/2.
- F (gpt-6-sol) still running.

### Batch 3 checkpoint (after compaction, leg F landed)

- Leg F (gpt-6-sol) exit 0; diff applied to att-main and mirrored to `web/public/raven-grab.js`. Orchestrator edit: restored draft attachments filtered to `state === "ready"`.
- Spec B premise correction: `serializeLivePending` never stored `thumbUrl` (the payload maps attachments to `{ id }`); the key leaked through `entry.endpoint = bridgeUrl("/grab")`. F stores `"/grab"` and resolves at drain; older keyed endpoints still drain verbatim. F also adds same-page composer resume for an attachment-only carried draft (one draft, first match), which is what "reload restores blob thumbs" needs.
- Dirty, uncommitted: src/grab-bridge.ts, src/grab-inbox.ts, browser/raven-grab.js, web/public/raven-grab.js, test/grab-bridge-attachments.test.mjs, test/grab-bridge-thumb.test.mjs, test/grab-inbox-followups.test.mjs, test/grab-overlay-followups.test.mjs.
- Next: overlay suites (`$S/oi/overlay-F.log`), node suites, live check (`node $S/oi/live-check.mjs "$S/fu/live" "$S/oi"` with the `~/Library/Caches/raven-live-check` fixture), full suite in `raven-mcp-att-final`, commit explicit paths, Opus 5.5 falsification, remove oi-* worktrees, handoff.

### Batch 3 committed: b6ff46c

- Orchestrator fix on top of leg F: `hydrateAttachmentThumb` skipped chips no longer owned by any draft (a detached draft carried and dropped mid-hydrate leaked a blob URL; found by the batch-1 lifecycle test "active multi-select draft detached during upload keeps its context in the carried attachment"), and hydrate now runs before persist/render in `attachmentRecordFromResponse`. Regression test "a thumbnail that arrives after its chip was removed creates no blob URL" fails without the guard (mutation check).
- Suites: overlay 36/36/0/0; node bridge+inbox 321/319/0/2; live check four chips blob thumbs before and after reload, one GET per chip each side, memo has no key, direct GET 200 image/png no-store, unknown id 404, no page errors; full suite in raven-mcp-att-final 1804/1801/0/3 (was 1798/1795/0/3).
- Leg worktrees oi-E/F/G removed after their diffs were saved to the scratchpad. Sibling raven-mcp-att-final kept until the falsification pass closes.
- Falsification: claude-opus-5-5 report-only on b6ff46c, log `$S/oi/opus55.log`.

### Batch 3 falsification (claude-opus-5-5, cold context, report-only on b6ff46c)

Verdict: "Claim fails" (stored drafts still carried inbox paths with 32 bits of the key; the item A and ENOENT tests passed without their changes).

| # | Sev | Finding | Action |
|---|-----|---------|--------|
| 1 | P2 | Carried `draft.attachments` stored full records (path with key prefix, sourcePath, sha256) | Fixed: whitelist {id,name,mime,bytes,width,height,origin,state}; test asserts the memo has none of them and the endpoint is `/grab` |
| 2 | P2 | Item A test passed with `readFileSync` | Fixed: 256 MiB sparse file streamed while `process.memoryUsage().arrayBuffers` growth stays under 64 MiB; mutation (buffer instead of stream) grows by 352 MB and fails |
| 3 | P2 | Missing parent directory returned 400, not 404 | Fixed: realpath ENOENT/ENOTDIR maps to 404; test fails under mutation |
| 4 | P2 | No tests for `/grab` drain resolution, style-edit entries not resuming, unresolvable selector | Fixed: drain-across-navigation test (key present on the bridge POST), style-edit entry stays a carried row (seeded via `addInitScript` because pagehide re-persists); both fail under mutation. Unresolvable selector and two matching entries left untested (documented behaviour: first match resumes, others stay frozen) |
| 5 | P2 | Resume calls `selectTarget`, which opens the panel on load | Accepted as designed: the acceptance line "reload restores blob thumbs" needs the composer; panel state is not persisted, so there is no closed state to respect. Reversible by deleting the resume block |
| 6 | P3 | Dedupe dropped the size check; stale comment | Fixed: size must match too; test forges a mismatched file under the exact name |
| 7 | P3 | Content-Length from path `stat`, not `fstat` | Fixed: route opens the fd, `fstat`s it, streams from it; `res` close destroys the stream; shim reads and closes the fd |
| 8 | P3 | Blob leak if `renderPanel` throws after `createObjectURL` | Fixed: catch calls `revokeAttachmentThumb` |
| 9 | P3 | Legacy stored entries keep the keyed endpoint | Fixed: `readCarriedPending` rewrites `/grab?key=` endpoints to `/grab` |
| 10 | P3 | Failed thumbnails refetch on every reactivation | Fixed: `thumbFailed` marker; test counts one GET across reactivation and fails under mutation |

### Batch 3 closed: aab3fc8

- Falsification fixes committed as aab3fc8 on top of b6ff46c. Full suite in raven-mcp-att-final 1811/1808/0/3. Sibling and oi-* worktrees removed. Not pushed.
- Open: two carried entries matching the same page (first resumes, rest stay frozen rows); an unresolvable resume selector (kept as a carried row, untested); resume opens the panel on reload (design decision, reversible by deleting the startup resume block).
