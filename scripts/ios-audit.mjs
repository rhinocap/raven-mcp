#!/usr/bin/env node
// ios-audit — point RavenMCP at an iOS/SwiftUI project and audit everything.
//
// Discovers the SwiftUI source, Info.plist, PRIVACY.md, entitlements, and the
// AccentColor asset, then runs audit_swiftui (per view file), audit_ios_privacy
// (whole app), and — if you hand it a captured snapshot — audit_ios_screen.
// Aggregates into one graded report.
//
// Usable from a plain terminal, from Claude Code, or from Codex. It speaks the
// same MCP stdio protocol the agents use, so it exercises the real server.
//
// Usage:
//   node scripts/ios-audit.mjs <project-dir> [--snapshot snap.json] [--md report.md] [--strict]
//
// Examples:
//   node scripts/ios-audit.mjs /Users/accunliffe/projects/macro
//   node scripts/ios-audit.mjs ../macro --snapshot /tmp/onboarding.json --md /tmp/macro-audit.md

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSnapshotWiring } from "../dist/ios-capture.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, "dist", "index.js");

// ── args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const projectDir = argv.find((a) => !a.startsWith("--"));
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const snapshotPath = opt("--snapshot");
const mdPath = opt("--md");
const strict = argv.includes("--strict");

if (!projectDir || !existsSync(projectDir)) {
  console.error("Usage: node scripts/ios-audit.mjs <project-dir> [--snapshot snap.json] [--md report.md] [--strict]");
  process.exit(2);
}

// ── discovery ───────────────────────────────────────────────────────
const SKIP = new Set([".git", "build", "DerivedData", "Pods", ".build", "node_modules", ".swiftpm"]);
function walk(dir, hits = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, hits);
    else hits.push(p);
  }
  return hits;
}

const allFiles = walk(projectDir);
const swiftFiles = allFiles.filter((f) => f.endsWith(".swift") && !/Tests?\//.test(f));
const viewFiles = swiftFiles.filter((f) => {
  const s = readFileSync(f, "utf8");
  return /import SwiftUI/.test(s) && /:\s*(?:some\s+)?View\b|struct\s+\w+\s*:\s*View/.test(s);
});
// Info.plist: prefer the shortest path (the app target's, not a test/extension's).
const plists = allFiles.filter((f) => basename(f) === "Info.plist").sort((a, b) => a.length - b.length);
const infoPlist = plists[0] || null;
const privacyMd = allFiles.find((f) => /privacy\.md$/i.test(f)) || null;
const entitlements = allFiles.find((f) => f.endsWith(".entitlements")) || null;
const accentJson = allFiles.find((f) => /AccentColor\.colorset\/Contents\.json$/.test(f)) || null;

const rel = (f) => (f ? relative(projectDir, f) : "(none)");
const read = (f) => (f ? readFileSync(f, "utf8") : null);

console.log(`\n📱 RavenMCP iOS audit — ${projectDir}`);
console.log(`   ${swiftFiles.length} Swift files (${viewFiles.length} SwiftUI views) · Info.plist: ${rel(infoPlist)} · PRIVACY.md: ${rel(privacyMd)} · AccentColor: ${rel(accentJson)}`);

// ── connect ─────────────────────────────────────────────────────────
const transport = new StdioClientTransport({
  command: "node", args: [SERVER], cwd: ROOT,
  env: { ...process.env, RAVEN_NO_UPDATE_CHECK: "1", RAVEN_NO_DAILY_DIGEST: "1", RAVEN_NO_USAGE_LOG: "1" }
});
const client = new Client({ name: "ios-audit", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);
const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content?.find((b) => b.type === "text")?.text || "{}");
};

const md = [`# RavenMCP iOS audit — \`${basename(projectDir)}\``, "", `_${new Date().toISOString()}_`, ""];
const fmtIssues = (arr) => (arr || []).map((i) => `- **${i.rule}** — ${i.message}\n  - _fix:_ ${i.fix}`).join("\n");

// ── 1. audit_swiftui per view file ──────────────────────────────────
console.log(`\n── audit_swiftui (per SwiftUI view) ──`);
md.push("## audit_swiftui");
const accentContents = read(accentJson) || undefined;
let swErr = 0, swWarn = 0;
const swRows = [];
for (const f of viewFiles) {
  const a = await call("audit_swiftui", { source: read(f), accent_color_contents: accentContents, strict });
  swErr += a.errors.length; swWarn += a.warnings.length;
  const r = [...a.errors.map((e) => e.rule), ...a.warnings.map((w) => w.rule)];
  swRows.push({ file: rel(f), grade: a.grade, score: a.score, n: a.errors.length + a.warnings.length, rules: r });
  const flag = a.errors.length ? "🔴" : a.warnings.length ? "🟡" : "🟢";
  console.log(`   ${flag} ${a.grade} ${String(a.score).padStart(3)}  ${rel(f)}${r.length ? "  — " + Array.from(new Set(r)).join(", ") : ""}`);
  if (a.errors.length || a.warnings.length) {
    md.push(`### \`${rel(f)}\` — ${a.grade} (${a.score})`, fmtIssues(a.errors), fmtIssues(a.warnings), "");
  }
}
console.log(`   → ${viewFiles.length} views · ${swErr} errors · ${swWarn} warnings`);

// ── 2. audit_ios_privacy (whole app) ────────────────────────────────
console.log(`\n── audit_ios_privacy (whole app) ──`);
md.push("## audit_ios_privacy");
let priv = null;
if (infoPlist) {
  const allSwift = swiftFiles.map(read).join("\n");
  priv = await call("audit_ios_privacy", {
    info_plist: read(infoPlist), privacy_md: read(privacyMd) || undefined,
    entitlements: read(entitlements) || undefined, source: allSwift
  });
  const flag = priv.errors.length ? "🔴" : priv.warnings.length ? "🟡" : "🟢";
  console.log(`   ${flag} ${priv.grade} ${priv.score} — ${priv.summary}`);
  for (const i of [...priv.errors, ...priv.warnings]) console.log(`      ${i.severity === "error" ? "✗" : "•"} ${i.rule}`);
  md.push(`**${priv.grade} (${priv.score})** — ${priv.summary}`, "", fmtIssues(priv.errors), fmtIssues(priv.warnings), "");
} else {
  console.log("   ⚠︎ no Info.plist found — skipped");
  md.push("_No Info.plist found — skipped._", "");
}

// ── 3. audit_ios_screen (only with a captured snapshot) ─────────────
console.log(`\n── audit_ios_screen (rendered) ──`);
md.push("## audit_ios_screen");
let screen = null;
if (snapshotPath && existsSync(snapshotPath)) {
  const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
  screen = await call("audit_ios_screen", snap);
  const flag = screen.errors.length ? "🔴" : screen.warnings.length ? "🟡" : "🟢";
  console.log(`   ${flag} ${screen.grade} ${screen.score} — ${screen.summary} (${screen.elements_analyzed} elements)`);
  for (const i of [...screen.errors, ...screen.warnings]) console.log(`      ${i.severity === "error" ? "✗" : "•"} ${i.rule}`);
  md.push(`**${screen.grade} (${screen.score})** — ${screen.summary}`, "", fmtIssues(screen.errors), fmtIssues(screen.warnings), "");
} else {
  console.log("   ⏭  no --snapshot supplied — needs a captured accessibility/view-hierarchy JSON (see scripts/AccessibilitySnapshot.swift)");
  md.push("_No snapshot supplied. Capture one with an XCUITest (scripts/AccessibilitySnapshot.swift) and re-run with `--snapshot`._", "");

  // Preflight: surface AccessibilitySnapshot/UITest wiring gaps before the user
  // burns build iterations setting up e2e capture. Warn-only — never bricks the
  // harness. We can cheaply resolve hasSnapshotSwift; full pbxproj parsing for
  // testTargets is deferred (gatherWiringFacts), so we pass [] and let
  // checkSnapshotWiring emit the actionable "wire into a hosted UITest target" guidance.
  try {
    const hasSnapshotSwift = existsSync(join(projectDir, "scripts/AccessibilitySnapshot.swift")) ||
      allFiles.some((f) => basename(f) === "AccessibilitySnapshot.swift");
    const pre = checkSnapshotWiring({ hasSnapshotSwift, testTargets: [] });
    if (!pre.ready) {
      console.log("   🔧 e2e-capture preflight (not yet wired):");
      for (const g of pre.guidance) console.log(`      • ${g}`);
      md.push("**e2e-capture preflight** — to run live AccessibilitySnapshot capture, wire:", "", ...pre.guidance.map((g) => `- ${g}`), "");
    }
  } catch (e) {
    console.log(`   ⚠  preflight skipped: ${e.message}`);
  }
}

// ── summary ─────────────────────────────────────────────────────────
const totalErr = swErr + (priv?.errors.length || 0) + (screen?.errors.length || 0);
const totalWarn = swWarn + (priv?.warnings.length || 0) + (screen?.warnings.length || 0);
console.log(`\n══════════════════════════════════════════`);
console.log(`  TOTAL: ${totalErr} errors · ${totalWarn} warnings across audit_swiftui + audit_ios_privacy${screen ? " + audit_ios_screen" : ""}`);
console.log(`══════════════════════════════════════════`);
md.unshift(`> **${totalErr} errors · ${totalWarn} warnings**`, "");

if (mdPath) { writeFileSync(mdPath, md.join("\n")); console.log(`\n📝 report written → ${mdPath}`); }

await client.close();
process.exit(totalErr > 0 ? 1 : 0);
