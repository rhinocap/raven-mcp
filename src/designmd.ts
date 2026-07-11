import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

var __dirname = dirname(fileURLToPath(import.meta.url));
var PKG_ROOT = resolve(join(__dirname, ".."));
var SYSTEMS_DIR = join(PKG_ROOT, "src", "data", "tokens", "systems");
var STARTER_BASE_URL = "https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/";

export interface DesignMdRef {
  $ref: string;
}

export type DesignMdValue = string | number | boolean | null | DesignMdRef | DesignMdNode | DesignMdValue[];

export interface DesignMdNode {
  [key: string]: DesignMdValue;
}

export interface ParsedDesignMd {
  frontmatter: DesignMdNode;
  body: string;
}

export interface FlattenedDesignToken {
  path: string;
  group: string;
  name: string;
  value: DesignMdValue;
  kind: "scalar" | "ref";
  cssVar: string;
  ref?: string;
}

export interface ComponentDecl {
  id: string;
  aliases: string[];
  variants: string[];
  states: string[];
  anatomy: string[];
  tokens: Record<string, string>;
}

export type DesignMdInitSource =
  | "blank"
  | string
  | { kind: "blank" }
  | { kind: "system"; id: string }
  | { kind: "starter"; slug: string }
  | { system_id?: string; starter_slug?: string; slug?: string; id?: string; blank?: boolean };

export interface DesignMdInitResult extends ParsedDesignMd {
  path: string;
  tokens: FlattenedDesignToken[];
  source: { kind: "blank" } | { kind: "system"; id: string } | { kind: "starter"; slug: string };
}

export interface DesignMdUpdateSet {
  group: string;
  name: string;
  value: DesignMdValue;
}

export interface DesignMdUpdateRename {
  group: string;
  from?: string;
  name?: string;
  to?: string;
  new_name?: string;
}

export interface DesignMdUpdateRemove {
  group: string;
  name?: string;
  path?: string;
}

export interface DesignMdUpdateResult extends ParsedDesignMd {
  path: string;
  tokens: FlattenedDesignToken[];
  operation: { kind: "set"; path: string } | { kind: "rename"; from: string; to: string } | { kind: "remove"; path: string };
}

interface RawDesignMdLine {
  text: string;
  eol: string;
}

interface RawDesignMdParts {
  prefix: string;
  frontmatter: string;
  suffix: string;
  newline: string;
}

interface RawFrontmatterEntry {
  index: number;
  indent: number;
  key: string;
  path: string;
  colonIndex: number;
  keyStart: number;
  keyEnd: number;
  valueStart: number;
  valueEnd: number;
  isGroup: boolean;
}

export function parseDesignMd(source: string): ParsedDesignMd {
  var match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: source };
  }

  var frontmatter = parseFrontmatter(match[1]);
  return {
    frontmatter: frontmatter,
    body: match[2]
  };
}

export function serializeDesignMd(doc: ParsedDesignMd): string {
  var frontmatterKeys = doc.frontmatter ? Object.keys(doc.frontmatter) : [];
  if (frontmatterKeys.length === 0) return doc.body;

  var frontmatter = serializeNode(doc.frontmatter, 0);
  return "---\n" + frontmatter + "\n---\n" + doc.body;
}

export function flattenDesignTokens(frontmatter: DesignMdNode): FlattenedDesignToken[] {
  var tokens: FlattenedDesignToken[] = [];

  function walk(node: any, pathParts: string[]): void {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.charAt(0) === "$") continue;
      var value = node[key];
      var nextParts = pathParts.concat([key]);
      if (pathParts.length === 1 && pathParts[0] === "components" && isNodeValue(value) && hasManifestKey(value)) continue;
      if (Array.isArray(value)) continue;
      if (isNodeValue(value)) {
        walk(value, nextParts);
        continue;
      }

      // Top-level scalars (version, name, description) are metadata, not tokens.
      if (nextParts.length < 2) continue;

      var path = nextParts.join(".");
      tokens.push({
        path: path,
        group: nextParts[0] || "",
        name: nextParts.slice(1).join("."),
        value: value,
        kind: isRefValue(value) ? "ref" : "scalar",
        cssVar: cssVarFromPath(nextParts),
        ref: isRefValue(value) ? value.$ref : undefined
      });
    }
  }

  walk(frontmatter, []);
  return tokens;
}

export function extractComponentManifest(frontmatter: DesignMdNode): { components: ComponentDecl[]; problems: string[] } {
  var components: ComponentDecl[] = [];
  var problems: string[] = [];
  var root = frontmatter.components;
  if (!isNodeValue(root)) return { components: components, problems: problems };
  var ids = Object.keys(root);
  var reserved = ["aliases", "variants", "states", "anatomy"];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var node = root[id];
    if (!isNodeValue(node) || !hasManifestKey(node)) continue;
    var decl: ComponentDecl = { id: id, aliases: [], variants: [], states: [], anatomy: [], tokens: {} };
    for (var r = 0; r < reserved.length; r++) {
      var key = reserved[r];
      var value = node[key];
      if (value === undefined) continue;
      if (!Array.isArray(value) || !value.every(function(item) { return typeof item === "string"; })) {
        problems.push("components." + id + "." + key + " must be an array of strings, got " + describeValue(value));
      } else {
        (decl as any)[key] = value.slice();
      }
    }
    collectComponentTokens(node, [], reserved, decl.tokens);
    components.push(decl);
  }
  return { components: components, problems: problems };
}

export function readDesignMd(path: string): ParsedDesignMd & { path: string; tokens: FlattenedDesignToken[] } {
  var abs = resolve(path);
  var raw = readFileSync(abs, "utf8");
  var parsed = parseDesignMd(raw);
  return {
    path: abs,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    tokens: flattenDesignTokens(parsed.frontmatter)
  };
}

export async function initDesignMd(path: string, source: DesignMdInitSource): Promise<DesignMdInitResult> {
  var abs = resolve(path);
  if (existsSync(abs)) {
    throw new Error("DESIGN.md already exists at " + abs);
  }

  var normalized = normalizeInitSource(source);
  var doc = normalized.kind === "system"
    ? convertStoredSystemToDesignMd(normalized.id)
    : normalized.kind === "starter"
      ? await fetchStarterDesignMd(normalized.slug)
      : createBlankDesignMd();

  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, serializeDesignMd(doc), "utf8");

  return {
    path: abs,
    frontmatter: doc.frontmatter,
    body: doc.body,
    tokens: flattenDesignTokens(doc.frontmatter),
    source: normalized
  };
}

export function updateDesignMd(path: string, mutation: { set?: DesignMdUpdateSet; rename?: DesignMdUpdateRename; remove?: DesignMdUpdateRemove }): DesignMdUpdateResult {
  var abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error("DESIGN.md not found at " + abs);
  }

  var raw = readFileSync(abs, "utf8");
  var parsed = parseDesignMd(raw);
  var updated = deepClone(parsed.frontmatter);
  var rawParts = splitRawDesignMd(raw);
  var lines = splitRawLines(rawParts.frontmatter);
  var operation: DesignMdUpdateResult["operation"] | null = null;
  var hasSet = !!mutation.set;
  var hasRename = !!mutation.rename;
  var hasRemove = !!mutation.remove;
  var opCount = (hasSet ? 1 : 0) + (hasRename ? 1 : 0) + (hasRemove ? 1 : 0);

  if (opCount !== 1) {
    throw new Error("update_design_md requires exactly one of set, rename, or remove");
  }

  if (mutation.set) {
    var setPath = joinTokenPath(mutation.set.group, mutation.set.name);
    var setValue = normalizeSetValue(mutation.set.value);
    setNodeAtPath(updated, setPath, setValue);
    setRawFrontmatterValue(lines, setPath, setValue, rawParts.newline);
    operation = { kind: "set", path: setPath };
  } else if (mutation.rename) {
    var rename = normalizeRename(mutation.rename);
    var oldPath = rename.from;
    var newPath = rename.to;
    renameNodeAtPath(updated, oldPath, newPath);
    renameRawFrontmatterKey(lines, oldPath, newPath);
    operation = { kind: "rename", from: oldPath, to: newPath };
  } else if (mutation.remove) {
    var removePath = normalizeRemove(mutation.remove);
    deleteNodeAtPath(updated, removePath);
    removeRawFrontmatterPath(lines, removePath, updated);
    operation = { kind: "remove", path: removePath };
  }

  var candidate = rawParts.prefix + joinRawLines(lines) + rawParts.suffix;
  var result = parseDesignMd(candidate);
  validateDesignMdRefs(result.frontmatter);
  writeFileSync(abs, candidate, "utf8");

  return {
    path: abs,
    frontmatter: result.frontmatter,
    body: result.body,
    tokens: flattenDesignTokens(result.frontmatter),
    operation: operation as DesignMdUpdateResult["operation"]
  };
}

function normalizeInitSource(source: DesignMdInitSource): { kind: "blank" } | { kind: "system"; id: string } | { kind: "starter"; slug: string } {
  if (typeof source === "string") {
    if (source === "blank" || source === "template") return { kind: "blank" };
    if (storedSystemExists(source)) return { kind: "system", id: source };
    return { kind: "starter", slug: source };
  }
  if (source && typeof source === "object") {
    var src = source as { kind?: string; id?: string; slug?: string; starter_slug?: string; system_id?: string; blank?: boolean };
    if (src.kind === "blank" || src.blank) return { kind: "blank" };
    if (src.kind === "system" && src.id) return { kind: "system", id: src.id };
    if (src.kind === "starter" && src.slug) return { kind: "starter", slug: src.slug };
    var systemId = src.system_id || src.id;
    if (systemId && storedSystemExists(systemId)) return { kind: "system", id: systemId };
    var slug = src.slug || src.starter_slug;
    if (slug) return { kind: "starter", slug: slug };
  }
  throw new Error("Unsupported DESIGN.md init source");
}

function createBlankDesignMd(): ParsedDesignMd {
  return {
    frontmatter: {
      colors: {},
      typography: {},
      rounded: {},
      spacing: {},
      components: {}
    },
    body: "# Design system\n\nDocument the tokens, relationships, and usage notes here.\n"
  };
}

function convertStoredSystemToDesignMd(id: string): ParsedDesignMd {
  var systemPath = join(SYSTEMS_DIR, id + ".json");
  if (!storedSystemExists(id)) {
    throw new Error("Stored design system not found: " + id);
  }

  var raw = readFileSync(systemPath, "utf8");
  var system = JSON.parse(raw);
  var frontmatter: DesignMdNode = {};

  var keys = Object.keys(system);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.charAt(0) === "$") continue;
    var mappedKey = mapStoredGroupName(key);
    var value = system[key];
    if (isNodeValue(value)) {
      setNodeAtPath(frontmatter, mappedKey, convertStoredNode(value));
    }
  }

  var body = "# " + (system.$name || id) + "\n\n" +
    (system.$description ? system.$description + "\n" : "Imported from Raven's stored token systems.\n");

  return {
    frontmatter: frontmatter,
    body: body
  };
}

async function fetchStarterDesignMd(slug: string): Promise<ParsedDesignMd> {
  if (!slug || !/^[A-Za-z0-9._-]+$/.test(slug)) {
    throw new Error("Invalid DESIGN.md starter slug: " + slug);
  }
  var url = STARTER_BASE_URL + encodeURIComponent(slug) + "/DESIGN.md";
  if (typeof fetch !== "function") {
    throw new Error("global fetch is unavailable; cannot load DESIGN.md starter " + slug);
  }
  var response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch DESIGN.md starter from " + url + " (" + response.status + " " + response.statusText + ")");
  }
  return parseDesignMd(await response.text());
}

function storedSystemExists(id: string): boolean {
  return typeof id === "string" && id.length > 0 && existsSync(join(SYSTEMS_DIR, id + ".json"));
}

function mapStoredGroupName(name: string): string {
  if (name === "color") return "colors";
  if (name === "color-dark") return "colors.dark";
  if (name === "radius") return "rounded";
  return name;
}

function convertStoredNode(node: any): any {
  if (!node || typeof node !== "object") return node;
  if ("$value" in node) {
    return convertStoredValue(node.$value);
  }

  var out: Record<string, any> = {};
  var keys = Object.keys(node);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.charAt(0) === "$") continue;
    out[key] = convertStoredNode(node[key]);
  }
  return out;
}

function convertStoredValue(value: any): any {
  if (Array.isArray(value)) {
    return "cubic-bezier(" + value.map(function (v) { return String(v); }).join(", ") + ")";
  }
  if (value && typeof value === "object") {
    return convertStoredNode(value);
  }
  return value;
}

function parseFrontmatter(text: string): DesignMdNode {
  var lines = text.replace(/\r\n/g, "\n").split("\n");
  var root: DesignMdNode = {};
  var stack: Array<{ indent: number; node: DesignMdNode }> = [{ indent: -1, node: root }];

  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    if (!raw || raw.trim() === "" || raw.trim().charAt(0) === "#") continue;
    var indent = countLeadingSpaces(raw);
    var line = raw.slice(indent);
    if (line.indexOf("- ") === 0) {
      throw new Error("block sequences are not supported; use inline [a, b] syntax: " + raw);
    }
    var colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      throw new Error("Invalid DESIGN.md frontmatter line: " + raw);
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    var parent = stack[stack.length - 1].node;
    var key = line.slice(0, colonIndex).trim();
    var rest = stripInlineComment(line.slice(colonIndex + 1)).trim();
    if (!key) throw new Error("Invalid DESIGN.md frontmatter key: " + raw);

    if (rest === "") {
      var child: DesignMdNode = {};
      parent[key] = child;
      stack.push({ indent: indent, node: child });
    } else {
      parent[key] = parseScalar(rest, raw);
    }
  }

  return root;
}

function parseScalar(text: string, sourceLine?: string): any {
  if (text.charAt(0) === "[") {
    if (text.charAt(text.length - 1) !== "]") throw new Error("Invalid inline array: " + (sourceLine || text));
    var inner = text.slice(1, -1).trim();
    if (inner === "") return [];
    var parts = splitInlineArray(inner, sourceLine || text);
    var values: DesignMdValue[] = [];
    for (var p = 0; p < parts.length; p++) {
      if (parts[p].trim().charAt(0) === "[") throw new Error("nested arrays are not supported: " + (sourceLine || text));
      values.push(parseScalar(parts[p].trim(), sourceLine));
    }
    return values;
  }
  if (text.charAt(0) === "{" && !/^\{[A-Za-z0-9_.-]+\}$/.test(text)) {
    throw new Error("inline objects are not supported; only {ref.path} references are allowed: " + (sourceLine || text));
  }
  if ((text.charAt(0) === "\"" && text.charAt(text.length - 1) === "\"") || (text.charAt(0) === "'" && text.charAt(text.length - 1) === "'")) {
    var unquoted = unquote(text);
    if (/^\{[A-Za-z0-9_.-]+\}$/.test(unquoted)) {
      return { $ref: unquoted.slice(1, -1) };
    }
    return unquoted;
  }
  if (/^\{[A-Za-z0-9_.-]+\}$/.test(text)) {
    return { $ref: text.slice(1, -1) };
  }
  if (text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return Number(text);
  return text;
}

function stripInlineComment(text: string): string {
  var index = findInlineCommentStart(text, 0);
  return index === -1 ? text : text.slice(0, index);
}

function findInlineCommentStart(text: string, start: number): number {
  var quote = "";
  var escaped = false;
  var hasValue = false;
  for (var i = start; i < text.length; i++) {
    var ch = text.charAt(i);
    if (quote === "\"") {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        quote = "";
      }
      hasValue = true;
      continue;
    }
    if (quote === "'") {
      if (ch === "'" && text.charAt(i + 1) === "'") {
        i++;
      } else if (ch === "'") {
        quote = "";
      }
      hasValue = true;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      quote = ch;
      hasValue = true;
      continue;
    }
    if (ch === "#" && hasValue && i > start && /\s/.test(text.charAt(i - 1))) {
      return i;
    }
    if (!/\s/.test(ch)) hasValue = true;
  }
  return -1;
}

function splitRawDesignMd(raw: string): RawDesignMdParts {
  var match = raw.match(/^---(\r?\n)([\s\S]*?)(\r?\n)---(\r?\n?)([\s\S]*)$/);
  if (!match) {
    return {
      prefix: "---\n",
      frontmatter: "",
      suffix: "\n---\n" + raw,
      newline: "\n"
    };
  }
  return {
    prefix: "---" + match[1],
    frontmatter: match[2],
    suffix: match[3] + "---" + match[4] + match[5],
    newline: match[1]
  };
}

function splitRawLines(text: string): RawDesignMdLine[] {
  var lines: RawDesignMdLine[] = [];
  var offset = 0;
  while (offset < text.length) {
    var newlineIndex = text.indexOf("\n", offset);
    if (newlineIndex === -1) {
      lines.push({ text: text.slice(offset), eol: "" });
      break;
    }
    var lineEnd = newlineIndex;
    var eol = "\n";
    if (lineEnd > offset && text.charAt(lineEnd - 1) === "\r") {
      lineEnd--;
      eol = "\r\n";
    }
    lines.push({ text: text.slice(offset, lineEnd), eol: eol });
    offset = newlineIndex + 1;
  }
  return lines;
}

function joinRawLines(lines: RawDesignMdLine[]): string {
  var out = "";
  for (var i = 0; i < lines.length; i++) out += lines[i].text + lines[i].eol;
  return out;
}

function scanRawFrontmatter(lines: RawDesignMdLine[]): RawFrontmatterEntry[] {
  var entries: RawFrontmatterEntry[] = [];
  var stack: Array<{ indent: number; path: string }> = [];
  for (var i = 0; i < lines.length; i++) {
    var text = lines[i].text;
    if (!text || text.trim() === "" || text.trim().charAt(0) === "#") continue;
    var indent = countLeadingSpaces(text);
    var colonIndex = text.indexOf(":", indent);
    if (colonIndex === -1) continue;
    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) stack.pop();
    var rawKey = text.slice(indent, colonIndex);
    var key = rawKey.trim();
    if (!key) continue;
    var keyLeading = rawKey.length - rawKey.replace(/^\s+/, "").length;
    var keyTrailing = rawKey.length - rawKey.replace(/\s+$/, "").length;
    var path = stack.length > 0 ? stack[stack.length - 1].path + "." + key : key;
    var commentStart = findInlineCommentStart(text, colonIndex + 1);
    var valueLimit = commentStart === -1 ? text.length : commentStart;
    var valueStart = colonIndex + 1;
    while (valueStart < valueLimit && /\s/.test(text.charAt(valueStart))) valueStart++;
    var valueEnd = valueLimit;
    while (valueEnd > valueStart && /\s/.test(text.charAt(valueEnd - 1))) valueEnd--;
    var isGroup = stripInlineComment(text.slice(colonIndex + 1)).trim() === "";
    entries.push({
      index: i,
      indent: indent,
      key: key,
      path: path,
      colonIndex: colonIndex,
      keyStart: indent + keyLeading,
      keyEnd: colonIndex - keyTrailing,
      valueStart: valueStart,
      valueEnd: valueEnd,
      isGroup: isGroup
    });
    if (isGroup) stack.push({ indent: indent, path: path });
  }
  return entries;
}

function findRawEntry(entries: RawFrontmatterEntry[], path: string): RawFrontmatterEntry | null {
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].path === path) return entries[i];
  }
  return null;
}

function setRawFrontmatterValue(lines: RawDesignMdLine[], path: string, value: any, newline: string): void {
  var entries = scanRawFrontmatter(lines);
  var entry = findRawEntry(entries, path);
  if (entry) {
    if (entry.isGroup) {
      for (var i = entries.length - 1; i >= 0; i--) {
        if (entries[i].path.indexOf(path + ".") === 0) lines.splice(entries[i].index, 1);
      }
      entries = scanRawFrontmatter(lines);
      entry = findRawEntry(entries, path) as RawFrontmatterEntry;
    }
    var current = lines[entry.index].text;
    var prefix = current.slice(0, entry.valueStart);
    if (entry.valueStart === entry.colonIndex + 1) prefix += " ";
    lines[entry.index].text = prefix + serializeScalar(value) + current.slice(entry.valueEnd);
    return;
  }

  var parts = path.split(".").filter(Boolean);
  var parent: RawFrontmatterEntry | null = null;
  var parentCount = 0;
  for (var p = parts.length - 1; p > 0; p--) {
    parent = findRawEntry(entries, parts.slice(0, p).join("."));
    if (parent) {
      parentCount = p;
      break;
    }
  }
  var insertAt = parent ? rawGroupEnd(entries, parent, lines.length) : lines.length;
  var baseIndent = parent ? parent.indent + 2 : 0;
  var additions: string[] = [];
  for (var n = parentCount; n < parts.length; n++) {
    var indent = repeatSpaces(baseIndent + ((n - parentCount) * 2));
    additions.push(indent + parts[n] + (n === parts.length - 1 ? ": " + serializeScalar(value) : ":"));
  }
  insertRawLines(lines, insertAt, additions, newline);
}

function rawGroupEnd(entries: RawFrontmatterEntry[], group: RawFrontmatterEntry, fallback: number): number {
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].index > group.index && entries[i].indent <= group.indent) return entries[i].index;
  }
  return fallback;
}

function insertRawLines(lines: RawDesignMdLine[], index: number, additions: string[], newline: string): void {
  if (additions.length === 0) return;
  var inserted: RawDesignMdLine[] = [];
  if (index === lines.length && lines.length > 0 && lines[lines.length - 1].eol === "") {
    lines[lines.length - 1].eol = newline;
  }
  for (var i = 0; i < additions.length; i++) {
    var eol = index < lines.length || i < additions.length - 1 ? newline : "";
    inserted.push({ text: additions[i], eol: eol });
  }
  lines.splice(index, 0, ...inserted);
}

function renameRawFrontmatterKey(lines: RawDesignMdLine[], fromPath: string, toPath: string): void {
  var fromParts = fromPath.split(".").filter(Boolean);
  var toParts = toPath.split(".").filter(Boolean);
  var fromParent = fromParts.slice(0, -1).join(".");
  var toParent = toParts.slice(0, -1).join(".");
  if (fromParent !== toParent) {
    throw new Error("Cannot rename across DESIGN.md groups with a surgical key edit");
  }
  var entry = findRawEntry(scanRawFrontmatter(lines), fromPath);
  if (!entry) throw new Error("Token path not found: " + fromPath);
  var text = lines[entry.index].text;
  lines[entry.index].text = text.slice(0, entry.keyStart) + toParts[toParts.length - 1] + text.slice(entry.keyEnd);
}

function removeRawFrontmatterPath(lines: RawDesignMdLine[], path: string, updated: DesignMdNode): void {
  var entries = scanRawFrontmatter(lines);
  var found = false;
  for (var i = entries.length - 1; i >= 0; i--) {
    if (entries[i].path === path || entries[i].path.indexOf(path + ".") === 0) {
      lines.splice(entries[i].index, 1);
      found = true;
    }
  }
  if (!found) throw new Error("Token path not found: " + path);

  var parts = path.split(".").filter(Boolean);
  for (var p = parts.length - 1; p > 0; p--) {
    var parentPath = parts.slice(0, p).join(".");
    if (typeof getNodeAtPath(updated, parentPath) !== "undefined") break;
    var parentEntry = findRawEntry(scanRawFrontmatter(lines), parentPath);
    if (parentEntry) lines.splice(parentEntry.index, 1);
  }
}

function unquote(text: string): string {
  if (text.charAt(0) === "\"") {
    return JSON.parse(text);
  }
  var inner = text.slice(1, -1).replace(/''/g, "'");
  return inner.replace(/\\'/g, "'");
}

function serializeNode(node: any, indent: number): string {
  var lines: string[] = [];
  var keys = Object.keys(node);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = node[key];
    var prefix = repeatSpaces(indent);
    if (isNodeValue(value)) {
      var child = serializeNode(value, indent + 2);
      lines.push(prefix + key + ":");
      if (child.length > 0) lines.push(child);
    } else {
      lines.push(prefix + key + ": " + serializeScalar(value));
    }
  }
  return lines.join("\n");
}

function serializeScalar(value: any): string {
  if (Array.isArray(value)) {
    return "[" + value.map(function(item) { return serializeScalar(item); }).join(", ") + "]";
  }
  if (value && typeof value === "object" && "$ref" in value) {
    return "{" + value.$ref + "}";
  }
  if (typeof value === "string") {
    return quoteIfNeeded(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return quoteIfNeeded(String(value));
}

function splitInlineArray(text: string, sourceLine: string): string[] {
  var parts: string[] = [];
  var start = 0;
  var quote = "";
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (quote !== "") {
      if (ch === quote && !isEscapedAt(text, i)) quote = "";
      continue;
    }
    if (ch === "\"" || ch === "'") { quote = ch; continue; }
    if (ch === "[" || ch === "]") throw new Error("nested arrays are not supported: " + sourceLine);
    if (ch === ",") { parts.push(text.slice(start, i)); start = i + 1; }
  }
  if (quote !== "") throw new Error("Invalid quoted value in inline array: " + sourceLine);
  parts.push(text.slice(start));
  return parts;
}

function isEscapedAt(text: string, index: number): boolean {
  var slashes = 0;
  for (var i = index - 1; i >= 0 && text.charAt(i) === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function collectComponentTokens(node: DesignMdNode, parts: string[], reserved: string[], tokens: Record<string, string>): void {
  var keys = Object.keys(node);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (parts.length === 0 && reserved.indexOf(key) !== -1) continue;
    var value = node[key];
    var nextParts = parts.concat(key);
    if (isNodeValue(value)) collectComponentTokens(value, nextParts, reserved, tokens);
    else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null || isRefValue(value)) {
      tokens[nextParts.join(".")] = isRefValue(value) ? "{" + value.$ref + "}" : String(value);
    }
  }
}

function hasManifestKey(node: DesignMdNode): boolean {
  return ["aliases", "variants", "states", "anatomy"].some(function(key) { return Object.prototype.hasOwnProperty.call(node, key); });
}

function describeValue(value: any): string {
  if (Array.isArray(value)) return "array containing " + value.map(function(item) { return typeof item; }).join(", ");
  if (value === null) return "null";
  return typeof value;
}

function quoteIfNeeded(value: string): string {
  if (value === "") return "\"\"";
  if (/^[A-Za-z0-9._/-]+$/.test(value) && !/^(true|false|null|\d+)$/.test(value)) return value;
  return JSON.stringify(value);
}

function countLeadingSpaces(text: string): number {
  var count = 0;
  while (count < text.length && text.charAt(count) === " ") count++;
  return count;
}

function repeatSpaces(count: number): string {
  var out = "";
  for (var i = 0; i < count; i++) out += " ";
  return out;
}

function isNodeValue(value: any): value is DesignMdNode {
  return !!value && typeof value === "object" && !Array.isArray(value) && !("$ref" in value) && !("$value" in value);
}

function isRefValue(value: any): value is DesignMdRef {
  return !!value && typeof value === "object" && !Array.isArray(value) && "$ref" in value;
}

function cssVarFromPath(pathParts: string[]): string {
  if (pathParts.length === 0) return "--token";
  var top = pathParts[0];
  if (top === "colors" || top === "color") {
    return "--color-" + pathParts.slice(1).join("-").replace(/\./g, "-");
  }
  if (top === "rounded" || top === "radius") {
    return "--radius-" + pathParts.slice(1).join("-").replace(/\./g, "-");
  }
  if (top === "spacing") {
    return "--spacing-" + pathParts.slice(1).join("-").replace(/\./g, "-");
  }
  if (top === "components") {
    return "--component-" + pathParts.slice(1).join("-").replace(/\./g, "-");
  }
  if (top === "typography") {
    var group = pathParts[1] || "";
    var rest = pathParts.slice(2).join("-").replace(/\./g, "-");
    var property = pathParts[2] || "";
    var name = kebabCase(group);
    if (property === "fontFamily") return "--font-" + name;
    if (property === "fontSize") return "--text-" + name;
    if (property === "fontWeight") return "--font-weight-" + name;
    if (property === "lineHeight") return "--leading-" + name;
    if (property === "letterSpacing") return "--tracking-" + name;
    if (group === "font-family") return "--font-" + rest;
    if (group === "font-size") return "--text-" + rest;
    if (group === "font-weight") return "--font-weight-" + rest;
    if (group === "line-height") return "--leading-" + rest;
    if (group === "letter-spacing") return "--tracking-" + rest;
    return "--typography-" + pathParts.slice(1).join("-").replace(/\./g, "-");
  }
  return "--" + pathParts.join("-").replace(/\./g, "-");
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function pathFromParts(parts: string[]): string {
  var filtered: string[] = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] && parts[i].length > 0) filtered.push(parts[i]);
  }
  return filtered.join(".");
}

function joinTokenPath(group: string, name: string): string {
  if (!group) return name;
  if (!name) return group;
  if (name === group || name.indexOf(group + ".") === 0) return name;
  return group + "." + name;
}

function setNodeAtPath(root: DesignMdNode, path: string, value: any): void {
  var parts = path.split(".").filter(Boolean);
  if (parts.length === 0) throw new Error("Empty token path");
  var node: any = root;
  for (var i = 0; i < parts.length - 1; i++) {
    var key = parts[i];
    var next = node[key];
    if (next !== undefined && !isNodeValue(next)) {
      throw new Error("Cannot set " + path + ": " + parts.slice(0, i + 1).join(".") + " is an existing scalar, not a group");
    }
    if (!isNodeValue(next)) {
      next = {};
      node[key] = next;
    }
    node = next;
  }
  node[parts[parts.length - 1]] = value;
}

function getNodeAtPath(root: DesignMdNode, path: string): any {
  var parts = path.split(".").filter(Boolean);
  var node: any = root;
  for (var i = 0; i < parts.length; i++) {
    if (!node || typeof node !== "object") return undefined;
    node = node[parts[i]];
  }
  return node;
}

function deleteNodeAtPath(root: DesignMdNode, path: string): void {
  var parts = path.split(".").filter(Boolean);
  if (parts.length === 0) throw new Error("Empty token path");
  var stack: Array<{ node: any; key: string }> = [];
  var node: any = root;
  for (var i = 0; i < parts.length - 1; i++) {
    if (!node || typeof node !== "object") throw new Error("Token path not found: " + path);
    stack.push({ node: node, key: parts[i] });
    node = node[parts[i]];
  }
  if (!node || typeof node !== "object" || !(parts[parts.length - 1] in node)) {
    throw new Error("Token path not found: " + path);
  }
  delete node[parts[parts.length - 1]];
  pruneEmptyParents(root, stack, node);
}

function renameNodeAtPath(root: DesignMdNode, fromPath: string, toPath: string): void {
  var value = getNodeAtPath(root, fromPath);
  if (typeof value === "undefined") {
    throw new Error("Token path not found: " + fromPath);
  }
  if (typeof getNodeAtPath(root, toPath) !== "undefined") {
    throw new Error("Cannot rename " + fromPath + " to " + toPath + ": destination already exists");
  }
  deleteNodeAtPath(root, fromPath);
  setNodeAtPath(root, toPath, value);
}

function pruneEmptyParents(root: DesignMdNode, stack: Array<{ node: any; key: string }>, current: any): void {
  var node = current;
  for (var i = stack.length - 1; i >= 0; i--) {
    if (node && typeof node === "object" && !Array.isArray(node) && Object.keys(node).length === 0) {
      var parent = stack[i].node;
      delete parent[stack[i].key];
      node = parent;
    } else {
      break;
    }
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRename(input: DesignMdUpdateRename): { group: string; from: string; to: string } {
  var rawFrom = input.from || input.name || "";
  var rawTo = input.to || input.new_name || "";
  if (!input.group || !rawFrom || !rawTo) {
    throw new Error("rename requires group, from/name, and to/new_name");
  }
  var from = joinTokenPath(input.group, rawFrom);
  var to = joinTokenPath(input.group, rawTo);
  return { group: input.group, from: from, to: to };
}

function normalizeRemove(input: DesignMdUpdateRemove): string {
  var raw = input.path || input.name || "";
  if (!input.group || !raw) {
    throw new Error("remove requires group and name/path");
  }
  var path = joinTokenPath(input.group, raw);
  return path;
}

function normalizeSetValue(value: any): any {
  if (typeof value === "string" && /^\{[A-Za-z0-9_.-]+\}$/.test(value)) {
    return { $ref: value.slice(1, -1) };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if ("ref" in value && typeof value.ref === "string" && !("$ref" in value)) {
      return { $ref: value.ref };
    }
    if ("$ref" in value && typeof value.$ref === "string") {
      return { $ref: value.$ref };
    }
    throw new Error("set value must be a scalar or a {group.name} reference");
  }
  return value;
}

function validateDesignMdRefs(frontmatter: DesignMdNode): void {
  var leafPaths = new Set<string>();
  var refs: Array<{ path: string; ref: string }> = [];

  function walk(node: any, pathParts: string[]): void {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.charAt(0) === "$") continue;
      var value = node[key];
      var next = pathParts.concat([key]);
      if (isNodeValue(value)) {
        // Composite tokens (e.g. typography.button) are legal ref targets per the spec.
        leafPaths.add(next.join("."));
        walk(value, next);
      } else {
        var path = next.join(".");
        leafPaths.add(path);
        if (isRefValue(value)) refs.push({ path: path, ref: value.$ref });
      }
    }
  }

  walk(frontmatter, []);

  for (var i = 0; i < refs.length; i++) {
    if (!leafPaths.has(refs[i].ref)) {
      throw new Error("Broken DESIGN.md reference at " + refs[i].path + ": {" + refs[i].ref + "} does not resolve");
    }
  }
}
