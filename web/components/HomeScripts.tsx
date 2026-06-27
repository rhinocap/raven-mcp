'use client'

import { useEffect } from 'react'

export default function HomeScripts() {
  useEffect(() => {

      (async () => {
        try {
          const [npmWeek, npmMeta] = await Promise.all([
            fetch('https://api.npmjs.org/downloads/point/last-week/raven-mcp').then(r => r.json()),
            fetch('https://registry.npmjs.org/raven-mcp').then(r => r.json())
          ]);
          const v = npmMeta['dist-tags'] && npmMeta['dist-tags'].latest;
          const versionCount = Object.keys(npmMeta.versions || {}).length;
          document.getElementById('rs-ver')!.textContent = v ? `v${v}` : 'v—';
          document.getElementById('rs-rel')!.textContent = String(versionCount);
          const dl = (npmWeek.downloads || 0).toLocaleString();
          document.getElementById('rs-dl')!.innerHTML = `${dl}<span class="unit">/wk</span>`;
        } catch (e) {
          console.warn('raven stats fetch failed', e);
        }
      })();
      


    /* ── Scroll Reveal ── */
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function(el) { observer.observe(el); });

    /* ── Sizzle Reel ── */
    function chrome(url: string, inner: string) {
      return '<div class="browser-chrome">'
        + '<div class="browser-bar"><div class="browser-dots"><span></span><span></span><span></span></div><div class="browser-url">' + url + '</div></div>'
        + '<div class="browser-viewport">' + inner + '</div></div>';
    }

    var uiPricing = chrome('app.acme.io/pricing',
      '<div class="mini-pricing">'
      + '<div class="mini-plan"><div class="mini-plan-name">Starter</div><div class="mini-plan-price">$0<span>/mo</span></div><div class="mini-plan-desc">For side projects and solo devs</div><div class="mini-plan-features"><div>5 projects</div><div>Basic analytics</div><div>Community support</div></div><div class="mini-plan-btn outline">Get Started</div></div>'
      + '<div class="mini-plan pop"><div class="mini-plan-name">Pro</div><div class="mini-plan-price">$19<span>/mo</span></div><div class="mini-plan-desc">For professional teams shipping fast</div><div class="mini-plan-features"><div>Unlimited projects</div><div>Advanced analytics</div><div>Priority support</div><div>Custom domains</div></div><div class="mini-plan-btn fill">Start Free Trial</div></div>'
      + '<div class="mini-plan"><div class="mini-plan-name">Enterprise</div><div class="mini-plan-price">$79<span>/mo</span></div><div class="mini-plan-desc">For orgs that need scale and control</div><div class="mini-plan-features"><div>Everything in Pro</div><div>SSO &amp; SAML</div><div>Audit logs</div><div>Dedicated support</div></div><div class="mini-plan-btn outline">Contact Sales</div></div>'
      + '</div>');

    var uiForm = chrome('app.acme.io/audit-report',
      '<div class="mini-audit">'
      + '<div class="mini-audit-header"><h4>Design Audit Report</h4><div class="mini-audit-grade">A</div></div>'
      + '<div class="mini-audit-score"><div class="mini-audit-bar"><div class="mini-audit-fill" style="width:92%"></div></div><span>92/100</span></div>'
      + '<div class="mini-audit-checks">'
      + '<div class="mini-check pass"><span>\u2713</span> Font sizes \u2265 13px</div>'
      + '<div class="mini-check pass"><span>\u2713</span> Font weights \u2265 400</div>'
      + '<div class="mini-check pass"><span>\u2713</span> All images have alt text</div>'
      + '<div class="mini-check pass"><span>\u2713</span> Uses flex-wrap layout</div>'
      + '<div class="mini-check pass"><span>\u2713</span> Uses clamp() sizing</div>'
      + '<div class="mini-check warn"><span>!</span> 3 bare hex values found</div>'
      + '<div class="mini-check pass"><span>\u2713</span> 44px touch targets</div>'
      + '</div></div>');

    var uiSignup = chrome('app.acme.io/signup',
      '<div class="mini-form">'
      + '<h4>Create your account</h4>'
      + '<div class="mini-form-sub">Start your 14-day free trial</div>'
      + '<div class="mini-form-row"><div class="mini-form-field"><label>First name</label><div class="mini-input">Sarah</div></div><div class="mini-form-field"><label>Last name</label><div class="mini-input">Chen</div></div></div>'
      + '<div class="mini-form-field"><label>Work email</label><div class="mini-input">sarah@acme.co</div></div>'
      + '<div class="mini-form-field"><label>Password</label><div class="mini-input has-error">\u2022\u2022\u2022\u2022\u2022\u2022</div><div class="mini-error">\u26A0 Must be at least 8 characters with one number</div></div>'
      + '<div class="mini-form-submit">Create Account</div>'
      + '<div class="mini-form-terms">By signing up you agree to our Terms and Privacy Policy</div>'
      + '</div>');

    var bars = [35,52,44,68,58,72,48,65,80,55,70,90].map(function(h){return '<div class="mini-chart-bar" style="height:'+h+'%"></div>';}).join('');
    var uiLinear = chrome('app.acme.io/dashboard',
      '<div class="mini-dash">'
      + '<div class="mini-dash-header"><h4>Analytics Overview</h4><span>Last 30 days</span></div>'
      + '<div class="mini-dash-kpis">'
      + '<div class="mini-kpi"><div class="mini-kpi-label">Revenue</div><div class="mini-kpi-value">$48.2k</div><div class="mini-kpi-change up">\u2191 12.3%</div></div>'
      + '<div class="mini-kpi"><div class="mini-kpi-label">Users</div><div class="mini-kpi-value">2,847</div><div class="mini-kpi-change up">\u2191 8.1%</div></div>'
      + '<div class="mini-kpi"><div class="mini-kpi-label">Churn</div><div class="mini-kpi-value">1.2%</div><div class="mini-kpi-change down">\u2193 0.3%</div></div>'
      + '<div class="mini-kpi"><div class="mini-kpi-label">NPS</div><div class="mini-kpi-value">72</div><div class="mini-kpi-change up">\u2191 4pts</div></div>'
      + '</div>'
      + '<div class="mini-dash-chart"><div class="mini-dash-chart-label">Monthly Revenue</div><div class="mini-chart-bars">' + bars + '</div></div>'
      + '</div>');

    var uiDash = chrome('app.mystore.io',
      '<div class="mini-brand">'
      + '<div class="mini-brand-header"><div class="mini-brand-logo" style="background:#1DB954"></div><h4>Spotify Brand Kit</h4></div>'
      + '<div class="mini-brand-tokens">'
      + '<div class="mini-token"><div class="mini-token-swatch" style="background:#1DB954"></div><div class="mini-token-info"><span class="mini-token-name">primary</span><span class="mini-token-val">#1DB954</span></div></div>'
      + '<div class="mini-token"><div class="mini-token-swatch" style="background:#191414"></div><div class="mini-token-info"><span class="mini-token-name">background</span><span class="mini-token-val">#191414</span></div></div>'
      + '<div class="mini-token"><div class="mini-token-swatch" style="background:#535353"></div><div class="mini-token-info"><span class="mini-token-name">surface</span><span class="mini-token-val">#535353</span></div></div>'
      + '<div class="mini-token"><div class="mini-token-swatch" style="background:#B3B3B3"></div><div class="mini-token-info"><span class="mini-token-name">text-secondary</span><span class="mini-token-val">#B3B3B3</span></div></div>'
      + '</div>'
      + '<div class="mini-brand-fonts"><span>Circular Std</span><span>dark-first</span><span>4px radius</span></div>'
      + '</div>');

    var uiA11y = chrome('app.acme.io/accessibility',
      '<div class="mini-a11y">'
      + '<div class="mini-a11y-header"><h4>Accessibility Report</h4><span class="mini-a11y-badge">WCAG AA</span></div>'
      + '<div class="mini-a11y-summary">'
      + '<div class="mini-a11y-stat"><div class="mini-a11y-stat-val good">6</div><div class="mini-a11y-stat-label">Passed</div></div>'
      + '<div class="mini-a11y-stat"><div class="mini-a11y-stat-val bad">2</div><div class="mini-a11y-stat-label">Failed</div></div>'
      + '</div>'
      + '<div class="mini-a11y-checks">'
      + '<div class="mini-a11y-check pass"><span class="a11y-icon">\u2713</span> Color contrast \u2265 4.5:1</div>'
      + '<div class="mini-a11y-check pass"><span class="a11y-icon">\u2713</span> Focus indicators on all interactive elements</div>'
      + '<div class="mini-a11y-check pass"><span class="a11y-icon">\u2713</span> Touch targets \u2265 44px</div>'
      + '<div class="mini-a11y-check fail"><span class="a11y-icon">\u2717</span> 2 images missing alt text</div>'
      + '<div class="mini-a11y-check pass"><span class="a11y-icon">\u2713</span> Keyboard navigation complete</div>'
      + '<div class="mini-a11y-check fail"><span class="a11y-icon">\u2717</span> Skip navigation link missing</div>'
      + '<div class="mini-a11y-check pass"><span class="a11y-icon">\u2713</span> ARIA roles on dynamic content</div>'
      + '<div class="mini-a11y-check pass"><span class="a11y-icon">\u2713</span> Reduced motion respected</div>'
      + '</div></div>');

    var uiMobile = '<div class="mini-phone">'
      + '<div class="mini-phone-notch"></div>'
      + '<div class="mini-phone-screen">'
      + '<div class="mini-phone-status"><span>9:41</span><span>\u2022\u2022\u2022\u2022 \u{1F50B}</span></div>'
      + '<div class="mini-phone-content">'
      + '<h4>Good morning</h4>'
      + '<div class="mini-app-card"><div class="mini-app-card-title">Weekly Summary</div><div class="mini-app-card-sub">Your activity is up 12% this week</div></div>'
      + '<div class="mini-app-card"><div class="mini-app-card-title">New Message</div><div class="mini-app-card-sub">Sarah shared a design update</div></div>'
      + '<div class="mini-app-card"><div class="mini-app-card-title">Reminder</div><div class="mini-app-card-sub">Design review at 2:00 PM</div></div>'
      + '</div>'
      + '<div class="mini-phone-tabbar">'
      + '<div class="mini-tab active"><span class="mini-tab-icon">\u2302</span><span class="mini-tab-label">Home</span></div>'
      + '<div class="mini-tab"><span class="mini-tab-icon">\u2315</span><span class="mini-tab-label">Search</span></div>'
      + '<div class="mini-tab"><span class="mini-tab-icon">\u271A</span><span class="mini-tab-label">Create</span></div>'
      + '<div class="mini-tab"><span class="mini-tab-icon">\u2661</span><span class="mini-tab-label">Activity</span><span class="mini-tab-badge">3</span></div>'
      + '<div class="mini-tab"><span class="mini-tab-icon">\u2299</span><span class="mini-tab-label">Profile</span></div>'
      + '</div>'
      + '</div></div>';

    var scenes = [
      {
        prompt: 'claude "add a pricing section to the landing page"',
        comment: '# Raven auto-queries across 9 knowledge layers:',
        tools: [
          { fn: 'get_principles', result: 'Hick\'s Law, Anchoring, Von Restorff', color: 'fn' },
          { fn: 'get_pattern', result: '3-tier, feature comparison, social proof', color: 'fn' },
          { fn: 'get_design_system', result: 'Stripe tokens \u2014 colors, spacing, type', color: 'key' },
          { fn: 'get_business_strategy', result: 'decoy pricing, annual discount, CTA', color: 'val' }
        ],
        ui: uiPricing
      },
      {
        prompt: 'claude "check this page meets WCAG AA accessibility standards"',
        comment: '# Raven runs a full accessibility audit:',
        tools: [
          { fn: 'get_principles', result: 'WCAG AA contrast 4.5:1, focus indicators, ARIA roles', color: 'fn' },
          { fn: 'get_checklist', result: 'Keyboard nav, screen reader, color blindness, motion', color: 'fn' },
          { fn: 'evaluate_design', result: '3 violations: missing alt text, low contrast link, no skip nav', color: 'val' },
          { fn: 'get_pattern', result: 'Focus ring styles, skip-to-content, aria-live regions', color: 'fn' }
        ],
        ui: uiA11y
      },
      {
        prompt: 'claude "audit this page for design quality"',
        comment: '# Raven checks against 129 design principles:',
        tools: [
          { fn: 'audit_page', result: 'Score: 92/100 \u2014 Grade A, 11/12 checks pass', color: 'val' },
          { fn: 'get_principles', result: 'Typography min 13px, weight 400+, WCAG AA', color: 'fn' },
          { fn: 'get_checklist', result: 'Touch targets, alt text, flex-wrap, clamp()', color: 'fn' },
          { fn: 'evaluate_design', result: '3 bare hex values \u2014 use CSS custom props', color: 'val' }
        ],
        ui: uiForm
      },
      {
        prompt: 'claude "make it look like Spotify"',
        comment: '# Raven matches brand + generates full token kit:',
        tools: [
          { fn: 'get_brand_system', result: 'Spotify \u2014 dark-first, #1DB954, Circular Std', color: 'key' },
          { fn: 'get_design_system', result: '47 tokens \u2014 colors, type, spacing, radius', color: 'fn' },
          { fn: 'get_principles', result: 'Contrast 4.5:1 on dark bg, card hierarchy', color: 'fn' },
          { fn: 'compose_system', result: 'Spotify tokens + custom overrides \u2192 CSS vars', color: 'val' }
        ],
        ui: uiDash
      },
      {
        prompt: 'claude "design the tab bar and navigation for our iOS app"',
        comment: '# Raven applies mobile-first principles:',
        tools: [
          { fn: 'get_principles', result: 'Thumb zone design, Fitts\'s Law, touch targets 44pt', color: 'fn' },
          { fn: 'get_pattern', result: 'Tab bar: 5 max items, active state, badge counts', color: 'fn' },
          { fn: 'get_principles', result: 'Bottom nav for primary, hamburger for secondary only', color: 'fn' },
          { fn: 'get_design_system', result: 'Apple HIG tokens \u2014 SF Pro, semantic colors, 8pt grid', color: 'key' }
        ],
        ui: uiMobile
      },
      {
        prompt: 'claude "the signup form feels off, check it"',
        comment: '# Raven evaluates against principles:',
        tools: [
          { fn: 'evaluate_design', result: 'Placeholder-only labels, no inline errors', color: 'val' },
          { fn: 'get_principles', result: 'Contrast 4.5:1, keyboard nav, focus ring', color: 'fn' },
          { fn: 'get_pattern', result: 'Single-column, labels above, smart defaults', color: 'fn' },
          { fn: 'get_checklist', result: '12 items \u2014 3 pass, 4 warn, 5 violations', color: 'val' }
        ],
        ui: uiSignup
      },
      {
        prompt: 'claude "build the analytics view, use Linear\'s tokens"',
        comment: '# Raven fetches real production tokens:',
        tools: [
          { fn: 'get_design_system', result: '#191A23 bg, #5E6AD2 accent, Inter 13px', color: 'key' },
          { fn: 'get_pattern', result: 'KPI cards, activity feed, skeleton loading', color: 'fn' },
          { fn: 'get_principles', result: 'Progressive disclosure, recognition > recall', color: 'fn' },
          { fn: 'compose_system', result: 'Linear tokens + custom overrides merged', color: 'val' }
        ],
        ui: uiLinear
      }
    ];

    var reel = document.getElementById('sizzle-reel') as HTMLElement;
    var dots = document.querySelectorAll('.sizzle-dot');
    var currentScene = -1;
    var sceneTimer: any = null;
    var isAnimating = false;

    function sleep(ms: number) {
      return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function addLine(html: string, cls?: string) {
      var div = document.createElement('div');
      div.className = 'sizzle-line' + (cls ? ' ' + cls : '');
      div.innerHTML = html;
      reel.appendChild(div);
      div.offsetHeight;
      div.classList.add('visible');
      return div;
    }

    async function typeText(el: any, text: string, speed?: number) {
      var span = el.querySelector('.cmd-text');
      for (var i = 0; i < text.length; i++) {
        span.textContent += text[i];
        await sleep(speed || 22);
      }
    }

    async function playScene(index: number) {
      if (isAnimating) return;
      isAnimating = true;
      currentScene = index;

      dots.forEach(function(d, i) {
        d.classList.toggle('active', i === index);
      });

      var scene = scenes[index];
      reel.innerHTML = '';

      /* prompt line with typing */
      var promptLine = addLine(
        '<span class="prompt">~</span> <span class="cmd"><span class="cmd-text"></span><span class="sizzle-cursor"></span></span>',
        'line'
      );
      await sleep(300);
      await typeText(promptLine, scene.prompt, 20);

      var cursor = promptLine.querySelector('.sizzle-cursor');
      if (cursor) cursor.remove();
      await sleep(400);

      /* comment */
      addLine('<br>');
      addLine('<span class="comment">' + scene.comment + '</span>', 'line');
      await sleep(250);

      /* tool calls with spinners */
      for (var i = 0; i < scene.tools.length; i++) {
        var t = scene.tools[i];
        var padded = t.fn;
        while (padded.length < 22) padded += '\u00a0';

        var line = addLine(
          '<span class="tool-call">' +
            '<span class="tool-spinner"></span>' +
            '<span class="fn">' + padded + '</span>' +
            '<span class="comment">\u2192</span> ' +
            '<span class="' + t.color + '">' + t.result + '</span>' +
          '</span>',
          'line'
        );
        await sleep(350);
        var spinner = line.querySelector('.tool-spinner');
        if (spinner) spinner.classList.add('done');
        await sleep(150);
      }

      /* show the rendered UI */
      await sleep(500);
      var preview = document.createElement('div');
      preview.className = 'ui-preview';
      preview.innerHTML = scene.ui;
      reel.appendChild(preview);
      preview.offsetHeight;
      preview.classList.add('visible');

      isAnimating = false;
    }

    function nextScene() {
      var next = (currentScene + 1) % scenes.length;
      playScene(next);
    }

    function startLoop() {
      clearInterval(sceneTimer);
      sceneTimer = setInterval(function() {
        if (!isAnimating) nextScene();
      }, 9000);
    }

    dots.forEach(function(dot) {
      dot.addEventListener('click', function(this: Element) {
        var idx = parseInt(this.getAttribute('data-scene') || '0');
        clearInterval(sceneTimer);
        playScene(idx).then(startLoop);
      });
    });

    playScene(0).then(startLoop);

    /* ── Animated Counters ── */
    var counterObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target as HTMLElement;
        if (el.dataset.counted) return;
        el.dataset.counted = '1';
        var text = el.textContent.trim();
        var match = text.match(/^(\d+)/);
        if (!match) return;
        var target = parseInt(match[1]);
        var suffix = text.replace(match[1], '');
        var duration = 1200;
        var start = performance.now();
        el.classList.add('counting');
        function tick(now: number) {
          var t = Math.min((now - start) / duration, 1);
          var eased = 1 - Math.pow(1 - t, 3);
          var current = Math.round(target * eased);
          el.innerHTML = current + suffix;
          if (t < 1) requestAnimationFrame(tick);
          else el.classList.remove('counting');
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('.stat-number').forEach(function(el) {
      counterObserver.observe(el);
    });

    // Watch-it-work grid: lazy-attach + autoplay clips as each MacBook nears view.
    (function () {
      var vids = document.querySelectorAll('.watch-video, .demo-video') as NodeListOf<HTMLVideoElement>;
      if (!vids.length) return;
      // Poster as a background behind each screen so a clip never shows pure
      // black while it buffers or if autoplay is deferred.
      vids.forEach(function (v) {
        // Demo cards render their poster through the filtered <video> itself,
        // so the cyan duotone stays uniform — only the device clips need a bg.
        if (v.classList.contains('demo-video')) return;
        var screen = v.parentElement;
        var poster = v.getAttribute('poster');
        if (screen && poster) {
          screen.style.backgroundImage = "url('" + poster + "')";
          screen.style.backgroundSize = 'cover';
          screen.style.backgroundPosition = 'top center';
        }
      });
      if (!('IntersectionObserver' in window)) return;
      function tryPlay(v: any) {
        var p = v.play();
        if (p && p.catch) p.catch(function () { /* deferred; poster stays */ });
      }
      function attachAndPlay(v: any) {
        if (v.dataset.loaded !== '1') {
          // h264 mp4 only — hardware-decoded everywhere, reliable muted autoplay
          // in Safari and Chrome. (VP9/webm-first was the black-screen culprit.)
          if (v.dataset.mp4) {
            var s = document.createElement('source');
            s.src = v.dataset.mp4; s.type = 'video/mp4'; v.appendChild(s);
          }
          v.dataset.loaded = '1';
          // play() called before data is buffered can reject and never retry;
          // play once the clip is actually ready to render.
          v.addEventListener('canplay', function () { tryPlay(v); });
          v.addEventListener('loadeddata', function () { tryPlay(v); });
          v.load();
        }
        tryPlay(v);
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          attachAndPlay(e.target);
          io.unobserve(e.target);
        });
      }, { rootMargin: '300px' });
      vids.forEach(function (v) { io.observe(v); });

      // Battery/Energy-Saver and strict autoplay settings can block muted
      // autoplay entirely. Kick every already-loaded, paused clip on the first
      // user gesture and whenever the tab returns to the foreground — so a
      // single scroll or tap starts them even when the browser refused.
      function resumeLoaded() {
        vids.forEach(function (v) { if (v.dataset.loaded === '1' && v.paused) tryPlay(v); });
      }
      ['pointerdown', 'touchstart', 'scroll', 'keydown', 'wheel'].forEach(function (ev) {
        window.addEventListener(ev, resumeLoaded, { passive: true });
      });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) resumeLoaded();
      });
    })();

  
  }, [])

  return null
}
