#!/usr/bin/env node

// Import adapter (NOT a live connector): a Figma file-comments export -> an attributed,
// source-associated transcript that ingest_transcript consumes unchanged. Design decisions in Figma
// are argued in the comment threads pinned to frames/nodes and then lost there; this flattens the
// `GET /v1/files/:key/comments` export into one chronological "@handle (on node X): message"
// transcript, marking replies (↳ via parent_id) so a reply isn't read as its own ruling, so the
// extraction model can attribute each decision to the reviewer who made it. Attribution stays
// MODEL-EXTRACTED (author_trust:"extracted", gated by decision_commit per it58) — a handle in the
// transcript is a hint, not a pinned identity, and a Figma handle is a display name.
// No network/model call — pure shape transform on an export the user fetched themselves.
// Ceiling: no OAuth/token/sync (that's the live connector, unbuilt); the export JSON is itself
// migratable — the moat is the accumulated decision CORPUS + taste bindings, NOT this format;
// creates no adoption (organic non-author consultation stays 0). Sibling of import-github-review.mjs
// (it59); the transcript-render tail is duplicated on purpose — extract a shared helper when a 3rd
// source adapter lands (rule of three), not before.

import { readFileSync } from 'node:fs';

function anchorFor(cm) {
  if (!cm || typeof cm !== 'object') return '';
  if (typeof cm.node_id === 'string' && cm.node_id) return ` (on node ${cm.node_id})`;
  // Vector pin (absolute canvas coords) — no node to name, so just mark it as canvas-anchored.
  if (typeof cm.x === 'number' || typeof cm.y === 'number') return ' (on canvas)';
  return '';
}

function refFor(exportObj, comments) {
  if (typeof exportObj.file_url === 'string' && exportObj.file_url) return exportObj.file_url;
  const key = exportObj.file_key || (comments[0] && comments[0].file_key);
  const name = exportObj.name;
  if (key) return `https://www.figma.com/file/${key}` + (name ? ` — ${name}` : '');
  return 'Figma file comments';
}

// Returns { text, source_meta:{ref, kind:'design-review'} } ready for ingest_transcript.
// Throws when nothing attributable survives, so the caller never ingests an empty source.
export function formatFigmaComments(exportObj) {
  if (!exportObj || typeof exportObj !== 'object') {
    throw new Error('formatFigmaComments: expected a Figma comments export object');
  }
  // Accept the raw `{comments:[...]}` wrapper or a bare array.
  const comments = Array.isArray(exportObj) ? exportObj
    : Array.isArray(exportObj.comments) ? exportObj.comments : [];
  const entries = [];
  for (const c of comments) {
    const handle = c && c.user && c.user.handle;
    if (!handle) continue; // no attributable author -> can't carry an author through the capture path
    const body = (c.message || '').trim();
    if (!body) continue;
    // ponytail: Date.parse for chronological order; entries without a timestamp sort first (stable).
    const ts = Date.parse(c.created_at || '');
    // parent_id (non-empty) => a reply in a thread, not an independent ruling (mirrors it59's ↳).
    // resolved_at set => the thread was closed (implemented, withdrawn, or superseded); mark it so the
    // extraction model can weight or skip it rather than mint an obsolete ruling as an equal candidate.
    entries.push({ handle, body, anchor: anchorFor(c.client_meta), ts: Number.isNaN(ts) ? 0 : ts, isReply: !!c.parent_id, isResolved: !!c.resolved_at });
  }
  if (entries.length === 0) {
    throw new Error('No attributable comments found (all empty or missing a user handle).');
  }
  entries.sort((a, b) => a.ts - b.ts);
  const text = entries.map((e) => `${e.isReply ? '↳ ' : ''}@${e.handle}${e.anchor}${e.isResolved ? ' [resolved]' : ''}: ${e.body}`).join('\n\n');
  return { text, source_meta: { ref: refFor(exportObj, comments), kind: 'design-review' } };
}

// CLI: node scripts/import-figma-comments.mjs <comments-export.json> -> prints {text, source_meta}.
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: import-figma-comments.mjs <figma-comments-export.json>');
    process.exitCode = 1;
  } else {
    try {
      const out = formatFigmaComments(JSON.parse(readFileSync(file, 'utf8')));
      console.log(JSON.stringify(out, null, 2));
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    }
  }
}
