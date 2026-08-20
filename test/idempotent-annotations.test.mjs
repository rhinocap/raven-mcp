// Every published hint is an explicit boolean, and `idempotentHint: true` is a
// CLAIM about end state that has to survive being made twice.
//
// WHY THIS FILE EXISTS (2026-08-19, OpenAI plugin-directory rejection R2 --
// "one or more of your tool's annotations do not appear to match the tool's
// behavior ... confirm annotations are explicitly set to true or false (not
// null) for every tool"). `idempotentHint` means: calling twice with identical
// arguments leaves the same end state. Five entries in TOOL_IDEMPOTENT
// (src/index.ts) claimed it and could not keep it -- each was measured against
// the code that runs, not against the tool's name:
//
//   create_brand_profile  -> writeCreativeRecord sets updated_at: now on EVERY call
//   raven_register        -> POSTs REGISTER_API per call, so a repeat sends a SECOND
//                            welcome email (src/index.ts:7627, api/welcome.js:163)
//   bind_taste_surface    -> persists a FRESH bound_at on every bind (src/taste.ts:872)
//   decision_get          -> a READ, but recordConsultation appends a line to
//                            consultations.jsonl on every call (src/decision-graph.ts:701)
//   decision_list         -> ditto
//
// The last two were not in the adverse report. They came from the table's own
// written rule, which excludes "a tool ... appending to a log" -- a table whose
// comment does not bind its own entries is documentation, not a rule.
//
// UNDER-CLAIMING IS THE CHEAP DIRECTION AND OVER-CLAIMING IS THE FINDING. A
// false `false` costs a client one retry it chose not to make. A false `true`
// is exactly the annotation-does-not-match-behaviour defect that was rejected.
// So this file pins the five falses AND a control set of trues: a "fix" that
// simply set every hint to false would satisfy the first half alone, and this
// suite would report a table that says nothing as a table that is correct.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../dist/index.js';
import { FsTasteStore } from '../dist/taste-store.js';

const local = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const remote = buildServer({ remote: true });

function annotationsOf(server, name) {
  const t = server._registeredTools[name];
  assert.ok(t, `${name} is not registered on this build`);
  assert.ok(t.annotations, `${name} publishes no annotations at all`);
  return t.annotations;
}

// ── R2 literally: no hint is null, anywhere, on either surface ──────────────
// The reviewed surface is the anonymous endpoint, but a hint that is explicit on
// one build and absent on the other is one registration path away from shipping,
// so both are swept rather than only the reviewed one.
for (const [label, server] of [['local', local], ['hosted', remote]]) {
  test(`every ${label} tool sets all four hints explicitly, never null`, () => {
    const names = Object.keys(server._registeredTools);
    assert.ok(names.length > 0, 'the build registered no tools, so this measures nothing');
    const bad = [];
    for (const n of names) {
      const a = server._registeredTools[n].annotations || {};
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) {
        if (typeof a[hint] !== 'boolean') bad.push(`${n}.${hint} = ${JSON.stringify(a[hint])}`);
      }
    }
    assert.deepEqual(bad, [], `hints must be explicit booleans: ${bad.join(', ')}`);
  });
}

// ── The five that cannot claim idempotence ─────────────────────────────────
// Each carries the reason inline, because a bare `false` reads as caution and
// the next reader has to be able to check the claim against the code.
const NOT_IDEMPOTENT = [
  ['create_brand_profile', 'writeCreativeRecord rewrites updated_at on every call'],
  ['raven_register', 'each call POSTs REGISTER_API, so a repeat sends a second welcome email'],
  ['bind_taste_surface', 'persists a fresh bound_at timestamp on every bind'],
  ['decision_get', 'recordConsultation appends a consultations.jsonl line per call'],
  ['decision_list', 'recordConsultation appends a consultations.jsonl line per call']
];

for (const [name, why] of NOT_IDEMPOTENT) {
  test(`${name} is published as NOT idempotent (${why})`, () => {
    const a = annotationsOf(local, name);
    assert.equal(a.idempotentHint, false, `idempotentHint must be an explicit false: ${why}`);
  });
}

// ── Positive controls: the trues are still true ────────────────────────────
// Without these, flipping the whole table to false would pass every assertion
// above. Each of these writes the value the caller supplied, or removes
// something that stays removed, so a second identical call leaves the same end
// state -- which is what the hint claims and all this one means.
const IDEMPOTENT = [
  ['init_design_md', 'writes the DESIGN.md the caller asked for, with no timestamps'],
  ['update_design_md', 'rewriting the same file with the same content'],
  ['stop_grab_session', 'stopping a stopped session is stopped'],
  ['decision_commit', 'moves the node to one fixed committed state']
];

for (const [name, why] of IDEMPOTENT) {
  test(`${name} is still published as idempotent (${why})`, () => {
    const a = annotationsOf(local, name);
    assert.equal(a.idempotentHint, true, `idempotentHint must be an explicit true: ${why}`);
  });
}

// ── A read is not automatically idempotent ─────────────────────────────────
// This is the sentence that produced the two findings the adverse pass missed,
// so it is asserted rather than left in a comment: a READ is not automatically
// idempotent. decision_get and decision_list answer a question AND append a
// consultations.jsonl line through recordConsultation, so calling either twice
// leaves a different end state than calling it once -- which is exactly what a
// "reads are idempotent" shortcut collapses.
//
// They are classified "destructive" in TOOL_ACCESS (src/index.ts:2064) because
// they write, and toolAnnotations() consults TOOL_IDEMPOTENT ONLY in that
// branch -- so this pair is also what proves the flip took effect at all: a
// TOOL_IDEMPOTENT entry on a readOnly-classified tool is a silent no-op.
//
// DELIBERATE NON-FIX, recorded rather than silently asserted: destructiveHint
// is true here, and an append-only consultation trace is ADDITIVE, not
// destructive, so that hint over-claims. It is the MCP spec's own default for
// any non-readOnly tool ("MAY perform destructive updates"), it errs
// conservative, and splitting TOOL_ACCESS into a third tier to correct it would
// move every annotation in the payload. The justification belongs in the
// submission text, not in a restructure. Do not re-litigate this by flipping
// the assertion below.
for (const name of ['decision_get', 'decision_list']) {
  test(`${name} is NOT published as idempotent`, () => {
    const a = annotationsOf(local, name);
    assert.equal(a.idempotentHint, false, 'it appends its own consultation trace on every call');
    assert.equal(a.readOnlyHint, false, 'and it is classified destructive because it writes that trace');
    assert.equal(a.destructiveHint, true, 'conservative over-claim, justified in the submission text');
  });
}
