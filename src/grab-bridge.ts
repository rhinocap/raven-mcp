import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { z } from "zod";
import { flattenDesignTokens, parseDesignMd, readDesignMd, updateDesignMd, type DesignMdNode } from "./designmd.js";

var __dirname = dirname(fileURLToPath(import.meta.url));
var PKG_ROOT = resolve(join(__dirname, ".."));
var GRAB_ASSET_PATH = process.env.RAVEN_GRAB_ASSET_PATH ? resolve(process.env.RAVEN_GRAB_ASSET_PATH) : join(PKG_ROOT, "browser", "raven-grab.js");
var RAVEN_VERSION = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).version || "";
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
  role: z.enum(["fixed", "flexible"]).default("fixed"),
  note: z.string().trim().max(2000).optional()
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
type ComponentSubtree = { selector: string; children: ComponentSubtree[] };
var ComponentSubtreeSchema: z.ZodType<ComponentSubtree> = z.lazy(function () {
  return z.object({
    selector: z.string().min(1),
    children: z.array(ComponentSubtreeSchema)
  }).strict();
});
var ComponentArtifactSchema = z.object({
  componentId: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, "componentId must contain only letters, digits, hyphens, and underscores"),
  name: z.string().min(1),
  page: z.string().min(1),
  rootSelector: z.string().min(1),
  subtree: ComponentSubtreeSchema,
  note: z.string().trim().max(2000).optional(),
  capturedAt: z.string().optional()
}).strict();
var ComponentPayloadSchema = ComponentArtifactSchema;
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
var LayersReorderIntentSchema = z.object({
  operation: z.literal("reorder"),
  page: z.string().min(1),
  parentSelector: z.string().min(1),
  fromSelector: z.string().min(1).optional(),
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
  orderedSelectors: z.array(z.string().min(1)),
  baselineOrder: z.array(z.string().min(1)).optional(),
  selectionOrder: z.array(z.number().int().min(1)).optional(),
  measuredRects: z.array(MeasuredRectSchema),
  approximate: z.boolean(),
  domSnapshotHash: z.string().min(1),
  movedRole: z.enum(["fixed", "flexible"]).optional(),
  fixedMove: z.boolean().optional(),
  note: z.string().trim().max(2000).optional()
}).strict().refine(function (intent) {
  return intent.fromIndex !== intent.toIndex
    && intent.orderedSelectors.length >= 2
    && intent.fromIndex < intent.orderedSelectors.length
    && intent.toIndex < intent.orderedSelectors.length;
}, { message: "reorder intent must have distinct in-bounds fromIndex/toIndex within orderedSelectors" }).refine(function (intent) {
  return intent.fixedMove !== true || intent.movedRole === "fixed";
}, { message: "fixedMove true requires movedRole fixed" }).refine(function (intent) {
  return intent.movedRole !== "fixed" || intent.fixedMove === true;
}, { message: "movedRole fixed requires fixedMove true" });

var LayersReparentIntentSchema = z.object({
  operation: z.literal("reparent"),
  page: z.string().min(1),
  fromParentSelector: z.string().min(1),
  toParentSelector: z.string().min(1),
  fromSelector: z.string().min(1).optional(),
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
  orderedSelectors: z.array(z.string().min(1)),
  baselineOrder: z.array(z.string().min(1)).optional(),
  toBaselineOrder: z.array(z.string().min(1)).optional(),
  selectionOrder: z.array(z.number().int().min(1)).optional(),
  measuredRects: z.array(MeasuredRectSchema),
  approximate: z.boolean(),
  domSnapshotHash: z.string().min(1),
  toDomSnapshotHash: z.string().min(1).optional(),
  movedRole: z.enum(["fixed", "flexible"]).optional(),
  fixedMove: z.boolean().optional(),
  note: z.string().trim().max(2000).optional()
}).strict().refine(function (intent) {
  return intent.fromParentSelector !== intent.toParentSelector
    && intent.orderedSelectors.length >= 1
    && intent.toIndex >= 0
    && intent.toIndex < intent.orderedSelectors.length
    && intent.fromIndex >= 0;
}, { message: "reparent intent must name distinct parents and an in-bounds toIndex within orderedSelectors" }).refine(function (intent) {
  return intent.fixedMove !== true || intent.movedRole === "fixed";
}, { message: "fixedMove true requires movedRole fixed" }).refine(function (intent) {
  return intent.movedRole !== "fixed" || intent.fixedMove === true;
}, { message: "movedRole fixed requires fixedMove true" });

var LayersIntentSchema = z.union([LayersReorderIntentSchema, LayersReparentIntentSchema]);

type TemplateSlot = z.infer<typeof TemplateSlotSchema>;
type TemplateValidationResult = z.infer<typeof TemplateValidationResultSchema>;
type LayersIntent = z.infer<typeof LayersIntentSchema>;
type LayersReorderIntent = z.infer<typeof LayersReorderIntentSchema>;
type LayersReparentIntent = z.infer<typeof LayersReparentIntentSchema>;

function layerIntentParentKeys(intent: LayersIntent): string[] {
  if (intent.operation === "reparent") return [intent.fromParentSelector, intent.toParentSelector];
  return [intent.parentSelector];
}

function layerIntentPrimaryParent(intent: LayersIntent): string {
  if (intent.operation === "reparent") return intent.toParentSelector;
  return intent.parentSelector;
}
type GrabOperationState = "proposed" | "previewed" | "applied" | "rejected";
type GrabStyleState = "sent" | "applied" | "rejected" | "superseded";

interface GrabChangeEnvelope {
  id: string;
  batchId: string;
  sequence: number;
  kind: "reorder" | "style";
  target: string;
  payload: unknown;
  state: GrabOperationState | GrabStyleState;
  receivedAt: string;
  updatedAt: string;
}

export interface GrabOperation extends GrabChangeEnvelope {
  kind: "reorder";
  payload: LayersIntent;
  state: GrabOperationState;
  intent: LayersIntent;
}

export interface GrabBridgeSelection extends GrabChangeEnvelope {
  kind: "style";
  payload: Record<string, unknown>;
  state: GrabStyleState;
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
  drainedAt?: string;
  supersededProperties?: string[];
}

interface GrabBatchCommit {
  batchId: string;
  committedAt: string;
  deliveredAt?: string;
}

interface GrabBatchResult {
  batchId: string | null;
  committedAt: string | null;
  changes: Array<GrabOperation | GrabBridgeSelection>;
  pending: Array<GrabOperation | GrabBridgeSelection>;
}

export interface GrabBridgeStartResult {
  port: number;
  url: string;
  script_tag: string;
  wait_url: string;
  watch_command: string;
  path: string;
  project_name: string;
  raven_version: string;
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
  batchCommit?: { batchId: string; committedAt: string };
  batch?: GrabBatchResult;
}

interface BridgeSession {
  server: ReturnType<typeof createServer>;
  port: number;
  key: string;
  path: string;
  projectName: string;
  mode: "server" | "shim";
  proxyTarget?: string;
  role: GrabRole;
  queue: GrabBridgeSelection[];
  waiters: Array<(result: GrabBridgeDrainResult) => void>;
  layersSnapshot: Record<string, { page: string; tree: unknown; receivedAt: string }>;
  templateValidation: Record<string, TemplateValidationResult[]>;
  operations: GrabOperation[];
  currentBatchId: string | null;
  nextSequence: number;
  batchCommits: Record<string, GrabBatchCommit>;
}

var currentSession: BridgeSession | null = null;
var originalFetch: typeof fetch | null = null;

function grabProjectName(designMdPath: string): string {
  try {
    var name = readDesignMd(designMdPath).frontmatter.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch (_err) {
    // Session startup already validates the file; naming should not block the bridge.
  }
  return basename(process.cwd()) || "";
}

function grabConfigTag(role: GrabRole, projectName: string, bridgeOrigin: string): string {
  var config: Record<string, string> = {
    bridgeOrigin: bridgeOrigin,
    projectName: projectName,
    ravenVersion: RAVEN_VERSION
  };
  if (role === "maintainer") config.role = "maintainer";
  // A DESIGN.md name can contain markup; escaping '<' keeps it data inside the
  // bootstrap script instead of letting local project metadata close the tag.
  // The replacement must be the six-character sequence backslash-u-0-0-3-c, not
  // "\u003c" -- that literal IS '<', so the old version replaced the character
  // with itself and a project named "</script><script>..." executed in the host page.
  var serialized = JSON.stringify(config).replace(/</g, "\\u003c");
  return '<script>window.ravenGrabConfig=' + serialized + ';</script>';
}

export async function startGrabSession(path?: string, port?: number, proxyTarget?: string, role: GrabRole = "consumer"): Promise<GrabBridgeStartResult> {
  await stopGrabSession();
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

  var abs: string;
  if (path === undefined || path === null || path.trim() === "") {
    if (normalizedTarget === undefined) {
      throw new Error("start_grab_session requires either 'path' (to a DESIGN.md file) or 'proxy_target' (a running local dev server).");
    }
    var tempDesignPath = join(tmpdir(), "raven-grab-design-" + randomBytes(8).toString("hex") + ".md");
    writeFileSync(tempDesignPath, "# Design\n\n## Tokens\n\n", "utf8");
    abs = tempDesignPath;
  } else {
    abs = resolve(path);
    if (!existsSync(abs)) {
      throw new Error("DESIGN.md not found at " + abs);
    }
  }

  var key = randomBytes(32).toString("hex");
  var projectName = grabProjectName(abs);

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
      projectName: projectName,
      mode: "server",
      proxyTarget: normalizedTarget,
      role: role,
      queue: [],
      waiters: [],
      layersSnapshot: Object.create(null),
      templateValidation: Object.create(null),
      operations: [],
      currentBatchId: null,
      nextSequence: 1,
      batchCommits: Object.create(null)
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
      projectName: projectName,
      mode: "shim",
      role: role,
      queue: [],
      waiters: [],
      layersSnapshot: Object.create(null),
      templateValidation: Object.create(null),
      operations: [],
      currentBatchId: null,
      nextSequence: 1,
      batchCommits: Object.create(null)
    };
  }

  var mode = currentSession.mode;
  var warning = mode === "shim"
    ? "Sandboxed environment: no real HTTP server is listening — the bridge only answers in-process fetch() calls. A browser cannot reach this session."
    : undefined;
  if (warning && normalizedTarget) {
    warning += " proxy_target is ignored in shim mode.";
  }
  var bridgeUrl = "http://127.0.0.1:" + actualPort;
  // Watcher only exists in server mode — shim has no HTTP listener for curl to reach.
  var waitUrl = mode === "server" ? bridgeUrl + "/agent/wait?key=" + key + "&timeout_ms=240000" : "";
  var watchCommand = waitUrl
    ? "f=0; while :; do r=$(curl -sf '" + waitUrl + "') || { f=$((f+1)); [ \"$f\" -ge 5 ] && exit 1; sleep 2; continue; }; f=0; if [ -n \"$r\" ] && { ! printf '%s' \"$r\" | grep -q '\"count\": 0' || printf '%s' \"$r\" | grep -q '\"batchCommit\"'; }; then printf '%s\\n' \"$r\"; exit 0; fi; done"
    : "";
  return {
    port: actualPort,
    url: bridgeUrl,
    script_tag: grabConfigTag(role, projectName, bridgeUrl) + '<script src="http://127.0.0.1:' + actualPort + '/raven-grab.js?key=' + key + '"></script>',
    wait_url: waitUrl,
    watch_command: watchCommand,
    path: abs,
    project_name: projectName,
    raven_version: RAVEN_VERSION,
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
    resolveItems({ count: 0, elements: [] });
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

  if (hasDrainableChanges(currentSession)) {
    return drainCurrentQueue(currentSession);
  }

  if (!timeoutMs || timeoutMs <= 0) {
    return { count: 0, elements: [] };
  }

  return waitForGrabItems(currentSession, timeoutMs);
}

export function queueGrabSelection(selection: unknown): GrabBridgeSelection {
  if (!currentSession) {
    throw new Error("No active grab session");
  }

  if (pendingChangeCount(currentSession) >= MAX_QUEUE_LENGTH) {
    throw new Error("Grab queue is full (" + MAX_QUEUE_LENGTH + "); drain with get_grabbed_elements");
  }
  var parsed = GrabPayloadSchema.parse(selection);
  var now = new Date().toISOString();
  var batch = nextChangePosition(currentSession);
  var payload = { ...parsed } as Record<string, unknown>;
  var item: GrabBridgeSelection = {
    id: randomBytes(16).toString("hex"),
    batchId: batch.batchId,
    sequence: batch.sequence,
    kind: "style",
    target: parsed.selector,
    payload: payload,
    state: "sent",
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
    receivedAt: now,
    updatedAt: now
  };
  if (parsed.multiSelect !== undefined) item.multiSelect = parsed.multiSelect;
  supersedeOlderStyleProperties(currentSession, item);
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
      role: stored.role === "flexible" ? "flexible" : "fixed"
    };
    if (typeof stored.note === "string") slot.note = stored.note;
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
    var parsedSlot = parsedSlots[i];
    var slotId = parsedSlot.slotId;
    if (slotId === "__proto__" || slotId === "constructor" || slotId === "prototype") {
      throw new Error("slotId is not allowed: " + slotId);
    }
    if (Object.prototype.hasOwnProperty.call(slotValues, slotId)) {
      throw new Error("Duplicate slotId: " + slotId);
    }
    var slotValue: DesignMdNode = { role: parsedSlot.role, selector: parsedSlot.selector };
    if (parsedSlot.note !== undefined) slotValue.note = parsedSlot.note;
    slotValues[slotId] = slotValue;
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

export function setComponent(artifact: unknown): { saved: true; componentId: string } {
  var session = requireGrabSession();
  var parsed = ComponentArtifactSchema.parse(artifact);
  if (parsed.componentId === "__proto__" || parsed.componentId === "constructor" || parsed.componentId === "prototype") {
    throw new Error("componentId is not allowed: " + parsed.componentId);
  }
  var record: DesignMdNode = {
    name: parsed.name,
    page: parsed.page,
    rootSelector: parsed.rootSelector,
    subtree: JSON.stringify(parsed.subtree),
    capturedAt: parsed.capturedAt || new Date().toISOString()
  };
  if (parsed.note !== undefined) record.note = parsed.note;
  updateDesignMd(session.path, {
    set: {
      group: "components",
      name: parsed.componentId,
      value: JSON.stringify(record)
    }
  });
  return { saved: true, componentId: parsed.componentId };
}

export function listComponents(page?: string): Array<{ componentId: string; name: string; page: string; rootSelector: string }> {
  var session = requireGrabSession();
  var parsed = parseDesignMd(readFileSync(session.path, "utf8"));
  var components = objectNode(parsed.frontmatter.components);
  return Object.keys(components).map(function (componentId) {
    var raw = components[componentId];
    var stored: DesignMdNode = {};
    if (typeof raw === "string") {
      try { stored = objectNode(JSON.parse(raw)); } catch (_err) { stored = {}; }
    } else {
      stored = objectNode(raw);
    }
    return {
      componentId: componentId,
      name: typeof stored.name === "string" ? stored.name : componentId,
      page: typeof stored.page === "string" ? stored.page : "",
      rootSelector: typeof stored.rootSelector === "string" ? stored.rootSelector : ""
    };
  }).filter(function (entry) {
    return !page || entry.page === page;
  });
}

export function getComponent(componentId: string): { componentId: string; name: string; page: string; rootSelector: string; subtree: ComponentSubtree | null; note?: string; capturedAt?: string } {
  var session = requireGrabSession();
  var parsed = parseDesignMd(readFileSync(session.path, "utf8"));
  var components = objectNode(parsed.frontmatter.components);
  if (components[componentId] === undefined) {
    throw new Error("Component not found: " + componentId);
  }
  var raw = components[componentId];
  var stored: DesignMdNode = {};
  if (typeof raw === "string") {
    try { stored = objectNode(JSON.parse(raw)); } catch (_err) { stored = {}; }
  } else {
    stored = objectNode(raw);
  }
  var subtree: ComponentSubtree | null = null;
  if (typeof stored.subtree === "string") {
    try { subtree = JSON.parse(stored.subtree) as ComponentSubtree; } catch (_err) { subtree = null; }
  } else if (stored.subtree && typeof stored.subtree === "object") {
    subtree = stored.subtree as unknown as ComponentSubtree;
  }
  var result: { componentId: string; name: string; page: string; rootSelector: string; subtree: ComponentSubtree | null; note?: string; capturedAt?: string } = {
    componentId: componentId,
    name: typeof stored.name === "string" ? stored.name : componentId,
    page: typeof stored.page === "string" ? stored.page : "",
    rootSelector: typeof stored.rootSelector === "string" ? stored.rootSelector : "",
    subtree: subtree
  };
  if (typeof stored.note === "string") result.note = stored.note;
  if (typeof stored.capturedAt === "string") result.capturedAt = stored.capturedAt;
  return result;
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

export function getGrabOperation(operationId?: string, mark?: "applied" | "rejected", batch?: boolean): GrabOperation | GrabBridgeSelection | GrabOperation[] | GrabBatchResult {
  var session = requireGrabSession();
  if (batch) {
    if (operationId || mark) throw new Error("batch cannot be combined with operation_id or mark");
    return getGrabBatch(session);
  }
  if (!operationId) {
    if (mark) throw new Error("operationId is required when mark is provided");
    return session.operations.slice();
  }
  var operation: GrabOperation | GrabBridgeSelection | undefined = session.operations.find(function (item) { return item.id === operationId; });
  if (!operation) operation = session.queue.find(function (item) { return item.id === operationId; });
  if (!operation) throw new Error("Grab change not found: " + operationId);
  if (mark) {
    if (operation.kind === "reorder") {
      if (operation.state !== "previewed") {
        throw new Error("Only previewed operations can be marked applied or rejected");
      }
      if (mark === "applied") assertPriorReordersResolved(session, operation);
    } else if (operation.state !== "sent") {
      throw new Error("Only sent style changes can be marked applied or rejected");
    }
    operation.state = mark;
    operation.updatedAt = new Date().toISOString();
    if (operation.kind === "reorder" && mark === "rejected") rejectDependentReorders(session, operation);
  }
  return operation;
}

export function currentGrabBatch(batchId?: string): GrabBatchResult {
  return getGrabBatch(requireGrabSession(), batchId);
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

function nextChangePosition(session: BridgeSession): { batchId: string; sequence: number } {
  if (!session.currentBatchId || session.batchCommits[session.currentBatchId]) {
    session.currentBatchId = randomBytes(16).toString("hex");
    session.nextSequence = 1;
  }
  var result = { batchId: session.currentBatchId, sequence: session.nextSequence };
  session.nextSequence += 1;
  return result;
}

function createGrabOperation(intent: LayersIntent, state: GrabOperationState): GrabOperation {
  var session = requireGrabSession();
  var now = new Date().toISOString();
  var batch = nextChangePosition(session);
  var target = intent.fromSelector || (intent.baselineOrder && intent.baselineOrder[intent.fromIndex]) || intent.orderedSelectors[intent.toIndex];
  var operation: GrabOperation = {
    id: randomBytes(16).toString("hex"),
    batchId: batch.batchId,
    sequence: batch.sequence,
    kind: "reorder",
    target: target,
    payload: intent,
    state: state,
    intent: intent,
    receivedAt: now,
    updatedAt: now
  };
  session.operations.push(operation);
  if (session.operations.length > MAX_QUEUE_LENGTH) session.operations.splice(0, session.operations.length - MAX_QUEUE_LENGTH);
  return operation;
}

function styleProperties(item: GrabBridgeSelection): string[] {
  var properties: string[] = [];
  var edits = item.payload.styleEdits;
  if (Array.isArray(edits)) {
    for (var i = 0; i < edits.length; i++) {
      var edit = edits[i] as { property?: unknown };
      if (typeof edit.property === "string" && properties.indexOf(edit.property) === -1) properties.push(edit.property);
    }
  }
  var intents = item.payload.tokenIntents;
  if (Array.isArray(intents)) {
    for (var j = 0; j < intents.length; j++) {
      var intent = intents[j] as { property?: unknown };
      if (typeof intent.property === "string" && properties.indexOf(intent.property) === -1) properties.push(intent.property);
    }
  }
  return properties;
}

function supersedeOlderStyleProperties(session: BridgeSession, newest: GrabBridgeSelection): void {
  var newestProperties = styleProperties(newest);
  if (newestProperties.length === 0) return;
  for (var i = 0; i < session.queue.length; i++) {
    var older = session.queue[i];
    if (older.batchId !== newest.batchId || older.target !== newest.target || older.state !== "sent") continue;
    var olderProperties = styleProperties(older);
    var collisions = olderProperties.filter(function (property) { return newestProperties.indexOf(property) !== -1; });
    if (collisions.length === 0) continue;
    older.supersededProperties = (older.supersededProperties || []).concat(collisions.filter(function (property) {
      return !older.supersededProperties || older.supersededProperties.indexOf(property) === -1;
    }));
    if (olderProperties.length > 0 && olderProperties.every(function (property) { return older.supersededProperties!.indexOf(property) !== -1; })) {
      older.state = "superseded";
    }
    older.updatedAt = newest.receivedAt;
  }
}

function assertPriorReordersResolved(session: BridgeSession, operation: GrabOperation): void {
  if (!session.batchCommits[operation.batchId]) return;
  var parents = layerIntentParentKeys(operation.payload);
  var prior = session.operations.find(function (candidate) {
    if (candidate.batchId !== operation.batchId || candidate.sequence >= operation.sequence) return false;
    if (candidate.state === "applied" || candidate.state === "rejected") return false;
    var candidateParents = layerIntentParentKeys(candidate.payload);
    return parents.some(function (parent) { return candidateParents.indexOf(parent) !== -1; });
  });
  if (prior) throw new Error("Apply same-parent reorders by sequence; resolve " + prior.id + " first");
}

function rejectDependentReorders(session: BridgeSession, operation: GrabOperation): void {
  if (!session.batchCommits[operation.batchId]) return;
  var parents = layerIntentParentKeys(operation.payload);
  for (var i = 0; i < session.operations.length; i++) {
    var dependent = session.operations[i];
    if (dependent.batchId !== operation.batchId || dependent.sequence <= operation.sequence) continue;
    if (dependent.state === "applied" || dependent.state === "rejected") continue;
    var dependentParents = layerIntentParentKeys(dependent.payload);
    if (!parents.some(function (parent) { return dependentParents.indexOf(parent) !== -1; })) continue;
    dependent.state = "rejected";
    dependent.updatedAt = operation.updatedAt;
  }
}

function isPendingChange(change: GrabOperation | GrabBridgeSelection): boolean {
  return change.state !== "applied" && change.state !== "rejected" && change.state !== "superseded";
}

function allChanges(session: BridgeSession): Array<GrabOperation | GrabBridgeSelection> {
  return ([] as Array<GrabOperation | GrabBridgeSelection>).concat(session.operations, session.queue).sort(function (a, b) {
    return a.batchId === b.batchId ? a.sequence - b.sequence : a.batchId.localeCompare(b.batchId);
  });
}

function getGrabBatch(session: BridgeSession, batchId?: string): GrabBatchResult {
  var selectedBatchId = batchId || session.currentBatchId;
  var changes = selectedBatchId ? allChanges(session).filter(function (change) { return change.batchId === selectedBatchId; }) : [];
  var commit = selectedBatchId ? session.batchCommits[selectedBatchId] : undefined;
  return {
    batchId: selectedBatchId,
    committedAt: commit ? commit.committedAt : null,
    changes: changes,
    pending: changes.filter(isPendingChange)
  };
}

function commitGrabBatch(batchId?: string): { committed: true; batchId: string; committedAt: string; count: number } {
  var session = requireGrabSession();
  var selectedBatchId = batchId || session.currentBatchId;
  if (!selectedBatchId) throw new Error("No grab batch to commit");
  var batch = getGrabBatch(session, selectedBatchId);
  if (batch.changes.length === 0) throw new Error("Grab batch not found: " + selectedBatchId);
  var existing = session.batchCommits[selectedBatchId];
  var committedAt = existing ? existing.committedAt : new Date().toISOString();
  if (!existing) {
    session.batchCommits[selectedBatchId] = { batchId: selectedBatchId, committedAt: committedAt };
    resolveWaiters(session);
  }
  return { committed: true, batchId: selectedBatchId, committedAt: committedAt, count: batch.pending.length };
}

function persistFixedMove(intent: LayersIntent): void {
  var session = requireGrabSession();
  var templateId = getPageTemplate(intent.page).templateId;
  var parsed = parseDesignMd(readFileSync(session.path, "utf8"));
  var templates = objectNode(parsed.frontmatter.templates);
  var pages = objectNode(objectNode(templates[templateId]).pages);
  var pageKey = encodePageKey(intent.page);
  var stored = objectNode(pages[pageKey]).fixedMoves;
  var fixedMoves: unknown[] = [];
  if (typeof stored === "string") {
    var decoded = JSON.parse(stored);
    if (!Array.isArray(decoded)) throw new Error("Stored fixedMoves must be an array");
    fixedMoves = decoded;
  } else if (Array.isArray(stored)) {
    fixedMoves = stored.slice();
  } else if (stored !== undefined) {
    throw new Error("Stored fixedMoves must be an array");
  }
  var record: Record<string, unknown> = {
    selector: intent.fromSelector || intent.orderedSelectors[intent.toIndex],
    from: intent.fromIndex,
    to: intent.toIndex,
    note: intent.note || "",
    at: new Date().toISOString(),
    operation: intent.operation,
    parent: layerIntentPrimaryParent(intent)
  };
  if (intent.operation === "reparent") {
    record.fromParent = intent.fromParentSelector;
    record.toParent = intent.toParentSelector;
  }
  fixedMoves.push(record);
  updateDesignMd(session.path, {
    set: {
      group: "templates",
      name: templateId + ".pages." + pageKey + ".fixedMoves",
      value: JSON.stringify(fixedMoves)
    }
  });
}

function notifyFixedMove(intent: LayersIntent): void {
  var webhook = process.env.RAVEN_GRAB_NOTIFY_WEBHOOK;
  if (!webhook) return;
  // ponytail: This webhook is a stub; a real Slack integration is the production upgrade path.
  try {
    void fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "fixed-layer-move",
        page: intent.page,
        operation: intent.operation,
        selector: intent.fromSelector || intent.orderedSelectors[intent.toIndex],
        from: intent.fromIndex,
        to: intent.toIndex,
        parent: layerIntentPrimaryParent(intent),
        fromParent: intent.operation === "reparent" ? intent.fromParentSelector : undefined,
        toParent: intent.operation === "reparent" ? intent.toParentSelector : undefined,
        note: intent.note || ""
      })
    }).catch(function (err) {
      console.error("[Raven Grab] fixed-layer-move webhook failed", err);
    });
  } catch (err) {
    console.error("[Raven Grab] fixed-layer-move webhook failed", err);
  }
}

async function handleGrabRequest(designMdPath: string, key: string, req: IncomingMessage, res: ServerResponse, proxyTarget?: string, role: GrabRole = "consumer"): Promise<void> {
  var method = req.method || "GET";
  var requestUrl = req.url || "/";
  var pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  var bridgeRoute = pathname === "/raven-grab.js" || pathname === "/tokens" || pathname === "/grab" || pathname === "/batch" || pathname === "/batch-commit" || pathname === "/agent/wait"
    || pathname === "/template" || pathname === "/template-validation" || pathname === "/components" || pathname === "/layers" || pathname === "/layers-intent" || pathname === "/layers-operation";
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
      var proxyBridgeOrigin = currentSession ? 'http://127.0.0.1:' + currentSession.port : '';
      var proxyProjectName = currentSession ? currentSession.projectName : '';
      var script = grabConfigTag(role, proxyProjectName, proxyBridgeOrigin) + '<script src="/raven-grab.js?key=' + key + '"></script>';
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

  var protectedRoute = (method === "GET" && (pathname === "/raven-grab.js" || pathname === "/tokens" || pathname === "/template" || pathname === "/components" || pathname === "/batch" || pathname === "/agent/wait" || pathname === "/layers-operation"))
    || (method === "POST" && (pathname === "/grab" || pathname === "/batch-commit" || pathname === "/template" || pathname === "/template-validation" || pathname === "/components" || pathname === "/layers" || pathname === "/layers-intent"));
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

  if (method === "GET" && pathname === "/agent/wait") {
    try {
      var timeoutParam = parsedUrl.searchParams.get("timeout_ms");
      var timeoutMs = timeoutParam && /^\d+$/.test(timeoutParam) && Number(timeoutParam) > 0 ? Number(timeoutParam) : 240000;
      timeoutMs = Math.min(timeoutMs, 240000);
      return jsonResponse(200, await getGrabbedElements(timeoutMs));
    } catch (err) {
      return jsonResponse(500, { error: (err as Error).message });
    }
  }

  // There is deliberately no POST /api/feedback route here. The overlay posts to the
  // hosted endpoint directly. A relay on the loopback bridge took no key, validated
  // nothing, and forwarded any body it was handed -- so anything able to reach the
  // port could file feedback that arrived from the machine owner's IP, spending their
  // rate limit and attributing the spam to them. Do not reintroduce it.

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

  if (method === "POST" && pathname === "/batch-commit") {
    try {
      var commitPayload = z.object({ batchId: z.string().min(1).optional() }).strict().parse(bodyText ? JSON.parse(bodyText) : {});
      return jsonResponse(200, commitGrabBatch(commitPayload.batchId));
    } catch (err) {
      return jsonResponse(400, { error: (err as Error).message });
    }
  }

  if (method === "GET" && pathname === "/batch") {
    try {
      var batchId = parsedUrl.searchParams.get("batchId") || undefined;
      return jsonResponse(200, currentGrabBatch(batchId));
    } catch (err) {
      return jsonResponse(500, { error: (err as Error).message });
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

  if (method === "POST" && pathname === "/components") {
    try {
      var componentPayload = ComponentPayloadSchema.parse(bodyText ? JSON.parse(bodyText) : {});
      return jsonResponse(200, setComponent(componentPayload));
    } catch (err) {
      return jsonResponse(400, { error: (err as Error).message });
    }
  }

  if (method === "GET" && pathname === "/components") {
    try {
      var componentPage = parsedUrl.searchParams.get("page") || undefined;
      var componentId = parsedUrl.searchParams.get("componentId") || undefined;
      if (componentId) return jsonResponse(200, getComponent(componentId));
      return jsonResponse(200, { components: listComponents(componentPage || undefined) });
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
      if (layersIntent.fixedMove === true) {
        persistFixedMove(layersIntent);
      }
      var operation = createGrabOperation(layersIntent, layersIntent.measuredRects.length > 0 ? "previewed" : "proposed");
      if (layersIntent.fixedMove === true) notifyFixedMove(layersIntent);
      return jsonResponse(202, { queued: true, operationId: operation.id, batchId: operation.batchId, sequence: operation.sequence });
    } catch (err) {
      return jsonResponse(400, { error: (err as Error).message });
    }
  }

  if (method === "GET" && pathname === "/layers-operation") {
    var operationId = parsedUrl.searchParams.get("id");
    if (!operationId) return jsonResponse(400, { error: "operation id is required" });
    try {
      var operation = getGrabOperation(operationId) as GrabOperation;
      return jsonResponse(200, { id: operation.id, state: operation.state, updatedAt: operation.updatedAt });
    } catch (err) {
      return jsonResponse(404, { error: (err as Error).message });
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
  var now = new Date().toISOString();
  var items = session.queue.filter(function (item) { return item.state === "sent" && !item.drainedAt; });
  for (var i = 0; i < items.length; i++) items[i].drainedAt = now;
  var result: GrabBridgeDrainResult = { count: items.length, elements: items };
  var commit = latestUndeliveredCommit(session);
  if (commit) {
    commit.deliveredAt = now;
    result.batchCommit = { batchId: commit.batchId, committedAt: commit.committedAt };
    result.batch = getGrabBatch(session, commit.batchId);
  }
  return result;
}

function resolveWaiters(session: BridgeSession): void {
  if (!hasDrainableChanges(session) || session.waiters.length === 0) return;
  var result = drainCurrentQueue(session);
  var waiters = session.waiters.splice(0);
  waiters[0](result);
  var followUp: GrabBridgeDrainResult = { count: result.count, elements: result.elements };
  for (var i = 1; i < waiters.length; i++) {
    waiters[i](followUp);
  }
}

function waitForGrabItems(session: BridgeSession, timeoutMs: number): Promise<GrabBridgeDrainResult> {
  return new Promise(function (resolveItems) {
    var wrapper = function (result: GrabBridgeDrainResult) {
      clearTimeout(timer);
      var idx = session.waiters.indexOf(wrapper);
      if (idx !== -1) session.waiters.splice(idx, 1);
      resolveItems(result);
    };
    var timer = setTimeout(function () {
      var idx = session.waiters.indexOf(wrapper);
      if (idx !== -1) session.waiters.splice(idx, 1);
      resolveItems({ count: 0, elements: [] });
    }, timeoutMs);

    session.waiters.push(wrapper);
  });
}

function latestUndeliveredCommit(session: BridgeSession): GrabBatchCommit | undefined {
  return Object.keys(session.batchCommits).map(function (batchId) { return session.batchCommits[batchId]; })
    .filter(function (commit) { return !commit.deliveredAt; })
    .sort(function (a, b) { return a.committedAt.localeCompare(b.committedAt); })[0];
}

function hasDrainableChanges(session: BridgeSession): boolean {
  return session.queue.some(function (item) { return item.state === "sent" && !item.drainedAt; }) || !!latestUndeliveredCommit(session);
}

function pendingChangeCount(session: BridgeSession): number {
  // Capacity is for undrained work only. Drain marks drainedAt but keeps
  // history for batch/commit — counting drained items made the 200-cap
  // permanent and made "drain with get_grabbed_elements" a false remediation.
  return allChanges(session).filter(function (change) {
    if (!isPendingChange(change)) return false;
    if ("drainedAt" in change && (change as GrabBridgeSelection).drainedAt) return false;
    return true;
  }).length;
}
