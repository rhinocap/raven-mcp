# W2 review-outcome benchmark

This benchmark measures whether Raven's shipped W2 audit modules detect a small labeled corpus of seeded defects without flagging clean controls. It reports per-family and overall precision/recall as a repeatable regression-tracking coverage signal. It is not proof of overall product quality, and a 100% score must not be presented as a marketing number.

## Run

For a fresh clone, install the project and Chromium before building:

```sh
npm ci
npx playwright install chromium
npm run build
```

Then run the direct `dist/` benchmark:

```sh
RAVEN_NO_USAGE_LOG=1 BENCH_DATE=2026-07-18 node bench/run.mjs
```

The runner serves `bench/corpus/` on an ephemeral localhost port, uses fixed viewports, prints the scorecard, and overwrites `bench/RESULTS.md`. It makes no external requests. `BENCH_DATE` is copied as supplied; when omitted it is `unset`.

Any `UNEXECUTED` case is reported in its family's scorecard column and makes the process exit 1. An unexecuted seeded case also counts as an FN; an unexecuted clean case counts as one failed-control FP. A fully executed run exits 0 even when it reports FNs or FPs. Pass/fail thresholds are a future CI step: today this is a reporting instrument, not a CI gate.

## Metric semantics

- TP and FN are case-level: each seeded case has one expected matcher and either earns a TP or loses that expected detection as an FN.
- FP is finding-level precision within the audited family: on every seeded or clean case, each warn-or-higher family finding not credited by the expected matcher counts as one FP. Clean cases have no expected matcher, so every warn-or-higher family finding is an FP.
- Precision is `TP / (TP + total FPs)`. The case table exposes each case's FP count so an expected hit cannot hide unrelated actionable findings.
- TN is case-level: a clean control earns a TN only when it executes without warn-or-higher family findings.
- Info/nit findings are not actionable for this scorecard and do not count as FPs.

## Add a case

1. Add one self-contained fixture under `bench/corpus/` with one labeled defect class.
2. Add its manifest entry with the direct audit tool and a matcher for the exact emitted rule, selector, or category. For `selector_includes` matchers, seed the target element with an `id` — the browser audits emit structural selectors (`html > body > p:nth-of-type(1)`) or `#id`, never class names, so a class-seeded element can be detected yet uncredited (scores FN + 1 FP).
3. For a clean control, set `expected` to `clean`; warn-or-higher family findings count as false positives. For a seeded case, only findings credited by its matcher are expected; other warn-or-higher family findings also count as false positives.
4. Run the benchmark and inspect both the case outcome and family score.

The tap-target audit currently measures target dimensions, not overlap or proximity. The corpus therefore labels only size defects for that family.

## Limitations

- The corpus is self-authored and synthetic. Its seeds were chosen with knowledge of the audit implementations, so this is regression coverage, not an independent validation set or a head-to-head competitor comparison.
- N is small. The corpus does not represent production prevalence, content diversity, browser diversity, or real-world difficulty.
- Metric units are intentionally mixed and must be read as implemented: TP/FN/TN are case-level, while unexpected actionable FPs are finding-level within the audited family. Unexecuted seeded cases add an FN; unexecuted clean controls add one failed-control FP; all unexecuted cases also appear in the dedicated column and force exit 1.
- Matcher-based scoring can still credit a finding with the expected selector/rule/category while missing a subtler root-cause error. `evidence_includes` is a plain substring match (e.g. "proven" would match "unproven") — prefer distinctive terms when adding taste cases.
- The gradient contrast case uses a representative opaque fallback color because the shipped contrast collector measures computed background colors, not per-pixel gradient luminance.
- `taste-banned-language` currently measures target-only banned-language detection. It does not prove that a port stayed faithful to its source. The paired source files remain in the corpus for a future port-fidelity family when PR #31's `source_text` support merges.
- There are no benchmark pass/fail thresholds yet. FNs and FPs report but do not gate; only missing execution fails the process. Thresholding is a future CI step.
- The scorecard tracks whether these exact regression cases still execute and flip at known boundaries. It must not be used as broad product-quality proof or as a promotional 100% claim.
