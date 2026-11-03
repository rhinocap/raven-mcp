// Motion Lab fragment sanitiser (docs/Motion Lab — Timeline Spec.md, Security).
// Node only, run at build. Takes untrusted HTML and returns a JSON tree built from an allowlist; nothing of the
// input survives as markup. The renderer later builds DOM from the tree with createElement and textContent.
// Allowed elements: div, span, p, h1–h6, img. Allowed attributes: id, alt, width, height, aria-label,
// aria-hidden, and src on img (checked by images.js). Raw-text and foreign elements are dropped with their
// contents, unknown elements are unwrapped (their children kept), comments and doctypes are dropped.
'use strict'
const { checkDataImage, ImageError } = require('./images.js')

const MAX_INPUT_BYTES = 3 * 1024 * 1024
const MAX_IMAGE_TOTAL = 2 * 1024 * 1024
const MAX_PIXELS = 16 * 1024 * 1024
const MAX_NODES = 2000
const MAX_DEPTH = 32
const MAX_TEXT = 20000
const MAX_ATTR_TEXT = 200

class FragmentError extends Error {
  constructor(message) { super(message); this.name = 'FragmentError'; this.code = 'fragment' }
}

const KEEP = new Set(['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img'])
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext'])
const DROP_WITH_CONTENT = new Set(['template', 'svg', 'math', 'object', 'embed', 'applet', 'video', 'audio', 'picture', 'canvas', 'select', 'button', 'form', 'head'])
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', copy: '©', reg: '®', trade: '™' }
function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});?/g, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      if (!(n > 0 && n <= 0x10ffff) || (n >= 0xd800 && n <= 0xdfff)) return '�'
      if (n < 0x20 && n !== 9 && n !== 10 && n !== 13) return '�'
      return String.fromCodePoint(n)
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : all
  })
}

// Attribute list parser over the inside of a start tag. Returns [[name, value], ...] with lowercased names.
function parseAttrs(s) {
  const out = []
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  let m
  while ((m = re.exec(s))) out.push([m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4] ?? '')])
  return out
}

function sanitizeFragment(html) {
  if (typeof html !== 'string') throw new FragmentError('the fragment must be HTML text')
  if (Buffer.byteLength(html, 'utf8') > MAX_INPUT_BYTES) throw new FragmentError('the fragment is larger than 3 MB')
  const root = { tag: 'root', children: [] }
  // Stack frames: { name, node (null when unwrapped), drop (true inside a dropped subtree) }
  const stack = [{ name: 'root', node: root, drop: false }]
  const ids = new Set()
  let nodes = 0, text = 0, imageBytes = 0, pixels = 0
  const dropped = { elements: 0, attributes: 0 }
  const top = () => stack[stack.length - 1]
  const host = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].node) return stack[i].node }
  const depth = () => stack.filter(f => f.node).length - 1
  const add = n => {
    if (++nodes > MAX_NODES) throw new FragmentError(`the fragment has more than ${MAX_NODES} parts`)
    host().children.push(n)
  }
  const pushText = s => {
    if (top().drop || !s) return
    const t = decode(s)
    text += t.length
    if (text > MAX_TEXT) throw new FragmentError(`the fragment has more than ${MAX_TEXT} characters of text`)
    const kids = host().children
    const last = kids[kids.length - 1]
    if (last && typeof last.text === 'string') last.text += t
    else add({ text: t })
  }

  let i = 0
  const n = html.length
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt < 0) { pushText(html.slice(i)); break }
    if (lt > i) pushText(html.slice(i, lt))
    i = lt
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      i = end < 0 ? n : end + 3
      continue
    }
    if (html[i + 1] === '!' || html[i + 1] === '?') {
      const end = html.indexOf('>', i)
      i = end < 0 ? n : end + 1
      continue
    }
    const close = html[i + 1] === '/'
    const nm = /^[A-Za-z][A-Za-z0-9:-]*/.exec(html.slice(i + (close ? 2 : 1), i + 80))
    if (!nm) { pushText('<'); i++; continue }
    const name = nm[0].toLowerCase()
    // Find the end of the tag, respecting quoted attribute values.
    let j = i + (close ? 2 : 1) + nm[0].length, q = null
    for (; j < n; j++) {
      const c = html[j]
      if (q) { if (c === q) q = null }
      else if (c === '"' || c === "'") q = c
      else if (c === '>') break
    }
    const inner = html.slice(i + (close ? 2 : 1) + nm[0].length, j)
    i = j < n ? j + 1 : n

    if (close) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) { stack.length = k; break }
      }
      continue
    }

    if (RAW_TEXT.has(name)) {
      const re = new RegExp('</' + name + '[\\s/>]', 'ig')
      re.lastIndex = i
      const m = re.exec(html)
      if (!m) i = n
      else { const e = html.indexOf('>', m.index); i = e < 0 ? n : e + 1 }
      dropped.elements++
      continue
    }

    const selfClose = /\/\s*$/.test(inner)
    if (top().drop || DROP_WITH_CONTENT.has(name)) {
      if (!top().drop) dropped.elements++
      if (!VOID.has(name) && !selfClose) stack.push({ name, node: null, drop: true })
      continue
    }

    const attrs = parseAttrs(inner.replace(/\/\s*$/, ''))
    if (!KEEP.has(name)) {
      dropped.elements++
      dropped.attributes += attrs.length
      if (!VOID.has(name) && !selfClose) stack.push({ name, node: null, drop: false })
      continue
    }

    const node = { tag: name, attrs: {} }
    for (const [a, v] of attrs) {
      if (a === 'id') {
        if (!ID_RE.test(v)) throw new FragmentError(`the id "${v.slice(0, 40)}" must start with a letter and use letters, digits, - or _`)
        if (ids.has(v)) throw new FragmentError(`the id "${v}" is used twice`)
        ids.add(v); node.attrs.id = v
      } else if (a === 'alt' || a === 'aria-label') {
        node.attrs[a] = v.slice(0, MAX_ATTR_TEXT)
      } else if (a === 'aria-hidden') {
        if (v === 'true' || v === 'false') node.attrs[a] = v
        else dropped.attributes++
      } else if (a === 'width' || a === 'height') {
        if (/^[0-9]{1,4}$/.test(v) && +v > 0 && +v <= 4096) node.attrs[a] = +v
        else dropped.attributes++
      } else if (a === 'src' && name === 'img') {
        let img
        try { img = checkDataImage(v) } catch (e) {
          if (e instanceof ImageError) throw new FragmentError(e.message)
          throw e
        }
        imageBytes += img.bytes
        pixels += img.w * img.h
        if (imageBytes > MAX_IMAGE_TOTAL) throw new FragmentError('the fragment\'s images add up to more than 2 MB')
        if (pixels > MAX_PIXELS) throw new FragmentError('the fragment\'s images add up to more than 16 million pixels')
        node.src = `data:${img.mime};base64,${img.base64}`
        node.natural = [img.w, img.h]
      } else dropped.attributes++
    }
    if (name === 'img') {
      if (!node.src) { dropped.elements++; continue }
      add(node)
      continue
    }
    node.children = []
    add(node)
    if (depth() + 1 > MAX_DEPTH) throw new FragmentError(`the fragment is nested more than ${MAX_DEPTH} levels deep`)
    if (!selfClose) stack.push({ name, node, drop: false })
  }
  return { children: root.children, ids: [...ids], stats: { nodes, text, imageBytes, pixels, dropped } }
}

// Walk helper for callers: visits every element node with its parent.
function walk(children, fn, parent = null) {
  for (const c of children) {
    if (c.tag) { fn(c, parent); if (c.children) walk(c.children, fn, c) }
  }
}

// Join a sanitised fragment to a timeline: checks every element target and style key names a fragment id,
// counts split parts, and fills layout.fragment, layout.targets and layout.fontFaces.
// readFont is outline.js's checked reader (passed in so this file stays free of fontkit).
function attachFragment(doc, layout, sanitized, readFont, fontPaths) {
  const byId = new Map(), pathOf = new Map()
  const index = (list, at) => list.forEach((n, i) => { if (!n.tag) return; const p = at + '/' + i; pathOf.set(n, p); if (n.attrs.id) byId.set(n.attrs.id, n); if (n.children) index(n.children, p) })
  index(sanitized ? sanitized.children : [], '')
  const elementTargets = Object.entries(doc.targets).filter(([, t]) => t.kind === 'element')
  if (elementTargets.length && !sanitized) throw new FragmentError(`element target "${elementTargets[0][0]}" needs a fragment; pass --fragment or put ${doc.id}.fragment.html beside the timeline`)
  if (!sanitized) return layout
  layout.fragment = sanitized.children
  for (const [id, t] of elementTargets) {
    const node = byId.get(t.id)
    if (!node) throw new FragmentError(`target "${id}" names fragment element "${t.id}", which the fragment does not have`)
    let paths = [pathOf.get(node)]
    if ((t.split || 'none') === 'children') {
      paths = (node.children || []).filter((c) => c.tag).map((c) => pathOf.get(c))
      if (!paths.length) throw new FragmentError(`target "${id}" is split into its children but "${t.id}" has none`)
    }
    // paths name each part's element, so the evaluator can tell when two targets share one.
    layout.targets[id] = { node: t.id, parts: paths.length, paths, label: t.label || t.id }
  }
  for (const k of Object.keys(doc.styles || {})) {
    if (!byId.has(k)) throw new FragmentError(`styles names "${k}", which the fragment does not have`)
  }
  // Fonts named by element styles are embedded for the playground (data, through FontFace) and named by family in exports.
  const faces = {}
  for (const st of Object.values(doc.styles || {})) {
    const key = st.font
    if (key === undefined || key === 'sans' || key === 'serif' || faces[key]) continue
    const def = doc.fonts && doc.fonts[key]
    if (!def) throw new FragmentError(`a style uses font "${key}", which is not declared in fonts`)
    const path = (fontPaths && fontPaths[key]) || def.path
    const f = readFont(path)
    const family = String(f.font.familyName || key).replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 64) || key
    // Weight and style travel with the face, so two files of one family (a regular and a bold) do not replace each other.
    const os2 = f.font['OS/2'] || {}
    const weight = Number.isInteger(os2.usWeightClass) && os2.usWeightClass >= 1 && os2.usWeightClass <= 1000 ? os2.usWeightClass : 400
    const style = f.font.italicAngle || (os2.fsSelection && os2.fsSelection.italic) ? 'italic' : 'normal'
    faces[key] = { family, weight, style, format: f.format, data: f.bytes.toString('base64'), file: path }
  }
  layout.fontFaces = faces
  return layout
}

module.exports = { sanitizeFragment, attachFragment, walk, FragmentError, MAX_NODES, MAX_DEPTH }
