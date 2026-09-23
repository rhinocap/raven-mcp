// Grab attachment inbox: multipart parsing, path-route validation, on-disk
// storage under ~/.raven/grab-inbox, and pruning. Contract stub — L1 replaces
// every body. Pure of session state: the bridge owns the id→record map.
import { homedir } from "node:os";
import { closeSync, constants, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IMAGE_MIME_BY_KIND, imageKindForExtension, imageKindForMime, readImageDimensions, sniffImageKind, type ImageKind } from "./grab-attachments.js";

export interface GrabAttachmentRecord {
  id: string;                       // "att_" + 16 hex
  origin: "drop" | "paste" | "path";
  name: string;                     // sanitised original file name
  mime: string;
  bytes: number;
  sha256: string;                   // 64 hex
  width: number | null;
  height: number | null;
  path: string;                     // absolute path in the inbox
  sourcePath: string | null;        // path route only
}

export var MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
// Multipart framing overhead allowed above the file cap before the bridge stops reading.
export var MAX_ATTACHMENT_BODY_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;
export var INBOX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class AttachmentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function grabInboxRoot(): string {
  return process.env.RAVEN_GRAB_INBOX || join(homedir(), ".raven", "grab-inbox");
}

export function sessionInboxDir(sessionKey: string): string {
  return join(grabInboxRoot(), sessionKey.slice(0, 8));
}

export var MAX_SESSION_ATTACHMENTS = 32;

// Removes inbox session directories whose mtime is older than maxAgeMs. Missing root is not an error.
// Only directories named like a session key (8 lowercase hex) are candidates: RAVEN_GRAB_INBOX may
// point at a directory that holds other things, and those are never removed.
export function pruneGrabInbox(now?: number, maxAgeMs?: number): { removed: string[] } {
  var root = grabInboxRoot();
  var removed: string[] = [];
  if (!existsSync(root)) return { removed: removed };
  var cutoff = (now === undefined ? Date.now() : now) - (maxAgeMs === undefined ? INBOX_MAX_AGE_MS : maxAgeMs);
  var entries: string[];
  try {
    entries = readdirSync(root);
  } catch (_error) {
    return { removed: removed };
  }
  for (var entry of entries) {
    if (!/^[0-9a-f]{8}$/.test(entry)) continue;
    var path = join(root, entry);
    try {
      if (statSync(path).isDirectory() && statSync(path).mtimeMs < cutoff) {
        rmSync(path, { recursive: true, force: true });
        removed.push(path);
      }
    } catch (_error) {
      // One unreadable or concurrently removed session must not prevent pruning others.
    }
  }
  return { removed: removed };
}

// Single "file" part required; optional "origin" text part ("drop" | "paste", default "drop").
export function parseMultipartFile(contentType: string, body: Buffer): { name: string; mime: string; bytes: Buffer; origin: "drop" | "paste" } {
  var boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  var boundary = boundaryMatch && (boundaryMatch[1] || boundaryMatch[2]);
  if (!boundary) throw new AttachmentError(400, "multipart boundary is required");

  var marker = Buffer.from("--" + boundary, "utf8");
  var parts: Array<{ name: string; filename?: string; mime: string; bytes: Buffer }> = [];
  var start = body.indexOf(marker);
  if (start < 0) throw new AttachmentError(400, "multipart boundary was not found");
  start += marker.length;
  // A boundary only counts at the start of a line: the delimiter is the line
  // break plus the marker, so file bytes that contain "--boundary" survive.
  // The break style is fixed by the first one seen (RFC 2046 says CRLF; LF is
  // tolerated for hand-built bodies).
  var lineBreak = body.subarray(start, start + 2).equals(Buffer.from("\r\n")) ? "\r\n" : "\n";
  var delimiter = Buffer.concat([Buffer.from(lineBreak), marker]);
  while (start < body.length) {
    if (body.subarray(start, start + 2).equals(Buffer.from("--"))) break;
    if (body.subarray(start, start + 2).equals(Buffer.from("\r\n"))) start += 2;
    else if (body[start] === 0x0a) start += 1;
    else throw new AttachmentError(400, "malformed multipart body");
    var next = body.indexOf(delimiter, start);
    if (next < 0) throw new AttachmentError(400, "multipart closing boundary is missing");
    var rawPart = body.subarray(start, next);
    var separator = rawPart.indexOf(Buffer.from("\r\n\r\n"));
    var separatorLength = 4;
    if (separator < 0) {
      separator = rawPart.indexOf(Buffer.from("\n\n"));
      separatorLength = 2;
    }
    if (separator < 0) throw new AttachmentError(400, "multipart part headers are malformed");
    var headers = rawPart.subarray(0, separator).toString("utf8");
    var disposition = /^content-disposition:\s*form-data\s*;(.+)$/im.exec(headers);
    if (!disposition) throw new AttachmentError(400, "multipart part is missing Content-Disposition");
    var nameMatch = /(?:^|;)\s*name="([^"]*)"/i.exec(disposition[1]);
    if (!nameMatch) throw new AttachmentError(400, "multipart part is missing a name");
    var filenameMatch = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition[1]);
    var mimeMatch = /^content-type:\s*([^\r\n;]+)/im.exec(headers);
    parts.push({ name: nameMatch[1], filename: filenameMatch ? filenameMatch[1] : undefined, mime: mimeMatch ? mimeMatch[1].trim() : "application/octet-stream", bytes: rawPart.subarray(separator + separatorLength) });
    start = next + delimiter.length;
  }

  var files = parts.filter(function(part) { return part.name === "file" && part.filename !== undefined; });
  if (files.length !== 1) throw new AttachmentError(400, 'multipart body must contain exactly one file part named "file"');
  var origins = parts.filter(function(part) { return part.name === "origin"; });
  if (origins.length > 1) throw new AttachmentError(400, "multipart body contains multiple origin parts");
  var origin = origins.length === 0 ? "drop" : origins[0].bytes.toString("utf8");
  if (origin !== "drop" && origin !== "paste") throw new AttachmentError(400, 'origin must be "drop" or "paste"');
  return { name: files[0].filename!, mime: files[0].mime, bytes: files[0].bytes, origin: origin };
}

// Verifies magic bytes against declaredMime (415 on mismatch / unsupported), enforces MAX_ATTACHMENT_BYTES (413),
// writes <sessionInboxDir>/<sha256 first 12>-<sanitised name>, dedupes by sha within the session dir.
export function storeAttachmentBytes(sessionKey: string, input: { name: string; declaredMime: string; bytes: Buffer; origin: "drop" | "paste" }): GrabAttachmentRecord {
  var kind = imageKindForMime(input.declaredMime);
  if (!kind) throw new AttachmentError(415, "unsupported image MIME type: " + input.declaredMime);
  return storeVerifiedAttachment(sessionKey, input.name, input.bytes, kind, input.origin, null, input.declaredMime);
}

// Path route: accepts an absolute path or file:// URL; must be a regular file, realpath === resolved path,
// under homedir() or projectDir, an accepted image by magic bytes. Copies into the inbox; sourcePath set.
export function storeAttachmentPath(sessionKey: string, input: { path: string; projectDir: string }): GrabAttachmentRecord {
  var requested: string;
  try {
    requested = input.path.startsWith("file:") ? fileURLToPath(input.path) : input.path;
  } catch (_error) {
    throw new AttachmentError(400, "path must be a valid file URL or absolute path");
  }
  if (requested.startsWith("~/")) requested = join(homedir(), requested.slice(2));
  if (!isAbsolute(requested)) throw new AttachmentError(400, "path must be absolute");
  var resolved = resolve(requested);
  // Containment is checked before existence so the route cannot be used to
  // probe which files exist outside the permitted roots.
  if (!isWithin(resolved, homedir()) && !isWithin(resolved, input.projectDir)) {
    throw new AttachmentError(400, "attachment path must be under the home or project directory");
  }
  if (!existsSync(resolved)) throw new AttachmentError(404, "attachment path was not found");
  var real: string;
  try {
    real = realpathSync(resolved);
  } catch (_error) {
    throw new AttachmentError(400, "attachment path could not be resolved");
  }
  if (real !== resolved) throw new AttachmentError(400, "attachment path has a symlink escape: " + resolved);
  var fd: number;
  var stat;
  try {
    var opened = openAttachmentFile(resolved);
    fd = opened.fd;
    stat = opened.stat;
  } catch (error) {
    throw attachmentOpenError(error, resolved);
  }
  if (!stat.isFile()) {
    closeSync(fd);
    throw new AttachmentError(400, "attachment path must be a regular file");
  }
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    closeSync(fd);
    throw new AttachmentError(413, "attachment exceeds the 25 MiB limit");
  }
  var bytes: Buffer;
  try {
    bytes = readFileSync(fd);
  } finally {
    closeSync(fd);
  }
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachmentError(413, "attachment exceeds the 25 MiB limit");
  var kind = sniffImageKind(bytes);
  if (!kind) throw new AttachmentError(415, "attachment is not a supported image");
  return storeVerifiedAttachment(sessionKey, basename(resolved), bytes, kind, "path", resolved, IMAGE_MIME_BY_KIND[kind]);
}

// O_NOFOLLOW protects the final path component. Intermediate directories are
// not protected (macOS has no O_RESOLVE_BENEATH); third-party proxy routes are
// already refused by the bridge. O_NONBLOCK makes the open return at once on
// a FIFO instead of waiting for a writer (the fstat then refuses it as not a
// regular file); a regular file reads the same with or without it.
export function openAttachmentFile(path: string): { fd: number; stat: ReturnType<typeof fstatSync> } {
  var fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    return { fd: fd, stat: fstatSync(fd) };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

// ELOOP is what O_NOFOLLOW returns for a symlink in the final component (EMLINK
// on some BSDs); a file that exists but cannot be read is a 403, not a 404.
export function attachmentOpenError(error: unknown, resolved: string): AttachmentError {
  var code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "ELOOP" || code === "EMLINK") return new AttachmentError(400, "attachment path has a symlink escape: " + resolved);
  if (code === "EACCES" || code === "EPERM") return new AttachmentError(403, "attachment path is not readable");
  return new AttachmentError(404, "attachment path was not found");
}

// Dispatch on contentType: multipart/form-data → storeAttachmentBytes; application/json {path} → storeAttachmentPath.
// Returns { status: 202, body: record } or { status: <AttachmentError.status | 400>, body: { error } }. Never throws.
export function handleAttachmentRequest(sessionKey: string, projectDir: string, contentType: string, body: Buffer): { status: number; body: unknown } {
  try {
    var record: GrabAttachmentRecord;
    if (/^multipart\/form-data(?:;|$)/i.test(contentType)) {
      var parsed = parseMultipartFile(contentType, body);
      record = storeAttachmentBytes(sessionKey, { name: parsed.name, declaredMime: parsed.mime, bytes: parsed.bytes, origin: parsed.origin });
    } else if (/^application\/json(?:;|$)/i.test(contentType)) {
      var parsedJson: unknown = JSON.parse(body.toString("utf8"));
      if (!isRecord(parsedJson) || typeof parsedJson.path !== "string" || parsedJson.path.trim().length === 0) {
        throw new AttachmentError(400, 'JSON body must contain a non-empty string "path"');
      }
      record = storeAttachmentPath(sessionKey, { path: parsedJson.path, projectDir: projectDir });
    } else {
      throw new AttachmentError(415, "unsupported attachment content type: " + contentType);
    }
    return { status: 202, body: record };
  } catch (error) {
    var message = error instanceof Error ? error.message : String(error);
    return { status: error instanceof AttachmentError ? error.status : 400, body: { error: message } };
  }
}

function storeVerifiedAttachment(sessionKey: string, originalName: string, bytes: Buffer, kind: ImageKind, origin: GrabAttachmentRecord["origin"], sourcePath: string | null, declaredMime: string): GrabAttachmentRecord {
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachmentError(413, "attachment exceeds the 25 MiB limit");
  var sniffed = sniffImageKind(bytes);
  if (!sniffed || sniffed !== kind) {
    throw new AttachmentError(415, "declared image type " + declaredMime + " does not match actual image type " + (sniffed ? IMAGE_MIME_BY_KIND[sniffed] : "unknown"));
  }
  // A name whose extension names another image type, or a non-image type
  // (.html on PNG bytes), is refused on both routes.
  var extensionKind = imageKindForExtension(basename(originalName));
  if (extensionKind && extensionKind !== kind) throw new AttachmentError(415, "attachment extension does not match image content");
  var leaf = basename(originalName.replace(/[\\/]+/g, "/"));
  var name = sanitizeFilename(originalName, kind);
  var recordName = capUtf8Bytes(leaf.replace(/[\x00-\x1f\x7f]/g, "").normalize("NFC"), 255) || name;
  var sha256 = createHash("sha256").update(bytes).digest("hex");
  var dimensions = readImageDimensions(bytes, kind);
  var directory = sessionInboxDir(sessionKey);
  mkdirSync(directory, { recursive: true });
  // Same sha within a session dedupes to one file, whatever name it arrived
  // under; the record keeps the name the user gave.
  var path = join(directory, sha256.slice(0, 12) + "-" + name);
  var existing = readdirSync(directory).find(function (entry) {
    return entry.indexOf(sha256.slice(0, 12) + "-") === 0 && statSync(join(directory, entry)).size === bytes.length;
  });
  if (existing) {
    path = join(directory, existing);
    // A dedupe hit writes nothing, so the directory mtime is refreshed by hand:
    // the prune on another session's startup goes by that mtime.
    var now = new Date();
    try { utimesSync(directory, now, now); } catch (_error) { /* read-only inbox still serves the record */ }
  } else {
    writeFileSync(path, bytes);
  }
  return { id: "att_" + randomBytes(8).toString("hex"), origin: origin, name: recordName, mime: IMAGE_MIME_BY_KIND[kind], bytes: bytes.length, sha256: sha256, width: dimensions.width, height: dimensions.height, path: path, sourcePath: sourcePath };
}

function capUtf8Bytes(value: string, maxBytes: number): string {
  var output = "";
  for (var character of value) {
    if (Buffer.byteLength(output + character, "utf8") > maxBytes) break;
    output += character;
  }
  return output;
}

function sanitizeFilename(name: string, kind: ImageKind): string {
  var leaf = (name.split(/[\\/]+/).pop() || "").replace(/[\x00-\x1f\x7f]/g, "");
  // Split the stem from the extension before sanitising so a stem made only of
  // characters the ASCII sanitiser drops becomes "attachment", not the bare
  // extension. The stored name always ends with the sniffed type's extension:
  // a name with no extension ("image" from a paste) gains one, and a non-image
  // extension (.html on PNG bytes) is replaced, so the path handed to the agent
  // never misstates what the file is. Image extensions were already matched to
  // the content by the caller.
  var dot = leaf.lastIndexOf(".");
  var stemSource = dot >= 0 ? leaf.slice(0, dot) : leaf;
  var extension = dot >= 0 && imageKindForExtension(leaf) ? leaf.slice(dot + 1).toLowerCase() : extensionForKind(kind);
  // Trim after the cut so an 80-character stem cannot end in "." or "-".
  var stem = stemSource.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80).replace(/^[.-]+|[.-]+$/g, "");
  return (stem || "attachment") + "." + extension;
}

function extensionForKind(kind: ImageKind): string {
  return kind === "jpeg" ? "jpg" : kind;
}

// `path` is already a realpath; the directory must be compared as one too, or a
// project under a symlinked parent (macOS /tmp, /var/folders) refuses every path.
function isWithin(path: string, directory: string): boolean {
  var parent = resolve(directory);
  try {
    parent = realpathSync(parent);
  } catch (_error) {
    // keep the resolved form
  }
  return path === parent || path.startsWith(parent + "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
