import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPTED_IMAGE_MIMES,
  imageKindForExtension,
  imageKindForMime,
  readImageDimensions,
  sniffImageKind
} from "../dist/grab-attachments.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(dirname, "fixtures/attachments");
const manifest = JSON.parse(await readFile(path.join(fixtureDir, "manifest.json"), "utf8"));

test("fixture image kinds and dimensions match the manifest", async () => {
  for (const fixture of manifest.filter((entry) => entry.mime.startsWith("image/"))) {
    const bytes = new Uint8Array(await readFile(path.join(fixtureDir, fixture.name)));
    const kind = sniffImageKind(bytes);
    assert.notEqual(kind, null, fixture.name);
    assert.deepEqual(readImageDimensions(bytes, kind), { width: fixture.width, height: fixture.height }, fixture.name);
  }
});

test("non-images and truncated headers are handled safely", async () => {
  const notes = new Uint8Array(await readFile(path.join(fixtureDir, "notes.txt")));
  const png = new Uint8Array(await readFile(path.join(fixtureDir, "hero.png")));
  assert.equal(sniffImageKind(notes), null);
  assert.equal(sniffImageKind(new Uint8Array()), null);
  assert.equal(sniffImageKind(png.subarray(0, 12)), "png");
  assert.deepEqual(readImageDimensions(png.subarray(0, 12), "png"), { width: null, height: null });
});

test("MIME and extension lookup normalize accepted aliases", () => {
  assert.equal(imageKindForMime("IMAGE/JPG; charset=x"), "jpeg");
  assert.equal(imageKindForMime("text/plain"), null);
  assert.equal(imageKindForExtension("a.JPEG"), "jpeg");
  assert.equal(imageKindForExtension("a.txt"), null);
  assert.equal(ACCEPTED_IMAGE_MIMES.length, 6);
});

test("SVG sniffing and dimensions handle declarations and viewBox", () => {
  const encoder = new TextEncoder();
  assert.equal(sniffImageKind(encoder.encode("\uFEFF<!-- c --><?xml version=\"1.0\"?><svg/>")), "svg");
  assert.deepEqual(readImageDimensions(encoder.encode("<svg viewBox=\"0 0 31 17\"/>"), "svg"), { width: 31, height: 17 });
  assert.deepEqual(readImageDimensions(encoder.encode("<svg width=\"10em\"/>"), "svg"), { width: null, height: null });
});

test("hand-built VP8X WebP canvas dimensions are read", () => {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  bytes.set([4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 16);
  bytes.set([8, 0, 0], 24);
  bytes.set([6, 0, 0], 27);
  assert.deepEqual(readImageDimensions(bytes, "webp"), { width: 9, height: 7 });
});

test("hand-built progressive JPEG SOF2 dimensions are read", () => {
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x02, 0xFF, 0xC2, 0x00, 0x08, 0x08, 0x00, 0x2A, 0x00, 0x3C, 0x01]);
  assert.deepEqual(readImageDimensions(bytes, "jpeg"), { width: 60, height: 42 });
});
