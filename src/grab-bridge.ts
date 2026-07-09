import { createServer, type IncomingMessage, type ServerResponse } from "http";
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
  instruction: z.string().optional(),
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
  instruction?: string;
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
  warning?: string;
}

export interface GrabBridgeDrainResult {
  count: number;
  elements: GrabBridgeSelection[];
}

interface BridgeSession {
  server: ReturnType<typeof createServer>;
  port: number;
  path: string;
  mode: "server" | "shim";
  queue: GrabBridgeSelection[];
  waiters: Array<(items: GrabBridgeSelection[]) => void>;
}

var currentSession: BridgeSession | null = null;
var originalFetch: typeof fetch | null = null;

export async function startGrabSession(path: string, port?: number): Promise<GrabBridgeStartResult> {
  await stopGrabSession();
  var abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error("DESIGN.md not found at " + abs);
  }

  var server = createServer(function (req, res) {
    void handleGrabRequest(abs, req, res);
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
      path: abs,
      mode: "server",
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
      path: abs,
      mode: "shim",
      queue: [],
      waiters: []
    };
  }

  var mode = currentSession.mode;
  return {
    port: actualPort,
    url: "http://127.0.0.1:" + actualPort,
    script_tag: '<script src="http://127.0.0.1:' + actualPort + '/raven-grab.js"></script>',
    path: abs,
    mode: mode,
    warning: mode === "shim"
      ? "Sandboxed environment: no real HTTP server is listening — the bridge only answers in-process fetch() calls. A browser cannot reach this session."
      : undefined
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
    instruction: parsed.instruction,
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

async function handleGrabRequest(designMdPath: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  var bodyText = await readJsonBody(req).then(function (body) {
    return JSON.stringify(body);
  }).catch(function () {
    return "";
  });
  var result = await buildGrabResponse(designMdPath, req.method || "GET", req.url || "/", bodyText);
  setCorsHeaders(res);
  res.statusCode = result.status;
  for (var key in result.headers) {
    res.setHeader(key, result.headers[key]);
  }
  res.end(result.body);
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

var MAX_BODY_BYTES = 1024 * 1024;
var MAX_QUEUE_LENGTH = 200;

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

async function buildGrabResponse(designMdPath: string, method: string, url: string, bodyText: string): Promise<GrabResponse> {
  if (method === "OPTIONS") {
    return { status: 204, headers: {}, body: "" };
  }

  if (method === "GET" && url === "/raven-grab.js") {
    if (!existsSync(GRAB_ASSET_PATH)) {
      return { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "raven-grab.js not found" };
    }
    return { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8" }, body: readFileSync(GRAB_ASSET_PATH, "utf8") };
  }

  if (method === "GET" && url === "/tokens") {
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

  if (method === "POST" && url === "/grab") {
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
      var result = await buildGrabResponse(currentSession.path, request.method, url.pathname, bodyText);
      return new Response(result.body, { status: result.status, headers: result.headers });
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
