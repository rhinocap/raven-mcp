// Mutation matrix for the round-8 P1-3 fix in scripts/release.sh -- the bounded
// rebase-retry around the atomic branch+tag push, gated on the packed artifact
// still being byte-identical to what npm already serves.
//
// HOW IT GRADES THE PRODUCT AND NOT A REIMPLEMENTATION. The push loop is sliced
// VERBATIM out of scripts/release.sh by line markers and evaluated under bash,
// the pattern scripts/measure-spring-settle.mjs already uses in this repo. The
// slice is shape-checked (first line, last line, and three required tokens)
// because the failure mode of a text-anchored extractor is silently grabbing the
// wrong span. `git` and `npm` are shims on PATH driven by per-scenario env vars,
// so nothing here touches a real remote, a real registry or the real worktree.
//
// The invariant under test is the one that makes the retry honest: npm versions
// are IMMUTABLE, so a tag may only be moved onto a rebased tree when that tree
// still packs to the published shasum. A retry that skips that check tags a
// release whose npm artifact is something else.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELEASE_SH = join(REPO, "scripts", "release.sh");
const ALL = readFileSync(RELEASE_SH, "utf8").split("\n");

// 1-indexed, inclusive. Re-derived rather than hardcoded: the slice starts at
// the unique `push_attempt=0` and ends at the first `done` at column 0 after it.
const start = ALL.findIndex((l) => l === "push_attempt=0");
if (start < 0) {
  console.error("✗ could not find `push_attempt=0` in release.sh — the slice anchor is dead.");
  process.exit(1);
}
let end = -1;
for (let i = start; i < ALL.length; i++) {
  if (ALL[i] === "done") {
    end = i;
    break;
  }
}
if (end < 0) {
  console.error("✗ could not find the loop's closing `done` after push_attempt=0.");
  process.exit(1);
}
const SLICE = ALL.slice(start, end + 1).join("\n");
for (const token of ["git push --atomic", "REBASED_SHASUM", "git rebase", "Everything up-to-date"]) {
  if (!SLICE.includes(token)) {
    console.error(`✗ slice is missing ${JSON.stringify(token)} — the extractor grabbed the wrong span.`);
    process.exit(1);
  }
}
console.log(`slice: release.sh lines ${start + 1}-${end + 1} (${end - start + 1} lines)`);

const PUBLISHED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EXPECTED_BASELINE_CASES = 6;

const root = mkdtempSync(join(tmpdir(), "r8-push-"));
const bin = join(root, "bin");
mkdirSync(bin);

// The git shim. Every subcommand the slice reaches is modelled; anything else
// exits non-zero loudly rather than silently succeeding, so a slice that grows a
// new git call fails here instead of being graded against a stub that lied.
writeFileSync(
  join(bin, "git"),
  `#!/bin/sh
case "$1" in
  push)
    n=$(cat "$STATE/pushes" 2>/dev/null || echo 0); n=$((n + 1)); echo $n > "$STATE/pushes"
    if [ "$n" -le "$PUSH_FAILS_UNTIL" ]; then printf '%s\\n' "$PUSH_FAIL_TEXT"; exit 1; fi
    echo "pushed"; exit 0 ;;
  fetch) exit 0 ;;
  rebase)
    if [ "$1" = rebase ] && [ "$2" = --abort ]; then exit 0; fi
    echo "$REBASE_OK" | grep -q 1 && exit 0
    echo "CONFLICT"; exit 1 ;;
  tag)
    if [ "$2" = "-d" ]; then echo "deleted $3" >> "$STATE/tags"; exit 0; fi
    echo "created $2" >> "$STATE/tags"; exit 0 ;;
  *) echo "git shim: unmodelled subcommand $1" >&2; exit 97 ;;
esac
`,
);
writeFileSync(
  join(bin, "npm"),
  `#!/bin/sh
if [ "$1" = pack ]; then printf '[{"shasum":"%s"}]\\n' "$REBASED_SHASUM_VALUE"; exit 0; fi
echo "npm shim: unmodelled $*" >&2; exit 97
`,
);
chmodSync(join(bin, "git"), 0o755);
chmodSync(join(bin, "npm"), 0o755);

let seq = 0;
function runSlice(slice, env) {
  const state = join(root, `state-${seq++}`);
  mkdirSync(state);
  const script = join(state, "push.sh");
  writeFileSync(script, `set -u\nBRANCH=main\nNEW=2.5.0\nPUBLISHED_SHASUM_NOW="${PUBLISHED}"\n${slice}\n`);
  const res = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      STATE: state,
      PUSH_FAILS_UNTIL: "0",
      PUSH_FAIL_TEXT: "! [rejected] main -> main (fetch first)",
      REBASE_OK: "1",
      REBASED_SHASUM_VALUE: PUBLISHED,
      ...env,
    },
  });
  let tags = "";
  try {
    tags = readFileSync(join(state, "tags"), "utf8");
  } catch {}
  return { status: res.status, out: `${res.stdout}${res.stderr}`, tags };
}

const CASES = [
  {
    name: "a clean push succeeds and retags nothing",
    env: { PUSH_FAILS_UNTIL: "0" },
    expect: (r) =>
      r.status === 0 && r.tags === "" ? null : `expected a clean exit with no retag, got ${r.status} tags=${JSON.stringify(r.tags)}`,
  },
  {
    name: "an already-pushed branch and tag resumes instead of retrying",
    env: { PUSH_FAILS_UNTIL: "99", PUSH_FAIL_TEXT: "Everything up-to-date" },
    expect: (r) =>
      r.status === 0 && r.out.includes("already pushed") ? null : `expected the resume path, got ${r.status}: ${r.out.trim()}`,
  },
  {
    // THE RETRY CASE. main moved during the post-npm tail; the rebased tree
    // still packs to the published shasum, so the tag may legitimately move.
    name: "a moved main is rebased onto and the tag follows",
    env: { PUSH_FAILS_UNTIL: "1", REBASED_SHASUM_VALUE: PUBLISHED },
    expect: (r) =>
      r.status === 0 && r.tags.includes("created v2.5.0")
        ? null
        : `expected a successful retry that recreates the tag, got ${r.status} tags=${JSON.stringify(r.tags)}`,
  },
  {
    // THE INVARIANT. The rebase changed the packed bytes, so tagging would name
    // a tree whose npm artifact is something else. It must REFUSE.
    name: "a rebase that changes the packed artifact refuses to tag",
    env: { PUSH_FAILS_UNTIL: "1", REBASED_SHASUM_VALUE: "b".repeat(40) },
    expect: (r) =>
      r.status === 1 && r.out.includes("changed the packed artifact") && !r.tags.includes("created")
        ? null
        : `expected a refusal with no tag created, got ${r.status} tags=${JSON.stringify(r.tags)}: ${r.out.trim()}`,
  },
  {
    name: "a conflicting rebase stops rather than cutting a new version",
    env: { PUSH_FAILS_UNTIL: "99", REBASE_OK: "0" },
    expect: (r) =>
      r.status === 1 && r.out.includes("could not rebase") && r.out.includes("do not cut a new version")
        ? null
        : `expected a conflict refusal, got ${r.status}: ${r.out.trim()}`,
  },
  {
    name: "the retry is bounded and names the published shasum on exhaustion",
    env: { PUSH_FAILS_UNTIL: "99", REBASED_SHASUM_VALUE: PUBLISHED },
    expect: (r) =>
      r.status === 1 && r.out.includes("after 3 rebase attempts") && r.out.includes(PUBLISHED)
        ? null
        : `expected a bounded exhaustion naming ${PUBLISHED}, got ${r.status}: ${r.out.trim()}`,
  },
];

const MUTANTS = [
  {
    id: "S1",
    why: "P1-3: delete the shasum re-check, so a rebase that changes the bytes still tags",
    find: `  if [[ -n "$PUBLISHED_SHASUM_NOW" && "$REBASED_SHASUM" != "$PUBLISHED_SHASUM_NOW" ]]; then`,
    replace: `  if false; then`,
    expect: "red",
  },
  {
    id: "S2",
    why: "P1-3: revert to fail-fast, so the first rejection strands the version",
    find: "  if [[ $push_attempt -gt 3 ]]; then",
    replace: "  if [[ $push_attempt -gt 0 ]]; then",
    expect: "red",
  },
  {
    id: "S3",
    why: "P1-3: skip the retag, so the tag keeps pointing at the pre-rebase sha",
    find: '  git tag "v$NEW"',
    replace: "  :",
    expect: "red",
  },
  {
    id: "S4",
    why: "CONTROL: behaviour-neutral loop header",
    find: "while :; do",
    replace: "while true; do",
    expect: "green",
  },
  {
    id: "S5",
    why: "CONTROL: behaviour-neutral arithmetic spacing",
    find: "  push_attempt=$((push_attempt + 1))",
    replace: "  push_attempt=$(( push_attempt + 1 ))",
    expect: "green",
  },
];

function runSuite(slice) {
  const reds = [];
  for (const c of CASES) {
    let reason;
    try {
      reason = c.expect(runSlice(slice, c.env));
    } catch (err) {
      reason = `threw: ${err.message}`;
    }
    if (reason) reds.push({ name: c.name, reason });
  }
  return reds;
}

// PRE-FLIGHT: unique anchor plus `bash -n`, both answerable without running a
// single scenario.
const slices = new Map();
for (const m of MUTANTS) {
  const count = SLICE.split(m.find).length - 1;
  if (count !== 1) {
    console.error(`✗ ${m.id}: find-string matches ${count} times in the slice, expected exactly 1.`);
    process.exit(1);
  }
  const mutated = SLICE.replace(m.find, m.replace);
  const path = join(root, `slice-${m.id}.sh`);
  writeFileSync(path, mutated);
  const check = spawnSync("bash", ["-n", path], { encoding: "utf8" });
  if (check.status !== 0) {
    console.error(`✗ ${m.id}: mutant does not parse.\n${check.stderr}`);
    process.exit(1);
  }
  slices.set(m.id, mutated);
}
console.log(`pre-flight: ${MUTANTS.length} mutants anchor uniquely and parse`);

if (CASES.length !== EXPECTED_BASELINE_CASES) {
  console.error(`✗ baseline registers ${CASES.length} cases, declared ${EXPECTED_BASELINE_CASES}.`);
  process.exit(1);
}
const baseReds = runSuite(SLICE);
if (baseReds.length) {
  console.error("✗ baseline is not green — refusing to grade any mutant:");
  for (const r of baseReds) console.error(`    ${r.name}: ${r.reason}`);
  process.exit(1);
}
console.log(`baseline: ${CASES.length}/${CASES.length} green\n`);

let survived = 0;
let falseFails = 0;
for (const m of MUTANTS) {
  const reds = runSuite(slices.get(m.id));
  if (m.expect === "green") {
    if (reds.length) {
      falseFails++;
      console.log(`✗ ${m.id} CONTROL FALSE-FAILED (${reds.length} red) — ${m.why}`);
      for (const r of reds) console.log(`      ${r.name}\n        ${r.reason}`);
    } else {
      console.log(`✓ ${m.id} CONTROL green — ${m.why}`);
    }
    continue;
  }
  if (!reds.length) {
    survived++;
    console.log(`✗ ${m.id} SURVIVED — ${m.why}`);
  } else {
    console.log(`✓ ${m.id} killed, radius ${reds.length} — ${m.why}`);
    for (const r of reds) console.log(`      ${r.name}\n        ${r.reason}`);
  }
}

const reds = MUTANTS.filter((m) => m.expect === "red").length;
console.log(
  `\n${reds} mutants, ${reds - survived} killed, ${survived} survived; ` +
    `${MUTANTS.length - reds} CONTROLS, ${falseFails} false-failed`,
);
rmSync(root, { recursive: true, force: true });
if (survived || falseFails) process.exitCode = 1;
