# Playgrounds on the home page: spec

Andrew, 2026-11-03: "The playground that's on the marketing site should literally just be the home page of the marketing site with the motion controls, just like the grab session playground should be the home page with the grab session."

## Where things stand

- **Design Playground** (`/raven-design`) is a made-up "Northstar Workspace" wireframe with Grab in standalone mode, Coachmarks, and `--demo-*` tokens. It is not our page.
- **Motion playground**: none. The 3.0.0 `/motion` sample page was taken down (d2b9780).
- **Grab's Motion tab** has two modes. `full` runs `suggest_motion` through the local bridge. `copy` gives a line to paste into chat. Without a bridge it is off (`browser/raven-grab.js:51`). `motionTabAvailable()` (`raven-grab.js:12431`) also hides the tab in Grab's mobile sheet (≤760px, `:394`) and in simple mode.
- **`suggest_motion` output** carries local file paths and temporary loopback URLs (`src/motion-suggest/index.ts:325`). Grab accepts only loopback `/p/<id>` playground URLs (`raven-grab.js:12433`) and draws markers only in `full` mode (`:12540`).

## What we build

The page a visitor plays with is ravenmcp.ai's own home page, unchanged, with Grab on top of it.

1. **Shared home page.**
   - The home page body moves into one component, used by `/`, `/raven-design` and `/motion`.
   - The one behaviour change applies to all three routes: with reduced motion on, the autoplay videos (`page.tsx:66`, `HomeScripts.tsx:86`) stay paused and the infinite CSS animation (`globals.css:401`) stops. Today the home page ignores that setting.
2. **Design Playground = home page + Grab.**
   - `/raven-design` renders the shared home page with Grab in standalone mode.
   - The token map uses only custom properties the site already has: the accent colours, `--space-*` and the font families (`globals.css:29–55`). Font sizes are literal values in the CSS (`globals.css:77`, `:210`). The Styles panel edits them as values, and turning them into tokens is out of scope.
   - The `--demo-*` tokens, the Northstar markup and its Coachmarks are deleted.
   - Edits stay in the visitor's browser and reset on reload. Grab sends two things, the same as the current playground: the component-request email and the feedback form (`raven-grab.js:2672`, which sends the message, the email address, the viewport, and optionally the page). Both stay, and the page says so in one plain line.
3. **Motion playground = home page + Grab, Motion tab open.**
   - `/motion` renders the shared home page with Grab opened on the Motion tab.
   - New Motion mode `static`: Grab reads `/playgrounds/home/suggestions.json` instead of calling the bridge.
     - "Find motion" shows the same numbered markers, list and reasons as `full` mode.
     - The marker guard is extended to `static`.
     - "Add motion" opens the prebuilt playground for the chosen element.
   - Static-mode playground URLs must be same-origin under `/playgrounds/home/`. Everything else is rejected, matching the loopback check in `full` mode.
   - On mobile (≤760px), `motionTabAvailable()` allows `static` in the mobile sheet. Markers and the list must be usable at 390px.
   - Motion appears only when the visitor plays a suggestion.
4. **Build step.**
   - `scripts/build-home-motion.mjs` starts the web app locally and runs `suggest_motion` on `/`.
   - It converts the result into a portable file. Local paths and temporary URLs are removed, and each playground becomes `/playgrounds/home/<n>.html`. The script fails if any local path or loopback URL remains.
   - The drift check fails if the home page changed and the suggestions were not rebuilt.
5. **Nav.** "Design Playground" stays. "Motion" is added only after Andrew approves `/motion` (step 3 of the order below).

## Not in scope

No new marketing copy beyond the one line about what Grab sends, no new sections, no separate sample page, no type tokens, and no changes to Grab's look.

## Acceptance

All browser checks run in Playwright Chromium, against `next build && next start` on loopback.

1. `/`, `/raven-design` and `/motion` show the same home page at 1440, 1024 and 390 wide; I compare full-size captures.
2. On `/raven-design`, clicking the hero headline selects it, and the Styles panel shows the site's real token names. Changing `--accent-blue` recolours the page; I check the computed style after the change, and again after a reload to confirm it reset.
3. On `/motion`, at 1440 and 390, "Find motion" lists the prebuilt suggestions with markers on the right elements. Each suggestion's playground opens, its controls change the motion, and Copy puts text on the clipboard; I read the clipboard back to confirm.
4. `/` requests no `raven-grab.js` and no `/playgrounds/home/` file; I check the network log. Lighthouse mobile performance on `/`, median of 3 runs, is no more than 3 points below the current production `/` measured the same way.
5. With `prefers-reduced-motion: reduce`, nothing on `/motion` moves until the visitor plays a suggestion. That includes the hero videos and the CSS loop.
6. Copy is warm and plain: no engine terms outside advanced, no arrow icons, Untitled Sans, and the cyan accent.
7. design-judge PASS, `RAVEN_NO_USAGE_LOG=1 npm test` with 0 fail on its summary line, `node scripts/check-site-drift.mjs` with RESULT PASS, and a Sol pass with no P1 or P2 open.

## Order and review gates

1. Build the shared home component and the Design Playground. Show Andrew a Grab bridge preview link and a full-size capture. **Stop for his review.**
2. Run `suggest_motion` on the home page and show Andrew the suggestions list (labels, reasons, markers) **before** building the `static` mode. This checks the direction cheaply, because the suggestions decide whether the motion page is any good.
3. Build `static` mode and `/motion`. Show the preview at desktop and mobile widths. **Stop for his review.**
4. Only after he approves both: one release question, asked on its own.
5. No push or deploy without his explicit go in that conversation.
6. After a `vercel rollback`, the domain stays pinned: the next deploy needs `vercel promote`, and live verification must check which deployment the domain serves.

## Risks

- Grab's selection outline and markers over the home page's fixed `HeroGrid` canvas and `.reveal` transforms: check that hit-testing and marker positions survive both.
- The hero's copy-install button and the nav must stay usable while Grab is open.
- The suggestions on our own home page may be weak. Step 2 exists to find that out before the build.

## Goal

> /goal Make ravenmcp.ai's playgrounds the real home page. `/raven-design` = the home page with Grab in standalone mode, mapped to the site's existing tokens (Northstar wireframe removed). `/motion` = the home page with Grab's Motion tab in a new prebuilt `static` mode, desktop and mobile, fed by `suggest_motion` run on `/` at build time and converted to same-origin files. Follow `docs/home-playgrounds-spec.md` in raven-mcp: stop for Andrew's review after the Design Playground, after the suggestions list, and after `/motion`. Ask the release question only after both are approved, and never push or deploy without his explicit go. Done means acceptance items 1–7 are verified as written, with design-judge PASS and Sol showing no P1 or P2.
