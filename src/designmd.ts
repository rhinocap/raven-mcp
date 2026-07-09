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

export type DesignMdValue = string | number | boolean | null | DesignMdRef | DesignMdNode;

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
    setNodeAtPath(updated, setPath, normalizeSetValue(mutation.set.value));
    operation = { kind: "set", path: setPath };
  } else if (mutation.rename) {
    var rename = normalizeRename(mutation.rename);
    var oldPath = rename.from;
    var newPath = rename.to;
    renameNodeAtPath(updated, oldPath, newPath);
    operation = { kind: "rename", from: oldPath, to: newPath };
  } else if (mutation.remove) {
    var removePath = normalizeRemove(mutation.remove);
    deleteNodeAtPath(updated, removePath);
    operation = { kind: "remove", path: removePath };
  }

  validateDesignMdRefs(updated);

  var doc = {
    frontmatter: updated,
    body: parsed.body
  };
  writeFileSync(abs, serializeDesignMd(doc), "utf8");

  return {
    path: abs,
    frontmatter: updated,
    body: parsed.body,
    tokens: flattenDesignTokens(updated),
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
    var colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      throw new Error("Invalid DESIGN.md frontmatter line: " + raw);
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    var parent = stack[stack.length - 1].node;
    var key = line.slice(0, colonIndex).trim();
    var rest = line.slice(colonIndex + 1).trim();
    if (!key) throw new Error("Invalid DESIGN.md frontmatter key: " + raw);

    if (rest === "") {
      var child: DesignMdNode = {};
      parent[key] = child;
      stack.push({ indent: indent, node: child });
    } else {
      parent[key] = parseScalar(rest);
    }
  }

  return root;
}

function parseScalar(text: string): any {
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
    if (group === "font-family") return "--font-" + rest;
    if (group === "font-size") return "--text-" + rest;
    if (group === "font-weight") return "--font-weight-" + rest;
    if (group === "line-height") return "--leading-" + rest;
    if (group === "letter-spacing") return "--tracking-" + rest;
    return "--typography-" + pathParts.slice(1).join("-").replace(/\./g, "-");
  }
  return "--" + pathParts.join("-").replace(/\./g, "-");
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
