#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestTimeoutMs = 10_000;

function packageBinPath(pkg) {
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && Object.values(pkg.bin)[0];
  if (typeof bin !== 'string' || bin.length === 0) {
    throw new Error('package.json must declare a bin entry for the stdio server');
  }
  return path.resolve(repoRoot, bin);
}

export async function listBuiltServerTools() {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const child = spawn(process.execPath, [packageBinPath(pkg)], {
    cwd: repoRoot,
    env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  let stderr = '';
  let nextId = 1;
  let protocolError = null;
  let shuttingDown = false;

  function fail(error) {
    if (protocolError) return;
    protocolError = error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  }

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', error => fail(new Error(`built server stdin failed: ${error.message}`)));
  child.once('error', error => fail(new Error(`could not start built server: ${error.message}`)));
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      fail(new Error(`built server exited before responding (code=${code}, signal=${signal}): ${stderr.trim()}`));
    }
  });

  const lines = createInterface({ input: child.stdout });
  lines.once('close', () => {
    if (!shuttingDown) fail(new Error(`built server closed stdout before responding: ${stderr.trim()}`));
  });
  lines.on('line', line => {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      fail(new Error(`built server yielded malformed JSON: ${error.message}`));
      return;
    }

    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`JSON-RPC ${message.id} failed: ${JSON.stringify(message.error)}`));
      else waiter.resolve(message.result);
    }
  });

  function request(method, params = {}) {
    if (protocolError) return Promise.reject(protocolError);
    const id = nextId++;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        fail(new Error(`built server timed out after ${requestTimeoutMs}ms waiting for ${method}`));
      }, requestTimeoutMs);
      pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return response;
  }

  async function terminateChild() {
    shuttingDown = true;
    lines.close();
    if (child.exitCode !== null || child.signalCode !== null) return;

    function waitForExit(timeoutMs) {
      if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
      return new Promise(resolve => {
        function onExit() {
          clearTimeout(timer);
          resolve(true);
        }
        const timer = setTimeout(() => {
          child.removeListener('exit', onExit);
          resolve(false);
        }, timeoutMs);
        timer.unref();
        child.once('exit', onExit);
      });
    }

    child.kill();
    if (!await waitForExit(500)) {
      child.kill('SIGKILL');
      await waitForExit(500);
    }
  }

  try {
    await request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'sync-manifest-tools', version: '1.0.0' },
    });
    const result = await request('tools/list');
    if (protocolError) throw protocolError;
    if (!result || !Array.isArray(result.tools)) {
      throw new Error('built server returned malformed tools/list JSON: result.tools is not an array');
    }
    if (result.tools.length === 0) {
      throw new Error('built server returned 0 tools; refusing to rewrite manifest.json');
    }
    for (const tool of result.tools) {
      if (!tool || typeof tool.name !== 'string' || !tool.name || typeof tool.description !== 'string') {
        throw new Error('built server returned malformed tools/list JSON: every tool needs string name and description');
      }
    }
    return result.tools;
  } finally {
    await terminateChild();
  }
}

export function shortDescription(description) {
  const normalized = description.replace(/\s+/g, ' ').trim();
  const sentence = new Intl.Segmenter('en', { granularity: 'sentence' })
    .segment(normalized)[Symbol.iterator]().next().value?.segment.trim() || normalized;
  if (sentence.length <= 120) return sentence;

  const wordBoundary = sentence.lastIndexOf(' ', 119);
  if (wordBoundary === -1) {
    throw new Error('tool description begins with a word longer than 119 characters');
  }
  return `${sentence.slice(0, wordBoundary).trimEnd()}…`;
}

// Hand-typed tool counts drift silently: Glama scraped "99 tools" off the README
// for the v2.2.9 listing while the manifest said 100, and llms.txt — the file AI
// agents read — sat at 100 while the manifest moved to 104. Each count below moves
// with the manifest or the sync fails loudly. Each regex must capture (prefix,
// digits, suffix) so the digits can be swapped without touching the copy.
const COUNT_SURFACES = [
  {
    file: 'README.md',
    patterns: [
      /(\*\*)(\d+)( tools\*\*, including Grab)/,
      /(\| Local stdio \|.*\| \*\*)(\d+)(\*\* \| Yes \| Yes \|)/,
    ],
  },
  {
    file: 'web/public/llms.txt',
    patterns: [
      /(It exposes )(\d+)( tools spanning)/,
      /(\n- )(\d+)( focused tools, grouped by job)/,
      /(the knowledge layers, the )(\d+)( tools)/,
    ],
  },
];

// Both Vercel projects publish an llms.txt for the same project — web/public/ at
// the apex, site/ at mcp.ravenmcp.ai. check-site-drift asserts they match
// byte-for-byte, so bumping the count in one and not the other just moves the
// failure from a stale number to a divergence. Mirror instead of listing site/
// in COUNT_SURFACES: one copy owns the prose, the other tracks it exactly.
const MIRRORS = [{ from: 'web/public/llms.txt', to: 'site/llms.txt' }];

export async function syncCountSurfaces(count) {
  const changed = [];
  for (const { file, patterns } of COUNT_SURFACES) {
    const filePath = path.join(repoRoot, file);
    const original = await readFile(filePath, 'utf8');
    let updated = original;
    for (const pattern of patterns) {
      if (!pattern.test(updated)) {
        throw new Error(`${file} tool-count pattern no longer matches: ${pattern}`);
      }
      updated = updated.replace(pattern, `$1${count}$3`);
    }
    if (updated !== original) {
      await writeFile(filePath, updated);
      changed.push(file);
    }
  }

  for (const { from, to } of MIRRORS) {
    const source = await readFile(path.join(repoRoot, from), 'utf8');
    const destPath = path.join(repoRoot, to);
    if (source !== (await readFile(destPath, 'utf8'))) {
      await writeFile(destPath, source);
      changed.push(to);
    }
  }

  return changed;
}

export async function syncManifestTools() {
  const manifestPath = path.join(repoRoot, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const tools = await listBuiltServerTools();
  manifest.tools = tools.map(tool => ({
    name: tool.name,
    description: shortDescription(tool.description),
  }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await syncCountSurfaces(tools.length);
  return tools.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncManifestTools()
    .then(count => console.log(`Synced ${count} tools into manifest.json`))
    .catch(error => {
      console.error(`sync-manifest-tools: ${error.message}`);
      process.exitCode = 1;
    });
}
