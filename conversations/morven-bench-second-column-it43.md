# Morven loop — bench second column: axe-core measured (it43)

*2026-07-19. First **real competitor run** against the W2 benchmark corpus, per it40 policy step-2 ("bench a real second column IF a competitor is runnable without Andrew"). Figma Agent / Stitch / Open Design need seats; **axe-core 4.12.1** does not. The headline result is not "Raven wins" — it is a **descriptive behavioral delta map** plus a sharp negative finding: **Raven's own corpus cannot answer the differentiation question**, and this run shows exactly why and what would. No `bench/` mutation. Sol adverse (12 findings, all incorporated) drove the reframe below.*

## Why axe-core, and what it can and can't tell us

axe-core — the a11y engine in Lighthouse/Pa11y/most CI a11y gates — is the one credible competitor runnable with zero auth. It has an overlapping rule for **2 of the corpus's 5 families**: `color-contrast` (↔ `audit_contrast`) and `target-size` (↔ `audit_tap_targets`). So this run can only compare behavior on those two, and — critically — **the corpus is Raven's own**, authored to exercise Raven's audits and encode Raven's chosen standards. That makes it **circular for any superiority claim**: it can show where the two engines *differ*, never that Raven is *right* (it cannot surface Raven false positives it was never built to contain).

## Method

`playwright-core` + chromium headless; served `bench/corpus/` on an ephemeral port; injected `axe.min.js`; `axe.run(document,{runOnly:{type:'rule',values:[rule]}})` per fixture at 390×844; recorded axe's verdict. A diagnostic captured axe's full pass/violation/incomplete/inapplicable buckets. **Raven's column is its own recorded `RESULTS.md` (not a blinded re-run under this harness).** Runner: `scratchpad/it43-axe/run-axe-bench.mjs`.

## Result — behavioral deltas on the 2 overlapping families (facts)

| Fixture | corpus label | Raven (RESULTS.md) | axe-core (run) |
|---|---|---|---|
| contrast-low-on-light (2.32:1) | defect | TP | violation |
| contrast-low-on-dark (2.53:1) | defect | TP | violation |
| contrast-boundary-fail (4.48:1) | defect | TP | violation |
| contrast-boundary-clean (4.54:1) | clean | TN | pass |
| contrast-clean | clean | TN | pass |
| contrast-gradient-panel (over CSS gradient) | defect | TP | **incomplete (declines to rule)** |
| tap-tiny-button (24×24) | defect | TP | **pass** |
| tap-short-link (<44) | defect | TP | **pass** |
| tap-small-pair (<44) | defect | TP | **pass** |
| tap-boundary-fail (<44) | defect | TP | **pass** |
| tap-clean / tap-boundary-clean | clean | TN | pass |

**Facts, not verdicts:** axe agreed with the corpus on all 5 flat-contrast cases (incl. both boundaries); on `color-contrast` it produced **0 violations that the corpus calls clean** across these 12. The two engines *diverge* on exactly two things: the gradient contrast case, and the four sub-44px targets.

## The three deltas — and the counter-interpretation for each

Each delta is a **difference of standard, confidence, or scope — not, on this evidence, a Raven advantage.** (Sol adverse #1–#4, #10.)

1. **Touch target — 44px (Raven) vs 24px (axe/WCAG 2.2 SC 2.5.8).** The diagnostic confirms axe *evaluated* the 24×24 button and *passed* it (`passes:1, violations:0, inapplicable:0`) — axe is correct by WCAG. Raven flags it under a stricter 44px HIG/touch bar. **This is a policy difference, and it cuts both ways:** on a non-touch/desktop UI, Raven's 44px rule could be a **false-positive generator** — and the corpus, which labels every 24–44px target a defect, is structurally incapable of revealing that. "Raven catches what axe misses" is only true *if 44px is the right standard for the surface*, which this corpus assumes rather than tests.
2. **Gradient-background contrast — Raven computes an effective ratio; axe returns `incomplete` (needs human review).** This is an **epistemic-confidence** difference, not a detection win. A gradient yields different ratios across the glyph; axe's refusal-to-guess may be **more correct** than Raven's single composited ratio unless Raven's worst-case sampling/compositing method is independently validated (it was not, here). Presenting axe's deferral as a "miss" assumes Raven's label is right.
3. **Typography / responsive-visibility / taste-language — no axe rule.** A **scope** difference. It shows axe's a11y engine doesn't cover design-intent dimensions; it says **nothing** about whether Raven's implementations of them are accurate or useful (and "taste" is subjective product policy). More opinions ≠ better audits.

## The load-bearing finding (what this run actually bought)

**A self-authored corpus cannot measure competitive differentiation** — it can only measure a competitor against *your own labels*. Every divergence above reduces to "axe is more conservative (precision-favoring); Raven fires more (recall-favoring); the corpus was built so Raven's firing is always 'correct'." (Sol #7.) So the corpus **cannot tell whether Raven's extra findings are valuable detections or false positives** — the single most important question for the paid customer.

**What a real answer needs (the spec this run produced):**
- A **neutral, third-party corpus** (or real production pages) neither engine's authors wrote.
- A **blinded Raven re-run** under the same harness (not reused `RESULTS.md`).
- Explicit measurement of **Raven's false-positive rate on non-touch UIs** (where 44px may over-fire) and on **realistic contrast conditions** (opacity, images, pseudo-elements, states) the 5 flat fixtures don't cover.

## Both-persona read (honest)

- **Team designer (paid):** the *defensible* pitch is narrow and true — "axe/Lighthouse in your CI cover flat-contrast a11y; Raven runs in the same headless CI and additionally opines on gradient contrast, a 44px touch bar, and type/responsive/taste that axe has no rule for — decide if those standards fit your surface." It is **complement-and-extend**, explicitly *not* "Raven is more accurate."
- **Engineer (W3):** actionable and honest — "axe passes your 30px buttons; Raven flags them against a 44px bar. If 44px is your standard, Raven enforces it in the same CI; if it isn't, Raven will over-report."

## Matrix implication (corrected)

Gap #3/#5 does **not** move to "differentiated — measured." What is measured: **axe-core is runnable as a second column, and the two engines produce different verdicts on 5 of 12 shared-family fixtures on Raven's own corpus.** The differentiation question **stays open** pending a neutral corpus + blinded Raven run. Per it30, no tool-status cell moves. This is competitor-matrix evidence and, more usefully, a **spec for a real benchmark** (post-#39/#41 merge).

## Verify

- **Evidence:** axe run output (`scratchpad/it43-axe-full.json`), the target-size diagnostic (axe `passes:1` on the 24×24 button — evaluated, not skipped), `bench/RESULTS.md`. All table cells are observed.
- **Sol adverse:** constrained, report-only, minimal CODEX_HOME, ~10k tokens → **VERDICT: FLAWED, 12 findings** — and it was **right on the central point**: the first draft called the deltas "three defensible differentiators" and claimed the gap "moves to measured," both of which the self-authored corpus cannot support. **Resolved by reframing, not hedging:** every delta now carries its policy/confidence/scope counter-interpretation; the headline is the negative finding (the corpus can't measure differentiation) + the spec for one that could; "parity"/"where axe fires it's right"/"measured differentiation" all scoped to these fixtures or dropped. 5th consecutive session where constrained-Sol caught a real over-claim a self-review would have shipped. No Fable (Andrew on usage credits).

## Next

it44: dogfood a landed `main` tool end-to-end for a real bug (the unblocked it40 step-2 branch), or spec the neutral-corpus benchmark this run scoped. it45 is the next zoom-out.
