// Vercel serverless function — sends welcome email via Resend
// Env vars required: RESEND_API_KEY

import { Resend } from "resend";

var resend = new Resend(process.env.RESEND_API_KEY);

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

          <!-- Raven -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="width:160px; height:160px; display:inline-block; border-radius:50%; background:radial-gradient(circle, rgba(0,191,255,0.08) 0%, transparent 70%);">
                <img src="https://ravenmcp.ai/assets/raven-logo.png" alt="Raven" width="140" height="140" style="width:140px; height:auto; margin:10px auto; display:block;">
              </div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="color:#F0F0F2; font-size:26px; font-weight:700; line-height:1.3; padding-bottom:12px;">
              Hey ${firstName},
            </td>
          </tr>

          <tr>
            <td style="color:#9498A0; font-size:16px; line-height:1.7; padding-bottom:32px;">
              Thanks for installing Raven. You now have 65+ design principles, 13 UI patterns, 12 production design system token sets, and business strategy frameworks wired directly into Claude.
            </td>
          </tr>

          <!-- Tips card -->
          <tr>
            <td style="padding-bottom:32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#212129; border-radius:12px; border:1px solid rgba(255,255,255,0.06);">
                <tr>
                  <td style="padding:20px 24px;">
                    <div style="color:#00BFFF; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:12px;">Try these</div>
                    <div style="color:#9498A0; font-size:14px; line-height:1.9;">
                      <span style="color:#00BFFF;">&rsaquo;</span>&ensp;&ldquo;Review this signup page against UX principles&rdquo;<br>
                      <span style="color:#00BFFF;">&rsaquo;</span>&ensp;&ldquo;Build a pricing page using Stripe&rsquo;s design tokens&rdquo;<br>
                      <span style="color:#00BFFF;">&rsaquo;</span>&ensp;&ldquo;What retention strategies apply to SaaS onboarding?&rdquo;
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Feedback ask -->
          <tr>
            <td style="color:#9498A0; font-size:16px; line-height:1.7; padding-bottom:40px;">
              I built this because AI keeps generating beautiful UI that violates basic design principles. If you have feedback, ideas for new patterns, or find something broken&mdash;I want to hear it. Just reply to this email.
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding-bottom:40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="mailto:drew@ravenmcp.ai?subject=Raven%20feedback" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="17%" strokecolor="#00BFFF" fillcolor="#00BFFF">
              <center style="color:#1a1a22;font-family:sans-serif;font-size:15px;font-weight:bold;">Share feedback</center>
              </v:roundrect>
              <![endif]-->
              <a href="mailto:drew@ravenmcp.ai?subject=Raven%20feedback" style="display:inline-block; padding:14px 36px; background:#00BFFF; color:#1a1a22; font-size:15px; font-weight:700; text-decoration:none; border-radius:8px;">
                Share feedback
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td>
              <div style="height:1px; background:rgba(255,255,255,0.06); margin-bottom:20px;"></div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#9498A0; font-size:13px;">
                    &mdash;Drew
                  </td>
                  <td align="right" style="vertical-align:bottom;">
                    <a href="https://ravenmcp.ai" style="color:#00BFFF; font-size:13px; text-decoration:none;">ravenmcp.ai</a>
                  </td>
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

function buildInstallNotifyHtml(meta) {
  var rows = Object.entries(meta)
    .filter(function(entry) { return entry[1]; })
    .map(function(entry) {
      return '<tr><td style="color:#5C5F68; font-size:13px; padding:6px 12px 6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">' + entry[0] + '</td><td style="color:#9498A0; font-size:13px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04); font-family:ui-monospace,monospace;">' + entry[1] + '</td></tr>';
    })
    .join("");

  return '<div style="font-family:Inter,sans-serif; background:#1a1a22; color:#F0F0F2; padding:32px; border-radius:12px;">'
    + '<div style="color:#00BFFF; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:12px;">New install</div>'
    + '<div style="font-size:20px; font-weight:700; margin-bottom:20px;">Someone installed Raven</div>'
    + '<table cellpadding="0" cellspacing="0" style="width:100%;">' + rows + '</table>'
    + '</div>';
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  var { email, name, type } = req.body || {};

  // Install notification — no user email needed
  if (type === "install") {
    var meta = req.body.meta || {};
    try {
      await resend.emails.send({
        from: "Raven MCP <drew@ravenmcp.ai>",
        to: ["drew@ravenmcp.ai"],
        subject: "New Raven install",
        html: buildInstallNotifyHtml(meta)
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(200).json({ success: true }); // don't fail installs
    }
  }

  // Welcome email — requires user email
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email address required" });
  }

  var firstName = name ? name.split(" ")[0] : "there";

  try {
    var { data, error } = await resend.emails.send({
      from: "Drew Cunliffe <drew@ravenmcp.ai>",
      to: [email],
      replyTo: "drew@ravenmcp.ai",
      subject: "Welcome to Raven",
      html: buildWelcomeHtml(firstName)
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send email" });
  }
}
