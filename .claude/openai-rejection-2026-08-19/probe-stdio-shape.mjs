#!/usr/bin/env node
// Executes the transport-shape claim in R1-test-cases.md (case N3).
//
// The doc says a reviewer must read `result.isError` and not `response.error.code`,
// and that the LOCAL STDIO build returns the SAME shape as the hosted endpoint. That
// second half was prose for one round and was FALSE in its first form (it claimed stdio
// returns a protocol-level -32602 error). It executes now.
//
// Unlike replay-r1-cases.mjs, this one REQUIRES a checkout and a fresh build -- that is
// the whole point, it measures the local transport. Run `npm run build` first: dist/ is
// gitignored and, per the ledger, can hold mutant residue that no mtime vouches for.
//
// Exit 0 iff BOTH failure modes come back as JSON-RPC results carrying isError:true with
// NO top-level error object. Any protocol-level error is a FAIL -- it would mean the doc's
// scripting instruction is wrong for stdio.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const entry = resolve(repo, "dist/index.js");
if (!existsSync(entry)) {
  console.error(`FAIL: ${entry} is missing. Run \`npm run build\` first.`);
  process.exit(2);
}

// One case per failure mode. Both are argument-shaped failures a reviewer could hit.
const CASES = [
  { label: "missing required argument", name: "get_design_system", args: {} },
  { label: "unknown tool name", name: "no_such_tool_xyz", args: {} },
];

async function callOverStdio({ name, args }) {
  const child = spawn(process.execPath, [entry], {
    cwd: repo,
    // RAVEN_NO_USAGE_LOG: the daily-digest notice corrupts JSON assertions (ledgered P2).
    // RAVEN_REMOTE="": src/index.ts falls back to the env var when opts.remote is not an
    // explicit boolean, so an inherited value would silently measure the REMOTE server.
    env: { ...process.env, RAVEN_NO_USAGE_LOG: "1", RAVEN_REMOTE: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const messages = [];
  let buf = "";
  let stderr = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { messages.push(JSON.parse(line)); } catch { /* non-JSON stdout is not a message */ }
    }
  });
  child.stderr.on("data", (d) => { stderr += d.toString(); });
  const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "0" } } });
  const initialized = await waitFor(() => messages.some((m) => m.id === 1), 15000);
  if (!initialized) { child.kill(); throw new Error(`initialize never answered. stderr: ${stderr.slice(0, 400)}`); }

  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
  const answered = await waitFor(() => messages.some((m) => m.id === 2), 15000);
  child.kill();
  if (!answered) throw new Error(`tools/call never answered. stderr: ${stderr.slice(0, 400)}`);
  return messages.find((m) => m.id === 2);
}

// Poll for the response rather than sleeping a fixed span: a fixed sleep that is too short
// reports a live server as unresponsive, and one that is long enough is mostly waiting.
async function waitFor(pred, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return pred();
}

let failing = 0;
for (const c of CASES) {
  const resp = await callOverStdio(c);
  const hasErrorObject = Object.prototype.hasOwnProperty.call(resp, "error");
  const isErrorFlag = resp.result?.isError;
  const text = resp.result?.content?.[0]?.text ?? "";
  const ok = !hasErrorObject && isErrorFlag === true;
  if (!ok) failing++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.label}`);
  console.log(`      top-level error object : ${hasErrorObject}   (expected false)`);
  console.log(`      result.isError         : ${isErrorFlag}   (expected true)`);
  console.log(`      text starts            : ${JSON.stringify(text.slice(0, 60))}`);
}

console.log(`\n${CASES.length} cases / ${failing} failing`);
console.log(failing === 0
  ? "stdio matches the hosted surface: result + isError, no error object."
  : "stdio DIVERGES from the hosted surface -- R1-test-cases.md case N3 needs re-measuring.");
process.exitCode = failing === 0 ? 0 : 1;
