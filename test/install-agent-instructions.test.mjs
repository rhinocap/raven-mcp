import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const installer = resolve('scripts/install-agent-instructions.mjs');
const block = readFileSync(resolve('scripts/consult-first-block.md'), 'utf8');
const begin = '<!-- BEGIN raven design-decisions (managed by raven; edits here are overwritten) -->';
const end = '<!-- END raven design-decisions -->';

function freshDirectory() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'raven-agent-instructions-')));
}

function runInstaller(cwd) {
  const result = spawnSync(process.execPath, [installer], {
    cwd,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

function count(source, value) {
  return source.split(value).length - 1;
}

test('creates a marked instruction file when the target does not exist', () => {
  const cwd = freshDirectory();

  const summary = runInstaller(cwd);
  const output = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');

  assert.deepEqual(summary, { file: join(cwd, 'AGENTS.md'), action: 'created' });
  assert.equal(count(output, begin), 1);
  assert.equal(count(output, end), 1);
  assert.ok(output.indexOf(begin) < output.indexOf(block));
  assert.ok(output.indexOf(block) < output.indexOf(end));
  assert.ok(output.endsWith('\n'));
});

test('appends the marked block without changing existing content', () => {
  const cwd = freshDirectory();
  const target = join(cwd, 'AGENTS.md');
  const original = '# My project\n\nSome existing notes.\n';
  writeFileSync(target, original);

  const summary = runInstaller(cwd);
  const output = readFileSync(target, 'utf8');

  assert.deepEqual(summary, { file: target, action: 'appended' });
  assert.equal(output.slice(0, original.length), original);
  assert.equal(output.slice(original.length, original.length + 1), '\n');
  assert.equal(count(output, begin), 1);
  assert.equal(count(output, end), 1);
  assert.ok(output.includes(block));
});

test('updates a single managed block idempotently', () => {
  const cwd = freshDirectory();

  const firstSummary = runInstaller(cwd);
  const first = readFileSync(join(cwd, 'AGENTS.md'));
  const secondSummary = runInstaller(cwd);
  const second = readFileSync(join(cwd, 'AGENTS.md'));

  assert.equal(firstSummary.action, 'created');
  assert.equal(secondSummary.action, 'updated');
  assert.equal(count(second.toString('utf8'), begin), 1);
  assert.equal(count(second.toString('utf8'), end), 1);
  assert.deepEqual(second, first);
});

test('preserves content surrounding an existing managed block', () => {
  const cwd = freshDirectory();
  const target = join(cwd, 'AGENTS.md');
  const before = '# Before\nKeep this byte-for-byte.\n';
  const after = '\n# After\nKeep this too.\n';
  writeFileSync(target, `${before}${begin}\nSTALE CONTENT\n${end}${after}`);

  const summary = runInstaller(cwd);
  const output = readFileSync(target, 'utf8');
  const expectedManaged = `${begin}\n${block}${block.endsWith('\n') ? '' : '\n'}${end}`;

  assert.deepEqual(summary, { file: target, action: 'updated' });
  assert.equal(output, `${before}${expectedManaged}${after}`);
});
