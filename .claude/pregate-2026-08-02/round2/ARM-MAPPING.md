# Round-2 arm mapping (unsealed at synthesis, 2026-08-03)

Held at the session scratchpad (`ARM-MAPPING-SEALED.md`), outside this directory, for the whole
of the build/judge/refute run so blind judges could not infer an artifact's arm from its path.
Permutation is a fixed hand-chosen assignment — workflow scripts cannot call `Math.random`.

A = built from the composed prompt (`composed-prompt-fair.md`)
B = built from the one-line instruction (agent calls read_design_md / get_taste_profile / audit_taste itself)

| build | arm | message px measured | judge | refuted | ship_ready |
|---|---|---|---|---|---|
| build-01 | B | 16 | 83 | 83 | true |
| build-02 | A | 16 | 83 | 81 | true |
| build-03 | A | **27** | 64 | 63 | false |
| build-04 | B | 16 | 85 | 82 | true |
| build-05 | B | 16 | 76 | 84 | false |
| build-06 | A | **27** | 64 | 64 | false |
| build-07 | A | **27** | 60 | 58 | false |
| build-08 | B | 16 | 85 | 83 | true |
| build-09 | A | **27** | 72 | 76 | false |
| build-10 | B | 16 | 87 | 85 | true |
| build-11 | B | 16 | 85 | 78 | true |
| build-12 | A | **27** | 64 | 63 | false |
