import { flattenDesignTokens, parseDesignMd } from "./designmd.js";
import type { FlattenedDesignToken } from "./designmd.js";
import type { DecisionNode } from "./decision-graph.js";

export interface DiffAddedLine {
  line: number;
  content: string;
}

export interface ParsedDiffFile {
  file: string;
  addedLines: DiffAddedLine[];
}

export interface DesignReviewFinding {
  file: string;
  line: number;
  severity: "info" | "warn" | "error";
  rule: string;
  message: string;
  suggestion?: string;
}

export interface DesignReviewResult {
  verdict: "pass" | "warn" | "fail";
  findings: DesignReviewFinding[];
  applicable_decisions: Array<{ id: string; statement: string; scope: string }>;
  checks_skipped?: Array<"color-tokens" | "spacing-tokens" | "typography-tokens">;
  note?: string;
  stats: {
    files_changed: number;
    ui_files: number;
    added_lines_checked: number;
  };
}

interface ReviewToken {
  name: string;
  value: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface ReviewVocabulary {
  colors: Array<ReviewToken & { rgb: Rgb }>;
  fontSizes: Array<ReviewToken & { px: number }>;
  fontFamilies: ReviewToken[];
  spacing: Array<ReviewToken & { px: number }>;
}

var UI_EXTENSIONS = new Set(["css", "scss", "tsx", "jsx", "ts", "js", "html", "vue", "svelte", "swift", "kt"]);
var DECISION_STOP_WORDS = new Set([
  "and", "are", "card", "for", "from", "into", "keep", "must", "not", "only", "our", "the", "this", "use", "with",
]);

export function parseUnifiedDiff(diff: string): ParsedDiffFile[] {
  var lines = diff.replace(/\r\n/g, "\n").split("\n");
  var files: ParsedDiffFile[] = [];
  var current: ParsedDiffFile | null = null;
  var newLine = 0;
  var inHunk = false;
  var currentHasGitHeader = false;

  function beginFile(header: string): void {
    var match = header.match(/^diff --git (?:"?a\/.*?) (?:"?b\/)(.*)"?$/);
    var file = match ? stripDiffPath(match[1]) : "";
    current = { file: file, addedLines: [] };
    files.push(current);
    newLine = 0;
    inHunk = false;
    currentHasGitHeader = true;
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf("diff --git ") === 0) {
      beginFile(line);
      continue;
    }
    if (line.indexOf("--- ") === 0 && i + 1 < lines.length && lines[i + 1].indexOf("+++ ") === 0) {
      if (current === null || !currentHasGitHeader) {
        var oldPath = line.slice(4).trim();
        current = { file: oldPath === "/dev/null" ? "" : stripDiffPath(oldPath), addedLines: [] };
        files.push(current);
        newLine = 0;
        inHunk = false;
      }
      currentHasGitHeader = false;
      continue;
    }
    if (current === null) continue;
    var active = current as ParsedDiffFile;
    if (line.indexOf("rename to ") === 0) {
      active.file = stripDiffPath(line.slice("rename to ".length));
      continue;
    }
    if (line.indexOf("+++ ") === 0) {
      var addedPath = line.slice(4).trim();
      if (addedPath !== "/dev/null") active.file = stripDiffPath(addedPath);
      continue;
    }
    var hunk = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.charAt(0) === "+") {
      active.addedLines.push({ line: newLine, content: line.slice(1) });
      newLine++;
    } else if (line.charAt(0) === "-") {
      continue;
    } else if (line.indexOf("\\ No newline at end of file") !== 0) {
      newLine++;
    }
  }

  return files;
}

export function reviewDiff(diff: string, designMd: string | null, decisions: DecisionNode[], project?: string): DesignReviewResult {
  if (diff.trim().length === 0) throw new Error("empty diff");
  var files = parseUnifiedDiff(diff);
  if (files.length === 0) throw new Error("not a unified diff");
  var uiFiles = files.filter(function(file) { return isUiFile(file.file); });
  var vocabulary = designMd === null ? emptyVocabulary() : extractVocabulary(designMd);
  var findings: DesignReviewFinding[] = [];

  for (var i = 0; i < uiFiles.length; i++) {
    var file = uiFiles[i];
    var extension = fileExtension(file.file);
    var tracksStyleBlock = extension === "vue" || extension === "svelte";
    var inStyleBlock = false;
    for (var j = 0; j < file.addedLines.length; j++) {
      var addedLine = file.addedLines[j];
      if (tracksStyleBlock && /<style\b/i.test(addedLine.content)) inStyleBlock = true;
      reviewLine(file.file, addedLine, vocabulary, findings, inStyleBlock);
      if (tracksStyleBlock && /<\/style\s*>/i.test(addedLine.content)) inStyleBlock = false;
    }
  }

  var verdict: DesignReviewResult["verdict"] = findings.some(function(finding) {
    return finding.severity === "error";
  }) ? "fail" : findings.some(function(finding) {
    return finding.severity === "warn";
  }) ? "warn" : "pass";

  var result: DesignReviewResult = {
    verdict: verdict,
    findings: findings,
    applicable_decisions: applicableDecisions(files, decisions, project),
    stats: {
      files_changed: files.length,
      ui_files: uiFiles.length,
      added_lines_checked: uiFiles.reduce(function(total, file) { return total + file.addedLines.length; }, 0),
    },
  };
  var checksSkipped: DesignReviewResult["checks_skipped"] = [];
  if (vocabulary.colors.length === 0) checksSkipped.push("color-tokens");
  if (vocabulary.spacing.length === 0) checksSkipped.push("spacing-tokens");
  if (vocabulary.fontSizes.length === 0 && vocabulary.fontFamilies.length === 0) checksSkipped.push("typography-tokens");
  if (checksSkipped.length > 0) {
    result.checks_skipped = checksSkipped;
    result.note = "token checks skipped: no DESIGN.md tokens found — pass reflects only universal rules";
  }
  return result;
}

function reviewLine(file: string, added: DiffAddedLine, vocabulary: ReviewVocabulary, findings: DesignReviewFinding[], inStyleBlock: boolean): void {
  var content = added.content;
  var trimmed = content.trim();
  // ponytail: line heuristics deliberately stop short of parsing every host language and embedded style grammar.
  if (/^(?:\/\/|\/\*|\*|<!--)/.test(trimmed)) return;
  if (/(?:^|[{;\s])(?:--|\$)[A-Za-z0-9_-]+\s*:/.test(content)) return;

  if (containsImportantStyle(file, content, inStyleBlock)) {
    findings.push({
      file: file,
      line: added.line,
      severity: "warn",
      rule: "important",
      message: "!important creates a style-war override that is difficult to maintain.",
      suggestion: "Use the existing cascade, specificity, or component token instead.",
    });
  }

  if (vocabulary.colors.length > 0) {
    var colorPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?(?:\s*,\s*(?:\d+(?:\.\d+)?|\.\d+))?\s*\)/g;
    var colorMatch: RegExpExecArray | null;
    while ((colorMatch = colorPattern.exec(content)) !== null) {
      if (!hasCssPropertyContext(content, colorMatch.index)) continue;
      var rgb = parseColor(colorMatch[0]);
      if (rgb === null) continue;
      var parsedRgb = rgb as Rgb;
      var nearestColor = nearestByDistance(vocabulary.colors, function(token) { return colorDistance(parsedRgb, token.rgb); });
      var alpha = colorHasAlpha(colorMatch[0]);
      var colorFinding: DesignReviewFinding = {
        file: file,
        line: added.line,
        severity: "warn",
        rule: "bare-hex-color",
        message: "Hardcoded color " + colorMatch[0] + " bypasses the project color tokens." + (alpha ? " It has alpha — no token suggestion." : ""),
      };
      if (!alpha) colorFinding.suggestion = "Use " + nearestColor.name + " (" + nearestColor.value + ").";
      findings.push(colorFinding);
    }
  }

  if (vocabulary.fontSizes.length > 0) {
    var fontSizes: Array<{ raw: string; px: number }> = [];
    var fontSizePattern = /(?:font-size|fontSize)\s*[:=]\s*["']?(\d+(?:\.\d+)?)\s*(px|rem|em|\.?sp|pt)?\b/g;
    var fontSizeMatch: RegExpExecArray | null;
    while ((fontSizeMatch = fontSizePattern.exec(content)) !== null) {
      var fontLiteralIndex = fontSizeMatch.index + fontSizeMatch[0].lastIndexOf(fontSizeMatch[1]);
      if (!hasCssPropertyContext(content, fontLiteralIndex)) continue;
      var fontUnit = (fontSizeMatch[2] || "").replace(/^\./, "");
      var fontNumber = Number(fontSizeMatch[1]);
      fontSizes.push({ raw: fontSizeMatch[1] + fontUnit, px: fontUnit === "rem" || fontUnit === "em" ? fontNumber * 16 : fontNumber });
    }
    var swiftFontSizePattern = /\.font\(\.(?:system\(size:|custom\([^,]+,\s*size:)\s*(\d+(?:\.\d+)?)/g;
    var swiftFontSizeMatch: RegExpExecArray | null;
    while ((swiftFontSizeMatch = swiftFontSizePattern.exec(content)) !== null) {
      var swiftLiteralIndex = swiftFontSizeMatch.index + swiftFontSizeMatch[0].lastIndexOf(swiftFontSizeMatch[1]);
      if (!hasCssPropertyContext(content, swiftLiteralIndex)) continue;
      fontSizes.push({ raw: swiftFontSizeMatch[1], px: Number(swiftFontSizeMatch[1]) });
    }
    for (var fontSizeIndex = 0; fontSizeIndex < fontSizes.length; fontSizeIndex++) {
      var fontSize = fontSizes[fontSizeIndex];
      var fontPx = fontSize.px;
      var nearestFontSize = nearestByDistance(vocabulary.fontSizes, function(token) { return Math.abs(fontPx - token.px); });
      findings.push({
        file: file,
        line: added.line,
        severity: "warn",
        rule: "hardcoded-font-size",
        message: "Hardcoded font size " + fontSize.raw + " bypasses the project typography tokens.",
        suggestion: "Use " + nearestFontSize.name + " (" + nearestFontSize.value + ").",
      });
    }
  }

  if (vocabulary.fontFamilies.length > 0) {
    var families: string[] = [];
    var cssFamilyPattern = /font-family\s*:\s*([^;}]+)/g;
    var cssFamilyMatch: RegExpExecArray | null;
    while ((cssFamilyMatch = cssFamilyPattern.exec(content)) !== null) {
      if (!hasCssPropertyContext(content, cssFamilyMatch.index + cssFamilyMatch[0].indexOf(cssFamilyMatch[1]))) continue;
      families.push(cssFamilyMatch[1].trim().replace(/^["']|["']$/g, ""));
    }
    var jsFamilyPattern = /fontFamily\s*:\s*(["'])(.*?)\1/g;
    var jsFamilyMatch: RegExpExecArray | null;
    while ((jsFamilyMatch = jsFamilyPattern.exec(content)) !== null) {
      if (!hasCssPropertyContext(content, jsFamilyMatch.index + jsFamilyMatch[0].indexOf(jsFamilyMatch[2]))) continue;
      families.push(jsFamilyMatch[2]);
    }
    var swiftFamilyPattern = /\.font\(\.custom\(\s*(["'])(.*?)\1\s*,/g;
    var swiftFamilyMatch: RegExpExecArray | null;
    while ((swiftFamilyMatch = swiftFamilyPattern.exec(content)) !== null) {
      if (!hasCssPropertyContext(content, swiftFamilyMatch.index + swiftFamilyMatch[0].indexOf(swiftFamilyMatch[2]))) continue;
      families.push(swiftFamilyMatch[2]);
    }
    for (var familyIndex = 0; familyIndex < families.length; familyIndex++) {
      var family = families[familyIndex];
      if (family.indexOf("var(") !== -1) continue;
      var nearestFontFamily = nearestByDistance(vocabulary.fontFamilies, function(token) {
        return levenshtein(normalizeText(family), normalizeText(token.value));
      });
      findings.push({
        file: file,
        line: added.line,
        severity: "warn",
        rule: "hardcoded-font-family",
        message: "Hardcoded font family " + family + " bypasses the project typography tokens.",
        suggestion: "Use " + nearestFontFamily.name + " (" + nearestFontFamily.value + ").",
      });
    }
  }

  if (vocabulary.spacing.length > 0) {
    var spacingProperty = /(?:margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|gap|row-gap|column-gap|margin[A-Z][A-Za-z]*|padding[A-Z][A-Za-z]*)\s*:\s*([^;}]+)/g;
    var spacingPropertyMatch: RegExpExecArray | null;
    while ((spacingPropertyMatch = spacingProperty.exec(content)) !== null) {
      var pxPattern = /(\d+(?:\.\d+)?)px\b/g;
      var pxMatch: RegExpExecArray | null;
      while ((pxMatch = pxPattern.exec(spacingPropertyMatch[1])) !== null) {
        var spacingLiteralIndex = spacingPropertyMatch.index + spacingPropertyMatch[0].indexOf(spacingPropertyMatch[1]) + pxMatch.index;
        if (!hasCssPropertyContext(content, spacingLiteralIndex)) continue;
        var spacingPx = Number(pxMatch[1]);
        var nearestSpacing = nearestByDistance(vocabulary.spacing, function(token) { return Math.abs(spacingPx - token.px); });
        findings.push({
          file: file,
          line: added.line,
          severity: "info",
          rule: "hardcoded-spacing",
          message: "Hardcoded spacing " + pxMatch[1] + "px bypasses the project spacing tokens.",
          suggestion: "Use " + nearestSpacing.name + " (" + nearestSpacing.value + ").",
        });
      }
    }
  }
}

function extractVocabulary(designMd: string): ReviewVocabulary {
  var parsed = parseDesignMd(designMd);
  var flattened = flattenDesignTokens(parsed.frontmatter);
  var tokens = flattened.slice();
  var supplemental = extractInlineTokens(designMd);
  for (var i = 0; i < supplemental.length; i++) {
    tokens.push(supplemental[i]);
  }

  var vocabulary = emptyVocabulary();
  for (var j = 0; j < tokens.length; j++) {
    var token = tokens[j];
    if (token.kind === "ref" || typeof token.value !== "string") continue;
    var name = token.path;
    var value = token.value.trim();
    var normalizedName = normalizeText(name);
    var rgb = parseColor(value);
    if (rgb !== null) {
      vocabulary.colors.push({ name: name, value: value, rgb: rgb });
    }
    var px = parsePx(value);
    if (px !== null && isFontSizeName(normalizedName, token.group)) {
      vocabulary.fontSizes.push({ name: name, value: value, px: px });
    }
    if (isFontFamilyName(normalizedName, token.group) && px === null) {
      vocabulary.fontFamilies.push({ name: name, value: value });
    }
    if (px !== null && isSpacingName(normalizedName, token.group)) {
      vocabulary.spacing.push({ name: name, value: value, px: px });
    }
  }
  return vocabulary;
}

function extractInlineTokens(designMd: string): FlattenedDesignToken[] {
  var tokens: FlattenedDesignToken[] = [];
  var seen = new Set<string>();

  function addToken(name: string, value: string): void {
    var cleanValue = value.trim().replace(/;$/, "").trim();
    var key = name + "\u0000" + cleanValue;
    if (!cleanValue || seen.has(key)) return;
    seen.add(key);
    tokens.push({ path: name, group: name, name: name, value: cleanValue, kind: "scalar", cssVar: name });
  }

  var lines = designMd.replace(/\r\n/g, "\n").split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var colonPattern = /((?:--|\$)[A-Za-z0-9_-]+)\s*:\s*([^;|]+)/g;
    var colonMatch: RegExpExecArray | null;
    while ((colonMatch = colonPattern.exec(line)) !== null) {
      addToken(colonMatch[1], colonMatch[2]);
    }
    var tableMatch = line.match(/\|\s*((?:--|\$)[A-Za-z0-9_-]+)\s*\|\s*([^|]+)\|/);
    if (tableMatch) addToken(tableMatch[1], tableMatch[2]);
  }
  return tokens;
}

function applicableDecisions(files: ParsedDiffFile[], decisions: DecisionNode[], project?: string): Array<{ id: string; statement: string; scope: string }> {
  var pathTokens = new Set<string>();
  var paths = files.map(function(file) { return file.file; }).concat(project ? [project] : []);
  for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    var segments = paths[pathIndex].toLowerCase().split(/[\\/]+/).filter(Boolean);
    for (var segmentIndex = 0; segmentIndex < segments.length - 1; segmentIndex++) pathTokens.add(segments[segmentIndex]);
    if (segments.length > 0) {
      var filename = segments[segments.length - 1].replace(/\.[^.]+$/, "");
      var filenameWords = filename.split(/[-_.]+/).filter(Boolean);
      for (var wordIndex = 0; wordIndex < filenameWords.length; wordIndex++) pathTokens.add(filenameWords[wordIndex]);
    }
  }
  return decisions.filter(function(decision) {
    if (decision.status === "superseded") return false;
    var scopeTerms = decision.scope.toLowerCase().split(/[^a-z0-9]+/).filter(function(term) {
      return term.length >= 3 && !DECISION_STOP_WORDS.has(term);
    });
    var statementTerms = decision.statement.toLowerCase().split(/[^a-z0-9]+/).filter(function(term) {
      return term.length >= 3 && !DECISION_STOP_WORDS.has(term);
    });
    return scopeTerms.concat(statementTerms).some(function(term) { return pathTokens.has(term); });
  }).map(function(decision) {
    return { id: decision.id, statement: decision.statement, scope: decision.scope };
  });
}

function emptyVocabulary(): ReviewVocabulary {
  return { colors: [], fontSizes: [], fontFamilies: [], spacing: [] };
}

function isUiFile(file: string): boolean {
  var match = file.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match !== null && UI_EXTENSIONS.has(match[1]);
}

function containsImportantStyle(file: string, content: string, inStyleBlock: boolean): boolean {
  if (content.indexOf("!important") === -1) return false;
  var extension = fileExtension(file);
  if (extension === "css" || extension === "scss") return true;
  if ((extension === "vue" || extension === "svelte") && inStyleBlock) return true;
  return /:\s*[^;]*!important/.test(content);
}

function stripDiffPath(path: string): string {
  var clean = path.split("\t", 1)[0].trim().replace(/^"|"$/g, "");
  return clean.indexOf("a/") === 0 || clean.indexOf("b/") === 0 ? clean.slice(2) : clean;
}

function fileExtension(file: string): string {
  return (file.toLowerCase().match(/\.([a-z0-9]+)$/) || ["", ""])[1];
}

function hasCssPropertyContext(content: string, literalIndex: number): boolean {
  var before = content.slice(0, literalIndex);
  var colonIndex = before.lastIndexOf(":");
  if (colonIndex === -1) return false;
  var afterColon = before.slice(colonIndex + 1);
  if (afterColon.indexOf("=") !== -1) return false;
  var propertyMatch = before.slice(0, colonIndex).match(/([A-Za-z][A-Za-z0-9_-]*)\s*$/);
  if (propertyMatch && /^(?:href|src|url|path|pathname|to)$/i.test(propertyMatch[1])) return false;
  if (/url\([^)]*$/i.test(afterColon)) return false;
  if (/(?:https?:)?\/\/[^\s"']*$/i.test(before) || /(?:^|["'])[^"']*[\\/][^"']*$/.test(before)) return false;
  return true;
}

function colorHasAlpha(value: string): boolean {
  var hex = value.match(/^#([0-9a-fA-F]+)$/);
  if (hex && hex[1].length === 8) return true;
  var rgba = value.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*(\d+(?:\.\d+)?|\.\d+)\s*\)$/i);
  return rgba !== null && Number(rgba[1]) < 1;
}

function parseColor(value: string): Rgb | null {
  var trimmed = value.trim();
  var hex = trimmed.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    var digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: parseInt(digits.charAt(0) + digits.charAt(0), 16),
        g: parseInt(digits.charAt(1) + digits.charAt(1), 16),
        b: parseInt(digits.charAt(2) + digits.charAt(2), 16),
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16) };
    }
  }
  var rgb = trimmed.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return null;
}

function parsePx(value: string): number | null {
  var match = value.match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Number(match[1]) : null;
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2);
}

function nearestByDistance<T>(tokens: T[], distance: (token: T) => number): T {
  // Equal-distance ties intentionally keep the first DESIGN.md token in declaration order.
  var nearest = tokens[0];
  var nearestDistance = distance(nearest);
  for (var i = 1; i < tokens.length; i++) {
    var candidateDistance = distance(tokens[i]);
    if (candidateDistance < nearestDistance) {
      nearest = tokens[i];
      nearestDistance = candidateDistance;
    }
  }
  return nearest;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isFontSizeName(name: string, group: string): boolean {
  return /fontsize|typesize|textsize/.test(name) || (/typography|type|font/i.test(group) && /size/.test(name));
}

function isFontFamilyName(name: string, group: string): boolean {
  return /fontfamily|typeface/.test(name) || (/typography|type|font/i.test(group) && /family/.test(name));
}

function isSpacingName(name: string, group: string): boolean {
  return /spacing|space|gap|margin|padding/.test(name) || /spacing|space/i.test(group);
}

function levenshtein(a: string, b: string): number {
  var previous = Array.from({ length: b.length + 1 }, function(_value, index) { return index; });
  for (var i = 1; i <= a.length; i++) {
    var current = [i];
    for (var j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}
