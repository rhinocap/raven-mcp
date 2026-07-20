#!/usr/bin/env node
/**
 * Raven Mobile Grab — Path A local server (port 49911).
 * Isolated from web grab-bridge / browser/raven-grab.js.
 */
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { hitTest, toGrabSelection } from "./lib/ax-hit-test.mjs";

var __dirname = dirname(fileURLToPath(import.meta.url));
var PORT = Number(process.env.RAVEN_MOBILE_GRAB_PORT || 49911);
var ROOT = __dirname;
var FIXTURES = join(ROOT, "fixtures");
var SHELL = join(ROOT, "shell");
var CACHE = join(ROOT, ".cache");
var SCREEN_CACHE = join(CACHE, "sim-screenshot.png");

var queue = [];
var axDoc = loadAx();

function loadAx() {
  var raw = JSON.parse(readFileSync(join(FIXTURES, "sample-ax.json"), "utf8"));
  return raw;
}

function findNodeById(nodes, id) {
  for (var i = 0; i < (nodes || []).length; i++) {
    var n = nodes[i];
    if (n.id === id) return n;
    var nested = findNodeById(n.children, id);
    if (nested) return nested;
  }
  return null;
}

function findHitAncestors(tree, targetId, trail) {
  trail = trail || [];
  for (var i = 0; i < (tree || []).length; i++) {
    var n = tree[i];
    var next = trail.concat([n]);
    if (n.id === targetId) return trail;
    var nested = findHitAncestors(n.children, targetId, next);
    if (nested) return nested;
  }
  return null;
}

function mime(pathOrExt) {
  // path.extname(".html") is "" — treat bare extensions too
  var ext = pathOrExt.indexOf("/") >= 0 || pathOrExt.indexOf("\\") >= 0
    ? extname(pathOrExt).toLowerCase()
    : (pathOrExt.charAt(0) === "." ? pathOrExt.toLowerCase() : extname(pathOrExt).toLowerCase());
  if (!ext && pathOrExt.charAt(0) === ".") ext = pathOrExt.toLowerCase();
  switch (ext) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    default: return "application/octet-stream";
  }
}

function send(res, code, body, type) {
  var buf = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
  res.writeHead(code, {
    "content-type": type || "text/plain; charset=utf-8",
    "content-length": buf.length,
    "cache-control": "no-store"
  });
  res.end(buf);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj, null, 2), "application/json; charset=utf-8");
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () {
      var raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function bootedSimulatorUdid() {
  var r = spawnSync("xcrun", ["simctl", "list", "devices", "booted", "-j"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    var data = JSON.parse(r.stdout || "{}");
    var devices = data.devices || {};
    var keys = Object.keys(devices);
    for (var i = 0; i < keys.length; i++) {
      var list = devices[keys[i]] || [];
      for (var j = 0; j < list.length; j++) {
        if (list[j].state === "Booted" && list[j].udid) return list[j].udid;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function refreshFromSimulator() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  var udid = bootedSimulatorUdid();
  if (!udid) {
    return { ok: false, source: axDoc.source || "fixture", error: "No booted Simulator. Demo fixture kept." };
  }
  var shot = spawnSync("xcrun", ["simctl", "io", udid, "screenshot", SCREEN_CACHE], { encoding: "utf8" });
  if (shot.status !== 0) {
    return { ok: false, source: axDoc.source || "fixture", error: (shot.stderr || shot.stdout || "screenshot failed").trim() };
  }
  axDoc.source = "simctl+" + (axDoc.source === "fixture" ? "fixture-ax" : axDoc.source);
  return { ok: true, source: axDoc.source, udid: udid, screenshot: SCREEN_CACHE };
}

function sessionPayload() {
  return {
    port: PORT,
    platform: "ios",
    path: "A",
    screen: axDoc.screen,
    source: axDoc.source || "fixture",
    viewport: axDoc.viewport,
    tree: axDoc.tree,
    queueLength: queue.length,
    hasSimScreenshot: existsSync(SCREEN_CACHE)
  };
}

var server = createServer(async function (req, res) {
  var url = new URL(req.url || "/", "http://127.0.0.1:" + PORT);
  var path = url.pathname;

  try {
    // Browsers may probe with HEAD — answer same as GET for the shell.
    if ((req.method === "GET" || req.method === "HEAD") && (path === "/" || path === "/index.html")) {
      var html = readFileSync(join(SHELL, "index.html"));
      return send(res, 200, req.method === "HEAD" ? Buffer.alloc(0) : html, "text/html; charset=utf-8");
    }
    if ((req.method === "GET" || req.method === "HEAD") && (path === "/shell.css" || path === "/shell.js")) {
      var asset = readFileSync(join(SHELL, path.slice(1)));
      return send(res, 200, req.method === "HEAD" ? Buffer.alloc(0) : asset, mime(path));
    }
    if (req.method === "GET" && path === "/api/session") {
      return sendJson(res, 200, sessionPayload());
    }
    if (req.method === "GET" && path === "/api/tree") {
      return sendJson(res, 200, { viewport: axDoc.viewport, tree: axDoc.tree, source: axDoc.source });
    }
    if (req.method === "GET" && path === "/api/screenshot") {
      if (existsSync(SCREEN_CACHE)) {
        return send(res, 200, readFileSync(SCREEN_CACHE), "image/png");
      }
      return send(res, 200, readFileSync(join(FIXTURES, "sample-screen.svg")), "image/svg+xml");
    }
    if (req.method === "POST" && path === "/api/hit-test") {
      var body = await readBody(req);
      var hit = hitTest(axDoc.tree, Number(body.x), Number(body.y));
      if (!hit) return sendJson(res, 404, { error: "no hit" });
      return sendJson(res, 200, { node: hit.node, ancestors: hit.ancestors });
    }
    if (req.method === "POST" && path === "/api/grab") {
      var grabBody = await readBody(req);
      var node = null;
      var ancestors = [];
      if (grabBody.id) {
        node = findNodeById(axDoc.tree, grabBody.id);
        ancestors = findHitAncestors(axDoc.tree, grabBody.id) || [];
      } else if (grabBody.x != null && grabBody.y != null) {
        var h = hitTest(axDoc.tree, Number(grabBody.x), Number(grabBody.y));
        if (h) {
          node = h.node;
          ancestors = h.ancestors;
        }
      }
      if (!node) return sendJson(res, 400, { error: "selection required (id or x/y)" });
      var selection = toGrabSelection({ node: node, ancestors: ancestors }, {
        instruction: grabBody.instruction || "",
        editScope: grabBody.editScope || "instance"
      });
      queue.push(selection);
      return sendJson(res, 200, { queued: true, queueLength: queue.length, selection: selection });
    }
    if (req.method === "GET" && path === "/api/queue") {
      var drained = queue.slice();
      queue = [];
      return sendJson(res, 200, { count: drained.length, selections: drained });
    }
    if (req.method === "POST" && path === "/api/refresh") {
      var result = refreshFromSimulator();
      // Reload fixture AX so edits to fixtures/ pick up; keep sim screenshot if present.
      axDoc = loadAx();
      if (result.ok) axDoc.source = result.source;
      return sendJson(res, 200, Object.assign({ session: sessionPayload() }, result));
    }
    if (req.method === "GET" && path === "/api/health") {
      return sendJson(res, 200, { ok: true, service: "raven-mobile-grab", port: PORT });
    }
    return sendJson(res, 404, { error: "not found", path: path });
  } catch (err) {
    return sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, "127.0.0.1", function () {
  console.log("Raven Mobile Grab (Path A) → http://127.0.0.1:" + PORT);
  console.log("Isolated from web grab. Queue: GET /api/queue");
});
