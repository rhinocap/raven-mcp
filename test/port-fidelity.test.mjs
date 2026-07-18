import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fidelity = await import(path.resolve(__dirname, '../dist/port-fidelity.js'));

test('verbatim port reports verbatim with no changes', () => {
  const result = fidelity.diffPortText('Field-tested work that lasts.', 'Field-tested work that lasts.');
  assert.equal(result.verdict, 'verbatim');
  assert.deepEqual(result.substituted, []);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.moved, []);
  assert.deepEqual(result.case_changed, []);
});

test('one-word substitution preserves source, target, and locating context', () => {
  const result = fidelity.diffPortText(
    'Built from field-tested patterns for teams.',
    'Built from proven patterns for teams.'
  );
  assert.equal(result.verdict, 'diverged');
  assert.equal(result.substituted.length, 1);
  assert.equal(result.substituted[0].source, 'field-tested');
  assert.equal(result.substituted[0].target, 'proven');
  assert.match(result.substituted[0].context, /Built from/);
  assert.match(result.substituted[0].context, /patterns for teams/);
});

test('dropped sentence is reported as a dropped run', () => {
  const result = fidelity.diffPortText(
    'First sentence stays. This sentence was dropped. Final sentence stays.',
    'First sentence stays. Final sentence stays.'
  );
  assert.deepEqual(result.dropped.map((entry) => entry.source), ['This sentence was dropped']);
  assert.deepEqual(result.substituted, []);
  assert.deepEqual(result.added, []);
});

test('moved block is cross-matched once instead of reported as dropped and added', () => {
  const result = fidelity.diffPortText(
    'Alpha opening words. Beta middle block. Gamma closing words.',
    'Beta middle block. Alpha opening words. Gamma closing words.'
  );
  assert.equal(result.moved.length, 1);
  assert.ok(['Alpha opening words', 'Beta middle block'].includes(result.moved[0].text));
  assert.deepEqual(result.substituted, []);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.added, []);
});

test('punctuation, entities, quote styles, and dash styles do not create changes', () => {
  const result = fidelity.diffPortText(
    'Raven & design — “field-tested” work.',
    'Raven &amp; design - "field-tested" work!'
  );
  assert.equal(result.verdict, 'verbatim');
  assert.deepEqual(result.substituted, []);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.added, []);
});

test('case-only change is isolated from substitutions', () => {
  const result = fidelity.diffPortText('Design systems endure.', 'design systems endure.');
  assert.equal(result.verdict, 'diverged');
  assert.deepEqual(result.substituted, []);
  assert.deepEqual(result.case_changed.map((entry) => [entry.source, entry.target]), [['Design', 'design']]);
});

test('combining-mark changes are reported as substitutions', () => {
  const result = fidelity.diffPortText('कि', 'कु');
  assert.equal(result.verdict, 'diverged');
  assert.deepEqual(result.substituted.map((entry) => [entry.source, entry.target]), [['कि', 'कु']]);
});

test('emoji changes are substitutions while identical emoji remains verbatim', () => {
  const changed = fidelity.diffPortText('Status 👍 approved', 'Status 👎 approved');
  assert.equal(changed.verdict, 'diverged');
  assert.deepEqual(changed.substituted.map((entry) => [entry.source, entry.target]), [['👍', '👎']]);

  const identical = fidelity.diffPortText('Status 👩🏽‍💻 approved', 'Status 👩🏽‍💻 approved');
  assert.equal(identical.verdict, 'verbatim');
});

test('flag emoji changes are substitutions while identical flags remain verbatim', () => {
  const changed = fidelity.diffPortText('US flag 🇺🇸 here', 'US flag 🇬🇧 here');
  assert.equal(changed.verdict, 'diverged');
  assert.deepEqual(changed.substituted.map((entry) => [entry.source, entry.target]), [['🇺🇸', '🇬🇧']]);

  const identical = fidelity.diffPortText('US flag 🇺🇸 here', 'US flag 🇺🇸 here');
  assert.equal(identical.verdict, 'verbatim');
});

test('reordered multi-word blocks are moved without dropped or added leftovers', () => {
  const result = fidelity.diffPortText(
    'Alpha opening introduction common shared ending. Beta middle conclusion common shared ending.',
    'Beta middle conclusion common shared ending. Alpha opening introduction common shared ending.'
  );
  assert.ok(result.moved.length > 0);
  assert.deepEqual(result.substituted, []);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.added, []);
});

test('quoted attribute greater-than signs do not leak into extracted text', () => {
  const visible = fidelity.extractVisibleText('<div title="a>b">Visible copy</div>');
  assert.equal(visible, 'Visible copy');
  assert.equal(fidelity.diffPortText('Visible copy', visible).verdict, 'verbatim');
});

test('bare less-than comparisons remain visible prose instead of being stripped as tags', () => {
  const source = 'a < b and c > d, 5<6';
  const visible = fidelity.extractVisibleText(source);
  assert.equal(visible, source);
  assert.equal(fidelity.diffPortText(source, visible).verdict, 'verbatim');
});

test('common named entities decode to their visible characters', () => {
  const visible = fidelity.extractVisibleText('Copyright &copy; 2026');
  assert.equal(visible, 'Copyright © 2026');
  assert.equal(fidelity.diffPortText('Copyright © 2026', visible).verdict, 'verbatim');
});

test('oversized input is capped honestly without crashing', () => {
  const source = Array.from({ length: fidelity.PORT_TOKEN_CAP + 1 }, () => 'same');
  const target = source.slice();
  target[target.length - 1] = 'changed';
  const result = fidelity.diffPortText(source.join(' '), target.join(' '));
  assert.equal(result.token_counts.capped, true);
  assert.equal(result.token_counts.compared_source, fidelity.PORT_TOKEN_CAP);
  assert.equal(result.token_counts.compared_target, fidelity.PORT_TOKEN_CAP);
  assert.ok(result.warnings.some((warning) => /capped/i.test(warning)));
  assert.equal(result.verdict, 'diverged');
});
