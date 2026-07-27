# Grab Panel v2 + Playground spec (Figma "Raven design", node 3-136)

> **Superseded 2026-07-19 — historical record, not the current contract.**
> This spec describes ONE 360px right-hand panel. What ships is TWO panels: a
> Structure panel on the left (layers, templates, and a footer bar reading
> `⌘K <project name>` that opens a full-page settings + feedback modal) and the
> Design panel on the right, each collapsing to its own edge tab via
> `transform: translateX(±750px)`. Read `browser/raven-grab.js` for the real
> markup and `conversations/f23-polish-loop.md` for how it got there. The Figma
> node is still the origin of the visual language — colours, radii, and card
> treatments below remain accurate; the layout and tab structure do not.

Source of truth: Figma file 0fOhyQa7yxDkx7j8ZCCAuO, node 3-136 (three variants).
All colors/sizes below extracted from Figma — use exactly.

## Panel (browser/raven-grab.js) — rebuild to match Figma

Container: 360px wide, bg #212129, border 1px rgba(255,255,255,0.12), radius 20px,
backdrop-blur 12px, shadows: 0 1px 2px rgba(0,0,0,.25), 0 0 32px rgba(0,191,255,.06),
0 8px 16px -4px rgba(0,0,0,.35), 0 24px 48px -12px rgba(0,0,0,.5).

Header: px16 py12, bottom border rgba(255,255,255,0.06). Title "Raven design"
(Inter Bold 14px #F0F0F2). Right: 32px circle rgba(255,255,255,.06) with ">" (collapse/close, keep existing dismiss behavior + rollback).

Tabs row (NEW): full-width, bottom border rgba(255,255,255,.12), px16. Two equal tabs
"Design" | "Request Component" — JetBrains Mono Medium 13px #F0F0F2, min-height 44px,
bg rgba(14,30,46,0.82) blur(6px); ACTIVE tab has bottom border rgba(0,191,255,0.3).

ELEMENT section (both tabs): label "ELEMENT" JetBrains Mono Medium 12px #8E929C
tracking .96px; chip: selector text JetBrains Mono Medium 11px #00BFFF, bg
rgba(0,191,255,0.1), border 1px rgba(0,191,255,0.3), radius 4px, px8 py3.

### Design tab (existing functionality, restyled)
- "DESIGN TOKENS" section label (same label style). Each matched token = a card:
  bg #2a2a33, border rgba(255,255,255,.06), radius 12px, p12. Inside: property name
  (JBMono 11px #8E929C) then a select: bg #1a1a22, border rgba(255,255,255,.12),
  radius 10px, min-height 44px, px14, value "token · resolvedValue" JBMono 13px #F0F0F2,
  chevron ▾ right. Keep existing swap+live-preview behavior.
- "COMPUTED STYLES - NOT TOKENIZED" label. Styles table = ONE card (bg #2a2a33,
  radius 12px, border rgba(255,255,255,.06)) with rows: min-height 36px px12 py9,
  prop JBMono 11px #8E929C left, value JBMono 11px #F0F0F2 right.
  Edited row: bg rgba(0,191,255,0.08), value JBMono BOLD #00BFFF.
  Editing: value replaced by input bg #1a1a22 border 1px #00BFFF radius 8px px10 py6
  shadow 0 0 0 3px rgba(0,191,255,0.15). Keep ALL existing inline-edit behavior
  (CSS.supports validation, rollback on dismiss, revert, keyboard/ARIA — do not regress).
- "INSTRUCTIONS" label + textarea: bg #1a1a22 border rgba(255,255,255,.12) radius 10px
  px14 py12 min-height 88px, placeholder "Tell the agent what to change…" Inter 12px #8E929C.
- Footer CTA "Send to agent": full-width pill radius 9999px min-height 44px bg #00BFFF,
  text Inter SemiBold 14px #0a1018, shadow 0 4px 20px rgba(0,191,255,0.4).

### Request Component tab (NEW — triage loop for bigger teams)
- "REASON FOR NEW COMPONENT" label. Two select cards (same card+select styles):
  "Issue type" → options: UX/Usability, Visual bug, Missing variant, Accessibility,
  New pattern, Other. "Issue size" → options: 1-10 users/customers, 10-100,
  100-1,000, 1,000+, Internal only.
- "DESCRIBE THE USE CASE AND IMPACT" label + tall textarea (same textarea style,
  min-height 200px), placeholder "Tell the design team why you need this…".
- CTA "Send component request to design" (same CTA style). On click → email step:
- Email step (3rd Figma variant): section "EMAIL YOURSELF THE COMPONENT" + email
  input (same input style, placeholder "email", type=email, validated) + CTA "Send email".

### Collapsible sections (REQUIRED)
- "DESIGN TOKENS" and "COMPUTED STYLES - NOT TOKENIZED" section labels are toggle rows:
  full-width click target (min-height 36px) with a caret ▾ at the right (JBMono 11px
  #8E929C), rotated -90deg (▸) when collapsed. Clicking toggles the section body
  (cards/table) open/closed with a quick height transition (~150ms). Default:
  BOTH sections collapsed (keeps the panel short; each is one caret away).
  Keyboard: the label row is a button (Enter/Space toggles, aria-expanded).
  Collapsed state must not lose edits — reopening shows edited rows.

### Panel scrolling (REQUIRED)
- The whole panel scrolls: max-height calc(100vh - 40px) (panel is fixed-position with
  20px viewport margins), the content area between the header/tabs and the footer is
  overflow-y:auto (thin dark scrollbar), header + tabs pinned at top, footer CTA pinned
  at bottom so "Send to agent" is always reachable regardless of content height.

### Behavior/protocol
- componentRequest payload: { issueType, issueSize, useCase, email } attached to the
  selection object sent in POST /grab alongside existing tokenIntents/styleEdits/instruction.
- Standalone mode for hosted demos: `window.RavenGrabConfig = { mode:'standalone',
  tokens: <flat token map>, grabEndpoint: <url|null>, componentRequestEndpoint: <url> }`.
  In standalone mode: skip GET /tokens (use config.tokens); "Send to agent" → if
  grabEndpoint null, show an in-panel confirmation of what WOULD be sent (payload
  summary); "Send email" → POST full componentRequest payload JSON to
  componentRequestEndpoint, show success/error state in panel.
- Arm pill: CENTER-ALIGNED at the bottom of the page (left:50%; transform:translateX(-50%);
  bottom:20px) — everywhere, not just standalone. Keep glow-dot style.

## Bridge (src/grab-bridge.ts + test/grab-bridge.test.mjs)
- Extend the zod selection schema with optional componentRequest
  { issueType: string, issueSize: string, useCase: string, email: string }.
- Drained selections include it; add/extend VM tests for the new payload + tab flow.
- stdio MCP behavior stays byte-identical for anonymous tools; nothing REMOTE-visible changes.

## Playground (web/ Next.js — leg B)
- New page web/app/playground/page.tsx in the existing ravenmcp.ai site style
  (see web/app/page.tsx + globals.css for tokens/conventions): short intro header
  ("Raven Grab — live demo", concrete one-liner: click any element, swap tokens, edit
  styles, request a component), then a demo product card section (like a mini SaaS
  pricing/product card with buttons) that visitors can grab.
- Loads /raven-grab.js (the overlay file will be copied into web/public/raven-grab.js —
  reference it, don't create your own overlay) with an inline RavenGrabConfig:
  standalone, a small flat token map matching the demo card's CSS variables
  (colors.accent, colors.primary, rounded.md, rounded.lg, spacing.md etc. — define the
  demo card using CSS custom properties so token swaps visibly work),
  grabEndpoint: null, componentRequestEndpoint: '/api/component-request'.
- API route web/app/api/component-request/route.ts (POST): validate body + email;
  compose TWO emails via resend (dep already in root package.json — add to web/package.json):
  (1) to requester: "Your component request — Raven" containing the triage packet
  (element selector, matched tokens, computed styles, issue type/size, use case) AND a
  deterministically generated example component spec (component name from selector,
  inferred props from tokens/styles, example TSX snippet) — dark HTML email matching
  api/welcome.js's visual language (bg #1a1a22, card #212129, Inter, cyan accents);
  (2) to drew@ravenmcp.ai: the triage notification. From: "Raven MCP <drew@ravenmcp.ai>".
  Env: RESEND_API_KEY (return 503 JSON { error } if unset). Rate-limit naive: max 5
  requests/min per IP in-memory.
- No LLM calls. No new deps beyond resend.

## Send-button morph animation (Figma node 6-626 "Send to agent flow")
Applies to BOTH footer CTAs: "Send to agent" (Design tab) and "Send email" (email step).
Three visual states, animated as one morph sequence on successful send:
1. Default: existing full-width cyan pill CTA.
2. Check state: the pill morphs (width/background/border animate ~250ms ease) into a
   compact circle centered in the footer: 44px diameter, bg rgba(255,255,255,0.06),
   border 1.375px solid #00BFFF, cyan checkmark "✓" (Inter Bold 16.5px #00BFFF).
   Transparent-ish — NOT filled cyan.
3. Sent message state: the circle expands (~250ms) into a centered outlined pill:
   height 44px, radius 9999px, bg rgba(22,44,66,0.9), border 1px solid #00BFFF,
   backdrop-blur 6px, padding-right 16px, gap 10px; left: the same 44px ✓ circle;
   text Inter SemiBold 14px #00BFFF — "Sent to agent" (design tab) / "Email sent"
   (email step). NOT full width — hugs content, centered.
Sequence: click → (request succeeds) → morph to check (~250ms) → hold ~400ms →
expand to sent pill (~250ms) → hold ~1600ms → morph back to check briefly → restore
the original full-width CTA (ready to send again). On request FAILURE keep the
existing error status text behavior — no morph. Respect prefers-reduced-motion:
jump between states with no width/transform animation (state changes still shown).
During the sequence the button is disabled/aria-busy; status text for screen readers
via the existing aria-live status ("Sent to agent" / "Email sent").
