// Grab attachment inbox: multipart parsing, path-route validation, on-disk
// storage under ~/.raven/grab-inbox, and pruning. Contract stub — L1 replaces
// every body. Pure of session state: the bridge owns the id→record map.
import { homedir } from "node:os";
import { join } from "node:path";

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
  throw new Error("stub: pruneGrabInbox");
}

// Single "file" part required; optional "origin" text part ("drop" | "paste", default "drop").
export function parseMultipartFile(_contentType: string, _body: Buffer): { name: string; mime: string; bytes: Buffer; origin: "drop" | "paste" } {
  throw new Error("stub: parseMultipartFile");
}

// Verifies magic bytes against declaredMime (415 on mismatch / unsupported), enforces MAX_ATTACHMENT_BYTES (413),
// writes <sessionInboxDir>/<sha256 first 12>-<sanitised name>, dedupes by sha within the session dir.
export function storeAttachmentBytes(_sessionKey: string, _input: { name: string; declaredMime: string; bytes: Buffer; origin: "drop" | "paste" }): GrabAttachmentRecord {
  throw new Error("stub: storeAttachmentBytes");
}

// Path route: accepts an absolute path or file:// URL; must be a regular file, realpath === resolved path,
// under homedir() or projectDir, an accepted image by magic bytes. Copies into the inbox; sourcePath set.
export function storeAttachmentPath(_sessionKey: string, _input: { path: string; projectDir: string }): GrabAttachmentRecord {
  throw new Error("stub: storeAttachmentPath");
}

// Dispatch on contentType: multipart/form-data → storeAttachmentBytes; application/json {path} → storeAttachmentPath.
// Returns { status: 202, body: record } or { status: <AttachmentError.status | 400>, body: { error } }. Never throws.
export function handleAttachmentRequest(_sessionKey: string, _projectDir: string, _contentType: string, _body: Buffer): { status: number; body: unknown } {
  throw new Error("stub: handleAttachmentRequest");
}
