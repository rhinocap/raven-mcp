---
colors:
  bg: "#050505"
  bg-elev: "#141414"
  bg-card: "#1c1c1c"
  fg: "#ffffff"
  fg-muted: "#b8b8b8"
  fg-dim: "#828282"
  line: "#363636"
  line-strong: "#545454"
  accent: "#ed4609"
type:
  label: 13
  body: 16
  lead: 20
  h3: 27
  h2: 56
  h1: 96
space:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
motion:
  duration:
    fast: "120ms"
    base: "200ms"
    slow: "400ms"
  easing:
    out-quart: "cubic-bezier(0.25, 1, 0.5, 1)"
    out-expo: "cubic-bezier(0.16, 1, 0.3, 1)"
    site: "cubic-bezier(0.56, 0.22, 0.05, 0.99)"
components:
  button:
    aliases: [btn, cta]
    states: [hover, focus-visible, active, disabled]
    variants: [primary, ghost]
  card:
    states: [hover]
    variants: [default]
  nav:
    states: [hover, active]
---
# arena — andrewcunliffe.ai-derived design brief (pre-gate fixture)

Dark-first editorial. Ink-on-paper weight, hairline rules (`--line`), one warm
accent (`--accent`), generous negative space. The work is the subject; the
chrome recedes. Restraint over persuasion.

Fonts (tokens only, never literals): `--font-display`/`--font-body` = Untitled
Sans (400/500/700, no italics loaded — italics are off-limits), `--font-mono` =
Geist, `--font-serif` = Domaine Display SemiBold (authorial voice ONLY — never
titles, headers, metrics, or CTAs).

Every visual value is `var(--token, fallback)` — no bare hex, px, or font
literals in component CSS. Buttons use semantic classes; every interactive
element has a hover state. Every animation honors `prefers-reduced-motion`.
One accent hue; everything decorative is monochrome.
