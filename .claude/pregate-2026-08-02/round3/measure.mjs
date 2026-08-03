// Round 3 PRIMARY ENDPOINT harness — deterministic, re-runnable, no LLM.
//
// Lives inside the repo on purpose: ESM resolves imports from the script's own
// location, so a copy in /tmp would throw ERR_MODULE_NOT_FOUND on `playwright`.
//
// For each build: render index.html, drive the optimistic-save interaction, capture a
// POST-INTERACTION snapshot (the acceptance table is explicit that A2–A4 score an
// agent-supplied post-interaction snapshot, not the default state), then score P1–P6.
//
// Usage: node measure.mjs <buildsDir> <outJson>

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

process.env.RAVEN_NO_USAGE_LOG = '1';
const REPO = '/Users/accunliffe/projects/raven-mcp';

const { buildServer } = await import(REPO + '/dist/index.js');
const { FsTasteStore } = await import(REPO + '/dist/taste-store.js');
// Explicit remote:false — bare buildServer() silently falls back to RAVEN_REMOTE.
const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
const call = async (name, args) =>
  JSON.parse((await server._registeredTools[name].handler(args, {})).content[0].text);

// Findings carry `rule` and `source` but NOT `category` — the category lives in the
// rule catalogue. Resolve it by id so the P2 exclusion stays category-based rather
// than a hardcoded list of rule numbers.
const RULE_CATEGORY = new Map();
{
  const cat = await call('talon_rules', {});
  for (const r of (cat.rules || cat)) RULE_CATEGORY.set(r.id, String(r.category || '').toLowerCase());
}

// ── in-page collection ───────────────────────────────────────────────────────
// Runs in the browser. Returns everything the Raven tools need in one round-trip.
const COLLECT = `() => {
  const sel = (el) => {
    if (el === document.documentElement) return 'html';
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const sibs = n.parentNode ? Array.from(n.parentNode.children).filter(c => c.tagName === n.tagName) : [];
      if (sibs.length > 1) s += ':nth-of-type(' + (sibs.indexOf(n) + 1) + ')';
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    return true;
  };
  const effectiveBg = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\\(\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,\\s*0\\s*\\)/.test(bg)) return bg;
      n = n.parentElement;
    }
    return 'rgb(0, 0, 0)';
  };
  const ownText = (el) => Array.from(el.childNodes)
    .filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();

  const all = Array.from(document.querySelectorAll('*'))
    .filter(el => !/^(script|style|meta|link|title|head)$/i.test(el.tagName));

  const elements = [], tapTargets = [], domSnapshot = [], boxes = [];
  const TAP = 'a,button,[role=button],input[type=submit],input[type=button],input[type=checkbox],input[type=radio],select,summary,label[for],[onclick],[tabindex]';

  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const s = sel(el);
    boxes.push({ selector: s, x: r.x, y: r.y, w: r.width, h: r.height, tag: el.tagName.toLowerCase(),
                 fontPx: parseFloat(cs.fontSize) || 0, text: (el.textContent || '').trim().slice(0, 60) });
    elements.push({ selector: s, rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      computed: { padding: cs.padding, margin: cs.margin, gap: cs.gap, fontSize: cs.fontSize,
                  color: cs.color, background: cs.backgroundColor } });
    if (el.matches(TAP) && !(el.getAttribute('tabindex') && parseInt(el.getAttribute('tabindex'), 10) < 0)) {
      tapTargets.push({ selector: s, w: r.width, h: r.height, x: r.x, y: r.y,
        role: el.getAttribute('role') || el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 40) });
    }
    const t = ownText(el);
    if (t) {
      domSnapshot.push({ selector: s, color: cs.color, bgColor: effectiveBg(el),
        fontPx: parseFloat(cs.fontSize) || 16, bold: parseInt(cs.fontWeight, 10) >= 600, text: t.slice(0, 60) });
    }
  }
  return { elements, tapTargets, domSnapshot, boxes,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    html: document.documentElement.outerHTML,
    css: Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\\n') };
}`;

// ── static CSS checks (P5, P6) ───────────────────────────────────────────────
// Strip token DEFINITIONS before hunting literals: `--color-bg: #050505` is the
// token layer doing its job, not a bare literal in component CSS.
function cssLiterals(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const offenders = [];
  const declRe = /([-a-zA-Z]+)\s*:\s*([^;{}]+)[;}]/g;
  let m;
  while ((m = declRe.exec(noComments)) !== null) {
    const prop = m[1].trim();
    const val = m[2].trim();
    if (prop.startsWith('--')) continue;           // token definition layer
    const outsideVar = val.replace(/var\([^)]*\)/g, ''); // fallbacks inside var() are sanctioned
    if (/#[0-9a-fA-F]{3,8}\b/.test(outsideVar)) offenders.push(`${prop}: ${val}  [hex]`);
    else if (/^font-size$/i.test(prop) && /\d+(\.\d+)?px/.test(outsideVar)) offenders.push(`${prop}: ${val}  [px font-size]`);
    else if (/^font(-family)?$/i.test(prop) && /[A-Za-z]{3,}/.test(outsideVar.replace(/inherit|initial|unset|sans-serif|serif|monospace|system-ui/gi, ''))) {
      offenders.push(`${prop}: ${val}  [font-family literal]`);
    }
  }
  return offenders;
}

function reducedMotionGuard(css) {
  const re = /@media[^{]*prefers-reduced-motion\s*:\s*reduce[^{]*\{/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    // Walk braces from the at-rule's opening brace to find its body.
    let depth = 1, i = m.index + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    const body = css.slice(start, i - 1).replace(/\s/g, '');
    if (body.length > 0) return true;
  }
  return false;
}

// ── the transient surface ────────────────────────────────────────────────────
// Identify the snackbar as what APPEARED as a result of the interaction, rather
// than by guessing a class name: the set difference of visible selectors,
// reduced to its outermost members.
function appearedSubtree(before, after) {
  const beforeSet = new Set(before.map(b => b.selector));
  const fresh = after.filter(a => !beforeSet.has(a.selector));
  if (fresh.length === 0) return { root: null, members: [] };
  const roots = fresh.filter(f => !fresh.some(o => o !== f && f.selector.startsWith(o.selector + ' > ')));
  // Prefer the root with the most descendants — the surface, not a stray sibling.
  roots.sort((a, b) => fresh.filter(f => f.selector.startsWith(b.selector)).length
                     - fresh.filter(f => f.selector.startsWith(a.selector)).length);
  const root = roots[0];
  return { root, members: fresh.filter(f => f.selector.startsWith(root.selector)) };
}

// ── per-build measurement ────────────────────────────────────────────────────
async function measureBuild(browser, dir) {
  const file = join(dir, 'index.html');
  const rec = { build: dir.split('/').pop(), ok: false, notes: [], checks: {} };
  if (!existsSync(file)) { rec.notes.push('no index.html'); return rec; }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e)));
  try {
    await page.goto('file://' + file, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const before = await page.evaluate('(' + COLLECT + ')()');

    // Drive the optimistic save. The harness prompt asked every build for a
    // "Save change" trigger; fall back to any save-ish control.
    const trigger = page.locator('button, [role=button], a').filter({ hasText: /save|change/i }).first();
    let clicked = false;
    if (await trigger.count() > 0) { await trigger.click({ timeout: 4000 }).then(() => { clicked = true; }, () => {}); }
    if (!clicked) {
      const anyBtn = page.locator('button').first();
      if (await anyBtn.count() > 0) await anyBtn.click({ timeout: 4000 }).then(() => { clicked = true; }, () => {});
    }
    rec.notes.push(clicked ? 'trigger clicked' : 'NO TRIGGER FOUND');
    await page.waitForTimeout(700); // past the entrance, before a 6s auto-dismiss

    const after = await page.evaluate('(' + COLLECT + ')()');
    await page.screenshot({ path: join(dir, 'after-save.png') });

    const surface = appearedSubtree(before.boxes, after.boxes);
    rec.surface_root = surface.root ? surface.root.selector : null;
    rec.surface_size = surface.members.length;

    // P1 — no text inside the transient surface exceeds the lead size (20px).
    // AMENDMENT to the pre-registration: registered as "message font-size ≤ 20px";
    // measuring the MAX over the surface is strictly stronger and does not depend
    // on guessing which node is "the message". Reason recorded in AMENDMENTS.md.
    const surfaceText = surface.members.filter(m => m.text && m.fontPx > 0);
    const maxFont = surfaceText.length ? Math.max(...surfaceText.map(m => m.fontPx)) : null;
    rec.max_font_in_surface = maxFont;
    rec.checks.P1 = maxFont !== null && maxFont <= 20;
    if (maxFont === null) rec.notes.push('P1 unmeasurable — no text in the appeared surface');

    // P2 — deterministic detectors, on the post-interaction snapshot.
    const talon = await call('talon_scan', {
      html: after.html, elements: after.elements, viewport: after.viewport,
      project: 'arena', profile: 'andrew',
    });
    // AMENDMENT (see AMENDMENTS.md): drop category "structure". TAL-010/011 score
    // document-level heading hierarchy and landmarks — properties of a page, not of a
    // snackbar. They fire on a hand-written clean fixture, so leaving them in makes P2
    // a constant across both arms and destroys its discriminating power. Decided from
    // the fixtures, before any real build was scored, and applied identically to both arms.
    const isStructure = (f) => RULE_CATEGORY.get(f.rule || f.id) === 'structure';
    const talonBad = (talon.findings || []).filter(f => f.waived_by_taste !== true
      && !isStructure(f)
      && ['warning', 'error', 'critical', 'fail'].includes(String(f.severity || '').toLowerCase()));
    rec.talon_structure_excluded = (talon.findings || []).filter(isStructure)
      .map(f => `${f.rule || f.id}: ${f.message || f.title}`);
    rec.talon_findings = talonBad.map(f => `${f.rule || f.id}: ${f.message || f.title}`);
    rec.checks.P2 = talonBad.length === 0;

    // P3 — tap targets, post-interaction.
    const tap = await call('audit_tap_targets', { elements: after.tapTargets, minSize: 44 });
    const tapBad = (tap.violations || tap.failures || []).length;
    rec.tap_violations = tapBad;
    rec.checks.P3 = tapBad === 0;

    // P4 — contrast, post-interaction.
    const contrast = await call('audit_contrast', { dom_snapshot: after.domSnapshot });
    const cBad = (contrast.failing || contrast.failures || contrast.violations || [])
      .filter(f => f.passesAA === false || f.aa === false || f.pass === false);
    const cCount = Array.isArray(contrast.failing || contrast.failures || contrast.violations)
      ? (contrast.failing || contrast.failures || contrast.violations).length : cBad.length;
    rec.contrast_failures = cCount;
    rec.checks.P4 = cCount === 0;

    // P5 / P6 — static, on the page's own CSS.
    const lits = cssLiterals(after.css);
    rec.literals = lits.slice(0, 12);
    rec.checks.P5 = lits.length === 0;
    rec.checks.P6 = reducedMotionGuard(after.css);

    rec.page_errors = consoleErrors;
    rec.score = Object.values(rec.checks).filter(Boolean).length;
    rec.ok = true;
  } catch (e) {
    rec.notes.push('ERROR: ' + String(e).slice(0, 300));
  } finally {
    await page.close();
  }
  return rec;
}

// ── main ─────────────────────────────────────────────────────────────────────
const [buildsDirArg, outJson] = process.argv.slice(2);
// file:// needs an absolute path — a relative arg silently yields ERR_INVALID_URL.
const buildsDir = resolve(buildsDirArg);
const dirs = readdirSync(buildsDir).filter(d => /^build-\d+$/.test(d)).sort()
  .map(d => join(buildsDir, d));

const browser = await chromium.launch();
const out = [];
for (const d of dirs) {
  const r = await measureBuild(browser, d);
  out.push(r);
  console.error(`${r.build}: score=${r.score ?? '-'} P=${JSON.stringify(r.checks)} maxFont=${r.max_font_in_surface} ${r.notes.join('; ')}`);
}
await browser.close();
writeFileSync(outJson, JSON.stringify(out, null, 2));
console.error('\nwrote ' + outJson);
