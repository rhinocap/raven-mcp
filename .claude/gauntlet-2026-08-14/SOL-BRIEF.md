# Sol falsification brief — design_gauntlet (2026-08-14)

You are an adversarial reviewer. Your job is to REFUTE the claim below, not confirm it.
Report only. Do NOT edit files. Do NOT run npm test (a concurrent run clobbers dist/ for other processes) — read code instead. You may run small read-only node snippets against src/ or test files if useful.

## Claim under audit
A new gated MCP tool `design_gauntlet` is complete and correct:
- `src/design-gauntlet.ts` — Chromium probe `measureGauntletPage` (visible-count guard + retry, full-page scroll for lazy-load, fonts.ready race with fonts_status, color-scheme emulation reported back) + pure comparator `compareGauntletMeasurements` (13 rules over 9 dimensions: surfaces ladder/sprawl, hairline sprawl, text roles flat/sprawl, tracking display/body, accent overuse, type-scale sprawl, family budget, radii sprawl, elevation strategy, rhythm-container which NEVER fires) + `vocabularyCount` (90%-coverage long-tail rule, inclusive boundary) + bar capped at 7 + fixes split mechanical/needs_a_decision + binary `verdict.on_par` (true iff zero failing rules) + embedded 6-step fresh-critic `GAUNTLET_LOOP_PROTOCOL` + discipline notice.
- `src/index.ts` — registered after talon_rules; in `REMOTE_GATED_TOOLS` (frozen anon 45-tool hash must not move), `TOOL_ACCESS: readOnly`, `TOOL_OPEN_WORLD`; CaptureUnavailableError → plain-text fallback naming `npx playwright install chromium`. Counts now 111 stdio / 66 gated.
- `test/design-gauntlet.test.mjs` — 26 tests, green; mutation matrix `.claude/gauntlet-2026-08-14/gauntlet-mutants.mjs` measured 24/24 killed, 0 survived, 2 construction-neutral controls green (log: agent-output/mutants-v2.log).
- Six count suites updated 110→111; manifest regenerated.

## Attack surfaces (non-exhaustive — find what nobody thought of)
1. Comparator asymmetries: any rule where subject/reference are swapped, a boundary is off-by-one, or a zero/empty measurement produces a fire (or suppresses one) the rule's own comment contradicts.
2. Probe honesty: can a page that fails to lay out, blocks Chromium, or lazy-loads below the fold produce a measurement that LOOKS healthy? Is the visible-elements retry a real guard or decorative?
3. The unmeasured path: tracking/accent/elevation entries that are null/absent on one side — does any rule fire on missing data, or claim "worse" from absence?
4. verdict.on_par semantics: any path where on_par is true while a diff row has subject_worse true, or where bar/fixes disagree with verdict.failing_mechanisms.
5. Gating: does design_gauntlet leak to the anonymous remote surface in ANY build order? Is the schema identical local vs remote (it should simply be absent remotely)?
6. Test falsifiability: name any test in test/design-gauntlet.test.mjs that cannot fail (vacuous fixture, assertion that passes under the defect it names), and any mutation the 24-mutant matrix structurally cannot see.
7. The response contract: JSON.parse-ability, loop_protocol length, discipline string — anything a consumer would pipeline on that can silently be wrong.

## Output format
Numbered findings, each: severity (P1 real defect / P2 weaker-than-claimed / P3 doc-or-claim decay), the exact file:line, the concrete failing input or scenario, and what observable goes wrong. If a claim survives your attack, say so explicitly per surface. An empty report is a failed run, not a clean bill.
