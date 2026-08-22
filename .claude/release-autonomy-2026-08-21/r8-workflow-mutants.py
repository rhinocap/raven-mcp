#!/usr/bin/env python3
"""Mutation matrix for the two round-8 fixes in .github/workflows/release.yml.

Fix 4 (P2) -- an empty GitHub Release body is repaired on retry rather than
being papered over by a green re-upload.
Fix 5 (P3) -- a failed notification can be resent by a later dispatch.

HOW THIS GRADES THE PRODUCT AND NOT A REIMPLEMENTATION.

Fix 4's run body is a bash script. It is pulled VERBATIM out of the parsed YAML
by step name and executed under bash against a `gh` shim on PATH, the same
verbatim-slice pattern scripts/measure-spring-settle.mjs uses in this repo. The
slice is shape-checked on required tokens, because the failure mode of a
name-anchored extractor is silently grabbing the wrong step.

Fix 5 is a GitHub Actions `if:` expression, which bash cannot run. It is pulled
verbatim out of the YAML and evaluated by a translator restricted to a DECLARED
token allowlist -- context lookups, single-quoted strings, == != && || and
parentheses. Anything outside that set is a hard refusal, not a best guess: if
the expression ever grows a function call or an operator with different
semantics, this harness fails loudly instead of grading it wrongly. That refusal
is the only thing that makes a translated evaluation honest, so do not "improve"
it into a permissive parser.

Standing harness rules, all implemented below: clean baseline first with
abort-if-not-green, DECLARED case counts rather than relative pins, a pre-flight
that checks anchor uniqueness (count == 1) and parsing for every mutant, failing
case NAMES with their assertion reason rather than counts, CONTROLS expected
green because a red-only matrix is blind to a false fail, and a non-zero exit on
any unexpected survivor or false fail.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORKFLOW = os.path.join(REPO, ".github", "workflows", "release.yml")

with open(WORKFLOW, encoding="utf-8") as fh:
    DOC = yaml.safe_load(fh)

# ---------------------------------------------------------------- Fix 4 slice

steps = DOC["jobs"]["release"]["steps"]
matches = [s for s in steps if s.get("name") == "Create GitHub Release"]
if len(matches) != 1:
    sys.exit("x expected exactly one 'Create GitHub Release' step, found %d" % len(matches))
RELEASE_RUN = matches[0]["run"]
for token in ("gh release view", "gh release create", "--clobber", "empty body", "--generate-notes"):
    if token not in RELEASE_RUN:
        sys.exit("x slice is missing %r -- the extractor grabbed the wrong step." % token)

# ---------------------------------------------------------------- Fix 5 slice

NOTIFY_IF = DOC["jobs"]["notify"]["if"]
for token in ("resend_notification", "needs.release.outputs.resume", "needs.release.outputs.released"):
    if token not in NOTIFY_IF:
        sys.exit("x notify gate is missing %r -- the extractor grabbed the wrong job." % token)

TOKEN_RE = re.compile(
    r"""\s*(?:
        (?P<ctx>[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)
      | (?P<str>'[^']*')
      | (?P<op>==|!=|&&|\|\|)
      | (?P<paren>[()])
    )""",
    re.X,
)


def evaluate_gate(expr, ctx):
    """Evaluate a GitHub Actions `if:` expression over a declared token set.

    Every token is checked against the allowlist as it is consumed, so an
    expression carrying anything this translator does not model raises rather
    than being silently mis-evaluated.
    """
    py = []
    pos = 0
    while pos < len(expr):
        if expr[pos].isspace():
            pos += 1
            continue
        m = TOKEN_RE.match(expr, pos)
        if not m:
            raise ValueError("unmodelled token at %r" % expr[pos : pos + 24])
        pos = m.end()
        if m.group("ctx"):
            key = m.group("ctx")
            if key not in ctx:
                raise ValueError("unmodelled context lookup %r" % key)
            py.append(repr(ctx[key]))
        elif m.group("str"):
            py.append(repr(m.group("str")[1:-1]))
        elif m.group("op"):
            py.append({"==": "==", "!=": "!=", "&&": "and", "||": "or"}[m.group("op")])
        else:
            py.append(m.group("paren"))
    return bool(eval(" ".join(py), {"__builtins__": {}}, {}))  # noqa: S307


# ------------------------------------------------------------------ gh shim

GH_STUB = r"""#!/bin/sh
log() { echo "$*" >> "$STATE/gh.log"; }
if [ "$1" != release ]; then echo "gh shim: unmodelled $*" >&2; exit 97; fi
case "$2" in
  view)
    if [ "$4" = "--json" ]; then cat "$STATE/body"; exit 0; fi
    log "view $3"
    if [ -e "$STATE/exists" ]; then exit 0; fi
    exit 1 ;;
  upload) log "upload $*"; exit 0 ;;
  edit|create)
    log "$2 $*"
    if [ "$2" = create ]; then : > "$STATE/exists"; fi
    notes=""
    prev=""
    for a in "$@"; do
      if [ "$prev" = "--notes-file" ]; then notes="$a"; fi
      if [ "$a" = "--generate-notes" ]; then notes="__generated__"; fi
      prev="$a"
    done
    if [ "$notes" = "__generated__" ]; then
      printf '%s' "$GENERATED" > "$STATE/body"
    elif [ -n "$notes" ]; then
      cat "$notes" > "$STATE/body"
    fi
    exit 0 ;;
  *) echo "gh shim: unmodelled subcommand $2" >&2; exit 97 ;;
esac
"""

ROOT = tempfile.mkdtemp(prefix="r8-wf-")
BIN = os.path.join(ROOT, "bin")
os.makedirs(BIN)
with open(os.path.join(BIN, "gh"), "w", encoding="utf-8") as fh:
    fh.write(GH_STUB)
os.chmod(os.path.join(BIN, "gh"), 0o755)

_seq = [0]


def run_release_step(body, *, notes, exists, existing_body, generated):
    _seq[0] += 1
    state = os.path.join(ROOT, "state-%d" % _seq[0])
    os.makedirs(state)
    with open(os.path.join(state, "body"), "w", encoding="utf-8") as fh:
        fh.write(existing_body)
    if exists:
        open(os.path.join(state, "exists"), "w").close()
    script = os.path.join(state, "step.sh")
    with open(script, "w", encoding="utf-8") as fh:
        fh.write("set -u\n" + body + "\n")
    env = dict(os.environ)
    env.update(
        PATH=BIN + os.pathsep + os.environ["PATH"],
        STATE=state,
        NOTES=notes,
        VERSION="2.5.0",
        GENERATED=generated,
    )
    proc = subprocess.run(
        ["bash", script], capture_output=True, text=True, env=env, cwd=ROOT
    )
    try:
        with open(os.path.join(state, "gh.log"), encoding="utf-8") as fh:
            ghlog = fh.read()
    except FileNotFoundError:
        ghlog = ""
    with open(os.path.join(state, "body"), encoding="utf-8") as fh:
        final_body = fh.read()
    return {
        "status": proc.returncode,
        "out": proc.stdout + proc.stderr,
        "gh": ghlog,
        "body": final_body,
    }


# -------------------------------------------------------------------- cases

EXPECTED_RELEASE_CASES = 7
EXPECTED_NOTIFY_CASES = 7


def rel(name, kwargs, check):
    return ("release", name, kwargs, check)


RELEASE_CASES = [
    rel(
        "a fresh cut creates the release from the computed notes",
        dict(notes="real notes", exists=False, existing_body="", generated="gen"),
        lambda r: None
        if r["status"] == 0 and "create" in r["gh"] and r["body"].strip() == "real notes"
        else "expected a create carrying the notes, got %s body=%r" % (r["status"], r["body"]),
    ),
    rel(
        # A resume never computes notes -- the detector exits before the PR walk.
        "a resume with no computed notes still lands a non-empty body",
        dict(notes="", exists=False, existing_body="", generated="gh-generated summary"),
        lambda r: None
        if r["status"] == 0 and r["body"].strip()
        else "expected a created release with a real body, got %s body=%r: %s"
        % (r["status"], r["body"], r["out"].strip()),
    ),
    rel(
        "a create whose body comes back empty fails loudly",
        dict(notes="", exists=False, existing_body="", generated=""),
        lambda r: None
        if r["status"] == 1 and "empty body" in r["out"]
        else "expected a loud failure on an empty created body, got %s: %s" % (r["status"], r["out"].strip()),
    ),
    rel(
        # THE P2 CASE. A later dispatch finds the release already there.
        "an existing release with an empty body is repaired from the notes",
        dict(notes="real notes", exists=True, existing_body="", generated="gen"),
        lambda r: None
        if r["status"] == 0 and "edit" in r["gh"] and r["body"].strip() == "real notes"
        else "expected the empty body repaired, got %s body=%r: %s" % (r["status"], r["body"], r["out"].strip()),
    ),
    rel(
        "an existing empty body with no notes is repaired by GitHub's own summary",
        dict(notes="", exists=True, existing_body="", generated="gh-generated summary"),
        lambda r: None
        if r["status"] == 0 and r["body"].strip()
        else "expected a regenerated body, got %s body=%r: %s" % (r["status"], r["body"], r["out"].strip()),
    ),
    rel(
        "a repair that does not take fails rather than going green",
        dict(notes="", exists=True, existing_body="", generated=""),
        lambda r: None
        if r["status"] == 1 and "still has an empty body" in r["out"]
        else "expected a loud failure after a failed repair, got %s: %s" % (r["status"], r["out"].strip()),
    ),
    rel(
        # The other direction: repair must never clobber notes that are fine.
        "an existing release with a good body is re-uploaded and left alone",
        dict(notes="real notes", exists=True, existing_body="shipped notes", generated="gen"),
        lambda r: None
        if r["status"] == 0 and "upload" in r["gh"] and "edit" not in r["gh"] and r["body"] == "shipped notes"
        else "expected upload only with the body untouched, got %s gh=%r body=%r"
        % (r["status"], r["gh"], r["body"]),
    ),
]


def notify(name, ctx, expected):
    return ("notify", name, ctx, expected)


def gate_ctx(released, bump, resume, resend):
    return {
        "needs.release.outputs.released": released,
        "needs.release.outputs.bump": bump,
        "needs.release.outputs.resume": resume,
        "github.event.inputs.resend_notification": resend,
    }


NOTIFY_CASES = [
    notify("a minor cut notifies", gate_ctx("true", "minor", "false", "false"), True),
    notify("a major cut notifies", gate_ctx("true", "major", "false", "false"), True),
    notify("a patch cut does not notify", gate_ctx("true", "patch", "false", "false"), False),
    notify("a patch cut does not notify even when a resend is asked for",
           gate_ctx("true", "patch", "false", "true"), False),
    # THE P3 CASE. Every resume emits released=false, so without the second
    # clause a lost notification can never be resent.
    notify("a resume with resend asked for notifies", gate_ctx("false", "", "true", "true"), True),
    notify("a resume without resend stays silent", gate_ctx("false", "", "true", "false"), False),
    notify("resend asked for with nothing released stays silent",
           gate_ctx("false", "", "false", "true"), False),
]

# ------------------------------------------------------------------ mutants

MUTANTS = [
    dict(
        id="W1",
        target="release",
        why="P2: skip the empty-body repair on an existing release (the shipped defect)",
        find='  body=$(gh release view "v$VERSION" --json body --jq .body)\n'
        '  if [ -z "$(printf \'%s\' "$body" | tr -d \'[:space:]\')" ]; then\n'
        '    echo "release v$VERSION has an empty body - regenerating"',
        replace='  body=$(gh release view "v$VERSION" --json body --jq .body)\n'
        "  if false; then\n"
        '    echo "release v$VERSION has an empty body - regenerating"',
        expect="red",
    ),
    dict(
        id="W2",
        target="release",
        why="P2: repair, then go green without reading the body back",
        find='      echo "::error::Release v$VERSION still has an empty body after regeneration"\n'
        "      exit 1",
        replace='      echo "::error::Release v$VERSION still has an empty body after regeneration"\n'
        "      :",
        expect="red",
    ),
    dict(
        id="W3",
        target="release",
        why="P2: always pass --notes-file, so an empty notes file writes an empty body",
        find="  if [ -s /tmp/release-notes.md ]; then\n"
        '    gh release create "v$VERSION" \\',
        replace="  if true; then\n"
        '    gh release create "v$VERSION" \\',
        expect="red",
    ),
    dict(
        id="W5",
        target="release",
        why="P1: revert to the unguarded printf, so an empty $NOTES still writes a newline "
        "and `[ -s ]` makes the --generate-notes fallback unreachable",
        find="""if [ -n "$(printf '%s' "$NOTES" | tr -d '[:space:]')" ]; then
  printf '%s\\n' "$NOTES" > /tmp/release-notes.md
else
  : > /tmp/release-notes.md
fi""",
        replace="""printf '%s\\n' "$NOTES" > /tmp/release-notes.md""",
        expect="red",
    ),
    dict(
        id="W4",
        target="release",
        why="CONTROL: message text only",
        find='  echo "release v$VERSION already exists - re-uploading the bundle"',
        replace='  echo "release v$VERSION already exists, re-uploading the bundle"',
        expect="green",
    ),
    dict(
        id="N1",
        target="notify",
        why="P3: revert the gate to `released == true` alone",
        find=NOTIFY_IF,
        replace="needs.release.outputs.released == 'true'",
        expect="red",
    ),
    dict(
        id="N2",
        target="notify",
        why="P3: make the resume retry automatic rather than opt-in",
        find="github.event.inputs.resend_notification == 'true' && needs.release.outputs.resume == 'true'",
        replace="needs.release.outputs.resume == 'true'",
        expect="red",
    ),
    dict(
        id="N3",
        target="notify",
        why="CONTROL: reorder a conjunction of two pure comparisons",
        find="needs.release.outputs.released == 'true' && needs.release.outputs.bump != 'patch'",
        replace="needs.release.outputs.bump != 'patch' && needs.release.outputs.released == 'true'",
        expect="green",
    ),
    dict(
        id="N4",
        target="notify",
        why="CONTROL: redundant parentheses",
        find="github.event.inputs.resend_notification == 'true'",
        replace="(github.event.inputs.resend_notification == 'true')",
        expect="green",
    ),
]

# ---------------------------------------------------------------- pre-flight

variants = {}
for m in MUTANTS:
    source = RELEASE_RUN if m["target"] == "release" else NOTIFY_IF
    count = source.count(m["find"])
    if count != 1:
        sys.exit("x %s: find-string matches %d times, expected exactly 1." % (m["id"], count))
    mutated = source.replace(m["find"], m["replace"])
    if m["target"] == "release":
        path = os.path.join(ROOT, "mut-%s.sh" % m["id"])
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(mutated)
        check = subprocess.run(["bash", "-n", path], capture_output=True, text=True)
        if check.returncode != 0:
            sys.exit("x %s: mutant does not parse.\n%s" % (m["id"], check.stderr))
    else:
        try:
            evaluate_gate(mutated, gate_ctx("true", "minor", "false", "false"))
        except ValueError as err:
            sys.exit("x %s: mutant does not evaluate: %s" % (m["id"], err))
    variants[m["id"]] = mutated
print("pre-flight: %d mutants anchor uniquely and parse" % len(MUTANTS))


def run_release_suite(body):
    reds = []
    for _, name, kwargs, check in RELEASE_CASES:
        try:
            reason = check(run_release_step(body, **kwargs))
        except Exception as err:  # noqa: BLE001
            reason = "threw: %s" % err
        if reason:
            reds.append((name, reason))
    return reds


def run_notify_suite(expr):
    reds = []
    for _, name, ctx, expected in NOTIFY_CASES:
        try:
            got = evaluate_gate(expr, ctx)
        except ValueError as err:
            reds.append((name, "gate did not evaluate: %s" % err))
            continue
        if got != expected:
            reds.append((name, "expected %s, got %s" % (expected, got)))
    return reds


if len(RELEASE_CASES) != EXPECTED_RELEASE_CASES or len(NOTIFY_CASES) != EXPECTED_NOTIFY_CASES:
    sys.exit(
        "x baseline registers %d/%d cases, declared %d/%d."
        % (len(RELEASE_CASES), len(NOTIFY_CASES), EXPECTED_RELEASE_CASES, EXPECTED_NOTIFY_CASES)
    )

base = run_release_suite(RELEASE_RUN) + run_notify_suite(NOTIFY_IF)
if base:
    print("x baseline is not green -- refusing to grade any mutant:")
    for name, reason in base:
        print("    %s\n      %s" % (name, reason))
    shutil.rmtree(ROOT, ignore_errors=True)
    sys.exit(1)
print("baseline: %d/%d green\n" % (EXPECTED_RELEASE_CASES + EXPECTED_NOTIFY_CASES,
                                   EXPECTED_RELEASE_CASES + EXPECTED_NOTIFY_CASES))

survived = 0
false_fails = 0
for m in MUTANTS:
    if m["target"] == "release":
        reds = run_release_suite(variants[m["id"]])
    else:
        reds = run_notify_suite(variants[m["id"]])
    if m["expect"] == "green":
        if reds:
            false_fails += 1
            print("x %s CONTROL FALSE-FAILED (%d red) -- %s" % (m["id"], len(reds), m["why"]))
            for name, reason in reds:
                print("      %s\n        %s" % (name, reason))
        else:
            print("v %s CONTROL green -- %s" % (m["id"], m["why"]))
        continue
    if not reds:
        survived += 1
        print("x %s SURVIVED -- %s" % (m["id"], m["why"]))
    else:
        print("v %s killed, radius %d -- %s" % (m["id"], len(reds), m["why"]))
        for name, reason in reds:
            print("      %s\n        %s" % (name, reason))

reds_declared = sum(1 for m in MUTANTS if m["expect"] == "red")
print(
    "\n%d mutants, %d killed, %d survived; %d CONTROLS, %d false-failed"
    % (reds_declared, reds_declared - survived, survived, len(MUTANTS) - reds_declared, false_fails)
)
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if (survived or false_fails) else 0)
