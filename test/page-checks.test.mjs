/**
 * page-checks.test.mjs
 *
 * Acceptance tests for the tokens/svg-hardcoded-color check inside
 * runPageChecks (dist/page-checks.js). Runs after `npm run build`.
 *
 * Usage:
 *   node --test test/page-checks.test.mjs
 *   npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPageChecks = path.resolve(__dirname, "../dist/page-checks.js");

// ── Load built module ────────────────────────────────────────────────────────

let runPageChecks;
try {
  ({ runPageChecks } = await import(distPageChecks));
} catch (err) {
  const msg = `dist/page-checks.js not found — run \`npm run build\` first. (${err.message})`;
  test("page-checks module available", (t) => { t.skip(msg); });
  process.exit(0);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findIssue(res, rule) {
  return res.issues.find((i) => i.rule === rule);
}

function hasPass(res, substr) {
  return res.passes.some((p) => p.includes(substr));
}

/**
 * Minimal valid HTML wrapper that satisfies the other structural checks
 * (lang, viewport, title, flex-wrap) so those don't produce noise.
 * The caller provides only the <body> inner content.
 */
function wrapHtml(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test page</title>
  <style>
    :root { --c: #fff; }
    .wrap { display: flex; flex-wrap: wrap; }
    .wrap > * { clamp(16px, 4vw, 24px); }
  </style>
</head>
<body>
  <div class="wrap">
${bodyContent}
  </div>
</body>
</html>`;
}

// ── Test 1: warns on a hardcoded fill hex value ──────────────────────────────

test("runPageChecks svg-color: warns on hardcoded fill hex (#3b82f6)", () => {
  const html = wrapHtml(`<svg viewBox="0 0 24 24"><path fill="#3b82f6" d="M0 0"/></svg>`);
  const res = runPageChecks(html);

  // shape
  assert.ok(Array.isArray(res.passes), "res.passes is an array");
  assert.ok(Array.isArray(res.issues), "res.issues is an array");

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.ok(issue !== undefined, "tokens/svg-hardcoded-color issue is present");
  assert.strictEqual(issue.severity, "warning", "severity is 'warning'");
  assert.ok(
    issue.message.includes("#3b82f6"),
    `message includes '#3b82f6' (got: ${issue.message})`
  );
  // count starts the message — "1 inline SVG …"
  assert.ok(
    issue.message.startsWith("1 "),
    `message starts with '1 ' (got: ${issue.message})`
  );
});

// ── Test 2: passes on currentColor / var(--token) — no warning ──────────────

test("runPageChecks svg-color: no warning for currentColor and var(--token)", () => {
  const html = wrapHtml(
    `<svg viewBox="0 0 24 24"><path fill="currentColor"/><circle stroke="var(--icon)"/></svg>`
  );
  const res = runPageChecks(html);

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.strictEqual(
    issue,
    undefined,
    "no tokens/svg-hardcoded-color issue when using currentColor/var"
  );
  assert.ok(
    hasPass(res, "0 hardcoded"),
    "a pass string mentions '0 hardcoded'"
  );
});

// ── Test 3: exempt values are not counted ────────────────────────────────────

test("runPageChecks svg-color: exemptions (none, transparent, inherit, url, var) not counted", () => {
  const html = wrapHtml(`
    <svg viewBox="0 0 100 100">
      <path fill="none"/>
      <path stroke="none"/>
      <circle fill="transparent"/>
      <rect fill="inherit"/>
      <path fill="url(#grad)"/>
      <circle stroke="var(--c)"/>
    </svg>
  `);
  const res = runPageChecks(html);

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.strictEqual(
    issue,
    undefined,
    "no tokens/svg-hardcoded-color issue for exempt values"
  );
});

// ── Test 4: rgb() in attr + hex in inline style are both counted ─────────────

test("runPageChecks svg-color: rgb() attribute and inline style fill both counted (count = 2)", () => {
  const html = wrapHtml(
    `<svg viewBox="0 0 24 24"><path stroke="rgb(0,0,0)"/><rect style="fill:#fff"/></svg>`
  );
  const res = runPageChecks(html);

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.ok(issue !== undefined, "tokens/svg-hardcoded-color issue is present");
  assert.ok(
    issue.message.startsWith("2 "),
    `count is 2 — message starts with '2 ' (got: ${issue.message})`
  );
  assert.strictEqual(issue.severity, "warning", "severity is 'warning'");
});

// ── Test 5a: hex outside SVG (in a plain CSS rule) is not counted ─────────────

test("runPageChecks svg-color: hex color outside <svg> (in CSS) does not trigger svg-color warning", () => {
  // A page that has a <style> hex but no SVG — only custom-props / CSS, no inline SVG
  const html = wrapHtml(`<p style="color: red">hello</p>`);
  const res = runPageChecks(html);

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.strictEqual(
    issue,
    undefined,
    "no tokens/svg-hardcoded-color issue when there is no SVG"
  );
});

// ── Test 5b: fill="..." text appearing OUTSIDE <svg> is not counted ──────────

test("runPageChecks svg-color: fill=#hex in body text outside <svg> is not counted", () => {
  // SVG uses currentColor (safe); body text contains 'fill="#123456"' as literal text
  const html = wrapHtml(`
    <svg viewBox="0 0 24 24"><path fill="currentColor"/></svg>
    <p>The attribute fill="#123456" is documented here.</p>
  `);
  const res = runPageChecks(html);

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.strictEqual(
    issue,
    undefined,
    "fill='#hex' in body text outside SVG does not trigger svg-color warning"
  );
  // The currentColor SVG attr should earn a pass
  assert.ok(
    hasPass(res, "0 hardcoded"),
    "pass string mentions '0 hardcoded'"
  );
});

// ── Test 6: dedup — same value repeated 3× is counted 3× but listed once ────

test("runPageChecks svg-color: same hardcoded value repeated 3× — count=3, value listed once", () => {
  const html = wrapHtml(
    `<svg viewBox="0 0 24 24">
      <path fill="#111"/>
      <circle fill="#111"/>
      <rect fill="#111"/>
    </svg>`
  );
  const res = runPageChecks(html);

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.ok(issue !== undefined, "tokens/svg-hardcoded-color issue is present");
  assert.ok(
    issue.message.startsWith("3 "),
    `count is 3 — message starts with '3 ' (got: ${issue.message})`
  );
  // '#111' appears exactly once in the message (de-duplicated in the value list)
  const occurrences = issue.message.split("#111").length - 1;
  assert.strictEqual(
    occurrences,
    1,
    `'#111' appears exactly once in the message (de-duped) — found ${occurrences} times`
  );
});

// ── Test 6b: >8 distinct values — count is full total, message truncated ─────

test("runPageChecks svg-color: >8 distinct hardcoded values — full count, message truncated to 8", () => {
  const colors = ["#001", "#002", "#003", "#004", "#005", "#006", "#007", "#008", "#009"];
  // 9 distinct values
  const paths = colors.map((c) => `<path fill="${c}"/>`).join("\n      ");
  const html = wrapHtml(`<svg viewBox="0 0 24 24">\n      ${paths}\n    </svg>`);
  const res = runPageChecks(html);

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.ok(issue !== undefined, "tokens/svg-hardcoded-color issue is present");
  assert.ok(
    issue.message.startsWith("9 "),
    `count reflects full total of 9 — message starts with '9 ' (got: ${issue.message})`
  );
  // The message value list is capped at 8 — check that #009 (the 9th) does NOT appear
  // (the exact slice depends on Set ordering, but at most 8 values are emitted)
  const listMatch = issue.message.match(/\(([^)]+)\)/);
  assert.ok(listMatch, "message contains a parenthesised value list");
  const listedValues = listMatch[1].split(",").map((s) => s.trim());
  assert.ok(
    listedValues.length <= 8,
    `at most 8 distinct values listed (got ${listedValues.length}): ${listMatch[1]}`
  );
});

// ── Test 7: no SVG → no finding, result shape intact ────────────────────────

test("runPageChecks svg-color: page with no SVG produces no svg-color finding; result shape intact", () => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No SVG page</title>
  <style>:root { --c: #fff; }</style>
</head>
<body><p>hi</p></body>
</html>`;

  const res = runPageChecks(html);

  assert.ok(Array.isArray(res.passes), "res.passes is an array");
  assert.ok(Array.isArray(res.issues), "res.issues is an array");

  const issue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.strictEqual(
    issue,
    undefined,
    "no tokens/svg-hardcoded-color issue when the page has no SVG"
  );
});

// ── Test 8: full page with safe SVG icon — no svg-color, other rules intact ──

test("runPageChecks svg-color: normal full page with currentColor icon — no warning, engine still runs", () => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Design system page</title>
  <style>
    :root {
      --color-primary: #1a56db;
      --space-4: 16px;
    }
    body { font-size: 16px; font-weight: 400; line-height: 1.5; }
    .wrap { display: flex; flex-wrap: wrap; gap: 16px; padding: clamp(16px, 4vw, 24px); }
    .btn { padding: 12px 24px; }
    h1 { font-size: 32px; }
    h2 { font-size: 25px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Hello</h1>
    <h2>World</h2>
    <button class="btn">Click me</button>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/>
    </svg>
    <img src="image.png" alt="A descriptive label">
  </div>
</body>
</html>`;

  const res = runPageChecks(html);

  assert.ok(Array.isArray(res.passes), "res.passes is an array");
  assert.ok(Array.isArray(res.issues), "res.issues is an array");

  // No svg-hardcoded-color warning
  const svgIssue = findIssue(res, "tokens/svg-hardcoded-color");
  assert.strictEqual(
    svgIssue,
    undefined,
    "no tokens/svg-hardcoded-color issue for a currentColor SVG icon"
  );

  // Engine still ran other checks — combined output is non-empty
  assert.ok(
    res.passes.length + res.issues.length > 0,
    "the engine produced at least one pass or issue from other rules"
  );

  // The svg currentColor path should earn a pass
  assert.ok(
    hasPass(res, "0 hardcoded"),
    "a pass string mentions '0 hardcoded'"
  );
});
