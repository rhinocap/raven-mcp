#!/usr/bin/env node
// One-command grab overlay debug loop: `npm run grab:dev [fixture.html]`
// Serves test/fixtures statically, starts the grab bridge in THIS process
// (always current dist, never a stale MCP server), proxies the fixture
// through it, and prints the URL. Overlay JS is read fresh from disk per
// request, so the loop is: edit browser/raven-grab.js -> refresh browser.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "test", "fixtures");
const page = process.argv[2] || "layers-test-page.html";

const { startGrabSession } = await import(path.join(root, "dist", "grab-bridge.js"));

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".md": "text/markdown" };
const staticServer = createServer(async (req, res) => {
  const file = path.join(fixturesDir, path.normalize(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || page);
  if (!file.startsWith(fixturesDir)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file.endsWith("/") || file === fixturesDir ? path.join(fixturesDir, page) : file);
    res.writeHead(200, { "content-type": types[path.extname(file)] || "text/html" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => staticServer.listen(0, "127.0.0.1", r));
const target = `http://127.0.0.1:${staticServer.address().port}`;

const designMd = path.join(fixturesDir, "DESIGN.md");
const session = await startGrabSession(designMd, undefined, target);

console.log(`\n  grab overlay dev server running`);
console.log(`  open:    ${session.url ?? `http://127.0.0.1:${session.port}/?key=${session.key}`}`);
console.log(`  fixture: ${page} (any file in test/fixtures works: /responsive.html etc.)`);
console.log(`  loop:    edit browser/raven-grab.js -> refresh. Ctrl-C to stop.\n`);
