import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { randomBytes, timingSafeEqual } from "crypto";
import { constants as fsConstants, promises as fsp } from "fs";
import { resolve } from "path";
import { z } from "zod";

// A small loopback server for motion playgrounds, separate from Raven Grab.
// It serves a registered playground file with a send config block inserted,
// and takes "Send to your agent" posts from that page into a queue that
// get_motion_sends drains. One session per process, created on first use.

export const MAX_HTML_BYTES = 8 * 1024 * 1024;
export const MAX_SEND_BODY_BYTES = 512 * 1024;
export const MAX_REGISTERED = 64;
export const MAX_QUEUE = 50;
export const MAX_WAIT_MS = 240000;

export type MotionSend = {
  id: string;
  received_at: string;
  playground_id: string;
  playground_url: string;
  html_path: string;
  title: string | null;
  instruction: string;
  context: string;
  packet: string;
};

export type MotionSendsResult = {
  sends: MotionSend[];
  waiting_url_count: number;
};

type Registered = { id: string; htmlPath: string; url: string; owner?: string };

type Session = {
  server: Server;
  port: number;
  key: string;
};

var session: Session | null = null;
var starting: Promise<Session> | null = null;
var registry = new Map<string, Registered>();
var queue: MotionSend[] = [];
var waiters: Array<(sends: MotionSend[]) => void> = [];

const SendBody = z.object({
  playground: z.string().min(1).max(64),
  instruction: z.string().max(4000),
  context: z.string().max(4000),
  packet: z.string().max(400000),
  title: z.string().max(200).optional(),
});

function startSession(): Promise<Session> {
  if (session) return Promise.resolve(session);
  if (starting) return starting;
  starting = new Promise<Session>(function (resolveSession, reject) {
    var key = randomBytes(32).toString("hex");
    var server = createServer(function (req, res) {
      handleRequest(req, res).catch(function () {
        if (!res.headersSent) sendText(res, 500, "Internal error");
        else res.destroy();
      });
    });
    // Connections must not keep the process alive either.
    server.on("connection", function (socket) { socket.unref(); });
    server.once("error", function (err) {
      starting = null;
      reject(err);
    });
    server.listen(0, "127.0.0.1", function () {
      var address = server.address();
      if (!address || typeof address === "string") {
        starting = null;
        server.close();
        reject(new Error("Motion session server did not get a port"));
        return;
      }
      server.unref();
      session = { server: server, port: address.port, key: key };
      starting = null;
      resolveSession(session);
    });
  });
  return starting;
}

function isLoopbackHost(hostHeader: string, port: number): boolean {
  return hostHeader === "127.0.0.1:" + port || hostHeader === "localhost:" + port;
}

function baseHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendText(res: ServerResponse, status: number, text: string): void {
  baseHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  baseHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function keyMatches(given: string | null, key: string): boolean {
  if (typeof given !== "string") return false;
  var a = Buffer.from(given, "utf8");
  var b = Buffer.from(key, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Opens without following a symlink and without blocking on a named pipe,
// then checks the open descriptor is a regular file within the size cap.
async function readHtmlFile(htmlPath: string): Promise<string> {
  var handle = await fsp.open(htmlPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  try {
    var stats = await handle.stat();
    if (!stats.isFile()) throw new Error("Not a regular file: " + htmlPath);
    if (stats.size > MAX_HTML_BYTES) throw new Error("File is larger than " + MAX_HTML_BYTES + " bytes: " + htmlPath);
    var buf = Buffer.alloc(Math.min(stats.size + 1, MAX_HTML_BYTES + 1));
    var total = 0;
    while (total < buf.length) {
      var { bytesRead } = await handle.read(buf, total, buf.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > MAX_HTML_BYTES) throw new Error("File is larger than " + MAX_HTML_BYTES + " bytes: " + htmlPath);
    return buf.subarray(0, total).toString("utf8");
  } finally {
    await handle.close();
  }
}

export function insertSendBlock(html: string, key: string, playgroundId: string): string | null {
  var block = '<script type="application/json" id="motion-send">' +
    JSON.stringify({ url: "/send?key=" + key, playground: playgroundId }) + "</script>";
  // Search a copy with comments and raw-text elements blanked out, so a </head> written inside a comment, a
  // script, a style, the title or a textarea is not taken for the real one. Tags are read whole, quoted
  // attributes included, so "<!--" or "</head>" inside an attribute value starts nothing. Blanking keeps
  // every offset.
  var blank = function (m: string) { return " ".repeat(m.length); };
  var attrs = "(?:[^>\"']|\"[^\"]*\"|'[^']*')*";
  var tokens = new RegExp(
    "<!--[\\s\\S]*?(?:-->|$)" +
    "|<(script|style|title|textarea)(?=[\\s/>])" + attrs + ">[\\s\\S]*?(?:<\\/\\1\\s*>|$)" +
    "|<[a-zA-Z][^\\s/>]*" + attrs + ">",
    "gi");
  var masked = html.replace(tokens, function (m: string, raw?: string) {
    if (raw || m.indexOf("<!--") === 0) return blank(m);
    return m.replace(/"[^"]*"|'[^']*'/g, blank);
  });
  var at = masked.search(/<\/head>/i);
  if (at === -1) at = masked.search(/<body/i);
  if (at === -1) return null;
  return html.slice(0, at) + block + html.slice(at);
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  // Event listeners, not for-await, so an oversized body can still be answered
  // with 413: the rest of the body is read and dropped.
  return new Promise(function (resolveBody) {
    var chunks: Buffer[] = [];
    var total = 0;
    var overflow = false;
    req.on("data", function (chunk: Buffer | string) {
      if (overflow) return;
      var buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_SEND_BODY_BYTES) {
        overflow = true;
        chunks = [];
        resolveBody(null);
        return;
      }
      chunks.push(buf);
    });
    req.on("end", function () { if (!overflow) resolveBody(Buffer.concat(chunks)); });
    req.on("error", function () { if (!overflow) resolveBody(null); });
  });
}

function closeAfterOverflow(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Connection", "close");
  var timer = setTimeout(function () { req.destroy(); }, 5000);
  timer.unref();
  req.once("end", function () { clearTimeout(timer); });
  req.once("close", function () { clearTimeout(timer); });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  var s = session;
  if (!s) { sendText(res, 503, "Motion session is not running"); return; }
  if (!isLoopbackHost(String(req.headers.host || ""), s.port)) {
    // Closes DNS rebinding: a page loaded from another name sends that name here.
    sendText(res, 421, "Motion session serves 127.0.0.1 only");
    return;
  }
  var method = req.method || "GET";
  var parsed = new URL(req.url || "/", "http://127.0.0.1");
  var pathname = parsed.pathname;

  if (method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST");
    sendText(res, 405, "Method not allowed");
    return;
  }

  var page = /^\/p\/([0-9a-f]{16})$/.exec(pathname);
  if (page) {
    if (method !== "GET") {
      res.setHeader("Allow", "GET");
      sendText(res, 405, "Method not allowed");
      return;
    }
    var entry = registry.get(page[1]);
    if (!entry) { sendText(res, 404, "Not found"); return; }
    var html: string;
    try {
      html = await readHtmlFile(entry.htmlPath);
    } catch (err) {
      sendText(res, 500, "Could not read the playground file: " + (err as Error).message);
      return;
    }
    var served = insertSendBlock(html, s.key, entry.id);
    if (served === null) {
      sendText(res, 500, "The playground file has no </head> or <body> to add the send block to");
      return;
    }
    var bytes = Buffer.from(served, "utf8");
    baseHeaders(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Length", String(bytes.length));
    res.end(bytes);
    return;
  }

  if (pathname === "/send") {
    if (method !== "POST") {
      res.setHeader("Allow", "POST");
      sendText(res, 405, "Method not allowed");
      return;
    }
    if (!keyMatches(parsed.searchParams.get("key"), s.key)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }
    var mediaType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      sendJson(res, 415, { error: "Content-Type must be application/json" });
      return;
    }
    var declared = Number(req.headers["content-length"]);
    var body = Number.isFinite(declared) && declared > MAX_SEND_BODY_BYTES ? null : await readBody(req);
    if (body === null) {
      closeAfterOverflow(req, res);
      sendJson(res, 413, { error: "Body is larger than " + MAX_SEND_BODY_BYTES + " bytes" });
      return;
    }
    var json: unknown;
    try {
      json = JSON.parse(body.toString("utf8"));
    } catch (_err) {
      sendJson(res, 400, { error: "Body is not valid JSON" });
      return;
    }
    var check = SendBody.safeParse(json);
    if (!check.success) {
      sendJson(res, 400, {
        error: "Body does not match the send shape",
        issues: check.error.issues.map(function (i) { return (i.path.join(".") || "body") + ": " + i.message; }),
      });
      return;
    }
    var target = registry.get(check.data.playground);
    if (!target) {
      sendJson(res, 400, { error: "Unknown playground" });
      return;
    }
    if (queue.length >= MAX_QUEUE) {
      sendJson(res, 503, { error: "The send queue is full until the agent collects it" });
      return;
    }
    queue.push({
      id: randomBytes(8).toString("hex"),
      received_at: new Date().toISOString(),
      playground_id: target.id,
      playground_url: target.url,
      html_path: target.htmlPath,
      title: check.data.title === undefined ? null : check.data.title,
      instruction: check.data.instruction,
      context: check.data.context,
      packet: check.data.packet,
    });
    sendJson(res, 202, { queued: true });
    resolveWaiters();
    return;
  }

  sendText(res, 404, "Not found");
}

function resolveWaiters(): void {
  if (waiters.length === 0 || queue.length === 0) return;
  // One waiter takes the batch, so two overlapping get_motion_sends calls never act on the same note.
  // The others keep waiting for the next send or their own timeout.
  var waiter = waiters.shift() as (sends: MotionSend[]) => void;
  waiter(queue.splice(0));
}

/** Registers a playground file. `owner` names who made it (a Grab session id), so that owner can unregister it. */
export async function registerPlayground(htmlPath: string, opts?: { owner?: string }): Promise<{ id: string; url: string; html_path: string }> {
  if (typeof htmlPath !== "string" || htmlPath.trim() === "") throw new Error("html_path is required");
  var full = resolve(htmlPath);
  if (!/\.html$/i.test(full)) throw new Error("html_path must end in .html: " + full);
  var stats;
  try {
    stats = await fsp.lstat(full);
  } catch (_err) {
    throw new Error("No file at " + full);
  }
  if (stats.isSymbolicLink()) throw new Error("html_path is a symlink; pass the real file: " + full);
  if (!stats.isFile()) throw new Error("html_path is not a regular file: " + full);
  await readHtmlFile(full);
  var s = await startSession();
  var id = randomBytes(8).toString("hex");
  var url = "http://127.0.0.1:" + s.port + "/p/" + id;
  registry.set(id, { id: id, htmlPath: full, url: url, ...(opts && typeof opts.owner === "string" ? { owner: opts.owner } : {}) });
  while (registry.size > MAX_REGISTERED) {
    var oldest = registry.keys().next().value as string;
    registry.delete(oldest);
  }
  return { id: id, url: url, html_path: full };
}

/** Stops serving a registered playground. Returns whether it was registered. */
export function unregisterPlayground(id: string): boolean {
  return typeof id === "string" && registry.delete(id);
}

/** Tests and the bridge: whether an id is still served. */
export function isPlaygroundRegistered(id: string): boolean {
  return registry.has(id);
}

export function getMotionSends(timeoutMs?: number): Promise<MotionSendsResult> {
  var wait = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) ? Math.min(Math.max(0, timeoutMs), MAX_WAIT_MS) : 0;
  if (queue.length > 0 || wait === 0) {
    return Promise.resolve({ sends: queue.splice(0), waiting_url_count: registry.size });
  }
  return new Promise(function (resolveSends) {
    var waiter = function (sends: MotionSend[]) {
      clearTimeout(timer);
      resolveSends({ sends: sends, waiting_url_count: registry.size });
    };
    var timer = setTimeout(function () {
      var idx = waiters.indexOf(waiter);
      if (idx !== -1) waiters.splice(idx, 1);
      resolveSends({ sends: queue.splice(0), waiting_url_count: registry.size });
    }, wait);
    waiters.push(waiter);
  });
}

// For tests: closes the server and clears every registration, send and waiter.
export async function stopMotionSession(): Promise<void> {
  var pending = waiters.splice(0);
  for (var i = 0; i < pending.length; i++) pending[i]([]);
  registry.clear();
  queue = [];
  if (starting) {
    try { await starting; } catch (_err) { /* nothing to close */ }
  }
  var s = session;
  session = null;
  if (s) {
    await new Promise<void>(function (done) {
      s!.server.close(function () { done(); });
      s!.server.closeAllConnections();
    });
  }
}

// For tests: the port the session listens on, or null when it is not running.
export function motionSessionPort(): number | null {
  return session ? session.port : null;
}
