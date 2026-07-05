// Raven MCP — stateless remote HTTP entry (Vercel serverless function).
//
// Additive to the stdio server: this endpoint reuses the exact same
// `buildServer()` factory from dist/index.js, but in REMOTE mode — which
// registers only the 40 safe stateless tools. Gated off in remote mode:
// 20 stateful/local taste+creative tools, 5 browser-heavy audit tools (Phase 3
// via @sparticuz/chromium), and 5 filesystem/network/side-effect-capability
// tools (audit_contract, audit_asset_integrity, audit_device_frame,
// audit_api_contract — file-read/SSRF oracles; raven_register — a no-auth
// email/subscribe side-effect) that a no-auth endpoint must not expose. Dual-mode
// tools keep their pasted-content path but reject capability args in remote mode
// (see REMOTE_ARG_GUARDS): audit_page/audit_typography `url`; the mobile audits'
// `project`/`profile`; score_creative `brand_profile_id`; evaluate_design
// before/after screenshots (the unbounded PNG-decode DoS).
//
// Transport: MCP Streamable HTTP in STATELESS mode (sessionIdGenerator:
// undefined, enableJsonResponse: true). A FRESH server + transport is built
// per POST — the SDK binds one server to exactly one transport for its
// lifetime (SDK #961), so per-request construction is required and correct.
//
// No auth (public knowledge endpoint). Any secrets come from env ONLY. In remote
// mode buildServer() skips all usage-log / daily-digest / update-banner module
// state, so nothing leaks across concurrent requests on Fluid Compute.

import { buildServer } from "../dist/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Global request-body byte cap for the no-auth hosted endpoint. Every remote-
// served tool does work proportional to its input (element/node arrays, pasted
// html); with no auth, an attacker can convert cheap bandwidth into sustained
// BILLED CPU (Fluid Compute charges active CPU) by streaming large O(n²) bodies —
// the 300s platform timeout doesn't help because burned CPU *is* the attack. One
// pre-dispatch size cap here bounds the entire input-DoS class for all 40 tools
// (present and future) by construction — the structural analogue of the store
// latch — instead of per-tool array/string caps (which drift and miss nested
// params). The value is derived from the measured worst case, not a round number:
// r6 clocked the worst O(n²) hot path (audit_page's `@media` regex, page-checks.ts:75)
// at 68.1s @ 980KB. 400KB caps that quadratic at ~11s (~38× a normal audit vs ~227×
// at 1MB) while still clearing the ~260KB physical ceiling of an LLM-client tool call
// (bounded by its ~64K output-token limit) with ~1.5× margin. This file is never on
// the stdio path, so the stdio wire contract is unaffected.
const MAX_BODY_BYTES = 400_000;

// JSON-RPC id to echo in an error, when the body is a recoverable single request.
function recoverableId(body) {
  return (body && typeof body === "object" && !Array.isArray(body) && body.id !== undefined) ? body.id : null;
}

export default async function handler(req, res) {
  // CORS preflight (matters only for browser-based MCP inspectors; the
  // Claude.ai / ChatGPT connectors call server-to-server). Response headers
  // themselves are set in vercel.json for every /api/* route.
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Stateless: we never open a server->client SSE stream and hold no session,
  // so GET (SSE open) and DELETE (session teardown) have nothing to do.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method Not Allowed. This stateless MCP endpoint accepts POST only." },
      id: null
    });
    return;
  }

  // Body-size cap (cheap header short-circuit). Reject an oversized body before
  // touching req.body. Content-Length can be absent/chunked/spoofed, so this is
  // only the fast path — the authoritative measured check is below.
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

  // Malformed / missing JSON body → JSON-RPC parse error (-32700), not a generic
  // 500. Vercel parses application/json into req.body; an unparseable body leaves
  // it a non-object (string/undefined), which the transport would otherwise turn
  // into an opaque internal error. A valid request/batch is always an object/array.
  if (typeof req.body !== "object" || req.body === null) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error: request body must be a JSON object or batch array." },
      id: null
    });
    return;
  }

  // Body-size cap (authoritative measured check). Immune to a lying/absent
  // Content-Length and to chunked encoding: measure the actual parsed body's
  // serialized size. Runs AFTER the -32700 object guard so malformed-body
  // semantics are unchanged. Cost is O(bytes) with bytes already ≤ Vercel's ~4.5MB
  // platform request cap, i.e. negligible. Blocks dispatch into tool compute.
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

  // Fresh server + transport per request (one server <-> one transport).
  const server = buildServer({ remote: true });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  // handleRequest() may resolve before the JSON-RPC body is fully written, so
  // we tear down on the response 'close' event (fires on both normal completion
  // and client abort) rather than in a finally — a finally-close could kill the
  // response mid-flight. Double-close is idempotent in the SDK.
  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[raven-mcp] request handling error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      });
    }
  }
}
