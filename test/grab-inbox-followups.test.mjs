import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

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
  assert.throws(() => mod.openAttachmentFile(link), (error) => error.code === "ELOOP");
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

test("same bytes dedupe only when the sanitized disk name matches", () => {
  const first = mod.storeAttachmentBytes("dedupe01", { name: "Café.png", declaredMime: "image/png", bytes: png, origin: "paste" });
  const differentName = mod.storeAttachmentBytes("dedupe01", { name: "スクリーンショット.png", declaredMime: "image/png", bytes: png, origin: "paste" });
  const sameName = mod.storeAttachmentBytes("dedupe01", { name: "Café.png", declaredMime: "image/png", bytes: png, origin: "paste" });
  assert.notEqual(first.path, differentName.path);
  assert.equal(first.path, sameName.path);
  assert.equal(fs.readdirSync(path.dirname(first.path)).filter((name) => name.startsWith(first.sha256.slice(0, 12) + "-")).length, 2);
});

test("path route maps an open-time ENOENT to 404", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-missing-attachment-")));
  const missing = path.join(dir, "missing.png");
  const result = mod.handleAttachmentRequest("missing01", dir, "application/json", Buffer.from(JSON.stringify({ path: missing })));
  assert.equal(result.status, 404);
  assert.match(result.body.error, /not found/);
});

test("path route maps a missing parent directory to 404, not 400", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-missing-parent-")));
  const missing = path.join(dir, "no-such-dir", "x.png");
  const result = mod.handleAttachmentRequest("missing02", dir, "application/json", Buffer.from(JSON.stringify({ path: missing })));
  assert.equal(result.status, 404);
  assert.match(result.body.error, /not found/);
});

test("same sha prefix and disk name still write a new file when the size differs", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-dedupe-size-")));
  const first = mod.storeAttachmentBytes("dedupe02", { name: "a.png", declaredMime: "image/png", bytes: png, origin: "paste" });
  // Forge a collision: a different, longer file already sitting under the exact name the next store will pick.
  const longer = Buffer.concat([png, Buffer.from("trailing")]);
  fs.writeFileSync(first.path, longer);
  const second = mod.storeAttachmentBytes("dedupe02", { name: "a.png", declaredMime: "image/png", bytes: png, origin: "paste" });
  assert.equal(second.path, first.path, "the disk name is the dedupe key");
  assert.equal(fs.statSync(second.path).size, png.length, "the mismatched file is replaced, not reused");
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
  // A dropped character at the end of the stem leaves no trailing dash.
  const cafeJpg = path.join(dir, "Café.jpg");
  fs.writeFileSync(cafeJpg, jpeg);
  const fourth = mod.storeAttachmentPath("names004", { path: cafeJpg, projectDir: dir });
  assert.match(path.basename(fourth.path), /^[a-f0-9]{12}-Caf\.jpg$/);
});

test("path route expands ~/ inside home but containment still refuses ~/../", () => {
  // The fixture lives under a temp dir inside $HOME and the project dir is a
  // different temp dir, so only home containment can accept the path.
  const homeDir = fs.mkdtempSync(path.join(os.homedir(), "Library", "Caches", "raven-tilde-test-"));
  const projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-tilde-project-")));
  try {
    const file = path.join(homeDir, "hero.png");
    fs.writeFileSync(file, png);
    const relative = path.relative(os.homedir(), file);
    assert.equal(relative.startsWith(".."), false);
    const record = mod.storeAttachmentPath("tilde001", { path: `~/${relative}`, projectDir });
    assert.equal(record.sourcePath, path.resolve(os.homedir(), relative));
    assert.throws(() => mod.storeAttachmentPath("tilde002", { path: "~/../outside.png", projectDir }), /under the home or project directory/);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test("path route refuses a FIFO without blocking", { timeout: 5000 }, () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-fifo-attachment-")));
  const fifo = path.join(dir, "pipe.png");
  execFileSync("mkfifo", [fifo]);
  assert.throws(() => mod.storeAttachmentPath("fifo0001", { path: fifo, projectDir: dir }), /regular file/);
});

test("attachmentOpenError maps ELOOP to a symlink 400, EACCES to 403, ENOENT to 404", () => {
  const withCode = (code) => Object.assign(new Error(code), { code });
  const loop = mod.attachmentOpenError(withCode("ELOOP"), "/x/link.png");
  assert.equal(loop.status, 400);
  assert.match(loop.message, /symlink escape: \/x\/link\.png/);
  assert.equal(mod.attachmentOpenError(withCode("EMLINK"), "/x").status, 400);
  assert.equal(mod.attachmentOpenError(withCode("EACCES"), "/x").status, 403);
  assert.equal(mod.attachmentOpenError(withCode("EPERM"), "/x").status, 403);
  assert.equal(mod.attachmentOpenError(withCode("ENOENT"), "/x").status, 404);
  assert.equal(mod.attachmentOpenError(new Error("plain"), "/x").status, 404);
});

test("disk names: an extension-only name and an 80-character stem cut", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "raven-names-edge-")));
  const dotOnly = path.join(dir, ".png");
  fs.writeFileSync(dotOnly, png);
  const first = mod.storeAttachmentPath("edge0001", { path: dotOnly, projectDir: dir });
  assert.equal(first.name, ".png");
  assert.match(path.basename(first.path), /^[a-f0-9]{12}-attachment\.png$/);
  const long = path.join(dir, "a".repeat(79) + "-b.png");
  fs.writeFileSync(long, png);
  const second = mod.storeAttachmentPath("edge0002", { path: long, projectDir: dir });
  assert.match(path.basename(second.path), /^[a-f0-9]{12}-a{79}\.png$/);
});
