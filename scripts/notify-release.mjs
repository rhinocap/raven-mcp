#!/usr/bin/env node
// Send a release-digest email to Raven's Resend audience.
// Invoked by .github/workflows/release.yml in the `notify` job — only on
// minor/major bumps (patches are silent).
//
// Env:
//   RESEND_API_KEY      — required
//   RESEND_AUDIENCE_ID  — required (target audience)
//   RELEASE_VERSION     — e.g. "1.2.0"
//   RELEASE_NOTES       — markdown from detect-release-scope.mjs
//   RELEASE_BUMP        — "minor" | "major"

import { Resend } from "resend";

const {
  RESEND_API_KEY,
  RESEND_AUDIENCE_ID,
  RELEASE_VERSION,
  RELEASE_NOTES = "",
  RELEASE_BUMP = "minor",
} = process.env;

if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID || !RELEASE_VERSION) {
  console.error("Missing required env: RESEND_API_KEY, RESEND_AUDIENCE_ID, RELEASE_VERSION");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderNotes(md) {
  // Minimal md → html, same rules as the changelog builder.
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  const close = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const h3 = line.match(/^###\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    if (h3) {
      close();
      html += `<div style="color:#00BFFF;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:24px 0 8px;">${escapeHtml(h3[1])}</div>`;
    } else if (li) {
      if (!inList) {
        html += '<ul style="margin:0;padding-left:20px;color:#9498A0;line-height:1.7;">';
        inList = true;
      }
      html += `<li style="margin-bottom:4px;">${inline(li[1])}</li>`;
    } else if (line === "") {
      close();
    } else if (/^\*\*Install:\*\*/.test(line)) {
      close();
      html += `<p style="color:#9498A0;font-size:14px;margin:12px 0;">${inline(line)}</p>`;
    } else if (line.startsWith("Raven v") && line.includes("release")) {
      // skip the title line — we build our own header
    } else {
      close();
      html += `<p style="color:#9498A0;margin:12px 0;">${escapeHtml(line)}</p>`;
    }
  }
  close();
  return html;

  function inline(s) {
    let out = escapeHtml(s);
    out = out.replace(/`([^`]+)`/g, '<code style="background:#2a2a33;padding:2px 6px;border-radius:4px;color:#00BFFF;font-family:ui-monospace,monospace;font-size:13px;">$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#F0F0F2;">$1</strong>');
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#00BFFF;text-decoration:none;">$1</a>');
    out = out.replace(/(^|\s)#(\d+)\b/g, (_, pre, n) => `${pre}<a href="https://github.com/rhinocap/raven-mcp/issues/${n}" style="color:#00BFFF;text-decoration:none;">#${n}</a>`);
    return out;
  }
}

const subject =
  RELEASE_BUMP === "major"
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
          ${RELEASE_BUMP === "major" ? "A major release" : "A minor release"} with new design knowledge landed on npm and ravenmcp.ai this week.
        </td></tr>
        <tr><td bgcolor="#212129" style="background:#212129;border-radius:12px;border:1px solid rgba(255,255,255,0.06);padding:24px;color:#9498A0;font-size:14px;">
          ${renderNotes(RELEASE_NOTES)}
        </td></tr>
        <tr><td style="padding:32px 0;">
          <a href="https://ravenmcp.ai/changelog.html" style="display:inline-block;padding:12px 24px;background:#00BFFF;color:#1a1a22;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">Read the full changelog</a>
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
