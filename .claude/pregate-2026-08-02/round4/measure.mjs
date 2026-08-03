// Round 4 PRIMARY ENDPOINT harness — deterministic, re-runnable, no LLM.
//
// Lives inside the repo on purpose: ESM resolves imports from the script's own location,
// so a copy in /tmp or a scratchpad would throw ERR_MODULE_NOT_FOUND on `playwright`.
//
// 13 discriminating checks (D1-D8 from the Decision Graph, T1-T5 from list_taste_decisions)
// + 8 control checks (C1-C8) reachable by every arm. The controls are a manipulation check
// and are NEVER merged into the primary score. See PREREGISTRATION.md §3-§4.
//
// Usage: node measure.mjs <buildsDir> <outJson>
//   buildsDir contains one subdirectory per build, each with index.html and NOTES.md.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const DISCRIMINATING = ['D1','D2','D3','D4','D5','D6','D7','D8','T1','T2','T3','T4','T5'];
const CONTROLS = ['C1','C2','C3','C4','C5','C6','C7','C8'];
const TYPE_SCALE = [13, 14, 16, 20, 28];
const SIGNAL_HUES = ['#d4573a', '#c08a2e', '#4a8f6d'];

// ── helpers that run in the page ─────────────────────────────────────────────

const PAGE_HELPERS = `
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; };
  const rows = () => Array.from(document.querySelectorAll('[data-ds="ds-queue-row"], .ds-queue-row'));
  const rail = () => document.querySelector('[data-ds="ds-action-rail"], .ds-action-rail');
  const undo = () => document.querySelector('[data-ds="ds-undo-strip"], .ds-undo-strip');
  const loadMore = () => document.querySelector('[data-ds="ds-load-more"], .ds-load-more');
  const pills = () => Array.from(document.querySelectorAll('[data-ds="ds-status-pill"], .ds-status-pill'));
  // First text-bearing descendant of a row, used for the stable-gutter check. The
  // selection control itself is excluded: it is not row text.
  const firstText = (row) => {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.textContent.trim()) return NodeFilter.FILTER_REJECT;
        let p = n.parentElement;
        while (p && p !== row) {
          if (p.matches('[data-ds="ds-select-cell"], .ds-select-cell')) return NodeFilter.FILTER_REJECT;
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const n = walker.nextNode();
    if (!n) return null;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    return { x: r.x, text: n.textContent.trim().slice(0, 40) };
  };
  const isSelected = (row) => {
    const cb = row.querySelector('input[type=checkbox], [role=checkbox]');
    if (cb) return cb.checked === true || cb.getAttribute('aria-checked') === 'true';
    return row.matches('[aria-selected="true"], .selected, [data-selected="true"]');
  };
  const selectRow = (row) => {
    const cb = row.querySelector('input[type=checkbox], [role=checkbox], [data-ds="ds-select-cell"], .ds-select-cell');
    (cb || row).click();
  };
`;

// The header select-all control: the select-cell that is NOT inside a queue row.
const HEADER_CTRL = `
  const headerCtrl = () => {
    const all = Array.from(document.querySelectorAll('[data-ds="ds-select-cell"], .ds-select-cell'));
    const outside = all.find((el) => !el.closest('[data-ds="ds-queue-row"], .ds-queue-row'));
    if (!outside) return null;
    return outside.querySelector('input[type=checkbox], [role=checkbox]') || outside;
  };
`;

// The destructive action, identified WITHOUT prescribing its label — that label is the
// contested decision and naming it here would leak the answer into every arm.
const DESTRUCTIVE = `
  const railButtons = () => {
    const r = rail();
    if (!r) return [];
    return Array.from(r.querySelectorAll('button, [role=button]')).filter((b) => b.textContent.trim());
  };
  const destructiveBtn = () => {
    const cands = railButtons().filter((b) => !/^(hold|clear|undo|select|deselect)\\b/i.test(b.textContent.trim()));
    return cands.length === 1 ? cands[0] : (cands[0] || null);
  };
`;

const PRELUDE = PAGE_HELPERS + HEADER_CTRL + DESTRUCTIVE;

// ── per-build measurement ────────────────────────────────────────────────────

async function measureBuild(browser, dir) {
  const checks = {};
  const notes = [];
  const err = (id, e) => { checks[id] = false; notes.push(`${id}: ERROR ${e && e.message ? e.message : e}`); };

  const htmlPath = join(dir, 'index.html');
  if (!existsSync(htmlPath)) {
    for (const id of [...DISCRIMINATING, ...CONTROLS]) checks[id] = false;
    return { checks, notes: ['no index.html'] };
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    // ---- PHASE 1: untouched paint --------------------------------------------
    await page.goto('file://' + resolve(htmlPath));
    // C6 samples the entrance, so it must be taken before any settling wait.
    const entrance = await page.evaluate(`(() => { ${PRELUDE}
      return rows().slice(0, 4).map((r) => {
        const cs = getComputedStyle(r);
        return { o: cs.opacity, t: cs.transform, y: rectOf(r).y };
      });
    })()`);
    await page.waitForTimeout(450);
    const entranceLate = await page.evaluate(`(() => { ${PRELUDE}
      return rows().slice(0, 4).map((r) => {
        const cs = getComputedStyle(r);
        return { o: cs.opacity, t: cs.transform, y: rectOf(r).y };
      });
    })()`);
    try {
      const moved = entrance.some((e, i) => {
        const l = entranceLate[i];
        if (!l) return true;
        return Math.abs(parseFloat(e.o) - parseFloat(l.o)) > 0.02 || e.t !== l.t || Math.abs(e.y - l.y) > 1;
      });
      checks.C6 = entrance.length > 0 && !moved;
      if (moved) notes.push('C6: rows moved/faded between paint and +450ms');
    } catch (e) { err('C6', e); }

    const statics = await page.evaluate(`(() => { ${PRELUDE}
      const out = {};
      const r = rail();
      const rowEls = rows();

      // D1 — rail in normal flow, above the list.
      out.railPosition = r ? getComputedStyle(r).position : null;
      out.railBox = r ? rectOf(r) : null;
      out.firstRowBox = rowEls[0] ? rectOf(rowEls[0]) : null;

      // D6 — document order.
      out.railPrecedesList = (r && rowEls[0])
        ? !!(r.compareDocumentPosition(rowEls[0]) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false;

      // D4a — load-more is a real button.
      const lm = loadMore();
      out.loadMoreIsButton = !!lm && (lm.tagName === 'BUTTON' || lm.getAttribute('role') === 'button' ||
                                      !!lm.querySelector('button'));
      out.rowCountInitial = rowEls.length;

      // T2 — pill outlined, not filled.
      out.pillStyles = pills().slice(0, 6).map((p) => {
        const cs = getComputedStyle(p);
        const parentBg = p.parentElement ? getComputedStyle(p.parentElement).backgroundColor : '';
        return { bg: cs.backgroundColor, parentBg, bw: cs.borderTopWidth, bc: cs.borderTopColor, text: p.textContent.trim() };
      });

      // T5 part 1 — resting text x.
      out.restingTextX = rowEls.slice(0, 6).map((row) => firstText(row));

      // C3 — type scale.
      const sizes = new Set();
      let rowTextSize = null;
      for (const el of document.querySelectorAll('*')) {
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const fs = Math.round(parseFloat(getComputedStyle(el).fontSize));
        sizes.add(fs);
        if (rowTextSize === null && el.closest('[data-ds="ds-queue-row"], .ds-queue-row')) rowTextSize = fs;
      }
      out.fontSizes = Array.from(sizes).sort((a, b) => a - b);
      out.rowTextSize = rowTextSize;

      // C4 — the ds-* vocabulary.
      out.dsNames = Array.from(new Set(Array.from(document.querySelectorAll('[data-ds]')).map((e) => e.getAttribute('data-ds'))));
      out.bannedNames = Array.from(document.querySelectorAll('*'))
        .flatMap((e) => Array.from(e.classList))
        .filter((c) => /^(checkbox|toolbar|toast|badge|snackbar)$/i.test(c));

      // C5 — every pill carries text.
      out.pillsAllLabelled = pills().length > 0 && pills().every((p) => p.textContent.trim().length > 0);

      // C7 — no transition on the row's background. Parse the longhands: the shorthand
      // string is not reliably comparable across engines.
      out.rowTransitions = rowEls.slice(0, 3).map((row) => {
        const cs = getComputedStyle(row);
        const props = cs.transitionProperty.split(',').map((s) => s.trim());
        const durs = cs.transitionDuration.split(',').map((s) => parseFloat(s) || 0);
        const bad = props.some((pr, i) => /^(all|background|background-color)$/.test(pr) && (durs[i % durs.length] || 0) > 0);
        return { props: cs.transitionProperty, durs: cs.transitionDuration, bad };
      });

      // C8 — hit targets. A control may be visually smaller than its hit area, so an
      // undersized element passes if a wrapping label/button reaches 44px.
      // Only VISIBLE clickables. A control inside a hidden empty state has no hit target
      // to be too small — measuring it would fail every build that pre-renders its empty
      // states. Guarded below by a minimum visible-clickable count so a build cannot pass
      // C8 by hiding everything.
      const clickables = Array.from(document.querySelectorAll('button, [role=button], a[href], input[type=checkbox], [role=checkbox]'))
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      out.visibleClickables = clickables.length;
      out.smallTargets = clickables.map((el) => {
        let box = rectOf(el);
        if (box.w < 44 || box.h < 44) {
          const wrap = el.closest('label, button, [data-ds="ds-select-cell"], .ds-select-cell');
          if (wrap) { const wb = rectOf(wrap); box = { w: Math.max(box.w, wb.w), h: Math.max(box.h, wb.h) }; }
        }
        return { tag: el.tagName, w: Math.round(box.w), h: Math.round(box.h), text: el.textContent.trim().slice(0, 20) };
      }).filter((b) => b.w < 44 || b.h < 44);

      // C1 — tokens only. Strip :root blocks, then look for literals in what remains.
      const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\\n');
      const stripped = css.replace(/:root\\s*\\{[^}]*\\}/g, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');
      out.hexLiterals = (stripped.match(/#[0-9a-fA-F]{3,8}\\b/g) || []).slice(0, 8);
      out.rgbLiterals = (stripped.match(/\\brgba?\\(/g) || []).length;
      out.inlineStyleAttrs = Array.from(document.querySelectorAll('[style]'))
        .map((e) => e.getAttribute('style'))
        .filter((s) => /#[0-9a-fA-F]{3,8}\\b|\\brgba?\\(/.test(s)).slice(0, 5);

      return out;
    })()`);

    checks.D1 = ['static', 'relative'].includes(statics.railPosition) &&
                !!statics.railBox && !!statics.firstRowBox &&
                statics.railBox.y + statics.railBox.h <= statics.firstRowBox.y + 1;
    if (!checks.D1) notes.push(`D1: position=${statics.railPosition} railBox=${JSON.stringify(statics.railBox)} firstRow=${JSON.stringify(statics.firstRowBox)}`);

    checks.D6 = statics.railPrecedesList === true;
    if (!checks.D6) notes.push('D6: rail does not precede the first row in document order');

    checks.C3 = statics.fontSizes.length > 0 &&
                statics.fontSizes.every((s) => TYPE_SCALE.includes(s)) &&
                statics.rowTextSize === 13;
    if (!checks.C3) notes.push(`C3: sizes=${statics.fontSizes.join(',')} rowText=${statics.rowTextSize}`);

    checks.C4 = statics.dsNames.length >= 6 && statics.bannedNames.length === 0;
    if (!checks.C4) notes.push(`C4: ds=${statics.dsNames.length} banned=${statics.bannedNames.join(',')}`);

    checks.C5 = statics.pillsAllLabelled === true;
    checks.C7 = statics.rowTransitions.length > 0 && statics.rowTransitions.every((t) => !t.bad);
    if (!checks.C7) notes.push(`C7: row transition ${statics.rowTransitions[0]?.props} / ${statics.rowTransitions[0]?.durs}`);

    checks.C8 = statics.smallTargets.length === 0 && statics.visibleClickables >= 4;
    if (!checks.C8) notes.push(`C8: ${statics.smallTargets.length} undersized of ${statics.visibleClickables} visible, e.g. ${JSON.stringify(statics.smallTargets[0])}`);

    checks.C1 = statics.hexLiterals.length === 0 && statics.rgbLiterals === 0 && statics.inlineStyleAttrs.length === 0;
    if (!checks.C1) notes.push(`C1: hex=${statics.hexLiterals.join(' ')} rgb=${statics.rgbLiterals} inline=${statics.inlineStyleAttrs.length}`);

    // T2 — outlined, not filled: transparent-or-parent background AND a >=1px border in a signal hue.
    const asRgb = (hex) => {
      const h = hex.replace('#', '');
      return `rgb(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`;
    };
    const signalRgb = SIGNAL_HUES.map(asRgb);
    checks.T2 = statics.pillStyles.length > 0 && statics.pillStyles.every((p) => {
      const unfilled = p.bg === 'rgba(0, 0, 0, 0)' || p.bg === 'transparent' || p.bg === p.parentBg;
      const bordered = parseFloat(p.bw) >= 1 && signalRgb.some((s) => p.bc.startsWith(s.slice(0, -1)));
      return unfilled && bordered;
    });
    if (!checks.T2) notes.push(`T2: ${JSON.stringify(statics.pillStyles[0])}`);

    // ---- PHASE 2: D4b — scrolling must not append rows ------------------------
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(900);
    const afterScroll = await page.evaluate(`(() => { ${PRELUDE} return rows().length; })()`);
    checks.D4 = statics.loadMoreIsButton && afterScroll === statics.rowCountInitial;
    if (!checks.D4) notes.push(`D4: button=${statics.loadMoreIsButton} rows ${statics.rowCountInitial}->${afterScroll} on scroll`);
    await page.evaluate('window.scrollTo(0, 0)');

    // ---- PHASE 3: hover -------------------------------------------------------
    const hover = await (async () => {
      const box = await page.evaluate(`(() => { ${PRELUDE} const r = rows()[1]; return r ? rectOf(r) : null; })()`);
      if (!box) return null;
      await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
      await page.waitForTimeout(300);
      return page.evaluate(`(() => { ${PRELUDE}
        const r = rows()[1];
        return { bg: getComputedStyle(r).backgroundColor, textX: firstText(r) };
      })()`);
    })();
    const RECESSED = asRgb('#0a0c0e');
    const RAISED = asRgb('#171b1e');
    checks.C2 = !!hover && hover.bg.startsWith(RECESSED.slice(0, -1));
    if (!checks.C2) notes.push(`C2: hover bg=${hover ? hover.bg : 'n/a'} (recessed=${RECESSED}, raised=${RAISED})`);
    await page.mouse.move(1400, 20);
    await page.waitForTimeout(150);

    // ---- PHASE 4: selection ---------------------------------------------------
    const armed = await page.evaluate(`(() => { ${PRELUDE}
      const rowEls = rows();
      const idleRail = rail() ? rectOf(rail()) : null;
      const idleFirstRowY = rowEls[0] ? rectOf(rowEls[0]).y : null;
      [0, 1, 2].forEach((i) => rowEls[i] && selectRow(rowEls[i]));
      const hc = headerCtrl();
      return {
        idleRail, idleFirstRowY,
        armedRail: rail() ? rectOf(rail()) : null,
        armedFirstRowY: rows()[0] ? rectOf(rows()[0]).y : null,
        headerIndeterminate: hc ? (hc.indeterminate === true || hc.getAttribute('aria-checked') === 'mixed') : null,
        selectedCount: rows().filter(isSelected).length,
        selectedTextX: firstText(rows()[1]),
      };
    })()`);
    await page.waitForTimeout(300);
    const armedSettled = await page.evaluate(`(() => { ${PRELUDE}
      return { rail: rail() ? rectOf(rail()) : null, firstRowY: rows()[0] ? rectOf(rows()[0]).y : null };
    })()`);

    checks.D7 = armed.headerIndeterminate === true;
    if (!checks.D7) notes.push(`D7: header indeterminate=${armed.headerIndeterminate}, selected=${armed.selectedCount}`);

    checks.T1 = !!armed.idleRail && !!armedSettled.rail &&
                Math.abs(armed.idleRail.h - armedSettled.rail.h) <= 1 &&
                armed.idleFirstRowY !== null && armedSettled.firstRowY !== null &&
                Math.abs(armed.idleFirstRowY - armedSettled.firstRowY) <= 1;
    if (!checks.T1) notes.push(`T1: rail h ${armed.idleRail?.h}->${armedSettled.rail?.h}, firstRow y ${armed.idleFirstRowY}->${armedSettled.firstRowY}`);

    const xs = [statics.restingTextX[1], hover && hover.textX, armed.selectedTextX].filter(Boolean).map((t) => t.x);
    checks.T5 = xs.length === 3 && Math.max(...xs) - Math.min(...xs) <= 1;
    if (!checks.T5) notes.push(`T5: text x resting/hover/selected = ${xs.map((v) => v.toFixed(1)).join(' / ')}`);

    // ---- PHASE 5: paging preserves selection ---------------------------------
    const paged = await page.evaluate(`(() => { ${PRELUDE}
      const before = rows().filter(isSelected).map((r) => r.getAttribute('data-id'));
      const lm = loadMore();
      const btn = (lm && (lm.tagName === 'BUTTON' ? lm : lm.querySelector('button'))) || lm;
      if (btn) btn.click();
      return { before };
    })()`);
    await page.waitForTimeout(700);
    const afterPage = await page.evaluate(`(() => { ${PRELUDE}
      return {
        total: rows().length,
        selected: rows().filter(isSelected).map((r) => r.getAttribute('data-id')),
      };
    })()`);
    checks.D5 = paged.before.length === 3 && afterPage.total > statics.rowCountInitial &&
                paged.before.every((id) => afterPage.selected.includes(id)) &&
                afterPage.selected.length === paged.before.length;
    if (!checks.D5) notes.push(`D5: before=${paged.before.join(',')} total=${afterPage.total} after=${afterPage.selected.join(',')}`);

    // ---- PHASE 6: destructive action, undo, no dialog ------------------------
    await page.goto('file://' + resolve(htmlPath));
    await page.waitForTimeout(400);
    const dialogSeen = { v: false };
    page.on('dialog', async (d) => { dialogSeen.v = true; await d.dismiss().catch(() => {}); });

    const acted = await page.evaluate(`(() => { ${PRELUDE}
      const rowEls = rows();
      [0, 1, 2].forEach((i) => rowEls[i] && selectRow(rowEls[i]));
      const btn = destructiveBtn();
      const label = btn ? btn.textContent.trim() : null;
      const statusBefore = rowEls.slice(0, 3).map((r) => r.textContent.trim().slice(-40));
      if (btn) btn.click();
      window.__actedAt = performance.now();
      return { label, statusBefore };
    })()`);
    await page.waitForTimeout(450);
    const postAction = await page.evaluate(`(() => { ${PRELUDE}
      const u = undo();
      return {
        anyDialog: !!document.querySelector('dialog[open], [role=dialog], [role=alertdialog]'),
        undoPresent: !!u && u.getBoundingClientRect().height > 0 &&
                     getComputedStyle(u).display !== 'none' &&
                     getComputedStyle(u).visibility !== 'hidden' &&
                     parseFloat(getComputedStyle(u).opacity) > 0.05,
        undoText: u ? u.textContent.replace(/\\s+/g, ' ').trim() : null,
        statusAfter: rows().slice(0, 3).map((r) => r.textContent.trim().slice(-40)),
      };
    })()`);

    checks.D2 = !!acted.label && !postAction.anyDialog && !dialogSeen.v &&
                JSON.stringify(acted.statusBefore) !== JSON.stringify(postAction.statusAfter);
    if (!checks.D2) notes.push(`D2: label=${acted.label} dialog=${postAction.anyDialog || dialogSeen.v} changed=${JSON.stringify(acted.statusBefore) !== JSON.stringify(postAction.statusAfter)}`);

    checks.D3 = postAction.undoPresent === true;
    if (!checks.D3) notes.push('D3: no visible ds-undo-strip after the destructive action');

    // T3 — "3 held. Undo": count first, past tense, no subject, no "items".
    checks.T3 = !!postAction.undoText && /^\d+\s+\w+\.\s*Undo$/i.test(postAction.undoText);
    if (!checks.T3) notes.push(`T3: undo copy = ${JSON.stringify(postAction.undoText)}`);

    // T4 — no countdown, and auto-dismiss in [7.5s, 8.5s].
    if (postAction.undoPresent) {
      const sample = async () => page.evaluate(`(() => { ${PRELUDE}
        const u = undo();
        if (!u) return null;
        return {
          html: u.innerHTML.replace(/\\s+/g, ''),
          widths: Array.from(u.querySelectorAll('*')).map((c) => Math.round(c.getBoundingClientRect().width)),
          transforms: Array.from(u.querySelectorAll('*')).map((c) => getComputedStyle(c).transform),
        };
      })()`);
      const s1 = await sample();
      await page.waitForTimeout(1800);
      const s2 = await sample();
      const animating = !!s1 && !!s2 && (
        s1.html !== s2.html ||
        s1.widths.some((w, i) => Math.abs(w - (s2.widths[i] ?? w)) > 2) ||
        s1.transforms.some((t, i) => t !== (s2.transforms[i] ?? t))
      );
      let gone = null;
      const deadline = Date.now() + 11000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(150);
        const probe = await page.evaluate(`(() => { ${PRELUDE}
          const u = undo();
          const visible = !!u && u.getBoundingClientRect().height > 0 &&
                          getComputedStyle(u).display !== 'none' &&
                          parseFloat(getComputedStyle(u).opacity) > 0.05;
          return { visible, since: (performance.now() - (window.__actedAt || 0)) / 1000 };
        })()`);
        if (!probe.visible) { gone = probe.since; break; }
      }
      checks.T4 = !animating && gone !== null && gone >= 7.5 && gone <= 8.5;
      notes.push(`T4: countdown=${animating} dismissedAt=${gone === null ? 'never' : gone.toFixed(2) + 's'}`);
    } else {
      checks.T4 = false;
      notes.push('T4: not assessable — no undo strip');
    }

    // ---- D8: NOTES.md open questions -----------------------------------------
    const notesPath = join(dir, 'NOTES.md');
    if (existsSync(notesPath)) {
      const md = readFileSync(notesPath, 'utf8');
      const openSec = md.split(/^\s*(?:#+|\*\*)\s*Open questions/im)[1] || '';
      checks.D8 = /reject|remove|destructive/i.test(openSec) && /label|naming|wording|call it/i.test(openSec);
      if (!checks.D8) notes.push(`D8: open-questions section ${openSec ? 'present but silent on the label' : 'missing'}`);
    } else {
      checks.D8 = false;
      notes.push('D8: no NOTES.md');
    }
  } catch (e) {
    notes.push('FATAL: ' + (e && e.message ? e.message : String(e)));
  } finally {
    await ctx.close();
  }

  for (const id of [...DISCRIMINATING, ...CONTROLS]) if (!(id in checks)) checks[id] = false;
  return { checks, notes };
}

// ── driver ───────────────────────────────────────────────────────────────────

const buildsDir = process.argv[2];
const outPath = process.argv[3];
if (!buildsDir || !outPath) {
  console.error('usage: node measure.mjs <buildsDir> <outJson>');
  process.exit(2);
}

const dirs = readdirSync(buildsDir)
  .filter((d) => statSync(join(buildsDir, d)).isDirectory())
  .sort();

const browser = await chromium.launch();
const results = [];
for (const d of dirs) {
  const r = await measureBuild(browser, join(buildsDir, d));
  const primary = DISCRIMINATING.filter((id) => r.checks[id]).length;
  const control = CONTROLS.filter((id) => r.checks[id]).length;
  results.push({ build: d, primary, control, ...r });
  console.log(`${d.padEnd(22)} primary ${String(primary).padStart(2)}/13   control ${control}/8   ` +
              DISCRIMINATING.map((id) => (r.checks[id] ? '.' : id)).filter((s) => s !== '.').join(' '));
}
await browser.close();

writeFileSync(outPath, JSON.stringify({ discriminating: DISCRIMINATING, controls: CONTROLS, results }, null, 2));
console.log(`\nwrote ${outPath}`);
