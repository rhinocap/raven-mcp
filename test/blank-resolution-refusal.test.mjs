// Two SILENT-FALLBACK defects, both from the OpenAI review's R1 ("test cases did
// not produce correct results"), both confirmed by measurement before being fixed.
//
// (a) get_brand_system resolved a BLANK company to a real design system while
//     refusing a genuinely unknown one - exactly inverted. Measured pre-fix:
//         company=""                 -> isError=false, brand "Apple HIG"
//         company="   "              -> isError=false, brand "Apple HIG"
//         company="zzzznotacompany"  -> isError=true   (correct)
//     Mechanism: `"".split(/\s+/)` is `[""]`, `haystack.includes("")` is TRUE for
//     every string (+2) and `category.includes("")` likewise (+3), so bestScore
//     hit 5 on the FIRST registry system and strict `>` pinned it there.
//     WHITESPACE-ONLY is tested separately from "" because the pre-fix value was
//     measured at Apple HIG for BOTH - a `=== ""` check would have left the
//     defect reachable through one space.
//
// (b) generate_design_system silently swallowed an UNKNOWN base_system:
//     generateTokenSet() fell back to `tokens = {}`, byte-identical to passing no
//     base at all, and emitted a confident preset-default system. Measured
//     pre-fix: base_system="zzzznotasystem" -> isError=false, full system.
//
// The two refusals in (a) carry DIFFERENT messages on purpose - "no company
// name" and "no match for 'x'" are different problems with different fixes - so
// the blank case asserts its own wording rather than merely asserting isError.
// Every refusal is paired with a positive control: a guard that refuses
// everything would satisfy `isError === true` on every case here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../dist/index.js";
import { FsTasteStore } from "../dist/taste-store.js";

const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const signal = new AbortController().signal;

async function call(name, args) {
  const tool = server._registeredTools[name];
  assert.ok(tool, `${name} is not registered`);
  // Call through the SCHEMA first. Invoking handler() directly bypasses zod, and
  // a throw from an input the schema would have rejected is not a defect.
  const parsed = tool.inputSchema.safeParse(args);
  assert.ok(parsed.success, `${name} rejected a fixture the test meant to be valid`);
  const result = await tool.handler(parsed.data, { signal });
  const text = result.content[0].text;
  let json = null;
  try { json = JSON.parse(text); } catch { /* a refusal may be plain text */ }
  return { isError: result.isError === true, text, json };
}

for (const [company, label] of [["", "empty company"], ["   ", "whitespace-only company"], ["\t\n ", "tab/newline company"]]) {
  test(`get_brand_system refuses a blank company (${label})`, async () => {
    const r = await call("get_brand_system", { company });
    assert.equal(r.isError, true, `blank company resolved to a system: ${r.text.slice(0, 200)}`);
    assert.equal(typeof r.json?.error, "string");
    // The blank case must not be reported as an ordinary no-match - it is a
    // different problem with a different fix.
    assert.match(r.json.error, /No company name provided/);
    // The forbidden outcome asserted head-on: no brand may be resolved.
    assert.equal(r.json.brand, undefined, "a refusal must not carry a resolved brand");
  });
}

test("get_brand_system still refuses a genuinely unknown company, with its own message", async () => {
  const r = await call("get_brand_system", { company: "zzzznotacompany" });
  assert.equal(r.isError, true);
  assert.match(r.json.error, /No matching design system found/);
});

for (const company of ["Stripe", "spotify"]) {
  test(`get_brand_system still resolves a real company (${company})`, async () => {
    const r = await call("get_brand_system", { company });
    assert.equal(r.isError, false, `a valid company was refused: ${r.text.slice(0, 200)}`);
    assert.equal(typeof r.json?.brand, "string");
  });
}

test("generate_design_system refuses an unknown base_system", async () => {
  const r = await call("generate_design_system", { name: "Probe Design System", base_system: "zzzznotasystem", format: "dtcg" });
  assert.equal(r.isError, true, `an unknown base_system was silently swallowed: ${r.text.slice(0, 200)}`);
  assert.match(r.json.error, /Unknown base_system/);
  // The unresolved id must be named back, or the user cannot see the typo.
  assert.equal(r.json.base_system, "zzzznotasystem");
  // The forbidden outcome: a generated system emitted anyway.
  assert.equal(r.json.$name, undefined, "a refusal must not carry a generated system");
});

test("generate_design_system still generates with no base_system", async () => {
  const r = await call("generate_design_system", { name: "Probe Design System", format: "dtcg" });
  assert.equal(r.isError, false, `a base-less generate was refused: ${r.text.slice(0, 200)}`);
  assert.equal(r.json.$name, "Probe Design System");
});

test("generate_design_system still generates from a real base_system, and INHERITS from it", async () => {
  const withBase = await call("generate_design_system", { name: "Probe Design System", base_system: "stripe", format: "dtcg" });
  assert.equal(withBase.isError, false, `a valid base_system was refused: ${withBase.text.slice(0, 200)}`);
  assert.equal(withBase.json.$name, "Probe Design System");
  // isError === false is satisfied by a guard that resolves the id and then
  // ignores it, which is the defect one layer in. The base must actually reach
  // the output, so compare against the SAME call with no base at all.
  const noBase = await call("generate_design_system", { name: "Probe Design System", format: "dtcg" });
  assert.notDeepEqual(withBase.json, noBase.json, "base_system:'stripe' produced output identical to no base at all");
});
