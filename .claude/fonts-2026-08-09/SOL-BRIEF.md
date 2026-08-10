# Falsification brief — Untitled Sans migration, 2026-08-09

REPORT ONLY. Do not edit files. Your job is to REFUTE the claims below.

## Claim under audit
Commit 89839cd ("Serve the Untitled Sans Black weight as woff2") is pushed and
LIVE on the `site` Vercel project (mcp.ravenmcp.ai). The apex (ravenmcp.ai,
served by the separate `web` project) is NOT yet migrated and still serves Inter.

## Evidence offered
1. Pushed f6dc738..89839cd to origin/main. Outgoing top-level paths were
   .gitignore, conversations, scripts, site — no src/, no api/.
2. Deploy watcher: black.woff2 flipped 404 -> 200, served at exactly 47516 bytes,
   content-type font/woff2; regular/medium/bold all 200; the desktop .otf 404.
3. Anonymous tools/list on https://mcp.ravenmcp.ai/api/mcp: 45 tools, sha256 of
   newline-joined sorted names = f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6
   (the frozen golden hash) — MATCH.
4. Playwright, real Chromium, 1440x900, foreground-equivalent:
   - mcp.ravenmcp.ai/index.html: all four faces report `loaded` including
     "Untitled Sans w=800 900"; h1 computes to weight 900 @ 88px with stack
     "Untitled Sans", -apple-system, ...; canvas width discriminator on the same
     string/size = 1635.48 (real stack) vs 1505.33 (fallback-only), differs.
   - ravenmcp.ai: stack is __Inter_8b3a0b, loaded; width 1482.09 vs 1419.22.
5. Screenshots inspected by eye; the two surfaces are visibly different typefaces.
6. Black weight conversion: source .otf and the three shipped woff2 ALL measure
   502 glyphs / 397 codepoints / U+0020-U+2212, so no subsetting was applied —
   the Black was a straight flavor=woff2 re-wrap, read back after writing.
7. site/assets/fonts/*.otf added to .gitignore so the 206KB desktop source is not
   publicly downloadable from the site/ outputDirectory.

## Attack these specifically
- Is "45 tools + golden hash intact" actually sufficient to prove the MCP
  endpoint did not move? What would it miss?
- Does the canvas width discriminator prove the custom face is SELECTED, or
  could it pass with the font absent? Name the input that makes it lie.
- Nine @font-face sites were repointed from .otf to .woff2 by a scripted edit.
  What could that edit have missed, and how would it show up (or not)?
- The .otf is now gitignored but was previously committed — is it still reachable?
- Is there any weight/consumer on the site that requests 800/900 and would now
  get something other than the new Black face?
- Anything about serving a woff2 whose internal family name is
  'Untitled Sans Black' under @font-face family 'Untitled Sans' at weight 800 900.

Repo root: /Users/accunliffe/projects/raven-mcp
Default to REFUTED if uncertain. Priority-tag every finding P1/P2/P3.
