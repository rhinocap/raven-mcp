# Getting Raven listed in Anthropic's distribution channels

Research + drafted submission artifacts + ranked gap list. 13-agent fan-out (5 channel research legs, 5 drafting legs, 2 adverse, 1 completeness) plus an open-weight benchmark leg. Every process claim below carries the source URL it came from; every repo/network fact in the verification table was re-run firsthand in the main session after the adverse pass flagged the research legs for over-attribution.

**Nothing here has been submitted or published.** All artifacts are drafts for Andrew.

---

## 1. Verified firsthand (2026-07-24, main session)

The adverse leg was right to distrust the research legs on facts — one channel claimed the remote endpoint was live at `ravenmcp.ai/api/mcp` while another said the same URL was 404. Resolved by running it:

| Claim | Command | Result |
|---|---|---|
| Remote endpoint host | `POST https://ravenmcp.ai/api/mcp` | **404** |
| Remote endpoint host | `POST https://mcp.ravenmcp.ai/api/mcp` | **200**, real `tools/list` |
| OAuth 401 handshake | `POST .../api/mcp-user` | **401** + `www-authenticate: Bearer resource_metadata="https://mcp.ravenmcp.ai/.well-known/oauth-protected-resource/api/mcp-user"` — correct |
| Privacy / terms page | `GET ravenmcp.ai/{privacy,privacy-policy,terms,legal}` | **404 on all four** |
| Tool annotations | `grep -rE 'readOnlyHint\|destructiveHint' src/` | **zero matches** across ~100 tools |
| `manifest.json` license | read | **`"MIT"`** — repo LICENSE and package.json are Apache-2.0 |
| `manifest.json` icon | `ls icon.png` | **missing** — manifest references `icon.png`, no such file at repo root |
| `server.json` remotes URL | read | **`https://ravenmcp.ai/api/mcp`** — the host that 404s |
| Live MCP registry record | `GET registry.../v0/servers?search=raven` | **`ai.ravenmcp/raven-mcp` @ 1.3.3**, `remotes: none` |
| `clau.de/desktop-extention-submission` | `curl -I` | **302 → the Google Form.** The misspelling is real, not a hallucination. (`.../desktop-extension-submission` with correct spelling → claude.ai) |

Two of those are outright bugs in the repo today, independent of any submission: **`server.json` points the registry at a dead host**, and **`manifest.json` claims the wrong license**.

---

## 2. Ranked gap list — what actually blocks acceptance

Ranked by channels unblocked per unit of effort.

| # | Gap | Blocks | Effort | Note |
|---|---|---|---|---|
| 1 | **No privacy policy page** | Connectors directory, Desktop extensions | S — one static page | Docs name a missing/incomplete privacy policy as an **immediate rejection**. Copy drafted in §5. |
| 2 | **Zero tool annotations** (`title` + `readOnlyHint`/`destructiveHint`) | Connectors directory, Desktop extensions | M — classify ~100 tools | Hard requirement per review-criteria. **Unresolved risk:** these live in the shared tool-definition source feeding stdio too — must be proven not to change stdio output before it lands (frozen invariant). |
| 3 | **`server.json` remotes URL is dead** | MCP registry, and any listing that copies it | XS — one field | `ravenmcp.ai/api/mcp` → `mcp.ravenmcp.ai/api/mcp`. |
| 4 | **Registry record stale at 1.3.3, no `remotes[]`** | MCP registry | S — one publish | 30+ versions of drift; the hosted endpoint is invisible to registry consumers. Fully self-serve — cheapest win available. |
| 5 | **Claude.ai org tier unknown** | Connectors directory, plugins | Andrew, 2 min | The submission portal lives at `claude.ai/admin-settings/directory/submissions/new` and requires **Team or Enterprise with Directory management**. Individual/Pro/Max cannot submit. Nothing else in that channel matters until this is answered. |
| 6 | **`manifest.json` license says MIT** | Desktop extensions | XS | Metadata contradicting LICENSE is the sort of thing an automated scan catches. |
| 7 | **No `icon.png` at repo root** | Desktop extensions, connectors directory | XS–S | Manifest references a file that doesn't exist. 512×512 PNG with transparency. |
| 8 | **No reviewer test account** | Connectors directory | S | Test & launch step wants a seeded AuthKit user with real taste data so every tool returns something. |
| 9 | **No `plugin/` package** | Claude Code plugins | S — 2 JSON files | Drafted in §6, doesn't exist in repo yet. |

Items 1, 2, 6, 7 are all things you'd want fixed anyway. Items 3 and 4 are the ones I'd do first — they're bugs, not submissions.

---

## 3. Channel: Claude connectors directory (claude.ai/directory)

**Viability: unconfirmed** — gated entirely on org tier.

**Process** ([submission guide](https://claude.com/docs/connectors/building/submission)): a 10-step in-app wizard at `claude.ai/admin-settings/directory/submissions/new`, not a public web form. Introduction → Connection → Tools (auto-synced from your server, flags annotation gaps here) → Listing → Use cases → Company → Authentication → Data handling → Test & launch → Compliance (7 acknowledgments) → Review. Status tracked at `claude.ai/admin-settings/directory/submissions`; escalation via `mcp-review@anthropic.com`. Submissions are auto-scanned and listed by default as a **community connector**; Anthropic escalates high-usage listings to a higher-touch verified review on its own.

**Requirements that bear on us:**
- HTTPS, streamable HTTP or SSE transport. ✅ we're compliant.
- Every tool needs `title` + `readOnlyHint` or `destructiveHint` ([review criteria](https://claude.com/docs/connectors/building/review-criteria)). ❌ gap #2.
- No catch-all tool mixing read and write semantics; tool names ≤64 chars; descriptions must not pull instructions from external sources or contain hidden instructions (prompt-injection rejection). *Not audited this pass — worth a dedicated grep before submitting.*
- OAuth: `oauth_dcr` (RFC 7591 DCR) and `oauth_cimd` supported out of the box; pure `client_credentials` is not supported ([auth doc](https://claude.com/docs/connectors/building/authentication)). AuthKit already exposes a `registration_endpoint`, advertises S256, and the 401 handshake is correct — ✅ verified above.
- Privacy policy URL required in the Listing step; missing = immediate rejection. ❌ gap #1.
- Test & launch requires reviewer credentials + confirmation every tool was exercised via MCP Inspector or as a custom connector. ❌ gap #8.
- **Rejected outright:** financial-asset transfer, and AI-generated image/video/audio tools. Design tools producing diagrams/charts/mockups are **explicitly exempted** — but Raven's creative-orchestration surface (`create_generation_job`, `score_creative`, `plan_creative_campaign`, `register_creative_asset`) sits near that line, and `manifest.json`'s own description leads with "creative orchestration." GPT-5.6 Sol independently flagged this against the [directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy) as the most likely rejection cause. **Recommendation: submit the design-audit / design-system / taste surface, not the full 100 tools, and drop generation language from the listing copy.**

**Which endpoint to submit:** `mcp.ravenmcp.ai/api/mcp-user` (authenticated, unlocks the Taste Engine), not the frozen anonymous `/api/mcp`. Directory review touches neither the 45-tool surface nor its golden hash.

**Unconfirmed:** rate-limit requirements (none stated on any fetched page); icon dimension spec (likely surfaced inside the portal UI); whether the grab overlay counts as an "MCP App" (which would add a 3–5 PNG carousel requirement, ≥1000px, cropped to the app response). Contact path for all three: `mcp-review@anthropic.com`.

**Artifact:** portal answers drafted below (§5) — everything fillable today, with the blocked fields marked.

---

## 4. Channel: Desktop extensions (.mcpb)

**Viability: yes**, self-serve. Submission is a Google Form reached via `https://clau.de/desktop-extention-submission` (verified live 302 → `docs.google.com/forms/d/e/1FAIpQLScHtjkiCNjpqnWtFLIQStChXlvVcvX8NPXkMfjtYPDPymgang/viewform`). The form's own field list couldn't be read — it's behind a Google auth wall (401). Andrew opening it signed-in is the only way to see it.

**Our state:** `manifest_version 0.3`, v2.2.7, 100 tools, 5.0M bundle. Gaps: license says MIT (#6), no `privacy_policies[]` array and no hosted privacy URL to put in it (#1), no tool annotations (#2), no `icon.png` (#7).

**Signing:** the `mcpb` CLI has `sign`/`verify` and we don't use them. No official page states whether signing is required, weighted, or irrelevant for directory review — genuinely unconfirmed, contact path `mcp-review@anthropic.com`. Don't spend on a cert before asking. `mcpb sign --self-signed` is free if you want it in the bundle regardless.

---

## 5. Channel: MCP registry — do this one first

**Viability: yes, fully self-serve, already claimed.** `ai.ravenmcp/raven-mcp` is live but stuck at **v1.3.3 (2026-05-04)** with **no `remotes[]`** — so anyone discovering Raven through the registry today gets a 30-version-old npm pointer and no idea the hosted endpoint exists.

**Root cause:** `mcp-publisher` isn't installed and no registry-publish step exists in `scripts/release.sh` or the release skill. The drift is the missing automation, not a one-time miss — worth adding to the release runbook so it can't recur.

**Runbook:**
```bash
# 1. FIX FIRST — server.json remotes[0].url currently points at a 404 host
#    "https://ravenmcp.ai/api/mcp"  ->  "https://mcp.ravenmcp.ai/api/mcp"

# 2. install
brew install mcp-publisher   # fallback: release binary from github.com/modelcontextprotocol/registry/releases

# 3. auth — ai.ravenmcp is a domain namespace, so DNS/HTTP proof, not GitHub login
mcp-publisher login dns      # fallback: mcp-publisher login http

# 4. publish
mcp-publisher publish
```
Which verification method originally claimed the namespace isn't recorded anywhere in the repo — if `login dns` fails, that's why.

**Load-bearing unknown:** whether Anthropic's connectors directory or Desktop extension directory source listings from this registry **at all**. No official page found saying either way, and the desktop-extension path is a separate manual Google Form — which is evidence they don't. Both open-weight models ranked the registry #1 on the assumption that it feeds the others; Sol ranked it #3 precisely because registry presence creates no Claude install path on its own. **Sol is more likely right.** Do the registry publish because it's a 20-minute self-serve fix to a live bug, not because it's a path into Claude.

---

## 6. Channel: Claude Code plugin marketplace

**Viability: yes.** Submission is an in-app/auth-gated form (`platform.claude.com/plugins/submit` / `claude.ai/admin-settings/directory/submissions/plugins/new`), not a PR. Community plugins get automated safety screening and appear in the official marketplace. Screening criteria are **not publicly documented** — unconfirmed whether tools that fetch arbitrary URLs (`audit_url`, `audit_page`) draw extra scrutiny.

Nothing exists in the repo yet. Drafted package:

**`plugin/raven-mcp/.claude-plugin/plugin.json`**
```json
{
  "name": "raven-mcp",
  "displayName": "Raven",
  "description": "Design-intelligence MCP server: audits pages, screens, and diffs for contrast, layout, tap targets, and consistency; carries a design system and a taste profile an agent can consult before writing UI code.",
  "version": "2.2.7",
  "author": { "name": "Andrew Cunliffe", "url": "https://ravenmcp.ai" },
  "homepage": "https://ravenmcp.ai",
  "repository": "https://github.com/rhinocap/raven-mcp",
  "license": "Apache-2.0",
  "keywords": ["design", "design-system", "accessibility", "audit", "ui", "taste"]
}
```

**`plugin/raven-mcp/.mcp.json`** — stdio route (full 100 tools, no OAuth dance, uses the existing npm bin):
```json
{ "mcpServers": { "raven-mcp": { "command": "npx", "args": ["-y", "raven-mcp"] } } }
```
Remote variant if you'd rather ship the hosted surface: `{"mcpServers":{"raven-mcp":{"type":"http","url":"https://mcp.ravenmcp.ai/api/mcp"}}}` — but whether that OAuth flow works cleanly from inside a plugin install (vs claude.ai's connector UI) is untested. Test with `--plugin-dir` before choosing it.

Validate before submitting: `claude plugin validate ./plugin/raven-mcp --strict`, then smoke-test via a throwaway local marketplace and `/plugin install raven-mcp@local`.

---

## 7. Drafted artifacts

### 7a. Privacy policy page copy (unblocks gaps #1 — needed at `https://ravenmcp.ai/privacy`)

> **What Raven collects.** Raven runs locally as an MCP server on your machine. It reads what you point it at — a URL, a screenshot, a DESIGN.md — and returns design findings. It writes an anonymous local usage log (which tools ran, how often, whether they succeeded) to your own machine. Nothing in that log is transmitted. `RAVEN_NO_USAGE_LOG=1` turns it off.
>
> **What Raven does not collect.** Your source code, design files, and screenshots never leave your machine, except when a tool you invoked explicitly fetches something — an audit of a URL you passed, or a generation tool calling a provider you configured with your own API key. Those calls go from your machine to that provider directly. Raven does not proxy or store them.
>
> **Taste Engine data.** Taste profiles and decisions are stored locally at `~/.raven/taste`. If you connect to the hosted endpoint at `mcp.ravenmcp.ai`, your taste data is stored per-user, keyed to your OAuth identity (WorkOS AuthKit for sign-in, Upstash Redis for storage). Delete it any time with `delete_taste_data`, which removes the server-side record as well.
>
> **Third-party sharing.** None beyond the explicit calls above that you initiate.
>
> **Retention.** Local data persists until you delete it or uninstall. Hosted data persists until you delete it.
>
> **Contact.** andrew@ravenmcp.ai — or open an issue at github.com/rhinocap/raven-mcp/issues.

Publish as a `web/app/privacy/page.tsx` route (the Next.js `web` project is the live site), then add to `manifest.json`:
```json
"privacy_policies": ["https://ravenmcp.ai/privacy"],
"license": "Apache-2.0",
```

### 7b. Connectors directory — portal answers

- **Step 2 Connection** — Server URL `https://mcp.ravenmcp.ai/api/mcp-user`, transport Streamable HTTP.
- **Step 4 Listing**
  - Name: `Raven`
  - Tagline (≤55): `Design intelligence for coding agents`
  - Description: *Raven audits pages, screens, and screenshots for contrast, layout, typography, tap targets, and consistency, and returns findings a coding agent can act on — a contrast ratio that fails WCAG, a tap target under 44px, a spacing value that doesn't match your scale, with the element it belongs to. It also holds a design system layer (tokens, patterns, brand and content principles) and a taste profile that records the design calls you've already made, so an agent stops re-litigating them. Free and open source, Apache-2.0. `npx raven-mcp`.*
  - Categories: Design, Developer Tools · Docs: `https://ravenmcp.ai/docs` · Support: `andrew@ravenmcp.ai` · Slug: `raven`
  - Privacy URL: blocked on 7a.
- **Step 5 Use cases**
  1. *"Audit https://myapp.com/checkout for contrast and tap-target issues"* → measured ratios and hit-target sizes with the failing elements named.
  2. *"Does this new button match our design system?"* → checked against bound tokens and prior taste decisions; drift flagged.
  3. *"Generate a design system for a B2B SaaS dashboard"* → tokens, type scale, spacing scale, component patterns.
- **Step 7 Authentication** — `oauth_dcr` (AuthKit exposes a registration endpoint; S256 advertised; 401 handshake verified).
- **Step 8 Data handling** — first-party API, no health data, no sponsored content.
- **Step 9 Test & launch** — blocked on the seeded reviewer account (#8).

### 7c. Desktop extensions — manifest patch

`license` → `Apache-2.0`; add `privacy_policies`; add a real 512×512 `icon.png`; regenerate the `tools` array from the annotated source so the manifest and live schemas can't drift. Then `mcpb validate manifest.json` → `scripts/build-mcpb.sh` → optionally `mcpb sign --self-signed`.

---

## 8. Questions only Andrew can answer

1. **Is the Claude.ai account Team/Enterprise with Directory management?** Blocks the whole connectors channel. Check `claude.ai/admin-settings/directory`.
2. **Submit the full 100-tool surface, or the design-only subset?** My read: design-only, per the directory policy's restricted AI-media category.
3. **Public contact address for submission forms** — `andrew@ravenmcp.ai` is what's on the site; confirm it's the one to list.
4. **Plugin route: stdio or hosted remote?** Stdio drafted; remote is untested from a plugin install.

---

## 9. Method notes

**Adverse pass, partial.** The Sol falsification leg was forced to report before its verification sub-run finished, and the repo-facts leg handed off to a background Codex thread that never returned (`codex:codex-rescue` timer-wrapper stall — the known gotcha; direct `codex exec` is the fix). Everything they were supposed to check, I re-ran firsthand — §1. Sol's live objections were still worth the run: it caught the endpoint-URL self-contradiction (real, and it's a repo bug), and correctly flagged that the annotation change touches shared tool-definition source with a stdio byte-identity invariant on it and that no draft proposed a check for that. Its `clau.de` typo objection was wrong — the misspelled link is genuine.

**Out of scope, flagged by the completeness critic:** non-Anthropic distribution (Smithery, Glama, awesome-mcp-servers, VS Code/Cursor/Windsurf marketplaces, npm `mcp` keyword). The goal scoped to Anthropic channels; these are a separate backlog item.

**Open-weight benchmark** (3 rows appended to `conversations/openweight-scoreboard.jsonl`, bucket `reasoning`): GLM 5.2 $0.0044/30s/6, Kimi K3 $0.081/184s/7, GPT-5.6 Sol sub/190s/9. Sol won on the only axis that mattered — it fetched live docs and cited them, surfacing the tool-annotation requirement and the AI-media policy risk that neither open-weight model could know. Both open-weight models ranked the registry #1 on an assumption the sourced answer contradicts. **Lesson for the ladder: on any bucket whose answer depends on current external process, uncited open-weight output is a prior, not an answer.** Kimi's first run at `max_tokens 2000` burned out on reasoning with empty content — reasoning models need ≥6k on this bucket.

---

## 10. Implementation pass — 2026-07-25

Two commits on `main`. Nothing submitted, published, or deployed.

- **`ef7b392`** — tool annotations (title + readOnlyHint/destructiveHint on all 100 stdio tools), `manifest.json` license → Apache-2.0 + `privacy_policies`, `server.json` remotes URL → `mcp.ravenmcp.ai`, `plugin/raven-mcp/` package, `web/app/privacy/`, `mcp-publisher publish` step in `release.sh` + the release skill.
- **`d0c0fdb`** — `openWorldHint` on all 100 tools, privacy-policy completeness against OpenAI's five required elements, `/privacy` linked from the footer and the sitemap.

**Gap table status.**

| # | Gap | Status |
|---|---|---|
| 1 | No privacy policy page | **Built, not deployed** — `web/app/privacy/`. `ravenmcp.ai/privacy` still 404s; `web` has no git integration, so it needs Andrew's `vercel deploy --prod` from `web/`. |
| 2 | Zero tool annotations | **Done.** 100/100 annotated, 70 read-only / 30 destructive / 11 open-world. Tool names, count, and schemas unchanged; anon-45 hash re-verified `f64bb18…2bb0a6`; 1088 tests pass / 0 fail. |
| 3 | `server.json` remotes URL dead | **Done.** |
| 4 | Registry record stale at 1.3.3 | **Wired, not run.** `release.sh` now publishes it after npm. The publish itself is gated behind the npm publish, which needs Andrew's passkey. |
| 5 | Claude.ai org tier | **Answered — closed.** Max plan, no org settings. Connectors Directory needs a Team seat; it's a cost decision, not a blocker. Plugin Directory is open on the current plan (Console admin). |
| 6 | `manifest.json` license says MIT | **Done.** |
| 7 | No `icon.png` at repo root | **Retracted — was not a gap.** `scripts/build-mcpb.sh:29` copies `site/assets/raven-logo.png` into the bundle as `icon.png`. The manifest reference resolves correctly inside the `.mcpb`. |
| 8 | No reviewer test account | **Open.** Needed for both Anthropic and OpenAI review; must work with no MFA. |
| 9 | No `plugin/` package | **Done and pushed** — the submission form takes a GitHub URL, so it had to be on `main` before submitting. |

**Correction to the byte-identity invariant.** Annotations change the `tools/list` payload — that is the point of the change, and it's what both directories require. What is preserved is the tool surface: same 100 names, same schemas, same handlers, same anon-45 remote hash. Recorded here because the ledger's "stdio must stay byte-identical" line will otherwise read as violated.

**Privacy policy content.** Rewritten past the first draft to cover the five elements OpenAI names: categories of personal data (the hosted OAuth identity's email + user ID), purpose, recipients, retention, and controls. The first draft had a real contradiction — a "Third-party sharing: none" line sitting directly below a paragraph naming WorkOS and Upstash. That section now names both processors and what each holds. Design-judge: PASS, no findings, verified at 1440 and 393 against the running page.

**Unverifiable claims deliberately cut from the policy:** a 30-day backup-deletion window (Upstash's backup retention is not something I can verify) and a usage-log rotation cap (no cap exists in the code). Neither is in the shipped copy.

---

## 11. Channel: Codex CLI / ChatGPT desktop

Not an Anthropic channel — added because the ask expanded to "Claude and Codex desktop." Sources fetched live 2026-07-25.

**Install works today, no listing required.** Codex reads `~/.codex/config.toml`:

```toml
[mcp_servers.raven-mcp]
command = "npx"
args = ["-y", "raven-mcp"]
```

Or `codex mcp add raven-mcp -- npx -y raven-mcp`. Codex supports streamable-HTTP natively — no `mcp-remote` bridge — so the hosted endpoint also works directly:

```toml
[mcp_servers.raven-mcp]
url = "https://mcp.ravenmcp.ai/api/mcp"
```

For the authenticated surface, point at `/api/mcp-user` and run `codex mcp login raven-mcp` to trigger the AuthKit flow. **Untested by me** — the anonymous URL form is the one I'd document first.

**ChatGPT desktop** takes third-party MCP connectors behind Developer Mode (Plus/Pro/Team/Enterprise/Edu; not Free). This is a different mechanism from Codex's TOML. The help-center page 403s to automated fetch, so the exact in-app path is search-snippet-sourced, not page-verified — check it signed in.

**There is a submission directory**, at `platform.openai.com/plugins`. Requirements, quoted from the live docs:

- Verified developer or business identity in the OpenAI Platform, plus **Apps Management** write access.
- Domain control proven by serving the token at `https://<host>/.well-known/openai-apps-challenge` — bare token, no JSON wrapper.
- A published privacy policy explaining *"the categories of personal data collected, the purposes of use, the categories of recipients, data retention timelines, and any controls offered."*
- Customer support contact details.
- Correct `readOnlyHint` / `openWorldHint` / `destructiveHint` — *"Incorrect or missing action labels are a common cause of rejection."*
- Five positive and three negative test cases, with demo credentials that work **without MFA, SMS, email confirmation, or private-network access**.
- No terms-of-service page required.

**One conflict worth knowing before submitting.** OpenAI's reviewer guidance defines `openWorldHint` as *"tools that change publicly visible internet state (posting, publishing, sending external messages)"*. The MCP schema defines it as interacting with an open set of external entities — a web search is open, a memory tool is not. Raven's 11 URL-driving audit tools are open-world under the spec and closed under OpenAI's phrasing. I set them per the spec, because Claude Desktop and every other spec-following client is the larger install base and reading an arbitrary URL is the thing a user should be told about. If an OpenAI reviewer reads it their way, the answer is that these tools fetch, they don't publish — worth pre-empting in the submission notes rather than flipping the flag.

**Codex-channel gaps not shared with the Anthropic channels:** the `.well-known/openai-apps-challenge` token (needs a value from the portal), OpenAI identity verification (Andrew's, in OpenAI's dashboard), and the test-case dossier.
