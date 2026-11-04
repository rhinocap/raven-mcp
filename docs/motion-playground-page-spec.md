# Motion Playground page: spec

Andrew, 2026-11-03: "It shouldn't be the home page. It should be a page off of the home page. The home page that we have right now shouldn't change. There should be a section, just like there is for the design grab playground. There should be one for the motion lab too. Otherwise the marketing site really shouldn't change."

## Where things stand

- **Design Playground** (`/raven-design`, nav "Design Playground", home section `#raven-design` with "Try the playground") is the model. It has:
  - a short intro: an h1 and one line;
  - a stage with a sample product page (the Northstar wireframe) and Grab running in standalone mode on it;
  - Coachmarks that point to the first thing to try.
- **Motion**: no page. The 3.0.0 `/motion` page (a screenshot with a custom side panel) was taken down in d2b9780. This spec replaces it; nothing from it is reused.
- **Grab's Motion tab** has two modes, `full` (local bridge) and `copy`, and is off without a bridge (`browser/raven-grab.js:51`). It is also hidden in the mobile sheet (≤760px, `:394`) and in simple mode (`motionTabAvailable()`, `:12431`). Playground URLs must be loopback `/p/<id>` (`:12433`), and markers only draw in `full` mode (`:12540`).
- **`suggest_motion` output** carries local paths and temporary loopback URLs (`src/motion-suggest/index.ts:325`).

## What we build

1. **A new page, `/motion`, built the same way as `/raven-design`.**
   - Same intro pattern: an h1 and one plain line.
   - Same stage: the Northstar wireframe, reused from `/raven-design` as a shared component rather than copied. `/raven-design` must render exactly as it does today.
   - Grab runs on the wireframe with the Motion tab open.
   - Coachmarks point at "Find motion".
   - Nothing moves until the visitor plays a suggestion.
2. **Grab Motion mode `static`.**
   - Grab reads `/playgrounds/motion/suggestions.json` instead of calling the bridge.
   - "Find motion" shows the same numbered markers, list and reasons as `full` mode. The marker guard is extended to `static`.
   - "Add motion" opens the prebuilt playground for that element.
   - Static-mode playground URLs must be same-origin under `/playgrounds/motion/`; everything else is rejected.
   - On mobile (≤760px), `motionTabAvailable()` allows `static` in the mobile sheet.
3. **Build step.**
   - `scripts/build-motion-playground.mjs` serves the web app locally and runs `suggest_motion` on `/motion`'s wireframe.
   - It writes a portable `suggestions.json` and one playground per suggestion (`/playgrounds/motion/<n>.html`). Local paths and loopback URLs are removed, and the script fails if any remain.
   - The drift check fails if the wireframe changed and the suggestions were not rebuilt.
4. **What Grab sends.** The same as `/raven-design` today: the component-request email and the feedback form (`raven-grab.js:2672`). Nothing else.
5. **Home page section `#motion`, directly after `#raven-design`.** Same markup and classes as the Design Playground section, so it reads as a sibling:
   - a section header with an h2 and a subtitle (draft copy for Andrew's review: "Pick an element. Tune how it moves." / "Drag a slider and watch it change, then copy the motion into your code.");
   - a "Try the playground" button linking to `/motion`;
   - a muted, looping screen recording of the Motion Playground (`/motion-demo.mp4` plus a poster image), recorded from the approved page, with an aria-label describing it, the same way the Design Playground section does.
6. **Nav.** Add "Motion Playground" next to "Design Playground", only after Andrew approves the page and the section.

## Not changing

Everything on the home page outside the new `#motion` section, plus `/raven-design`, docs, changelog and every other page. The only shared-code change is extracting the Northstar wireframe into a component, and `/raven-design` must render pixel-identical afterwards.

## Acceptance

All browser checks run in Playwright Chromium, against `next build && next start` on loopback.

1. `/raven-design` is pixel-identical to production at 1440 and 390 wide. `/` is identical to production except for the inserted `#motion` section: every other section matches its production capture, and the section matches `#raven-design` in spacing, type and button style. I compare full-size captures.
2. `/motion` at 1440, 1024 and 390 shows the intro, the wireframe and Grab with the Motion tab open.
3. "Find motion" lists the prebuilt suggestions, with markers on the right elements at 1440 and 390. Each playground opens, its controls change the motion, and Copy puts text on the clipboard; I read the clipboard back.
4. With `prefers-reduced-motion: reduce`, nothing on `/motion` moves until a suggestion is played.
5. `/` requests no `/playgrounds/motion/` file; I check the network log. The `#motion` section's button opens `/motion`, and its video plays muted and loops, but stays paused with reduced motion on.
6. Copy is warm and plain: no engine terms outside advanced, no arrow icons, Untitled Sans, and the cyan accent.
7. design-judge PASS, `RAVEN_NO_USAGE_LOG=1 npm test` with 0 fail on its summary line, `node scripts/check-site-drift.mjs` with RESULT PASS, and a Sol pass with no P1 or P2 open.

## Order and review gates

1. Run `suggest_motion` on the wireframe and show Andrew the suggestions list (labels, reasons, markers) before building anything. This is a cheap direction check, because the suggestions decide whether the page is any good.
2. Build `static` mode and `/motion`. Show a Grab bridge preview link and full-size captures at desktop and mobile widths. **Stop for his review.**
3. After he approves the page: record the demo video, add the home `#motion` section, and show it as a preview and a full-size capture. **Stop for his review.**
4. Only after he approves both: one release question, asked on its own. No push or deploy without his explicit go.
5. After a `vercel rollback`, the domain stays pinned: the next deploy needs `vercel promote`, and live checks must confirm which deployment the domain serves.

## Risks

- The suggestions on the Northstar wireframe may be weak. Step 1 exists to find that out first.
- Grab markers over the wireframe at 390px: check that hit-testing and marker positions work in the mobile sheet.

## Goal

> /goal Add a Motion Playground page at ravenmcp.ai/motion, built the same way as /raven-design: same intro pattern, the same Northstar wireframe (shared component, /raven-design unchanged), and Grab with its Motion tab in a new prebuilt `static` mode, desktop and mobile, fed by `suggest_motion` run on the wireframe at build time and converted to same-origin files. Add a home page section for it directly after the Design Playground section, built the same way (header, "Try the playground" button, muted looping demo video); the rest of the home page and every other page stay unchanged. Follow `docs/motion-playground-page-spec.md` in raven-mcp: show Andrew the suggestions list first, then stop for his review of the built page, then of the home section. Add the nav link only after he approves both. Ask the release question only after that, and never push or deploy without his explicit go. Done means acceptance items 1–7 are verified as written, with design-judge PASS and Sol showing no P1 or P2.
