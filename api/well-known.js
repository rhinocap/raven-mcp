// Raven MCP — OAuth discovery documents for the AUTHENTICATED endpoint.
// Reached via vercel.json rewrites (ADDITIVE — no existing route changes):
//   /.well-known/oauth-protected-resource[/api/mcp-user]   → ?doc=prm
//   /.well-known/oauth-authorization-server[/api/mcp-user] → ?doc=as
//
// `prm` — RFC 9728 Protected Resource Metadata. This is what a client fetches
// after the 401 challenge from /api/mcp-user; it points at the external
// authorization server (WorkOS AuthKit).
//
// `as` — RFC 8414 Authorization Server Metadata PROXY for older MCP clients
// that (against RFC 9728) fetch AS metadata from the resource host itself.
// AuthKit is the upstream source of truth; response is edge-cached briefly.
//
// Everything here is public, non-secret configuration; env supplies the two
// deployment-specific values (see api/_auth.js).

import { authkitDomain, expectedResource } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const domain = authkitDomain();
  if (!domain) {
    res.status(503).json({ error: "authorization server not configured" });
    return;
  }

  const url = new URL(req.url, "https://localhost");
  const doc = url.searchParams.get("doc");

  if (doc === "prm") {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
    res.status(200).json({
      resource: expectedResource(req),
      authorization_servers: [domain],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      resource_name: "Raven MCP (authenticated)",
      resource_documentation: "https://ravenmcp.ai/docs.html"
    });
    return;
  }

  if (doc === "as") {
    try {
      const upstream = await fetch(domain + "/.well-known/oauth-authorization-server");
      if (!upstream.ok) {
        res.status(502).json({ error: "authorization server metadata unavailable" });
        return;
      }
      const metadata = await upstream.json();
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
      res.status(200).json(metadata);
      return;
    } catch (err) {
      console.error("[raven-mcp-user] AS metadata proxy error:", err);
      res.status(502).json({ error: "authorization server metadata unavailable" });
      return;
    }
  }

  res.status(404).json({ error: "unknown well-known document" });
}
