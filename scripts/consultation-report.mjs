#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const storeDir = process.env.RAVEN_DECISIONS_HOME || path.join(process.cwd(), '.raven', 'decisions');
const tracePath = path.join(storeDir, 'consultations.jsonl');
const sinceArg = process.argv[2] === '--since' ? process.argv[3] : process.argv[2];
const since = sinceArg === undefined ? null : Date.parse(sinceArg);

if (sinceArg !== undefined && Number.isNaN(since)) {
  console.error('Invalid since timestamp: ' + sinceArg);
  process.exitCode = 1;
} else {
  const lines = existsSync(tracePath)
    ? readFileSync(tracePath, 'utf8').split('\n').filter(Boolean)
    : [];
  // A consultation is a TARGETED read of specific decisions (decision_get/decision_scope).
  // decision_list is a browse/scan of the whole store — it is retrieval, not consultation,
  // and crediting it lets one call inflate the count (Sol adverse it52 #4/#10). Counted
  // separately as `scans`, never as consultations.
  const TARGETED = new Set(['decision_get', 'decision_scope']);
  // "unknown"/null provenance can't establish author≠reader, so it can't prove non-author.
  const isKnown = (id) => typeof id === 'string' && id.length > 0 && id !== 'unknown';

  let count = 0;
  let scans = 0;
  let ambiguous = 0;
  const perReader = {};

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const eventTime = Date.parse(event.ts);
    if (since !== null && (Number.isNaN(eventTime) || eventTime < since)) continue;
    if (!TARGETED.has(event.tool)) { scans += 1; continue; }
    const authors = Array.isArray(event.authors) ? event.authors : [];
    if (authors.includes(event.reader)) continue;
    // Require a known reader AND at least one known author to credit non-authorship.
    if (!isKnown(event.reader) || !authors.some(isKnown)) { ambiguous += 1; continue; }
    count += 1;
    perReader[event.reader] = (perReader[event.reader] || 0) + 1;
  }

  console.log(JSON.stringify({
    non_author_consultations: count,
    per_reader: perReader,
    scans_excluded: scans,
    ambiguous_provenance_excluded: ambiguous,
  }, null, 2));
}
