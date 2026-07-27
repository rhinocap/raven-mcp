# Homepage tap-target + hex-color fix — verification evidence (2026-07-09)

Preview: https://web-5f02hymm2-cunliffeandrewc-8712s-projects.vercel.app
Commit: bc056da "Consolidate homepage hardcoded hex colors into design tokens"
Not yet on production (ravenmcp.ai) — see case-study copy caveat.

## audit_taste run (profile: andrew, project: raven-mcp, surface: product-site)

Verdict: BLOCK (9 block, 1 warn) — but 8/9 blocks are a known audit-tool
false positive (see below), leaving the real result at 0 real blocks / 1 warn.

### False positive #1 — 8x COLOR-no-gradient-no-glow, evidence citing `#1a73e8`
`#1a73e8` is Google's brand blue; the evidence strings are Google Translate
widget CSS (`.P1ekSe-ZMv3...`, `!important` overrides), not anything in the
served page. Confirmed via `curl` on the raw HTML — zero occurrences of
`1a73e8` or `goog-te`. This is environmental injection in the audit
renderer, same artifact flagged in the prior session's audit.

### False positive #2 — SPACING-tap-targets-44px, "logo span 20x20px"
Live DOM measurement (Chrome, post-hydration) of the actual shadow-DOM
nav (`<raven-nav>` custom element):
- `.nav-brand` (the `<a>`): 124.8 x 44px
- `.nav-brand span` ("RavenMCP" text): 82.8 x 44px
Both meet the 44px minimum — matches the fix committed in bc056da
(`min-height: 44px` on `.nav-brand` and `.nav-brand span`). The audit's
20x20px reading is a hydration-timing miss: the audit renderer appears to
measure before the custom element's shadow DOM populates.
Screenshot: eyes-on zoom confirms a well-proportioned rendered tap target.

### Real finding — TOKEN-no-bare-literals, warn (expected, non-blocking)
"17 distinct hex colors found — hierarchy breaks down past ~10." This is
a palette-size check on the *design system's* root token values, not on
whether individual component CSS uses bare literals. Tokenizing (aliasing
every hardcoded instance to `var(--token)`) satisfies the no-bare-literals
clause but does not reduce the token palette itself below 10 hues — that
would require actually merging some of Raven's accent colors, which is
a design decision, not a bug. Pre-existing, unchanged by this fix, non-blocking.

## Scope correction from the prior session's falsification pass

The case-study copy ("17 hardcoded hex colors ... an audit_taste run
against this exact URL") is scoped to the *homepage* only. It is not a
"whole site tree" claim. `DesignSystemScripts.tsx`, `HomeScripts.tsx`, and
`saas.html` (a fictional demo template, not part of ravenmcp.ai's own UI)
contain hex colors that are demo/showcase content — arbitrary brand-color
swatches used to illustrate the design-system tool's own output — and are
correctly out of scope for this claim.
