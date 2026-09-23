#!/usr/bin/env node
// Send a release-digest email to Raven's Resend audience.
// Invoked by .github/workflows/release.yml in the `notify` job — only on
// minor/major bumps (patches are silent).
//
// Env:
//   RESEND_API_KEY      — required
//   RESEND_AUDIENCE_ID  — required (target audience)
//   RELEASE_VERSION     — e.g. "1.2.0"
//   RELEASE_NOTES       — markdown from detect-release-scope.mjs, i.e. the
//                         curated CHANGELOG.md [Unreleased] block (never git log).
//                         When empty (a resend whose job output carried none)
//                         the notes are computed here from CHANGELOG.md the same
//                         way — never from the GitHub Release body, which is a
//                         copy that can be edited or stale.
//   RELEASE_BUMP        — "minor" | "major"; EMPTY on a resend/resume (the
//                         job output only exists on a fresh release), in which
//                         case it is derived from the version shape.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Resend } from "resend";
import { bumpFromVersion, escapeHtml, releaseNotesFor, renderNotesHtml } from "./release-notes.mjs";

const {
  RESEND_API_KEY,
  RESEND_AUDIENCE_ID,
  RELEASE_VERSION,
  RELEASE_BUMP,
} = process.env;
let { RELEASE_NOTES = "" } = process.env;

if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID || !RELEASE_VERSION) {
  console.error("Missing required env: RESEND_API_KEY, RESEND_AUDIENCE_ID, RELEASE_VERSION");
  process.exit(1);
}

// A resend carries no bump output, and defaulting to "minor" would send a
// major release out with the minor subject and body.
const bump = RELEASE_BUMP || bumpFromVersion(RELEASE_VERSION);

if (RELEASE_NOTES.trim() === "") {
  // [Unreleased] as it stood at the tag is best effort here: the notify job's
  // checkout is shallow and may not carry the tag, in which case the promoted
  // [vX.Y.Z] block or the current [Unreleased] is used.
  let tagged;
  try {
    tagged = execSync(`git show v${RELEASE_VERSION}:CHANGELOG.md`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    tagged = undefined;
  }
  try {
    RELEASE_NOTES = releaseNotesFor(RELEASE_VERSION, bump, readFileSync("CHANGELOG.md", "utf8"), tagged);
    console.log(`RELEASE_NOTES was empty - computed from CHANGELOG.md for v${RELEASE_VERSION}`);
  } catch (err) {
    console.error(`::error::no curated release notes for v${RELEASE_VERSION}: ${err.message}`);
    process.exit(1);
  }
}

const resend = new Resend(RESEND_API_KEY);

const subject =
  bump === "major"
    ? `Raven v${RELEASE_VERSION} — major release`
    : `Raven v${RELEASE_VERSION} is out`;

const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:#1a1a22;font-family:'Untitled Sans',-apple-system,BlinkMacSystemFont,sans-serif;">
  <table bgcolor="#1a1a22" width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a22;padding:48px 24px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="https://ravenmcp.ai/assets/raven-logo.png" alt="Raven" width="96" height="96" style="display:block;">
        </td></tr>
        <tr><td style="color:#F0F0F2;font-size:26px;font-weight:700;line-height:1.3;padding-bottom:8px;">
          Raven v${escapeHtml(RELEASE_VERSION)} is out
        </td></tr>
        <tr><td style="color:#9498A0;font-size:15px;line-height:1.7;padding-bottom:24px;">
          ${bump === "major" ? "A major release" : "A minor release"} landed on npm and ravenmcp.ai.
        </td></tr>
        <tr><td bgcolor="#212129" style="background:#212129;border-radius:12px;border:1px solid rgba(255,255,255,0.06);padding:24px;color:#9498A0;font-size:14px;">
          ${renderNotesHtml(RELEASE_NOTES)}
        </td></tr>
        <tr><td style="padding:32px 0;">
          <a href="https://ravenmcp.ai/changelog" style="display:inline-block;padding:12px 24px;background:#00BFFF;color:#1a1a22;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">Read the full changelog</a>
        </td></tr>
        <tr><td style="color:#5C5F68;font-size:13px;line-height:1.7;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
          You're getting this because you registered for Raven at <a href="https://ravenmcp.ai" style="color:#9498A0;">ravenmcp.ai</a>.
          <br>Minor and major releases only — patches stay quiet.
          <br><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#9498A0;">Unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

try {
  const created = await resend.broadcasts.create({
    audienceId: RESEND_AUDIENCE_ID,
    from: "Drew Cunliffe <drew@ravenmcp.ai>",
    replyTo: "drew@ravenmcp.ai",
    subject,
    html,
  });
  const broadcastId = created?.data?.id;
  if (!broadcastId) throw new Error(`No broadcast id returned: ${JSON.stringify(created)}`);
  await resend.broadcasts.send(broadcastId);
  console.log(`✓ Sent release broadcast (${broadcastId}) for v${RELEASE_VERSION}`);
} catch (err) {
  console.error("Broadcast failed:", err?.message || err);
  process.exit(1);
}
