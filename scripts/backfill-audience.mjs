#!/usr/bin/env node
// Backfill the Resend audience with past welcome-email recipients.
//
// Walks Resend's emails.list, extracts unique recipient addresses, and
// subscribes them to RESEND_AUDIENCE_ID. Defaults to DRY-RUN — shows who
// would be added but doesn't write. Pass --commit to actually subscribe.
//
// Env:
//   RESEND_API_KEY       — required
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
const resend = new Resend(RESEND_API_KEY);

function normalizeAddress(value) {
  if (!value) return null;
  // Resend's to field is either a string or an array of strings.
  if (Array.isArray(value)) return value.map(normalizeAddress).filter(Boolean);
  const s = String(value).trim().toLowerCase();
  // Strip display-name format: "Name <addr@x>"
  const m = s.match(/<([^>]+)>/);
  return m ? m[1] : s;
}

async function listAllEmails() {
  const seen = new Map(); // address → { firstName, firstSeen }
  let cursor = undefined;
  let page = 0;
  while (true) {
    page += 1;
    const params = { limit: 100 };
    if (cursor) params.after = cursor;
    const res = await resend.emails.list(params);
    const data = res?.data?.data || res?.data || [];
    if (!Array.isArray(data) || data.length === 0) break;

    for (const email of data) {
      const toList = [].concat(normalizeAddress(email.to) || []);
      for (const addr of toList) {
        if (!addr || seen.has(addr)) continue;
        // Pull firstName from the subject if the welcome-email pattern matches
        // ("Hey <firstName>, welcome..."). Falls back to undefined.
        let firstName;
        const subject = email.subject || "";
        const hey = subject.match(/^Hey\s+([A-Z][a-zA-Z]+)/);
        if (hey) firstName = hey[1];
        seen.set(addr, { firstName, firstSeen: email.created_at });
      }
    }

    // Stop if we got fewer than requested (last page)
    if (data.length < 100) break;
    // Cursor-based pagination — Resend returns has_more/after in some shapes
    const hasMore = res?.data?.has_more;
    if (!hasMore) break;
    cursor = data[data.length - 1]?.id;
    if (!cursor) break;
    if (page > 50) {
      console.warn("Stopping at 50 pages for safety.");
      break;
    }
  }
  return seen;
}

async function existingAudienceEmails() {
  // contacts.list returns subscribers in this audience.
  const res = await resend.contacts.list({ audienceId: RESEND_AUDIENCE_ID });
  const list = res?.data?.data || [];
  return new Set(list.map(c => String(c.email || "").toLowerCase()));
}

async function main() {
  console.log(commit ? "MODE: commit" : "MODE: dry-run (pass --commit to write)");
  console.log("Listing past emails…");
  const recipients = await listAllEmails();
  console.log(`Found ${recipients.size} unique recipient address(es) across the email history.`);

  const existing = await existingAudienceEmails();
  console.log(`Audience already has ${existing.size} contact(s).`);

  const toAdd = [...recipients.entries()].filter(([addr]) => {
    if (existing.has(addr)) return false;
    // Skip our own outbound addresses if they showed up as `to` in any test
    if (addr.endsWith("@ravenmcp.ai")) return false;
    return true;
  });

  console.log(`Would add ${toAdd.length} new contact(s) to audience ${RESEND_AUDIENCE_ID}.`);
  for (const [addr, meta] of toAdd.slice(0, 50)) {
    console.log("  +", addr, meta.firstName ? `(firstName: ${meta.firstName})` : "");
  }
  if (toAdd.length > 50) console.log(`  … and ${toAdd.length - 50} more`);

  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit to subscribe them.");
    return;
  }

  let ok = 0, dup = 0, err = 0;
  for (const [addr, meta] of toAdd) {
    try {
      const body = {
        audienceId: RESEND_AUDIENCE_ID,
        email: addr,
        unsubscribed: false
      };
      if (meta.firstName) body.firstName = meta.firstName;
      const res = await resend.contacts.create(body);
      if (res?.error) {
        const msg = res.error.message || "";
        if (/already exists|duplicate/i.test(msg)) {
          dup += 1;
        } else {
          err += 1;
          console.warn("  ! error for", addr, "—", msg);
        }
      } else {
        ok += 1;
      }
    } catch (e) {
      err += 1;
      console.warn("  ! exception for", addr, "—", e?.message || e);
    }
  }
  console.log(`\nDone. Added: ${ok}. Already present: ${dup}. Errors: ${err}.`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
