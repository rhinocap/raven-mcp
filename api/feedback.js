// Raven MCP — public feedback intake for the Grab overlay.

const MAX_BODY_BYTES = 100_000;
const MAX_MESSAGE_CHARS = 5_000;
const DUPLICATE_WINDOW_MS = 60_000;
// Enough for someone filing a couple of related reports in a row, not enough to
// script an issue tracker full of noise.
const MAX_PER_WINDOW = 5;
const MAX_RECENT_IPS = 1_000;

// Takes the FIRST x-forwarded-for entry, which is only trustworthy because Vercel
// overwrites the header at the edge rather than appending to it. Front this handler
// with another proxy that appends (Cloudflare, an ALB) and the first entry becomes
// client-controlled: an attacker fabricates unlimited IPs, bypasses the rate limit
// entirely, and flushes the LRU map. Re-derive this before changing where it runs.
function requestIp(req) {
  const forwarded = req.headers && req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function neutralizeMentions(value) {
  return String(value || "").replace(/@(?=[A-Za-z0-9])/g, "@\u200b");
}

function fenced(value) {
  const text = String(value || "");
  const runs = text.match(/`+/g) || [];
  let fenceLength = 3;
  for (const run of runs) {
    fenceLength = Math.max(fenceLength, run.length + 1);
  }
  const fence = "`".repeat(fenceLength);
  return fence + "text\n" + text + "\n" + fence;
}

function contextValue(value) {
  if (value === undefined || value === null || value === "") return "Not provided";
  return neutralizeMentions(value).replace(/[\r\n]+/g, " ");
}

function issueBody(body, timestamp) {
  const message = neutralizeMentions(body.message.trim());
  // The form promises "so we can reply", so the address has to reach the person
  // triaging the issue. It goes in the body rather than the log because log
  // retention is not a contact list. This lands in a PRIVATE repo -- that is the
  // reason the target repo is private, and it must stay private.
  const context = [
    // Not run through neutralizeMentions: this whole block is inside a code fence,
    // where GitHub does not resolve @-mentions anyway, and a zero-width space wedged
    // into the address would silently break copy-pasting the one thing we promised
    // to reply to. Newlines are still stripped so it cannot forge context lines.
    "Reply to: " + (body.email ? String(body.email).replace(/[\r\n]+/g, " ") : "Not provided"),
    "Page: " + contextValue(body.page),
    "Viewport: " + contextValue(body.viewport),
    "Raven version: " + contextValue(body.ravenVersion),
    "Project: " + contextValue(body.projectName),
    "Submitted: " + timestamp
  ].join("\n");
  return fenced(message) + "\n\n<details>\n<summary>Context</summary>\n\n" + fenced(context) + "\n\n</details>";
}

function issueTitle(message) {
  return neutralizeMentions(message.trim().replace(/\s+/g, " ")).slice(0, 60) || "Raven feedback";
}

export function createFeedbackHandler(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const env = options.env || process.env;
  const log = options.log || function (entry) { console.info("[raven-feedback]", entry); };
  const now = options.now || function () { return Date.now(); };
  const recentByIp = new Map();

  return async function handler(req, res) {
    // The overlay posts here cross-origin from whatever dev server it is running on,
    // so any origin has to be allowed. Nothing is read back and no credentials are
    // accepted, so a wildcard costs nothing beyond the rate limit below.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const declaredLength = Number(req.headers && req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      res.status(413).json({ error: "Request body exceeds the 100KB limit" });
      return;
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      res.status(400).json({ error: "JSON body required" });
      return;
    }

    if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > MAX_BODY_BYTES) {
      res.status(413).json({ error: "Request body exceeds the 100KB limit" });
      return;
    }

    if (typeof req.body.message !== "string" || req.body.message.trim() === "") {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    if (req.body.message.length > MAX_MESSAGE_CHARS) {
      res.status(400).json({ error: "Message exceeds the 5000 character limit" });
      return;
    }

    const ip = requestIp(req);
    const message = req.body.message.trim();
    const currentTime = now();
    // Rate on the sender, not the text. Keying the guard on message equality meant
    // changing one character bought an unlimited issue-creation loop.
    const previous = recentByIp.get(ip);
    const hits = previous ? previous.hits.filter((at) => currentTime - at < DUPLICATE_WINDOW_MS) : [];
    if (hits.length >= MAX_PER_WINDOW) {
      res.status(429).json({ error: "Too much feedback from this address; try again shortly" });
      return;
    }
    hits.push(currentTime);

    // Fluid instances do not share memory, so this is a best-effort burst guard;
    // the entry cap also prevents a warm instance becoming an unbounded IP ledger.
    recentByIp.delete(ip);
    recentByIp.set(ip, { hits: hits, at: currentTime });
    if (recentByIp.size > MAX_RECENT_IPS) {
      recentByIp.delete(recentByIp.keys().next().value);
    }

    const timestamp = new Date(currentTime).toISOString();
    // Operational trace only. The message and the submitter's email live in the
    // issue; duplicating them into platform logs makes a second copy of someone
    // else's product information with a retention policy nobody chose.
    log(JSON.stringify({
      messageChars: message.length,
      hasEmail: typeof req.body.email === "string" && req.body.email !== "",
      ravenVersion: req.body.ravenVersion,
      ip: ip,
      timestamp: timestamp
    }));

    // Whenever delivery cannot happen, the log is the only copy that exists, so it
    // has to hold the content. Once an issue is filed the trace-only line above is
    // the right shape and this is never called.
    function logUndelivered() {
      log(JSON.stringify({
        undelivered: true,
        message: message,
        email: typeof req.body.email === "string" ? req.body.email : undefined,
        ravenVersion: req.body.ravenVersion,
        timestamp: timestamp
      }));
    }

    const token = env.RAVEN_FEEDBACK_GITHUB_TOKEN;
    const repo = env.RAVEN_FEEDBACK_REPO;
    if (!token || !repo) {
      // Delivery is off, so the log is the only copy that exists. Write the whole
      // thing rather than lose someone's report to a config gap they cannot see --
      // the trace-only shape above is right once the issue holds the content.
      logUndelivered();
      res.status(200).json({ ok: true, delivered: false, reason: "not configured" });
      return;
    }

    const parts = repo.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      // Same config gap, different typo: RAVEN_FEEDBACK_REPO set but not "owner/name".
      // This branch used to answer "thanks" and drop the report on the floor.
      logUndelivered();
      res.status(200).json({ ok: true, delivered: false, reason: "not configured" });
      return;
    }

    try {
      const response = await fetchImpl(
        "https://api.github.com/repos/" + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(parts[1]) + "/issues",
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "raven-mcp-feedback",
            "X-GitHub-Api-Version": "2022-11-28"
          },
          body: JSON.stringify({
            title: issueTitle(message),
            body: issueBody(req.body, timestamp),
            labels: ["feedback"]
          })
        }
      );

      if (!response.ok) {
        console.error("[raven-feedback] GitHub issue creation failed with status", response.status);
        res.status(502).json({ error: "Feedback delivery failed" });
        return;
      }

      const created = await response.json();
      res.status(200).json({ ok: true, delivered: true, url: created.html_url });
    } catch (err) {
      console.error("[raven-feedback] GitHub issue creation failed:", err && err.message);
      res.status(502).json({ error: "Feedback delivery failed" });
    }
  };
}

export default createFeedbackHandler();
