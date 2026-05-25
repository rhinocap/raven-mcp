#!/usr/bin/env node
// rn-audit — point RavenMCP at a React Native / Expo project and audit it.
//
// Discovers the screens/components, app.json, and source, then runs audit_rn
// (per screen) and audit_ios_privacy (Expo app.json) and aggregates into one
// graded report. RN renders to native widgets, so once you capture a runtime
// accessibility snapshot you can also pass --snapshot to run audit_ios_screen.
//
// Usable from a plain terminal, Claude Code, or Codex.
//
// Usage:
//   node scripts/rn-audit.mjs <project-dir> [--snapshot snap.json] [--md report.md] [--strict]
//
// Example:
//   node scripts/rn-audit.mjs /Users/accunliffe/projects/blacksheep-ios --md /tmp/bs-audit.md

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, "dist", "index.js");

const argv = process.argv.slice(2);
const projectDir = argv.find((a) => !a.startsWith("--"));
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const snapshotPath = opt("--snapshot");
const mdPath = opt("--md");
const strict = argv.includes("--strict");

if (!projectDir || !existsSync(projectDir)) {
  console.error("Usage: node scripts/rn-audit.mjs <project-dir> [--snapshot snap.json] [--md report.md] [--strict]");
  process.exit(2);
}

// ── discovery ───────────────────────────────────────────────────────
const SKIP = new Set([".git", "node_modules", "ios", "android", ".expo", "dist", "build", "web-build", ".next"]);
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
const rnFiles = allFiles.filter((f) => /\.(tsx|jsx)$/.test(f));
// Screens/components that render UI (contain JSX + import react-native or expo)
const uiFiles = rnFiles.filter((f) => {
  const s = readFileSync(f, "utf8");
  return /from\s+['"](react-native|expo-router|react-native-safe-area-context)['"]|<View\b|<Text\b/.test(s);
});
const appJsonPath = ["app.json", "app.config.json"].map((n) => join(projectDir, n)).find(existsSync) || null;
const privacyMd = allFiles.find((f) => /privacy\.md$/i.test(f)) || null;

// Read app.json once to pull userInterfaceStyle (so audit_rn doesn't false-flag dark-only apps).
let colorScheme = "automatic";
if (appJsonPath) {
  try {
    const aj = JSON.parse(readFileSync(appJsonPath, "utf8"));
    const ui = (aj.expo || aj).userInterfaceStyle;
    if (ui === "light" || ui === "dark") colorScheme = ui;
  } catch { /* ignore */ }
}

const rel = (f) => (f ? relative(projectDir, f) : "(none)");
const read = (f) => (f ? readFileSync(f, "utf8") : null);

console.log(`\n⚛️  RavenMCP React Native audit — ${projectDir}`);
console.log(`   ${rnFiles.length} RN files (${uiFiles.length} UI) · app.json: ${rel(appJsonPath)} · userInterfaceStyle: ${colorScheme} · PRIVACY.md: ${rel(privacyMd)}`);

// ── connect ─────────────────────────────────────────────────────────
const transport = new StdioClientTransport({
  command: "node", args: [SERVER], cwd: ROOT,
  env: { ...process.env, RAVEN_NO_UPDATE_CHECK: "1", RAVEN_NO_DAILY_DIGEST: "1", RAVEN_NO_USAGE_LOG: "1" }
});
const client = new Client({ name: "rn-audit", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);
const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content?.find((b) => b.type === "text")?.text || "{}");
};

const md = [`# RavenMCP React Native audit — \`${basename(projectDir)}\``, "", `_${new Date().toISOString()}_`, ""];
const fmtIssues = (arr) => (arr || []).map((i) => `- **${i.rule}** — ${i.message}\n  - _fix:_ ${i.fix}`).join("\n");

// ── 1. audit_rn per UI file ─────────────────────────────────────────
console.log(`\n── audit_rn (per screen/component) ──`);
md.push("## audit_rn");
let rnErr = 0, rnWarn = 0;
for (const f of uiFiles) {
  const a = await call("audit_rn", { source: read(f), color_scheme: colorScheme, strict });
  rnErr += a.errors.length; rnWarn += a.warnings.length;
  const r = [...a.errors.map((e) => e.rule), ...a.warnings.map((w) => w.rule)];
  const flag = a.errors.length ? "🔴" : a.warnings.length ? "🟡" : "🟢";
  console.log(`   ${flag} ${a.grade} ${String(a.score).padStart(3)}  ${rel(f)}${r.length ? "  — " + Array.from(new Set(r)).join(", ") : ""}`);
  if (a.errors.length || a.warnings.length) md.push(`### \`${rel(f)}\` — ${a.grade} (${a.score})`, fmtIssues(a.errors), fmtIssues(a.warnings), "");
}
console.log(`   → ${uiFiles.length} UI files · ${rnErr} errors · ${rnWarn} warnings`);

// ── 2. audit_ios_privacy (Expo app.json) ────────────────────────────
console.log(`\n── audit_ios_privacy (Expo app.json) ──`);
md.push("## audit_ios_privacy");
let priv = null;
if (appJsonPath) {
  const allSrc = rnFiles.map(read).join("\n");
  priv = await call("audit_ios_privacy", { app_json: read(appJsonPath), privacy_md: read(privacyMd) || undefined, source: allSrc });
  const flag = priv.errors.length ? "🔴" : priv.warnings.length ? "🟡" : "🟢";
  console.log(`   ${flag} ${priv.grade} ${priv.score} — ${priv.summary}`);
  for (const i of [...priv.errors, ...priv.warnings]) console.log(`      ${i.severity === "error" ? "✗" : "•"} ${i.rule}`);
  md.push(`**${priv.grade} (${priv.score})** — ${priv.summary}`, "", fmtIssues(priv.errors), fmtIssues(priv.warnings), "");
} else {
  console.log("   ⚠︎ no app.json found — skipped");
  md.push("_No app.json found — skipped._", "");
}

// ── 3. audit_ios_screen (only with a captured snapshot) ─────────────
console.log(`\n── audit_ios_screen (rendered) ──`);
md.push("## audit_ios_screen");
let screen = null;
if (snapshotPath && existsSync(snapshotPath)) {
  screen = await call("audit_ios_screen", JSON.parse(readFileSync(snapshotPath, "utf8")));
  const flag = screen.errors.length ? "🔴" : screen.warnings.length ? "🟡" : "🟢";
  console.log(`   ${flag} ${screen.grade} ${screen.score} — ${screen.summary} (${screen.elements_analyzed} elements)`);
  for (const i of [...screen.errors, ...screen.warnings]) console.log(`      ${i.severity === "error" ? "✗" : "•"} ${i.rule}`);
  md.push(`**${screen.grade} (${screen.score})** — ${screen.summary}`, "", fmtIssues(screen.errors), fmtIssues(screen.warnings), "");
} else {
  console.log("   ⏭  no --snapshot supplied — RN renders native, so capture one with detox/XCUITest and pass --snapshot");
  md.push("_No snapshot supplied. RN renders to native widgets — capture an accessibility snapshot (detox / XCUITest) and re-run with `--snapshot`._", "");
}

// ── summary ─────────────────────────────────────────────────────────
const totalErr = rnErr + (priv?.errors.length || 0) + (screen?.errors.length || 0);
const totalWarn = rnWarn + (priv?.warnings.length || 0) + (screen?.warnings.length || 0);
console.log(`\n══════════════════════════════════════════`);
console.log(`  TOTAL: ${totalErr} errors · ${totalWarn} warnings across audit_rn + audit_ios_privacy${screen ? " + audit_ios_screen" : ""}`);
console.log(`══════════════════════════════════════════`);
md.unshift(`> **${totalErr} errors · ${totalWarn} warnings**`, "");

if (mdPath) { writeFileSync(mdPath, md.join("\n")); console.log(`\n📝 report written → ${mdPath}`); }

await client.close();
process.exit(totalErr > 0 ? 1 : 0);
