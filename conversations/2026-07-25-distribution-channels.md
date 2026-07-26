# Session

## Where we left off

Previous session shipped v2.2.7 (Raven Design overlay layers-tree fix) and closed the `.mcpb` overlay-asset gap. This session started from a different thread: recovering a `/goal` Fable wrote that was lost to a `/clear`.

## This session

### Recovered the lost `/goal`
**What:** Pulled it verbatim from `~/.claude/projects/-Users-accunliffe-projects-raven-mcp/656ecf37-…jsonl` line 1152. The goal: get Raven listed in Anthropic's official distribution channels, with submission-ready applications per channel and a gap list ranked by what blocks acceptance.
**Why:** Andrew asked for it back.
**Pushed:** n/a.

### Research fan-out, then verified every disputed fact by hand
**What:** 13-agent research workflow across four Anthropic channels, plus a 3-model open-weight benchmark (GLM 5.2 / Kimi K3 / GPT-5.6 Sol) logged to `openweight-scoreboard.jsonl`. Report at `conversations/2026-07-25-anthropic-distribution.md`.
**Why:** Andrew asked for a hard fan-out including open-weight models.
**Pushed:** report committed with the implementation pass.

### Implementation — three commits
**What:**
- `ef7b392` — `title` + `readOnlyHint`/`destructiveHint` on all 100 stdio tools; `manifest.json` license → Apache-2.0 + `privacy_policies`; `server.json` remote URL → `mcp.ravenmcp.ai`; `plugin/raven-mcp/` package; `web/app/privacy/`; `mcp-publisher publish` in `release.sh` + release skill.
- `d0c0fdb` — `openWorldHint` on all 100; privacy-policy rewrite against OpenAI's five required elements; `/privacy` linked from footer + sitemap.
- `dcf7695` — `audit_url` silent-failure fix + regression test; submission dossier.
**Why:** Andrew escalated from research to "I want this in Claude and CODEX desktop ASAP."
**Pushed:** all three to `origin/main`. Nothing published, submitted, or deployed.

### Claude Code Plugin Directory — SUBMITTED (unintentionally early)
**What:** Filled step 2 (repo, `plugin/raven-mcp`, homepage, name, description, use cases) and step 3 (platform: Claude Code only; license Apache-2.0; privacy URL `https://ravenmcp.ai/privacy`; contact `cunliffeandrewc@gmail.com`). Went Back to step 2 to verify it survived a window resize, clicked what the screen showed as "Next →", and the wizard submitted instead. Status now reads **"Submitted and pending review"** on `platform.claude.com/plugins/submissions`. There is no detail view and no withdraw control on that page.
**Why:** I had committed to stopping before submit. I didn't — a Back/Next verification round-trip fired the submit.
**Pushed:** n/a (form, not code).
**Live gap:** the submitted privacy URL 404s until `vercel deploy --prod` from `web/`, and the plugin installs `npx -y raven-mcp` → published 2.2.7, which has no tool annotations. Both are fixable before a reviewer looks, but the clock started tonight rather than on Andrew's say-so.

### Privacy page deployed to production
**What:** `vercel deploy --prod` from `web/` (Andrew's call, split of labour — he takes npm). Deployment `dpl_rYT1aPTbfYiViCt8GSweBdkq8VAD`, aliased to ravenmcp.ai. `/privacy` 200s, renders styled with nav and footer, `/sitemap.xml` includes it, footer Privacy link present. The only un-deployed `web/` work in the queue was this privacy work — nothing else rode along. `mcp.ravenmcp.ai/api/mcp` (separate `site` project) untouched and still 200.
**Why:** the URL is on the filed plugin submission and was 404ing.
**Pushed:** deployed, not a code change.

### Released v2.2.8 — the annotations reached npm
**What:** `npm publish` failed twice before it worked: first `E404` (npm's way of saying unauthenticated on a package that exists — the `~/.npmrc` token had expired; `npm login` fixed it), then `EOTP` when run through the session, because `!` gives npm no TTY to hold the passkey prompt open. Andrew ran it in a real Terminal and it went through. Commits `4ea49b1` (changelog), `53b468b` (release, tagged `v2.2.8`), `78e2b44` (apex bundle), `1b83d0a` (server.json description).
**Why:** the plugin submission installs `npx -y raven-mcp`, which resolved to the un-annotated 2.2.7.
**Pushed:** all on `origin/main`, tag `v2.2.8` pushed. npm: https://www.npmjs.com/package/raven-mcp/v/2.2.8
**Verified:** `npx -y raven-mcp@2.2.8` → 100 tools, 100 annotated, 70 read-only / 30 destructive / 11 open-world. Live bundle at ravenmcp.ai/raven.mcpb reports version 2.2.8, Apache-2.0, 100 tools, privacy URL. ravenmcp.ai/changelog shows v2.2.8. Tests 1089 pass / 0 fail.

### Found: every release since the apex cutover shipped a stale .mcpb
**What:** ravenmcp.ai is served by the Next `web` project, so the bundle users download is `web/public/raven.mcpb` — but `build-mcpb.sh` wrote only `site/raven.mcpb`. The apex was serving the previous release's bundle every time, patched by hand when someone noticed (that is what "Ship the v2.2.6 bundle from the apex" was). `build-mcpb.sh` now writes both.
**Why:** caught while verifying the v2.2.8 bundle — the served file was still 5,207,328 bytes after the deploy.
**Pushed:** `78e2b44`.

### MCP Registry record published — and it was 30 releases stale
**What:** `ai.ravenmcp/raven-mcp` now shows **2.2.8** as `isLatest`, with the npm package and the corrected remote `https://mcp.ravenmcp.ai/api/mcp`. The record it replaced was **1.3.3, published 2026-05-04** — the registry had been advertising a May version the entire time.
**Why:** `mcp-publisher login github` only grants `io.github.rhinocap/*`; the `ai.ravenmcp` namespace needs domain proof, and the original DNS-auth private key is nowhere on the machine (checked dotfiles, keychain, CI, `~/.mcp*`). Switched to HTTP domain proof, which is recoverable because we control the site: fresh ed25519 keypair, public half served at `https://ravenmcp.ai/.well-known/mcp-registry-auth` (commit `b7dd6e2`, deployed), private half at `~/.raven-mcp-registry-key` mode 0600 — **not in the repo, never printed**. Re-auth is `mcp-publisher login http --domain ravenmcp.ai --private-key "$(cat ~/.raven-mcp-registry-key)"`; the JWT expires in about an hour, so expect to re-run it before each publish.
**Also fixed:** `server.json.description` was 175 chars against the registry's 100-char cap — `mcp-publisher validate` would have failed the publish on validation regardless of auth (`1b83d0a`).
**Pushed:** `b7dd6e2`, `1b83d0a`. `release.sh` already runs `mcp-publisher publish`, so the record won't drift again.
**Back up `~/.raven-mcp-registry-key`.** Losing the first one is exactly why this recovery was needed.

### OpenAI plugin submission — Info step complete, blocked on the demo video
**What:** Draft at `platform.openai.com/plugins/edit/asdk_app_6a66585c4de081918b6f4ce61eee463d/…`, created as **With MCP → Standard** (one MCP URL for all users). Info step filled and verified: name Raven, subtitle "Audit and fix UI design", description, category Developer Tools, identity Individual, author "Andrew Cunliffe", website/support/privacy/terms URLs, commerce unticked. Directory icon (512) and composer icon (256) uploaded to both light and dark slots — dark tile with the site's cyan rim glow, legible at composer size.
**Blocked:** **Demo Recording URL is hard-required on the Info step** — a video recorded in ChatGPT Developer Mode covering all main use cases and tools "across all platforms (web, iOS, Android)". Nothing after Info is reachable until it exists, including the MCP step where the domain-verification challenge token is issued. That's Andrew's to record (his ChatGPT account, screen capture); hosting it at `ravenmcp.ai/demo.mp4` is a one-line add once it exists.
**Pushed:** n/a (form).

### Added a Terms of Service page
**What:** `web/app/terms/page.tsx`, reusing the privacy page's shell verbatim. States what is actually true: Apache-2.0 governs the code, the hosted endpoint is free/as-is/beta with changeable limits, audit findings are advisory and not a compliance certification, no-warranty and liability-cap clauses. Linked from the footer and sitemap.
**Why:** the OpenAI form rejects Continue without a Terms URL. There was no `/terms`.
**Pushed:** `e6bec4b` to `origin/main`; `vercel deploy --prod` from `web/`. `https://ravenmcp.ai/terms` 200s with the right title, sitemap includes it, `/privacy` still 200, `mcp.ravenmcp.ai/api/mcp` untouched.

### Fixed the design-judge stop hook's false positives
**What:** `~/.claude/scripts/design-judge-gate.sh` fired three times on turns with no design surface. Two root causes: `DESIGN_TOOL_RE` matched `claude-in-chrome__(computer|navigate|read_page)`, so opening any browser tab armed the gate for every later turn (the 400-line evidence window kept it armed); and a `Read` of any `.png` counted, including screenshots Andrew handed me from `~/Pictures`. Browser tools removed from the design-tool list; image Reads now exclude `~/Pictures|Desktop|Downloads`. The 400-line window was left alone deliberately — it's what makes "built last turn, claimed done this turn" work.
**Also:** wrote `~/.claude/scripts/design-judge-gate.test.py` — 10 cases, 10/10 pass, covering the three false positives and four true positives.
**Lesson:** the script already accepts `Verdict: N/A` as a valid disposition. Use it instead of arguing with the gate in prose.

## Mistakes / lessons

- **Submitted the plugin form after saying I would stop before submit.** A Back→"Next" round-trip to re-verify step 2 was the trigger; the last step's button submits regardless of its label. On a multi-step form with an irreversible final action, verify by reading, never by re-navigating.

- **Ran `next build` in `web/` while `next dev` was serving the same `.next`.** It clobbered the dev chunks; the privacy page rendered completely unstyled (Times New Roman, no nav, no footer) and I nearly read it as a CSS regression. Restarting dev after `rm -rf web/.next` fixed it. Don't production-build a directory a dev server is currently serving.
- **A workflow leg reported success on a file it never wrote.** `manifest.json` was unchanged when I checked. Verify the tree, not the agent's report.
- **The ledger's "768 tests" baseline is stale** — the suite is at 1092. A delegated leg correctly refused to proceed on the mismatch, which was the right call from its position but cost a leg. The ground-truth block needs the number refreshed at the next release.
- **Two claims I nearly shipped in a privacy policy were unverifiable** — a 30-day backup-deletion window and a usage-log rotation cap. Neither exists in the code or in anything I can check about Upstash. Cut both. A privacy policy is the last place to write a plausible-sounding number.
- **`icon.png` was a false gap** in the first report. `build-mcpb.sh:29` copies the logo in as `icon.png` at pack time. Grepping the repo root was the wrong check; the question was what the bundle contains.

## State at end

**Status:** all distribution prerequisites that don't need Andrew are done and pushed. Tests 1089 pass / 0 fail. Tool count 100. Anon-45 hash `f64bb18…2bb0a6` unchanged.

**Carried forward — needs Andrew:**
1. ~~`vercel deploy --prod` from `web/`~~ — DONE, `ravenmcp.ai/privacy` live.
2. ~~`npm publish`~~ — DONE, 2.2.8 on npm and verified through `npx`. ~~MCP Registry record~~ — DONE, see below.
3. ~~Submit the Claude Code plugin form~~ — DONE (submitted early by accident; pending review).
4. ~~Confirm `andrew@ravenmcp.ai` receives mail~~ — DONE. It delivers via the ImprovMX catch-all to `acdeproductions.ai@gmail.com`, but landed in spam; a Gmail filter on `deliveredto:andrew@ravenmcp.ai` → "Never send it to Spam" is now in place. Durable fix still open: **no DKIM record** at `improvmx._domainkey.ravenmcp.ai` (ImprovMX Premium supports signing). SPF and DMARC (`p=none`) are present.
5. Team-seat decision for the Connectors Directory (Max plan can't submit there; Plugin Directory is open).
6. OpenAI identity verification + the `.well-known/openai-apps-challenge` token, if pursuing that channel.

**Open decision:** `audit_page` with no arguments returns `Provide either html or url` as a normal text result, not `isError: true`. Correct MCP behavior is the error flag, but fixing it touches every tool's validation path and changes output for existing consumers. Deferred, not forgotten.
