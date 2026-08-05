# 2026-08-05 — pattern library, rounds 4 and 5

Per-instance log. Shared context for the feature itself is in
`conversations/2026-08-04-pattern-library.md`; this file is where-I-left-off,
what changed and why, and what carries forward.

## The standing instruction

> "I want you to keep working like this is a /loop or /goal workflow until
> everything is done and ready for me to test."

Governing intent, from earlier:

> "I explicitly told you I wanted to add clickyhq.com and mobbin.com
> functionality to Raven so that anyone could grab other patterns and apply them
> to their projects. That was the whole point of this project."

Hard constraint carried through: delegated legs are Codex or OpenRouter only,
never Anthropic — the Anthropic budget is nearly spent. That rules out the Agent
and Workflow tools, so this ran as a single session with `codex exec` (Sol) for
the adverse passes.

## Where I left off

Everything below is done and verified. Nothing is pushed, published, or deployed
— those three remain Andrew's.

## What changed

**`src/reference-tokens.ts`** — compound family names (`letter-spacing`,
`border-radius`) are now found INSIDE a longer path segment, so Shopify Polaris's
`--p-font-letter-spacing-dense` names its family instead of falling to the loose
tier and being demoted as ambiguous. Generic single words are deliberately not
scanned inside segments, or `color.text-primary` would become the best-ranked
font-size candidate. Verified by effect in both directions, not by reading the
code.

**`src/grab-bridge.ts`** — round-4 cookie and proxy hardening: decisions reason
about the upstream URL rather than the loopback one; malformed `__Secure-` /
`__Host-` cookies are rejected rather than upgraded; SameSite is enforced on the
bridge because upstream can no longer see cross-site-ness; a meta refresh that
changes scheme is left absolute. Plus the new `authoring: "withheld"` field.

**`browser/raven-grab.js`** (+ its `web/public/` mirror) — a send in a proxied
session is terminal, not a prelude to a commit the bridge withholds.

**`src/index.ts`** — `start_grab_session`'s agent protocol distinguishes shim
mode from proxy mode instead of blaming a missing HTTP listener for both.

**`test/e2e-pattern-library.mjs`** — rewritten around a real browser and the real
overlay. 32 checks.

**New:** `test/grab-bridge-proxy-round4.test.mjs` (5),
`test/grab-bridge-proxy-round5.test.mjs` (2), two tests in
`test/reference-tokens.test.mjs`.

## The lesson worth carrying

The e2e was passing before any of this. It hand-wrote the selection object it
posted to `/grab`, so the queue seam was genuinely exercised while the payload
was fiction — and three of its fields were wrong in ways only a browser could
reveal. Replacing the literal with the real overlay immediately surfaced a defect
in the feature's primary path: every grab from a third-party site ended on
"Retry send" with a console error, because the overlay could not see that the
bridge withholds `/batch-commit` from a proxied origin on purpose.

Two related process notes:

- The e2e's console-error assertion ran right after the drain, which returns
  before the send finishes. It passed on timing rather than behaviour and
  reported clean on the exact defect it should have caught. A check whose failure
  mode is indistinguishable from its success mode is not a check — it now records
  the label sequence and asserts on it.
- Five debugging rounds went into theorising about overlay internals (`armed`,
  collapsed panels, send-button state) before measuring two rectangles showed the
  click was landing under a docked panel. Count it, don't theorise about it.

## Verification

- `RAVEN_NO_USAGE_LOG=1 npm test` → 1227 / 1224 pass / 0 fail / 3 skipped, ~45s
- `node test/e2e-pattern-library.mjs` → ALL CHECKS PASSED (32), live github.com +
  real Chromium
- Causality proven for every new test by reverting the fix in `dist/` and
  confirming red: 5/5 for round 4, and for round 5 the exact original symptom
  ("Retry send" + the 404 console error) reproduced from reverting one field
- stdio 108 tools (unchanged); live anon endpoint re-checked at 45 tools, hash
  `f64bb18…2bb0a6` — the frozen golden. No tools added, so a merge cannot move it
- `site/raven.mcpb` and `web/public/raven.mcpb` rebuilt, both `dfa5c8fe…bef4ea`

## Carried forward

1. Sol round-5 falsification pass — brief at
   `.claude/patternlib-2026-08-04/briefs/SOL-ROUND5.md`, output at
   `.claude/patternlib-2026-08-04/out/SOL-ROUND5.log`. Disposition every real
   objection before any completion claim reaches Andrew.
2. Andrew's gates, all untouched: push to `main` (which deploys the live MCP
   endpoint since the 2026-07-27 unpin), `npm publish` (passkey, his terminal),
   `vercel deploy --prod` from `web/` (the only thing that moves the public
   overlay mirror and the `.mcpb` download).
3. Local `main` is ahead of `origin/main` and not pushed.
