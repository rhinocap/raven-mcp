// Test script — sends a welcome email preview via Resend
// Usage: RESEND_API_KEY=re_xxx node scripts/test-email.js [welcome|install]

import { Resend } from "resend";

var apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("Missing RESEND_API_KEY env var");
  console.error("Usage: RESEND_API_KEY=re_xxx node scripts/test-email.js [welcome|install]");
  process.exit(1);
}

var mode = process.argv[2] || "welcome";
var resend = new Resend(apiKey);

if (mode === "install") {
  // Test install notification
  var { data, error } = await resend.emails.send({
    from: "Raven MCP <drew@ravenmcp.ai>",
    to: ["drew@ravenmcp.ai"],
    subject: "New Raven install",
    html: `<div style="font-family:Inter,sans-serif; background:#1a1a22; color:#F0F0F2; padding:32px; border-radius:12px;">
      <div style="color:#00BFFF; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:12px;">New install</div>
      <div style="font-size:20px; font-weight:700; margin-bottom:20px;">Someone installed Raven</div>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr><td style="color:#5C5F68; font-size:13px; padding:6px 12px 6px 0;">node</td><td style="color:#9498A0; font-size:13px; font-family:monospace;">${process.version}</td></tr>
        <tr><td style="color:#5C5F68; font-size:13px; padding:6px 12px 6px 0;">platform</td><td style="color:#9498A0; font-size:13px; font-family:monospace;">darwin</td></tr>
        <tr><td style="color:#5C5F68; font-size:13px; padding:6px 12px 6px 0;">timestamp</td><td style="color:#9498A0; font-size:13px; font-family:monospace;">${new Date().toISOString()}</td></tr>
      </table>
    </div>`
  });
} else {
  // Test welcome email
  var { data, error } = await resend.emails.send({
    from: "Drew Cunliffe <drew@ravenmcp.ai>",
    to: ["drew@ravenmcp.ai"],
    replyTo: "drew@ravenmcp.ai",
    subject: "Welcome to Raven",
    html: buildWelcomeHtml("Drew")
  });
}

if (error) {
  console.error("Send failed:", error);
  process.exit(1);
}

console.log(mode + " email sent — id:", data.id);
console.log("Check drew@ravenmcp.ai inbox");

function buildWelcomeHtml(firstName) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#1a1a22; font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a22; padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <div style="width:160px; height:160px; display:inline-block; border-radius:50%; background:radial-gradient(circle, rgba(0,191,255,0.08) 0%, transparent 70%);">
                <img src="https://ravenmcp.ai/assets/raven-logo.png" alt="Raven" width="140" height="140" style="width:140px; height:auto; margin:10px auto; display:block;">
              </div>
            </td>
          </tr>
          <tr>
            <td style="color:#F0F0F2; font-size:26px; font-weight:700; line-height:1.3; padding-bottom:24px;">
              Hey ${firstName},
            </td>
          </tr>
          <tr>
            <td style="color:#9498A0; font-size:16px; line-height:1.7; padding-bottom:24px;">
              Thanks for installing Raven. You now have 65+ design principles, 13 UI patterns, 12 production design system token sets, and business strategy frameworks wired directly into Claude.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;"><div style="height:1px; background:rgba(255,255,255,0.06);"></div></td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#212129; border-radius:12px; border:1px solid rgba(255,255,255,0.06);">
                <tr>
                  <td style="padding:24px;">
                    <div style="color:#00BFFF; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:16px;">Try these</div>
                    <div style="color:#9498A0; font-size:14px; line-height:2;">
                      <span style="color:#00BFFF;">&rsaquo;</span>&ensp;&ldquo;Review this signup page against UX principles&rdquo;<br>
                      <span style="color:#00BFFF;">&rsaquo;</span>&ensp;&ldquo;Build a pricing page using Stripe&rsquo;s design tokens&rdquo;<br>
                      <span style="color:#00BFFF;">&rsaquo;</span>&ensp;&ldquo;What retention strategies apply to SaaS onboarding?&rdquo;
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="color:#9498A0; font-size:16px; line-height:1.7; padding-bottom:28px;">
              I built this because AI keeps generating beautiful UI that violates basic design principles. If you have feedback, ideas for new patterns, or find something broken&mdash;I want to hear it. Just reply to this email.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <a href="mailto:drew@ravenmcp.ai?subject=Raven%20feedback" style="display:inline-block; padding:14px 36px; background:#00BFFF; color:#1a1a22; font-size:15px; font-weight:700; text-decoration:none; border-radius:8px;">
                Share feedback
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:4px;">
              <div style="height:1px; background:rgba(255,255,255,0.06); margin-bottom:24px;"></div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#9498A0; font-size:13px;">&mdash;Drew</td>
                  <td align="right" style="vertical-align:bottom;"><a href="https://ravenmcp.ai" style="color:#00BFFF; font-size:13px; text-decoration:none;">ravenmcp.ai</a></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
