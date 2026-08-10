#!/usr/bin/env node
// Build site/changelog.html from GitHub Releases.
// Runs in the release workflow after a new release is cut, and also on demand:
//   GH_TOKEN=... node scripts/build-changelog.mjs
//
// Strategy: static generation. No runtime API calls from visitor browsers.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "changelog.html");
const MAX_RELEASES = 30;

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: ROOT }).trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Minimal markdown → HTML for release-note bodies: headings, lists, inline code,
// bold, and auto-linked PR/issue references like #123.
function renderBody(md, repo) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    const close = () => {
      if (inList) {
        html += "</ul>\n";
        inList = false;
      }
    };
    if (h3) {
      close();
      html += `<h3>${inline(h3[1])}</h3>\n`;
    } else if (h2) {
      close();
      html += `<h4>${inline(h2[1])}</h4>\n`;
    } else if (li) {
      if (!inList) {
        html += "<ul>\n";
        inList = true;
      }
      html += `<li>${inline(li[1])}</li>\n`;
    } else if (line === "") {
      close();
      html += "\n";
    } else {
      close();
      html += `<p>${inline(line)}</p>\n`;
    }
  }
  if (inList) html += "</ul>\n";
  return html;

  function inline(s) {
    let out = escapeHtml(s);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    out = out.replace(/(^|\s)#(\d+)\b/g, (_, pre, n) => `${pre}<a href="https://github.com/${repo}/issues/${n}">#${n}</a>`);
    return out;
  }
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function bumpKind(current, previous) {
  if (!previous) return "initial";
  const [a1, b1] = current.split(".").map(Number);
  const [a2, b2] = previous.split(".").map(Number);
  if (a1 !== a2) return "major";
  if (b1 !== b2) return "minor";
  return "patch";
}

let repo = "rhinocap/raven-mcp";
try {
  repo = sh(`gh repo view --json nameWithOwner --jq .nameWithOwner`);
} catch {}

// The `gh release list --json` field set doesn't include body or url.
// Use the REST API directly — it returns everything in one call.
let releases = [];
try {
  const raw = sh(`gh api "repos/${repo}/releases?per_page=${MAX_RELEASES}"`);
  releases = JSON.parse(raw)
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => ({
      tagName: r.tag_name,
      name: r.name,
      publishedAt: r.published_at,
      url: r.html_url,
      body: r.body || "",
    }))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
} catch (err) {
  console.warn("No GitHub releases yet or gh not available:", err.message);
}

const cards = releases
  .map((r, i) => {
    const version = r.tagName.replace(/^v/, "");
    const prev = releases[i + 1]?.tagName?.replace(/^v/, "");
    const kind = bumpKind(version, prev);
    const badgeClass = `badge badge-${kind}`;
    return `
    <article class="release">
      <header class="release-head">
        <h2>v${escapeHtml(version)}</h2>
        <span class="${badgeClass}">${kind}</span>
        <time datetime="${escapeHtml(r.publishedAt)}">${fmtDate(r.publishedAt)}</time>
      </header>
      <div class="release-body">
        ${renderBody(r.body || "_No notes for this release._", repo)}
      </div>
      <footer class="release-foot">
        <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">View on GitHub &rarr;</a>
      </footer>
    </article>`;
  })
  .join("\n");

const empty = `
    <div class="empty">
      <h2>The first release is on its way.</h2>
      <p>Raven ships a new version every Friday with whatever knowledge landed that week. Check back soon.</p>
    </div>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Changelog — Raven MCP</title>
  <meta name="description" content="What's new in Raven MCP. Weekly releases with new design principles, patterns, tokens, and fixes.">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <meta property="og:title" content="Changelog — Raven MCP">
  <meta property="og:description" content="Every release. Every new principle. Every fix.">
  <meta property="og:image" content="https://ravenmcp.ai/assets/og-image.jpg">
  <style>
    @font-face {
      font-family: "Untitled Sans";
      src: url("/assets/fonts/untitled-sans-regular.woff2") format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Untitled Sans";
      src: url("/assets/fonts/untitled-sans-medium.woff2") format("woff2");
      font-weight: 500 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Untitled Sans";
      src: url("/assets/fonts/untitled-sans-bold.woff2") format("woff2");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Untitled Sans";
      src: url("/assets/fonts/untitled-sans-black.otf") format("opentype");
      font-weight: 800 900;
      font-style: normal;
      font-display: swap;
    }
    :root {
      --bg-base: #1a1a22;
      --bg-surface: #212129;
      --bg-raised: #2a2a33;
      --bg-accent-subtle: rgba(0, 191, 255, 0.06);
      --border: rgba(255, 255, 255, 0.06);
      --border-strong: rgba(255, 255, 255, 0.1);
      --border-accent: rgba(0, 191, 255, 0.3);
      --text-primary: #F0F0F2;
      --text-secondary: #9498A0;
      --text-tertiary: #5C5F68;
      --text-accent: #00BFFF;
      --accent-blue: #00BFFF;
      --accent-green: #00E676;
      --accent-orange: #FFAB40;
      --font-body: "Untitled Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-mono: ui-monospace, "SF Mono", "Cascadia Code", monospace;
      --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
      --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
      --space-12: 48px; --space-16: 64px; --space-20: 80px;
      --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px;
      --nav-height: 64px;
      --max-width: 880px;
    }
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--font-body);
      background: var(--bg-base);
      color: var(--text-primary);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      max-width: var(--max-width);
      margin: 0 auto;
      padding: calc(var(--nav-height) + var(--space-16)) clamp(16px, 4vw, 24px) var(--space-20);
    }
    .hero h1 {
      font-size: clamp(32px, 5vw, 48px);
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: var(--space-3);
    }
    .hero .accent { color: var(--text-accent); }
    .hero p {
      font-size: 17px;
      color: var(--text-secondary);
      max-width: 560px;
      margin-bottom: var(--space-16);
    }
    .release {
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg);
      padding: var(--space-8);
      margin-bottom: var(--space-6);
    }
    .release-head {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
      flex-wrap: wrap;
      margin-bottom: var(--space-5);
      padding-bottom: var(--space-5);
      border-bottom: 1px solid var(--border);
    }
    .release-head h2 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.01em;
      font-family: var(--font-mono);
    }
    .release-head time {
      color: var(--text-tertiary);
      font-size: 14px;
      margin-left: auto;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .badge-major {
      background: rgba(255, 171, 64, 0.12);
      color: var(--accent-orange);
      border: 1px solid rgba(255, 171, 64, 0.3);
    }
    .badge-minor {
      background: rgba(0, 230, 118, 0.1);
      color: var(--accent-green);
      border: 1px solid rgba(0, 230, 118, 0.3);
    }
    .badge-patch, .badge-initial {
      background: var(--bg-accent-subtle);
      color: var(--text-accent);
      border: 1px solid var(--border-accent);
    }
    .release-body h3 {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
      margin-top: var(--space-5);
      margin-bottom: var(--space-3);
    }
    .release-body h3:first-child { margin-top: 0; }
    .release-body h4 {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: var(--space-5);
      margin-bottom: var(--space-3);
    }
    .release-body p {
      color: var(--text-secondary);
      margin-bottom: var(--space-3);
      font-size: 15px;
    }
    .release-body ul {
      list-style: none;
      margin-bottom: var(--space-4);
    }
    .release-body li {
      color: var(--text-secondary);
      font-size: 15px;
      padding: 4px 0 4px 18px;
      position: relative;
    }
    .release-body li::before {
      content: "";
      position: absolute;
      left: 4px;
      top: 14px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--text-tertiary);
    }
    .release-body code {
      font-family: var(--font-mono);
      font-size: 13px;
      background: var(--bg-raised);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--text-accent);
    }
    .release-body a {
      color: var(--text-accent);
      text-decoration: none;
    }
    .release-body a:hover { text-decoration: underline; }
    .release-foot {
      margin-top: var(--space-5);
      padding-top: var(--space-5);
      border-top: 1px solid var(--border);
    }
    .release-foot a {
      font-size: 13px;
      color: var(--text-tertiary);
      text-decoration: none;
      transition: color 0.2s;
    }
    .release-foot a:hover { color: var(--text-accent); }
    .empty {
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg);
      padding: var(--space-16) var(--space-8);
      text-align: center;
    }
    .empty h2 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: var(--space-3);
    }
    .empty p {
      color: var(--text-secondary);
      max-width: 420px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <script src="assets/nav.js"></script>
  <raven-nav></raven-nav>

  <main class="wrap">
    <header class="hero">
      <h1>What's new in <span class="accent">Raven</span></h1>
      <p>We ship a new release every Friday with fresh design knowledge, new patterns, and fixes. Follow along here.</p>
    </header>

    ${releases.length ? cards : empty}
  </main>

  <script src="assets/footer.js"></script>
  <raven-footer></raven-footer>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`✓ Wrote ${releases.length} release(s) to ${OUT}`);
