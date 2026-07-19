# Code-to-design reconstruction — spec + directional spike (it39)

*2026-07-19, morven-loop it39. Matrix top-gap #7 (W1/W3 bridge, "absent" across every competitor except explicit code↔design ones). Cheap directional spike BEFORE any expensive build, per the interpretive-feature guardrail. Prep/spec register (it35 standing constraint) — grows no PR queue, adds no MCP tool, touches no frozen surface, needs no Figma seat. **Language recalibrated after a Sol adverse pass returned FLAWED on over-claims (verdict + resolutions at the end); read the spike findings as scoped hypotheses (n=3), not proven generalizations.***

## The gap, and the differentiation hypothesis

Grab already runs **page → design-intent** (a running DOM → `{selector, styles, tokens[], role, intent}`, per `src/grab-bridge.ts`). The inverse — **code → design-intent**, reading a component's *source* and emitting the same vocabulary — is absent. Competitors that bridge code↔design (Paper, Open Design) sync a *proprietary canvas layer* in both directions. Morven's move is narrower and deeper: reconstruct code into **the same DESIGN.md / design-intent vocabulary that Grab, `generate_design_system`, and the taste engine already consume** — so a reconstructed component lands as a first-class node in the decision/taste graph: auditable by `audit_taste`, enforceable by the taste engine, diffable by `review_diff`.

**Hypothesis (not a proven "strictly-better" claim — there is no competitor benchmark in hand):** the differentiator is *reconstruction-into-a-governed-intent-graph* rather than into a canvas, run headless from source with no design-tool seat. That is plausibly differentiated on the governance/headless axis; it is **not** established as better across fidelity, round-tripping, ecosystem, or designer workflow. Proving superiority needs the comparative benchmark this spike does not attempt. "Draw the doc on a live canvas" is explicitly Morven-platform scope, not this wedge.

## The spike: hand-reconstruct three real surfaces to find where fidelity breaks

Ran the reconstruction by hand against three real files in `web/` — one declarative component, one token system, one imperative canvas. **n=3, selected examples: this shows feasibility and locates the failure boundaries, not reliable reconstruction across arbitrary real-world code** (indirection, conditional composition, generated/hashed classNames, runtime data, third-party components, framework conventions all remain unexercised).

### 1. Declarative component → high fidelity *on this class* (`web/components/tools/ToolsSection.tsx`)

From the TSX source alone, reconstruction recovers a design-intent tree in the Grab/DESIGN.md vocabulary:

```jsonc
{
  "selector": "section.tools-section#tools",
  "role": "fixed",
  "children": [{
    "selector": ".container", "role": "flexible", "intent": "layout-container",
    "children": [
      { "selector": ".section-header", "children": [
        { "selector": "p.label", "content": "Seventy Tools", "motion": "reveal" },
        { "selector": "h2", "content": "Seventy tools, organized by job", "motion": "reveal.delay-1" },
        { "selector": "p.subtitle", "motion": "reveal.delay-2" }
      ]},
      { "selector": ".txb-list", "intent": "instance-list",
        "component": {
          "name": "txb-act", "kind": "accordion-item", "instances": 5,
          "variant_axis": { "prop": "data-open", "states": ["open", "closed"] },
          "data_model": ["num", "title", "purpose", "marquee[3]", "tools[]"],
          "a11y": { "button": ["aria-expanded", "aria-controls"],
                    "panel": ["role=region", "aria-label", "hidden"],
                    "decorative": ["chevron svg aria-hidden", "stroke=currentColor"] },
          "interaction": "single-open accordion (openIdx state; open toggles to null)",
          "children_component": {
            "name": "txb-tool", "kind": "card", "instances": "act.tools.length",
            "data_model": ["name", "desc"], "layout": ".txb-grid (grid)"
          }
        }}
    ]}]
}
```

Reconstructs well from source: **component identity + variant axis** (5 acts are instances of one `txb-act` pattern with an open/closed state, not 5 bespoke layers); the **content/data model** (`num/title/purpose/marquee/tools`); **interaction semantics**; the **a11y contract**; **motion class intent**. A Figma reconstruction of this is a component + 5 instances + a variant, not 5 flat frames.

**Complementarity, not dominance (adverse fix):** source carries richer *semantics, state logic, and a11y metadata* than a render; a render carries the *authoritative resolved appearance and layout* (computed styles, cascade/specificity winners, responsive behavior, font metrics, intrinsic sizing, pseudo-elements, real timing). Neither dominates. Source-only reconstruction **misses** exactly that resolved-appearance layer — see the MEDIUM row, which is load-bearing, not a footnote.

### 2. Token system → names+values reconstruct directly (`web/app/globals.css :root`)

A CSS-custom-property block maps its **names and values** 1:1 into the `generate_design_system` / DESIGN.md token vocabulary — the `:root` in `globals.css` yields color roles (`--bg-surface`, `--text-primary`, `--accent-blue`…), an apparent 4px-base spacing scale (`--space-1..10`), and type tokens (`--font-inter`, `--font-mono`). **What does NOT come for free (adverse fix):** *semantic role* grouping, aliases/references, themes/modes, usage constraints, and intentional-vs-incidental classification are inference, not extraction — a 4px pattern is not itself a *governed* scale. This is still the strongest reconstruction surface, and `className`→CSS is the join that resolves §1's indirect token bindings to concrete values; but "the token system reconstructs" means the raw layer, with a semantic-inference pass on top.

### 3. Imperative canvas / motion → confidence-scored partial, not zero (`web/components/HeroGrid.tsx`)

An imperative `<canvas>` draw loop has no DOM tree, no token references, no variants, so DOM-like *geometric layer* reconstruction should be **skipped, not fabricated**. But "one prose node" under-claims (adverse fix): the source still exposes recoverable scene structure — drawing primitives, coordinates, cell size (40–46px), the lerp constant (0.18), the reduced-motion branch, spotlight radius/peak, hit-region-free pointer tracking. The defensible output is a **confidence-scored `motion-behavior` node** carrying those recovered parameters, flagged low-confidence for *visual geometry*, rather than either fabricated layers or an empty prose stub.

## Fidelity rubric (spike-located boundaries; thresholds are targets, not measured)

| Source shape | Reconstructs | Recovers | Misses (needs render or inference) |
|---|---|---|---|
| Declarative JSX + `className` | high *on this class* | identity, variant axis, content/data model, interaction, a11y, motion classes | computed appearance, cascade winners, responsive/runtime states |
| CSS-var `:root` block | names+values directly | the raw token layer | semantic roles, themes/aliases, intentional-vs-incidental (inference pass) |
| Concrete geometry (grid cols, optical rhythm, spacing) | **load-bearing gap** | little from source alone | requires `className`→CSS join **and/or** a headless render — this row can block rebuild-equivalence |
| Imperative canvas / animation | partial, confidence-scored | recovered primitives/constants as a motion node | visual geometry (skip, flag low-confidence) |

## Acceptance — operationalized (adverse fix; was subjective)

A reconstruction is faithful iff a **blinded** designer/agent can rebuild an equivalent component from the intent doc alone, scored on defined dimensions with tolerances, not by eyeball:

- **Structure:** tree isomorphism vs source (node kinds, nesting) — exact.
- **Variant axis:** every variant prop + its state set recovered — exact.
- **Content/data model:** field set recovered — exact.
- **A11y contract:** every role/aria attribute present — exact.
- **Tokens:** name+value match ≥ threshold; semantic-role match scored separately (inference, lower bar).
- **Geometry:** only assertable when the CSS-join/render path is included; measured as computed-style deltas within tolerance, across ≥2 breakpoints and each interaction state.
- **Test artifacts the real build ships from day one (adverse fix — "nothing to unit-test" was wrong):** golden-output fixtures per source component, JSON-schema validation of every emitted doc, and adversarial input fixtures (hashed classNames, conditional render, third-party children) that must degrade gracefully, not crash or fabricate.

## Spec for the real feature (buildable, headless, no new frozen-surface risk)

- **Goal:** `code → DESIGN.md-vocabulary design-intent doc`, symmetric to Grab, feeding the taste/decision graph.
- **In scope:** a TSX/JSX/HTML reader emitting the §1 tree + a `className`→CSS token join (§2) with a semantic-role inference pass, and a confidence-scored motion-node path for imperative canvas (§3).
- **Out of scope (Morven-platform / later):** rendering the doc onto a live canvas; multi-file component-graph resolution; frameworks beyond React/HTML.
- **Acceptance:** the operationalized rubric above, measured on ≥3 real components (ToolsSection as the golden case) — with numeric pass thresholds per dimension, **not** "holds on real components."
- **Surface decision (deferred to Andrew):** MCP tool (grows the frozen 93-count → his sign-off) **or** a `scripts/` reader (like `figma-comments-archive.mjs`, no count change). Recommend script first — proves fidelity at zero frozen-surface risk; promote to a tool only when the rubric clears its numeric thresholds on real team components. Caveat (adverse): script-first controls surface risk but *defers* the hard integration/usability questions — the promotion gate is measured thresholds, not deferral.

## Verify

- **Evidence is the reconstruction itself**, grounded line-for-line in the three real source files (§1 `openIdx`/`data-open`/`aria-expanded`/`role=region`/the 5 `ACTS`/`txb-tool`; §2 the real `:root`; §3 the real draw loop). No engine was built, so the spike's deliverable is *analysis*, checkable against the sources — feasibility + boundary location, **not** proof of general fidelity.
- **Team-designer lens:** "our components already encode variants, tokens, a11y — reconstruction turns that into the intent doc I audit against, without re-drawing in Figma." Passes for design-system-mature teams; unproven for messy/legacy component code.
- **Engineer lens (W3):** "reconstruction reads the components I already own and keeps the shared intent current — I never hand-maintain a design file." Passes headless; integration cost unmeasured.
- **Sol adverse:** ran (constrained, minimal CODEX_HOME, report-only) → **VERDICT: FLAWED** on over-claims; 9 findings, all calibration (not pick-rejection). Every finding resolved in this revision — see below.

### Adverse resolutions (Sol, 9 findings)

1. "strictly better" → recast as a **differentiation hypothesis on the governance/headless axis**; no superiority claimed without a benchmark. 2. n=3 → stated explicitly as feasibility + boundary-location, not general reliability, with the untested-input classes named. 3/4. fidelity-vs-acceptance conflict + "more intent than render" → replaced with **complementarity**; the MEDIUM/geometry row promoted to **load-bearing** (source-only misses resolved appearance). 5. "NEAR-PERFECT tokens" → "names+values directly; semantic roles need inference." 6. canvas "one prose node" → **confidence-scored partial** with recovered primitives. 7. acceptance → **operationalized** (blinded rebuild, per-dimension tolerances, breakpoint/state coverage). 8. script-first → kept, but promotion gated on **numeric thresholds**, with the deferral caveat named. 9. "nothing to unit-test" → corrected; golden-output/schema/adversarial fixtures named as day-one tests.

## Next candidate

it40 is the ZOOM-OUT (gap_scan + both-persona end-to-end walk + top-10 re-rank + name the single biggest license-replacement blocker — candidly now "4+ iterations of prep are Andrew-merge/seat-gated; distribution and merges are the bottleneck, not features"). After it40, the reconstruction script (§ spec) is the first real build candidate once Andrew nods the surface decision.
