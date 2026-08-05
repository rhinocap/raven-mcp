// This repository is PUBLIC and `.claude/` is tracked, so any agent transcript
// committed under it publishes whatever context that agent loaded — a global
// CLAUDE.md, a private skill file dumped by `sed`, cross-project memory.
//
// That leaked three times in one session, and each fix was a narrower guess than
// the class it was defending:
//
//   1. `.claude/pregate-*/sol/`  — scoped to a DIRECTORY. The next evidence
//      directory was named `patternlib-2026-08-04/out/`, so six Sol transcripts
//      went in unnoticed.
//   2. `SOL-*.log`               — scoped to ONE AGENT's filename. Four
//      `*-codex.log` files from the same fan-out were already committed.
//   3. `.claude/**/*.log`        — scoped to an EXTENSION. `SOL-ROUND2.md` is a
//      794KB raw transcript that happens to end in `.md`.
//
// Prose and globs have now failed three times, so the rule lives in the engine
// instead. A `.gitignore` pattern has to predict the filename; this predicts the
// CONTENT, which is the thing that actually defines the class.
//
// What it looks for: an ABSOLUTE path into one of the private agent-tooling
// directories — `/Users/<name>/.claude`, `.codex`, `.agents`, `.gstack`,
// `.cursor`. Every one of the three leaks carried that string, and it is never
// correct in a shipped public repo: it is a local machine path by construction.
//
// Two deliberate exclusions, both measured rather than assumed:
//
//   * TILDE forms (`~/.codex/config.toml`, `~/.cursor/mcp.json`) are NOT matched.
//     They are install instructions and appear legitimately in README.md,
//     site/docs.html and the docs. A first draft of this gate flagged 40 files
//     on that pattern, almost all of them documentation — a gate that noisy gets
//     muted, which is worse than no gate.
//   * Other home dot-directories (`/Users/<name>/.local`, and the pre-gate
//     experiments' `.r5-workspace` / `.pregate-r5-*` scratch dirs) are noise, not
//     disclosure. Folding them in would bury the signal.
//
// `~/.raven` is the product's own config location and belongs in the docs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// An absolute path into one of the private agent-tooling directories. Tilde
// forms are documentation and are deliberately not matched — see the header.
const PRIVATE_PATH = /\/Users\/[A-Za-z0-9._-]+\/\.(?:claude|codex|agents|gstack|cursor)\b/;

// Known-published exception, quarantined rather than silently tolerated.
//
// `.claude/pregate-2026-08-02/SOL-VERDICT-RAW.txt` was pushed to the public repo
// in commit 2487fb5 before this gate existed. Removing it from the working tree
// does not unpublish it, and rewriting published history on a public repo is a
// force-push that breaks every existing clone — an owner's decision, not an
// agent's. It is listed here so this gate can protect every FUTURE file while the
// remediation call is pending. Do not add entries to make a new failure go away;
// the correct fix for a new hit is to not commit the file.
const KNOWN_PUBLISHED = new Set([
  '.claude/pregate-2026-08-02/SOL-VERDICT-RAW.txt'
]);

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mcpb',
  '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mov', '.zip', '.pdf'
]);

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

test('no tracked file leaks a private home-directory path into this public repo', () => {
  const offenders = [];

  for (const rel of trackedFiles()) {
    if (SKIP_EXT.has(path.extname(rel).toLowerCase())) continue;
    if (rel === 'test/no-private-paths.test.mjs') continue; // the pattern itself lives here

    const abs = path.join(repoRoot, rel);
    let text;
    try {
      if (statSync(abs).size > 8 * 1024 * 1024) continue;
      text = readFileSync(abs, 'utf8');
    } catch {
      continue; // deleted-but-tracked, or not readable as text
    }
    if (text.includes('\0')) continue; // binary without a known extension

    const hits = text.split('\n').reduce((n, line) => n + (PRIVATE_PATH.test(line) ? 1 : 0), 0);
    if (hits > 0 && !KNOWN_PUBLISHED.has(rel)) offenders.push(`${rel} (${hits} lines)`);
  }

  assert.deepEqual(offenders, [],
    'These tracked files contain absolute private home-directory paths and would be published:\n  ' +
    offenders.join('\n  ') +
    '\n\nThis is almost always a raw agent transcript committed by accident. Delete the file, ' +
    'add it to .gitignore, and if it is already committed but UNPUSHED strip it from history ' +
    'with `git filter-branch --index-filter` before pushing.');
});

test('the gate is falsifiable — its own pattern matches a synthetic leak', () => {
  // A check whose failure mode is indistinguishable from its success mode is not
  // a check. This proves the matcher fires, so a clean run above means "scanned
  // and found nothing" rather than "silently matched nothing".
  assert.ok(PRIVATE_PATH.test('  1642 /Users/someone/.agents/skills/gstack/review/SKILL.md'),
    'the matcher missed an absolute private-tooling path');
  assert.ok(PRIVATE_PATH.test('sed -n \'1,240p\' /Users/someone/.codex/memories/MEMORY.md'),
    'the matcher missed an absolute .codex path');
  assert.ok(!PRIVATE_PATH.test('add the snippet to `~/.codex/config.toml`'),
    'the matcher flagged install documentation, which is the noise that gets a gate muted');
  assert.ok(!PRIVATE_PATH.test('taste profiles live in ~/.raven/taste'),
    'the matcher flagged the product\'s own config path');
  assert.ok(!PRIVATE_PATH.test('workdir: /Users/someone/projects/raven-mcp'),
    'the matcher flagged an ordinary local path, which is noise rather than disclosure');
  assert.ok(!PRIVATE_PATH.test('scratch dir /Users/someone/.r5-workspace'),
    'the matcher flagged an unrelated home dot-directory');
});

test('the known-published exception is a quarantine list, not an escape hatch', () => {
  // If someone empties this set because the file was finally remediated, good.
  // If it grows, that is a regression and should be visible in review.
  assert.ok(KNOWN_PUBLISHED.size <= 1,
    'the quarantine list grew — a new leak was allowlisted instead of being removed');
});
