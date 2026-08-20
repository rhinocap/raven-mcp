// A documented category that resolves to nothing is the exact defect OpenAI's
// rejection named: "align tool behavior/output with the documented expected
// outcomes." A reviewer copies a value out of the parameter description, calls
// the tool, and gets count:0 - which reads as a broken tool, not a typo in the
// docs.
//
// Two phantoms shipped that way and neither was visible to any existing test:
// list_design_systems documented "design-system", and list_content_systems
// documented "fintech". Both are real category NAMES elsewhere in the product,
// which is why they survived review by eye - they are only wrong for the tool
// that lists them.
//
// This test parses the vocabulary out of the LIVE parameter description rather
// than from a hardcoded list, so it cannot drift from what a caller actually
// reads. Adding a category to the docs without adding the data turns it red;
// so does renaming the data without touching the docs.
import { test } from 'node:test';
import assert from 'node:assert';
import { buildServer } from '../dist/index.js';

// The documented list is everything between the first ':' and the first '.'
// that ends a sentence. Trailing prose after that period (list_design_systems
// carries a sentence about saved user systems) is deliberately NOT parsed:
// 'user' is populated from the caller's own ~/.raven directory, which is empty
// on a clean checkout, so asserting it would fail for a reason that is not a
// defect.
function documentedValues(description) {
  const afterColon = description.slice(description.indexOf(':') + 1);
  const firstSentence = afterColon.split('. ')[0].replace(/\.$/, '');
  return firstSentence.split(',').map((v) => v.trim()).filter(Boolean);
}

// A refusal is returned as PLAIN TEXT with isError:true, not as JSON - so this
// must not JSON.parse unconditionally, or a correct refusal throws a SyntaxError
// and reads as a harness bug.
async function call(server, name, args) {
  const result = await server._registeredTools[name].handler(args, { signal: new AbortController().signal });
  const text = result.content[0].text;
  let json = null;
  try { json = JSON.parse(text); } catch { /* refusals are prose */ }
  return { isError: result.isError === true, text, json };
}

const CASES = [
  { tool: 'get_principles', param: 'category', extra: { context: 'signup form' }, countKey: 'count' },
  { tool: 'list_design_systems', param: 'category', extra: {}, countKey: 'count' },
  { tool: 'list_content_systems', param: 'category', extra: {}, countKey: 'count' }
];

for (const c of CASES) {
  test(`every category documented on ${c.tool}.${c.param} resolves to at least one result`, async () => {
    const server = buildServer({ remote: false });
    const description = server._registeredTools[c.tool].inputSchema.shape[c.param]._def.description;
    const values = documentedValues(description);

    // Guard the parser itself: a regex that silently matches nothing would make
    // this test vacuously green, which is the failure mode it exists to prevent.
    assert.ok(values.length >= 3, `parsed ${values.length} documented values from ${c.tool}.${c.param} - the parser, not the docs, is probably wrong: ${description}`);

    const empty = [];
    for (const value of values) {
      const { isError, json } = await call(server, c.tool, { ...c.extra, [c.param]: value });
      if (isError || !json || json[c.countKey] === 0 || json.error) empty.push(value);
    }
    assert.deepEqual(empty, [], `documented categories on ${c.tool} that resolve to nothing: ${empty.join(', ')}`);
  });

  test(`an undocumented category on ${c.tool}.${c.param} is distinguishable from a documented one`, async () => {
    const server = buildServer({ remote: false });
    // The other half of the contract: a value that is NOT in the vocabulary must
    // not look like a legitimately empty result. Without this, the test above is
    // satisfied by a tool that returns everything for every input.
    const { isError, text, json } = await call(server, c.tool, { ...c.extra, [c.param]: 'zzz-not-a-category' });
    const signalled = isError
      || Boolean(json && json.error)
      || Boolean(json && json.category_note)
      || Boolean(json && json[c.countKey] === 0);
    assert.ok(signalled, `${c.tool} answered a bogus category with an ordinary-looking result: ${text.slice(0, 300)}`);
  });
}
