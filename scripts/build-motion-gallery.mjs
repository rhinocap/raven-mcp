#!/usr/bin/env node
// Builds the ravenmcp.ai/motion gallery playground from the same code the
// create_motion_playground tool runs, so the site shows exactly what the tool
// writes. Run `npm run build` first; the output is committed because the `web`
// project deploys from web/ alone and cannot import ../dist at build time.
// scripts/check-site-drift.mjs rebuilds into a temp dir and fails if the
// committed copy differs.
//
//   node scripts/build-motion-gallery.mjs [output-path]

import path from "node:path";
import { pathToFileURL } from "node:url";

export const GALLERY_PATH = "web/public/playgrounds/keyfob.html";
// The call the /motion page prints. Keep it in step with buildGallery().
export const GALLERY_CALL = { motif: "keyfob" };

export async function buildGallery(root, outputPath) {
  const dist = (rel) => pathToFileURL(path.join(root, "dist", rel)).href;
  const { createMotionPlayground } = await import(dist("motion-playground/index.js"));
  const { ClosedTasteStore } = await import(dist("taste-store.js"));
  // No profile or project: the gallery is not bound to anyone's taste, and a
  // closed store makes any accidental taste read fail instead of reading ~/.raven.
  return createMotionPlayground({ ...GALLERY_CALL, store: new ClosedTasteStore(), output_path: outputPath });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = process.cwd();
  const out = path.resolve(root, process.argv[2] ?? GALLERY_PATH);
  const result = await buildGallery(root, out);
  console.log(`Wrote ${path.relative(root, result.html_path)} (${result.bytes} bytes, ${result.controls} controls)`);
  for (const w of result.warnings) console.log(`  warning: ${w}`);
}
