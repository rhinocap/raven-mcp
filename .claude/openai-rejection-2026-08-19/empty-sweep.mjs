// Probe every tool with empty-but-schema-valid inputs. A non-error AFFIRMATIVE
// from empty input is the R1 defect class OpenAI's rejection named.
//
// ============================================================================
// ROUND 10 REWRITE (F4). What the previous version could not see, measured:
// ============================================================================
//
// (1) SURFACE WAS TOO NARROW. It built the 56-tool authenticated surface, so
//     the 55 stdio-only tools were NEVER PROBED AT ALL -- and four of the five
//     R1 defects Sol r9 found (audit_contract, audit_parity, audit_layout,
//     talon_scan) live on tools this sweep never reached. A sweep that reports
//     "clean" over a set that excludes the defects is the false-clean failure
//     its own positive control exists to prevent, arriving through the SET
//     rather than through the probe. It now builds the widest surface there is
//     (stdio, 111) which is a strict superset of both hosted surfaces; a defect
//     that is gated off the hosted build is still a defect in the package.
//
// (2) ONE FIELD AT A TIME CANNOT REACH A MULTI-FIELD GUARD. Every payload set
//     exactly ONE key empty and left the rest absent, so a handler refusing on
//     `!a` alone was probed and a handler whose emptiness is a CONJUNCTION
//     (audit_contract's three-way empty-spec check; audit_parity's two
//     snapshots) could never be driven into its own empty state. The sweep now
//     sends a COMBINED payload with every schema-acceptable key set empty
//     simultaneously, in addition to the per-key ones. The per-key probes are
//     kept rather than replaced: they are what ATTRIBUTES a hit to a field.
//
// (3) THE POSITIVE CONTROL WAS ONE HARDCODED HIT. `audit_screen {screenshot:""}`
//     is a legitimate permanent affordance, but pinning liveness to a single
//     named tool means the sweep goes blind the moment that one tool moves,
//     and it says nothing about whether the OTHER 110 handlers ran. It is
//     replaced by a DERIVED, TWO-DIRECTIONAL control: the sweep must observe
//     both a refusal and a non-error across the run. One direction alone is
//     not liveness -- all-refusals is indistinguishable from a harness whose
//     payloads stopped parsing, and all-non-errors from one whose handlers
//     stopped being called. Both counts are printed, so a future reader grades
//     the numbers rather than a boolean.
//
// SANDBOX: stdio tools write to the filesystem (design systems, decisions,
// taste). HOME and RAVEN_SYSTEMS_HOME are redirected to a temp dir by the
// caller; this file asserts the redirection rather than trusting it, because a
// sweep that mutates the real ~/.raven is worse than a sweep that does not run.
import { homedir } from "node:os";

if (!process.env.RAVEN_SWEEP_SANDBOX) {
  console.error("ABORT: run via the sandboxed launcher (RAVEN_SWEEP_SANDBOX unset).");
  console.error("A stdio sweep calls real filesystem writers; HOME must be redirected first.");
  process.exit(1);
}
if (homedir() === process.env.RAVEN_SWEEP_REAL_HOME) {
  console.error(`ABORT: HOME is still the real home (${homedir()}). Redirection did not take.`);
  process.exit(1);
}

const { buildServer } = await import("../../dist/index.js");
const { FsTasteStore } = await import("../../dist/taste-store.js");

// The WIDEST surface: stdio. Strict superset of anonymous (45) and authed (56).
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const tools = server._registeredTools;
const names = Object.keys(tools).sort();
console.log("surface: stdio (widest; superset of the reviewed 45 and the authed 56)");
console.log("tools:", names.length);
console.log("sandbox HOME:", homedir());

const EMPTY_ARR = [];
const EMPTY_STR = "";
const WS_STR = "   \n  ";
const EMPTIES = [EMPTY_ARR, EMPTY_STR, WS_STR];

const render = v => (Array.isArray(v) ? "[]" : JSON.stringify(v));

const hits = [];
const timeouts = [];
let probesRun = 0;
let refusals = 0;
let nonErrors = 0;

async function probe(t, payload, label) {
  probesRun++;
  let res;
  try {
    // PER-PROBE TIMEOUT. A handler given empty input can still make a real
    // network call or launch a browser (measured: this sweep hung indefinitely
    // on its first armed run), and a sweep that never finishes reports nothing
    // at all -- indistinguishable from a clean bill. A timed-out probe is
    // recorded as TIMEOUT rather than skipped, because "no verdict" is a result
    // and must never be silently read as "no defect".
    res = await Promise.race([
      t.handler(payload, { signal: new AbortController().signal }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("RAVEN_PROBE_TIMEOUT")), 6000).unref())
    ]);
  } catch (e) {
    if (e && e.message === "RAVEN_PROBE_TIMEOUT") timeouts.push(label);
    else refusals++; // a throw IS a refusal, and counts toward liveness
    return;
  }
  if (!res) return;
  if (res.isError === true) { refusals++; return; }
  nonErrors++;
  const text = (res.content && res.content[0] && res.content[0].text) || "";
  return text.slice(0, 160).replace(/\n/g, " ");
}

for (const name of names) {
  const t = tools[name];
  const schema = t.inputSchema;
  const shape = schema && schema.shape ? schema.shape : null;
  if (!shape) continue;
  const keys = Object.keys(shape);

  // (a) PER-KEY probes -- these are what ATTRIBUTE a hit to one field.
  //     Also record, per key, which empty value the schema accepts, so the
  //     combined payload below can be built without guessing types.
  const acceptedEmpty = {};
  for (const k of keys) {
    for (const v of EMPTIES) {
      const parsed = schema.safeParse({ [k]: v });
      if (!parsed.success) continue;
      if (!(k in acceptedEmpty)) acceptedEmpty[k] = v;
      const head = await probe(t, parsed.data, `${name} { ${k}: ${render(v)} }`);
      if (head !== undefined) hits.push({ tool: name, field: k, kind: render(v), head });
    }
  }

  // (b) COMBINED probe -- EVERY schema-acceptable key empty SIMULTANEOUSLY.
  //     This is the only shape that can reach a conjunctive emptiness guard
  //     (audit_contract's three-way spec check, audit_parity's two snapshots).
  const combinedKeys = Object.keys(acceptedEmpty);
  if (combinedKeys.length > 1) {
    const payload = {};
    for (const k of combinedKeys) payload[k] = acceptedEmpty[k];
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      const label = `${name} { ALL ${combinedKeys.length} fields empty }`;
      const head = await probe(t, parsed.data, label);
      if (head !== undefined) hits.push({ tool: name, field: `ALL(${combinedKeys.join(",")})`, kind: "combined", head });
    }
  }
}

// DERIVED POSITIVE CONTROL, both directions. A sweep that can only ever print
// zero is not a sweep -- and neither is one that can only ever print refusals.
// Refusals prove handlers are being CALLED and guards fire; non-errors prove
// payloads still PARSE and the sweep has not silently stopped reaching code.
// Neither direction alone separates a clean surface from a dead harness.
const live = probesRun > 0 && refusals > 0 && nonErrors > 0;
console.log("");
console.log("probes run:", probesRun);
console.log("  refusals (isError or throw):", refusals);
console.log("  non-errors:", nonErrors);
console.log("liveness control (both directions observed):", live);
console.log("timed-out probes (NO VERDICT, not a pass):", timeouts.length);
for (const tm of timeouts) console.log("  TIMEOUT", tm);
console.log("\nNON-ERROR FROM EMPTY INPUT:", hits.length);
for (const h of hits) console.log(`  ${h.tool}  { ${h.field}: ${h.kind} }  ->  ${h.head}`);

// WHY THIS EXITS EXPLICITLY, measured rather than assumed. buildServer() leaves
// a live handle on the event loop (measured 2026-08-19 -- four orphaned sweep
// processes, the oldest at 42 minutes, every one having printed a complete
// report). The status is DERIVED, never a bare exit(0): an exit status that
// only proves the script reached its last line carries no information.
process.exit(live ? 0 : 1);
