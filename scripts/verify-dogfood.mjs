import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const expectedAll = [
  "dec_seed_stdio_byte_identity",
  "dec_seed_anon_45_golden_hash",
  "dec_seed_prod_promote_human_gated",
  "dec_seed_canonical_host",
  "dec_seed_raven_morven_boundary",
  "dec_seed_remote_stack_workos_upstash",
  "dec_seed_nextjs_web_replaces_site",
  "dec_seed_install_telemetry_remove_for_2_0",
];
const candidateId = "dec_seed_install_telemetry_remove_for_2_0";
const expectedActive = expectedAll.filter(function (id) {
  return id !== candidateId;
});
const decisionsHome = resolve(".raven/decisions");
const child = spawn(process.execPath, ["dist/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    RAVEN_NO_USAGE_LOG: "1",
    RAVEN_DECISIONS_HOME: decisionsHome,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
let rawActive = null;
let rawCandidate = null;
const pending = new Map();

child.stderr.setEncoding("utf8");
child.stderr.on("data", function (chunk) {
  stderr += chunk;
});

const lines = createInterface({ input: child.stdout });
lines.on("line", function (line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    fail("invalid JSON-RPC response: " + error.message);
    return;
  }
  if (message.id !== undefined && pending.has(message.id)) {
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(JSON.stringify(message.error)));
    else handlers.resolve(message);
  }
});

function send(message) {
  child.stdin.write(JSON.stringify(message) + "\n");
}

function request(id, method, params) {
  return new Promise(function (resolvePromise, rejectPromise) {
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
    send({ jsonrpc: "2.0", id: id, method: method, params: params });
  });
}

function withTimeout(promise, label) {
  return new Promise(function (resolvePromise, rejectPromise) {
    const timer = setTimeout(function () {
      rejectPromise(new Error(label + " timed out"));
    }, 10000);
    promise.then(function (value) {
      clearTimeout(timer);
      resolvePromise(value);
    }, function (error) {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });
}

function parseDecisions(response) {
  const content = response && response.result && response.result.content;
  if (!Array.isArray(content)) throw new Error("decision_list result has no content array");
  const textPart = content.find(function (part) {
    return part && part.type === "text" && typeof part.text === "string";
  });
  if (!textPart) throw new Error("decision_list result has no text content");
  const parsed = JSON.parse(textPart.text);
  if (!Array.isArray(parsed)) throw new Error("decision_list text is not a JSON array");
  return parsed;
}

function sortedIds(decisions) {
  return decisions.map(function (decision) {
    return decision.id;
  }).sort();
}

function sameIds(actual, expected) {
  const expectedSorted = expected.slice().sort();
  return actual.length === expectedSorted.length && actual.every(function (id, index) {
    return id === expectedSorted[index];
  });
}

// ponytail: subset, not equality. The store is meant to accumulate real
// decisions, so an exact-count assertion fails the first time anyone records
// one. What dogfooding proves is that the seeds are retrievable, not that
// they are alone.
function containsAll(actual, expected) {
  return expected.every(function (id) {
    return actual.indexOf(id) !== -1;
  });
}

function fail(reason) {
  console.log("FAIL: " + reason);
  if (rawActive !== null) console.log("RAW active decision_list: " + JSON.stringify(rawActive));
  if (rawCandidate !== null) console.log("RAW candidate decision_list: " + JSON.stringify(rawCandidate));
  if (stderr.trim()) console.log("SERVER STDERR: " + stderr.trim());
  child.kill();
  process.exitCode = 1;
}

child.on("error", function (error) {
  fail("server process error: " + error.message);
});

child.on("exit", function (code, signal) {
  if (pending.size > 0 && process.exitCode !== 1) {
    fail("server exited before responding (code=" + code + ", signal=" + signal + ")");
  }
});

try {
  await withTimeout(request(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "verify", version: "0" },
  }), "initialize");
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  rawActive = await withTimeout(request(2, "tools/call", {
    name: "decision_list",
    arguments: {},
  }), "default active decision_list");
  rawCandidate = await withTimeout(request(3, "tools/call", {
    name: "decision_list",
    arguments: { status: "candidate" },
  }), "candidate decision_list");

  const activeIds = sortedIds(parseDecisions(rawActive));
  const candidateDecisions = parseDecisions(rawCandidate);
  const candidateIds = sortedIds(candidateDecisions);
  if (!containsAll(activeIds, expectedActive)) {
    const missing = expectedActive.filter(function (id) { return activeIds.indexOf(id) === -1; });
    throw new Error("active seeds missing: [" + missing.join(", ") + "] not in [" + activeIds.join(", ") + "]");
  }
  if (!containsAll(candidateIds, [candidateId])) {
    throw new Error("candidate seed missing: " + candidateId + " not in [" + candidateIds.join(", ") + "]");
  }
  const seededCandidate = candidateDecisions.filter(function (d) { return d.id === candidateId; })[0];
  if (seededCandidate.status !== "candidate") {
    throw new Error("candidate status mismatch: expected candidate, got " + seededCandidate.status);
  }

  console.log("PASS: active=[" + activeIds.join(", ") + "] candidate=[" + candidateIds.join(", ") + "]");
  child.kill();
} catch (error) {
  fail(error.message);
}
