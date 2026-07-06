// Raven MCP — Bearer-token verification for the AUTHENTICATED endpoint only.
// (Leading underscore: Vercel does not expose this file as an endpoint.)
// api/mcp.js — the anonymous endpoint — never imports this module and is
// byte-for-byte unchanged by Phase 4.
//
// Posture: pure OAuth 2.1 RESOURCE SERVER (RFC 9728). WorkOS AuthKit is the
// external authorization server; this module validates AuthKit-issued JWTs
// via its public JWKS and enforces iss + aud + exp. No WorkOS API key is
// needed or used anywhere on this path.
//
// Config (env ONLY — no secrets in source; none of these are secrets either):
//   WORKOS_AUTHKIT_DOMAIN  issuer, e.g. https://<tenant>.authkit.app
//   RAVEN_MCP_RESOURCE     canonical resource URL bound into `aud`
//                          (https://mcp.ravenmcp.ai/api/mcp-user in prod).
//                          Unset → derived per-request from the forwarded
//                          host (preview deployments): a token minted for
//                          one deployment URL never validates on another.
//
// Test seam: RAVEN_TEST_JWKS_JSON (a local JWKS document) is honored ONLY
// when process.env.VERCEL is absent — i.e. never on a deployment, where
// Vercel always sets VERCEL=1. Unit tests sign with an ephemeral key and
// inject its public JWKS through this seam.

import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from "jose";

export function authkitDomain() {
  const raw = process.env.WORKOS_AUTHKIT_DOMAIN || "";
  return raw.replace(/\/+$/, "");
}

function requestHost(req) {
  const fwd = req.headers["x-forwarded-host"];
  const host = (typeof fwd === "string" && fwd) ? fwd : req.headers.host;
  return typeof host === "string" ? host.split(",")[0].trim() : "";
}

// The resource identifier this deployment answers for — the value `aud` must
// equal. Env override wins (canonical / preview-branch alias); otherwise the
// deployment's own host.
export function expectedResource(req) {
  const fromEnv = process.env.RAVEN_MCP_RESOURCE;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "https://" + requestHost(req) + "/api/mcp-user";
}

// RFC 9728 path-suffixed protected-resource-metadata URL for this deployment.
export function prmUrl(req) {
  return "https://" + requestHost(req) + "/.well-known/oauth-protected-resource/api/mcp-user";
}

export function wwwAuthenticate(req, invalid) {
  const parts = ["Bearer"];
  if (invalid) {
    parts.push('error="invalid_token"');
    parts.push('error_description="The access token is missing, expired, or invalid for this resource."');
  }
  parts.push('resource_metadata="' + prmUrl(req) + '"');
  return parts[0] + " " + parts.slice(1).join(", ");
}

// Remote JWKS instances cached per issuer for warm-invocation reuse. Keyed by
// domain (module-level CONFIG cache, not per-user state — safe under Fluid
// Compute concurrency).
const jwksByDomain = new Map();

function keySource() {
  if (!process.env.VERCEL && process.env.RAVEN_TEST_JWKS_JSON) {
    return createLocalJWKSet(JSON.parse(process.env.RAVEN_TEST_JWKS_JSON));
  }
  const domain = authkitDomain();
  if (!jwksByDomain.has(domain)) {
    jwksByDomain.set(domain, createRemoteJWKSet(new URL(domain + "/oauth2/jwks")));
  }
  return jwksByDomain.get(domain);
}

// Verify the request's Bearer token. Returns { ok: true, claims } or
// { ok: false }. Never throws. `claims.sub` is the stable per-user id that
// later phases key the per-user taste store on.
export async function verifyBearer(req) {
  const authz = req.headers.authorization;
  const match = typeof authz === "string" ? authz.match(/^Bearer (.+)$/) : null;
  if (!match) return { ok: false, missing: true };
  if (!authkitDomain()) {
    console.error("[raven-mcp-user] WORKOS_AUTHKIT_DOMAIN is not configured");
    return { ok: false, missing: false };
  }
  try {
    const { payload } = await jwtVerify(match[1], keySource(), {
      issuer: authkitDomain(),
      audience: expectedResource(req)
    });
    if (typeof payload.sub !== "string" || payload.sub === "") {
      return { ok: false, missing: false };
    }
    return { ok: true, claims: payload };
  } catch {
    return { ok: false, missing: false };
  }
}
