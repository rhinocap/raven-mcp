# Raven MCP — Designer journey audit (2026-07-17)

Walked the full path as a designer connecting Raven to a coding harness, then using it on a real product surface. Evidence from live configs, live tool calls, site/docs, and Cursor/Claude/Codex installs on this machine.

**Verdict:** Raven’s *capability* is deep. The *product journey* fractures across harnesses, over-promises “one install,” then dumps a 95-tool / 39-question wall before first useful design judgment. Highest-leverage fixes are install honesty, harness-specific first-run, interview compression, and audit noise control — not more tools.

---

## Journey map (designer lens)

```
Discover site → Pick harness → Connect MCP → First prompt → Calibrate? → Audit product → Iterate (Grab / taste / fix)
```

| Stage | What “good” feels like | What actually happens |
|------|------------------------|------------------------|
| Discover | One clear “get Raven in my agent” | Hero CTA is Claude Code only; Cursor named but not installed |
| Connect | Same Raven everywhere | Local stdio ≠ remote no-auth ≠ remote OAuth — different tool sets |
| First value | Audit or build with taste in &lt;2 min | Kickoff interview is a blocking gate; 58KB / 39 questions |
| On product | Actionable ranked findings | Letter-split contrast spam; heuristic false positives; huge payloads |
| Iterate | Click → change → agent | Grab missing on Cursor remote; requires DESIGN.md path; HTTPS+local blocked |

---

## P0 — breaks trust or blocks first value

### 1. “Works with Cursor” is not the install path you ship
- Hero / FAQ / CTA copy: `claude mcp add raven -- npx -y raven-mcp` only.
- Docs subtitle: “Claude Code, Claude Desktop, or any MCP-compatible client” — Cursor gets a shrug paragraph, no URL, no `mcp.json` snippet, no OAuth steps.
- This machine’s Cursor config points at `https://mcp.ravenmcp.ai/api/mcp-user` (OAuth via **staging** AuthKit `artistic-gold-76-staging.authkit.app`). Unauthenticated → **401**.
- Public no-auth `https://mcp.ravenmcp.ai/api/mcp` works (v**1.16.0**, **45** tools) but has **no** taste, **no** grab, **no** creative local store.
- Marketing: “70 tools… Claude, Cursor, or any MCP client.” Cursor remote today ≈ 45–56 tools and a different product.

**Designer read:** “Cursor works” means “paste Claude’s command and fail,” or “OAuth to staging and get a subset.”

### 2. Harness roulette — three Ravens, three products
| Client | How connected | Tools | Taste | Grab | Notes |
|--------|---------------|-------|-------|------|-------|
| Claude Code | Local `dist/index.js` **+** `claude.ai Raven MCP` remote | 95 local + remote | Yes (local) | Yes (local) | **Dual Raven** listed — ambiguous which agent uses |
| Cursor | Remote `mcp-user` (OAuth) | **56** | Yes | **No** | No `start_grab_session` / design.md tools |
| Codex | Local `dist` | ~75 after disables | Yes | Yes | **34** tools `approval_mode=approve`; creative/service tools disabled |
| Public remote `/api/mcp` | No auth | **45** | No | No | Browser audits yes; taste no |
| `ravenmcp.ai/api/mcp` | — | — | — | — | **404** (durable-domain cutover still open) |

**Designer read:** Same brand, different powers. Grab and taste — the two designer-native loops — disappear depending on how you connected.

### 3. Taste kickoff is a wall, then polluted
- Server instructions: interview is a **blocking gate** before any design work.
- Live `get_taste_interview(profile:'andrew', project:'friction-audit-demo')`: **58,140 bytes**, **39 questions**.
- Only ~12 are core design dimensions; **~20+ are learned leftovers** (`thermal-diagram`, `grab-layers-panel`, `design-judge`, `atmosphere-orbs`, duplicate `thermal_workflow` / `thermal-workflow`, etc.).
- Cold start: no profile → `Taste profile not found`. `create_taste_profile` expects hand-authored rule objects — not a designer-friendly “start from defaults / DESIGN.md / interview.”
- Instructions still push **Next.js by default** inside a taste interview — weird for a designer who asked for a brand site, Framer, or native.

**Designer read:** First session feels like onboarding to *Andrew’s past projects*, not *this* product.

### 4. Product audit noise destroys trust
- `audit_url(https://andrewcunliffe.com, compact:true)` → **~175KB**, **~40s**, findings that fail **single letters** (“A”, “N”) at 1.07:1 — motion-split / logo glyph false positives.
- Own marketing site `audit_page(url: ravenmcp.ai)` → error on `font-size:11px`; warnings for no `flex-wrap` and no `1200px` max-width — generic heuristics that don’t match intentional full-bleed layouts.
- Compact `audit_url` on ravenmcp.ai (1 viewport): 4 findings, all `inconclusive` — agent still has to explain “inconclusive” to a designer who wanted a pass/fail.

**Designer read:** Raven cries wolf on craft surfaces and under-explains confidence.

---

## P1 — high friction once connected

### 5. Tool surface overload + inconsistent APIs
- Live local tool count: **95** (not 70, not docs’ **56**).
- `score_page` requires `html` only — **no `url`**, unlike `audit_page` / `audit_url`. Agent (and designer prompts) trip on this.
- `start_grab_session` requires `path` (DESIGN.md) even when only `proxy_target` is set — can’t “just overlay my localhost” without inventing a file.
- `search_knowledge("landing page hero hierarchy")` → **86** hits / **29KB**; top results are keyboard nav / screen reader / motion — relevance failure.

### 6. Grab loop incomplete on the path designers actually use
- Cursor remote: Grab tools **absent**.
- Local Grab: works, but returns a dense payload (`watch_command` shell loop, team GitHub routing prose). Easy for agents to paste the raw server URL instead of the bridge URL (instructions fight this; reality depends on client honoring server instructions — Cursor remote **truncates** Grab section out of instructions entirely).
- Known Grab QA (Jul 16): HTTPS page + local HTTP inject blocked (F1); utility-class “All N like this” (F4); layer archaeology (F7/U4). Several fixed in-repo; **F1 remains a product/docs hole**.

### 7. Version / packaging drift
| Surface | Version seen |
|---------|----------------|
| npm `raven-mcp` | **1.17.1** |
| Local package / dist banner | **1.17.0** |
| Public remote `mcp.ravenmcp.ai/api/mcp` | **1.16.0** |
| Site `.mcpb` download card | **v1.1.1** (stale chrome) |
| Manifest inside mcpb | tracks package line (~1.17) |

**Designer read:** “Did I install the right Raven?” — no single source of truth.

### 8. Codex approval tax
- 34 Raven tools set to `approval_mode = "approve"` — every audit becomes a click-through ritual.
- Creative studio + service-design tools disabled entirely — Codex users never see that half of the product.

---

## P2 — polish / honesty gaps

### 9. Docs lag the product
- Docs: “56 tools across 9 layers”; “original 13 tools have full docs.”
- Site: “70 tools.”
- Runtime: 95 local / 45–56 remote.
- No designer-oriented “day 1” path: *connect → one audit → one taste bind → one grab*.

### 10. Dual Claude Code Raven
- `claude mcp list`: both `claude.ai Raven MCP` and local `raven` **Connected**.
- Unclear which tools win, whether taste is local or remote, or why both exist.

### 11. Server instructions are a novel
- ~5KB instructions: kickoff gate + refine + learning loop + build_hints + Grab auto-start.
- Clients that truncate or ignore instructions (many) skip the intended ritual; clients that obey literally block the user with a 39-question interview before “audit this page.”

### 12. False “zero runtime dependencies”
- Site CTA footer claims zero runtime deps; URL audits need Playwright Chromium; remote needs OAuth for full taste; Node 18+ for stdio.

---

## What works (keep / amplify)

- **Claude Code one-liner** and Desktop `.mcpb` for non-terminal designers — best first mile.
- **Checklist / pattern tools** — small, actionable (`get_checklist` ~1.4KB).
- **Static `audit_page(html)`** — fast, clear structure/a11y errors.
- **Taste engine concept** — portable judgment is the right product bet; execution needs a thin first-run.
- **Grab intent** — click-to-change is the right designer loop when local stdio is available.

---

## Recommended fix ladder (design-first)

1. **Install matrix on site + docs** — Claude Code / Desktop mcpb / Cursor (stdio + remote URL + OAuth) / Codex — with honest tool counts per path.
2. **One product per install** — don’t dual-register local+remote; or label “Raven (local full)” vs “Raven (cloud lite).”
3. **First-run: 4 core questions max** — identity, aesthetic family, voice pick-by-ear, hosts. Park learned dimensions behind “more” / refine. Cap interview payload.
4. **Cold-start profile** — `create_taste_profile` from template (“portfolio”, “saas marketing”, “app”) or DESIGN.md import; never dead-end on missing profile.
5. **Audit confidence UX** — collapse glyph/split-text contrast; demote layout heuristics that don’t apply to full-bleed heroes; default compact + top-N by severity for agents.
6. **Unify tool contracts** — `score_page` accepts `url`; Grab `path` optional when `proxy_target` set.
7. **Ship Grab to Cursor** or stop marketing Grab as universal.
8. **Align versions** — site mcpb badge, npm, remote deploy, README tool counts from one generator.

---

## Evidence appendix (this session)

- `claude mcp list` — dual Raven + local connected.
- `~/.cursor/mcp.json` — remote `mcp-user` only.
- Live stdio: 95 tools; interview 39Q / 58KB; search 86 hits; portfolio `audit_url` ~175KB / 40s.
- Public remote: initialize 200, v1.16.0, 45 tools, no taste/grab.
- `ravenmcp.ai/api/mcp` → 404.
- OAuth resource metadata points at AuthKit **staging**.

---

## Customer lens (for follow-on work)

```
- I am a staff product designer using Claude Code / Cursor to ship UI with an agent
- I am trying to connect Raven once and get trustworthy design judgment on my product
- But install paths disagree, tools disappear, and the first session is an interview + noisy audit
- Because remote/local/product docs drifted and kickoff wasn’t designed for a new surface
- Which makes me feel like the product is for its author, not for me
```
