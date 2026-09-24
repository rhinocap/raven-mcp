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

### Merged and pushed: ec22ca2 (2026-09-23)

- Andrew: "Keep the reload resume, merge to main and push". Resume block kept (finding 5 stands as designed).
- Merge commit ec22ca2 on main; full suite on main 1811/1808/0/3; pushed 974934a..ec22ca2, origin/main = ec22ca2. Feature branch and worktrees removed.
- Vercel `site` production deployment site-d80zb8tvt Ready (43s), alias mcp.ravenmcp.ai. Post-push anon `tools/list`: 45 tools, hash f64bb18…2bb0a6 unchanged.
- https://ravenmcp.ai/raven-grab.js still serves the pre-merge overlay (794426 B, last-modified 2026-09-12, 0 × `hydrateAttachmentThumb`; repo mirror 820422 B, 4 ×). Apex is the `web` project, no git integration; it only moves on `cd web && vercel deploy --prod`. Not run: a separate prod deploy needing its own approval. Local bridges serve `browser/raven-grab.js` directly, so the npm/stdio path carries the new overlay once released; npm untouched (still 2.5.1).

### Web deploy, npm question, release attempt (2026-09-23)

- Andrew: "Deploy web". `cd web && vercel deploy --prod --yes` → deployment web-mktn3kvk5, aliased to https://ravenmcp.ai, EXIT=0. https://ravenmcp.ai/raven-grab.js now 820422 B and `cmp`-identical to `browser/raven-grab.js`.
- Andrew: "WE need to deploy to NPM too right?" — yes; npm was still 2.5.1 and the stdio/local bridge path only carries the new overlay once released. Recommended a minor bump.
- Andrew: "release minor". Dispatched `gh workflow run release.yml --field bump=minor` (the guard blocks `-f`). Run 35924157062 (headSha 4762706) FAILED at "Run tests (release gate)" before any publish: CI suite 1811 tests / 1807 pass / 1 fail / 3 skipped. npm still 2.5.1, tags v2.5.0/v2.5.1 only, origin/main = 4762706.
- Sole failure: `path route expands ~/ inside home but containment still refuses ~/../` in `test/grab-inbox-followups.test.mjs:105`. The fixture is `fs.mkdtempSync(path.join(os.homedir(), "Library", "Caches", "raven-tilde-test-"))`; `~/Library/Caches` exists only on macOS, so the ubuntu runner throws `ENOENT … mkdtemp '/home/runner/Library/Caches/raven-tilde-test-XXXXXX'`. Test-only defect; `src/grab-inbox.ts` unchanged.
- Fix: create the fixture directly under `os.homedir()` (`.raven-tilde-test-` prefix), keep the `relative.startsWith("..") === false` precondition. Then full suite locally, commit, push main (test-only; anon surface unaffected), re-dispatch bump=minor.

### Release 2.6.0: partial after run 35924989866 (2026-09-23 ~21:57Z)

- Pushed `ae788e4` to `main` under "release minor": test-only fixture fix in `test/grab-inbox-followups.test.mjs` (tilde fixture directly under `os.homedir()`, since `~/Library/Caches` does not exist on the Linux release runner). Full suite on main measured 1811/1808/0/3 before and after.
- Run 35924989866: test gate PASSED. "Cut release" FAILED after `npm publish` of `raven-mcp@2.6.0` SUCCEEDED (shasum `d475d12faf9b1e0e84b2300ef64cc9ecdd435f70`, 237 files, sigstore logIndex 2926397217). The shasum read-back could not see the version and the MCP Registry publish failed 3× with 400 "version '2.6.0' was not found (status: 404)" because npm had not propagated yet. release.sh declared a resumable partial release.
- Surfaces at that point: npm 2.6.0 published but not yet visible; Registry NOT updated; no v2.6.0 tag on origin; no version-bump commit (origin/main = ae788e4, package.json 2.5.1); no GitHub Release; changelog not rebuilt; apex .mcpb not deployed.
- 21:59Z: `npm view raven-mcp@2.6.0 dist.shasum` = `d475d12f…` and dist-tags.latest = 2.6.0. Propagated.
- Resume path: `resume_version` requires an existing tag (`detect-release-scope.mjs`: "A resume FINISHES an existing release; it can never create one"), so it does not apply. Plan: re-dispatch `bump=minor`; release.sh detects 2.6.0 on npm, checks `npm pack --dry-run` shasum against the published one, and resumes through the Registry, commit, tag, push, GitHub Release, changelog and apex deploy.

### Release 2.6.0 complete: run 35925801655 (2026-09-23 22:00–22:06Z)

- Re-dispatched `gh workflow run release.yml --field bump=minor` on ae788e4 after npm propagation. Run 35925801655 conclusion success: preflight 25s, release 22:00:36–22:05:38Z, notify 15s (release email sent).
- release.sh resumed rather than republished. Log lines: "raven-mcp@2.6.0 is already on npm — resuming a partial release." and "published artifact matches this tree (d475d12faf9b1e0e84b2300ef64cc9ecdd435f70) — continuing." No registry retry lines; the Registry publish succeeded on attempt 1.
- Four surfaces measured live at ~22:07Z:
  | Surface | Measured |
  |---|---|
  | npm | 2.6.0, dist-tags.latest 2.6.0, time.modified 2026-09-23T21:57:54.935Z, shasum d475d12f… |
  | MCP Registry | ai.ravenmcp/raven-mcp 2.6.0 isLatest true, updatedAt 2026-09-23T22:04:08Z; 2.5.1 isLatest false |
  | git tag | v2.6.0 on origin at 1a5e5631d27543383088beb00172c6aa6ff3b1bb ("Release v2.6.0"); origin/main a3134d8 ("Update changelog for v2.6.0") |
  | apex .mcpb | 200, last-modified 22:06:30 GMT, 5,495,018 B, sha256 f1236e7aaf549ddda7d7ce45eb2882b31cdc62e20f2b1ffd0058c094c19a2343 (matches the workflow's own "apex .mcpb verified" line); manifest from the downloaded bytes = 2.6.0 / 111 tools |
  | anon surface | 45 tools, hash f64bb18…2bb0a6 exact match, measured after the workflow's changelog push to main |
- Pushes to main this release: ae788e4 (test-only fixture fix, by me under "release minor"); 1a5e563 and a3134d8 (by the workflow). The session-log commit stays local (main ahead 1).
- Opus falsification pass on the release claim dispatched; disposition recorded below when it returns.

### Opus falsification pass on the release claim: DOES NOT SURVIVE in full

The four surfaces, the no-republish claim, the tag contents (six files, both .mcpb blobs identical, sha f1236e7a…), the Registry first-attempt publish, the site production deployment built from a3134d8, and the anon 45/f64bb18… all held. Criterion 5 (nothing stale or wrong) failed, verified by me against the live artifacts:

- P1: the release broadcast (Resend id 611912ef…, sent by the notify job of run 35925801655) carries the GitHub Release body verbatim: 78 lines, about 70 raw commit subjects including session-log and auto-save commits. `scripts/notify-release.mjs` creates and sends a Resend broadcast; it cannot be recalled. Run 35924989866's notify job was skipped, so exactly one email went out. v2.5.1 used the same body format but a patch release sends no email; 2.6.0 is the first time this format reached subscribers.
- P2: the email's "Read the full changelog" button (`notify-release.mjs:111`) links https://ravenmcp.ai/changelog.html, which is the `web` project's page built from `web/data/changelog.json`, whose newest entry is v2.5.0 (2026-08-17). The workflow's "Rebuild changelog page" step (`release.yml:447`, `scripts/build-changelog.mjs`) writes only `site/changelog.html`, served at mcp.ravenmcp.ai. Pre-existing gap (2.5.1 is missing too), now behind a link sent to every subscriber.
- P3: commit 1a5e563 shows a failed "Vercel – site" status because its deployment was cancelled in favour of a3134d8 five seconds later. Cosmetic.

Not fixed in this session: a correction email is Andrew's call (customer-facing send), and changing the release-notes source, the changelog data, and an apex redeploy are new scope beyond "release minor".

### /goal: release notes + apex changelog pipeline (decision 2)

Andrew: "Wite yourself a /goal to do 2 and then execute". Decision 2 = generate the Release body and email from curated notes instead of `git log`, and have the changelog step also write web/data/changelog.json plus an apex redeploy.

Root causes, verified in source:
- P1: `scripts/detect-release-scope.mjs:298` falls back to raw `git log --oneline` subjects when no merged PR lands in a section. This repo ships by direct push, so that fallback is the normal path, and the v2.6.0 / v2.5.1 Release bodies and the 2.6.0 email are that output.
- P2: `release.yml` "Rebuild changelog page" runs `scripts/build-changelog.mjs`, which writes only `site/changelog.html` from GitHub Releases. `web/data/changelog.json` (the apex `/changelog` source) and `CHANGELOG.md` are never written by the pipeline. `scripts/gen-changelog-html.mjs` is a second producer of `site/changelog.html` from changelog.json, unreferenced by the workflow.
- The detector comment claiming "CHANGELOG.md is written by `release.sh` BEFORE the tag" is false: release.sh mentions CHANGELOG only in comments (:275, :319) and never writes it.
- `RESUME_SAFE_PATHS` holds `site/changelog.html` and `CHANGELOG.md`; once the pipeline commits `web/data/changelog.json` after the tag, that path must be in the set or every rerun cuts a spurious version.
- `scripts/check-site-drift.mjs:251–280` requires CHANGELOG.md's first `## [X]` and changelog.json `releases[0].version` to match (both 2.5.0 now). A promote must write both in one pass.
- `scripts/prepare-marketing-preview.mjs` becomes a no-op once changelog.json holds the version.
- `notify-release.mjs:111` links `https://ravenmcp.ai/changelog.html`; `renderNotes` trims every line and closes the list on a blank line, so indented continuation paragraphs inside a bullet break the list, and plain paragraphs are not run through `inline()`.
- No tests reference detect-release-scope / notify-release / build-changelog / gen-changelog-html. v2.5.0 has no GitHub Release. Tag dates: v2.6.0 2026-09-23T22:04:08Z, v2.5.1 2026-08-22T23:28:52Z.

Spec:
1. `scripts/lib/release-notes.mjs`: pure functions — parse `[Unreleased]` from CHANGELOG.md, render the Release body, promote CHANGELOG.md, build the changelog.json entry.
2. `scripts/promote-changelog.mjs`: CLI that writes `## [X.Y.Z] - date` into CHANGELOG.md and prepends the entry to changelog.json in one pass.
3. detect-release-scope.mjs: notes come from Unreleased; no raw git log fallback; empty Unreleased fails a minor/major, patch gets a short maintenance body; changelog.json joins RESUME_SAFE_PATHS; fix the false comment.
4. release.yml: changelog step runs promote + build-changelog, commits CHANGELOG.md, changelog.json and site/changelog.html before the existing apex deploy.
5. notify-release.mjs: link `/changelog`; continuation paragraphs stay in their `<li>`; `inline()` on paragraphs.
6. Data: promote Unreleased → 2.6.0 (2026-09-23) in both files; `npm run check:site` passes.
7. `test/release-notes.test.mjs`; full suite from 1811/1808/0/3.

Not authorized in this turn: pushing main, apex deploy, workflow dispatch, `gh release edit v2.6.0`, any email send.

Design refinements before the first edit (post-compaction checkpoint):
- Notes body = the `[Unreleased]` sections verbatim; `### Added/Changed/Fixed` map to the email's uppercase labels through the existing h3 handling. No git log anywhere.
- `web/data/changelog.json` `changes[]` are plain text (ChangelogFeed renders raw strings), so bold/backticks/links are stripped from each bullet's lead paragraph; continuation paragraphs stay out of the entry.
- Entry meta comes from an optional `<!-- web: category=… kind=… title="…" -->` line under `## [Unreleased]`; kind defaults major→new, minor→feature, patch→fix; category defaults tooling. The comment is stripped from the Release body and from the promoted CHANGELOG.md section.
- A patch with an empty `[Unreleased]` promotes nothing (both files unchanged, matching v2.5.1's absence) and gets a short maintenance body. A minor/major with an empty block fails the detector with `::error::`.
- `renderNotes` moves into `scripts/release-notes.mjs` so it is testable; `notify-release.mjs` imports it.
- Promote CLI derives the bump from the version when `--bump` is absent (a resume has no bump output).

### Checkpoint (post-compaction, decision 2 in progress)

- Created `scripts/release-notes.mjs` (parse/promote/render module) and `scripts/promote-changelog.mjs` (CLI).
- Patched `scripts/detect-release-scope.mjs` (notes from CHANGELOG.md via `releaseNotesFor`; commit-subject fallback deleted; RESUME_SAFE_PATHS gains `web/data/changelog.json`; false :182–186 comment rewritten), `scripts/notify-release.mjs` (imports `escapeHtml`/`renderNotesHtml`; local copies deleted; link → `/changelog`), `.github/workflows/release.yml` (new "Promote CHANGELOG.md + changelog.json" step before the rebuild; `git add` covers all three files).
- Ran `promote-changelog --version 2.6.0 --bump minor --date 2026-09-23`: CHANGELOG.md now has `## [2.6.0]`, changelog.json has the v2.6.0 entry (16 changes, kind feature). Second run found the CLI erroring on "[Unreleased] is empty" — resume idempotence bug; fixed by checking the version heading before the empty check. Re-run reports "already carry this release".
- CHANGELOG.md line 5 rewritten: this file is the curated source; link → `https://ravenmcp.ai/changelog`.
- Next: `test/release-notes.test.mjs`, `npm run check:site`, `npm run marketing:preview`, full suite, commit by pathspec. No push, no apex deploy, no email, no `gh release edit`.

## Checkpoint 2026-09-23 — decision 2 (curated release notes), tests green

- `test/release-notes.test.mjs` written: 13 tests, 13 pass after loosening the issue linker in `scripts/release-notes.mjs` (`(^|[\s(])#N` so `(#123)` links).
- `lastTag` in detect-release-scope.mjs verified defined before the log line.
- Next: `npm run check:site`, `npm run marketing:preview`, full suite (`RAVEN_NO_USAGE_LOG=1 npm test`, baseline 1811/1808/0/3 + 13), commit by pathspec, Opus falsification pass. No push, no apex deploy, no Release edit, no email without approval.

## Checkpoint 2026-09-23 — decision 2, full suite green, Opus pass in flight

- Full suite (`RAVEN_NO_USAGE_LOG=1 npm test`, log `$SP/full-suite-release-notes.log`): 1824 tests / 1821 pass / 0 fail / 3 skipped, `EXIT=0` read from inside the log. +13 over the 1811/1808/0/3 baseline is exactly `test/release-notes.test.mjs`.
- `npm run check:site` → FAIL on one pre-existing item: COVERAGE, `web/components/tools/ToolsSection.tsx` lacks `design_gauntlet` (file last touched 2026-08-12, not in this diff). CHANGELOG section (CHANGELOG.md top `## [2.6.0]` == changelog.json `v2.6.0`) and BUNDLE (v2.6.0) both PASS. Not fixed — out of scope.
- `npm run marketing:preview` is not a check: it spawns codex, a worktree, `npm run build` and `next dev` and never exits. Started by mistake in a chained command, stopped; no leftover processes; pre-existing worktrees untouched.
- Opus (`claude-opus-5-5`) report-only falsification pass launched on the uncommitted diff.
- Remaining: disposition Opus findings, commit by pathspec (9 files) with the session trailer, report "committed locally, not yet pushed". No push, no apex deploy, no `gh release edit`, no email without approval.

## Opus falsification result (decision 2, pre-commit) — DOES NOT SURVIVE

P2 findings and dispositions:
1. Live state (apex /changelog at v2.5.0, v2.6.0 Release body = commit subjects) — expected, nothing pushed; approval-gated follow-ups.
2. Resume path never computes curated notes (`--generate-notes`) and never replaces a non-empty body — FIX: detector sets `notes` on both resume exits from the promoted `## [X]` block (or `[Unreleased]` if not yet promoted); existing non-empty body still untouched on resume — documented narrowing (public-Release rewrite stays a human `gh release edit`).
3. Stub-only `[Unreleased]` (`### Added` with no bullets) passes the minor guard — FIX: guard on `bullets.length`, test.
4. Half-promoted (md heading present, json lacks version) throws — FIX: back-fill json from the promoted block, test.
5. Explicit resume of an older version misfiles current `[Unreleased]` — FIX: refuse when version < top dated heading, test.

P3: CRLF normalise (fix), `#N`/links inside code spans (fix: placeholder code spans), nested bullets / h3 backticks / href scheme (accepted: curated input), raw `version` to promoteChangelogMd (fix: strip `v`), weak "never reads git" regex + vacuous assertion (fix), check:site design_gauntlet gap (pre-existing, report only).

## Checkpoint 2026-09-23 — Opus P2/P3 fixes applied, unit suite green, full suite running

- `scripts/release-notes.mjs`: `normalize()` (CRLF→LF), `parseReleaseBlock()`, `topReleasedVersion()`, `compareVersions()`; `releaseNotesFor` reads the promoted `## [X.Y.Z]` block when `[Unreleased]` is empty (resume) and refuses a minor/major on `bullets.length === 0` (a stub heading is not notes); `promoteChangelog` back-fills changelog.json from the promoted block on a half-done resume and refuses to file `[Unreleased]` under a version older than the top dated heading; `inline()` renders code spans first so `#N`/links inside them stay literal; link href restricted to `https?://`; `v` prefix stripped at every entry.
- `scripts/detect-release-scope.mjs`: `resumeNotes()` sets the `notes` output on both resume exits (explicit and implicit).
- `test/release-notes.test.mjs`: 18 tests / 18 pass / 0 fail. New: promoted-block preference on resume + `v` strip, CRLF, half-done resume back-fill, older-version refusal, code-span linking; "never reads git" now scans comment-stripped source and pins both detector resume exits to `resumeNotes(`.
- `node scripts/promote-changelog.mjs --version 2.6.0 --bump minor` on the real tree: "already carry this release — nothing to do (resume)", no writes. `releaseNotesFor("2.6.0","minor", CHANGELOG.md)` yields the curated 2.6.0 block, not commit subjects.
- Full suite running to `$SP/full-suite-release-notes-r2.log` (expect 1829/1826/0/3, EXIT=0).
- Next: read the suite log, commit the 9 files by pathspec, report "committed locally, not yet pushed". No push, no apex deploy, no `gh release edit`, no email without approval.

## Checkpoint 2026-09-23 — curated release notes (decision 2)

- Full suite before commit: 1829 tests / 1826 pass / 0 fail / 3 skipped, EXIT=0.
- Committed locally as `98c2d8b` (main 5 ahead of origin/main, NOT pushed): `scripts/release-notes.mjs`, `scripts/promote-changelog.mjs`, `scripts/detect-release-scope.mjs` (resumeNotes), `scripts/notify-release.mjs`, `test/release-notes.test.mjs` (18 tests), `.github/workflows/release.yml` (Promote step + changelog.json in git add), `CHANGELOG.md`, `web/data/changelog.json`.
- Opus falsification on 98c2d8b: DOES NOT SURVIVE.
  - P1: a resume promotes/reports `[Unreleased]` bullets that landed after the tag (patch with no block; minor that died at Create Release). Fix: tag-anchored source — notes for vV = `[Unreleased]` as it stood at tag vV (`git show vV:CHANGELOG.md`); promote splits current block into tagged (promoted) and remainder (new `[Unreleased]`).
  - P2: existing non-empty Release body never replaced on resume; `--generate-notes` and `gh release view` fallbacks still reachable. Fix: edit body on resume when curated notes exist; drop `--generate-notes`; notify computes from CHANGELOG.md, fails otherwise.
  - P3: leadParagraphs truncates on 2-space wrapped line; "Raven v" title skip too loose; `#N` linker nests anchors in emitted links; four stale release.yml comments; two surviving mutants (tagged-source, promoteChangelogMd idempotency).
- Blockers unchanged: push of main (= mcp.ravenmcp.ai deploy), `gh release edit v2.6.0`, decision-1 email, apex deploy all need fresh approval.

## Checkpoint 2026-09-23 — compaction, fix pass not yet started

State: `98c2d8b` committed on main (5 ahead of origin, not pushed). Opus post-commit falsification: DOES NOT SURVIVE (P1 tag-anchored notes source; P2 existing Release body never replaced on resume + `--generate-notes`/`gh release view` fallbacks; P3 leadParagraphs soft-wrap, title-skip regex, `#N` linker over anchors, four stale yml comments, two surviving mutants). Spec for the fix stated (7 lines). No source edit made yet.

Next: edit `scripts/release-notes.mjs`, `scripts/promote-changelog.mjs`, `scripts/detect-release-scope.mjs`, `scripts/notify-release.mjs`, `.github/workflows/release.yml`; add tests; `node --test test/release-notes.test.mjs`; full suite in background; commit by pathspec with trailer.

Blockers (approval-gated, untouched): push main (= mcp.ravenmcp.ai deploy, would auto-resume and rewrite v2.6.0's Release body once P2 lands); `gh release edit v2.6.0`; decision-1 correction email; `cd web && vercel deploy --prod`. `conversations/2026-09-23-client-overlay-goal.md` is another session's staged file — never in my commits.

## Checkpoint 2026-09-23 — fix pass started (post-Opus DOES NOT SURVIVE on 98c2d8b)
- Edits begun: `scripts/release-notes.mjs` gets tag-anchored source (`taggedUnreleased`, `subtractBody`, 4th param on `releaseNotesFor`, tag-aware `promoteChangelogMd`/`promoteChangelog`), tightened title-skip regex, `#N` linker that skips emitted anchors. Next: promote-changelog.mjs `--tagged-changelog`, detector `resumeNotes`, notify-release.mjs computing from CHANGELOG.md, release.yml (no `--generate-notes`, always `--notes-file`, empty notes → exit 1, drop notify `gh release view` fallback, 4 stale comments), tests.
- `leadParagraphs` P3 deliberately not applied: unindented line after a bullet is CommonMark lazy continuation; fixture's 2-space continuation must stay a continuation.
- No push, no apex deploy, no Release edit, no email.

- Checkpoint (fix pass, post-compaction): release-notes.mjs, promote-changelog.mjs, detect-release-scope.mjs (stray brace removed), notify-release.mjs (computes notes from CHANGELOG.md when env is empty), release.yml (Create Release: no --generate-notes, empty notes → ::error; resume always `gh release edit --notes-file`; notify drops `gh release view` fallback; Promote passes `git show vV:CHANGELOG.md`). Tests next. No push/deploy/email.

- Checkpoint (fix pass, post-compaction): five tests added to `test/release-notes.test.mjs` → `node --test` 23/23. Two mutants (taggedUnreleased→null; subtractBody→identity) each fail 2–3 tests, source restored byte-identical. CLI e2e in scratch dir with `--tagged-changelog`: promoted [2.6.0] = 16 tagged bullets, post-tag bullet stays under [Unreleased], changelog.json entry kind feature. Real repo `releaseNotesFor("2.6.0", …, git show v2.6.0:CHANGELOG.md)` → 35 lines, 0 commit-subject-shaped lines. Full suite running in background; next = commit the 7 files by pathspec (exclude `conversations/2026-09-23-client-overlay-goal.md`, another session's staged file). No push, apex deploy, Release edit or email.
- Full suite after the fix pass: 1834 tests / 1831 pass / 0 fail / 3 skipped, EXIT=0 read from inside `$SP/full-suite-fix.log` (+5 over the 1829 baseline = exactly the five new release-notes tests, confirmed by name at log lines 1561–1565). Committing by pathspec next.
- Commit `13cfef4` made (7 files, tag-anchored notes). Opus pass on it: SURVIVES, 1 P2 + 6 P3. P2: with a tagged copy the new [Unreleased] is built from `current.body`, which `parseBlock` has already stripped of `<!-- web: -->` lines, so a meta line written for the NEXT release is deleted. P3s: (2) subtraction attributes a duplicated line to the first heading from the top; (3) an edited shipped bullet stays under [Unreleased] and re-announces; (4) stub `[V]` + tagged bullets → `releaseNotesFor` rewrites the Release but `promoteChangelogMd` returns early and `promoteChangelog` throws; (5) no test pins promoted-with-bullets over tagged; (6) two vacuous wiring assertions (`--generate-notes` regex passes on any later backtick; `indexOf` -1 → 1-char slice); (7) `RELEASE_BUMP = "minor"` default does not apply to `""` — resend path yields `Raven vX —  release`. Plan: fix 1/4/5/6/7, accept 2/3 with a comment in `subtractBody`. Then focused suite, full suite, commit by pathspec. No push/deploy/Release edit/email.
- Fix pass on the 13cfef4 Opus findings, all seven dispositioned in code. #1 (P2) `parseBlock` returns `raw` (meta lines kept) and `promoteChangelogMd` subtracts on raw text, so a `<!-- web: -->` line written for the next release survives and identical meta is subtracted. #4 stub refill: a bullet-less `## [v]` heading with notes in the tagged copy is removed (`removeReleaseBlock`) and re-promoted keeping its own date; `promoteChangelog` gets a `stub` flag so it no longer throws. #5 test pins promoted-with-bullets over a differing tagged copy. #6 wiring test now line-based for `--generate-notes` (comment lines excluded, fixture asserts a comment still names it) and guards `indexOf === -1`. #7 `notify-release.mjs` derives `bump` via `RELEASE_BUMP || bumpFromVersion(RELEASE_VERSION)` so an empty resend env no longer renders "Raven vX —  release". #2/#3 accepted with a comment in `subtractBody` (first-occurrence attribution of duplicate lines; exact-text match re-announces a re-worded bullet). Focused suite 26/26/0/0 (one test regex updated because the promoted block now carries its meta line — intended). Full suite 1837/1834/0/3, EXIT=0 read from inside `$SP/full-suite-fix2.log`; +3 over 1834 = the three new tests by name at log lines 1564–1566; skips are the same three at 121/895/896. Real CHANGELOG.md through `promoteChangelog` → alreadyPromoted, md unchanged; `releaseNotesFor("2.6.0")` still 35 lines. Committing by pathspec next (4 files; `conversations/2026-09-23-client-overlay-goal.md` excluded). No push, apex deploy, Release edit or email.
- Commit `048bc76` made (4 files, 129+/19−). Opus pass on it: SURVIVES, 0 P1/P2, 7 P3; mutants M1–M8 all killed; reviewer reproduced the focused 26/26 but not the full-suite figure. P3s: (1) `subtractBody` acceptance text is silent on meta lines — an edited tagged `<!-- web: -->` stays under [Unreleased] and `parseWebMeta` first-match gives the NEXT release that title; (2) the promoted block uses `source.raw` even without a tagged copy, so any HTML comment in [Unreleased] moves into `## [v]` — unstated; (3) deleting `date = existing.date || date` in `promoteChangelogMd` passes all 26; (4) a hand-written `## [1.1.0] - TBD` stub gives entry.date "TBD"; (5) stub + pre-existing json entry with `changes: []` → md refilled but the empty json entry stays; (6) notify body says "A minor release" on a patch resend while the title says patch; (7) F7 checked by source regex only; full-suite figure is the author's own read. Plan: fix 3/4/5/6, extend comments for 1/2, state 7 in the report. No push/deploy/Release edit/email.
- Dispositions applied. Fixed: #3 (`.date === "2026-09-20"` asserted on the standalone `promoteChangelogMd` stub call), #4 (`keptDate` helper: a stub date is kept only when it is `YYYY-MM-DD`, at both sites), #5 (`prependChangelogJson` replaces an existing entry whose `changes` is empty, never a filled one), #6 (`releaseKindSentence(bump)` exported and used in the notify body). Accepted with comment: #1 (`subtractBody` doc lists the meta-line case), #2 (comment at the `source.raw` promotion). #7 stated in the report. Focused suite 29/29/0/0 (26 + 3 new). Each new test proven red under its own mutant in a scratch copy, radius 1: M3 (drop the stub-date keep), M4 (unchecked stub date), M5/M5b (never replace / always replace in prependChangelogJson), M6/M6b (patch reads minor; hand-written ternary back in notify), M3b (promoteChangelog stub path drops keptDate). Full suite `$SP/full-suite-fix3.log`: 1840/1837/0/3, EXIT=0 read inside the log; +3 over 1837 are the three new tests, confirmed by name at lines 1568–1570; skips unchanged at 121/895/896. Committing by pathspec (4 files; the other session's `2026-09-23-client-overlay-goal.md` and `test/fixtures/thumb-session-MtD26H/` excluded). No push, apex deploy, Release edit or email.

### Checkpoint — dispositions committed (c488771)
- `c488771` on main: scripts/release-notes.mjs, scripts/notify-release.mjs, test/release-notes.test.mjs, this log. 4 files, 84+/8−. main 9 ahead of origin/main, NOT pushed.
- Opus report-only pass launched on c488771 itself (the earlier SURVIVES covered 048bc76 only). Final report to Andrew waits on that verdict.

### Opus pass on c488771 — SURVIVES, 8 P3, dispositions
- #1 FIXED: half-promoted resume (`promoteChangelog` `promoted && !stub` path) copied `promoted.date` without `keptDate`; now routed through it. Test: TBD case added to the no-real-date test.
- #2 FIXED: `keptDate` now round-trips through `Date.UTC` so `2026-13-45` is refused and `2024-02-29` kept; tested both.
- #3 FIXED (test-side): the changes-less json fixture now sits at index 1, so replace-in-place is separable from move-to-front.
- #4 RESIDUAL, noted: a filled md block beside an empty json entry still returns `alreadyPromoted`; outside the stub fix, no run of the pipeline produces that pairing (the json write follows the md write in the same step).
- #5 FIXED (test-side): the negative regex now covers `'`, `"` and backtick and all three bump words.
- #6 FIXED: notify-release.mjs env comment names "patch" (reachable on a resend).
- #7/#8 no change: mutants independent; the empty-entry replace on the fresh path is intended.
- Mutants M1–M4 in `$SP/mut4`: each reddens exactly one named test, baseline 29/29 restored. Full suite running → `$SP/full-suite-fix4.log`.
- Full suite `$SP/full-suite-fix4.log`: 1840 tests / 1837 pass / 0 fail / 3 skipped (lines 121/895/896, same three), EXIT=0 read inside the log; the three edited tests confirmed run by name at lines 1568–1570.

## Push, Release edit, apex deploy (2026-09-23, approved "push, edit, and deploy. Don't send an email")

- Decision 1 resolved by Andrew: NO correction email. `scripts/notify-release.mjs` never run; no Resend/Outseta send.
- Pushed `a3134d8..727a24e` to `origin/main` (10 commits, 0 behind before push, no `src/` or `api/` path in the range). Endpoint deployment `dpl_2psU9nXZf8ZPcsFUi7uX6Yykuwxa` Ready; anon `tools/list` = 45 tools, sha256 `f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6` exact.
- `gh release edit v2.6.0` body = curated notes (`$SP/notes-2.6.0.md`, 35 lines from CHANGELOG [Unreleased] at the tag). Read-back `$SP/release-body-after.md` differs only by trailing newline; 0 raw `- <sha>` lines (was 78).
- Web deploy attempt 1 (`vercel deploy --prod --yes` from `web/`, `$SP/web-deploy.log`): `deploy_failed: Not authorized`, EXIT=1. `whoami` fine, same team; cause not established.
- Attempt 2 with `--scope cunliffeandrewc-8712s-projects --debug` (`$SP/web-deploy2.log`): EXIT=0, `dpl_5RkEysTHik8dGBiVFHP1GuzJpcWd`, `▲ Aliased https://ravenmcp.ai`. `vercel inspect https://ravenmcp.ai` → that id, ● Ready.
- Live https://ravenmcp.ai/changelog (cache-busted, http 200, 69,208 B): first three versions in page order `v2.6.0 v2.5.0 v2.4.1`. Pre-deploy read showed 2.5.5 / v2.5.0 at the top. `/raven.mcpb` http 200, 5,495,018 B.
- Not pushed: this log commit. No further push approval requested or held.

## Completion gate (2026-09-23, after push/edit/deploy)

- Opus falsification (Agent aa5caac84087b4733, model opus, report-only): VERDICT SURVIVES. All five claim parts hold: origin/main tip 727a24e/c488771/048bc76, 8be1dab unpushed (only this log differs); anon 45 tools, hash f64bb18…2bb0a6 exact; Release v2.6.0 body curated, 0 raw sha lines, published 22:04:13Z; live /changelog v2.6.0 first, dpl_5RkEysTHik8dGBiVFHP1GuzJpcWd Ready, all 16 changes from HEAD web/data/changelog.json present.
- P2 (Path C, not fixed): changelog.json keeps only the first paragraph of each multi-paragraph bullet, so the web changelog omits the idempotentHint/openWorldHint paragraph and the hosted `click`-refused paragraph. Fix is in promoteChangelog (scripts/release-notes.mjs) + regenerate json + push + apex deploy — needs fresh approval.
- P2 (accepted): CHANGELOG at tag v2.6.0 still lists the notes under [Unreleased]; HEAD has empty [Unreleased] + [2.6.0] - 2026-09-23. Pipeline promotes after the tag by design; notify-release.mjs reads the tagged file via releaseNotesFor(..., tagged).
- P1 PRE-EXISTING: run 35925801655 notify job (22:05:41Z, broadcast 611912ef-…) emailed 71 raw git-log lines for v2.6.0 before 048bc76 existed. No email sent this window; no correction email (Andrew: "Don't send an email").
- Caveat: x-vercel-cache HIT age 154 with a query string; content verified current anyway (v2.6.0 first, screenshot).
- Raven audit_url on live /changelog (dark, iphone+desktop): 102 findings, 96 confirmed contrast/aa errors — every card's date <time> at 2.19:1 (rgb(92,95,104) on rgb(43,43,56), 14px) and the Improvement/Fix pill text at 4.37:1; 6 inconclusive page-level warnings (flex-wrap, clamp, custom-properties). Template CSS in web/, pre-existing (this deploy changed data only); fix needs a web/ CSS edit + push + apex deploy — fresh approval (Path C).
- design-judge: Target $SP/changelog-live.png + https://ravenmcp.ai/changelog; Layers global; Surface product-site (raven-mcp binding), monochrome scope inactive; 1 raven-sourced block finding (contrast/aa, pre-existing template); Verdict: BLOCK (1 block, 0 warn) — pre-existing, Path C.
