export const meta = {
  name: 'openai-rejection-forensics',
  description: 'Diagnose why OpenAI rejected Raven v1.0.0 and produce a verified remediation plan',
  phases: [
    { title: 'Evidence', detail: 'four independent lenses on the two cited rejection reasons' },
    { title: 'Refute', detail: 'adversarial verification of every claimed defect' },
    { title: 'Synthesize', detail: 'ranked remediation plan for resubmission' },
  ],
}

// ─── GROUND TRUTH shared by every leg ────────────────────────────────────────
const GROUND = `
CONTEXT — you are diagnosing a REJECTION, not auditing a codebase.

Raven (v1.0.0) was submitted to the OpenAI plugin/apps directory on 2026-07-26 and
was REJECTED. The rejection email cited exactly two reasons, verbatim:

  (R1) "One or more of your test cases did not produce correct results. Please
       re-run all submitted test cases and align tool behavior/output with the
       documented expected outcomes. Ensure the same test cases pass consistently
       on both ChatGPT web and mobile."

  (R2) "One or more of your tool's annotations do not appear to match the tool's
       behavior. Please confirm annotations are explicitly set to true or false
       (not null) for every tool. Include a clear justification for why the hint
       is set that way based on the tool's actual behavior."

THE REVIEWED SURFACE is the ANONYMOUS hosted endpoint, NOT the npm/stdio build:
  POST https://mcp.ravenmcp.ai/api/mcp
  Headers: 'Content-Type: application/json' and
           'Accept: application/json, text/event-stream'
  Body: JSON-RPC 2.0, e.g.
    {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
    {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"X","arguments":{}}}
  It serves exactly 45 tools, no auth. The 111-tool stdio build is NOT what was reviewed.
  A cached copy of tools/list is at:
    .claude/openai-rejection-2026-08-19/agent-output/anon-tools.json

ALREADY MEASURED BY THE ORCHESTRATOR (treat as given, do not re-derive, but you MAY
falsify if you find contrary evidence):
  - Live anon tool count = 45; name-hash matches the frozen golden hash (surface unchanged
    since submission).
  - EVERY one of the 45 tools sets title, readOnlyHint, destructiveHint, openWorldHint,
    all boolean. NONE of the 45 sets idempotentHint. 0/45 have outputSchema.
  - Source: src/index.ts function toolAnnotations() at ~line 2174; it emits exactly
    3 hints + title (lines ~2184-2185). The comment at ~line 2170 records the OpenAI
    requirement as three hints — that appears to be the original misreading.
  - The submission filled "135 justification fields = 3 per tool x 45 tools".

WHAT WAS SUBMITTED AS TEST CASES (recorded in
conversations/2026-07-25-distribution-channels.md, session of 2026-07-26 — this is the
ONLY record we hold; the literal values live in OpenAI's dashboard which we cannot read):
  5 POSITIVE, each run against the live endpoint at submission time so "Expected output"
  quoted real numbers:
    P1 audit_contrast  — on ravenmcp.ai, expected "373 text elements"
    P2 audit_tap_targets — on ravenmcp.ai, expected "37 measured, 37 passing"
    P3 get_principles  — context "pricing page", expected count 28
    P4 list_design_systems + get_design_system — expected 12 systems; Stripe
       color.primary = #635BFF
    P5 get_checklist   — "landing-page"
  3 NEGATIVE (design-adjacent but out of scope, expected to be DECLINED):
    N1 generate a logo image
    N2 certify WCAG compliance
    N3 write React components

KNOWN HAZARDS recorded at submission time (verify whether still true):
  - score_page, audit_page, audit_typography have url-capture DISABLED on the hosted
    endpoint (src/index.ts ~1944-1946); they require html/nodes there.
  - audit_url exceeded 2 MINUTES on ravenmcp.ai even with one viewport and compact:true.
    It was deliberately excluded from the test cases.
  - The marketing site ravenmcp.ai has been REDEPLOYED SEVERAL TIMES since 2026-07-26
    (including a homepage typography change on 2026-08-12). Any expected value measured
    FROM that page is drift-prone.
  - Repo: /Users/accunliffe/projects/raven-mcp

SCOPE — HARD LIMITS FOR YOU:
  - READ-ONLY on the repo. Do NOT edit, write, stage, commit, push, build, or publish
    anything. Do NOT run npm test or npm run build.
  - You MAY make network calls to the live endpoint and MAY fetch public OpenAI docs.
  - Do NOT call any tool that writes to ~/.raven or the filesystem.
  - Write any scratch/raw output ONLY under
    .claude/openai-rejection-2026-08-19/agent-output/ (gitignored).

EVIDENCE STANDARD: a claim is only as good as the command that produced it. Quote the
exact request and the exact response substring. "The description implies X" is NOT
evidence about behavior — call the tool. If you cannot establish something, say
UNPROVEN; never round an unestablished claim up to a finding or down to a non-issue.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'ran_commands', 'findings', 'limits'],
  properties: {
    lens: { type: 'string', description: 'which lens you executed' },
    ran_commands: {
      type: 'integer',
      description: 'how many live endpoint calls / doc fetches you actually made',
    },
    limits: {
      type: 'string',
      description: 'what you could NOT establish and why. Required — write "none" only if truly none.',
    },
    findings: {
      type: 'array',
      maxItems: 14,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'rejection_reason', 'severity', 'evidence', 'claim', 'fix', 'fix_surface'],
        properties: {
          id: { type: 'string', description: 'short stable slug, e.g. "idempotent-missing"' },
          title: { type: 'string' },
          rejection_reason: {
            type: 'string',
            enum: ['R1-test-cases', 'R2-annotations', 'both', 'neither-but-blocking'],
          },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          claim: { type: 'string', description: 'the falsifiable one-sentence assertion' },
          evidence: {
            type: 'string',
            description: 'exact request + exact response substring, or exact file:line. No paraphrase.',
          },
          fix: { type: 'string', description: 'the specific change, concrete enough to implement' },
          fix_surface: {
            type: 'string',
            enum: ['repo-code', 'openai-form-resubmit', 'deploy', 'both-code-and-form', 'unknown'],
          },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reasoning', 'counter_evidence'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'unproven'] },
    reasoning: { type: 'string' },
    counter_evidence: {
      type: 'string',
      description: 'the command you ran to try to KILL the finding, and what it returned',
    },
  },
}

// ─── PHASE 1: four independent lenses ────────────────────────────────────────
const LENSES = [
  {
    key: 'testcases',
    model: 'sonnet',
    prompt: `LENS 1 — RE-RUN THE SUBMITTED TEST CASES (rejection reason R1).

Actually CALL the live endpoint for each of the 5 positive cases (P1-P5) listed in the
ground truth. For each one, report the value the server returns TODAY next to the value
that was submitted as "Expected output". Any mismatch is a finding — that is literally
what OpenAI says failed.

Specifically:
  - P1 audit_contrast on https://ravenmcp.ai — how many text elements TODAY vs 373?
  - P2 audit_tap_targets on https://ravenmcp.ai — measured/passing TODAY vs 37/37?
  - P3 get_principles context "pricing page" — count TODAY vs 28?
  - P4 list_design_systems count vs 12; get_design_system stripe color.primary vs #635BFF
  - P5 get_checklist "landing-page" — does it return, and what shape?

Then check the three NEGATIVE cases (N1 logo image, N2 certify WCAG, N3 write React
components). These are prompts the plugin should DECLINE. The question that matters:
is there any tool on the 45-tool anon surface whose name/description would plausibly
make a model call it for those asks, so the plugin appears to ATTEMPT an out-of-scope
task instead of declining? Name the specific tools and quote the description text.

Also time every call and report wall-clock latency — a reviewer hitting a timeout reads
it as "did not produce correct results".

Report each drifted expected value as its own finding.`,
  },
  {
    key: 'annotations',
    model: 'sonnet',
    prompt: `LENS 2 — ANNOTATION CORRECTNESS (rejection reason R2).

Two separate questions. Answer both; do not merge them.

(a) COMPLETENESS. The MCP specification defines FOUR tool annotation hints:
readOnlyHint, destructiveHint, idempotentHint, openWorldHint. Raven sets three.
Establish from the current MCP spec (fetch it — modelcontextprotocol.io) what the
DEFAULT is for an omitted idempotentHint, and therefore what behavior the omission
ASSERTS about each of the 45 tools. State whether that asserted behavior is TRUE or
FALSE for read-only knowledge tools. This is the strongest candidate for what OpenAI
flagged — but verify it rather than assuming it.

(b) ACCURACY — the harder half, and the one most likely to be missed. For EACH of the
45 tools, decide whether the hints it DOES set actually match what it does. Read
src/index.ts (TOOL_ACCESS, toolAnnotations, the handler for each tool) and, where the
behavior is not obvious from source, CALL the tool. Look hardest for:
  - a tool marked readOnlyHint:true that writes anything, anywhere (fs, ~/.raven, Redis,
    remote state) on the HOSTED path
  - a tool marked openWorldHint:false that nonetheless reaches the network (fetches a
    URL, renders a caller-supplied page in Chromium, resolves a font, calls an API)
  - a tool marked openWorldHint:true that never leaves the process
  - destructiveHint:false on anything with a delete/overwrite path
The submission's own record says it split openWorldHint as "8 tools render a caller-supplied
URL vs 37 that only touch request arguments and bundled data". VERIFY THAT 8/37 SPLIT
against the live surface and the source. Name any tool on the wrong side of it.

Produce, as part of your findings, the corrected 4-hint matrix for any tool whose current
annotation is wrong. Quote file:line for every claim about behavior.`,
  },
  {
    key: 'web-vs-mobile',
    model: 'sonnet',
    prompt: `LENS 3 — "CONSISTENTLY ON BOTH ChatGPT WEB AND MOBILE" (second half of R1).

OpenAI explicitly required the same test cases to pass on web AND mobile. Find every
reason a call that succeeds on web would fail, truncate, or time out on mobile.

Investigate concretely, with measurements:
  - RESPONSE SIZE. Measure the byte size of each of the 5 positive test cases' responses
    against the live endpoint. The orchestrator already measured get_principles at
    ~62,790 characters for one call. Establish OpenAI's documented response-size limits
    for apps/plugins (fetch the developer docs) and flag every tool that exceeds them.
    Also measure the tools/list payload itself (~63KB) against any documented cap.
  - LATENCY. Time each call. Find OpenAI's documented tool-call timeout and flag anything
    near or over it. The known hazard is audit_url at >2 minutes — confirm it still is,
    but do NOT let one slow call eat your budget: cap that single probe at ~150s.
  - TRANSPORT. Does the endpoint behave identically for a plain JSON Accept header vs
    an SSE Accept header? Does it require a session id? Any behavior that a different
    client shape would break.
  - Anything in OpenAI's docs about mobile-specific constraints on MCP/apps.

Every claim must carry the measured number. "Might be large" is not a finding; "62,790
chars against a documented 50,000 limit" is.`,
  },
  {
    key: 'policy',
    model: 'sonnet',
    prompt: `LENS 4 — WHAT ELSE WOULD BOUNCE IT (the reasons OpenAI did NOT itemize).

A rejection email lists the reasons the reviewer wrote down, not every reason. Fetch and
read OpenAI's current app/plugin developer guidelines and the "common rejection reasons"
help-center article, then audit Raven's submission against them.

Check at minimum, each against live evidence:
  - The submitted metadata that must still resolve: https://ravenmcp.ai/privacy (fetch it —
    does it 200 with a real policy?), the support contact, the domain-verification
    well-known path, the manifest.
  - outputSchema: the orchestrator measured 0/45 tools have one. Establish whether OpenAI
    treats this as "Recommended" or as an error TODAY (it was Recommended at submission).
  - Tool descriptions: any that overstate what the tool does, or that a reviewer could
    read as misrepresentation. Quote the worst offenders verbatim from the live tools/list.
  - The demo video requirement — the submission log flags this as the likeliest bounce
    (101s, and OpenAI asked for coverage "across all platforms (web, iOS, Android)").
    Establish what the current documented requirement actually is.
  - Anything about naming, branding, or the starter prompts.

Report only what you can ground in a fetched document or a live response. If the guidelines
page is not reachable, say so in limits rather than reasoning from memory about OpenAI
policy — your training data is not evidence about a live policy page.`,
  },
]

phase('Evidence')
log('Four lenses on the rejection: test-case drift, annotation correctness, web-vs-mobile, policy sweep')

const lensResults = await parallel(
  LENSES.map((l) => () =>
    agent(`${GROUND}\n\n${l.prompt}`, {
      label: `lens:${l.key}`,
      phase: 'Evidence',
      schema: FINDINGS_SCHEMA,
      agentType: 'general-purpose',
      model: l.model,
    }).then((r) => ({ ...r, _key: l.key }))
  )
)

// FAILURE ACCOUNTING — a dead node must never look like a clean lens.
const dead = []
const thin = []
const alive = []
lensResults.forEach((r, i) => {
  const key = LENSES[i].key
  if (!r) {
    dead.push(key)
  } else if (!Array.isArray(r.findings) || (r.ran_commands ?? 0) === 0) {
    thin.push(`${key} (ran_commands=${r?.ran_commands}, findings=${r?.findings?.length})`)
  } else {
    alive.push(r)
  }
})
if (dead.length) log(`DEAD LENSES (returned null, NOT "found nothing"): ${dead.join(', ')}`)
if (thin.length) log(`SUSPECT LENSES (no commands run — treat as unproven): ${thin.join(', ')}`)
log(`Lenses alive: ${alive.length}/${LENSES.length}`)

const allFindings = alive.flatMap((r) =>
  (r.findings || []).map((f) => ({ ...f, lens: r._key }))
)

// Dedup across lenses — the annotation and policy lenses will overlap on outputSchema.
const seen = new Set()
const deduped = []
for (const f of allFindings) {
  const k = `${f.rejection_reason}::${(f.id || f.title || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`
  if (seen.has(k)) continue
  seen.add(k)
  deduped.push(f)
}
log(`${allFindings.length} raw findings -> ${deduped.length} after dedup`)

// ─── PHASE 2: refute, with three outcomes ────────────────────────────────────
phase('Refute')

const LENS_ANGLES = [
  {
    tag: 'reproduce',
    ask: 'Try to REPRODUCE the evidence exactly as stated. Run the same command. If the quoted response substring does not appear, or the file:line does not say what is claimed, the finding is REFUTED. A finding you cannot re-run is UNPROVEN, not confirmed.',
  },
  {
    tag: 'relevance',
    ask: 'Grant the evidence and attack RELEVANCE: even if true, would this actually cause the rejection OpenAI wrote, on the ANONYMOUS 45-tool endpoint they reviewed? A true fact about the 111-tool stdio build, about a gated tool the reviewer cannot reach, or about a surface not submitted, is REFUTED as a cause of this rejection. Say so plainly.',
  },
]

const judged = await pipeline(
  deduped,
  (f) =>
    parallel(
      LENS_ANGLES.map((a) => () =>
        agent(
          `${GROUND}\n\nADVERSARIAL PASS — your job is to KILL this finding, not to agree with it.\n\nFINDING (${f.id}) [${f.rejection_reason} / ${f.severity}]\nTitle: ${f.title}\nClaim: ${f.claim}\nEvidence offered: ${f.evidence}\nProposed fix: ${f.fix}\n\nYOUR ANGLE — ${a.tag}: ${a.ask}\n\nReturn confirmed / refuted / UNPROVEN. Use UNPROVEN when you genuinely could not establish it either way — collapsing "I could not check" into "refuted" deletes real defects, and collapsing it into "confirmed" ships a guess. Your counter_evidence field must contain the actual command you ran and what it returned.`,
          {
            label: `refute:${a.tag}:${f.id}`,
            phase: 'Refute',
            schema: VERDICT_SCHEMA,
            agentType: 'general-purpose',
            model: 'sonnet',
          }
        )
      )
    ).then((votes) => {
      const live = votes.filter(Boolean)
      const refuted = live.filter((v) => v.verdict === 'refuted').length
      const confirmed = live.filter((v) => v.verdict === 'confirmed').length
      const status =
        live.length === 0 ? 'unproven'
          : refuted > confirmed ? 'refuted'
          : confirmed > 0 ? 'confirmed'
          : 'unproven'
      return { ...f, status, votes: live, dead_votes: votes.length - live.length }
    }),
  (r) => r
)

const survivors = judged.filter(Boolean)
const confirmed = survivors.filter((f) => f.status === 'confirmed')
const unproven = survivors.filter((f) => f.status === 'unproven')
const killed = survivors.filter((f) => f.status === 'refuted')
log(`Verdicts — confirmed ${confirmed.length}, unproven ${unproven.length}, refuted ${killed.length}`)

// ─── PHASE 3: synthesize ─────────────────────────────────────────────────────
phase('Synthesize')

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['root_cause_r1', 'root_cause_r2', 'actions', 'resubmission_blockers', 'open_questions'],
  properties: {
    root_cause_r1: { type: 'string', description: 'why the test cases failed, in one paragraph' },
    root_cause_r2: { type: 'string', description: 'why the annotations were flagged, in one paragraph' },
    actions: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['order', 'action', 'surface', 'owner', 'proves_done'],
        properties: {
          order: { type: 'integer' },
          action: { type: 'string' },
          surface: { type: 'string', enum: ['repo-code', 'openai-form-resubmit', 'deploy', 'andrew-manual'] },
          owner: { type: 'string', enum: ['claude', 'andrew'] },
          proves_done: { type: 'string', description: 'the exact command/observation that verifies it' },
        },
      },
    },
    resubmission_blockers: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string' },
    },
    open_questions: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
    },
  },
}

const plan = await agent(
  `${GROUND}

SYNTHESIS. Below are the findings that SURVIVED adversarial verification, plus the ones
that came back UNPROVEN and the ones that were REFUTED. Produce the remediation plan for
resubmitting Raven to the OpenAI directory.

CONFIRMED (${confirmed.length}):
${JSON.stringify(confirmed.map((f) => ({ id: f.id, reason: f.rejection_reason, sev: f.severity, title: f.title, claim: f.claim, evidence: f.evidence, fix: f.fix, surface: f.fix_surface })), null, 1)}

UNPROVEN (${unproven.length}) — carry these as open questions, never as facts:
${JSON.stringify(unproven.map((f) => ({ id: f.id, title: f.title, claim: f.claim })), null, 1)}

REFUTED (${killed.length}) — do NOT put these in the plan; list nothing about them:
${JSON.stringify(killed.map((f) => f.id))}

DEAD LENSES: ${dead.length ? dead.join(', ') : 'none'}
SUSPECT LENSES: ${thin.length ? thin.join(', ') : 'none'}

Rules for the plan:
  - Order actions so that anything requiring a DEPLOY of the live endpoint comes after all
    code changes, and anything Andrew must do by hand is called out as owner "andrew".
  - Two hard project constraints: npm publish is ANDREW-ONLY (passkey 2FA), and any change
    to what mcp.ravenmcp.ai serves is human-gated. Never assign those to claude.
  - The anonymous 45-tool name-hash is FROZEN. An action that adds or removes a TOOL on the
    anon surface is a blocker requiring Andrew's explicit decision — say so. Changing a
    tool's ANNOTATIONS does not change the name hash and is safe on that axis.
  - "proves_done" must be a command or an observation, never "verify it works".
  - If the confirmed set does not adequately explain BOTH cited rejection reasons, say that
    outright in the matching root_cause field rather than manufacturing an explanation.
    An honest "we did not establish why R1 fired" is worth more than a plausible story.`,
  {
    label: 'synthesize:plan',
    phase: 'Synthesize',
    schema: PLAN_SCHEMA,
    agentType: 'general-purpose',
    model: 'opus',
  }
)

return {
  lenses: { alive: alive.length, dead, thin },
  counts: {
    raw: allFindings.length,
    deduped: deduped.length,
    confirmed: confirmed.length,
    unproven: unproven.length,
    refuted: killed.length,
  },
  confirmed,
  unproven,
  refuted: killed.map((f) => ({ id: f.id, title: f.title })),
  plan,
}
