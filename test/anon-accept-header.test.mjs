// The Accept-header normalization in api/mcp.js, measured through the REAL
// handler over a REAL socket rather than by reading the source.
//
// Why this file exists. The MCP spec requires a Streamable HTTP client to send
// BOTH "application/json" and "text/event-stream"; the SDK enforces it with a
// hard 406. Real clients do not all comply - a client sending "application/json"
// alone, or the near-universal default "*/*", was refused - which is exactly the
// shape of "the same test cases pass consistently on ChatGPT web and mobile"
// failing when two clients differ only in their Accept header.
//
// api/mcp.js normalizes the header, and for a full pass it did so ONLY on
// req.headers, which is INERT: the SDK's node transport converts the request
// through @hono/node-server, whose newHeadersFromIncoming rebuilds the Headers
// object from incoming.rawHeaders and never consults the .headers accessor. The
// normalization therefore had no observable effect at all and the 406 stood.
//
// So this test drives the handler over the network. A unit assertion on
// req.headers would have passed against the defect for that entire pass - that
// is precisely the assertion that DID pass against it - which is why nothing
// here reads a header and everything reads an HTTP status plus a decoded body.
// The "correct" arm is the control: it must stay green under every mutant, or a
// fix that simply disabled the SDK's check would look like a pass.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import handler from "../api/mcp.js";

const RPC = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

async function post(accept) {
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    req.body = body ? JSON.parse(body) : undefined;
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };
    try {
      await handler(req, res);
    } catch (err) {
      if (!res.headersSent) { res.statusCode = 500; res.end(String(err)); }
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mcp`, {
      method: "POST",
      headers: { accept, "content-type": "application/json" },
      body: JSON.stringify(RPC)
    });
    const text = await response.text();
    let parsed = null;
    // enableJsonResponse is on, but decode an SSE frame too so the assertion
    // does not silently depend on that setting staying put.
    try { parsed = JSON.parse(text.replace(/^event:.*\ndata: /m, "")); } catch { /* left null */ }
    return { status: response.status, text, parsed };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// The three arms are three CLIENTS, not three spellings: a strict JSON client, a
// default-header client, and a spec-compliant MCP client. All three must reach
// the same 45-tool anonymous surface, because a reviewer running the same test
// case from two of them must not get two answers.
for (const [label, accept] of [
  ["a client sending only application/json", "application/json"],
  ["a client sending the default */*", "*/*"],
  ["a spec-compliant client sending both media types", "application/json, text/event-stream"]
]) {
  test(`${label} reaches the anonymous tool list`, async () => {
    const { status, text, parsed } = await post(accept);
    assert.equal(status, 200, `expected HTTP 200, got ${status}: ${text.slice(0, 200)}`);
    assert.ok(parsed, `response was not decodable JSON: ${text.slice(0, 200)}`);
    assert.equal(parsed.error, undefined, `JSON-RPC error: ${JSON.stringify(parsed.error)}`);
    assert.ok(Array.isArray(parsed.result?.tools), "no tools array on the result");
    // Pinned to the frozen anonymous surface, so an arm that answers 200 with a
    // DIFFERENT tool set is a failure rather than a pass.
    assert.equal(parsed.result.tools.length, 45, "anonymous tool count");
  });
}
