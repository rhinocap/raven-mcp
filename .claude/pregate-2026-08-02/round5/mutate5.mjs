// Mutation matrix. The conformant fixture proves the harness CAN score 16/16 + 8/8 and the
// defective one proves it can score 0/0; neither proves that check X is the thing that
// responds to defect X. This builds one mutant per check — the conformant fixture with
// exactly one decision reversed — and asserts that the targeted check goes false.
//
// Co-flips are reported, not silently tolerated. Three couplings are structural and are
// declared up front rather than discovered afterwards:
//   D3 → T3   T3 only asks whether the note persisted, and a note that never appeared
//             cannot persist. Hiding the note necessarily takes both.
//   D4 → D5   D5 changes page through the numbered pager. Replacing the pager with a
//             load-more button removes the mechanism D5 is measured through.
// Anything outside that set is a specificity failure and the run says so.
//
//   node mutate5.mjs            (writes mutants/ beside this file, scores, prints a matrix)

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'fixtures', 'conformant');
const OUT = join(HERE, 'mutants');

const EXPECTED_COFLIPS = { D3: ['T3'], D4: ['D5'] };

// Each mutant is one semantic defect. `edits` are literal find/replace pairs applied to
// index.html unless `file` says otherwise; every find must match exactly once or the
// mutation is rejected rather than silently skipped.
const MUTANTS = [
  { target: 'D1', why: 'reconcile bar moved above the list',
    edits: [
      [`  <div class="ds-reconcile-bar" id="bar">\n    <span id="barLabel">No entries selected</span>\n    <button id="reconcile" disabled>Reconcile</button>\n  </div>\n\n`, ``],
      [`  <ul id="list"></ul>`,
       `  <div class="ds-reconcile-bar" id="bar">\n    <span id="barLabel">No entries selected</span>\n    <button id="reconcile" disabled>Reconcile</button>\n  </div>\n\n  <ul id="list"></ul>`],
    ] },
  { target: 'D2', why: 'reconcile does not remove the entries it acted on',
    edits: [[`for (const id of batch) { const e = entries.find((x) => x.id === id); if (e) e.done = true; }`,
             `for (const id of batch) { const e = entries.find((x) => x.id === id); if (e) e.done = false; }`]] },
  { target: 'D3', why: 'no visible report after a bulk action',
    edits: [[`.ds-batch-note {\n  display: flex;`, `.ds-batch-note {\n  display: none;`]] },
  { target: 'D4', why: 'load-more button instead of a numbered pager',
    edits: [[`  const pages = Math.max(1, Math.ceil(visible().length / PER_PAGE));\n  for (let p = 1; p <= pages; p++) {\n    const b = document.createElement('button');\n    b.type = 'button';\n    b.textContent = String(p);\n    b.setAttribute('aria-current', p === page ? 'true' : 'false');\n    b.addEventListener('click', () => { page = p; render(); });\n    host.appendChild(b);\n  }`,
             `  if (visible().length > PER_PAGE * page) {\n    const b = document.createElement('button');\n    b.type = 'button';\n    b.textContent = 'Load more';\n    b.addEventListener('click', () => { PER_PAGE_SHOWN += PER_PAGE; render(); });\n    host.appendChild(b);\n  }`],
            [`const PER_PAGE = 12;`, `const PER_PAGE = 12;\nlet PER_PAGE_SHOWN = 12;`],
            [`  const start = (page - 1) * PER_PAGE;\n  return v.slice(start, start + PER_PAGE);`,
             `  return v.slice(0, PER_PAGE_SHOWN);`]] },
  { target: 'D5', why: 'filters clear when the page changes',
    edits: [[`b.addEventListener('click', () => { page = p; render(); });`,
             `b.addEventListener('click', () => { page = p; active.clear(); render(); });`]] },
  { target: 'D6', why: 'filter chips are single-select',
    edits: [[`      if (active.has(s)) active.delete(s); else active.add(s);`,
             `      const was = active.has(s); active.clear(); if (!was) active.add(s);`]] },
  { target: 'D7', why: 'negative amounts in parentheses',
    edits: [[`const money = (n) => (n < 0 ? '-' : '') + '£' + Math.abs(n).toFixed(2);`,
             `const money = (n) => (n < 0 ? '(£' + Math.abs(n).toFixed(2) + ')' : '£' + n.toFixed(2));`]] },
  { target: 'D8', why: 'row grows on hover',
    edits: [[`.ds-entry-row:hover { background: var(--color-surface-recessed); }`,
             `.ds-entry-row:hover { background: var(--color-surface-recessed); height: 64px; }`]] },
  { target: 'D9', why: 'header control is binary, never mixed',
    edits: [[`  cb.indeterminate = hit > 0 && hit < ids.length;`, `  cb.indeterminate = false;`]] },
  { target: 'D10', why: 'marker carries a tooltip',
    edits: [[`    marker.dataset.match = e.state;`,
             `    marker.dataset.match = e.state;\n    marker.title = WORD[e.state] + ' — import confidence';`]] },
  { target: 'D11', why: 'the contested label is silently decided instead of raised',
    file: 'NOTES.md',
    edits: [[`- The label for an entry with no plausible match is unresolved. "Break" is the exact\n  accounting term, but it reads as an error state to about half the pilot users, and\n  "Unmatched" tested clearer while being vaguer. I have used "Break" to match the existing\n  decision, but this needs a call before it ships.`,
             `None — the requirements and the design system between them settled everything.`]] },
  { target: 'T1', why: 'marker is 12px, outside the dot size the decision names',
    edits: [[`  width: var(--space-tight); height: var(--space-tight);\n  border-radius: 50%; flex: 0 0 var(--space-tight);`,
             `  width: 12px; height: 12px;\n  border-radius: 50%; flex: 0 0 12px;`]] },
  { target: 'T2', why: 'batch note leads with the count, not the affordance',
    edits: [[`  const rest = document.createElement('span');\n  rest.textContent = ' — ' + lastBatch.length + ' reconciled';\n  note.append(undo, rest);`,
             `  const rest = document.createElement('span');\n  rest.textContent = lastBatch.length + ' reconciled — ';\n  note.append(rest, undo);`]] },
  { target: 'T3', why: 'batch note auto-dismisses after five seconds',
    edits: [[`  slot.appendChild(note);\n}`,
             `  slot.appendChild(note);\n  setTimeout(() => { if (slot.contains(note)) slot.innerHTML = ''; }, 5000);\n}`]] },
  { target: 'T4', why: 'total footer sits at the end of the page, not pinned',
    edits: [[`.ds-total-footer {\n  position: fixed; left: 0; right: 0; bottom: 0;`,
             `.ds-total-footer {\n  position: static;`]] },
  { target: 'T5', why: 'amount column edge is not the fixed 56px',
    edits: [[`.ds-entry-row {\n  display: flex; align-items: center; gap: var(--space-base);\n  padding: 0 var(--space-column) 0 var(--space-base);`,
             `.ds-entry-row {\n  display: flex; align-items: center; gap: var(--space-base);\n  padding: 0 var(--space-wide) 0 var(--space-base);`]] },
  { target: 'C1', why: 'a literal colour outside the token block',
    edits: [[`.sub { font-size: var(--type-md); color: var(--color-ink-secondary);`,
             `.sub { font-size: var(--type-md); color: #9aa1a8;`]] },
  { target: 'C2', why: 'row hover lifts instead of recessing',
    edits: [[`.ds-entry-row:hover { background: var(--color-surface-recessed); }`,
             `.ds-entry-row:hover { background: var(--color-surface-raised); }`]] },
  { target: 'C3', why: 'a font size outside the five-step ramp',
    edits: [[`  height: 52px;\n  border-bottom: 1px solid var(--color-hairline);\n  font-size: var(--type-sm);`,
             `  height: 52px;\n  border-bottom: 1px solid var(--color-hairline);\n  font-size: 14px;`]] },
  { target: 'C4', why: 'a banned component name',
    edits: [[`<div class="page">`, `<div class="page">\n  <div class="Toast" hidden></div>`]] },
  { target: 'C5', why: 'an icon-only filter control',
    edits: [[`    host.appendChild(b);\n  }\n}\n\nfunction renderList()`,
             `    host.appendChild(b);\n  }\n  const icon = document.createElement('button');\n  icon.className = 'ds-filter-chip';\n  icon.type = 'button';\n  icon.setAttribute('aria-label', 'More filters');\n  host.appendChild(icon);\n}\n\nfunction renderList()`]] },
  { target: 'C6', why: 'rows animate in',
    edits: [[`#list { list-style: none; }`,
             `#list { list-style: none; }\n@keyframes rowIn { from { opacity: 0.2; } to { opacity: 1; } }`],
            [`  font-size: var(--type-sm);\n  background: var(--color-surface-base);\n}`,
             `  font-size: var(--type-sm);\n  background: var(--color-surface-base);\n  animation: rowIn 0.3s ease both;\n}`]] },
  { target: 'C7', why: 'a transition on the row background',
    edits: [[`  background: var(--color-surface-base);\n}\n.ds-entry-row:hover`,
             `  background: var(--color-surface-base);\n  transition: background-color 0.2s ease;\n}\n.ds-entry-row:hover`]] },
  { target: 'C8', why: 'a target below 44x44',
    edits: [[`  width: 44px; height: 44px; flex: 0 0 44px;\n  background: transparent; border: 0; cursor: pointer;`,
             `  width: 20px; height: 20px; flex: 0 0 20px;\n  background: transparent; border: 0; cursor: pointer;`]] },
];

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const failures = [];
for (const m of MUTANTS) {
  const dir = join(OUT, 'm' + m.target);
  cpSync(SRC, dir, { recursive: true });
  const target = join(dir, m.file ?? 'index.html');
  let src = readFileSync(target, 'utf8');
  for (const [find, repl] of m.edits) {
    const n = src.split(find).length - 1;
    if (n !== 1) { failures.push(`${m.target}: pattern matched ${n} times, expected 1`); src = null; break; }
    src = src.split(find).join(repl);
  }
  if (src === null) { rmSync(dir, { recursive: true }); continue; }
  writeFileSync(target, src);
}
if (failures.length) {
  console.error('MUTATION AUTHORING FAILED:\n  ' + failures.join('\n  '));
  process.exit(1);
}

execFileSync(process.execPath, [join(HERE, 'measure5.mjs'), OUT, '/tmp/r5-mutant-scores.json'],
  { stdio: 'inherit', env: { ...process.env, R5_DIR_PATTERN: '^m[A-Z]\\d+$' } });

const base = JSON.parse(readFileSync('/tmp/r5-fixture-scores.json', 'utf8'))
  .results.find((r) => r.build === 'conformant');
if (!base) { console.error('no conformant baseline in /tmp/r5-fixture-scores.json — score the fixtures first'); process.exit(1); }

const scored = JSON.parse(readFileSync('/tmp/r5-mutant-scores.json', 'utf8'));
const byBuild = Object.fromEntries(scored.results.map((r) => [r.build, r]));

console.log('\ntarget  hit  co-flips (unexpected marked !)   defect');
let bad = 0;
for (const m of MUTANTS) {
  const r = byBuild['m' + m.target];
  if (!r) { console.log(`${m.target.padEnd(6)}  ---  NOT SCORED`); bad++; continue; }
  const flipped = Object.keys(base.checks).filter((k) => base.checks[k] && !r.checks[k]);
  const hit = flipped.includes(m.target);
  const allowed = new Set([m.target, ...(EXPECTED_COFLIPS[m.target] ?? [])]);
  const unexpected = flipped.filter((k) => !allowed.has(k));
  if (!hit || unexpected.length) bad++;
  console.log(`${m.target.padEnd(6)}  ${hit ? ' ok' : 'MISS'}  ` +
    (flipped.filter((k) => k !== m.target).map((k) => (allowed.has(k) ? k : '!' + k)).join(',') || '-').padEnd(30) +
    `  ${m.why}`);
}
console.log(bad === 0
  ? `\nALL ${MUTANTS.length} CHECKS SPECIFIC — each defect flips its own check and nothing outside the declared couplings.`
  : `\n${bad} MUTANT(S) FAILED — the harness is not measuring what it claims.`);
process.exit(bad === 0 ? 0 : 1);
