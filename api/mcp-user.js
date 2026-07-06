// Raven MCP — AUTHENTICATED stateless remote HTTP entry (Vercel serverless).
//
// Phase-4 ADDITIVE twin of api/mcp.js (which stays byte-identical and
// anonymous). This endpoint requires a WorkOS AuthKit Bearer JWT (see
// api/_auth.js — pure resource-server posture; iss/aud/exp enforced against
// env-configured issuer + resource). No/invalid token → 401 with a
// WWW-Authenticate challenge carrying `resource_metadata`, which is what
// makes MCP clients start the OAuth flow (RFC 9728 discovery).
//
// P4.1 skeleton: a VALID token serves exactly the same 45 stateless remote
// tools as the anonymous endpoint — no taste tools are un-gated yet. Later
// phases inject a per-user store (RedisTasteStore(claims.sub)) into
// buildServer here, and ONLY here.
//
// Serving pattern is a deliberate copy of api/mcp.js: fresh server +
// transport per POST (SDK #961), stateless Streamable HTTP, the same 400KB
// body cap. Comments explaining those choices live in api/mcp.js.

import { buildServer } from "../dist/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verifyBearer, wwwAuthenticate } from "./_auth.js";

const MAX_BODY_BYTES = 400_000;

function recoverableId(body) {
  return (body && typeof body === "object" && !Array.isArray(body) && body.id !== undefined) ? body.id : null;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Auth gate — before any method/body handling. Both the missing-token and
  // invalid-token challenges carry resource_metadata so clients can discover
  // the authorization server.
  const auth = await verifyBearer(req);
  if (!auth.ok) {
    res.setHeader("WWW-Authenticate", wwwAuthenticate(req, !auth.missing));
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: auth.missing ? "Authentication required." : "Invalid access token." },
      id: null
    });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method Not Allowed. This stateless MCP endpoint accepts POST only." },
      id: null
    });
    return;
  }

  const declaredLen = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    res.status(413).json({
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: "Request body exceeds the 400KB limit for the hosted endpoint. Send only the relevant elements/nodes/html, or run the full audit on the local stdio server (npx raven-mcp)."
      },
      id: null
    });
    return;
  }

  if (typeof req.body !== "object" || req.body === null) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error: request body must be a JSON object or batch array." },
      id: null
    });
    return;
  }

  if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > MAX_BODY_BYTES) {
    res.status(413).json({
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: "Request body exceeds the 400KB limit for the hosted endpoint. Send only the relevant elements/nodes/html, or run the full audit on the local stdio server (npx raven-mcp)."
      },
      id: recoverableId(req.body)
    });
    return;
  }

  // P4.1: identical tool surface to the anonymous endpoint. auth.claims.sub is
  // established and verified here but not yet used — the per-user store lands
  // in P4.2.
  const server = buildServer({ remote: true });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[raven-mcp-user] request handling error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      });
    }
  }
}
