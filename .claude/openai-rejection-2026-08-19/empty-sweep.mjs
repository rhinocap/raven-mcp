// Probe every tool on the AUTHENTICATED hosted surface with empty-but-schema-valid
// inputs. A non-error affirmative from empty input is the R1 defect class.
//
// SURFACE, corrected 2026-08-19 -- this header used to say "anonymous" and was wrong.
// Passing a tasteStore registers the 11 taste tools on top of the anonymous set, so this
// builds 56 tools, not the 45 OpenAI reviewed. That is a strict SUPERSET, so no coverage
// was ever lost and every measured hit still stands; but the label mattered, because a
// reader grading an R1 fix against "the reviewed surface" would have been reading a
// different set. The three surfaces, each measured by building it and listing:
//   buildServer({remote:false})                  -> 111  (stdio)
//   buildServer({remote:true})                   ->  45  (anonymous, api/mcp.js -- reviewed)
//   buildServer({remote:true, tasteStore})       ->  56  (authenticated, api/mcp-user.js)
// The superset is kept deliberately: an R1 defect on an authed-only tool is still a
// defect, and probing the wider set costs nothing.
// The line below prints the count, so the surface is always readable off the output.
import { buildServer } from "../../dist/index.js";
import { FsTasteStore } from "../../dist/taste-store.js";

const server = buildServer({ remote: true, tasteStore: new FsTasteStore() });
const tools = server._registeredTools;
const names = Object.keys(tools).sort();
console.log("authed-remote tools (superset of the reviewed 45):", names.length);

// Candidate empty payloads per field name shape.
const EMPTY_ARR = [];
const EMPTY_STR = "";
const WS_STR = "   \n  ";

const hits = [];
const timeouts = [];
for (const name of names) {
  const t = tools[name];
  const shape = t.inputSchema && t.inputSchema.shape ? t.inputSchema.shape : null;
  if (!shape) continue;
  const keys = Object.keys(shape);
  // build candidate payloads: one per key, set to empty array / empty string / ws string
  const cands = [];
  for (const k of keys) {
    for (const v of [EMPTY_ARR, EMPTY_STR, WS_STR]) {
      cands.push({ [k]: v });
    }
  }
  for (const payload of cands) {
    const parsed = t.inputSchema.safeParse(payload);
    if (!parsed.success) continue;
    let res;
    try {
      // PER-PROBE TIMEOUT. A handler given empty input can still make a real
      // network call or launch a browser (measured: this sweep hung indefinitely
      // on its first armed run), and a sweep that never finishes reports nothing
      // at all -- indistinguishable from a clean bill, which is the same
      // false-clean failure the positive control below exists to prevent.
      // A timed-out probe is recorded as TIMEOUT rather than skipped, because
      // "no verdict" is a result and must not be silently read as "no defect".
      res = await Promise.race([
        t.handler(parsed.data, { signal: new AbortController().signal }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("RAVEN_PROBE_TIMEOUT")), 8000).unref())
      ]);
    } catch (e) {
      if (e && e.message === "RAVEN_PROBE_TIMEOUT") {
        const tk = Object.keys(payload)[0];
        timeouts.push(`${name} { ${tk}: ${Array.isArray(payload[tk]) ? "[]" : JSON.stringify(payload[tk])} }`);
      }
      continue;
    }
    if (!res || res.isError === true) continue;
    const text = (res.content && res.content[0] && res.content[0].text) || "";
    const key = Object.keys(payload)[0];
    const kind = Array.isArray(payload[key]) ? "[]" : JSON.stringify(payload[key]);
    hits.push({ tool: name, field: key, kind, head: text.slice(0, 160).replace(/\n/g, " ") });
  }
}
// POSITIVE CONTROL: a sweep that can only ever print zero is not a sweep.
//
// RETIRED CONTROL, recorded rather than silently swapped: this used to assert
// audit_tap_targets { elements: [] } (Sol r6 P1-2). That hit was FIXED in this
// round, so the control read false — and its own comment said the two causes
// (fixed vs. harness stopped probing) are indistinguishable from the count
// alone, which is why "update this control deliberately" is what is happening
// here rather than deleting the assertion.
//
// The replacement is chosen to be legitimate AND permanent, so it cannot be
// retired by a later fix. audit_screen { screenshot: "" } returns snapshot
// instructions rather than a score: it is a DISCOVERY AFFORDANCE, which is
// correct behaviour and is independently pinned by mutant E7 in
// empty-mutants.mjs. It is a non-error from empty input by design, so it will
// keep appearing for as long as the sweep is probing at all — which is the only
// property a positive control needs.
const control = hits.some(h => h.tool === "audit_screen" && h.field === "screenshot" && h.kind === '""');
console.log("positive control (audit_screen screenshot:\"\") present:", control);
console.log("timed-out probes (NO VERDICT, not a pass):", timeouts.length);
for (const tm of timeouts) console.log("  TIMEOUT", tm);
console.log("\nNON-ERROR FROM EMPTY INPUT:", hits.length);
for (const h of hits) console.log(`  ${h.tool}  { ${h.field}: ${h.kind} }  ->  ${h.head}`);

// WHY THIS EXITS EXPLICITLY, measured rather than assumed.
//
// This sweep prints every result and then NEVER EXITS: buildServer() leaves a
// live handle on the event loop (measured 2026-08-19 -- four orphaned sweep
// processes were found alive, the oldest at 42 minutes, every one having
// printed its complete 37-line report). The visible cost was not the orphans:
// the sweep is chained ahead of `npm test`, so a harness that never exits means
// the SUITE NEVER STARTS, which presents as a missing log rather than as a
// hang. Two rounds were spent misreading that as a killed background shell.
//
// The status is DERIVED, never a bare exit(0). This file's own rule: "a check
// whose failure mode is indistinguishable from its success mode is not a
// check", so an exit status that only proves the script reached its last line
// carries no information. The positive control is the one property the sweep
// asserts about ITSELF -- if it is absent, the sweep is no longer probing and
// a count of 0 hits would be indistinguishable from a clean surface.
process.exit(control ? 0 : 1);
