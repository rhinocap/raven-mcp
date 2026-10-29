# Spec: Motion playground in Raven

Status: draft v0.2, 2026-10-29 (v0.1 plus the seven Sol findings; see Review log). Source project: Motion Lab (`~/projects/motion-lab`, rhinocap/motion-lab). Working example: the 911 key playground (https://claude.ai/artifact/8KQvP2hQrrYUhw9wCsrSVM).

## What it is

An agent asks Raven for a motion playground and gets back one self-contained HTML file: the animation on a stage, 8–16 controls in designer language, Randomise / Reset / Lock, presets, and exports (params JSON, a review envelope for clients, an embed snippet). The designer tunes the motion by hand until it feels right, then copies the code into their site.

Two surfaces:

1. **Tool** — `create_motion_playground`, a new stdio tool that builds a playground from a built-in motif.
2. **Site gallery** — the 911 key playground running live on ravenmcp.ai, so a designer can try it before installing anything.

## Customer

Motion Lab's designer, reached through Raven: a brand/web designer (studio or freelance, Framer/Webflow sites), then in-house product designers, design engineers and motion designers. They tune web motion by hand and need it in a real site. Today they re-prompt an agent for timing changes or use Figma Smart Animate or Jitter, which give neither fine control nor production output. They leave on: too many controls, engine jargon, no usable export, a slow or janky preview, anything that reads as AI default.

This differs from both of Raven's project lenses: the primary lens is the paying team (Morven), and the free-tier lens is the solo indie dev. Both reach the tool through their agent; the designer is the person who uses the HTML file. The free tier's "under a minute" path must still hold: one tool call, one file, open it. Copy in the tool description is written for the agent, and copy inside the playground is written for the designer. Recorded as a feature override in `CLAUDE.md` and `AGENTS.md`.

## Tool: `create_motion_playground`

### Inputs (zod)

| Field | Type | Notes |
| --- | --- | --- |
| `motif` | enum, required | Built-in motifs only. v1: `keyfob`, `tab-stagger`. Phase 3 adds `hairlines-ripple`, `squares-l-draw`, `face-dots`. The description lists the valid values and says "use ONLY these". |
| `title` | string ≤ 60 | Shown in the playground header and `<title>`. |
| `artwork` | string, optional | SVG markup for motifs whose schema declares replaceable artwork (keyfob: the fob and key groups). Sanitised; see Security. |
| `overrides` | object, optional | Per-control changes to the motif's schema: `label`, `default`, `min`/`max` (only within the motif's hard range), `clientSafe`, `advanced`. Also `presets` (≤ 6) and `groups` relabels. Unknown control ids are rejected. |
| `profile`, `project` | string, optional | When given, the taste binding's `motion`, `entrance` and `loading` design notes seed defaults (see Taste loop). |
| `seed` | integer, optional | Fixes the Randomise seed so a reload gives the same frame. |
| `output_path` | string, optional | Defaults to `<taste home>/playgrounds/<playground_id>.html`. Must end in `.html`. |

Raven never calls a model. The calling agent decides the motif, labels and ranges; Raven validates and assembles. A request for a motion that no motif covers returns an error listing the motifs, not a best-effort playground.

### Output

JSON, same shape family as `generate_mood_board` (src/index.ts:8824):

```json
{
  "tool": "create_motion_playground",
  "html_path": "/Users/…/.raven/playgrounds/keyfob-7f3a.html",
  "playground_id": "keyfob-7f3a",
  "motif": "keyfob",
  "controls": 12,
  "client_safe": 8,
  "bytes": 176412,
  "warnings": ["settleTime default 400 ms is below 1.82 × fob swing time; raised to 1200 ms (1.82 × swing period, rounded up to the 100 ms step)"],
  "grab_url": "http://…",
  "next": ["Open html_path in a browser.", "After tuning, paste the copied changes back to record them with record_taste_decision."]
}
```

`grab_url` is present only when a Raven Grab session is running; otherwise omitted. No accessor for the live session exists today: `startGrabSession` returns the URL once (`GrabBridgeStartResult.url`, src/grab-bridge.ts:305-309) and only `isProxyGrabSession()` (:623) reads the module state afterwards. Phase 2 adds a read-only `currentGrabSessionUrl()` beside it.

### Validation

Port `motion-lab/scripts/validate.mjs` and `schemas/playground.schema.json` into `src/motion-playground/validate.ts`. Every overridden schema must still pass the Motion Lab contract: 8–16 controls, ≤ 6 per group, ≥ 2 groups, 5–12 client-safe, no engine words outside advanced, defaults inside range and on step, constraints hold at defaults. Contract violations are errors. Constraint violations are corrected in a fixed order:

1. Apply `overrides`.
2. Apply taste multipliers (see Taste loop).
3. Clamp each constraint (for example `settleTime ≥ 1.82 × fobPeriod`).
4. Round the clamped value up to the control's step. Rounding to nearest can land back below the constraint.
5. Range check: if the result is above the control's `max`, the call fails with an error naming the control and the conflicting values. It is not clamped down, because that would break the constraint again.
6. Revalidate the final schema against the full contract.

Each correction in steps 3–4 is reported in `warnings`. Worked example (keyfob, `settleTime` min 600, max 2400, step 100): an override of 400 ms with a swing period that needs 1165 ms is clamped to 1165 and rounded up to 1200.

Fix carried over from Motion Lab: `settleTime` is currently warned, not clamped. The port applies the order above.

### Security

The HTML is opened from disk in the designer's browser, so anything the agent passes is treated as untrusted.

- `artwork`: parsed and rebuilt from an allow-list (`g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `defs`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `filter` primitives). Removed: `script`, `foreignObject`, `use` with external `href`, every `on*` attribute, `javascript:` and external URLs, `<style>` blocks. Size cap 512 KB.
- `title` and labels are escaped for each context they reach: HTML text, attribute values, JSON in `<script type="application/json">` (escape `<`), and every string the exporters write into generated code.
- The embed exporter does not put `title` in an HTML comment. Motion Lab's `embedCode()` does (`src/keyfob/template.html:519`), and Sol showed a title of `--><img src=x onerror=…><!--` executes in Chromium. The comment carries only the motif id and revision. If any agent-supplied text must go in a comment, `--` and `>` are replaced first. The Motion Lab template is fixed upstream before the first sync.
- Adversarial test: generate a playground with that title, export the embed, render the embed in Chromium, and assert no script ran and no `img` element exists.
- No network requests from the generated file. No eval.
- Test fixtures for each removal rule.

### Classification (src/index.ts)

| Set | Entry |
| --- | --- |
| `TOOL_ACCESS` (:2088) | `destructive`. The map has only `readOnly` and `destructive`; the tool writes a file and can overwrite one at `output_path`. |
| `TOOL_LOCAL_ONLY_WRITE` (:2423) | no. That set is for tools that are otherwise read-only and write only when remote gating allows (today only `generate_design_system`). |
| `TOOL_IDEMPOTENT` (:2316) | no (new `playground_id` per call unless `output_path` and `seed` are fixed) |
| `TOOL_OPEN_WORLD` (:2269) | no |
| `REMOTE_GATED_TOOLS` (:1892) | yes, like `generate_mood_board` (:1901) |
| `TOOL_WRITES_PUBLIC_STATE` | no |

The test asserts the emitted annotations on the stdio build: `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`, `openWorldHint: false`.

The frozen anonymous remote set (45, hash in test/taste-remote-full.test.mjs:22) does not change. Authed remote stays at 56 in v1. Phase 3 option: on authed remote, return the HTML inline as `generate_taste_portrait` does (:8802-8806) instead of writing a file.

### Code layout

- `src/motion-playground/index.ts` — build: load motif, apply overrides, validate, inline runtime and schema, write.
- `src/motion-playground/validate.ts` — ported validator.
- `src/motion-playground/sanitize-svg.ts` — artwork allow-list.
- `src/data/motion/<motif>/{schema.json,runtime.js,artwork.svg}` and `src/data/motion/template.html` — ship with the package via the existing `src/data/` entry in `package.json` `files`.
- Motion Lab stays the source of truth for motifs until phase 3; a sync script (`scripts/sync-motion-motifs.mjs`) copies from `~/projects/motion-lab` and a test fails if the copies drift from a recorded hash.

### Fonts

The Motion Lab build inlines Untitled Sans as base64. Raven is Apache-2.0 on npm, so bundling Untitled Sans in `src/data/` would redistribute a licensed Klim font to every user. Not allowed.

v1: the playground chrome uses the font from the caller's taste binding (`design_notes.typography`) when it names a font the designer has installed, else the system UI stack. The motion stage has no text, so the animation is unaffected. The site gallery copy is served from ravenmcp.ai under the site's existing font licence.

## Taste loop

- **In**: with `profile`/`project`, Raven reads the binding's `motion`, `entrance` and `loading` notes (src/taste.ts:123-151) and maps a fixed vocabulary to defaults: "restrained" / "subtle" lowers amplitude defaults by a third; "snappy" shortens durations by a quarter; "no bounce" sets the damping ratio to at least 1 (critically damped or overdamped) on motifs whose runtime exposes it. Raising damping inside the underdamped range (the current Firm preset) still crosses rest, so it does not count. A motif that cannot reach ζ ≥ 1 within its hard range keeps its defaults and returns a warning that it cannot meet "no bounce". Unrecognised notes are ignored and listed in `warnings`. Mapping table lives in `src/motion-playground/taste-map.ts` and is unit-tested.
- **Out**: the playground's Get code tab adds "Copy for Raven": a short text block the designer pastes into the agent chat. It contains the motif, the changed values and a ready call in `record_taste_decision`'s real shape (src/index.ts ~8763):
  ```json
  {"profile": "andrew", "project": "motion-lab", "dimension": "motion",
   "decision": "keyfob: settleTime 1200 ms, swing Firm, drop 18 px",
   "rejected": "defaults: settleTime 1400 ms, swing Loose", "why": "",
   "source": "user-approved"}
  ```
  `decision` and `rejected` are strings, not objects. `source` is `user-approved` because the designer tuned and approved values the playground proposed. When the playground was built with `profile`/`project`, they are written into the file and carried through. When they are missing, Copy for Raven asks for both in two small fields before copying, and will not copy without them. The page cannot call MCP itself (it is a `file://` page), so the agent makes the call.
- The starter rule `APP-MOTION-restraint` (src/taste.ts:309) and the motion consistency check (:1233-1260) are unchanged in v1.

## Site gallery

- Route: `web/app/motion/page.tsx` on the apex (ravenmcp.ai/motion). Short intro (two sentences: what it is, how to get one through the tool), then the 911 key playground full width, then the tool call that made it.
- The playground is built from the same `src/motion-playground` code at web build time into `web/public/playgrounds/keyfob.html` and embedded in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin). The frame has an opaque origin, so it cannot use the clipboard; `allow-clipboard-write` is not a sandbox token. Copy is handed to the parent page:
  - The playground detects it is framed and, on a copy click, posts `{type: "raven-motion-copy", text}` to `parent`.
  - The parent listener accepts the message only when `event.source === iframe.contentWindow`, `event.origin === "null"`, `type` matches and `text` is a string under 64 KB. It then calls `navigator.clipboard.writeText(text)` and posts back success or failure.
  - The click's user activation propagates to ancestor frames in Chromium. If `writeText` is refused (Safari or any other engine), the parent shows the text in a selectable field with its own Copy button, so the designer can always get the code.
  - The standalone file (opened from disk, not framed) keeps its direct clipboard call.
- Navigation: one link in the site nav or the tools section, plain text, no arrow icon.
- Static, no auth, no data stored.
- Drift: add the route to `scripts/check-site-drift.mjs`; add one line to `site/llms.txt` and `web/public/llms.txt` (identical).
- Deploy: web deploys only on a manual `vercel deploy --prod`, which needs Andrew's approval in the conversation.

## Files that change with the tool count (111 → 112)

- `src/index.ts`: registration in `buildServer()` (:2554-2656) and the classification sets above.
- `manifest.json` via `scripts/sync-manifest-tools.mjs`.
- Count tests: `test/audit-dispatch`, `test/decision-import`, `test/design-review`, `test/grab-bridge`, `test/redis-taste-store`, `test/taste-remote-full` (gated 67 → 68, reconciliation 112 → 113). `test/gate-list-drift` reconciles names.
- At release: `web/lib/counts.ts` (`TOOL_COUNT`), `README.md:25`, `site/docs.html:559`, `web/components/tools/ToolsSection.tsx`, `web/app/docs/page.tsx`, `CHANGELOG.md`.
- New: `test/motion-playground.test.mjs`, modelled on `test/mood-board.test.mjs`.

Unchanged: stdio behaviour of every existing tool, `browser/raven-grab.js` and `web/public/raven-grab.js`, the anonymous remote set.

## Verification

1. `RAVEN_NO_USAGE_LOG=1 npm test` passes, including the new test.
2. New test: `buildServer({ remote: false, tasteStore })` + `InMemoryTransport.createLinkedPair()` + `client.callTool` for each motif. Checks:
   - file written, JSON shape, `controls` count;
   - the settleTime worked example returns 1200 ms and its warning; an override that cannot meet a constraint inside `max` is an error;
   - rejection of an unknown motif and an unknown control id;
   - each sanitiser rule, and the hostile-title export case;
   - emitted annotations (`destructiveHint: true`), and the remote build lists the tool as gated;
   - "no bounce": simulate the keyfob motion at the resulting defaults for 10 s and assert the angle never crosses rest; a motif that cannot reach ζ ≥ 1 returns the warning instead;
   - Copy for Raven text parses, and its call validates against the registered `record_taste_decision` input schema.
3. Chromium (Playwright via raven-studio-redesign) on each generated file: stage renders, a control change alters the next frame, Randomise ×10 keeps every constraint, Copy params and Copy for Raven write to the clipboard and the test reads it back (`context.grantPermissions(["clipboard-read","clipboard-write"])`, then `navigator.clipboard.readText()`), Copy for Raven without `profile`/`project` asks for them, Import state round-trips, reduced motion stops the loop, the hostile-title embed renders inert. No WebKit on the host.
4. Site: the `/motion` route on a preview URL, desktop and 390 px wide, by eye. In Chromium, Copy inside the iframe puts the text on the clipboard (read back as above), and a message posted from another window is ignored. Safari is checked by hand on a real device; the fallback field must appear if the copy is refused.
5. design-judge on the generated playground and the `/motion` page; done-gate; one Sol report-only pass with the customer block.

## Phases

| Phase | Ships | Gate |
| --- | --- | --- |
| 1 | Site gallery: `/motion` with the 911 key, parent-mediated copy, Motion Lab `embedCode()` fix synced in | Chromium clipboard read-back, Andrew approves the prod deploy |
| 2 | Tool with `keyfob` and `tab-stagger`, sanitiser, validator, taste-in mapping, Copy for Raven | npm test (including the Copy for Raven schema check), Chromium checks, release by manual dispatch |
| 3 | Remaining three motifs, authed-remote inline HTML | Face Dots performance check at densest spacing |
| 4 | Hosted share and client review (comments, approvals) | In Morven, not Raven |

## Open decisions

1. **Raven or Morven.** Raven is the free tier; `docs/spec-pattern-library.md:684` folds hosted or paid creation surfaces into Morven. Recommendation: the local generator is in Raven (a file on the user's disk, no hosting); hosted share links, review threads and version history are in Morven.
2. **v1 motifs.** Recommendation: `keyfob` (object physics) and `tab-stagger` (UI entrance), because they cover the two most common web uses. The three pattern motifs follow once they have runtimes; only the keyfob runtime exists today.
3. **Inline rendering in the agent.** MCP Apps (`ui://` resources) would show the playground inside the chat. Raven has no `ui://`, `resource_link` or `_meta` use yet. Recommendation: not in v1; revisit when a second tool needs it.
4. **Chrome font** (see Fonts). Recommendation: taste binding font, else system UI stack.
5. **Positioning on the site.** Recommendation: present it as a tool among the others, not a separate product.

## Out of scope

Agent-authored motion code (new evaluators), Figma or image ingest (Motion Lab's pipeline), the GSAP/CSS/WAAPI exporters beyond the Motion Lab v1 stubs, hosting generated playgrounds.

## Review log

Sol (gpt-6.1-sol, medium), v0.1: DOES NOT SURVIVE, 1 P1, 5 P2, 1 P3. All seven confirmed against source and fixed in v0.2:

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| 1 | P1 | Title injected unescaped into the embed's HTML comment; executes in Chromium | Title kept out of comments; adversarial export test (Security) |
| 2 | P2 | `TOOL_ACCESS` has no "write"; tool misfiled in `TOOL_LOCAL_ONLY_WRITE` | `destructive`, not local-only-write, annotations asserted |
| 3 | P2 | `allow-clipboard-write` is not a sandbox token; opaque origin has no clipboard | Parent-mediated copy over postMessage, clipboard read-back |
| 4 | P2 | Clamp ignored step; 1165 is off-step | Fixed correction order with round-up and range check; 1200 |
| 5 | P2 | "No bounce" mapped to Firm, which still oscillates | ζ ≥ 1 or a warning; simulation test |
| 6 | P2 | Copy for Raven payload did not match `record_taste_decision`; feature and test in different phases | Real schema, profile/project carried or asked for, both in phase 2 |
| 7 | P3 | Customer section named only the indie dev as Raven's default | Both lenses named |

Counts confirmed by Sol: stdio 111 → 112, gated 67 → 68, reconciliation 112 → 113; anonymous 45 and authenticated 56 unchanged.
