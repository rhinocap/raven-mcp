export const meta = {
  name: 'pregate-round2',
  description: 'Round-2 §13 pre-gate: 6 composed-prompt builds vs 6 one-liner builds, blind-judged and adversarially checked',
  phases: [
    { title: 'Build', detail: '12 builders, arms shuffled across anonymized dirs', model: 'sonnet' },
    { title: 'Capture', detail: 'headless renders + machine judge over all 12', model: 'haiku' },
    { title: 'Judge', detail: 'blind eyes-on judge per build', model: 'sonnet' },
    { title: 'Adversarial', detail: 'refute each blind verdict', model: 'sonnet' },
    { title: 'Critic', detail: 'methodological completeness critic', model: 'sonnet' },
  ],
}

const BASE = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02'
const R2 = BASE + '/round2'

// Fixed permutation, sealed outside the evidence dir. A = composed prompt, B = one-liner.
const ARMS = {
  'build-01': 'B', 'build-02': 'A', 'build-03': 'A', 'build-04': 'B',
  'build-05': 'B', 'build-06': 'A', 'build-07': 'A', 'build-08': 'B',
  'build-09': 'A', 'build-10': 'B', 'build-11': 'B', 'build-12': 'A',
}
const BUILDS = Object.keys(ARMS)

// Round-1 arm prompts, verbatim from ARM-PROMPTS.md, with only the two sanctioned
// substitutions: dead scratchpad base -> BASE, and arm output dir -> this build's dir.
// Nothing may be appended to these strings — prompt fidelity is the experiment's control.
function armAPrompt(dir) {
  return `You are building a UI component for the project at ${BASE}/arena (its DESIGN.md holds the concrete token values — read it to fill in real values for the CSS variables).

Your build prompt is the file ${R2}/composed-prompt-fair.md — read it and follow it exactly. It is your complete specification: structure, states, motion, content, tokens, prohibitions, and acceptance criteria. Where it asks you to report a choice (e.g. which easing you picked), record that in your build log. Where it flags a gap, use your judgment and record what you did. Do not consult any other design source.

Deliverables:
1. ${dir}/index.html — ONE self-contained HTML file (all CSS/JS inline, no external requests) implementing the component on a demo page: dark page background per the token set, plus a minimal demo harness (a single "Save change" button that simulates an optimistic save) so the component's full state machine can be exercised by hand. Define the tokens as CSS custom properties with the concrete values from DESIGN.md and author all component CSS against the variables.
2. ${dir}/BUILD-LOG.md — a short log: choices you were asked to report, gaps you resolved and how, anything you could not satisfy.

Work until both files exist and the HTML is complete and valid. Your final message should be a one-paragraph summary of what you built and any deviations.`
}

function armBPrompt(dir) {
  return `You are building a UI component for the project at ${BASE}/arena.

Task: Build a snackbar for an optimistic save: confirmation with an inline Undo, auto-dismiss, explicit dismiss. Ground yourself in the project's design system and the owner's taste by calling the raven MCP tools yourself: read_design_md (project path above), get_taste_profile (profile name "andrew"), and audit_taste on your built artifact before you finish. (The mcp__raven__* tools are available — load them via ToolSearch first, e.g. "select:mcp__raven__read_design_md,mcp__raven__get_taste_profile,mcp__raven__audit_taste".)

Deliverables:
1. ${dir}/index.html — ONE self-contained HTML file (all CSS/JS inline, no external requests) implementing the component on a demo page: dark page background per the project's token set, plus a minimal demo harness (a single "Save change" button that simulates an optimistic save) so the component's full behavior can be exercised by hand. Define the design tokens as CSS custom properties with the concrete values from the project's DESIGN.md and author all component CSS against the variables.
2. ${dir}/BUILD-LOG.md — a short log: what the tools told you, choices you made, and your audit_taste result.

Work until both files exist and the HTML is complete and valid. Your final message should be a one-paragraph summary of what you built and any deviations.`
}

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['build', 'overall_score', 'ship_ready', 'defects', 'proportion_verdict', 'one_line'],
  properties: {
    build: { type: 'string' },
    overall_score: { type: 'number', description: '0-100 visible design quality of the rendered post-save state' },
    ship_ready: { type: 'boolean', description: 'would you ship this to a design-exacting owner as-is' },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'what', 'evidence'],
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          what: { type: 'string' },
          evidence: { type: 'string', description: 'measured px / hex / line number, not impression' },
        },
      },
    },
    proportion_verdict: { type: 'string', description: 'relative type sizes of confirmation message vs inline action, with measured px' },
    strengths: { type: 'array', items: { type: 'string' } },
    one_line: { type: 'string' },
  },
}

const REFUTE_SCHEMA = {
  type: 'object',
  required: ['build', 'sustained', 'corrected_score', 'note'],
  properties: {
    build: { type: 'string' },
    sustained: { type: 'boolean', description: 'true if the original verdict survives your attempt to refute it' },
    overturned_defects: { type: 'array', items: { type: 'string' } },
    missed_defects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'what', 'evidence'],
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          what: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    corrected_score: { type: 'number', description: '0-100 after your own independent look' },
    note: { type: 'string' },
  },
}

// ---- Phase 1: build. 12 independent builders, arms shuffled across anonymized dirs.
// model: 'sonnet' [claude-justified: the built artifact IS the experiment's dependent
// variable, so both arms must run one identical capable model; arm B additionally has to
// drive raven MCP tools (read_design_md / get_taste_profile / audit_taste) to build at all.]
phase('Build')
log('12 builders: 6 composed-prompt, 6 one-liner, shuffled across build-01..12')
const built = await parallel(
  BUILDS.map((b) => () => {
    const dir = `${R2}/${b}`
    const prompt = ARMS[b] === 'A' ? armAPrompt(dir) : armBPrompt(dir)
    return agent(prompt, { label: `build:${b}`, phase: 'Build', model: 'sonnet', effort: 'medium' })
  }),
)
log(`${built.filter(Boolean).length}/12 builders returned`)

// ---- Phase 2: mechanical capture + machine judge. Genuine barrier: both are single
// batch processes that need every artifact present. model: 'haiku' — these legs only
// shell out to a pre-written deterministic script and echo stdout.
phase('Capture')
const dirList = BUILDS.map((b) => `${R2}/${b}`).join(' ')
await parallel([
  () =>
    agent(
      `Run exactly this command from /Users/accunliffe/projects/raven-mcp and report its stdout verbatim:\n\nnode ${R2}/capture.mjs ${dirList}\n\nIt renders each build headless and writes idle.png + postsave.png into each build dir, and prints one JSON line per build including measured font sizes for the confirmation message and the inline Undo. Do not edit any file. If a build errors, report it and continue — the script already tolerates missing artifacts. Your final message must be the raw stdout lines.`,
      { label: 'capture:all', phase: 'Capture', model: 'haiku', effort: 'low' },
    ),
  () =>
    agent(
      `Run exactly this command from /Users/accunliffe/projects/raven-mcp and report its stdout verbatim:\n\nnode ${R2}/judge-batch.mjs ${dirList}\n\nIt runs audit_taste (profile "andrew", surface "portfolio editor surface") and talon_scan against each build's index.html through the stdio server and writes audit-taste.json + talon-scan.json into each build dir plus round2/machine-judge.json. Do not edit any file. Your final message must be the raw JSON it prints.`,
      { label: 'machine-judge:all', phase: 'Capture', model: 'haiku', effort: 'low' },
    ),
])

// ---- Phase 3+4: blind judge then adversarial refute, pipelined per build so a build's
// refuter starts as soon as its judge lands.
// model: 'sonnet' [claude-justified: both legs must READ rendered PNGs at full resolution
// and measure proportions off the image — this is the eyes-on judgement the whole gate
// turns on, and a text-only or weaker-vision tier cannot perform it.]
phase('Judge')
const judged = await pipeline(
  BUILDS,
  (b) =>
    agent(
      `You are judging ONE build of a snackbar component for an optimistic save (confirmation message + inline Undo + explicit dismiss), built against the design system at ${BASE}/arena/DESIGN.md.

Judge ONLY these three files:
- ${R2}/${b}/postsave.png  (the snackbar visible — this is the load-bearing state)
- ${R2}/${b}/idle.png
- ${R2}/${b}/index.html

Read both PNGs with the Read tool and look at them properly at full resolution — the rendered result is what matters, not the source. Use the HTML/CSS only to get exact measured values (font sizes in px, hex colors, spacing) to back your claims.

HARD RULES:
- Do NOT read ${R2}/${b}/BUILD-LOG.md, any other build-NN directory, ARM-PROMPTS.md, composed-prompt-fair.md, or skeleton files. Several builds exist and you must judge yours on its own merits.
- If the HTML contains comments about how it was produced, disregard them — they are noise, not evidence.
- Every defect needs measured evidence (a px value, a hex, a line number), never an impression.

Judge as a design-exacting owner would: visual hierarchy and PROPORTION (is the inline action sized sanely relative to the confirmation message?), restraint, type, color and contrast, spacing, the craft of the interaction. State the measured font size of the confirmation message and of the Undo action, and whether that relationship is defensible.

Set overall_score 0-100 for visible design quality of the post-save state and ship_ready for whether you would ship it as-is. Report build as "${b}".`,
      { label: `judge:${b}`, phase: 'Judge', schema: JUDGE_SCHEMA, model: 'sonnet', effort: 'medium' },
    ),
  (verdict, b) => {
    if (!verdict) return null
    return agent(
      `Another reviewer judged a snackbar build. Your job is to REFUTE their verdict — assume they are wrong and try to prove it. Default to overturning a defect if its evidence does not hold up.

Their verdict on ${b}:
${JSON.stringify(verdict, null, 2)}

Check it against the artifact yourself:
- ${R2}/${b}/postsave.png  (read it at full resolution)
- ${R2}/${b}/idle.png
- ${R2}/${b}/index.html

HARD RULES:
- Do NOT read ${R2}/${b}/BUILD-LOG.md, any other build-NN directory, ARM-PROMPTS.md, composed-prompt-fair.md, or skeleton files.
- Verify each claimed measurement against the CSS or the render. A defect whose measured evidence is wrong is overturned.
- Also report defects the reviewer MISSED, with your own measured evidence.

Set sustained=true only if the overall verdict survives. Give your own corrected_score 0-100. Report build as "${b}".`,
      { label: `refute:${b}`, phase: 'Adversarial', schema: REFUTE_SCHEMA, model: 'sonnet', effort: 'medium' },
    ).then((r) => ({ build: b, verdict, refutation: r }))
  },
)

const rows = judged.filter(Boolean)
log(`${rows.length}/12 builds judged and adversarially checked`)

// ---- Phase 5: methodological critic, still blind to arms.
// model: 'sonnet' [claude-justified: reasons over the full paired judge/refuter matrix and
// must reach conclusions about confounds and spread that decide whether a tool gets deleted.]
phase('Critic')
const critic = await agent(
  `You are auditing the METHOD of a controlled comparison, not its result. Twelve builds of the same snackbar component were produced from two different kinds of build instruction (which is which is withheld from you), then each was blind-judged and adversarially refuted.

Here are the paired judge/refuter results:
${JSON.stringify(rows.map((r) => ({ build: r.build, score: r.verdict?.overall_score, ship_ready: r.verdict?.ship_ready, defects: r.verdict?.defects, proportion: r.verdict?.proportion_verdict, refute_sustained: r.refutation?.sustained, refute_score: r.refutation?.corrected_score, refute_note: r.refutation?.note, missed: r.refutation?.missed_defects })), null, 2)}

Supporting evidence on disk: ${R2}/machine-judge.json, and per build ${R2}/build-NN/{index.html,idle.png,postsave.png,audit-taste.json,talon-scan.json}.

Answer, concretely:
1. What would make this comparison UNSOUND as a basis for deleting or keeping a tool? Name specific confounds visible in the data.
2. Where do judge and refuter disagree most, and which of the two is better evidenced?
3. Is the score spread within each group large enough that a difference between groups could be noise? Say what N and what spread you actually see.
4. What measurement is MISSING that would settle the question?
5. Any sign that judges were not actually blind (e.g. a verdict that references provenance)?

Be specific and cite build ids. Do not speculate about which group is which.`,
  { label: 'critic:method', phase: 'Critic', model: 'sonnet', effort: 'high' },
)

return {
  builds: rows.map((r) => ({
    build: r.build,
    score: r.verdict?.overall_score ?? null,
    ship_ready: r.verdict?.ship_ready ?? null,
    one_line: r.verdict?.one_line ?? null,
    proportion: r.verdict?.proportion_verdict ?? null,
    defects: r.verdict?.defects ?? [],
    refute_sustained: r.refutation?.sustained ?? null,
    refute_score: r.refutation?.corrected_score ?? null,
    refute_note: r.refutation?.note ?? null,
    overturned: r.refutation?.overturned_defects ?? [],
    missed: r.refutation?.missed_defects ?? [],
  })),
  critic,
}
