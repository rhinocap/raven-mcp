// Motion Lab runtime for the 911 key jingle. Every function here is self-contained so the
// playground and the exported embed run the same code (copied with Function.prototype.toString).

// uid prefixes the gradient and filter ids so several embeds on one page don't share definitions.
function mlArtwork(uid) {
  uid = uid || 'ml911';
  return ('<defs>' +
    '<linearGradient id="ml911-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef0f3"/><stop offset=".45" stop-color="#a3a9b1"/><stop offset="1" stop-color="#5d626a"/></linearGradient>' +
    '<linearGradient id="ml911-blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9bec5"/><stop offset=".4" stop-color="#f1f3f5"/><stop offset="1" stop-color="#8d939b"/></linearGradient>' +
    '<linearGradient id="ml911-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="ml911-gold" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#ecd79c"/><stop offset=".55" stop-color="#b38d43"/><stop offset="1" stop-color="#6c5121"/></radialGradient>' +
    '<radialGradient id="ml911-btn" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '<filter id="ml911-shadow" x="-40%" y="-20%" width="180%" height="160%"><feDropShadow dx="5" dy="9" stdDeviation="5" flood-color="#000" flood-opacity=".3"/></filter>' +
    '</defs>' +
    '<g data-part="scene" filter="url(#ml911-shadow)">' +
      '<g data-hinge="ring-1-3">' +
        '<circle cx="240" cy="142" r="38" fill="none" stroke="url(#ml911-steel)" stroke-width="6"/>' +
        '<circle cx="240" cy="142" r="35.2" fill="none" stroke="#5d626a" stroke-width="1" class="ml-shade" data-o=".7"/>' +
        '<path d="M207 123 A38 38 0 0 1 236 104.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" class="ml-bevel" data-o=".7"/>' +
        '<g data-hinge="fob-1-4"><g transform="rotate(14 225.8 177.2)">' +
          '<ellipse cx="225.8" cy="186" rx="4" ry="9.5" fill="none" stroke="url(#ml911-steel)" stroke-width="2.6"/>' +
          '<rect x="199" y="192" width="54" height="94" rx="24" class="ml-tint"/>' +
          '<rect x="199" y="192" width="54" height="94" rx="24" fill="url(#ml911-gloss)" class="ml-bevel" data-o="1"/>' +
          '<rect x="201.5" y="194.5" width="49" height="89" rx="21.5" fill="none" stroke="#000" stroke-width="4" class="ml-shade" data-o=".45"/>' +
          '<circle cx="226" cy="200" r="3.6" fill="#0b0b0c" stroke="#4a4a4f" stroke-width=".8"/>' +
          '<circle cx="226" cy="220" r="2.3" fill="#b3261e"/>' +
          '<circle cx="225.3" cy="219.3" r=".8" fill="#fff" class="ml-bevel" data-o=".6"/>' +
          '<circle cx="226" cy="250" r="15.5" fill="none" stroke="#000" stroke-width="1.2" class="ml-shade" data-o=".55"/>' +
          '<circle cx="226" cy="250" r="14" fill="#2a2a2e"/>' +
          '<circle cx="226" cy="250" r="14" fill="url(#ml911-btn)" class="ml-bevel" data-o="1"/>' +
        '</g></g>' +
        '<g data-hinge="key-1-5"><g transform="rotate(-12 254.2 177.2)">' +
          '<ellipse cx="254.2" cy="186" rx="4" ry="9.5" fill="none" stroke="url(#ml911-steel)" stroke-width="2.6"/>' +
          '<path d="M236 204Q236 192 248 192L260 192Q272 192 272 204L275 254Q275 268 261 268L247 268Q233 268 233 254Z" class="ml-tint"/>' +
          '<path d="M236 204Q236 192 248 192L260 192Q272 192 272 204L275 254Q275 268 261 268L247 268Q233 268 233 254Z" fill="url(#ml911-gloss)" class="ml-bevel" data-o="1"/>' +
          '<circle cx="254" cy="200" r="3.6" fill="#0b0b0c" stroke="#4a4a4f" stroke-width=".8"/>' +
          '<circle cx="254" cy="232" r="12" fill="url(#ml911-gold)"/>' +
          '<circle cx="254" cy="232" r="9" fill="none" stroke="#6b4f1d" stroke-width=".8"/>' +
          '<path d="M246 227A9 9 0 0 1 254 223" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" class="ml-bevel" data-o=".7"/>' +
          '<rect x="244" y="266" width="20" height="8" rx="2" fill="url(#ml911-steel)"/>' +
          '<path d="M248 274L261 274L261 286L258 290L261 296L261 306L257 311L261 318L261 330L258 334L261 340L261 362L254 372L248 366Z" fill="url(#ml911-blade)" stroke="#7c828b" stroke-width=".6"/>' +
          '<path d="M252 280L252 360" stroke="#7c828b" stroke-width="1.2"/>' +
          '<path d="M249.4 278L249.4 362" stroke="#fff" stroke-width=".9" class="ml-bevel" data-o=".6"/>' +
        '</g></g>' +
      '</g>' +
      '<circle cx="240" cy="100" r="6" fill="#55595f"/>' +
      '<circle cx="238.4" cy="98.4" r="2" fill="#fff" class="ml-bevel" data-o=".55"/>' +
    '</g>' +
    '<rect data-part="hit" x="166" y="86" width="148" height="300" fill="transparent" style="cursor:pointer"/>').replace(/ml911-/g, uid + '-');
}

function mlApplyLook(svg, P) {
  svg.querySelectorAll('.ml-tint').forEach(function (el) { el.setAttribute('fill', P.fobColor); });
  svg.querySelectorAll('.ml-bevel').forEach(function (el) {
    el.setAttribute('opacity', Math.min(1, Number(el.getAttribute('data-o')) * P.bevelLight / 100).toFixed(3));
  });
  svg.querySelectorAll('.ml-shade').forEach(function (el) {
    el.setAttribute('opacity', Math.min(1, Number(el.getAttribute('data-o')) * P.innerShade / 100).toFixed(3));
  });
  var drop = svg.querySelector('feDropShadow');
  if (drop) drop.setAttribute('flood-opacity', Math.min(1, 0.3 * P.dropShadow / 100).toFixed(3));
}

// Chained damped pendulums. Angles in degrees, fixed 240 Hz steps so a given event history
// always produces the same frame.
function mlJingle(svg, P, opts) {
  opts = opts || {};
  var H = 1 / 240;
  var bodies = {
    ring: { el: svg.querySelector('[data-hinge="ring-1-3"]'), px: 240, py: 100, cap: 8 },
    fob: { el: svg.querySelector('[data-hinge="fob-1-4"]'), px: 225.8, py: 177.2, cap: 35 },
    key: { el: svg.querySelector('[data-hinge="key-1-5"]'), px: 254.2, py: 177.2, cap: 35 }
  };
  var names = ['ring', 'fob', 'key'];
  var t = 0, acc = 0, last = 0, raf = 0, queue = [], gains = {};
  names.forEach(function (n) { bodies[n].th = 0; bodies[n].om = 0; bodies[n].since = Infinity; });

  function coeffs(n) {
    var period = n === 'ring' ? P.fobPeriod * 0.8 : n === 'fob' ? P.fobPeriod : P.keyPeriod;
    var settle = P.settleTime / 1000;
    return { w0: 2 * Math.PI / (period / 1000), beta: (P.swingFeel === 'firm' ? 8 : 5) / settle, settle: settle };
  }
  // Peak angle reached from rest by a unit velocity kick, measured with the same integrator.
  function gain(c) {
    var k = c.w0.toFixed(5) + '|' + c.beta.toFixed(5);
    if (gains[k]) return gains[k];
    var th = 0, om = 1, peak = 0;
    for (var i = 0; i < 240 * 3; i++) {
      om += (-c.w0 * c.w0 * th - 2 * c.beta * om) * H;
      th += om * H;
      if (th > peak) peak = th;
      if (om <= 0 && th > 0) break;
    }
    return (gains[k] = peak > 1e-9 ? peak : 1e-9);
  }
  function kick(n, amp, dir) {
    var b = bodies[n], c = coeffs(n);
    b.om += dir * Math.min(amp, b.cap) / gain(c);
    b.since = 0;
  }
  function fade(b, c) {
    if (b.since === Infinity) return 0;
    var edge = 0.9 * c.settle;
    return b.since < edge ? 1 : Math.max(0, (c.settle - b.since) / (0.1 * c.settle));
  }
  function step() {
    for (var q = queue.length - 1; q >= 0; q--) {
      if (queue[q].at <= t) { kick(queue[q].n, queue[q].amp, queue[q].dir); queue.splice(q, 1); }
    }
    names.forEach(function (n) {
      var b = bodies[n];
      if (b.since === Infinity) return;
      var c = coeffs(n);
      b.om += (-c.w0 * c.w0 * b.th - 2 * c.beta * b.om) * H;
      b.th += b.om * H;
      if (Math.abs(b.th) > b.cap) { b.th = Math.sign(b.th) * b.cap; if (b.om * b.th > 0) b.om = 0; }
      b.since += H;
      if (b.since >= c.settle) { b.th = 0; b.om = 0; b.since = Infinity; }
    });
    t += H;
  }
  function render() {
    names.forEach(function (n) {
      var b = bodies[n], a = b.th * fade(b, coeffs(n));
      b.el.setAttribute('transform', 'rotate(' + a.toFixed(3) + ' ' + b.px + ' ' + b.py + ')');
    });
  }
  function active() {
    return queue.length > 0 || names.some(function (n) { return bodies[n].since !== Infinity; });
  }
  function loop(now) {
    if (opts.allowMotion && !opts.allowMotion()) { raf = 0; stop(); return; }
    var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now; acc += dt;
    while (acc >= H) { step(); acc -= H; }
    render();
    if (active()) raf = requestAnimationFrame(loop); else { raf = 0; last = 0; acc = 0; }
  }
  function trigger(kind, dir) {
    if (opts.allowMotion && !opts.allowMotion()) return false;
    var m = kind === 'click' ? P.clickStrength : 1;
    dir = dir < 0 ? -1 : 1;
    kick('ring', P.ringAngle * m, dir);
    kick('fob', P.hoverAngle * m, dir);
    queue.push({ at: t + P.keyDelay / 1000, n: 'key', amp: P.hoverAngle * m, dir: dir });
    if (!raf) raf = requestAnimationFrame(loop);
    return true;
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0; acc = 0; queue = [];
    names.forEach(function (n) { bodies[n].th = 0; bodies[n].om = 0; bodies[n].since = Infinity; });
    render();
  }
  function setParams(next) { P = next; gains = {}; }
  // Advance without a display: used to check a replay lands on the same frame.
  function advance(seconds) { var n = Math.round(seconds / H); for (var i = 0; i < n; i++) step(); render(); }
  function angles() {
    var o = {};
    names.forEach(function (n) { o[n] = bodies[n].th * fade(bodies[n], coeffs(n)); });
    return o;
  }

  var hit = svg.querySelector('[data-part="hit"]');
  var lastX = null, lastT = 0, lastKick = -1;
  hit.addEventListener('pointerenter', function (e) {
    if (e.pointerType === 'touch') return;
    lastX = e.clientX; lastT = e.timeStamp;
    var r = hit.getBoundingClientRect();
    if (trigger('hover', e.clientX < r.left + r.width / 2 ? -1 : 1)) lastKick = e.timeStamp;
  });
  hit.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch' || lastX === null) return;
    var dx = e.clientX - lastX, dtm = Math.max(1, e.timeStamp - lastT);
    lastX = e.clientX; lastT = e.timeStamp;
    if (Math.abs(dx) / dtm > 0.6 && e.timeStamp - lastKick > 350) {
      if (trigger('hover', dx > 0 ? -1 : 1)) lastKick = e.timeStamp;
    }
  });
  hit.addEventListener('pointerleave', function () { lastX = null; });
  hit.addEventListener('click', function (e) {
    var r = hit.getBoundingClientRect();
    trigger('click', e.clientX < r.left + r.width / 2 ? -1 : 1);
  });
  // Keyboard: Enter or Space for a click, arrow keys for a hover swing.
  svg.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger('click', 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); trigger('hover', e.key === 'ArrowLeft' ? 1 : -1); }
  });

  render();
  return { trigger: trigger, stop: stop, setParams: setParams, advance: advance, angles: angles, active: active };
}
