// The /motion "Try it" files are built by scripts/build-motion-try.mjs and committed.
// They ship on the public site, so they must be complete and must not name the
// builder's machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';

const DIR = 'web/public/playgrounds/try';

test('every suggestion on /motion has its playground and a spot on the page capture', async () => {
  const data = JSON.parse(await readFile(path.join(DIR, 'suggestions.json'), 'utf8'));
  const files = new Set(await readdir(DIR));
  assert.ok(files.has(data.page.file));
  assert.ok(data.suggestions.length >= 4, 'only ' + data.suggestions.length + ' suggestions');
  for (const s of data.suggestions) {
    assert.ok(files.has(s.file), s.file);
    assert.ok(s.label && s.why && s.when, s.file);
    assert.ok(s.box.x >= 0 && s.box.w > 0 && s.box.x + s.box.w <= data.page.width + 1, s.file + ' box is off the page');
  }
});

test('the /motion playgrounds name no local folder and keep their script policy', async () => {
  for (const name of await readdir(DIR)) {
    if (!name.endsWith('.html')) continue;
    const html = await readFile(path.join(DIR, name), 'utf8');
    assert.doesNotMatch(html, /\/var\/folders|\/private\/|\/Users\/|\/home\/|raven-motion-try-/, name);
    assert.match(html, /http-equiv="Content-Security-Policy"/, name);
    assert.doesNotMatch(html, /<script[^>]*\ssrc=/i, name);
  }
});

let chromium;
try {
  ({ chromium } = await import('playwright'));
  const probe = await chromium.launch();
  await probe.close();
} catch {
  chromium = null;
}

// On the site the playground runs in sandbox="allow-scripts" (MotionFrame.tsx), which has no
// clipboard, so Copy must hand its text to the parent page. This parent answers like MotionFrame.
const PARENT = `<!doctype html><iframe id="f" src="/FILE" sandbox="allow-scripts" style="width:1280px;height:900px"></iframe>
<script>window.got=[];addEventListener('message',function(e){var f=document.getElementById('f').contentWindow;
if(e.source!==f||e.origin!=='null'||!e.data||e.data.type!=='raven-motion-copy')return;window.got.push(e.data.text);
f.postMessage({type:'raven-motion-copied',id:e.data.id,ok:true},'*');});</script>`;

test('a /motion playground copies through the parent page when framed in a sandbox', { skip: !chromium && 'Chromium unavailable' }, async () => {
  const data = JSON.parse(await readFile(path.join(DIR, 'suggestions.json'), 'utf8'));
  const root = path.resolve(DIR);
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
    if (name.startsWith('parent/')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PARENT.replace('FILE', name.slice(7)));
      return;
    }
    const file = path.join(root, name);
    if (!file.startsWith(root + path.sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    for (const s of data.suggestions) {
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:' + server.address().port + '/parent/' + s.file);
      const frame = page.frameLocator('#f');
      await frame.locator('#copy-agent').click();
      await page.waitForFunction(() => window.got.length > 0, null, { timeout: 5000 });
      const got = await page.evaluate(() => window.got[0]);
      assert.match(got, /Please build this motion/, s.file);
      await frame.getByText('Copied. Paste it into your agent', { exact: false }).first().waitFor({ timeout: 3000 });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});
