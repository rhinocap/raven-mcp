#!/usr/bin/env node
// Builds the "Try it" section of ravenmcp.ai/motion: runs the same suggest_motion
// the Grab Motion tab runs against a sample studio page (scripts/motion-try/), and
// writes its playgrounds, the page capture and a list of what it found into
// web/public/playgrounds/try/. Run `npm run build` first. The output is committed
// because the `web` project deploys from web/ alone and cannot import ../dist.
//
//   node scripts/build-motion-try.mjs [output-dir]

import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TRY_DIR = "web/public/playgrounds/try";
const TYPES = { ".html": "text/html", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

function serve(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html");
    const file = path.join(dir, rel);
    if (!file.startsWith(dir + path.sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

export async function buildTry(root, outDir) {
  // Playgrounds go to a scratch taste home, not the builder's ~/.raven.
  const home = await mkdtemp(path.join(os.tmpdir(), "raven-motion-try-"));
  process.env.RAVEN_TASTE_HOME = home;
  const dist = (rel) => pathToFileURL(path.join(root, "dist", rel)).href;
  const { suggestMotion } = await import(dist("motion-suggest/index.js"));
  const { ClosedTasteStore } = await import(dist("taste-store.js"));
  const server = await serve(path.join(root, "scripts", "motion-try"));
  try {
    const url = "http://127.0.0.1:" + server.address().port + "/";
    const result = await suggestMotion({ store: new ClosedTasteStore(), url });
    if (result.failed.length) throw new Error("Some previews failed: " + result.failed.map((f) => f.kind + "@" + f.stage).join(", "));
    // Write into a fresh dir, then swap it in, so a failed build leaves the old copy whole.
    const staging = outDir + ".next";
    await mkdir(staging, { recursive: true });
    for (const name of await readdir(staging)) await rename(path.join(staging, name), path.join(await mkdtemp(path.join(os.tmpdir(), "raven-motion-old-")), name));
    const map = await readFile(result.map_path, "utf8");
    const shot = /<img src="data:image\/jpeg;base64,([^"]+)"/.exec(map);
    if (!shot) throw new Error("The page map has no capture");
    const page = Buffer.from(shot[1], "base64");
    await writeFile(path.join(staging, "page.jpg"), page);
    const suggestions = [];
    for (const [i, s] of result.suggestions.entries()) {
      const file = String(i + 1) + "-" + s.kind + ".html";
      // The playground records where its fonts were saved; on the site that would
      // publish the builder's temp folder, so it names the usual taste home instead.
      // Those paths sit in JSON data blocks, outside the CSP script hashes.
      const html = (await readFile(s.html_path, "utf8")).split(home).join("~/.raven/taste");
      if (html.includes(os.tmpdir()) || html.includes(os.homedir())) throw new Error(file + " still names a local folder");
      await writeFile(path.join(staging, file), html);
      suggestions.push({ kind: s.kind, label: s.label, why: s.why, when: s.trigger_words, box: s.box, file });
    }
    const width = Number((/<div class="shot" style="width:(\d+)px"/.exec(map) || [])[1]) || 1440;
    await writeFile(path.join(staging, "suggestions.json"), JSON.stringify({ page: { file: "page.jpg", width }, suggestions }, null, 2) + "\n");
    if (existsSync(outDir)) await rename(outDir, path.join(await mkdtemp(path.join(os.tmpdir(), "raven-motion-old-")), "try"));
    await rename(staging, outDir);
    return { suggestions: suggestions.length, bytes: page.length };
  } finally {
    server.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = process.cwd();
  const out = path.resolve(root, process.argv[2] ?? TRY_DIR);
  const result = await buildTry(root, out);
  console.log(`Wrote ${path.relative(root, out)}: ${result.suggestions} playgrounds, page capture ${result.bytes} bytes`);
  process.exit(0);
}
