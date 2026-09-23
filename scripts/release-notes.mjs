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
  return { body, meta, bullets: leadParagraphs(body), sections: sectionHeadings(body) };
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
 * Lead paragraph of every top-level bullet, in order. A continuation
 * paragraph (indented by two or more spaces) belongs to the bullet above it
 * and is not returned; the web entry carries leads only.
 */
function leadParagraphs(body) {
  const out = [];
  let current = null;
  for (const line of body.split("\n")) {
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (current !== null) out.push(current);
      current = li[1].trim();
    } else if (current !== null && /^\s{2,}\S/.test(line) && !/^\s{2,}[-*]\s/.test(line)) {
      // Continuation paragraph — stop extending the lead.
      out.push(current);
      current = null;
    } else if (current !== null && line.trim() === "") {
      out.push(current);
      current = null;
    } else if (current !== null && /^\S/.test(line) && !/^###/.test(line)) {
      // Soft-wrapped lead line.
      current += " " + line.trim();
    } else if (current !== null) {
      out.push(current);
      current = null;
    }
  }
  if (current !== null) out.push(current);
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

/**
 * The GitHub Release body and the email body for one version.
 * Source: the promoted `## [version]` block when CHANGELOG.md already carries
 * it (a resume after the changelog commit), else `[Unreleased]`.
 * Throws when a minor/major release has nothing curated to say — a release
 * with no notes is a release nobody wrote up, and the email must not go out.
 * "Nothing" is judged on bullets, not on text: `### Added` with no items
 * under it is a stub, not notes.
 */
export function releaseNotesFor(version, bump, changelogMd) {
  const v = String(version).replace(/^v/, "");
  const promoted = parseReleaseBlock(changelogMd, v);
  const block = promoted && promoted.bullets.length > 0 ? promoted : parseUnreleased(changelogMd);
  const where = block === promoted ? `[${v}]` : "[Unreleased]";
  let sections = block.body;
  if (block.bullets.length === 0) {
    if (bump !== "patch") throw emptyNotesError(bump, where);
    sections = MAINTENANCE_BODY;
  }
  return [`Raven v${v} — ${bump} release`, "", sections, "", ...INSTALL_LINES].join("\n");
}

/** Move `[Unreleased]` under `## [version] - date`, leaving an empty block above. Idempotent. */
export function promoteChangelogMd(md, version, date) {
  md = normalize(md);
  const v = String(version).replace(/^v/, "");
  if (parseReleaseBlock(md, v)) return md;
  const { body, bullets } = parseUnreleased(md);
  if (bullets.length === 0) return md;
  const match = UNRELEASED_HEADING.exec(md);
  const start = match.index + match[0].length;
  const rest = md.slice(start);
  const next = RELEASE_HEADING.exec(rest);
  const tail = next ? rest.slice(next.index) : "";
  return `${md.slice(0, match.index)}## [Unreleased]\n\n## [${v}] - ${date}\n\n${body}\n\n${tail}`;
}

const KIND_BY_BUMP = { major: "new", minor: "feature", patch: "fix" };

/** Build the web/data/changelog.json entry for this release from `[Unreleased]`. */
export function webEntryFromUnreleased(changelogMd, version, date, bump) {
  return webEntryFromBlock(parseUnreleased(changelogMd), version, date, bump);
}

/** Same, from an already-parsed block (the promoted `## [version]` block on a half-done resume). */
export function webEntryFromBlock(block, version, date, bump) {
  const { meta, bullets } = block;
  const changes = bullets.map(stripMarkdown).filter(Boolean);
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

function defaultTitle(lead) {
  const sentence = lead.split(/(?<=\.)\s/)[0].replace(/\.$/, "");
  return sentence.split(":")[0].trim().slice(0, 80);
}

/** Prepend an entry to the parsed changelog.json. Idempotent by version. */
export function prependChangelogJson(json, entry) {
  if (!entry) return json;
  if (json.releases.some((r) => r.version === entry.version)) return json;
  return { ...json, releases: [entry, ...json.releases] };
}

/** Both files in one pass; returns the new contents (unchanged when nothing to promote). */
export function promoteChangelog({ changelogMd, changelogJson, version, bump, date }) {
  // A resume re-runs this step after the tag exists and the previous run's
  // changelog commit has emptied [Unreleased]. Recognise the version heading
  // BEFORE asking whether there are notes to promote, or a resume of a minor
  // release fails on "[Unreleased] is empty" — which is exactly what a
  // completed promotion leaves behind.
  const v = String(version).replace(/^v/, "");
  const promoted = parseReleaseBlock(changelogMd, v);
  const jsonDone = (changelogJson.releases || []).some((r) => r.version === `v${v}`);
  if (promoted && jsonDone) return { changelogMd, changelogJson, promoted: false, alreadyPromoted: true };
  if (promoted) {
    // Half-promoted: the previous run wrote CHANGELOG.md and died before
    // changelog.json (or the commit). Back-fill the web entry from the
    // promoted block — [Unreleased] is empty now, or holds the NEXT release.
    const entry = webEntryFromBlock(promoted, v, promoted.date || date, bump);
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
  const block = parseUnreleased(changelogMd);
  if (block.bullets.length === 0) {
    if (bump !== "patch") throw emptyNotesError(bump, "[Unreleased]");
    return { changelogMd, changelogJson, promoted: false };
  }
  const entry = webEntryFromBlock(block, v, date, bump);
  return {
    changelogMd: promoteChangelogMd(changelogMd, v, date),
    changelogJson: prependChangelogJson(changelogJson, entry),
    promoted: true,
    entry,
  };
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
      out = out.replace(/(^|[\s(])#(\d+)\b/g, (_, pre, n) => `${pre}<a href="https://github.com/rhinocap/raven-mcp/issues/${n}" style="color:#00BFFF;text-decoration:none;">#${n}</a>`);
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
    } else if (line.startsWith("Raven v") && line.includes("release")) {
      // skip the title line — we build our own header
    } else {
      close();
      html += `<p style="color:#9498A0;margin:12px 0;">${inline(line)}</p>`;
    }
  }
  close();
  return html;
}
