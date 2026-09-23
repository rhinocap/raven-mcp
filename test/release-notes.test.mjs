// Release notes come from CHANGELOG.md, never from git log.
//
// v2.6.0 shipped a GitHub Release body and a release email carrying ~70 raw
// commit subjects, because `scripts/detect-release-scope.mjs` fell back to the
// commit list whenever no merged PR existed — and this repo ships by direct
// push, so that fallback was the NORMAL path. The apex /changelog page also
// stayed at v2.5.0, because the tail of the release workflow only ever
// rebuilt site/changelog.html and never touched web/data/changelog.json.
//
// `scripts/release-notes.mjs` owns the replacement: the `[Unreleased]` block
// of CHANGELOG.md is the one curated source, and one promotion writes the
// version heading, the web entry and (via the detector) the Release body and
// email. These tests pin the properties that made the old pipeline wrong:
//
//   - a minor/major release with nothing curated FAILS rather than inventing
//     a body; a patch gets a maintenance body;
//   - the web entry carries plain-text leads (no markdown, no continuation
//     paragraphs) and never a commit subject;
//   - promotion is idempotent, including on a resume where [Unreleased] is
//     already empty (the first CLI run tripped exactly that);
//   - the email renderer keeps a multi-paragraph bullet inside its <li> and
//     does not close the list on blank lines.
//
// The detector itself is exercised through `readFileSync("CHANGELOG.md")` in
// CI and not here; what is asserted here is that its only notes source has
// these properties, and that no export of the module reads git at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseUnreleased,
  parseReleaseBlock,
  stripMarkdown,
  MAINTENANCE_BODY,
  releaseNotesFor,
  promoteChangelogMd,
  webEntryFromUnreleased,
  prependChangelogJson,
  promoteChangelog,
  bumpFromVersion,
  escapeHtml,
  renderNotesHtml,
  compareVersions,
  topReleasedVersion,
} from "../scripts/release-notes.mjs";

const HEADER = `# Changelog

Intro line with a [link](https://ravenmcp.ai/changelog).

`;

const UNRELEASED = `## [Unreleased]
<!-- web: category=tooling kind=feature title="Image attachments in Grab" -->

### Added
- The Grab overlay accepts **image attachments** dropped into the composer: PNG and JPEG up to 25 MiB.
- Path attachments get thumbnails via \`GET /attachment\`.

### Changed
- **Every tool states all four MCP hints** explicitly.
  A second paragraph explaining why, indented by two spaces, belongs to the
  bullet above and is not a separate change.

- Empty input is refused instead of scored (#123).

### Fixed
- audit_contrast no longer reports backpressure as a missing browser.

`;

const PREVIOUS = `## [2.5.0] - 2026-08-17

### Added
- design_gauntlet.
`;

const FULL = HEADER + UNRELEASED + PREVIOUS;
const EMPTY = HEADER + "## [Unreleased]\n\n" + PREVIOUS;
// A section heading with nothing under it: text, but no notes.
const STUB = HEADER + "## [Unreleased]\n\n### Added\n\n" + PREVIOUS;

const JSON_FIXTURE = {
  _comment: "fixture",
  categories: ["tooling"],
  kinds: ["new", "feature", "fix"],
  releases: [{ version: "v2.5.0", date: "2026-08-17", category: "tooling", kind: "new", title: "Gauntlet", changes: ["design_gauntlet."] }],
};

test("parseUnreleased returns the block between the heading and the next release, minus web meta", () => {
  const { body, meta, bullets, sections } = parseUnreleased(FULL);
  assert.ok(body.startsWith("### Added"), body.slice(0, 40));
  assert.ok(!body.includes("<!--"), "web meta comment is stripped from the body");
  assert.ok(!body.includes("2.5.0"), "previous release is not part of the block");
  assert.deepEqual(sections, ["Added", "Changed", "Fixed"]);
  assert.deepEqual(meta, { category: "tooling", kind: "feature", title: "Image attachments in Grab" });
  assert.equal(bullets.length, 5, "five top-level bullets; the continuation paragraph is not a sixth");
  assert.ok(bullets[2].startsWith("**Every tool"), bullets[2]);
  assert.ok(!bullets.some((b) => b.includes("second paragraph")), "continuation paragraph is not a bullet");
});

test("parseUnreleased throws when the heading is missing", () => {
  assert.throws(() => parseUnreleased("# Changelog\n\n## [2.5.0] - 2026-08-17\n"), /Unreleased/);
});

test("releaseNotesFor: minor and major with an empty [Unreleased] throw; patch gets the maintenance body", () => {
  assert.throws(() => releaseNotesFor("2.7.0", "minor", EMPTY), /\[Unreleased\] has no bullets/);
  assert.throws(() => releaseNotesFor("3.0.0", "major", EMPTY), /\[Unreleased\] has no bullets/);
  // A stub — a section heading with nothing under it — is not notes either.
  assert.throws(() => releaseNotesFor("2.7.0", "minor", STUB), /\[Unreleased\] has no bullets/);
  assert.ok(releaseNotesFor("2.6.1", "patch", STUB).includes(MAINTENANCE_BODY));
  const patch = releaseNotesFor("2.6.1", "patch", EMPTY);
  assert.ok(patch.includes(MAINTENANCE_BODY), patch);
  assert.ok(patch.startsWith("Raven v2.6.1 — patch release\n"), patch.split("\n")[0]);
  assert.match(patch, /\*\*Install:\*\* `claude mcp add raven/);
  assert.match(patch, /raven\.mcpb/);
});

test("releaseNotesFor carries the curated block verbatim and nothing shaped like a commit subject", () => {
  const notes = releaseNotesFor("2.6.0", "minor", FULL);
  const { body } = parseUnreleased(FULL);
  assert.ok(notes.includes(body), "the [Unreleased] body appears verbatim");
  assert.ok(!notes.includes("<!--"), "no web meta leaks into the Release body");
  // The fixture's own bullets are all present, in order, and nothing else is
  // bulleted: the count pins that no line was invented alongside them.
  const bullets = notes.split("\n").filter((l) => /^- /.test(l));
  assert.deepEqual(bullets, [
    "- The Grab overlay accepts **image attachments** dropped into the composer: PNG and JPEG up to 25 MiB.",
    "- Path attachments get thumbnails via `GET /attachment`.",
    "- **Every tool states all four MCP hints** explicitly.",
    "- Empty input is refused instead of scored (#123).",
    "- audit_contrast no longer reports backpressure as a missing browser.",
  ]);
  assert.doesNotMatch(notes, /\b[0-9a-f]{7,40}\b/, "no commit SHAs");
});

test("releaseNotesFor prefers the promoted block once [Unreleased] is emptied (a resume), and strips a leading v", () => {
  const promoted = promoteChangelogMd(FULL, "2.6.0", "2026-09-23");
  assert.equal(parseUnreleased(promoted).bullets.length, 0, "fixture: [Unreleased] is empty after promotion");
  const notes = releaseNotesFor("v2.6.0", "minor", promoted);
  assert.ok(notes.startsWith("Raven v2.6.0 — minor release\n"), notes.split("\n")[0]);
  assert.ok(notes.includes(parseUnreleased(FULL).body), "the promoted body is the notes body");
  // Not a resume: a promoted 2.5.0 is present, [Unreleased] holds 2.6.0's notes.
  const fresh = releaseNotesFor("2.6.0", "minor", FULL);
  assert.ok(fresh.includes("image attachments"), "still reads [Unreleased] when the version is not yet promoted");
});

test("CRLF input parses the same as LF", () => {
  const crlf = FULL.replace(/\n/g, "\r\n");
  assert.equal(parseUnreleased(crlf).body, parseUnreleased(FULL).body);
  assert.equal(parseUnreleased(crlf).bullets.length, 5);
  const promoted = promoteChangelog({ changelogMd: crlf, changelogJson: JSON_FIXTURE, version: "2.6.0", bump: "minor", date: "2026-09-23" });
  assert.equal(promoted.promoted, true);
  assert.doesNotMatch(promoted.changelogMd, /\r/, "output is LF");
  assert.equal(promoted.entry.changes.length, 5);
});

test("the notes module never reads git", () => {
  const src = readFileSync(new URL("../scripts/release-notes.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /child_process|execSync\(|execFileSync\(|spawnSync\(|spawn\(|\bimport\(/);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\bgit\b/, "no git in the notes module's code (comments may name the old defect)");
  const detector = readFileSync(new URL("../scripts/detect-release-scope.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(detector, /commits\.map\(\(c\) => `- \$\{c\}`\)/, "the commit-subject fallback is gone");
  assert.match(detector, /releaseNotesFor\(nextVersion, bump, readFileSync\("CHANGELOG\.md"/);
  // Both resume exits set `notes` too — v2.6.0's resume set none, and the
  // Release step fell through to --generate-notes.
  const resumeExits = detector.match(/setOutput\("resume", "true"\);[\s\S]*?process\.exit\(0\);/g) || [];
  assert.equal(resumeExits.length, 2, "two resume exits");
  for (const block of resumeExits) assert.match(block, /setOutput\("notes", resumeNotes\(/);
});

test("promoteChangelogMd moves the block under a dated heading and leaves an empty [Unreleased] above; idempotent", () => {
  const once = promoteChangelogMd(FULL, "2.6.0", "2026-09-23");
  assert.match(once, /^## \[Unreleased\]\n\n## \[2\.6\.0\] - 2026-09-23\n\n<!-- web:[^\n]*-->\n\n### Added/m, "the meta line travels with the block it describes");
  assert.ok(once.includes("## [2.5.0] - 2026-08-17"), "previous releases are kept");
  assert.equal(parseUnreleased(once).body, "", "the new [Unreleased] block is empty");
  assert.equal(promoteChangelogMd(once, "2.6.0", "2026-09-23"), once, "second promotion is a no-op");
  assert.equal(promoteChangelogMd(EMPTY, "2.6.0", "2026-09-23"), EMPTY, "nothing to promote leaves the file alone");
});

test("webEntryFromUnreleased: plain-text leads, meta title/kind/category, no markdown and no continuation text", () => {
  const entry = webEntryFromUnreleased(FULL, "2.6.0", "2026-09-23", "minor");
  assert.equal(entry.version, "v2.6.0");
  assert.equal(entry.date, "2026-09-23");
  assert.equal(entry.category, "tooling");
  assert.equal(entry.kind, "feature");
  assert.equal(entry.title, "Image attachments in Grab");
  assert.equal(entry.changes.length, 5);
  for (const c of entry.changes) {
    assert.doesNotMatch(c, /[*`\[\]<>]/, `plain text only: ${c}`);
  }
  assert.equal(entry.changes[0], "The Grab overlay accepts image attachments dropped into the composer: PNG and JPEG up to 25 MiB.");
  assert.equal(entry.changes[3], "Empty input is refused instead of scored (#123).");
  assert.ok(!entry.changes.some((c) => c.includes("second paragraph")));
  assert.equal(webEntryFromUnreleased(EMPTY, "2.6.1", "2026-09-24", "patch"), null);
});

test("webEntryFromUnreleased defaults: kind from bump, category tooling, title from the first change", () => {
  const noMeta = FULL.replace(/<!-- web:.*-->\n/, "");
  assert.equal(webEntryFromUnreleased(noMeta, "2.6.0", "2026-09-23", "minor").kind, "feature");
  assert.equal(webEntryFromUnreleased(noMeta, "3.0.0", "2026-09-23", "major").kind, "new");
  assert.equal(webEntryFromUnreleased(noMeta, "2.6.1", "2026-09-23", "patch").kind, "fix");
  const entry = webEntryFromUnreleased(noMeta, "2.6.0", "2026-09-23", "minor");
  assert.equal(entry.category, "tooling");
  assert.equal(entry.title, "The Grab overlay accepts image attachments dropped into the composer");
  assert.ok(entry.title.length <= 80);
});

test("prependChangelogJson puts the entry first, keeps the rest, and is idempotent by version", () => {
  const entry = webEntryFromUnreleased(FULL, "2.6.0", "2026-09-23", "minor");
  const once = prependChangelogJson(JSON_FIXTURE, entry);
  assert.equal(once.releases[0].version, "v2.6.0");
  assert.equal(once.releases[1].version, "v2.5.0");
  assert.equal(once.releases.length, 2);
  assert.deepEqual(Object.keys(once), Object.keys(JSON_FIXTURE), "top-level shape unchanged");
  assert.equal(JSON_FIXTURE.releases.length, 1, "input not mutated");
  const twice = prependChangelogJson(once, entry);
  assert.equal(twice.releases.length, 2);
});

test("promoteChangelog: one pass writes both files; a resume with an emptied [Unreleased] is a no-op, not an error", () => {
  const first = promoteChangelog({ changelogMd: FULL, changelogJson: JSON_FIXTURE, version: "2.6.0", bump: "minor", date: "2026-09-23" });
  assert.equal(first.promoted, true);
  assert.match(first.changelogMd, /^## \[2\.6\.0\] - 2026-09-23$/m);
  assert.equal(first.changelogJson.releases[0].version, "v2.6.0");
  assert.equal(first.entry.changes.length, 5);
  // Resume: the workflow re-runs the step after the previous run committed both files.
  const resume = promoteChangelog({ changelogMd: first.changelogMd, changelogJson: first.changelogJson, version: "2.6.0", bump: "minor", date: "2026-09-24" });
  assert.equal(resume.promoted, false);
  assert.equal(resume.alreadyPromoted, true);
  assert.equal(resume.changelogMd, first.changelogMd);
  assert.equal(resume.changelogJson, first.changelogJson);
  // A genuinely empty minor still fails; so does a heading-only stub.
  assert.throws(() => promoteChangelog({ changelogMd: EMPTY, changelogJson: JSON_FIXTURE, version: "2.7.0", bump: "minor", date: "2026-09-24" }), /\[Unreleased\] has no bullets/);
  assert.throws(() => promoteChangelog({ changelogMd: STUB, changelogJson: JSON_FIXTURE, version: "2.7.0", bump: "minor", date: "2026-09-24" }), /\[Unreleased\] has no bullets/);
  // A patch with nothing curated promotes nothing and does not throw.
  const patch = promoteChangelog({ changelogMd: EMPTY, changelogJson: JSON_FIXTURE, version: "2.6.1", bump: "patch", date: "2026-09-24" });
  assert.equal(patch.promoted, false);
  assert.equal(patch.changelogJson, JSON_FIXTURE);
});

test("promoteChangelog back-fills changelog.json when CHANGELOG.md was promoted but the json was not (half-done resume)", () => {
  const mdOnly = promoteChangelogMd(FULL, "2.6.0", "2026-09-23");
  const r = promoteChangelog({ changelogMd: mdOnly, changelogJson: JSON_FIXTURE, version: "v2.6.0", bump: "minor", date: "2026-09-24" });
  assert.equal(r.promoted, true);
  assert.equal(r.changelogMd, mdOnly, "CHANGELOG.md untouched");
  assert.equal(r.changelogJson.releases[0].version, "v2.6.0");
  assert.equal(r.changelogJson.releases[0].date, "2026-09-23", "date from the promoted heading, not today");
  assert.equal(r.entry.changes.length, 5);
  assert.equal(r.entry.kind, "feature");
  // Idempotent from here.
  const again = promoteChangelog({ changelogMd: mdOnly, changelogJson: r.changelogJson, version: "2.6.0", bump: "minor", date: "2026-09-25" });
  assert.equal(again.alreadyPromoted, true);
});

test("promoteChangelog refuses to file [Unreleased] under a version older than the top dated heading", () => {
  // 2.6.0 has shipped (top heading) and [Unreleased] holds 2.7.0's notes; an
  // explicit resume of 2.5.1 must not steal them.
  const md = promoteChangelogMd(FULL, "2.6.0", "2026-09-23").replace("## [Unreleased]\n", `## [Unreleased]\n\n### Added\n\n- Next thing.\n`);
  assert.equal(parseUnreleased(md).bullets.length, 1, "fixture: [Unreleased] holds the next release");
  assert.throws(
    () => promoteChangelog({ changelogMd: md, changelogJson: JSON_FIXTURE, version: "2.5.1", bump: "patch", date: "2026-09-24" }),
    /refusing to promote \[Unreleased\] as 2\.5\.1: CHANGELOG\.md already carries 2\.6\.0/,
  );
  // The same call for the version that IS next succeeds.
  assert.equal(promoteChangelog({ changelogMd: md, changelogJson: JSON_FIXTURE, version: "2.7.0", bump: "minor", date: "2026-09-24" }).promoted, true);
  assert.equal(compareVersions("2.5.1", "2.6.0") < 0, true);
  assert.equal(compareVersions("2.10.0", "2.9.9") > 0, true, "numeric, not lexical");
  assert.equal(topReleasedVersion(md), "2.6.0");
});

test("bumpFromVersion", () => {
  assert.equal(bumpFromVersion("2.6.0"), "minor");
  assert.equal(bumpFromVersion("v2.6.0"), "minor");
  assert.equal(bumpFromVersion("3.0.0"), "major");
  assert.equal(bumpFromVersion("2.6.1"), "patch");
});

test("stripMarkdown and escapeHtml", () => {
  assert.equal(stripMarkdown("**Bold** `code` [text](https://x.y) <!-- c -->  end"), "Bold code text end");
  assert.equal(escapeHtml(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});

test("renderNotesHtml: sections become labels, a continuation paragraph stays inside its <li>, blank lines keep the list open", () => {
  const notes = releaseNotesFor("2.6.0", "minor", FULL);
  const html = renderNotesHtml(notes);
  assert.ok(!html.includes("Raven v2.6.0 — minor release"), "title line is skipped; the email builds its own header");
  assert.match(html, /text-transform:uppercase;[^>]*>Added</);
  assert.match(html, />Changed</);
  assert.match(html, />Fixed</);
  // Multi-paragraph bullet: the <p> for the continuation sits between the <li> open and its close.
  const li = html.search(/<li style="margin-bottom:8px;"><strong[^>]*>Every tool/);
  assert.ok(li >= 0, "bold-led bullet rendered");
  const p = html.indexOf("<p style=\"margin:8px 0 0;\">A second paragraph", li);
  const liClose = html.indexOf("</li>", li);
  assert.ok(p > li && p < liClose, `continuation <p> (${p}) must sit inside the <li> (${li}..${liClose})`);
  // The blank line before "Empty input" must not close the <ul>: exactly three lists, one per section.
  assert.equal(html.split("<ul ").length - 1, 3);
  assert.equal(html.split("</ul>").length - 1, 3);
  assert.match(html, /href="https:\/\/github\.com\/rhinocap\/raven-mcp\/issues\/123"/);
  assert.match(html, /<code[^>]*>GET \/attachment<\/code>/);
  assert.match(html, /Install:/);
});

test("renderNotesHtml: a #N or [x](y) inside a code span stays literal; only http(s) links become anchors", () => {
  const html = renderNotesHtml(["### Fixed", "- Use `git show #1` and `[not](a-link)` literally (#42).", "- See [docs](javascript:alert(1)) and [ok](https://ravenmcp.ai)."].join("\n"));
  assert.match(html, /<code[^>]*>git show #1<\/code>/, "#1 inside code is not linked");
  assert.match(html, /<code[^>]*>\[not\]\(a-link\)<\/code>/, "link syntax inside code is not linked");
  assert.equal((html.match(/issues\/1"/g) || []).length, 0);
  assert.match(html, /href="https:\/\/github\.com\/rhinocap\/raven-mcp\/issues\/42"/, "#42 outside code is linked");
  assert.doesNotMatch(html, /href="javascript:/, "non-http scheme is not an anchor");
  assert.match(html, /href="https:\/\/ravenmcp\.ai"/);
});

// ---------------------------------------------------------------------------
// Tag-anchored promotion. On a resume, [Unreleased] may already carry bullets
// written AFTER the tag; the block vX.Y.Z shipped is [Unreleased] as it stood
// at the tag (`git show vX.Y.Z:CHANGELOG.md`, passed in by the workflow).
// ---------------------------------------------------------------------------

// The current file: everything the tag had plus one bullet written afterwards.
const LATER = FULL.replace("### Fixed\n- audit_contrast", "### Fixed\n- Written after the tag was cut.\n- audit_contrast");

test("tag-anchored promotion files only the tagged bullets and keeps the newer one under [Unreleased]", () => {
  assert.equal(parseUnreleased(LATER).bullets.length, 6, "fixture: current has one more bullet than the tag");
  const r = promoteChangelog({ changelogMd: LATER, changelogJson: JSON_FIXTURE, version: "2.6.0", bump: "minor", date: "2026-09-23", taggedChangelogMd: FULL });
  assert.equal(r.promoted, true);
  assert.equal(r.entry.changes.length, 5, "entry from the tagged block");
  assert.ok(!r.entry.changes.some((c) => c.includes("Written after")), "the later bullet is not in the web entry");
  assert.equal(parseReleaseBlock(r.changelogMd, "2.6.0").body, parseUnreleased(FULL).body, "promoted block == tagged [Unreleased]");
  const remainder = parseUnreleased(r.changelogMd);
  assert.equal(remainder.bullets.length, 1, "the newer bullet stays under [Unreleased]");
  assert.match(remainder.body, /^### Fixed\n- Written after the tag was cut\.$/, "only its own section heading survives");
  assert.doesNotMatch(remainder.raw, /<!-- web/, "a meta line identical at the tag is subtracted, not carried forward");
  assert.match(parseReleaseBlock(r.changelogMd, "2.6.0").raw, /^<!-- web: category=tooling/, "the promoted block keeps the tagged meta line");
  // Nothing tagged: the current block is promoted whole, as before.
  const whole = promoteChangelog({ changelogMd: LATER, changelogJson: JSON_FIXTURE, version: "2.6.0", bump: "minor", date: "2026-09-23" });
  assert.equal(whole.entry.changes.length, 6);
  // A tagged file that has no [Unreleased] heading at all falls back to current.
  const noHeading = promoteChangelog({ changelogMd: LATER, changelogJson: JSON_FIXTURE, version: "2.6.0", bump: "minor", date: "2026-09-23", taggedChangelogMd: HEADER + PREVIOUS });
  assert.equal(noHeading.entry.changes.length, 6, "unparseable tagged copy → current block");
  // A tagged copy whose [Unreleased] is empty also falls back to current.
  const emptyTag = promoteChangelog({ changelogMd: LATER, changelogJson: JSON_FIXTURE, version: "2.6.0", bump: "minor", date: "2026-09-23", taggedChangelogMd: EMPTY });
  assert.equal(emptyTag.entry.changes.length, 6);
});

test("promoteChangelogMd with a tagged copy is idempotent even when the date differs on the second call", () => {
  const once = promoteChangelogMd(LATER, "2.6.0", "2026-09-23", FULL);
  assert.match(once, /^## \[Unreleased\]\n\n### Fixed\n- Written after the tag was cut\.\n\n## \[2\.6\.0\] - 2026-09-23\n\n<!-- web:[^\n]*-->\n\n### Added/m);
  assert.equal(promoteChangelogMd(once, "2.6.0", "2026-09-24", FULL), once, "a resume with a later date changes nothing");
  assert.equal(promoteChangelogMd(once, "2.6.0", "2026-09-24"), once, "with or without the tagged copy");
});

test("releaseNotesFor takes the tagged [Unreleased] over a current block that has grown, and over a bullet-less promoted stub", () => {
  const tagged = releaseNotesFor("2.6.0", "minor", LATER, FULL);
  assert.ok(!tagged.includes("Written after"), "the later bullet is not in the notes");
  assert.ok(tagged.includes("image attachments"));
  // A `## [2.6.0]` heading with no bullets under it must not win over the tagged bullets.
  const stub = FULL.replace("## [2.5.0]", "## [2.6.0] - 2026-09-23\n\n### Added\n\n## [2.5.0]");
  assert.equal(parseReleaseBlock(stub, "2.6.0").bullets.length, 0, "fixture: promoted stub is bullet-less");
  const fromTag = releaseNotesFor("2.6.0", "minor", stub, FULL);
  assert.ok(fromTag.includes("image attachments"), "tagged bullets are used, not the stub");
  // Explicit resume of a patch whose current [Unreleased] has since grown.
  const patch = releaseNotesFor("2.6.1", "patch", LATER, FULL);
  assert.ok(!patch.includes("Written after"));
  // No tagged copy and nothing curated: unchanged behaviour.
  assert.throws(() => releaseNotesFor("2.7.0", "minor", EMPTY, undefined), /no bullets/);
  assert.throws(() => releaseNotesFor("2.7.0", "minor", EMPTY, EMPTY), /no bullets/);
});

test("a meta line written for the NEXT release survives tag-anchored promotion (P2: subtraction ran on meta-stripped text)", () => {
  const NEXT_META = '<!-- web: category=grab kind=fix title="Next release" -->';
  const next = LATER.replace(/<!-- web:[^\n]*-->/, NEXT_META);
  assert.ok(next.includes(NEXT_META) && !next.includes("Image attachments in Grab"), "fixture: current carries only the new meta line");
  const r = promoteChangelog({ changelogMd: next, changelogJson: JSON_FIXTURE, version: "2.6.0", bump: "minor", date: "2026-09-23", taggedChangelogMd: FULL });
  const remainder = parseUnreleased(r.changelogMd);
  assert.ok(remainder.raw.includes(NEXT_META), "the next release's meta line stays under [Unreleased]");
  assert.equal(remainder.meta.title, "Next release");
  assert.equal(remainder.bullets.length, 1);
  const promoted = parseReleaseBlock(r.changelogMd, "2.6.0");
  assert.equal(promoted.meta.title, "Image attachments in Grab", "the promoted block carries the TAGGED meta, not the current one");
  assert.equal(r.entry.title, "Image attachments in Grab");
  assert.equal(promoted.body, parseUnreleased(FULL).body);
  // Second pass is a no-op and the next meta is still there.
  const again = promoteChangelog({ changelogMd: r.changelogMd, changelogJson: r.changelogJson, version: "2.6.0", bump: "minor", date: "2026-09-24", taggedChangelogMd: FULL });
  assert.equal(again.alreadyPromoted, true);
  assert.ok(parseUnreleased(again.changelogMd).raw.includes(NEXT_META));
});

test("a bullet-less [v] stub is refilled from the tagged copy on a resume, keeping the stub's date", () => {
  const stub = LATER.replace("## [2.5.0]", "## [2.6.0] - 2026-09-20\n\n### Added\n\n## [2.5.0]");
  assert.equal(parseReleaseBlock(stub, "2.6.0").bullets.length, 0, "fixture: stub is bullet-less");
  const r = promoteChangelog({ changelogMd: stub, changelogJson: JSON_FIXTURE, version: "2.6.0", bump: "minor", date: "2026-09-23", taggedChangelogMd: FULL });
  assert.equal(r.promoted, true, "a stub is not a completed promotion");
  assert.equal(r.entry.changes.length, 5);
  assert.equal(r.entry.date, "2026-09-20", "the stub's own date is kept");
  const promoted = parseReleaseBlock(r.changelogMd, "2.6.0");
  assert.equal(promoted.bullets.length, 5);
  assert.equal(promoted.date, "2026-09-20");
  assert.equal((r.changelogMd.match(/^## \[2\.6\.0\]/gm) || []).length, 1, "exactly one [2.6.0] heading remains");
  assert.match(parseUnreleased(r.changelogMd).body, /^### Fixed\n- Written after the tag was cut\.$/, "the remainder still lands under [Unreleased]");
  assert.ok(r.changelogMd.includes("## [2.5.0] - 2026-08-17"), "older releases untouched");
  assert.equal(r.changelogJson.releases.filter((x) => x.version === "v2.6.0").length, 1);
  // The json already carrying the entry does not turn the stub into a no-op.
  const jsonDone = promoteChangelog({ changelogMd: stub, changelogJson: r.changelogJson, version: "2.6.0", bump: "minor", date: "2026-09-23", taggedChangelogMd: FULL });
  assert.equal(jsonDone.promoted, true);
  assert.equal(parseReleaseBlock(jsonDone.changelogMd, "2.6.0").bullets.length, 5);
  assert.equal(jsonDone.changelogJson.releases.filter((x) => x.version === "v2.6.0").length, 1, "prepend stays idempotent by version");
  // promoteChangelogMd alone does the same; a stub with NO tagged bullets is left alone.
  assert.equal(parseReleaseBlock(promoteChangelogMd(stub, "2.6.0", "2026-09-23", FULL), "2.6.0").bullets.length, 5);
  assert.equal(promoteChangelogMd(stub, "2.6.0", "2026-09-23", EMPTY), stub);
  assert.equal(promoteChangelogMd(stub, "2.6.0", "2026-09-23"), stub);
});

test("releaseNotesFor: a promoted [v] WITH bullets outranks a differing tagged copy", () => {
  const promoted = promoteChangelogMd(FULL, "2.6.0", "2026-09-23");
  const edited = promoted.replace("- audit_contrast no longer reports backpressure as a missing browser.", "- audit_contrast wording edited after the tag.");
  assert.ok(edited !== promoted, "fixture: the promoted block was edited");
  const notes = releaseNotesFor("2.6.0", "minor", edited, FULL);
  assert.ok(notes.includes("wording edited after the tag"), "the promoted text is what ships");
  assert.ok(!notes.includes("reports backpressure as a missing browser"), "the tagged copy does not override a filled promoted block");
});

test("renderNotesHtml skips only the generated title line, and does not double-link a #N inside link text", () => {
  const html = renderNotesHtml(["Raven v2 release notes", "### Fixed", "- See [issue #7 thread](https://example.com/t) and #8."].join("\n"));
  assert.match(html, /Raven v2 release notes/, "a bullet-less lead line that merely starts with the title prefix is kept");
  assert.equal((html.match(/<a /g) || []).length, 2, "one anchor for the link, one for #8");
  assert.match(html, /<a [^>]*href="https:\/\/example\.com\/t"[^>]*>issue #7 thread<\/a>/, "#7 inside link text is literal");
  assert.doesNotMatch(html, /issues\/7"/);
  assert.match(html, /issues\/8"/);
});

test("the CLI and the workflow pass the tagged changelog through, and the workflow never lets GitHub write the body", () => {
  const cli = readFileSync(new URL("../scripts/promote-changelog.mjs", import.meta.url), "utf8");
  assert.match(cli, /opt\("tagged-changelog"\)/);
  assert.match(cli, /promoteChangelog\(\{[^}]*taggedChangelogMd/);
  const yml = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  const flagLines = yml.split("\n").filter((line) => !/^\s*#/.test(line) && line.includes("--generate-notes"));
  assert.deepEqual(flagLines, [], "no non-comment workflow line passes --generate-notes");
  assert.ok(yml.split("\n").some((line) => /^\s*#/.test(line) && line.includes("--generate-notes")), "fixture: the comment naming the flag is still there, so the line-based check is not vacuous");
  assert.match(yml, /git show "v\$VERSION:CHANGELOG\.md" > \/tmp\/tagged-changelog\.md/);
  assert.match(yml, /promote-changelog\.mjs --version "\$VERSION" \$\{BUMP:\+--bump "\$BUMP"\} --tagged-changelog "\$tagged"/);
  assert.match(yml, /gh release edit "v\$VERSION" --notes-file \/tmp\/release-notes\.md/);
  const notifyIdx = yml.indexOf("\n  notify:");
  assert.notEqual(notifyIdx, -1, "the notify job heading is where this test expects it (a -1 would slice one character and pass vacuously)");
  const notify = yml.slice(notifyIdx);
  assert.match(notify, /notify-release\.mjs/, "the slice actually holds the notify job");
  assert.doesNotMatch(notify, /gh release view/, "the email never reads the Release body");
  const notifyScript = readFileSync(new URL("../scripts/notify-release.mjs", import.meta.url), "utf8");
  assert.match(notifyScript, /const bump = RELEASE_BUMP \|\| bumpFromVersion\(RELEASE_VERSION\);/, "an empty RELEASE_BUMP (resend) is derived from the version, never defaulted to minor");
  assert.doesNotMatch(notifyScript, /RELEASE_BUMP = "minor"/);
  assert.match(notifyScript, /releaseNotesFor\(RELEASE_VERSION, bump, readFileSync\("CHANGELOG\.md"/);
  assert.doesNotMatch(notifyScript, /RELEASE_BUMP === "major"/, "subject and body read the derived bump");
});
