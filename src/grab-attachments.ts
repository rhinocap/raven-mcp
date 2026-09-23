// Image type sniffing and header dimension readers for grab attachments.
// No dependencies; pure byte reads.
import { TextDecoder } from "node:util";

export type ImageKind = "png" | "jpeg" | "webp" | "gif" | "avif" | "svg";

export var IMAGE_MIME_BY_KIND: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml"
};

export var ACCEPTED_IMAGE_MIMES: string[] = Object.keys(IMAGE_MIME_BY_KIND).map(function (k) { return IMAGE_MIME_BY_KIND[k as ImageKind]; });

var utf8Decoder = new TextDecoder("utf-8", { fatal: false });

function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

function bytesAscii(bytes: Uint8Array, off: number, len: number): string {
  var s = "";
  for (var i = 0; i < len; i++) {
    if (off + i >= bytes.length) break;
    s += String.fromCharCode(bytes[off + i]);
  }
  return s;
}

function matchAscii(bytes: Uint8Array, off: number, text: string): boolean {
  if (off + text.length > bytes.length) return false;
  for (var i = 0; i < text.length; i++) {
    if (bytes[off + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function readU16BE(bytes: Uint8Array, off: number): number | null {
  if (off + 2 > bytes.length) return null;
  return (bytes[off] << 8) | bytes[off + 1];
}

function readU32BE(bytes: Uint8Array, off: number): number | null {
  if (off + 4 > bytes.length) return null;
  return ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
}

function readU16LE(bytes: Uint8Array, off: number): number | null {
  if (off + 2 > bytes.length) return null;
  return bytes[off] | (bytes[off + 1] << 8);
}

function readU32LE(bytes: Uint8Array, off: number): number | null {
  if (off + 4 > bytes.length) return null;
  return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
}

function readU24LE(bytes: Uint8Array, off: number): number | null {
  if (off + 3 > bytes.length) return null;
  return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);
}

function readU64BE(bytes: Uint8Array, off: number): number | null {
  var hi = readU32BE(bytes, off);
  var lo = readU32BE(bytes, off + 4);
  if (hi === null || lo === null) return null;
  return hi * 0x100000000 + lo;
}

// Case-insensitive; strips ";charset=..." parameters; "image/jpg" counts as jpeg.
export function imageKindForMime(_mime: string): ImageKind | null {
  var mime = _mime.toLowerCase();
  var semi = mime.indexOf(";");
  if (semi !== -1) mime = mime.slice(0, semi);
  mime = mime.trim();
  if (mime === "image/jpg" || mime === "image/pjpeg") return "jpeg";
  if (mime === "image/svg+xml") return "svg";
  var kinds = Object.keys(IMAGE_MIME_BY_KIND) as ImageKind[];
  for (var i = 0; i < kinds.length; i++) {
    if (IMAGE_MIME_BY_KIND[kinds[i]] === mime) return kinds[i];
  }
  return null;
}

// From the file name's extension: .png .jpg .jpeg .webp .gif .avif .svg
export function imageKindForExtension(_name: string): ImageKind | null {
  var idx = _name.lastIndexOf(".");
  if (idx === -1 || idx === _name.length - 1) return null;
  var ext = _name.slice(idx + 1).toLowerCase();
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "webp") return "webp";
  if (ext === "gif") return "gif";
  if (ext === "avif") return "avif";
  if (ext === "svg") return "svg";
  return null;
}

function sniffSvg(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  var slice = bytes.subarray(0, Math.min(bytes.length, 4096));
  var s = decodeUtf8(slice);
  var i = 0;
  if (s.charCodeAt(0) === 0xFEFF) i = 1;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) return false;
    if (s.startsWith("<?xml", i)) {
      var end = s.indexOf("?>", i + 5);
      if (end === -1) return false;
      i = end + 2;
    } else if (s.startsWith("<!--", i)) {
      var end2 = s.indexOf("-->", i + 4);
      if (end2 === -1) return false;
      i = end2 + 3;
    } else if (s.slice(i, i + 9).toUpperCase() === "<!DOCTYPE") {
      var end3 = s.indexOf(">", i + 9);
      if (end3 === -1) return false;
      i = end3 + 1;
    } else {
      break;
    }
  }
  while (i < s.length && /\s/.test(s[i])) i++;
  var tag = s.slice(i, i + 4).toLowerCase();
  if (tag !== "<svg") return false;
  var next = s[i + 4];
  if (next === undefined) return true;
  return next === ">" || next === "/" || /\s/.test(next);
}

// Magic bytes. PNG 89 50 4E 47; JPEG FF D8 FF; GIF "GIF87a"/"GIF89a";
// WebP "RIFF"....."WEBP"; AVIF ISO-BMFF ftyp with brand avif/avis;
// SVG: optional BOM/whitespace/<?xml/<!--/<!DOCTYPE then "<svg".
export function sniffImageKind(_bytes: Uint8Array): ImageKind | null {
  var bytes = _bytes;
  if (sniffSvg(bytes)) return "svg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "jpeg";
  if (bytes.length >= 6 && (matchAscii(bytes, 0, "GIF87a") || matchAscii(bytes, 0, "GIF89a"))) return "gif";
  if (bytes.length >= 12 && matchAscii(bytes, 0, "RIFF") && matchAscii(bytes, 8, "WEBP")) return "webp";
  if (bytes.length >= 12 && matchAscii(bytes, 4, "ftyp")) {
    var major = bytesAscii(bytes, 8, 4);
    if (major === "avif" || major === "avis") return "avif";
    var size = readU32BE(bytes, 0);
    if (size === null) return null;
    var end = size === 0 ? bytes.length : Math.min(bytes.length, size);
    for (var off = 16; off + 4 <= end; off += 4) {
      var brand = bytesAscii(bytes, off, 4);
      if (brand === "avif" || brand === "avis") return "avif";
    }
  }
  return null;
}

function isSofMarker(m: number): boolean {
  return m === 0xC0 || m === 0xC1 || m === 0xC2 || m === 0xC3 || m === 0xC5 || m === 0xC6 || m === 0xC7 || m === 0xC9 || m === 0xCA || m === 0xCB || m === 0xCD || m === 0xCE || m === 0xCF;
}

function readJpegDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  var len = bytes.length;
  var i = 2;
  while (i + 1 < len) {
    if (bytes[i] !== 0xFF) {
      i++;
      continue;
    }
    while (i < len && bytes[i] === 0xFF) i++;
    if (i >= len) break;
    var marker = bytes[i++];
    if (marker === 0xD9 || marker === 0xDA) break;
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
    if (i + 2 > len) break;
    var segLen = (bytes[i] << 8) | bytes[i + 1];
    if (segLen < 2) break;
    if (isSofMarker(marker)) {
      if (i + 7 > len) break;
      var h = readU16BE(bytes, i + 3);
      var w = readU16BE(bytes, i + 5);
      if (h !== null && w !== null) return { width: w, height: h };
      break;
    }
    i += segLen;
  }
  return { width: null, height: null };
}

function readWebpDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  if (bytes.length < 16) return { width: null, height: null };
  var fourcc = bytesAscii(bytes, 12, 4);
  if (fourcc === "VP8 ") {
    if (bytes.length < 30) return { width: null, height: null };
    if (bytes[23] !== 0x9D || bytes[24] !== 0x01 || bytes[25] !== 0x2A) return { width: null, height: null };
    var w = readU16LE(bytes, 26);
    var h = readU16LE(bytes, 28);
    if (w === null || h === null) return { width: null, height: null };
    return { width: w & 0x3FFF, height: h & 0x3FFF };
  }
  if (fourcc === "VP8L") {
    if (bytes.length < 25) return { width: null, height: null };
    if (bytes[20] !== 0x2F) return { width: null, height: null };
    var b = readU32LE(bytes, 21);
    if (b === null) return { width: null, height: null };
    return { width: (b & 0x3FFF) + 1, height: ((b >> 14) & 0x3FFF) + 1 };
  }
  if (fourcc === "VP8X") {
    if (bytes.length < 30) return { width: null, height: null };
    var w3 = readU24LE(bytes, 24);
    var h3 = readU24LE(bytes, 27);
    if (w3 === null || h3 === null) return { width: null, height: null };
    return { width: w3 + 1, height: h3 + 1 };
  }
  return { width: null, height: null };
}

function findIspe(bytes: Uint8Array, start: number, end: number): number | null {
  var i = start;
  while (i + 8 <= end) {
    var size = readU32BE(bytes, i);
    if (size === null) break;
    var type = bytesAscii(bytes, i + 4, 4);
    var headerSize = 8;
    var boxEnd: number;
    if (size === 1) {
      var large = readU64BE(bytes, i + 8);
      if (large === null) break;
      headerSize = 16;
      boxEnd = i + large;
    } else if (size === 0) {
      boxEnd = end;
    } else {
      boxEnd = i + size;
    }
    if (boxEnd > end) boxEnd = end;
    if (size !== 0 && boxEnd < i + headerSize) break;
    if (type === "ispe") return i;
    if (type === "meta") {
      var res = findIspe(bytes, i + headerSize + 4, boxEnd);
      if (res !== null) return res;
    } else if (type === "iprp" || type === "ipco") {
      var res2 = findIspe(bytes, i + headerSize, boxEnd);
      if (res2 !== null) return res2;
    }
    if (boxEnd <= i) break;
    i = boxEnd;
  }
  return null;
}

function readAvifDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  var off = findIspe(bytes, 0, bytes.length);
  if (off === null) return { width: null, height: null };
  var w = readU32BE(bytes, off + 12);
  var h = readU32BE(bytes, off + 16);
  if (w === null || h === null) return { width: null, height: null };
  return { width: w, height: h };
}

function readSvgDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  if (!sniffSvg(bytes)) return { width: null, height: null };
  var text = decodeUtf8(bytes.subarray(0, Math.min(bytes.length, 4096)));
  var match = /<svg\b[^>]*>/i.exec(text);
  if (match === null) return { width: null, height: null };
  var tag = match[0];
  var width = svgLength(tag, "width");
  var height = svgLength(tag, "height");
  if (width !== null && height !== null) return { width: width, height: height };
  var viewBox = /\bviewBox\s*=\s*(["'])(.*?)\1/i.exec(tag);
  if (viewBox === null) return { width: null, height: null };
  var values = viewBox[2].trim().split(/[\s,]+/);
  if (values.length !== 4) return { width: null, height: null };
  var viewWidth = Number(values[2]);
  var viewHeight = Number(values[3]);
  if (!Number.isFinite(viewWidth) || !Number.isFinite(viewHeight)) return { width: null, height: null };
  return { width: viewWidth, height: viewHeight };
}

function svgLength(tag: string, name: string): number | null {
  var pattern = new RegExp("\\b" + name + "\\s*=\\s*(['\\\"])(.*?)\\1", "i");
  var match = pattern.exec(tag);
  if (match === null) return null;
  var value = match[2].trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/i.test(value)) return null;
  var number = Number(value.replace(/px$/i, ""));
  return Number.isFinite(number) ? number : null;
}

// Returns null dimensions for malformed or unsupported headers.
export function readImageDimensions(bytes: Uint8Array, kind: ImageKind): { width: number | null; height: number | null } {
  try {
    if (kind === "png") {
      if (bytes.length < 24 || !matchAscii(bytes, 12, "IHDR")) return { width: null, height: null };
      var pngWidth = readU32BE(bytes, 16);
      var pngHeight = readU32BE(bytes, 20);
      if (pngWidth === null || pngHeight === null) return { width: null, height: null };
      return { width: pngWidth, height: pngHeight };
    }
    if (kind === "jpeg") return readJpegDimensions(bytes);
    if (kind === "webp") return readWebpDimensions(bytes);
    if (kind === "gif") {
      if (bytes.length < 10 || !(matchAscii(bytes, 0, "GIF87a") || matchAscii(bytes, 0, "GIF89a"))) return { width: null, height: null };
      var gifWidth = readU16LE(bytes, 6);
      var gifHeight = readU16LE(bytes, 8);
      return { width: gifWidth, height: gifHeight };
    }
    if (kind === "avif") return readAvifDimensions(bytes);
    return readSvgDimensions(bytes);
  } catch {
    return { width: null, height: null };
  }
}
