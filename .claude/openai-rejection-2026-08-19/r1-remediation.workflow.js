// R1 REMEDIATION GRAPH — OpenAI rejection reason 1 ("test cases did not produce
// correct results ... consistently on both ChatGPT web and mobile").
//
// SHAPE NOTE. ~/.claude/reference/graph-template.workflow.js is a DISCOVERY loop
// (find -> refute -> terminate-on-dry). R1's findings are already enumerated and
// measured; what is missing is a correct PATCH for each. So this is a work-list
// pipeline, not a discovery loop — but it carries the template's load-bearing
// decisions verbatim: filled CHARTER, typed nodes, pipeline-not-barrier,
// three-way verdict (unproven != refuted), explicit per-leg model routing, and
// null accounting before any .filter(Boolean).
//
// HARD SCOPE: every leg is READ-ONLY. No leg edits a file, runs a build, runs the
// test suite, commits, pushes, or calls the live endpoint. Specs come back as
// text; the orchestrator applies every edit in the main session, because
// concurrent agents editing src/index.ts would conflict and because
// implementation integration never leaves the main session.

export const meta = {
  name: 'r1-remediation',
  description: 'Spec + adversarially verify the fixes for OpenAI rejection reason 1',
  phases: [
    { title: 'Spec',    detail: 'one read-only analysis leg per work item' },
    { title: 'Refute',  detail: 'adversarial pass per spec — blast radius and correctness' },
    { title: 'Rank',    detail: 'single synthesis into an ordered apply plan' },
  ],
}

const CHARTER = {
  dry_means:
    'N/A — this is a work-list pipeline, not a discovery loop. The run is complete when every ' +
    'one of the 6 enumerated items has a spec that survived its adversary or is explicitly ' +
    'marked do-not-apply with a reason.',
  out_of_scope:
    'Anything Andrew-gated: pushing main (which deploys mcp.ravenmcp.ai), npm publish, the ' +
    'audit_url keep-or-remove decision, the submission-form rewrite, resubmission. Also out: ' +
    'browser/raven-grab.js and its mirror, the taste/decision/pattern-library subsystems, and ' +
    'the R2 annotation work (already fixed and verified this session).',
  falsifiers:
    'A spec that does not cite file:line from the real tree did not read the code. An adversary ' +
    'that returns "looks fine" without naming what it tried to break did not run.',
  consumer:
    'The orchestrator applies the surviving specs by hand in the main session, then re-runs the ' +
    'suite, the two-surface annotation probe and the whole-payload diff before anything is ' +
    'claimed fixed. Andrew then decides on the push.',
  coverage_floor:
    'src/index.ts audit_contrast + list_creative_models registrations, src/contrast.ts, ' +
    'src/browser-launch.ts, api/mcp.js, the MCP SDK transport, and every test that pins a ' +
    'tool description or the anon tools/list payload.',
}

const REPO = '/Users/accunliffe/projects/raven-mcp'

const COMMON = `
REPO: ${REPO} (read it directly; you are on the real tree, branch main).

CONTEXT — why this work exists. OpenAI rejected Raven's plugin submission on
2026-08-19 for two reasons. Reason 2 (annotations not explicitly true/false) is
ALREADY FIXED this session. You are working on reason 1, verbatim:

  "One or more of your test cases did not produce correct results. Please re-run
   all submitted test cases and align tool behavior/output with the documented
   expected outcomes. Ensure the same test cases pass consistently on both
   ChatGPT web and mobile."

The reviewed surface is the ANONYMOUS hosted endpoint https://mcp.ravenmcp.ai/api/mcp
(45 tools), NOT the 111-tool stdio build. buildServer({remote:true}) is that surface.

MEASURED GROUND TRUTH (do not re-derive, do not contradict without evidence):
 - Submitted positive case P1 = audit_contrast on https://ravenmcp.ai. It returns a
   single 412,915-character / 457,881-byte text blob in ~12.3s.
 - Two independent agents observed P1 INTERMITTENTLY failing across 6 attempts with
   "page.evaluate: Target page, context or browser has been closed",
   "page.goto: net::ERR_INSUFFICIENT_RESOURCES", and
   "audit_contrast url mode needs headless chromium".
 - The expected value in the submission drifted: P1 was documented as 373 text
   elements / 373 AA passes / 0 failures; it now returns 344 with many rows
   status:"indeterminate", reason "ancestor-opacity".
 - src/index.ts:4456-4496 is the audit_contrast registration.
 - src/contrast.ts:568 ELEMENT_CAP=600; ContrastResult carries rows[], aa_failures[]
   AND indeterminate_bg_rows[], the latter two being verbatim copies of subsets of
   rows[] — the payload is redundant by construction.
 - Both audit_contrast success branches use JSON.stringify(x, null, 2) — pretty-printed.
 - src/browser-launch.ts browserConcurrencyCap() defaults to 2.
 - grep -rn "outputSchema" src/ returns EMPTY.

HARD CONSTRAINTS you must respect in any spec you propose:
 1. READ-ONLY. Do not edit, build, test, commit, or call the network. Return text.
 2. The anonymous 45-tool golden NAME hash f64bb18529f458276acfe7886bd912165faa0b6f7d12025e51b79eb7782bb0a6
    is FROZEN. Never propose adding, removing or renaming a tool.
 3. Adding/removing a tool moves SIX count-asserting test suites and manifest.json.
    An annotation- or description-only change adds no tool but MAY still move a
    test that pins a description string. Any spec touching a tool description MUST
    name every test that pins it (grep test/ for the string).
 4. "Two copies of one rule is drift" is this codebase's own repeatedly-documented
    doctrine. Prefer deriving a second answer from the first table over writing a
    second list.
 5. Cite file:line for every claim. A spec with no citations is rejected.

OUTPUT: a precise patch spec someone can apply without re-reading the whole file —
exact file, exact anchor text to find, exact replacement, and what breaks if wrong.
`

const ITEMS = [
  {
    key: 'payload-size',
    prompt: `${COMMON}
YOUR ITEM: shrink audit_contrast's url-mode response from 412,915 characters.

Community reports (not official OpenAI docs) converge on a ~72-75k-token truncation
ceiling for MCP tool results. A 412k-char blob is far past that, so a reviewer on
ChatGPT web or mobile plausibly sees a TRUNCATED, unparseable result — which reads
exactly as "did not produce correct results", and would differ between surfaces.

Three levers, in increasing blast radius. Evaluate ALL THREE and recommend:
 (a) drop the ", null, 2" pretty-print argument. Zero semantic change.
 (b) stop emitting the duplicated subset arrays (aa_failures, indeterminate_bg_rows
     are verbatim copies of rows[] members). Read src/contrast.ts ContrastResult and
     find EVERY consumer — audit_url, suggest_contrast_fix routing, collapse helpers,
     tests — before proposing this. If any consumer reads aa_failures directly, say so.
 (c) return a summary + failing rows only, with full rows behind an opt-in argument
     defaulting to off. Note: adding an optional argument to a tool on the anon
     surface CHANGES the tools/list input schema for that tool. State that cost.

Say which of the three you recommend and which you would NOT apply, with reasons.`,
  },
  {
    key: 'intermittency',
    prompt: `${COMMON}
YOUR ITEM: diagnose the INTERMITTENT audit_contrast failure. This is the single best
fit for "did not produce correct results ... consistently".

HYPOTHESIS TO FALSIFY, NOT ASSUME: browserConcurrencyCap() defaults to 2, so two full
Chromium instances can run in one serverless container and exhaust memory/fds,
producing ERR_INSUFFICIENT_RESOURCES and crashed-browser errors.

Read src/browser-launch.ts end to end (launchAuditChromium, acquireBrowserSlot,
wrapRemoteBrowser, sweepStaleTmpEntries) and src/contrast.ts auditContrastUrl.

Answer, each with citations:
 1. Is the concurrency cap actually reachable in the deployed shape? What invokes a
    second concurrent launch inside one container — is it one request doing two
    launches, or two requests sharing a warm lambda? Cite the code that decides.
 2. A slot LEAK has already been ruled out (auditContrastUrl closes in a finally;
    wrapRemoteBrowser.close releases in its own finally). What OTHER mechanisms could
    produce these exact three error strings? Enumerate and rank them.
 3. Spec a retry: exactly one clean relaunch when the error matches the crashed-browser
    classes. Where does it go so it covers audit_contrast without silently changing
    every other launchAuditChromium caller? Name the tradeoff of each placement.
 4. Should the REMOTE default cap drop to 1? What is the cost, and is there anything
    in the repo that would then serialize and time out?
 5. Anything here that CANNOT be fixed repo-side and needs a platform/config change —
    say so plainly rather than inventing a code fix for it.`,
  },
  {
    key: 'iserror',
    prompt: `${COMMON}
YOUR ITEM: tools return failures as SUCCESSFUL text results instead of MCP isError:true.

Confirmed instances in src/index.ts audit_contrast (~4456-4496): the
CaptureUnavailableError catch returns a normal text result, and the no-argument
fallback ("Provide either url or dom_snapshot") likewise. The 2026-07-25 submission
dossier documents the same class for audit_page as a KNOWN, deliberately-unfixed
behaviour, noting "A reviewer running a negative case may read that as the call
having succeeded."

That is now a live rejection hypothesis: the submitted negative test cases may have
been graded as producing incorrect results precisely because they reported success.

Do this:
 1. ENUMERATE every tool on the ANONYMOUS 45 surface that returns an error-shaped
    message as a non-isError text result. Grep for the giveaway phrasings
    ("Provide either", "needs headless chromium", "disabled on the hosted",
    "not available", "Unknown"). Give file:line for each.
 2. For the three submitted NEGATIVE cases specifically (unreachable URL via audit_url;
    audit_page with neither html nor url; a gated url argument on the hosted endpoint)
    — state for EACH what shape it returns today and whether a reviewer would read it
    as success.
 3. Spec the narrowest correct fix. The dossier says fixing this "means touching every
    tool's validation path, which changes output for existing consumers". Test that
    claim: is there a shared registration wrapper in buildServer() where isError could
    be set once? If yes, cite it. If no, say the claim holds.
 4. Name every test that would go red. Be exhaustive — grep test/ for the message strings.
 5. State the risk of the fix in the direction that matters: making something isError
    that consumers currently parse as text is a BREAKING change for existing users.`,
  },
  {
    key: 'descriptions',
    prompt: `${COMMON}
YOUR ITEM: tool descriptions that overclaim scope. OpenAI's reviewers test whether a
tool does what it says.

Three known instances:
 (a) list_creative_models (registration ~src/index.ts:6656, case ~:1082) advertises
     capability slots whose EXECUTION tool (create_generation_job) is NOT on the
     anonymous 45 surface. An anonymous caller is told about capabilities it cannot use.
 (b) get_brand_principles names "logos" as a trigger keyword.
 (c) The accessibility audits (audit_contrast, audit_tap_targets, audit_ios_a11y) name
     real WCAG success criteria while covering roughly 2 of ~50, with no scope
     disclaimer — a reviewer could read them as claiming WCAG conformance testing.

Do this:
 1. Read each registration and quote the current description verbatim.
 2. Propose a narrowed description for each that is HONEST without being apologetic —
    Andrew's register is restrained editorial, show don't sell. Do not add marketing.
    Do not add a disclaimer longer than the description.
 3. CRITICAL: any description change alters the anonymous tools/list payload. Grep
    test/ for every test that pins a description or a payload hash and name each one
    with file:line. State explicitly which of your proposed edits move a pinned test.
 4. If a tool's description is fine as-is, say so and do not propose an edit. An
    unnecessary payload change is a cost with no benefit.`,
  },
  {
    key: 'outputschema',
    prompt: `${COMMON}
YOUR ITEM: outputSchema. grep -rn "outputSchema" src/ returns EMPTY — no tool declares one.

The MCP spec added outputSchema + structuredContent. It is RECOMMENDED, not required,
and OpenAI's rejection did not name it. So the first question is whether this is worth
doing at all.

Do this:
 1. Read package.json and node_modules/@modelcontextprotocol/sdk to determine the exact
    SDK version in use and whether server.tool()/registerTool() in THAT version supports
    outputSchema at all. Cite the SDK source you read. If it does not support it, stop —
    that is the answer, and say so.
 2. If supported: what is the call-signature change? server.tool() is called ~111 times
    in src/index.ts and there is a registration wrapper that splices annotations in.
    Would outputSchema go through the same wrapper?
 3. Note the trap: declaring outputSchema obliges the tool to return structuredContent
    matching it. Every audit tool currently returns JSON-as-text. Adding a schema without
    adding structuredContent would be an annotation-does-not-match-behaviour defect —
    the EXACT class Raven was just rejected for. Weigh that.
 4. Give a clear RECOMMEND / DO NOT RECOMMEND with reasons. "Do not recommend, here is
    why" is a fully acceptable and possibly correct answer.`,
  },
  {
    key: 'accept-header',
    prompt: `${COMMON}
YOUR ITEM: locate or REFUTE a reported transport finding.

CLAIM UNDER AUDIT: "the MCP transport requires a strict Accept header, and a client
that does not send both application/json and text/event-stream gets rejected" — which
would explain the rejection's "consistently on both ChatGPT web and mobile", since two
clients can differ in exactly that header.

STATUS: this came from a single agent vote whose refuter died, so it is UNVERIFIED. A
grep of api/mcp.js found NO Accept-header check — the only match is a 405 message string.

Do this:
 1. Read api/mcp.js end to end. Confirm or deny that it performs no Accept validation.
 2. Then read the MCP SDK transport it uses (find the import; look for
    StreamableHTTPServerTransport or similar in node_modules/@modelcontextprotocol/sdk).
    Does THAT layer enforce an Accept requirement? Quote the exact code and file path.
 3. Return one of exactly three verdicts:
    CONFIRMED — with the file:line that enforces it, and what a non-conforming client sees.
    REFUTED — with the evidence that nothing enforces it anywhere in the request path.
    UNPROVEN — you could not reach the SDK source. Say what stopped you.
    Do NOT collapse "I could not establish it" into REFUTED.
 4. If CONFIRMED, spec the fix. If REFUTED or UNPROVEN, propose NO edit.`,
  },
]

const SPEC = {
  type: 'object',
  required: ['item', 'verdict', 'summary', 'edits', 'tests_at_risk', 'citations'],
  properties: {
    item: { type: 'string' },
    verdict: {
      type: 'string',
      enum: ['apply', 'apply-with-caution', 'do-not-apply', 'unproven'],
      description: 'do-not-apply and unproven are first-class answers, not failures',
    },
    summary: { type: 'string', description: 'one paragraph: what is wrong and what the fix is' },
    edits: {
      type: 'array',
      description: 'empty is correct when verdict is do-not-apply or unproven',
      items: {
        type: 'object',
        required: ['file', 'anchor', 'change', 'rationale'],
        properties: {
          file: { type: 'string' },
          anchor: { type: 'string', description: 'exact existing text to locate, unique in the file' },
          change: { type: 'string', description: 'exact replacement or precise description of it' },
          rationale: { type: 'string' },
          breaking: { type: 'boolean', description: 'true if this changes output existing consumers parse' },
        },
      },
    },
    tests_at_risk: {
      type: 'array',
      items: { type: 'string', description: 'test/file.mjs:line — what pins it and why it moves' },
    },
    payload_impact: {
      type: 'string',
      description: 'does this change the anonymous tools/list payload? names / descriptions / schemas / none',
    },
    citations: {
      type: 'array',
      items: { type: 'string', description: 'file:line actually read' },
    },
    gave_up: { type: 'string', description: 'set ONLY if you could not complete the analysis' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['stands', 'attacked', 'problems'],
  properties: {
    stands: { type: 'string', enum: ['stands', 'needs-revision', 'refuted', 'unproven'] },
    attacked: {
      type: 'string',
      description: 'what you actually tried to break — name the specific inputs, consumers or tests you checked',
    },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        required: ['what', 'evidence'],
        properties: {
          what: { type: 'string' },
          evidence: { type: 'string', description: 'file:line or a concrete failing scenario' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
        },
      },
    },
    missed: { type: 'string', description: 'anything the spec did not consider that it should have' },
  },
}

phase('Spec')

const graded = await pipeline(
  ITEMS,
  (item) =>
    agent(item.prompt, {
      label: `spec:${item.key}`,
      phase: 'Spec',
      schema: SPEC,
      model: 'sonnet',
      effort: 'medium',
    }),
  (spec, item) => {
    if (!spec) return { item: item.key, spec: null, verdict: null }
    return agent(
      `You are the ADVERSARY. Your job is to BREAK the patch spec below, not to approve it.
Default to finding a problem. "stands" is a verdict you must earn by failing to break it.

${COMMON}

THE SPEC UNDER AUDIT (item: ${item.key}):
${JSON.stringify(spec, null, 2)}

Attack it on these axes, and say in "attacked" which ones you actually ran:
 1. DOES THE ANCHOR EXIST? Grep the exact anchor text in the named file. If it is not
    unique, or not present, that alone is needs-revision — an anchor that matches twice
    silently patches the wrong site.
 2. BLAST RADIUS. Grep every consumer of anything the spec changes. Does something read
    the field it removes, the shape it alters, the string it rewrites?
 3. TESTS. Is tests_at_risk complete? Grep test/ yourself for the changed strings and
    symbols. A missing entry here is a red suite the orchestrator did not expect.
 4. PAYLOAD. If this touches a tool description or input schema, it changes the anonymous
    tools/list payload. Is payload_impact honest? The 45-tool NAME hash must not move —
    check the spec does not add, remove or rename a tool.
 5. DOES IT ACTUALLY FIX THE STATED PROBLEM? A spec can be safe, applicable and beside
    the point. Trace the reviewer-visible symptom to the change.
 6. IS IT THE RIGHT SIZE? Over-fixing is a real failure here: an unnecessary change to a
    live endpoint under review costs risk with no benefit.

If the spec's verdict is already do-not-apply or unproven, your job inverts: try to show
it SHOULD be applied. Do not rubber-stamp a refusal either.`,
      {
        label: `refute:${item.key}`,
        phase: 'Refute',
        schema: VERDICT,
        model: 'sonnet',
        effort: 'medium',
      }
    ).then((v) => ({ item: item.key, spec, verdict: v }))
  }
)

// NULL ACCOUNTING BEFORE ANY FILTER. agent() returns null when a node DIES, and
// .filter(Boolean) would make a total outage identical to "everything is fine".
const deadSpecs = graded.filter((g) => !g || !g.spec).length
const deadVerdicts = graded.filter((g) => g && g.spec && !g.verdict).length
const gaveUp = graded.filter((g) => g && g.spec && g.spec.gave_up).map((g) => g.item)
log(`legs: ${ITEMS.length} items | dead specs: ${deadSpecs} | dead adversaries: ${deadVerdicts} | gave_up: ${gaveUp.join(', ') || 'none'}`)

const alive = graded.filter((g) => g && g.spec)
if (alive.length === 0) {
  return { error: 'every spec leg died — this is an outage, not a clean result', deadSpecs, deadVerdicts }
}

phase('Rank')

const plan = await agent(
  `You are the integrator's analyst. Below are ${alive.length} patch specs for OpenAI
rejection reason 1, each paired with an adversarial verdict (or null if the adversary died).

${COMMON}

${JSON.stringify(alive, null, 2)}

RUN HEALTH — state this honestly in your output and do not paper over it:
  items: ${ITEMS.length} | dead spec legs: ${deadSpecs} | dead adversary legs: ${deadVerdicts}
  legs that gave up: ${gaveUp.join(', ') || 'none'}
A spec whose adversary is null is UNVERIFIED — rank it as such, never as "stands".

Produce an ORDERED APPLY PLAN for the orchestrator, who will hand-apply these in the
main session and then re-run the full suite, the two-surface annotation probe, and the
whole-payload diff before claiming anything is fixed.

Order by: (risk-adjusted impact on the actual rejection) DESC. A zero-risk change that
plausibly fixes the rejection outranks a large refactor that certainly improves things.

For each item state: apply or hold, the order index, why, and the single thing most
likely to go wrong when applied.

Then, separately and explicitly:
 - Which items are NOT agent-actionable and belong to Andrew (pushing main deploys the
   live endpoint; the audit_url decision; the submission-form rewrite; resubmission).
 - What this run did NOT establish. Be specific. An honest gap list is the most valuable
   part of this output.
 - Whether any two specs CONFLICT — touch the same lines, or one's fix undoes another's.`,
  { label: 'apply-plan', phase: 'Rank', model: 'opus', effort: 'high' }
)

return {
  health: { items: ITEMS.length, deadSpecs, deadVerdicts, gaveUp },
  specs: alive,
  plan,
}
