# Handoff → marketing site instance (2026-07-17)

**From:** install → harness → use lane (`site-audit-polish`, product/README only)  
**To:** instance owning **marketing site visual/UX** (`site/index.html`, `site/docs.html`, related site chrome)  
**Do not collide:** that lane owns all `site/*.html` edits. Product lane will not touch them.

Source audit: `conversations/2026-07-17-designer-mcp-journey-audit.md`  
Canonical tool count (runtime): **78 local** (`server.tool(` in `src/index.ts`), public remote **~45**, auth remote = Taste subset, **Grab local-only**. npm/package: **1.17.1**.

---

## Please ship on the marketing site

### 1. Tool-count honesty (P0 copy)
Replace every stale count with the real matrix:

| Claim to kill | Replace with |
|---------------|--------------|
| `70 tools` (hero subtitle, OG/Twitter meta, JSON-LD) | **78 tools** locally, or “78 local tools” |
| `90+ tools` (FAQ / JSON-LD) | **78 tools** locally |
| `95 tools` (`docs.html` tools intro ~L533) | **78 tools** locally |

Keep the remote split clear: public **~45** stateless; auth `/api/mcp-user` adds Taste; **Grab never remote**.

**Known leftover locations (verify with search):**
- `site/index.html` — OG/Twitter meta, hero `.subtitle`, FAQ answers, JSON-LD blocks (~L20, L31, L1952, L1981, L2005, L2067, L3438, L3450)
- `site/docs.html` — tools intro claiming **95 tools** (~L533)

### 2. mcpb badge version (P1)
- Download card still shows **v1.17.0** in places; package is **1.17.1**.
- Align badge/chrome with `package.json` / mcpb manifest (generator preferred so this stops drifting).

### 3. Hero / CTA install honesty (P0 journey)
- Hero still reads like “one install / Claude-only” while naming Cursor.
- Keep (or strengthen) **Install in Cursor →** → `#quickstart` with **local vs remote** called out.
- Do **not** imply Grab or full Taste on public remote.
- CTA footer “Zero runtime dependencies” is false (Playwright for URL audits; Node 18+ for stdio; OAuth for full remote Taste) — soften or qualify.

### 4. Grab marketing (P1)
- Never present Grab as universal across Claude/Cursor/remote.
- Docs already say Grab is local-only in the Cursor remote section — keep that; make homepage/FAQ match.

### 5. Durable domain (P2, if in your lane)
- `ravenmcp.ai/api/mcp` → **404**; real host is `mcp.ravenmcp.ai`. Don’t link the bare apex API path.

### 6. Already partly done on `docs.html` (don’t regress)
Cursor local + remote sections and Codex pointer were added in product commit `546298a`. Preserve those install paths; only fix counts/versions/CTA honesty above.

---

## Out of scope for marketing (product lane owns)

- Taste `first_run` / templates / `score_page` url / Grab path-optional / audit noise / Grab queue drain
- README install matrix (updated to 78 + dual-Raven + Grab local-only)
- Shipping Grab on Cursor remote (product/infra — not site copy)

## Product truth for copywriters

```
Local stdio: 78 tools, Taste yes, Grab yes
Public remote /api/mcp: ~45 tools, Taste no, Grab no
Auth remote /api/mcp-user: Taste yes, Grab no
mcpb / npm: 1.17.1
```
