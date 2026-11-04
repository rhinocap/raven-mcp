# Playgrounds on the home page: spec

Andrew, 2026-11-03: "The playground that's on the marketing site should literally just be the home page of the marketing site with the motion controls, just like the grab session playground should be the home page with the grab session."

## Where things stand

- **Design Playground** (`/raven-design`) is a made-up "Northstar Workspace" wireframe with Grab in standalone mode, Coachmarks, and `--demo-*` tokens. It is not our page.
- **Motion playground**: none. The 3.0.0 `/motion` sample page was taken down (d2b9780).
- **Grab's Motion tab** has two modes. `full` runs `suggest_motion` through the local bridge. `copy` gives a line to paste into chat. Without a bridge it is off (`browser/raven-grab.js:51`), so it cannot run on ravenmcp.ai as it stands.

## What we build

The page a visitor plays with is ravenmcp.ai's own home page, unchanged, with Grab on top of it.

1. **Design Playground = home page + Grab.**
   - `/raven-design` renders the same content as `/`: the home page body moves into one shared component used by both routes.
   - Grab loads in standalone mode.
   - The token map points at the site's real custom properties in `globals.css` (`--accent-blue`, `--space-*`, the type scale). The `--demo-*` tokens and the Northstar markup are deleted.
   - Edits stay in the visitor's browser. Nothing is saved or sent, except the component-request email flow, which keeps working as it does today.
2. **Motion playground = home page + Grab, Motion tab open.**
   - `/motion` renders the same shared home page, with Grab opened on the Motion tab.
   - New Motion mode `static`: Grab reads a prebuilt suggestions file instead of calling the bridge.
     - "Find motion" shows the same numbered markers, list and reasons as `full` mode.
     - "Add motion" opens the prebuilt playground for the chosen element.
   - The page itself is never animated by default. Motion appears only when the visitor asks for it.
3. **Build step.**
   - `scripts/build-home-motion.mjs` starts the web app locally and runs `suggest_motion` on `/`.
   - It writes `web/public/playgrounds/home/suggestions.json` and one playground per suggestion.
   - The drift check fails if the home page changed and the suggestions were not rebuilt.
4. **Nav.** "Design Playground" stays. "Motion" is added only after Andrew approves the page (step 6 of the order below).

## Not in scope

No new marketing copy, no new sections, no separate sample page, no changes to the home page itself beyond extracting the shared component, and no changes to Grab's look.

## Acceptance

1. `/`, `/raven-design` and `/motion` show the same home page at 1440, 1024 and 390 wide; I compare full-size captures.
2. On `/raven-design`, clicking the hero headline selects it, and the Styles panel shows the site's real token names. Changing `--accent-blue` recolours the page, and a reload resets it.
3. On `/motion`, "Find motion" lists the prebuilt suggestions with markers on the right elements. Each suggestion's playground opens, its controls change the motion, and Copy works.
4. The `/` home page loads no Grab code. Lighthouse performance on `/` does not drop.
5. With reduced motion turned on, nothing on `/motion` moves until the visitor plays a suggestion.
6. Copy is warm and plain: no engine terms outside advanced, no arrow icons, Untitled Sans, and the cyan accent. design-judge PASS, suite 0 fail, drift PASS, and a Sol pass with no P1 or P2 open.

## Order and review gates

1. Build the shared home component and the Design Playground. Show Andrew a Grab bridge preview link and a full-size capture. **Stop for his review.**
2. Run `suggest_motion` on the home page and show Andrew the suggestions list (labels, reasons, markers) **before** building the `static` mode. This checks the direction cheaply, because the suggestions decide whether the motion page is any good.
3. Build `static` mode and `/motion`. Show the preview. **Stop for his review.**
4. Only after he approves both: one release question, asked on its own.
5. No push or deploy without his explicit go in that conversation.
6. After a `vercel rollback`, the domain stays pinned: the next deploy needs `vercel promote`, and live verification must check which deployment the domain serves.

## Risks

- Grab's selection outline and markers over the home page's fixed `HeroGrid` canvas and `.reveal` transforms: check that hit-testing and marker positions survive both.
- The hero's copy-install button and the nav must stay usable while Grab is open.
- The suggestions on our own home page may be weak. Step 2 exists to find that out before the build.

## Goal

> /goal Make ravenmcp.ai's playgrounds the real home page. `/raven-design` = the home page with Grab in standalone mode, mapped to the site's real tokens (Northstar wireframe removed). `/motion` = the home page with Grab's Motion tab in a new prebuilt `static` mode, fed by `suggest_motion` run on `/` at build time. Follow `docs/home-playgrounds-spec.md` in raven-mcp: stop for Andrew's review after the Design Playground, after the suggestions list, and after `/motion`. Ask the release question only after both are approved, and never push or deploy without his explicit go. Done means acceptance items 1–6 are verified on full-size captures, with design-judge PASS and Sol showing no P1 or P2.
