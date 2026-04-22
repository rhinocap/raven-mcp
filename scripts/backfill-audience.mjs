#!/usr/bin/env node
// Backfill the Resend audience with past welcome-email recipients.
//
// Strategy: walks Resend's logs.list (account-wide API request log — NOT
// scoped to the auth key) to find every successful POST /emails, reads
// the request body to extract the `to` address, and subscribes each
// unique recipient to RESEND_AUDIENCE_ID.
//
// Defaults to DRY-RUN — shows who would be added but doesn't write.
// Pass --commit to actually subscribe.
//
// Env:
//   RESEND_API_KEY       — required (temp or full-access)
//   RESEND_AUDIENCE_ID   — required
//
// Usage:
//   node scripts/backfill-audience.mjs           # dry-run
//   node scripts/backfill-audience.mjs --commit  # actually add contacts

import { Resend } from "resend";

const { RESEND_API_KEY, RESEND_AUDIENCE_ID } = process.env;
if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) {
  console.error("Missing env: RESEND_API_KEY and RESEND_AUDIENCE_ID are both required.");
  process.exit(1);
}

const commit = process.argv.includes("--commit");
const debug = process.argv.includes("--debug");
const resend = new Resend(RESEND_API_KEY);

function normalizeAddress(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(normalizeAddress).filter(Boolean);
  const s = String(value).trim().toLowerCase();
  const m = s.match(/<([^>]+)>/);
  return m ? m[1] : s;
}

function extractRecipientsFromLog(log) {
  // Try every known shape for where the `to` field might live on a log record.
  const body =
    log?.request_body ??
    log?.requestBody ??
    log?.body ??
    log?.request?.body ??
    log?.payload ??
    null;

  let parsed = body;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  const toField = parsed?.to;
  if (!toField) return [];
  const list = [].concat(normalizeAddress(toField) || []);
  return list.filter(Boolean);
}

async function walkLogs(onLog) {
  let cursor = undefined;
  let page = 0;
  let total = 0;
  let dumpedListShape = false;
  let dumpedGetShape = false;
  while (true) {
    page += 1;
    const params = { limit: 100 };
    if (cursor) params.after = cursor;
    const res = await resend.logs.list(params);
    if (res?.error) {
      console.error("logs.list error:", res.error.message || res.error);
      break;
    }
    const raw = res?.data;
    const arr = Array.isArray(raw) ? raw : (raw?.data || []);
    if (!Array.isArray(arr) || arr.length === 0) break;

    if (debug && !dumpedListShape && arr.length > 0) {
      console.log("\n=== DEBUG: logs.list entry shape ===");
      console.log(JSON.stringify(arr[0], null, 2));
      console.log("=== END ===\n");
      dumpedListShape = true;
    }

    for (const log of arr) {
      total += 1;
      if (debug && !dumpedGetShape && log?.id) {
        try {
          const full = await resend.logs.get(log.id);
          console.log("\n=== DEBUG: logs.get(" + log.id + ") shape ===");
          console.log(JSON.stringify(full, null, 2));
          console.log("=== END ===\n");
          dumpedGetShape = true;
        } catch (e) {
          console.log("DEBUG: logs.get failed:", e?.message);
          dumpedGetShape = true;
        }
      }
      await onLog(log);
    }

    const hasMore = raw?.has_more;
    if (!hasMore && arr.length < 100) break;
    cursor = arr[arr.length - 1]?.id;
    if (!cursor) break;
    if (page > 100) {
      console.warn("Stopping at 100 pages for safety.");
      break;
    }
  }
  return total;
}

async function existingAudienceEmails() {
  const res = await resend.contacts.list({ audienceId: RESEND_AUDIENCE_ID });
  if (res?.error) {
    console.warn("contacts.list error (continuing):", res.error.message || res.error);
    return new Set();
  }
  const list = res?.data?.data || [];
  return new Set(list.map(c => String(c.email || "").toLowerCase()));
}

async function main() {
  console.log(commit ? "MODE: commit" : "MODE: dry-run (pass --commit to write)");
  console.log("Walking Resend logs for past POST /emails…");

  const recipients = new Map(); // address → { firstSeen: ISO, source: log.id }
  let sawEmailPost = 0;

  const total = await walkLogs(async (log) => {
    const endpoint = log?.endpoint || log?.path || log?.url || "";
    const method = (log?.method || log?.http_method || "").toUpperCase();
    const status = log?.status || log?.response_status || 0;

    const isEmailPost =
      method === "POST" &&
      /^\/emails(\?|$|\/)/.test(endpoint) &&
      (status === 0 || (status >= 200 && status < 300));
    if (!isEmailPost) return;
    sawEmailPost += 1;

    let tos = extractRecipientsFromLog(log);

    // If the list response doesn't carry the body, fetch the full log.
    if (tos.length === 0 && log?.id) {
      try {
        const full = await resend.logs.get(log.id);
        const body = full?.data?.request_body ?? full?.data?.body ?? null;
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        tos = [].concat(normalizeAddress(parsed?.to) || []).filter(Boolean);
      } catch (e) {
        // swallow — just skip this log
      }
    }

    for (const addr of tos) {
      if (!addr) continue;
      if (addr.endsWith("@ravenmcp.ai")) continue; // skip our own outbound
      if (!recipients.has(addr)) {
        recipients.set(addr, { firstSeen: log?.created_at || log?.timestamp, source: log?.id });
      }
    }
  });

  console.log(`Walked ${total} log entries (${sawEmailPost} POST /emails).`);
  console.log(`Unique recipient addresses: ${recipients.size}`);

  const existing = await existingAudienceEmails();
  console.log(`Audience already has ${existing.size} contact(s).`);

  const toAdd = [...recipients.entries()].filter(([addr]) => !existing.has(addr));
  console.log(`Would add ${toAdd.length} new contact(s) to audience.`);
  for (const [addr] of toAdd.slice(0, 60)) console.log("  +", addr);
  if (toAdd.length > 60) console.log(`  … and ${toAdd.length - 60} more`);

  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit to subscribe them.");
    return;
  }

  let ok = 0, dup = 0, err = 0;
  for (const [addr] of toAdd) {
    try {
      const res = await resend.contacts.create({
        audienceId: RESEND_AUDIENCE_ID,
        email: addr,
        unsubscribed: false
      });
      if (res?.error) {
        const msg = res.error.message || "";
        if (/already exists|duplicate/i.test(msg)) dup += 1;
        else { err += 1; console.warn("  ! error for", addr, "—", msg); }
      } else ok += 1;
    } catch (e) {
      err += 1;
      console.warn("  ! exception for", addr, "—", e?.message || e);
    }
  }
  console.log(`\nDone. Added: ${ok}. Already present: ${dup}. Errors: ${err}.`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
