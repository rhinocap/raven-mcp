# Submission dossier — copy-paste values

Prepared 2026-07-25. Nothing here has been submitted. Companion to `2026-07-25-anthropic-distribution.md`.

---

## A. Claude Code Plugin Directory — SUBMITTED 2026-07-25, pending review

Andrew ticked the consent checkbox. I filled steps 2 and 3 and then submitted it by accident on a Back/Next verification pass — see the session log. Status: "Submitted and pending review"; no withdraw or edit control is exposed.

**Step 3 values as submitted:** supported platform — Claude Code only (Cowork untested, left unticked); license — `Apache-2.0`; privacy policy URL — `https://ravenmcp.ai/privacy`; contact email — `cunliffeandrewc@gmail.com` (prefilled; chosen over `andrew@ravenmcp.ai`, which is unconfirmed).

Step 2's fields, as submitted:

**Link to plugin**
```
https://github.com/rhinocap/raven-mcp
```

**Path within repository**
```
plugin/raven-mcp
```

**Plugin homepage**
```
https://ravenmcp.ai
```

**Plugin name**
```
Raven
```

**Plugin description**

> Design intelligence for coding agents. Raven audits pages, screens, and diffs for contrast, layout, tap targets, typography, and consistency, and carries a design system and a taste profile the agent can consult before it writes UI code — so the design judgment survives being handed to a model.

**Example use cases**

> - "Audit this page" — Raven renders the live URL at three viewports and two themes and returns per-element WCAG contrast, tap-target failures, and layout findings tagged confirmed or inconclusive.
> - "Check this diff before I push" — `review_diff` reads the repo's DESIGN.md and active design decisions and flags the changes that contradict them.
> - "What did we decide about card elevation?" — the decision graph answers from recorded decisions instead of re-litigating it in a thread.
> - "Set up a design system for this project" — an interview binds the surface's taste rules, and every later audit is judged against them rather than a generic rubric.

Both blocks are ready as written; they say what it does before they say why it matters, which is the register the directory listings around it use.

---

## B. OpenAI plugin submission — `platform.openai.com/plugins`

Blocked on two things only Andrew can do: identity verification in the OpenAI Platform dashboard, and hosting the domain-verification token the portal issues.

**Domain verification.** The portal gives you a token. Serve it bare — no JSON wrapper, no second token — at:
```
https://ravenmcp.ai/.well-known/openai-apps-challenge
```
In the Next.js `web/` project that is `web/app/.well-known/openai-apps-challenge/route.ts` returning `new Response(TOKEN)`. I have not written it, because writing it before the token exists means committing a placeholder that later 200s with the wrong value — worse than a 404.

**Server URL to submit:** `https://mcp.ravenmcp.ai/api/mcp` (45 anonymous tools, no auth). Submitting the authenticated `/api/mcp-user` surface would require reviewer credentials that work with no MFA — see the open gap below.

**Privacy policy:** `https://ravenmcp.ai/privacy` — built, awaiting deploy.

**Support contact:** `andrew@ravenmcp.ai`. **Confirm this mailbox actually receives mail before submitting** — reviewers use it, and a bounce reads as an abandoned submission.

### Five positive test cases

1. **Audit a public page.** `audit_url` with `url: "https://ravenmcp.ai"`. Expect findings across three viewports and two themes, each tagged confirmed / likely-artifact / inconclusive, with per-element contrast ratios.
2. **Audit pasted markup.** `audit_page` with an `html` string containing a 10px body font and a bare hex color. Expect typography and token findings with specific fixes — no browser, no network.
3. **Retrieve a design principle.** `get_principles` with a category. Expect bundled knowledge back; nothing leaves the machine.
4. **Score a page.** `score_page` with `html`. Expect a numeric score, a letter grade, and a ranked fix list.
5. **Check contrast and get a fix.** `audit_contrast` on a low-contrast pair, then `suggest_contrast_fix` on the failing pair. Expect a WCAG ratio, a pass/fail, and a corrected color that clears AA.

All five run on the anonymous endpoint with no account and no credentials.

### Three negative test cases

1. **Unreachable URL.** `audit_url` with `url: "https://this-host-does-not-resolve.invalid"`. Expect `summary` to open `AUDIT DID NOT RUN`, zero captures, and the `ERR_NAME_NOT_RESOLVED` cause in `warnings[]`. No crash, no hang.
2. **Malformed input.** `audit_page` with neither `html` nor `url`. Expect the text `Provide either html or url`. **Known behavior:** this comes back as a normal text result, not an MCP `isError: true`. A reviewer running a negative case may read that as the call having succeeded. Fixing it means touching every tool's validation path, which changes output for existing consumers — deliberately not done as part of a submission prep, but worth a decision before the next major.
3. **Gated argument on the hosted endpoint.** `audit_page` with a `url` against `mcp.ravenmcp.ai`. Expect a refusal explaining that url-capture is disabled remotely and to pass `html` instead — the guard rejects before the handler runs.

### Starter prompts

```
Audit ravenmcp.ai for contrast and tap-target failures.
Check this component against our design system before I commit it.
What are the layout problems on this screen?
```

---

## C. Open, needs Andrew

| | What | Why it blocks |
|---|---|---|
| 1 | `vercel deploy --prod` from `web/` | `ravenmcp.ai/privacy` 404s until then; both directories require a live policy URL, and `manifest.json` now points at it. |
| 2 | `npm publish` (passkey) | Annotations don't reach npm consumers, and the registry publish is gated behind it. |
| 3 | Confirm `andrew@ravenmcp.ai` receives mail | Listed as the support contact on two submissions. |
| 4 | Reviewer test account, no MFA | Only needed if an authenticated surface is submitted. Submitting the anonymous endpoint avoids it entirely — my recommendation for the first pass. |
| 5 | Team seat decision | Connectors Directory only. Everything else is open on the current plan. |
| 6 | OpenAI identity verification + domain token | Whole OpenAI channel. |
