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
// `.cursor`, plus the Linux `/home/<name>/…` form of the same. Every one of the
// three leaks carried that string, and it is never correct in a shipped public
// repo: it is a local machine path by construction.
//
// It reads the INDEX, not the working tree. `git ls-files` enumerates what is
// staged, and an adverse pass pointed out that reading the working-tree bytes for
// those paths measures a different thing: stage a leaking blob, clean the working
// copy, and a worktree scan passes while the staged content is what actually gets
// published. `git cat-file --batch` over the staged OIDs closes that gap — this
// now checks the bytes a commit would carry.
//
// ── What this does NOT catch, stated rather than implied ──────────────────────
//
// The gate matches ONE signature. It is the signature all three real leaks had,
// and it is worth having, but it is not the whole class:
//
//   * Private PROSE with no absolute path — a quoted personal instruction, a
//     verbatim skill file that happens not to name its own location.
//   * Encoded forms — base64, percent-encoding, JSON-escaped separators.
//   * `$HOME/.claude/…`, Windows `C:\Users\…\.claude`, or a tooling directory
//     nobody has invented yet.
//   * Text inside a file with an extension in SKIP_EXT (a text-bearing PDF), a
//     file over 8MB, or one containing a NUL byte.
//
// Do not read a green run as "nothing private is committed". Read it as "no
// absolute private-tooling path is staged". The human check before committing
// anything under `.claude/` is still the primary defense; this is the backstop
// that catches the specific mistake that has actually been made three times.
//
// Two deliberate exclusions, both measured rather than assumed:
//
//   * TILDE forms (`~/.codex/config.toml`, `~/.cursor/mcp.json`) are NOT matched.
//     They are install instructions and appear legitimately in README.md,
//     site/docs.html and the docs. A first draft of this gate flagged 40 files
//     on that pattern, almost all of them documentation — a gate that noisy gets
//     muted, which is worse than no gate. The cost is real and is accepted: a
//     transcript that only ever writes `~/.claude/...` passes.
//   * Other home dot-directories (`/Users/<name>/.local`, and the pre-gate
//     experiments' `.r5-workspace` / `.pregate-r5-*` scratch dirs) are noise, not
//     disclosure. Folding them in would bury the signal.
//
// `~/.raven` is the product's own config location and belongs in the docs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// An absolute path into one of the private agent-tooling directories. Tilde
// forms are documentation and are deliberately not matched — see the header.
const PRIVATE_PATH = /(?:\/Users|\/home)\/[A-Za-z0-9._-]+\/\.(?:claude|codex|agents|gstack|cursor)\b/;

// Built from fragments on purpose. If this file spelled a matching path out
// literally it would have to exempt itself from its own scan — and the previous
// version did exactly that, which meant a transcript appended to the bottom of
// this file was the one place the gate could never see. There is no
// self-exclusion now; the fixtures below are assembled at runtime so the file's
// own bytes stay clean.
const ROOT_MAC = '/Us' + 'ers';
const ROOT_LINUX = '/ho' + 'me';
const DOT = '/.';
function leak(root, tool, tail) {
  return root + '/someone' + DOT + tool + tail;
}

// Known-published exceptions, quarantined rather than silently tolerated.
//
// This set is EMPTY and a test below asserts that it is. It used to hold
// `.claude/pregate-2026-08-02/SOL-VERDICT-RAW.txt`, which had been pushed to the
// public repo before this gate existed; that file is no longer tracked, so the
// quarantine is closed. It is deliberately not a `<= 1` cap: an adverse pass
// pointed out that a cap lets a NEW offender take the departed one's slot and
// keep the test green. An exact-empty assertion cannot be satisfied that way —
// adding any entry fails, which is the point. If a file ever genuinely has to be
// listed here, that edit should be as loud in review as the leak it excuses.
const KNOWN_PUBLISHED = new Set([]);

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mcpb',
  '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mov', '.zip', '.pdf'
]);

const MAX_BYTES = 8 * 1024 * 1024;

// Staged blobs, as `{ rel, oid }`. `-s` prints `<mode> <oid> <stage>\t<path>`.
function stagedBlobs() {
  return execFileSync('git', ['ls-files', '-s', '-z'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      const [mode, oid] = entry.slice(0, tab).split(' ');
      return { rel: entry.slice(tab + 1), oid, mode };
    })
    .filter((e) => e.mode !== '160000'); // submodule gitlinks have no blob
}

// One `git cat-file --batch` for every OID rather than N subprocesses. The
// output is `<oid> <type> <size>\n<content>\n` repeated, so it has to be walked
// as a Buffer — content is arbitrary bytes and may contain newlines or NULs.
function readStaged(entries) {
  const raw = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: entries.map((e) => e.oid).join('\n') + '\n',
    maxBuffer: 512 * 1024 * 1024
  });

  const out = new Map();
  let at = 0;
  for (const entry of entries) {
    const nl = raw.indexOf(0x0a, at);
    if (nl < 0) break;
    const header = raw.toString('utf8', at, nl).split(' ');
    const size = Number(header[2]);
    const start = nl + 1;
    if (!Number.isFinite(size)) break;
    out.set(entry.rel, size > MAX_BYTES ? null : raw.subarray(start, start + size));
    at = start + size + 1; // trailing LF after the content
  }
  return out;
}

test('no staged file leaks a private home-directory path into this public repo', () => {
  const entries = stagedBlobs().filter((e) => !SKIP_EXT.has(path.extname(e.rel).toLowerCase()));
  const contents = readStaged(entries);

  // If the batch walk desynchronised, every later file would be scanned as
  // garbage and quietly pass. Prove it kept up.
  assert.equal(contents.size, entries.length,
    'the cat-file batch walk desynchronised — ' + contents.size + ' of ' + entries.length +
    ' blobs were read, so the rest were never scanned');

  const offenders = [];
  for (const { rel } of entries) {
    const buf = contents.get(rel);
    if (!buf) continue;                          // oversized, documented above
    if (buf.includes(0)) continue;               // binary without a known extension

    const text = buf.toString('utf8');
    const hits = text.split('\n').reduce((n, line) => n + (PRIVATE_PATH.test(line) ? 1 : 0), 0);
    if (hits > 0 && !KNOWN_PUBLISHED.has(rel)) offenders.push(`${rel} (${hits} lines)`);
  }

  assert.deepEqual(offenders, [],
    'These staged files contain absolute private home-directory paths and would be published:\n  ' +
    offenders.join('\n  ') +
    '\n\nThis is almost always a raw agent transcript committed by accident. Delete the file, ' +
    'add it to .gitignore, and if it is already committed but UNPUSHED strip it from history ' +
    'with `git filter-branch --index-filter` before pushing.');
});

test('the gate is falsifiable — its own pattern matches a synthetic leak', () => {
  // A check whose failure mode is indistinguishable from its success mode is not
  // a check. This proves the matcher fires, so a clean run above means "scanned
  // and found nothing" rather than "silently matched nothing".
  assert.ok(PRIVATE_PATH.test('  1642 ' + leak(ROOT_MAC, 'agents', '/skills/gstack/review/SKILL.md')),
    'the matcher missed an absolute private-tooling path');
  assert.ok(PRIVATE_PATH.test('sed -n \'1,240p\' ' + leak(ROOT_MAC, 'codex', '/memories/MEMORY.md')),
    'the matcher missed an absolute .codex path');
  assert.ok(PRIVATE_PATH.test('loaded ' + leak(ROOT_LINUX, 'claude', '/CLAUDE.md')),
    'the matcher missed the Linux form — a leak from a container or CI agent');
  assert.ok(!PRIVATE_PATH.test('add the snippet to `~/.codex/config.toml`'),
    'the matcher flagged install documentation, which is the noise that gets a gate muted');
  assert.ok(!PRIVATE_PATH.test('taste profiles live in ~/.raven/taste'),
    'the matcher flagged the product\'s own config path');
  assert.ok(!PRIVATE_PATH.test(ROOT_MAC + '/someone/projects/raven-mcp'),
    'the matcher flagged an ordinary local path, which is noise rather than disclosure');
  assert.ok(!PRIVATE_PATH.test('scratch dir ' + ROOT_MAC + '/someone/.r5-workspace'),
    'the matcher flagged an unrelated home dot-directory');
});

test('the gate scans this file too — it has no self-exclusion', () => {
  // The previous version skipped `test/no-private-paths.test.mjs` by name,
  // because it spelled matching paths out literally in the fixtures above. That
  // made this file the one guaranteed-blind spot in the repo: append a
  // transcript here and nothing fires. The fixtures are assembled from fragments
  // now, so the file can be scanned like any other — and this asserts that it IS
  // in the scanned set, since dropping it from the list would silently restore
  // the blind spot.
  const scanned = stagedBlobs()
    .filter((e) => !SKIP_EXT.has(path.extname(e.rel).toLowerCase()))
    .map((e) => e.rel);
  assert.ok(scanned.includes('test/no-private-paths.test.mjs'),
    'the gate no longer scans itself, which is where a leak would be invisible');

  // Whether this file's own CONTENT is clean is not asserted separately — the
  // main scan above covers it now, and a duplicate check here would be the same
  // measurement written twice. This test guards the one thing the main scan
  // cannot report on: its own coverage.
});

test('the known-published quarantine is empty and exactly-asserted', () => {
  // Exactly empty, not "at most N". A cap is satisfiable by swapping a new
  // offender in for a departed one; this is not.
  assert.deepEqual([...KNOWN_PUBLISHED], [],
    'a file was allowlisted past the private-path gate — remove the file instead');
});
