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
    const extra = opts && opts.attrs ? ' ' + opts.attrs : ''
    return `<div class="${root}" role="img" aria-label="${esc(label)}"${extra}><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${groups.join('')}</svg></div>`
  }

  // ---------- written CSS values ----------
  // A part's static style at one time: every property, as the CSS and WAAPI exports write it.
  function writtenStyle(plan, id, p, st, box) {
    const out = {}
    for (const group of TL.cssGroups(plan, id)) {
      if (group.prop === 'clip') continue
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
    lines.push(`.${root} { position: relative; width: 100%; max-width: ${W}px; aspect-ratio: ${W} / ${H}; background-color: ${bgEnd}; overflow: hidden; }`)
    lines.push(`.${root} svg { display: block; width: 100%; height: 100%; }`)
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
    for (const s of sampled) {
      if (s.constant) continue
      const el = s.group.prop === 'background-color' ? `.${root}` : s.group.prop === 'clip' ? `.${cls(plan, s.target, s.part)}-clip` : `.${cls(plan, s.target, s.part)}`
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
    for (const [el, anims] of byEl) motion.push(`  ${el} { animation: ${anims.join(', ')}; }`)
    const css = `${lines.join('\n')}\n@media (prefers-reduced-motion: no-preference) {\n${motion.join('\n')}\n}`
    return { html: markup(plan, geo), css, sampled, snippet: `<style>\n${css}\n</style>\n${markup(plan, geo)}` }
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
      const sel = s.group.prop === 'background-color' ? '' : s.group.prop === 'clip' ? `.${cls(plan, s.target, s.part)}-clip` : `.${cls(plan, s.target, s.part)}`
      const key = s.group.prop === 'background-color' ? 'backgroundColor' : s.group.prop
      const kf = s.frames.map((f) => {
        const v = TL.formatCss(s.group, f.w)
        const o = { offset: Number((f.t / plan.total).toFixed(10)) }
        if (s.group.prop === 'clip') Object.assign(o, { x: v.x + 'px', y: v.y + 'px', width: v.width + 'px', height: v.height + 'px' })
        else o[key] = v
        return o
      })
      tracks.push(`    [${JSON.stringify(sel)}, ${JSON.stringify(kf)}]`)
    }
    const js = `(() => {
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
    return {
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
        return st
      },
    }
  }

  return { geometry, boxesOf, markup, cssExport, waapiExport, mountRenderer, writtenStyle, pathD }
})
