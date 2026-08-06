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
// directories — `.claude`, `.codex`, `.agents`, `.gstack`, `.cursor` — under a
// home directory. That covers `/Users/<name>/…`, the Linux `/home/<name>/…`
// form, realm-qualified names (`/home/alice@example.com/…`, which an AD/LDAP
// box hands out), bare `/root/…` for a container agent, and the same tooling
// directory NESTED under a project on another machine. Every one of the three
// leaks carried that string, and it is never correct in a shipped public repo:
// it is a local machine path by construction.
//
// The nested form carries one exception that is load-bearing rather than
// convenient: a `.claude/` inside THIS checkout has exactly the same shape, and
// it is named legitimately in docs, runbooks and session logs. Those are
// excluded by prefix, so the nested rule only ever fires on someone else's
// machine. Widening it to flag this repo's own paths would produce a gate too
// noisy to keep, which is the failure mode that let the class through before.
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
//   * A NESTED path whose middle segment runs past NESTED_SPAN_MAX (4096) chars.
//     That is longer than PATH_MAX on either platform, so it cannot name a real
//     location — but the bound exists and is a bound. It was 200 until an adverse
//     pass pointed out that 201 characters of nesting walked straight through.
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
//
// The username class includes `@` because realm-qualified home directories are
// real: an AD/LDAP-joined Linux box gives `/home/alice@example.com`, and round
// 11's adverse pass showed the previous class walked straight past one. `/root`
// is spelled separately because root's home has no username segment at all.
const TOOL_DIRS = '(?:claude|codex|agents|gstack|cursor)';
const PRIVATE_PATH = new RegExp(
  '(?:(?:\\/Users|\\/home)\\/[A-Za-z0-9._@-]+|\\/root)\\/\\.' + TOOL_DIRS + '\\b'
);

// The same tooling directory NESTED under a home directory rather than sitting
// directly in it — a home dir, then a project path, then `/.claude`. Every
// project-scoped `.claude/` has this shape, including this repo's own, which is
// why it cannot simply be folded into PRIVATE_PATH: a doc or log that names this
// checkout's own `.claude/` path is not a disclosure and flagging it is how a
// gate gets muted. So a hit only counts when the path is NOT inside this
// checkout — which is exactly the condition that makes it someone else's machine.
// The middle segment is LAZY, and that is load-bearing rather than stylistic. A
// greedy class swallows as much as it can before the last `/.claude` on the
// line, so a line holding an in-repo path and an out-of-repo one — separated by
// anything that is not whitespace or a quote, `:` in a PATH-style list being the
// obvious case — matched as ONE span that started inside the repo, got dropped by
// the prefix exclusion, and took the real leak with it. Lazy makes each match the
// SHORTEST span ending at a tooling directory, so the in-repo path is discarded
// on its own and the scan resumes at the next one. An adverse pass demonstrated
// the greedy bypass with a literal two-path line.
//
// The span bound was 200 and a later adverse pass showed that is itself a bypass:
// a home directory, 201 characters of nesting, then `/.claude/settings.json`
// matched nothing at all. 200 was never a considered number. NESTED_SPAN_MAX is
// now 4096, which is PATH_MAX on Linux and four times macOS's 1024 — every path
// that can exist on a real filesystem fits, so a longer one is not a location
// anybody's machine could have handed over. The bound is kept rather than removed
// because an unbounded lazy class over an 8MB blob is quadratic in the worst case,
// and this gate runs on every `npm test`. It remains a real, stated limit: see the
// "what this does NOT catch" list in the header.
const NESTED_SPAN_MAX = 4096;
const NESTED_PRIVATE_PATH = new RegExp(
  '(?:(?:\\/Users|\\/home)\\/[A-Za-z0-9._@-]+|\\/root)\\/[^\\s"\'`]{1,' + NESTED_SPAN_MAX + '}?\\/\\.' + TOOL_DIRS + '\\b',
  'g'
);

// True when the text stages an absolute private-tooling path from a machine
// other than this checkout.
//
// The `repoRoot` exclusion is a STRING PREFIX test, not a path resolution, so a
// `..` segment walks straight back out of the checkout while still satisfying it
// — `<repoRoot>/../private/.claude/settings.json` starts with `<repoRoot>/` and
// points somewhere else entirely. Same adverse pass, same file. Any match
// containing a `..` segment is therefore never excluded: a legitimate reference
// to this repo's own tooling directory has no reason to route through the parent.
// Iterating every match is necessary and was not sufficient. `exec` with `/g`
// resumes at the END of the previous match, so a hit that gets EXCLUDED takes
// every overlapping start with it — `<repoRoot>/artifact:/Users/someone/work/
// private-thing/.claude/settings.json` matches once from the in-repo `/Users`,
// is discarded by the prefix test, and the scan resumes past the foreign
// `/.claude` without ever trying the second `/Users`. Round 13 fixed the
// symptom (one match per line) and left the mechanism; a later adverse pass
// produced the overlapping variant. On an exclusion, `lastIndex` is therefore
// rewound to one character past where the discarded match STARTED, so every
// later start is still reachable. Advancing by one rather than to `match.index`
// is what keeps this terminating.
function findPrivatePath(text) {
  const direct = PRIVATE_PATH.exec(text);
  if (direct) return direct[0];
  NESTED_PRIVATE_PATH.lastIndex = 0;
  let match;
  while ((match = NESTED_PRIVATE_PATH.exec(text)) !== null) {
    const hit = match[0];
    const escapesRepo = hit.split('/').includes('..');
    if (escapesRepo || !hit.startsWith(repoRoot + '/')) return hit;
    NESTED_PRIVATE_PATH.lastIndex = match.index + 1;
  }
  return null;
}

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
// A realm-qualified home directory, as an AD/LDAP-joined box hands out.
function leakRealm(tool, tail) {
  return ROOT_LINUX + '/alice@example.com' + DOT + tool + tail;
}
// root's home has no username segment.
function leakRoot(tool, tail) {
  return '/ro' + 'ot' + DOT + tool + tail;
}
// The tooling directory nested under a project on SOMEONE ELSE's machine.
function leakNested(root, tool, tail) {
  return root + '/someone/work/private-thing' + DOT + tool + tail;
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
    let hits = 0;
    let firstHit = null;
    for (const line of text.split('\n')) {
      const hit = findPrivatePath(line);
      if (hit === null) continue;
      hits += 1;
      if (firstHit === null) firstHit = hit;
    }
    if (hits > 0 && !KNOWN_PUBLISHED.has(rel)) offenders.push(`${rel} (${hits} lines, e.g. ${firstHit})`);
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
  assert.ok(findPrivatePath('  1642 ' + leak(ROOT_MAC, 'agents', '/skills/gstack/review/SKILL.md')),
    'the matcher missed an absolute private-tooling path');
  assert.ok(findPrivatePath('sed -n \'1,240p\' ' + leak(ROOT_MAC, 'codex', '/memories/MEMORY.md')),
    'the matcher missed an absolute .codex path');
  assert.ok(findPrivatePath('loaded ' + leak(ROOT_LINUX, 'claude', '/CLAUDE.md')),
    'the matcher missed the Linux form — a leak from a container or CI agent');

  // The three shapes round 11's adverse pass found the previous class walking
  // past. Each one is a real machine layout, not a hypothetical.
  assert.ok(findPrivatePath('loaded ' + leakRealm('claude', '/CLAUDE.md')),
    'the matcher missed a realm-qualified home directory — an AD/LDAP-joined ' +
    'Linux box gives every user one, and the `@` was outside the username class');
  assert.ok(findPrivatePath('loaded ' + leakRoot('codex', '/config.toml')),
    'the matcher missed root\'s home, which has no username segment at all — ' +
    'the shape every container agent running as root produces');
  assert.ok(findPrivatePath('read ' + leakNested(ROOT_MAC, 'claude', '/settings.local.json')),
    'the matcher missed a project-scoped tooling directory on another machine — ' +
    'the previous pattern only saw the tooling dir sitting DIRECTLY in $HOME');

  assert.ok(!findPrivatePath('add the snippet to `~/.codex/config.toml`'),
    'the matcher flagged install documentation, which is the noise that gets a gate muted');
  assert.ok(!findPrivatePath('taste profiles live in ~/.raven/taste'),
    'the matcher flagged the product\'s own config path');
  assert.ok(!findPrivatePath(ROOT_MAC + '/someone/projects/raven-mcp'),
    'the matcher flagged an ordinary local path, which is noise rather than disclosure');
  assert.ok(!findPrivatePath('scratch dir ' + ROOT_MAC + '/someone/.r5-workspace'),
    'the matcher flagged an unrelated home dot-directory');

  // The load-bearing negative for the nested pattern. THIS checkout's own
  // `.claude/` has exactly the same shape as the leak above, and it is named
  // legitimately in docs and session logs. If this fires, the nested rule is a
  // false-positive generator and the gate gets muted — which is how the class
  // escaped three times already.
  assert.equal(findPrivatePath('see ' + repoRoot + '/.cl' + 'aude/skills/release/SKILL.md'), null,
    'the matcher flagged this repo\'s OWN project-scoped tooling directory');
  assert.equal(findPrivatePath(repoRoot + '/.cl' + 'aude'), null,
    'the matcher flagged this checkout root\'s own tooling directory');

  // The two ways round 12's exclusion was bypassed, both demonstrated by an
  // adverse pass with literal strings rather than argued.
  assert.ok(findPrivatePath(repoRoot + '/../private' + DOT + 'claude/settings.json'),
    'a `..` segment walks out of the checkout while still satisfying the repoRoot ' +
    'string prefix — the exclusion is a prefix test, not a path resolution');
  assert.ok(findPrivatePath(repoRoot + '/.cl' + 'aude:' + leakNested(ROOT_MAC, 'claude', '/settings.json')),
    'a greedy middle segment matched an in-repo path and an out-of-repo path as ' +
    'ONE span, which the repoRoot exclusion then discarded whole — taking the ' +
    'real leak with it');

  // The third bypass, from the round-13 adverse pass: the span bound itself.
  // At 200 characters a leak nested 201 deep matched nothing.
  //
  // The fixtures are built FROM `NESTED_SPAN_MAX` rather than from a literal,
  // because a fixed 301-character path plus a standalone `NESTED_SPAN_MAX ===
  // 4096` assertion does NOT prove the matcher honours the constant — round 14's
  // version did exactly that, and the next adverse pass produced the weakening it
  // survives: leave the constant at 4096 and build the regex with `{1,512}`. Both
  // assertions stay green while a 601-character path walks through. Measuring at
  // the boundary is what ties the test to the effective bound.
  const nestAt = (chars) => {
    const filler = 'a/'.repeat(Math.ceil(chars / 2)).slice(0, chars - 1) + '/';
    return ROOT_MAC + '/someone/' + filler + DOT + 'claude/settings.json';
  };
  assert.ok(findPrivatePath(nestAt(NESTED_SPAN_MAX - 1)),
    'a leak nested to just inside NESTED_SPAN_MAX was missed, so the matcher is ' +
    'built with a SMALLER bound than the constant advertises — asserting the ' +
    'constant alone does not detect that');
  assert.equal(findPrivatePath(nestAt(NESTED_SPAN_MAX + 200)), null,
    'a leak nested past NESTED_SPAN_MAX was caught, so the bound is not where ' +
    'the header says it is — the documented limit must be the real one in both ' +
    'directions');
  assert.equal(NESTED_SPAN_MAX, 4096,
    'the span bound moved without the header\'s stated-limits list moving with it');

  // The fourth bypass, from the round-14 pass: OVERLAPPING matches. An in-repo
  // path and a foreign one on the same line, where the foreign `/.claude` sits
  // inside the span the in-repo match consumed.
  assert.ok(findPrivatePath(repoRoot + '/artifact:' + leakNested(ROOT_MAC, 'claude', '/settings.json')),
    'an excluded in-repo match swallowed an OVERLAPPING foreign path — `exec` ' +
    'with /g resumes past the whole discarded match, so the second start was ' +
    'never tried');
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
