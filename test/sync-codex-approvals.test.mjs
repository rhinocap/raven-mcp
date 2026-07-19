import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distIndex = path.join(repoRoot, 'dist/index.js');
const syncScript = path.join(repoRoot, 'scripts/sync-codex-approvals.mjs');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, RAVEN_NO_USAGE_LOG: '1', ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function listLiveTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [distIndex], {
      cwd: repoRoot,
      env: { ...process.env, RAVEN_NO_USAGE_LOG: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out waiting for Raven tools/list'));
    }, 10_000);

    function finish(err, names) {
      clearTimeout(timeout);
      child.kill();
      if (err) reject(err);
      else resolve(names);
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
        } catch (err) {
          finish(new Error(`Malformed server JSON: ${err.message}\n${line}`));
          return;
        }
        if (message.id === 1) {
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
        } else if (message.id === 2) {
          const tools = message.result && message.result.tools;
          if (!Array.isArray(tools) || tools.length === 0) {
            finish(new Error(`Invalid tools/list response: ${line}\n${stderr}`));
            return;
          }
          finish(null, tools.map((tool) => tool.name).sort());
          return;
        }
      }
    });
    child.on('error', (err) => finish(err));
    child.on('close', (code) => {
      if (code !== null && code !== 0) finish(new Error(`Raven server exited ${code}: ${stderr}`));
    });
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'sync-codex-approvals-test', version: '1.0.0' },
      },
    }) + '\n');
  });
}

test('check and write modes report drift and append only eligible missing approvals', async () => {
  const liveNames = await listLiveTools();
  const eligible = liveNames.filter((name) => name !== 'delete_taste_data');
  assert.ok(eligible.length >= 2, 'fixture needs at least two non-destructive live tools');

  const disabledName = eligible[0];
  const existingName = eligible[1];
  const staleName = 'stale_fixture_tool';
  const missing = eligible.filter((name) => name !== disabledName && name !== existingName);
  const fixture = [
    '[mcp_servers.raven]',
    'disabled_tools = [',
    `  "${disabledName}",`,
    ']',
    '',
    `[mcp_servers.raven.tools.${existingName}]`,
    'approval_mode = "ask"',
    '',
    `[mcp_servers.raven.tools.${staleName}]`,
    'approval_mode = "approve"',
    '',
  ].join('\n');

  const dir = await mkdtemp(path.join(tmpdir(), 'raven-sync-codex-approvals-'));
  const checkConfig = path.join(dir, 'check.toml');
  const writeConfig = path.join(dir, 'write.toml');
  await writeFile(checkConfig, fixture);
  await writeFile(writeConfig, fixture);

  const checked = await run(process.execPath, [syncScript, '--config', checkConfig]);
  assert.equal(checked.code, 1, checked.stderr || checked.stdout);
  assert.match(checked.stdout, new RegExp(`Live tools: ${liveNames.length}\\b`));
  assert.match(checked.stdout, new RegExp(`Missing approvals: ${missing.length}\\b`));
  assert.match(checked.stdout, new RegExp(`Stale approvals: 1\\b`));
  assert.match(checked.stdout, new RegExp(`\\b${staleName}\\b`));
  for (const name of missing) assert.match(checked.stdout, new RegExp(`\\b${name}\\b`));
  assert.equal(await readFile(checkConfig, 'utf8'), fixture, 'check mode must not write');

  const written = await run(process.execPath, [syncScript, '--config', writeConfig, '--write']);
  assert.equal(written.code, 0, written.stderr || written.stdout);
  const disclosureStart = written.stdout.indexOf('Approval disclosure\n');
  const appendedStart = written.stdout.indexOf(`Appended approvals: ${missing.length}\n`);
  assert.ok(disclosureStart !== -1, 'write mode must print an approval disclosure');
  assert.ok(disclosureStart < appendedStart, 'disclosure must be printed before the append result');
  for (const name of missing) {
    assert.match(written.stdout, new RegExp(`  - ${name}: approval_mode="approve"`));
  }
  assert.match(
    written.stdout,
    /These entries let Codex call those tools without per-call approval prompts\./,
  );
  assert.match(written.stdout, new RegExp(`Appended approvals: ${missing.length}\\b`));
  const after = await readFile(writeConfig, 'utf8');
  assert.ok(after.startsWith(fixture), 'write mode must preserve every prior byte');
  const appended = after.slice(fixture.length);
  const expected = '\n' + missing.map((name) =>
    `[mcp_servers.raven.tools.${name}]\napproval_mode = "approve"\n\n`
  ).join('');
  assert.equal(appended, expected, 'write mode must append exactly the missing blocks');
  assert.doesNotMatch(appended, new RegExp(`tools\\.${disabledName}]`));
  assert.doesNotMatch(appended, /tools\.delete_taste_data]/);
  assert.doesNotMatch(appended, new RegExp(`tools\\.${staleName}]`));
});

test('quoted per-tool headers count as existing approvals', async () => {
  const liveNames = await listLiveTools();
  const eligible = liveNames.filter((name) => name !== 'delete_taste_data');
  assert.ok(eligible.length >= 1, 'fixture needs a non-destructive live tool');

  const approvedName = eligible[0];
  const disabledNames = eligible.slice(1);
  const fixture = [
    '[mcp_servers.raven]',
    'disabled_tools = [',
    ...disabledNames.map((name) => `  "${name}",`),
    ']',
    '',
    `[mcp_servers.raven.tools."${approvedName}"]`,
    'approval_mode = "approve"',
    '',
  ].join('\n');

  const codexHome = await mkdtemp(path.join(tmpdir(), 'raven-sync-codex-home-'));
  const configPath = path.join(codexHome, 'config.toml');
  await writeFile(configPath, fixture);

  const written = await run(process.execPath, [syncScript, '--write'], {
    env: { CODEX_HOME: codexHome },
  });
  assert.equal(written.code, 0, written.stderr || written.stdout);
  assert.ok(written.stdout.includes(`Config: ${configPath}\n`));
  assert.match(written.stdout, /Appended approvals: 0\b/);
  assert.equal(await readFile(configPath, 'utf8'), fixture, 'quoted approval must not be re-appended');
});
