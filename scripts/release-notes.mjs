// Release notes, changelog promotion and the email renderer — pure functions
// shared by detect-release-scope.mjs, promote-changelog.mjs and
// notify-release.mjs, with test/release-notes.test.mjs driving them.
//
// The source of every release body is the `## [Unreleased]` block of
// CHANGELOG.md. v2.6.0 shipped a Release body and an email carrying ~70 raw
// commit subjects because detect-release-scope.mjs fell back to `git log`
// whenever no merged PR existed — and this repo ships by direct push, so that
// fallback was the normal path. Nothing here reads a commit subject.
//
// Three files describe a release and they must move together:
//   CHANGELOG.md             `## [X.Y.Z] - date` promoted from [Unreleased]
//   web/data/changelog.json  the apex /changelog entry (plain-text changes[])
//   site/changelog.html      rebuilt from GitHub Releases by build-changelog.mjs
// scripts/check-site-drift.mjs fails when the first two disagree on their top
// version, which is why promoteChangelog() writes both in one pass.

const UNRELEASED_HEADING = /^## \[Unreleased\]\s*$/m;
const RELEASE_HEADING = /^## \[/m;
const WEB_META = /^<!--\s*web:\s*(.*?)\s*-->\s*$/m;

/** CRLF → LF. A Windows checkout or a web editor writes `\r\n`; every regex here is written for `\n`. */
function normalize(md) {
  return String(md).replace(/\r\n?/g, "\n");
}

function parseBlock(raw) {
  const meta = parseWebMeta(raw);
  const body = raw
    .split("\n")
    .filter((line) => !/^<!--.*-->\s*$/.test(line.trim()))
    .join("\n")
    .trim();
  // `raw` keeps the `<!-- web: -->` meta lines that `body` strips: the
  // tag-anchored remainder is computed over raw text so a meta line written
  // for the NEXT release survives promotion instead of being deleted.
  return { raw: raw.trim(), body, meta, bullets: bulletParagraphs(body), sections: sectionHeadings(body) };
}

/** Return the text of the `## [Unreleased]` block (without its heading). */
export function parseUnreleased(md) {
  md = normalize(md);
  const match = UNRELEASED_HEADING.exec(md);
  if (!match) throw new Error("CHANGELOG.md has no `## [Unreleased]` heading");
  const start = match.index + match[0].length;
  const rest = md.slice(start);
  const next = RELEASE_HEADING.exec(rest);
  return parseBlock(next ? rest.slice(0, next.index) : rest);
}

/**
 * The promoted `## [X.Y.Z] - date` block, or null when the heading is absent.
 * A resume reads its notes from here: the previous run's changelog commit
 * emptied [Unreleased], so the promoted block is the only curated copy left.
 */
export function parseReleaseBlock(md, version) {
  md = normalize(md);
  const v = String(version).replace(/^v/, "");
  const heading = new RegExp(`^## \\[${escapeRegExp(v)}\\](?:\\s*-\\s*(\\S+))?\\s*$`, "m");
  const match = heading.exec(md);
  if (!match) return null;
  const rest = md.slice(match.index + match[0].length);
  const next = RELEASE_HEADING.exec(rest);
  return { ...parseBlock(next ? rest.slice(0, next.index) : rest), date: match[1] || null };
}

/** The first dated `## [X.Y.Z]` heading's version, or null. */
export function topReleasedVersion(md) {
  const match = /^## \[(\d+\.\d+\.\d+)\]/m.exec(normalize(md));
  return match ? match[1] : null;
}

/** Numeric semver compare: negative when a < b. */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function sectionHeadings(body) {
  return [...body.matchAll(/^###\s+(.+?)\s*$/gm)].map((m) => m[1]);
}

/**
 * Text of every top-level bullet, in order. A continuation paragraph (after a
 * blank line, indented by two or more spaces) belongs to the bullet above it
 * and is appended after "\n\n", so the web entry carries the whole bullet.
 * Wrapped lines within a paragraph, indented or not, join with a space. A nested list item, a
 * heading, or an unindented line after a blank ends the bullet.
 */
function bulletParagraphs(body) {
  const out = [];
  let paras = null; // paragraphs of the open bullet
  let afterBlank = false;
  const close = () => {
    if (paras !== null) out.push(paras.join("\n\n"));
    paras = null;
  };
  for (const line of body.split("\n")) {
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      close();
      paras = [li[1].trim()];
      afterBlank = false;
    } else if (paras === null) {
      continue;
    } else if (line.trim() === "") {
      afterBlank = true;
    } else if (/^\s{2,}[-*]\s/.test(line) || /^###/.test(line)) {
      close();
    } else if (/^\s{2,}\S/.test(line)) {
      // CommonMark: only a blank line opens a new paragraph; an indented
      // line without one wraps the paragraph above it.
      if (afterBlank) paras.push(line.trim());
      else paras[paras.length - 1] += " " + line.trim();
      afterBlank = false;
    } else if (!afterBlank) {
      // Soft-wrapped line at column 0.
      paras[paras.length - 1] += " " + line.trim();
    } else {
      close();
    }
  }
  close();
  return out;
}

/** `<!-- web: category=tooling kind=feature title="…" -->` → object. */
export function parseWebMeta(text) {
  const match = WEB_META.exec(text);
  if (!match) return {};
  const meta = {};
  for (const pair of match[1].matchAll(/(\w+)=("([^"]*)"|(\S+))/g)) {
    meta[pair[1]] = pair[3] !== undefined ? pair[3] : pair[4];
  }
  return meta;
}

/** Strip the inline markdown the web reader would otherwise print raw. */
export function stripMarkdown(s) {
  return s
    .replace(/<!--.*?-->/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const INSTALL_LINES = [
  "**Install:** `claude mcp add raven -- npx -y raven-mcp@latest`",
  "**Claude Desktop:** [download raven.mcpb](https://ravenmcp.ai/raven.mcpb)",
];

export const MAINTENANCE_BODY =
  "### Maintenance\n- Packaging and pipeline fixes only; no user-facing changes.";

function emptyNotesError(bump, where) {
  return new Error(
    `CHANGELOG.md ${where} has no bullets; a ${bump} release needs curated notes there before it can be cut`,
  );
}

/** `[Unreleased]` of the CHANGELOG.md as it stood at the version's tag, or null. */
function taggedUnreleased(taggedChangelogMd) {
  if (!taggedChangelogMd) return null;
  try {
    return parseUnreleased(taggedChangelogMd);
  } catch {
    return null;
  }
}

/**
 * The GitHub Release body and the email body for one version.
 * Source, in order: the promoted `## [version]` block when CHANGELOG.md
 * already carries it (a resume after the changelog commit); else
 * `[Unreleased]` as it stood AT THE TAG (`taggedChangelogMd`, the file read
 * out of `vX.Y.Z:CHANGELOG.md`), which is the only block that cannot have
 * picked up later work; else the current `[Unreleased]`. Without the tagged
 * copy a resume cut after new bullets landed would announce the next
 * release's notes under this version.
 * Throws when a minor/major release has nothing curated to say — a release
 * with no notes is a release nobody wrote up, and the email must not go out.
 * "Nothing" is judged on bullets, not on text: `### Added` with no items
 * under it is a stub, not notes.
 */
export function releaseNotesFor(version, bump, changelogMd, taggedChangelogMd) {
  const v = String(version).replace(/^v/, "");
  const promoted = parseReleaseBlock(changelogMd, v);
  const tagged = taggedUnreleased(taggedChangelogMd);
  let block;
  let where;
  if (promoted && promoted.bullets.length > 0) {
    block = promoted;
    where = `[${v}]`;
  } else if (tagged && tagged.bullets.length > 0) {
    block = tagged;
    where = `[Unreleased] at tag v${v}`;
  } else {
    block = parseUnreleased(changelogMd);
    where = "[Unreleased]";
  }
  let sections = block.body;
  if (block.bullets.length === 0) {
    if (bump !== "patch") throw emptyNotesError(bump, where);
    sections = MAINTENANCE_BODY;
  }
  return [`Raven v${v} — ${bump} release`, "", sections, "", ...INSTALL_LINES].join("\n");
}

function isContentLine(line) {
  return line.trim() !== "" && !/^###\s/.test(line);
}

/**
 * `current` minus every bullet/continuation line that `tagged` carries
 * (multiset subtraction, one removal per occurrence). `###` headings are
 * never subtracted; a heading left with nothing under it is pruned; blank
 * runs collapse. What remains is the work that landed AFTER the tag.
 * Both inputs are the RAW block text, so a `<!-- web: -->` meta line is an
 * ordinary content line: identical in both → subtracted, new in current → kept.
 *
 * Two limits are accepted rather than guarded, because the alternative is
 * diffing markdown structurally for a file one person edits by hand:
 *   - a line duplicated verbatim across sections is removed at its FIRST
 *     occurrence from the top, whichever section the tag actually carried it in;
 *   - the match is exact (trailing whitespace aside), so a tagged bullet that
 *     was re-worded after the tag is announced again under [Unreleased] — the
 *     next release repeats a sentence, which is visible and cheap to fix;
 *   - the same exact match applies to a `<!-- web: -->` meta line: one edited
 *     after the tag stays under [Unreleased], and because parseWebMeta takes
 *     the FIRST meta line, the next release inherits its title/category unless
 *     the author notices the stale comment above their new bullets.
 */
function subtractBody(current, tagged) {
  const remove = tagged.split("\n").filter(isContentLine).map((l) => l.trimEnd());
  const kept = [];
  for (const line of current.split("\n")) {
    if (isContentLine(line)) {
      const i = remove.indexOf(line.trimEnd());
      if (i !== -1) {
        remove.splice(i, 1);
        continue;
      }
    }
    kept.push(line);
  }
  const out = [];
  for (let i = 0; i < kept.length; i++) {
    if (/^###\s/.test(kept[i])) {
      let j = i + 1;
      while (j < kept.length && kept[j].trim() === "") j++;
      if (j >= kept.length || /^###\s/.test(kept[j])) continue;
    }
    out.push(kept[i]);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * A block that already carries a date keeps it, but only a real one: a
 * hand-written `## [1.1.0] - TBD` or `- 2026-13-45` would otherwise reach
 * changelog.json, where the page renders it as "Invalid Date". Used wherever a
 * heading's date is copied into the json — a stub refill and a half-promoted
 * resume alike.
 */
function keptDate(existing, fallback) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(existing || "");
  if (!m) return fallback;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  const real = t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
  return real ? existing : fallback;
}

/**
 * Move `[Unreleased]` under `## [version] - date`. Idempotent.
 * With `taggedMd` (CHANGELOG.md at the version's tag) the promoted block is
 * the TAGGED `[Unreleased]` and the new `[Unreleased]` keeps whatever landed
 * after the tag; without it the whole current block moves and the new
 * `[Unreleased]` is empty.
 */
export function promoteChangelogMd(md, version, date, taggedMd) {
  md = normalize(md);
  const v = String(version).replace(/^v/, "");
  const tagged = taggedUnreleased(taggedMd);
  const existing = parseReleaseBlock(md, v);
  if (existing) {
    // Already promoted — unless the heading is a bullet-less STUB and the
    // tagged copy has the notes: then the stub is dropped and refilled below
    // under the date it already carried, so a resume repairs it instead of
    // reporting "nothing to promote" over an empty section.
    if (existing.bullets.length > 0 || !tagged || tagged.bullets.length === 0) return md;
    md = removeReleaseBlock(md, v);
    date = keptDate(existing.date, date);
  }
  const current = parseUnreleased(md);
  const source = tagged && tagged.bullets.length > 0 ? tagged : current;
  if (source.bullets.length === 0) return md;
  const remainder = source === tagged ? subtractBody(current.raw, tagged.raw) : "";
  const match = UNRELEASED_HEADING.exec(md);
  const start = match.index + match[0].length;
  const rest = md.slice(start);
  const next = RELEASE_HEADING.exec(rest);
  const tail = next ? rest.slice(next.index) : "";
  const unreleased = remainder ? `## [Unreleased]\n\n${remainder}\n\n` : "## [Unreleased]\n\n";
  // The promoted block is the RAW source text, so every HTML comment in it —
  // the `<!-- web: -->` meta line and any note an author left — moves under
  // `## [v]` with its bullets, tagged copy or not. Nothing renders a comment,
  // and keeping the meta line beside the bullets it describes is what lets a
  // resume back-fill changelog.json from the promoted block.
  return `${md.slice(0, match.index)}${unreleased}## [${v}] - ${date}\n\n${source.raw}\n\n${tail}`;
}

/** `md` without the `## [version]` block (heading through the next `## [` heading). */
function removeReleaseBlock(md, v) {
  const heading = new RegExp(`^## \\[${escapeRegExp(v)}\\](?:\\s*-\\s*\\S+)?\\s*$`, "m");
  const match = heading.exec(md);
  if (!match) return md;
  const rest = md.slice(match.index + match[0].length);
  const next = RELEASE_HEADING.exec(rest);
  const after = next ? rest.slice(next.index) : "";
  return `${md.slice(0, match.index).replace(/\n+$/, "\n\n")}${after}`;
}

const KIND_BY_BUMP = { major: "new", minor: "feature", patch: "fix" };

/** Build the web/data/changelog.json entry for this release from `[Unreleased]`. */
export function webEntryFromUnreleased(changelogMd, version, date, bump) {
  return webEntryFromBlock(parseUnreleased(changelogMd), version, date, bump);
}

/** Same, from an already-parsed block (the promoted `## [version]` block on a half-done resume). */
export function webEntryFromBlock(block, version, date, bump) {
  const { meta, bullets } = block;
  // Each paragraph is stripped on its own so the "\n\n" between them
  // survives stripMarkdown's whitespace collapse.
  const changes = bullets
    .map((b) => b.split("\n\n").map(stripMarkdown).filter(Boolean).join("\n\n"))
    .filter(Boolean);
  if (changes.length === 0) return null;
  const title = meta.title ? stripMarkdown(meta.title) : defaultTitle(changes[0] || "");
  return {
    version: version.startsWith("v") ? version : `v${version}`,
    date,
    category: meta.category || "tooling",
    kind: meta.kind || KIND_BY_BUMP[bump] || "feature",
    title,
    changes,
  };
}

function defaultTitle(change) {
  // First paragraph only: a lead with no full stop must not reach paragraph 2.
  const lead = change.split("\n\n")[0];
  const sentence = lead.split(/(?<=\.)\s/)[0].replace(/\.$/, "");
  return sentence.split(":")[0].trim().slice(0, 80);
}

/** Prepend an entry to the parsed changelog.json. Idempotent by version. */
export function prependChangelogJson(json, entry) {
  if (!entry) return json;
  const i = json.releases.findIndex((r) => r.version === entry.version);
  if (i === -1) return { ...json, releases: [entry, ...json.releases] };
  // Idempotent by version — except that an entry with no changes is the json
  // half of a stub, and a stub refill has to reach both files or the page shows
  // an empty release under a heading CHANGELOG.md has since filled in.
  if ((json.releases[i].changes || []).length > 0) return json;
  const releases = json.releases.slice();
  releases[i] = entry;
  return { ...json, releases };
}

/** Both files in one pass; returns the new contents (unchanged when nothing to promote). */
export function promoteChangelog({ changelogMd, changelogJson, version, bump, date, taggedChangelogMd }) {
  // A resume re-runs this step after the tag exists and the previous run's
  // changelog commit has emptied [Unreleased]. Recognise the version heading
  // BEFORE asking whether there are notes to promote, or a resume of a minor
  // release fails on "[Unreleased] is empty" — which is exactly what a
  // completed promotion leaves behind.
  const v = String(version).replace(/^v/, "");
  const promoted = parseReleaseBlock(changelogMd, v);
  const tagged = taggedUnreleased(taggedChangelogMd);
  // A bullet-less `## [v]` stub with the notes in the tagged copy is not a
  // completed promotion: it takes the fresh-promotion path below, where
  // promoteChangelogMd refills the stub (keeping its date) and
  // prependChangelogJson stays idempotent by version.
  const stub = Boolean(promoted && promoted.bullets.length === 0 && tagged && tagged.bullets.length > 0);
  const jsonDone = (changelogJson.releases || []).some((r) => r.version === `v${v}`);
  if (promoted && jsonDone && !stub) return { changelogMd, changelogJson, promoted: false, alreadyPromoted: true };
  if (promoted && !stub) {
    // Half-promoted: the previous run wrote CHANGELOG.md and died before
    // changelog.json (or the commit). Back-fill the web entry from the
    // promoted block — [Unreleased] is empty now, or holds the NEXT release.
    const entry = webEntryFromBlock(promoted, v, keptDate(promoted.date, date), bump);
    if (!entry) {
      if (bump !== "patch") throw emptyNotesError(bump, `[${v}]`);
      return { changelogMd, changelogJson, promoted: false, alreadyPromoted: true };
    }
    return { changelogMd, changelogJson: prependChangelogJson(changelogJson, entry), promoted: true, entry };
  }
  // [Unreleased] describes the NEXT release. Filing it under an older version
  // (an explicit resume of 2.5.1 after 2.6.0 shipped) would put 2.6.x notes
  // above 2.6.0 under the wrong heading; refuse rather than misfile.
  const top = topReleasedVersion(changelogMd);
  if (top && compareVersions(v, top) < 0) {
    throw new Error(
      `refusing to promote [Unreleased] as ${v}: CHANGELOG.md already carries ${top} above it, so these notes belong to a later release`,
    );
  }
  // Notes for vX are [Unreleased] AS IT STOOD AT THE TAG. The current block
  // may already hold the next release's bullets (a resume cut after more
  // work landed); only the tagged copy separates the two.
  const current = parseUnreleased(changelogMd);
  const block = tagged && tagged.bullets.length > 0 ? tagged : current;
  const where = block === tagged ? `[Unreleased] at tag v${v}` : "[Unreleased]";
  if (block.bullets.length === 0) {
    if (bump !== "patch") throw emptyNotesError(bump, where);
    return { changelogMd, changelogJson, promoted: false };
  }
  if (stub) date = keptDate(promoted.date, date);
  const entry = webEntryFromBlock(block, v, date, bump);
  return {
    changelogMd: promoteChangelogMd(changelogMd, v, date, taggedChangelogMd),
    changelogJson: prependChangelogJson(changelogJson, entry),
    promoted: true,
    entry,
  };
}

/** The email body's lead sentence, by bump — a patch resend must not read "A minor release". */
export function releaseKindSentence(bump) {
  if (bump === "major") return "A major release";
  if (bump === "patch") return "A patch release";
  return "A minor release";
}

/** X.Y.0 with Y>0 → minor, X.0.0 → major, else patch. Used when no bump output exists (resume). */
export function bumpFromVersion(version) {
  const [, minor, patch] = version.replace(/^v/, "").split(".").map(Number);
  if (patch !== 0) return "patch";
  return minor === 0 ? "major" : "minor";
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Email rendering (notify-release.mjs). Minimal markdown → inline-styled HTML.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CODE_STYLE = "background:#2a2a33;padding:2px 6px;border-radius:4px;color:#00BFFF;font-family:ui-monospace,monospace;font-size:13px;";

/**
 * Minimal inline markdown. Code spans are split out FIRST and never see the
 * strong/link/issue passes, so `#123` or `[x](y)` inside backticks stays
 * literal — the issue linker used to run over the whole string after the
 * <code> was already emitted and linked text inside it.
 */
function inline(s) {
  return String(s)
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return `<code style="${CODE_STYLE}">${escapeHtml(part.slice(1, -1))}</code>`;
      }
      let out = escapeHtml(part);
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#F0F0F2;">$1</strong>');
      out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#00BFFF;text-decoration:none;">$1</a>');
      // Link bare `#N` only OUTSIDE anchors already emitted above — a
      // `[see #12](url)` link would otherwise nest an <a> inside its <a>.
      out = out
        .split(/(<a [^>]*>[\s\S]*?<\/a>)/)
        .map((seg, i) =>
          i % 2
            ? seg
            : seg.replace(/(^|[\s(])#(\d+)\b/g, (_, pre, n) => `${pre}<a href="https://github.com/rhinocap/raven-mcp/issues/${n}" style="color:#00BFFF;text-decoration:none;">#${n}</a>`),
        )
        .join("");
      return out;
    })
    .join("");
}

/**
 * Render a notes body. A bullet's continuation paragraphs (indented two or
 * more spaces) stay inside its <li>; blank lines between bullets do not
 * close the list; the "Raven vX — bump release" title line is skipped
 * because the email builds its own header.
 */
export function renderNotesHtml(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  let liOpen = false;
  const closeLi = () => {
    if (liOpen) {
      html += "</li>";
      liOpen = false;
    }
  };
  const close = () => {
    closeLi();
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const h3 = line.match(/^###\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    const continuation = liOpen && /^\s{2,}\S/.test(rawLine);
    if (h3) {
      close();
      html += `<div style="color:#00BFFF;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:24px 0 8px;">${escapeHtml(h3[1])}</div>`;
    } else if (li) {
      if (!inList) {
        html += '<ul style="margin:0;padding-left:20px;color:#9498A0;line-height:1.7;">';
        inList = true;
      }
      closeLi();
      html += `<li style="margin-bottom:8px;">${inline(li[1])}`;
      liOpen = true;
    } else if (continuation) {
      html += `<p style="margin:8px 0 0;">${inline(line)}</p>`;
    } else if (line === "" || /^<!--.*-->$/.test(line)) {
      // Blank lines separate multi-paragraph bullets; the list stays open.
    } else if (/^\*\*Install:\*\*/.test(line) || /^\*\*Claude Desktop:\*\*/.test(line)) {
      close();
      html += `<p style="color:#9498A0;font-size:14px;margin:12px 0;">${inline(line)}</p>`;
    } else if (/^Raven v\d+\.\d+\.\d+ — (major|minor|patch) release$/.test(line)) {
      // skip the title line (exactly the one releaseNotesFor emits) — the
      // email builds its own header; a bullet-less prose line that merely
      // mentions "Raven v3 release" must still render.
    } else {
      close();
      html += `<p style="color:#9498A0;margin:12px 0;">${inline(line)}</p>`;
    }
  }
  close();
  return html;
}
