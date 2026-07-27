#!/usr/bin/env node

// Archives complete Figma comment API responses using a PAT with file_comments:read; optional node-name resolution also needs file_content:read. Raw comment responses above 100 MB are rejected per file, while verbatim response text remains the durable history artifact.

import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const USAGE = 'Usage: node scripts/figma-comments-archive.mjs [--out <dir>] [--md] [--resolve-nodes] <fileKey> [<fileKey>…]\n       node scripts/figma-comments-archive.mjs --paste <label> [--out <dir>] [--md] [--force]';
const MAX_COMMENTS_RESPONSE_BYTES = 100 * 1024 * 1024;
const token = process.env.FIGMA_TOKEN;

function failUsage(message) {
  console.error(message || USAGE);
  process.exit(2);
}

function parseFileKey(value) {
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const parts = url.pathname.split('/').filter(Boolean);
      const kindIndex = parts.findIndex(function (part) {
        return part === 'design' || part === 'file';
      });
      if (!/(^|\.)figma\.com$/i.test(url.hostname) || kindIndex < 0 || !parts[kindIndex + 1]) return null;
      return parts[kindIndex + 1];
    } catch {
      return null;
    }
  }
  return value && !/[\s/\\]/.test(value) ? value : null;
}

function parseArgs(argv) {
  const options = { outDir: 'figma-comments-archive', markdown: false, resolveNodes: false, pasteLabel: null, force: false, keys: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) failUsage(USAGE);
      options.outDir = argv[index + 1];
      index += 1;
    } else if (arg === '--md') {
      options.markdown = true;
    } else if (arg === '--resolve-nodes') {
      options.resolveNodes = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--paste') {
      if (options.pasteLabel != null || !argv[index + 1] || argv[index + 1].startsWith('--')) failUsage(USAGE);
      if (/\s|[/\\]/.test(argv[index + 1])) failUsage(`Invalid paste label: ${argv[index + 1]}`);
      options.pasteLabel = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--')) {
      failUsage(USAGE);
    } else {
      const key = parseFileKey(arg);
      if (!key) failUsage(`Invalid Figma file key or URL: ${arg}`);
      options.keys.push(key);
    }
  }
  if (options.pasteLabel != null && (options.keys.length > 0 || options.resolveNodes)) failUsage(USAGE);
  if (options.pasteLabel == null && options.force) failUsage(USAGE);
  if (options.pasteLabel == null && options.keys.length === 0) failUsage(USAGE);
  return options;
}

function looksLikeTimestamp(value) {
  const text = String(value || '').trim();
  return /\bago\b/i.test(text)
    || /^just now$/i.test(text)
    || /^yesterday\b/i.test(text)
    || /^\d{4}-\d{2}-\d{2}/.test(text)
    || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d/i.test(text);
}

function parsePastedComments(text) {
  const blocks = text.replace(/\r\n?/g, '\n').trim().split(/\n(?:[^\S\n]*\n)+/);
  const comments = [];
  blocks.forEach(function (block, threadIndex) {
    const lines = block.split('\n');
    if (lines.length < 2 || !looksLikeTimestamp(lines[1])) {
      comments.push({
        id: `t${threadIndex + 1}c1`,
        order: comments.length,
        user: { handle: 'unknown' },
        created_at: 'unknown',
        message: block
      });
      return;
    }

    const threadComments = [];
    let index = 0;
    while (index < lines.length) {
      const handle = lines[index];
      const createdAt = lines[index + 1];
      index += 2;
      const messageLines = [];
      while (index < lines.length && !(index + 1 < lines.length && looksLikeTimestamp(lines[index + 1]))) {
        messageLines.push(lines[index]);
        index += 1;
      }
      const commentIndex = threadComments.length + 1;
      const id = `t${threadIndex + 1}c${commentIndex}`;
      const comment = {
        id,
        order: comments.length + threadComments.length,
        user: { handle },
        created_at: createdAt,
        message: messageLines.join('\n')
      };
      if (commentIndex > 1) comment.parent_id = `t${threadIndex + 1}c1`;
      threadComments.push(comment);
    }
    comments.push(...threadComments);
  });
  return { comments };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function retryDelayMs(value) {
  if (!value) return 5000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60000, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 5000 : Math.min(60000, Math.max(0, date - Date.now()));
}

function sleep(milliseconds) {
  return new Promise(function (resolvePromise) {
    setTimeout(resolvePromise, milliseconds);
  });
}

async function fetchComments(apiBase, key) {
  const url = `${apiBase}/v1/files/${encodeURIComponent(key)}/comments?as_md=true`;
  for (let retries = 0; retries <= 3; retries += 1) {
    const response = await fetch(url, { headers: { 'X-Figma-Token': token } });
    if (response.status === 429 && retries < 3) {
      await sleep(retryDelayMs(response.headers.get('retry-after')));
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('authorization failed (expired PAT, missing file_comments:read scope, or no file access) — regenerate the PAT and re-export FIGMA_TOKEN');
    }
    if (response.status === 404) {
      throw new Error('file not found (wrong file key or no file access)');
    }
    if (response.status === 429) throw new Error('rate limited after 3 retries');
    if (!response.ok) throw new Error(`Figma comments request failed with HTTP ${response.status}`);
    const rawText = await response.text();
    if (Buffer.byteLength(rawText, 'utf8') > MAX_COMMENTS_RESPONSE_BYTES) {
      throw new Error('Figma comments response exceeded the 100 MB safety limit');
    }
    try {
      return { rawText, payload: JSON.parse(rawText) };
    } catch {
      throw new Error('Figma comments response was not valid JSON');
    }
  }
  throw new Error('rate limited after 3 retries');
}

function collectNodeIds(payload) {
  const ids = new Set();
  const comments = Array.isArray(payload.comments) ? payload.comments : [];
  for (const comment of comments) {
    if (comment && comment.client_meta && comment.client_meta.node_id) {
      ids.add(String(comment.client_meta.node_id));
    }
  }
  return [...ids];
}

async function resolveNodeNames(apiBase, key, nodeIds) {
  const names = new Map();
  for (let offset = 0; offset < nodeIds.length; offset += 50) {
    const chunk = nodeIds.slice(offset, offset + 50);
    const url = new URL(`${apiBase}/v1/files/${encodeURIComponent(key)}/nodes`);
    url.searchParams.set('ids', chunk.join(','));
    url.searchParams.set('depth', '1');
    const response = await fetch(url, { headers: { 'X-Figma-Token': token } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const nodes = payload && payload.nodes && typeof payload.nodes === 'object' ? payload.nodes : {};
    for (const id of chunk) {
      const name = nodes[id] && nodes[id].document && nodes[id].document.name;
      if (typeof name === 'string' && name) names.set(id, name);
    }
  }
  return names;
}

function compareCreatedAt(left, right) {
  // Paste-mode comments carry a numeric `order` (pasted position): their created_at
  // is relative text ("2 days ago") that sorts lexically, not chronologically.
  // Figma API payloads never include `order`, so PAT-mode sorting is unchanged.
  if (left && right && left.order != null && right.order != null) return left.order - right.order;
  return String(left && left.created_at || '').localeCompare(String(right && right.created_at || ''));
}

function threadGroups(comments) {
  const byId = new Map();
  const children = new Map();
  for (const comment of comments) {
    if (comment && comment.id != null) byId.set(String(comment.id), comment);
  }
  for (const comment of comments) {
    if (!comment || comment.parent_id == null) continue;
    const parentId = String(comment.parent_id);
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(comment);
  }
  for (const replies of children.values()) replies.sort(compareCreatedAt);

  const roots = comments.filter(function (comment) {
    return comment && (comment.parent_id == null || !byId.has(String(comment.parent_id)));
  }).sort(compareCreatedAt);
  const visited = new Set();

  function flatten(comment, result) {
    const identity = comment.id == null ? comment : String(comment.id);
    if (visited.has(identity)) return;
    visited.add(identity);
    result.push(comment);
    const replies = comment.id == null ? [] : children.get(String(comment.id)) || [];
    for (const reply of replies) flatten(reply, result);
  }

  const groups = [];
  for (const root of roots) {
    const group = [];
    flatten(root, group);
    groups.push([group[0], ...group.slice(1).sort(compareCreatedAt)]);
  }
  for (const comment of [...comments].sort(compareCreatedAt)) {
    const identity = comment && comment.id == null ? comment : String(comment && comment.id);
    if (!comment || visited.has(identity)) continue;
    const group = [];
    flatten(comment, group);
    groups.push([group[0], ...group.slice(1).sort(compareCreatedAt)]);
  }
  return groups;
}

function anchorLine(root, nodeNames) {
  const meta = root && root.client_meta && typeof root.client_meta === 'object' ? root.client_meta : {};
  if (meta.node_id != null) {
    const id = String(meta.node_id);
    const name = nodeNames.get(id);
    return `anchor: node ${id}${name ? ` — ${name}` : ''}`;
  }
  const coordinates = meta.position && typeof meta.position === 'object' ? meta.position : meta;
  if (coordinates.x != null && coordinates.y != null) return `anchor: canvas (${coordinates.x}, ${coordinates.y})`;
  return 'anchor: unknown';
}

function reactionLine(reactions) {
  if (!Array.isArray(reactions) || reactions.length === 0) return null;
  const totals = new Map();
  for (const reaction of reactions) {
    const emoji = reaction && reaction.emoji != null ? String(reaction.emoji) : 'unknown';
    const count = reaction && Number.isFinite(Number(reaction.count)) ? Number(reaction.count) : 1;
    totals.set(emoji, (totals.get(emoji) || 0) + count);
  }
  return `reactions: ${[...totals].map(function ([emoji, count]) { return `${emoji}×${count}`; }).join(' ')}`;
}

function commentLines(comment, isReply, orphaned) {
  const handle = comment && comment.user && comment.user.handle != null ? comment.user.handle : 'unknown';
  const resolved = comment && (comment.resolved === true || comment.resolved_at) ? ' · [resolved]' : '';
  const messageLines = String(comment && comment.message != null ? comment.message : '').split('\n').map(function (line) {
    return line.startsWith('#') ? `\\${line}` : line;
  });
  const lines = [`**${handle}** · ${comment && comment.created_at || 'unknown'}${resolved}`];
  if (orphaned) lines.push('(reply to a deleted comment)');
  lines.push(...messageLines);
  const reactions = reactionLine(comment && comment.reactions);
  if (reactions) lines.push(reactions);
  if (!isReply) return lines;
  return lines.map(function (line) { return line ? `> ${line}` : '>'; });
}

function renderMarkdown(key, payload, nodeNames) {
  const comments = Array.isArray(payload.comments) ? payload.comments : [];
  const commentIds = new Set(comments.filter(function (comment) {
    return comment && comment.id != null;
  }).map(function (comment) {
    return String(comment.id);
  }));
  const lines = [`# Figma comments archive: ${key}`, ''];
  const groups = threadGroups(comments);
  groups.forEach(function (group, index) {
    lines.push(`## Thread ${index + 1}`, anchorLine(group[0], nodeNames), '');
    group.forEach(function (comment, commentIndex) {
      const orphaned = comment && comment.parent_id != null && !commentIds.has(String(comment.parent_id));
      lines.push(...commentLines(comment, commentIndex > 0 || orphaned, orphaned), '');
    });
  });
  return `${lines.join('\n').trimEnd()}\n`;
}

async function atomicWrite(path, contents) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, path);
}

const argv = process.argv.slice(2);
if (!argv.includes('--paste') && (!token || !token.trim())) {
  console.error('Create a Figma PAT with the file_comments:read scope, then export it as FIGMA_TOKEN.');
  process.exit(2);
}

const options = parseArgs(argv);
const outDir = resolve(options.outDir);

if (options.pasteLabel != null) {
  const rawText = await readStdin();
  const pastedText = rawText.toString('utf8');
  if (!pastedText.trim()) {
    console.error('Pasted comment text is empty.');
    process.exit(2);
  }
  const payload = parsePastedComments(pastedText);
  await mkdir(outDir, { recursive: true });
  const archivePath = resolve(outDir, `${options.pasteLabel}.txt`);
  if (!options.force && await access(archivePath).then(function () { return true; }, function () { return false; })) {
    console.error(`${options.pasteLabel}.txt already exists in ${outDir} — choose a new label or pass --force to replace it.`);
    process.exit(2);
  }
  await atomicWrite(resolve(outDir, `${options.pasteLabel}.txt`), rawText);
  await atomicWrite(resolve(outDir, `${options.pasteLabel}.md`), renderMarkdown(options.pasteLabel, payload, new Map()));
  console.log(`archived 1/1 file(s) → ${outDir}`);
  process.exit(0);
}

const apiBase = (process.env.FIGMA_API_BASE || 'https://api.figma.com').replace(/\/+$/, '');
await mkdir(outDir, { recursive: true });

let archived = 0;
const failed = [];
for (const key of options.keys) {
  try {
    const commentsResponse = await fetchComments(apiBase, key);
    const payload = commentsResponse.payload;
    let nodeNames = new Map();
    if (options.resolveNodes) {
      const nodeIds = collectNodeIds(payload);
      if (nodeIds.length > 0) {
        try {
          nodeNames = await resolveNodeNames(apiBase, key, nodeIds);
        } catch (error) {
          console.error(`${key}: node resolution unavailable (${error.message}); using raw node IDs`);
          nodeNames = new Map();
        }
      }
    }
    if (options.markdown) {
      await atomicWrite(resolve(outDir, `${key}.md`), renderMarkdown(key, payload, nodeNames));
    }
    await atomicWrite(resolve(outDir, `${key}.json`), commentsResponse.rawText);
    archived += 1;
  } catch (error) {
    failed.push(key);
    console.error(`${key}: ${error.message}`);
  }
}

if (failed.length > 0) console.error(`failed: ${failed.join(', ')}`);
console.log(`archived ${archived}/${options.keys.length} file(s) → ${outDir}`);
process.exit(failed.length > 0 ? 1 : 0);
