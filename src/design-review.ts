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
  // Set only when a recorded decision governs this finding's category+scope (association,
  // NOT a verified contradiction of the decision's rule — see attributeDecisions).
  governed_by?: { id: string; statement: string };
}

export interface DesignReviewResult {
  verdict: "pass" | "warn" | "fail";
  findings: DesignReviewFinding[];
  applicable_decisions: Array<{ id: string; statement: string; scope: string }>;
  // Violation findings a recorded decision governs (same category + scope); present only when
  // non-empty. Association for review attention — does NOT assert the diff contradicts the decision.
  governed_findings?: Array<{ decision_id: string; file: string; line: number; rule: string }>;
  // Echoes an active opt-in escalation policy. fail_on_governed escalates findings a recorded
  // decision GOVERNS (it63 lexical scope+category association, NOT verified contradiction) to error.
  severity_policy?: { fail_on_governed?: boolean };
  checks_skipped?: Array<"color-tokens" | "spacing-tokens" | "typography-tokens">;
  note?: string;
  stats: {
    files_changed: number;
    ui_files: number;
    added_lines_checked: number;
  };
}

export type PolishKind = "color" | "spacing" | "font";

export interface ProposedPolishChange {
  file: string;
  line: number;
  before: string;
  after: string;
  token: string;
  kind: PolishKind;
  substitutions?: Array<{ token: string; kind: PolishKind }>;
}

export interface PolishResult {
  verdict: DesignReviewResult["verdict"];
  findings: DesignReviewFinding[];
  proposed_changes: ProposedPolishChange[];
  patch: string;
  manual: Array<{ file: string; line: number; summary: string; why: string }>;
  post_polish: {
    findings_resolved: number;
    findings_remaining: number;
    remaining: string[];
  };
  decisions: DesignReviewResult["applicable_decisions"];
  checks_skipped?: DesignReviewResult["checks_skipped"];
  note?: string;
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

interface AutoFixCandidate {
  file: string;
  line: number;
  start: number;
  end: number;
  replacement: string;
  token: string;
  kind: PolishKind;
  finding: DesignReviewFinding;
}

interface ReviewContext {
  files: ParsedDiffFile[];
  uiFiles: ParsedDiffFile[];
  postImages: FinalPostImageFile[];
  vocabulary: ReviewVocabulary;
  result: DesignReviewResult;
  autoFixes: AutoFixCandidate[];
}

interface DiffBodyLine {
  kind: " " | "+" | "-";
  content: string;
  noNewline: boolean;
}

interface DiffSectionHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffBodyLine[];
}

interface DiffFileSection {
  file: string;
  hunks: DiffSectionHunk[];
  crlf: boolean;
}

interface FinalPostImageFile extends ParsedDiffFile {
  crlf: boolean;
  noNewlineLines: Set<number>;
  knownLines: Map<number, { content: string; noNewline: boolean }>;
}

interface VirtualPostImageLine {
  content: string;
  changed: boolean;
  noNewline: boolean;
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

export function reviewDiff(diff: string, designMd: string | null, decisions: DecisionNode[], project?: string, failOnGoverned?: boolean): DesignReviewResult {
  return performReview(diff, designMd, decisions, project, false, failOnGoverned).result;
}

export function proposePolish(diff: string, designMd: string | null, decisions: DecisionNode[], project?: string): PolishResult {
  var reviewed = performReview(diff, designMd, decisions, project, true);
  var grouped = new Map<string, AutoFixCandidate[]>();
  for (var fixIndex = 0; fixIndex < reviewed.autoFixes.length; fixIndex++) {
    var fix = reviewed.autoFixes[fixIndex];
    var fixKey = fix.file + "\u0000" + fix.line;
    var existingFixes = grouped.get(fixKey) || [];
    existingFixes.push(fix);
    grouped.set(fixKey, existingFixes);
  }

  var proposedChanges: ProposedPolishChange[] = [];
  var replacementLines = new Map<string, string>();
  grouped.forEach(function(lineFixes, key) {
    var parts = key.split("\u0000");
    var file = parts[0];
    var line = Number(parts[1]);
    var parsedFile = reviewed.uiFiles.find(function(item) { return item.file === file; });
    var added = parsedFile && parsedFile.addedLines.find(function(item) { return item.line === line; });
    if (!added) return;
    var ordered = lineFixes.slice().sort(function(a, b) { return b.start - a.start; });
    var after = added.content;
    for (var orderedIndex = 0; orderedIndex < ordered.length; orderedIndex++) {
      var orderedFix = ordered[orderedIndex];
      after = after.slice(0, orderedFix.start) + orderedFix.replacement + after.slice(orderedFix.end);
    }
    if (after === added.content) return;
    var first = lineFixes[0];
    var change: ProposedPolishChange = {
      file: file,
      line: line,
      before: added.content,
      after: after,
      token: first.token,
      kind: first.kind,
    };
    if (lineFixes.length > 1) {
      change.substitutions = lineFixes.map(function(item) { return { token: item.token, kind: item.kind }; });
    }
    proposedChanges.push(change);
    replacementLines.set(key, after);
  });
  proposedChanges.sort(function(a, b) { return a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file); });

  var autoFixedFindings = new Set(reviewed.autoFixes.filter(function(fix) {
    return replacementLines.has(fix.file + "\u0000" + fix.line);
  }).map(function(fix) { return fix.finding; }));
  var manual = reviewed.result.findings.filter(function(finding) {
    return isViolationFinding(finding) && !autoFixedFindings.has(finding);
  }).map(function(finding) {
    return {
      file: finding.file,
      line: finding.line,
      summary: finding.message,
      why: finding.rule === "bare-hex-color" && /alpha/.test(finding.message)
        ? "alpha color — needs design judgment"
        : "no deterministic token substitution",
    };
  });

  var postReview = reviewDiff(buildPostImageReviewDiff(reviewed.files, replacementLines), designMd, decisions, project);
  var initialViolations = reviewed.result.findings.filter(isViolationFinding);
  var remainingViolations = postReview.findings.filter(isViolationFinding);

  var result: PolishResult = {
    verdict: reviewed.result.verdict,
    findings: reviewed.result.findings,
    proposed_changes: proposedChanges,
    patch: buildPolishPatch(proposedChanges, reviewed.postImages),
    manual: manual,
    post_polish: {
      findings_resolved: Math.max(0, initialViolations.length - remainingViolations.length),
      findings_remaining: remainingViolations.length,
      remaining: remainingViolations.map(function(finding) {
        return finding.file + ":" + finding.line + " [" + finding.rule + "] " + finding.message;
      }),
    },
    decisions: reviewed.result.applicable_decisions,
  };
  if (reviewed.result.checks_skipped) result.checks_skipped = reviewed.result.checks_skipped;
  if (reviewed.result.note) result.note = reviewed.result.note;
  return result;
}

function performReview(diff: string, designMd: string | null, decisions: DecisionNode[], project: string | undefined, collectAutoFixes: boolean, failOnGoverned?: boolean): ReviewContext {
  if (diff.trim().length === 0) throw new Error("empty diff");
  var postImages = reconstructFinalPostImages(diff);
  if (postImages.length === 0) throw new Error("not a unified diff");
  var files: ParsedDiffFile[] = postImages.map(function(file) {
    return { file: file.file, addedLines: file.addedLines };
  });
  var uiFiles = files.filter(function(file) { return isUiFile(file.file); });
  var vocabulary = designMd === null ? emptyVocabulary() : extractVocabulary(designMd);
  var findings: DesignReviewFinding[] = [];
  var autoFixes: AutoFixCandidate[] = [];
  reviewFiles(uiFiles, vocabulary, findings, collectAutoFixes ? autoFixes : undefined);

  var violations = findings.filter(isViolationFinding);
  var applicable = applicableDecisions(files, decisions, project);
  var decisionViolations = attributeDecisions(violations, applicable, project);
  if (failOnGoverned) {
    for (var vi = 0; vi < violations.length; vi++) {
      if (violations[vi].governed_by) violations[vi].severity = "error";
    }
  }
  var verdict: DesignReviewResult["verdict"] = violations.some(function(finding) {
    return finding.severity === "error";
  }) ? "fail" : violations.some(function(finding) {
    return finding.severity === "warn";
  }) ? "warn" : "pass";

  var result: DesignReviewResult = {
    verdict: verdict,
    findings: findings,
    applicable_decisions: applicable,
    stats: {
      files_changed: files.length,
      ui_files: uiFiles.length,
      added_lines_checked: uiFiles.reduce(function(total, file) { return total + file.addedLines.length; }, 0),
    },
  };
  if (decisionViolations.length > 0) result.governed_findings = decisionViolations;
  if (failOnGoverned) result.severity_policy = { fail_on_governed: true };
  var checksSkipped: DesignReviewResult["checks_skipped"] = [];
  if (vocabulary.colors.length === 0) checksSkipped.push("color-tokens");
  if (vocabulary.spacing.length === 0) checksSkipped.push("spacing-tokens");
  if (vocabulary.fontSizes.length === 0 && vocabulary.fontFamilies.length === 0) checksSkipped.push("typography-tokens");
  if (checksSkipped.length > 0) {
    result.checks_skipped = checksSkipped;
    result.note = "token checks skipped: no DESIGN.md tokens found — pass reflects only universal rules";
  }
  return { files: files, uiFiles: uiFiles, postImages: postImages, vocabulary: vocabulary, result: result, autoFixes: autoFixes };
}

function reviewFiles(files: ParsedDiffFile[], vocabulary: ReviewVocabulary, findings: DesignReviewFinding[], autoFixes?: AutoFixCandidate[]): void {
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var extension = fileExtension(file.file);
    var tracksStyleBlock = extension === "vue" || extension === "svelte";
    var inStyleBlock = false;
    for (var j = 0; j < file.addedLines.length; j++) {
      var addedLine = file.addedLines[j];
      if (tracksStyleBlock && /<style\b/i.test(addedLine.content)) inStyleBlock = true;
      reviewLine(file.file, addedLine, vocabulary, findings, inStyleBlock, autoFixes);
      if (tracksStyleBlock && /<\/style\s*>/i.test(addedLine.content)) inStyleBlock = false;
    }
  }
}

function reviewLine(file: string, added: DiffAddedLine, vocabulary: ReviewVocabulary, findings: DesignReviewFinding[], inStyleBlock: boolean, autoFixes?: AutoFixCandidate[]): void {
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
      var alpha = colorHasAlpha(colorMatch[0]);
      var exactColor = findExactColorToken(colorMatch[0], vocabulary.colors);
      if (exactColor) {
        findings.push(tokenValueMatchFinding(file, added.line, colorMatch[0], exactColor.name));
        continue;
      }
      var nearestColor = nearestByDistance(vocabulary.colors, function(token) { return colorDistance(parsedRgb, token.rgb); });
      var colorFinding: DesignReviewFinding = {
        file: file,
        line: added.line,
        severity: "warn",
        rule: "bare-hex-color",
        message: "Hardcoded color " + colorMatch[0] + " bypasses the project color tokens." + (alpha ? " It has alpha — no token suggestion." : ""),
      };
      if (!alpha) colorFinding.suggestion = "Use " + nearestColor.name + " (" + nearestColor.value + ").";
      findings.push(colorFinding);
      if (!alpha && autoFixes) autoFixes.push({
        file: file, line: added.line, start: colorMatch.index, end: colorMatch.index + colorMatch[0].length,
        replacement: nearestColor.value, token: nearestColor.name, kind: "color", finding: colorFinding,
      });
    }
  }

  if (vocabulary.fontSizes.length > 0) {
    var fontSizes: Array<{ raw: string; px: number; normalizedPx: number | null; start: number; end: number }> = [];
    var fontSizePattern = /(?:font-size|fontSize)\s*[:=]\s*["']?(\d+(?:\.\d+)?)\s*(px|rem|em|\.?sp|pt)?\b/g;
    var fontSizeMatch: RegExpExecArray | null;
    while ((fontSizeMatch = fontSizePattern.exec(content)) !== null) {
      var fontLiteralIndex = fontSizeMatch.index + fontSizeMatch[0].lastIndexOf(fontSizeMatch[1]);
      if (!hasCssPropertyContext(content, fontLiteralIndex)) continue;
      var fontUnit = (fontSizeMatch[2] || "").replace(/^\./, "");
      var fontNumber = Number(fontSizeMatch[1]);
      var fontRaw = fontSizeMatch[1] + fontUnit;
      var normalizedFontPx = fontUnit === "px"
        ? fontNumber
        : fontUnit === "rem" || fontUnit === "em"
          ? fontNumber * 16
          : fontUnit === "pt"
            ? fontNumber * 4 / 3
            : null;
      fontSizes.push({
        raw: fontRaw,
        px: fontUnit === "rem" || fontUnit === "em" ? fontNumber * 16 : fontNumber,
        normalizedPx: normalizedFontPx,
        start: fontLiteralIndex,
        end: fontLiteralIndex + fontRaw.length,
      });
    }
    var swiftFontSizePattern = /\.font\(\.(?:system\(size:|custom\([^,]+,\s*size:)\s*(\d+(?:\.\d+)?)/g;
    var swiftFontSizeMatch: RegExpExecArray | null;
    while ((swiftFontSizeMatch = swiftFontSizePattern.exec(content)) !== null) {
      var swiftLiteralIndex = swiftFontSizeMatch.index + swiftFontSizeMatch[0].lastIndexOf(swiftFontSizeMatch[1]);
      if (!hasCssPropertyContext(content, swiftLiteralIndex)) continue;
      fontSizes.push({ raw: swiftFontSizeMatch[1], px: Number(swiftFontSizeMatch[1]), normalizedPx: null, start: swiftLiteralIndex, end: swiftLiteralIndex + swiftFontSizeMatch[1].length });
    }
    for (var fontSizeIndex = 0; fontSizeIndex < fontSizes.length; fontSizeIndex++) {
      var fontSize = fontSizes[fontSizeIndex];
      var fontPx = fontSize.normalizedPx === null ? fontSize.px : fontSize.normalizedPx;
      var exactFontSize = fontSize.normalizedPx === null ? undefined : vocabulary.fontSizes.find(function(token) {
        return token.px === fontSize.normalizedPx;
      });
      if (exactFontSize) {
        findings.push(tokenValueMatchFinding(file, added.line, fontSize.raw, exactFontSize.name));
        continue;
      }
      var nearestFontSize = nearestByDistance(vocabulary.fontSizes, function(token) { return Math.abs(fontPx - token.px); });
      var fontSizeFinding: DesignReviewFinding = {
        file: file,
        line: added.line,
        severity: "warn",
        rule: "hardcoded-font-size",
        message: "Hardcoded font size " + fontSize.raw + " bypasses the project typography tokens.",
        suggestion: "Use " + nearestFontSize.name + " (" + nearestFontSize.value + ").",
      };
      findings.push(fontSizeFinding);
      if (autoFixes) autoFixes.push({
        file: file, line: added.line, start: fontSize.start, end: fontSize.end,
        replacement: nearestFontSize.value, token: nearestFontSize.name, kind: "font", finding: fontSizeFinding,
      });
    }
  }

  if (vocabulary.fontFamilies.length > 0) {
    var families: Array<{ value: string; start: number; end: number }> = [];
    var cssFamilyPattern = /font-family\s*:\s*([^;}]+)/g;
    var cssFamilyMatch: RegExpExecArray | null;
    while ((cssFamilyMatch = cssFamilyPattern.exec(content)) !== null) {
      if (!hasCssPropertyContext(content, cssFamilyMatch.index + cssFamilyMatch[0].indexOf(cssFamilyMatch[1]))) continue;
      var cssFamilyRaw = cssFamilyMatch[1];
      var cssFamilyTrimmed = cssFamilyRaw.trim();
      var cssFamilyStart = cssFamilyMatch.index + cssFamilyMatch[0].indexOf(cssFamilyRaw) + cssFamilyRaw.indexOf(cssFamilyTrimmed);
      families.push({ value: cssFamilyTrimmed, start: cssFamilyStart, end: cssFamilyStart + cssFamilyTrimmed.length });
    }
    var jsFamilyPattern = /fontFamily\s*:\s*(["'])(.*?)\1/g;
    var jsFamilyMatch: RegExpExecArray | null;
    while ((jsFamilyMatch = jsFamilyPattern.exec(content)) !== null) {
      if (!hasCssPropertyContext(content, jsFamilyMatch.index + jsFamilyMatch[0].indexOf(jsFamilyMatch[2]))) continue;
      var jsFamilyStart = jsFamilyMatch.index + jsFamilyMatch[0].indexOf(jsFamilyMatch[2]);
      families.push({ value: jsFamilyMatch[2], start: jsFamilyStart, end: jsFamilyStart + jsFamilyMatch[2].length });
    }
    var swiftFamilyPattern = /\.font\(\.custom\(\s*(["'])(.*?)\1\s*,/g;
    var swiftFamilyMatch: RegExpExecArray | null;
    while ((swiftFamilyMatch = swiftFamilyPattern.exec(content)) !== null) {
      if (!hasCssPropertyContext(content, swiftFamilyMatch.index + swiftFamilyMatch[0].indexOf(swiftFamilyMatch[2]))) continue;
      var swiftFamilyStart = swiftFamilyMatch.index + swiftFamilyMatch[0].indexOf(swiftFamilyMatch[2]);
      families.push({ value: swiftFamilyMatch[2], start: swiftFamilyStart, end: swiftFamilyStart + swiftFamilyMatch[2].length });
    }
    for (var familyIndex = 0; familyIndex < families.length; familyIndex++) {
      var familyLiteral = families[familyIndex];
      var family = familyLiteral.value;
      if (family.indexOf("var(") !== -1) continue;
      var exactFontFamily = vocabulary.fontFamilies.find(function(token) {
        return normalizeFontFamilyValue(family) === normalizeFontFamilyValue(token.value);
      });
      if (exactFontFamily) {
        findings.push(tokenValueMatchFinding(file, added.line, family, exactFontFamily.name));
        continue;
      }
      var nearestFontFamily = nearestByDistance(vocabulary.fontFamilies, function(token) {
        return levenshtein(normalizeText(family), normalizeText(token.value));
      });
      var fontFamilyFinding: DesignReviewFinding = {
        file: file,
        line: added.line,
        severity: "warn",
        rule: "hardcoded-font-family",
        message: "Hardcoded font family " + family + " bypasses the project typography tokens.",
        suggestion: "Use " + nearestFontFamily.name + " (" + nearestFontFamily.value + ").",
      };
      findings.push(fontFamilyFinding);
      if (autoFixes) autoFixes.push({
        file: file, line: added.line, start: familyLiteral.start, end: familyLiteral.end,
        replacement: nearestFontFamily.value, token: nearestFontFamily.name, kind: "font", finding: fontFamilyFinding,
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
        var spacingRaw = pxMatch[0];
        var exactSpacing = vocabulary.spacing.find(function(token) { return token.px === spacingPx; });
        if (exactSpacing) {
          findings.push(tokenValueMatchFinding(file, added.line, spacingRaw, exactSpacing.name));
          continue;
        }
        var nearestSpacing = nearestByDistance(vocabulary.spacing, function(token) { return Math.abs(spacingPx - token.px); });
        var spacingFinding: DesignReviewFinding = {
          file: file,
          line: added.line,
          severity: "info",
          rule: "hardcoded-spacing",
          message: "Hardcoded spacing " + pxMatch[1] + "px bypasses the project spacing tokens.",
          suggestion: "Use " + nearestSpacing.name + " (" + nearestSpacing.value + ").",
        };
        findings.push(spacingFinding);
        if (autoFixes) autoFixes.push({
          file: file, line: added.line, start: spacingLiteralIndex, end: spacingLiteralIndex + spacingRaw.length,
          replacement: nearestSpacing.value, token: nearestSpacing.name, kind: "spacing", finding: spacingFinding,
        });
      }
    }
  }
}

function isViolationFinding(finding: DesignReviewFinding): boolean {
  return finding.rule !== "token-value-match";
}

function tokenValueMatchFinding(file: string, line: number, value: string, tokenName: string): DesignReviewFinding {
  return {
    file: file,
    line: line,
    severity: "info",
    rule: "token-value-match",
    message: "Value " + value + " matches " + tokenName + " — consider referencing the token instead of inlining the literal.",
  };
}

function findExactColorToken(value: string, tokens: Array<ReviewToken & { rgb: Rgb }>): (ReviewToken & { rgb: Rgb }) | undefined {
  var normalized = normalizeColorValue(value);
  if (normalized === null) return undefined;
  return tokens.find(function(token) { return normalizeColorValue(token.value) === normalized; });
}

function normalizeColorValue(value: string): string | null {
  var trimmed = value.trim();
  var hex = trimmed.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    var digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits.split("").map(function(digit) { return digit + digit; }).join("");
    }
    if (digits.length === 6) digits += "ff";
    if (digits.length !== 8) return null;
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
      parseInt(digits.slice(6, 8), 16) / 255,
    ].join(",");
  }
  var rgb = trimmed.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?|\.\d+))?\s*\)$/i);
  if (!rgb) return null;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])].join(",");
}

function buildPostImageReviewDiff(files: ParsedDiffFile[], replacementLines: Map<string, string>): string {
  var sections: string[] = [];
  for (var fileIndex = 0; fileIndex < files.length; fileIndex++) {
    var file = files[fileIndex];
    var lines = [
      "diff --git a/" + file.file + " b/" + file.file,
      "--- a/" + file.file,
      "+++ b/" + file.file,
    ];
    if (file.addedLines.length === 0) lines.push("@@ -0,0 +0,0 @@");
    for (var lineIndex = 0; lineIndex < file.addedLines.length; lineIndex++) {
      var added = file.addedLines[lineIndex];
      var content = replacementLines.get(file.file + "\u0000" + added.line) || added.content;
      lines.push("@@ -" + Math.max(0, added.line - 1) + ",0 +" + added.line + ",1 @@");
      lines.push("+" + content);
    }
    sections.push(lines.join("\n"));
  }
  return sections.join("\n");
}

function reconstructFinalPostImages(diff: string): FinalPostImageFile[] {
  var sections = parseDiffFileSections(diff);
  var order: string[] = [];
  var states = new Map<string, { lines: Map<number, VirtualPostImageLine>; crlf: boolean }>();
  for (var sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    var section = sections[sectionIndex];
    if (!section.file) continue;
    var state = states.get(section.file);
    if (!state) {
      state = { lines: new Map<number, VirtualPostImageLine>(), crlf: false };
      states.set(section.file, state);
      order.push(section.file);
    }
    state.crlf = state.crlf || section.crlf;
    var sectionDelta = 0;
    for (var hunkIndex = 0; hunkIndex < section.hunks.length; hunkIndex++) {
      var hunk = section.hunks[hunkIndex];
      var adjustedOldStart = hunk.oldStart + sectionDelta;
      var oldSnapshot = new Map<number, VirtualPostImageLine>();
      for (var oldOffset = 0; oldOffset < hunk.oldCount; oldOffset++) {
        var oldPosition = adjustedOldStart + oldOffset;
        var oldValue = state.lines.get(oldPosition);
        if (oldValue) oldSnapshot.set(oldPosition, oldValue);
      }

      var delta = hunk.newCount - hunk.oldCount;
      var shifted = new Map<number, VirtualPostImageLine>();
      state.lines.forEach(function(value, position) {
        if (hunk.oldCount > 0 && position >= adjustedOldStart && position < adjustedOldStart + hunk.oldCount) return;
        var afterOldRange = hunk.oldCount === 0 ? position > adjustedOldStart : position >= adjustedOldStart + hunk.oldCount;
        shifted.set(afterOldRange ? position + delta : position, value);
      });
      state.lines = shifted;

      var oldCursor = adjustedOldStart;
      var newCursor = hunk.newStart;
      for (var bodyIndex = 0; bodyIndex < hunk.lines.length; bodyIndex++) {
        var body = hunk.lines[bodyIndex];
        if (body.kind === "-") {
          oldCursor++;
          continue;
        }
        if (body.kind === " ") {
          var prior = oldSnapshot.get(oldCursor);
          state.lines.set(newCursor, {
            content: body.content,
            changed: prior ? prior.changed : false,
            noNewline: body.noNewline,
          });
          oldCursor++;
          newCursor++;
          continue;
        }
        state.lines.set(newCursor, { content: body.content, changed: true, noNewline: body.noNewline });
        newCursor++;
      }
      sectionDelta += delta;
    }
  }

  return order.map(function(file) {
    var state = states.get(file) as { lines: Map<number, VirtualPostImageLine>; crlf: boolean };
    var addedLines: DiffAddedLine[] = [];
    var noNewlineLines = new Set<number>();
    var knownLines = new Map<number, { content: string; noNewline: boolean }>();
    Array.from(state.lines.keys()).sort(function(a, b) { return a - b; }).forEach(function(line) {
      var value = state.lines.get(line) as VirtualPostImageLine;
      knownLines.set(line, { content: value.content, noNewline: value.noNewline });
      if (!value.changed) return;
      addedLines.push({ line: line, content: value.content });
      if (value.noNewline) noNewlineLines.add(line);
    });
    return { file: file, addedLines: addedLines, crlf: state.crlf, noNewlineLines: noNewlineLines, knownLines: knownLines };
  });
}

function parseDiffFileSections(diff: string): DiffFileSection[] {
  var rawLines = diff.split("\n");
  var sections: DiffFileSection[] = [];
  var current: DiffFileSection | null = null;

  function normalized(raw: string): string {
    return raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  }

  function beginSection(file: string): DiffFileSection {
    var section = { file: file, hunks: [], crlf: false };
    sections.push(section);
    return section;
  }

  for (var i = 0; i < rawLines.length; i++) {
    var rawLine = rawLines[i];
    var line = normalized(rawLine);
    if (line.indexOf("diff --git ") === 0) {
      var gitHeader = line.match(/^diff --git (?:"?a\/.*?) (?:"?b\/)(.*)"?$/);
      current = beginSection(gitHeader ? stripDiffPath(gitHeader[1]) : "");
      continue;
    }
    if (line.indexOf("--- ") === 0 && i + 1 < rawLines.length && normalized(rawLines[i + 1]).indexOf("+++ ") === 0) {
      if (current === null || current.hunks.length > 0) {
        var oldPath = line.slice(4).trim();
        current = beginSection(oldPath === "/dev/null" ? "" : stripDiffPath(oldPath));
      }
      continue;
    }
    if (current === null) continue;
    if (line.indexOf("rename to ") === 0) {
      current.file = stripDiffPath(line.slice("rename to ".length));
      continue;
    }
    if (line.indexOf("+++ ") === 0) {
      var addedPath = line.slice(4).trim();
      if (addedPath !== "/dev/null") current.file = stripDiffPath(addedPath);
      continue;
    }
    var header = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (!header) continue;
    var hunk: DiffSectionHunk = {
      oldStart: Number(header[1]),
      oldCount: header[2] === undefined ? 1 : Number(header[2]),
      newStart: Number(header[3]),
      newCount: header[4] === undefined ? 1 : Number(header[4]),
      lines: [],
    };
    for (i = i + 1; i < rawLines.length; i++) {
      rawLine = rawLines[i];
      line = normalized(rawLine);
      if (line.indexOf("diff --git ") === 0 || line.indexOf("@@ ") === 0 || line.indexOf("--- ") === 0) {
        i--;
        break;
      }
      var kind = line.charAt(0);
      if (kind === "+" || kind === "-" || kind === " ") {
        var body: DiffBodyLine = { kind: kind as DiffBodyLine["kind"], content: line.slice(1), noNewline: false };
        hunk.lines.push(body);
        if (rawLine.endsWith("\r")) current.crlf = true;
      } else if (line === "\\ No newline at end of file") {
        if (hunk.lines.length > 0) hunk.lines[hunk.lines.length - 1].noNewline = true;
      } else {
        i--;
        break;
      }
    }
    current.hunks.push(hunk);
  }
  return sections.filter(function(section) { return section.file.length > 0 && section.hunks.length > 0; });
}

function buildPolishPatch(changes: ProposedPolishChange[], postImages: FinalPostImageFile[]): string {
  var changesByFile = new Map<string, ProposedPolishChange[]>();
  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];
    var fileChanges = changesByFile.get(change.file) || [];
    fileChanges.push(change);
    changesByFile.set(change.file, fileChanges);
  }
  var sections: string[] = [];
  changesByFile.forEach(function(fileChanges, file) {
    var postImage = postImages.find(function(item) { return item.file === file; });
    if (!postImage) return;
    var lines = ["--- a/" + file, "+++ b/" + file];
    fileChanges.sort(function(a, b) { return a.line - b.line; });
    var changesByLine = new Map<number, ProposedPolishChange>();
    for (var changeIndex = 0; changeIndex < fileChanges.length; changeIndex++) {
      changesByLine.set(fileChanges[changeIndex].line, fileChanges[changeIndex]);
    }
    var knownPositions = Array.from(postImage.knownLines.keys()).sort(function(a, b) { return a - b; });
    var segmentStart = 0;
    while (segmentStart < knownPositions.length) {
      var segmentEnd = segmentStart;
      while (segmentEnd + 1 < knownPositions.length && knownPositions[segmentEnd + 1] === knownPositions[segmentEnd] + 1) segmentEnd++;
      var firstKnown = knownPositions[segmentStart];
      var lastKnown = knownPositions[segmentEnd];
      var segmentChanges = fileChanges.filter(function(item) { return item.line >= firstKnown && item.line <= lastKnown; });
      if (segmentChanges.length > 0) {
        var hunkStart = Math.max(firstKnown, segmentChanges[0].line - 3);
        var hunkEnd = Math.min(lastKnown, segmentChanges[segmentChanges.length - 1].line + 3);
        var hunkCount = hunkEnd - hunkStart + 1;
        lines.push("@@ -" + hunkStart + "," + hunkCount + " +" + hunkStart + "," + hunkCount + " @@");
        for (var position = hunkStart; position <= hunkEnd; position++) {
          var known = postImage.knownLines.get(position) as { content: string; noNewline: boolean };
          var substitution = changesByLine.get(position);
          var suffix = postImage.crlf ? "\r" : "";
          if (substitution) {
            lines.push("-" + substitution.before + suffix);
            if (known.noNewline) lines.push("\\ No newline at end of file");
            lines.push("+" + substitution.after + suffix);
            if (known.noNewline) lines.push("\\ No newline at end of file");
          } else {
            lines.push(" " + known.content + suffix);
            if (known.noNewline) lines.push("\\ No newline at end of file");
          }
        }
      }
      segmentStart = segmentEnd + 1;
    }
    sections.push(lines.join("\n"));
  });
  return sections.length === 0 ? "" : sections.join("\n") + "\n";
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

// Which finding rules a recorded decision must lexically mention to govern that finding.
// Deterministic category match — NOT semantic contradiction. token-value-match is info-only
// (never a violation) so it is intentionally absent.
var DECISION_RULE_KEYWORDS: { [rule: string]: string[] } = {
  "bare-hex-color": ["color", "colour", "hex", "palette", "accent", "token"],
  "hardcoded-font-size": ["font", "type", "typography", "size", "weight", "scale"],
  "hardcoded-font-family": ["font", "type", "typography", "family", "weight"],
  "hardcoded-spacing": ["spacing", "space", "gap", "padding", "margin", "scale", "rhythm"],
  "important": ["important", "override", "specificity", "cascade"],
};

// Path tokens for a SINGLE file (mirrors applicableDecisions' tokenizing, scoped to one path)
// so a checkout-scoped decision governs only findings in checkout files, not the whole diff.
function filePathTokens(filePath: string, project?: string): Set<string> {
  var tokens = new Set<string>();
  var paths = project ? [filePath, project] : [filePath];
  for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    var segments = paths[pathIndex].toLowerCase().split(/[\\/]+/).filter(Boolean);
    for (var segmentIndex = 0; segmentIndex < segments.length - 1; segmentIndex++) tokens.add(segments[segmentIndex]);
    if (segments.length > 0) {
      var filename = segments[segments.length - 1].replace(/\.[^.]+$/, "");
      var words = filename.split(/[-_.]+/).filter(Boolean);
      for (var wordIndex = 0; wordIndex < words.length; wordIndex++) tokens.add(words[wordIndex]);
    }
  }
  return tokens;
}

function decisionMatchesPath(scope: string, statement: string, pathTokens: Set<string>): boolean {
  var terms = (scope + " " + statement).toLowerCase().split(/[^a-z0-9]+/).filter(function(term) {
    return term.length >= 3 && !DECISION_STOP_WORDS.has(term);
  });
  return terms.some(function(term) { return pathTokens.has(term); });
}

function statementHasCategoryKeyword(rule: string, statement: string): boolean {
  var keywords = DECISION_RULE_KEYWORDS[rule];
  if (!keywords) return false;
  var words = new Set(statement.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return keywords.some(function(keyword) { return words.has(keyword) || words.has(keyword + "s"); });
}

// A decision GOVERNS a violation finding when it is applicable to the diff, its scope/statement
// matches the finding's own file path, AND its statement mentions the finding rule's category.
// Mutates governed findings in place (adds governed_by) and returns the escalated subset.
function attributeDecisions(
  violations: DesignReviewFinding[],
  applicable: Array<{ id: string; statement: string; scope: string }>,
  project?: string,
): Array<{ decision_id: string; file: string; line: number; rule: string }> {
  var out: Array<{ decision_id: string; file: string; line: number; rule: string }> = [];
  if (applicable.length === 0) return out;
  for (var vIndex = 0; vIndex < violations.length; vIndex++) {
    var finding = violations[vIndex];
    var fileTokens = filePathTokens(finding.file, project);
    for (var dIndex = 0; dIndex < applicable.length; dIndex++) {
      var decision = applicable[dIndex];
      if (!decisionMatchesPath(decision.scope, decision.statement, fileTokens)) continue;
      if (!statementHasCategoryKeyword(finding.rule, decision.statement)) continue;
      finding.governed_by = { id: decision.id, statement: decision.statement };
      out.push({ decision_id: decision.id, file: finding.file, line: finding.line, rule: finding.rule });
      break;
    }
  }
  return out;
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

function normalizeFontFamilyValue(value: string): string {
  return value.split(",").map(function(part) {
    return part.trim().replace(/^(?:["'])(.*)(?:["'])$/, "$1").toLowerCase();
  }).join(",");
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
