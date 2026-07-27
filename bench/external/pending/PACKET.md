# Grading packet — gpt-5.6-sol-vanilla baseline

Ungraded external-result packet for the W2 bench corpus. Lives in `pending/` so `bench/compare.mjs` (which scans only `bench/external/*.json`) ignores it until a human grades it.

## What ran (2026-07-19)
One `codex exec -m gpt-5.6-sol -c model_reasoning_effort=medium` call per corpus case. HTML cases got the full page source with the prompt: review for concrete design/accessibility defects (contrast, tap targets, responsive visibility, typography, layout) at viewport 390x844; say "No actionable defects found." if clean. Taste cases got source + target copy with: does the target preserve the source's exact wording and voice/register; report substitutions concretely. No Raven tools, taste profiles, defect families, or expected answers were given to the model. Raw output preserved verbatim per case under `runs/gpt-5.6-sol-vanilla/` — some outputs begin with the runner's own boilerplate preamble (Skill/Spec/Verification lines); grade on the findings that follow it.

## What this measures
This is a disclosed, deliberately *product-level* comparison, not a model-judgment comparison: the vanilla baseline gets raw source and one broad prompt, while Raven's audits get rendered pages, family-specific measurement, thresholds, and taste bindings. A score gap therefore measures Raven's combined moat (rendering + specialization + configuration), which is the procurement-relevant question. Exact prompts, command, and output hashes: `runs/gpt-5.6-sol-vanilla/RUN-MANIFEST.md`.

## How to grade (human only — never auto-match text)
1. For each row below, open the raw output file and read it against the seeded defect.
2. In `gpt-5.6-sol-vanilla.json`, set `detected` (true only if the output identifies the labeled defect class; on clean controls, true means it flagged something actionable = false alarm) and paste a short quote into `evidence` (including for misses).
3. Note: external grading is one boolean per case — extra actionable findings on seeded pages are NOT recorded for external tools (only Raven is scored at finding level); don't try to record them.
4. Fill `graded_by` / `graded_at`, move `gpt-5.6-sol-vanilla.json` up to `bench/external/`, and run `node bench/compare.mjs`.

## Cases
| id | family | seeded defect | raw output |
|---|---|---|---|
| `contrast-low-on-light` | contrast | 16px #aaa text on #fff is about 2.32:1, below WCAG AA 4.5:1. | `runs/gpt-5.6-sol-vanilla/contrast-low-on-light.txt` |
| `contrast-low-on-dark` | contrast | 16px #555 text on #111 is about 2.53:1, below WCAG AA 4.5:1. | `runs/gpt-5.6-sol-vanilla/contrast-low-on-dark.txt` |
| `contrast-gradient-panel` | contrast | 16px #5f5f5f text is below AA across the #111-to-#1a1a1a dark CSS gradient panel. | `runs/gpt-5.6-sol-vanilla/contrast-gradient-panel.txt` |
| `contrast-clean` | contrast | none | `runs/gpt-5.6-sol-vanilla/contrast-clean.txt` |
| `contrast-boundary-fail` | contrast | 16px #777 text on #fff measures about 4.48:1, just below WCAG AA 4.5:1. | `runs/gpt-5.6-sol-vanilla/contrast-boundary-fail.txt` |
| `contrast-boundary-clean` | contrast | none; 16px #767676 text on #fff measures about 4.54:1, just above WCAG AA 4.5:1 | `runs/gpt-5.6-sol-vanilla/contrast-boundary-clean.txt` |
| `tap-tiny-button` | tap-targets | A 24x24 close button is below the shipped 44x44 minimum on both axes. | `runs/gpt-5.6-sol-vanilla/tap-tiny-button.txt` |
| `tap-short-link` | tap-targets | A 112x20 link target is below the shipped 44px minimum on its height axis. | `runs/gpt-5.6-sol-vanilla/tap-short-link.txt` |
| `tap-small-pair` | tap-targets | Two adjacent 32x32 controls are each below the shipped 44x44 minimum. | `runs/gpt-5.6-sol-vanilla/tap-small-pair.txt` |
| `tap-clean` | tap-targets | none | `runs/gpt-5.6-sol-vanilla/tap-clean.txt` |
| `tap-boundary-fail` | tap-targets | A 43x43 control is one pixel below the shipped 44x44 minimum. | `runs/gpt-5.6-sol-vanilla/tap-boundary-fail.txt` |
| `tap-boundary-clean` | tap-targets | none; a 44x44 control meets the shipped minimum exactly | `runs/gpt-5.6-sol-vanilla/tap-boundary-clean.txt` |
| `type-nonstandard-weight` | typography | One text style uses non-standard font-weight 450. | `runs/gpt-5.6-sol-vanilla/type-nonstandard-weight.txt` |
| `type-line-height-outlier` | typography | One paragraph uses a 3.0 line-height ratio against a dominant 1.5 ratio. | `runs/gpt-5.6-sol-vanilla/type-line-height-outlier.txt` |
| `type-too-many-weights` | typography | The page uses six distinct standard font weights, exceeding the shipped maximum of four. | `runs/gpt-5.6-sol-vanilla/type-too-many-weights.txt` |
| `type-clean` | typography | none | `runs/gpt-5.6-sol-vanilla/type-clean.txt` |
| `type-line-height-boundary-fail` | typography | One paragraph uses a 1.66 line-height ratio against the dominant 1.5 ratio, exceeding the 0.15 tolerance. | `runs/gpt-5.6-sol-vanilla/type-line-height-boundary-fail.txt` |
| `type-line-height-boundary-clean` | typography | none; one paragraph uses a 1.65 line-height ratio against the dominant 1.5 ratio, exactly at the 0.15 tolerance | `runs/gpt-5.6-sol-vanilla/type-line-height-boundary-clean.txt` |
| `type-weight-boundary-fail` | typography | The page uses five distinct standard font weights, exceeding the shipped maximum of four. | `runs/gpt-5.6-sol-vanilla/type-weight-boundary-fail.txt` |
| `type-weight-boundary-clean` | typography | none; the page uses exactly four distinct standard font weights | `runs/gpt-5.6-sol-vanilla/type-weight-boundary-clean.txt` |
| `responsive-hidden-lede` | responsive-visibility | A content lede is displayed at desktop width and display:none below 600px. | `runs/gpt-5.6-sol-vanilla/responsive-hidden-lede.txt` |
| `responsive-hidden-list-item` | responsive-visibility | A substantive list item is visible at desktop and visibility:hidden below 600px. | `runs/gpt-5.6-sol-vanilla/responsive-hidden-list-item.txt` |
| `responsive-hidden-caption` | responsive-visibility | A meaningful figure caption is visible at desktop and opacity:0 below 600px. | `runs/gpt-5.6-sol-vanilla/responsive-hidden-caption.txt` |
| `responsive-clean` | responsive-visibility | none | `runs/gpt-5.6-sol-vanilla/responsive-clean.txt` |
| `taste-proven-substitution` | taste-banned-language | The target substitutes the banned persuasion term 'proven' for restrained source copy. | `runs/gpt-5.6-sol-vanilla/taste-proven-substitution.txt` |
| `taste-unlock-substitution` | taste-banned-language | The target substitutes the banned persuasion term 'unlocks' for restrained source copy. | `runs/gpt-5.6-sol-vanilla/taste-unlock-substitution.txt` |
| `taste-verbatim-control` | taste-banned-language | none; the target is byte-for-byte identical to the source | `runs/gpt-5.6-sol-vanilla/taste-verbatim-control.txt` |
