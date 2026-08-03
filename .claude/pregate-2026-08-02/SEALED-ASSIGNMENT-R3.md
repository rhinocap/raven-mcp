# SEALED — round 3 arm assignment

Written BEFORE any build ran. Lives OUTSIDE round3/ so the judging pass, which is pointed at
round3/builds/, cannot see it. Unseal only at synthesis.

Workflow scripts cannot call Math.random (it would break resume), so this permutation is
hand-chosen and fixed here verbatim rather than generated.

A = composed prompt (round3/composed-prompt.md)
B = one-line instruction (call the tools yourself)

| build | arm |
|---|---|
| build-01 | B |
| build-02 | A |
| build-03 | A |
| build-04 | B |
| build-05 | A |
| build-06 | B |
| build-07 | B |
| build-08 | A |
| build-09 | B |
| build-10 | A |
| build-11 | A |
| build-12 | B |
| build-13 | B |
| build-14 | A |

A = 02,03,05,08,10,11,14 (7)   B = 01,04,06,07,09,12,13 (7)

## Blinding note
BUILD-LOG.md names the information source and therefore leaks the arm. Judges are given
**index.html only** and are told the log is deliberately withheld. The deterministic primary
endpoint reads index.html only as well.

## Blind pair key (BLIND-REVIEW.html)

Each pair is one arm-A build against one arm-B build. Side order is irregular.

| pair | left | left arm | right | right arm |
|---|---|---|---|---|
| 1 | 1L = build-02 | A | 1R = build-01 | B |
| 2 | 2L = build-04 | B | 2R = build-03 | A |
| 3 | 3L = build-05 | A | 3R = build-06 | B |
| 4 | 4L = build-08 | A | 4R = build-07 | B |
| 5 | 5L = build-09 | B | 5R = build-10 | A |
| 6 | 6L = build-12 | B | 6R = build-11 | A |
| 7 | 7L = build-14 | A | 7R = build-13 | B |

Sign test: 7 pairs. All seven one way = p 0.016 two-sided; 6 of 7 = p 0.125.
