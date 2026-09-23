import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function u32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}
function u16BE(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n >>> 0, 0);
  return b;
}
function u32LE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}
function u16LE(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n >>> 0, 0);
  return b;
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function box(fourcc, payload) {
  const size = 8 + payload.length;
  return Buffer.concat([
    u32BE(size),
    Buffer.from(fourcc, 'ascii'),
    payload,
  ]);
}

function fullBox(fourcc, payload, version = 0, flags = 0) {
  const vf = Buffer.alloc(4);
  vf.writeUInt8(version, 0);
  vf.writeUIntBE(flags, 1, 3);
  return box(fourcc, Buffer.concat([vf, payload]));
}

function pngChunk(type, data) {
  const len = u32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuf, data]));
  return Buffer.concat([len, typeBuf, data, u32BE(crc)]);
}

function jpegSegment(marker, payload) {
  const len = u16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
}

// ---------- hero.png ----------
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdrData = Buffer.concat([
  u32BE(16),
  u32BE(9),
  Buffer.from([8, 6, 0, 0, 0]), // bit depth, colour type RGBA, compression, filter, interlace
]);
const ihdr = pngChunk('IHDR', ihdrData);

const raw = Buffer.alloc(9 * (1 + 16 * 4));
for (let y = 0; y < 9; y++) {
  let off = y * (1 + 16 * 4);
  raw[off++] = 0; // filter byte
  for (let x = 0; x < 16; x++) {
    raw[off++] = 0x1f;
    raw[off++] = 0x6f;
    raw[off++] = 0xe5;
    raw[off++] = 0xff;
  }
}
const idat = pngChunk('IDAT', deflateSync(raw));
const iend = pngChunk('IEND', Buffer.alloc(0));
const heroPng = Buffer.concat([PNG_SIG, ihdr, idat, iend]);

// ---------- photo.jpg ----------
const app0 = jpegSegment(0xe0, Buffer.concat([
  Buffer.from('JFIF\0', 'ascii'),
  Buffer.from([0x01, 0x01]),
  Buffer.from([0x00]),
  u16BE(1),
  u16BE(1),
  Buffer.from([0x00, 0x00]),
]));
const dqt = jpegSegment(0xdb, Buffer.concat([
  Buffer.from([0x00]),
  Buffer.from(Array.from({ length: 64 }, (_, i) => (i % 255) + 1)),
]));
const sof0Payload = Buffer.concat([
  Buffer.from([0x08]),
  u16BE(480),
  u16BE(640),
  Buffer.from([0x03]),
  Buffer.from([0x01, 0x22, 0x00]),
  Buffer.from([0x02, 0x11, 0x01]),
  Buffer.from([0x03, 0x11, 0x01]),
]);
const sof0 = jpegSegment(0xc0, sof0Payload);
const photoJpg = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  app0,
  dqt,
  sof0,
  Buffer.from([0xff, 0xd9]),
]);

// ---------- tile.webp ----------
const webpWidth = 5;
const webpHeight = 7;
// packed header: bits 0-13 width-1, bits 14-27 height-1, bit 28 alpha, bits 29-31 version
const packed = ((webpWidth - 1) & 0x3fff) | (((webpHeight - 1) & 0x3fff) << 14) | (0 << 28) | (0 << 29);
const vp8lData = Buffer.alloc(1 + 4 + 8);
vp8lData[0] = 0x2f;
vp8lData.writeUInt32LE(packed >>> 0, 1);
vp8lData.fill(0xaa, 5, 13);
const vp8lChunkSize = vp8lData.length;
const vp8lChunk = Buffer.concat([
  Buffer.from('VP8L', 'ascii'),
  u32LE(vp8lChunkSize),
  vp8lData,
  Buffer.alloc(vp8lChunkSize % 2),
]);
const riffSize = 4 + vp8lChunk.length;
const tileWebp = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  u32LE(riffSize),
  Buffer.from('WEBP', 'ascii'),
  vp8lChunk,
]);

// ---------- dot.gif ----------
const gifHeader = Buffer.from('GIF89a', 'ascii');
const gifLsd = Buffer.concat([
  u16LE(3),
  u16LE(2),
  Buffer.from([0xf0, 0x00, 0x00]),
]);
const gifGct = Buffer.from([
  0x00, 0x00, 0x00,
  0xff, 0xff, 0xff,
]);
const gifImageDescriptor = Buffer.concat([
  Buffer.from([0x2c]),
  u16LE(0),
  u16LE(0),
  u16LE(3),
  u16LE(2),
  Buffer.from([0x00]),
]);
const gifLzwMinCodeSize = Buffer.from([0x02]);
const gifImageData = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from([0x44, 0x01, 0x00, 0x00]),
  Buffer.from([0x00]),
]);
const gifTrailer = Buffer.from([0x3b]);
const dotGif = Buffer.concat([
  gifHeader,
  gifLsd,
  gifGct,
  gifImageDescriptor,
  gifLzwMinCodeSize,
  gifImageData,
  gifTrailer,
]);

// ---------- still.avif ----------
const ftyp = box('ftyp', Buffer.concat([
  Buffer.from('avif', 'ascii'),
  u32BE(0),
  Buffer.from('avif', 'ascii'),
  Buffer.from('mif1', 'ascii'),
]));

const hdlr = fullBox('hdlr', Buffer.concat([
  u32BE(0),
  Buffer.from('pict', 'ascii'),
  Buffer.alloc(12),
]));

const pitm = fullBox('pitm', u16BE(1));

const infe = fullBox('infe', Buffer.concat([
  u16BE(1),
  u16BE(0),
  Buffer.from('av01', 'ascii'),
]), 2);

const iinf = fullBox('iinf', Buffer.concat([
  u16BE(1),
  infe,
]));

const ispe = fullBox('ispe', Buffer.concat([
  u32BE(1280),
  u32BE(720),
]));
const av1C = box('av1C', Buffer.from([0x81, 0x00, 0x0c, 0x00]));
const ipco = box('ipco', Buffer.concat([ispe, av1C]));

const ipma = fullBox('ipma', Buffer.concat([
  u32BE(1),
  u16BE(1),
  Buffer.from([0x02]),
  Buffer.from([0x01]),
  Buffer.from([0x02]),
]));

const iprp = box('iprp', Buffer.concat([ipco, ipma]));

const meta = fullBox('meta', Buffer.concat([
  hdlr,
  pitm,
  iinf,
  iprp,
]));

const mdat = box('mdat', Buffer.alloc(16, 0xab));

const stillAvif = Buffer.concat([ftyp, meta, mdat]);

// ---------- logo.svg ----------
const logoSvg = Buffer.from(
  `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">\n  <rect x="0" y="0" width="120" height="80" fill="#1f6fe5"/>\n</svg>\n`,
  'utf8'
);

// ---------- notes.txt ----------
const notesTxt = Buffer.from('not an image\n', 'utf8');

// ---------- write files ----------
const files = [
  { name: 'hero.png', mime: 'image/png', width: 16, height: 9, buf: heroPng },
  { name: 'photo.jpg', mime: 'image/jpeg', width: 640, height: 480, buf: photoJpg },
  { name: 'tile.webp', mime: 'image/webp', width: 5, height: 7, buf: tileWebp },
  { name: 'dot.gif', mime: 'image/gif', width: 3, height: 2, buf: dotGif },
  { name: 'still.avif', mime: 'image/avif', width: 1280, height: 720, buf: stillAvif },
  { name: 'logo.svg', mime: 'image/svg+xml', width: 120, height: 80, buf: logoSvg },
  { name: 'notes.txt', mime: 'text/plain', width: null, height: null, buf: notesTxt },
];

for (const f of files) {
  fs.writeFileSync(path.join(__dirname, f.name), f.buf);
  console.log(`${f.name} ${f.buf.length} bytes`);
}

// verify hero.png IHDR after write
const heroCheck = fs.readFileSync(path.join(__dirname, 'hero.png'));
if (
  heroCheck.readUInt32BE(16) !== 16 ||
  heroCheck.readUInt32BE(20) !== 9 ||
  heroCheck[24] !== 8 ||
  heroCheck[25] !== 6
) {
  throw new Error('hero.png IHDR verification failed');
}

const manifest = files.map((f) => ({
  name: f.name,
  mime: f.mime,
  width: f.width,
  height: f.height,
  bytes: f.buf.length,
  sha256: createHash('sha256').update(f.buf).digest('hex'),
}));

const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(path.join(__dirname, 'manifest.json'), manifestJson, 'utf8');
console.log(`manifest.json ${Buffer.byteLength(manifestJson, 'utf8')} bytes`);
