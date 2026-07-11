import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { extractComponentManifest, readDesignMd, type ComponentDecl, type FlattenedDesignToken } from "./designmd.js";

var __dirname = dirname(fileURLToPath(import.meta.url));
var DATA_DIR = join(resolve(join(__dirname, "..")), "src", "data", "design-systems");
var BASELINES = ["raven-canonical"];
var PLATFORMS = ["web-pointer", "web-touch", "ios", "android"];

export interface SourceConfig { version: 1; source: { kind: "design-file"; path: string }; platform: string; aliases?: Record<string, string>; }
export interface InventoryComponent extends ComponentDecl { evidence: "declared"; confidence: "declared"; }
export interface DesignSystemInventory { source: string; tokens: FlattenedDesignToken[]; components: InventoryComponent[]; diagnostics: string[]; }

export function loadTaxonomy(): any {
  return JSON.parse(readFileSync(join(DATA_DIR, "taxonomy.json"), "utf8"));
}

export function loadBaseline(id: string): any {
  if (BASELINES.indexOf(id) === -1) throw new Error("Unknown baseline " + id + ". Available: " + BASELINES.join(", "));
  return JSON.parse(readFileSync(join(DATA_DIR, id + ".components.json"), "utf8"));
}

export function listBaselineComponents(id: string): any {
  var baseline = loadBaseline(id);
  return { id: baseline.id, label: baseline.label, provenance: baseline.provenance, components: baseline.components };
}

export function configureSource(projectDir: string, config: any): SourceConfig {
  var kind = config && config.source ? config.source.kind : undefined;
  if (kind !== "design-file") throw new Error(String(kind) + " not yet supported; only design-file is supported in MVP");
  var platform = validatePlatform(config.platform || "web-pointer");
  var stored: SourceConfig = { version: 1, source: { kind: "design-file", path: config.source.path || "DESIGN.md" }, platform: platform };
  if (config.aliases !== undefined) stored.aliases = config.aliases;
  var path = join(resolve(projectDir), ".raven", "design-system-source.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(stored, null, 2) + "\n", "utf8");
  return stored;
}

export function readSourceConfig(projectDir: string): SourceConfig {
  return JSON.parse(readFileSync(join(resolve(projectDir), ".raven", "design-system-source.json"), "utf8"));
}

export function inventoryFromDesignMd(path: string): DesignSystemInventory {
  var doc = readDesignMd(path);
  var manifest = extractComponentManifest(doc.frontmatter);
  var diagnostics = manifest.problems.slice();
  if (manifest.components.length === 0) diagnostics.push("no component declarations found — component coverage is unknown, not missing");
  return {
    source: doc.path,
    tokens: doc.tokens,
    components: manifest.components.map(function(component) { return Object.assign({}, component, { evidence: "declared" as const, confidence: "declared" as const }); }),
    diagnostics: diagnostics
  };
}

export function diffDesignSystem(inventory: DesignSystemInventory, baselineId: string, options: { platform: string; projectAliases?: Record<string, string> }): any {
  var baseline = loadBaseline(baselineId);
  var taxonomy = loadTaxonomy();
  var platform = validatePlatform(options.platform);
  var diagnostics = inventory.diagnostics.slice();
  diagnostics.push("structural similarity matching skipped — out of MVP scope");
  if (inventory.components.length === 0) {
    return { score: null, grade: "unknown", summary: "Component coverage is unknown because no component declarations were found.", coverage: { components: unknownCoverage(baseline.components.length), states: unknownCoverage(0), variants: unknownCoverage(0), token_fidelity: null, evidence_confidence: "declared" }, passes: [], errors: [], warnings: [], fix_priority: [], diagnostics: diagnostics };
  }

  var errors: any[] = [];
  var warnings: any[] = [];
  var passes: any[] = [];
  var matched: Array<{ project: InventoryComponent; baseline: any }> = [];
  var used: Record<string, boolean> = {};
  var projectAliases = options.projectAliases || {};
  for (var i = 0; i < inventory.components.length; i++) {
    var project = inventory.components[i];
    var base = baseline.components.find(function(candidate: any) { return candidate.id === project.id; });
    if (!base) base = baseline.components.find(function(candidate: any) { return candidate.aliases.indexOf(project.id) !== -1; });
    if (!base && projectAliases[project.id]) {
      var target = projectAliases[project.id];
      base = baseline.components.find(function(candidate: any) { return candidate.id === target || candidate.aliases.indexOf(target) !== -1; });
    }
    if (base && used[base.id]) {
      warnings.push(finding("ambiguous-match-" + project.id + "-" + base.id, "ambiguous_match", project.id, "Multiple project components match baseline component " + base.id, "warning", "Baseline component already matched"));
    }
    else if (base) { matched.push({ project: project, baseline: base }); used[base.id] = true; }
    else passes.push(finding("project-only-" + project.id, "project_only", project.id, "Project-only component", "info", "Declared in DESIGN.md"));
  }
  for (var b = 0; b < baseline.components.length; b++) {
    var required = baseline.components[b];
    if (!used[required.id] && required.level === "optional") {
      passes.push(finding("optional-component-" + required.id, "optional_component", required.id, "Optional component not declared", "info", "Optional in Raven canonical baseline"));
    } else if (!used[required.id]) {
      var severity = required.level === "core" ? "error" : "warning";
      addFinding(severity, finding("missing-component-" + required.id, "missing_component", required.id, "Missing " + required.level + " component", severity, "No matching declaration"), errors, warnings);
    }
  }

  var platformModes = platform === "web-touch" || platform === "ios" || platform === "android" ? ["touch", "keyboard"] : ["pointer", "keyboard"];
  var stateCovered = 0;
  var stateTotal = 0;
  var variantCovered = 0;
  var variantTotal = 0;
  var tokenRefs = 0;
  var tokenTotal = 0;
  var criticalMissing = false;
  for (var m = 0; m < matched.length; m++) {
    var pair = matched[m];
    for (var s = 0; s < pair.baseline.states.length; s++) {
      var state = pair.baseline.states[s];
      var rule = taxonomy.states[state];
      if (!rule || !rule.applies.some(function(mode: string) { return platformModes.indexOf(mode) !== -1; })) continue;
      stateTotal++;
      if (pair.project.states.indexOf(state) !== -1) stateCovered++;
      else {
        var stateSeverity = rule.accessibility_critical ? "error" : "warning";
        if (rule.accessibility_critical) criticalMissing = true;
        addFinding(stateSeverity, finding("missing-state-" + pair.baseline.id + "-" + state, "missing_state", pair.baseline.id, "Missing required state: " + state, stateSeverity, "Declared states: " + pair.project.states.join(", ")), errors, warnings);
      }
    }
    for (var v = 0; v < pair.baseline.variants.length; v++) {
      variantTotal++;
      var variant = pair.baseline.variants[v];
      if (pair.project.variants.indexOf(variant) !== -1) variantCovered++;
      else warnings.push(finding("missing-variant-" + pair.baseline.id + "-" + variant, "missing_variant", pair.baseline.id, "Missing required variant: " + variant, "warning", "Declared variants: " + pair.project.variants.join(", ")));
    }
    var tokenNames = Object.keys(pair.project.tokens);
    for (var t = 0; t < tokenNames.length; t++) {
      tokenTotal++;
      var tokenValue = pair.project.tokens[tokenNames[t]];
      if (/^\{[A-Za-z0-9_.-]+\}$/.test(tokenValue)) {
        var refPath = tokenValue.slice(1, -1);
        if (inventory.tokens.some(function(token) { return token.path === refPath; })) tokenRefs++;
        else warnings.push(finding("token-dangling-ref-" + pair.project.id + "-" + tokenNames[t], "token_dangling_ref", pair.project.id, "Token " + tokenNames[t] + " references missing token " + refPath, "warning", "Declared component token"));
      } else warnings.push(finding("token-literal-" + pair.project.id + "-" + tokenNames[t], "token_literal", pair.project.id, "Token " + tokenNames[t] + " uses raw literal " + tokenValue, "warning", "Declared component token"));
    }
  }
  errors.sort(function(a, b) { return (a.type === "missing_state" ? -1 : 0) - (b.type === "missing_state" ? -1 : 0); });
  var score = Math.max(0, 100 - errors.length * 12 - warnings.length * 4);
  if (criticalMissing) score = Math.min(score, 74);
  var grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  var summary = errors.length + " errors, " + warnings.length + " warnings." + (criticalMissing ? " Accessibility-critical missing state caps the score at 74 and grade at C." : "");
  var priority = errors.concat(warnings).map(function(item) { return fixFor(item); });
  return { score: score, grade: grade, summary: summary, coverage: { components: coverage(matched.length, baseline.components.length), states: coverage(stateCovered, stateTotal), variants: coverage(variantCovered, variantTotal), token_fidelity: tokenTotal === 0 ? null : Math.round(tokenRefs / tokenTotal * 100), evidence_confidence: "declared" }, passes: passes, errors: errors, warnings: warnings, fix_priority: priority, diagnostics: diagnostics };
}

function validatePlatform(platform: string): string {
  if (PLATFORMS.indexOf(platform) === -1) throw new Error("Unknown platform " + platform + ". Valid values: " + PLATFORMS.join(", "));
  return platform;
}
function coverage(covered: number, total: number): any { return { covered: Math.min(covered, total), total: total, pct: total === 0 ? null : Math.min(100, Math.round(covered / total * 100)) }; }
function unknownCoverage(total: number): any { return { covered: null, total: total, pct: null }; }
function finding(id: string, type: string, component: string, detail: string, severity: string, evidence: string): any { return { id: id, type: type, component: component, detail: detail, severity: severity, evidence: evidence }; }
function addFinding(severity: string, item: any, errors: any[], warnings: any[]): void { if (severity === "error") errors.push(item); else warnings.push(item); }
function fixFor(item: any): string {
  if (item.type === "missing_state") return "For " + item.component + ", add " + item.detail.replace("Missing required state: ", "") + " to components." + item.component + ".states.";
  if (item.type === "missing_component") return "Declare components." + item.component + " in DESIGN.md.";
  if (item.type === "missing_variant") return "Add " + item.detail.replace("Missing required variant: ", "") + " to components." + item.component + ".variants.";
  return "Replace the raw literal in components." + item.component + " with a token reference.";
}
