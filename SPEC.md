# SPEC — `audit_video_playback` tool (detect non-playing / broken `<video>`)

**Date:** 2026-06-22
**Branch:** `feat/audit-video-playback` (off `origin/main` @ b51d570)
**Backlog source:** `.claude/raven-opportunities.md` — `2026-06-20 | dynamic-state audit gap | audit_page renders a static frame so it cannot tell a black/non-playing <video> from a playing one … Andrew's #1 complaint "videos don't play" was invisible to every static check | New audit: audit_video_playback … report per-clip playing|paused|black|error | P2`
**Backlog rank this run:** #1 by (impact × reach) ÷ effort — addresses the user's repeatedly-cited #1 complaint (videos rendering black / not playing), invisible to every static audit; broad reach (every page with video); chromium is installed so it is verifiable this run.

---

## Problem statement

Every existing Raven audit captures a single static frame, so it cannot distinguish a `<video>` that is actually **playing** from one that renders a **black box** (never buffered, autoplay-blocked, empty/broken src, or decode error). `audit_page`'s current video handling only inspects `preload`/`readyState`/`error` heuristically and does **not** observe whether playback actually advances. The result: "videos don't play" — the single most-cited real defect on the user's marketing sites — passes every audit clean.

## Goal / intent

Add a new MCP tool **`audit_video_playback`** that, given a URL, renders the page in headless chromium, locates every `<video>`, and **observes whether playback advances** (samples `currentTime` before/after a short play attempt) alongside `readyState`/`networkState`/`error`/`paused`, then classifies each clip into a constrained state with a reason. Mirror the proven dual-export shape of `src/contrast.ts`: a **pure, unit-testable classifier** plus a **browser observer**, with a `dom_snapshot` escape hatch for deterministic use without rendering. Reuse `loadChromium`/`CaptureUnavailableError` conventions from `src/capture.ts`/`src/contrast.ts`; do **not** modify `capture.ts`, `contrast.ts`, or `page-checks.ts`.

## Scope

**In:**
- `src/video-playback.ts` — NEW module: pure `classifyVideoPlayback(obs)` + browser `auditVideoPlaybackUrl(url, opts?)` + result/observation types.
- `src/index.ts` — register the `audit_video_playback` tool (import, Zod schema, handler, description). Tool count 56 → 57.
- `test/video-playback.test.mjs` — NEW: deterministic unit tests for the classifier (no browser) + a browser integration test (graceful skip via `CaptureUnavailableError`, but runs here since chromium is present).
- `test/fixtures/video-playback.html` — NEW fixture: one autoplaying `<video src="clip.webm" muted>` (existing fixture file) + one broken-src `<video src="does-not-exist.mp4">`.
- Docs: `CHANGELOG.md` `[Unreleased] > Added`; `README.md` tool list.

**Out (not this run):**
- No change to `capture.ts`, `contrast.ts`, `page-checks.ts`, `audit_page`, or any other tool.
- No Ken-Burns / motion-content analysis (separate P3 ledger item).
- No version bump / publish / push.

## Constrained valid values (the contract)

### Observation object (`VideoObservation`) — input to the pure classifier:
```ts
{
  selector: string,
  hasSource: boolean,          // currentSrc non-empty OR a <source>/src present
  readyState: number,          // 0..4 (HTMLMediaElement.readyState)
  networkState: number,        // 0..3 (3 = NETWORK_NO_SOURCE)
  errorCode: number,           // 0 = none, 1..4 = MEDIA_ERR_* 
  paused: boolean,
  autoplayBlocked: boolean,    // play() rejected with NotAllowedError
  currentTimeStart: number,
  currentTimeEnd: number
}
```

### State enum (EXACTLY these 5) and the classification order (first match wins):
1. `error` — `errorCode > 0`. reason by code: 1→`aborted`, 2→`network-error`, 3→`decode-error`, 4→`src-not-supported`.
2. `empty` — `hasSource === false` OR `networkState === 3`. reason `empty-src`.
3. `playing` — `currentTimeEnd > currentTimeStart` (advanced past a 1e-3 epsilon) AND `paused === false`. reason `advancing`.
4. `paused` — `readyState >= 3` (HAVE_FUTURE_DATA) AND not advancing. reason `autoplay-blocked` if `autoplayBlocked` else `paused`.
5. `stalled` — fallthrough (has source, no error, `readyState < 3`, not advancing). reason `buffering-or-stalled`.

"Renders black" (the user complaint) = any of `error` / `empty` / `stalled`. `playing` is the only fully-healthy state; `paused` is a soft state (loaded but not advancing — often autoplay policy).

### `classifyVideoPlayback(obs)` returns:
```ts
{ selector, state: "playing"|"paused"|"stalled"|"empty"|"error", reason: string, advanced: boolean }
```

### `auditVideoPlaybackUrl(url, opts?)` (browser) returns `VideoPlaybackResult`:
```ts
{
  url: string,
  total_videos: number,
  rows: Array<ReturnType<classify> & { readyState:number, errorCode:number, paused:boolean, currentTimeStart:number, currentTimeEnd:number }>,
  playing_count: number,
  not_playing_count: number,          // rows whose state !== "playing"
  not_playing: Array<row>,            // the rows where state !== "playing"
  summary: string
}
```
- `opts.observeMs` (number, default 1000) — dwell time between `currentTime` samples after attempting play().
- Throws `CaptureUnavailableError` when chromium is unavailable (same as contrast/capture).
- For each `<video>`: record `currentTimeStart`, call `.play()` (catch NotAllowedError → `autoplayBlocked=true`), wait `observeMs`, record `currentTimeEnd`, read `readyState`/`networkState`/`error?.code`/`paused`/`currentSrc`, build the observation, classify.

### Tool input (Zod):
- `url` (string, optional) — render + observe.
- `dom_snapshot` (array of `VideoObservation`, optional) — classify pre-collected observations without rendering (deterministic path; mirrors `audit_contrast`).
- `observeMs` (number, optional) — forwarded to the browser path.
- Exactly one of `url` / `dom_snapshot` required; if neither → a clear message.

## Acceptance criteria

1. `src/video-playback.ts` exports a **pure** `classifyVideoPlayback(obs)` (no I/O/browser) and an async `auditVideoPlaybackUrl(url, opts?)`; imports the chromium loader the way `contrast.ts` does and throws `CaptureUnavailableError` (imported/re-used, not redefined) when chromium is absent. Does NOT edit `capture.ts`/`contrast.ts`/`page-checks.ts`.
2. The classifier obeys the 5-state enum and the first-match-wins order above. Unit tests assert every state + reason path:
   - errorCode 1/2/3/4 → `error` + the right reason;
   - `hasSource:false` and `networkState:3` → `empty`/`empty-src`;
   - currentTime advanced + not paused → `playing`/`advancing`;
   - readyState≥3 not advancing + autoplayBlocked → `paused`/`autoplay-blocked`; without autoplayBlocked → `paused`/`paused`;
   - has source, readyState<3, no advance, no error → `stalled`/`buffering-or-stalled`.
3. Ordering guard: an observation that is BOTH `errorCode>0` AND advanced classifies as `error` (error wins over playing); an observation with `hasSource:false` but readyState 4 classifies as `empty` (empty wins over paused/playing).
4. `advanced === (currentTimeEnd - currentTimeStart > 1e-3)` in the returned row.
5. Browser path (`auditVideoPlaybackUrl`) over `test/fixtures/video-playback.html`: `total_videos === 2`; the broken-src `<video>` appears in `not_playing` classified `error` or `empty`; the result shape has all `VideoPlaybackResult` keys; `not_playing_count === not_playing.length`. (This test uses the `CaptureUnavailableError` graceful-skip guard like `contrast.test.mjs`; chromium is installed so it executes.)
6. `dom_snapshot` path: the tool/handler classifies supplied observations without launching a browser and returns the same row/count shape.
7. `audit_video_playback` registered in `index.ts`; tool count 56 → 57; handler returns the result as JSON text; requires exactly one of `url`/`dom_snapshot`.
8. `npm run build` clean; `npm test` fully green (existing suite + new `video-playback.test.mjs`).
9. `CHANGELOG.md` `[Unreleased] > Added` documents `audit_video_playback`; `README.md` lists it.

## File-level change plan

| File | Change | Owner |
|---|---|---|
| `src/video-playback.ts` | NEW — pure `classifyVideoPlayback` + browser `auditVideoPlaybackUrl` | implementer |
| `src/index.ts` | register `audit_video_playback` tool (import, Zod, handler, description); count 56→57 | implementer |
| `test/fixtures/video-playback.html` | NEW — autoplay `clip.webm` + broken-src video | test-author |
| `test/video-playback.test.mjs` | NEW — classifier unit tests (AC2–4) + browser test (AC5) + dom_snapshot (AC6) | test-author |
| `CHANGELOG.md` | `[Unreleased] > Added` entry | doc-updater |
| `README.md` | add `audit_video_playback` to the tools list | doc-updater |

## Verification plan

- **Unit (no browser):** `node --test test/video-playback.test.mjs` classifier cases prove AC 2–4 deterministically (the state machine is the load-bearing logic).
- **Browser:** the `auditVideoPlaybackUrl` test over the new fixture proves AC 5 (finds both videos, broken one is not-playing) — runs because chromium is present; would skip gracefully otherwise.
- **Full suite:** `npm run build && npm test` → 0 fail (AC 8), confirming no regression (capture.ts/contrast.ts/page-checks.ts untouched).
- **Eyes-on:** main loop runs `auditVideoPlaybackUrl` on the fixture and reads the JSON — confirms `clip.webm` is `playing` (currentTime advanced) and the broken src is `error`/`empty`, not a false "playing".
- **Reviewer:** diff vs this SPEC; flag any edit to capture.ts/contrast.ts/page-checks.ts (out of scope), classifier order/enum drift, the advanced-epsilon, or a tool other than the new one being altered.
- **Main loop (me):** read the result, run the suite, parallel-instance collision re-check, then commit referencing SPEC.md (no push).
