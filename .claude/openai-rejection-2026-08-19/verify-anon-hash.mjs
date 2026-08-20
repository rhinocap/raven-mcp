// Proves WHICH anonymous top-level tool descriptions moved in the 2026-08-19
// OpenAI-resubmission pass, rather than asserting it.
//
// Method: rebuild the exact payload test/taste-remote-full.test.mjs hashes
// (instructions + [{name, description}] over the sorted anon tool set), but
// substitute chosen tools' HEAD description literals back in. If reverting a
// named SET reproduces a known earlier pin, no description outside that set
// moved between the two states -- that equality is the proof, not the diff.
//
// The extractor anchors on `server.tool(\n  "<name>",\n  "`. Anchoring on the
// bare `\n  "<name>",` shape silently matches the plain tool-NAME arrays in the
// same file, where the next line is another NAME, and it then returns that name
// as the "description". That bug produced absurd 10-17 char HEAD descriptions
// and two false MISMATCHes before it was found.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildServer } from '../../dist/index.js';

const head = execFileSync('git', ['show', 'HEAD:src/index.ts'], { encoding: 'utf8', maxBuffer: 1 << 26 });

function headDescription(name) {
  const anchor = 'server.tool(\n  "' + name + '",\n  "';
  const start = head.indexOf(anchor);
  if (start === -1) throw new Error('no HEAD registration for ' + name);
  let i = start + anchor.length;
  let out = '';
  for (;;) {
    const ch = head[i];
    if (ch === undefined) throw new Error('unterminated literal for ' + name);
    if (ch === '\\') { out += JSON.parse('"\\' + head[i + 1] + '"'); i += 2; continue; }
    if (ch === '"') break;
    out += ch; i += 1;
  }
  return out;
}

const server = buildServer({ remote: true });
const names = Object.keys(server._registeredTools).sort();

function hashWithReverted(reverted) {
  const payload = JSON.stringify({
    instructions: server.server._options.instructions,
    tools: names.map((name) => ({
      name,
      description: reverted.includes(name) ? headDescription(name) : (server._registeredTools[name].description || '')
    }))
  });
  return createHash('sha256').update(payload).digest('hex');
}

// audit_url joined the set when the remote build gained the click-refusal
// sentence, and its description moved a SECOND time after the Sol round-4 pass:
// hover and focus dispatch real events too, so refusing only click does not make
// the tool read-only or idempotent. audit_url now publishes readOnlyHint:false
// and idempotentHint:false on both builds, and the hosted derived sentence says
// exactly that. Both moves are audit_url alone, which is what CHECK 3 proves.
const ALL_SEVEN = [
  'audit_contrast', 'audit_page', 'audit_typography', 'audit_url',
  'list_creative_models', 'list_design_systems', 'score_page'
];
const ALL_SIX = ALL_SEVEN.filter((n) => n !== 'audit_url');

const CHECKS = [
  { label: 'HEAD pin (all seven reverted)', reverted: ALL_SEVEN,
    expect: 'fda3c22dbacc65455d42401a89abf850a6b87d84aab23c5046869a1dbd961e2d' },
  { label: 'intermediate pin (list_design_systems still HEAD)', reverted: ['list_design_systems', 'audit_url'],
    expect: '36c46c94187dc34b1c9cab12bdc4622533ab350cc8faf160d0f4bd9c823c07a1' },
  // THE PROOF for this round: reverting audit_url ALONE must reproduce the pin
  // this file carried before the click guard landed. If it does, no other
  // description moved in that round -- that equality is the whole argument.
  { label: 'pre-click-guard pin (audit_url alone reverted)', reverted: ['audit_url'],
    expect: '1abc908c4d6bbb7ed6cda3de56754801f7ac02573a3d5ea1d0044ff4fd8024c7' },
  { label: 'current pin (nothing reverted)', reverted: [],
    expect: '5181c14928e66bbd92340c62ef2174d56f368633423422de8e7a4e0ad88694d6' }
];

let bad = 0;
for (const c of CHECKS) {
  const got = hashWithReverted(c.reverted);
  const ok = got === c.expect;
  if (!ok) bad += 1;
  console.log((ok ? 'MATCH    ' : 'MISMATCH ') + c.label + '\n  expect ' + c.expect + '\n  got    ' + got);
}

// Falsifiability. A SUPERSET control is worthless here: reverting a tool whose
// description never moved is a no-op, so ALL_SIX + get_principles reproduces the
// HEAD pin and the "control" fails on correct data (measured, not reasoned - it
// did). The real control is every SUBSET: dropping any ONE of the six must stop
// reproducing the HEAD pin, which is what makes the set minimal as well as
// sufficient.
for (const dropped of ALL_SEVEN) {
  const subset = ALL_SEVEN.filter((n) => n !== dropped);
  if (hashWithReverted(subset) === CHECKS[0].expect) {
    bad += 1;
    console.log('MISMATCH subset control without ' + dropped + ' still reproduced the HEAD pin');
  }
}
console.log('MATCH    all seven subset controls differ from the HEAD pin');

// And the six are exactly the tools whose live description differs from HEAD.
const differing = names.filter((n) => (server._registeredTools[n].description || '') !== headDescription(n));
if (differing.join(',') !== ALL_SEVEN.join(',')) { bad += 1; console.log('MISMATCH differing set: ' + differing.join(',')); }
else console.log('MATCH    differing set is exactly the seven named');

console.log(bad === 0 ? 'ALL CHECKS PASSED' : bad + ' CHECK(S) FAILED');
process.exitCode = bad === 0 ? 0 : 1;
