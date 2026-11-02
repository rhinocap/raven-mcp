# Playground schema 2.0 in Raven (2026-10-31)

Branch `motion-playground` (unmerged, not pushed). Andrew's instruction on Motion Lab decision 7: "Change it, keep accepting, let's test it before we push any thing that major."

## What changed
- `src/data/motion/playground.schema.json` re-synced from Motion Lab HEAD `ab669de` with `scripts/sync-motion-motifs.mjs`. `schemaVersion` is now `enum ["1.0","2.0"]`; `curve` joins the param types with `kinds`, `default` and up to 4 labelled `stops`. The keyfob schema and runtime hashes did not change; `--check` reports in sync.
- `motifs.lock.json`: `source_commit` 27b70b7 to ab669de, playground schema sha256 `6d5825b7…51d3d`. ab669de is a local Motion Lab commit, also not pushed.
- `src/motion-playground/validate.ts`: ported Motion Lab's curve rules (commits 6f0a845 and 4d91c95):
  - `curveValueOk` and `curveKey`, taken from `src/timeline/evaluator.js`
  - curve values in `valueOk`, so presets and overrides are checked
  - easing role accepts a curve
  - a curve needs schemaVersion "2.0"
  - default and stops must be curves the control offers
  - stop labels in designer language unless the control is advanced
  - no duplicate stop labels or curves
  - a curve cannot be in a constraint
- `src/motion-playground/index.ts`: a motif with a curve control is refused with a named error, because Raven's template fork has no curve editor. No built-in motif reaches this today; the comment says so.

## Verification
- New test `schema 2.0 adds the curve control; 1.0 documents stay valid unchanged` in `test/motion-playground.test.mjs`.
- Mutants against `dist/` (scratchpad `curve-mutants.mjs`): 10 of 10 killed, including restoring the old 1.0-only schema. Restore was verified by string equality, and the control passed.
- Anonymous build: 45 tools, hash `f64bb18…2bb0a6`, unchanged.
- Full suite (`RAVEN_NO_USAGE_LOG=1 npm test`): 1869 tests, 1866 pass, 0 fail, 3 skipped, EXIT=0 read inside the log. The skips are the same three, at log lines 121/895/896. The new test passed at log line 1317. `test/motion-playground.test.mjs` is the only test file in the diff, going from 26 to 27 tests. The branch's last logged figure (1840, 2026-09-22) is stale by earlier branch work; it is not attributable to this change.
- Keyfob output measured against HEAD, not argued: HEAD was built from `git archive` in the scratchpad, and both builds ran the same calls.
  - seeded HTML is byte-identical (`cmp`)
  - HTML with an override is byte-identical
  - an out-of-range override is refused with the same message
- One visible difference: a curve-shaped override on keyfob's 1.0 enum `swingFeel` is still refused, but the error now carries two more schema lines, `unevaluated properties (default)` and `(widget)`. They come from the synced Motion Lab schema. The lock keeps Raven's copy byte-identical to it, so changing them belongs in Motion Lab, not here.

## Sol pass (GPT-6.1-Sol, medium, report-only)
- Verdict: DOES NOT SURVIVE, one P2. Removing any of four rules left the test green:
  - the spring maximum duration
  - a stop must be a kind the control offers
  - the stop-label punctuation check
  - the curve check on constraint operand `b`
- Sol confirmed the rest: no mismatch in the curve port, schema bytes and lock hash match Motion Lab, keyfob HTML is byte-identical to HEAD, and the anonymous build has 45 tools.
- Fixed in the test only; no product code changed. Added:
  - a refusal case for each of the four rules, plus the code-shaped stop label (`swing_feel`)
  - preset values at every curve bound, accepted on the edge and refused just past it: spring duration 10 and 60000, bounce ±0.9, and all eight bezier x/y limits
  - presets reach `curveValueOk` without the JSON Schema's curve shape, so they test the TypeScript bounds on their own
- Mutants v2 (`curve-mutants.mjs`, re-run whole):
  - 26 mutants, 26 killed; restore verified, control passed, EXIT=0
  - the first v2 run had one survivor, a dropped `p[2] >= 0`; the edge set was incomplete, and the eight-edge set closed it
- Full suite re-run: 1869 / 1866 / 0 / 3, EXIT=0; the same three skips at lines 121/895/896. Same count, because the cases went into the existing test.
- Sol did not edit the tree: HEAD is still a3a5e01, and the code diff is unchanged from its snapshot.
- Committed locally as 66637fb on `motion-playground` (16 ahead of origin/main, no remote branch). Not pushed.

## 2026-11-01 — Send to agent in Raven's keyfob fork (in progress)
Ports Motion Lab 7729bdc and c06dace (keyfob Get code replaced by Send to agent) into `src/data/motion/template.html`.
- Patch from the confirmed fork base (`kf-before.html`, sha 2cdfa27…): 8 of 10 hunks applied; the 2 rejected hunks touched Raven-only code and were resolved by hand.
- Raven-only change: `#raven-menu` sits in the agent view between the agent block and `#code-more`, so Copy for Raven stays visible without opening the code. Export buttons go to `x.menu || 'export-menu'`; `refreshRaven()` runs when the agent view refreshes.
- `src/motion-playground/index.ts` NEXT text: "use Copy for Raven on the Send to agent tab".
- `motifs.lock.json`: `template.upstream_sha256` set to Motion Lab's current keyfob template (9615e175…); `--check` reports in sync. `source_commit` left at ab669de.
- Test: line 543 `tab-code` changed to `tab-agent`; new browser test "Send to agent carries the tuned motion…" covers the tab label, packet equals `agentPacket()`, embed once inside an html fence, one primary button, Raven block in the agent view and outside `#code-more`, exports empty until the code opens, a stale queued refresh skipped, saved settings under More. 4 targeted tests pass.
- Out of scope: `web/public/playgrounds/keyfob.html` (apex `web` project, manual deploy) still has the old Get code UI.
- Verification so far:
  - Full suite `RAVEN_NO_USAGE_LOG=1 npm test` (`$SP/rv-full-sa.log`): 1870 / 1867 / 0 / 3, EXIT=0 read inside the log. +1 is the new test, read by name at line 1323. Skips are the same three, at lines 121/895/896.
  - Anonymous build: 45 tools, hash `f64bb18…2bb0a6`, unchanged.
  - Template mutants (`$SP/rv-mut.py`): 7 of 7 killed, control green, template restored by `cmp`. R1 exports made while code closed; R2 no toggle refresh; R3 closed view treated as More; R4 embed missing from packet; R5 no Raven refresh with the agent view; R6 Raven block in export-menu; R7 no `#raven-menu`.
  - Eyes-on (`$SP/rv-shot-1/agent.png`, `agent-code.png`, 1440×900): one primary button, Copy for Raven visible without opening the code, code behind "Show code without an agent". design-judge PASS.
- Sol pass 1 (`$SP/sol-rv1.out`): DOES NOT SURVIVE, no P1.
  - P2: no test identifies or clicks `#copy-agent`; removing its handler or moving the primary class would pass. Fix: assert `#copy-agent` is the `.btn.primary`, click it, check the copied text equals `agentPacket()` unframed (clipboard) and framed (`raven-motion-copy` postMessage).
  - P3: the packet says "I tuned it in Motion Lab." on a Raven page. Fix: Raven wording, asserted. The embed comment and import error keep "Motion Lab" as format markers.
  - Sol confirmed: no missing upstream hunk, Raven parts intact, NEXT names a rendered control, lock sha matches, no equivalent mutants.
- Round-1 fixes:
  - P3: `template.html:705` now opens "I tuned it in a Raven motion playground."; the test asserts the exact opening line and that the prose before "Working web version:" has no "Motion Lab".
  - P2 (test only): the one primary in `#view-agent` is `#copy-agent`; clicking it unframed copies exactly `agentPacket()` (stubbed clipboard), refills the box and says "Copied. Paste it into your agent's chat."; framed under a parent page, the parent receives exactly [agentPacket()] through `raven-motion-copy` and the frame clipboard is never touched.
  - Mutants v2 (`$SP/rv-mut2.py`, `rv-mut2.log`): 12 of 12 killed, control 28/28, template restored by `cmp`. New: R8 handler removed, R9 primary moved to Copy for Raven, R10 old wording, R11 framed path skipped, R12 handler copies the stale box. Each new mutant fails on its own assertion (read from the per-mutant diffs).
  - Full suite (`$SP/rv-full-sa2.log`): 1870 / 1867 / 0 / 3, EXIT=0 read inside the log; the test at line 1323; skips at 121/895/896. Same count, because the assertions went into the existing test.
  - Anonymous build: 45 tools, hash `f64bb18…2bb0a6`, unchanged.
  - Eyes-on `$SP/rv-shot-2/agent.png`: packet opens with the Raven wording; layout unchanged.
  - Sol re-check (`$SP/sol-rv2.out`): SURVIVES, no findings. It confirmed the only product change against round 1 is line 705.
  - Committed locally on `motion-playground`; not pushed (Raven branch held).

## 2026-11-01 — Send through Grab (in progress)
Findings (no bridge or `src/` TypeScript change needed):
- The playground can find the bridge the way the overlay does: a `<script>` whose src path ends `/raven-grab.js` with a `key` param, or `window.RavenGrabConfig.bridgeOrigin`.
- POST `/grab?key=` takes `{selector, instruction}` (`GrabPayloadSchema`, `selector` min 1), queues a `kind:"style"` item and returns 202. CORS is `*`; capture-only proxy mode serves `/grab` when keyed, so this stays inside the bridge's trust model (a proxied page's own scripts can already reach keyed routes).

Spec:
- Raven fork only: `template.html` and tests. Motion Lab upstream and the lock unchanged.
- Detect the bridge at load and on window `load`.
- Bridged: the primary button becomes "Send to your agent" and POSTs `{selector, instruction: agentPacket()}`. 202 says "Sent. Your agent has it."; failure says Raven Grab couldn't be reached and to use Copy instead. "Copy for your agent" stays as a secondary button.
- Not bridged: unchanged, one primary Copy.
- Tests: a real bridge session serving the playground with the script tag; Send queues an item whose `instruction` equals `agentPacket()`; no Send without a bridge; failure falls back with the status; one primary in each mode.
- Then mutants, full suite, anonymous hash, screenshot, design-judge, Sol, log, local commit.

Implementation state (checkpoint before compaction, 2026-11-01):
- `template.html`: `grabEndpoint()` finds a `<script>` whose src path ends `/raven-grab.js` with a `key`, and builds `/grab?key=` on the same origin. `setupSend()` runs on window `load` only (the bridge tag can sit after the template's script). When bridged it adds a primary "Send to your agent" before `#copy-agent`, demotes Copy to secondary, and rewrites `#agent-lede`. Send POSTs `{selector: '.stage', instruction: agentPacket()}`. A 202 says "Sent to your agent through Raven Grab."; anything else says "Couldn’t reach Raven Grab. Use Copy for your agent and paste it into your agent’s chat." The button is disabled while the request is in flight and re-enabled afterwards.
- Found while testing: Grab loads armed, and its capture-phase click handler swallowed every playground click, including the tab switch to Send to agent. `#panel` and `.stagebar` now carry `data-raven-grab-ignore` (the overlay's own opt-out for injected tooling). The artwork stays grabbable.
- Test "with Raven Grab on the page…": a real `startGrabSession`, the playground served with `script_tag` appended (the template has no `</body>`), and Chromium. It covers: the one primary is `#send-agent`; the agent tab opens; the queue holds 1 item with `instruction === agentPacket()` and selector `.stage`; nothing goes to the clipboard. A control shows that without the panel opt-out the More tab click is swallowed, which proves the overlay is armed. With the bridge stopped, the failure status appears, the button is re-enabled, and Copy still copies the packet. `stopGrabSession()` is awaited only after `browser.close()`, because keep-alive sockets block `server.close()`.
- Targeted run (`rv-send-t5.log`): 3/3, EXIT=0.
- Matrix v1 (`rv-mut3.log`): 9 of 13 killed; S4, S7, S10 and S12 survived, all test gaps. Fixes, test only: a routed 400 from `/grab` (S4), a stale box seeded before Send (S7), decoy scripts before the bridge tag (S10), and Send immediately before Copy (S12). Added S13 (the `key` check dropped).
- Matrix v2 (`rv-mut3b.log`): control 29/29, 13 of 13 killed, each on its own assertion; template restored by `cmp`, EXIT=0.
- Full suite (`rv-full-grab.log`): 1871 / 1868 / 0 / 3, EXIT=0 read inside the log. +1 is the new test, read by name at line 1324; skips are the same three at 121/895/896.
- Screenshot finding (`rv-shot-3`): on Grab's cold open both overlay panels are expanded and cover the playground's own controls panel, so Send to your agent cannot be seen until the designer collapses them. Cold-open-expanded is Andrew's 2026-07-19 overlay decision; not changed here.
- Anonymous build: 45 tools, hash `f64bb18…2bb0a6`, unchanged.
- Eyes-on with Grab's own "On page load: collapsed" setting (`rv-shot-4/collapsed-sent.png`, 1440×900): Send to your agent is the one primary, Copy sits under it, the status reads at the top right, and 1 item reached the queue. Grab's left edge tab sits over the first letter of the Controls tab label. design-judge on both shots: no findings, PASS. The customer verdict is separate: on cold open a designer cannot see Send until they collapse Grab. A lede hint cannot fix that, because the lede is under the same panel. Reported to Andrew as Path C; the overlay's cold open is his decision.
- Sol pass running against snapshot `sol-grab-snap/` (`sol-grab.out`).
- Sol (gpt-6.1-sol medium, snapshot `sol-grab-snap/`): DOES NOT SURVIVE, 2 × P2.
  - P2-1: Send took the LAST keyed `/raven-grab.js` tag; a keyed decoy after the real tag would get the packet and show success. Disposition: a script already on the page can redirect anything, so not a boundary; the real case is a stale tag from an earlier session. Fix: try keyed tags in page order (the order the overlay boots from) and stop at the first 202.
  - P2-2: no test kept the artwork grabbable; `data-raven-grab-ignore` on `.stage` would pass. Fix: click the artwork while armed and assert the selection chip names `.stage` or a descendant.
  - Fix spec: `grabEndpoints()` lists keyed tags in page order; Send tries each in turn, button disabled throughout; test adds a dead keyed tag before the real one and a live keyed decoy after it (queue 1, decoy hits 0), plus the armed-click check; new mutants S14 (last-to-first), S15 (first only, no fall-through), S16 (`.stage` ignored).
  - Template edit applied.
  - Test edits applied: a dead keyed tag (closed 127.0.0.1 port) before the real tag; a live keyed decoy after it, which accepts with 202 and counts hits; `siteGrabHits` counts POSTs to the page's own origin. Assertions: decoy hits 0 after Send; an armed click at the artwork's centre gives a selection chip whose selector resolves inside `.stage`; in the lost-bridge step the decoy refuses (400) and is reached exactly once, and the site gets 0. Single test passes.
  - Matrix v3 (`$S/rv-mut4.py`/`.sh`, log `rv-mut4.log`): S1–S13 re-anchored to the new loop, plus S14 last-to-first, S15 first-only, S16 `.stage` ignored, S17 failure path never re-enables, S18 network error counted as success. All 18 anchors swept once before launch, 0 stale.
  - Matrix v3 result: control 29/29; **18 mutants, 18 killed, 0 survived**, EXIT=0 read inside the log; template `cmp`-restored. Each new mutant was checked against the assertion it failed: S10/S13 on `siteGrabHits` (2 and 1), S14/S15/S18 on queue count 0, S16 on `inStage: false` (the chip shows, but its element is outside the artwork), S17 on `enabled: false`. S13 would have survived without the `siteGrabHits` counter: with the real bridge first, the keyless tag is reached only in the lost-bridge step.
  - Full suite after the fix: 1871 / 1868 / 0 / 3, EXIT=0 read inside the log (`rv-full-grab2.log`); the same three skips at 121/895/896; the Send test passes at 1324. Anonymous build: 45 tools, hash `f64bb18…2bb0a6`; stdio has 112 names, hash `1821960e…` (both unchanged).
  - Screenshot (`rv-shot-5/collapsed-sent.png`, Grab startup collapsed): Send is the one primary button, Copy sits under it, the status shows top right, queued 1. The visible UI is the same as the design-judge PASS.
  - Sol round 2 launched against snapshot `sol-grab-snap2/` (PID 93670, output `sol-grab2.out`); the waiter checks the PID with `kill -0`.
  - Sol round 2 (snapshot `sol-grab-snap2/`, PID 93670 exited, SOL_EXIT=0, 38,708 tokens): DOES NOT SURVIVE, 2 × P2, both accepted and fixed.
    - P2-a: a tag whose server takes the POST and never answers held Send disabled forever, so later tags were never tried. Fix: each attempt aborts after 4 s through AbortController and moves on. Test: the dead tag's /grab is routed to a handler that never answers; Send still reaches the bridge (queue 1, decoy 0, enabled).
    - P2-b: discovery resolved the raw `src` against `location.href`, while the overlay reads the browser-resolved `script.src`, so a page with `<base>` would post to the page's origin. Fix: read `scripts[i].src`. New test: `<base>` points at a stand-in bridge on another port, and a relative keyed tag must send there (bridge 1, page 0).
  - Matrix v4 (`rv-mut5.py`/`.sh`, log `rv-mut5.log`): S14 re-anchored; S19 drops the timeout, S20 restores the raw-src resolution. All 20 anchors swept before launch, 0 stale.
  - Matrix v4 result: control 30/30; **20 mutants, 20 killed, 0 survived**, EXIT=0 read inside the log; template restored. S19 failed the hang step on `{status:'', enabled:false}` (Send stays disabled behind the hanging tag). S20 failed the `<base>` test on `{bridgeHits:0, pageHits:1}` and the fallback message. S14 re-anchored and still killed by the main send.
  - Full suite after the round-2 fixes: 1872 / 1869 / 0 / 3, EXIT=0 read inside the log (`rv-full-grab3.log`); same three skips at 121/895/896; both Send tests pass at 1324/1325. Anonymous 45, hash `f64bb18…2bb0a6`; stdio 112, `1821960e…` (both unchanged).
  - Sol round 3 launched against snapshot `sol-grab-snap3/` (PID 4131, output `sol-grab3.out`).
  - Sol round 3 (snapshot `sol-grab-snap3/`, SOL_EXIT=0, 36,187 tokens): DOES NOT SURVIVE, 1 × P2, accepted and fixed. Send used fetch's default redirect following, so a stale keyed tag whose server 307s /grab to another origin's inbox handed that inbox the packet and showed success, and the working bridge later in the page was never tried. Reproduced in real Chromium before the fix (inbox 1, bridge 0). Fix: `redirect: 'error'`, so a redirect counts as a failure; the real bridge answers /grab directly (`src/grab-bridge.ts:1177`, `:2210`). New test "Send does not follow a redirect away from a keyed tag, and goes on to the next tag" (inbox 0, bridge 1, Sent). Playground suite 31/31.
  - Matrix v5 (`rv-mut6.py`/`.sh`, log `rv-mut6.log`): S21 drops `redirect: 'error'`. 21 anchors swept before launch, 0 stale.
  - Matrix v5 result: control 31/31; **21 mutants, 21 killed, 0 survived**, EXIT=0 inside the log; template restored. S21 failed the redirect test on `{inboxHits:1, bridgeHits:0}`.
  - Full suite after the round-3 fix: 1873 / 1870 / 0 / 3, EXIT=0 inside the log (`rv-full-grab4.log`); same three skips at 121/895/896; the three Send tests pass at 1324–1326. Anonymous 45 `f64bb18…2bb0a6`, stdio 112 `1821960e…` (both unchanged).
  - Sol round 4 launched against `sol-grab-snap4/` (PID 14139, output `sol-grab4.out`).
  - Sol round 4 (snapshot `sol-grab-snap4/`, SOL_EXIT=0, 57,048 tokens): **SURVIVES**, no findings. Sol's own checks of the extracted handler: redirects 301/302/303/307/308 deliver nothing and fall through to the next bridge; a 400 and a hanging endpoint fall through; a redirect-only page shows the failure message and re-enables Send.
  - Send through Grab is ready to commit locally (no push: the `motion-playground` branch is held). The visible UI has not changed since the design-judge PASS and the `collapsed-sent.png` capture; rounds 2–4 changed only how Send picks and calls endpoints.
