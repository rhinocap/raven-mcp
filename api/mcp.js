// Raven MCP — stateless remote HTTP entry (Vercel serverless function).
//
// Additive to the stdio server: this endpoint reuses the exact same
// `buildServer()` factory from dist/index.js, but in REMOTE mode — which
// registers only the 45 safe stateless tools. Gated off in remote mode:
// 20 stateful/local taste+creative tools and 5 filesystem/network/side-effect-capability
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
// pre-dispatch size cap here bounds the entire input-DoS class for all 45 tools
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

  // Accept-header normalization. The SDK's Streamable HTTP transport rejects any
  // POST whose Accept header does not list BOTH application/json AND
  // text/event-stream with a 406, BEFORE the body is parsed or the server is
  // consulted - verified in the shipping path, not assumed: the Node transport is
  // a thin wrapper (node_modules/@modelcontextprotocol/sdk/dist/esm/server/
  // streamableHttp.js:52,60) that forwards every request to
  // WebStandardStreamableHTTPServerTransport, whose handlePostRequest enforces the
  // check unconditionally at webStandardStreamableHttp.js:375-380.
  // enableJsonResponse below does NOT bypass it - _enableJsonResponse is read only
  // at :474/:702/:722, all downstream of the rejection.
  // A conformant MCP client sends both. A reviewer's client, a curl repro, or a
  // mobile surface that sends `Accept: application/json` (or nothing) gets a bare
  // 406 that reads as "the server is broken" rather than "your header is short" -
  // which is exactly the shape of OpenAI's "did not produce correct results" /
  // "must pass consistently on both web and mobile" finding. This endpoint is
  // stateless and never opens an SSE stream (sessionIdGenerator: undefined,
  // enableJsonResponse: true), so accepting text/event-stream on the client's
  // behalf promises nothing we do not deliver: the response is always JSON.
  //
  // KNOWN, ACCEPTED behavior change, stated rather than discovered later: this
  // normalization is unconditional, so a NON-MCP POST that used to be rejected with
  // a 406 now reaches the transport and comes back as a JSON-RPC error instead
  // (e.g. POST {} with Accept: */* was 406 Not Acceptable, and is now -32600 Invalid
  // Request). That is accepted, not overlooked: 406 answers a question nobody asked
  // about a body that is malformed for a different reason, and -32600 names the
  // actual defect. Narrowing the normalization to bodies carrying a "jsonrpc" field
  // was considered and refused - a client that omits jsonrpc is exactly a client
  // that needs the accurate error, and gating on it would hand that caller the
  // misleading 406 back.
  //
  // MEASURED 2026-08-19, and this is the half that was missing for a full pass:
  // mutating req.headers ALONE is INERT. The SDK's node StreamableHTTPServerTransport
  // (node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js:9)
  // converts the Node request through @hono/node-server's getRequestListener, and
  // newHeadersFromIncoming (dist/listener.mjs:34-42) rebuilds the Headers object
  // from incoming.rawHeaders - never from the .headers accessor - so the rewritten
  // Accept never reached the transport and a client sending only
  // "Accept: application/json" still got HTTP 406. rawHeaders is the wire order and
  // is BOTH in-place-writable and settable on Node v26.5.0 (measured, not assumed:
  // .claude/openai-rejection-2026-08-19/probe-rawheaders.mjs). Both surfaces are
  // normalized here, and the rebuild collapses DUPLICATE Accept pairs to one -
  // leaving a stale second pair behind would have hono append it back as
  // "application/json, text/event-stream, application/json" and reintroduce nothing
  // useful while making the header unreadable.
  var CANONICAL_ACCEPT = "application/json, text/event-stream";
  var acceptHeader = req.headers["accept"];
  if (typeof acceptHeader !== "string" ||
      acceptHeader.indexOf("application/json") === -1 ||
      acceptHeader.indexOf("text/event-stream") === -1) {
    req.headers["accept"] = CANONICAL_ACCEPT;
    var raw = req.rawHeaders;
    if (Array.isArray(raw)) {
      var rebuilt = [];
      var wrote = false;
      for (var i = 0; i < raw.length; i += 2) {
        if (String(raw[i]).toLowerCase() === "accept") {
          if (wrote) continue;
          rebuilt.push(raw[i], CANONICAL_ACCEPT);
          wrote = true;
          continue;
        }
        rebuilt.push(raw[i], raw[i + 1]);
      }
      if (!wrote) rebuilt.push("accept", CANONICAL_ACCEPT);
      req.rawHeaders = rebuilt;
    }
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
