# Spec — `audit` dispatcher tool (Layer 2)

> One tool that detects the surface and fans out to the applicable `audit_*` set,
> so nobody has to know which of the 99 tools fits which situation.
> Status: **spec, not built.** Raven implementation is backlog until Andrew says go.

## Goal
Make "use all of Raven's applicable tools to audit this" a single, deterministic
tool call instead of a probabilistic agent fan-out. The demo proved the agent
*can* route from natural language (`audit_url` + `audit_taste` fired without being
named) — but "can" isn't "always," and it only works on clients smart enough to
route. A dispatcher makes it always, and works on every client (ChatGPT, Cursor,
a plain SDK loop), because the routing lives server-side.

## Why this over Layer 1 (instructions routing) — the load-bearing reason
Layer 1 (a surface→tools table in the server `instructions`) gets ~80% for free
and should ship regardless. The dispatcher earns its existence on two things Layer 1
can't do:
1. **One capture, many checks.** Today each web `audit_*` headless-captures the page
   independently — 8 tools = 8 captures, and they can see 8 slightly different DOM
   snapshots. The dispatcher captures **once** and runs every web check against the
   same snapshot. Faster and more consistent.
2. **Determinism + discoverability on dumb clients.** "Always applicable" is a
   guarantee, not a nudge. And a client with no routing smarts still gets the right
   set from one tool.

If neither of those mattered, this would be Layer 1 only. They do → build it.

## Scope
**In:** a new tool `audit`; surface detection; a surface→tool routing table; an
optional `intent` filter; a merged report; shared single-capture for web; remote-mode
gating; reuse of the existing per-module audit functions.
**Out:** any change to the 99 existing tools (they stay, unchanged, as power-tools);
new audit *logic* (dispatcher only orchestrates what exists); the Layer-1 instructions
table (separate, cheaper change); non-audit families (`decision_*`, taste kickoff,
grab) — dispatcher is audits only.

## Assumptions / open questions
- **A1** Each audit's core logic is callable as a module function separate from its
  `server.tool` wrapper. Mostly true (audit-url.ts, contrast.ts, tap-targets.ts, …);
  a few thin handlers may inline logic and need a small extract. **Verify per tool
  before estimating.**
- **A2** Adding a 100th stdio tool is acceptable as a minor-version feature (2.1.0).
  The "stdio stays byte-identical" freeze protects *existing tool outputs*, not the
  addition of a new tool. **Confirm with Andrew** — if the stdio tool list is
  treated as frozen too, `audit` ships behind a flag or authed-only.
- **A3** The anon remote **45-tool golden hash is frozen** (`f64bb18…2bb0a6`).
  `audit` must be **excluded from the anon remote allowlist** so the hash is
  unchanged. It may be exposed on stdio and the authed remote endpoint.
- **OQ1** Tool name: `audit` (matches Andrew's demo phrasing "audit this page") vs
  `audit_all` / `review`. Recommend `audit`; the *description* is the real
  discoverability fix (see below).

## Approach

### Signature (mirror what a user already types)
```ts
audit({
  // capture inputs — same contracts the existing tools already accept, forwarded as-is
  url?: string,            // web live capture
  html?: string,           // web static
  nodes?: object,          // web snapshot
  source?: string,         // ios/rn source (.swift / .tsx)
  screenshot?: string,     // ios/rn/device
  diff?: string,           // unified diff / patch  (or base+head)
  // routing + taste
  surface?: "web"|"ios"|"react-native"|"diff"|"video",  // optional override; else detected
  intent?: string,         // optional filter, e.g. "accessibility", "pre-ship", "contrast"
  project?: string, profile?: string,                   // taste binding, same as audit_taste
})
```

### Description (this string is half the feature)
> "Run **all applicable** Raven audits for a target. Detects the surface (web page /
> iOS screen / React Native / code diff / video) and fans out to the right checks —
> contrast, tap targets, typography, layout, responsive, and taste for web; the iOS
> or RN set for native; parity/contract for diffs. **Use this instead of choosing
> individual `audit_*` tools.** Pass `project` to judge against bound taste."

### 1. Surface detection (cheap heuristics, no ML)
- `surface` given → use it.
- `url`/`html`/`nodes`, or target looks like `http(s)://` or `*.html` → **web**
- `diff` present, or target starts with `diff --git` / has `base`+`head` → **diff**
- `.swift` source, or screenshot + ios hint → **ios**
- `.tsx`/RN source → **react-native**
- video params → **video**
- **Ambiguous → return a one-line "which surface?" clarification, don't guess.**
  Running the wrong 10 tools is worse than one round-trip.

### 2. Routing table (surface → sub-audit set)
| surface | sub-audits |
|---|---|
| web | `audit_url`\|`audit_page`, `audit_contrast`, `audit_tap_targets`, `audit_typography`, `audit_layout`, `audit_responsive_visibility`, `audit_consistency`, `audit_content`, `audit_taste`* |
| ios | `audit_ios_screen`, `audit_ios_a11y`, `audit_ios_privacy`, `audit_swiftui`†, `audit_device_frame` |
| react-native | `audit_rn` |
| diff | `review_diff`, `audit_parity`, `audit_contract`, `audit_api_contract`, `audit_asset_integrity` |
| video | `audit_video_playback` |

\* `audit_taste` runs only when `project`/`profile` is supplied — else it's listed in
`skipped[]` with reason "no taste binding." † `audit_swiftui` only when source given.

### 3. `intent` filter (optional, small keyword map)
Default = the full applicable set. `intent` narrows it:
`"accessibility"|"a11y"` → {contrast, tap_targets, ios_a11y}; `"contrast"` → {contrast};
`"content"|"copy"` → {content, typography}; `"pre-ship"` → full set + taste.
```
// ponytail: keyword→subset map. Upgrade to embedding match only if it misroutes in practice.
```

### 4. Execution
- **Web: capture once**, pass the single snapshot to every web sub-audit (the core
  win — refactor the shared capture to accept an injected snapshot; A1).
- Run sub-audits, **catch per-audit** so one failure doesn't sink the report; a
  failed audit lands in `skipped[]` with its error.
- **Remote mode**: consult existing `REMOTE_ARG_GUARDS` — run only the remote-safe
  subset, put the rest in `skipped[]` carrying the guard's own message. No new
  remote surface exposure.

### 5. Merged report
```jsonc
{
  "surface": "web", "target": "…", "project": "raven2-walkthrough",
  "ran": ["audit_url","audit_contrast","audit_tap_targets","audit_typography","audit_taste"],
  "skipped": [{ "tool": "audit_responsive_visibility", "reason": "…" }],
  "summary": { "grade": "B", "failures": 2, "warnings": 5 },
  "findings": { "contrast": { /* native audit_contrast payload, verbatim */ }, "…": {} },
  "next": "2 contrast failures — call suggest_contrast_fix for passing colors"
}
```
Each sub-audit's native payload is preserved under its key (nothing lost); the
top-level `summary` + `next` give the agent/human the pass/fail and the obvious
follow-up at a glance.

## Acceptance criteria
1. `audit({url, project})` on a web page returns a merged report whose `ran[]` is the
   full web set and whose `findings` contain each sub-audit's native payload.
2. It reproduces beat 5: `audit({url: demo-landing.html, project})` catches the muted
   `#b9b3a8` 1.96:1 contrast fail and `next` points to `suggest_contrast_fix`.
3. Ambiguous input (no capture params, no `surface`) returns a clarification, not a
   wrong-surface run.
4. `intent:"contrast"` runs only the contrast check; default runs the full set.
5. A sub-audit that throws lands in `skipped[]`; the rest of the report still returns.
6. Web run performs **one** capture, not one per sub-audit.
7. Remote mode runs only the remote-safe subset; anon **45-tool golden hash unchanged**.
8. All existing `audit_*` tests still pass (dispatcher reuses module fns, alters none).

## Verification plan (each criterion → evidence)
- **AC1/AC4/AC5** — one unit test file: surface-detection table (input→surface),
  routing table (surface→set), intent map, and a throwing-sub-audit stub → asserts
  `skipped[]`. Proves routing without a live browser.
- **AC2** — integration test against `scratchpad/demo-landing.html` (pre-fix version);
  assert the 1.96:1 finding and the `suggest_contrast_fix` pointer. This is beat 5
  through one tool — provable symmetry with the demo.
- **AC3** — call with `{}`; assert clarification response, no audits ran.
- **AC6** — spy/counter on the capture fn; assert called once for a web run.
- **AC7** — run buildServer in remote mode; assert `ran[]` ⊆ remote-safe set and
  `skipped[]` carries guard messages; recompute sha256 of the anon tool list → equals
  frozen hash.
- **AC8** — `RAVEN_NO_USAGE_LOG=1 npm test` green (768 pass baseline).

## Effort estimate
- Dispatcher + routing table + report merge: ~1 tool, ~150–250 lines in index.ts + a
  small `audit-dispatch.ts`.
- Shared single-capture refactor (AC6): the one non-trivial piece — depends on A1;
  scope it after auditing which web tools re-capture vs. accept a snapshot.
- Tests: one unit file + 2–3 integration cases.
- **Recommend: ship the dispatcher first *without* AC6 (each sub-audit captures as
  today), land the single-capture refactor as a fast-follow.** Gets the
  discoverability/determinism win immediately; the perf win is a clean second PR.
```
// ponytail: dispatcher v1 = route + merge over existing tools, N captures.
// Single-capture is the optimization, not the feature. Ship v1, then AC6.
```
