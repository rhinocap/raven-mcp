import { detectOrphanStretch } from "./layout-orphans.js";

export type AuditSurface = "web" | "ios" | "react-native" | "diff" | "video";

export type AuditInput = {
  url?: string;
  html?: string;
  nodes?: unknown;
  source?: string;
  screenshot?: string;
  diff?: string;
  surface?: AuditSurface;
  intent?: string;
  project?: string;
  profile?: string;
};

export type AuditSkipped = { tool: string; reason: string };

export type AuditReport = {
  surface: AuditSurface | null;
  target: string | null;
  project: string | null;
  ran: string[];
  skipped: AuditSkipped[];
  summary: { grade: string; failures: number; warnings: number };
  findings: Record<string, unknown>;
  next: string;
  clarification?: string;
};

type AuditRunner = (tool: string, args: Record<string, unknown>) => unknown | Promise<unknown>;
type NamedAuditRunner = (args: Record<string, unknown>) => unknown | Promise<unknown>;

export type AuditDispatchOptions = {
  run?: AuditRunner;
  runners?: Record<string, NamedAuditRunner | undefined>;
  remote?: boolean;
  remoteGatedTools?: ReadonlySet<string>;
  remoteArgGuards?: Record<string, { params: string[]; message: string }>;
  remoteUrlGuardedTools?: Record<string, string>;
  remoteUrlGuardError?: (url: string) => Promise<string | null>;
};

export const AUDIT_ROUTES: Readonly<Record<AuditSurface, readonly string[]>> = {
  web: [
    "audit_page", "audit_contrast", "audit_tap_targets", "audit_typography",
    "audit_layout", "audit_responsive_visibility", "audit_consistency",
    "audit_content", "audit_taste"
  ],
  ios: ["audit_ios_screen", "audit_ios_a11y", "audit_ios_privacy", "audit_swiftui", "audit_device_frame"],
  "react-native": ["audit_rn"],
  diff: ["review_diff", "audit_parity", "audit_contract", "audit_api_contract", "audit_asset_integrity"],
  video: ["audit_video_playback"]
};

var INTENT_TOOLS: Array<{ match: RegExp; tools: string[] | null }> = [
  { match: /\bpre[ -]?ship\b/i, tools: null },
  { match: /\b(accessibility|a11y)\b/i, tools: ["audit_contrast", "audit_tap_targets", "audit_ios_a11y"] },
  { match: /\b(content|copy)\b/i, tools: ["audit_content", "audit_typography"] },
  { match: /\bcontrast\b/i, tools: ["audit_contrast"] }
];

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function detectAuditSurface(input: AuditInput): AuditSurface | null {
  if (input.surface) return input.surface;

  var candidates = new Set<AuditSurface>();
  var source = nonEmpty(input.source) ? input.source.trim() : "";
  var url = nonEmpty(input.url) ? input.url.trim() : "";

  if (nonEmpty(input.diff) || /^diff --git\b/m.test(source)) candidates.add("diff");
  if (/\.(?:mp4|mov|m4v|webm)(?:[?#].*)?$/i.test(url) || /\b(?:video|clip)\b/i.test(source) && /\.(?:mp4|mov|m4v|webm)\b/i.test(source)) {
    candidates.add("video");
  } else if (url) {
    candidates.add("web");
  }
  if (nonEmpty(input.html) || input.nodes !== undefined && input.nodes !== null) candidates.add("web");
  if (/\.html?(?:\s|$)/i.test(source) || /<html\b|<!doctype\s+html/i.test(source)) candidates.add("web");
  if (/\.swift(?:\s|$)/i.test(source) || /\b(?:import\s+SwiftUI|UIKit|struct\s+\w+\s*:\s*View)\b/.test(source)) candidates.add("ios");
  // ponytail: a bare .tsx path is ambiguous (web React vs RN) — require a real
  // RN signal (react-native import / StyleSheet.create / <View>), else stay
  // unclassified so the dispatcher clarifies instead of silently running audit_rn.
  if (/from\s+["']react-native["']|\bStyleSheet\.create\s*\(|<View\b/.test(source)) candidates.add("react-native");

  return candidates.size === 1 ? Array.from(candidates)[0] : null;
}

export function routeAuditTools(surface: AuditSurface, input: AuditInput = {}): string[] {
  var tools = AUDIT_ROUTES[surface].slice();
  if (surface === "web" && nonEmpty(input.url)) tools[0] = "audit_url";
  if (surface === "ios" && !nonEmpty(input.source)) {
    tools = tools.filter(function(tool) { return tool !== "audit_swiftui"; });
  }

  if (!nonEmpty(input.intent)) return tools;
  for (var filter of INTENT_TOOLS) {
    if (!filter.match.test(input.intent)) continue;
    if (filter.tools === null) {
      if (tools.indexOf("audit_taste") === -1) tools.push("audit_taste");
      return tools;
    }
    // If the intent's tools don't intersect this surface's route (e.g. a11y intent
    // on react-native, whose only tool is audit_rn), fall back to the full route
    // rather than silently running nothing.
    var narrowed = tools.filter(function(tool) { return filter.tools!.indexOf(tool) !== -1; });
    return narrowed.length > 0 ? narrowed : tools;
  }
  return tools;
}

function targetLabel(input: AuditInput): string | null {
  if (nonEmpty(input.url)) return input.url;
  if (nonEmpty(input.diff)) return "diff";
  if (nonEmpty(input.source)) return input.source.length <= 120 && !/[\r\n]/.test(input.source) ? input.source : "source";
  if (nonEmpty(input.screenshot)) return "screenshot";
  if (nonEmpty(input.html)) return input.html.length <= 120 && !/[<>\r\n]/.test(input.html) ? input.html : "html";
  if (input.nodes !== undefined && input.nodes !== null) return "nodes";
  return null;
}

function nodeGroup(nodes: unknown, key: string): unknown {
  if (!nodes || Array.isArray(nodes) || typeof nodes !== "object") return nodes;
  var groups = nodes as Record<string, unknown>;
  return groups[key] !== undefined ? groups[key] : nodes;
}

function textFromHtml(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function subAuditArgs(tool: string, input: AuditInput): Record<string, unknown> {
  var nodes = input.nodes;
  var grouped = nodes && !Array.isArray(nodes) && typeof nodes === "object" ? nodes as Record<string, unknown> : null;
  switch (tool) {
    case "audit_url": return { url: input.url };
    case "audit_page": return { html: input.html, url: input.url };
    case "audit_contrast": return { url: input.url, dom_snapshot: nodeGroup(nodes, "contrast"), screenshot: input.screenshot };
    case "audit_tap_targets": return { url: input.url, elements: nodeGroup(nodes, "tap_targets") };
    case "audit_typography": return { url: input.url, nodes: nodeGroup(nodes, "typography") };
    case "audit_layout": {
      var layout = nodeGroup(nodes, "layout");
      return layout && !Array.isArray(layout) && typeof layout === "object" ? layout as Record<string, unknown> : { elements: layout };
    }
    case "audit_responsive_visibility": return { url: input.url };
    case "audit_consistency": return { pages: grouped && grouped.pages };
    case "audit_content": {
      var items = grouped && grouped.items;
      if (!items && nonEmpty(input.html)) items = [{ type: "prose", text: textFromHtml(input.html) }];
      return { items: items || [] };
    }
    case "audit_taste": return Object.assign(
      { profile: input.profile, project: input.project },
      nonEmpty(input.url) ? { url: input.url }
        : nonEmpty(input.html) ? { html: input.html }
          : { text: input.source }
    );
    case "audit_ios_screen": {
      var iosScreen = nodeGroup(nodes, "ios_screen");
      if (iosScreen && !Array.isArray(iosScreen) && typeof iosScreen === "object") {
        return Object.assign({}, iosScreen, { screenshot: input.screenshot, project: input.project, profile: input.profile });
      }
      return { elements: Array.isArray(iosScreen) ? iosScreen : undefined, screenshot: input.screenshot, project: input.project, profile: input.profile };
    }
    case "audit_ios_a11y": {
      var iosA11y = nodeGroup(nodes, "ios_a11y");
      return iosA11y && !Array.isArray(iosA11y) && typeof iosA11y === "object" ? iosA11y as Record<string, unknown> : { elements: iosA11y };
    }
    case "audit_ios_privacy":
    case "audit_swiftui":
    case "audit_rn": return { source: input.source, screenshot: input.screenshot, nodes: nodes, project: input.project, profile: input.profile };
    case "audit_device_frame": {
      var deviceFrame = nodeGroup(nodes, "device_frame");
      return deviceFrame && !Array.isArray(deviceFrame) && typeof deviceFrame === "object" ? deviceFrame as Record<string, unknown> : { screenshot: input.screenshot, nodes: deviceFrame };
    }
    case "review_diff": return { diff: input.diff || input.source, project: input.project };
    case "audit_parity":
    case "audit_contract":
    case "audit_api_contract":
    case "audit_asset_integrity": {
      var diffInput = nodeGroup(nodes, tool.slice(6));
      return diffInput && !Array.isArray(diffInput) && typeof diffInput === "object" ? diffInput as Record<string, unknown> : { source: input.source, diff: input.diff };
    }
    case "audit_video_playback": return { url: input.url, dom_snapshot: nodeGroup(nodes, "video") };
    default: return {};
  }
}

function missingInputReason(tool: string, args: Record<string, unknown>): string | null {
  switch (tool) {
    case "audit_url": return nonEmpty(args.url) ? null : "requires url";
    case "audit_page": return nonEmpty(args.html) || nonEmpty(args.url) ? null : "requires html or url";
    case "audit_contrast": return nonEmpty(args.url) || Array.isArray(args.dom_snapshot) ? null : "requires url or contrast nodes";
    case "audit_tap_targets": return nonEmpty(args.url) || Array.isArray(args.elements) ? null : "requires url or tap-target nodes";
    case "audit_typography": return nonEmpty(args.url) || Array.isArray(args.nodes) ? null : "requires url or typography nodes";
    case "audit_layout": return Array.isArray(args.elements) && !!args.viewport ? null : "requires layout elements and viewport";
    case "audit_responsive_visibility": return nonEmpty(args.url) ? null : "requires url";
    case "audit_consistency": return Array.isArray(args.pages) && args.pages.length >= 2 ? null : "requires at least two HTML pages";
    case "audit_content": return Array.isArray(args.items) && args.items.length > 0 ? null : "requires content items or html";
    case "audit_taste": {
      var targets = [args.html, args.text, args.url].filter(nonEmpty).length;
      // project OR profile binds the taste audit (project auto-matches a binding);
      // requiring profile alone silently skipped project-only calls.
      return (nonEmpty(args.profile) || nonEmpty(args.project)) && targets === 1 ? null : "no taste binding";
    }
    case "audit_ios_screen": return Array.isArray(args.elements) && !!args.viewport ? null : "requires screen elements and viewport";
    case "audit_ios_a11y": return Array.isArray(args.elements) && !!args.viewport ? null : "requires accessibility elements and viewport";
    case "audit_ios_privacy":
    case "audit_swiftui":
    case "audit_rn": return nonEmpty(args.source) ? null : "requires source";
    case "audit_device_frame": return [args.frames, args.clips, args.edge_frames].some(function(value) { return Array.isArray(value) && value.length > 0; }) ? null : "requires device-frame geometry or frame paths";
    case "review_diff": return nonEmpty(args.diff) ? null : "requires diff";
    case "audit_parity": return !!args.ios && !!args.android && Array.isArray(args.checklist) ? null : "requires iOS and Android snapshots plus checklist";
    case "audit_contract": return !!args.contract_spec && Array.isArray(args.file_paths) ? null : "requires contract_spec and file_paths";
    case "audit_api_contract": return nonEmpty(args.endpoint_url) && Array.isArray(args.queries) && !!args.expected_shape_schema ? null : "requires endpoint_url, queries, and expected_shape_schema";
    case "audit_asset_integrity": return Array.isArray(args.image_paths) && args.image_paths.length > 0 ? null : "requires image_paths";
    case "audit_video_playback": return nonEmpty(args.url) || Array.isArray(args.dom_snapshot) ? null : "requires url or video nodes";
    default: return null;
  }
}

async function remoteSkipReason(tool: string, args: Record<string, unknown>, options: AuditDispatchOptions): Promise<string | null> {
  if (!options.remote) return null;
  if (options.remoteGatedTools && options.remoteGatedTools.has(tool)) {
    return tool + " is unavailable on the hosted (remote) endpoint.";
  }
  var guard = options.remoteArgGuards && options.remoteArgGuards[tool];
  if (guard) {
    for (var param of guard.params) {
      if (args[param] !== undefined && args[param] !== null) return guard.message;
    }
  }
  var urlParam = options.remoteUrlGuardedTools && options.remoteUrlGuardedTools[tool];
  if (urlParam && nonEmpty(args[urlParam]) && options.remoteUrlGuardError) {
    return await options.remoteUrlGuardError(args[urlParam] as string);
  }
  return null;
}

function firstNumber(values: unknown[]): number | null {
  for (var value of values) if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function verdictCount(rows: unknown, verdicts: string[]): number {
  if (!Array.isArray(rows)) return 0;
  return rows.filter(function(row) {
    return row && typeof row === "object" && verdicts.indexOf(String((row as Record<string, unknown>).verdict)) !== -1;
  }).length;
}

function severityCounts(payload: unknown): { failures: number; warnings: number; grade: string | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { failures: 0, warnings: 0, grade: null };
  var value = payload as Record<string, any>;
  var summary = value.summary && typeof value.summary === "object" ? value.summary : {};
  var counts = value.counts && typeof value.counts === "object" ? value.counts : {};
  var hasDeviceRows = Array.isArray(value.frames) || Array.isArray(value.clips) || Array.isArray(value.edge_frames);
  var deviceFailures = hasDeviceRows
    ? verdictCount(value.frames, ["cropped", "letterboxed", "distorted"]) +
      verdictCount(value.clips, ["pan", "zoom", "pan-zoom"]) +
      verdictCount(value.edge_frames, ["likely-sliced"])
    : null;
  var deviceWarnings = hasDeviceRows
    ? verdictCount(value.frames, ["inconclusive"]) + verdictCount(value.clips, ["inconclusive"]) + verdictCount(value.edge_frames, ["inconclusive"])
    : null;
  var assetFailures = Array.isArray(value.results) ? verdictCount(value.results, ["likely-sliced"]) : null;
  var assetWarnings = Array.isArray(value.results)
    ? value.results.filter(function(row: any) { return row && Array.isArray(row.warnings) && row.warnings.length > 0; }).length
    : null;
  var failures = firstNumber([
    summary.failures, summary.fail, counts.errors, value.aa_fail_count, value.fail_count, value.failing,
    value.mismatch_count, value.not_playing_count,
    typeof value.shape_invalid_count === "number" && typeof value.confident_wrong_count === "number"
      ? value.shape_invalid_count + value.confident_wrong_count : null,
    Array.isArray(value.block_reasons) ? value.block_reasons.length : null,
    deviceFailures, assetFailures,
    Array.isArray(value.errors) ? value.errors.length : null
  ]);
  var warnings = firstNumber([
    summary.warnings, summary.warn, counts.warnings, value.warning_count,
    value.flagged_count, value.indeterminate_bg_count, value.uncertain_count,
    deviceWarnings, assetWarnings,
    Array.isArray(value.warnings) ? value.warnings.length : null
  ]);
  var rows = Array.isArray(value.findings)
    ? value.findings
    : Array.isArray(value.issues)
      ? value.issues
      : Array.isArray(value.items) ? value.items : [];
  if (failures === null) failures = rows.filter(function(row: any) {
    return row && (row.status === "fail" || row.verdict === "fail" || row.severity === "error" || row.severity === "fail" || row.severity === "block");
  }).length;
  if (warnings === null) warnings = rows.filter(function(row: any) {
    return row && (row.status === "warn" || row.verdict === "warn" || row.severity === "warning" || row.severity === "warn" || row.severity === "nit");
  }).length;
  var grade = typeof value.grade === "string"
    ? value.grade
    : value.verdict === "BLOCK" ? "D" : value.verdict === "WARN" ? "B" : null;
  return { failures: failures, warnings: warnings, grade: grade };
}

function reportGrade(failures: number, warnings: number, nativeGrades: string[]): string {
  var rank: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };
  var computed = failures === 0 ? (warnings === 0 ? "A" : "B") : failures <= 2 ? "B" : failures <= 4 ? "C" : "D";
  for (var grade of nativeGrades) {
    var normalized = grade.toUpperCase();
    if (rank[normalized] !== undefined && rank[normalized] > rank[computed]) computed = normalized;
  }
  return computed;
}

function findingsKey(tool: string): string {
  return tool.indexOf("audit_") === 0 ? tool.slice(6) : tool;
}

export async function dispatchAudit(input: AuditInput, options: AuditDispatchOptions): Promise<AuditReport> {
  var surface = detectAuditSurface(input);
  var target = targetLabel(input);
  if (!surface) {
    var clarification = "Which surface should Raven audit: web, iOS, React Native, diff, or video?";
    return {
      surface: null, target: target, project: input.project || null, ran: [], skipped: [],
      summary: { grade: "N/A", failures: 0, warnings: 0 }, findings: {}, next: clarification,
      clarification: clarification
    };
  }

  var tools = routeAuditTools(surface, input);
  var ran: string[] = [];
  var skipped: AuditSkipped[] = [];
  var findings: Record<string, unknown> = {};
  var failures = 0;
  var warnings = 0;
  var nativeGrades: string[] = [];

  for (var tool of tools) {
    var args = subAuditArgs(tool, input);
    var guardReason = await remoteSkipReason(tool, args, options);
    if (guardReason) {
      skipped.push({ tool: tool, reason: guardReason });
      continue;
    }
    var inputReason = missingInputReason(tool, args);
    if (inputReason) {
      skipped.push({ tool: tool, reason: inputReason });
      continue;
    }
    var runner = options.run
      ? function(a: Record<string, unknown>) { return options.run!(tool, a); }
      : options.runners && options.runners[tool];
    if (!runner) {
      skipped.push({ tool: tool, reason: "no callable audit implementation" });
      continue;
    }
    try {
      var payload = await runner(args);
      ran.push(tool);
      findings[findingsKey(tool)] = payload;
      var counts = severityCounts(payload);
      failures += counts.failures;
      warnings += counts.warnings;
      if (counts.grade) nativeGrades.push(counts.grade);
    } catch (error) {
      skipped.push({ tool: tool, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  var contrast = findings.contrast as Record<string, unknown> | undefined;
  var contrastFailures = contrast && typeof contrast.aa_fail_count === "number" ? contrast.aa_fail_count : 0;
  var next = contrastFailures > 0
    ? contrastFailures + " contrast failure" + (contrastFailures === 1 ? "" : "s") + " — call suggest_contrast_fix for passing colors"
    : failures > 0
      ? failures + " failure" + (failures === 1 ? "" : "s") + " — fix the highest-severity findings first"
      : warnings > 0
        ? warnings + " warning" + (warnings === 1 ? "" : "s") + " — review the flagged findings"
        : ran.length > 0 ? "No failures found in the audits that ran" : "No applicable audits ran";

  return {
    surface: surface,
    target: target,
    project: input.project || null,
    ran: ran,
    skipped: skipped,
    summary: { grade: reportGrade(failures, warnings, nativeGrades), failures: failures, warnings: warnings },
    findings: findings,
    next: next
  };
}

export type LayoutElement = {
  selector: string;
  rect: { x: number; y: number; w: number; h: number };
  computed?: { padding?: string; margin?: string; gap?: string; fontSize?: string; color?: string; background?: string };
};

export function auditLayoutSnapshot(elements: LayoutElement[], viewport: { w: number; h: number }) {
  var rects = elements.map(function(e) { return e.rect; });
  var clusterTol = 2;
  var colCounts = new Map<number, number>();
  for (var r of rects) {
    var matched: number | null = null;
    for (var c of colCounts.keys()) {
      if (Math.abs(r.x - c) <= clusterTol) { matched = c; break; }
    }
    if (matched !== null) colCounts.set(matched, (colCounts.get(matched) || 0) + 1);
    else colCounts.set(r.x, 1);
  }
  var sharedCols = Array.from(colCounts.values()).filter(function(n) { return n >= 2; }).length;
  var singletonCols = Array.from(colCounts.values()).filter(function(n) { return n === 1; }).length;
  var alignedElements = 0;
  colCounts.forEach(function(n) { if (n >= 2) alignedElements += n; });
  var alignmentRatio = rects.length > 0 ? alignedElements / rects.length : 0;

  var vGaps: number[] = [];
  var sortedByY = rects.slice().sort(function(a, b) { return a.y - b.y; });
  for (var i = 1; i < sortedByY.length; i++) {
    var prev = sortedByY[i - 1];
    var cur = sortedByY[i];
    var xOverlap = Math.min(prev.x + prev.w, cur.x + cur.w) - Math.max(prev.x, cur.x);
    if (xOverlap > 0) {
      var gap = cur.y - (prev.y + prev.h);
      if (gap > 0 && gap < 200) vGaps.push(gap);
    }
  }
  var gapMedian = 0, gapStdev = 0, gapCV = 0;
  if (vGaps.length >= 3) {
    var sortedGaps = vGaps.slice().sort(function(a, b) { return a - b; });
    gapMedian = sortedGaps[Math.floor(sortedGaps.length / 2)];
    var gapMean = vGaps.reduce(function(a, b) { return a + b; }, 0) / vGaps.length;
    var gapVar = vGaps.reduce(function(a, b) { return a + (b - gapMean) * (b - gapMean); }, 0) / vGaps.length;
    gapStdev = Math.sqrt(gapVar);
    gapCV = gapMean > 0 ? gapStdev / gapMean : 0;
  }

  var contentMinX = Infinity, contentMaxX = -Infinity;
  for (var rb of rects) {
    if (rb.x < contentMinX) contentMinX = rb.x;
    if (rb.x + rb.w > contentMaxX) contentMaxX = rb.x + rb.w;
  }
  var contentMid = (contentMinX + contentMaxX) / 2;
  var contentHalfWidth = (contentMaxX - contentMinX) / 2;
  var leftTorque = 0, rightTorque = 0, totalArea = 0;
  for (var r2 of rects) {
    var area = r2.w * r2.h;
    var cx = r2.x + r2.w / 2;
    var dist = Math.abs(cx - contentMid);
    totalArea += area;
    if (cx < contentMid) leftTorque += area * dist;
    else if (cx > contentMid) rightTorque += area * dist;
  }
  var maxPossibleTorque = totalArea * contentHalfWidth;
  var netTorque = Math.abs(leftTorque - rightTorque);
  var balanceSkew = maxPossibleTorque > 0 ? netTorque / maxPossibleTorque : 0;
  var leftWeight = Math.round(leftTorque);
  var rightWeight = Math.round(rightTorque);
  var findings: Array<{ check: string; status: "pass" | "warn"; message: string; fix?: string }> = [];

  if (alignmentRatio >= 0.6) {
    findings.push({ check: "alignment", status: "pass", message: Math.round(alignmentRatio * 100) + "% of elements share a left edge with another (" + sharedCols + " alignment column" + (sharedCols === 1 ? "" : "s") + ", " + singletonCols + " one-off" + (singletonCols === 1 ? "" : "s") + ")" });
  } else {
    findings.push({ check: "alignment", status: "warn", message: "Weak alignment — only " + Math.round(alignmentRatio * 100) + "% of elements align with any sibling (" + singletonCols + " unique left edges across " + rects.length + " elements). Elements should live on a small number of alignment columns.", fix: "Wrap siblings in a flex/grid parent and let the parent dictate alignment. Remove ad-hoc left margins that push children off the grid." });
  }
  if (vGaps.length >= 3) {
    if (gapCV <= 0.5) findings.push({ check: "gap-rhythm", status: "pass", message: "Vertical gaps are consistent (median " + Math.round(gapMedian) + "px, CV " + gapCV.toFixed(2) + " across " + vGaps.length + " pairs)" });
    else findings.push({ check: "gap-rhythm", status: "warn", message: "Inconsistent vertical rhythm — gap coefficient of variation " + gapCV.toFixed(2) + " (median " + Math.round(gapMedian) + "px, σ " + Math.round(gapStdev) + "px across " + vGaps.length + " pairs)", fix: "Siblings should share one gap value. Move spacing from per-child margin-top/bottom to a single gap: on the parent flex/grid container." });
  } else {
    findings.push({ check: "gap-rhythm", status: "pass", message: "Not enough vertical sibling pairs to score (" + vGaps.length + " found)" });
  }
  if (balanceSkew <= 0.2) findings.push({ check: "optical-balance", status: "pass", message: "Horizontal weight is balanced (skew " + Math.round(balanceSkew * 100) + "%)" });
  else findings.push({ check: "optical-balance", status: "warn", message: "Layout is " + (leftWeight > rightWeight ? "left-heavy" : "right-heavy") + " — visual weight skewed by " + Math.round(balanceSkew * 100) + "%", fix: balanceSkew > 0.4 ? "Redistribute dense blocks (images, tables) toward center, or add counterweight on the lighter side." : "Minor imbalance — review whether it's intentional asymmetry or accidental." });

  return {
    elements_analyzed: rects.length,
    viewport: viewport,
    findings: findings,
    metrics: {
      alignment: { total_columns: colCounts.size, shared_columns: sharedCols, singleton_columns: singletonCols, aligned_ratio: Number(alignmentRatio.toFixed(2)) },
      gap_rhythm: vGaps.length >= 3 ? { samples: vGaps.length, median_px: Math.round(gapMedian), stdev_px: Math.round(gapStdev), coef_variation: Number(gapCV.toFixed(2)) } : { samples: vGaps.length, note: "not enough horizontally-overlapping vertical sibling pairs" },
      balance: { left_weight: Math.round(leftWeight), right_weight: Math.round(rightWeight), skew_pct: Math.round(balanceSkew * 100) }
    },
    orphan_stretch: detectOrphanStretch(elements)
  };
}
