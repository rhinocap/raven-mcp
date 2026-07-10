import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { flattenDesignTokens, parseDesignMd } from "./designmd.js";

var __dirname = dirname(fileURLToPath(import.meta.url));
var PKG_ROOT = resolve(join(__dirname, ".."));
var GRAB_ASSET_PATH = process.env.RAVEN_GRAB_ASSET_PATH ? resolve(process.env.RAVEN_GRAB_ASSET_PATH) : join(PKG_ROOT, "browser", "raven-grab.js");

var GrabPayloadSchema = z.object({
  selector: z.string().min(1),
  html: z.string().optional(),
  rect: z.record(z.any()).optional(),
  styles: z.record(z.any()).optional(),
  tokens: z.any().optional(),
  tokenIntents: z.array(z.any()).optional(),
  styleEdits: z.array(z.any()).optional(),
  instruction: z.string().optional(),
  componentRequest: z.object({
    issueType: z.string(),
    issueSize: z.string(),
    useCase: z.string(),
    email: z.string()
  }).optional(),
  componentName: z.string().optional(),
  filePath: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional()
}).passthrough();

export interface GrabBridgeSelection {
  selector: string;
  html?: string;
  rect?: Record<string, any>;
  styles?: Record<string, any>;
  tokens?: any;
  tokenIntents?: any[];
  styleEdits?: any[];
  instruction?: string;
  componentRequest?: {
    issueType: string;
    issueSize: string;
    useCase: string;
    email: string;
  };
  componentName?: string;
  filePath?: string;
  line?: number;
  column?: number;
  receivedAt: string;
}

export interface GrabBridgeStartResult {
  port: number;
  url: string;
  script_tag: string;
  path: string;
  mode: "server" | "shim";
  proxy_target?: string;
  warning?: string;
}

export interface GrabBridgeDrainResult {
  count: number;
  elements: GrabBridgeSelection[];
}

interface BridgeSession {
  server: ReturnType<typeof createServer>;
  port: number;
  key: string;
  path: string;
  mode: "server" | "shim";
  proxyTarget?: string;
  queue: GrabBridgeSelection[];
  waiters: Array<(items: GrabBridgeSelection[]) => void>;
}

var currentSession: BridgeSession | null = null;
var originalFetch: typeof fetch | null = null;

export async function startGrabSession(path: string, port?: number, proxyTarget?: string): Promise<GrabBridgeStartResult> {
  await stopGrabSession();
  var abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error("DESIGN.md not found at " + abs);
  }
  var normalizedTarget: string | undefined;
  if (proxyTarget !== undefined) {
    var targetUrl: URL;
    try {
      targetUrl = new URL(proxyTarget);
    } catch (_err) {
      throw new Error("proxy_target must be an http(s) URL");
    }
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      throw new Error("proxy_target must be an http(s) URL");
    }
    normalizedTarget = targetUrl.origin;
  }
  var key = randomBytes(32).toString("hex");

  var server = createServer(function (req, res) {
    void handleGrabRequest(abs, key, req, res, normalizedTarget);
  });

  var actualPort = 0;
  try {
    await new Promise<void>(function (resolveListen, rejectListen) {
      server.once("error", rejectListen);
      server.listen(port || 0, "127.0.0.1", function () {
        server.off("error", rejectListen);
        resolveListen();
      });
    });
    var address = server.address();
    actualPort = typeof address === "object" && address ? address.port : port || 0;
    currentSession = {
      server: server,
      port: actualPort,
      key: key,
      path: abs,
      mode: "server",
      proxyTarget: normalizedTarget,
      queue: [],
      waiters: []
    };
  } catch (err) {
    if (server.listening) {
      await new Promise<void>(function (resolveClose) {
        server.close(function () { resolveClose(); });
      });
    }
    var errCode = err instanceof Error ? (err as any).code : undefined;
    if (errCode !== "EPERM") {
      throw err;
    }
    actualPort = port || allocateShimPort();
    installFetchShim();
    currentSession = {
      server: server,
      port: actualPort,
      key: key,
      path: abs,
      mode: "shim",
      queue: [],
      waiters: []
    };
  }

  var mode = currentSession.mode;
  var warning = mode === "shim"
    ? "Sandboxed environment: no real HTTP server is listening — the bridge only answers in-process fetch() calls. A browser cannot reach this session."
    : undefined;
  if (warning && normalizedTarget) {
    warning += " proxy_target is ignored in shim mode.";
  }
  return {
    port: actualPort,
    url: "http://127.0.0.1:" + actualPort,
    script_tag: '<script src="http://127.0.0.1:' + actualPort + '/raven-grab.js?key=' + key + '"></script>',
    path: abs,
    mode: mode,
    proxy_target: mode === "server" ? normalizedTarget : undefined,
    warning: warning
  };
}

export async function stopGrabSession(): Promise<{ stopped: boolean }> {
  if (!currentSession) return { stopped: false };

  var session = currentSession;
  currentSession = null;
  session.waiters.splice(0).forEach(function (resolveItems) {
    resolveItems([]);
  });

  if (session.mode === "shim") {
    uninstallFetchShim();
  }

  try {
    await new Promise<void>(function (resolveClose) {
      session.server.close(function () {
        resolveClose();
      });
    });
  } catch (_err) {
    // Shim mode may never have listened; ignore close errors and continue.
  }

  return { stopped: true };
}

export async function getGrabbedElements(timeoutMs?: number): Promise<GrabBridgeDrainResult> {
  if (!currentSession) {
    throw new Error("No active grab session");
  }

  if (currentSession.queue.length > 0) {
    return drainCurrentQueue(currentSession);
  }

  if (!timeoutMs || timeoutMs <= 0) {
    return { count: 0, elements: [] };
  }

  var items = await waitForGrabItems(currentSession, timeoutMs);
  return { count: items.length, elements: items };
}

export function queueGrabSelection(selection: unknown): GrabBridgeSelection {
  if (!currentSession) {
    throw new Error("No active grab session");
  }

  if (currentSession.queue.length >= MAX_QUEUE_LENGTH) {
    throw new Error("Grab queue is full (" + MAX_QUEUE_LENGTH + "); drain with get_grabbed_elements");
  }
  var parsed = GrabPayloadSchema.parse(selection);
  var item: GrabBridgeSelection = {
    selector: parsed.selector,
    html: parsed.html,
    rect: parsed.rect,
    styles: parsed.styles,
    tokens: parsed.tokens,
    tokenIntents: parsed.tokenIntents,
    styleEdits: parsed.styleEdits,
    instruction: parsed.instruction,
    componentRequest: parsed.componentRequest,
    componentName: parsed.componentName,
    filePath: parsed.filePath,
    line: parsed.line,
    column: parsed.column,
    receivedAt: new Date().toISOString()
  };
  currentSession.queue.push(item);
  resolveWaiters(currentSession);
  return item;
}

async function handleGrabRequest(designMdPath: string, key: string, req: IncomingMessage, res: ServerResponse, proxyTarget?: string): Promise<void> {
  var method = req.method || "GET";
  var requestUrl = req.url || "/";
  var pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  var bridgeRoute = pathname === "/raven-grab.js" || pathname === "/tokens" || pathname === "/grab";
  if (proxyTarget && method !== "OPTIONS" && !bridgeRoute) {
    await proxyGrabRequest(proxyTarget, key, method, requestUrl, req, res);
    return;
  }
  var bodyText = await readJsonBody(req).then(function (body) {
    return JSON.stringify(body);
  }).catch(function () {
    return "";
  });
  var result = await buildGrabResponse(designMdPath, key, method, requestUrl, bodyText);
  setCorsHeaders(res);
  res.statusCode = result.status;
  for (var headerName in result.headers) {
    res.setHeader(headerName, result.headers[headerName]);
  }
  res.end(result.body);
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

var MAX_BODY_BYTES = 1024 * 1024;
var MAX_PROXY_BODY_BYTES = 25 * 1024 * 1024;
var MAX_QUEUE_LENGTH = 200;

async function proxyGrabRequest(proxyTarget: string, key: string, method: string, requestUrl: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  var targetPath = new URL(requestUrl, "http://127.0.0.1");
  var targetUrl = proxyTarget + targetPath.pathname + targetPath.search;
  var headers = new Headers();
  var strippedRequestHeaders = new Set(["host", "connection", "accept-encoding", "content-length", "transfer-encoding"]);
  for (var i = 0; i < req.rawHeaders.length; i += 2) {
    var headerName = req.rawHeaders[i];
    var headerValue = req.rawHeaders[i + 1];
    if (!strippedRequestHeaders.has(headerName.toLowerCase())) {
      headers.append(headerName, headerValue);
    }
  }

  var body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await readRawBody(req, MAX_PROXY_BODY_BYTES);
    } catch (_err) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Payload too large");
      return;
    }
  }

  try {
    var fetchBody = body ? new Uint8Array(body) : undefined;
    var upstream = await fetch(targetUrl, {
      method: method,
      headers: headers,
      body: fetchBody,
      redirect: "manual"
    });
    res.statusCode = upstream.status;
    copyProxyResponseHeaders(upstream.headers, res);
    if (method === "HEAD") {
      res.end();
      return;
    }
    var responseBody = Buffer.from(await upstream.arrayBuffer());
    var contentType = upstream.headers.get("content-type") || "";
    if (/\btext\/html\b/i.test(contentType)) {
      var html = responseBody.toString("utf8");
      var script = '<script src="/raven-grab.js?key=' + key + '"></script>';
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, function (closingTag) {
          return script + closingTag;
        });
      } else {
        html += script;
      }
      responseBody = Buffer.from(html, "utf8");
      res.setHeader("Content-Length", String(responseBody.length));
    }
    res.end(responseBody);
  } catch (err) {
    var message = err instanceof Error ? err.message : String(err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Bad gateway: " + message);
  }
}

async function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  var chunks: Buffer[] = [];
  var total = 0;
  for await (var chunk of req) {
    var buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error("Request body exceeds " + maxBytes + " bytes");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function copyProxyResponseHeaders(headers: Headers, res: ServerResponse): void {
  var strippedResponseHeaders = new Set(["content-length", "content-encoding", "transfer-encoding", "connection"]);
  headers.forEach(function (headerValue, headerName) {
    if (!strippedResponseHeaders.has(headerName.toLowerCase())) {
      res.setHeader(headerName, headerValue);
    }
  });
  var headersWithCookies = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersWithCookies.getSetCookie === "function") {
    var cookies = headersWithCookies.getSetCookie();
    if (cookies.length > 0) {
      res.setHeader("Set-Cookie", cookies);
    }
  }
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  var chunks: Buffer[] = [];
  var total = 0;
  for await (var chunk of req) {
    var buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body exceeds " + MAX_BODY_BYTES + " bytes");
    chunks.push(buf);
  }
  var text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  return JSON.parse(text);
}

interface GrabResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function buildGrabResponse(designMdPath: string, key: string, method: string, url: string, bodyText: string): Promise<GrabResponse> {
  var parsedUrl = new URL(url, "http://127.0.0.1");
  var pathname = parsedUrl.pathname;
  if (method === "OPTIONS") {
    return { status: 204, headers: {}, body: "" };
  }

  var protectedRoute = (method === "GET" && (pathname === "/raven-grab.js" || pathname === "/tokens"))
    || (method === "POST" && pathname === "/grab");
  if (protectedRoute && parsedUrl.searchParams.get("key") !== key) {
    return { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Forbidden" };
  }

  if (method === "GET" && pathname === "/raven-grab.js") {
    if (!existsSync(GRAB_ASSET_PATH)) {
      return { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "raven-grab.js not found" };
    }
    return { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8" }, body: readFileSync(GRAB_ASSET_PATH, "utf8") };
  }

  if (method === "GET" && pathname === "/tokens") {
    try {
      var raw = readFileSync(designMdPath, "utf8");
      var parsed = parseDesignMd(raw);
      var tokens = flattenDesignTokens(parsed.frontmatter);
      return {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ path: designMdPath, count: tokens.length, tokens: tokens }, null, 2)
      };
    } catch (err) {
      return {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: (err as Error).message }, null, 2)
      };
    }
  }

  if (method === "POST" && pathname === "/grab") {
    try {
      var payload = bodyText ? JSON.parse(bodyText) : {};
      var item = queueGrabSelection(payload);
      return {
        status: 202,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ queued: true, count: currentSession ? currentSession.queue.length : 0, element: item }, null, 2)
      };
    } catch (err) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: (err as Error).message }, null, 2)
      };
    }
  }

  return { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Not found" };
}

function installFetchShim(): void {
  if (originalFetch) return;
  if (typeof fetch !== "function") return;
  originalFetch = fetch.bind(globalThis);
  globalThis.fetch = (async function (input: any, init?: RequestInit): Promise<Response> {
    var request = new Request(input, init);
    var url = new URL(request.url);
    if (currentSession && url.hostname === "127.0.0.1" && Number(url.port || "0") === currentSession.port) {
      var bodyText = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
      var result = await buildGrabResponse(currentSession.path, currentSession.key, request.method, url.pathname + url.search, bodyText);
      var headers = new Headers(result.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      return new Response(result.body, { status: result.status, headers: headers });
    }
    return originalFetch!(input, init);
  }) as typeof fetch;
}

function uninstallFetchShim(): void {
  if (!originalFetch) return;
  globalThis.fetch = originalFetch;
  originalFetch = null;
}

function allocateShimPort(): number {
  return 30000 + Math.floor(Math.random() * 20000);
}

function drainCurrentQueue(session: BridgeSession): GrabBridgeDrainResult {
  var items = session.queue.splice(0);
  return { count: items.length, elements: items };
}

function resolveWaiters(session: BridgeSession): void {
  if (session.queue.length === 0 || session.waiters.length === 0) return;
  var items = session.queue.splice(0);
  var waiters = session.waiters.splice(0);
  for (var i = 0; i < waiters.length; i++) {
    waiters[i](items);
  }
}

function waitForGrabItems(session: BridgeSession, timeoutMs: number): Promise<GrabBridgeSelection[]> {
  return new Promise(function (resolveItems) {
    var wrapper = function (items: GrabBridgeSelection[]) {
      clearTimeout(timer);
      var idx = session.waiters.indexOf(wrapper);
      if (idx !== -1) session.waiters.splice(idx, 1);
      resolveItems(items);
    };
    var timer = setTimeout(function () {
      var idx = session.waiters.indexOf(wrapper);
      if (idx !== -1) session.waiters.splice(idx, 1);
      resolveItems([]);
    }, timeoutMs);

    session.waiters.push(wrapper);
  });
}
