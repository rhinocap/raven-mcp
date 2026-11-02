// Motion Lab timeline evaluator: the only implementation of timing (docs/Motion Lab — Timeline Spec.md).
// Pure: no DOM. Node loads it with require(); the playground inlines it and reads window.MLTimeline.
// compile(doc, layout, values) resolves params and builds per-channel segments once; evaluate(plan, t) reads them.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.MLTimeline = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  const MAX_MS = 60000
  const MAX_CHECK_POINTS = 2000000
  const EPS_T = 1e-9

  class TimelineError extends Error {
    constructor(code, message, context) { super(message); this.name = 'TimelineError'; this.code = code; this.context = context || {} }
  }

  // ---------- properties and channels ----------
  // Each property writes one or more channels. Limits are the numeric parity limits in the property table.
  const PROPS = {
    opacity: { channels: ['opacity'], kind: 'number', range: [0, 1] },
    translateX: { channels: ['tx'], kind: 'number' },
    translateY: { channels: ['ty'], kind: 'number' },
    scale: { channels: ['sx', 'sy'], kind: 'number' },
    scaleX: { channels: ['sx'], kind: 'number' },
    scaleY: { channels: ['sy'], kind: 'number' },
    rotate: { channels: ['r'], kind: 'number' },
    color: { channels: ['cr', 'cg', 'cb'], kind: 'color' },
    background: { channels: ['br', 'bg', 'bb'], kind: 'color' },
    clip: { channels: ['clipT', 'clipR', 'clipB', 'clipL'], kind: 'clip', range: [0, 1] },
    blur: { channels: ['blur'], kind: 'number', range: [0, 40] },
    fill: { channels: [], kind: 'color' },
    stroke: { channels: [], kind: 'color' },
    draw: { channels: [], kind: 'number', range: [0, 1] },
  }
  const CHANNEL = {
    opacity: { limit: 0.005, clamp: [0, 1], base: 1 },
    tx: { limit: 0.5, base: 0 }, ty: { limit: 0.5, base: 0 },
    sx: { limit: 0.001, base: 1 }, sy: { limit: 0.001, base: 1 },
    r: { limit: 0.15, base: 0 },
    cr: { limit: 1, clamp: [0, 255], color: true }, cg: { limit: 1, clamp: [0, 255], color: true }, cb: { limit: 1, clamp: [0, 255], color: true },
    br: { limit: 1, clamp: [0, 255], color: true }, bg: { limit: 1, clamp: [0, 255], color: true }, bb: { limit: 1, clamp: [0, 255], color: true },
    clipT: { limit: 0.002, clamp: [0, 1], base: 0 }, clipR: { limit: 0.002, clamp: [0, 1], base: 0 },
    clipB: { limit: 0.002, clamp: [0, 1], base: 0 }, clipL: { limit: 0.002, clamp: [0, 1], base: 0 },
    blur: { limit: 0.25, clamp: [0, 40], base: 0 },
  }
  // Which properties each target kind can take in phases 1 and 2.
  const KIND_PROPS = {
    text: ['opacity', 'translateX', 'translateY', 'scale', 'scaleX', 'scaleY', 'rotate', 'color', 'clip', 'blur'],
    surface: ['background'],
  }
  const NAMED = { linear: [0, 0, 1, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] }

  // ---------- small helpers ----------
  const isBind = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.param === 'string'
  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const hex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  const rgbToHex = (c) => '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2])
  const round = (v, d) => { const f = Math.pow(10, d); const r = Math.round(v * f) / f; return r === 0 ? 0 : r }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

  // ---------- cubic bezier ----------
  const bx = (s, x1, x2) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s
  const d1 = (s, a1, a2) => 3 * ((1 - s) * (1 - s) * a1 + 2 * (1 - s) * s * (a2 - a1) + s * s * (1 - a2))
  const d2 = (s, a1, a2) => 6 * (-(1 - s) * a1 + (1 - 2 * s) * (a2 - a1) + s * (1 - a2))
  const d3 = (a1, a2) => 6 * (3 * a1 - 3 * a2 + 1)
  // Curve parameter s at progress x. x(s) is monotone for x1, x2 in 0..1: Newton with a bisection bracket.
  function bezierS(p, x) {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0, hi = 1, s = x
    for (let i = 0; i < 60; i++) {
      const f = bx(s, p[0], p[2]) - x
      if (Math.abs(f) < 1e-14) return s
      if (f > 0) hi = s; else lo = s
      const df = d1(s, p[0], p[2])
      let n = df > 1e-12 ? s - f / df : NaN
      if (!(n > lo && n < hi)) n = (lo + hi) / 2
      s = n
    }
    return s
  }
  const bezierY = (p, x) => bx(bezierS(p, x), p[1], p[3])
  // dy/dx at curve parameter s, with the ordered derivative limit (spec: Easing and springs, cut velocity).
  function bezierSlope(p, s) {
    const tol = 1e-12
    const pairs = [[d1(s, p[0], p[2]), d1(s, p[1], p[3])], [d2(s, p[0], p[2]), d2(s, p[1], p[3])], [d3(p[0], p[2]), d3(p[1], p[3])]]
    for (const [dx, dy] of pairs) {
      if (Math.abs(dx) > tol) return dy / dx
      if (Math.abs(dy) > tol) return Infinity
    }
    return 1
  }
  // Curve parameters where y'(s) = 0, inside (0, 1).
  function bezierTurns(p) {
    const y1 = p[1], y2 = p[3]
    const A = 3 * y1 - 3 * y2 + 1, B = 2 * y2 - 4 * y1, C = y1
    const out = []
    if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) out.push(-C / B) }
    else {
      const disc = B * B - 4 * A * C
      if (disc >= 0) { const r = Math.sqrt(disc); out.push((-B - r) / (2 * A), (-B + r) / (2 * A)) }
    }
    return out.filter((s) => s > 0 && s < 1)
  }

  // ---------- spring (SwiftUI model, spec v0.16) ----------
  // omega0 = 2pi / d; zeta = 1 - b for b >= 0, 1 / (1 + b) for b < 0. y is the displacement from the target.
  function springCoef(dSec, bounce, y0, v0) {
    const w = 2 * Math.PI / dSec
    const z = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce)
    if (Math.abs(1 - z) < 1e-6) return { mode: 'critical', w, A: y0, B: v0 + w * y0 }
    if (z < 1) { const wd = w * Math.sqrt(1 - z * z); return { mode: 'under', w, a: z * w, wd, A: y0, B: (v0 + z * w * y0) / wd } }
    const q = w * Math.sqrt(z * z - 1)
    const r1 = -z * w + q, r2 = -z * w - q
    const c2 = (v0 - r1 * y0) / (r2 - r1)
    return { mode: 'over', r1, r2, c1: y0 - c2, c2 }
  }
  function springY(c, t) {
    if (c.mode === 'under') return Math.exp(-c.a * t) * (c.A * Math.cos(c.wd * t) + c.B * Math.sin(c.wd * t))
    if (c.mode === 'critical') return (c.A + c.B * t) * Math.exp(-c.w * t)
    return c.c1 * Math.exp(c.r1 * t) + c.c2 * Math.exp(c.r2 * t)
  }
  function springV(c, t) {
    if (c.mode === 'under') {
      const P = -c.a * c.A + c.B * c.wd, Q = -c.a * c.B - c.A * c.wd
      return Math.exp(-c.a * t) * (P * Math.cos(c.wd * t) + Q * Math.sin(c.wd * t))
    }
    if (c.mode === 'critical') return Math.exp(-c.w * t) * (c.B - c.w * (c.A + c.B * t))
    return c.c1 * c.r1 * Math.exp(c.r1 * t) + c.c2 * c.r2 * Math.exp(c.r2 * t)
  }
  // Zero-velocity times in (0, tMax), seconds, in closed form.
  function springTurns(c, tMax) {
    const out = []
    if (c.mode === 'under') {
      const P = -c.a * c.A + c.B * c.wd, Q = -c.a * c.B - c.A * c.wd
      if (P === 0 && Q === 0) return out
      let th = Math.atan2(-P, Q) % Math.PI
      if (th < 0) th += Math.PI
      for (let k = 0; ; k++) {
        const t = (th + k * Math.PI) / c.wd
        if (t >= tMax) break
        if (t > 0) out.push(t)
        if (out.length > 100000) break
      }
    } else if (c.mode === 'critical') {
      if (c.B !== 0) { const t = (c.B - c.w * c.A) / (c.w * c.B); if (t > 0 && t < tMax) out.push(t) }
    } else if (c.c1 !== 0 && c.c2 !== 0) {
      const arg = -c.c2 * c.r2 / (c.c1 * c.r1)
      if (arg > 0) { const t = Math.log(arg) / (c.r1 - c.r2); if (t > 0 && t < tMax) out.push(t) }
    }
    return out
  }

  // ---------- easing values ----------
  // An enum option value is a curve name, "cubic-bezier(x1, y1, x2, y2)" or "spring(durationMs, bounce)";
  // a curve control value is { kind: 'bezier', points } or { kind: 'spring', duration, bounce }.
  function parseEasingString(s) {
    if (Object.prototype.hasOwnProperty.call(NAMED, s)) return { type: 'bezier', p: NAMED[s].slice() }
    let m = /^cubic-bezier\(\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*\)$/.exec(s)
    if (m) return { type: 'bezier', p: m.slice(1, 5).map(Number) }
    m = /^spring\(\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*\)$/.exec(s)
    if (m) return { type: 'spring', duration: Number(m[1]), bounce: Number(m[2]) }
    return null
  }
  function easingFromValue(v) {
    if (typeof v === 'string') return parseEasingString(v)
    if (v && v.kind === 'bezier' && Array.isArray(v.points)) return { type: 'bezier', p: v.points.slice() }
    if (v && v.kind === 'spring') return { type: 'spring', duration: v.duration, bounce: v.bounce }
    return null
  }
  // A curve control value (playground schemaVersion 2): bezier x in 0–1, y in −1–2; spring duration 10 ms to
  // MAX_MS, bounce −0.9–0.9; no other keys. kinds, when given, lists the kinds the control offers.
  function curveValueOk(v, kinds) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    if (kinds && !kinds.includes(v.kind)) return false
    const fin = Number.isFinite
    if (v.kind === 'bezier') {
      const p = v.points
      return Object.keys(v).length === 2 && Array.isArray(p) && p.length === 4 && p.every(fin) &&
        p[0] >= 0 && p[0] <= 1 && p[2] >= 0 && p[2] <= 1 && p[1] >= -1 && p[1] <= 2 && p[3] >= -1 && p[3] <= 2
    }
    if (v.kind === 'spring') {
      return Object.keys(v).length === 3 && fin(v.duration) && v.duration >= 10 && v.duration <= MAX_MS &&
        fin(v.bounce) && v.bounce >= -0.9 && v.bounce <= 0.9
    }
    return false
  }
  // Curve values compare by content, in a fixed key order.
  function curveKey(v) { return v.kind === 'bezier' ? 'b:' + v.points.join(',') : 's:' + v.duration + ',' + v.bounce }
  function checkEasing(e, where) {
    if (!e) throw new TimelineError('easing', `${where}: easing is not a curve or a spring`, { where })
    if (e.type === 'bezier') {
      if (e.p.length !== 4 || !e.p.every(Number.isFinite)) throw new TimelineError('easing', `${where}: a curve needs four finite numbers`, { where })
      if (e.p[0] < 0 || e.p[0] > 1 || e.p[2] < 0 || e.p[2] > 1) throw new TimelineError('easing', `${where}: curve x values must be 0 to 1`, { where })
    } else {
      if (!Number.isFinite(e.duration) || e.duration < 10) throw new TimelineError('spring-duration', `${where}: spring duration must be at least 10 ms`, { where })
      if (!Number.isFinite(e.bounce) || e.bounce < -0.9 || e.bounce > 0.9) throw new TimelineError('bounce', `${where}: bounce must be -0.9 to 0.9`, { where })
    }
    return e
  }

  // ---------- binding ----------
  function paramMap(doc) { const m = new Map(); for (const p of doc.params || []) m.set(p.id, p); return m }
  function labelOf(doc, v, fallback) {
    if (isBind(v)) { const p = paramMap(doc).get(v.param); if (p) return p.label }
    return fallback
  }
  function makeResolver(doc, values) {
    const params = paramMap(doc)
    const valueOf = (id) => {
      if (values && Object.prototype.hasOwnProperty.call(values, id)) return values[id]
      const p = params.get(id)
      if (!p) throw new TimelineError('unknown-param', `unknown control "${id}"`, { param: id })
      return p.default
    }
    return {
      num(v, where) {
        if (typeof v === 'number') return v
        if (isBind(v)) {
          const x = valueOf(v.param)
          if (typeof x !== 'number') throw new TimelineError('bind-type', `${where}: control "${v.param}" is not a number`, { where, param: v.param })
          return x * (v.times ?? 1) + (v.plus ?? 0)
        }
        throw new TimelineError('bind-type', `${where}: expected a number`, { where })
      },
      color(v, where) {
        const x = isBind(v) ? valueOf(v.param) : v
        if (typeof x !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x)) throw new TimelineError('bind-type', `${where}: expected a #rrggbb colour`, { where })
        return x
      },
      easing(v, where) {
        if (isBind(v)) return checkEasing(easingFromValue(valueOf(v.param)), where)
        if (typeof v === 'string') return checkEasing(parseEasingString(v), where)
        if (v && v.cubicBezier) return checkEasing({ type: 'bezier', p: v.cubicBezier.slice() }, where)
        if (v && v.spring) return checkEasing({ type: 'spring', duration: this.num(v.spring.duration, where + ' spring duration'), bounce: this.num(v.spring.bounce, where + ' bounce') }, where)
        throw new TimelineError('easing', `${where}: unknown easing`, { where })
      },
    }
  }

  // Every bound location with its destination, for the validator's range checks and the unused-param rule.
  function walkBindings(doc) {
    const out = []
    const add = (v, dest, where) => { if (isBind(v)) out.push({ param: v.param, bind: v, dest, where }) }
    add(doc.stage?.background, 'color', 'stage background')
    for (const [i, xy] of (doc.stage?.artworkPosition || []).entries()) add(xy, 'number', `stage artwork position ${i}`)
    for (const [id, t] of Object.entries(doc.targets || {})) {
      add(t.size, 'size', `${id} size`)
      add(t.color, 'color', `${id} colour`)
      add(t.lineHeight, 'size', `${id} line height`)
      for (const k of ['position', 'anchor', 'origin']) for (const [i, xy] of (t[k] || []).entries()) add(xy, 'number', `${id} ${k} ${i}`)
    }
    for (const ph of doc.phases || []) add(ph.duration, 'time', `${ph.label} length`)
    for (const [i, tr] of (doc.tracks || []).entries()) {
      const w = `track ${i + 1} (${tr.target} ${tr.property})`
      const prop = PROPS[tr.property] || { kind: 'number' }
      const valueDest = prop.kind === 'color' ? 'color' : prop.range ? `range:${prop.range[0]}:${prop.range[1]}` : 'number'
      for (const k of ['from', 'to']) {
        const v = tr[k]
        if (prop.kind === 'clip' && v && typeof v === 'object' && !isBind(v)) for (const e of ['top', 'right', 'bottom', 'left']) add(v[e], 'range:0:1', `${w} ${k} ${e}`)
        else add(v, valueDest, `${w} ${k}`)
      }
      if (tr.duration !== 'phase') add(tr.duration, 'time', `${w} duration`)
      add(tr.delay, 'time', `${w} delay`)
      add(tr.stagger?.each, 'time', `${w} stagger`)
      if (isBind(tr.easing)) add(tr.easing, 'easing', `${w} easing`)
      else if (tr.easing && tr.easing.spring) {
        add(tr.easing.spring.duration, 'spring-duration', `${w} spring duration`)
        add(tr.easing.spring.bounce, 'bounce', `${w} bounce`)
      }
    }
    return out
  }

  // The timeline with every binding replaced by its value and no controls left (no groups, params, presets or
  // constraints): the "timeline JSON" export. It compiles to the same plan as doc with values.
  function resolveTimeline(doc, values) {
    const params = paramMap(doc)
    const valueOf = (id) => (values && Object.prototype.hasOwnProperty.call(values, id) ? values[id] : params.get(id).default)
    const fix = (v) => {
      if (isBind(v)) {
        const x = valueOf(v.param)
        if (typeof x === 'number') return x * (v.times ?? 1) + (v.plus ?? 0)
        if (x && x.kind === 'bezier') return { cubicBezier: x.points.slice() }
        if (x && x.kind === 'spring') return { spring: { duration: x.duration, bounce: x.bounce } }
        return x
      }
      if (Array.isArray(v)) return v.map(fix)
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = fix(v[k]); return o }
      return v
    }
    const out = {}
    for (const k of Object.keys(doc)) if (!['groups', 'params', 'presets', 'constraints'].includes(k)) out[k] = fix(doc[k])
    return out
  }

  // ---------- stagger ranks ----------
  function ranksFor(order, n, perm) {
    const r = new Array(n)
    if (order === 'reverse') for (let i = 0; i < n; i++) r[i] = n - 1 - i
    else if (order === 'center') {
      const c = (n - 1) / 2
      let min = Infinity
      for (let i = 0; i < n; i++) min = Math.min(min, Math.abs(i - c))
      for (let i = 0; i < n; i++) r[i] = Math.abs(i - c) - min
    } else if (order === 'random') for (let k = 0; k < n; k++) r[perm[k]] = k
    else for (let i = 0; i < n; i++) r[i] = i
    return r
  }
  function randomPerms(doc, partCount) {
    const ids = Object.keys(doc.targets).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    const rnd = mulberry32(doc.seed || 0)
    const perms = {}
    for (const id of ids) {
      if (!(doc.tracks || []).some((t) => t.target === id && t.stagger && t.stagger.order === 'random')) continue
      const n = partCount(id)
      const a = Array.from({ length: n }, (_, i) => i)
      for (let i = n - 1; i >= 1; i--) { const j = Math.floor(rnd() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x }
      perms[id] = a
    }
    return perms
  }

  // ---------- compile ----------
  // layout: { targets: { id: { parts: n } } } from the outliner (text) or 1 part (surface).
  function compile(doc, layout, values) {
    const R = makeResolver(doc, values)
    const warnings = []
    const targets = doc.targets || {}
    for (const [id, t] of Object.entries(targets)) {
      if (t.kind === 'svg' || t.kind === 'element') throw new TimelineError('phase3', `target "${id}" is ${t.kind === 'svg' ? 'an svg' : 'an element'} target; those arrive in phase 3`, { target: id })
      if (t.kind === 'surface' && (t.role || 'stage') !== 'stage') throw new TimelineError('phase3', `target "${id}" is a ${t.role} surface; page transitions arrive in phase 3`, { target: id })
    }
    const partCount = (id) => (targets[id] && targets[id].kind === 'text' ? (layout?.targets?.[id]?.parts ?? 1) : 1)
    const perms = randomPerms(doc, partCount)

    const tracks = (doc.tracks || []).map((tr, i) => {
      const where = `track ${i + 1} (${tr.target} ${tr.property})`
      const target = targets[tr.target]
      if (!target) throw new TimelineError('unknown-target', `${where}: no target "${tr.target}"`, { track: i })
      const prop = PROPS[tr.property]
      if (!prop || !(KIND_PROPS[target.kind] || []).includes(tr.property)) {
        const later = ['fill', 'stroke', 'draw'].includes(tr.property)
        throw new TimelineError('property', `${where}: ${tr.property} does not apply to a ${target.kind} target${later ? ' (svg targets only, phase 3)' : ''}`, { track: i })
      }
      const n = partCount(tr.target)
      const each = tr.stagger ? R.num(tr.stagger.each, where + ' stagger') : 0
      if (tr.stagger && !(target.kind === 'text' && (target.split || 'none') !== 'none')) throw new TimelineError('stagger', `${where}: stagger needs a split text target`, { track: i })
      if (!(Number.isFinite(each) && each >= 0 && each <= MAX_MS)) throw new TimelineError('time', `${where}: stagger must be 0 to ${MAX_MS} ms`, { track: i })
      const ranks = ranksFor(tr.stagger?.order || 'forward', n, perms[tr.target])
      const delay = tr.delay === undefined ? 0 : R.num(tr.delay, where + ' delay')
      if (!(Number.isFinite(delay) && delay >= 0 && delay <= MAX_MS)) throw new TimelineError('time', `${where}: delay must be 0 to ${MAX_MS} ms`, { track: i })
      const dur = tr.duration === 'phase' ? 'phase' : R.num(tr.duration, where + ' duration')
      if (dur !== 'phase' && !(Number.isFinite(dur) && dur >= 0 && dur <= MAX_MS)) throw new TimelineError('time', `${where}: duration must be 0 to ${MAX_MS} ms`, { track: i })
      if (dur === 'phase' && tr.stagger) throw new TimelineError('phase-stagger', `${where}: a track that runs to its section's end cannot have a stagger`, { track: i })
      const easing = R.easing(tr.easing, where)
      const val = (v, k) => {
        if (v === undefined) return undefined
        if (prop.kind === 'color') return hexToRgb(R.color(v, `${where} ${k}`))
        if (prop.kind === 'clip') {
          if (isBind(v) || typeof v !== 'object') throw new TimelineError('bind-type', `${where} ${k}: clip needs top, right, bottom and left`, { track: i })
          return ['top', 'right', 'bottom', 'left'].map((e) => R.num(v[e], `${where} ${k} ${e}`))
        }
        const x = R.num(v, `${where} ${k}`)
        if (!Number.isFinite(x)) throw new TimelineError('value', `${where} ${k}: not a finite number`, { track: i })
        return prop.channels.map(() => x)
      }
      const maxRank = n ? Math.max(...ranks) : 0
      return { i, tr, where, target: tr.target, prop, n, ranks, maxRank, each, delay, dur, easing, from: val(tr.from, 'from'), to: val(tr.to, 'to') }
    })

    // Phases: fixed lengths, then auto lengths from their explicit-duration tracks.
    const phaseIds = new Set()
    const phases = (doc.phases || []).map((ph) => {
      if (phaseIds.has(ph.id)) throw new TimelineError('phase', `section "${ph.label}" is declared twice`, { phase: ph.id })
      phaseIds.add(ph.id)
      const fixed = ph.duration !== 'auto'
      let len
      if (fixed) {
        len = R.num(ph.duration, `${ph.label} length`)
        if (!(Number.isFinite(len) && len >= 0 && len <= MAX_MS)) throw new TimelineError('time', `${ph.label} must be 0 to ${MAX_MS} ms long`, { phase: ph.id })
      } else {
        const own = tracks.filter((t) => t.tr.phase === ph.id && t.dur !== 'phase')
        if (!own.length) throw new TimelineError('auto-empty', `"${ph.label}" fits its length to its tracks but none has a set duration`, { phase: ph.id })
        len = Math.max(...own.map((t) => t.delay + t.dur + t.each * t.maxRank))
        if (len > MAX_MS) throw new TimelineError('time', `"${ph.label}" would run ${Math.round(len)} ms; at most ${MAX_MS}`, { phase: ph.id })
      }
      return { id: ph.id, label: ph.label, fixed, len, bind: ph.duration }
    })
    let t = 0
    for (const ph of phases) { ph.start = t; t += ph.len; ph.end = t }
    const total = t
    if (total > MAX_MS) throw new TimelineError('time', `the timeline runs ${Math.round(total)} ms; at most ${MAX_MS}`, {})
    if (!(total > 0)) throw new TimelineError('time', 'the timeline has no length', {})
    const phaseById = new Map(phases.map((p) => [p.id, p]))
    // Reduced motion shows the frame at the end of restPhase (default: the final frame).
    if (doc.restPhase !== undefined && !phaseById.has(doc.restPhase)) throw new TimelineError('unknown-phase', `the reduced-motion frame names no section "${doc.restPhase}"`, {})
    const restTime = doc.restPhase !== undefined ? phaseById.get(doc.restPhase).end : total

    // Segments per channel. A channel key is target/part/channel.
    const channels = new Map()
    const chan = (target, part, name) => {
      const key = `${target}/${part}/${name}`
      let c = channels.get(key)
      if (!c) { c = { key, target, part, name, limit: CHANNEL[name].limit, clamp: CHANNEL[name].clamp, color: !!CHANNEL[name].color, base: baseValue(doc, R, target, name), raw: [] }; channels.set(key, c) }
      return c
    }
    const stripTracks = []
    for (const k of tracks) {
      const ph = phaseById.get(k.tr.phase)
      if (!ph) throw new TimelineError('unknown-phase', `${k.where}: no section "${k.tr.phase}"`, { track: k.i })
      if (k.delay >= ph.len) {
        const dl = labelOf(doc, k.tr.delay, 'A delay')
        throw new TimelineError('delay-past-phase', `${dl} can't be as long as the ${ph.label} section (${Math.round(k.delay)} ms of ${Math.round(ph.len)} ms)`, { track: k.i, phase: ph.id })
      }
      const parts = []
      for (let p = 0; p < k.n; p++) {
        const start = ph.start + k.delay + k.ranks[p] * k.each
        const D = k.dur === 'phase' ? ph.end - start : k.dur
        const nominalEnd = start + D
        if (nominalEnd > MAX_MS) throw new TimelineError('time', `${k.where}: ends at ${Math.round(nominalEnd)} ms; at most ${MAX_MS}`, { track: k.i })
        let t0 = start, t1 = nominalEnd, cut = false
        if (ph.fixed && nominalEnd > ph.end + EPS_T) { cut = true; t1 = ph.end; if (t0 > ph.end) t0 = ph.end }
        parts.push({ part: p, start, t0, t1, nominalEnd, cut })
        for (const [ci, name] of k.prop.channels.entries()) {
          chan(k.target, p, name).raw.push({ track: k.i, t0, t1, D, easing: k.easing, from: k.from ? k.from[ci] : undefined, to: k.to[ci], cut })
        }
      }
      const cutParts = parts.filter((x) => x.cut)
      if (cutParts.length) {
        const late = cutParts.filter((x) => x.t0 >= ph.end).length
        warnings.push({ code: 'cut', track: k.i, phase: ph.id, message: `${k.where} runs past the end of ${ph.label}${k.n > 1 ? ` for ${cutParts.length} of ${k.n} parts` : ''}; it stops there${late ? ` (${late} never start)` : ''}` })
      }
      stripTracks.push({ index: k.i, target: k.target, property: k.tr.property, phase: ph.id, parts })
    }

    // Walk each channel in time order: start values, velocity hand-off, overlap.
    for (const c of channels.values()) {
      c.segs = c.raw.sort((a, b) => a.t0 - b.t0 || (a.t1 - a.t0) - (b.t1 - b.t0))
      delete c.raw
      let cur = c.base, vel = 0, endT = -Infinity, infinite = false, prevTrack = -1
      for (let i = 0; i < c.segs.length; i++) {
        const s = c.segs[i]
        const prev = c.segs[i - 1]
        if (prev && (s.t0 < prev.t1 - EPS_T || (s.t1 === s.t0 && prev.t1 === prev.t0 && Math.abs(s.t0 - prev.t0) <= EPS_T))) {
          throw new TimelineError('overlap', `track ${prev.track + 1} and track ${s.track + 1} both move ${c.target} ${c.name} at ${Math.round(s.t0)} ms`, { tracks: [prev.track, s.track], target: c.target })
        }
        const joins = Math.abs(s.t0 - endT) <= EPS_T
        if (s.from !== undefined) { s.sv = s.from; s.v0 = 0 }
        else {
          s.sv = cur
          s.v0 = 0
          if (s.easing.type === 'spring' && joins) {
            if (infinite) throw new TimelineError('infinite-slope', `track ${s.track + 1} starts a spring from track ${prevTrack + 1}, which ends infinitely steep; give it a starting value`, { track: s.track })
            s.v0 = vel
          }
        }
        if (s.easing.type === 'spring') s.spring = springCoef(s.easing.duration / 1000, s.easing.bounce, s.sv - s.to, s.v0)
        const end = segEnd(s)
        s.ev = end.v; s.evel = end.vel; s.inf = end.inf
        cur = end.v; vel = end.vel; infinite = end.inf; endT = s.t1; prevTrack = s.track
      }
    }

    // Bases for channels with no track, so evaluate() can fill every property.
    const bases = new Map()
    const baseOf = (target, name) => {
      const key = `${target}/${name}`
      if (!bases.has(key)) bases.set(key, baseValue(doc, R, target, name))
      return bases.get(key)
    }
    return { doc, layout, total, restTime, phases, channels: [...channels.values()], byKey: channels, tracks: stripTracks, warnings, baseOf, resolve: R }
  }

  function baseValue(doc, R, target, name) {
    const ci = ['cr', 'cg', 'cb'].indexOf(name)
    if (ci >= 0) return hexToRgb(R.color(doc.targets[target].color, `${target} colour`))[ci]
    const bi = ['br', 'bg', 'bb'].indexOf(name)
    if (bi >= 0) return hexToRgb(R.color(doc.stage.background, 'stage background'))[bi]
    return CHANNEL[name].base
  }

  // Value and velocity (units per second) where a segment stops: its nominal end, or its cut.
  function segEnd(s) {
    const tau = s.t1 - s.t0
    if (s.D === 0) return { v: s.to, vel: 0, inf: false }
    if (s.easing.type === 'spring') return { v: s.to + springY(s.spring, tau / 1000), vel: springV(s.spring, tau / 1000), inf: false }
    const x = tau / s.D
    const sp = bezierS(s.easing.p, x)
    const slope = bezierSlope(s.easing.p, sp)
    const delta = s.to - s.sv
    const v = s.sv + delta * bx(sp, s.easing.p[1], s.easing.p[3])
    if (!Number.isFinite(slope)) return { v, vel: delta === 0 ? 0 : Infinity, inf: delta !== 0 }
    return { v, vel: delta / (s.D / 1000) * slope, inf: false }
  }
  function segValue(s, t) {
    if (t >= s.t1) return s.ev
    const tau = t - s.t0
    if (tau <= 0) return s.D === 0 ? s.to : s.sv
    if (s.easing.type === 'spring') return s.to + springY(s.spring, tau / 1000)
    return s.sv + (s.to - s.sv) * bezierY(s.easing.p, tau / s.D)
  }
  function segVelocity(s, t) {
    if (t >= s.t1 || s.D === 0) return 0
    const tau = Math.max(0, t - s.t0)
    if (s.easing.type === 'spring') return springV(s.spring, tau / 1000)
    const sp = bezierS(s.easing.p, tau / s.D)
    const slope = bezierSlope(s.easing.p, sp)
    return (s.to - s.sv) / (s.D / 1000) * slope
  }
  // side 'R' is the value at t (a track starting at t owns it); 'L' is the limit from the left.
  function findSeg(c, t, side) {
    const segs = c.segs
    let lo = 0, hi = segs.length - 1, idx = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (side === 'L' ? segs[mid].t0 < t : segs[mid].t0 <= t) { idx = mid; lo = mid + 1 } else hi = mid - 1
    }
    return idx
  }
  function channelValue(c, t, side) {
    if (!c.segs.length) return c.base
    const i = findSeg(c, t, side || 'R')
    if (i < 0) return c.segs[0].sv
    return segValue(c.segs[i], t)
  }
  function channelVelocity(c, t) {
    if (!c.segs.length) return 0
    const i = findSeg(c, t, 'R')
    return i < 0 ? 0 : segVelocity(c.segs[i], t)
  }
  const clampTo = (v, r) => (r ? Math.min(r[1], Math.max(r[0], v)) : v)

  // ---------- evaluate ----------
  // Drawn values per target part: clamped, clip normalised. Unclamped values stay inside the plan.
  function partState(plan, target, part, t, side) {
    const get = (name) => {
      const c = plan.byKey.get(`${target}/${part}/${name}`)
      const v = c ? channelValue(c, t, side) : plan.baseOf(target, name)
      return clampTo(v, CHANNEL[name].clamp)
    }
    if (plan.doc.targets[target].kind === 'surface') return { background: [get('br'), get('bg'), get('bb')] }
    const s = { opacity: get('opacity'), tx: get('tx'), ty: get('ty'), sx: get('sx'), sy: get('sy'), r: get('r'), blur: get('blur') }
    s.color = [get('cr'), get('cg'), get('cb')]
    let ct = get('clipT'), cr = get('clipR'), cb = get('clipB'), cl = get('clipL')
    if (cl + cr > 1) { const k = 1 / (cl + cr); cl *= k; cr *= k }
    if (ct + cb > 1) { const k = 1 / (ct + cb); ct *= k; cb *= k }
    s.clip = [ct, cr, cb, cl]
    return s
  }
  function evaluate(plan, t, opts) {
    const side = (opts && opts.side) || 'R'
    const out = { t, targets: {} }
    for (const [id, tg] of Object.entries(plan.doc.targets)) {
      const n = tg.kind === 'surface' ? 1 : (plan.layout?.targets?.[id]?.parts ?? 1)
      const parts = []
      for (let p = 0; p < n; p++) parts.push(partState(plan, id, p, t, side))
      out.targets[id] = parts
    }
    if (opts && opts.velocities) {
      out.velocities = {}
      for (const c of plan.channels) out.velocities[c.key] = channelVelocity(c, t)
    }
    return out
  }

  // ---------- written values (shared by renderer and exports) ----------
  // CSS property groups per target kind, each a list of output quantities with their limits.
  function cssGroups(plan, target) {
    const tg = plan.doc.targets[target]
    if (tg.kind === 'surface') return [{ prop: 'background-color', names: ['br', 'bg', 'bb'], color: true }]
    return [
      { prop: 'opacity', names: ['opacity'] },
      { prop: 'transform', names: ['tx', 'ty', 'r', 'sx', 'sy'] },
      { prop: 'fill', names: ['cr', 'cg', 'cb'], color: true },
      { prop: 'filter', names: ['blur'] },
      { prop: 'clip', names: ['clipT', 'clipR', 'clipB', 'clipL'] },
    ]
  }
  // Digits written per quantity; each rounding error is far inside its limit.
  const DIGITS = { opacity: [4], transform: [3, 3, 3, 5, 5], filter: [3], clip: [3, 3, 3, 3] }
  function roundVector(group, v) {
    if (group.color) return v.map((x) => Math.round(x))
    return v.map((x, k) => round(x, DIGITS[group.prop][k]))
  }
  const writtenVector = (group, st, box) => roundVector(group, exactVector(group, st, box))
  function exactVector(group, st, box) {
    if (group.prop === 'background-color') return st.background.slice()
    if (group.prop === 'fill') return st.color.slice()
    if (group.prop === 'opacity') return [st.opacity]
    if (group.prop === 'transform') return [st.tx, st.ty, st.r, st.sx, st.sy]
    if (group.prop === 'filter') return [st.blur]
    return clipRect(st.clip, box)
  }
  function groupLimits(group, box) {
    if (group.color) return [1, 1, 1]
    if (group.prop === 'clip') return [0.002 * box.w, 0.002 * box.h, 0.002 * box.w, 0.002 * box.h]
    return group.names.map((n) => CHANNEL[n].limit)
  }
  // Clip inset as a rect in stage units: x, y, width, height.
  const clipRect = (c, box) => [box.x + box.w * c[3], box.y + box.h * c[0], box.w * (1 - c[1] - c[3]), box.h * (1 - c[0] - c[2])]
  function formatCss(group, w) {
    if (group.prop === 'background-color' || group.prop === 'fill') return rgbToHex(w)
    if (group.prop === 'opacity') return String(w[0])
    if (group.prop === 'transform') return `translate(${w[0]}px, ${w[1]}px) rotate(${w[2]}deg) scale(${w[3]}, ${w[4]})`
    if (group.prop === 'filter') return `blur(${w[0]}px)`
    return { x: w[0], y: w[1], width: w[2], height: w[3] }
  }

  // ---------- check points (numeric parity gate, spec Verification gates 2) ----------
  // For one group of channels (one CSS property of one part): sorted samples {t, side}, every adjacent
  // pair within each channel's halving threshold, jumps as an L and an R sample at the same time.
  function groupChannels(plan, target, part, group) {
    return group.names.map((n) => plan.byKey.get(`${target}/${part}/${n}`)).filter(Boolean)
  }
  function baseTimes(plan, chans) {
    const ts = []
    const T = plan.total
    for (let ms = 0; ms <= T; ms++) ts.push(ms)
    ts.push(T)
    for (const ph of plan.phases) ts.push(ph.start, ph.end)
    for (const c of chans) for (const s of c.segs) {
      ts.push(s.t0, s.t1)
      const len = s.t1 - s.t0
      if (len > 0) {
        for (let k = 1; k < 1000; k++) ts.push(s.t0 + len * k / 1000)
        if (s.easing.type === 'spring') for (const tau of springTurns(s.spring, len / 1000)) ts.push(s.t0 + tau * 1000)
        else for (const sp of bezierTurns(s.easing.p)) { const tt = s.t0 + s.D * bx(sp, s.easing.p[0], s.easing.p[2]); if (tt < s.t1) ts.push(tt) }
      }
    }
    return ts
  }
  function countCheckPoints(plan) {
    let n = 0
    const perTrack = new Map()
    for (const c of plan.channels) for (const s of c.segs) { const k = (s.t1 > s.t0 ? 1000 : 1); n += k; perTrack.set(s.track, (perTrack.get(s.track) || 0) + k) }
    n += Math.ceil(plan.total + 1) * plan.channels.length
    return { n, perTrack }
  }
  function checkPoints(plan, target, part, group, box, opts) {
    const chans = groupChannels(plan, target, part, group)
    if (!chans.length) return null
    const halve = (opts && opts.halve) || 0.5
    const raw = baseTimes(plan, chans).filter((t) => t >= 0 && t <= plan.total).sort((a, b) => a - b)
    const times = []
    for (const t of raw) if (!times.length || t - times[times.length - 1] > 1e-7) times.push(t)
    // Jumps: segment starts where the value differs from its left limit.
    const jumps = new Set()
    for (const c of chans) for (const s of c.segs) {
      if (s.t0 <= 0) continue
      if (Math.abs(channelValue(c, s.t0, 'L') - channelValue(c, s.t0, 'R')) > 1e-9) jumps.add(s.t0)
    }
    // Snap jump times into the list exactly.
    const jl = [...jumps]
    for (const j of jl) { let best = -1; for (let i = 0; i < times.length; i++) if (Math.abs(times[i] - j) <= 1e-7) best = i; if (best >= 0) times[best] = j; else times.push(j) }
    times.sort((a, b) => a - b)
    const limits = groupLimits(group, box)
    const thr = limits.map((l) => (group.color ? 0.25 : l * halve))
    const vec = (t, side) => exactVector(group, partState(plan, target, part, t, side), box)
    let pts = []
    for (const t of times) {
      if (jumps.has(t)) { pts.push({ t, side: 'L', v: vec(t, 'L') }); pts.push({ t, side: 'R', v: vec(t, 'R') }) }
      else pts.push({ t, side: 'R', v: vec(t, 'R') })
    }
    // Halving within each continuous stretch.
    const out = [pts[0]]
    const stack = []
    for (let i = 1; i < pts.length; i++) {
      const b = pts[i]
      stack.length = 0
      stack.push(b)
      let a = out[out.length - 1]
      while (stack.length) {
        const nb = stack[stack.length - 1]
        const far = a.t < nb.t && (nb.t - a.t) > 1e-6 && a.v.some((x, k) => Math.abs(x - nb.v[k]) > thr[k])
        if (far) {
          const tm = (a.t + nb.t) / 2
          stack.push({ t: tm, side: 'R', v: vec(tm, 'R') })
        } else { out.push(stack.pop()); a = out[out.length - 1] }
        if (out.length > MAX_CHECK_POINTS) throw new TimelineError('check-points', `${target} ${group.prop} needs more than ${MAX_CHECK_POINTS} check points`, { target })
      }
    }
    return { points: out, limits, chans }
  }

  // ---------- keyframe sampling for CSS / WAAPI ----------
  // Greedy feasible-slope selection on written values: from each anchor, extend while one straight line
  // through the written anchor and endpoint stays within tol of every check point between, per quantity.
  function selectKeyframes(points, group, box, tolFor) {
    const W = points.map((p) => roundVector(group, p.v))
    const tol = tolFor
    const keep = [0]
    let a = 0
    const n = points.length
    while (a < n - 1) {
      // A jump (L then R at one time) forces both samples.
      if (points[a + 1].t === points[a].t) { keep.push(a + 1); a = a + 1; continue }
      const dims = W[a].length
      const lo = new Array(dims).fill(-Infinity), hi = new Array(dims).fill(Infinity)
      let best = a + 1
      for (let j = a + 1; j < n; j++) {
        if (points[j].t === points[j - 1].t) break
        const dt = points[j].t - points[a].t
        let ok = true
        for (let k = 0; k < dims; k++) { const s = (W[j][k] - W[a][k]) / dt; if (s < lo[k] - 1e-12 || s > hi[k] + 1e-12) { ok = false; break } }
        if (ok) best = j
        let open = true
        for (let k = 0; k < dims; k++) {
          lo[k] = Math.max(lo[k], (points[j].v[k] - tol[k] - W[a][k]) / dt)
          hi[k] = Math.min(hi[k], (points[j].v[k] + tol[k] - W[a][k]) / dt)
          if (lo[k] > hi[k]) open = false
        }
        if (!open) break
        if (j + 1 < n && points[j + 1].t === points[j].t) break
      }
      keep.push(best)
      a = best
    }
    return keep.map((i) => ({ t: points[i].t, side: points[i].side, w: W[i] }))
  }
  // Sampled keyframes for every animated (part, property). mode 'waapi' keeps L/R pairs; 'css' turns
  // each jump into steps(1, jump-end) on the check point before it.
  function sampleExport(plan, boxes, mode) {
    const count = countCheckPoints(plan)
    if (count.n > MAX_CHECK_POINTS) {
      const worst = [...count.perTrack.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => `track ${t + 1}`).join(', ')
      throw new TimelineError('check-points', `this timeline needs about ${count.n} check points, more than ${MAX_CHECK_POINTS}; most come from ${worst}`, {})
    }
    const out = []
    for (const [id, tg] of Object.entries(plan.doc.targets)) {
      const n = tg.kind === 'surface' ? 1 : (plan.layout?.targets?.[id]?.parts ?? 1)
      for (let p = 0; p < n; p++) {
        const box = boxes?.[id]?.[p] || { x: 0, y: 0, w: 1, h: 1 }
        for (const group of cssGroups(plan, id)) {
          const cp = checkPoints(plan, id, p, group, box)
          if (!cp) continue
          const tolFor = cp.limits.map((l) => (group.color ? 0.75 : l / 2))
          let frames
          if (mode === 'css') {
            // Drop each jump's L sample; the sample before it becomes a step.
            const pts = []
            const stepAt = new Set()
            for (let i = 0; i < cp.points.length; i++) {
              const q = cp.points[i]
              if (q.side === 'L') { stepAt.add(pts.length - 1); continue }
              pts.push(q)
            }
            // Select within stretches split at the steps, forcing each step's sample.
            frames = []
            let startIdx = 0
            const cuts = [...stepAt].sort((a, b) => a - b)
            for (const c of [...cuts, pts.length - 1]) {
              const seg = pts.slice(startIdx, c + 1)
              const sel = selectKeyframes(seg, group, box, tolFor)
              for (const f of sel) if (!frames.length || frames[frames.length - 1].t !== f.t || frames[frames.length - 1].side !== f.side) frames.push(f)
              if (stepAt.has(c)) frames[frames.length - 1].step = true
              startIdx = c + 1
            }
          } else frames = selectKeyframes(cp.points, group, box, tolFor)
          const constant = frames.every((f) => f.w.every((x, k) => x === frames[0].w[k]))
          out.push({ target: id, part: p, group, frames, constant, points: cp.points, limits: cp.limits, box })
        }
      }
    }
    return out
  }

  // Linear reconstruction of written keyframes, as a browser plays them (steps hold their value).
  // Frames carry times; at a duplicated time (WAAPI jump) the later frame wins.
  function reconstruct(frames, t) {
    let i = 0
    while (i + 1 < frames.length && frames[i + 1].t <= t) i++
    const a = frames[i]
    const b = frames[i + 1]
    if (!b || t <= a.t) return a.w.slice()
    if (a.step) return a.w.slice()
    const u = (t - a.t) / (b.t - a.t)
    return a.w.map((x, k) => x + (b.w[k] - x) * u)
  }

  return {
    TimelineError, MAX_MS, PROPS, CHANNEL, NAMED,
    compile, evaluate, walkBindings, resolveTimeline, parseEasingString, easingFromValue, checkEasing, curveValueOk, curveKey,
    bezierY, bezierS, bezierSlope, bezierTurns, springCoef, springY, springV, springTurns,
    channelValue, channelVelocity, partState, checkPoints, countCheckPoints, sampleExport, reconstruct,
    cssGroups, writtenVector, roundVector, exactVector, formatCss, clipRect, groupLimits, hexToRgb, rgbToHex, round, mulberry32, ranksFor,
  }
})
