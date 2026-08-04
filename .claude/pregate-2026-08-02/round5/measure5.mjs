// Round 5 harness of record. 16 discriminating checks + 8 controls, all deterministic.
//
//   node measure5.mjs <buildsDir> [outJson]
//
// EVERY discriminating check turns on a fact that exists only in the Decision Graph or in
// list_taste_decisions. verify-fixture5.mjs asserts that each one is absent from DESIGN.md,
// from the profile rules, and from the surface binding — the three things every arm can
// read. A check that leaks into the control surface measures nothing.
//
// Selectors are forgiving on purpose. A build that names its row `.entry-row` instead of
// `.ds-entry-row` has failed control C4 and should lose exactly that one point; it should
// not also lose every behavioural check because the harness could not find its rows.

import { chromium } from 'playwright';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const buildsDir = process.argv[2];
const outPath = process.argv[3] ?? '/tmp/r5-scores.json';
if (!buildsDir) { console.error('usage: node measure5.mjs <buildsDir> [outJson]'); process.exit(1); }

const INK_PRIMARY = 'rgb(230, 232, 234)';   // #e6e8ea
const SIGNAL = { match: 'rgb(79, 143, 116)', review: 'rgb(201, 154, 52)', break: 'rgb(207, 91, 69)' };
const SIGNAL_RGB = Object.values(SIGNAL);
const RAMP = [12, 13, 15, 19, 26];
const SURFACE_RECESSED = 'rgb(11, 13, 15)';
const SURFACE_RAISED = 'rgb(23, 26, 30)';

const DISCRIMINATING = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11',
  'T1', 'T2', 'T3', 'T4', 'T5'];
const CONTROLS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'];

// Injected into the page. Kept as one string so every build is probed identically.
const HELPERS = `
  window.__sel = (kinds) => {
    for (const s of kinds) { const els = Array.from(document.querySelectorAll(s)); if (els.length) return els; }
    return [];
  };
  window.__rows = () => window.__sel(['.ds-entry-row', '[class*="entry-row"]', '[class*="entryRow"]', '[data-entry]', 'tbody tr']);
  window.__chips = () => window.__sel(['.ds-filter-chip', '[class*="filter-chip"]', '[class*="filterChip"]', '[data-filter]']);
  window.__markers = () => window.__sel(['.ds-match-marker', '[class*="match-marker"]', '[class*="matchMarker"]', '[data-match]']);
  window.__amounts = () => window.__sel(['.ds-amount-cell', '[class*="amount-cell"]', '[class*="amountCell"]', '[class*="amount"]']);
  window.__bar = () => window.__sel(['.ds-reconcile-bar', '[class*="reconcile-bar"]', '[class*="reconcileBar"]'])[0] || null;
  window.__note = () => window.__sel(['.ds-batch-note', '[class*="batch-note"]', '[class*="batchNote"]'])[0] || null;
  window.__footer = () => window.__sel(['.ds-total-footer', '[class*="total-footer"]', '[class*="totalFooter"]'])[0] || null;
  window.__visible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05 && r.height > 0;
  };
  window.__isActive = (el) => {
    const cs = getComputedStyle(el);
    return el.classList.contains('active') || el.classList.contains('is-active') ||
           el.classList.contains('selected') || el.getAttribute('aria-pressed') === 'true' ||
           el.getAttribute('aria-selected') === 'true' || el.dataset.active === 'true' ||
           (el.tagName === 'INPUT' && el.checked) ||
           cs.backgroundColor === ${JSON.stringify(SURFACE_RECESSED)};
  };
  window.__dialogOpen = () => Array.from(document.querySelectorAll('dialog,[role="dialog"],[role="alertdialog"]'))
    .some((d) => window.__visible(d) && (d.tagName !== 'DIALOG' || d.open));
`;

// Reconcile control: whatever inside the bar (or on the page) reads as the apply action.
const CLICK_RECONCILE = `(() => {
  const scope = window.__bar() || document;
  const cands = Array.from(scope.querySelectorAll('button,[role="button"],a'));
  const hit = cands.find((b) => /reconcile|apply|confirm|mark/i.test(b.textContent || '')) || cands[0];
  if (!hit) return false;
  hit.click(); return true;
})()`;

const SELECT_N = (n) => `(() => {
  const rows = window.__rows().filter(window.__visible);
  let done = 0;
  for (const r of rows) {
    if (done >= ${n}) break;
    const cb = r.querySelector('input[type="checkbox"],[role="checkbox"]');
    if (cb) cb.click(); else r.click();
    done++;
  }
  return done;
})()`;

const HEADER_CONTROL = `(() => {
  const rows = window.__rows();
  const first = rows[0];
  const all = Array.from(document.querySelectorAll('input[type="checkbox"],[role="checkbox"]'));
  return all.find((c) => !first || !first.contains(c)) || null;
})()`;

async function fresh(browser, file) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('file://' + file);
  await page.addScriptTag({ content: HELPERS });
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function scoreBuild(browser, dir) {
  const file = resolve(join(dir, 'index.html'));
  const notesPath = join(dir, 'NOTES.md');
  const notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '';
  const checks = {};
  const note = {};
  for (const k of [...DISCRIMINATING, ...CONTROLS]) checks[k] = false;
  if (!existsSync(file)) { note.fatal = 'no index.html'; return { checks, note }; }

  const html = readFileSync(file, 'utf8');

  // ── D11 / C-side static reads ────────────────────────────────────────────────
  // D11: the contested decision is the label for an unmatched entry. Reaching it takes
  // decision_list({status:"contested"}) — the default call cannot return it — or the
  // composer's Gaps section. It must surface as an OPEN QUESTION, not be silently picked.
  const openQ = (() => {
    const m = notes.match(/^#+\s*Open questions\s*$|^\*\*Open questions\*\*/im);
    if (!m) return '';
    return notes.slice(notes.indexOf(m[0]) + m[0].length);
  })();
  checks.D11 = /break/i.test(openQ) && /unmatch/i.test(openQ);
  note.openQ = openQ.slice(0, 200).replace(/\s+/g, ' ');

  let ctx, page;
  try {
    ({ ctx, page } = await fresh(browser, file));

    // ── D1 — reconcile bar below the list, in document order and on screen ─────
    checks.D1 = await page.evaluate(`(() => {
      const bar = window.__bar(); const rows = window.__rows().filter(window.__visible);
      if (!bar || !rows.length) return false;
      const last = rows[rows.length - 1];
      const after = !!(last.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING);
      return after && bar.getBoundingClientRect().top >= last.getBoundingClientRect().bottom - 2;
    })()`);

    // ── D10 — the match marker carries no tooltip ──────────────────────────────
    checks.D10 = await page.evaluate(`(() => {
      const ms = window.__markers();
      if (!ms.length) return false;
      return ms.every((m) => !m.getAttribute('title') && !m.getAttribute('aria-describedby') &&
        !m.querySelector('[title],[role="tooltip"]'));
    })()`);

    // ── T1 — filled 6px dot in a signal hue, no text of its own ────────────────
    checks.T1 = await page.evaluate(`(() => {
      const ms = window.__markers().filter(window.__visible);
      if (!ms.length) return false;
      const sig = ${JSON.stringify(SIGNAL_RGB)};
      return ms.every((m) => {
        const cs = getComputedStyle(m), r = m.getBoundingClientRect();
        const filled = sig.includes(cs.backgroundColor);
        const sized = r.width <= 10 && r.height <= 10 && r.width >= 4 && r.height >= 4;
        const wordless = (m.textContent || '').trim() === '';
        return filled && sized && wordless;
      });
    })()`);

    // ── T5 — amount column right edge fixed 56px from the row's right edge ─────
    checks.T5 = await page.evaluate(`(() => {
      const rows = window.__rows().filter(window.__visible);
      if (rows.length < 3) return false;
      const gaps = [];
      for (const r of rows) {
        const a = r.querySelector('.ds-amount-cell,[class*="amount"]');
        if (!a) return false;
        gaps.push(r.getBoundingClientRect().right - a.getBoundingClientRect().right);
      }
      const same = Math.max(...gaps) - Math.min(...gaps) <= 1;
      return same && Math.abs(gaps[0] - 56) <= 1;
    })()`);

    // ── D7 — negative amounts in ink-primary, leading minus, no parentheses ────
    checks.D7 = await page.evaluate(`(() => {
      const cells = window.__amounts().filter(window.__visible);
      const negs = cells.filter((c) => /[-−(]/.test((c.textContent || '').trim()));
      if (!negs.length) return false;
      return negs.every((c) => {
        const t = (c.textContent || '').trim();
        return getComputedStyle(c).color === ${JSON.stringify(INK_PRIMARY)} &&
               /^[-−]/.test(t) && !t.includes('(');
      });
    })()`);

    // ── T4 — total footer pinned to the viewport bottom, survives a scroll ─────
    checks.T4 = await page.evaluate(`(() => {
      const f = window.__footer();
      if (!f || !window.__visible(f)) return false;
      const before = f.getBoundingClientRect();
      const pinnedBefore = Math.abs(before.bottom - window.innerHeight) <= 4;
      const scroller = document.scrollingElement;
      scroller.scrollTop = scroller.scrollHeight;
      document.querySelectorAll('*').forEach((el) => { if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = el.scrollHeight; });
      const after = f.getBoundingClientRect();
      return pinnedBefore && Math.abs(after.bottom - window.innerHeight) <= 4;
    })()`);
    await page.evaluate(`document.scrollingElement.scrollTop = 0`);

    // ── D8 — row height stable resting / hovered / selected ────────────────────
    {
      const rows = page.locator('.ds-entry-row, [class*="entry-row"], [class*="entryRow"], [data-entry], tbody tr');
      const n = await rows.count();
      if (n >= 2) {
        const target = rows.nth(1);
        const h0 = (await target.boundingBox())?.height ?? 0;
        await target.hover();
        await page.waitForTimeout(250);
        const h1 = (await target.boundingBox())?.height ?? 0;
        await page.evaluate(SELECT_N(1));
        await page.waitForTimeout(250);
        const h2 = (await rows.nth(1).boundingBox())?.height ?? 0;
        checks.D8 = h0 > 0 && Math.abs(h1 - h0) <= 1 && Math.abs(h2 - h0) <= 1;
        note.rowHeights = [h0, h1, h2];
      }
      await ctx.close();
      ({ ctx, page } = await fresh(browser, file));
    }

    // ── D4 — numbered pager, no load-more, no infinite append ──────────────────
    checks.D4 = await page.evaluate(`(() => {
      const nBefore = window.__rows().filter(window.__visible).length;
      const loadMore = Array.from(document.querySelectorAll('button,a,[role="button"]'))
        .some((b) => /load more|show more|load next/i.test(b.textContent || ''));
      const numbered = Array.from(document.querySelectorAll('button,a,[role="button"],li'))
        .filter((b) => /^\\s*\\d+\\s*$/.test(b.textContent || ''));
      window.__nBefore = nBefore;
      return !loadMore && numbered.length >= 2;
    })()`);
    if (checks.D4) {
      await page.evaluate(`document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight`);
      await page.waitForTimeout(600);
      const grew = await page.evaluate(`window.__rows().filter(window.__visible).length > window.__nBefore`);
      checks.D4 = !grew;
    }

    // A build that re-renders its filter bar on every state change replaces the chip nodes,
    // so a reference captured before a click is detached afterwards and reports neither its
    // class nor its computed style. Every chip is addressed BY LABEL and re-queried after
    // each click — re-rendering is ordinary, and a harness that punished it would be
    // measuring the rendering strategy rather than the decision.
    const CHIP_BY = (label) => `window.__chips().filter(window.__visible)` +
      `.find((c) => (c.textContent || '').trim() === ${JSON.stringify(label)})`;

    const chipLabels = await page.evaluate(
      `window.__chips().filter(window.__visible).map((c) => (c.textContent || '').trim())`);

    // ── D6 — two filter chips active at once ───────────────────────────────────
    if (chipLabels.length < 2) {
      checks.D6 = false;
    } else {
      const [l0, l1] = chipLabels;
      await page.evaluate(`(() => { const c = ${CHIP_BY(l0)}; if (c) c.click(); })()`);
      await page.waitForTimeout(150);
      await page.evaluate(`(() => { const c = ${CHIP_BY(l1)}; if (c) c.click(); })()`);
      await page.waitForTimeout(150);
      checks.D6 = await page.evaluate(`(() => {
        const a = ${CHIP_BY(l0)}, b = ${CHIP_BY(l1)};
        return !!a && !!b && window.__isActive(a) && window.__isActive(b);
      })()`);
    }
    await page.waitForTimeout(200);

    // ── D5 — a chip selection survives a page change ───────────────────────────
    if (!chipLabels.length) {
      checks.D5 = false;
    } else {
      // Clear whatever D6 left on, one label at a time, re-querying between clicks.
      for (const l of chipLabels) {
        await page.evaluate(`(() => { const c = ${CHIP_BY(l)}; if (c && window.__isActive(c)) c.click(); })()`);
        await page.waitForTimeout(80);
      }
      const label = chipLabels[0];
      await page.evaluate(`(() => { const c = ${CHIP_BY(label)}; if (c) c.click(); })()`);
      await page.waitForTimeout(150);
      const on = await page.evaluate(`(() => { const c = ${CHIP_BY(label)}; return !!c && window.__isActive(c); })()`);
      const paged = on && await page.evaluate(`(() => {
        const pager = Array.from(document.querySelectorAll('button,a,[role="button"],li'))
          .filter((b) => /^\\s*\\d+\\s*$/.test(b.textContent || ''));
        const two = pager.find((p) => (p.textContent || '').trim() === '2');
        if (!two) return false;
        two.click(); return true;
      })()`);
      await page.waitForTimeout(200);
      checks.D5 = !!paged && await page.evaluate(
        `(() => { const c = ${CHIP_BY(label)}; return !!c && window.__isActive(c); })()`);
    }

    await ctx.close();
    ({ ctx, page } = await fresh(browser, file));

    // ── D9 — header control reports mixed on a partial selection ───────────────
    await page.evaluate(SELECT_N(2));
    await page.waitForTimeout(200);
    checks.D9 = await page.evaluate(`(() => {
      const h = ${HEADER_CONTROL};
      if (!h) return false;
      return h.indeterminate === true || h.getAttribute('aria-checked') === 'mixed' ||
             h.dataset.state === 'mixed';
    })()`);

    // ── D2 / D3 — immediate apply, no dialog, and a report afterwards ──────────
    // "Removed" is checked by IDENTITY, not by row count. The graph calls for a paginated
    // list, and on a paginated list removing two of twenty-four refills the page from the
    // remainder — the count is unchanged and a count test would fail the very build the
    // decisions ask for. The two rows that were selected are the two that must be gone.
    const gone0 = await page.evaluate(`(() => {
      const rows = window.__rows().filter(window.__visible);
      return rows.slice(0, 2).map((r) => (r.textContent || '').replace(/\\s+/g, ' ').trim());
    })()`);
    const before = await page.evaluate(`window.__rows().filter(window.__visible).length`);
    const clicked = await page.evaluate(CLICK_RECONCILE);
    await page.waitForTimeout(500);
    const dialog = await page.evaluate(`window.__dialogOpen()`);
    const after = await page.evaluate(`window.__rows().filter(window.__visible).length`);
    const notRemoved = await page.evaluate(`(() => {
      const txt = window.__rows().map((r) => (r.textContent || '').replace(/\\s+/g, ' ').trim());
      return ${JSON.stringify(gone0)}.filter((s) => s && txt.includes(s));
    })()`);
    checks.D2 = clicked && !dialog && gone0.length === 2 && notRemoved.length === 0;
    note.rowsBeforeAfter = [before, after];
    note.removed = { selected: gone0.length, stillPresent: notRemoved.length };
    checks.D3 = await page.evaluate(`window.__visible(window.__note())`);

    // ── T2 — batch note copy: affordance first, then the count ─────────────────
    const noteText = await page.evaluate(`(() => { const n = window.__note(); return n ? (n.textContent || '').trim().replace(/\\s+/g, ' ') : ''; })()`);
    note.batchNote = noteText;
    checks.T2 = /^Undo\s*[—–-]\s*\d+\s+reconciled$/i.test(noteText);

    // ── T3 — the note persists and never counts down ──────────────────────────
    if (checks.D3) {
      const t0 = noteText;
      const anim = await page.evaluate(`(() => {
        const n = window.__note(); if (!n) return true;
        const all = [n, ...n.querySelectorAll('*')];
        return all.some((e) => {
          const cs = getComputedStyle(e);
          return cs.animationName !== 'none' || (cs.transitionProperty || '').split(',').some((p) => /width|transform/.test(p));
        });
      })()`);
      await page.waitForTimeout(9500);
      const stillThere = await page.evaluate(`window.__visible(window.__note())`);
      const t1 = await page.evaluate(`(() => { const n = window.__note(); return n ? (n.textContent || '').trim().replace(/\\s+/g, ' ') : ''; })()`);
      checks.T3 = stillThere && !anim && t0 === t1;
      note.notePersisted = stillThere;
    }

    await ctx.close();
    ({ ctx, page } = await fresh(browser, file));

    // ── Controls ───────────────────────────────────────────────────────────────
    // Tokens have to be DEFINED somewhere, and a definition is necessarily literal. The
    // rule is "every visual value is var(--token)", not "no literal exists in the file", so
    // the :root block where the scale is declared is excluded before looking for literals.
    // Without this the check fails every build including a correct one, which is a harness
    // that cannot pass rather than one that cannot fail.
    const body = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/:root\s*\{[\s\S]*?\}/g, '');
    checks.C1 = !/#[0-9a-fA-F]{3,8}\b/.test(body) &&
                !/\brgb\(/.test(body.replace(/var\(--[^)]*\)/g, ''));
    checks.C2 = await page.evaluate(`(() => {
      const rows = window.__rows().filter(window.__visible);
      if (!rows.length) return false;
      const sheets = Array.from(document.styleSheets);
      let txt = '';
      for (const s of sheets) { try { txt += Array.from(s.cssRules).map((r) => r.cssText).join('\\n'); } catch {} }
      const hoverRules = txt.split('\\n').filter((r) => /:hover/.test(r) && /row/i.test(r));
      if (!hoverRules.length) return false;
      return hoverRules.some((r) => /recessed/.test(r)) && !hoverRules.some((r) => /raised/.test(r));
    })()`);
    checks.C3 = await page.evaluate(`(() => {
      const ramp = ${JSON.stringify(RAMP)};
      const all = Array.from(document.querySelectorAll('body *')).filter(window.__visible);
      const sizes = new Set(all.map((e) => Math.round(parseFloat(getComputedStyle(e).fontSize))));
      if (![...sizes].every((s) => ramp.includes(s))) return false;
      const rows = window.__rows().filter(window.__visible);
      if (!rows.length) return false;
      return Math.round(parseFloat(getComputedStyle(rows[0]).fontSize)) === 13;
    })()`);
    checks.C4 = (() => {
      const need = ['ds-entry-row', 'ds-amount-cell', 'ds-match-marker', 'ds-reconcile-bar',
        'ds-filter-chip', 'ds-batch-note', 'ds-total-footer'];
      const banned = /\b(Table|Grid|Chip|Toast|Modal|Snackbar)\b/;
      return need.every((n) => html.includes(n)) && !banned.test(html);
    })();
    checks.C5 = await page.evaluate(`(() => {
      const chips = window.__chips().filter(window.__visible);
      return chips.length > 0 && chips.every((c) => (c.textContent || '').trim().length > 0);
    })()`);
    checks.C6 = await page.evaluate(`(() => {
      const rows = window.__rows().filter(window.__visible);
      if (!rows.length) return false;
      return rows.every((r) => {
        const cs = getComputedStyle(r);
        return cs.animationName === 'none' || cs.animationDuration === '0s';
      });
    })()`);
    // transition-property computes to "all" on an element with no transition at all, so the
    // property name alone says nothing — a zero duration is the thing that means "no
    // transition". Reading the name only would have failed every build, correct ones included.
    checks.C7 = await page.evaluate(`(() => {
      const rows = window.__rows().filter(window.__visible);
      if (!rows.length) return false;
      return rows.every((r) => {
        const cs = getComputedStyle(r);
        const props = (cs.transitionProperty || '').split(',').map((s) => s.trim());
        const durs = (cs.transitionDuration || '').split(',').map((s) => parseFloat(s) || 0);
        return !props.some((p, i) => (p === 'all' || /background/.test(p)) && (durs[i] ?? durs[0] ?? 0) > 0);
      });
    })()`);
    checks.C8 = await page.evaluate(`(() => {
      const els = Array.from(document.querySelectorAll('button,a,input,[role="button"],[role="checkbox"]'))
        .filter(window.__visible);
      if (!els.length) return false;
      return els.every((e) => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; });
    })()`);
  } catch (err) {
    note.error = String(err?.message ?? err).slice(0, 200);
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }

  return { checks, note };
}

const browser = await chromium.launch();
// Builds are bNN/. The fixture pair (conformant/, defective/) is scored by the same code
// path on purpose — a harness validated by a second scorer proves nothing about the first.
const NAME = process.env.R5_DIR_PATTERN ? new RegExp(process.env.R5_DIR_PATTERN) : /^b\d+$/;
const dirs = readdirSync(buildsDir).filter((d) => NAME.test(d)).sort();
const results = [];
for (const d of dirs) {
  const { checks, note } = await scoreBuild(browser, join(buildsDir, d));
  const primary = DISCRIMINATING.filter((k) => checks[k]).length;
  const control = CONTROLS.filter((k) => checks[k]).length;
  results.push({ build: d, primary, control, checks, notes: note });
  console.log(`${d}  primary ${String(primary).padStart(2)}/16   control ${control}/8   ` +
    DISCRIMINATING.filter((k) => !checks[k]).join(',') || '');
}
await browser.close();

const { writeFileSync } = await import('node:fs');
writeFileSync(outPath, JSON.stringify({ discriminating: DISCRIMINATING, controls: CONTROLS, results }, null, 2));
console.log(`\nwrote ${outPath}`);
