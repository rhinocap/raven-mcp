export const meta = {
  name: 'pregate-ablation',
  description: 'Blind re-judge of 12 snackbar builds after ablating the composer-caused type token',
  phases: [
    { title: 'Judge', detail: '12 blind judges, one per ablated build' },
    { title: 'Adversarial', detail: '12 refuters, pipelined per build' },
  ],
}

const BASE = '/Users/accunliffe/projects/raven-mcp/.claude/pregate-2026-08-02'
const ABL = `${BASE}/round2/ablation`
const BUILDS = ['abl-01','abl-02','abl-03','abl-04','abl-05','abl-06','abl-07','abl-08','abl-09','abl-10','abl-11','abl-12']

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

// Judge + refute prompts are reused VERBATIM from wf_7ac08a99-1e0 with only the build
// directory swapped, so scores are comparable across rounds. Changing the instrument
// would make the ablation uninterpretable.
// model: 'sonnet' [claude-justified: both legs must READ rendered PNGs at full resolution
// and measure proportions off the image — the same eyes-on judgement the gate turns on.]
phase('Judge')
log('12 blind judges over the ablated set (message type token normalised to body scale)')

const judged = await pipeline(
  BUILDS,
  (b) =>
    agent(
      `You are judging ONE build of a snackbar component for an optimistic save (confirmation message + inline Undo + explicit dismiss), built against the design system at ${BASE}/arena/DESIGN.md.

Judge ONLY these three files:
- ${ABL}/${b}/postsave.png  (the snackbar visible — this is the load-bearing state)
- ${ABL}/${b}/idle.png
- ${ABL}/${b}/index.html

Read both PNGs with the Read tool and look at them properly at full resolution — the rendered result is what matters, not the source. Use the HTML/CSS only to get exact measured values (font sizes in px, hex colors, spacing) to back your claims.

HARD RULES:
- Do NOT read any other abl-NN directory, any build-NN directory, ARM-PROMPTS.md, composed-prompt-fair.md, or skeleton files. Several builds exist and you must judge yours on its own merits.
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
- ${ABL}/${b}/postsave.png  (read it at full resolution)
- ${ABL}/${b}/idle.png
- ${ABL}/${b}/index.html

HARD RULES:
- Do NOT read any other abl-NN directory, any build-NN directory, ARM-PROMPTS.md, composed-prompt-fair.md, or skeleton files.
- Verify each claimed measurement against the CSS or the render. A defect whose measured evidence is wrong is overturned.
- Also report defects the reviewer MISSED, with your own measured evidence.

Set sustained=true only if the overall verdict survives. Give your own corrected_score 0-100. Report build as "${b}".`,
      { label: `refute:${b}`, phase: 'Adversarial', schema: REFUTE_SCHEMA, model: 'sonnet', effort: 'medium' },
    ).then((r) => ({ build: b, verdict, refutation: r }))
  },
)

const rows = judged.filter(Boolean)
log(`${rows.length}/12 judged and refuted`)
return { rows }
