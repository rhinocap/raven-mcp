// Grab attachment inbox: multipart parsing, path-route validation, on-disk
// storage under ~/.raven/grab-inbox, and pruning. Contract stub — L1 replaces
// every body. Pure of session state: the bridge owns the id→record map.
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
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

// Removes inbox session directories whose mtime is older than maxAgeMs. Missing root is not an error.
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
  while (start < body.length) {
    if (body.subarray(start, start + 2).equals(Buffer.from("--"))) break;
    if (body.subarray(start, start + 2).equals(Buffer.from("\r\n"))) start += 2;
    else if (body[start] === 0x0a) start += 1;
    else throw new AttachmentError(400, "malformed multipart body");
    var next = body.indexOf(marker, start);
    if (next < 0) throw new AttachmentError(400, "multipart closing boundary is missing");
    var rawPart = body.subarray(start, next);
    if (rawPart.subarray(-2).equals(Buffer.from("\r\n"))) rawPart = rawPart.subarray(0, rawPart.length - 2);
    else if (rawPart[rawPart.length - 1] === 0x0a) rawPart = rawPart.subarray(0, rawPart.length - 1);
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
    start = next + marker.length;
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
  if (!isAbsolute(requested)) throw new AttachmentError(400, "path must be absolute");
  var resolved = resolve(requested);
  if (!existsSync(resolved)) throw new AttachmentError(404, "attachment path was not found: " + resolved);
  var stat;
  try {
    stat = statSync(resolved);
  } catch (_error) {
    throw new AttachmentError(404, "attachment path was not found: " + resolved);
  }
  if (!stat.isFile()) throw new AttachmentError(400, "attachment path must be a regular file");
  var real: string;
  try {
    real = realpathSync(resolved);
  } catch (_error) {
    throw new AttachmentError(400, "attachment path could not be resolved");
  }
  if (real !== resolved) throw new AttachmentError(400, "attachment path has a symlink escape: " + resolved);
  if (!isWithin(resolved, homedir()) && !isWithin(resolved, input.projectDir)) {
    throw new AttachmentError(400, "attachment path must be under the home or project directory");
  }
  var bytes = readFileSync(resolved);
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachmentError(413, "attachment exceeds the 25 MiB limit");
  var kind = sniffImageKind(bytes);
  if (!kind) throw new AttachmentError(415, "attachment is not a supported image");
  var extensionKind = imageKindForExtension(basename(resolved));
  if (extensionKind && extensionKind !== kind) throw new AttachmentError(415, "attachment extension does not match image content");
  return storeVerifiedAttachment(sessionKey, basename(resolved), bytes, kind, "path", resolved, IMAGE_MIME_BY_KIND[kind]);
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
  var name = sanitizeFilename(originalName, kind);
  var sha256 = createHash("sha256").update(bytes).digest("hex");
  var dimensions = readImageDimensions(bytes, kind);
  var directory = sessionInboxDir(sessionKey);
  mkdirSync(directory, { recursive: true });
  var path = join(directory, sha256.slice(0, 12) + "-" + name);
  if (!existsSync(path) || statSync(path).size !== bytes.length) writeFileSync(path, bytes);
  return { id: "att_" + randomBytes(8).toString("hex"), origin: origin, name: name, mime: IMAGE_MIME_BY_KIND[kind], bytes: bytes.length, sha256: sha256, width: dimensions.width, height: dimensions.height, path: path, sourcePath: sourcePath };
}

function sanitizeFilename(name: string, kind: ImageKind): string {
  var leaf = name.split(/[\\/]+/).pop() || "";
  var sanitized = leaf.replace(/[\x00-\x1f\x7f]/g, "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[.-]+/, "").slice(0, 80);
  return sanitized || "attachment." + extensionForKind(kind);
}

function extensionForKind(kind: ImageKind): string {
  return kind === "jpeg" ? "jpg" : kind;
}

function isWithin(path: string, directory: string): boolean {
  var parent = resolve(directory);
  return path === parent || path.startsWith(parent + "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
