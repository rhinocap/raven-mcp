#!/usr/bin/env node

import { appendFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverPath = path.join(repoRoot, 'dist/index.js');
const destructiveTool = 'delete_taste_data';

function parseArgs(argv) {
  let configPath = process.env.CODEX_HOME
    ? path.join(process.env.CODEX_HOME, 'config.toml')
    : path.join(homedir(), '.codex', 'config.toml');
  let write = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write') {
      write = true;
    } else if (arg === '--config') {
      i++;
      if (!argv[i]) throw new Error('--config requires a path');
      configPath = path.resolve(argv[i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { configPath, write };
}

function quotedValues(source) {
  const values = [];
  const pattern = /"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    values.push(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return values;
}

function parseConfig(source) {
  const lines = source.split(/\r?\n/);
  const disabled = new Set();
  const approvals = new Map();

  let ravenStart = -1;
  let ravenEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\[mcp_servers\.raven\]\s*(?:#.*)?$/.test(lines[i])) {
      ravenStart = i + 1;
      for (let j = ravenStart; j < lines.length; j++) {
        if (/^\s*\[/.test(lines[j])) {
          ravenEnd = j;
          break;
        }
      }
      break;
    }
  }

  if (ravenStart !== -1) {
    const ravenBody = lines.slice(ravenStart, ravenEnd).join('\n');
    const disabledMatch = /(?:^|\n)\s*disabled_tools\s*=\s*\[([\s\S]*?)\]/m.exec(ravenBody);
    if (disabledMatch) {
      for (const name of quotedValues(disabledMatch[1])) disabled.add(name);
    }
  }

  const headerPattern = /^\s*\[mcp_servers\.raven\.tools\.(?:([A-Za-z0-9_-]+)|"((?:\\.|[^"\\])*)")\]\s*(?:#.*)?$/;
  const modePattern = /^\s*approval_mode\s*=\s*"([^"]+)"\s*(?:#.*)?$/;
  for (let i = 0; i < lines.length; i++) {
    const header = headerPattern.exec(lines[i]);
    if (!header) continue;
    const name = header[1] || header[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    for (let j = i + 1; j < lines.length && !/^\s*\[/.test(lines[j]); j++) {
      const mode = modePattern.exec(lines[j]);
      if (mode) {
        approvals.set(name, mode[1]);
        break;
      }
    }
  }

  return { disabled, approvals };
}

function listLiveTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath], {
      cwd: repoRoot,
      env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stderr = '';
    let settled = false;
    let names = [];
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for Raven tools/list')), 15_000);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      if (error) reject(error);
      else resolve(value);
    }

    function requestTools(cursor) {
      const params = cursor ? { cursor } : {};
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params }) + '\n');
    }

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch (error) {
          finish(new Error(`Malformed JSON from Raven server: ${error.message}\n${line}`));
          return;
        }
        if (message.id === 1) {
          if (message.error || !message.result) {
            finish(new Error(`Raven initialize failed: ${JSON.stringify(message.error || message)}`));
            return;
          }
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          requestTools();
        } else if (message.id === 2) {
          const tools = message.result && message.result.tools;
          if (message.error || !Array.isArray(tools)) {
            finish(new Error(`Malformed Raven tools/list response: ${line}`));
            return;
          }
          names = names.concat(tools.map((tool) => tool && tool.name));
          if (message.result.nextCursor) {
            requestTools(message.result.nextCursor);
          } else if (names.length === 0 || names.some((name) => typeof name !== 'string' || name === '')) {
            finish(new Error('Raven tools/list returned zero tools or malformed tool names'));
          } else {
            finish(null, [...new Set(names)].sort());
          }
        }
      }
    });
    child.on('error', (error) => finish(new Error(`Could not start Raven server: ${error.message}`)));
    child.on('close', (code) => {
      if (!settled) finish(new Error(`Raven server exited before tools/list (code ${code})${stderr ? `:\n${stderr}` : ''}`));
    });
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'sync-codex-approvals', version: '1.0.0' },
      },
    }) + '\n');
  });
}

function printNames(label, names) {
  console.log(`${label}: ${names.length}`);
  for (const name of names) console.log(`  - ${name}`);
}

function formatToolKey(name) {
  if (/^[A-Za-z0-9_-]+$/.test(name)) return name;
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [source, liveTools] = await Promise.all([
    readFile(options.configPath, 'utf8'),
    listLiveTools(),
  ]);
  const { disabled, approvals } = parseConfig(source);
  const liveSet = new Set(liveTools);
  const missing = liveTools.filter((name) =>
    name !== destructiveTool && !disabled.has(name) && !approvals.has(name)
  );
  const stale = [...approvals.keys()].filter((name) => !liveSet.has(name)).sort();

  console.log('Codex approval sync');
  console.log(`Config: ${options.configPath}`);
  console.log(`Live tools: ${liveTools.length}`);
  console.log(`Disabled tools: ${disabled.size}`);
  console.log(`Existing approvals: ${approvals.size}`);
  printNames('Missing approvals', missing);
  printNames('Stale approvals', stale);

  if (!options.write) {
    process.exitCode = missing.length > 0 ? 1 : 0;
    return;
  }

  if (missing.length === 0) {
    console.log('Appended approvals: 0');
    return;
  }

  console.log('Approval disclosure');
  for (const name of missing) console.log(`  - ${name}: approval_mode="approve"`);
  console.log('These entries let Codex call those tools without per-call approval prompts.');

  const separator = source.length === 0 || source.endsWith('\n\n')
    ? ''
    : source.endsWith('\n') ? '\n' : '\n\n';
  const blocks = missing.map((name) =>
    `[mcp_servers.raven.tools.${formatToolKey(name)}]\napproval_mode = "approve"\n\n`
  ).join('');
  await appendFile(options.configPath, separator + blocks, 'utf8');
  printNames('Appended approvals', missing);
}

main().catch((error) => {
  console.error(`sync-codex-approvals: ${error.message}`);
  process.exitCode = 1;
});
