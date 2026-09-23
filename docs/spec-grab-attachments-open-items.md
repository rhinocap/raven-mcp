# Grab attachments: open items after batch 2

Base: `feat/grab-image-attachments` at 5dee518. Closes the four items left open by the Opus 5.5 falsification of d980422 and ba9fbb6. Same constraints as the earlier specs: no new dependencies, Chromium only, tests written and observed failing before the change, never push.

## Items

### A. Thumbnail route streams the file

`GET /attachment` (`src/grab-bridge.ts`, in `buildGrabResponse`) reads the whole file with `readFileSync` on every request. A 25 MiB attachment blocks the bridge's event loop per fetch.

- `GrabResponse` gains an optional `file?: string`. The route returns `{ status: 200, headers, body: "", file: record.path }` with `Content-Length` from `statSync(record.path).size`, `Content-Type` from the record, and the existing `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`.
- The HTTP handler (the `res.end(result.body)` site after `buildGrabResponse`) pipes `createReadStream(result.file)` into `res` when `file` is set; a stream error destroys the response. Every other route is unchanged.
- The fetch shim (sandbox mode, no listener) reads `result.file` into a `Uint8Array` body; nothing else in the shim changes.
- Refused cases keep their JSON bodies and never set `file`.

### B. Overlay fetches each thumbnail once and never persists a keyed URL

`attachmentRecordFromResponse` (`browser/raven-grab.js`) sets `chip.thumbUrl` to the bridge URL, so every `renderPanel` rebuilds the `<img>` and, under `no-store`, refetches the bytes. `serializeLivePending` writes `draft.attachments` verbatim, so the capability key lands in page-origin `sessionStorage` and a restored chip points at a session that no longer exists.

- New `hydrateAttachmentThumb(chip)`: when a ready chip has an `id` and no `blob:` thumb, `fetch(bridgeUrl("/attachment") + "&id=" + encodeURIComponent(id))`; on `ok`, `chip.thumbUrl = URL.createObjectURL(await blob())` and `renderPanel()`; on any failure `chip.thumbUrl = null` (the placeholder span renders, no broken image). One in-flight fetch per chip.
- `attachmentRecordFromResponse` calls `hydrateAttachmentThumb` instead of assigning the bridge URL. File chips keep their existing `blob:` thumb and are not fetched.
- `serializeLivePending` maps attachments through a copy that omits `thumbUrl`. The restore site (`attachmentDraft = draft.attachments || []`) hydrates every restored ready chip.
- `revokeAttachmentThumb` is unchanged: it only revokes `blob:` URLs, which is now every thumb.

### C. Dedupe by bytes and disk name, not bytes alone

`storeVerifiedAttachment` (`src/grab-inbox.ts`) reuses any file whose name starts with the sha prefix, so the same bytes pasted as `Café.png` and `スクリーンショット.png` share one file named after the first. The path the agent copies then misstates the second record's name.

- The existing-file match becomes exact: `entry === sha12 + "-" + name`. Same bytes and same disk name dedupe; same bytes under a different disk name write a second file. The directory-mtime refresh on a dedupe hit stays.

### D. The final-component symlink refusal is the open, not realpath

`storeAttachmentPath` resolves `realpathSync(resolved)` before the `O_NOFOLLOW` open, so a final-component symlink is refused by the realpath comparison and the `ELOOP` mapping is never reached. The test for it passes with `O_NOFOLLOW` removed.

- Order becomes: `~/` expansion, absolute check, containment, `realpathSync(dirname(resolved)) === dirname(resolved)` (intermediate components; a mismatch is the existing 400 "symlink escape"), then `openAttachmentFile` (`O_RDONLY | O_NOFOLLOW | O_NONBLOCK`), `fstat` regular-file and size checks, read. The `existsSync` pre-check goes; `ENOENT` maps to the same 404 through `attachmentOpenError`.
- Acceptance includes a mutation check by the orchestrator: with `O_NOFOLLOW` removed from `dist/grab-inbox.js`, the final-component symlink test must fail.

## Test plan

| Item | Test | File | Runs where |
|------|------|------|------------|
| A | served bytes equal the fixture and `Content-Length` equals the file size for a multi-MiB PNG; refused cases carry no `file`; `buildGrabResponse` is not exported, so the assertion is over HTTP | test/grab-bridge-thumb.test.mjs | loopback |
| B | path chip thumb is `blob:`; exactly one GET /attachment across three extra `renderPanel` triggers (instruction input events); `sessionStorage` memo contains no `thumbUrl` and no `key=`; after `page.reload()` the restored chip is hydrated once and shows a `blob:` thumb; with the GET routed to 403 the restored chip shows the placeholder span and no page error | test/grab-overlay-followups.test.mjs | Chromium |
| C | same bytes as `Café.png` and `スクリーンショット.png` give two disk files; same bytes as `Café.png` twice give one | test/grab-inbox-followups.test.mjs | node |
| D | final-component symlink → 400 through the route; `ENOENT` → 404; the mutation check above | test/grab-inbox-followups.test.mjs | node |

## DAG

```
E gpt-6-luna  src/grab-inbox.ts + test/grab-inbox-followups.test.mjs      C, D
F gpt-6-sol   browser/raven-grab.js + test/grab-overlay-followups.test.mjs B
G gpt-6-luna  src/grab-bridge.ts + test/grab-bridge-thumb.test.mjs         A
orchestrator: apply E, F, G; build; mirror cp+cmp; node suites; overlay suites; live Chromium check (one GET per chip, reload restores a blob thumb); mutation check for D; full suite from a sibling worktree; commit; one falsification pass on claude-opus-5-5.
```

## Acceptance

Full suite from a worktree outside the repo tree: 0 fail, 3 skipped, tests ≥ 1798 + new. Live check: four carriers as before, four paste forms reach ready chips with `blob:` thumbs, the network log shows one GET /attachment per chip, a reload restores the chips with fresh blob thumbs. Not pushed.
