// Motion Lab SwiftUI export (spec: Exports, SwiftUI row). One View per timeline: every animated channel of
// every part is a KeyframeTimeline built from the evaluator's segments, with each spring's start velocity
// written explicitly, an explicit `from` as a MoveKeyframe, and a cut bezier as the left piece of its curve.
// UMD: window.MLTimelineSwiftUI.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./evaluator.js'))
  else root.MLTimelineSwiftUI = factory(root.MLTimeline)
})(typeof self !== 'undefined' ? self : this, function (TL) {
  'use strict'

  const EPS = 1e-9
  // Text-part channels in the order the generated Part.src array holds them.
  const TEXT_CHANNELS = ['opacity', 'tx', 'ty', 'sx', 'sy', 'r', 'cr', 'cg', 'cb', 'clipT', 'clipR', 'clipB', 'clipL', 'blur']
  const BG_CHANNELS = ['br', 'bg', 'bb']

  // Shortest decimal Swift reads back as the same Double.
  const num = (v) => { if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`); const s = String(v === 0 ? 0 : v); return /[.e]/.test(s) ? s : s + '.0' }
  const swiftString = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
  const typeName = (id) => id.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('').replace(/^(\d)/, '_$1') + 'Timeline'

  // Left piece of a cubic bezier split at curve parameter s, rescaled to the unit square.
  function leftPiece(p, s) {
    const lerp = (a, b) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]
    const P0 = [0, 0], P1 = [p[0], p[1]], P2 = [p[2], p[3]], P3 = [1, 1]
    const A = lerp(P0, P1), B = lerp(P1, P2), C = lerp(P2, P3), D = lerp(A, B), E = lerp(B, C), F = lerp(D, E)
    return { points: [A[0] / F[0], A[1] / F[1], D[0] / F[0], D[1] / F[1]], y: F[1] }
  }

  // Keyframes for one channel, in seconds. Before the first track the channel shows that track's start
  // value (state rule 1); gaps hold (rule 2); after the last track the timeline holds its end (rule 3).
  function channelKeys(plan, c) {
    const keys = []
    const segs = c.segs
    const initial = segs[0].sv
    let cur = initial, at = 0
    const phaseOf = (s) => plan.doc.tracks[s.track].phase
    for (const s of segs) {
      if (s.t0 > at + EPS) { keys.push({ kind: 'hold', v: cur, d: (s.t0 - at) / 1000 }); at = s.t0 }
      if (s.D === 0) { keys.push({ kind: 'move', v: s.to }); cur = s.to; continue }
      if (s.from !== undefined) keys.push({ kind: 'move', v: s.from })
      const dur = s.t1 - s.t0
      if (dur <= EPS) continue
      if (s.easing.type === 'spring') {
        keys.push({ kind: 'spring', v: s.to, d: dur / 1000, sd: s.easing.duration / 1000, sb: s.easing.bounce, v0: s.v0 })
      } else if (s.to === s.sv) {
        keys.push({ kind: 'hold', v: s.sv, d: dur / 1000 })
      } else if (s.t1 < s.t0 + s.D - EPS) {
        const x = dur / s.D
        const piece = leftPiece(s.easing.p, TL.bezierS(s.easing.p, x))
        if (Math.abs(piece.y) < 1e-12) {
          const ph = plan.phases.find((p) => p.id === phaseOf(s))
          throw new TL.TimelineError('cut-flat', `track ${s.track + 1} is cut by ${ph ? ph.label : phaseOf(s)} at ${Math.round(s.t1)} ms where it is back at its starting value, so its curve can't be shortened for SwiftUI`, { track: s.track })
        }
        keys.push({ kind: 'curve', v: s.ev, d: dur / 1000, p: piece.points })
      } else {
        keys.push({ kind: 'curve', v: s.to, d: dur / 1000, p: s.easing.p })
      }
      cur = s.ev; at = s.t1
    }
    return { initial, keys }
  }
  function keyCode(k) {
    if (k.kind === 'move') return `.move(${num(k.v)})`
    if (k.kind === 'hold') return `.curve(${num(k.v)}, ${num(k.d)}, 0, 0, 1, 1)`
    if (k.kind === 'curve') return `.curve(${num(k.v)}, ${num(k.d)}, ${k.p.map(num).join(', ')})`
    return `.spring(${num(k.v)}, ${num(k.d)}, ${num(k.sd)}, ${num(k.sb)}, ${num(k.v0)})`
  }

  // Refuse what the SwiftUI export cannot draw yet, naming it.
  function check(plan) {
    const web = Object.entries(plan.doc.targets).filter(([, tg]) => tg.kind === 'element' || tg.kind === 'svg').map(([id]) => id)
    if (web.length) {
      throw new TL.TimelineError('swiftui-target', `The SwiftUI export can't draw ${web.map((id) => '"' + (plan.doc.targets[id].label || id) + '"').join(', ')}: page elements and artwork are web only for now. Use the CSS or JavaScript export, or rebuild the motion with text targets for iOS.`, { targets: web })
    }
    // Touch screens have no hover, so a hover motion has no iOS form.
    if ((plan.trigger || TL.triggerOf(plan.doc)).on === 'hover') {
      throw new TL.TimelineError('swiftui-hover', 'The SwiftUI export can’t play on hover: touch screens have no hover. Change the trigger to load or scroll to export it for iOS.', {})
    }
    for (const [id, tg] of Object.entries(plan.doc.targets)) {
      if (tg.kind !== 'text' && tg.kind !== 'surface') throw new TL.TimelineError('swiftui-target', `${id} is a ${tg.kind} target; the SwiftUI export draws text and the page in this phase`, { target: id })
    }
  }

  // Returns { name, swift, trackKeys }. trackKeys[i] is the evaluator channel key of tracks[i].
  function swiftExport(plan, geo) {
    check(plan)
    const doc = plan.doc
    const name = typeName(doc.id)
    const W = doc.stage.width, H = doc.stage.height
    const tracks = []
    const trackKeys = []
    const src = (target, part, ch) => {
      const c = plan.byKey.get(`${target}/${part}/${ch}`)
      if (!c || !c.segs.length) return `.value(${num(c ? c.base : plan.baseOf(target, ch))})`
      const { initial, keys } = channelKeys(plan, c)
      // A channel that never moves is written as its value.
      if (keys.every((k) => k.v === initial)) return `.value(${num(initial)})`
      tracks.push(`        track(${num(initial)}, [${keys.map(keyCode).join(', ')}])`)
      trackKeys.push(c.key)
      return `.track(${tracks.length - 1})`
    }
    const sid = Object.keys(doc.targets).find((id) => doc.targets[id].kind === 'surface')
    const stageBg = TL.hexToRgb(plan.resolve.color(doc.stage.background, 'stage background'))
    const bg = BG_CHANNELS.map((ch, k) => (sid ? src(sid, 0, ch) : `.value(${num(stageBg[k])})`))
    const parts = []
    const labels = []
    for (const [id, g] of Object.entries(geo)) {
      labels.push(g.label)
      g.parts.forEach((part, i) => {
        const hasClip = ['clipT', 'clipR', 'clipB', 'clipL'].some((n) => plan.byKey.has(`${id}/${i}/${n}`))
        const hasBlur = plan.byKey.has(`${id}/${i}/blur`)
        const b = part.box
        parts.push(`        Part(d: ${swiftString(part.d)}, box: CGRect(x: ${num(b.x)}, y: ${num(b.y)}, width: ${num(b.w)}, height: ${num(b.h)}), origin: UnitPoint(x: ${num(part.origin[0] / W)}, y: ${num(part.origin[1] / H)}), clips: ${hasClip}, blurs: ${hasBlur},\n             src: [${TEXT_CHANNELS.map((ch) => src(id, i, ch)).join(', ')}])`)
      })
    }
    const label = labels.join(' ')
    const trig = plan.trigger || TL.triggerOf(doc)
    const scroll = trig.on === 'scroll'
    // Scroll: onScrollVisibilityChange(threshold:_:) (iOS 18, checked in the iOS 27.2 SDK) starts it once the stage is
    // threshold visible inside a scroll view. With once false it rewinds when under 1% visible, SwiftUI's closest
    // match to "fully out of view".
    const startDecl = scroll ? `    @State private var start: Date?` : `    private let start: Date`
    const inits = scroll
      ? `    /// Plays once ${Math.round(trig.threshold * 100)}% of it has scrolled into view inside a ScrollView${trig.once ? '' : ', and rewinds when it scrolls out'}.
    public init() { fixedTime = nil }
    /// Draws one fixed frame, \`time\` seconds in.
    public init(time: Double) { fixedTime = time }`
      : `    /// Plays once from \`start\` and holds the last frame.
    public init(start: Date = .now) { fixedTime = nil; self.start = start }
    /// Draws one fixed frame, \`time\` seconds in.
    public init(time: Double) { fixedTime = time; start = .now }`
    const timeline = scroll
      ? `                TimelineView(.animation(minimumInterval: nil, paused: start == nil)) { context in
                    Self.frame(at: start.map { min(max(context.date.timeIntervalSince($0), 0), Self.duration) } ?? 0)
                }`
      : `                TimelineView(.animation) { context in
                    Self.frame(at: min(max(context.date.timeIntervalSince(start), 0), Self.duration))
                }`
    const watch = scroll
      ? `
        .onScrollVisibilityChange(threshold: ${num(trig.threshold)}) { visible in
            if visible, start == nil { start = .now }
        }${trig.once ? '' : `
        .onScrollVisibilityChange(threshold: 0.01) { visible in
            if !visible { start = nil }
        }`}`
      : ''
    const swift = `// ${name}.swift, exported by Motion Lab from the "${doc.id}" timeline${doc.title ? ` (${doc.title})` : ''}.
// Generated code: change the timeline in Motion Lab and export again rather than editing this file.
// Needs iOS 26 or later. Stage ${W} × ${H} pt; place it with .frame or scale it to fit.
import SwiftUI

public struct ${name}: View {
    public static let duration: Double = ${num(plan.total / 1000)}
    /// The frame shown when Reduce Motion is on.
    public static let restTime: Double = ${num(plan.restTime / 1000)}
    public static let size = CGSize(width: ${num(W)}, height: ${num(H)})

    private let fixedTime: Double?
${startDecl}
    @Environment(\\.accessibilityReduceMotion) private var reduceMotion

${inits}

    public var body: some View {
        Group {
            if let fixedTime {
                Self.frame(at: fixedTime)
            } else if reduceMotion {
                Self.frame(at: Self.restTime)
            } else {
${timeline}
            }
        }
        .frame(width: Self.size.width, height: Self.size.height)${watch}
        .accessibilityElement()
        .accessibilityLabel(${swiftString(label)})
    }

    // MARK: Drawing, in the render order content, blur, clip, opacity, scale, rotate, translate.

    static func frame(at t: Double) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle().fill(rgb(value(background[0], t), value(background[1], t), value(background[2], t)))
            ForEach(parts.indices, id: \\.self) { i in partView(i, t) }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .clipped()
    }

    static func partView(_ i: Int, _ t: Double) -> some View {
        let p = parts[i]
        let v = { (k: Int) in value(p.src[k], t) }
        var top = clamp(v(9), 0, 1), right = clamp(v(10), 0, 1), bottom = clamp(v(11), 0, 1), left = clamp(v(12), 0, 1)
        if left + right > 1 { let k = 1 / (left + right); left *= k; right *= k }
        if top + bottom > 1 { let k = 1 / (top + bottom); top *= k; bottom *= k }
        let clip = CGRect(x: p.box.minX + p.box.width * left, y: p.box.minY + p.box.height * top,
                          width: p.box.width * (1 - left - right), height: p.box.height * (1 - top - bottom))
        return paths[i]
            .fill(rgb(v(6), v(7), v(8)))
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .compositingGroup()
            .blur(radius: p.blurs ? clamp(v(13), 0, 40) : 0)
            .mask(alignment: .topLeading) {
                Rectangle()
                    .frame(width: p.clips ? clip.width : size.width, height: p.clips ? clip.height : size.height)
                    .offset(x: p.clips ? clip.minX : 0, y: p.clips ? clip.minY : 0)
            }
            .opacity(clamp(v(0), 0, 1))
            .scaleEffect(x: v(3), y: v(4), anchor: p.origin)
            .rotationEffect(.degrees(v(5)), anchor: p.origin)
            .offset(x: v(1), y: v(2))
    }

    static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color {
        Color(.sRGB, red: clamp(r, 0, 255) / 255, green: clamp(g, 0, 255) / 255, blue: clamp(b, 0, 255) / 255)
    }
    static func clamp(_ x: Double, _ lo: Double, _ hi: Double) -> Double { min(hi, max(lo, x)) }

    // MARK: Values

    enum Source { case value(Double), track(Int) }
    struct Part { let d: String; let box: CGRect; let origin: UnitPoint; let clips: Bool; let blurs: Bool; let src: [Source] }

    /// A jump at t shows its new value at t, as Motion Lab's evaluator does, so each timeline is read 1 ns later.
    static func value(_ s: Source, _ t: Double) -> Double {
        switch s {
        case let .value(x): return x
        case let .track(i): return tracks[i].value(time: t + 1e-9)
        }
    }

    enum Key { case move(Double), curve(Double, Double, Double, Double, Double, Double), spring(Double, Double, Double, Double, Double) }

    /// .curve(to, seconds, x1, y1, x2, y2) and .spring(to, seconds, spring duration, bounce, start velocity per second).
    static func track(_ initial: Double, _ keys: [Key]) -> KeyframeTimeline<Double> {
        KeyframeTimeline(initialValue: initial) {
            for key in keys {
                switch key {
                case let .move(v):
                    MoveKeyframe(v)
                case let .curve(v, d, x1, y1, x2, y2):
                    LinearKeyframe(v, duration: d, timingCurve: .bezier(startControlPoint: UnitPoint(x: x1, y: y1), endControlPoint: UnitPoint(x: x2, y: y2)))
                case let .spring(v, d, sd, sb, v0):
                    SpringKeyframe(v, duration: d, spring: Spring(duration: sd, bounce: sb), startVelocity: v0)
                }
            }
        }
    }

    /// Absolute M, L, Q, C, Z path data in stage units, as Motion Lab writes it.
    static func path(_ d: String) -> Path {
        var p = Path()
        var nums: [Double] = []
        var cmd: Character = " "
        var token = ""
        func flushNumber() { if !token.isEmpty { nums.append(Double(token) ?? 0); token = "" } }
        func flushCommand() {
            flushNumber()
            let pt = { (i: Int) in CGPoint(x: nums[i], y: nums[i + 1]) }
            switch cmd {
            case "M": if nums.count >= 2 { p.move(to: pt(0)) }
            case "L": if nums.count >= 2 { p.addLine(to: pt(0)) }
            case "Q": if nums.count >= 4 { p.addQuadCurve(to: pt(2), control: pt(0)) }
            case "C": if nums.count >= 6 { p.addCurve(to: pt(4), control1: pt(0), control2: pt(2)) }
            case "Z": p.closeSubpath()
            default: break
            }
            nums = []
        }
        for ch in d {
            if "MLQCZ".contains(ch) { flushCommand(); cmd = ch }
            else if ch == " " || ch == "," { flushNumber() }
            else if ch == "-" && !token.isEmpty && !token.hasSuffix("e") { flushNumber(); token = "-" }
            else { token.append(ch) }
        }
        flushCommand()
        return p
    }

    static let background: [Source] = [${bg.join(', ')}]

    static let parts: [Part] = [
${parts.join(',\n')}
    ]

    static let paths: [Path] = parts.map { path($0.d) }

    static let tracks: [KeyframeTimeline<Double>] = [
${tracks.join(',\n')}
    ]
}
`
    return { name, swift, trackKeys }
  }

  return { swiftExport, channelKeys, leftPiece, typeName, TEXT_CHANNELS }
})
