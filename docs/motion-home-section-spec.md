# Motion Playground: demo video, home section, nav link — spec

Follows `docs/motion-playground-page-spec.md`. `/motion` is live (web-q0qradx6w, 2026-11-04) but nothing links to it. This covers what is left: the demo video, the home `#motion` section, the nav link, and the release.

## Where things stand

- **Model to copy:** the home `#raven-design` section (`web/app/page.tsx:53–77`):
  - `section-header` with an h2 and a subtitle;
  - `pg-demo-cta` with a "Try the playground" button;
  - `figure.ba-featured.pg-demo` with a muted, looping, autoplaying `<video>` (`/playground-demo.mp4` at 1600×900, 30fps, H.264, 26.5s, 6.5MB, plus `/playground-demo-poster.jpg`) and an aria-label that describes the recording.
- **No recording script exists** for the Design Playground video. This one gets a script, so it can be re-recorded when `/motion` changes.
- **Reduced motion:** the `#raven-design` video autoplays even with reduced motion on.
- **Nav:** `PAGE_LINKS` in `web/public/assets/nav.js:4` lists Design Playground, Docs and Changelog. Links fold into the menu at a 620px nav container. The playground pages fit the nav between Grab's panels.
- **Sitemap:** `web/app/sitemap.ts` has no `/motion` entry.
- **Deploys:** ravenmcp.ai is the Vercel project "web". It deploys only with `vercel deploy --prod` from `raven-mcp/web`; pushing `main` deploys mcp.ravenmcp.ai only.

## What we build

1. **`scripts/record-motion-demo.mjs`.** This records `/motion` from `next start` on loopback in Playwright Chromium, at 1600×900 and the device scale the existing video uses.
   - **Cursor:** a drawn cursor is injected for the recording only, because Playwright video has no cursor.
   - **Sequence, about 20–25s, with pauses long enough to read:**
     1. the page at rest with the Motion tab open;
     2. Find motion: the markers and the list appear;
     3. open suggestion 1 (Button hover: Open dashboard);
     4. play it;
     5. drag one slider and play again so the change is visible;
     6. Copy for your agent, showing the copied state;
     7. close and return to the page.

     The loop point matches the first frame.
   - **Output:** WebM is converted with ffmpeg to `/motion-demo.mp4` (H.264, yuv420p, faststart, no audio, ≤7MB) and `/motion-demo-poster.jpg` (frame 0).
   - **Check:** I pull frames with ffmpeg at each step and look for jumps, blank frames and flicker.
2. **Home section `#motion`,** placed directly after `#raven-design`, with the same markup and classes.
   - **Draft copy for Andrew's review:**
     - h2: "Pick an element. Tune how it moves."
     - subtitle: "Drag a slider and watch it change, then copy the motion into your code."
   - **Button:** "Try the playground", linking to `/motion`.
   - **Video:** `/motion-demo.mp4` with its poster. The aria-label describes the recorded sequence.
   - **Reduced motion:** with reduced motion on, the video does not autoplay and shows the poster. That is a small client component used in `#motion` only. The `#raven-design` video stays as it is; fixing it too is a separate question for Andrew.
3. **Nav link,** added only after Andrew approves the video and section.
   - **Link:** "Motion Playground" goes into `PAGE_LINKS` after Design Playground, with `isActive` for `/motion`. The phone menu picks it up through `allMobileLinks()`.
   - **Width:** the link row gets wider. I re-measure the 620px fold point so the links never wrap or touch Get Started, on every page from 769 to 1920.
   - **Sitemap:** add `/motion` at priority 0.9.

## Not changing

`/motion` itself, `/raven-design`, every other home section, docs, changelog, and Grab. The nav changes only by the new link and whatever fold point it needs.

## Acceptance

All checks run in Playwright Chromium against `next build && next start` on loopback, except item 6.

1. **Video:** `ffprobe` shows H.264 at 1600×900, about 20–25s, no audio stream, ≤7MB. Frames sampled at every step show the step happening, with no blank or jumping frames. The last frame flows into the first.
2. **Home page:**
   - `/` is identical to production at 1440 and 390, apart from the inserted `#motion` section.
   - `#motion` matches `#raven-design` in spacing, type and button style. I compare full-size captures.
   - `/` requests no `/playgrounds/motion/` file.
3. **Section behaviour:**
   - the button opens `/motion`;
   - the video plays muted and loops;
   - with `prefers-reduced-motion: reduce` it stays paused on the poster.
4. **Nav, after approval:**
   - Motion Playground appears on every page and in the phone menu, and shows as active on `/motion`.
   - There is no wrap, overlap or link under Grab's panels from 390 to 1920 on `/`, `/raven-design`, `/motion`, `/docs` and `/changelog`. The existing navfit, navgrab and homecheck sweeps pass.
   - `/sitemap.xml` lists `/motion`.
5. **Copy:** warm and plain, with no engine terms, no arrow icons, Untitled Sans and the cyan accent. design-judge PASS. `RAVEN_NO_USAGE_LOG=1 npm test` shows 0 fail. `node scripts/check-site-drift.mjs` shows RESULT PASS. A Sol pass shows no P1 or P2.
6. **After the deploy:** the same nav sweeps, plus the section checks, rerun against https://ravenmcp.ai. `vercel inspect` confirms that the domain serves the new deployment.

## Order and review gates

1. Record the video and show Andrew the MP4 and the poster. **Stop for his review.** The video is the expensive part to redo, so it is checked before the section is built around it.
2. Build `#motion`. Show a Grab bridge preview link and full-size captures at 1440, 1024 and 390. **Stop for his review** of the copy and the section.
3. Add the nav link and the sitemap entry. Show captures of the nav at 1024 and 1440 and the phone menu. **Stop for his review.**
4. Ask the release question on its own. Nothing is pushed or deployed without his explicit go. Release means pushing `main` and then `vercel deploy --prod` from `raven-mcp/web`; that command needs Andrew to run it or a permission rule.

## Risks

- A 25s loop of a mostly still page can read as slow. Keep pauses short and let the slider drag carry it.
- The fourth nav link may push the fold point well above 620px on home at 1024. If the links no longer fit at 1024, raise the fold point instead of shrinking the type.

## Goal

> /goal Finish the Motion Playground launch in raven-mcp, following `docs/motion-home-section-spec.md` on branch `motion-home-section`. Build a scripted, re-recordable demo video of /motion (`scripts/record-motion-demo.mjs`, which writes `/motion-demo.mp4` and its poster) and stop for Andrew's review. Then add the home `#motion` section directly after `#raven-design`, with the same markup, a "Try the playground" button and the muted looping video paused under reduced motion, and stop for his review. Then add "Motion Playground" to the site nav and `/motion` to the sitemap, and stop for his review. The rest of the home page, /motion, /raven-design and every other page stay unchanged. Ask the release question only after all three approvals, and never push or deploy without his explicit go. Done means acceptance items 1–6 are verified as written, with design-judge PASS and Sol showing no P1 or P2.
