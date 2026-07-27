# Raven MCP — P4.5 Production Promote: Go/No-Go Plan

> **This is a human-gated runbook, not automation.** Nothing in this document executes anything.
> It is read top-to-bottom by a human, who then runs the commands themselves, one at a time,
> checking each gate before moving to the next. No agent should ever run this file end-to-end
> unattended. If you are an agent reading this: your job is to print/explain this plan, not
> execute the deploy or domain-reassignment steps in it.
>
> Source of truth for how we got here: `docs/remote-mcp-phase4-progress.md` (P4.0–P4.4, all closed).
> This doc covers **only** the P4.5 production promote — the last unchecked line in that ledger.

---

## 1. DANGER preamble — two Vercel projects share this repo

This repo drives **two separate Vercel projects**, and mixing them up is the one mistake this
whole plan exists to prevent:

- **`site`** (projectId `prj_Tdsg7KlRuoDeb4VdegQFnv2oM0jd`, org `team_olGEVPv4S4lDPwkgjuHrd7uo`) —
  the MCP server. This is what P4.5 promotes. Builds from repo root, `npm run build`, serves
  `api/mcp.js` + `api/mcp-user.js` + `api/well-known.js` + `api/_auth.js`.
- **`web`** (a different projectId, `prj_zg075…`) — the marketing site (`ravenmcp.ai`). Builds the
  `web/` directory. **Nothing in this promote should touch it, deploy it, or redeploy it.**

Two catastrophic mistakes this plan is built to make structurally hard to commit:

1. **Deploying from the wrong cwd.** Running `vercel deploy --prod` (or any `vercel` command)
   from inside `web/`, or from a shell whose `.vercel/project.json` resolves to the `web` project,
   will deploy the **marketing site** to `site`'s production slot or vice versa — either wipes out
   marketing or ships nothing useful to `mcp.ravenmcp.ai`. **Always verify `.vercel/project.json`
   points at `prj_Tdsg7…` immediately before the deploy command** (Precondition (a) below is not
   optional).
2. **Running `vercel promote` instead of a fresh `vercel deploy --prod`.** `site`'s **Production**
   environment is currently **EMPTY** (no `WORKOS_AUTHKIT_DOMAIN`, no `KV_REST_API_URL`/`TOKEN`,
   no resource-indicator vars — those all live in **Preview** today). `vercel promote` takes an
   *existing* preview build and re-labels it production **using whatever env was baked in at
   build time** — since that preview was built against Preview env, promoting it does not fix the
   empty-Production problem, and depending on exact promote semantics can also silently leave the
   new production deployment running with stale or partial env. **The only sanctioned path is a
   FRESH `vercel deploy --prod`** from a checkout with Production env already populated (Precondition
   (e)), so the build happens against the real, complete Production environment. This is called
   out explicitly in Section 3 — do not substitute `vercel promote` for it.

If either of these is in doubt at execution time, STOP and re-verify `.vercel/project.json` and
the target env before touching anything.

---

## 2. Preconditions (ALL must be true before deploying)

Run these in order. Do not proceed past a failed check.

**(a) Local checkout targets the right project.**
```sh
cat .vercel/project.json
```
Must show `"projectId":"prj_Tdsg7KlRuoDeb4VdegQFnv2oM0jd"` and `"orgId":"team_olGEVPv4S4lDPwkgjuHrd7uo"`.
`.vercel/` is gitignored, so a fresh clone or worktree will not have it — if missing, copy it from
a checkout already known to be correct (e.g. `cp <canonical-checkout>/.vercel/project.json ./.vercel/project.json`,
creating `.vercel/` if needed), then re-run this check. **Never `vercel link` blind and accept
whatever project the CLI guesses** — confirm the resulting `project.json` matches before continuing.

**(b) Local tests green.**
```sh
npm test
```
Must exit 0, all tests passing. This is the same suite that has gated every P4.x phase — do not
promote on a red or skipped suite.

**(c) `api/mcp.js` byte-identical to the last verified-good baseline.**
```sh
git diff 1aa6c6a -- api/mcp.js
```
Must be **empty output**. `api/mcp.js` is the anonymous, no-auth, 45-tool stateless endpoint and
must never drift — this is the same invariant every P4.x phase re-checked before shipping.

**(d) Working tree clean at the SHA being deployed.**
```sh
git status --porcelain
```
Must be **empty output**. Deploy a committed, clean SHA — never deploy with uncommitted local
changes, and know exactly which commit you are about to ship.

**(e) Env parity — every var the authed/rate-limit code paths read must exist in Production, not
just Preview.**

Grep confirms the reads (already known from P4.1–P4.5, listed here for the check):
`WORKOS_AUTHKIT_DOMAIN` (`api/_auth.js`), `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Upstash client,
read by the taste store + `api/_ratelimit.js`), the resource-indicator / AuthKit vars (`RAVEN_MCP_RESOURCE`
if set, or host-derived `aud` — confirm which mode is live), and optionally
`RAVEN_USER_RATE_LIMIT` / `RAVEN_USER_RATE_LIMIT_WINDOW_S` if P4.5's rate-limiter uses non-default
values.

```sh
vercel env ls production
```
Confirm every var above is listed under **Production** (not just Preview). For any var missing
from Production, add it — copying the *value* from Preview only if the value itself is meant to
be identical across environments (WorkOS domain and Upstash REST credentials typically are the
same account in this project; confirm before assuming):
```sh
vercel env add WORKOS_AUTHKIT_DOMAIN production
vercel env add KV_REST_API_URL production
vercel env add KV_REST_API_TOKEN production
# … repeat for any resource-indicator var and rate-limit overrides that exist
```
**Then verify by pulling it back** — do not trust the `add` succeeded silently:
```sh
vercel env pull .env.production.check --environment=production
cat .env.production.check   # confirm every expected var + value is present, non-empty
rm .env.production.check    # do not commit this file
```
If any var pulls back empty or missing, STOP — do not deploy. (This CLI has silently stored `""`
on piped-stdin `env add` before; the pull-back is the only trustworthy confirmation.)

---

## 3. The one deploy command

Once ALL of Section 2's preconditions pass:

```sh
vercel deploy --prod
```

Run this — and **only** this — from a checkout where:
- cwd is the **repo root** (never `web/`, never any subdirectory),
- `.vercel/project.json` == `prj_Tdsg7KlRuoDeb4VdegQFnv2oM0jd` (re-confirm immediately before running,
  even if you checked it five minutes ago),
- the SHA is the clean, tested, `api/mcp.js`-verified commit from Section 2.

**Do NOT run `vercel promote`** — see Section 1, danger #2: it would bake in the empty/incomplete
Production env from an old preview build instead of building fresh against the now-populated
Production env.

**Do NOT `git push` to `main`** as part of this step. This promote ships via a direct Vercel CLI
deploy of the already-committed branch tip, not via a branch merge or a push that could trigger
other automation (including the separate `web` project's git-integration build, if `main` is
shared history).

Record the resulting deployment URL (e.g. `https://site-<hash>.vercel.app`) — this is the URL every
gate in Section 4 runs against **before** the domain reassignment in Section 5, and again after.

---

## 4. Live post-deploy gate — ALL of these must pass before declaring done

Run every check below against the **fresh production deployment URL** from Section 3. Do not skip
any — do not declare P4.5 done until every line here is checked.

1. **Anonymous `tools/list` — golden hash + count.**
   ```sh
   # POST an initialize + tools/list to <deploy-url>/api/mcp (no Authorization header)
   ```
   Extract the returned tool names, sort them, and recompute:
   ```sh
   sha256(sorted tool names) == f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6
   ```
   AND the raw tool count == **45**. Any drift here means `api/mcp.js` regressed or the wrong build
   shipped — do not proceed past this check.

2. **Authed `tools/list` — count.**
   With a valid Bearer token (real AuthKit-issued JWT, `aud` matching this deploy/canonical host) against
   `<deploy-url>/api/mcp-user`, `tools/list` count == **56** (45 anon + 10 taste tools + the P4.5
   `delete_taste_data` tool, per the P4.5 scope).

3. **Delete round-trip on a throwaway account.** Using a disposable/test identity: create a taste
   profile → confirm it reads back → call `delete_taste_data` → confirm subsequent reads return
   empty AND the corresponding Upstash keys for that `sub` are gone (`SCAN`/`KEYS` check in the
   Upstash console or REPL, not just the API's own read-back).

4. **Rate-limit probe.** Issue authed requests past the configured per-user limit
   (`RAVEN_USER_RATE_LIMIT` / default) in the configured window and confirm the request that trips
   the limit returns **HTTP 429** with a **`Retry-After`** header. Confirm anonymous traffic is
   unaffected by this same probe (per-user limiting, not global).

Do not move to Section 5 until 1–4 all pass on this exact deployment.

---

## 5. Domain reassignment

Only after Section 4 is fully green. Reassign the canonical host from wherever it currently points
(the `p4-remote-taste` branch alias / preview deployment) to the new verified production deployment:

```sh
vercel domains inspect mcp.ravenmcp.ai
```
Confirm current target (should show the branch/preview alias from P4.1–P4.4).

```sh
vercel alias set <deploy-url-from-section-3> mcp.ravenmcp.ai
```
(Or the equivalent "assign domain to this deployment" action in the Vercel dashboard for project
`site`, if the CLI alias command in this Vercel CLI version targets deployments differently —
confirm the exact subcommand with `vercel alias --help` before running if unsure.)

**Immediately re-run Section 4's checks 1 and 2 again against `https://mcp.ravenmcp.ai` directly**
(not just the raw deploy URL) — the domain must serve the identical golden hash / tool counts once
reassigned. This is the check that proves the reassignment landed on the right deployment.

---

## 6. Marketing-untouched proof

Prove the `web` project's production deployment was not built, redeployed, or otherwise touched by
any step above.

**Before** starting Section 3's deploy, capture `web`'s current production deployment id:
```sh
vercel deploy inspect --scope=<team> <web-production-url-or-deployment-id>
# or, scoped to the web project specifically:
vercel ls --scope=<team> web --prod
```
Record the deployment ID/hash shown.

**After** Section 5 completes, re-run the identical command against the `web` project:
```sh
vercel ls --scope=<team> web --prod
```
**Identical deployment ID before and after == marketing is untouched.** If the ID differs, STOP —
something in this promote (a shared `main` push, a misdirected `vercel deploy`, a CI trigger)
touched the wrong project, and that must be root-caused and reverted before this promote can be
considered clean, even if Sections 3–5 otherwise looked correct.

---

## 7. Rollback

If Section 4 or Section 6 fails at any point after Section 3's deploy has already gone live on
`mcp.ravenmcp.ai`:

```sh
vercel rollback --scope=<team> --project=site
```
(Or, if the CLI requires an explicit prior deployment: `vercel rollback <previous-deploy-url> --scope=<team>`,
targeting the last known-good deployment for project `site` specifically — never the `web` project.)

**Confirm the rollback took effect** by re-running Section 4 checks 1 and 2 against
`https://mcp.ravenmcp.ai` again — golden hash / 45 anon, 56 authed on the ROLLED-BACK deployment.
Also re-run Section 6's `web` deployment-id check once more to confirm the rollback itself didn't
touch the marketing project either.

---

## 8. The single supervised command

Everything above is preparation, verification, and contingency. The one command a human runs to
actually promote — only after every precondition in Section 2 is confirmed true by hand — is:

```sh
vercel deploy --prod
```

Run it from the repo root, from a checkout whose `.vercel/project.json` shows `prj_Tdsg7KlRuoDeb4VdegQFnv2oM0jd`,
on a clean tested commit. Then work through Sections 4 → 5 → 6 in order, by hand, checking each
gate before the next.

**STOP HERE.** Do not chain further automation onto this command. Domain reassignment (Section 5)
and the marketing-untouched proof (Section 6) are separate, human-run steps performed only after
Section 4 is fully green — never scripted to run automatically after the deploy.
