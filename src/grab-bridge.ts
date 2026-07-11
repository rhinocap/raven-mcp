import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { flattenDesignTokens, parseDesignMd, updateDesignMd, type DesignMdNode } from "./designmd.js";

var __dirname = dirname(fileURLToPath(import.meta.url));
var PKG_ROOT = resolve(join(__dirname, ".."));
var GRAB_ASSET_PATH = process.env.RAVEN_GRAB_ASSET_PATH ? resolve(process.env.RAVEN_GRAB_ASSET_PATH) : join(PKG_ROOT, "browser", "raven-grab.js");
type GrabRole = "consumer" | "maintainer";

var GrabRectSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  top: z.number().optional(),
  right: z.number().optional(),
  bottom: z.number().optional(),
  left: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional()
}).passthrough();
var GrabStylesSchema = z.record(z.string());
var GrabTokenSchema = z.object({
  property: z.string().optional(),
  cssVar: z.string().optional(),
  value: z.string().optional(),
  name: z.string().optional(),
  group: z.string().optional(),
  path: z.string().optional(),
  bridgeToken: z.object({ path: z.string().optional() }).passthrough().nullable().optional()
}).passthrough();
var GrabStateDeclarationSchema = z.object({
  property: z.string(),
  value: z.string(),
  important: z.boolean().optional()
}).passthrough();
var GrabStateStyleSchema = z.object({
  declarations: z.array(GrabStateDeclarationSchema),
  tokens: z.array(GrabTokenSchema).optional(),
  active: z.boolean().optional()
}).passthrough();
var GrabStateStylesSchema = z.record(GrabStateStyleSchema);
var GrabTokenIntentSchema = z.object({
  property: z.string(),
  oldToken: z.string(),
  oldTokenPath: z.string(),
  newToken: z.string().optional(),
  newTokenPath: z.string().optional(),
  newTokenValue: z.string().optional()
}).passthrough();
var GrabStyleEditSchema = z.object({
  property: z.string(),
  oldValue: z.string(),
  newValue: z.string()
}).passthrough();
var GrabMultiSelectionSchema = z.object({
  index: z.number().int().min(1),
  selector: z.string().min(1),
  html: z.string(),
  rect: GrabRectSchema,
  styles: GrabStylesSchema
}).passthrough();

type GrabRect = z.infer<typeof GrabRectSchema>;
type GrabStyles = z.infer<typeof GrabStylesSchema>;
type GrabToken = z.infer<typeof GrabTokenSchema>;
type GrabStateStyles = z.infer<typeof GrabStateStylesSchema>;
type GrabTokenIntent = z.infer<typeof GrabTokenIntentSchema>;
type GrabStyleEdit = z.infer<typeof GrabStyleEditSchema>;
type GrabMultiSelection = z.infer<typeof GrabMultiSelectionSchema>;

var GrabPayloadSchema = z.object({
  selector: z.string().min(1),
  html: z.string().optional(),
  rect: GrabRectSchema.optional(),
  styles: GrabStylesSchema.optional(),
  tokens: z.array(GrabTokenSchema).optional(),
  stateStyles: GrabStateStylesSchema.optional(),
  tokenIntents: z.array(GrabTokenIntentSchema).optional(),
  styleEdits: z.array(GrabStyleEditSchema).optional(),
  multiSelect: z.array(GrabMultiSelectionSchema).optional(),
  instruction: z.string().optional(),
  intent: z.literal("create-component").optional(),
  userNotes: z.string().optional(),
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

var TemplateSlotSchema = z.object({
  slotId: z.string().min(1),
  selector: z.string().min(1),
  role: z.enum(["fixed", "flexible"])
}).strict();
var TemplatePayloadSchema = z.object({
  page: z.string().min(1),
  templateId: z.string().min(1).optional().default("default"),
  slots: z.array(TemplateSlotSchema)
}).strict();
var TemplateValidationResultSchema = z.object({
  slotId: z.string().min(1),
  selector: z.string().min(1),
  resolved: z.boolean()
}).strict();
var TemplateValidationPayloadSchema = z.object({
  page: z.string().min(1),
  results: z.array(TemplateValidationResultSchema)
}).strict();
var LayersPayloadSchema = z.object({
  page: z.string().min(1),
  tree: z.unknown()
}).strict().refine(function (payload) {
  return Object.prototype.hasOwnProperty.call(payload, "tree");
}, { message: "tree is required" });
var MeasuredRectSchema = z.object({
  selector: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
}).strict();
var LayersIntentSchema = z.object({
  operation: z.literal("reorder"),
  page: z.string().min(1),
  parentSelector: z.string().min(1),
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
  orderedSelectors: z.array(z.string().min(1)),
  selectionOrder: z.array(z.number().int().min(1)).optional(),
  measuredRects: z.array(MeasuredRectSchema),
  approximate: z.boolean(),
  domSnapshotHash: z.string().min(1)
}).strict().refine(function (intent) {
  return intent.fromIndex !== intent.toIndex
    && intent.orderedSelectors.length >= 2
    && intent.fromIndex < intent.orderedSelectors.length
    && intent.toIndex < intent.orderedSelectors.length;
}, { message: "reorder intent must have distinct in-bounds fromIndex/toIndex within orderedSelectors" });

type TemplateSlot = z.infer<typeof TemplateSlotSchema>;
type TemplateValidationResult = z.infer<typeof TemplateValidationResultSchema>;
type LayersIntent = z.infer<typeof LayersIntentSchema>;
type GrabOperationState = "proposed" | "previewed" | "applied" | "rejected";

export interface GrabOperation {
  id: string;
  state: GrabOperationState;
  intent: LayersIntent;
  receivedAt: string;
}

export interface GrabBridgeSelection {
  selector: string;
  html?: string;
  rect?: GrabRect;
  styles?: GrabStyles;
  tokens?: GrabToken[];
  stateStyles?: GrabStateStyles;
  tokenIntents?: GrabTokenIntent[];
  styleEdits?: GrabStyleEdit[];
  multiSelect?: GrabMultiSelection[];
  instruction?: string;
  intent?: "create-component";
  userNotes?: string;
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
  destination: {
    active: string;
    component_requests: string;
    team_setup: string;
  };
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
  role: GrabRole;
  queue: GrabBridgeSelection[];
  waiters: Array<(items: GrabBridgeSelection[]) => void>;
  layersSnapshot: Record<string, { page: string; tree: unknown; receivedAt: string }>;
  templateValidation: Record<string, TemplateValidationResult[]>;
  operations: GrabOperation[];
}

var currentSession: BridgeSession | null = null;
var originalFetch: typeof fetch | null = null;

function grabRoleConfigTag(role: GrabRole): string {
  return role === "maintainer" ? '<script>window.ravenGrabConfig={"role":"maintainer"};</script>' : "";
}

export async function startGrabSession(path: string, port?: number, proxyTarget?: string, role: GrabRole = "consumer"): Promise<GrabBridgeStartResult> {
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
    void handleGrabRequest(abs, key, req, res, normalizedTarget, role);
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
      role: role,
      queue: [],
      waiters: [],
      layersSnapshot: Object.create(null),
      templateValidation: Object.create(null),
      operations: []
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
      role: role,
      queue: [],
      waiters: [],
      layersSnapshot: Object.create(null),
      templateValidation: Object.create(null),
      operations: []
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
    script_tag: grabRoleConfigTag(role) + '<script src="http://127.0.0.1:' + actualPort + '/raven-grab.js?key=' + key + '"></script>',
    path: abs,
    mode: mode,
    destination: {
      active: "agent-session",
      component_requests: "Overlay component requests are delivered to this live agent session. Drain them with get_grabbed_elements.",
      team_setup: "For team routing, host an endpoint with the semantics of web/app/api/component-request/route.ts, set COMPONENT_REQUEST_GITHUB_REPO=<owner/repo>, and optionally set COMPONENT_REQUEST_GITHUB_TOKEN with issues:write scope to create structured issues automatically. Without the token, the overlay opens a prefilled new-issue link; with neither environment variable, it falls back to a copy packet; point RavenGrabConfig.componentRequestEndpoint at the hosted endpoint."
    },
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
    stateStyles: parsed.stateStyles,
    tokenIntents: parsed.tokenIntents,
    styleEdits: parsed.styleEdits,
    instruction: parsed.instruction,
    intent: parsed.intent,
    userNotes: parsed.userNotes,
    componentRequest: parsed.componentRequest,
    componentName: parsed.componentName,
    filePath: parsed.filePath,
    line: parsed.line,
    column: parsed.column,
    receivedAt: new Date().toISOString()
  };
  if (parsed.multiSelect !== undefined) item.multiSelect = parsed.multiSelect;
  currentSession.queue.push(item);
  resolveWaiters(currentSession);
  return item;
}

export function getPageTemplate(page: string): { templateId: string; page: string; slots: Array<TemplateSlot & { orphaned?: boolean; validated?: false }>; validation: TemplateValidationResult[] | null } {
  var session = requireGrabSession();
  var raw = readFileSync(session.path, "utf8");
  var parsed = parseDesignMd(raw);
  var templates = objectNode(parsed.frontmatter.templates);
  var templateIds = Object.keys(templates);
  var templateId = "default";
  var slotNode: DesignMdNode = {};
  for (var i = 0; i < templateIds.length; i++) {
    var candidateId = templateIds[i];
    var candidate = objectNode(templates[candidateId]);
    var pages = objectNode(candidate.pages);
    var pageKey = encodePageKey(page);
    if (pages[pageKey] !== undefined) {
      templateId = candidateId;
      var storedSlots = objectNode(pages[pageKey]).slots;
      if (typeof storedSlots === "string") {
        try {
          slotNode = objectNode(JSON.parse(storedSlots));
        } catch (_err) {
          slotNode = {};
        }
      } else {
        slotNode = objectNode(storedSlots);
      }
      break;
    }
  }
  var validation = session.templateValidation[page] || null;
  var slots = Object.keys(slotNode).map(function (slotId) {
    var stored = objectNode(slotNode[slotId]);
    var slot: TemplateSlot & { orphaned?: boolean; validated?: false } = {
      slotId: slotId,
      selector: typeof stored.selector === "string" ? stored.selector : "",
      role: stored.role === "fixed" ? "fixed" : "flexible"
    };
    if (!validation) {
      slot.validated = false;
    } else {
      var result = validation.find(function (entry) { return entry.slotId === slotId && entry.selector === slot.selector; });
      if (result && !result.resolved) slot.orphaned = true;
    }
    return slot;
  });
  return { templateId: templateId, page: page, slots: slots, validation: validation };
}

export function setTemplateSlots(page: string, templateId: string, slots: unknown): { saved: true; count: number } {
  var session = requireGrabSession();
  var parsedSlots = z.array(TemplateSlotSchema).parse(slots);
  if (!/^[A-Za-z0-9_-]+$/.test(templateId)) {
    throw new Error("templateId must contain only letters, digits, hyphens, and underscores: " + templateId);
  }
  var slotValues: DesignMdNode = Object.create(null);
  for (var i = 0; i < parsedSlots.length; i++) {
    var slotId = parsedSlots[i].slotId;
    if (slotId === "__proto__" || slotId === "constructor" || slotId === "prototype") {
      throw new Error("slotId is not allowed: " + slotId);
    }
    if (Object.prototype.hasOwnProperty.call(slotValues, slotId)) {
      throw new Error("Duplicate slotId: " + slotId);
    }
    slotValues[slotId] = { role: parsedSlots[i].role, selector: parsedSlots[i].selector };
  }
  updateDesignMd(session.path, {
    set: {
      group: "templates",
      name: templateId + ".pages." + encodePageKey(page) + ".slots",
      value: JSON.stringify(slotValues)
    }
  });
  return { saved: true, count: parsedSlots.length };
}

export function listTemplates(): Array<{ templateId: string; pages: string[] }> {
  var session = requireGrabSession();
  var parsed = parseDesignMd(readFileSync(session.path, "utf8"));
  var templates = objectNode(parsed.frontmatter.templates);
  return Object.keys(templates).map(function (templateId) {
    return { templateId: templateId, pages: Object.keys(objectNode(objectNode(templates[templateId]).pages)).map(decodePageKey) };
  });
}

export function getGrabLayers(page?: string): unknown {
  var session = requireGrabSession();
  if (page !== undefined) return session.layersSnapshot[page] || null;
  return Object.keys(session.layersSnapshot).map(function (key) { return session.layersSnapshot[key]; });
}

export function moveGrabLayer(intent: unknown): GrabOperation {
  var parsed = LayersIntentSchema.parse(intent);
  return createGrabOperation(parsed, parsed.measuredRects.length > 0 ? "previewed" : "proposed");
}

export function getGrabOperation(operationId?: string, mark?: "applied" | "rejected"): GrabOperation | GrabOperation[] {
  var session = requireGrabSession();
  if (!operationId) {
    if (mark) throw new Error("operationId is required when mark is provided");
    return session.operations.slice();
  }
  var operation = session.operations.find(function (item) { return item.id === operationId; });
  if (!operation) throw new Error("Grab operation not found: " + operationId);
  if (mark) {
    if (operation.state !== "previewed") {
      throw new Error("Only previewed operations can be marked applied or rejected");
    }
    operation.state = mark;
  }
  return operation;
}

function requireGrabSession(): BridgeSession {
  if (!currentSession) throw new Error("No active grab session");
  return currentSession;
}

function objectNode(value: unknown): DesignMdNode {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DesignMdNode : {};
}

function encodePageKey(page: string): string {
  return encodeURIComponent(page).replace(/\./g, "%2E");
}

function decodePageKey(page: string): string {
  return decodeURIComponent(page);
}

function createGrabOperation(intent: LayersIntent, state: GrabOperationState): GrabOperation {
  var session = requireGrabSession();
  var operation: GrabOperation = {
    id: randomBytes(16).toString("hex"),
    state: state,
    intent: intent,
    receivedAt: new Date().toISOString()
  };
  session.operations.push(operation);
  if (session.operations.length > MAX_QUEUE_LENGTH) session.operations.splice(0, session.operations.length - MAX_QUEUE_LENGTH);
  return operation;
}

async function handleGrabRequest(designMdPath: string, key: string, req: IncomingMessage, res: ServerResponse, proxyTarget?: string, role: GrabRole = "consumer"): Promise<void> {
  var method = req.method || "GET";
  var requestUrl = req.url || "/";
  var pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  var bridgeRoute = pathname === "/raven-grab.js" || pathname === "/tokens" || pathname === "/grab"
    || pathname === "/template" || pathname === "/template-validation" || pathname === "/layers" || pathname === "/layers-intent";
  if (proxyTarget && method !== "OPTIONS" && !bridgeRoute) {
    await proxyGrabRequest(proxyTarget, key, method, requestUrl, req, res, role);
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

async function proxyGrabRequest(proxyTarget: string, key: string, method: string, requestUrl: string, req: IncomingMessage, res: ServerResponse, role: GrabRole): Promise<void> {
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
      var script = grabRoleConfigTag(role) + '<script src="/raven-grab.js?key=' + key + '"></script>';
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

  var protectedRoute = (method === "GET" && (pathname === "/raven-grab.js" || pathname === "/tokens" || pathname === "/template"))
    || (method === "POST" && (pathname === "/grab" || pathname === "/template" || pathname === "/template-validation" || pathname === "/layers" || pathname === "/layers-intent"));
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

  if (method === "POST" && pathname === "/template") {
    try {
      var templatePayload = TemplatePayloadSchema.parse(bodyText ? JSON.parse(bodyText) : {});
      return jsonResponse(200, setTemplateSlots(templatePayload.page, templatePayload.templateId, templatePayload.slots));
    } catch (err) {
      return jsonResponse(400, { error: (err as Error).message });
    }
  }

  if (method === "GET" && pathname === "/template") {
    try {
      var page = z.string().min(1).parse(parsedUrl.searchParams.get("page"));
      return jsonResponse(200, getPageTemplate(page));
    } catch (err) {
      return jsonResponse(400, { error: (err as Error).message });
    }
  }

  if (method === "POST" && pathname === "/template-validation") {
    try {
      var validationPayload = TemplateValidationPayloadSchema.parse(bodyText ? JSON.parse(bodyText) : {});
      requireGrabSession().templateValidation[validationPayload.page] = validationPayload.results;
      return jsonResponse(200, { ok: true });
    } catch (err) {
      return jsonResponse(400, { error: (err as Error).message });
    }
  }

  if (method === "POST" && pathname === "/layers") {
    try {
      var layersPayload = LayersPayloadSchema.parse(bodyText ? JSON.parse(bodyText) : {});
      requireGrabSession().layersSnapshot[layersPayload.page] = { page: layersPayload.page, tree: layersPayload.tree, receivedAt: new Date().toISOString() };
      return jsonResponse(200, { ok: true });
    } catch (err) {
      return jsonResponse(400, { error: (err as Error).message });
    }
  }

  if (method === "POST" && pathname === "/layers-intent") {
    try {
      var layersIntent = LayersIntentSchema.parse(bodyText ? JSON.parse(bodyText) : {});
      var operation = createGrabOperation(layersIntent, layersIntent.measuredRects.length > 0 ? "previewed" : "proposed");
      return jsonResponse(202, { queued: true, operationId: operation.id });
    } catch (err) {
      return jsonResponse(400, { error: (err as Error).message });
    }
  }

  return { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Not found" };
}

function jsonResponse(status: number, value: unknown): GrabResponse {
  return { status: status, headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(value, null, 2) };
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
