import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const png = fs.readFileSync(path.join(dirname, "fixtures/attachments/hero.png"));
const inbox = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), "raven-inbox-followups-")));
process.env.RAVEN_GRAB_INBOX = inbox;
const mod = await import("../dist/grab-inbox.js");

 test("openAttachmentFile refuses a symlink and reads a regular file", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-open-attachment-")));
  const file = path.join(dir, "image.png");
  const link = path.join(dir, "link.png");
  fs.writeFileSync(file, png);
  fs.symlinkSync(file, link);
  assert.throws(() => mod.openAttachmentFile(link));
  const opened = mod.openAttachmentFile(file);
  try {
    assert.equal(opened.stat.isFile(), true);
    assert.deepEqual(fs.readFileSync(opened.fd), png);
  } finally {
    fs.closeSync(opened.fd);
  }
 });

test("path route rejects a final-component symlink with 400", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-path-attachment-")));
  const file = path.join(dir, "image.png");
  const link = path.join(dir, "linked.png");
  fs.writeFileSync(file, png);
  fs.symlinkSync(file, link);
  const result = mod.handleAttachmentRequest("symlink01", dir, "application/json", Buffer.from(JSON.stringify({ path: link })));
  assert.equal(result.status, 400);
  assert.match(result.body.error, /symlink escape/);
});

test("path records preserve NFC original leaf names while disk names stay ASCII", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-names-")));
  const cafe = path.join(dir, "Café.png");
  const japanese = path.join(dir, "スクリーンショット.png");
  fs.writeFileSync(cafe, png);
  fs.writeFileSync(japanese, png);
  const first = mod.storeAttachmentPath("names001", { path: cafe, projectDir: dir });
  assert.equal(first.name, "Café.png");
  assert.match(path.basename(first.path), /^[a-f0-9]{12}-Caf\.png$/);
  const second = mod.storeAttachmentPath("names002", { path: japanese, projectDir: dir });
  assert.equal(second.name, "スクリーンショット.png");
  assert.match(path.basename(second.path), /^[a-f0-9]{12}-attachment\.png$/);
  // A non-ASCII stem on a .jpeg name falls back to "attachment" with the
  // canonical extension, not to the bare extension as a stem.
  const jpeg = fs.readFileSync(path.join(dirname, "fixtures/attachments/photo.jpg"));
  const japaneseJpeg = path.join(dir, "写真.jpeg");
  fs.writeFileSync(japaneseJpeg, jpeg);
  const third = mod.storeAttachmentPath("names003", { path: japaneseJpeg, projectDir: dir });
  assert.equal(third.name, "写真.jpeg");
  assert.match(path.basename(third.path), /^[a-f0-9]{12}-attachment\.jpeg$/);
  // A Latin stem with a trailing dropped character keeps its dash and extension.
  const cafeJpg = path.join(dir, "Café.jpg");
  fs.writeFileSync(cafeJpg, jpeg);
  const fourth = mod.storeAttachmentPath("names004", { path: cafeJpg, projectDir: dir });
  assert.match(path.basename(fourth.path), /^[a-f0-9]{12}-Caf\.jpg$/);
});

test("path route expands ~/ inside home but containment still refuses ~/../", () => {
  const underHome = path.join(os.homedir(), path.relative(os.homedir(), path.join(dirname, "fixtures/attachments/hero.png")));
  const record = mod.storeAttachmentPath("tilde001", { path: `~/${path.relative(os.homedir(), underHome)}`, projectDir: process.cwd() });
  assert.equal(record.sourcePath, underHome);
  assert.throws(() => mod.storeAttachmentPath("tilde002", { path: "~/../outside.png", projectDir: process.cwd() }), /under the home or project directory/);
});
