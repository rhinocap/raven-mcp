# Session: 2026-06-21 — Watch grid "cut off" fix

## /goal: "the phones and terminals are all cut off" (screenshot of #watch)

### Root cause (two layers)
1. `.mb-screen` rendered at AR 1.82 vs 16:9 clips → object-fit:cover+top sliced ~10px off the bottom (phone tab bar + terminal last line).
2. The shipped clips were cut from `sizzle-reel.mp4` — an invideo export with a **baked-in Ken Burns zoom** — which cropped the phone bottom and ran terminal code lines off the right edge. (This was the unresolved PENDING from the 06-20 session: "re-cut from the raw source.")

### Fix
- **CSS (d81cc98):** sized `.mb-screen` to exactly 16:9 (top 0.93%, height 98.15%, object-position center) → exact fit, no crop/bars.
- **Clips (c048fd4):** re-cut all 6 beats from the 3840×2160 master `~/Movies/RavenReelRawmp4.mp4` with a fixed union crop `crop=3680:2070:160:78 → 1920×1080` that contains the full simulator + full terminal in every beat. Regenerated posters. Terminal lines now complete with right margin; phones show status bar → tab bar.

### Verified
- Old-vs-new right-edge compare: terminal no longer bleeds off-frame.
- Poster contact sheet: all 6 beats full, nothing cut.
- Rendered localhost rows 1 & 3 (cache-busted posters) + deployed URL row 6: full phone + full terminal.
- screenAR 1.780 == content 1.778.

### Deploy
https://site-383s0d8o1-cunliffeandrewc-8712s-projects.vercel.app · branch raven-feedback-site-polish (c048fd4)

### Flag for Andrew
- The recording shows `cunliffeandrewc@gmail.com` + org line in the terminal (beat 06). Pre-existing (same in old clips), but it's a personal email on a public marketing clip — worth a redact/re-cut if undesired.
- Beat 01's phone is smaller than beats 2–6 (recorded pre-"Fit Screen"); complete, just less zoomed. Can give beat 01 a tighter crop if desired.

## State
- Cut-off fix: done & verified on deployed URL ✓
- PENDING from 06-20 "re-cut clips from raw source": now DONE ✓

## Pending (carried forward to next session)
- **Increase vertical spacing between the MacBook rows** in the watch grid: `.watch-rows { gap: clamp(96px, 11vw, 160px); }` (site/index.html:1666). Branch raven-feedback-site-polish. Suggested start: clamp(140px,14vw,220px); verify on deployed URL @~2436 + 8px grid. (Andrew queued at /clear 2026-06-21.) See memory project-raven-watch-spacing-todo.

---

## Retrospective (auto, 2026-06-21 /clear)

### Mistakes & lessons

| Mistake | Type | Rule |
|---------|------|------|
| Didn't read prior session log before diagnosing — PENDING "re-cut clips from raw" was the full answer, spent ~30 min re-deriving it | Speed gap | **Read the session log for any ongoing multi-session feature FIRST** — PENDING items are exactly the unresolved root causes. A 2-min read collapses the entire diagnosis. Needs promotion to `~/.claude/CLAUDE.md` (blocked in headless run). |
| macOS screenshot access burned 3 round-trips: U+202F narrow-space in filename + HEIC-as-.png + Bash sandbox from ~/Pictures | Speed gap | Pattern: glob-match → cp (dangerouslyDisableSandbox) → sips → Read. Memory written (project-scoped). Rule needs promotion to global memory (`~/.claude/memory/`) — affects all projects. |
| First fix (AR geometry) was real but incomplete; Andrew had to return "still cut off" | Accuracy gap | Downstream from the session-log miss — if the log had been read first, the fix would have gone straight to source clips. AR fix was valid (and needed), just not the root cause. |

### Promotion flags (complete next interactive session)
1. `~/.claude/CLAUDE.md`: **"Read the ongoing-feature session log before any diagnosis — PENDING items are the unresolved root causes."** Near the "reuse what worked" hard rule family.
2. `~/.claude/memory/`: Move `reference_macos_screenshot_gotchas.md` (or a copy) to the GLOBAL memory, not just the raven-mcp project memory — it fires on every project where Andrew shares screenshots.

### Metrics
- First-attempt accuracy: ~70% (screenshot 3 attempts; AR fix 1 pass/correct-but-incomplete; re-cut 1 clean pass)
- Autonomy score: 99%
- Round-trips: ~1.8 avg
- Push rejections: 0

### Wins
- Re-cut all 6 clips from 4K master in one pass with a union crop that works for every beat's varied simulator layout
- A/B/C test page confirmed exact-16:9 (C) over letterbox (B) — right craft call
- Three-level verification (edge compare, poster contact sheet, deployed URL AR measurement)
- Proactively flagged personal email in beat-06 terminal (wasn't asked)
- Queued next task (row spacing) in 3 persistent places before /clear

### RavenMCP opportunities
Already captured in the loop session: `audit_device_frame` / content-crop-inside-mockup detection. No new opportunities from this session beyond what was logged.

### What would help go faster
- Andrew can include "see prior session log" in the prompt for ongoing features — or the rule (once promoted) covers it automatically.
