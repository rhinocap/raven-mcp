// Motion Lab image checks for fragment images (docs/Motion Lab — Timeline Spec.md, Security).
// Node only, run at build. An image is accepted only when its bytes match the declared type, its structure
// walks cleanly to the format's end marker with nothing after it, its header dimensions are inside the caps,
// and it is a single frame. Nothing here decodes pixels: dimensions come from the header.
'use strict'
const { crc32 } = require('node:zlib')

const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_SIDE = 4096

class ImageError extends Error {
  constructor(message) { super(message); this.name = 'ImageError'; this.code = 'image' }
}

const SIG = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp: [0x52, 0x49, 0x46, 0x46],
}
const starts = (b, sig) => b.length >= sig.length && sig.every((x, i) => b[i] === x)

function png(b) {
  let o = 8, w = 0, h = 0, first = true, sawData = false
  while (o < b.length) {
    if (o + 12 > b.length) throw new ImageError('the PNG ends inside a chunk')
    const len = b.readUInt32BE(o)
    const type = b.toString('latin1', o + 4, o + 8)
    if (!/^[A-Za-z]{4}$/.test(type)) throw new ImageError('the PNG has a malformed chunk')
    if (o + 12 + len > b.length) throw new ImageError('a PNG chunk runs past the end of the file')
    const crc = b.readUInt32BE(o + 8 + len)
    if (crc32(b.subarray(o + 4, o + 8 + len)) !== crc) throw new ImageError('a PNG chunk fails its checksum')
    if (first) {
      if (type !== 'IHDR' || len !== 13) throw new ImageError('the PNG does not start with its header')
      w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12)
      first = false
    }
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw new ImageError('animated PNGs are not allowed')
    if (type === 'IDAT') sawData = true
    o += 12 + len
    if (type === 'IEND') {
      if (o !== b.length) throw new ImageError('the PNG has bytes after its end')
      if (!sawData) throw new ImageError('the PNG has no image data')
      return { w, h }
    }
  }
  throw new ImageError('the PNG has no end chunk')
}

function jpeg(b) {
  let o = 2, w = 0, h = 0
  while (o < b.length) {
    if (b[o] !== 0xff) throw new ImageError('the JPEG has a malformed segment')
    while (b[o] === 0xff) o++
    const m = b[o++]
    if (m === 0xd9) throw new ImageError('the JPEG ends before its image data')
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue
    if (o + 2 > b.length) throw new ImageError('the JPEG ends inside a segment')
    const len = b.readUInt16BE(o)
    if (len < 2 || o + len > b.length) throw new ImageError('a JPEG segment runs past the end of the file')
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (len < 7) throw new ImageError('the JPEG frame header is too short')
      h = b.readUInt16BE(o + 3); w = b.readUInt16BE(o + 5)
    }
    o += len
    if (m === 0xda) {
      // Entropy-coded data: FF is followed by 00 (stuffing), a restart marker or the end of image.
      while (o + 1 < b.length) {
        if (b[o] === 0xff) {
          const n = b[o + 1]
          if (n === 0xd9) {
            if (o + 2 !== b.length) throw new ImageError('the JPEG has bytes after its end')
            if (!w || !h) throw new ImageError('the JPEG has no frame header')
            return { w, h }
          }
          if (n !== 0x00 && !(n >= 0xd0 && n <= 0xd7) && n !== 0xff) break
        }
        o++
      }
      if (o + 1 >= b.length) throw new ImageError('the JPEG has no end marker')
    }
  }
  throw new ImageError('the JPEG has no end marker')
}

function gif(b) {
  const head = b.toString('latin1', 0, 6)
  if (head !== 'GIF87a' && head !== 'GIF89a') throw new ImageError('the GIF header is not GIF87a or GIF89a')
  if (b.length < 13) throw new ImageError('the GIF is too short')
  const w = b.readUInt16LE(6), h = b.readUInt16LE(8)
  let o = 13
  if (b[10] & 0x80) o += 3 * (1 << ((b[10] & 7) + 1))
  let frames = 0
  const subBlocks = () => {
    for (;;) {
      if (o >= b.length) throw new ImageError('the GIF ends inside a block')
      const n = b[o++]
      if (n === 0) return
      o += n
    }
  }
  while (o < b.length) {
    const k = b[o++]
    if (k === 0x3b) {
      if (o !== b.length) throw new ImageError('the GIF has bytes after its end')
      if (frames !== 1) throw new ImageError(frames ? 'animated GIFs are not allowed' : 'the GIF has no image')
      return { w, h }
    }
    if (k === 0x21) { o++; subBlocks() }
    else if (k === 0x2c) {
      frames++
      if (frames > 1) throw new ImageError('animated GIFs are not allowed')
      if (o + 9 > b.length) throw new ImageError('the GIF ends inside an image descriptor')
      const flags = b[o + 8]
      o += 9
      if (flags & 0x80) o += 3 * (1 << ((flags & 7) + 1))
      o++ // LZW minimum code size
      subBlocks()
    } else throw new ImageError('the GIF has an unknown block')
  }
  throw new ImageError('the GIF has no trailer')
}

function webp(b) {
  if (b.length < 20 || b.toString('latin1', 8, 12) !== 'WEBP') throw new ImageError('the file is RIFF but not WebP')
  if (b.readUInt32LE(4) + 8 !== b.length) throw new ImageError('the WebP size does not match the file')
  let o = 12, w = 0, h = 0, image = false
  while (o < b.length) {
    if (o + 8 > b.length) throw new ImageError('the WebP ends inside a chunk')
    const type = b.toString('latin1', o, o + 4)
    const len = b.readUInt32LE(o + 4)
    const d = o + 8
    if (d + len > b.length) throw new ImageError('a WebP chunk runs past the end of the file')
    if (type === 'ANIM' || type === 'ANMF') throw new ImageError('animated WebP images are not allowed')
    if (type === 'VP8X') {
      if (len < 10) throw new ImageError('the WebP extended header is too short')
      if (b[d] & 0x02) throw new ImageError('animated WebP images are not allowed')
      w = 1 + b.readUIntLE(d + 4, 3); h = 1 + b.readUIntLE(d + 7, 3)
    } else if (type === 'VP8 ') {
      if (len < 10 || b[d + 3] !== 0x9d || b[d + 4] !== 0x01 || b[d + 5] !== 0x2a) throw new ImageError('the WebP image data is malformed')
      if (!w) { w = b.readUInt16LE(d + 6) & 0x3fff; h = b.readUInt16LE(d + 8) & 0x3fff }
      image = true
    } else if (type === 'VP8L') {
      if (len < 5 || b[d] !== 0x2f) throw new ImageError('the WebP lossless data is malformed')
      if (!w) { const bits = b.readUInt32LE(d + 1); w = 1 + (bits & 0x3fff); h = 1 + ((bits >> 14) & 0x3fff) }
      image = true
    }
    o = d + len + (len & 1)
  }
  if (o !== b.length) throw new ImageError('the WebP has bytes after its end')
  if (!image) throw new ImageError('the WebP has no image data')
  return { w, h }
}

const CHECK = { png, jpeg, gif, webp }

// src is a data: URL. Returns { mime, bytes, w, h, base64 } or throws ImageError.
function checkDataImage(src) {
  if (typeof src !== 'string') throw new ImageError('an image needs a data: source')
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/.exec(src.trim())
  if (!m) {
    if (/^data:image\/svg/i.test(src.trim())) throw new ImageError('SVG images are not allowed')
    if (/^data:/i.test(src.trim())) throw new ImageError('an image must be a base64 PNG, JPEG, WebP or GIF')
    throw new ImageError('images must be embedded as data: URLs; no external addresses')
  }
  const type = m[1]
  if (m[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) throw new ImageError('an image is larger than 1 MB')
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageError('an image is larger than 1 MB')
  if (!starts(bytes, SIG[type])) throw new ImageError(`the image says it is ${type.toUpperCase()} but its bytes are not`)
  const { w, h } = CHECK[type](bytes)
  if (!(w > 0 && h > 0)) throw new ImageError('the image has no size')
  if (w > MAX_SIDE || h > MAX_SIDE) throw new ImageError(`the image is ${w} × ${h}; at most ${MAX_SIDE} on each side`)
  return { mime: 'image/' + type, bytes: bytes.length, w, h, base64: m[2] }
}

module.exports = { checkDataImage, ImageError, MAX_IMAGE_BYTES, MAX_SIDE }
