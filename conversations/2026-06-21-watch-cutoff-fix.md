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
