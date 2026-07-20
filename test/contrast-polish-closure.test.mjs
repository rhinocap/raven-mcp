// it62 — polish-apply W2 loop, contrast path: proves the "beyond linting" closure
// end-to-end through the MCP server. audit_contrast finds a real WCAG-AA failure ->
// suggest_contrast_fix proposes the minimal passing color -> APPLY it to the artifact ->
// re-audit shows the finding cleared (1 -> 0) with no new finding.
//
// This is the merge-gate differentiator: a linter (or Figma critique) can FLAG low
// contrast; only a propose->apply->re-audit loop PROVES the shipped artifact now passes.
// suggest_contrast_fix already ships, but nothing tested that its output, once applied,
// actually clears a re-audit. Deterministic: dom_snapshot mode, no chromium.
//
// Apply is intentionally inline (not a shipped helper): the deliverable is the proof
// the tool contracts compose, not a new auto-refactor surface. The reachable single-color
// swap is the only class auto-applied; unreachable pairs are left for a human (ceiling).

process.env.RAVEN_NO_USAGE_LOG = '1';
process.env.RAVEN_NO_DAILY_DIGEST = '1';
process.env.RAVEN_NO_UPDATE_CHECK = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildServer } = await import('../dist/index.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

async function withRaven(run) {
  const server = buildServer({});
  const client = new Client({ name: 'contrast-polish-test', version: '1.0.0' }, { capabilities: {} });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  const call = async (name, args) =>
    JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);
  try {
    return await run(call);
  } finally {
    await client.close();
  }
}

// The apply step: substitute the suggested passing foreground for every failing row whose
// fix is reachable by a single-color change. Mirrors what a merge-gate auto-fixer would do.
function applyContrastFixes(snapshot, fixResults) {
  const bySelector = new Map(fixResults.map((r) => [r.selector, r]));
  return snapshot.map((el) => {
    const fix = bySelector.get(el.selector);
    if (fix && fix.passes === false && fix.reachable && fix.fgFix && fix.fgFix.color) {
      return { ...el, color: fix.fgFix.color };
    }
    return el;
  });
}

test('contrast polish-apply closure: audit -> suggest -> apply -> re-audit drops the finding to 0', async () => {
  await withRaven(async (call) => {
    // Fixture: one failing muted label (#999 on white ~2.85:1, fails AA 4.5) + one passing body row.
    const snapshot = [
      { selector: '.muted', color: '#999999', bgColor: '#ffffff', fontPx: 16, text: 'Muted label' },
      { selector: '.body', color: '#222222', bgColor: '#ffffff', fontPx: 16, text: 'Body copy' },
    ];

    // 1. AUDIT — one real failure surfaced.
    const before = await call('audit_contrast', { dom_snapshot: snapshot });
    assert.equal(before.aa_fail_count, 1, 'fixture must start with exactly one AA failure');
    assert.equal(before.aa_failures[0].selector, '.muted');

    // 2. SUGGEST — minimal passing color for the failing pair.
    const suggestion = await call('suggest_contrast_fix', {
      pairs: before.aa_failures.map((r) => ({
        selector: r.selector, fg: r.foreground, bg: r.background, fontPx: r.fontPx, bold: r.bold,
      })),
    });
    const fix = suggestion.results[0];
    assert.equal(fix.passes, false, 'the failing pair should not already pass');
    assert.equal(fix.reachable, true, 'a single-color fix should be reachable here');
    assert.ok(fix.fgFix && fix.fgFix.color, 'suggestion must carry a concrete new foreground');

    // 3. APPLY — swap the suggested foreground into the artifact.
    const patched = applyContrastFixes(snapshot, suggestion.results);
    assert.notEqual(patched[0].color, snapshot[0].color, 'the muted row color must actually change');

    // 4. RE-AUDIT — the finding is gone, nothing new broke.
    const after = await call('audit_contrast', { dom_snapshot: patched });
    assert.equal(after.aa_fail_count, 0, 'applying the suggested fix must clear the finding to 0');
    assert.equal(after.total_text_elements, before.total_text_elements, 'no rows added or dropped');
    const bodyAfter = after.rows.find((r) => r.selector === '.body');
    assert.equal(bodyAfter.status, 'pass', 'the previously-passing row must stay passing (no new finding)');
    const mutedAfter = after.rows.find((r) => r.selector === '.muted');
    assert.equal(mutedAfter.status, 'pass', 'the fixed row must now pass');
    assert.ok(mutedAfter.ratio >= mutedAfter.required_aa, 'the re-audited ratio must actually meet the AA threshold');
  });
});

test('contrast polish-apply batch: multiple distinct failures clear in one pass, passing row untouched', async () => {
  await withRaven(async (call) => {
    // Two different failing colors (a muted gray + a too-light brand blue) and one passing row.
    // A real merge gate must clear the whole set at once without disturbing what already passed.
    const snapshot = [
      { selector: '.muted', color: '#aaaaaa', bgColor: '#ffffff', fontPx: 16, text: 'Muted label' },
      { selector: '.brand', color: '#3aa0ff', bgColor: '#ffffff', fontPx: 16, text: 'Brand link' },
      { selector: '.body', color: '#111111', bgColor: '#ffffff', fontPx: 16, text: 'Body copy' },
    ];
    const before = await call('audit_contrast', { dom_snapshot: snapshot });
    assert.equal(before.aa_fail_count, 2, 'fixture must start with two distinct AA failures');

    const suggestion = await call('suggest_contrast_fix', {
      pairs: before.aa_failures.map((r) => ({ selector: r.selector, fg: r.foreground, bg: r.background, fontPx: r.fontPx })),
    });
    // Only reachable single-color fixes are applied; unreachable ones are left for a human (ceiling).
    const patched = applyContrastFixes(snapshot, suggestion.results);

    const after = await call('audit_contrast', { dom_snapshot: patched });
    assert.equal(after.aa_fail_count, 0, 'one apply pass must clear both failures');
    assert.equal(after.total_text_elements, before.total_text_elements, 'no rows added or dropped');
    // The already-passing row must be byte-identical — the gate never edits what it did not flag.
    assert.deepEqual(patched.find((el) => el.selector === '.body'), snapshot.find((el) => el.selector === '.body'),
      'the passing row must be left untouched');
  });
});
