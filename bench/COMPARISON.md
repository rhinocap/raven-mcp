# Benchmark comparison

BENCH_DATE: 2026-07-18
RAVEN_RESULT: a175dd4-dirty

| Family | Raven recall | Raven clean cases flagged | Raven unexecuted |
|---|---:|---:|---:|
| contrast | 4/4 (100.0%) | 0 | 0 |
| tap-targets | 4/4 (100.0%) | 0 | 0 |
| typography | 5/5 (100.0%) | 0 | 0 |
| responsive-visibility | 3/3 (100.0%) | 0 | 0 |
| taste-banned-language | 2/2 (100.0%) | 0 | 0 |
| OVERALL | 18/18 (100.0%) | 0 | 0 |

Raven finding-level FPs incl. seeded pages: 0 — stricter than the case-level unit used for comparison; external tools are not graded at finding level.

## Fairness caveats

- This corpus was self-authored with knowledge of Raven's audits and is biased toward Raven's rule vocabulary.
- External results are human-graded self-reports. The harness cannot verify them against tool output; graders must link preserved raw output in `notes`.
- Clean-case comparison is case-level: a clean case counts once when flagged. Raven finding-level FPs, including seeded pages, are reported separately because external tools are not graded at finding level.
- This scores coverage of the corpus's labeled defect classes side-by-side; it is not a general head-to-head product comparison or ranking.
- Misses remain in the denominator. Grader, grading date, tool version, notes, and per-case evidence are recorded for every scored external result.

The shipped `example-tool.json` template is ungraded and was excluded from scoring.

## Tool metadata

### Raven

- Generated with: a175dd4-dirty
- Benchmark date: 2026-07-18
