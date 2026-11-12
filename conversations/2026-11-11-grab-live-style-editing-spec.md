# 2026-11-11: Grab live style editing spec

## Request
`/goal`: spec a change so every Grab style control writes to the page as it changes, editors stay open until Enter or a press outside, and a unit change converts the number (26px on 18px text becomes 144.44%, not 26%).

## Done
- Root cause found in `browser/raven-grab.js` at `84b10bf`: unit select `change` is wired to `commit` (9084), `readValue` joins the old number to the new unit (9405–9411), and the number field has no `input` listener.
- Inventory of every style editor's controls, today against target.
- Chromium 149 measurements for unit bases, transition-safe measurement, and percent line-height truncation (scripts in the session scratchpad, not in the repo).
- Spec written: `docs/spec-grab-live-style-editing.md`. Not committed.

## Changed files
- `docs/spec-grab-live-style-editing.md` (new, untracked)
- `conversations/2026-11-11-grab-live-style-editing-spec.md` (this log)
- No source or test changes.

## Open decisions for Andrew
- D1: refuse a conversion that fails its check (default) or switch the unit and keep the number.
- D2: add a unitless option for line-height (default yes).
- D3: picks (chips, presets, colour panel dismiss, handle release) stay open (default) or keep closing.

## Pending
- Codex adverse review of the spec against source, at most three rounds.
- done-gate, then open the spec in Obsidian.

## Next
1. Andrew answers D1–D3.
2. Build phase 1 with the `grab-falsify-loop` skill.
