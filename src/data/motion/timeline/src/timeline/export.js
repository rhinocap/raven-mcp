// Motion Lab timeline geometry, renderer and web exports. Shares the evaluator's written-value rules, so
// the playground stage and the CSS/WAAPI exports draw the same numbers. UMD: window.MLTimelineExport.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./evaluator.js'))
  else root.MLTimelineExport = factory(root.MLTimeline)
})(typeof self !== 'undefined' ? self : this, function (TL) {
  'use strict'

  const r3 = (v) => TL.round(v, 3)
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  // ---------- geometry ----------
  // Text boxes and outline paths in stage units, from the build-time outlines and the resolved controls.
  function geometry(plan, outlines) {
    const R = plan.resolve
    const out = {}
    for (const [id, tg] of Object.entries(plan.doc.targets)) {
      if (tg.kind !== 'text') continue
      const o = outlines.targets[id]
      const size = R.num(tg.size, `${id} size`)
      const k = size / o.upm
      const H = (o.ascent - o.descent) * k
      const LH = tg.lineHeight !== undefined ? R.num(tg.lineHeight, `${id} line height`) : (o.ascent - o.descent + o.lineGap) * k
      const W = o.width * k
      const boxH = (o.lines - 1) * LH + H
      const pos = tg.position.map((v, i) => R.num(v, `${id} position ${i}`))
      const anchor = (tg.anchor || [0.5, 0.5]).map((v, i) => R.num(v, `${id} anchor ${i}`))
      const origin = (tg.origin || anchor).map((v, i) => R.num(v, `${id} origin ${i}`))
      const bx = pos[0] - anchor[0] * W, by = pos[1] - anchor[1] * boxH
      const parts = o.partList.map((p) => {
        const box = p.lines > 1 || o.split === 'none'
          ? { x: bx, y: by, w: W, h: boxH }
          : { x: bx + k * p.x0, y: by + p.line * LH, w: k * p.adv, h: H }
        const d = p.runs.map((run) => pathD(run.d, bx, by + run.line * LH, k)).join('')
        return { text: p.text, box, d, origin: [box.x + origin[0] * box.w, box.y + origin[1] * box.h] }
      })
      out[id] = { label: o.label, box: { x: bx, y: by, w: W, h: boxH }, parts }
    }
    return out
  }
  function pathD(cmds, ox, oy, k) {
    let s = ''
    let i = 0
    const n = { M: 1, L: 1, Q: 2, C: 3, Z: 0 }
    while (i < cmds.length) {
      const c = cmds[i++]
      s += c
      for (let j = 0; j < n[c]; j++) { s += (j ? ' ' : '') + r3(ox + k * cmds[i]) + ' ' + r3(oy + k * cmds[i + 1]); i += 2 }
    }
    return s
  }
  function boxesOf(geo) {
    const b = {}
    for (const [id, g] of Object.entries(geo)) b[id] = g.parts.map((p) => p.box)
    return b
  }

  // ---------- fragment (element targets) ----------
  // layout.fragment is the sanitised tree from fragment.js; doc.styles holds typed styles by fragment id.
  // Every node is written with classes only (never the raw id), so no fragment id can collide with the page.
  const SANS = 'ui-sans-serif, system-ui, sans-serif', SERIF = 'ui-serif, Georgia, serif'
  const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', between: 'space-between' }
  function hasFragment(plan) { return !!(plan.layout && plan.layout.fragment && plan.layout.fragment.length) }
  const px = (v) => r3(v) + 'px'
  // Typed style object to CSS declarations. Every value was checked by the schema; this only formats.
  function styleDecls(plan, st, node, isPart) {
    const d = []
    const faces = (plan.layout && plan.layout.fontFaces) || {}
    st = st || {}
    if (st.display) d.push(['display', st.display])
    else if (isPart && node.tag === 'span') d.push(['display', 'inline-block'])
    if (st.flexDirection) d.push(['flex-direction', st.flexDirection])
    if (st.flexWrap) d.push(['flex-wrap', st.flexWrap])
    if (st.alignItems) d.push(['align-items', ALIGN[st.alignItems]])
    if (st.justifyContent) d.push(['justify-content', ALIGN[st.justifyContent]])
    if (st.gap !== undefined) d.push(['gap', px(st.gap)])
    if (st.width !== undefined) d.push(['width', px(st.width)])
    if (st.height !== undefined) d.push(['height', px(st.height)])
    if (st.padding !== undefined) { const p = Array.isArray(st.padding) ? st.padding : [st.padding]; d.push(['padding', p.map(px).join(' ')]) }
    if (st.font !== undefined) {
      const f = faces[st.font]
      d.push(['font-family', f ? `"${f.family.replace(/["\\]/g, '')}", ${SANS}` : st.font === 'serif' ? SERIF : SANS])
    }
    if (st.fontSize !== undefined) d.push(['font-size', px(st.fontSize)])
    if (st.fontWeight !== undefined) d.push(['font-weight', String(st.fontWeight)])
    if (st.lineHeight !== undefined) d.push(['line-height', String(r3(st.lineHeight))])
    if (st.letterSpacing !== undefined) d.push(['letter-spacing', px(st.letterSpacing)])
    if (st.textAlign) d.push(['text-align', st.textAlign])
    if (st.color) d.push(['color', st.color.toLowerCase()])
    if (st.background) d.push(['background-color', st.background.toLowerCase()])
    if (st.borderWidth !== undefined) d.push(['border', `${px(st.borderWidth)} solid ${(st.borderColor || '#000000').toLowerCase()}`])
    else if (st.borderColor) d.push(['border', `1px solid ${st.borderColor.toLowerCase()}`])
    if (st.borderRadius !== undefined) d.push(['border-radius', px(st.borderRadius)])
    if (st.overflow) d.push(['overflow', st.overflow])
    if (node.tag === 'img') d.push(['display', st.display || 'block'])
    return d
  }
  // Which target part each fragment node is: Map(node -> [{target, part}]).
  function fragmentParts(plan) {
    const byId = new Map()
    const walk = (list) => { for (const n of list) if (n.tag) { if (n.attrs && n.attrs.id) byId.set(n.attrs.id, n); if (n.children) walk(n.children) } }
    walk(plan.layout.fragment)
    const parts = new Map()
    const add = (n, v) => { if (!parts.has(n)) parts.set(n, []); parts.get(n).push(v) }
    for (const [id, tg] of Object.entries(plan.doc.targets)) {
      if (tg.kind !== 'element') continue
      const node = byId.get(tg.id)
      if (!node) continue
      if ((tg.split || 'none') === 'children') node.children.filter((c) => c.tag).forEach((c, i) => add(c, { target: id, part: i }))
      else add(node, { target: id, part: 0 })
    }
    return parts
  }
  const nodeCls = (plan, n) => (n.attrs && n.attrs.id ? `ml-${plan.doc.id}-n-${n.attrs.id}` : '')
  function nodeClasses(plan, n, parts) {
    const c = []
    const own = nodeCls(plan, n)
    if (own) c.push(own)
    for (const p of parts.get(n) || []) c.push(cls(plan, p.target, p.part))
    return c
  }
  const ATTRS = ['alt', 'aria-label', 'aria-hidden', 'width', 'height']
  // The hover area: the named element target's fragment node, or the stage (null). The exports and the renderer,
  // not the fragment, make it focusable, so keyboard focus plays the hover too.
  function hoverNode(plan) {
    const tr = plan.trigger || TL.triggerOf(plan.doc)
    return tr.on === 'hover' && tr.target ? plan.doc.targets[tr.target].id : null
  }
  function hoverSelector(plan) { const n = hoverNode(plan); return n ? `.ml-${plan.doc.id}-n-${n}` : null }
  const isHover = (plan) => (plan.trigger || TL.triggerOf(plan.doc)).on === 'hover'
  function fragmentHtml(plan) {
    const parts = fragmentParts(plan)
    const hn = hoverNode(plan)
    const out = (list) => list.map((n) => {
      if (!n.tag) return esc(n.text)
      const c = nodeClasses(plan, n, parts)
      let a = c.length ? ` class="${c.join(' ')}"` : ''
      for (const k of ATTRS) if (n.attrs && n.attrs[k] !== undefined) a += ` ${k}="${esc(n.attrs[k])}"`
      if (hn && n.attrs && n.attrs.id === hn) a += ' tabindex="0"'
      if (n.tag === 'img') return `<img${a} src="${esc(n.src)}">`
      return `<${n.tag}${a}>${out(n.children)}</${n.tag}>`
    }).join('')
    return out(plan.layout.fragment)
  }
  // The same tree as DOM, built with createElement and textContent only.
  function fragmentDom(plan, doc) {
    const parts = fragmentParts(plan)
    const hn = hoverNode(plan)
    const frag = doc.createDocumentFragment()
    const build = (list, parent) => {
      for (const n of list) {
        if (!n.tag) { parent.appendChild(doc.createTextNode(n.text)); continue }
        const e = doc.createElement(n.tag)
        const c = nodeClasses(plan, n, parts)
        if (c.length) e.className = c.join(' ')
        for (const k of ATTRS) if (n.attrs && n.attrs[k] !== undefined) e.setAttribute(k, String(n.attrs[k]))
        if (hn && n.attrs && n.attrs.id === hn) e.setAttribute('tabindex', '0')
        if (n.tag === 'img') e.src = n.src
        else build(n.children, e)
        parent.appendChild(e)
      }
    }
    build(plan.layout.fragment, frag)
    return frag
  }
  // Static CSS rules for every styled node: [selector, decls].
  function fragmentRules(plan) {
    const parts = fragmentParts(plan)
    const rules = []
    const walk = (list) => {
      for (const n of list) {
        if (!n.tag) continue
        const own = nodeCls(plan, n)
        const st = n.attrs && n.attrs.id && plan.doc.styles ? plan.doc.styles[n.attrs.id] : undefined
        const d = styleDecls(plan, st, n, parts.has(n))
        if (d.length) rules.push([own ? '.' + own : '.' + nodeClasses(plan, n, parts)[0], d])
        if (n.children) walk(n.children)
      }
    }
    walk(plan.layout.fragment)
    return rules
  }
  // Element target parts in order: [{target, part, origin}] with origin as CSS percentages.
  function elementParts(plan) {
    const out = []
    for (const [id, tg] of Object.entries(plan.doc.targets)) {
      if (tg.kind !== 'element') continue
      const n = plan.layout.targets[id].parts
      const o = (tg.origin || [0.5, 0.5]).map((v, i) => plan.resolve.num(v, `${id} origin ${i}`))
      for (let p = 0; p < n; p++) out.push({ target: id, part: p, origin: `${r3(o[0] * 100)}% ${r3(o[1] * 100)}%` })
    }
    return out
  }
  const fragPos = (plan) => (plan.doc.stage.fragmentPosition || [0, 0]).map((v, i) => plan.resolve.num(v, 'fragment position ' + i))

  // ---------- markup ----------
  const cls = (plan, id, p) => `ml-${plan.doc.id}-${id}-${p}`
  function surfaceId(plan) { return Object.keys(plan.doc.targets).find((id) => plan.doc.targets[id].kind === 'surface') }
  function hasClip(plan, id, p) { return ['clipT', 'clipR', 'clipB', 'clipL'].some((n) => plan.byKey.has(`${id}/${p}/${n}`)) }
  function markup(plan, geo, opts) {
    const W = plan.doc.stage.width, H = plan.doc.stage.height
    const root = `ml-${plan.doc.id}`
    const label = Object.values(geo).map((g) => g.label).join(' ')
    const defs = []
    const groups = []
    for (const [id, g] of Object.entries(geo)) {
      g.parts.forEach((p, i) => {
        const c = cls(plan, id, i)
        let clip = ''
        if (hasClip(plan, id, i)) {
          const b = p.box
          defs.push(`<clipPath id="${c}-clip" clipPathUnits="userSpaceOnUse"><rect class="${c}-clip" x="${r3(b.x)}" y="${r3(b.y)}" width="${r3(b.w)}" height="${r3(b.h)}"/></clipPath>`)
          clip = ` clip-path="url(#${c}-clip)"`
        }
        groups.push(`<g class="${c}"${clip}>${p.d ? `<path d="${p.d}"/>` : ''}</g>`)
      })
    }
    const extra = (opts && opts.attrs ? ' ' + opts.attrs : '') + (isHover(plan) && !hoverNode(plan) ? ' tabindex="0"' : '')
    const svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${groups.join('')}</svg>`
    if (hasFragment(plan)) {
      // Element stages: the fragment is real content, so the stage is not an image and keeps its own roles.
      const inner = opts && opts.fragment === false ? '' : fragmentHtml(plan)
      return `<div class="${root}"${extra}>${svg}<div class="${root}-box"><div class="${root}-frag">${inner}</div></div></div>`
    }
    return `<div class="${root}" role="img" aria-label="${esc(label)}"${extra}>${svg}</div>`
  }

  // ---------- written CSS values ----------
  // A part's static style at one time: every property, as the CSS and WAAPI exports write it.
  function writtenStyle(plan, id, p, st, box) {
    const out = {}
    for (const group of TL.cssGroups(plan, id, p)) {
      if (group.prop === 'clip') continue
      if (group.prop === 'clip-path' && !hasClip(plan, id, p)) continue
      if (group.prop === 'filter' && !plan.byKey.has(`${id}/${p}/blur`)) continue
      out[group.prop] = TL.formatCss(group, TL.writtenVector(group, st, box))
    }
    return out
  }
  const cssDecl = (style) => Object.entries(style).map(([k, v]) => `${k}: ${v};`).join(' ')
  // Offsets carry 10 fraction digits (8 in percent), so a keyframe lands within 3 ns of its time at 60 s.
  const pct = (t, total) => { const s = (t / total * 100).toFixed(8).replace(/\.?0+$/, ''); return (s === '' ? '0' : s) + '%' }

  // ---------- CSS keyframes export ----------
  function cssExport(plan, geo) {
    const T = TL.round(plan.total, 3)
    const root = `ml-${plan.doc.id}`
    const W = plan.doc.stage.width, H = plan.doc.stage.height
    const sampled = TL.sampleExport(plan, boxesOf(geo), 'css')
    // Static styles are the reduced-motion frame; the animations play over them inside the media query.
    const end = TL.evaluate(plan, plan.restTime)
    const lines = []
    const motion = []
    const sid = surfaceId(plan)
    const bgGroup = sid && TL.cssGroups(plan, sid)[0]
    const bgEnd = sid ? TL.formatCss(bgGroup, TL.writtenVector(bgGroup, end.targets[sid][0])) : TL.rgbToHex(TL.hexToRgb(plan.resolve.color(plan.doc.stage.background, 'stage background')))
    if (hasFragment(plan)) {
      // Element stages keep the fragment's own layout, so they are written at their stage size, unscaled.
      const fp = fragPos(plan)
      lines.push(`.${root} { position: relative; width: ${W}px; height: ${H}px; background-color: ${bgEnd}; overflow: hidden; }`)
      lines.push(`.${root} svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }`)
      lines.push(`.${root}-box { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }`)
      lines.push(`.${root}-frag { position: absolute; left: ${r3(fp[0])}px; top: ${r3(fp[1])}px; }`)
      lines.push(`.${root}-frag :where(h1, h2, h3, h4, h5, h6, p) { margin: 0; font-size: inherit; font-weight: inherit; }`)
      for (const [sel, d] of fragmentRules(plan)) lines.push(`${sel} { ${d.map(([k, v]) => `${k}: ${v};`).join(' ')} }`)
      for (const ep of elementParts(plan)) {
        const st = end.targets[ep.target][ep.part]
        const style = Object.assign({ 'transform-origin': ep.origin }, writtenStyle(plan, ep.target, ep.part, st, { x: 0, y: 0, w: 1, h: 1 }))
        lines.push(`.${cls(plan, ep.target, ep.part)} { ${cssDecl(style)} }`)
      }
    } else {
      lines.push(`.${root} { position: relative; width: 100%; max-width: ${W}px; aspect-ratio: ${W} / ${H}; background-color: ${bgEnd}; overflow: hidden; }`)
      lines.push(`.${root} svg { display: block; width: 100%; height: 100%; }`)
    }
    for (const [id, g] of Object.entries(geo)) {
      g.parts.forEach((part, i) => {
        const st = end.targets[id][i]
        const style = Object.assign({ 'transform-box': 'view-box', 'transform-origin': `${r3(part.origin[0])}px ${r3(part.origin[1])}px` }, writtenStyle(plan, id, i, st, part.box))
        lines.push(`.${cls(plan, id, i)} { ${cssDecl(style)} }`)
        if (hasClip(plan, id, i)) {
          const rr = TL.formatCss({ prop: 'clip' }, TL.writtenVector({ prop: 'clip' }, st, part.box))
          lines.push(`.${cls(plan, id, i)}-clip { x: ${rr.x}px; y: ${rr.y}px; width: ${rr.width}px; height: ${rr.height}px; }`)
        }
      })
    }
    // Animations by element.
    const byEl = new Map()
    // Targets can share an element (a card's children and its button). One element gets one animation list,
    // written on its first part class, or the later rule would replace the earlier one's animations.
    const shared = new Map(), first = new Map()
    for (const ep of hasFragment(plan) ? elementParts(plan) : []) {
      const at = plan.layout.targets[ep.target].paths
      if (!at) continue
      const c = `.${cls(plan, ep.target, ep.part)}`
      if (!first.has(at[ep.part])) first.set(at[ep.part], c)
      shared.set(c, first.get(at[ep.part]))
    }
    for (const s of sampled) {
      if (s.constant) continue
      const own = `.${cls(plan, s.target, s.part)}`
      const el = s.group.prop === 'background-color' && !s.group.own ? `.${root}` : s.group.prop === 'clip' ? `${own}-clip` : (shared.get(own) || own)
      const name = `${root}-${s.target}-${s.part}-${s.group.prop}`
      const frames = s.frames.map((f) => {
        const v = TL.formatCss(s.group, f.w)
        const decl = s.group.prop === 'clip' ? `x: ${v.x}px; y: ${v.y}px; width: ${v.width}px; height: ${v.height}px;` : `${s.group.prop}: ${v};`
        return `    ${pct(f.t, plan.total)} { ${decl}${f.step ? ' animation-timing-function: steps(1, jump-end);' : ''} }`
      })
      motion.push(`  @keyframes ${name} {\n${frames.join('\n')}\n  }`)
      if (!byEl.has(el)) byEl.set(el, [])
      byEl.get(el).push(`${name} ${T}ms linear both`)
    }
    const trig = plan.trigger || TL.triggerOf(plan.doc)
    // A hover or scroll motion waits paused at its start; the script below plays it, since CSS alone can't reverse
    // from the middle of an animation.
    const paused = trig.on === 'load' ? '' : ' animation-play-state: paused;'
    for (const [el, anims] of byEl) motion.push(`  ${el} { animation: ${anims.join(', ')};${paused} }`)
    const css = `${lines.join('\n')}\n@media (prefers-reduced-motion: no-preference) {\n${motion.join('\n')}\n}`
    if (trig.on === 'load') return { html: markup(plan, geo), css, sampled, snippet: `<style>\n${css}\n</style>\n${markup(plan, geo)}` }
    const js = `(() => {
  const root = document.querySelector('.${root}');
  const T = ${T};
${triggerControl(plan)}
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let stop = null;
  // The CSS animations wait paused at the start; reduced motion has none and shows the still frame.
  function setup() {
    if (stop) stop();
    stop = null;
    if (preference.matches) return;
    const anims = root.getAnimations({ subtree: true });
    anims.forEach((a) => { a.pause(); a.currentTime = 0; });
    stop = control(anims);
  }
  setup();
  preference.addEventListener('change', setup);
  root.mlCleanup = () => { if (stop) stop(); preference.removeEventListener('change', setup); };
})();`
    return { html: markup(plan, geo), css, js, sampled, snippet: `<style>\n${css}\n</style>\n${markup(plan, geo)}\n<script>\n${js}\n<\/script>` }
  }

  // ---------- triggers ----------
  // control(anims) wires a hover or scroll trigger to a set of animations of length T, all paused at 0, and
  // returns a function that unwires it. It follows TL.triggerClock: enter plays forward from the current time,
  // leave plays back to 0 at the same speed (or, with "finish", changes nothing); scroll plays once the stage is
  // threshold in view, and with once false rewinds to 0 when fully out.
  function triggerControl(plan) {
    const trig = plan.trigger || TL.triggerOf(plan.doc)
    const head = `  function control(anims) {
    const now = () => (anims.length ? Number(anims[0].currentTime) || 0 : 0);
    const run = (rate) => { const t = now(); anims.forEach((a) => { a.playbackRate = rate; a.currentTime = t; a.play(); }); };
    const hold = () => anims.forEach((a) => a.pause());
    const forward = () => { if (now() < T) run(1); };`
    if (trig.on === 'hover') {
      const sel = hoverSelector(plan)
      return `${head}
    // Active while the pointer is over the area or focus is inside it; focus moving inside it changes nothing.
    const area = ${sel ? `root.querySelector(${JSON.stringify(sel)})` : 'root'};
    let pointer = false, focus = false, active = false;
    const sync = () => {
      const on = pointer || focus;
      if (on === active) return;
      active = on;
      if (on) forward();${trig.leave === 'reverse' ? `
      else if (now() > 0) run(-1);
      else hold();` : ''}
    };
    const on = [
      ['pointerenter', () => { pointer = true; sync(); }],
      ['pointerleave', () => { pointer = false; sync(); }],
      ['focusin', () => { focus = true; sync(); }],
      ['focusout', (e) => { focus = area.contains(e.relatedTarget); sync(); }],
    ];
    on.forEach(([type, f]) => area.addEventListener(type, f));
    // Set up again (reduced motion turned off) while already hovered or focused: start from that state.
    pointer = area.matches(':hover');
    focus = area.contains(document.activeElement);
    sync();
    return () => on.forEach(([type, f]) => area.removeEventListener(type, f));
  }`
    }
    return `${head}
    // In view once ${trig.threshold} of the stage shows, or its visible height is ${trig.threshold} of the window's (tall stages).
    // Measured on every scroll and resize, so a slow scroll past a tall stage cannot step over the threshold.
    let fired = false, queued = 0;
    const check = () => {
      queued = 0;
      const r = root.getBoundingClientRect();
      const tall = document.documentElement.clientHeight || innerHeight;
      const wide = document.documentElement.clientWidth || innerWidth;
      const h = Math.max(0, Math.min(r.bottom, tall) - Math.max(r.top, 0));
      const w = Math.max(0, Math.min(r.right, wide) - Math.max(r.left, 0));
      const out = h <= 0 || w <= 0;
      const seen = !out && (h / Math.max(r.height, 1) >= ${trig.threshold} - 1e-3 || h >= ${trig.threshold} * tall - 0.5);
      if (seen && !fired) { fired = true; forward();${trig.once ? ' off();' : ''} }${trig.once ? '' : `
      else if (out && fired) { fired = false; hold(); anims.forEach((a) => { a.currentTime = 0; }); }`}
    };
    const soon = () => { if (!queued) queued = requestAnimationFrame(check); };
    const off = () => { removeEventListener('scroll', soon, true); removeEventListener('resize', soon); if (queued) cancelAnimationFrame(queued); queued = 0; };
    addEventListener('scroll', soon, { capture: true, passive: true });
    addEventListener('resize', soon);
    check();
    return off;
  }`
  }

  // ---------- WAAPI export ----------
  function waapiExport(plan, geo) {
    const T = TL.round(plan.total, 3)
    const root = `ml-${plan.doc.id}`
    const sampled = TL.sampleExport(plan, boxesOf(geo), 'waapi')
    const css = cssExport(plan, geo).css.replace(/\n@media[\s\S]*$/, '')
    const tracks = []
    for (const s of sampled) {
      if (s.constant) continue
      const sel = s.group.prop === 'background-color' && !s.group.own ? '' : s.group.prop === 'clip' ? `.${cls(plan, s.target, s.part)}-clip` : `.${cls(plan, s.target, s.part)}`
      const key = { 'background-color': 'backgroundColor', 'clip-path': 'clipPath' }[s.group.prop] || s.group.prop
      const kf = s.frames.map((f) => {
        const v = TL.formatCss(s.group, f.w)
        const o = { offset: Number((f.t / plan.total).toFixed(10)) }
        if (s.group.prop === 'clip') Object.assign(o, { x: v.x + 'px', y: v.y + 'px', width: v.width + 'px', height: v.height + 'px' })
        else o[key] = v
        return o
      })
      tracks.push(`    [${JSON.stringify(sel)}, ${JSON.stringify(kf)}]`)
    }
    const trig = plan.trigger || TL.triggerOf(plan.doc)
    const js = trig.on !== 'load' ? `(() => {
  const root = document.querySelector('.${root}');
  const T = ${T};
  const tracks = [
${tracks.join(',\n')}
  ];
${triggerControl(plan)}
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let anims = [], stop = null;
  // The static styles show the reduced-motion frame; the animations wait paused at the start and fill both ways.
  function teardown() { if (stop) stop(); stop = null; anims.forEach((a) => a.cancel()); anims = []; }
  function setup() {
    teardown();
    if (preference.matches) return;
    anims = tracks.map(([sel, keyframes]) => {
      const a = (sel ? root.querySelector(sel) : root).animate(keyframes, { duration: T, easing: 'linear', fill: 'both' });
      a.pause();
      a.currentTime = 0;
      return a;
    });
    stop = control(anims);
  }
  setup();
  preference.addEventListener('change', setup);
  root.mlCleanup = () => { teardown(); preference.removeEventListener('change', setup); };
})();` : `(() => {
  const root = document.querySelector('.${root}');
  const tracks = [
${tracks.join(',\n')}
  ];
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let handles = [];
  // The static styles show the reduced-motion frame; animations play over them and fill both ways.
  function play() {
    handles = tracks.map(([sel, keyframes]) => (sel ? root.querySelector(sel) : root).animate(keyframes, { duration: ${T}, easing: 'linear', fill: 'both' }));
  }
  function rest() { handles.forEach((h) => h.cancel()); handles = []; }
  function onChange() { if (preference.matches) rest(); }
  if (!preference.matches) play();
  preference.addEventListener('change', onChange);
  root.mlCleanup = () => { rest(); preference.removeEventListener('change', onChange); };
})();`
    return { html: markup(plan, geo), css, js, sampled, snippet: `<style>\n${css}\n</style>\n${markup(plan, geo)}\n<script>\n${js}\n<\/script>` }
  }

  // ---------- renderer ----------
  // Bind a stage element holding markup(); apply(t) writes one frame with the same written values.
  function mountRenderer(container, plan, geo) {
    const rootEl = container.querySelector(`.ml-${plan.doc.id}`)
    const els = {}
    for (const [id, g] of Object.entries(geo)) {
      els[id] = g.parts.map((part, i) => ({ g: rootEl.querySelector(`.${cls(plan, id, i)}`), clip: rootEl.querySelector(`.${cls(plan, id, i)}-clip`), part }))
      for (const e of els[id]) { e.g.style.transformBox = 'view-box'; e.g.style.transformOrigin = `${r3(e.part.origin[0])}px ${r3(e.part.origin[1])}px` }
    }
    const sid = surfaceId(plan)
    const parts = []
    let resize = null
    if (hasFragment(plan)) {
      const d = rootEl.ownerDocument
      const W = plan.doc.stage.width, H = plan.doc.stage.height, fp = fragPos(plan)
      const svgEl = rootEl.querySelector('svg')
      Object.assign(svgEl.style, { position: 'absolute', inset: '0' })
      Object.assign(rootEl.style, { position: 'relative', overflow: 'hidden' })
      const box = rootEl.querySelector(`.ml-${plan.doc.id}-box`)
      const layer = rootEl.querySelector(`.ml-${plan.doc.id}-frag`)
      Object.assign(box.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', transformOrigin: '0 0' })
      Object.assign(layer.style, { position: 'absolute', left: r3(fp[0]) + 'px', top: r3(fp[1]) + 'px' })
      layer.textContent = ''
      layer.appendChild(fragmentDom(plan, d))
      // A page font is registered under a private name in the playground, so a page that uses the playground's own
      // font (Untitled Sans) cannot replace the controls' type. Exports keep the page's family name.
      const PRIVATE = 'ml-page '
      const embedded = new Set(Object.values((plan.layout && plan.layout.fontFaces) || {}).map((f) => f.family.replace(/["\\]/g, '')))
      const privateFamily = (v) => v.replace(/^"([^"]+)"/, (m, fam) => (embedded.has(fam) ? `"${PRIVATE}${fam}", ${m}` : m))
      // Same reset as the exports: headings and paragraphs take their size and spacing only from styles.
      for (const e of layer.querySelectorAll('h1, h2, h3, h4, h5, h6, p')) { e.style.margin = '0'; e.style.fontSize = 'inherit'; e.style.fontWeight = 'inherit' }
      // Static node styles through the style object, one property at a time; no style string is parsed.
      for (const [sel, decls] of fragmentRules(plan)) {
        const e = layer.querySelector(sel)
        if (e) for (const [k, v] of decls) e.style.setProperty(k, k === 'font-family' ? privateFamily(v) : v)
      }
      for (const ep of elementParts(plan)) {
        const e = layer.querySelector('.' + cls(plan, ep.target, ep.part))
        if (e) { e.style.transformOrigin = ep.origin; parts.push({ e, ...ep }) }
      }
      // The playground scales the stage to its frame; exports show it at its own size.
      const fit = () => { const k = rootEl.clientWidth / W; box.style.transform = k > 0 && Math.abs(k - 1) > 1e-6 ? `scale(${k})` : '' }
      fit()
      if (typeof ResizeObserver === 'function') { resize = new ResizeObserver(fit); resize.observe(rootEl) }
      const faces = (plan.layout && plan.layout.fontFaces) || {}
      if (d.fonts && typeof FontFace === 'function') {
        for (const f of Object.values(faces)) {
          const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))
          const ff = new FontFace(PRIVATE + f.family, bin, { weight: String(f.weight || 400), style: f.style || 'normal' })
          d.fonts.add(ff)
          ff.load().catch(() => {})
        }
      }
    }
    return {
      parts,
      destroy() { if (resize) resize.disconnect() },
      apply(t) {
        const st = TL.evaluate(plan, t)
        if (sid) { const g = TL.cssGroups(plan, sid)[0]; rootEl.style.backgroundColor = TL.formatCss(g, TL.writtenVector(g, st.targets[sid][0])) }
        else rootEl.style.backgroundColor = TL.rgbToHex(TL.hexToRgb(plan.resolve.color(plan.doc.stage.background, 'stage background')))
        for (const [id, list] of Object.entries(els)) {
          list.forEach((e, i) => {
            const s = st.targets[id][i]
            const w = writtenStyle(plan, id, i, s, e.part.box)
            e.g.style.opacity = w.opacity
            e.g.style.transform = w.transform
            e.g.style.fill = w.fill
            if (w.filter) e.g.style.filter = w.filter
            if (e.clip) { const rr = TL.formatCss({ prop: 'clip' }, TL.writtenVector({ prop: 'clip' }, s, e.part.box)); e.clip.setAttribute('x', rr.x); e.clip.setAttribute('y', rr.y); e.clip.setAttribute('width', rr.width); e.clip.setAttribute('height', rr.height) }
          })
        }
        for (const ep of parts) {
          const w = writtenStyle(plan, ep.target, ep.part, st.targets[ep.target][ep.part], { x: 0, y: 0, w: 1, h: 1 })
          ep.e.style.opacity = w.opacity
          ep.e.style.transform = w.transform
          if (w.filter) ep.e.style.filter = w.filter
          if (w['background-color']) ep.e.style.backgroundColor = w['background-color']
          if (w['clip-path']) ep.e.style.clipPath = w['clip-path']
        }
        return st
      },
    }
  }

  return { geometry, boxesOf, markup, cssExport, waapiExport, mountRenderer, writtenStyle, pathD, hasFragment, fragmentHtml, styleDecls, elementParts, hoverSelector }
})
