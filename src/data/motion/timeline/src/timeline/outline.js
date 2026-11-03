// Build-time text outlining for timeline text targets (spec: Fonts and text). Node only; uses fontkit.
// Output is in font units with y down from the ascender line, so the runtime places and scales it:
// stage point = box origin + k * (x, y) + line offset, k = size / unitsPerEm.
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const fontkit = require('fontkit')

const MAX_FONT_BYTES = 2 * 1024 * 1024
const MAX_SFNT = 16 * 1024 * 1024
const MAX_TABLES = 64
const MAX_CLUSTERS = 1000
const MAX_POINTS = 1000000

class OutlineError extends Error { constructor(message) { super(message); this.name = 'OutlineError' } }

function expandHome(p) { return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p }

const MAX_NESTING = 8
const MAX_COMPONENTS = 256

// WOFF 1: every table is inflated with zlib capped at its declared length, so a table that claims
// 4 KB and inflates to 512 MB stops at 4 KB. The tables are rebuilt into a plain sfnt for fontkit.
function unwrapWoff(buf, p) {
  if (buf.length < 44) throw new OutlineError(`font ${p} is a truncated WOFF`)
  const flavor = buf.readUInt32BE(4)
  const numTables = buf.readUInt16BE(12)
  const totalSfnt = buf.readUInt32BE(16)
  if (numTables > MAX_TABLES) throw new OutlineError(`font ${p} has ${numTables} tables; at most ${MAX_TABLES}`)
  if (totalSfnt > MAX_SFNT) throw new OutlineError(`font ${p} decodes to ${totalSfnt} bytes; at most ${MAX_SFNT}`)
  if (44 + numTables * 20 > buf.length) throw new OutlineError(`font ${p} has a truncated WOFF table directory`)
  const dir = []
  let declared = 0
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20
    const t = { tag: buf.readUInt32BE(o), offset: buf.readUInt32BE(o + 4), compLength: buf.readUInt32BE(o + 8), origLength: buf.readUInt32BE(o + 12), checksum: buf.readUInt32BE(o + 16) }
    declared += t.origLength
    if (t.offset + t.compLength > buf.length || t.compLength > t.origLength) throw new OutlineError(`font ${p} has a WOFF table outside the file`)
    dir.push(t)
  }
  if (declared > MAX_SFNT) throw new OutlineError(`font ${p} declares ${declared} bytes of tables; at most ${MAX_SFNT}`)
  const head = 12 + numTables * 16
  let size = head
  for (const t of dir) size += (t.origLength + 3) & ~3
  const out = Buffer.alloc(size)
  let es = 0
  while ((2 << es) <= numTables) es++
  out.writeUInt32BE(flavor, 0)
  out.writeUInt16BE(numTables, 4)
  out.writeUInt16BE((1 << es) * 16, 6)
  out.writeUInt16BE(es, 8)
  out.writeUInt16BE(Math.max(0, numTables * 16 - (1 << es) * 16), 10)
  let at = head
  dir.forEach((t, i) => {
    const src = buf.subarray(t.offset, t.offset + t.compLength)
    let data = src
    if (t.compLength < t.origLength) {
      try { data = zlib.inflateSync(src, { maxOutputLength: t.origLength }) } catch (e) {
        if (e.code === 'ERR_BUFFER_TOO_LARGE') throw new OutlineError(`font ${p} has a WOFF table that inflates past its declared ${t.origLength} bytes`)
        throw new OutlineError(`font ${p} has a WOFF table that does not inflate: ${e.message}`)
      }
    }
    if (data.length !== t.origLength) throw new OutlineError(`font ${p} has a WOFF table of ${data.length} bytes that declares ${t.origLength}`)
    const r = 12 + i * 16
    out.writeUInt32BE(t.tag, r)
    out.writeUInt32BE(t.checksum, r + 4)
    out.writeUInt32BE(at, r + 8)
    out.writeUInt32BE(t.origLength, r + 12)
    data.copy(out, at)
    at += (t.origLength + 3) & ~3
  })
  return out
}

// WOFF 2: one brotli stream holds every table. It is decompressed once here, capped at the sum of the
// declared table lengths (the transformed length where a table is transformed), before fontkit
// decompresses it again for itself.
function checkWoff2(buf, p) {
  if (buf.length < 48) throw new OutlineError(`font ${p} is a truncated WOFF2`)
  if (buf.toString('latin1', 4, 8) === 'ttcf') throw new OutlineError(`font ${p} is a WOFF2 font collection; use a single font`)
  const numTables = buf.readUInt16BE(12)
  const totalSfnt = buf.readUInt32BE(16)
  const compressed = buf.readUInt32BE(20)
  if (numTables > MAX_TABLES) throw new OutlineError(`font ${p} has ${numTables} tables; at most ${MAX_TABLES}`)
  if (totalSfnt > MAX_SFNT) throw new OutlineError(`font ${p} decodes to ${totalSfnt} bytes; at most ${MAX_SFNT}`)
  let o = 48
  const u8 = () => { if (o >= buf.length) throw new OutlineError(`font ${p} has a truncated WOFF2 table directory`); return buf[o++] }
  const base128 = () => {
    let v = 0
    for (let i = 0; i < 5; i++) {
      const b = u8()
      if (i === 0 && b === 0x80) throw new OutlineError(`font ${p} has a malformed WOFF2 length`)
      v = v * 128 + (b & 0x7f)
      if (v > 0xffffffff) throw new OutlineError(`font ${p} has a malformed WOFF2 length`)
      if (!(b & 0x80)) return v
    }
    throw new OutlineError(`font ${p} has a malformed WOFF2 length`)
  }
  let stream = 0, declared = 0
  for (let i = 0; i < numTables; i++) {
    const flags = u8()
    const tagIndex = flags & 0x3f
    if (tagIndex === 63) { u8(); u8(); u8(); u8() }
    const version = flags >> 6
    const origLength = base128()
    const transformed = tagIndex === 10 || tagIndex === 11 ? version === 0 : version !== 0
    const length = transformed ? base128() : origLength
    declared += origLength
    stream += length
  }
  if (declared > MAX_SFNT) throw new OutlineError(`font ${p} declares ${declared} bytes of tables; at most ${MAX_SFNT}`)
  if (stream > MAX_SFNT) throw new OutlineError(`font ${p} declares ${stream} bytes of compressed tables; at most ${MAX_SFNT}`)
  if (o + compressed > buf.length) throw new OutlineError(`font ${p} has a WOFF2 stream outside the file`)
  let data
  try { data = zlib.brotliDecompressSync(buf.subarray(o, o + compressed), { maxOutputLength: Math.max(1, stream) }) } catch (e) {
    if (e.code === 'ERR_BUFFER_TOO_LARGE') throw new OutlineError(`font ${p} has a WOFF2 stream that decompresses past its declared ${stream} bytes`)
    throw new OutlineError(`font ${p} has a WOFF2 stream that does not decompress: ${e.message}`)
  }
  if (data.length !== stream) throw new OutlineError(`font ${p} has a WOFF2 stream of ${data.length} bytes that declares ${stream}`)
}

// File checks before the parser sees anything: real path, regular file, size, signature, then the
// WOFF and WOFF2 decompression limits above.
function readFont(p) {
  const real = fs.realpathSync(expandHome(p))
  // One descriptor for the checks and the read, and the cap applies to the bytes read, so a file that grows
  // or is swapped after the stat is still held to it.
  // Non-blocking, so a named pipe is refused by the file check instead of waiting for a writer.
  const fd = fs.openSync(real, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
  let buf
  try {
    const st = fs.fstatSync(fd)
    if (!st.isFile()) throw new OutlineError(`font ${p} is not a regular file`)
    if (st.size > MAX_FONT_BYTES) throw new OutlineError(`font ${p} is ${st.size} bytes; at most ${MAX_FONT_BYTES}`)
    const cap = Buffer.alloc(MAX_FONT_BYTES + 1)
    let n = 0, r
    while (n < cap.length && (r = fs.readSync(fd, cap, n, cap.length - n, null)) > 0) n += r
    if (n > MAX_FONT_BYTES) throw new OutlineError(`font ${p} is over ${MAX_FONT_BYTES} bytes; at most ${MAX_FONT_BYTES}`)
    buf = Buffer.from(cap.subarray(0, n))
  } finally { fs.closeSync(fd) }
  const sig = buf.subarray(0, 4)
  const tag = sig.toString('latin1')
  const ok = buf.length >= 4 && (sig.equals(Buffer.from([0, 1, 0, 0])) || ['OTTO', 'true', 'wOFF', 'wOF2'].includes(tag))
  if (!ok) throw new OutlineError(`font ${p} has no font signature`)
  const bytes = buf
  if (tag === 'wOFF') buf = unwrapWoff(buf, p)
  else if (tag === 'wOF2') checkWoff2(buf, p)
  let font
  try { font = fontkit.create(buf) } catch (e) { throw new OutlineError(`font ${p} does not parse: ${e.message}`) }
  if (font.fonts) font = font.fonts[0]
  return { font, real, bytes, format: { wOFF: 'woff', wOF2: 'woff2', OTTO: 'opentype' }[tag] || 'truetype' }
}

// Composite glyphs are walked from their decoded component lists before any path is asked for, since
// fontkit's own path code recurses through components with no limit.
function checkComposite(font, glyph, fontName) {
  if (glyph.type !== 'TTF' && glyph.type !== 'WOFF2') return
  let visits = 0
  const chars = glyph.codePoints && glyph.codePoints.length ? ` "${String.fromCodePoint(...glyph.codePoints)}"` : ''
  const who = `font ${fontName}: glyph ${glyph.id}${chars}`
  const walk = (g, level) => {
    const d = g && g._decode()
    if (!d || !(d.numberOfContours < 0)) return
    if (level > MAX_NESTING) throw new OutlineError(`${who} nests components more than ${MAX_NESTING} levels deep`)
    for (const c of d.components) {
      if (++visits > MAX_COMPONENTS) throw new OutlineError(`${who} has more than ${MAX_COMPONENTS} components`)
      walk(font.getGlyph(c.glyphID), level + 1)
    }
  }
  walk(glyph, 1)
}

// Points per glyph, counted once per font and glyph after the composite walk.
const glyphPoints = new WeakMap()
const PER = { moveTo: 1, lineTo: 1, quadraticCurveTo: 2, bezierCurveTo: 3, closePath: 0 }
function pointsOf(font, glyph, fontName) {
  let m = glyphPoints.get(font)
  if (!m) glyphPoints.set(font, (m = new Map()))
  if (!m.has(glyph.id)) {
    checkComposite(font, glyph, fontName)
    m.set(glyph.id, glyph.path.commands.reduce((s, c) => s + (PER[c.command] || 0), 0))
  }
  return m.get(glyph.id)
}

const r2 = (v) => Math.round(v * 100) / 100
// Path commands as a flat array: 'M', x, y, 'L', x, y, 'Q', ..., 'C', ..., 'Z'. y is flipped (down).
function glyphCommands(glyph, ox, oy, ascent, counter) {
  const out = []
  for (const c of glyph.path.commands) {
    const a = c.args
    const P = (i) => { counter.n++; return [r2(ox + a[i]), r2(ascent - (oy + a[i + 1]))] }
    if (c.command === 'moveTo') out.push('M', ...P(0))
    else if (c.command === 'lineTo') out.push('L', ...P(0))
    else if (c.command === 'quadraticCurveTo') out.push('Q', ...P(0), ...P(2))
    else if (c.command === 'bezierCurveTo') out.push('C', ...P(0), ...P(2), ...P(4))
    else if (c.command === 'closePath') out.push('Z')
  }
  return out
}

// One text target to parts. split: none | letters | words | lines.
function outlineTarget(id, target, font, counter, fontName) {
  const split = target.split || 'none'
  const text = target.text.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const asc = font.hhea ? font.hhea.ascent : font.ascent
  const desc = font.hhea ? font.hhea.descent : font.descent
  const lineGap = font.hhea ? font.hhea.lineGap : font.lineGap
  const features = split === 'none' ? { kern: true } : { liga: false, clig: false, dlig: false, kern: true }
  const seg = new Intl.Segmenter(target.lang || 'und', { granularity: 'grapheme' })
  const warnings = []
  let clusterCount = 0
  const lineData = lines.map((line, li) => {
    const clusters = [...seg.segment(line)].map((g) => ({ text: g.segment, index: g.index, cps: [...g.segment].map((c) => c.codePointAt(0)), glyphs: [], x0: null, adv: 0 }))
    clusterCount += clusters.length
    if (clusterCount > MAX_CLUSTERS) throw new OutlineError(`${id}: more than ${MAX_CLUSTERS} letters`)
    // Shape the line whole, then give each glyph to the clusters its code points come from.
    const run = line.length ? font.layout(line, features) : { glyphs: [], positions: [] }
    const cpCluster = []
    clusters.forEach((c, ci) => c.cps.forEach(() => cpCluster.push(ci)))
    const textCps = [].concat(...clusters.map((c) => c.cps))
    const glyphCps = [].concat(...run.glyphs.map((g) => g.codePoints))
    if (glyphCps.length !== textCps.length || glyphCps.some((c, i) => c !== textCps[i])) throw new OutlineError(`${id}: the font reorders or substitutes "${line}"; this text cannot be split safely`)
    // Merge clusters a single glyph covers (required ligatures).
    const owner = clusters.map((_, i) => i)
    let pen = 0, cp = 0
    const placed = []
    run.glyphs.forEach((g, gi) => {
      const pos = run.positions[gi]
      const first = cpCluster[cp] ?? clusters.length - 1
      const last = cpCluster[cp + Math.max(0, g.codePoints.length - 1)] ?? first
      for (let k = first + 1; k <= last; k++) owner[k] = owner[first]
      if (last > first) warnings.push(`${id}: "${clusters.slice(first, last + 1).map((c) => c.text).join('')}" shapes as one glyph and moves as one part`)
      placed.push({ g, cluster: first, x: pen + pos.xOffset, y: pos.yOffset, adv: pos.xAdvance, penX: pen })
      if (g.id === 0) throw new OutlineError(`${id}: the font has no glyph for "${clusters[first].text}"`)
      pen += pos.xAdvance
      cp += g.codePoints.length
    })
    for (const pl of placed) {
      const c = clusters[owner[pl.cluster]]
      if (c.x0 === null) c.x0 = pl.penX
      c.adv = pl.penX + pl.adv - c.x0
      c.glyphs.push(pl)
    }
    const merged = clusters.filter((c, i) => owner[i] === i)
    // Merged clusters take the text of the clusters they absorbed.
    clusters.forEach((c, i) => { if (owner[i] !== i) clusters[owner[i]].text += c.text })
    return { li, width: pen, clusters: merged }
  })
  const width = Math.max(0, ...lineData.map((l) => l.width))
  const align = target.align || 'left'
  for (const l of lineData) l.dx = align === 'center' ? (width - l.width) / 2 : align === 'right' ? width - l.width : 0

  // Point budget for the whole timeline: each glyph's points once, times its uses, before any path is written.
  const uses = new Map()
  for (const l of lineData) for (const c of l.clusters) for (const pl of c.glyphs) {
    const u = uses.get(pl.g.id)
    if (u) u.n++
    else uses.set(pl.g.id, { g: pl.g, n: 1 })
  }
  for (const { g, n } of uses.values()) {
    counter.planned += pointsOf(font, g, fontName) * n
    if (counter.planned > MAX_POINTS) throw new OutlineError(`${id}: the outlines need more than ${MAX_POINTS} points`)
  }

  // Parts by split mode. Each part: text, line, x0 and adv (font units), commands.
  const mk = (line, clusters) => {
    const cmds = []
    for (const c of clusters) for (const pl of c.glyphs) cmds.push(...glyphCommands(pl.g, line.dx + pl.x, pl.y, asc, counter))
    const x0 = clusters.length ? line.dx + clusters[0].x0 : line.dx
    const adv = clusters.reduce((s, c) => s + c.adv, 0)
    return { text: clusters.map((c) => c.text).join(''), line: line.li, x0: r2(x0), adv: r2(adv), runs: [{ line: line.li, d: cmds }] }
  }
  const isSpace = (s) => /^\s+$/u.test(s)
  const parts = []
  if (split === 'none') {
    // One part covering every line.
    parts.push({ text, line: 0, x0: 0, adv: r2(width), runs: lineData.map((l) => mk(l, l.clusters).runs[0]), lines: lineData.length })
  } else if (split === 'lines') {
    for (const l of lineData) parts.push(mk(l, l.clusters))
  } else if (split === 'letters') {
    for (const l of lineData) for (const c of l.clusters) {
      const p = mk(l, [c])
      if (!p.runs[0].d.length && !isSpace(c.text)) throw new OutlineError(`${id}: "${c.text}" has no outline`)
      parts.push(p)
    }
  } else if (split === 'words') {
    const ws = new Intl.Segmenter(target.lang || 'und', { granularity: 'word' })
    for (const l of lineData) {
      const line = lines[l.li]
      const words = []
      for (const w of ws.segment(line)) {
        if (w.isWordLike || !words.length) words.push({ start: w.index, end: w.index + w.segment.length })
        else words[words.length - 1].end = w.index + w.segment.length
      }
      for (const w of words) {
        const cs = l.clusters.filter((c) => c.index >= w.start && c.index < w.end)
        if (cs.length) parts.push(mk(l, cs))
      }
    }
  }
  // Line offsets are applied at run time (line height can be a control), so each part keeps its line.
  return {
    label: text,
    split,
    upm: font.unitsPerEm,
    ascent: asc,
    descent: desc,
    lineGap,
    width: r2(width),
    lines: lineData.length,
    partList: parts.map((p) => ({ text: p.text, line: p.line, lines: p.lines || 1, x0: p.x0, adv: p.adv, runs: p.runs })),
    warnings,
  }
}

// Outline every text target. textOverrides: { targetId: string } from the build's --text.
function outline(doc, opts) {
  const fonts = {}
  const counter = { n: 0, planned: 0 }
  const out = { targets: {}, warnings: [] }
  for (const [id, t] of Object.entries(doc.targets)) {
    if (t.kind !== 'text') { out.targets[id] = { parts: 1 }; continue }
    const fontDef = doc.fonts && doc.fonts[t.font]
    if (!fontDef) throw new OutlineError(`${id}: font "${t.font}" is not declared in fonts`)
    const fp = (opts && opts.fontPaths && opts.fontPaths[t.font]) || fontDef.path
    if (!fonts[fp]) fonts[fp] = readFont(fp).font
    const text = (opts && opts.text && opts.text[id]) || t.text
    let o
    // fontkit decodes glyph data lazily; a malformed glyph (e.g. runaway CFF subroutines) throws a plain error here.
    try { o = outlineTarget(id, Object.assign({}, t, { text }), fonts[fp], counter, fp) } catch (e) {
      if (e instanceof OutlineError) throw e
      throw new OutlineError(`${id}: font ${fp} has a glyph that does not decode: ${e.message}`)
    }
    o.parts = o.partList.length
    out.targets[id] = o
    out.warnings.push(...o.warnings)
  }
  out.points = counter.n
  return out
}

module.exports = { outline, readFont, OutlineError, expandHome }
