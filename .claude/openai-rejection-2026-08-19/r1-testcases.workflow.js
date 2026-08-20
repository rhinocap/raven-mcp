export const meta = {
  name: 'r1-testcases',
  description: 'Re-measure the OpenAI submission test cases after the isError/accept-header fixes, and root-cause the contrast value drift',
  phases: [
    { title: 'Investigate' },
    { title: 'Verify' },
    { title: 'Dossier' }
  ]
};

const REPO = '/Users/accunliffe/projects/raven-mcp';

const COMMON = `
You are working in the repo at ${REPO}. It is a design-intelligence MCP server.
Context you MUST hold:
- OpenAI rejected the plugin submission with two reasons. R1: "One or more of your test cases
  did not produce correct results. Please re-run all submitted test cases and align tool
  behavior/output with the documented expected outcomes."
- The submitted test cases are documented in conversations/2026-07-25-submission-dossier.md
  section B (5 positive, 3 negative).
- The reviewed surface is the ANONYMOUS remote build: buildServer({ remote: true }) - 45 tools.
- IMPORTANT PROCESS CONSTRAINTS:
  * dist/ is gitignored and built by \`npm run build\` (= clean && tsc). REBUILD before measuring;
    NEVER reason from file mtime.
  * setRemoteRuntime() is a ONE-WAY PER-PROCESS LATCH. A remote:true build and a
    local/browser build can NEVER share a process. Use separate node invocations.
  * An ad-hoc node script that imports project deps MUST live inside ${REPO}, never /tmp
    (ESM resolves from the script's own location; /tmp throws ERR_MODULE_NOT_FOUND).
  * Do NOT edit any source file. This is a MEASUREMENT and READING task only.
  * Do NOT run the full npm test suite.
  * Report MEASURED numbers with the command that produced them. Never estimate.
`;

phase('Investigate');

const findings = await parallel([
  () => agent(`${COMMON}
TASK A - root-cause the contrast value DRIFT.

The submission dossier documents audit_contrast on https://ravenmcp.ai returning
"373 text elements / 373 AA passes / 0 failures". A re-run during this investigation
returned 344, with many rows carrying "status":"indeterminate" and
"indeterminate_reason":"ancestor-opacity".

Answer, from the code in src/contrast.ts and git history:
1. What exactly does the "ancestor-opacity" indeterminate classification do? Quote the code
   and cite file:line.
2. When was it introduced (git log -S on the literal string)? Which commit, what date, what
   was the stated reason?
3. Does it plausibly explain a 373 -> 344 drop in COUNTED text elements, or does it only
   change the STATUS of rows that are still counted? Be precise about whether the drop is in
   the denominator or in the pass tally - these are different defects.
4. ELEMENT_CAP is 600 (src/contrast.ts:568). Confirm whether it is binding at these counts.
5. Is the current behaviour CORRECT (a genuine improvement in honesty) or a REGRESSION?
   Give a verdict with reasons. An element inside an opacity:0 or partially transparent
   ancestor genuinely cannot have its contrast computed from its own colors - decide whether
   the classification is sound and whether "indeterminate" is the right disposition.
6. Whatever your verdict: the documented expected output is now WRONG either way. State the
   one-sentence replacement wording for the dossier.

Return a structured report. Cite file:line for every code claim.`,
    { label: 'A:opacity-drift', phase: 'Investigate', model: 'sonnet' }),

  () => agent(`${COMMON}
TASK B - verify the THREE NEGATIVE test cases against the CURRENT build.

Several isError fixes were just applied to src/index.ts. Rebuild first (npm run build), then
write ONE script inside ${REPO} (delete it afterwards) that builds buildServer({remote:true})
and invokes the real registered tool handlers directly, and measure each of these:

N1. audit_url with url "https://this-host-does-not-resolve.invalid".
    Documented expectation: summary opens "AUDIT DID NOT RUN", zero captures, the
    ERR_NAME_NOT_RESOLVED cause in warnings[], no crash, no hang.
    MEASURE: does the summary actually open with that string? how many captures? what is in
    warnings[]? is isError now true? what is the wall time?
N2. audit_page with NEITHER html NOR url.
    Documented expectation (and known-gap note): the text "Provide either html or url",
    previously WITHOUT isError. MEASURE whether isError is now true and the text is unchanged.
N3. audit_page with a \`url\` argument on the remote surface (the REMOTE_ARG_GUARDS path).
    Documented expectation: a refusal explaining url-capture is disabled remotely, rejected
    BEFORE the handler runs. MEASURE the exact refusal text and whether it carries isError.

For each: report the EXACT observed text (first 400 chars), the isError value, and the wall
time in ms. Then state, per case, whether the DOCUMENTED expectation in the dossier is now
accurate, and if not, give the corrected expectation wording.

Note N1 hits the network. If DNS resolution behaves oddly in this environment, say so
explicitly rather than reporting a number you cannot stand behind.`,
    { label: 'B:negative-cases', phase: 'Investigate', model: 'sonnet' }),

  () => agent(`${COMMON}
TASK C - re-measure the FIVE POSITIVE test cases: output SIZE and LATENCY.

A payload-size trim was applied earlier in this session and has NOT been re-measured against
a real page. Rebuild (npm run build), then write ONE script inside ${REPO} (delete it
afterwards) that builds buildServer({remote:true}) and invokes each tool handler directly,
measuring for each call: total response character count, byte count (Buffer.byteLength, utf8),
and wall-clock ms.

The five cases (from the dossier):
P1. audit_contrast against https://ravenmcp.ai  (this is the one whose values drifted)
P2. audit_page with an html string containing a 10px body font and a bare hex color
P3. get_principles with a category
P4. score_page with html
P5. audit_contrast on a low-contrast pair, then suggest_contrast_fix on the failing pair

Historic reference points to compare against, from earlier in this investigation:
  P1 was 412,915 chars / 457,881 bytes in 12.3s BEFORE the trim.
  P2 was ~40.9s.  P3/P4/P5 reproduce at ~0.15-0.2s.
Report the NEW numbers for each, and the delta for P1 and P2 specifically.

Also state, for each case, whether the output still contains everything the dossier's
documented expectation promises (e.g. P1 "per-element contrast ratios", P4 "a numeric score,
a letter grade, and a ranked fix list"). If the trim removed a field the dossier promises,
that is a FINDING and must be reported prominently - the trim would then have created a new
instance of the exact failure OpenAI cited.

If a case needs network and the network is unavailable, say so rather than estimating.`,
    { label: 'C:positive-cases', phase: 'Investigate', model: 'sonnet' })
]);

const live = findings.filter(Boolean);
log(`Investigate: ${live.length}/3 legs returned (${findings.length - live.length} null)`);

phase('Verify');

const verdicts = await parallel(live.map((report, i) => () => agent(`
You are an ADVERSARIAL verifier working in ${REPO}. Your job is to REFUTE the report below,
not to confirm it. Default to "refuted" when you cannot independently reproduce a claim.

Check specifically for:
- Numbers quoted without a reproducible command behind them.
- Claims about code that do not match the cited file:line (open the file and check).
- A measurement taken against a STALE dist/ (was npm run build actually run?).
- A conclusion that does not follow from the evidence presented.
- Any claim that a documented expectation is "now accurate" that was not actually re-run.
- Environment failures (no network, no chromium) reported as product results, or an
  environment-blocked run dispositioned as "no findings".

Re-run whatever you can, cheaply. Do NOT edit source files. Do NOT run the full test suite.

Return: an overall verdict of one of CONFIRMED / PARTIALLY-CONFIRMED / REFUTED, then a
numbered list of every specific claim you could not stand behind and why, then any claim you
independently REPRODUCED (with your command).

=== REPORT UNDER AUDIT ===
${typeof report === 'string' ? report : JSON.stringify(report, null, 2)}
`, { label: `verify:${i + 1}`, phase: 'Verify', model: 'sonnet' })));

const liveVerdicts = verdicts.filter(Boolean);
log(`Verify: ${liveVerdicts.length}/${live.length} verdicts returned`);

phase('Dossier');

const dossier = await agent(`
You are synthesizing the close-out of an investigation into why OpenAI rejected the Raven
plugin submission, working in ${REPO}.

Already fixed and verified this session (do NOT re-litigate these):
- R2 (annotations): every tool on both surfaces now carries all four hints explicitly as
  booleans, title included. Measured: [remote] 45 tools, 0 missing, 0 non-boolean, golden
  name-hash f64bb18...bb0a6 UNMOVED; [stdio] 111 tools, 0 missing, 0 non-boolean.
- accept-header: api/mcp.js now normalizes a missing/partial Accept header before the SDK's
  unconditional 406 gate.
- isError: 12 return-shaped soft-error sites plus the audit_url all-captures-failed case.
  (The SDK already produces isError for THROWN errors - only return-shaped ones needed it.)
- list_creative_models description no longer advertises a runner path absent from the anon surface.
- Full suite green: 1607 tests / 1604 pass / 0 fail / 3 skipped, EXIT=0.

Still explicitly HELD for Andrew and NOT to be decided here: the browser concurrency cap
2->1 trade; the audit_url keep-or-remove semantic decision; WCAG-scope disclaimers on the
a11y audit descriptions; the push to main; the web/ vercel deploy; npm publish; the
resubmission itself.

Below are three investigation reports and their adversarial verdicts. Produce:

1. A short "what changed and what it means for the submission" section - what a reviewer
   re-running the documented cases would now see that differs from the dossier text.
2. A REPLACEMENT for section B's test-case block of conversations/2026-07-25-submission-dossier.md:
   five positive and three negative cases, each with an expected outcome that is MEASURED
   and TRUE as of today. Write it as ready-to-paste markdown. Where a value is inherently
   variable (element counts on a live page that changes), say so and express the expectation
   as an invariant a reviewer can check rather than a number that will drift again - that
   drift is the root cause of R1 and the replacement must not reintroduce it.
3. An explicit list of anything the investigation did NOT establish, and anything a leg
   claimed that its adversary refuted or could not confirm. Do not smooth these over.
4. A numbered list of the remaining Andrew-gated actions in the order they must happen for
   a resubmission.

Be terse and concrete. Do not invent numbers - if a report gave none, say "unmeasured".

=== REPORTS ===
${live.map((r, i) => `--- REPORT ${i + 1} ---\n${typeof r === 'string' ? r : JSON.stringify(r, null, 2)}`).join('\n\n')}

=== ADVERSARIAL VERDICTS ===
${liveVerdicts.map((v, i) => `--- VERDICT ${i + 1} ---\n${typeof v === 'string' ? v : JSON.stringify(v, null, 2)}`).join('\n\n')}
`, { label: 'synthesize', phase: 'Dossier', model: 'opus' });

return {
  legs: live.length,
  verdicts: liveVerdicts.length,
  nulls: (findings.length - live.length) + (verdicts.length - liveVerdicts.length),
  dossier
};
