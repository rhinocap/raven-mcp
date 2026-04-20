#!/usr/bin/env node
// Daily digest agent. Runs at 18:00 local via launchd (see
// scripts/launchd/ai.ravenmcp.daily-digest.plist.template).
//
// Spawns the Raven MCP server, calls raven_reflect, writes a markdown
// digest to ~/.raven/daily-digest-YYYY-MM-DD.md, and fires a macOS
// notification so Andrew sees the summary at end of day.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIGEST_DIR = join(homedir(), ".raven");

function fmt2(n) { return String(n).padStart(2, "0"); }
function localDateKey(d = new Date()) {
  return d.getFullYear() + "-" + fmt2(d.getMonth() + 1) + "-" + fmt2(d.getDate());
}

function renderMarkdown(summary, dayKey) {
  const lines = [];
  lines.push(`# Raven daily digest — ${dayKey}`);
  lines.push("");
  lines.push(`Window: last 24 hours · ${summary.window.total_calls} total calls`);
  lines.push("");

  lines.push("## Tool usage");
  const toolRows = Object.entries(summary.tool_usage || {});
  if (toolRows.length === 0) lines.push("_No tools called._");
  else for (const [tool, count] of toolRows) lines.push(`- **${tool}** — ${count}`);
  lines.push("");

  if (summary.audit?.calls > 0) {
    lines.push("## Audit signal");
    lines.push(`- ${summary.audit.calls} audit runs · average score ${summary.audit.avg_score}/100`);
    const rw = Object.entries(summary.audit.recurring_warnings || {});
    if (rw.length) {
      lines.push("- Recurring warnings:");
      for (const [rule, n] of rw) lines.push(`  - \`${rule}\` — fired ${n}×`);
    }
    lines.push("");
  }

  if (summary.gap_hints?.length) {
    lines.push("## Likely knowledge gaps");
    for (const g of summary.gap_hints) {
      lines.push(`- \`${g.rule}\` fired **${g.fired_times}×** — ${g.interpretation}`);
    }
    lines.push("");
  }

  const sections = [
    ["Patterns requested", summary.patterns_requested],
    ["Design systems used", summary.design_systems_used],
    ["Brand styles requested", summary.brand_styles_requested],
    ["Search layers", summary.search_layers]
  ];
  for (const [title, obj] of sections) {
    const rows = Object.entries(obj || {});
    if (rows.length === 0) continue;
    lines.push(`## ${title}`);
    for (const [k, n] of rows) lines.push(`- ${k} — ${n}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`_Log: \`${summary.log_location}\` · Disable: \`RAVEN_NO_DAILY_DIGEST=1\` in your shell env for the in-session digest, or \`launchctl unload ~/Library/LaunchAgents/ai.ravenmcp.daily-digest.plist\` to stop this agent._`);
  return lines.join("\n") + "\n";
}

function macNotify(title, subtitle, body) {
  if (process.platform !== "darwin") return;
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `display notification "${esc(body)}" with title "${esc(title)}" subtitle "${esc(subtitle)}" sound name "Glass"`;
  spawnSync("osascript", ["-e", script], { stdio: "ignore" });
}

async function main() {
  mkdirSync(DIGEST_DIR, { recursive: true });
  const dayKey = localDateKey();
  const outPath = join(DIGEST_DIR, `daily-digest-${dayKey}.md`);

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(ROOT, "dist", "index.js")],
    cwd: ROOT,
    env: {
      ...process.env,
      RAVEN_NO_UPDATE_CHECK: "1",
      RAVEN_NO_DAILY_DIGEST: "1",
      // The agent reading the log shouldn't also write to it.
      RAVEN_NO_USAGE_LOG: "1"
    }
  });
  const client = new Client({ name: "raven-daily-digest", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  let summary = null;
  try {
    const res = await client.callTool({ name: "raven_reflect", arguments: { days: 1 } });
    const text = res.content?.find((b) => b.type === "text")?.text || "";
    // raven_reflect returns a plain-text sentence when there's no activity
    // or logging is disabled. Only parse when it looks like JSON.
    if (text.trim().startsWith("{")) {
      try { summary = JSON.parse(text); } catch {}
    }
  } finally {
    await client.close();
  }

  if (!summary || !summary.window || summary.window.total_calls === 0) {
    // No activity today — don't write an empty file, don't notify.
    console.log("No Raven activity in the last 24 hours. Skipping digest.");
    return;
  }

  const md = renderMarkdown(summary, dayKey);
  writeFileSync(outPath, md);
  console.log(`✓ Wrote ${outPath}`);

  const calls = summary.window.total_calls;
  const topTool = Object.entries(summary.tool_usage || {}).sort((a, b) => b[1] - a[1])[0];
  const topWarn = Object.entries(summary.audit?.recurring_warnings || {}).sort((a, b) => b[1] - a[1])[0];
  const parts = [`${calls} calls`];
  if (topTool) parts.push(`top: ${topTool[0]} (${topTool[1]})`);
  if (topWarn) parts.push(`recurring: ${topWarn[0]} (${topWarn[1]}×)`);
  macNotify("Raven daily digest", dayKey, parts.join(" · "));
}

main().catch((err) => {
  console.error("Daily digest failed:", err?.message || err);
  process.exit(1);
});
