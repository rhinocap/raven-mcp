import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, 'fixtures');

let capturePage;
let applyDeviceEmulation;
let waitForCustomElementsHydration;
let verifyFindings;
let auditTapTargetsUrl;
let CaptureUnavailableError;

try {
  const capture = await import('../dist/capture.js');
  const tapTargets = await import('../dist/tap-targets.js');
  capturePage = capture.capturePage;
  applyDeviceEmulation = capture.applyDeviceEmulation;
  waitForCustomElementsHydration = capture.waitForCustomElementsHydration;
  verifyFindings = capture.verifyFindings;
  CaptureUnavailableError = capture.CaptureUnavailableError;
  auditTapTargetsUrl = tapTargets.auditTapTargetsUrl;
} catch (err) {
  test('audit fidelity modules available', (t) => {
    t.skip(`dist modules unavailable — run npm run build first. (${err.message})`);
  });
  process.exit(0);
}

async function withFixtureServer(t, fn) {
  const server = createServer((req, res) => {
    const name = path.basename(new URL(req.url, 'http://127.0.0.1').pathname);
    try {
      const html = readFileSync(path.join(fixturesDir, name));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404).end('not found');
    }
  });

  const started = await new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => resolve(true));
  });
  if (!started) {
    t.skip('Local fixture server unavailable in this environment.');
    return;
  }

  const address = server.address();
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runOrSkip(t, fn) {
  try {
    await fn();
  } catch (err) {
    if (CaptureUnavailableError && err instanceof CaptureUnavailableError) {
      t.skip('Playwright chromium not installed. Run `npx playwright install chromium`.');
      return;
    }
    throw err;
  }
}

test('390px capture emulates coarse touch input while 1440px remains desktop', async (t) => {
  await withFixtureServer(t, async (baseUrl) => {
    await runOrSkip(t, async () => {
      const url = `${baseUrl}/device-emulation.html`;
      const mobile = await capturePage(url, { viewport: { w: 390, h: 844 } });
      const desktop = await capturePage(url, { viewport: { w: 1440, h: 900 } });

      assert.strictEqual(mobile.mobile_emulation, true);
      assert.match(mobile.renderedHtml, /data-pointer-coarse="true"/);
      assert.match(mobile.renderedHtml, /data-touch="true"/);
      assert.match(mobile.renderedHtml, /data-mobile-ua="true"/);
      assert.match(mobile.renderedHtml, /data-max-touch-points="5"/);

      assert.strictEqual(desktop.mobile_emulation, false);
      assert.match(desktop.renderedHtml, /data-pointer-coarse="false"/);
      assert.match(desktop.renderedHtml, /data-touch="false"/);
      assert.match(desktop.renderedHtml, /data-mobile-ua="false"/);
      assert.match(desktop.renderedHtml, /data-max-touch-points="0"/);
    });
  });
});

test('tap-target audit waits for delayed custom-element upgrade and pierces open shadow roots', async (t) => {
  await withFixtureServer(t, async (baseUrl) => {
    await runOrSkip(t, async () => {
      const result = await auditTapTargetsUrl(`${baseUrl}/delayed-shadow-target.html`, {
        viewport: { w: 1440, h: 900 },
        minSize: 120,
      });

      assert.strictEqual(result.total, 1, 'the shadow-root link is collected exactly once');
      const link = result.fix_table.find((row) => row.selector.includes('shadow-link'));
      assert.ok(link, 'the shadow-root link is reported');
      assert.match(link.selector, /\[data-testid="delayed-host"\] >>> \[data-testid="shadow-link"\]/);
      assert.strictEqual(link.w, 100, 'post-hydration width is measured');
      assert.strictEqual(link.h, 48, 'post-hydration height is measured');
      assert.ok(!result.warnings.some((warning) => warning.includes('may not have finished hydrating')));
    });
  });
});

test('mobile emulation fails soft when CDP session creation fails', async () => {
  const warnings = [];
  const viewports = [];
  const page = {
    setViewportSize: async (viewport) => viewports.push(viewport),
    context: () => ({
      newCDPSession: async () => {
        throw new Error('CDP unavailable');
      },
    }),
  };

  const emulated = await applyDeviceEmulation(page, { w: 390, h: 844 }, warnings);

  assert.strictEqual(emulated, false);
  assert.deepStrictEqual(viewports.at(-1), { width: 390, height: 844 });
  assert.ok(warnings.some((warning) =>
    warning.includes('mobile emulation unavailable — audited at mobile width with desktop input characteristics')
  ));
});

test('hydration wait has a hard Node-side timeout when page.evaluate never resolves', async () => {
  const warnings = [];
  const started = Date.now();
  const page = {
    evaluate: async () => new Promise(() => {}),
  };

  const hydrated = await waitForCustomElementsHydration(page, warnings);
  const elapsed = Date.now() - started;

  assert.strictEqual(hydrated, false);
  assert.ok(elapsed >= 4500, `outer timeout should not fire prematurely (${elapsed}ms)`);
  assert.ok(elapsed < 5500, `outer timeout should return within ~5.5s (${elapsed}ms)`);
  assert.ok(warnings.some((warning) =>
    warning.includes('custom elements may not have finished hydrating')
  ));
});

test('verification hydration warnings are returned to the caller', async (t) => {
  await withFixtureServer(t, async (baseUrl) => {
    await runOrSkip(t, async () => {
      const verdicts = await verifyFindings(
        { url: `${baseUrl}/wedged-hydration.html` },
        [{
          key: 'structure/title:0',
          rule: 'structure/title',
          message: 'Page is missing a title.',
          kind: 'issue',
        }],
        { viewport: { w: 390, h: 844 } }
      );

      if (verdicts[0].evidence.includes('live verification unavailable')) {
        t.skip('Playwright chromium not installed. Run `npx playwright install chromium`.');
        return;
      }
      assert.ok(verdicts[0].warnings.some((warning) =>
        warning.includes('custom elements may not have finished hydrating')
      ));
    });
  });
});

test('desktop emulation reset failure warns and does not escape', async () => {
  const warnings = [];
  let resetting = false;
  const session = {
    send: async (command) => {
      if (resetting && command === 'Emulation.setTouchEmulationEnabled') {
        throw new Error('reset failed');
      }
    },
  };
  const page = {
    setViewportSize: async () => {},
    context: () => ({ newCDPSession: async () => session }),
  };

  assert.strictEqual(await applyDeviceEmulation(page, { w: 390, h: 844 }, warnings), true);
  resetting = true;
  assert.strictEqual(await applyDeviceEmulation(page, { w: 1440, h: 900 }, warnings), false);
  assert.ok(warnings.some((warning) =>
    warning.includes('previous mobile emulation may persist — desktop capture may retain mobile characteristics')
  ));
});

test('tap-target cap interleaves an early shadow root before later light-DOM targets', async (t) => {
  await withFixtureServer(t, async (baseUrl) => {
    await runOrSkip(t, async () => {
      const result = await auditTapTargetsUrl(`${baseUrl}/shadow-cap-interleaved.html`, {
        viewport: { w: 1440, h: 900 },
      });

      assert.strictEqual(result.total, 500, 'the global cap remains unchanged');
      assert.ok(
        result.fix_table.some((row) => row.selector.includes('early-shadow-target')),
        'the early document-order shadow target is collected before the cap is exhausted'
      );
      assert.ok(result.warnings.some((warning) => warning.includes('capped at 500')));
    });
  });
});

test('hydration wait observes async insertion into an already-open shadow root', async (t) => {
  await withFixtureServer(t, async (baseUrl) => {
    await runOrSkip(t, async () => {
      const result = await auditTapTargetsUrl(`${baseUrl}/delayed-shadow-target.html`, {
        viewport: { w: 1440, h: 900 },
        minSize: 120,
      });

      const link = result.fix_table.find((row) => row.selector.includes('shadow-link'));
      const hydrationWarning = result.warnings.some((warning) =>
        warning.includes('custom elements may not have finished hydrating')
      );
      assert.ok(link || hydrationWarning, 'async shadow render is measured or explicitly warned');
      if (link) {
        assert.strictEqual(link.w, 100);
        assert.strictEqual(link.h, 48);
      }
    });
  });
});

test('desktop capture after a mobile capture on the same page restores the requested viewport', async (t) => {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    t.skip('Playwright not installed.');
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    t.skip('Playwright chromium not installed. Run `npx playwright install chromium`.');
    return;
  }
  try {
    const page = await browser.newPage();
    const probeUrl =
      'data:text/html,<script>window.probe=()=>({coarse:matchMedia("(pointer: coarse)").matches,touch:navigator.maxTouchPoints,w:innerWidth})</script>';

    await applyDeviceEmulation(page, { w: 390, h: 844 }, []);
    await page.goto(probeUrl);
    const mobile = await page.evaluate('probe()');
    assert.strictEqual(mobile.coarse, true);
    assert.strictEqual(mobile.touch, 5);

    await applyDeviceEmulation(page, { w: 1440, h: 900 }, []);
    await page.reload();
    const desktop = await page.evaluate('probe()');
    assert.strictEqual(desktop.coarse, false, 'coarse pointer cleared after mobile pass');
    assert.strictEqual(desktop.touch, 0, 'touch emulation cleared after mobile pass');
    // Regression: a raw-CDP clear plus a same-size setViewportSize used to
    // leave the page at the browser default (1280), not the requested width.
    assert.strictEqual(desktop.w, 1440, 'requested desktop width restored, not browser default');
  } finally {
    await browser.close();
  }
});
