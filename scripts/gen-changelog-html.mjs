#!/usr/bin/env node
/**
 * Generate the static site/changelog.html from the single source of truth
 * web/data/changelog.json, inlining web/app/changelog/changelog.css so the
 * static page is pixel-identical to the Next port. Replaces React's filter
 * state with a tiny vanilla-JS toggle.
 *
 * Run:  node scripts/gen-changelog-html.mjs
 * Both surfaces share one content + style source — edit the JSON/CSS, re-run.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(readFileSync(join(root, 'web/data/changelog.json'), 'utf8'))
const css = readFileSync(join(root, 'web/app/changelog/changelog.css'), 'utf8')

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const fmtDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const labelFor = (id) =>
  (data.categories.find((c) => c.id === id) || {}).label || 'Update'

const releases = [...data.releases].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))

const pills = data.categories
  .map(
    (c, i) =>
      `        <button role="tab" class="cl-pill${i === 0 ? ' is-active' : ''}" aria-selected="${i === 0}" data-filter="${c.id}">${esc(c.label)}</button>`,
  )
  .join('\n')

const items = releases
  .map(
    (r) => `        <li class="cl-item" data-category="${r.category}">
          <span aria-hidden="true" class="cl-node cat-${r.category}"></span>
          <article class="cl-card">
            <header class="cl-card-head">
              <span class="cl-surface"><span aria-hidden="true" class="cl-dot cat-${r.category}"></span>${esc(labelFor(r.category))}</span>
              <span class="cl-version">${esc(r.version)}</span>
              <span class="cl-badge kind-${r.kind}">${esc(data.kinds[r.kind] || r.kind)}</span>
              <time datetime="${r.date}" class="cl-date">${fmtDate(r.date)}</time>
            </header>
            <h2 class="cl-title">${esc(r.title)}</h2>
            <ul class="cl-changes">
${r.changes.map((c) => `              <li>${esc(c)}</li>`).join('\n')}
            </ul>
          </article>
        </li>`,
  )
  .join('\n')

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Changelog — RavenMCP</title>
  <meta name="description" content="Everything shipping to RavenMCP — new tools, audits, design-system knowledge, and fixes, in one stream.">
  <link rel="canonical" href="https://ravenmcp.ai/changelog.html">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <meta property="og:title" content="Changelog — RavenMCP">
  <meta property="og:description" content="Everything we're shipping — every RavenMCP release, in one stream.">
  <meta property="og:image" content="https://ravenmcp.ai/assets/og-image.jpg">
  <style>
    @font-face {
      font-family: "Untitled Sans";
      src: url("/assets/fonts/untitled-sans-regular.woff2") format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Untitled Sans";
      src: url("/assets/fonts/untitled-sans-medium.woff2") format("woff2");
      font-weight: 500 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Untitled Sans";
      src: url("/assets/fonts/untitled-sans-bold.woff2") format("woff2");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Untitled Sans";
      src: url("/assets/fonts/untitled-sans-black.woff2") format("woff2");
      font-weight: 800 900;
      font-style: normal;
      font-display: swap;
    }
    /* Page base — the Next port gets this from globals.css; the standalone
       static page must set it itself so translucent cards composite over dark. */
    html { background: #1a1a22; }
    body { margin: 0; background: #1a1a22; color: #F0F0F2; font-family: "Untitled Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    *, *::before, *::after { box-sizing: border-box; }
${css.replace(/\n/g, '\n    ').trimEnd()}
  </style>
</head>
<body>
  <script src="assets/nav.js"></script>
  <raven-nav></raven-nav>

  <main id="main" class="cl-wrap">
    <section class="cl-hero" aria-labelledby="cl-hero-heading">
      <div class="cl-hero-glow" aria-hidden="true"></div>
      <p class="cl-eyebrow">Changelog</p>
      <h1 id="cl-hero-heading" class="cl-headline">Everything<span class="cl-headline-accent">we&rsquo;re shipping.</span></h1>
      <p class="cl-lede">We ship a new release every Friday. New tools, sharper audits, fresh design knowledge, and fixes land constantly — here&rsquo;s every update, in one place.</p>
    </section>

    <section class="cl-feed">
      <div role="tablist" aria-label="Filter updates by area" class="cl-filters">
${pills}
      </div>

      <ol class="cl-timeline">
${items}
      </ol>

      <footer class="cl-foot">
        <a href="/" class="cl-foot-primary">&larr; Back to RavenMCP</a>
        <a href="/docs.html" class="cl-foot-secondary">Get started</a>
      </footer>
    </section>
  </main>

  <script>
    // Filter pills — show only releases whose data-category matches (or 'all').
    (function () {
      var pills = document.querySelectorAll('.cl-pill');
      var items = document.querySelectorAll('.cl-item');
      pills.forEach(function (pill) {
        pill.addEventListener('click', function () {
          var f = pill.getAttribute('data-filter');
          pills.forEach(function (p) {
            var on = p === pill;
            p.classList.toggle('is-active', on);
            p.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          items.forEach(function (it) {
            var show = f === 'all' || it.getAttribute('data-category') === f;
            it.style.display = show ? '' : 'none';
          });
        });
      });
    })();
  </script>

  <script src="assets/footer.js"></script>
  <raven-footer></raven-footer>
</body>
</html>
`

writeFileSync(join(root, 'site/changelog.html'), html)
console.log(`Wrote site/changelog.html — ${releases.length} releases.`)
