# Ablation mapping (unsealed at synthesis, 2026-08-03)

Fresh permutation, re-sealed at the scratchpad (`ABLATION-MAPPING-SEALED.md`) for the duration of
the run. Ablated builds had the message rule's `font-size: var(--type-h3…)` replaced with
`var(--type-body, 16px)` — one declaration inside one selector block (`.snackbar__message`, or
`.c-toast__message` for build-12), asserted as exactly one substitution per file. Nothing else
changed; `src/reference-prompt.ts` untouched.

Only arm A ever needed ablation — arm B never produced the defect.

| abl | source | arm | ablated | judge | refuted | ship_ready |
|---|---|---|---|---|---|---|
| abl-01 | build-08 | B | no | 87 | 83 | true |
| abl-02 | build-03 | A | **yes** | 85 | 81 | true |
| abl-03 | build-10 | B | no | 74 | 74 | false |
| abl-04 | build-02 | A | no | 76 | 76 | false |
| abl-05 | build-06 | A | **yes** | 88 | 86 | true |
| abl-06 | build-01 | B | no | 83 | 82 | true |
| abl-07 | build-12 | A | **yes** | 83 | 79 | true |
| abl-08 | build-05 | B | no | 85 | 89 | true |
| abl-09 | build-09 | A | **yes** | 79 | 89 | true |
| abl-10 | build-11 | B | no | 87 | 86 | true |
| abl-11 | build-07 | A | **yes** | 80 | 79 | false |
| abl-12 | build-04 | B | no | 87 | 82 | true |
