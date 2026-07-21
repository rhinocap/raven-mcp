import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'raven-polish.mjs');
const REAL_GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();

const DESIGN_MD = `---
colors:
  ink: "#111111"
spacing:
  md: "16px"
---
# Fixture design
`;

const BASELINE = `.card {
  color: var(--ink);
  padding: var(--space-md);
}
`;

const VIOLATING = `.card {
  color: #121212;
  padding: 13px;
}
`;

const POLISHED = `.card {
  color: #111111;
  padding: 16px;
}
`;

function git(repo, args) {
  const result = spawnSync(REAL_GIT, args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function createRepo() {
  const repo = mkdtempSync(path.join(tmpdir(), 'raven-polish-cli-'));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.name', 'Raven Test']);
  git(repo, ['config', 'user.email', 'raven-test@example.com']);
  writeFileSync(path.join(repo, 'DESIGN.md'), DESIGN_MD, 'utf8');
  writeFileSync(path.join(repo, 'card.css'), BASELINE, 'utf8');
  git(repo, ['add', 'DESIGN.md', 'card.css']);
  git(repo, ['commit', '-qm', 'baseline']);
  writeFileSync(path.join(repo, 'card.css'), VIOLATING, 'utf8');
  return repo;
}

function runCli(repo, args, env = {}) {
  const state = mkdtempSync(path.join(tmpdir(), 'raven-polish-state-'));
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      RAVEN_NO_USAGE_LOG: '1',
      RAVEN_DECISIONS_HOME: path.join(state, 'decisions'),
      RAVEN_TASTE_HOME: path.join(state, 'taste'),
      RAVEN_CREATIVE_HOME: path.join(state, 'creative'),
      ...env,
    },
  });
}

test('raven-polish dry-runs, applies, and re-reviews the real worktree', () => {
  const repo = createRepo();
  const dryRun = runCli(repo, []);
  console.log(`\n--- raven-polish dry-run fixture ---\n${dryRun.stdout.trim()}`);
  assert.equal(dryRun.status, 1, dryRun.stderr);
  assert.match(dryRun.stdout, /Raven polish \(dry-run\)/);
  assert.match(dryRun.stdout, /Verdict: warn/);
  assert.match(dryRun.stdout, /Proposed changes: 2/);
  assert.match(dryRun.stdout, /  - card\.css:2   color: #121212; ->   color: #111111;/);
  assert.match(dryRun.stdout, /  - card\.css:3   padding: 13px; ->   padding: 16px;/);
  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), VIOLATING);

  const apply = runCli(repo, ['--apply', '--project', 'fixture', '--verify', 'node -e "process.exit(0)"']);
  console.log(`\n--- raven-polish apply fixture ---\n${apply.stdout.trim()}`);
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /Apply check: passed/);
  assert.match(apply.stdout, /Applied: 2 proposed changes/);
  assert.match(apply.stdout, /Real re-review: before 2 violations, after 0, verdict pass/);
  assert.match(apply.stdout, /Verify exit code: 0/);
  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), POLISHED);
});

test('raven-polish refuses HEAD apply when staged content exists', () => {
  const repo = createRepo();
  git(repo, ['add', 'card.css']);
  const before = readFileSync(path.join(repo, 'card.css'), 'utf8');

  const result = runCli(repo, ['--apply']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing --apply with staged changes: card\.css; commit or unstage them first/);
  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), before);
});

test('raven-polish refuses committed-range apply unless HEAD equals the range RHS', () => {
  const repo = createRepo();
  git(repo, ['add', 'card.css']);
  git(repo, ['commit', '-qm', 'violating change']);

  const result = runCli(repo, ['--range', 'HEAD~1', '--apply']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HEAD must equal the range right-hand side HEAD~1/);
  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), VIOLATING);
});

test('raven-polish reports untracked files without reviewing them', () => {
  const repo = createRepo();
  writeFileSync(path.join(repo, 'new.css'), '.new {}\n', 'utf8');

  const result = runCli(repo, []);

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Untracked \(not reviewed\): new\.css/);
});

test('raven-polish fails closed when the worktree changes before apply check', () => {
  const repo = createRepo();
  const bin = mkdtempSync(path.join(tmpdir(), 'raven-polish-git-wrapper-'));
  const wrapper = path.join(bin, 'git');
  const corrupted = '.card { color: #abcdef; }\n';
  writeFileSync(wrapper, `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'apply' && args[1] === '--check') {
  writeFileSync(${JSON.stringify(path.join(repo, 'card.css'))}, ${JSON.stringify(corrupted)}, 'utf8');
}
const result = spawnSync(${JSON.stringify(REAL_GIT)}, args, { stdio: ['inherit', 'inherit', 'inherit'] });
process.exit(result.status === null ? 1 : result.status);
`, 'utf8');
  chmodSync(wrapper, 0o755);

  const result = runCli(repo, ['--apply'], { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /git apply --check failed; nothing was applied/);
  assert.equal(readFileSync(path.join(repo, 'card.css'), 'utf8'), corrupted);
  assert.doesNotMatch(readFileSync(path.join(repo, 'card.css'), 'utf8'), /#111111|16px/);
});

test('apply mode still re-reviews and verifies manual-only findings', () => {
  const repo = createRepo();
  writeFileSync(path.join(repo, 'card.css'), '.card { color: #12121280; }\n', 'utf8');
  const verify = `node -e "require('fs').writeFileSync('verify-ran', 'yes')"`;

  const result = runCli(repo, ['--apply', '--verify', verify]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Apply: no deterministic patch proposed/);
  assert.match(result.stdout, /Real re-review: before 1 violations, after 1, verdict warn/);
  assert.match(result.stdout, /Verify exit code: 0/);
  assert.equal(readFileSync(path.join(repo, 'verify-ran'), 'utf8'), 'yes');
});
