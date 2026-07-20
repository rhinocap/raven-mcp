#!/usr/bin/env node

// Import adapter (NOT a live connector): a GitHub pull-request review export -> an attributed,
// source-ASSOCIATED transcript that ingest_transcript consumes unchanged. Design decisions in PRs
// live in three places (review summaries, inline diff comments, the conversation); this flattens all
// three into one chronological "@login (on path:line): body" transcript, marking replies (↳) so a
// rebuttal isn't read as its own ruling, so the extraction model can attribute each decision to the
// reviewer who made it. Attribution stays MODEL-EXTRACTED (author_trust:"extracted", gated by
// decision_commit per it58) — a login in the transcript is a hint, not a pinned identity.
// No network/model call — pure shape transform on an export the user fetched themselves
// (`gh api repos/{o}/{r}/pulls/{n}/{reviews,comments}` etc.), so it never touches credentials.
// Ceiling: no OAuth/webhook/sync (that's the live connector, unbuilt); one source (GitHub);
// per-comment provenance is associative (PR ref + path:line hint), not a pinned per-comment id.

import { readFileSync } from 'node:fs';

// Bots (github-actions[bot], dependabot[bot], ...) never make design decisions; their comments
// would pollute attribution with a non-human author. Drop them.
function isBot(login) {
  return typeof login === 'string' && login.endsWith('[bot]');
}

function anchorFor(kind, c) {
  if (kind === 'review_comment' && c.path) {
    const line = c.line != null ? c.line : c.original_line;
    return line != null ? ` (on ${c.path}:${line})` : ` (on ${c.path})`;
  }
  if (kind === 'review') {
    return c.state ? ` (review: ${String(c.state).toLowerCase()})` : ' (review)';
  }
  return '';
}

function collect(kind, arr, out) {
  if (!Array.isArray(arr)) return;
  for (const c of arr) {
    const login = c && c.user && c.user.login;
    if (!login || isBot(login)) continue;
    const body = (c.body || '').trim();
    if (!body) continue; // an approval with no summary carries no decision text
    // ponytail: Date.parse for chronological order; entries without a timestamp sort first (stable).
    const ts = Date.parse(c.created_at || c.submitted_at || '');
    // Preserve reply structure: an inline comment with in_reply_to_id is a rebuttal/agreement in a
    // thread, not an independent ruling. Marking it keeps the flatten from reading a reply as its own
    // decision (Sol it59 #3). Full thread reconstruction stays the extraction model's job.
    out.push({ login, body, anchor: anchorFor(kind, c), ts: Number.isNaN(ts) ? 0 : ts, isReply: c.in_reply_to_id != null });
  }
}

function refFor(pr, exportObj) {
  if (pr && pr.html_url) return pr.html_url;
  const num = (pr && pr.number) != null ? pr.number : exportObj.number;
  const repo = pr && pr.base && pr.base.repo && pr.base.repo.full_name;
  const title = (pr && pr.title) || exportObj.title;
  if (repo && num != null) return repo + '#' + num + (title ? ' — ' + title : '');
  if (num != null) return 'PR #' + num + (title ? ' — ' + title : '');
  return 'GitHub PR review';
}

// Returns { text, source_meta:{ref, kind:'code-review'} } ready for ingest_transcript.
// Throws when nothing attributable survives, so the caller never ingests an empty source.
export function formatGithubReview(exportObj) {
  if (!exportObj || typeof exportObj !== 'object') {
    throw new Error('formatGithubReview: expected a GitHub PR export object');
  }
  const entries = [];
  collect('review', exportObj.reviews, entries);
  collect('review_comment', exportObj.review_comments, entries);
  collect('issue_comment', exportObj.issue_comments, entries);
  if (entries.length === 0) {
    throw new Error('No attributable review comments found (all empty, bot-authored, or missing a login).');
  }
  entries.sort((a, b) => a.ts - b.ts);
  const text = entries.map((e) => `${e.isReply ? '↳ ' : ''}@${e.login}${e.anchor}: ${e.body}`).join('\n\n');
  return { text, source_meta: { ref: refFor(exportObj.pull_request, exportObj), kind: 'code-review' } };
}

// CLI: node scripts/import-github-review.mjs <export.json> -> prints {text, source_meta} for ingest_transcript.
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: import-github-review.mjs <github-pr-export.json>');
    process.exitCode = 1;
  } else {
    try {
      const out = formatGithubReview(JSON.parse(readFileSync(file, 'utf8')));
      console.log(JSON.stringify(out, null, 2));
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    }
  }
}
