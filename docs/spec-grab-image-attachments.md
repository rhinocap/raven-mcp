# Spec: image attachments in the grab overlay

**Status:** Spec, not built.
**Date:** 2026-09-22
**Scope:** `browser/raven-grab.js` composer → `src/grab-bridge.ts` → `get_grabbed_elements` drain → agent apply.
**Goal:** a user selects an image on the page, drops a replacement from Finder (or pastes one, or drops/pastes a path) into the Instructions box, writes "replace this with this", and the agent receives an unambiguous target and an unambiguous source file.

## What exists today

| Piece | State | Source |
|---|---|---|
| Instructions textarea | `[data-instruction]`, plain text, per-selection draft | `browser/raven-grab.js:12073` |
| Drop / paste handling | none anywhere in the overlay | grep `dragover|drop|clipboardData` = 0 hits |
| Send payload | `selector, html, rect, styles, tokens, stateStyles, tokenIntents, styleEdits, instruction, filePath/line/column` | `browser/raven-grab.js:12590`, `src/grab-bridge.ts:614` |
| `html` capture | `outerHTML` cut at 2000 chars | `MAX_HTML`, `browser/raven-grab.js:76` |
| `styles` capture | fixed `STYLE_PROPERTIES` list; has `object-fit`, lacks `background-image`, `object-position`, `aspect-ratio` | `computedStylesFor`, `browser/raven-grab.js:95` |
| Bridge body | JSON only, 1 MiB cap | `MAX_BODY_BYTES`, `src/grab-bridge.ts:1223` |
| Payload schema | zod `.passthrough()`, so unknown keys survive to the drain | `GrabPayloadSchema` |
| Per-machine store precedent | `~/.raven/references` (capture_reference) | `src/reference-store.ts:109` |
| Image reading | `pngjs` present (optional import) | `src/asset-integrity.ts:39` |

Two gaps drive the design. The **target** is under-described: a `<picture>` or a long `srcset` overflows the 2000-char cap, a CSS background image is invisible, and `currentSrc` (the candidate the browser actually chose) is never sent. The **source** has no channel at all.

## Platform constraint that shapes everything

Chrome does not expose a filesystem path for a file dragged from Finder. `DataTransfer.files` yields `File` objects with `name`, `type`, `size`, `lastModified` and bytes; `File.path` is Electron-only and Chrome does not populate `text/uri-list` with `file://` URLs for Finder drags. `getAsFileSystemHandle()` returns a handle, not a path.

So a dropped image must be **uploaded to the bridge as bytes**, and the bridge writes it to disk and returns the path. A path can only arrive as **text**: a Finder path copied with ⌥⌘C, a path dragged from a terminal or Obsidian, or typed. Both routes end in the same record.

## Two input routes

1. **Bytes route.** Drop (`drop` on the composer) or paste (`paste` with `clipboardData.files`) of one or more image files. Overlay uploads immediately, shows a chip, and the send references the resulting attachment ids.
2. **Path route.** A `text/plain` drop or paste whose trimmed value looks like an absolute path or `file://` URL and ends in an image extension. Overlay posts the string; the bridge validates it exists on this machine and is an image, and returns the same record shape with `origin: "path"`. The text is not inserted into the textarea.

Both routes require an active selection. With nothing selected the drop is refused with the notice "Select the image to replace first" and nothing is uploaded.

Both routes are bridge-only. When `grabConfig.grabEndpoint` is set (hosted or custom endpoint, no local bridge) the composer refuses the drop with "Attachments need the local Raven bridge". There is nowhere hosted to put bytes the agent could read.

## Overlay changes

**Drop zone.** Drag listeners on the composer root (`.raven-grab-composer`), not just the textarea, so the whole card is the target. `dragenter`/`dragover` add `data-drop-active` when `dataTransfer.types` includes `Files` or `text/plain`; `dragleave` counts nested enters to avoid flicker; `drop` and `paste` call `preventDefault` only when they will handle the payload, so ordinary text paste is untouched.

**Chip.** Each attachment renders as a 44×44 thumbnail chip under the textarea with the filename, pixel dimensions, and a remove button. Uploading shows a progress state; a failed upload shows the bridge's error inline and keeps the chip removable. Chips are part of the per-selection draft (`instructionDraft` lives on the draft; attachments live beside it), so switching selections switches chips, and `capturePanelDrafts()` / `renderPanel()` round-trips them.

**Accept list.** `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/svg+xml`, `image/avif`. Anything else is refused with the type named. Cap 25 MiB per file, 4 files per send.

**Send.** `payloadForSend()` adds `attachments: [{ id }]` from the draft. No bytes go through `/grab`; that route keeps its 1 MiB cap.

**Target description.** `selectionFor()` adds an `imageTarget` block when the selected element is an image carrier or contains exactly one:

```js
imageTarget: {
  kind: "img" | "picture" | "background" | "svg" | "video-poster",
  selector,                 // the carrier, which may be a child of the selection
  currentSrc,               // img.currentSrc, resolved absolute URL
  src, srcset, sizes,       // raw attributes, untruncated
  sources: [{ srcset, media, type }],   // <picture> children, when kind is picture
  backgroundImage,          // computed value, when kind is background
  alt, loading, decoding,
  naturalWidth, naturalHeight,          // 0 when not yet loaded
  renderedWidth, renderedHeight,        // from getBoundingClientRect
  objectFit, objectPosition, aspectRatio,
  sourceFile: { filePath, line, column } | null   // React metadata when present
}
```

This block is separate from `html` so the 2000-char cap never truncates it. `STYLE_PROPERTIES` also gains `background-image`, `object-position`, `aspect-ratio` (`object-fit` is already captured).

**Instruction hint.** When at least one attachment is present and the textarea is empty, the placeholder reads "Replace this image with the attached one" and the send stays enabled, since an attachment counts as work. The agent still reads the instruction text as authoritative.

## Bridge changes

**New route `POST /attachment`.** Key-protected like `/grab`. Two bodies:

- `multipart/form-data` with one `file` part. Read with a streaming cap of 25 MiB (separate from `MAX_BODY_BYTES`). Verify the magic bytes match the declared type; refuse mismatches.
- `application/json` `{ path: "/abs/path/or/file-url" }`. Resolve, require absolute, require a regular file under the user's home directory or the project directory, require an image type by magic bytes. Refuse anything else with the reason. No traversal: the resolved path must equal its `realpath`.

Both return `202` with the record:

```js
{
  id: "att_<16 hex>",
  origin: "drop" | "paste" | "path",
  name: "hero-v2.png",
  mime: "image/png",
  bytes: 184203,
  sha256: "<64 hex>",
  width: 1600, height: 900,     // null for svg without viewBox
  path: "/Users/andrew/.raven/grab-inbox/<sessionPrefix>/<sha12>-hero-v2.png",
  sourcePath: "/Users/andrew/Desktop/hero-v2.png" | null   // path route only
}
```

**Storage.** `~/.raven/grab-inbox/<first 8 of session key>/<sha256 first 12>-<sanitised name>`. Same sha within a session dedupes to one file. This follows the `~/.raven/references` precedent and keeps the user's repo untouched; moving the file into the project's asset directory is the agent's job because that destination is project-specific. Prune inbox directories older than 7 days on `startGrabSession`. `RAVEN_GRAB_INBOX` overrides the root, mirroring `RAVEN_REFERENCE_HOME`.

**Dimensions.** PNG via `pngjs` header; JPEG, WebP, GIF, AVIF via a small header reader (no new dependency; ~80 lines); SVG via `viewBox` or `width`/`height` attributes, else null.

**Session.** `currentSession.attachments: Map<id, record>`. `queueGrabSelection` replaces each `{ id }` in `parsed.attachments` with the full record and refuses unknown ids ("attachment att_… not found; re-drop it"). Attachments stay on the item and are not superseded by `supersedeOlderStyleProperties`.

**Drain.** Each element in `get_grabbed_elements` carries `attachments` and `imageTarget` verbatim. When any element has attachments, `agent_protocol` in `src/index.ts` appends: "An element carries attachments: absolute file paths the user supplied for this change. For an image replacement, copy the attachment into the project's asset location, update the carrier named in imageTarget (src, srcset, picture sources, or background-image, or the import at imageTarget.sourceFile), keep alt and rendered dimensions, and warn when the attachment's aspect ratio differs from imageTarget by more than 2%."

**`start_grab_session` response.** Adds one sentence to the returned protocol text so the agent knows attachments can arrive.

## Agent apply recipe

1. Resolve `imageTarget.selector` on the live page; reject if it no longer resolves.
2. Locate the source: `imageTarget.sourceFile` when present, else grep the project for the basename of `currentSrc`.
3. Copy `attachments[0].path` into the directory that holds the current asset, keeping the attachment's extension. Name it after the old asset when the extension matches; otherwise keep the attachment's name.
4. Rewrite `src`, every `srcset` candidate, every `<picture>` source, or the `background-image` declaration. For an `import hero from "./hero.png"` pattern, rewrite the import.
5. Preserve `alt`, `width`/`height` attributes, `loading`, `decoding`. Flag an aspect ratio mismatch above 2% in the acknowledgement rather than silently letting `object-fit` crop it.
6. Mark applied via `get_grab_operation`. Verify with `audit_asset_integrity` or a re-capture and `src/image-diff.ts` against the pre-change screenshot when one exists.

## Tests

Bridge (`test/grab-bridge-attachments.test.mjs`, node:test against `dist/index.js` like `grab-bridge.test.mjs`):
- multipart PNG accepted, record fields, file written, sha stable on re-upload
- declared `image/png` with JPEG bytes refused
- 25 MiB + 1 byte refused with 413 and nothing written
- path route: accepts a real PNG, refuses a missing path, a directory, a `.txt`, a symlink escaping home, a relative path
- `/grab` with an unknown attachment id refused; with a known id, drain shows the full record
- missing key → same 401/404 behaviour as `/grab`
- prune removes a 8-day-old inbox dir and keeps a 6-day-old one

Overlay (`test/grab-overlay-attachments.test.mjs`, real Chromium like `grab-overlay-voice-input.test.mjs`, because the mechanism spans the shadow root and `renderPanel()` rebuilds):
- synthetic `drop` with a `File` → chip appears, upload posted, chip survives a background `renderPanel()`
- paste with `clipboardData.files` → same
- `text/plain` drop of an absolute path → path route, textarea untouched
- drop with no selection → notice, no request
- non-image file → refused, type named
- selection switch → chips follow the draft
- send → `/grab` body has `attachments: [{ id }]` and no bytes; `imageTarget` present for an `<img>`, a `<picture>`, and a background-image div
- `grabConfig.grabEndpoint` set → drop refused, no upload

Each fix gets a mutant per repo convention.

## Out of scope for v1

- `mobile-grab` (native overlay has no file drop).
- Non-image attachments (fonts, videos, PDFs). The route is typed to allow them later.
- Dragging an image **from the page** into the composer (the target is already the selection).
- Hosted bridge storage.
- Overlay-side live preview swapping the `src` before the agent applies. Worth a follow-up: the overlay already previews style edits, and a `blob:` URL swap is cheap.

## Estimate

| Area | Lines | Notes |
|---|---|---|
| Overlay drop/paste/chips/draft plumbing | ~260 | mostly `browser/raven-grab.js`; mirror to `web/public/raven-grab.js` |
| Overlay `imageTarget` + style props | ~70 | |
| Bridge route, storage, validation, dims | ~220 | `src/grab-bridge.ts`, new `src/grab-attachments.ts` |
| Drain protocol text | ~15 | `src/index.ts` |
| Tests | ~350 | two files |

One engineer, two to three days including the adverse pass.

## Open questions for Andrew

1. Inbox under `~/.raven/grab-inbox` (recommended) or inside the project at `.raven/grab-inbox/` with a gitignore entry?
2. Should the overlay live-preview the swap with a `blob:` URL before send? Recommended as v1.1, not v1.
3. Cap of 4 attachments per send: enough, or allow a whole folder drop for gallery replacement?
