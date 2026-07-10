# Component requests from the grab overlay

When someone submits a component request from the grab overlay, it goes to the first destination that's configured: a live MCP agent session if one's connected, otherwise a GitHub issue if `COMPONENT_REQUEST_GITHUB_TOKEN` is set, otherwise a prefilled GitHub issue link if only `COMPONENT_REQUEST_GITHUB_REPO` is set, otherwise a request packet handed back in the response. The pick happens once per request — if the chosen destination errors (say the GitHub API call fails), the overlay reports the failure rather than silently rerouting.

## Individual

Nothing to configure. If you're running Raven as a connected MCP server, component requests reach your agent directly through the session — there's no endpoint to set up.

The public playground at ravenmcp.ai/raven-design doesn't have an agent session behind it, so it uses a different path: it emails the request packet (selector, tokens, styles, use case) to the address you give it. That's there so you can try the request flow without running your own install — not something you need to configure for real use.

## Team

Set these two env vars on wherever `/api/component-request` is deployed:

- `COMPONENT_REQUEST_GITHUB_REPO` — `owner/repo`. On its own, this turns requests into a prefilled "new issue" link (`github.com/<repo>/issues/new?title=...&body=...`) that the requester opens and submits by hand. No write access needed.
- `COMPONENT_REQUEST_GITHUB_TOKEN` — a token scoped to `issues:write` on that repo. With this set alongside the repo, requests auto-create the issue via the GitHub API instead of just linking to one. Repeated submits with the same `requestId` return the already-created issue instead of opening a duplicate (best-effort: the dedupe map is in-memory, so a cold start or a second server instance can still let a duplicate through).

Point `RavenGrabConfig.componentRequestEndpoint` at your deployment's `/api/component-request` route so the overlay posts there instead of the hosted default.

Large payloads: GitHub caps issue bodies and URL length, so the route drops the computed-styles block first, then the matched-tokens block, then truncates, before it lets a request fail on size.

## What lands in the issue

- Element selector
- Matched design tokens
- Computed styles
- Use case (free text, fenced so it can't inject markdown/HTML into the rest of the issue)
- Issue type (UX/Usability, Visual bug, Missing variant, Accessibility, New pattern, Other)
- Issue size (1-10 users/customers, 10-100, 100-1,000, 1,000+, Internal only)
- A generated starting component spec (name, inferred props, a stub `.tsx`) derived from the selector and tokens
- Requester's email, if they gave one — used only to send them a copy, optional
