
### Run +release (2026-06-22): v1.12.0 PUBLISHED
Andrew: "let's /release" = the go. Ran the release skill end-to-end on `main`:
- Preflight: clean tree, `npm whoami`=accunliffe (no E401), origin/main=b51d570 (no collision).
- Step 1b: added v1.12.0 `<article>` to `site/changelog.html` (was stalled at v1.11.0), committed `8a9e3f6`.
- `scripts/release.sh minor` → published `raven-mcp@1.12.0`, commit `b6e09ae`, tag `v1.12.0`, pushed. **No EOTP gate** (token valid).
- Verify: npm=1.12.0, tag pushed, live changelog page shows v1.12.0 (after ~30s Vercel deploy), local `dist/` rebuilt.
- npm: https://www.npmjs.com/package/raven-mcp/v/1.12.0
6 post-v1.12.0 branches still parked (cut off OLD base b51d570 — rebase onto b6e09ae before landing) = next release v1.13.0. GH #9/#1 close when their branches land.
