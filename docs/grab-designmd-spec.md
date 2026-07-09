# Raven Grab + DESIGN.md — spec (2026-07-09)

## Goal
Two-way click-to-change: a user clicks any element in their running app in a browser; the agent (via Raven) receives a precise change target. If the element uses design-system tokens, the click panel shows them and lets the user swap to another token or create a new one — the intent flows to the agent, which applies the code + DESIGN.md edit. DESIGN.md (Google Labs `design.md` alpha spec, as popularized by getdesign.md) becomes Raven's first-class design-system file format.

## Customers (feature override, CLAUDE.md)
Dual: solo indie dev (setup under a minute, concrete copy) AND design-system-mature team (token fidelity, naming rigor).

## Decisions (interviewed 2026-07-09)
- Delivery: dev-mode script the dev adds to their app (react-grab model).
- Transport: localhost bridge + MCP tool pull — no copy/paste.
- Token writes: the AGENT applies them (panel records intent; agent edits code + DESIGN.md).
- DESIGN.md: first-class — read/init/update tools, getdesign.md starters referenced.

## Architecture

### 1. Overlay — `browser/raven-grab.js` (plain vanilla JS, no build step)
Single static file served by the bridge (also npm-published via `files` whitelist).
- Hover: highlight box + tag/selector label. Click: select element, open token panel. Esc: dismiss. Alt+click: pick through to parent.
- Payload per selection: compact HTML preview (outerHTML truncated), stable CSS selector (id > data-testid > path), bounding rect, computed styles of interest, and **token map**: every CSS custom property that resolves into the element's used values (walk `getComputedStyle`, match `var(--x)` usage via stylesheet scan of matching rules), cross-referenced against the DESIGN.md tokens the bridge serves at `GET /tokens`.
- Token panel: lists matched tokens (name, value, swatch); per token a dropdown of same-type alternatives from DESIGN.md + a "new token…" input (name + value). Free-text "tell the agent what to change" box. "Send to agent" → `POST /grab` with `{selector, html, rect, styles, tokens, tokenIntents:[{property, oldToken, newToken?, newTokenValue?}], instruction}`.
- Live preview: on token pick, set the CSS var inline on `:root` for instant visual feedback (non-durable; the agent makes the real edit).
- React enrichment: if `window.__REACT_GRAB__` exists (react-grab installed), listen for `react-grab:element-selected` and merge `componentName/filePath/line/column` into the payload. We do NOT reimplement fiber/source mapping.
- No framework coupling otherwise; works on any DOM.

### 2. Bridge + MCP tools (all in `REMOTE_GATED_TOOLS` — anon remote stays 45/golden)
`src/grab-bridge.ts`, `node:http` loopback:
- `start_grab_session` — starts bridge on `127.0.0.1` ephemeral port (or given port); serves `GET /raven-grab.js` (overlay), `GET /tokens` (parsed DESIGN.md tokens from a given path), `POST /grab` (queue selection). Returns port + the exact one-line script tag to paste (`<script src="http://127.0.0.1:<port>/raven-grab.js"></script>`). CORS: `Access-Control-Allow-Origin: *` (loopback only, no secrets).
- `get_grabbed_elements` — drain the queue (blocking-with-timeout optional param); returns selections + token intents for the agent to act on.
- `stop_grab_session`.
Session state module-level; one bridge per process. // ponytail: single session, multi-session if ever needed.

### 3. DESIGN.md tools (`src/designmd.ts`, also REMOTE_GATED)
Format: Google spec — YAML frontmatter (`colors`, `typography`, `rounded`, `spacing`, `components`, `{colors.x}` refs) + ordered Markdown body.
- `read_design_md {path}` — parse → tokens (nested + flat + CSS-var names per official exporter mapping: `colors.primary`→`--color-primary`, `rounded.md`→`--radius-md`, `spacing.md`→`--spacing-md`, typography five-way split).
- `init_design_md {path, from}` — scaffold from: (a) one of Raven's 12 stored token systems (DTCG→DESIGN.md), (b) a getdesign.md starter by slug (fetched from `raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/<slug>/DESIGN.md`, MIT), or (c) blank template. Refuses to overwrite existing.
- `update_design_md {path, set:{group, name, value}, rename?, remove?}` — surgical token edits preserving Markdown body + comments; ref-integrity check on `{group.name}` references.
- YAML: strict subset parser (maps, scalars, quoted strings — the spec schema needs nothing more), no new runtime dependency. // ponytail: subset YAML; swap to `yaml` pkg if starters in the wild break it.

## Constraints
- Anonymous remote MUST stay 45 tools / hash `f64bb18…2bb0a6` → every new tool goes in `REMOTE_GATED_TOOLS` (`src/index.ts:1600`). Gating test asserts this.
- Stdio tool count 72 → 78; stdio transcript re-baseline happens at release (normal version-bump path, like talon_* were added).
- `manifest.json` gets the new tools for the `.mcpb` bundle.
- `browser/` added to package.json `files`.
- No secrets; bridge binds loopback only.

## Acceptance criteria / verification
1. `npm test` green (existing 516 + new tests: designmd parse/roundtrip/refs, bridge HTTP contract, tool gating incl. anon-45 hash unchanged).
2. End-to-end live: start bridge via MCP tool → inject script tag into a real page in Chrome → hover/click an element → panel shows DESIGN.md tokens → swap a token (live preview visible) → send → `get_grabbed_elements` returns the intent → agent applies edit → DESIGN.md updated via `update_design_md`.
3. Vision pass on the overlay UI as BOTH bound customers (indie dev: is setup one line + obvious? mature team: are token names/types faithful?).
4. Anon remote hash verified unchanged.
