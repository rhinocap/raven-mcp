#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs, existsSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const VERSION_RE = /^\d+\.\d+\.\d+$/;

function die(msg, code = 1) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(code);
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    cwd: opts.cwd || REPO_ROOT,
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim()}`);
  }
  return (r.stdout || '').trim();
}

function gitOr(args, fallback) {
  try { return git(args); } catch { return fallback; }
}

function findTagAtHead() {
  const r = spawnSync('git', ['tag', '--points-at', 'HEAD'], {
    encoding: 'utf8', cwd: REPO_ROOT,
  });
  if (r.status !== 0) {
    throw new Error(`git tag failed: ${(r.stderr || r.stdout || '').trim() || `exit ${r.status}`}`);
  }
  const tags = (r.stdout || '').split('\n').map(s => s.trim())
    .filter(t => /^v\d+\.\d+\.\d+$/.test(t));
  if (tags.length > 1) throw new Error(`multiple release tags point at HEAD: ${tags.join(', ')}`);
  return tags[0] || null;
}

function tagIfExists(tag) {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
    encoding: 'utf8', cwd: REPO_ROOT,
  });
  return r.status === 0 ? tag : null;
}

function findPreviousTag(thisTag) {
  return git(['describe', '--tags', '--abbrev=0', thisTag ? `${thisTag}^` : 'HEAD']);
}

function resolveVersion(arg) {
  if (arg) {
    if (!VERSION_RE.test(arg)) die(`--version must match ${VERSION_RE}`);
    return arg;
  }
  const tag = findTagAtHead();
  if (tag) {
    const v = tag.replace(/^v/, '');
    if (VERSION_RE.test(v)) return v;
  }
  try {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    if (!pkg.version || !VERSION_RE.test(pkg.version)) {
      die('package.json version missing or malformed');
    }
    return pkg.version;
  } catch (e) {
    die(`could not resolve version: ${e.message}`);
  }
}

function runDriftCheck() {
  const r = spawnSync(process.execPath, ['scripts/check-site-drift.mjs', '--json'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
  if (r.error || ![0, 1].includes(r.status)) {
    throw new Error(`check-site-drift failed: ${r.error?.message || (r.stderr || r.stdout || '').trim() || `exit ${r.status}`}`);
  }
  let j;
  try { j = JSON.parse(r.stdout); }
  catch (e) { throw new Error(`could not parse drift output as JSON: ${e.message}`); }
  if (!Array.isArray(j?.errors)) throw new Error('drift output is missing an errors array');
  return {
    errors: j.errors,
    findings: j,
  };
}

async function changelogHasVersion(file, v) {
  let j;
  try {
    j = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read web/data/changelog.json: ${error.message}`);
  }
  if (!Array.isArray(j?.releases)) throw new Error('web/data/changelog.json is missing a releases array');
  return j.releases.some(release => release?.version === v);
}

function branchExists(branch) {
  const r = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
    encoding: 'utf8', cwd: REPO_ROOT,
  });
  if (r.status === 0) return true;
  if (r.status === 1 && !r.error) return false;
  throw new Error(`git show-ref failed: ${r.error?.message || (r.stderr || r.stdout || '').trim() || `exit ${r.status}`}`);
}

function getCommitSubjects(range) {
  const out = git(['log', '--pretty=format:%s', range]);
  return out.split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.startsWith('auto-save:') && !s.startsWith('Session log:'));
}

function buildPrompt(version, subjects, drift) {
  const lines = [];
  lines.push(`You are preparing a marketing-site preview for raven-mcp release v${version}.`);
  lines.push('');
  lines.push('Commit subjects in this release (use ONLY these to justify changes):');
  if (subjects.length === 0) lines.push('(none)');
  else subjects.forEach(s => lines.push(`- ${s}`));
  lines.push('');
  lines.push('Site drift findings from check-site-drift (JSON):');
  lines.push(JSON.stringify(drift.findings, null, 2));
  lines.push('');
  lines.push('Instructions:');
  lines.push(`- Add or correct the "v${version}" entry at the top of web/data/changelog.json.`);
  lines.push('- Propose ONLY changes the commit range above actually supports; do not invent features.');
  lines.push('- Fix anything the drift findings explicitly name.');
  lines.push('- Flag tool descriptions in web/components/tools/ToolsSection.tsx that the commit range made inaccurate (leave a clear comment).');
  lines.push('- Write ONLY inside web/. Do not touch any path outside web/.');
  lines.push('- Do not run git commands. Do not commit. Do not push. Do not deploy. Do not start a server.');
  lines.push('- Do not run npm/next build, lint, tests, or any verification ritual — the caller builds and serves this worktree afterwards. Edit the files and stop.');
  return lines.join('\n');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      const req = http.get(url, res => {
        res.resume();
        res.on('end', () => resolve());
        res.on('error', () => retry());
      });
      req.on('error', () => retry());
      req.setTimeout(3000, () => req.destroy(new Error('timeout')));
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`server at ${url} did not come up within ${timeoutMs}ms`));
        return;
      }
      setTimeout(attempt, 1000);
    };
    attempt();
  });
}

function runSelfCheck() {
  const checks = [
    ['VERSION_RE matches 1.2.3', VERSION_RE.test('1.2.3') === true],
    ['VERSION_RE rejects 1.2', VERSION_RE.test('1.2') === false],
    ['VERSION_RE rejects 1.2.3.4', VERSION_RE.test('1.2.3.4') === false],
  ];
  for (const [name, ok] of checks) {
    if (!ok) die(`self-check failed: ${name}`);
  }
  console.log('self-check passed');
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const selfCheck = args.includes('--self-check');
  let versionArg = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--version') {
      versionArg = args[++i];
      if (!versionArg || versionArg.startsWith('--')) die('--version requires a value');
    } else if (args[i] !== '--json' && args[i] !== '--self-check') {
      die(`unknown argument: ${args[i]}`);
    }
  }

  if (selfCheck) {
    runSelfCheck();
    return;
  }

  // Step 1: CI guard
  if (process.env.CI === 'true' || process.env.RAVEN_SKIP_MARKETING_PREVIEW === '1') {
    const msg = 'skipping marketing preview (CI or RAVEN_SKIP_MARKETING_PREVIEW)';
    if (jsonMode) console.log(JSON.stringify({ skipped: true, reason: msg }));
    else console.log(msg);
    return;
  }

  // Step 2: resolve version, headRef, range
  const version = resolveVersion(versionArg);
  const thisTag = findTagAtHead() || tagIfExists(`v${version}`);
  if (thisTag && thisTag !== `v${version}`) die(`version ${version} does not match HEAD tag ${thisTag}`);
  // In the release.sh flow HEAD *is* the tag. When rerun later (--version X with
  // commits on top), diff the release itself, not everything since.
  const headRef = thisTag || 'HEAD';
  const previousTag = findPreviousTag(thisTag);
  const range = `${previousTag}..${headRef}`;

  // Step 3: drift gate
  const drift = runDriftCheck();
  const changelogPath = path.join(REPO_ROOT, 'web/data/changelog.json');
  const hasEntry = await changelogHasVersion(changelogPath, `v${version}`);
  if (drift.errors.length === 0 && hasEntry) {
    const msg = 'site in sync — nothing to preview';
    if (jsonMode) console.log(JSON.stringify({ inSync: true, message: msg }));
    else console.log(msg);
    return;
  }

  // Step 4: worktree
  const dir = `/tmp/raven-marketing-v${version}`;
  const branch = `marketing-preview/v${version}`;
  if (existsSync(dir) || branchExists(branch)) {
    die(`refusing to proceed: worktree target (${dir}) or branch (${branch}) already exists — an unapproved preview must never be silently destroyed`);
  }
  try {
    git(['worktree', 'add', '-b', branch, dir, headRef]);
  } catch (e) {
    die(`failed to add worktree: ${e.message}`);
  }

  // Step 5: symlink node_modules
  const rootNm = path.join(REPO_ROOT, 'web/node_modules');
  const wtNm = path.join(dir, 'web/node_modules');
  if (existsSync(rootNm) && statSync(rootNm).isDirectory()) {
    try {
      await fs.mkdir(path.dirname(wtNm), { recursive: true });
      symlinkSync(path.resolve(rootNm), wtNm, 'dir');
    } catch (e) {
      die(`failed to symlink web/node_modules into worktree: ${e.message}`);
    }
  }

  // Step 6: model leg
  const subjects = getCommitSubjects(range);
  const prompt = buildPrompt(version, subjects, drift);
  const codexRes = spawn('codex', [
    'exec',
    '-m', 'gpt-5.6-sol',
    '-c', 'model_reasoning_effort="medium"',
    '-s', 'workspace-write',
    '--skip-git-repo-check',
    // Without these the leg inherits the user's global Codex config and spends its
    // budget reading session skills/hooks instead of editing web/.
    '--ephemeral',
    '--ignore-user-config',
    prompt,
  ], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  codexRes.stdout.on('data', chunk => process.stderr.write(chunk));
  codexRes.stderr.on('data', chunk => process.stderr.write(chunk));
  await new Promise((resolve, reject) => {
    codexRes.on('error', reject);
    codexRes.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`codex exited with code ${code}`));
    });
  }).catch(e => die(`codex failed: ${e.message}`));

  // Step 7: containment check
  // Bare paths, not porcelain: a status column is whitespace-sensitive and the
  // git() helper trims, which silently ate the first line's leading space.
  const changedPaths = [
    git(['diff', '--name-only', 'HEAD'], { cwd: dir }),
    git(['ls-files', '--others', '--exclude-standard'], { cwd: dir }),
  ].join('\n').split('\n').map(s => s.trim()).filter(Boolean);
  const outside = changedPaths.filter(p => p !== 'web' && !p.startsWith('web/'));
  if (outside.length > 0) {
    process.stderr.write('containment violated; paths outside web/:\n');
    outside.forEach(p => process.stderr.write(`  ${p}\n`));
    die('refusing to serve; worktree left for inspection (nothing reverted)');
  }
  if (changedPaths.length === 0) {
    const msg = 'preview produced no changes';
    if (jsonMode) console.log(JSON.stringify({ noChanges: true, message: msg, worktree: dir, branch }));
    else console.log(msg);
    return;
  }

  // Step 8: build
  const buildRes = spawnSync('npm', ['run', 'build'], {
    cwd: path.join(dir, 'web'),
    stdio: 'pipe',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (buildRes.status !== 0) {
    process.stdout.write(buildRes.stdout || '');
    process.stderr.write(buildRes.stderr || '');
    die('build failed; worktree left for inspection');
  }

  // Step 9: serve
  const port = await freePort().catch(e => die(`could not pick a free port: ${e.message}`));
  const bridgePort = await freePort().catch(e => die(`could not pick a free bridge port: ${e.message}`));
  const devProc = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: path.join(dir, 'web'),
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  devProc.on('error', e => die(`next dev failed to start: ${e.message}`));

  const homeUrl = `http://127.0.0.1:${port}/`;
  try {
    await waitForServer(homeUrl);
  } catch (e) {
    try { devProc.kill('SIGTERM'); } catch {}
    die(e.message);
  }

  const grabBridgePath = path.join(REPO_ROOT, 'dist/grab-bridge.js');
  let startGrabSession;
  try {
    ({ startGrabSession } = await import(grabBridgePath));
  } catch (e) {
    try { devProc.kill('SIGTERM'); } catch {}
    die(`failed to import grab-bridge at ${grabBridgePath}: ${e.message}`);
  }
  let stopGrabSession = null;
  try {
    stopGrabSession = await startGrabSession(null, bridgePort, homeUrl, 'consumer');
  } catch (e) {
    try { devProc.kill('SIGTERM'); } catch {}
    die(`startGrabSession failed: ${e.message}`);
  }

  const homeBridgeUrl = `http://127.0.0.1:${bridgePort}/`;
  const changelogBridgeUrl = `http://127.0.0.1:${bridgePort}/changelog`;

  const approvalInstruction =
    `Andrew: review the preview, then merge branch "${branch}" yourself. ` +
    `Nothing was committed, pushed, or deployed by this script.`;

  const report = {
    worktree: dir,
    branch,
    headRef,
    version,
    range,
    changedPaths,
    homeBridgeUrl,
    changelogBridgeUrl,
    approvalInstruction,
    nothingCommittedPushedOrDeployed: true,
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== marketing preview ready ===');
    console.log('worktree:', dir);
    console.log('branch:', branch);
    console.log('changed paths:');
    changedPaths.forEach(p => console.log('  ' + p));
    console.log('home (bridge):', homeBridgeUrl);
    console.log('changelog (bridge):', changelogBridgeUrl);
    console.log(approvalInstruction);
    console.log('Nothing was committed, pushed, or deployed.');
  }

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      if (typeof stopGrabSession === 'function') await stopGrabSession();
    } catch {}
    try { devProc.kill('SIGTERM'); } catch {}
    try { git(['worktree', 'remove', '--force', dir]); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // keep the process alive so the dev server stays up
  await new Promise(() => {});
}

main().catch(e => {
  die(e && e.message ? e.message : String(e));
});
