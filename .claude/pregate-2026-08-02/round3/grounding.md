# Build: snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss
Derive the Structure/States skeleton from the reference you are holding and call compose_build_prompt again with it as `skeleton` — this response is the grounding half only.
Grounded in: `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena/DESIGN.md` (resolved via default) · taste `andrew/monochrome portfolio component surface — transient UI components (toasts, inline affordances, buttons) on the dark editorial portfolio system` · inventory DESIGN.md (3 components)
Note: decisions were read from `/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round3/decisions`, which is outside the project you named.

## Tokens to use
- colors: `colors.bg` (`--color-bg`), `colors.bg-elev` (`--color-bg-elev`), `colors.bg-card` (`--color-bg-card`), `colors.fg` (`--color-fg`), `colors.fg-muted` (`--color-fg-muted`), `colors.fg-dim` (`--color-fg-dim`), `colors.line` (`--color-line`), `colors.line-strong` (`--color-line-strong`), `colors.accent` (`--color-accent`)
- type: `type.label` (`--type-label`), `type.body` (`--type-body`), `type.lead` (`--type-lead`), `type.h3` (`--type-h3`), `type.h2` (`--type-h2`), `type.h1` (`--type-h1`)
- space: `space.xs` (`--space-xs`), `space.sm` (`--space-sm`), `space.md` (`--space-md`), `space.lg` (`--space-lg`), `space.xl` (`--space-xl`), `space.xxl` (`--space-xxl`)
- motion: `motion.duration.fast` (`--motion-duration-fast`), `motion.duration.base` (`--motion-duration-base`), `motion.duration.slow` (`--motion-duration-slow`), `motion.easing.out-quart` (`--motion-easing-out-quart`), `motion.easing.out-expo` (`--motion-easing-out-expo`), `motion.easing.site` (`--motion-easing-site`)
No hex, no px, no font-family literals — every literal is a defect the acceptance criteria below will catch.

## Prohibitions
- `COLOR-one-warm-orange-accent`: "Do NOT introduce a second accent color on monochrome portfolio surfaces. The only permitted accent is --accent (warm orange)."
- `COLOR-no-gradient-no-glow`: "Do NOT use multi-hue gradients, purple/indigo/blue fills, multi-stop 'AI' gradients, glow, or neon effects."
- `COLOR-accent-punctuation-not-fill`: "Do NOT use --accent as a large background fill or dominant surface color."
- `COLOR-control-signal-only`: "Do NOT apply color to controls or UI chrome for decorative purposes. Color is permitted only when it conveys functional meaning."
- `TYPE-no-faux-anything`: "Do NOT use synthetic (faux) italic, bold, small-caps, or condensed. Italic must be real Inter italic (Domaine has no italic file)."
- `TYPE-serif-authorial-only`: "Do NOT use --font-serif (Domaine) for project titles, section headers, metrics, labels, or CTAs. Restrict to editorial lede, pull-quote, and About headline contexts."
- `LAYOUT-no-card-soup`: "Do NOT use grids of drop-shadowed, rounded-corner card-soup components. Use editorial, hairline-ruled (--line) layout primitives."
- `LAYOUT-no-bare-modals`: "Do NOT ship unstyled bare modals, cramped layouts, or floating action buttons without visual context."
- `LAYOUT-proportional-frames`: "Do NOT use fixed-px widths for layout frames. Use proportional units (flex:1, fr units, min()), reserving px for component-dimension sizing."
- `SPACING-tap-targets-44px`: "Do NOT ship interactive tap targets smaller than 44×44px on mobile."
- `MOTION-prefers-reduced-motion`: "Do NOT add any animation or transition without a prefers-reduced-motion: reduce override that collapses its duration to near-zero."
- `MOTION-reveals-structure`: "Do NOT add purely decorative motion that does not reveal or reinforce layout structure."
- `TOKEN-no-bare-literals`: "Do NOT author bare hex colors, raw px sizing, or font-family literals in component CSS. Every value must use var(--token, fallback)."
- `TOKEN-semantic-names`: "Do NOT create literal-descriptor token names (--gray-2, --orange). Token names must be semantic (--fg-muted, --accent)."
- `TOKEN-semantic-button-classes`: "Do NOT apply inline styles to button elements. Use the semantic button class system."
- `OTHER-hover-state-required`: "Do NOT ship interactive elements without a defined :hover state."
- `OTHER-no-shadcn-defaults`: "Do NOT use shadcn default aesthetics, status pills, glow pills, or decorative badges. Non-signal controls are monochrome."
- `OTHER-no-load-bearing-decoration`: "Do NOT add decorative UI elements that do not carry structural or informational load."
- `OTHER-dynamic-dom-not-css-hide`: "Do NOT CSS-hide conditionally absent elements (display:none, opacity-0, .hidden). Omit them from the DOM entirely."
- `ASSET-icon-stroke-current-color`: "Do NOT hardcode stroke or fill colors on icons. Use stroke="currentColor"."
- `ASSET-icon-sizes-consistent`: "Do NOT use icon sizes outside 14px, 16px, or 20px."
- `VOICE-editorial-restraint`: "Do NOT write copy in a salesy, superlative, or persuasive register — never use persuasion words (proven, shipped, supercharge, unlock, durable, leverage, battle-tested, game-changing). Show, don't sell."
- `ASSET-CLEARANCE-nda-no-client-ui-in-public`: "Do NOT place screenshots or recordings of client/employer product UI into any portfolio, award, or deck asset without explicit clearance. NDA-protected screens are blocked from all public surfaces."
- `ASSET-CLEARANCE-no-watermark-artifacts`: "Do NOT include any asset bearing an AI-generation watermark, stock watermark, or rights-management overlay in portfolio, award, or deck output."
- `ASSET-CLEARANCE-strip-environment-chrome`: "Do NOT include screenshots with visible browser chrome, URL bars, OS navigation, or dev-tool overlays in any deck slide or portfolio figure. Strip all environment artifacts before placing."
- `CONTENT-ACCURACY-read-before-asserting`: "Do NOT assert project facts (counts, descriptions, scope, outcomes, revenue figures) without first reading the canonical source file. Memory, prior summaries, and in-context assumptions are not sources of truth."
- `CONTENT-ACCURACY-open-references-before-scoring`: "Do NOT grade or compare a design artifact without first opening the actual reference. A self-compiled rubric, distilled notes, or memory of a reference is not a reference."
- `CONTENT-ACCURACY-verbatim-copy-ships-as-written`: "Do NOT silently correct or alter author-supplied quoted copy. Ship it verbatim; offer corrections in a separate fix-table only when asked."
- `CSS-ARITHMETIC-enumerate-all-offsets`: "Do NOT write a CSS positional offset (translate, calc, top/left/right/bottom, inset) unless every intermediate layout contribution (padding, border, gap, sticky offset, inset) to the element's visual origin is accounted for in the expression. A missing term is a systematic positioning error, not a rounding issue."
- `CSS-ARITHMETIC-cover-fit-viewport-aspect`: "Do NOT sample a cover-fit media element (video, image, shader) using UV or object-position values derived for one viewport orientation without recalculating for the current orientation's aspect ratio. Landscape UV on a portrait viewport stretches or crops the wrong region."
- `PROCESS-REUSE-substitution-preserves-composition`: "Do NOT substitute an asset by changing its capture surface, layout, or device-mockup style. Re-capture the SAME surface and view as the original; change only the project subject."
- `PROCESS-REUSE-no-context-crossing`: "Do NOT reuse a grid-card or thumbnail composition at full-bleed or hero scale. Card assets are composed for 300–400px slots — they are not hero images. Each display context requires its own composition."
- rejected in the Decision Graph (`dec_design_01`, active — read via listActiveDecisions(), not decision_list): Deliberately subdued light-mode field (old restA 0.26 / base 0.14 — read as barely-there), Raising dark mode down to meet light instead — "Light is the default surface, so the signature moment cannot be a dark-mode-only feature."

## Gaps / decisions for you
1. Decision scope mismatch: decisions were read from /Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/round3/decisions, which is outside /Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02/arena — the Decision Graph store is resolved globally and project_dir cannot move it.

## Acceptance criteria
A criterion cites the check that proves it, or it is marked agent-asserted — never left implying a tool checks something it does not.
| # | Claim | Check | Verified by |
|---|---|---|---|
| A1 | No bare hex, font-size, font-family, or margin/padding/gap literal on an added line of a recognized UI file | review_diff verdict `pass` with `checks_skipped` empty | tool, bounded — it reads only added lines of UI-extension files and does not check arbitrary dimension literals; read `checks_skipped` with the verdict |
| A2 | Clears the deterministic color/spacing/motion detectors | talon_scan → 0 findings ≥ warning | tool, on an agent-supplied post-interaction elements+viewport snapshot — talon_scan takes no interactions, so a url-mode run would audit the default state |
| A3 | Every interactive target ≥ 44 CSS px on both axes | audit_tap_targets (minSize 44 CSS px) | tool, on an agent-supplied post-interaction elements[] snapshot |
| A4 | Text contrast ≥ 4.5:1 (AA normal text) | audit_contrast | tool, on an agent-supplied post-interaction dom_snapshot |
| A6 | Semantic roles and live regions from the Structure section are present in the markup | manual read of the diff | agent-asserted — audit_page has no live-region rule |
| A7 | Taste verdict not BLOCK and every design_note present | audit_taste → note_assessments + verdict | tool — scoped to the page's default state; audit_taste takes no interactions, so post-interaction elements are covered by A2–A4, not A7 |

Design notes are acceptance criteria too — audit_taste verifies each as present/partial/missing on the built surface:
- typography: Untitled Sans at 400/500/700 only, no italics loaded. Domaine Display SemiBold is authorial voice ONLY — never a title, header, metric, or CTA. Component text stays in the body band; carry emphasis with weight or the accent, never with display size.
- spacing: Generous negative space around and inside the component; every interactive target at least 44px on both axes.
- color: Dark-first monochrome with one warm-orange --accent used as punctuation only — never a large fill, never a second accent hue. No gradients, glow, or neon.
- layout: Hairline rules (--line) do the separating. No nested cards, no rounded card-soup, no shadcn-default surfaces.
- motion: Short and structural, snapped to the motion.duration and motion.easing tokens rather than literal numbers. Every animation honors prefers-reduced-motion.
- aesthetic: Editorial restraint — the chrome recedes and nothing sells. Ink-on-paper weight.
- libraries: One self-contained HTML file: all CSS and JS inline, no dependencies, no external requests. Every visual value is var(--token, fallback) — no bare hex, px, or font literals in component CSS.
- special: Pre-gate fixture surface for the spec §13 composer experiment — not a shipping product surface.