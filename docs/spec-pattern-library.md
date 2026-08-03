# Raven: pattern reference, interaction capture, and grounded prompt synthesis

Raven can already tell an agent what a person's rules are (`get_taste_profile`, `read_design_md`, `talon_scan`) but has no way to say *"build it like this."* This spec adds the missing input class — an exemplar the designer chose, marked up, and explained — and the composer that fuses it with the project's own tokens, components, taste rules, and active decisions into a build prompt. It is deliberately small: seven new tools — one composer, four session tools, and two reference-store tools — built on the `ReferenceCapture` record that already exists, plus three new routes on the grab bridge.

---

## 1. The loop

**In Andrew's words:** I find a page that does the thing well. I capture it. I circle the part I actually meant and type one line about why. Raven hands the agent a prompt that names my tokens, my components, my prohibitions, and cites the thing I circled. The agent builds it. Raven audits the build against the same rules and tells me which of my claims it could not verify.

**As a tool-call transcript (Phase 1 shape):**

```
list_taste_profiles()                          → ["andrew"]
get_taste_profile({name:"andrew"})             → rules[] incl. negative_prompt strings
start_critique_session({project, surface,
  brief, profile:"andrew"})                    → {session_id, panel_url}
capture_reference({session_id, url, app})      → {ref_id, image_path, traits}
  ... designer marks up at panel_url ...
get_critique_session({session_id,
  since_seq:0, timeout_ms:120000})             → {annotations[], notes[], state}
close_critique_session({session_id,
  mode:"extract"})                             → {extraction_prompt}
  ... calling agent answers its own prompt ...
record_critique_results({session_id,
  extraction_json, write:["references",
  "taste_decision_drafts"]})                   → {written, rejected[]}
  ... agent derives Structure/States from the
      reference it is already holding ...
compose_build_prompt({intent, project_dir,
  profile:"andrew", skeleton,
  session_id, surface})                        → {prompt, grounding, skeleton,
                                                  bindings[], gaps[], acceptance[]}
  ... agent builds ...
review_diff → audit_url → talon_scan →
audit_contrast → audit_tap_targets →
audit_taste                                    → verdict + note_assessments
```

Seven new tools total (§12). Everything after `compose_build_prompt` is existing Raven.

**Raven derives no skeleton.** It holds no model and makes no model call, and a `ReferenceCapture` carries only a URL, a prose `liked` line, aggregate `PageTraits`, and a timestamp (`src/taste.ts:92`, `src/capture.ts:285`) — nothing a Structure/States tree could be read out of. The calling agent already has the reference open in its own context, so deriving the tree is its job; `compose_build_prompt` takes that tree as an optional `skeleton` argument, lints it, binds it to the project's real components and tokens, and grounds it. Called without one it emits the grounding block alone — tokens, components, prohibitions, active decisions, acceptance criteria — with an explicit instruction to derive Structure/States from the reference and re-submit. That division is what keeps Phase 0 small and zero-dependency; it is **~3 days, not 2**, because registering any tool at all moves two frozen counts and six test files with them (§13).

---

## 2. Positioning and non-goals

Mobbin is a curated screenshot library for humans, 1,428 apps and 621,500 screens, $10/mo, with an OAuth MCP server at `https://api.mobbin.com/mcp` that does retrieval and knows nothing about your repo. This is the inverse: a corpus of one (yours) with deep knowledge of your `DESIGN.md` token index, your `TasteRule.negative_prompt` strings, and your `SurfaceBinding.design_notes` — which the server instructions at `src/index.ts:2191` already declare are acceptance criteria for any build. Corpus size is not the axis being competed on.

**The strongest counter-argument is "just paste the screenshot into Claude."** It mostly works. Three things it does not do: it does not know which of the eleven `DESIGN_DIMENSIONS` (`src/taste.ts:110-180`) you already answered for this surface, so it re-invents spacing and type you decided months ago; it cannot tell which *part* of the screenshot you meant, and shape coordinates are the cheap fix; and it does not persist, so the same reference is re-explained every session while `SurfaceBinding.references[]` already stores a reference's measured `PageTraits` and `checkBindingConsistency(design_notes, references)` (`src/taste.ts:1169`) already diffs stated intent against what the reference actually is. (`referenceDeltas()` is *not* that function — it takes a **built target's** `PageTraits` and diffs the build against the references, `src/taste-fidelity.ts:448`; it belongs to post-build verification, §11.) For a one-off, paste the screenshot. This earns its keep on the second use and on team surfaces where the rules are not in one person's head. Phase 0 exists to falsify that claim in about three days (§13).

**Non-goals.** A public browsable gallery of other companies' UI. Any scraping of Mobbin, Refero, or Screensdesign — their Terms forbid it and a ToS breach is far easier to enforce than an app-maker's copyright claim. A screenshot corpus for training a generative model. Video recording of any kind. Cloud speech-to-text. A second annotation surface in `web/` separate from the grab overlay. A Figma plugin. A Mobbin-shaped screen-type taxonomy invented from scratch. Multi-vector/ColPali retrieval. Any use of tldraw (its `LICENSE.md` forbids production use without a commercial key and enforces a watermark). A hosted shared corpus of third-party captures — ruled out on legal and privacy grounds (§5, §14), not on a technical blocker; §14 additionally shows that the hosted tier could not ground a build even if it were built.

Raven's license is **Apache-2.0** (`package.json`), not MIT. Every dependency choice below is Apache-2.0-compatible.

---

## 3. The corpus: unit, taxonomy, schema

**There is no new record type.** Raven already has a first-class reference: `ReferenceCapture` on `SurfaceBinding.references[]` (`src/taste.ts:89-92`), persisted per profile in `~/.raven/taste/<name>.surfaces.json` by `FsTasteStore` and in `taste:{sub}:surfaces:{name}` by `RedisTasteStore` (`getSurfaces`/`putSurfaces`, `src/taste-store-redis.ts:78-85`). Building a second parallel store would mean two write paths, two remote-gating stories, and two things `bind_taste_surface` and `audit_taste` have to learn about. Extend the existing one:

```ts
// src/taste.ts — additive fields only, all optional
export type ReferenceCapture = {
  url: string;
  liked?: string;                   // existing — prose, NOT a boolean (src/taste.ts:92)
  traits?: PageTraits;              // existing, src/capture.ts:285-303
  captured_at?: string;
  // new:
  ref_id?: string;                  // "ref_" + 12 hex
  app?: string;                     // "Linear", "own:portfolio"
  image_path?: string;              // ~/.raven/references/<ref_id>.png
  frames?: string[];                // paths, present only for motion captures (Phase 3)
  viewport?: { width: number; height: number };
  theme?: "light" | "dark";
  tags?: { screen_type?: string[]; ui_elements?: string[]; interactions?: string[] };
  note?: string;                    // the designer's own sentence
  annotations?: Annotation[];       // §8
  owner?: "self" | "third-party";
  attribution_url?: string;
  quality?: { score: number; flags: string[] };
};
```

**Additive to the type, not free at the boundary.** `validateReferences()` (`src/taste.ts:1088-1126`) does not pass records through — it constructs a fresh `ReferenceCapture` from an allowlist of exactly four fields and silently drops everything else, and it hard-rejects a non-string `liked` (`src/taste.ts:1112`). Every new field above therefore needs a matching branch in that validator or it will vanish on the first read-back. That is a required, named line item in Phase 1's `src/taste.ts` change, not a free extension.

Pixels live at `~/.raven/references/<ref_id>.png` (override `RAVEN_REFERENCES_HOME`), flat, no sha sharding — a personal reference set is hundreds of files, not tens of thousands. Records stay in the surfaces file. **Retrieval reads the surfaces file, which is one JSON read**, not ten thousand — the per-record-file layout an earlier draft proposed would have made every search a few thousand `open`+`parse` syscalls.

**Taxonomy** reuses vocabulary that already exists rather than inventing a Mobbin-shaped one: component ids from `src/data/design-systems/raven-canonical.components.json`, state names from `src/data/design-systems/taxonomy.json`, dimension names from the eleven `DESIGN_DIMENSIONS`. The only genuinely new axis is the interaction axis, §4. Tags are advisory metadata — a wrong tag degrades ranking, it never blocks a build, and there is no eval set, so tag quality is **unmeasured** and will be reported as such.

**Quality gate** at capture: reject if `traits.loader_hint` is set (the capture photographed a spinner — a known artifact), or if `traits.viewport_fill < 0.4`. `audit_asset_integrity` is *not* used as a gate: `pngjs` is an optional dependency and `src/asset-integrity.ts:34-58` returns a clean `fallbackResult` with a warning when it is absent, so the gate would silently pass everything on a bare install. Where `pngjs` is missing, `capture_reference` writes `quality.flags: ["unverified-no-pngjs"], score: 0` and says so in the tool result. Deduplication is `sha256` on the PNG bytes only, and its honest coverage is "catches an identical re-capture", not near-duplicates — full-page screenshots are almost never byte-identical across runs.

---

## 4. Interaction taxonomy

Ships as **prose pattern files conforming to the existing `Pattern` interface** (`src/index.ts:90-105`) dropped into the **existing** `src/data/patterns/` directory. This matters: `loadJsonDir` (`src/index.ts:124`) does not auto-discover directories — `loadAllData` (`src/index.ts:157-181`) calls it against a hardcoded list, so a new `src/data/corpus/` directory would be invisible without a code change, and a non-conforming shape merged into `allPatterns` would throw in `referenceComponents()` on `pattern.patterns.length`. Conforming to `Pattern` and using the existing directory is the smaller diff and makes `get_pattern`, `search_knowledge`, and `get_checklist` work for free, exactly as `SPEC.md` documents.

One file per group. Each sub-entry gains two optional fields (`aliases?: string[]`, `motion_bearing?: boolean`) — a two-line change to `interface Pattern`, and no *loader* change: `loadJsonDir` casts and merges, so the fields survive the read.

**But the data being additive does not make the retrieval free, and an earlier draft implied it did.** Nothing today reads a sub-entry's `aliases`. All three retrieval paths would ignore them:

- `get_pattern` matches `p.id === type` first, then `textSearch(p.id + " " + p.name + " " + p.summary, type)` — top-level only, no sub-entry field at all (`src/index.ts:2367-2375`).
- `search_knowledge` builds its haystack from `p.id`, `p.name`, `p.summary`, `p.checklist`, and each sub-entry's `name`, `description`, `do`, and `dont` — sub-entries, but not `aliases` (`src/index.ts:2583-2588`).
- `get_checklist` filters with the same top-level-only `textSearch` as `get_pattern` (`src/index.ts:2641-2644`).

So "sheet that snaps to thirds" → `bottom-sheet-detents` requires editing those three call sites to fold `aliases` into the matched text (a one-term addition to each). They are named in Phase 2's file list (§13). `motion_bearing` is genuinely free — it is filter metadata read by the composer, not by the retrieval tools.

`evidence` carries the attribution URL to a real public implementation.

**v1 ships 18 vetted entries, not 55.** Hand-authoring an entry with a real checklist and a resolvable `principles_referenced` citation into the 132-principle pool is an hour of work each; claiming 55 implies the taxonomy is written when it is not.

★ = motion-bearing (a static screenshot cannot represent it).

- **Feedback & status** (`interaction-feedback-status.json`) — undo-snackbar ★, optimistic-save-toast ★, inline-validation-on-blur, skeleton-to-content ★.
- **Loading & pagination** (`interaction-loading.json`) — infinite-scroll-sentinel ★, load-more-button, shell-then-data ★.
- **Disclosure & navigation** (`interaction-disclosure.json`) — bottom-sheet-detents ★, command-palette ★, accordion-expand ★, sticky-header-handoff ★.
- **Input & editing** (`interaction-input.json`) — inline-edit-in-place ★, combobox-typeahead ★, multi-step-form-progress ★.
- **Destructive & confirmation** (`interaction-destructive.json`) — typed-name-confirm, two-stage-delete-with-undo-window ★.
- **State transitions** (`interaction-state.json`) — empty-to-first-run ★, error-retry-backoff ★.

Backlog groups, authored as demand appears: selection & manipulation, filtering & search, auth & payment handoff.

`test/patterns-data.test.mjs` (extend the existing precedent) asserts: every file parses (`loadJsonDir` swallows malformed JSON with a bare `console.error` at `src/index.ts:135-146`), ids are unique across the merged pool, **every `principles_referenced` id resolves against the loaded principle pool**, and every `evidence` URL is well-formed. Talon's precedent (`src/talon.ts`) is that a principle citation is mandatory; an unresolvable citation is exactly the silent drift the test exists to catch.

---

## 5. Sourcing and licensing

Three tiers.

**(a) Captures the user can already see.** Their own product, and third-party pages they can visit, via `capture_reference` driving the existing `launchAuditChromium` path. Local, private, user-scoped, transformative research use. **This is the whole of v1.**

**(b) Shipped taxonomy with zero pixels.** The `src/data/patterns/interaction-*.json` files: name, aliases, do/don't, checklist, principle citations, and an `evidence` URL pointing at a real implementation. No third-party bytes ship in the npm package.

**(c) Scraping a gallery.** Not doing it. Mobbin's Terms §10.3–10.4 disclaim ownership of the Materials and rest on Singapore fair-dealing plus a notice-and-takedown address; the same Terms forbid mirroring, caching, archiving, or scraping *their* corpus. Building a re-hosted public gallery inherits every risk they carry without their takedown apparatus. No public lawsuit against Mobbin or a peer was found in research — that is a negative result, not a safety proof; the space runs on tolerance plus compliance.

**Human decisions, stated plainly and not decided here:**

1. **Does a third-party capture ever leave the user's machine?** A hosted shared corpus needs a rights-holder takedown path, a named jurisdiction, and a privacy review of what a competitor capture reveals. My recommendation is never. Note this is a policy choice, not a capability limit — the hosted function *can* run a headless browser (§14) — and §14 separately shows the hosted tier could not ground a build even if the policy went the other way.
2. **May the agent capture a URL the user did not type?** Autonomous reference-hunting materially changes the legal posture. Recommendation: no in v1 — `capture_reference` requires a URL that appeared in the user's own message or in a `SurfaceBinding.references[]` entry they already bound.
3. **robots.txt / ToS acknowledgement.** Recommendation: a one-time acknowledgement written into the taste profile at first capture, not a per-capture prompt.

---

## 6. Ingest and retrieval

**Ingest** is `capture_reference` → capture → quality gate → write PNG → append `ReferenceCapture` to the surface binding. Tagging is optional and agent-driven: the tool returns a `tagging_prompt` alongside the record, following the model-free pattern of `ingest_transcript` (`buildExtractionPrompt` at `src/decision-graph.ts:457`, `parseExtractionJson` at `:400`). Raven makes no LLM call and no network call of its own. The prompt supplies the interaction ids and canonical component ids as a **closed set** and instructs the model to return `[]` rather than guess — closed-vocabulary output is what keeps the taxonomy from drifting. Tagging cost is the calling agent's tokens; per-token multimodal pricing was not verified this session, so no dollar figure is quoted.

**Retrieval is one code path: tag filter, then text match.** `search_references({query, surface?, interaction?, limit})` filters on `tags` and `owner`, then ranks with the existing `textSearch()` used by `search_knowledge` (`src/index.ts:2566+`) over `note`, `app`, and tag strings.

No embeddings are populated in v1. The `LexicalEmbedder` in `src/decision-graph.ts:76-105` is an unweighted bag of hashed unigrams into 256 colliding slots with no IDF; cosine over it is keyword overlap with a lossy hash in front, which is a heavier version of the `textSearch` that already exists. **Ceiling, stated:** text retrieval matches vocabulary, not meaning — "sheet that snaps to thirds" will not find `bottom-sheet-detents` unless the note says so, mitigated only by `aliases[]` — and only once the three retrieval call sites are taught to read them (§4, listed in Phase 2's files). **Upgrade path:** `voyage-multimodal-3.5` (1024-dim, 200M text tokens + 150B pixels free per month, which covers ~75k screenshots) for text→pixels, written into an `embedding` field added at that time. Not SigLIP-2-via-Python: it is Apache-2.0 and free, but it means a Python/MLX install, model weights, and a sidecar process for a package installed with `npx`, and it makes the free path Apple-Silicon-only. Not `jina-embeddings-v4` — its license is the Qwen Research License.

**No vector store.** A linear scan over a few thousand records is sub-10ms. **The file is not already loaded, and an earlier draft's "already-loaded" claim was false:** `FsTasteStore.getSurfaces()` does a fresh `readFileSync` + `JSON.parse` on every call (`src/taste-store.ts:58`), so each search pays a full re-parse of the surfaces file. Honest ceiling: fine at hundreds of records; re-parse cost grows linearly with corpus size, and it is the parse, not the scan, that dominates. Upgrade path when it bites: an in-process cache in `FsTasteStore` keyed on the file's `mtime`, invalidated by `putSurfaces`. `sqlite-vec` is pre-v1, needs a SQLite driver this repo does not have, and its value is ANN over corpora explicitly ruled out. Upgrade trigger, to be re-derived from a measured number rather than guessed: when `search_references` p95 exceeds 200ms on a real corpus.

**Remote.** All seven new tools go in `REMOTE_GATED_TOOLS`. **The anonymous remote surface is frozen at exactly 45 tools, asserted by a golden sha256 over the sorted tool names in two tests** (`test/mcp-user-auth.test.mjs:138` and `test/taste-remote-full.test.mjs:85`, both against `GOLDEN_45_HASH`) **and by a count-only assertion in three more** (`test/remote-store-invariant.test.mjs:114`, `test/remote-browser-gate.test.mjs:194`, `test/grab-bridge.test.mjs:891`). The distinction matters: the count assertions catch an added tool but not a renamed one; only the two hashes freeze the names. The codebase already gates otherwise-safe tools purely to preserve it — `talon_scan`, `talon_rules`, and `audit` are gated with that explicit comment at `src/index.ts:1896-1911`. Registering anything remotely here would make the surface 46 and fail all five. If remote search is ever wanted, that is a separate golden-hash rebaseline with its own justification, not an incidental line in this spec.

**Gating them is not free either — it is just cheaper.** The 45 and its hash hold, but the *local* count and the *gated* count both move: each new gated tool takes local 105 → 106 → … and gated 60 → 61 → …, and those two numbers are frozen in three `src/index.ts` comment blocks and asserted by six tests, one of which regex-matches the comment text itself. §13 Phase 0 lists every constant and test file; the same tax applies once per tool in Phases 1–2.

---

## 7. Capture: screens, flows, interactions

**Screens (Phase 2).** `capture_reference` reuses `launchAuditChromium` (`src/browser-launch.ts:294`) and the existing single `page.screenshot({fullPage:true})` at `src/capture.ts:553`, writing the buffer to `~/.raven/references/<ref_id>.png` instead of holding it as base64. This is the only genuinely new byte-persistence in Raven: `register_creative_asset` is metadata-only by design (`src/index.ts:6105`) and `CaptureResult.screenshotBase64` never touches disk today. Respects `CAPTURE_DEADLINE_MS = 90s` (`src/capture.ts:319`, added after a 30-minute hang binding `apple.com/airpods-pro`).

**Before/after pairs (Phase 2).** Two captures around one interaction, using the existing `CaptureOptions.interactions: {selector, event: 'hover'|'click'|'focus', delay_ms}[]` (`src/capture.ts:388-393`). This is what the current code can actually do twice, and it covers disclosure and state-change patterns adequately.

**Motion frames (Phase 3, gated on demand).** This is new code inside `src/capture.ts`, not a parameter, and the earlier draft's mechanism does not work. `capture()` takes exactly one screenshot, *after* the interaction loop at `:499-503` has finished; a `page.screenshot` round-trip costs roughly 80–250ms, so a polling sampler cannot resolve a 200–300ms transition at all. The two mechanisms that do work:

- **Scrub** (preferred, deterministic): `document.getAnimations().forEach(a => a.pause())`, then set `currentTime` to N fixed offsets and clip-screenshot the element box at each. Exact `t_ms`, no sampling race. Works only where `getAnimations()` is non-empty.
- **Screencast** (fallback): `page.context().newCDPSession()` → `Page.startScreencast`, which streams compositor frames with real timestamps. Playwright already exposes CDP; no new dependency.

`getAnimations()` returns only CSS animations/transitions and WAAPI animations. framer-motion, GSAP, and Lenis-driven scroll are rAF tweens on inline styles and return nothing — and the worked example's own target is framer-motion (`src/components/CaseStudyLayout.tsx` **in the `andrewcunliffe-portfolio` repo**, the project §10 runs in; there is no such file in raven-mcp, and every other repo path in this spec is a raven-mcp path). **So the default is screencast, every derived timing is marked `source:"observed"` with a stated resolution floor (±16ms), and the scrub path is opportunistic enrichment when `getAnimations()` happens to be populated.** Before building either, measure how often `getAnimations()` is non-empty across ~20 real reference URLs; that number decides whether the scrub path is worth writing.

`scroll` is not in the `Interaction` union and there is no scroll driver in `capture.ts`. Phase 3 widens the union with a distinct variant `{kind:"scroll", to: number|"element", duration_ms}` and its own branch in the driver loop, and the file-level change plan says so. **Hazard to note in the tool description:** a programmatic `scrollTo` on a Lenis or smooth-scroll site records the library's motion, not the reveal's.

**Cut:** dropped video files. A `file://` video drawn to a canvas taints it in Chromium, so `toDataURL` throws `SecurityError` — the proposed path does not run. **Cut:** Android via `adb exec-out screenrecord` — an unbuilt harness for a device nobody in the worked example uses. **Cut:** iOS motion. `mobile-grab/server.mjs` already shells `xcrun simctl io <udid> screenshot` into `mobile-grab/.cache/sim-screenshot.png` and is the one existing screenshot-to-file path in the repo; it stays as-is.

---

## 8. The critique session: annotation and voice

### Where it lives

In the grab overlay (`browser/raven-grab.js`), because the bridge already has the keyed loopback transport, the long-poll drain (`get_grabbed_elements`, `src/grab-bridge.ts:1433-1474`), and the pending-changes tray. The "the hosted `/raven-design` panel gets it for free" argument is deleted: that copy runs `mode:'standalone'` against no bridge, no loopback key, and no `~/.raven/references`, so it would render a tab that cannot save anything. The Markup tab is gated on `ravenGrabConfig.mode === 'critique'`.

The two overlay copies (`browser/raven-grab.js` and `web/public/raven-grab.js`) are byte-identical today at 587,281 bytes by manual copy with no build step and no drift check. Adding ~150 lines to one creates a silent drift surface, so this ships with `scripts/sync-overlay.mjs` and a `node:test` asserting byte-equality.

### Two new bridge routes

The panel renders PNGs captured from *other* sites; there is no host page to inject into and the pixels live where the browser cannot reach them. Both routes are key-gated identically to the existing ones:

- `GET /critique` — a minimal standalone HTML document that loads `raven-grab.js` with `ravenGrabConfig.mode:'critique'` and the session id. This is what `panel_url` points at.
- `GET /reference/<ref_id>.png` — streams the file from `~/.raven/references/` with the right content type. Path is validated against the session's own record list, never against a caller-supplied path.

`127.0.0.1` is a secure context, so a future microphone path works there; it would be dead if the overlay were instead injected into a non-localhost `http` origin.

### Markup

Tools: **box, arrow, pin.** Freehand is cut (it needs point decimation and smoothing for no added signal). Annotations are append-only: draw, or delete a row from the list. Ceiling: no dragging or reshaping after drawing.

**Library: none.** `browser/raven-grab.js` is a single vanilla no-build file with no bundler and no React — you cannot `npm install` into it, which makes `react-konva`'s one real advantage (a declarative React binding) worthless here. Box/arrow/pin on a plain `<canvas>` with pointer events is ~150 lines and matches the file's existing hand-rolled editors (numeric scrub, box-shadow, per-side stroke are all hand-rolled there already). tldraw is disqualified by license. Excalidraw is ~500KB gzip for 4% of its surface. Upgrade path if reshaping is ever demanded: Konva (MIT, ~60KB) served UMD from the bridge the way `raven-grab.js` already is.

```ts
type Annotation = {
  id: string; session_id: string;
  ref_id: string;                  // which reference
  frame_index?: number;            // Phase 3 only
  shape: "box" | "arrow" | "pin";
  coords: number[];                // normalized 0–1: box [x,y,w,h]; arrow [x1,y1,x2,y2]; pin [x,y]
  note?: string;                   // typed
  seq: number; created_at: string;
};
```

Normalized coordinates survive panel resize and re-render at another scale. They `POST /critique`, key-gated exactly like `POST /grab`.

### Durability and concurrency

The bridge holds **one** module-level `currentSession` and persists nothing (`src/grab-bridge.ts:326-345`), with a 200-item cap. Two consequences an earlier draft ignored: a later `start_grab_session` silently replaces the singleton and kills the open critique session; and the MCP server restarts routinely, taking the port with it. This is the longest-lived state in the product sitting on the least durable storage in the repo.

Fixes, all small: **write through to `~/.raven/critique/<session_id>.json` on every `POST /critique`** (a few KB, no batching), not on drain. `start_critique_session({session_id})` is re-attachable — it rebinds a fresh port and key to an existing on-disk session and returns a new `panel_url`. And `start_grab_session` refuses while a critique session is `collecting`, with a message naming the session id. Keying bridge sessions by id is the better fix and is the upgrade path; mutual exclusion is the ten-line version.

Session states: `collecting` → `extracting` (frozen; `POST /critique` returns 409) → `closed`, or `discarded`. No activity for 24h marks `stale` on next read; nothing is auto-deleted.

### Voice

**Cut from v1.** The delivered artifact of the voice path is a sentence of text, and the price is a Python ASR stack, a sidecar process, a VAD endpointing problem that the research itself flags as make-or-break, a privacy risk row, and a failure mode (mis-transcription silently corrupting acceptance criteria) worse than typing. Ship the textarea. Revisit when usage shows people writing long reference notes and complaining about typing them — that is the trigger, stated, not a default yes.

When it returns: push-to-talk `MediaRecorder` (no VAD problem at all), `mlx-whisper` (MIT weights) in an optional local sidecar, degrading to typed notes when absent. Not `parakeet-mlx` — NVIDIA's weights license restricts SaaS redistribution. Not the Web Speech API — Chrome streams audio to Google's servers and Safari to Apple's, per MDN, so it cannot satisfy a local-only promise. Cloud transcription stays a **human decision** (§16), never a silent fallback.

### Extraction

`close_critique_session({mode:"extract"})` returns `buildCritiqueExtractionPrompt(session)` — the decision-graph pattern again, model-free on Raven's side. The prompt carries the brief, each reference with `ref_id` and origin, each annotation as `[box @ 0.12,0.44,0.31,0.08 on ref_8812]`, and each note verbatim. Frames and images are passed as **file paths with an instruction to Read them**, not inlined base64: the return invariant is one JSON text block, `audit_url` returns a `screenshot_bytes` count per capture and withholds the pixels unless `includeScreenshots` is set (`src/audit-url.ts:185-186`; the parameter is camelCase, `src/index.ts:3947`), and `generate_taste_portrait` caps inline output at 350KB (`PORTRAIT_INLINE_MAX_BYTES`, `src/taste-portrait.ts:102`). Inline base64 is available only behind an explicit `include_images` flag, cropped to the annotation box, downscaled to ≤512px on the long edge, and hard-capped at that same 350KB.

```ts
type CritiqueExtraction = {
  liked: Attribute[];          // {attribute, dimension, evidence_refs[], quote}
  disliked: Attribute[];
  constraints: { statement: string; hard: boolean; quote: string }[];
  references: { ref_id: string; verdict: "liked"|"disliked"|"mixed"; why: string }[];
  unresolved: string[];
};
```

`dimension` is constrained to the eleven `DESIGN_DIMENSIONS` names so extraction lands in vocabulary the taste engine already speaks.

**The anti-hallucination gate is a real check, not a required field.** `parseCritiqueJson()` rejects any attribute or constraint whose `quote` is not a literal (whitespace-normalized, case-insensitive) substring of a stored note in that session, and rejects any `evidence_refs` entry that does not resolve to an annotation id or `ref_id` in the session. Requiring only that a quote field be *present* checks nothing — the model that invents the attribute invents the quote. `unresolved[]` is deliberate: an extractor that turns "hmm, something's off" into a rule is worse than one that says it could not tell.

### Writing back

`record_critique_results({session_id, extraction_json, write})` writes:

- Each `reference` → the `ReferenceCapture` entry's `liked` and `note`, in the existing surfaces file.
- Each attribute → a **`decision_draft`** candidate, not a committed record.
- Each `constraint.hard` → a **proposed** `TasteRule`, returned in the tool result and **not written** until a second call with `confirm: true`.

That two-step is not ceremony. There is no existing write path for `TasteProfile.rules` — `create_taste_profile` seeds them from a template and nothing in the 13-tool taste surface mutates the array afterwards — so this is a new mutation of the most load-bearing user artifact in the product. When it does write, the rule is fully constructed: `rule_id: "CRQ-<session>-<n>"`, `category` mapped from the extraction's `dimension`, `severity_default: "warn"` **always** (never `block` from an automated extraction), `owner: "taste"`, `scope` from the session's surface, additive and idempotent by `rule_id`. `negative_prompt` is parsed into a deterministic banned-word scan when it is vocabulary-shaped (`extractBannedTerms`, `src/taste.ts:1439`), so a sloppily generated sentence would otherwise become a live detector silently. `decision_draft` → `decision_commit` is the existing precedent for exactly this.

**Never `record_taste_decision({source:"user-approved"})` for something the agent decided.** All three values in that vocabulary (`user-directed|user-approved|user-corrected`, `src/taste.ts:196-206`) assert human involvement; writing an agent's autonomous choice as one poisons the corpus that §9 reads back as authoritative. The decision graph already has `status:"candidate"` with `author_trust:"extracted"` (`src/decision-graph.ts:5-31`) for precisely this case.

---

## 9. Prompt synthesis: grounding in the user's tokens and components

### Inputs

Everything in the middle column already exists and must not be re-derived. **The right-hand column is the schema derivation:** every input is a real function with a real signature, and the composer's arguments exist only because some input demands them. Three rounds of review found the schema underspecified against exactly this column, so it is stated per-input rather than asserted in prose.

| Source | Contributes | Fed by which `compose_build_prompt` argument |
|---|---|---|
| `read_design_md` | `FlattenedDesignToken[] = {path, group, name, value, kind, cssVar}` — the only legitimate source of literal color/type/spacing values in the output. Plus the component manifest via `extractComponentManifest` (`src/designmd.ts:168`). | **`design_file_path`, else `project_dir`.** `readDesignMd` takes a `path` and the tool's schema makes it required (`src/index.ts:2905-2913`) — an intent-only call has nothing to open. Resolution order: `design_file_path` verbatim → `resolveDesignSystemPath(project_dir)` (`src/index.ts:1859-1863`) → `<project_dir>/DESIGN.md`. That third rung is the composer's own, and it is needed: `resolveDesignSystemPath` calls `readSourceConfig`, a bare `readFileSync` of `<project_dir>/.raven/design-system-source.json` with no existence check (`src/design-system-diff.ts:41-43`), so it **throws ENOENT** on any project that never ran `configure_design_system_source`. The composer catches that, falls back to `<project_dir>/DESIGN.md`, and reports which rung resolved in `grounding.design_md`. |
| `inventory_design_system` (`src/design-system-diff.ts:45`) | `InventoryComponent[]` with `evidence:"declared"`. | **Same resolution, same two arguments.** Its own schema is `{project_dir?, design_file_path?}` (`src/index.ts:7666-7678`) and it throws `"Provide project_dir or design_file_path"` when given neither (`src/index.ts:1861`). |
| `diff_design_system` | Which canonical states/variants the user's components are missing, against `raven-canonical.components.json` + `taxonomy.json`. | Same again — `{project_dir?, design_file_path?}` through the identical resolver (`src/index.ts:7684-7690`). |
| `get_taste_profile` | `TasteRule[]`; `negative_prompt` strings become the prohibitions block verbatim. | **`profile`, required.** `getTasteProfile(store, name)` takes an explicit name and throws `"Taste profile not found"` with the available list when it misses (`src/taste.ts:389-400`). There is no default-profile resolution anywhere in the taste engine, so an intent-only call has no rules to prohibit with — which would silently produce a prompt with an empty `## Prohibitions` block, the single worst failure this tool could ship. |
| `SurfaceBinding` | `design_notes` (acceptance criteria per `src/index.ts:2191`), `voice_note`, per-rule `overrides`, `references[].traits`. | **`profile` + `project`.** `resolveSurfaceBinding(store, profileName, {project, url})` reads the bindings for one named profile (`src/taste.ts:963-970`) and matches `hints.project` case-insensitively against `binding.project`, falling back to hostname matching on `hints.url` (`src/taste.ts:975-995`). Note precisely what that means: **`hints.project` is a project *name*, not a directory path** — `binding.project` is a plain string (`src/taste.ts:93-95`) set at bind time. So `project_dir` cannot feed it directly. `project` is therefore its own optional argument, defaulting to `basename(project_dir)`; that default is a convention (every worked example binds `project` to the repo directory name), not a guarantee. A name that matches nothing returns `null` → no `design_notes`, no `voice_note`, no `build_hints`, and the composer says so in `## Gaps` rather than emitting an unconstrained prompt. **`reference_url` is never passed as the `url` hint** — it points at someone else's site (Linear, in §10), and matching it against the profile's hosts would bind the wrong surface. |
| `list_taste_decisions` | Prior `TasteDecision`; anything in `rejected[]` for the same dimension is a prohibition, not a suggestion. | **`profile`** (decisions are stored per profile), filtered by `project`. |
| Decision Graph, **read directly — not via `decision_list`** | Two store calls: `decisionGraphStore.listActiveDecisions()` (`src/decision-graph.ts:606`) for active `DecisionNode`s with `alternatives_rejected[]`, and `decisionGraphStore.listDecisions("contested")` (interface `src/decision-graph.ts:135`, impl `:632`) for contested ones, which are routed into `## Gaps / decisions for you` as open questions and never silently resolved. **Why not the tool:** `decision_list` is classified `destructive` (`src/index.ts:2080`) and every call with a non-empty result appends a record to `consultations.jsonl` via `recordConsultation` (`src/index.ts:6983`, `src/decision-graph.ts:701`); a composer that called it would write on most reads, and `compose_build_prompt`'s `readOnly` annotation (§12) would be false. (The write is conditional, not universal: `recordConsultation` returns early when `decisions.length === 0` **or** when `RAVEN_NO_CONSULTATION_TRACE=1` is set, and its whole body is wrapped in a `try` whose `catch` swallows the error — `src/decision-graph.ts:701-717`. A `readOnly` annotation that is only true when an env var happens to be set is still false, so the direct read stands.) Reading the store functions directly keeps that annotation true. `decision_list` also cannot be asked for contested decisions and active ones in one call — `status` selects exactly one status, and omitting it yields active decisions plus, when `include_candidates:true`, candidates (`src/index.ts:6972-6977`); contested never appear on the no-status path. (`decision_scope` is **not** a retrieval source either — it is a destructive mutation that rewrites the scope of two decisions, `src/index.ts:6875-6884`.) | **Nothing.** This is the one input no argument can reach — see the limitation below. |
| `talon_rules` | The 15 deterministic TAL-* rules with principle citations — the machine-checkable half of acceptance. | Nothing — a static in-process rule table (`src/index.ts:7637-7642`). |
| `audit_taste` → `build_hints` | `TECHNIQUE_RECIPES` (`src/taste-fidelity.ts:536`) already maps a design note naming an expensive technique to a concrete recipe plus canonical public examples. This is the existing grounded-prompt-writer on the design side; technique-level guidance routes through it so there is one source, not two. | **Transitively `profile` + `project`.** `buildHints(notes)` takes `design_notes` and nothing else (`src/taste-fidelity.ts:706`), so it produces `[]` whenever the binding failed to resolve. No binding → no hints, stated in `## Gaps`, not silently empty. |
| `get_pattern` / `get_principles` | Behavior knowledge a screenshot cannot show — the do/don't/checklist that fills the state machine. | Nothing — static pools loaded at import. |

`buildCreativePrompt()` (`src/index.ts:1442-1466`) is the structural precedent: compose a prompt from a frame plus a stored profile. This is the same shape with design inputs.

**Named Phase 0 limitation, narrowed to what is actually true: `project_dir` scopes the files, and cannot scope the Decision Graph.** An earlier draft took a `project_dir` and implied it scoped everything; round 2 removed it because it could not scope the decision store. That finding stands and the limitation below is unchanged. What changed is its blast radius: the decision store is *one* of nine inputs, and removing the argument outright broke the other three that genuinely accept a path. `project_dir` is back for `read_design_md`, `inventory_design_system`, `diff_design_system`, and (via `basename`) binding resolution — all of which take a caller-supplied path or name — and is still powerless over the Decision Graph. This is a narrowing of the round-2 finding, not a reversal of it.

The decision-store half, unchanged: `decisionGraphStore` is a module-global singleton constructed once at import (`src/index.ts:63`), `FsDecisionGraphStore`'s constructor takes an embedder and no path (`src/decision-graph.ts:500-506`), and the store's location is resolved globally by `decisionsHome()` — `RAVEN_DECISIONS_HOME` if set, otherwise the nearest checked-in `.raven/decisions/` found by walking up from `process.cwd()` (`src/decision-graph.ts:344`, `:359-360`). Passing a `project_dir` does not move it. **So the composer must say so rather than imply otherwise:** `grounding.decisions_scope` echoes the resolved `decisionsHome()`, and when it is not inside `project_dir`, the emitted prompt carries an explicit line — *"decisions were read from `<path>`, which is outside the project you named"* — and the mismatch is added to `## Gaps`. A silent cross-project grounding is the failure; a labelled one is honest. **Upgrade path:** thread an explicit store path through `FsDecisionGraphStore`'s constructor (and past the module-global) before letting `project_dir` scope decisions; until that exists, cross-project decision composition is out of scope, not merely unimplemented.

### The skeleton

A reference is in the wrong brand, density, and type family. Copying it produces someone else's app. The intermediate representation is strictly colorless, typeless, and sizeless, and **the composer lints it: a hex value, a font name, or an absolute px other than a motion distance fails.** If the skeleton can express brand, brand gets smuggled through it.

**The skeleton comes in, it is not derived.** The calling agent authors it from the reference it already holds and passes it as the optional `skeleton` argument; Raven's job is to lint it, bind it, and ground it. Raven cannot author it — it makes no model call, and the stored reference record is a URL, a prose line, and aggregate `PageTraits`, none of which contain a node tree. Without a `skeleton` the composer emits the grounding block and asks for one; the types below are that argument's shape.

These types live in `src/reference-prompt.ts` — the only *new* file Phase 0 schedules (§13; the phase also edits `src/index.ts` and six test files that assert the tool counts). No `src/pattern-skeleton.ts`: a second new source file buys nothing — nothing outside the composer consumes these shapes. **Every section the output template emits has a type here**; `Skeleton` is the root, and it is what the optional `skeleton` argument must parse as.

```ts
// src/reference-prompt.ts — internal types, not a separate tool

interface Skeleton {
  structure: StructureNode;            // single root; ## Structure
  states?: StateMachine;               // ## States
  content?: ContentSlot[];             // ## Content
  motion?: MotionSpec[];               // ## Motion
  provenance?: Provenance[];           // cited across every section
}

interface StructureNode {
  node_id: string;
  role: string;                        // ARIA/semantic: "status", "button", "list"
  archetype: string;                   // raven-canonical component id
  containment: "stack" | "row" | "overlay" | "inline";
  order: number;
  emphasis: 1 | 2 | 3;                 // RELATIVE weight only, never a px size
  density: "compact" | "default" | "roomy";
  children: StructureNode[];
}

interface StateMachine {
  initial: string;                     // must be a member of states[]
  states: { name: string; terminal?: boolean; note?: string }[];
  transitions: {
    from: string; to: string;
    on: string;                        // event name, or "timeout"
    timeout_ms?: number;               // only when on === "timeout"
    paused_by?: ("hover" | "focus-within")[];
    kind: "note" | "pattern" | "inferred" | "designer";   // required; NEVER "pixel" — see below
    pattern_ref?: string;              // required when kind === "pattern"
  }[];
}

interface ContentSlot {
  node_id: string;                     // resolves against StructureNode.node_id
  slot: string;                        // "message", "action-label", "empty-state"
  copy: string;                        // real copy, not lorem
  voice_constraint?: string;           // from SurfaceBinding.voice_note
  max_chars?: number;
  kind: "note" | "pattern" | "inferred" | "designer";   // required; never "pixel"
}

interface MotionSpec {
  node_id: string; on: string;
  properties: ("opacity"|"translateY"|"translateX"|"scale"|"height")[];
  from: Record<string, number>; to: Record<string, number>;
  duration_ms: number; delay_ms: number;
  easing: string | null;               // null unless observed
  source: "observed" | "pattern-knowledge" | "designer" | "default";  // required, no default
  reduced_motion: "none" | "opacity-only" | "instant";
}

interface Provenance {
  claim: string;
  kind: "pixel" | "note" | "pattern" | "inferred";   // required
  ref_id?: string; bbox?: [number,number,number,number];
  pattern_ref?: string;
}
```

**`source` and `kind` are the fix for the biggest failure this spec could ship.** A static screenshot cannot show a duration, an easing curve, the absence of a state, or a 6000ms timeout. An earlier draft asserted `cubic-bezier(0.2,0,0,1)` "measured from `ref_8812`" when nothing in Raven could have measured it. Rules now enforced by the composer: `easing` is `null` unless a Phase 3 motion capture produced it; a `StateMachine` transition or `ContentSlot` may never carry `kind:"pixel"` — a screenshot cannot show a transition or a copy rule, so that value is excluded from their `kind` unions at the type level rather than checked in prose; and every non-pixel behavioral line in the emitted prompt is prefixed with its source ("180ms is a pattern default, not observed in ref_8812").

### Binding

`bindSkeleton(skeleton, inventory, tokens, taste)` is deterministic, not a model call:

1. `archetype` → the user's component via `InventoryComponent.aliases`, then the `raven-canonical` alias table, then **normalized Levenshtein ≥ 0.8 on lowercased ids**. The metric is named because an unnamed "string similarity ≥ 0.8" is untunable and unverifiable; the threshold is validated by measuring it against the canonical component list rather than by reading the constant. Emits `confidence: "alias"|"canonical"|"fuzzy"|"unresolved"`.
2. `emphasis`/`density` → token paths **by parsing the numeric value of each token in the group and sorting the ramp**, never by declaration order. Declaration order in a YAML block carries no semantics: `type.body.sm`, `type.display.lg`, `type.mono.xs` can appear in any sequence, and ranking by it is a coin flip in the one step where the whole colorless-skeleton claim cashes out. Where a group has no parseable numeric ramp, or a `ref` chain makes it ambiguous, the binding is **unresolved and goes to Gaps**.
3. `MotionSpec` numbers → the nearest `motion.duration.*` / `motion.easing.*` token within ±40ms; otherwise the literal is kept and flagged `motion_token_gap`.
4. Anything unresolved is **never guessed** — it becomes a named decision in `## Gaps` that the building agent must make and report.

### Inventory ladder

1. **DESIGN.md component manifest.** Authoritative, already wired. When empty, keep `inventory_design_system`'s existing phrasing — *"no component declarations found — component coverage is unknown, not missing"* (`src/design-system-diff.ts:49`) — which is the correct epistemics.
2. **shadcn `registry.json`** at the project root → `ComponentDecl`s with `evidence:"registry"`. ~30 lines.
3. **Repo scan** — glob `src/components/**/*.{tsx,jsx,vue,svelte}`, exported PascalCase symbols, `evidence:"filename"`. Names only. Ceiling: cannot tell whether `Toast` supports an action slot.
4. **None** → `unbound` mode. Archetypes stay as canonical ids, every component reads `<Snackbar> (no component found in your system — create it or name your equivalent)`, and the first prompt section asks the agent to run `configure_design_system_source` and re-synthesize. It never silently emits shadcn imports.

**Dropped: Storybook and Figma rungs.** Storybook requires an HTTP fetch to a caller origin, which would make `compose_build_prompt` open-world and force `TOOL_OPEN_WORLD` + `REMOTE_URL_GUARDED_TOOLS` membership; if wanted later, it takes a pre-fetched `index.json` blob as an argument and stays closed-world. Figma is not possible at all: `get_variable_defs` and `get_code_connect_map` are Figma MCP tools, and Raven is an MCP server — it cannot call another MCP server. If Figma enrichment is wanted, the calling agent fetches it and passes it in as an optional `components[]` argument.

**Dropped: `fallback_system`.** Grounding in `linear.json` when the project has no DESIGN.md is the exact failure this feature exists to prevent. Refuse and point at `init_design_md`.

### Output template

Fixed section order, always:

```
# Build: <intent>
Grounded in: <DESIGN.md path> · taste <profile>/<surface> · inventory <source> (<n> components)
Reference: <ref_id> (<app>, captured <date>) [+ n more]

## What we're copying (and what we are not)
## Structure            <- bound tree, real component names
## States               <- state machine, each row tagged with its source
## Motion               <- numeric, each spec tagged observed/pattern/designer/default
## Content              <- slots with real copy + voice constraint
## Tokens to use        <- explicit token names, no literals
## Prohibitions         <- negative_prompts + rejected alternatives, verbatim
## Gaps / decisions for you
## Acceptance criteria
```

---

## 10. The worked example

Andrew, in Claude Code, in `andrewcunliffe-portfolio`. Target: an optimistic-save affordance on the deck's settings surface. Project declares `Button`, `Snackbar`, `IconButton` in DESIGN.md; tokens under `color.*`, `space.*`, `motion.*`.

**1.** Andrew: *"I want the save on this to work like Linear's — commits immediately, undo in the confirmation. Let me show you."*

**2.** Claude → `get_taste_profile({name:"andrew"})` → rules including `TASTE-004 negative_prompt: "no glow, no gradient fills, no second accent hue"` and `TASTE-011: "no spring or bounce easing on functional feedback"`.

**3.** Claude → `start_critique_session({project:"andrewcunliffe-portfolio", surface:"deck", brief:"optimistic save with undo", profile:"andrew"})` → `{session_id:"crq_8f21", panel_url:"http://127.0.0.1:52814/critique?key=…"}`.

**4.** Claude → `capture_reference({session_id:"crq_8f21", url:"https://linear.app/settings", app:"Linear", owner:"third-party"})` → `{ref_id:"ref_8812", image_path:"~/.raven/references/ref_8812.png", traits:{…}}`. Same for `ref_9034` (Things 3, a local screenshot Andrew already had).

**5.** Claude: *"Two references in the panel at that URL. Box what you mean and type a line under each."*

**6.** Andrew boxes the status strip on `ref_8812` at `[0.03,0.86,0.49,0.07]`, notes: *"the undo lives inside the confirmation, not a separate toast."* Boxes `ref_9034`'s action label, notes: *"text button, not an icon."* Pins the accent-tinted surface on `ref_8812`, notes: *"not this — that's their brand."*

**7.** Claude → `get_critique_session({session_id:"crq_8f21", since_seq:0, timeout_ms:120000})` → 3 annotations, `state:"collecting"`.

**8.** Claude → `close_critique_session({mode:"extract"})` → `{extraction_prompt}`, answers it itself, then `record_critique_results({session_id, extraction_json, write:["references","taste_decision_drafts"]})` → `{references_written:2, drafts:1, rejected:[]}`. The one rejection would have been an attribute whose quote was not a substring of any stored note.

**9.** Claude writes the Structure/States skeleton itself — it has both references and all three notes in context — and passes it in: `compose_build_prompt({intent:"optimistic save with an undo affordance", project_dir:"~/projects/andrewcunliffe-portfolio", profile:"andrew", skeleton:{…}, session_id:"crq_8f21", surface:"deck"})`. `project_dir` roots the DESIGN.md read and the inventory, and its basename `andrewcunliffe-portfolio` is what resolves the surface binding — the same string step 3 bound as `project`. It does **not** scope the Decision Graph: `dec_2291` below was read from the store `decisionsHome()` resolved from the server's own cwd, which the emitted `grounding.decisions_scope` states (§9). Had it called without `skeleton`, the return would have been the grounding block plus the instruction to derive one and re-submit. Emitted prompt, abridged:

> **# Build: optimistic save with an undo affordance**
> Grounded in: `./DESIGN.md` · taste `andrew/deck` · inventory `DESIGN.md` (14 components)
> Reference: `ref_8812` (Linear, captured 2026-08-01) + `ref_9034` (Things 3)
>
> **## What we're copying (and what we are not)**
> From `ref_8812` [kind: note] — the undo lives inside the confirmation, not a separate toast stack. From `ref_9034` [kind: note] — the undo is a text button, not an icon. We are **not** copying either app's color, radius, type, or the accent-tinted surface at `ref_8812` box `[0.03,0.86,0.49,0.07]` [kind: pixel] — Andrew flagged that as their brand.
>
> **## Structure**
> ```
> region role=status   → <Snackbar variant="neutral">        [emphasis 2, density compact]
> ├─ label kind=body   → Snackbar.Message                    [emphasis 2]
> └─ action            → <Button variant="ghost" size="sm">  [emphasis 1]
> ```
> Anchor bottom-start, offset `space.4`. One instance at a time; a second save replaces the message and restarts the timer.
>
> **## States** (source: `get_pattern("interaction-feedback-status" → undo-snackbar)`, not observed)
> `idle` → `committed` on save · `committed` → `confirmed` on ack · `committed|confirmed` → `reverted` on undo · `committed` → `failed` on error · `confirmed` → `idle` on timeout 6000ms, paused on hover and focus-within · `failed` has no timeout.
>
> **## Motion**
> enter: `opacity 0→1`, `translateY 8→0`, `180ms`, easing `null` — **source: default**. Use `motion.duration.fast` + `motion.easing.entrance`. Nothing in the references was motion-captured; do not treat 180ms as observed.
> `prefers-reduced-motion`: opacity-only, same duration.
>
> **## Tokens to use**
> `color.surface.raised`, `color.text.primary`, `color.border.subtle`, `color.accent.default` (action label only), `space.3`, `space.4`, `radius.md`, `elevation.1`, `type.body.sm`, `motion.duration.fast`, `motion.easing.entrance`. No hex, no px, no font-family literals.
>
> **## Prohibitions** (verbatim)
> `TASTE-004`: "no glow, no gradient fills, no second accent hue" · `TASTE-011`: "no spring or bounce easing on functional feedback" · rejected in the Decision Graph (`dec_2291`, active — read via `listActiveDecisions()`, not `decision_list`): center-screen toasts — "obscures the content the user just edited".
>
> **## Gaps / decisions for you**
> 1. `Snackbar` has no `error` variant (`diff_design_system`: missing state `error`). Add it and register it, or use `variant="neutral"` with a swapped message. Report which.
> 2. `type.*` has no parseable numeric ramp (values are `ref` chains), so `emphasis` could not be bound. Name the token you used for the message and the action.
>
> **## Acceptance criteria**
>
> Two columns, deliberately: **tool-verified** means a named check inside the tool proves the claim, **agent-asserted** means the building agent proves it and says so. A criterion is never left implying a tool checks something it does not.
>
> **The gap that shapes half this table:** the snackbar exists only *after* a click, and **only `audit_page` (`src/index.ts:3360`) and `audit_url` (`src/index.ts:3941`) accept an `interactions` array.** `talon_scan`, `audit_tap_targets`, `audit_contrast`, `audit_layout`, `score_page`, and `audit_taste` each render the URL themselves in its default state, where the component is absent — pointed at the live URL they would return a clean verdict on a page that never showed the thing being audited. The fix is not to weaken the criteria: all three of A2–A4 accept a **caller-supplied snapshot** (`talon_scan` `elements`+`viewport`, `audit_tap_targets` `elements[]`, `audit_contrast` `dom_snapshot`), so the building agent drives the click in Playwright, dumps the post-interaction DOM/element snapshot, and feeds *that* in. Tool-verified, on an agent-supplied input — which is what the "Verified by" column says.
>
> | # | Claim | Check | Verified by |
> |---|---|---|---|
> | A1 | No bare hex, font-size, font-family, or margin/padding/gap literal on an **added** line of a recognized UI file | `review_diff` verdict `pass` — vocabulary is `pass\|warn\|fail` (`src/design-review.ts:27`); the rules are `bare-hex-color`, `hardcoded-font-size`, `hardcoded-font-family`, `hardcoded-spacing`, `important` (`FAIL_ON_RULES`, `:149`) | tool, **bounded** — three named gaps: it reads only added lines (`addedLines`, `:210`, `:381`), only files whose extension is in `UI_EXTENSIONS` (`:146`), and its size detection is font-size (`:441`) and margin/padding/gap (`:362`) **only** — an arbitrary dimension like `width:123px` is not a rule and passes. It also returns `pass` with `checks_skipped` when DESIGN.md yields no tokens (`:361-370`), so a `pass` must be read together with `checks_skipped` or it means "no tokens to check against" |
> | A2 | Clears color/spacing/motion detectors | `talon_scan` → 0 findings ≥ `warning` (severity vocabulary is `"error"\|"warning"`, `src/talon.ts:27`; 15 TAL-* rules) | tool, on an **agent-supplied** post-click `elements`+`viewport` snapshot — see the gap above; `talon_scan` takes no `interactions` |
> | A3 | Action target ≥ 44 CSS px on both axes | `audit_tap_targets` (`minSize` default 44 **CSS pixels**, `src/index.ts:4045` — not points; they coincide at 1× only) | tool, on an **agent-supplied** post-click `elements[]` snapshot; url mode would measure a page with no snackbar in it |
> | A4 | Message contrast ≥ 4.5:1 | `audit_contrast` AA normal-text threshold | tool, on an **agent-supplied** post-click `dom_snapshot` (`src/index.ts:3853-3856`); same reason |
> | A5 | Snackbar appears after the save click | **Agent-asserted, not tool-verified.** `audit_url` drives the click but proves nothing about the result: a failed interaction becomes a warning and capture continues (`src/capture.ts:521`), and the capture record carries a page-global `animationsSettled` plus `screenshot_bytes`, with **no per-selector presence assertion** (`src/audit-url.ts:178-186`); pixels are withheld unless `includeScreenshots` is passed, which is off by default (`:113`). The building agent writes the assertion — `await expect(page.locator('[role=status]')).toBeVisible()` after the click — and reports its result. `audit_url` is still run, for the settle and the six viewport×theme captures, but it is corroboration, not the check. Duration and easing remain **UNVERIFIED** either way |
> | A6 | `aria-live="polite"` on the status region | **Agent-asserted.** `audit_page` has no live-region rule (`src/page-checks.ts:64-70` covers `img[alt]` and font weight, nothing on ARIA live) | agent, by reading its own diff, reported as a manual check |
> | A7 | Taste verdict not BLOCK, every `design_note` present | `audit_taste` → `note_assessments` (present/partial/missing/unverifiable with trait-number evidence) and verdict `BLOCK\|WARN\|PASS` (`src/taste.ts:84`, `:1505`) | tool — but scoped to the page's **default state**: `audit_taste` takes html/text/url and no `interactions`, so it judges the surface the snackbar sits on, not the snackbar. The snackbar's own taste compliance is covered by A1–A4, not A7 |

**10.** Claude builds, runs the checks, and reports each with its provenance:

- **A1 pass, bounded** — `review_diff` verdict `pass`, `checks_skipped` empty (DESIGN.md has tokens, so the token rules actually ran). Noted in the report: the diff sets an explicit `min-width` on the snackbar, which `review_diff` does not check at all — dimension literals are outside its rule set, so that line was read by hand.
- **A2–A4 pass**, each against a post-click snapshot Claude dumped from Playwright, not against the live URL — stated in the report, because a url-mode run of the same three tools would have returned clean on a page with no snackbar in it.
- **A5 asserted by Claude, not by a tool** — a Playwright `toBeVisible()` on `[role=status]` after the click passed; `audit_url` corroborated with six settled captures. Neither the 180ms duration nor the easing was measured; Raven has no per-frame sampler on this path.
- **A6 verified by hand**, reported as a manual read of the diff.
- **A7 pass** on the settings surface's default state, with the explicit note that `audit_taste` never saw the snackbar.

Gap 1 resolved by adding the `error` variant, written back as a `decision_draft` candidate awaiting Andrew's confirmation, not as a `user-approved` decision.

The acceptance criterion for this whole spec is step 10: the prompt names real tokens, cites what was actually observed, labels what was not, and the closing report states which of its own checks were tool-verified, which were agent-asserted, and what each tool did not look at.

---

## 11. Verification loop

Most criteria above are an existing tool call, which is why no new audit code is needed. **Not all of them are, and the ones that are not are named in the criteria table's "Verified by" column rather than absorbed into a claim that "every criterion is a tool call."** Two rules hold throughout: a criterion cites the specific check that proves it, or it is marked agent-asserted; and a criterion about a state that only exists after an interaction says how that state reached the tool.

1. `review_diff` or `polish_diff` on the patch before commit (A1) — reading `verdict` **and** `checks_skipped` together, and knowing it never checks arbitrary dimensions or unchanged lines (§10, A1).
2. `audit_url` at the bound hosts, driving `interactions` so the component actually exists in the capture. Note the default is **six** captures — 3 viewports (393/1440/2160) × 2 themes (`DEFAULT_VIEWPORTS`/`DEFAULT_THEMES`, `src/audit-url.ts:93-99`). But a capture is not an assertion: `audit_url` records a page-global `animationsSettled` and a `screenshot_bytes` count per capture (`src/audit-url.ts:178-186`) and asserts nothing about any selector, and a failed interaction is a warning that does not stop the run (`src/capture.ts:521`). Presence is the building agent's Playwright assertion (A5); the six captures are corroboration.
3. **Not over those captures — over a snapshot the agent supplies.** `talon_scan` (A2), `audit_tap_targets` (A3), `audit_contrast` (A4), `audit_layout`, and `score_page` do not consume `audit_url`'s captures and take no `interactions` of their own; pointed at a URL they render it fresh in its default state. For any criterion about a post-interaction element, the agent dumps the DOM/element snapshot after driving the interaction and passes it as `elements`+`viewport` / `elements[]` / `dom_snapshot`. `audit_page` is the one exception in this group — it accepts `interactions` directly (`src/index.ts:3360`).
4. `audit_taste` (A7) → `note_assessments` per design note plus BLOCK/WARN/PASS; it too takes no `interactions`, so it judges the default state. `referenceDeltas()` compares the build against the binding's references — **post-build only**, since it takes the built target's `PageTraits` (`src/taste-fidelity.ts:448`) and there is no built target at compose time. The compose-time counterpart, checking stated intent against a reference, is `checkBindingConsistency()` (`src/taste.ts:1169`), and it lives in §9, not here.
5. **Fidelity to the reference, bounded — and the bound is much tighter than an earlier draft claimed.** `screenTraitsFromImage()` (`src/taste-fidelity.ts:769`) is a pixel reader, not a DOM reader: it decodes the PNG and asserts only `scheme` and `bg_luminance`, and only when its border-ring samples agree. Every count (`section_count`, `image_count`, …) stays `0` and every live-only field (`animation_count`, `scroll_effects`, `text_density`, `viewport_fill`) stays `null`, by design — the function's own comment says pixel traits must never be fed to the full `assessDesignNotes`. So an image-to-image diff can compare **colour scheme and background luminance and nothing else**, which are exactly the brand fields this spec refuses to copy. Structural and behavioural parity therefore requires a **live** capture of the build via `audit_url`, whose `PageTraits` do populate those fields, diffed against the reference's stored live `traits` from `capture_reference` — `referenceDeltas()` (`src/taste-fidelity.ts:448`) is already that comparison. A reference that only ever existed as a static image has no structural traits to compare against, and that is reported, not filled in.
6. `diff_design_system` re-run: did the build add the missing variant, and is the manifest updated?
7. Gap resolutions → `decision_draft` candidates with `author_trust:"extracted"`, awaiting confirmation. **That is the loop closing** — the next synthesis reads them and does not re-ask.

**What is not machine-checkable, marked rather than faked.** A5 in full — not only its duration and easing but its *presence*: nothing in `audit_url` asserts a selector appeared, so the whole criterion is the building agent's. On duration and easing specifically: `audit_url` returns settled captures — one per viewport×theme, six by default — and reports `screenshot_bytes` per capture while withholding the pixels unless `includeScreenshots` is set; a settled capture is a single frame regardless of how many of them there are, so no number of captures yields a duration. The two-capture delta trick uses `src/image-diff.ts`, which is a **module, not a registered tool** (the local surface is 105 today, asserted at `test/taste-remote-full.test.mjs:93`; 106 after Phase 0 — §13). A5 is therefore an agent-asserted "appeared", corroborated by a page-global settle, and easing verification waits on Phase 3's screencast sampler. A6's `aria-live` is likewise not covered: `runPageChecks` has no live-region rule at all (`src/page-checks.ts`), so A6 is a manual read of the diff, attributed to the building agent in the criteria table. And a focus-return check ("focus returns to the trigger after undo") is dynamic behavior while `audit_page` is a static HTML/CSS rule engine — also a manual check, not a criterion.

Also: `audit` is a surface-detecting fan-out with a fixed input schema — `url`, `html`, `nodes`, `source`, `screenshot`, `diff`, `surface`, `intent`, `project`, `profile` (`src/index.ts:7721-7730`), all optional. It cannot take an `acceptance[]` array. Running the list is a 20-line loop over `acceptance[]` in the calling agent, not a subsystem.

**Repo-side tests.** Raven uses `node --test "test/**/*.test.mjs"` with a `pretest` build; there is no Vitest. Playwright and `pngjs` are optional dependencies, so every new capability degrades gracefully when absent and each has a test asserting the degraded message rather than a throw.

---

## 12. MCP tool surface

Every entry must be added to `TOOL_ACCESS` or `toolAnnotations()` throws `"Missing MCP tool classification"` at registration (`src/index.ts:2151`). **`TOOL_ACCESS` is a static name-keyed map read once at registration — there is no per-call classification, so a tool that can write is classified `destructive` unconditionally.** All seven go in `REMOTE_GATED_TOOLS` to preserve the frozen 45-tool anonymous surface (§6). That keeps the golden hash intact but still moves the local count 105 → 112 and the gated count 60 → 67 across the three phases; each phase updates the three `src/index.ts` count comments and the six tests that assert them (§13, Phase 0).

| Tool | Input | Output | Access | Phase |
|---|---|---|---|---|
| `compose_build_prompt` | **required** `{intent, project_dir, profile}`; **optional** `{skeleton?, reference_url?, session_id?, ref_ids?, surface?, project?, design_file_path?, inventory_source?: "auto"\|"design-md"\|"registry"\|"scan"\|"none", components?}` — each required argument is required because a named input's real signature demands it (§9 Inputs, right-hand column) | `{prompt, grounding{design_md, design_md_resolved_via: "design_file_path"\|"source-config"\|"default", token_count, inventory_source, component_count, binding_resolved: boolean, decisions_scope, decisions_consulted[], contested_decisions[]}, skeleton, skeleton_required: boolean, bindings[], gaps[], acceptance[]}` | readOnly, **and truthfully so**: it reads the decision store directly via `listActiveDecisions()` / `listDecisions("contested")` rather than through the `decision_list` MCP tool, because that tool is classified `destructive` (`src/index.ts:2080`) and logs a consultation to `consultations.jsonl` on every call with a non-empty result (`src/index.ts:6983`). Returns a string; no `output_path` | 0 |
| `start_critique_session` | `{project, surface, brief, profile?, session_id?}` | `{session_id, panel_url, state}` | destructive | 1 |
| `get_critique_session` | `{session_id, since_seq?, timeout_ms?}` | `{state, references[], annotations[], next_seq}` | readOnly | 1 |
| `close_critique_session` | `{session_id, mode:"extract"\|"discard"}` | `{extraction_prompt}` | destructive | 1 |
| `record_critique_results` | `{session_id, extraction_json, write:("references"\|"taste_decision_drafts"\|"taste_rules")[], confirm?}` | `{written{}, proposed_rules[], rejected[]}` | destructive | 1 |
| `capture_reference` | `{session_id?, url, app, owner:"self"\|"third-party", surface?, profile?, viewport?, theme?, note?, interactions?}` | `{ref_id, image_path, traits, quality{score,flags}, tagging_prompt}` | destructive; `TOOL_OPEN_WORLD`; `REMOTE_URL_GUARDED_TOOLS` | 2 |
| `search_references` | `{query?, surface?, interaction?, screen_type?, owner?, limit?}` | `{results:[{record, score, why}], total, corpus_size}` | readOnly | 2 |

Bridge routes added in Phase 1, key-gated alongside `/grab`: `GET /critique` (panel HTML), `GET /reference/<ref_id>.png` (media), `POST /critique` (annotation).

`compose_build_prompt`'s schema is the one above and every example call in this document is valid against it. The three required fields are not preference: `intent` names the build, `project_dir` is the only thing that can resolve a DESIGN.md path for `read_design_md`/`inventory_design_system`/`diff_design_system` (all of which throw without a path — §9), and `profile` is the only thing that can resolve a `TasteProfile` (`getTasteProfile` throws on a missing name, and there is no default profile) and therefore the prohibitions block. Everything else is optional and degrades to a stated gap rather than a guess: no resolvable binding → no `design_notes`/`voice_note`/`build_hints`, `binding_resolved:false`, and a `## Gaps` line. `project_dir` does **not** scope the Decision Graph — that store is a module-global resolved from the environment or `process.cwd()` and cannot be pointed elsewhere per call, so `grounding.decisions_scope` reports where the decisions actually came from and flags a mismatch (§9, with the upgrade path). `skeleton` supplied → Structure/States/Content/Motion are bound and emitted, `skeleton_required: false`; `skeleton` absent → grounding block only, `skeleton_required: true`, and the prompt's first line instructs the agent to derive the tree from its reference and re-submit. `reference_url` is accepted for provenance and for the Phase 0 path where no `ReferenceCapture` is bound yet; it is never fetched by the composer.

`search_references` returns records and paths, never base64 pixels — matching `audit_url`'s discipline and staying well inside `api/mcp.js`'s `MAX_BODY_BYTES = 400_000`, which one screenshot would bust.

---

## 13. Build plan by phase

### Phase 0 — the loop with zero corpus (~3 days)

`compose_build_prompt` alone: composes `read_design_md` tokens + `inventory_design_system` + the surface's `design_notes` + every active `TasteRule.negative_prompt` + matching `build_hints` from `TECHNIQUE_RECIPES`, plus the project's decisions read **directly from the store** — `decisionGraphStore.listActiveDecisions()` for active ones and `listDecisions("contested")` for contested ones, the latter routed into `## Gaps / decisions for you`. It does **not** call the `decision_list` MCP tool: that tool is classified `destructive` (`src/index.ts:2080`) and appends to `consultations.jsonl` via `recordConsultation` whenever the result is non-empty (`src/index.ts:6983`, `src/decision-graph.ts:701`), which would make a `readOnly` annotation false; and it cannot return active and contested decisions together — `status` selects exactly one status, and the no-status path returns active decisions plus, when `include_candidates:true`, candidates (`src/index.ts:6972-6977`), so contested decisions never appear on it.

**Its arguments are derived from its inputs, not chosen.** Required `{intent, project_dir, profile}`; optional `{skeleton, reference_url, session_id, ref_ids, surface, project, design_file_path, inventory_source, components}`. §9's Inputs table states per-input which argument feeds it and why the tool throws without it. The short version of the three rounds of review that produced it: `read_design_md` requires a `path`, `inventory_design_system` throws `"Provide project_dir or design_file_path"`, `getTasteProfile` throws on an unknown or absent name with no default, and `resolveSurfaceBinding` needs a profile name plus a project *name* — so an intent-only call could open no DESIGN.md, load no rules, and resolve no binding, and would have emitted a confidently empty `## Prohibitions` block.

The reference is named by `reference_url` or by an existing bound `ReferenceCapture`, is used for provenance, and is **never fetched** by the composer. **It is not compared with `referenceDeltas()`** — that function takes the *built* target's `PageTraits` (`src/taste-fidelity.ts:448`) and Phase 0 has no built target at all: no HTML, no URL, no screenshot, no traits. It belongs to §11's post-build verification. Where compose-time intent needs checking against a reference, the function whose actual job that is, is `checkBindingConsistency(design_notes, references)` (`src/taste.ts:1169`) — already what `bind_taste_surface` calls (`src/index.ts:7389`).

`project_dir` roots the file reads and (via `basename`) the binding lookup; it does not scope the Decision Graph, whose store location is a module global. That named limitation and its upgrade path are in §9. No corpus, no UI, no new dependency.

**It does not derive the skeleton, and that is the point of the small estimate.** Deriving a Structure/States tree from a reference needs a model looking at the reference; Raven has neither a model nor the reference's pixels — a bound `ReferenceCapture` is a URL, a prose `liked` line, aggregate `PageTraits`, and a timestamp (`src/taste.ts:92`), and `PageTraits` is page-level aggregate metrics (`src/capture.ts:285-303`), not a node tree. The agent calling the tool is already looking at the reference. So: `skeleton` is an optional caller-supplied argument. With one, the composer lints it (colorless/typeless/sizeless), binds archetypes to the project's real components and `emphasis`/`density` to real token ramps, and emits the full template. Without one, it emits the grounding half — Tokens, Prohibitions, Gaps, Acceptance criteria — sets `skeleton_required: true`, and instructs the agent to derive Structure/States from the reference and call again. Anything else would mean adding an LLM dependency to a server that has deliberately never had one (`ingest_transcript` is the standing precedent).

- **Files, and the list is longer than the code.** New `src/reference-prompt.ts` — the composer **and** the `Skeleton` / `StructureNode` / `StateMachine` / `ContentSlot` / `MotionSpec` / `Provenance` types (§9); no separate `src/pattern-skeleton.ts`. `src/index.ts`: one `server.tool`, one `TOOL_ACCESS` entry (`toolAnnotations()` throws `"Missing MCP tool classification"` without it, §12), one `REMOTE_GATED_TOOLS` entry — **and the three count comments those constants are documented by**, because the tool counts are a frozen contract, not commentary.
- **The tool count is a frozen contract, and one gated tool moves two of the three numbers.** Registering `compose_build_prompt` as remote-gated takes the local surface **105 → 106** and the gated set **60 → 61**. The anonymous remote surface stays at **45** and the `GOLDEN_45_HASH` is untouched — which is the whole reason it is gated (§6). Source constants to update: the gated/remote/local comment block at `src/index.ts:1851-1857` ("60 gated tools", "45 stateless", "from 105 local tools"), the `buildServer` header comment at `:2159-2170` ("all 105 local tools", "serve only the 45 stateless remote-safe tools", "gate off the 60 gated tools", "all 105"), and `main()`'s comment at `:7768-7771` ("serves all 105 tools"). Six existing tests assert these and all six must move in the same change:
  - `test/taste-remote-full.test.mjs:81-93` — test *name* embeds "stdio = 105"; `:93` asserts `105`.
  - `test/grab-bridge.test.mjs:886-891` — `:886` asserts `105`, `:891` asserts `45`.
  - `test/decision-import.test.mjs:477-487` — `:482` asserts `105`, `:484`/`:487` the 45 + golden hash.
  - `test/design-review.test.mjs:861-873` — `:863` asserts `105`, and `:870-873` **regex-match the `src/index.ts` comment strings themselves** (`/FRESH McpServer with all 105 local tools/`, `/gate off the 60 gated tools/`, `/all 105\./`). This is the test that makes the comments a contract rather than prose: changing the code without the comments fails here, and vice versa.
  - `test/audit-dispatch.test.mjs:223-228` — `:226` asserts `105`.
  - `test/redis-taste-store.test.mjs:147-150` — `:150` asserts `105`.

  This is a **standing tax on every future tool**, and it is deliberate: it is what has kept the remote surface hash-frozen and the documented counts honest across every prior addition. It is roughly a day of the three-day estimate — not because the edits are hard, but because they are mechanical, easy to half-do, and fail loudly rather than silently. Phases 1–2 register six more tools and pay it once each.
- **Test:** `test/reference-prompt.test.mjs` asserts the composed prompt contains every active `negative_prompt`, every `design_notes` key, at least one token `cssVar` from the fixture DESIGN.md, and **zero hex/px literals** in the skeleton section; that a fixture `contested` decision appears under `## Gaps / decisions for you` and an `active` one under `## Prohibitions`; the no-skeleton branch — `skeleton_required: true`, no `## Structure` / `## States` / `## Content` section, and the derive-and-re-submit instruction present; and the four failure paths the schema exists to prevent — an unknown `profile` surfaces `getTasteProfile`'s error rather than an empty prohibitions block, a `project_dir` with no `.raven/design-system-source.json` falls back to `<project_dir>/DESIGN.md` and reports `design_md_resolved_via:"default"`, an unmatched `project` name yields `binding_resolved:false` plus a `## Gaps` line instead of silent empty notes, and a `decisions_scope` outside `project_dir` is stated in the prompt.
- **On the consultation-trace assertion, and what it actually proves.** A test asserting `consultations.jsonl` is byte-unchanged after a full compose is worth writing — verify the direct-read claim by effect, not by re-reading the call site — but it is **weaker than it looks** and must say so in a comment. `recordConsultation` returns early when `RAVEN_NO_CONSULTATION_TRACE === "1"`, and its write is wrapped in a `catch` that swallows every failure (`src/decision-graph.ts:701-717`), so an unchanged file is also what a traced-but-suppressed run and a traced-but-failed write both look like. The test therefore runs with `RAVEN_NO_CONSULTATION_TRACE` explicitly **unset** and a writable `RAVEN_DECISIONS_HOME`, and proves its point by control: a sibling case calls `decision_list` against the same fixture store and asserts the file **grew**. Byte-unchanged only means something next to a case that changes it. (`test/decision-consultation.test.mjs:180-184` is the existing precedent for driving that env var deliberately.)
- **Falsification gate, and it is not the obvious one.** An earlier draft called `audit_taste`-on-the-prompt *circular* — passing by construction because the prompt injects the same rules the audit grades against. That is wrong, and the truth is worse: it would **fail** by construction. `audit_taste` grades a literal artifact: the engine requires exactly one of `html` or `text` (`src/taste.ts:1298-1303`) — the MCP tool's third input, `url`, renders a page into the same path and is meaningless for a prompt string. It then extracts banned terms from each rule's `negative_prompt` + `clause_text`, and searches the stripped target for them (`src/taste.ts:1846-1852`). A `## Prohibitions` section that correctly quotes *"no glow, no gradient fills, no second accent hue"* verbatim is a target containing the banned terms, so it indicts itself. And the note-fidelity half never runs at all on prompt text: it requires a resolved binding **and** extracted traits (`src/taste.ts:1396-1400`), and arbitrary prose has neither. So `audit_taste` is not a weak gate on a prompt — it is not a gate on a prompt at all. It is a gate on the **built artifact**, which is exactly where §11 already uses it. Phase 0's real gates stand unchanged: (a) Andrew's **blind A/B preference** between two builds of the same component — one from a pasted screenshot, one from this — with the source hidden, and (b) the **count of correction round-trips to acceptance**. Cheaper pre-gate, one hour: compare the composed prompt against a one-line instruction telling the agent to call `read_design_md` + `get_taste_profile` + `audit_taste` itself. If it is no better, delete the tool.

### Phase 1 — critique session and markup (~1 week)

Bridge routes `GET /critique`, `GET /reference/<id>.png`, `POST /critique`; write-through persistence to `~/.raven/critique/<id>.json`; re-attachable sessions; `start_grab_session` refuses during `collecting`. Markup tab in `browser/raven-grab.js`, gated on `mode:'critique'`, box/arrow/pin on a plain canvas, typed notes, no dependency. Four session tools. Extraction with the substring quote gate. Rules proposed, never auto-written.

- **Files:** `browser/raven-grab.js` + `web/public/raven-grab.js` (atomic, plus new `scripts/sync-overlay.mjs` and a byte-equality test), `src/grab-bridge.ts`, new `src/critique.ts`, `src/taste.ts` (additive `ReferenceCapture` fields), `src/index.ts`.
- **Blocking gate before any pixel of that panel is designed:** `get_taste_interview` → `bind_taste_surface` on the panel surface itself, plus a `customer-lens-kickoff`. Raven's own tool description calls the interview a blocking gate; shipping a panel that skips it would be the `bindTasteSurface`-prose-only failure repeating inside Raven.
- **Test:** extend `test/grab-bridge.test.mjs` for the three routes, the key gate, the 409 on a frozen session, and re-attach; a Playwright spec driving the panel on a fixture, skipped when Playwright is absent.

### Phase 2 — reference persistence and the interaction corpus (~1 week)

`capture_reference` writes PNGs to `~/.raven/references/` and appends `ReferenceCapture` entries. `search_references` = tag filter + existing `textSearch`, linear scan over the surfaces file. The six interaction pattern files (18 entries) land in `src/data/patterns/`, shipped by the existing `files: ["src/data/"]`.

- **Files:** new `src/data/patterns/interaction-*.json` (six); `src/index.ts` — two optional fields on `interface Pattern` (`aliases?`, `motion_bearing?`), plus the **three retrieval call sites that must learn to read `aliases` or the field is inert** (§4): `get_pattern`'s fuzzy match (`:2367-2375`), `search_knowledge`'s pattern haystack (`:2583-2588`), and `get_checklist`'s filter (`:2641-2644`); the two new tools with their `TOOL_ACCESS` / `REMOTE_GATED_TOOLS` entries and the tool-count tax those imply (Phase 0's list, `105+n`); `src/taste.ts` (`validateReferences` allowlist branches, §3).
- **Test:** `test/reference-store.test.mjs` (round-trip, quality flags with and without `pngjs`); extend `test/patterns-data.test.mjs` (parse, unique ids, `principles_referenced` resolution, `evidence` URL shape).

### Phase 3 — motion, and maybe voice (~1 week, gated on demand)

Only if Phase 1–2 usage shows people asking for motion. Widen the `Interaction` union with a scroll variant; add a `frames` mode to `src/capture.ts` using CDP screencast (scrub as opportunistic enrichment); `MotionSpec.source:"observed"` becomes reachable; A5's **duration and easing** become tool-verifiable at ±16ms (its presence stays the building agent's Playwright assertion — a sampler measures motion, it does not assert a selector). Voice only if long typed notes become a real complaint.

### Not planned: hosted shared corpus

See §14. It is listed as a risk, not a phase.

---

## 14. Risks

**The hosted tier does not survive its own constraints — but two reasons an earlier draft gave were false, and removing them matters because they were the load-bearing ones.**

*False #1: "there is no Playwright on the hosted function, so remote capture is impossible."* There is. `launchAuditChromium()` branches on `isRemoteRuntime()` and the remote branch launches `playwright-core` with `@sparticuz/chromium` (`src/browser-launch.ts:294`, `:314-317`), both real dependencies (`package.json:53,55`), behind a browser-slot semaphore and an egress proxy. Hosted capture is technically available today. It is still ruled out here, on the grounds §5 actually cares about: a third-party capture taken by the hosted function is a third-party capture leaving the user's machine and landing on Raven's infrastructure, which is the one thing §5's first human decision says never happens without a rights-holder takedown path, a named jurisdiction, and a privacy review. Legal and privacy, not capability.

*False #2: "every store access fails closed under remote."* Only the **anonymous** remote path does. `buildServer` takes an injected `TasteStore` and uses `ClosedTasteStore` only when none is supplied (`src/index.ts:2183-2186`); when one is (the authenticated endpoint's per-user `RedisTasteStore`), the gate re-registers the authenticated taste subset (`src/index.ts:2203-2205`) and the surface is 56 tools, not 45 (`test/taste-remote-full.test.mjs:81,89`). Anonymous remote fails closed; remote-with-store reads and writes real per-user taste data. A hosted corpus story would necessarily run under the **authenticated, store-injected** variant — so "it can't read anything anyway" is not an argument available to it.

What is left is still decisive: `DESIGN.md` is a local repo file with no remote read path, so the hosted runtime cannot ground a build in the project's own tokens; `api/mcp.js` caps bodies at 400KB, which one screenshot exceeds; and the anonymous surface is hash-frozen at 45 tools. A hosted tier could therefore serve exactly one thing: a shared list of reference records and URLs. That is a smaller Mobbin, which §2 lists as a non-goal, and it does not solve the stated team pain (*"every engineer grounds on a different screenshot"*), because grounding is what it cannot do. Making it real means designing a sync path for project tokens into the hosted runtime — the Redis taste store already namespaces by JWT `sub`, so the pattern exists, but it is a real design task, not a footnote. **Recommendation: do not build it; revisit only if a token-sync design is written first.**

**Legal.** Never scrape a gallery; captures stay local; store `PageTraits` and structure preferentially over mirrored pixels; attribute and link the source; ship a removal path. Legal review is Andrew's call before anything leaves a machine.

**Corpus cold start.** Designed away: Phases 0–2 have no corpus, and the shipped taxonomy carries prose and `evidence` URLs with zero third-party bytes.

**Taxonomy drift.** Reuse `taxonomy.json` states, `raven-canonical` component ids, the eleven `DESIGN_DIMENSIONS`. Re-tagging after a taxonomy change is a real token cost, so drift is a cost risk as well as a quality one.

**Tag accuracy.** Unmeasured — no eval set exists. Tags are advisory and never a gate. Build a small labelled fixture set before quoting any number.

**Overlay drift.** Two byte-identical copies maintained by hand. Mitigated by `scripts/sync-overlay.mjs` plus a failing test, which the repo lacks today.

**Optional-dependency fail-open.** `pngjs` absent means `audit_asset_integrity` returns clean. Every gate that depends on it flags rather than silently passing.

**Cost.** No recurring cost in the planned phases: capture is local Playwright, retrieval is a JSON scan, tagging is the calling agent's tokens. The realistic personal corpus ceiling is 1–5k captures, all free-tier at every line. A 200k-image cost model was cut from this spec — costing a scale the product forbids invites the wrong architecture decisions against a fictional row.

---

## 15. Contested

Objections raised in review and deliberately not adopted.

- **"Corpus corrections should write through to the taste corpus (`record_taste_decision` / `label_finding`)."** Rejected: the two ledgers are deliberately disjoint. `TasteCorpusRecord` grades *findings* Raven produced; a critique record grades *references* the designer chose. Merging them would let a reference preference suppress an audit finding it has no bearing on.
- **"Register `image_diff` as an MCP tool so A5 is executable."** Rejected: it is an internal comparison module with no independent use, and registering it to satisfy one criterion is the wrong direction. Registering it would not even fix A5: `audit_url` has no per-selector presence assertion to compare against in the first place (§11). A5 was demoted to an agent-asserted "appeared", with its duration and easing marked UNVERIFIED and the Phase 3 sampler as the named upgrade.
- **"Drop the WAAPI motion rung entirely and ship VLM-over-frames only."** Partially rejected: the inversion is adopted (screencast is the default, everything is `source:"observed"` with a ±16ms floor), but `getAnimations()`-scrub stays as opportunistic enrichment where it is populated, because it is the only path that yields an exact `t_ms` for free. Its actual hit rate is a measurement gated in front of Phase 3, not an assumption.
- **"Cut `compose_build_prompt` — it is a formatter over three tools the agent already has."** Rejected, with a falsifier attached. The justification is determinism and one auditable composition, not the agent forgetting; the one-hour A/B against a bare instruction line (§13, Phase 0) is the test that kills it if the objection is right.
- **"Move annotation out of the grab overlay into a `web/` React page so Konva is usable."** Rejected: the bridge already owns the transport, the drain, and the tray, and `web/` would need a second transport plus network access to local media. The overlay's missing pieces are two routes and ~150 lines of canvas, which is a smaller diff than a second surface.
- **"Cut clip capture entirely and never ship motion."** Rejected as a permanent cut: motion is the one axis a static gallery cannot serve. Deferred to Phase 3 behind a demand gate instead.
- **"Cost the 200k-image scale as a stress case."** Rejected: §2 forbids that corpus, and costing it distorts the architecture decisions made against it.

---

## 16. Open decisions for Andrew

1. **Does any third-party capture ever leave the machine?** → **Recommend: no**, on legal and privacy grounds — the hosted function is technically capable of the capture (`src/browser-launch.ts:294`), so this is a decision, not a constraint. Local-only makes the legal posture trivial, and §14 shows the hosted tier cannot ground a build anyway.
2. **May the agent capture a URL Andrew did not name?** → **Recommend: no in v1.** Autonomous reference-hunting changes the legal posture; require a URL from his own message or an already-bound reference.
3. **Is a hosted/paid tier in scope at all?** → **Recommend: not before a token-sync design exists.** The blocker is grounding (no remote `DESIGN.md` read path) plus the §5 legal position, not the runtime — and note it would run under the authenticated, store-injected server, whose taste surface is 56 tools with real per-user reads and writes (§14), so it inherits a real data-handling story rather than a fail-closed one. If it ever ships, fold it into the existing Morven team tier rather than a second SKU.
4. **Do proposed `TasteRule`s ever auto-write?** → **Recommend: never.** Two-step `confirm: true`, `severity_default:"warn"` always, matching `decision_draft` → `decision_commit`.
5. **Voice: local `mlx-whisper`, or never?** → **Recommend: cut from v1, revisit only when long typed notes become a real complaint.** If it returns, local-only default and cloud strictly opt-in per session with the provider echoed in tool output — a mumbled aside about NDA client work should not leave the machine by default.
6. **Who authors the interaction entries?** → **Recommend: hand-author 18, then extend on demand.** Model-drafted against the 132-principle pool and human-corrected is the fallback if 18 hours is too much; the `principles_referenced` resolution test makes either safe.
7. **Frames-only for motion, or a real video artifact?** → **Recommend: frames only.** No media dependency, and a VLM reads frames anyway. The loss is sub-frame easing feel, which the CDP screencast timestamps partially recover.
8. **robots.txt / ToS acknowledgement at first capture?** → **Recommend: one-time acknowledgement stored on the taste profile,** not a per-capture prompt.
9. **Does Raven pass through Mobbin's MCP for users who already pay for it?** → **Recommend: yes, read-only, never cached.** It is a cold-start answer that costs nothing and breaches nothing, and it makes the positioning honest: Raven grounds whatever exemplar you bring, including theirs.
---

## 17. Verification addendum (2026-08-02, post-crash fan-out)

A 29-agent sweep checked 406 claims in §§1–16 against the tree at `5747efb`
(main + NC-license branch): 389 verified, 13 reviewer findings confirmed (folded into
the 11 corrections below), 3 reviewer findings overturned on adversarial refutation,
and 1 external licensing claim checked but never dispositioned by its agent (see the
coverage note before the GUESSED list). Three browser-platform claims were checked by
no agent at all (GUESSED list at end). Line numbers cited in this addendum refer to
the spec as of this date. **The handoff's "verification sections untrustworthy" flag
is cleared for the spec's REPO claims** — with these corrections, every repo claim is
verified against the live tree, including all six count-asserting tests at their
exact cited lines and the full cross-section arithmetic (7 tools, 105→112, 60→67,
45 frozen, 56 authed, 18 taxonomy entries, 132 principles). External and
browser-platform claims carry the narrower coverage stated above.

**Corrections that change build decisions:**

1. **§6 (line 150): `textSearch()` cannot rank.** It is a boolean OR-semantics substring
   predicate (`src/index.ts:612-616`) used only inside `Array.filter`. "Filters on tags,
   then ranks with textSearch" is wrong as written — Phase 2 must either accept
   filter-then-truncate semantics (storage order, arbitrary `limit` cuts, 'bottom sheet'
   matching every 'sheet') or schedule a small scoring step (e.g. matched-term count)
   the spec did not budget. Decision deferred to Phase 2 build.
2. **§7 (line 173): framer-motion 12 is a WAAPI hybrid, not pure rAF.** Its
   transform/opacity/filter animations run through `element.animate()` (verified in the
   framer-motion 12 source) and therefore surface in `document.getAnimations()`. The
   worked example's own target (`CaseStudyLayout.tsx`, framer-motion ^12.38.0, confirmed
   in the portfolio repo) is EXPECTED to expose that path, but no live
   `getAnimations()` probe has run against it — that is exactly what Phase 3's
   pre-measurement across ~20 URLs exists to confirm, which is why it is mandatory, not
   optional. GSAP and Lenis halves of the sentence stand. Screencast-as-default
   survives (springs, layout animations, and non-accelerable values still fall back to
   rAF); scrub is likely worth building, pending that probe.
3. **§11 (line 493): `audit_layout` has no `url` parameter at all.** Schema is
   `elements` + `viewport` only (`src/index.ts:4663-4681`); called without them it
   returns a DevTools snippet, it never renders. Remove it from the "pointed at a URL
   they render fresh" group — it ALWAYS needs an agent-supplied snapshot.
4. **§11 (line 499): the two-capture pixel diff is already on the tool surface.**
   `evaluate_design` accepts `before_screenshot`/`after_screenshot` and runs
   `diffScreenshots()` returning `fix_confirmed` (`src/index.ts:2475`, `:2538`,
   readOnly, local surface). `image-diff.ts` registers no tool, but the capability
   ships today — A5 corroboration can use `evaluate_design` now; do not build a new
   diff tool.
5. **§6/§14 upgrade path (line 152): the voyage-multimodal-3.5 free tier is one-time,
   not monthly.** "First 200M text tokens and 150B pixels free for every account"
   (docs.voyageai.com/docs/pricing) — a lifetime allotment (~75k screenshots total,
   arithmetic itself correct; 1024-dim correct). Any embedding cost model is metered
   after that allotment is consumed.

**Corrections to stated rationale (no build change):**

6. **§8 voice (line 230): parakeet weights are CC-BY-4.0**, commercial use explicitly
   permitted (huggingface.co/nvidia/parakeet-tdt-0.6b-v2/-v3; the NC-licensed NVIDIA ASR
   family is Canary). The SaaS-restriction claim is false. The voice cut stands on the
   real grounds (Python sidecar weight, VAD, privacy); if voice returns, judge
   parakeet-mlx vs mlx-whisper on merit.
7. **§8 voice (line 230): the "per MDN" attribution is wrong as written.** MDN says
   Chrome-class browsers use "a server-based recognition engine" — it never names
   Google's or Apple's servers, and it now documents an on-device mode
   (`processLocally`/`available()`). The local-only objection survives in weakened form;
   cite MDN's generic server statement only.
8. **§5 (line 136): Mobbin's §10.4 doctrine is "fair use"** under Singapore's Copyright
   Act 2021 (the Act renamed it from fair dealing). Nuance the sweep surfaced: Mobbin
   conditionally permits compliant crawlers but flatly bans AI/ML derivative/training
   use — reinforcing the §2 non-goal.
9. **§8 (line 202): Excalidraw is ~345KB gzip** (bundlephobia, @excalidraw/excalidraw
   0.18.1), not ~500KB. Still disqualifying; number corrected to keep measurements
   trustworthy.

**Doc consistency fixes (from the cross-section critic):**

10. **Counts:** §8's "13-tool taste surface" (line 258) has no repo referent — the
    canonical enumeration is 11 (`AUTHED_USER_TASTE_TOOLS`, `src/index.ts:1927-1932`;
    56 = 45 + 11). §9's "one of nine inputs" (line 285) — the table has ten rows. §8's
    heading "Two new bridge routes" contradicts §1/§12's three (two GET + one POST).
    §10's A1 row cites `:362` for spacing detection — the spacing regex is at
    `src/design-review.ts:554` (finding emitted `:574`); `:362` is the checks_skipped
    block. The no-mutation claim itself (no tool writes `TasteProfile.rules`
    post-create) was verified true.
11. **§7 (line 175): "no scroll driver in capture.ts" is overbroad.** The `Interaction`
    union indeed has no scroll variant, but `CaptureOptions.scroll_settle` drives
    `settleScrollReveals` (`src/capture.ts:406`, `:486-494`). Phase 3's scroll variant
    must reuse or deliberately coexist with that path, not duplicate it. Also §12's
    table marks `owner` required on `capture_reference` while §1's transcript omits it —
    resolve at Phase 2 (recommend: required, since §5's legal tiering leans on it).

**Coverage gap (external licensing):** the licensing web agent reported 15 claims
checked but dispositioned only 14 (10 verified + the 4 findings behind corrections
6–9); the identity of the 15th is not recoverable from its output. Any §5/§6
licensing line not named in corrections 6–9 therefore carries section-level
verification only, not an individually attested check.

**Still GUESSED (marked, cheap to probe before Phase 3):** the canvas-taint
`SecurityError` for `file://` video, 127.0.0.1-as-secure-context, and the 80–250ms
`page.screenshot` round-trip figure were verified by no one — probe live before any
Phase 3 design leans on them.
