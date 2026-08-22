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
//   * A foreign home directory whose LAST segment ends in a space, immediately
//     followed by a rooted path into this checkout. The nearest home-directory
//     start is then the repo root, so it reads as this repo's own. That input is
//     byte-identical in shape to ordinary prose naming two paths on one line,
//     which tracked files do constantly — see the anchor discussion below.
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

// The exclusion for this repo's OWN tooling directory cannot rest on the
// checkout path alone, and round 21 is the round that measured it. `repoRoot`
// is wherever this working copy happens to live; the 95 tracked files that
// legitimately name this repo's `.claude` spell the AUTHORING checkout
// ABSOLUTELY, so on any other machine those literals stop matching `repoRoot`,
// every one of them is reported as a leak, and the gate fails red on a clean
// tree. Measured rather than reasoned: release run 32604508519 failed exactly
// this way under `/home/runner/work/raven-mcp/raven-mcp`, on content that had
// been green here for twenty rounds. A gate that holds on one machine is not a
// gate, and the direction it fails in is the one that gets a gate MUTED.
//
// So the repo's own roots are DECLARED and the running checkout is added to
// them. This is not a quarantine of leaked content — that is KNOWN_PUBLISHED,
// which stays frozen empty and must never gain an entry. It is the identity of
// this repository, and it is deliberately the NARROWEST thing that fixes the
// portability defect: a path into any OTHER project under the same home, or
// into that home's own top-level tooling directory, is still a leak, and both
// directions are asserted below.
const AUTHORING_CHECKOUT = '/Us' + 'ers' + '/accunliffe/projects/raven-mcp';
const OWN_CHECKOUTS = [repoRoot, AUTHORING_CHECKOUT];

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
// The middle segment excludes line breaks, tabs and quoting characters — but
// NOT the space. `[^\s…]` did, and a later adverse pass showed that is the same
// bypass wearing a fourth costume: a home directory, then `work/My Project`,
// then the tooling directory matched NOTHING, because a space is legal in a
// macOS or Linux path and "My Project" is the single most ordinary directory
// name there is. The leak never even reached the rewind logic below.
//
// (The example is written in prose rather than as a literal on purpose. The
// first draft of this comment spelled the path out, and staging it turned this
// gate red against its own source — which is the gate working, and is the
// reason its other literals are split too.)
//
// Allowing the space widens what a single match can span, so it was measured
// rather than assumed: with it allowed, the gate still returns zero hits across
// every tracked blob in this repo. The residual false positive is prose that
// writes a home path, then a space, then a `/.claude` on the SAME line — which
// the `\b`-terminated tooling-directory anchor makes rare, and which is loud
// and one rename away from fixed. A false negative publishes private context to
// a public repo; that asymmetry is the whole reason this file exists.
//
// The apostrophe, the double quote and the backtick were excluded outright for
// exactly one round, and the judgement written here — that `Andrew's Project` is
// rarer than the cost of unquoting — was refuted by a measurement rather than by
// an argument. They are all legal POSIX filename characters, so a directory
// named with one of them was a false NEGATIVE on a completely unambiguous path,
// which is the direction this file exists to prevent.
//
// Unquoting them wholesale is not the fix either: dropping all three from
// SPAN_BREAK took the real-index sweep from 0 hits to 3, every one of them a
// backtick or a quote sitting exactly at a span boundary in ordinary prose
// (this file's own landmine paragraph among them). A noisy gate gets muted,
// which is how this class got through three times already.
//
// The rule is therefore positional, not per-character: a quoting character is a
// span break UNLESS a path-name character sits on BOTH sides of it. Inside a
// segment name it is part of the name; as an opening or closing delimiter it is
// adjacent to a `/`, a space, punctuation or the end of the text, and it still
// breaks. `isSpanBreak` below. Measured both ways before it shipped: the
// apostrophe path is found, all four quoted permutations resolve to the right
// side, and the sweep is back to 0 hits across every tracked blob.
//
// Still NOT excluded, and named here rather than left to be rediscovered: the
// TAB. It stays a hard break — it is a legal filename character too, but it is
// also the column delimiter in every tabular format this scans, and no
// measurement justified the trade. That one is a judgement, not a proof.

// True when the text stages an absolute private-tooling path from a machine
// other than this checkout.
//
// A STRING PREFIX test is not a path resolution, so a `..` segment walks
// straight back out of the checkout while still satisfying it —
// `<repoRoot>/../private/.claude/settings.json` starts with `<repoRoot>/` and
// points somewhere else entirely. The first fix for that treated ANY match
// containing a `..` segment as foreign, on the reasoning that a legitimate
// reference to this repo's own tooling directory has no reason to route through
// the parent. A later adverse pass produced the obvious counterexample —
// `<repoRoot>/docs/../.claude/settings.json` normalises straight back into the
// checkout and was reported as a leak. Both directions of the same mistake:
// asking a substring question about a path.
//
// `normalizeSegments` below answers it properly. `.` segments drop, `..`
// segments pop, popping past the root clamps there (POSIX, not an error), and
// the verdict is a prefix test against the RESOLVED form. The reported hit stays
// the raw text, because that is what a human has to go find and rename.
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
// Once the middle segment may contain a space, a match can span two separate
// paths with prose between them, and the exclusion has to be asked about the
// right one. A tooling directory belongs to the NEAREST home-directory start
// before it, not the first one on the line: `<repoRoot> and then run <repoRoot>/
// .claude/x` matched as one span that begins at the repo root and ends at the
// repo's own tooling directory, yet fails `startsWith(repoRoot + '/')` because
// of the space, and was reported as a leak. Re-anchoring on the innermost start
// is what makes the space safe to allow — it is not a convenience.
//
// Re-anchoring on the innermost start was ALSO wrong, and a later adverse pass
// produced the input that shows it: a foreign home directory containing a
// directory literally named `Users`, whose inner segments happen to spell this
// checkout — `<foreign home>/backup<repoRoot>/.claude/settings.json`. The
// innermost start is the repo root, the exclusion fires, and a backup of someone
// else's home directory publishes silently. Leftmost was wrong for the space
// case; innermost is wrong for the nesting case; there is no single correct
// anchor.
//
// So the verdict is taken over ALL of them: a tooling directory is a leak when
// ANY home-directory start that can legally reach it is outside this checkout,
// and is excluded only when EVERY such start is inside it. That is strictly
// stronger than either single-anchor rule, and it is what makes both the space
// and the nesting case come out right.
//
// The scan is deliberately NOT the lazy-quantifier regex any more. Allowing the
// space made that pattern's backtracking adversarial — the same pass measured
// 640ms on 48KB of legal nested home starts, which extrapolates to roughly two
// minutes on the 8MB blob ceiling, on every `npm test`. This walks each tooling
// hit backwards to the nearest forbidden character instead, then finds the
// starts inside that window with a non-backtracking pass. Cost is bounded by
// `NESTED_SPAN_MAX` per tooling hit.
//
// The all-anchors rule above lasted exactly one round. A later adverse pass
// produced three measured counterexamples, and taken together they say something
// stronger than "this rule has bugs": SPACE IS A LEGAL PATH CHARACTER, so
// `A /B/.claude` is BOTH a single path whose directory name ends in a space AND
// two space-separated tokens, and nothing in the bytes distinguishes them. Every
// rule stated so far — leftmost, innermost, all-anchors, and the two end-based
// discriminators that replaced the middle-of-span guess — is a bet on one of
// those readings, and each was refuted by an input exercising the other.
//
// So this no longer pretends to decide. It picks the reading deliberately and
// says which one:
//
//   A tooling directory belongs to the NEAREST home-directory start that BEGINS
//   A TOKEN. That anchor alone decides — inside this checkout means clean,
//   anywhere else means a leak.
//
// The token-start half is not a refinement, it is the other half of the rule,
// and it is what keeps the round-16 nesting case caught. `<home>/backup<repoRoot>
// /.claude` contains two matching starts but only ONE legal reading: the inner
// one is preceded by an ordinary path-name character, so it is the continuation
// of a segment, not a second path. Bare nearest-anchor takes it, lands on the
// repo root and publishes a foreign home. An anchor preceded by a space, a
// separator, a colon, or nothing at all is a genuine token start; one preceded
// by a letter, digit, dot, underscore or hyphen is not.
//
// Nearest wins because the competing readings are not equally likely in the text
// this gate actually scans. A nearer in-repo anchor means the foreign reading
// requires a directory whose name ends in a space sitting immediately before a
// rooted path — a shape no tool here produces — while the benign reading is
// ordinary prose naming two paths on one line, which tracked runbooks, session
// logs and pre-gate JSON do constantly. Measured against the real index at the
// time of writing: zero hits across 1153 tracked files.
//
// The three inputs that killed the previous rule, all now correct:
//
//   `<repoRoot> /backup/.claude/x`              → LEAK. Only one anchor exists,
//                                                 and its span is not inside the
//                                                 checkout. (1) used to skip it.
//   `<home>/My Project /.claude/x`              → LEAK. Same: the nearest and
//                                                 only anchor is foreign. (2)
//                                                 used to skip it.
//   `prose <home>/p then <repoRoot>/.claude/x`  → CLEAN. The nearest anchor is
//                                                 the repo root. All-anchors
//                                                 returned the foreign one.
//
// ── The residual this buys, stated in full ────────────────────────────────────
//
// A foreign home directory whose LAST segment ends in a space, immediately
// followed by a rooted path into this checkout and its tooling directory —
// `<home>/Backup <repoRoot>/.claude/x` — reads as clean, because the nearest
// anchor is the repo root. Under the one-path reading that is somebody else's
// backup publishing silently.
//
// It is not closable. That input and the third case above are byte-identical in
// shape; a rule that catches one flags the other, and the other is the shape
// real tracked files have. This is a hygiene backstop, not a security control,
// and the primary defense remains reading anything staged under a tooling
// directory before committing it. Both cases are pinned as tests below so the
// verdict cannot change silently.
//
// The direct matcher is unaffected — it only ever matches a contiguous
// home-to-tooling path with no space in it.
const TOOL_DIR_HIT = new RegExp('\\/\\.' + TOOL_DIRS + '\\b', 'g');
const HOME_START = /(?:(?:\/Users|\/home)\/[A-Za-z0-9._@-]+|\/root)\//g;
const SPAN_BREAK = new Set(['\n', '\r', '\t', '"', "'", '`']);
// An ordinary character inside a path SEGMENT name. Deliberately excludes `/`
// and `:` — a home start after either of those begins a new token in the text
// this scans (a second rooted path, a `file:` prefix, a `key:value` log line),
// while one after a letter or digit is the continuation of a segment name.
const PATH_NAME_CHAR = /[A-Za-z0-9._-]/;

// A quoting character breaks a span only when it is acting as a delimiter. With
// a path-name character on both sides it is part of a segment name — see the
// header for the measurement that chose this over excluding all three outright.
// Line breaks and the tab always break.
function isSpanBreak(text, at) {
  const ch = text[at];
  if (!SPAN_BREAK.has(ch)) return false;
  if (ch === '\n' || ch === '\r' || ch === '\t') return true;
  const before = text[at - 1];
  const after = text[at + 1];
  return !(before !== undefined && after !== undefined &&
           PATH_NAME_CHAR.test(before) && PATH_NAME_CHAR.test(after));
}

// Resolve `.` and `..` in an absolute path. Popping past the root clamps there,
// which is what POSIX does — `/../x` is `/x`, not an error.
function normalizeSegments(absolutePath) {
  const out = [];
  for (const segment of absolutePath.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') { out.pop(); continue; }
    out.push(segment);
  }
  return '/' + out.join('/');
}

function findPrivatePath(text) {
  const direct = PRIVATE_PATH.exec(text);
  if (direct) return direct[0];

  TOOL_DIR_HIT.lastIndex = 0;
  let tool;
  while ((tool = TOOL_DIR_HIT.exec(text)) !== null) {
    const end = tool.index + tool[0].length;
    // Widest window a middle segment could legally occupy: back to the nearest
    // span-breaking character, and never further than the bound plus room for
    // the home-start prefix itself.
    const floor = Math.max(0, tool.index - NESTED_SPAN_MAX * 2);
    let from = tool.index;
    while (from > floor && !isSpanBreak(text, from - 1)) from -= 1;

    const window = text.slice(from, tool.index);
    HOME_START.lastIndex = 0;
    let start;
    // The NEAREST anchor that STARTS A TOKEN decides — see the header. Every
    // start is still enumerated (the scan cannot know which is nearest until it
    // has seen them all, and `lastIndex` advances by one so overlapping starts
    // stay reachable); the last one to survive both filters is judged.
    //
    // The token-start test is what separates the two ambiguity classes. An
    // anchor preceded by an ordinary path-name character is a CONTINUATION of
    // the path to its left — `<home>/backup<repoRoot>/.claude` has one legal
    // reading and one real anchor, and taking the inner one there discards a
    // whole foreign home. An anchor preceded by anything else begins its own
    // token and is a candidate for nearest. `outermost` is the fallback for text
    // where no anchor qualifies, so the scan never silently drops a hit.
    let nearest = -1;
    let outermost = -1;
    while ((start = HOME_START.exec(window)) !== null) {
      const at = from + start.index;
      const middleLength = tool.index - (at + start[0].length);
      HOME_START.lastIndex = start.index + 1;
      if (middleLength < 1 || middleLength > NESTED_SPAN_MAX) continue;
      if (outermost < 0) outermost = at;
      if (at === 0 || !PATH_NAME_CHAR.test(text[at - 1])) nearest = at;
    }
    if (nearest < 0) nearest = outermost;
    if (nearest >= 0) {
      const hit = text.slice(nearest, end);
      const resolved = normalizeSegments(hit);
      const own = OWN_CHECKOUTS.some(
        (root) => resolved.startsWith(normalizeSegments(root) + '/'));
      if (!own) return hit;
    }
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
// Assembled from char codes for the same reason the roots are split: a literal
// quote inside a fixture is one editor pass away from being normalised into
// something else, and these two are the characters under test.
const APOSTROPHE = String.fromCharCode(0x27);
const DOUBLE_QUOTE = String.fromCharCode(0x22);
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

  // Round 21. The same negative, stated in the form that does NOT depend on
  // where this working copy sits — this is the literal shape carried by 95
  // tracked files, and it is what CI reported as 95 leaks.
  assert.equal(findPrivatePath('see ' + AUTHORING_CHECKOUT + '/.cl' + 'aude/skills/release/SKILL.md'), null,
    'the matcher flagged this repo\'s own tooling directory at its AUTHORING ' +
    'path — the exclusion is still tied to the running checkout, so the gate ' +
    'is red on every machine but one');

  // …and the two directions that keep that declaration from being a blanket
  // pardon for the home it names. Both must stay LEAKS.
  assert.ok(findPrivatePath(AUTHORING_CHECKOUT.replace('raven-mcp', 'some-other-project') + DOT + 'claude/settings.json'),
    'a DIFFERENT project under the same home was excluded — the declared root ' +
    'is supposed to name this repository, not the whole home directory');
  assert.ok(findPrivatePath(ROOT_MAC + '/accunliffe' + DOT + 'claude/settings.json'),
    'the home directory\'s own top-level tooling directory was excluded — that ' +
    'is the global config this gate exists to keep out of a public repo');

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
  // Round 15 built the fixtures from the constant and still did not pin the
  // bound: it measured `MAX - 1` (must match) against `MAX + 200` (must not),
  // and every value in the 201-character gap between them is unconstrained.
  // Build the regex with `NESTED_SPAN_MAX - 1` and BOTH assertions stay green
  // with an effective bound of 4095. Measuring near a boundary is not measuring
  // the boundary — the two fixtures have to be adjacent.
  //
  // `nestWithMiddle` states the span the regex actually quantifies: the text
  // between the home directory's trailing `/` and the `/` that precedes the
  // tooling directory. The filler is a single repeated character with no `/` in
  // it, so the lazy quantifier has exactly one span to find and the length is
  // not a guess. The fixture asserts its own middle length first, because a
  // constructor that silently produced 4095 where it claimed 4096 would make
  // both boundary assertions meaningless in the same direction.
  // `DOT` is `/.`, not `.` — it carries the separator the pattern's `\/\.`
  // consumes. Appending a slash of your own puts a `//` in the fixture, which
  // costs the span one extra character and moves the boundary by one without
  // changing anything the assertions look at. That is precisely the class of
  // silent-fixture error `middleOf` exists to catch, and it caught this one.
  const nestWithMiddle = (len) =>
    ROOT_MAC + '/someone/' + 'a'.repeat(len) + DOT + 'claude/settings.json';
  const middleOf = (text) => {
    const start = text.indexOf('/someone/') + '/someone/'.length;
    return text.slice(start, text.lastIndexOf(DOT + 'claude'));
  };
  assert.equal(middleOf(nestWithMiddle(NESTED_SPAN_MAX)).length, NESTED_SPAN_MAX,
    'the boundary fixture does not have the middle length it claims, so neither ' +
    'assertion below measures the bound');

  assert.ok(findPrivatePath(nestWithMiddle(NESTED_SPAN_MAX)),
    'a leak nested to exactly NESTED_SPAN_MAX was missed, so the matcher is ' +
    'built with a SMALLER bound than the constant advertises — asserting the ' +
    'constant, or measuring 200 characters away from it, does not detect that');
  assert.equal(findPrivatePath(nestWithMiddle(NESTED_SPAN_MAX + 1)), null,
    'a leak nested one character past NESTED_SPAN_MAX was caught, so the bound ' +
    'is not where the header says it is — the documented limit must be the real ' +
    'one in both directions');
  assert.equal(NESTED_SPAN_MAX, 4096,
    'the span bound moved without the header\'s stated-limits list moving with it');

  // The fifth bypass, from the round-15 pass: a SPACE in the path. `My Project`
  // is an ordinary directory name and the middle segment used to exclude all
  // whitespace, so the leak never reached any of the logic above.
  assert.ok(findPrivatePath(ROOT_MAC + '/someone/work/My Project' + DOT + 'claude/settings.json'),
    'a private path containing a space was missed — a space is legal in a macOS ' +
    'or Linux path, so excluding all whitespace from the middle segment is a ' +
    'bypass, not a bound');
  assert.ok(findPrivatePath(repoRoot + '/artifact:' + ROOT_MAC + '/someone/My Project' + DOT + 'claude/settings.json'),
    'a space-containing leak overlapping an excluded in-repo match was missed — ' +
    'the space fix and the rewind have to hold at the same time');

  // The sixth bypass, from the round-16 pass: a foreign home directory whose
  // inner segments spell this checkout — someone else's backup, with NO space
  // anywhere. Re-anchoring on the innermost start lands on the repo root and the
  // exclusion fires, so a whole foreign home publishes. This one is unambiguous:
  // there is exactly one legal reading, and the nearest anchor is the foreign
  // home, because `<repoRoot>` here is a middle segment rather than a start.
  assert.ok(findPrivatePath(ROOT_MAC + '/bob/backup' + repoRoot + DOT + 'claude/settings.json'),
    'a foreign home path that NESTS this checkout was excluded — the inner start ' +
    'is preceded by an ordinary path character, so it CONTINUES the outer path ' +
    'rather than beginning a token, and taking it as the anchor discards ' +
    'someone else\'s entire home directory');

  // …and the negative control that keeps the rule above from becoming
  // report-everything. Prose naming this repo twice, with a space before the
  // second path, is not a leak. This exact shape is in a tracked file, so a rule
  // that reports it turns the whole-tree scan red.
  assert.equal(
    findPrivatePath(repoRoot + ' and then run node ' + repoRoot + DOT + 'claude/x.mjs'),
    null,
    'prose naming this repo\'s own tooling directory was reported as a leak — a ' +
    'gate that fires on its own repo gets muted, which is how this class got ' +
    'through three times already');

  // ── The nearest-anchor rule, and the ambiguity it resolves by choosing ──────
  //
  // Round 17 replaced a middle-of-span guess with two end-based discriminators;
  // round 18 refuted BOTH with measured inputs. The three that follow are those
  // inputs. They are here because each one, individually, is what makes the
  // nearest-anchor rule the only remaining candidate — see the header.
  //
  // (a) This checkout's root, a space, then a foreign path. Discriminator (1)
  //     skipped the whole span on the `repoRoot + ' '` prefix. There is only ONE
  //     anchor here, so "nearest" and "only" coincide, and it is foreign.
  assert.ok(
    findPrivatePath(repoRoot + ' /backup' + DOT + 'claude/settings.json'),
    'a path beginning with this checkout\'s root followed by a space was ' +
    'discarded whole — the span it reaches is not inside the checkout, and the ' +
    'repo-root prefix is not evidence about where the path ends');

  // (b) A foreign home whose directory name ends in a space, then a tooling
  //     directory. Discriminator (2) skipped every tooling hit preceded by a
  //     space, on the reasoning that a path segment cannot be empty — true, but
  //     it assumes the space is a token break rather than the last character of
  //     the directory name, which is exactly the thing that cannot be known.
  assert.ok(
    findPrivatePath(ROOT_MAC + '/alice/My Project ' + DOT + 'claude/settings.json'),
    'a private path whose directory name ends in a space was skipped because ' +
    'the tooling directory was preceded by one — a trailing space is a legal ' +
    'part of a directory name, not proof of a token boundary');

  // (c) The false positive the all-anchors rule produced, and the reason the
  //     verdict cannot be taken over every anchor: an ordinary sentence naming a
  //     foreign path and then this checkout's own tooling directory. The foreign
  //     anchor can legally reach the hit, so all-anchors reported it.
  assert.equal(
    findPrivatePath(
      'Docs mention ' + ROOT_MAC + '/alice/project then see ' + repoRoot +
      DOT + 'claude/settings.json'
    ),
    null,
    'prose naming a foreign path and then this repo\'s own tooling directory was ' +
    'reported as a leak — the tooling directory belongs to the NEAREST start ' +
    'that can reach it, and that one is inside the checkout');

  // (d) The residual, pinned as a test so it cannot change silently. A foreign
  //     home whose directory name ends in a space, immediately followed by a
  //     rooted path into this checkout, reads as CLEAN. Under the one-path
  //     reading that is someone else's backup publishing.
  //
  //     This is byte-identical in shape to (c), which is the shape real tracked
  //     files have — so a rule that catches this one flags those. It is not
  //     closable from raw text, and the assertion below records the choice
  //     rather than the wish.
  assert.equal(
    findPrivatePath(ROOT_MAC + '/bob/Backup ' + repoRoot + DOT + 'claude/settings.json'),
    null,
    'the documented residual changed verdict. A foreign home ending in a space ' +
    'followed by this checkout is deliberately NOT flagged, because the input is ' +
    'indistinguishable from the prose in (c). If this now returns a hit, check ' +
    'that (c) still returns null before calling it an improvement');

  // ── The quoting rule, and the `..` resolution ───────────────────────────────
  //
  // (e) A quoting character INSIDE a segment name. This was a false negative on
  //     a completely unambiguous path for one full round, because all three
  //     quote characters were hard span breaks. The header records the sweep
  //     that rejected the obvious fix (unquote everything → 3 real-index hits)
  //     in favour of the positional one.
  assert.ok(
    findPrivatePath(ROOT_MAC + '/alice/work/O' + APOSTROPHE + 'Reilly' + DOT + 'claude/settings.json'),
    'a private path whose directory name contains an apostrophe was missed — an ' +
    'apostrophe between two path-name characters is part of the name, and ' +
    'treating every quote as a hard break is a false negative on an unambiguous ' +
    'path');

  // (f) …and the control that keeps (e) from becoming unquote-everything. A
  //     quote acting as a DELIMITER still breaks the span, which is what keeps
  //     the sweep at zero: every one of the three hits the wholesale version
  //     produced had a quote adjacent to punctuation or a space, not to a
  //     path-name character on both sides.
  //
  //     The first draft of this fixture put a second rooted path after the
  //     prose, which returns null under the wholesale version TOO — the later
  //     anchor is a token start either way. It measured nothing. This shape has
  //     exactly one anchor, so the quote is the only thing deciding the verdict,
  //     and it is transcribed from one of the three real tracked files the
  //     wholesale version turned red.
  assert.equal(
    findPrivatePath(repoRoot + DOUBLE_QUOTE + '))</code> is <code>projects</code> then run node ' + DOT + 'claude/x.mjs'),
    null,
    'prose where a quote closes a rooted path was reported as a leak — a quote ' +
    'adjacent to punctuation is a delimiter, and unquoting every one of them ' +
    'turns real tracked files in this repo red');

  // (g) A `..` that resolves back INTO this checkout. Treating any `..` as
  //     escaping was the first fix for the prefix-test bypass and it false-
  //     positives here; the verdict is a prefix test on the RESOLVED path now.
  assert.equal(
    findPrivatePath(repoRoot + '/docs/..' + DOT + 'claude/settings.json'),
    null,
    'a path routing through `..` back into this checkout was reported as a leak ' +
    '— `..` is not evidence of escaping, only the resolved path is');

  // (h) …and its counterpart, which must still fire: `..` that genuinely leaves
  //     the checkout is the bypass the whole normalisation exists for.
  //
  //     Stated plainly rather than left to be assumed — this one is NOT
  //     independently falsifiable. Every mutant that defeats it defeats the
  //     round-13 single-`..` assertion above first, and `assert` aborts there.
  //     It is a control against a resolver that pops the wrong number of
  //     segments, not a measurement of its own.
  assert.ok(
    findPrivatePath(repoRoot + '/../../private/backup' + DOT + 'codex/config.toml'),
    'a path walking out of this checkout with `..` was excluded by the prefix ' +
    'test — resolving is what closes that, and a resolver that never leaves is ' +
    'the same bug facing the other way');

  // (i) The `.` in PATH_NAME_CHAR, which nothing above measures. The nesting
  //     case above puts a LETTER before the inner start; put a dot there and the
  //     verdict flips on that character class alone. Drop `.` and the inner
  //     start reads as a token start, becomes nearest, resolves inside this
  //     checkout, and a whole foreign home is excluded — with every other
  //     assertion in this test still green.
  assert.ok(
    findPrivatePath(ROOT_MAC + '/bob/backup.' + repoRoot + DOT + 'claude/settings.json'),
    'a foreign home nesting this checkout after a `.` was excluded — a dot ' +
    'continues a segment name, so the inner start does not begin a token, and ' +
    'dropping `.` from PATH_NAME_CHAR passes every other assertion here');

  // The interior of the span, not just its boundary. Two adjacent endpoints
  // cannot separate a contiguous matcher from a discontiguous one that happens
  // to cover both — and neither can three points: the round-17 pass produced
  // `n >= 1 && (n <= 2048 || n === 4096)`, which accepts 1, MAX/2 and MAX while
  // silently dropping 2,047 lengths in between.
  //
  // No finite set of fixtures can PROVE contiguity, and this one does not claim
  // to. What it does is make a passing interval mutant have to reproduce the
  // accepted set almost exactly, which is no longer a plausible accident. The
  // sweep is deterministic (a prime-ish stride so the samples do not land on
  // round powers of two, which is where a hand-written mutant's boundaries go)
  // and cheap — each probe is one bounded scan.
  const sweep = [1, 2, 3];
  for (let k = 1; k < 17; k += 1) sweep.push(Math.round((NESTED_SPAN_MAX * k) / 17));
  sweep.push(NESTED_SPAN_MAX - 2, NESTED_SPAN_MAX - 1);
  for (const len of sweep) {
    assert.ok(findPrivatePath(nestWithMiddle(len)),
      'a leak nested to ' + len + ' characters was missed while the endpoints ' +
      'matched, so the accepted lengths are not one contiguous interval — ' +
      'measuring only the endpoints, or only the endpoints and the midpoint, ' +
      'cannot see that');
  }

  // Cost, asserted rather than assumed. Allowing the space turned the lazy
  // quantifier into an adversarial backtracker: the round-16 pass measured
  // 640ms on 48KB of legal nested home starts, which is about two minutes on
  // this file's own 8MB blob ceiling — paid on every `npm test`, and paid by an
  // ordinary large fixture rather than by an attacker. The window-and-anchor
  // scan is bounded by NESTED_SPAN_MAX per tooling hit instead. The bound is
  // loose on purpose; it is here to catch a return to quadratic behaviour, not
  // to police milliseconds.
  const adversarial = '/Us' + 'ers/alice/' + ('Us' + 'ers/alice/').repeat(3000) + 'x' + DOT + 'claude/s';
  const startedAt = Date.now();
  findPrivatePath(adversarial);
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 2000,
    'scanning ' + adversarial.length + ' bytes of legal nested home starts took ' +
    elapsed + 'ms — the matcher is backtracking again, and this file scans blobs ' +
    'up to 8MB');

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
