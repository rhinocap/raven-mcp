# Spec: grab attachments follow-ups (batch 2)

**Status:** Spec, not built.
**Date:** 2026-09-23
**Base:** `feat/grab-image-attachments` at 1f2a386 (spec 1 shipped: `docs/spec-grab-image-attachments.md`).
**Scope:** five items left open by the adverse and falsification passes on spec 1. Item 2 of that list (background-image descendants) is out of scope by decision.

| # | Item | Files |
|---|---|---|
| 1 | Path-route attachments get a thumbnail chip | `src/grab-bridge.ts`, `browser/raven-grab.js` |
| 3 | Gradient background-images are distinguished from `url()` ones | `browser/raven-grab.js`, `src/index.ts` |
| 4 | Path route reads through a no-follow descriptor | `src/grab-inbox.ts` |
| 5a | Non-ASCII names survive in the record; disk name stays ASCII | `src/grab-inbox.ts` |
| 5b | Quoted, shell-escaped and `~/` paths are accepted | `browser/raven-grab.js`, `src/grab-inbox.ts` |

## Design

### 1. Thumbnail for path-route attachments

Today a dropped `File` gets a chip thumbnail from `URL.createObjectURL(file)` (`browser/raven-grab.js:4310`). A path attachment posts JSON and the browser never holds the bytes, so `thumbUrl` is null (`:4338`) and the chip renders an empty box (`:4352`).

Bridge: add `GET /attachment?key=<key>&id=<att_id>`.
- Looks the id up in `session.attachments`; 404 `{error}` for an unknown id.
- Streams the inbox file with the record's `mime`, `Content-Length`, `Cache-Control: no-store`, and the same CORS headers as the POST.
- Refused with 404 "Not available while proxying a third-party site" when `proxyCaptureOnly(session.proxyTarget)` is true, exactly like the path route (`src/grab-bridge.ts:2170`). On a proxied page the only attachments are file drops, which already have blob thumbnails.
- Added to `protectedRoute` (`:2193`) so a wrong key is 403 before any lookup.

Overlay: in `attachmentRecordFromResponse`, when `chip.thumbUrl` is null and the record has an id, set `chip.thumbUrl = bridgeUrl("/attachment") + "&id=" + record.id` (confirm how `bridgeUrl` appends the key and match it). The revoke path (`:4250`) only calls `revokeObjectURL` on strings starting with `blob:`; a bridge URL is left alone and cleared.

Not chosen: returning a data URL in the record (up to 25 MiB of base64 in a JSON response, or a new image-decoding dependency).

### 3. Gradient backgrounds

`imageTargetFor` reports `kind: "background"` for any computed `background-image` other than `none` (`browser/raven-grab.js:3646`), so a gradient button is reported as an image to replace.

- Add `imageTarget.backgroundHasUrl: boolean` next to the existing `backgroundImage` string (`:3719`): true when the computed value contains `url(`. Multi-layer values with both a gradient and a url count as true.
- Keep `kind: "background"` for gradients; the field lets the agent decide.
- `src/index.ts` protocol text (`:3694`): append one sentence: "When imageTarget.kind is background and backgroundHasUrl is false the carrier is a generated image (a gradient); replacing it means setting background-image to a url() of the copied asset."

Not chosen: dropping gradients from the target. Replacing a gradient with a photo is a real instruction.

### 4. No-follow read on the path route

`storeAttachmentPath` checks `realpathSync(resolved) === resolved` and containment, then `readFileSync(resolved)` (`src/grab-inbox.ts:155-163`). A symlink swapped into the last path component between those calls would be followed.

- Replace the read with: `fd = openSync(resolved, O_RDONLY | O_NOFOLLOW)`, `fstatSync(fd)` for `isFile()` and `size` (replacing the earlier `statSync` checks), `readFileSync(fd)`, `closeSync(fd)` in `finally`.
- ELOOP/EMLINK from the open maps to the existing 400 "attachment path has a symlink escape".
- Export a small `openAttachmentFile(path)` helper so the no-follow behaviour is unit-testable with a real symlink.
- Document in a comment that intermediate directories are not protected (macOS has no `O_RESOLVE_BENEATH`) and that the route is already refused on third-party proxies.

### 5a. Non-ASCII names

`sanitizeFilename` keeps `[A-Za-z0-9._-]` only (`src/grab-inbox.ts:234`), so `Café.png` is stored and reported as `Caf-.png` and `スクリーンショット.png` as `png.png`.

- `record.name` becomes the original leaf name with control characters, `/` and `\` removed, NFC-normalised, capped at 255 bytes. It is what the chip shows and what the agent reads.
- The on-disk name keeps the current ASCII sanitiser, with one change: an empty stem falls back to `attachment` rather than the bare extension. `スクリーンショット.png` → `<sha12>-attachment.png`.
- Overlay chip: shows `record.name` once the upload resolves (it already re-renders from the record; confirm no second sanitiser in the overlay).

Not chosen: Unicode on disk. NFC/NFD differs between macOS and Linux, and bidi/zero-width characters would need their own stripping.

### 5b. Quoted, escaped and `~/` paths

`attachmentPath` accepts only `^(/|file://)…\.(png|jpe?g|webp|gif|svg|avif)$` (`browser/raven-grab.js:4333`), so a path pasted from Terminal fails: `'/Users/a/My Folder/x.png'` is rejected by the regex and lands as text; `/Users/a/My\ Folder/x.png` passes and gets a 404 because the backslash is sent literally.

Overlay, before the regex:
1. Strip one pair of matching surrounding quotes (`'…'` or `"…"`).
2. Replace `\<char>` with `<char>` (Terminal escapes spaces, parentheses and quotes).
3. Accept a leading `~/` in the regex; send it unchanged.

Bridge: `storeAttachmentPath` expands a leading `~/` to `homedir()` before `isAbsolute`. Nothing else changes; containment still applies.

Not chosen: unescaping on the bridge. The overlay owns what the user typed; the bridge should not guess at shell syntax.

## Test plan

Each leg writes its tests first and reports the failing run before the fix.

| # | Test | File | Runner |
|---|---|---|---|
| 1 | GET serves bytes+mime for a known id; 404 unknown id; 403 wrong key; 404 on third-party proxy | `test/grab-bridge-thumb.test.mjs` | orchestrator (loopback) |
| 1 | path drop chip renders an `<img>` whose src is the bridge GET and it loads (naturalWidth 16); revoke on remove does not throw | `test/grab-overlay-followups.test.mjs` | orchestrator (Chromium) |
| 3 | gradient div → kind background, backgroundHasUrl false; url div → true; layered → true | overlay followups | Chromium |
| 3 | protocol text contains the new sentence | `test/grab-bridge-thumb.test.mjs` or existing index test | node |
| 4 | `openAttachmentFile` on a symlink throws; on a regular file returns bytes; a path whose last component is a symlink still gets 400 | `test/grab-inbox-followups.test.mjs` | node |
| 5a | `Café.png` → record.name `Café.png`, disk `…-Caf-.png`; `スクリーンショット.png` → disk `…-attachment.png`; chip text shows the original name | inbox followups + overlay followups | node + Chromium |
| 5b | quoted, escaped and `~/` pastes each produce a ready chip; bridge accepts `~/…` under home and refuses `~/../…` | overlay followups + inbox followups | Chromium + node |

Regression: `RAVEN_NO_USAGE_LOG=1 npm test` from a worktree outside the repo tree (the no-private-paths `..` case), expected 1776 + new tests, 0 fail, 3 skipped. Both `raven-grab.js` copies byte-identical (`cmp`).

Live check (orchestrator, eyes on): local page with a gradient button, a `url()` hero, and an `<img>`; paste `'<path with space>'` and `~/…` of a PNG; confirm the chip shows the thumbnail and the original non-ASCII name; screenshot the chip full size; drain and read `backgroundHasUrl` for both backgrounds.

## Graph-engineered workflow

Legs own disjoint files. Test files are new so no leg appends to a shared one. Orchestrator (Fable) applies diffs, builds, runs loopback and Chromium suites, mirrors, commits explicit paths.

```
L-A  src/grab-inbox.ts + test/grab-inbox-followups.test.mjs        items 4, 5a, 5b-bridge   gpt-6-luna
L-B  src/grab-bridge.ts + test/grab-bridge-thumb.test.mjs          item 1 GET route         gpt-6-luna
L-C  browser/raven-grab.js + test/grab-overlay-followups.test.mjs  items 1, 3, 5b overlay   gpt-6-sol
L-D  src/index.ts protocol sentence + CHANGELOG.md                 item 3 text              gpt-6-luna
       A ─┐
       B ─┼─▶ apply + build + loopback suites ─▶ mirror cp + cmp ─▶ Chromium suites ─▶ live check ─▶ L-E
       C ─┤
       D ─┘
L-E  falsification, report-only, cold context                      claude-opus-5-5
```

- A, B, C, D run concurrently in four worktrees under `.worktrees/`, each `codex exec … < /dev/null` in the background, workspace-write, `--skip-git-repo-check`. Codex cannot bind loopback, so legs run only `node --check` and the pure-node tests; the orchestrator runs anything that opens a port or a browser.
- Field names and route shape above are fixed so C and D do not wait on each other.
- One adverse pass only (L-E). Findings get a failing test observed first, then the fix, in one orchestrator commit.
- Each leg's report states its model. Orchestrator reads diffs, not reports.

## Constraints carried from spec 1

No new dependencies. Chromium only (physical-host WebKit ban). `web/public/raven-grab.js` byte-identical to `browser/raven-grab.js`. Commit explicit paths. Never push. Attachment cap 4 per send and 32 per session unchanged. Path route still refused on third-party proxies.

## Acceptance

1. All seven test rows pass; full suite 0 fail, 3 skipped.
2. Live check screenshot shows a path-drop chip with a real thumbnail and a non-ASCII name.
3. `get_grabbed_elements` returns `backgroundHasUrl` on background targets and `record.name` with the original name.
4. L-E verdict "claim holds" with no P1/P2 left open, or each disposed in the handoff.
5. Branch left on `feat/grab-image-attachments`, not pushed.
