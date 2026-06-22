# /loop — marketing-site sync (ravenmcp.ai)

A self-paced drift-catcher that keeps the public marketing site (`site/` → https://ravenmcp.ai, auto-deployed by Vercel on push to `main`) in sync with what raven-mcp has actually shipped — new tools, new releases, new versions. This is the safety net for the exact failure where the site stalled at v1.6.1 while npm/`.mcpb`/CHANGELOG shipped through v1.10.0.

Run it as:

```
/loop <paste the prompt block below>
```

(No interval → self-paced. For a durable cron that runs even when this session is closed, use `/schedule` with the same prompt — releases are infrequent, so a daily/12-hour cadence is plenty.)

---

## The prompt

```
Keep the raven-mcp marketing site (the `site/` directory → ravenmcp.ai, which Vercel
auto-deploys on push to main) in sync with what the product has actually shipped. This
is a DRIFT-CATCHER, not a redesign: only reflect shipped reality, never invent features.

Work from main, clean tree. First do the parallel-instance collision check (git fetch;
inspect origin/main) before any commit/push.

DETECT drift — compare SHIPPED state vs what the site SHOWS:
1. Version: `node -e "console.log(require('./package.json').version)"` and the latest tag
   (`git describe --tags --abbrev=0`) vs the top `<h2>vX.Y.Z</h2>` in site/changelog.html.
2. Released changelog: the newest dated `## [X.Y.Z]` section(s) in CHANGELOG.md vs the
   newest `<article class="release">` in site/changelog.html. Any released version present
   in CHANGELOG.md but missing from the site is drift.
3. Tools: the registered tool set (`grep -oE 'server\.tool\(\s*"[a-z_]+"' src/index.ts` →
   names; `grep -c 'server.tool(' src/index.ts` → count) vs:
     - the homepage tool-card list in site/index.html (each tool is a
       `<div class="tool-card ...">` with a `tool-name`/`tool-desc`),
     - every "N tools" string across the site
       (`grep -rn 'tools' site/*.html | grep -E '[0-9]+ tools'` — index.html og/twitter
       descriptions, design-system.html guard-item, docs.html intro),
     - the docs.html tool list + its "newer tools from vX–vY" version range.
   A registered tool absent from the homepage, or a stale count, is drift.

If NOTHING is out of sync: write nothing, log "site in sync — <date>", and stop.

RECONCILE (one pass, smallest correct edit, MATCH the existing markup/voice exactly —
copy a sibling element rather than inventing structure):
- Missing release article: add a new `<article class="release">` at the TOP of the release
  list in site/changelog.html (newest-first, immediately under the hero), mirroring the
  CHANGELOG.md entry — `<h2>vX.Y.Z</h2>`, the right `badge-major/minor/patch`, a
  `<time datetime=...>` of the tag date, an Added/Changed list, the Install block, and a
  `release-foot` link to github.com/rhinocap/raven-mcp/releases/tag/vX.Y.Z. Also mirror the
  same entry into CHANGELOG.md if a released version is somehow only in one of the two.
- Missing tool: add a `tool-card` to site/index.html in the matching group (audit tools
  next to the other `audit_*` cards, etc.), copying a sibling card's exact structure
  (icon SVG + `tool-name` + `tool-desc`); write a one-line desc grounded in the tool's real
  CHANGELOG description. Add it to the docs.html newer-tools list too.
- Stale counts/ranges: update every "N tools" string and any "vX–vY" version range to the
  current numbers, in ALL files that carry them (index.html ×2 meta, design-system.html,
  docs.html). Keep them identical across files.
- Do NOT edit historical/older changelog articles, layout, design tokens, or copy unrelated
  to the shipped delta.

GUARDRAILS:
- Reflect ONLY shipped reality — registered tools, the published npm version, dated
  CHANGELOG sections. Never fabricate a tool, version, date, or capability.
- PUBLIC-ARTIFACT voice: phrase everything as routine product changes. NEVER reference IP,
  employer, client, or license cleanup in any site copy, changelog, or commit message.
- Match the site's existing components/voice; use its tokens, not bare values; don't redesign.

VERIFY (mandatory before "done"):
- HTML still well-formed (the new article/card closes its tags; no orphaned divs).
- `npm run build` clean (catches an accidental src edit).
- Commit to main with a clear message (e.g. "site: sync to vX.Y.Z — add <tool>, bump tool
  count to N"), push origin main.
- After Vercel deploys, cache-bust the LIVE url and confirm the change is really there, e.g.
  `curl -s "https://ravenmcp.ai/changelog.html?cb=$RANDOM" | grep -o '<h2>v[0-9.]*</h2>' | head -1`
  must show the new version; for a tool, grep the live homepage for the tool name.
  Believe the live URL over local — re-run until it shows the change (Vercel deploy lag).

EXIT CONDITIONS:
- No drift → log "site in sync — <date>", exit. Never push without the live-URL verify above.
- One reconciliation pass per run. Do not chain. Report what synced (or that it was in sync)
  with the live ravenmcp.ai URL as the verification link.
```
