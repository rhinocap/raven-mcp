# W2 review-outcome benchmark

BENCH_DATE: 2026-07-18
COMMIT: 5ed8647

| Family | TP | FP | FN | TN | UNEXECUTED | Precision | Recall |
|---|---:|---:|---:|---:|---:|---:|---:|
| contrast | 4 | 0 | 0 | 2 | 0 | 100.0% | 100.0% |
| tap-targets | 4 | 0 | 0 | 2 | 0 | 100.0% | 100.0% |
| typography | 5 | 0 | 0 | 3 | 0 | 100.0% | 100.0% |
| responsive-visibility | 3 | 0 | 0 | 1 | 0 | 100.0% | 100.0% |
| taste-banned-language | 2 | 0 | 0 | 1 | 0 | 100.0% | 100.0% |
| OVERALL | 18 | 0 | 0 | 9 | 0 | 100.0% | 100.0% |

## Cases

| Case | Family | Outcome | FP |
|---|---|---|---:|
| contrast-low-on-light | contrast | TP | 0 |
| contrast-low-on-dark | contrast | TP | 0 |
| contrast-gradient-panel | contrast | TP | 0 |
| contrast-clean | contrast | TN | 0 |
| contrast-boundary-fail | contrast | TP | 0 |
| contrast-boundary-clean | contrast | TN | 0 |
| tap-tiny-button | tap-targets | TP | 0 |
| tap-short-link | tap-targets | TP | 0 |
| tap-small-pair | tap-targets | TP | 0 |
| tap-clean | tap-targets | TN | 0 |
| tap-boundary-fail | tap-targets | TP | 0 |
| tap-boundary-clean | tap-targets | TN | 0 |
| type-nonstandard-weight | typography | TP | 0 |
| type-line-height-outlier | typography | TP | 0 |
| type-too-many-weights | typography | TP | 0 |
| type-clean | typography | TN | 0 |
| type-line-height-boundary-fail | typography | TP | 0 |
| type-line-height-boundary-clean | typography | TN | 0 |
| type-weight-boundary-fail | typography | TP | 0 |
| type-weight-boundary-clean | typography | TN | 0 |
| responsive-hidden-lede | responsive-visibility | TP | 0 |
| responsive-hidden-list-item | responsive-visibility | TP | 0 |
| responsive-hidden-caption | responsive-visibility | TP | 0 |
| responsive-clean | responsive-visibility | TN | 0 |
| taste-proven-substitution | taste-banned-language | TP | 0 |
| taste-unlock-substitution | taste-banned-language | TP | 0 |
| taste-verbatim-control | taste-banned-language | TN | 0 |
