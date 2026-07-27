'use client'

import { useEffect } from 'react'

export default function HomeScripts() {
  useEffect(() => {

      // Autoplay attribute can't respect prefers-reduced-motion on its own.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.querySelectorAll<HTMLVideoElement>('.pg-demo video').forEach(v => {
          v.removeAttribute('loop')
          v.pause()
        })
      }

      (async () => {
        try {
          const npmMeta = await fetch('https://registry.npmjs.org/raven-mcp').then(r => r.json());
          const v = npmMeta['dist-tags'] && npmMeta['dist-tags'].latest;
          const versionCount = Object.keys(npmMeta.versions || {}).length;
          document.getElementById('rs-ver')!.textContent = v ? `v${v}` : 'v—';
          document.getElementById('rs-rel')!.textContent = String(versionCount);
          // Total installs = all downloads from first publish to today (npm point range).
          const start = (npmMeta.time && npmMeta.time.created || '2026-01-01').slice(0, 10);
          const end = new Date().toISOString().slice(0, 10);
          const npmTotal = await fetch(`https://api.npmjs.org/downloads/point/${start}:${end}/raven-mcp`).then(r => r.json());
          document.getElementById('rs-dl')!.textContent = (npmTotal.downloads || 0).toLocaleString();
        } catch (e) {
          console.warn('raven stats fetch failed', e);
        }
      })();
      


    /* ── Scroll Reveal ── handled site-wide by RevealAndCopy (app/layout.tsx) */

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
