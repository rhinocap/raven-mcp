// Fixture verification. The round only means something if the sixteen discriminating facts
// are (a) absent from the surface EVERY arm gets for free, (b) present in what arm A's
// composer returns, and (c) present in what arm B2 can reach through the raw tools. (c)
// matters as much as (a): the amended §13 requires A to beat B2, and B2 holding the same
// information is what makes that a test of orchestration rather than of access.
//
//   node verify-fixture5.mjs      exit 0 only if every assertion holds

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STORE = '/Users/accunliffe/.pregate-r5-8f3a2c';
const REPO = '/Users/accunliffe/projects/raven-mcp';
const ARENA = join(STORE, 'arena');

process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_TASTE_HOME = join(STORE, 'taste');
process.env.RAVEN_DECISIONS_HOME = join(ARENA, '.raven', 'decisions');
process.env.RAVEN_NO_CONSULTATION_TRACE = '1';

const { buildServer } = await import(`${REPO}/dist/index.js`);
const { FsTasteStore } = await import(`${REPO}/dist/taste-store.js`);
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const tools = server._registeredTools;

const call = async (name, args = {}) => {
  const res = await tools[name].handler(args, {});
  return res?.content?.[0]?.text ?? '';
};

// Each fact is keyed by the check it decides. `must` are phrases that have to be in the
// treatment; `absent` are the words whose appearance in the shared surface would mean the
// fact is free. `absent` is deliberately broader than `must` — a paraphrase leaks just as
// much as a quotation.
const FACTS = [
  { k: 'D1',  must: ['below the entry list'], absent: [/below the (entry )?list/i, /after it in document order/i] },
  { k: 'D2',  must: ['no confirmation dialog'], absent: [/confirmation dialog/i] },
  { k: 'D3',  must: ['reports what happened afterwards'], absent: [/reports what happened/i] },
  { k: 'D4',  must: ['numbered pager'], absent: [/pager/i, /paginat/i, /infinite scroll/i, /load.more/i] },
  { k: 'D5',  must: ['survive a page change'], absent: [/survive a page change/i, /page change/i] },
  { k: 'D6',  must: ['multi-select'], absent: [/multi.select/i, /several may be relevant/i, /more than one at (a )?(time|once)/i, /at once/i] },
  { k: 'D7',  must: ['leading minus'], absent: [/leading minus/i, /parenthesi/i, /negative amount/i] },
  { k: 'D8',  must: ['same height resting, hovered, and selected'], absent: [/same height/i, /expand.on.hover/i, /reflow/i] },
  { k: 'D9',  must: ['mixed state'], absent: [/mixed state/i, /indeterminate/i, /tri.?state/i] },
  { k: 'D10', must: ['no tooltip'], absent: [/tooltip/i, /title attribute/i] },
  { k: 'D11', must: ['no plausible match'], absent: [/no plausible match/i, /\bunmatched\b/i, /"break"/i] },
  { k: 'T1',  must: ['filled 6px dot'], absent: [/filled/i, /\bdot\b/i, /outlined/i, /\bpill\b/i, /\bbadge\b/i] },
  { k: 'T2',  must: ['Undo — 7 reconciled'], absent: [/undo/i, /reconciled"/i] },
  { k: 'T3',  must: ['never auto-dismisses'], absent: [/auto.dismiss/i, /countdown/i] },
  { k: 'T4',  must: ['pinned to the bottom of the viewport'], absent: [/pinned/i, /stays visible while/i, /sticky/i] },
  { k: 'T5',  must: ['fixed 56px'], absent: [/right.aligned/i, /fixed 56/i, /right-hand end/i] },
];

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

// ── 1. The shared surface: DESIGN.md plus everything get_taste_profile hands back ────────
// Every arm reads both. A discriminating fact appearing here is not discriminating.
const designMd = readFileSync(join(ARENA, 'DESIGN.md'), 'utf8');
const profile = await call('get_taste_profile', { name: 'ledger' });
const shared = designMd + '\n' + profile;

for (const f of FACTS) {
  const hits = f.absent.filter((re) => re.test(shared));
  ok(hits.length === 0, `${f.k}: leaked into the shared surface — ${hits.join(' ')}`);
}

// The profile rules are meant to be reachable and are meant to be non-discriminating; if
// they said nothing at all the controls would have no source, so assert they are non-empty.
ok(profile.length > 400, 'get_taste_profile returned almost nothing — the control surface is missing');

// ── 2. Arm A: the composer must carry every fact ─────────────────────────────────────────
// The composer's first call is the grounding half; the second, with a skeleton, is the
// build prompt. Both are checked — a fact that only survives to one of them is a fact half
// the arm-A workflow does not carry.
const composeArgs = {
  intent: 'Build the reconciliation review screen: entry list, selection, bulk reconcile, filtering, running total.',
  profile: 'ledger', project: 'arena', surface: 'reconciliation review screen',
  project_dir: ARENA, design_file_path: join(ARENA, 'DESIGN.md'),
};
const grounding = await call('compose_build_prompt', composeArgs);
const withSkeleton = await call('compose_build_prompt', { ...composeArgs,
  skeleton: 'Structure: filters, list header, entry list, pager, reconcile bar, batch note, total footer. States: empty, partial selection, full page selection, post-batch.' });
const composed = grounding + '\n' + withSkeleton;
for (const f of FACTS) {
  ok(f.must.every((m) => composed.toLowerCase().includes(m.toLowerCase())),
    `${f.k}: absent from compose_build_prompt — ${f.must.join(' | ')}`);
}

// ── 3. Arm B2: the same facts must be reachable through the raw tools ────────────────────
const b2 = [
  await call('decision_list', {}),
  await call('list_taste_decisions', { profile: 'ledger', project: 'arena' }),
  await call('decision_list', { status: 'contested' }),
].join('\n');
for (const f of FACTS) {
  ok(f.must.every((m) => b2.toLowerCase().includes(m.toLowerCase())),
    `${f.k}: NOT reachable by arm B2 — ${f.must.join(' | ')} (the round would be measuring access, not orchestration)`);
}

// ── 4. The contested decision is the one fact the default call cannot return ─────────────
const listDefault = await call('decision_list', {});
const listContested = await call('decision_list', { status: 'contested' });
ok(!/no plausible match/i.test(listDefault),
  'the contested label is returned by a default decision_list — D11 stops discriminating');
ok(/no plausible match/i.test(listContested),
  'decision_list({status:"contested"}) does not return the contested label — D11 is unreachable by any arm');
ok(/contested|open question|unresolved|gap/i.test(composed) && /no plausible match/i.test(composed),
  'the composer does not surface the contested label — arm A cannot raise it either');

// ── report ───────────────────────────────────────────────────────────────────────────────
if (fail.length) {
  console.error(`FIXTURE INVALID — ${fail.length} assertion(s) failed:\n  ` + fail.join('\n  '));
  process.exit(1);
}
console.log(`fixture verified: ${FACTS.length} facts absent from the shared surface, ` +
  `present in the composer, reachable by B2; contested label gated behind an explicit status.`);
