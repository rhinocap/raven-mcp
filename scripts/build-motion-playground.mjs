#!/usr/bin/env node
// Builds the prebuilt Motion suggestions that /motion's Grab (motion: "static") reads.
//
//   node scripts/build-motion-playground.mjs [--no-build]
//
// 1. Builds the web app (next build) unless --no-build, and serves it on loopback.
// 2. Serves the Northstar wireframe on its own page (no scripts, no Grab), wrapped in
//    the same main > section > div as /motion, and runs suggest_motion on it (desktop).
// 3. Builds suggestions.json and one <id>.html per suggestion in memory. Local paths
//    and loopback URLs are removed; the script fails if any remain.
// 4. Checks every suggestion's parts resolve on the real /motion page.
// 5. Only then replaces web/public/playgrounds/motion/, adding source.json with hashes of the wireframe inputs and the outputs, which
//    scripts/check-site-drift.mjs compares.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const outDir = path.join(web, "public", "playgrounds", "motion");
export const MOTION_INPUTS = [
  "web/app/_northstar/NorthstarWireframe.tsx",
  "web/app/_northstar/playgroundCss.ts",
  "web/app/raven-design/FeatureCard.tsx",
  "src/data/motion/motifs.lock.json",
  "src/data/motion/template.html",
  "src/data/motion/timeline-template.html",
];
const MAX = 6;

const fail = (message) => { console.error(`build-motion-playground: ${message}`); process.exit(1); };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

export function inputsHash() {
  const h = createHash("sha256");
  for (const rel of MOTION_INPUTS) { h.update(rel + "\0"); h.update(readFileSync(path.join(root, rel))); h.update("\0"); }
  return h.digest("hex");
}

// Anything that names this machine or a loopback server.
export const LOCAL_PATTERN = /127\.0\.0\.1|localhost|\/Users\/|\/private\/|\/var\/folders\/|\/tmp\/|file:\/\/\//;

// The playground CSP lists loopback sources for local sessions; a public file needs none.
export function portablePlayground(html) {
  let out = html.replace(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/, (m, csp) =>
    `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/ (?:http|ws):\/\/(?:127\.0\.0\.1|localhost):\*/g, "")}">`);
  // Copy for Raven asks for a taste profile and project, which a visitor to the demo does not have.
  out = out.replace("</head>", "<style>#raven-block{display:none!important}</style></head>");
  return out;
}

async function freePort() {
  return await new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function waitFor(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  fail(`${url} did not answer`);
}

function wireframeOnly(html) {
  const head = (html.match(/<head>([\s\S]*?)<\/head>/) || [])[1];
  if (!head) fail("no <head> in /motion");
  const cleanHead = head.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<link[^>]+rel="(?:preload|modulepreload)"[^>]*>/g, "");
  const start = html.indexOf('<article class="playground-wireframe"');
  if (start < 0) fail("no Northstar wireframe on /motion");
  let depth = 0, end = -1;
  const re = /<(\/?)article\b[^>]*>/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(html));) { depth += m[1] ? -1 : 1; if (!depth) { end = m.index + m[0].length; break; } }
  if (end < 0) fail("unclosed wireframe article");
  // The wireframe styles are an inline <style> in the page body.
  const styles = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join("");
  return `<!doctype html><html lang="en"><head>${cleanHead}${styles}</head><body><main class="playground-page"><section class="playground-stage"><div class="container">${html.slice(start, end)}</div></section></main></body></html>`;
}

async function main() {
  if (!process.argv.includes("--no-build")) {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
    execFileSync("npx", ["next", "build"], { cwd: web, stdio: "inherit" });
  }
  const appPort = await freePort();
  const app = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(appPort)], { cwd: web, stdio: "ignore", detached: true });
  const stop = [() => { try { process.kill(-app.pid); } catch { /* gone */ } }];
  const cleanup = () => stop.forEach((fn) => fn());
  process.on("exit", cleanup);
  try {
    const appOrigin = `http://127.0.0.1:${appPort}`;
    await waitFor(appOrigin + "/motion");
    const motionHtml = await (await fetch(appOrigin + "/motion")).text();
    const page = wireframeOnly(motionHtml);

    const wirePort = await freePort();
    const wire = http.createServer(async (req, res) => {
      if (req.url === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(page); return; }
      try {
        const r = await fetch(appOrigin + req.url);
        res.writeHead(r.status, { "content-type": r.headers.get("content-type") || "application/octet-stream" });
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch { res.writeHead(502); res.end(); }
    });
    await new Promise((r) => wire.listen(wirePort, "127.0.0.1", r));
    stop.push(() => wire.close());

    // A closed taste store and an empty taste home: the demo's suggestions use the page only.
    const home = mkdtempSync(path.join(tmpdir(), "raven-motion-build-"));
    process.env.RAVEN_TASTE_HOME = home;
    process.env.RAVEN_NO_USAGE_LOG = "1";
    const { suggestMotion } = await import(pathToFileURL(path.join(root, "dist/motion-suggest/index.js")).href);
    const { ClosedTasteStore } = await import(pathToFileURL(path.join(root, "dist/taste-store.js")).href);
    const result = await suggestMotion({ store: new ClosedTasteStore(), url: `http://127.0.0.1:${wirePort}/`, max: MAX, viewport: "desktop" });
    if (!result.suggestions.length) fail(`suggest_motion found nothing: ${result.message || ""}`);
    if (result.failed.length) fail(`${result.failed.length} suggestion(s) failed to build`);

    // Everything is built and checked in memory first; the current bundle is only
    // replaced once every check has passed, so a failed run leaves it untouched.
    const outputs = new Map();
    const files = {};
    const suggestions = result.suggestions.map((s) => {
      if (!/^[a-z0-9-]{1,64}$/.test(s.id)) fail(`unexpected suggestion id ${s.id}`);
      const name = `${s.id}.html`;
      const html = portablePlayground(readFileSync(s.html_path, "utf8"));
      if (LOCAL_PATTERN.test(html)) fail(`${name} still names a local path or loopback URL: ${html.match(LOCAL_PATTERN)[0]}`);
      outputs.set(name, html);
      files[name] = sha(html);
      return {
        label: s.label, kind: s.kind, why: s.why, trigger_words: s.trigger_words, approximations: s.approximations,
        parts: s.parts.map((p) => ({ selector: p.selector, tag: p.tag, role: p.role, text: p.text, src: p.src, href: p.href, dup: p.dup, nth: p.nth })),
        url: `/playgrounds/motion/${name}`,
      };
    });
    const json = JSON.stringify({ suggestions }, null, 2) + "\n";
    if (LOCAL_PATTERN.test(json)) fail(`suggestions.json still names a local path or loopback URL: ${json.match(LOCAL_PATTERN)[0]}`);
    outputs.set("suggestions.json", json);
    files["suggestions.json"] = sha(json);

    // Every part must resolve on the real /motion page, the way Grab resolves it.
    const { chromium } = await import(pathToFileURL(path.join(root, "node_modules/playwright/index.mjs")).href);
    const browser = await chromium.launch();
    stop.push(() => browser.close().catch(() => {}));
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const tab = await browser.newPage({ viewport });
      await tab.route("**/raven-grab.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
      await tab.goto(appOrigin + "/motion", { waitUntil: "networkidle" });
      const lost = await tab.evaluate((list) => {
        const fp = (el) => {
          const tag = el.localName.toLowerCase();
          const strip = (v) => String(v || "").split("#")[0].split("?")[0];
          const t = tag === "img" ? (el.getAttribute("alt") || "") : (el.textContent || "");
          return { tag, role: (el.getAttribute("role") || "").slice(0, 40), text: t.replace(/\s+/g, " ").trim().slice(0, 40),
            src: tag === "img" ? (strip(el.getAttribute("src")).split("/").pop() || "").slice(0, 80) : "", href: tag === "a" ? strip(el.getAttribute("href")).slice(0, 120) : "" };
        };
        const same = (a, b) => a.tag === b.tag && a.role === b.role && a.text === b.text && a.src === b.src && a.href === b.href;
        const out = [];
        list.forEach((s) => s.parts.forEach((p) => {
          const el = document.querySelector(p.selector);
          if (!el || !same(fp(el), p)) { out.push(`${s.label}: ${p.selector}`); return; }
          let count = 0, index = -1;
          for (const other of document.getElementsByTagName(p.tag)) { if (!same(fp(other), p)) continue; if (other === el) index = count; count += 1; }
          if (count !== p.dup || index !== p.nth) out.push(`${s.label}: ${p.selector} (${count}/${index})`);
        }));
        return out;
      }, suggestions);
      if (lost.length) fail(`parts that do not resolve on /motion at ${viewport.width}px:\n  ${lost.join("\n  ")}`);
      await tab.close();
    }

    const source = { inputs: inputsHash(), files };
    outputs.set("source.json", JSON.stringify(source, null, 2) + "\n");
    mkdirSync(outDir, { recursive: true });
    for (const name of readdirSync(outDir)) if (/\.(html|json)$/.test(name) && !outputs.has(name)) unlinkSync(path.join(outDir, name));
    for (const [name, body] of outputs) writeFileSync(path.join(outDir, name), body);
    console.log(`build-motion-playground: ${suggestions.length} suggestions`);
    suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s.label} (${s.url})`));
  } finally {
    cleanup();
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
