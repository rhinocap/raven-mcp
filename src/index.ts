#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync, realpathSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { auditContainerWidth } from "./audit-container.js";
import { capturePage, CaptureUnavailableError, annotateVideoArtifacts, verifyFindings } from "./capture.js";
import type { VerifiableFinding, PageTraits } from "./capture.js";
import { runPageChecks } from "./page-checks.js";
import { scorePage } from "./score-page.js";
import { auditUrl } from "./audit-url.js";
import { captureResponsiveVisibility } from "./responsive.js";
import { auditContrastUrl, auditContrastSnapshot, suggestContrastFix } from "./contrast.js";
import { diffScreenshots } from "./image-diff.js";
import { auditAssetIntegrity } from "./asset-integrity.js";
import { auditParity } from "./parity.js";
import { auditIosA11y } from "./ios-a11y.js";
import { auditContract } from "./contract.js";
import { runApiContract } from "./api-contract.js";
import { auditContent } from "./content-audit.js";
import { auditDeviceFrames, auditClipMotion, auditFrameEdges } from "./device-frame.js";
import { auditTypographyUrl, auditTypographySnapshot } from "./typography.js";
import { auditTapTargetsUrl, auditTapTargetsSnapshot } from "./tap-targets.js";
import { compactAuditPage, compactEvaluation, compactAuditUrl } from "./compact.js";
import { auditVideoPlaybackUrl, auditVideoPlaybackSnapshot } from "./video-playback.js";
import { auditConsistency } from "./audit-consistency.js";
import { detectOrphanStretch } from "./layout-orphans.js";
import { createTasteProfile, getTasteProfile, listTasteProfiles, labelFinding, auditTaste, ruleInScope, getTasteInterview, bindTasteSurface, listSurfaceBindings, resolveSurfaceBinding, recordTasteDecision, listTasteDecisions, checkBindingConsistency, isPngPathReference } from "./taste.js";
import type { ReferenceCapture, SurfaceBinding } from "./taste.js";
import { generateTastePortrait, generateTastePortraitInline } from "./taste-portrait.js";
import { setRemoteRuntime, isRemoteRuntime } from "./remote-runtime.js";
import { ClosedTasteStore, FsTasteStore, type TasteStore } from "./taste-store.js";
import { remoteUrlGuardError } from "./remote-url-guard.js";
import { buildHints, screenTraitsFromImage, assessDesignNotesSource, assessDesignNotesImage, noteIssuesFromAssessments } from "./taste-fidelity.js";
import type { NoteAssessment, MobileSourceKind } from "./taste-fidelity.js";
import { readFile } from "fs/promises";
import { registerCalls } from "./calls.js";
import { runTalon, listTalonRules, type TalonElement } from "./talon.js";
import { parseDesignMd, serializeDesignMd, flattenDesignTokens, readDesignMd, initDesignMd, updateDesignMd, type DesignMdUpdateSet } from "./designmd.js";
import { startGrabSession, getGrabbedElements, stopGrabSession, getPageTemplate, setTemplateSlots, listTemplates, getGrabLayers, moveGrabLayer, getGrabOperation } from "./grab-bridge.js";

// ── Path setup ──────────────────────────────────────────────────────

var __dirname = dirname(fileURLToPath(import.meta.url));
var PKG_ROOT = join(__dirname, "..");
var DATA_DIR = join(PKG_ROOT, "src", "data");
var PRINCIPLES_DIR = join(DATA_DIR, "principles");
var PATTERNS_DIR = join(DATA_DIR, "patterns");
var BUSINESS_DIR = join(DATA_DIR, "business");
var TOKENS_DIR = join(DATA_DIR, "tokens");
var SYSTEMS_DIR = join(TOKENS_DIR, "systems");
var CONTENT_DIR = join(DATA_DIR, "content");
var CONTENT_SYSTEMS_DIR = join(CONTENT_DIR, "systems");
var CONTENT_PRINCIPLES_DIR = join(CONTENT_DIR, "principles");
var CONTENT_PATTERNS_DIR = join(CONTENT_DIR, "patterns");
var RESEARCH_DIR = join(DATA_DIR, "research");
var RESEARCH_PRINCIPLES_DIR = join(RESEARCH_DIR, "principles");
var RESEARCH_METHODS_DIR = join(RESEARCH_DIR, "methods");
var RESEARCH_FRAMEWORKS_DIR = join(RESEARCH_DIR, "frameworks");
var SERVICE_DIR = join(DATA_DIR, "service-design");
var SERVICE_PRINCIPLES_DIR = join(SERVICE_DIR, "principles");
var SERVICE_PATTERNS_DIR = join(SERVICE_DIR, "patterns");
var SERVICE_FRAMEWORKS_DIR = join(SERVICE_DIR, "frameworks");
var BRAND_DIR = join(DATA_DIR, "brand");
var BRAND_PRINCIPLES_DIR = join(BRAND_DIR, "principles");
var BRAND_TRENDS_DIR = join(BRAND_DIR, "trends");

// ── Types ───────────────────────────────────────────────────────────

interface Principle {
  id: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  implications: string[];
  violations: string[];
  applies_to: string[];
  sources: string[];
  templates?: any;
}

interface Pattern {
  id: string;
  name: string;
  category: string;
  summary: string;
  principles_referenced: string[];
  patterns: Array<{
    name: string;
    description: string;
    do: string[];
    dont: string[];
    evidence: string;
  }>;
  checklist: string[];
}

interface BusinessStrategy {
  id: string;
  name: string;
  category: string;
  summary: string;
  strategies: Array<{
    name: string;
    description: string;
    when_to_use: string;
    pitfalls: string[];
    examples: string[];
    metrics: string[];
  }>;
}

// ── Data loading ────────────────────────────────────────────────────

function loadJsonDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  var files = readdirSync(dir).filter(f => f.endsWith(".json"));
  var results: T[] = [];
  for (var file of files) {
    var fullPath = join(dir, file);
    var raw: string;
    try {
      raw = readFileSync(fullPath, "utf-8");
    } catch (err) {
      console.error("[raven] skipped " + fullPath + " (read failed: " + (err as Error).message + ")");
      continue;
    }
    var parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("[raven] skipped " + fullPath + " (invalid JSON: " + (err as Error).message + ")");
      continue;
    }
    if (Array.isArray(parsed)) {
      results = results.concat(parsed);
    } else {
      results.push(parsed);
    }
  }
  return results;
}

var allPrinciples: Principle[] = [];
var allPatterns: Pattern[] = [];
var allBusiness: BusinessStrategy[] = [];

function loadAllData() {
  allPrinciples = loadJsonDir<Principle>(PRINCIPLES_DIR);
  allPatterns = loadJsonDir<Pattern>(PATTERNS_DIR);
  allBusiness = loadJsonDir<BusinessStrategy>(BUSINESS_DIR);

  // Content-layer principles and patterns share the schema of the others,
  // so they slot into the same arrays and are automatically searchable
  // through get_principles, get_pattern, and search_knowledge. Content
  // brand systems (voice & tone) live in a parallel registry and are
  // accessed via list_content_systems / get_content_system.
  allPrinciples = allPrinciples.concat(loadJsonDir<Principle>(CONTENT_PRINCIPLES_DIR));
  allPatterns = allPatterns.concat(loadJsonDir<Pattern>(CONTENT_PATTERNS_DIR));

  // Research / service-design / brand layers — principles follow the same
  // schema and merge into allPrinciples. Service-design also contributes
  // patterns. Research methods, research metrics frameworks, service
  // frameworks, and brand trends use domain-specific shapes and are
  // accessed through dedicated tools.
  allPrinciples = allPrinciples.concat(
    loadJsonDir<Principle>(RESEARCH_PRINCIPLES_DIR),
    loadJsonDir<Principle>(SERVICE_PRINCIPLES_DIR),
    loadJsonDir<Principle>(BRAND_PRINCIPLES_DIR)
  );
  allPatterns = allPatterns.concat(loadJsonDir<Pattern>(SERVICE_PATTERNS_DIR));
}

loadAllData();

// ── Token helpers (from reference) ──────────────────────────────────

function loadRegistry() {
  var raw = readFileSync(join(TOKENS_DIR, "registry.json"), "utf-8");
  return JSON.parse(raw);
}

// A valid system/content id is a bare basename (e.g. "material-3", "gov-uk").
// Reject any id with a path separator or ".." so a caller cannot traverse out of
// the data dir and read arbitrary .json (defense-in-depth for the no-auth remote
// endpoint; provably no-op for every real id, which never contains "/" or "..").
function isSafeDataId(id: string): boolean {
  return typeof id === "string" && id.length > 0
    && !id.includes("/") && !id.includes("\\") && !id.includes("..") && id.charAt(0) !== ".";
}

function loadSystem(id: string) {
  if (!isSafeDataId(id)) return null;
  var filePath = join(SYSTEMS_DIR, id + ".json");
  if (!existsSync(filePath)) return null;
  var raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function getAvailableSystemIds(): string[] {
  if (!existsSync(SYSTEMS_DIR)) return [];
  return readdirSync(SYSTEMS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""));
}

function loadContentRegistry() {
  var raw = readFileSync(join(CONTENT_SYSTEMS_DIR, "registry.json"), "utf-8");
  return JSON.parse(raw);
}

function loadContentSystem(id: string) {
  if (!isSafeDataId(id)) return null;
  var filePath = join(CONTENT_SYSTEMS_DIR, id + ".json");
  if (!existsSync(filePath)) return null;
  var raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function getAvailableContentSystemIds(): string[] {
  if (!existsSync(CONTENT_SYSTEMS_DIR)) return [];
  return readdirSync(CONTENT_SYSTEMS_DIR)
    .filter(f => f.endsWith(".json") && f !== "registry.json")
    .map(f => f.replace(".json", ""));
}

function loadResearchMethods() { return loadJsonDir<any>(RESEARCH_METHODS_DIR); }
function loadMetricsFrameworks() { return loadJsonDir<any>(RESEARCH_FRAMEWORKS_DIR); }
function loadServiceFrameworks() { return loadJsonDir<any>(SERVICE_FRAMEWORKS_DIR); }
function loadBrandTrends() { return loadJsonDir<any>(BRAND_TRENDS_DIR); }

function flattenTokens(obj: any, prefix: string): Array<{ path: string; value: any; type?: string; description?: string }> {
  var results: Array<{ path: string; value: any; type?: string; description?: string }> = [];
  var parentType = obj["$type"];
  for (var key of Object.keys(obj)) {
    if (key.startsWith("$")) continue;
    var val = obj[key];
    var currentPath = prefix ? prefix + "." + key : key;
    if (val && typeof val === "object" && "$value" in val) {
      results.push({
        path: currentPath,
        value: val["$value"],
        type: val["$type"] || parentType,
        description: val["$description"]
      });
    } else if (val && typeof val === "object") {
      results = results.concat(flattenTokens(val, currentPath));
    }
  }
  return results;
}

function filterTokensByGroup(tokens: any, group: string) {
  var filtered: Record<string, any> = {};
  for (var key of Object.keys(tokens)) {
    if (key.startsWith("$")) {
      filtered[key] = tokens[key];
      continue;
    }
    var lk = key.toLowerCase();
    var lg = group.toLowerCase();
    if (lk === lg || lk.startsWith(lg + "-") || lk.startsWith(lg + "_")) {
      filtered[key] = tokens[key];
    }
  }
  return filtered;
}

function tokensToCSS(tokens: any, prefix: string): string {
  var flat = flattenTokens(tokens, "");
  var lines = flat.map(t => {
    var varName = "--" + prefix + "-" + t.path.replace(/\./g, "-");
    var value = typeof t.value === "object" ? JSON.stringify(t.value) : t.value;
    return "  " + varName + ": " + value + ";";
  });
  return ":root {\n" + lines.join("\n") + "\n}";
}

function tokensToCSSByGroup(tokens: any, prefix: string): string {
  var sections: string[] = [];
  for (var key of Object.keys(tokens)) {
    if (key.startsWith("$")) continue;
    var val = tokens[key];
    if (val && typeof val === "object" && !("$value" in val)) {
      sections.push("  /* " + key + " */");
      var flat = flattenTokens(val, key);
      for (var t of flat) {
        var varName = "--" + prefix + "-" + t.path.replace(/\./g, "-");
        var value = typeof t.value === "object" ? JSON.stringify(t.value) : t.value;
        sections.push("  " + varName + ": " + value + ";");
      }
      sections.push("");
    }
  }
  return ":root {\n" + sections.join("\n") + "}";
}

// ── Color math (zero deps) ─────────────────────────────────────────

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  var h = hex.replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  var clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, "0")).join("");
}

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  var { r, g, b } = hexToRGB(hex);
  var rn = r / 255, gn = g / 255, bn = b / 255;
  var max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  var sn = s / 100, ln = l / 100;
  var c = (1 - Math.abs(2 * ln - 1)) * sn;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = ln - c / 2;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function hexToRGBNormalized(hex: string): { r: number; g: number; b: number; a: number } {
  var { r, g, b } = hexToRGB(hex);
  return { r: +(r / 255).toFixed(4), g: +(g / 255).toFixed(4), b: +(b / 255).toFixed(4), a: 1 };
}

// ── WCAG contrast ──────────────────────────────────────────────────

function getRelativeLuminance(hex: string): number {
  var { r, g, b } = hexToRGB(hex);
  var sRGB = [r, g, b].map(v => {
    var c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function getContrastRatio(hex1: string, hex2: string): number {
  var l1 = getRelativeLuminance(hex1);
  var l2 = getRelativeLuminance(hex2);
  var lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return +((lighter + 0.05) / (darker + 0.05)).toFixed(2);
}

function contrastGrade(ratio: number): string {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-lg";
  return "Fail";
}

// ── Palette generation ─────────────────────────────────────────────

function generatePalette(brandHex: string, includeDark: boolean): { light: any; dark: any | null } {
  var hsl = hexToHSL(brandHex);
  var h = hsl.h, s = hsl.s, l = hsl.l;

  var light: Record<string, any> = {
    "$type": "color",
    "primary":       { "$value": brandHex, "$description": "Primary brand color" },
    "primary-light": { "$value": hslToHex(h, Math.max(s - 10, 0), Math.min(l + 15, 95)), "$description": "Lighter primary" },
    "primary-dark":  { "$value": hslToHex(h, Math.min(s + 5, 100), Math.max(l - 15, 10)), "$description": "Darker primary" },
    "secondary":     { "$value": hslToHex((h + 180) % 360, Math.max(s - 25, 10), 50), "$description": "Complementary secondary" },
    "accent":        { "$value": hslToHex((h + 30) % 360, Math.min(s, 90), 55), "$description": "Analogous accent" },
    "background":    { "$value": hslToHex(h, Math.max(s * 0.08, 2), 98), "$description": "Page background" },
    "background-offset": { "$value": hslToHex(h, Math.max(s * 0.1, 3), 96), "$description": "Offset background" },
    "surface":       { "$value": hslToHex(h, Math.max(s * 0.06, 2), 100), "$description": "Card/surface background" },
    "surface-elevated": { "$value": "#FFFFFF", "$description": "Elevated surface" },
    "border":        { "$value": hslToHex(h, Math.max(s * 0.1, 5), 88), "$description": "Default border" },
    "border-light":  { "$value": hslToHex(h, Math.max(s * 0.08, 3), 93), "$description": "Subtle border" },
    "text-primary":  { "$value": hslToHex(h, Math.min(s * 0.3, 15), 12), "$description": "Primary text" },
    "text-secondary": { "$value": hslToHex(h, Math.min(s * 0.15, 10), 40), "$description": "Secondary text" },
    "text-tertiary": { "$value": hslToHex(h, Math.min(s * 0.1, 8), 60), "$description": "Tertiary text" },
    "text-inverse":  { "$value": "#FFFFFF", "$description": "Inverse (on-primary) text" },
    "success":       { "$value": "#22C55E", "$description": "Success state" },
    "error":         { "$value": "#EF4444", "$description": "Error state" },
    "warning":       { "$value": "#F59E0B", "$description": "Warning state" },
    "info":          { "$value": brandHex, "$description": "Info state (matches primary)" }
  };

  var dark: Record<string, any> | null = null;
  if (includeDark) {
    dark = {
      "$type": "color",
      "primary":       { "$value": hslToHex(h, Math.min(s + 5, 100), Math.min(l + 10, 70)), "$description": "Primary brand color (dark)" },
      "primary-light": { "$value": hslToHex(h, Math.max(s - 5, 0), Math.min(l + 20, 80)), "$description": "Lighter primary (dark)" },
      "primary-dark":  { "$value": hslToHex(h, Math.min(s + 10, 100), Math.max(l - 5, 20)), "$description": "Darker primary (dark)" },
      "secondary":     { "$value": hslToHex((h + 180) % 360, Math.max(s - 20, 15), 60), "$description": "Complementary secondary (dark)" },
      "accent":        { "$value": hslToHex((h + 30) % 360, Math.min(s, 85), 65), "$description": "Analogous accent (dark)" },
      "background":    { "$value": hslToHex(h, Math.min(s * 0.2, 12), 8), "$description": "Page background (dark)" },
      "background-offset": { "$value": hslToHex(h, Math.min(s * 0.2, 12), 11), "$description": "Offset background (dark)" },
      "surface":       { "$value": hslToHex(h, Math.min(s * 0.15, 10), 14), "$description": "Card/surface (dark)" },
      "surface-elevated": { "$value": hslToHex(h, Math.min(s * 0.15, 10), 18), "$description": "Elevated surface (dark)" },
      "border":        { "$value": hslToHex(h, Math.min(s * 0.12, 8), 22), "$description": "Default border (dark)" },
      "border-light":  { "$value": hslToHex(h, Math.min(s * 0.1, 6), 18), "$description": "Subtle border (dark)" },
      "text-primary":  { "$value": hslToHex(h, Math.max(s * 0.08, 3), 93), "$description": "Primary text (dark)" },
      "text-secondary": { "$value": hslToHex(h, Math.max(s * 0.06, 3), 65), "$description": "Secondary text (dark)" },
      "text-tertiary": { "$value": hslToHex(h, Math.max(s * 0.05, 2), 45), "$description": "Tertiary text (dark)" },
      "text-inverse":  { "$value": hslToHex(h, Math.min(s * 0.3, 15), 12), "$description": "Inverse text (dark)" },
      "success":       { "$value": "#34D399", "$description": "Success (dark)" },
      "error":         { "$value": "#F87171", "$description": "Error (dark)" },
      "warning":       { "$value": "#FBBF24", "$description": "Warning (dark)" },
      "info":          { "$value": hslToHex(h, Math.min(s + 5, 100), Math.min(l + 10, 70)), "$description": "Info (dark)" }
    };
  }
  return { light, dark };
}

// ── Style presets ──────────────────────────────────────────────────

var STYLE_PRESETS: Record<string, { typography: any; spacing: any; radius: any; elevation: any; motion: any; defaultColor: string }> = {
  minimal: {
    defaultColor: "#3B82F6",
    typography: {
      "font-family": { "$type": "fontFamily", "display": { "$value": "\"Inter\", system-ui, sans-serif", "$description": "Display font" }, "body": { "$value": "\"Inter\", system-ui, sans-serif", "$description": "Body font" }, "mono": { "$value": "ui-monospace, \"SF Mono\", monospace", "$description": "Monospace font" } },
      "font-size": { "$type": "dimension", "2xs": { "$value": "11px" }, "xs": { "$value": "12px" }, "sm": { "$value": "14px" }, "base": { "$value": "16px" }, "lg": { "$value": "18px" }, "xl": { "$value": "20px" }, "2xl": { "$value": "24px" }, "3xl": { "$value": "30px" }, "4xl": { "$value": "36px" }, "5xl": { "$value": "48px" } },
      "font-weight": { "$type": "fontWeight", "regular": { "$value": "400" }, "medium": { "$value": "500" }, "semibold": { "$value": "600" }, "bold": { "$value": "700" } },
      "line-height": { "$type": "number", "tight": { "$value": "1.25" }, "normal": { "$value": "1.5" }, "relaxed": { "$value": "1.75" } }
    },
    spacing: { "$type": "dimension", "0": { "$value": "0px" }, "1": { "$value": "4px" }, "2": { "$value": "8px" }, "3": { "$value": "12px" }, "4": { "$value": "16px" }, "5": { "$value": "20px" }, "6": { "$value": "24px" }, "8": { "$value": "32px" }, "10": { "$value": "40px" }, "12": { "$value": "48px" }, "16": { "$value": "64px" }, "20": { "$value": "80px" } },
    radius: { "$type": "dimension", "none": { "$value": "0px" }, "sm": { "$value": "4px" }, "md": { "$value": "6px" }, "lg": { "$value": "8px" }, "xl": { "$value": "12px" }, "2xl": { "$value": "16px" }, "full": { "$value": "9999px" } },
    elevation: { "sm": { "$type": "shadow", "$value": "0 1px 2px rgba(0,0,0,0.05)", "$description": "Subtle" }, "md": { "$type": "shadow", "$value": "0 4px 6px -1px rgba(0,0,0,0.1)", "$description": "Medium" }, "lg": { "$type": "shadow", "$value": "0 10px 15px -3px rgba(0,0,0,0.1)", "$description": "Large" }, "xl": { "$type": "shadow", "$value": "0 20px 25px -5px rgba(0,0,0,0.1)", "$description": "Extra large" } },
    motion: { "duration": { "$type": "duration", "fast": { "$value": "100ms" }, "normal": { "$value": "200ms" }, "slow": { "$value": "400ms" } }, "easing": { "$type": "cubicBezier", "default": { "$value": "cubic-bezier(0.4, 0, 0.2, 1)" }, "in": { "$value": "cubic-bezier(0.4, 0, 1, 1)" }, "out": { "$value": "cubic-bezier(0, 0, 0.2, 1)" }, "bounce": { "$value": "cubic-bezier(0.34, 1.56, 0.64, 1)" } } }
  },
  bold: {
    defaultColor: "#8B5CF6",
    typography: {
      "font-family": { "$type": "fontFamily", "display": { "$value": "\"Plus Jakarta Sans\", system-ui, sans-serif", "$description": "Display font" }, "body": { "$value": "\"Inter\", system-ui, sans-serif", "$description": "Body font" }, "mono": { "$value": "\"JetBrains Mono\", monospace", "$description": "Monospace font" } },
      "font-size": { "$type": "dimension", "2xs": { "$value": "12px" }, "xs": { "$value": "13px" }, "sm": { "$value": "15px" }, "base": { "$value": "17px" }, "lg": { "$value": "20px" }, "xl": { "$value": "24px" }, "2xl": { "$value": "30px" }, "3xl": { "$value": "36px" }, "4xl": { "$value": "48px" }, "5xl": { "$value": "60px" } },
      "font-weight": { "$type": "fontWeight", "regular": { "$value": "400" }, "medium": { "$value": "500" }, "semibold": { "$value": "600" }, "bold": { "$value": "700" }, "extrabold": { "$value": "800" } },
      "line-height": { "$type": "number", "tight": { "$value": "1.2" }, "normal": { "$value": "1.5" }, "relaxed": { "$value": "1.7" } }
    },
    spacing: { "$type": "dimension", "0": { "$value": "0px" }, "1": { "$value": "4px" }, "2": { "$value": "8px" }, "3": { "$value": "12px" }, "4": { "$value": "16px" }, "6": { "$value": "24px" }, "8": { "$value": "32px" }, "10": { "$value": "40px" }, "12": { "$value": "48px" }, "16": { "$value": "64px" }, "20": { "$value": "80px" }, "24": { "$value": "96px" } },
    radius: { "$type": "dimension", "none": { "$value": "0px" }, "sm": { "$value": "8px" }, "md": { "$value": "12px" }, "lg": { "$value": "16px" }, "xl": { "$value": "20px" }, "2xl": { "$value": "24px" }, "full": { "$value": "9999px" } },
    elevation: { "sm": { "$type": "shadow", "$value": "0 2px 4px rgba(0,0,0,0.08)", "$description": "Subtle" }, "md": { "$type": "shadow", "$value": "0 8px 16px -2px rgba(0,0,0,0.12)", "$description": "Medium" }, "lg": { "$type": "shadow", "$value": "0 16px 32px -4px rgba(0,0,0,0.15)", "$description": "Large" }, "xl": { "$type": "shadow", "$value": "0 24px 48px -8px rgba(0,0,0,0.2)", "$description": "Extra large" } },
    motion: { "duration": { "$type": "duration", "fast": { "$value": "150ms" }, "normal": { "$value": "300ms" }, "slow": { "$value": "500ms" } }, "easing": { "$type": "cubicBezier", "default": { "$value": "cubic-bezier(0.16, 1, 0.3, 1)" }, "in": { "$value": "cubic-bezier(0.55, 0, 1, 0.45)" }, "out": { "$value": "cubic-bezier(0, 0.55, 0.45, 1)" }, "bounce": { "$value": "cubic-bezier(0.34, 1.56, 0.64, 1)" } } }
  },
  warm: {
    defaultColor: "#D97706",
    typography: {
      "font-family": { "$type": "fontFamily", "display": { "$value": "\"DM Serif Display\", Georgia, serif", "$description": "Display font" }, "body": { "$value": "\"DM Sans\", system-ui, sans-serif", "$description": "Body font" }, "mono": { "$value": "\"Fira Code\", monospace", "$description": "Monospace font" } },
      "font-size": { "$type": "dimension", "2xs": { "$value": "11px" }, "xs": { "$value": "13px" }, "sm": { "$value": "15px" }, "base": { "$value": "17px" }, "lg": { "$value": "19px" }, "xl": { "$value": "22px" }, "2xl": { "$value": "28px" }, "3xl": { "$value": "34px" }, "4xl": { "$value": "42px" }, "5xl": { "$value": "54px" } },
      "font-weight": { "$type": "fontWeight", "regular": { "$value": "400" }, "medium": { "$value": "500" }, "semibold": { "$value": "600" }, "bold": { "$value": "700" } },
      "line-height": { "$type": "number", "tight": { "$value": "1.3" }, "normal": { "$value": "1.6" }, "relaxed": { "$value": "1.8" } }
    },
    spacing: { "$type": "dimension", "0": { "$value": "0px" }, "1": { "$value": "4px" }, "2": { "$value": "8px" }, "3": { "$value": "12px" }, "4": { "$value": "16px" }, "5": { "$value": "20px" }, "6": { "$value": "24px" }, "8": { "$value": "32px" }, "10": { "$value": "40px" }, "12": { "$value": "48px" }, "16": { "$value": "64px" }, "20": { "$value": "80px" } },
    radius: { "$type": "dimension", "none": { "$value": "0px" }, "sm": { "$value": "6px" }, "md": { "$value": "10px" }, "lg": { "$value": "14px" }, "xl": { "$value": "18px" }, "2xl": { "$value": "24px" }, "full": { "$value": "9999px" } },
    elevation: { "sm": { "$type": "shadow", "$value": "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)", "$description": "Soft subtle" }, "md": { "$type": "shadow", "$value": "0 4px 12px rgba(0,0,0,0.08)", "$description": "Soft medium" }, "lg": { "$type": "shadow", "$value": "0 12px 24px rgba(0,0,0,0.1)", "$description": "Soft large" }, "xl": { "$type": "shadow", "$value": "0 20px 40px rgba(0,0,0,0.12)", "$description": "Soft extra large" } },
    motion: { "duration": { "$type": "duration", "fast": { "$value": "120ms" }, "normal": { "$value": "250ms" }, "slow": { "$value": "450ms" } }, "easing": { "$type": "cubicBezier", "default": { "$value": "cubic-bezier(0.25, 0.1, 0.25, 1)" }, "in": { "$value": "cubic-bezier(0.42, 0, 1, 1)" }, "out": { "$value": "cubic-bezier(0, 0, 0.58, 1)" }, "bounce": { "$value": "cubic-bezier(0.34, 1.4, 0.64, 1)" } } }
  },
  corporate: {
    defaultColor: "#1E40AF",
    typography: {
      "font-family": { "$type": "fontFamily", "display": { "$value": "\"Inter\", system-ui, sans-serif", "$description": "Display font" }, "body": { "$value": "\"Inter\", system-ui, sans-serif", "$description": "Body font" }, "mono": { "$value": "\"SF Mono\", monospace", "$description": "Monospace font" } },
      "font-size": { "$type": "dimension", "2xs": { "$value": "11px" }, "xs": { "$value": "12px" }, "sm": { "$value": "14px" }, "base": { "$value": "16px" }, "lg": { "$value": "18px" }, "xl": { "$value": "20px" }, "2xl": { "$value": "24px" }, "3xl": { "$value": "28px" }, "4xl": { "$value": "32px" }, "5xl": { "$value": "40px" } },
      "font-weight": { "$type": "fontWeight", "regular": { "$value": "400" }, "medium": { "$value": "500" }, "semibold": { "$value": "600" }, "bold": { "$value": "700" } },
      "line-height": { "$type": "number", "tight": { "$value": "1.25" }, "normal": { "$value": "1.5" }, "relaxed": { "$value": "1.65" } }
    },
    spacing: { "$type": "dimension", "0": { "$value": "0px" }, "1": { "$value": "4px" }, "2": { "$value": "8px" }, "3": { "$value": "12px" }, "4": { "$value": "16px" }, "5": { "$value": "20px" }, "6": { "$value": "24px" }, "8": { "$value": "32px" }, "10": { "$value": "40px" }, "12": { "$value": "48px" }, "16": { "$value": "64px" } },
    radius: { "$type": "dimension", "none": { "$value": "0px" }, "sm": { "$value": "2px" }, "md": { "$value": "4px" }, "lg": { "$value": "6px" }, "xl": { "$value": "8px" }, "2xl": { "$value": "12px" }, "full": { "$value": "9999px" } },
    elevation: { "sm": { "$type": "shadow", "$value": "0 1px 2px rgba(0,0,0,0.06)", "$description": "Crisp subtle" }, "md": { "$type": "shadow", "$value": "0 2px 8px rgba(0,0,0,0.1)", "$description": "Crisp medium" }, "lg": { "$type": "shadow", "$value": "0 4px 16px rgba(0,0,0,0.12)", "$description": "Crisp large" }, "xl": { "$type": "shadow", "$value": "0 8px 24px rgba(0,0,0,0.15)", "$description": "Crisp extra large" } },
    motion: { "duration": { "$type": "duration", "fast": { "$value": "100ms" }, "normal": { "$value": "180ms" }, "slow": { "$value": "350ms" } }, "easing": { "$type": "cubicBezier", "default": { "$value": "cubic-bezier(0.4, 0, 0.2, 1)" }, "in": { "$value": "cubic-bezier(0.4, 0, 1, 1)" }, "out": { "$value": "cubic-bezier(0, 0, 0.2, 1)" }, "bounce": { "$value": "cubic-bezier(0.25, 1.5, 0.5, 1)" } } }
  },
  playful: {
    defaultColor: "#EC4899",
    typography: {
      "font-family": { "$type": "fontFamily", "display": { "$value": "\"Nunito\", system-ui, sans-serif", "$description": "Display font" }, "body": { "$value": "\"Nunito Sans\", system-ui, sans-serif", "$description": "Body font" }, "mono": { "$value": "\"Fira Code\", monospace", "$description": "Monospace font" } },
      "font-size": { "$type": "dimension", "2xs": { "$value": "12px" }, "xs": { "$value": "13px" }, "sm": { "$value": "15px" }, "base": { "$value": "17px" }, "lg": { "$value": "20px" }, "xl": { "$value": "24px" }, "2xl": { "$value": "32px" }, "3xl": { "$value": "40px" }, "4xl": { "$value": "52px" }, "5xl": { "$value": "64px" } },
      "font-weight": { "$type": "fontWeight", "regular": { "$value": "400" }, "medium": { "$value": "500" }, "semibold": { "$value": "600" }, "bold": { "$value": "700" }, "extrabold": { "$value": "800" } },
      "line-height": { "$type": "number", "tight": { "$value": "1.2" }, "normal": { "$value": "1.55" }, "relaxed": { "$value": "1.75" } }
    },
    spacing: { "$type": "dimension", "0": { "$value": "0px" }, "1": { "$value": "4px" }, "2": { "$value": "8px" }, "3": { "$value": "12px" }, "4": { "$value": "16px" }, "6": { "$value": "24px" }, "8": { "$value": "32px" }, "10": { "$value": "40px" }, "12": { "$value": "48px" }, "16": { "$value": "64px" }, "20": { "$value": "80px" }, "24": { "$value": "96px" } },
    radius: { "$type": "dimension", "none": { "$value": "0px" }, "sm": { "$value": "10px" }, "md": { "$value": "16px" }, "lg": { "$value": "20px" }, "xl": { "$value": "24px" }, "2xl": { "$value": "32px" }, "full": { "$value": "9999px" } },
    elevation: { "sm": { "$type": "shadow", "$value": "0 2px 8px rgba(0,0,0,0.06)", "$description": "Playful subtle" }, "md": { "$type": "shadow", "$value": "0 8px 24px rgba(0,0,0,0.1)", "$description": "Playful medium" }, "lg": { "$type": "shadow", "$value": "0 16px 40px rgba(0,0,0,0.12)", "$description": "Playful large" }, "xl": { "$type": "shadow", "$value": "0 24px 48px rgba(0,0,0,0.16)", "$description": "Playful extra large" } },
    motion: { "duration": { "$type": "duration", "fast": { "$value": "150ms" }, "normal": { "$value": "350ms" }, "slow": { "$value": "600ms" } }, "easing": { "$type": "cubicBezier", "default": { "$value": "cubic-bezier(0.34, 1.56, 0.64, 1)" }, "in": { "$value": "cubic-bezier(0.55, 0, 1, 0.45)" }, "out": { "$value": "cubic-bezier(0, 0.55, 0.45, 1)" }, "bounce": { "$value": "cubic-bezier(0.175, 0.885, 0.32, 1.275)" } } }
  },
  dark: {
    defaultColor: "#00BFFF",
    typography: {
      "font-family": { "$type": "fontFamily", "display": { "$value": "\"Inter\", system-ui, sans-serif", "$description": "Display font" }, "body": { "$value": "\"Inter\", system-ui, sans-serif", "$description": "Body font" }, "mono": { "$value": "\"Cascadia Code\", ui-monospace, monospace", "$description": "Monospace font" } },
      "font-size": { "$type": "dimension", "2xs": { "$value": "11px" }, "xs": { "$value": "12px" }, "sm": { "$value": "14px" }, "base": { "$value": "16px" }, "lg": { "$value": "18px" }, "xl": { "$value": "20px" }, "2xl": { "$value": "24px" }, "3xl": { "$value": "30px" }, "4xl": { "$value": "36px" }, "5xl": { "$value": "48px" } },
      "font-weight": { "$type": "fontWeight", "regular": { "$value": "400" }, "medium": { "$value": "500" }, "semibold": { "$value": "600" }, "bold": { "$value": "700" } },
      "line-height": { "$type": "number", "tight": { "$value": "1.25" }, "normal": { "$value": "1.5" }, "relaxed": { "$value": "1.75" } }
    },
    spacing: { "$type": "dimension", "0": { "$value": "0px" }, "1": { "$value": "4px" }, "2": { "$value": "8px" }, "3": { "$value": "12px" }, "4": { "$value": "16px" }, "5": { "$value": "20px" }, "6": { "$value": "24px" }, "8": { "$value": "32px" }, "10": { "$value": "40px" }, "12": { "$value": "48px" }, "16": { "$value": "64px" }, "20": { "$value": "80px" } },
    radius: { "$type": "dimension", "none": { "$value": "0px" }, "sm": { "$value": "6px" }, "md": { "$value": "8px" }, "lg": { "$value": "12px" }, "xl": { "$value": "16px" }, "2xl": { "$value": "20px" }, "full": { "$value": "9999px" } },
    elevation: { "sm": { "$type": "shadow", "$value": "0 0 8px rgba(0,191,255,0.06), 0 2px 4px rgba(0,0,0,0.2)", "$description": "Glow subtle" }, "md": { "$type": "shadow", "$value": "0 0 16px rgba(0,191,255,0.08), 0 4px 12px rgba(0,0,0,0.25)", "$description": "Glow medium" }, "lg": { "$type": "shadow", "$value": "0 0 24px rgba(0,191,255,0.1), 0 8px 24px rgba(0,0,0,0.3)", "$description": "Glow large" }, "xl": { "$type": "shadow", "$value": "0 0 40px rgba(0,191,255,0.12), 0 16px 40px rgba(0,0,0,0.35)", "$description": "Glow extra large" } },
    motion: { "duration": { "$type": "duration", "fast": { "$value": "100ms" }, "normal": { "$value": "250ms" }, "slow": { "$value": "450ms" } }, "easing": { "$type": "cubicBezier", "default": { "$value": "cubic-bezier(0.16, 1, 0.3, 1)" }, "in": { "$value": "cubic-bezier(0.4, 0, 1, 1)" }, "out": { "$value": "cubic-bezier(0, 0, 0.2, 1)" }, "bounce": { "$value": "cubic-bezier(0.34, 1.56, 0.64, 1)" } } }
  }
};

// ── Token set generation ───────────────────────────────────────────

interface GenerateOptions {
  name: string;
  base_system?: string;
  brand_color?: string;
  style?: string;
  dark_mode?: boolean;
}

function generateTokenSet(opts: GenerateOptions): any {
  var styleName = opts.style || "minimal";
  var preset = STYLE_PRESETS[styleName] || STYLE_PRESETS.minimal;
  var includeDark = opts.dark_mode !== false;
  var brandColor = opts.brand_color || preset.defaultColor;

  // Start from base system or preset
  var tokens: any;
  if (opts.base_system) {
    var base = loadSystem(opts.base_system);
    if (!base) {
      tokens = {};
    } else {
      tokens = JSON.parse(JSON.stringify(base)); // deep clone
    }
  } else {
    tokens = {};
  }

  tokens["$name"] = opts.name;
  tokens["$description"] = "Design system for " + opts.name + " — generated by Raven MCP";

  // Generate color palette from brand color
  var palette = generatePalette(brandColor, includeDark);
  tokens["color"] = palette.light;
  if (palette.dark) tokens["color-dark"] = palette.dark;

  // Apply preset for missing groups
  if (!tokens["typography"]) tokens["typography"] = preset.typography;
  if (!tokens["spacing"]) tokens["spacing"] = preset.spacing;
  if (!tokens["radius"]) tokens["radius"] = preset.radius;
  if (!tokens["elevation"]) tokens["elevation"] = preset.elevation;
  if (!tokens["motion"]) tokens["motion"] = preset.motion;

  return tokens;
}

// ── Search and matching helpers ─────────────────────────────────────

function matchesTags(tags: string[], query: string): boolean {
  var terms = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  return terms.some(term =>
    tags.some(tag => tag.includes(term) || term.includes(tag))
  );
}

function textSearch(text: string, query: string): boolean {
  var lower = text.toLowerCase();
  var terms = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  return terms.some(term => lower.includes(term));
}

function formatPrinciple(p: Principle, format: string): any {
  if (format === "brief") {
    return { id: p.id, name: p.name, summary: p.summary };
  }
  if (format === "checklist") {
    return {
      id: p.id,
      name: p.name,
      summary: p.summary,
      implications: p.implications,
      violations: p.violations
    };
  }
  return p;
}

// ── Service blueprint HTML generator ───────────────────────────────
// Renders a Stickdorn-style service blueprint as a self-contained HTML
// page. Rows: physical evidence, user actions, frontstage, line of
// visibility, backstage, support processes. Steps are the columns.
// Optionally renders current vs ideal state side-by-side.

interface BlueprintActorSide {
  action?: string;
  frontstage?: string;
  evidence?: string;
}

interface BlueprintStep {
  label: string;
  user_action?: string;
  frontstage?: string;
  backstage?: string;
  support?: string;
  evidence?: string;
  pain_point?: string;
  delight?: string;
  actor_b?: BlueprintActorSide;
}

interface BlueprintActors {
  a?: { label: string };
  b: { label: string };
}

interface BlueprintInput {
  service_name: string;
  subtitle?: string;
  state_label?: string; // "Current state", "Ideal state", etc.
  steps: BlueprintStep[];
  actors?: BlueprintActors;
}

function escapeHtml(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBlueprintSection(bp: BlueprintInput): string {
  var stepCount = bp.steps.length;
  var twoActor = !!(bp.actors && bp.actors.b);
  var labelA = (bp.actors && bp.actors.a && bp.actors.a.label) || "User";
  var labelB = twoActor ? bp.actors!.b.label : "";

  var cols = bp.steps.map(function (s) {
    return '<div class="step-header">' + escapeHtml(s.label) + '</div>';
  }).join("");

  function rowFromCells(title: string, accent: string, cells: string): string {
    return (
      '<div class="row">' +
      '<div class="row-label ' + accent + '">' + title + '</div>' +
      '<div class="row-cells" style="grid-template-columns: repeat(' + stepCount + ', minmax(0, 1fr));">' + cells + '</div>' +
      '</div>'
    );
  }

  function row(title: string, accent: string, field: keyof BlueprintStep): string {
    var cells = bp.steps.map(function (s) {
      var content = s[field];
      return content
        ? '<div class="cell">' + escapeHtml(content as string) + '</div>'
        : '<div class="cell cell-empty"></div>';
    }).join("");
    return rowFromCells(title, accent, cells);
  }

  function actorBRow(title: string, accent: string, field: keyof BlueprintActorSide): string {
    var cells = bp.steps.map(function (s) {
      var content = s.actor_b ? s.actor_b[field] : undefined;
      return content
        ? '<div class="cell">' + escapeHtml(content) + '</div>'
        : '<div class="cell cell-empty"></div>';
    }).join("");
    return rowFromCells(title, accent, cells);
  }

  // Pain/delight row is merged — one cell per step
  var pdCells = bp.steps.map(function (s) {
    if (s.pain_point) return '<div class="cell pain"><span class="tag tag-pain">Pain</span>' + escapeHtml(s.pain_point) + '</div>';
    if (s.delight) return '<div class="cell delight"><span class="tag tag-delight">Moment</span>' + escapeHtml(s.delight) + '</div>';
    return '<div class="cell cell-empty"></div>';
  }).join("");

  var body: string;
  if (twoActor) {
    // Simple person silhouette avatars — Actor A plain, Actor B with a
    // subtle collar/V to distinguish. Both tint to their lane color.
    // Distinct role icons: User = a person silhouette; Expert = a
    // briefcase (universal shorthand for professional work, reads
    // across law / medicine / finance / real estate / advising).
    var avatarA =
      '<span class="lane-avatar-wrap">' +
      '<svg class="lane-avatar" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<circle cx="12" cy="9" r="4"/>' +
      '<path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5v1H4z"/>' +
      '</svg>' +
      '</span>';
    var avatarB =
      '<span class="lane-avatar-wrap">' +
      '<svg class="lane-avatar" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M9 5h6a1 1 0 0 1 1 1v2h-8V6a1 1 0 0 1 1-1zm-5 5h16a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a1 1 0 0 1 1-1zm8 3a1 1 0 0 0-1 1v1h2v-1a1 1 0 0 0-1-1z"/>' +
      '</svg>' +
      '</span>';

    // Two-actor / HI-loop layout:
    // Actor A (above line of interaction), Actor B (below), then line of visibility, backstage, support.
    body =
      '<div class="swim-lane lane-a">' +
      '<div class="lane-label lane-label-a">' + avatarA + '<span>' + escapeHtml(labelA) + '</span></div>' +
      row("Physical evidence", "row-evidence", "evidence") +
      row("Actions", "row-user", "user_action") +
      row("Frontstage (sees)", "row-frontstage", "frontstage") +
      '</div>' +
      '<div class="line-of-interaction">Line of interaction</div>' +
      '<div class="swim-lane lane-b">' +
      '<div class="lane-label lane-label-b">' + avatarB + '<span>' + escapeHtml(labelB) + '</span></div>' +
      actorBRow("Physical evidence", "row-evidence", "evidence") +
      actorBRow("Actions", "row-user", "action") +
      actorBRow("Frontstage (sees)", "row-frontstage", "frontstage") +
      '</div>' +
      '<div class="line-of-visibility">Line of visibility</div>' +
      row("Backstage", "row-backstage", "backstage") +
      row("Support processes", "row-support", "support") +
      rowFromCells("Pain / moments", "row-pain", pdCells);
  } else {
    body =
      row("Physical evidence", "row-evidence", "evidence") +
      row("User actions", "row-user", "user_action") +
      row("Frontstage", "row-frontstage", "frontstage") +
      '<div class="line-of-visibility">Line of visibility</div>' +
      row("Backstage", "row-backstage", "backstage") +
      row("Support processes", "row-support", "support") +
      rowFromCells("Pain / moments", "row-pain", pdCells);
  }

  return (
    '<section class="blueprint' + (twoActor ? ' two-actor' : '') + '">' +
    (bp.state_label ? '<h2 class="state-label">' + escapeHtml(bp.state_label) + '</h2>' : '') +
    '<div class="steps-header" style="grid-template-columns: 180px repeat(' + stepCount + ', minmax(0, 1fr));">' +
    '<div class="row-label empty-label">Step</div>' +
    cols +
    '</div>' +
    body +
    '</section>'
  );
}

function generateServiceBlueprintHtml(current: BlueprintInput, ideal: BlueprintInput | null): string {
  var subtitle = current.subtitle ? '<p class="subtitle">' + escapeHtml(current.subtitle) + '</p>' : '';
  var currentBlueprint = renderBlueprintSection({
    ...current,
    state_label: current.state_label || (ideal ? "Current state" : undefined)
  });
  var idealBlueprint = ideal
    ? renderBlueprintSection({
        ...ideal,
        service_name: current.service_name,
        state_label: ideal.state_label || "Ideal state"
      })
    : "";

  var css =
    ':root {' +
    '--bg-base:#1a1a22;--bg-surface:#212129;--bg-raised:#2a2a33;--bg-alt:#16161e;' +
    '--border:rgba(255,255,255,0.08);--border-strong:rgba(255,255,255,0.12);' +
    '--text-primary:#F0F0F2;--text-secondary:#9498A0;--text-tertiary:#5C5F68;' +
    '--accent-blue:#00BFFF;--accent-green:#00E676;--accent-orange:#FFAB40;--accent-pink:#FF4081;--accent-purple:#B388FF;' +
    '--font-body:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    '}' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:var(--font-body);background:var(--bg-base);color:var(--text-primary);padding:48px 24px;line-height:1.5;font-size:14px;-webkit-font-smoothing:antialiased}' +
    '.container{max-width:1600px;margin:0 auto}' +
    'header{margin-bottom:48px;padding-bottom:24px;border-bottom:1px solid var(--border)}' +
    'header .eyebrow{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-blue);font-weight:700;margin-bottom:8px}' +
    'header h1{font-size:32px;font-weight:800;letter-spacing:-0.02em;margin-bottom:8px}' +
    'header .subtitle{color:var(--text-secondary);font-size:16px;max-width:720px}' +
    '.blueprint{margin-bottom:64px}' +
    '.state-label{font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border)}' +
    '.steps-header{display:grid;gap:8px;margin-bottom:12px}' +
    '.step-header{background:var(--bg-raised);padding:12px 14px;font-weight:700;font-size:13px;border-radius:10px;border:1px solid var(--border);text-align:center}' +
    '.row{display:grid;grid-template-columns:180px 1fr;gap:8px;margin-bottom:8px;align-items:stretch}' +
    '.row-label{padding:12px 14px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border-radius:10px;display:flex;align-items:center;min-height:72px}' +
    '.row-evidence{background:rgba(179,136,255,0.08);color:var(--accent-purple);border:1px solid rgba(179,136,255,0.18)}' +
    '.row-user{background:rgba(0,191,255,0.08);color:var(--accent-blue);border:1px solid rgba(0,191,255,0.18)}' +
    '.row-frontstage{background:rgba(0,230,118,0.08);color:var(--accent-green);border:1px solid rgba(0,230,118,0.18)}' +
    '.row-backstage{background:rgba(255,171,64,0.08);color:var(--accent-orange);border:1px solid rgba(255,171,64,0.18)}' +
    '.row-support{background:rgba(255,64,129,0.06);color:var(--accent-pink);border:1px solid rgba(255,64,129,0.14)}' +
    '.row-pain{background:rgba(255,255,255,0.04);color:var(--text-secondary);border:1px solid var(--border)}' +
    '.swim-lane{padding:18px 18px 14px;position:relative;border-radius:14px;margin-bottom:4px}' +
    '.lane-a{background:rgba(0,191,255,0.04);border:1px solid rgba(0,191,255,0.15);border-left:4px solid var(--accent-blue)}' +
    '.lane-b{background:rgba(255,171,64,0.04);border:1px solid rgba(255,171,64,0.15);border-left:4px solid var(--accent-orange)}' +
    '.lane-label{font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:14px;display:inline-flex;align-items:center;gap:10px;padding:6px 16px 6px 6px;border-radius:9999px;background:rgba(255,255,255,0.05);border:1px solid var(--border)}' +
    '.lane-avatar-wrap{width:28px;height:28px;border-radius:9999px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '.lane-avatar{width:20px;height:20px}' +
    '.lane-label-a .lane-avatar-wrap{background:var(--accent-blue)}' +
    '.lane-label-b .lane-avatar-wrap{background:var(--accent-orange)}' +
    '.lane-label-a .lane-avatar{color:var(--bg-base)}' +
    '.lane-label-b .lane-avatar{color:var(--bg-base)}' +
    '.lane-label-a{color:var(--accent-blue);background:rgba(0,191,255,0.12);border-color:rgba(0,191,255,0.28)}' +
    '.lane-label-b{color:var(--accent-orange);background:rgba(255,171,64,0.12);border-color:rgba(255,171,64,0.28)}' +
    '.line-of-interaction{text-align:center;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-primary);padding:14px 0;border-top:2px solid var(--border-strong);border-bottom:2px solid var(--border-strong);margin:10px 0;background:linear-gradient(90deg,rgba(0,191,255,0.10),rgba(255,171,64,0.10))}' +
    '.empty-label{background:transparent;border:1px dashed var(--border);color:var(--text-tertiary)}' +
    '.row-cells{display:grid;gap:8px}' +
    '.cell{background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;font-size:13px;color:var(--text-primary);min-height:72px;display:flex;flex-direction:column;gap:6px}' +
    '.cell.pain{background:rgba(255,64,129,0.08);border-color:rgba(255,64,129,0.22)}' +
    '.cell.delight{background:rgba(0,230,118,0.08);border-color:rgba(0,230,118,0.22)}' +
    '.cell.cell-empty{background:transparent;border:none;padding:0;min-height:72px}' +
    '.tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:2px 8px;border-radius:9999px;width:fit-content}' +
    '.tag-pain{background:rgba(255,64,129,0.18);color:var(--accent-pink)}' +
    '.tag-delight{background:rgba(0,230,118,0.18);color:var(--accent-green)}' +
    '.line-of-visibility{text-align:center;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-tertiary);padding:14px 0;border-top:2px dashed var(--border-strong);border-bottom:2px dashed var(--border-strong);margin:14px 0}' +
    'footer{margin-top:48px;padding-top:24px;border-top:1px solid var(--border);color:var(--text-tertiary);font-size:12px;text-align:center}';

  var html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<title>Service blueprint &mdash; ' + escapeHtml(current.service_name) + '</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<style>' + css + '</style>' +
    '</head><body><div class="container">' +
    '<header>' +
    '<div class="eyebrow">Service blueprint</div>' +
    '<h1>' + escapeHtml(current.service_name) + '</h1>' +
    subtitle +
    '</header>' +
    currentBlueprint +
    idealBlueprint +
    '<footer>Generated by Raven &middot; frontstage / line of visibility / backstage &middot; Shostack-Stickdorn</footer>' +
    '</div></body></html>';

  return html;
}

// ── Update check ────────────────────────────────────────────────────
// On startup, fetch the latest published version from npm and compare against
// our own. Minor/major bumps get surfaced via stderr + injected into the first
// tool response. Patch releases stay silent. Never blocks. Never throws. Can
// be disabled with RAVEN_NO_UPDATE_CHECK=1.

var PKG_VERSION: string = "0.0.0";
try {
  var pkgPath = join(PKG_ROOT, "package.json");
  if (existsSync(pkgPath)) {
    PKG_VERSION = JSON.parse(readFileSync(pkgPath, "utf-8")).version || "0.0.0";
  }
} catch (_err) {
  // Best-effort version read; falls back to "0.0.0" if package.json is unavailable.
}

var pendingUpdateNotice: string | null = null;
var noticeShown: boolean = false;

function cmpVersions(a: string, b: string): "older" | "same" | "newer-patch" | "newer-minor" | "newer-major" {
  var pa = a.split(".").map(function (n) { return parseInt(n, 10) || 0; });
  var pb = b.split(".").map(function (n) { return parseInt(n, 10) || 0; });
  if (pa[0] < pb[0]) return "newer-major";
  if (pa[0] > pb[0]) return "older";
  if (pa[1] < pb[1]) return "newer-minor";
  if (pa[1] > pb[1]) return "older";
  if (pa[2] < pb[2]) return "newer-patch";
  if (pa[2] > pb[2]) return "older";
  return "same";
}

async function checkForUpdate(): Promise<void> {
  if (process.env.RAVEN_NO_UPDATE_CHECK === "1") return;
  try {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 3000);
    var res = await fetch("https://registry.npmjs.org/raven-mcp/latest", {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    clearTimeout(timer);
    if (!res.ok) return;
    var body: any = await res.json();
    var latest = String(body.version || "");
    if (!latest) return;
    var cmp = cmpVersions(PKG_VERSION, latest);
    if (cmp === "newer-minor" || cmp === "newer-major") {
      var installHint = "npx -y raven-mcp@latest  •  https://ravenmcp.ai/raven.mcpb  •  https://ravenmcp.ai/changelog.html";
      pendingUpdateNotice =
        "⬆ Raven update available: you're on v" + PKG_VERSION + ", v" + latest + " is out (" +
        (cmp === "newer-major" ? "major" : "minor") + " bump). " + installHint;
      console.error(pendingUpdateNotice);
    }
  } catch (_err) {
    // Offline, blocked, rate-limited, anything — stay silent.
  }
}

// ── Usage log ───────────────────────────────────────────────────────
// Local-only, insight-only passive capture of every tool call so Andrew can
// ask Raven "what have I been using you for?" and get real signal back.
//
// What gets written: tool name, timestamp, elapsed ms, a small summary of the
// INPUT (no raw content), and the INSIGHT from the output (audit score, rule
// names that fired, pattern IDs returned, etc).
//
// What NEVER gets written: HTML bodies, prompt text, brand names, client copy,
// anything that could leak proprietary work.
//
// Location: $RAVEN_USAGE_LOG or ~/.raven/usage.jsonl. Opt out: RAVEN_NO_USAGE_LOG=1.

import { appendFileSync, mkdirSync, readFileSync as fsReadFile, existsSync as fsExists, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { spawnSync } from "child_process";

// Disabled on Vercel (process.env.VERCEL is set on every Vercel function
// invocation, never in stdio contexts) so the per-request update/digest banner
// module-state can't leak across concurrent requests on Fluid Compute, and so
// no write is attempted against a read-only serverless home. This is purely
// additive: locally (stdio) VERCEL is unset, so USAGE_LOG_ENABLED is unchanged
// and the stdio wire contract stays byte-for-byte identical.
var USAGE_LOG_ENABLED = process.env.RAVEN_NO_USAGE_LOG !== "1";
var USAGE_LOG_PATH = process.env.RAVEN_USAGE_LOG || join(homedir(), ".raven", "usage.jsonl");

function safeStr(s: any, max: number = 64): string {
  if (typeof s !== "string") return "";
  var t = s.trim();
  if (t.length > max) t = t.slice(0, max);
  return t.replace(/\s+/g, " ");
}

function extractInsight(toolName: string, input: any, output: any): any {
  var insight: any = {};
  try {
    switch (toolName) {
      case "audit_page": {
        var text = output?.content?.[0]?.text || "";
        var parsed = JSON.parse(text);
        insight = {
          score: parsed.score,
          grade: parsed.grade,
          warnings: (parsed.warnings || []).map((w: any) => w.rule),
          errors: (parsed.errors || []).map((e: any) => e.rule)
        };
        break;
      }
      case "audit_layout": {
        var text2 = output?.content?.[0]?.text || "";
        var p2 = JSON.parse(text2);
        insight = {
          alignment: p2.alignment?.score,
          gap_rhythm: p2.gap_rhythm?.score,
          optical_balance: p2.optical_balance?.score
        };
        break;
      }
      case "audit_swiftui":
      case "audit_ios_screen":
      case "audit_ios_privacy": {
        var textIos = output?.content?.[0]?.text || "";
        var pIos = JSON.parse(textIos);
        insight = {
          platform: "ios",
          score: pIos.score,
          grade: pIos.grade,
          warnings: (pIos.warnings || []).map(function (w: any) { return w.rule; }),
          errors: (pIos.errors || []).map(function (e: any) { return e.rule; })
        };
        break;
      }
      case "evaluate_design": {
        insight = { goals: input?.goals || [] };
        break;
      }
      case "get_principles":
        insight = { category: input?.category || "auto", format: input?.format };
        break;
      case "get_pattern":
      case "get_business_strategy":
      case "get_checklist":
        insight = { type: input?.type };
        break;
      case "search_knowledge":
        insight = { layer: input?.layer || "all", query_len: (input?.query || "").length };
        break;
      case "get_d4d_framework":
        insight = { stage: input?.stage || "full" };
        break;
      case "list_design_systems":
        insight = { category: input?.category, search: !!input?.search };
        break;
      case "get_design_system":
        insight = { system: input?.id, format: input?.format };
        break;
      case "compose_system":
        insight = { parts: (input?.compositions || []).length };
        break;
      case "get_brand_system":
        insight = { company: safeStr(input?.company, 32), mode: input?.mode };
        break;
      case "list_content_systems":
        insight = { category: input?.category, search: !!input?.search };
        break;
      case "get_content_system":
        insight = { system: input?.id, section: input?.section };
        break;
      case "get_content_principles":
        insight = { context: safeStr(input?.context, 48), format: input?.format };
        break;
      case "get_content_pattern":
        insight = { type: input?.type };
        break;
      case "get_research_method":
        insight = { category: input?.category, search: !!input?.search };
        break;
      case "get_metrics_framework":
        insight = { id: input?.id, search: !!input?.search };
        break;
      case "get_service_pattern":
        insight = { type: input?.type };
        break;
      case "get_service_standard":
        insight = { action: "service-standard" };
        break;
      case "generate_service_blueprint":
        insight = {
          has_ideal: Array.isArray(input?.ideal),
          current_steps: Array.isArray(input?.current) ? input.current.length : 0,
          ideal_steps: Array.isArray(input?.ideal) ? input.ideal.length : 0,
          two_actor: !!(input?.actors && input.actors.b)
        };
        break;
      case "get_brand_principles":
        insight = { topic: safeStr(input?.topic, 32), format: input?.format };
        break;
      case "get_brand_trends":
        insight = { action: "trends" };
        break;
      case "list_creative_models":
        insight = { media_type: input?.media_type, capability: safeStr(input?.capability, 32) };
        break;
      case "list_creative_presets":
        insight = { media_type: input?.media_type, search: !!input?.search };
        break;
      case "create_brand_profile":
      case "get_brand_profile":
        insight = { brand: safeStr(input?.id || input?.name, 32) };
        break;
      case "list_brand_profiles":
        insight = { action: "list-brands" };
        break;
      case "register_creative_asset":
        insight = { asset_type: input?.type, tags: Array.isArray(input?.tags) ? input.tags.length : 0 };
        break;
      case "create_character_profile":
        insight = { refs: Array.isArray(input?.reference_asset_ids) ? input.reference_asset_ids.length : 0 };
        break;
      case "create_generation_job":
        insight = { media_type: input?.media_type, preset: input?.preset, execute: !!input?.execute };
        break;
      case "get_generation_job":
        insight = { action: "get-job" };
        break;
      case "list_generation_jobs":
        insight = { status: input?.status, media_type: input?.media_type };
        break;
      case "plan_creative_campaign":
        insight = {
          goal: input?.goal,
          channels: Array.isArray(input?.channels) ? input.channels.length : 0,
          create_jobs: input?.create_jobs !== false
        };
        break;
      case "score_creative":
        insight = { channel: safeStr(input?.channel, 32), has_brand: !!input?.brand_profile_id };
        break;
      case "generate_design_system":
        insight = { style: input?.style, has_brand_color: !!input?.brand_color, format: input?.format };
        break;
      case "raven_register":
      case "raven_reflect":
        insight = { action: toolName };
        break;
      case "create_taste_profile": {
        var tasteText = output?.content?.[0]?.text || "";
        var tasteOut = JSON.parse(tasteText);
        insight = { name: safeStr(input?.name, 32), rules: tasteOut.rules, corpus: tasteOut.corpus };
        break;
      }
      case "get_taste_profile":
      case "list_taste_profiles":
        insight = { action: toolName, name: safeStr(input?.name, 32) };
        break;
      case "label_finding":
        insight = { profile: safeStr(input?.profile, 32), verdict: input?.verdict, rule: safeStr(input?.violated_rule, 48) };
        break;
      case "audit_taste": {
        var atText = output?.content?.[0]?.text || "";
        var atOut = JSON.parse(atText);
        insight = {
          profile: safeStr(input?.profile, 32),
          verdict: atOut.verdict,
          findings: (atOut.findings || []).map(function (f: any) { return f.rule_id; }),
          suppressed: (atOut.suppressed || []).length,
          not_assessed: (atOut.not_assessed || []).length
        };
        break;
      }
      default:
        insight = {};
    }
  } catch (_err) {
    insight = { extract_failed: true };
  }
  return insight;
}

function logUsage(toolName: string, input: any, output: any, elapsedMs: number): void {
  if (!USAGE_LOG_ENABLED) return;
  try {
    var entry = {
      t: new Date().toISOString(),
      tool: toolName,
      ms: elapsedMs,
      insight: extractInsight(toolName, input, output)
    };
    mkdirSync(dirname(USAGE_LOG_PATH), { recursive: true });
    appendFileSync(USAGE_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch (_err) {
    // Never let logging disrupt a real tool call.
  }
}

function readUsageSince(daysBack: number): any[] {
  if (!fsExists(USAGE_LOG_PATH)) return [];
  try {
    var cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    var size = statSync(USAGE_LOG_PATH).size;
    // Cap read at 5 MB to stay cheap. Log grows slowly enough this is a decade.
    var start = Math.max(0, size - 5 * 1024 * 1024);
    var slice = fsReadFile(USAGE_LOG_PATH, "utf-8");
    if (start > 0) slice = slice.slice(slice.indexOf("\n", start) + 1);
    var out: any[] = [];
    for (var line of slice.split("\n")) {
      if (!line) continue;
      try {
        var e = JSON.parse(line);
        if (new Date(e.t).getTime() >= cutoff) out.push(e);
      } catch (_parseErr) {
        // Corrupt single line — skip and continue reading the rest of the log.
      }
    }
    return out;
  } catch (_err) {
    return [];
  }
}

// ── Creative studio orchestration ───────────────────────────────────
// Provider-agnostic creative production records. Raven does not ship API
// keys or call a media vendor by default; it prepares brand-aware payloads
// and can hand them to a local runner if RAVEN_CREATIVE_RUNNER is configured.

var CREATIVE_HOME = process.env.RAVEN_CREATIVE_HOME || join(homedir(), ".raven", "creative");

var CREATIVE_MODEL_CATALOG: any[] = [
  {
    id: "raven-image-fast",
    media_type: "image",
    role: "Fast concept image",
    capabilities: ["text-to-image", "reference-image", "brand-kit", "variant-batch"],
    best_for: ["concepts", "social stills", "blog heroes", "moodboards"],
    typical_inputs: ["prompt", "brand_profile_id", "reference_asset_ids"],
    output: "image"
  },
  {
    id: "raven-image-photoreal",
    media_type: "image",
    role: "Photoreal product and lifestyle image",
    capabilities: ["product-photoshoot", "lifestyle-scene", "background-swap", "marketplace-card"],
    best_for: ["product photography", "launch assets", "D2C stores", "ads"],
    typical_inputs: ["prompt", "brand_profile_id", "reference_asset_ids", "aspect_ratio"],
    output: "image"
  },
  {
    id: "raven-video-cinematic",
    media_type: "video",
    role: "Cinematic short video",
    capabilities: ["text-to-video", "image-to-video", "storyboard-to-video", "camera-direction"],
    best_for: ["product reveals", "brand films", "launch reels", "storyboards"],
    typical_inputs: ["prompt", "reference_asset_ids", "duration_seconds", "aspect_ratio"],
    output: "video"
  },
  {
    id: "raven-video-social",
    media_type: "video",
    role: "Short-form social and UGC video",
    capabilities: ["ugc-ad", "hook-testing", "platform-cutdowns", "caption-briefs"],
    best_for: ["TikTok", "Reels", "Shorts", "Meta ads", "UGC testing"],
    typical_inputs: ["prompt", "brand_profile_id", "character_profile_id", "channel"],
    output: "video"
  },
  {
    id: "raven-character-consistency",
    media_type: "image",
    role: "Character-consistent generation profile",
    capabilities: ["reference-set", "identity-notes", "provider-training-payload"],
    best_for: ["recurring avatars", "founder-led content", "fictional spokespersons"],
    typical_inputs: ["character_profile_id", "prompt", "reference_asset_ids"],
    output: "image-or-video"
  },
  {
    id: "raven-3d-asset",
    media_type: "3d",
    role: "3D object or scene brief",
    capabilities: ["text-to-3d", "product-turntable", "environment-brief"],
    best_for: ["product visualization", "game assets", "interactive prototypes"],
    typical_inputs: ["prompt", "reference_asset_ids", "format"],
    output: "3d"
  },
  {
    id: "raven-audio-voiceover",
    media_type: "audio",
    role: "Audio or voiceover production brief",
    capabilities: ["voiceover-script", "music-brief", "sound-design-brief"],
    best_for: ["video scripts", "ads", "podcast cuts", "launch trailers"],
    typical_inputs: ["prompt", "tone", "duration_seconds"],
    output: "audio"
  },
  {
    id: "raven-creative-analysis",
    media_type: "analysis",
    role: "Creative performance heuristic",
    capabilities: ["hook-score", "channel-fit", "brand-fit", "risk-review"],
    best_for: ["ad reviews", "variant selection", "launch readiness"],
    typical_inputs: ["creative_text", "channel", "brand_profile_id"],
    output: "analysis"
  }
];

var CREATIVE_PRESETS: any[] = [
  {
    id: "product-photoshoot",
    media_type: "image",
    description: "Studio and lifestyle product stills with clear pack-shot, use-context, and detail variants.",
    default_outputs: ["pack shot", "lifestyle scene", "detail macro", "hero banner"],
    prompt_frame: "Show the product clearly, preserve brand colors, make the purchase benefit obvious, and avoid fake labels or claims."
  },
  {
    id: "marketplace-cards",
    media_type: "image",
    description: "E-commerce marketplace card set for hero image, feature proof, comparison, and social proof.",
    default_outputs: ["hero card", "feature card", "comparison card", "proof card"],
    prompt_frame: "Use scannable hierarchy, large product signal, restrained copy areas, and platform-safe composition."
  },
  {
    id: "ugc-ad",
    media_type: "video",
    description: "Short-form user-generated-style ad with hook, proof, product moment, and call to action.",
    default_outputs: ["hook variant", "problem-solution variant", "testimonial variant"],
    prompt_frame: "Start with a concrete pain or surprising outcome, show the product early, and keep scenes short."
  },
  {
    id: "tv-spot",
    media_type: "video",
    description: "Polished brand spot with cinematic pacing, product benefit, and memorable closing frame.",
    default_outputs: ["15-second spot", "30-second spot", "end card"],
    prompt_frame: "Use a clean narrative arc: context, tension, reveal, benefit, brand lockup."
  },
  {
    id: "cinematic-reveal",
    media_type: "video",
    description: "Premium product or logo reveal with controlled camera language and motion direction.",
    default_outputs: ["wide reveal", "detail reveal", "closing pack shot"],
    prompt_frame: "Specify camera move, material behavior, lighting, and final locked composition."
  },
  {
    id: "social-pack",
    media_type: "campaign",
    description: "Cross-channel launch pack for LinkedIn, X, TikTok/Reels, YouTube Shorts, and blog/OG imagery.",
    default_outputs: ["blog hero", "OG card", "short video", "launch post visual", "retargeting ad"],
    prompt_frame: "Keep one campaign idea consistent while adapting format, pacing, and crop for each channel."
  },
  {
    id: "storyboard",
    media_type: "image",
    description: "Sequential storyboard frames for a short video, ad, or product walkthrough.",
    default_outputs: ["establishing frame", "problem frame", "product frame", "proof frame", "CTA frame"],
    prompt_frame: "Each frame must communicate one beat and preserve visual continuity across the sequence."
  },
  {
    id: "infographic",
    media_type: "image",
    description: "Visual data or explainable concept graphic for reports, posts, and product education.",
    default_outputs: ["data hero", "process diagram", "comparison graphic"],
    prompt_frame: "Make the information hierarchy legible first; decoration must support comprehension."
  }
];

function creativeKindDir(kind: string): string {
  var dir = join(CREATIVE_HOME, kind);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function safeRecordId(id: string): string {
  return id.toLowerCase().trim().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "record";
}

function makeRecordId(prefix: string, name?: string): string {
  var stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  var rand = Math.random().toString(36).slice(2, 8);
  var base = name ? "-" + safeRecordId(name).slice(0, 36) : "";
  return safeRecordId(prefix + "-" + stamp + base + "-" + rand);
}

function recordPath(kind: string, id: string): string {
  return join(creativeKindDir(kind), safeRecordId(id) + ".json");
}

function writeCreativeRecord(kind: string, record: any): any {
  // Hosted (remote) runtime: never write the local creative store. Fail closed.
  // (All callers are already remote-gated tools; this is defense-in-depth so a
  // future un-gated tool cannot mutate ~/.raven or the ephemeral serverless fs.)
  if (isRemoteRuntime()) throw new Error("Creative records cannot be written on the hosted endpoint.");
  var id = safeRecordId(record.id || makeRecordId(kind));
  var now = new Date().toISOString();
  var existing = readCreativeRecord(kind, id, true);
  var saved = {
    ...record,
    id: id,
    created_at: record.created_at || (existing && existing.created_at) || now,
    updated_at: now
  };
  writeFileSync(recordPath(kind, id), JSON.stringify(saved, null, 2) + "\n", "utf-8");
  return saved;
}

function readCreativeRecord(kind: string, id: string, optional?: boolean): any {
  // Hosted (remote) runtime: the local creative store is per-machine state the
  // no-auth endpoint must never read (it would be a store existence/data oracle).
  // Fail closed as "not found" — guard BEFORE recordPath() so its creativeKindDir
  // mkdirSync never touches the ephemeral serverless fs. Mirrors the not-found
  // semantics below exactly, so optional callers get null and required ones throw.
  if (isRemoteRuntime()) {
    if (optional) return null;
    throw new Error(kind + " record '" + id + "' not found");
  }
  var path = recordPath(kind, id);
  if (!fsExists(path)) {
    if (optional) return null;
    throw new Error(kind + " record '" + id + "' not found");
  }
  return JSON.parse(fsReadFile(path, "utf-8"));
}

function listCreativeRecords(kind: string): any[] {
  // Hosted (remote) runtime: fail empty — never enumerate the local store (guard
  // BEFORE creativeKindDir() so its mkdirSync never runs on the serverless fs).
  if (isRemoteRuntime()) return [];
  var dir = creativeKindDir(kind);
  var files = readdirSync(dir).filter(function (f) { return f.endsWith(".json"); }).sort();
  var out: any[] = [];
  for (var file of files) {
    try {
      out.push(JSON.parse(fsReadFile(join(dir, file), "utf-8")));
    } catch (_err) {
      // Skip one corrupt local record; do not block the rest of the local library.
    }
  }
  return out;
}

function summarizeCreativeRecord(r: any): any {
  return {
    id: r.id,
    name: r.name,
    type: r.type || r.media_type || r.status,
    updated_at: r.updated_at,
    tags: r.tags
  };
}

function getCreativePreset(id?: string): any | null {
  if (!id) return null;
  var safe = safeRecordId(id);
  return CREATIVE_PRESETS.find(function (p) { return p.id === safe; }) || null;
}

function getCreativeModel(id?: string): any | null {
  if (!id) return null;
  var safe = safeRecordId(id);
  return CREATIVE_MODEL_CATALOG.find(function (m) { return m.id === safe; }) || null;
}

function loadOptionalCreativeRefs(kind: string, ids?: string[]): any[] {
  if (!ids || ids.length === 0) return [];
  var out: any[] = [];
  for (var id of ids) {
    var rec = readCreativeRecord(kind, id, true);
    if (rec) out.push(rec);
  }
  return out;
}

function buildCreativePrompt(params: any, brand: any, character: any, preset: any): string {
  var parts: string[] = [];
  if (preset && preset.prompt_frame) parts.push("Preset guidance: " + preset.prompt_frame);
  parts.push("Creative request: " + params.prompt);
  if (params.objective) parts.push("Objective: " + params.objective);
  if (brand) {
    parts.push("Brand: " + brand.name);
    if (brand.tone) parts.push("Tone: " + brand.tone);
    if (brand.audience) parts.push("Audience: " + brand.audience);
    if (Array.isArray(brand.colors) && brand.colors.length) parts.push("Brand colors: " + brand.colors.join(", "));
    if (Array.isArray(brand.fonts) && brand.fonts.length) parts.push("Fonts: " + brand.fonts.join(", "));
    if (Array.isArray(brand.constraints) && brand.constraints.length) parts.push("Brand constraints: " + brand.constraints.join("; "));
  }
  if (character) {
    parts.push("Character profile: " + character.name);
    if (character.description) parts.push("Character description: " + character.description);
    if (character.consistency_notes) parts.push("Consistency notes: " + character.consistency_notes);
  }
  if (params.channel) parts.push("Channel: " + params.channel);
  if (params.aspect_ratio) parts.push("Aspect ratio: " + params.aspect_ratio);
  if (params.duration_seconds) parts.push("Duration: " + params.duration_seconds + " seconds");
  return parts.join("\n");
}

function buildGenerationPayload(params: any): any {
  var brand = params.brand_profile_id ? readCreativeRecord("brands", params.brand_profile_id, true) : null;
  var character = params.character_profile_id ? readCreativeRecord("characters", params.character_profile_id, true) : null;
  var assets = loadOptionalCreativeRefs("assets", params.reference_asset_ids);
  var preset = getCreativePreset(params.preset);
  var model = getCreativeModel(params.model);
  var requestedModel = params.model || (preset ? "raven-" + preset.media_type : "raven-image-fast");

  return {
    media_type: params.media_type,
    model: model ? model.id : requestedModel,
    provider: params.provider || "configured-runner",
    preset: preset ? preset.id : params.preset || null,
    prompt: buildCreativePrompt(params, brand, character, preset),
    raw_prompt: params.prompt,
    objective: params.objective || null,
    brand_profile: brand ? { id: brand.id, name: brand.name, colors: brand.colors, fonts: brand.fonts, tone: brand.tone } : null,
    character_profile: character ? { id: character.id, name: character.name, reference_asset_ids: character.reference_asset_ids } : null,
    references: assets.map(function (a) { return { id: a.id, name: a.name, type: a.type, uri: a.uri, tags: a.tags || [] }; }),
    parameters: {
      aspect_ratio: params.aspect_ratio || null,
      duration_seconds: params.duration_seconds || null,
      output_count: params.output_count || 1,
      quality: params.quality || "standard",
      channel: params.channel || null
    }
  };
}

function runCreativeRunner(job: any): any {
  var runner = process.env.RAVEN_CREATIVE_RUNNER;
  if (!runner) {
    return {
      status: "needs_runner",
      runner_configured: false,
      message: "Set RAVEN_CREATIVE_RUNNER to an executable that reads a job JSON object from stdin and returns JSON on stdout."
    };
  }
  var timeoutMs = parseInt(process.env.RAVEN_CREATIVE_RUNNER_TIMEOUT_MS || "300000", 10);
  var result = spawnSync(runner, [], {
    input: JSON.stringify(job, null, 2),
    encoding: "utf-8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env: process.env
  });
  if (result.error) {
    return { status: "failed", runner_configured: true, error: result.error.message };
  }
  if (result.status !== 0) {
    return {
      status: "failed",
      runner_configured: true,
      exit_code: result.status,
      stderr: safeStr(result.stderr, 2000)
    };
  }
  var stdout = (result.stdout || "").trim();
  if (!stdout) {
    return { status: "submitted", runner_configured: true, result: null };
  }
  try {
    var parsed = JSON.parse(stdout);
    return { status: parsed.status || "submitted", runner_configured: true, result: parsed };
  } catch (_err) {
    return { status: "submitted", runner_configured: true, result_text: safeStr(stdout, 4000) };
  }
}

function channelFormats(channels: string[]): string[] {
  var formats: string[] = [];
  for (var channel of channels) {
    var c = channel.toLowerCase();
    if (c.includes("tik") || c.includes("reel") || c.includes("short") || c.includes("youtube")) formats.push("ugc-ad");
    if (c.includes("meta") || c.includes("facebook") || c.includes("instagram")) formats.push("social-pack");
    if (c.includes("shop") || c.includes("amazon") || c.includes("marketplace")) formats.push("marketplace-cards");
    if (c.includes("web") || c.includes("site") || c.includes("blog")) formats.push("product-photoshoot");
    if (c.includes("tv") || c.includes("brand")) formats.push("tv-spot");
  }
  if (formats.length === 0) formats = ["product-photoshoot", "ugc-ad", "marketplace-cards"];
  return Array.from(new Set(formats)).slice(0, 8);
}

function scoreCreativeText(text: string, channel?: string, brand?: any, audience?: string): any {
  var lower = text.toLowerCase();
  var words = text.trim().split(/\s+/).filter(Boolean);
  var score = 40;
  var components: any[] = [];

  function add(name: string, points: number, passed: boolean, note: string) {
    if (passed) score += points;
    components.push({ name: name, points: passed ? points : 0, max: points, passed: passed, note: note });
  }

  add("hook clarity", 15, words.length > 0 && words.slice(0, 18).join(" ").length < 140 && /you|your|why|how|stop|before|after|without|finally|new|mistake|problem/.test(lower), "Lead with a concrete viewer-facing hook.");
  add("specific benefit", 15, /\d|faster|save|reduce|increase|without|from|to|because|so that|for /.test(lower), "Make the benefit measurable or concrete.");
  add("product signal", 10, /product|app|tool|service|brand|feature|demo|show|use/.test(lower), "Show what is being sold or explained early.");
  add("action", 10, /try|buy|sign up|download|watch|learn|book|start|get|join|visit/.test(lower), "Include a clear next action.");
  add("channel fit", 10, !channel || (channel.toLowerCase().includes("tik") ? words.length <= 120 : true), "Match length and pacing to the channel.");
  add("audience fit", 10, !audience || lower.includes(audience.toLowerCase().split(/\s+/)[0]), "Name or imply the audience directly.");
  add("brand fit", 10, !brand || !brand.tone || lower.includes(String(brand.tone).toLowerCase().split(/\s+/)[0]), "Use the saved brand voice cues.");

  score = Math.max(0, Math.min(100, score));
  return {
    score: score,
    grade: score >= 85 ? "A" : score >= 72 ? "B" : score >= 60 ? "C" : "D",
    components: components,
    recommendations: components.filter(function (c) { return !c.passed; }).map(function (c) { return c.note; }).slice(0, 5)
  };
}

// ── Daily digest ────────────────────────────────────────────────────
// Once per calendar day (user's local time), the first tool response gets a
// one-line digest of yesterday's usage prepended. Skipped if yesterday had
// no activity, if logging is off, or if RAVEN_NO_DAILY_DIGEST=1.

var pendingDailyDigest: string | null = null;
var digestComputedForDay: string | null = null;

function localDateKey(d: Date): string {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function maybeComputeDailyDigest(): void {
  if (!USAGE_LOG_ENABLED) return;
  if (process.env.RAVEN_NO_DAILY_DIGEST === "1") return;
  var todayKey = localDateKey(new Date());
  if (digestComputedForDay === todayKey) return;
  digestComputedForDay = todayKey; // guard even if we decide not to emit
  try {
    var now = new Date();
    var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    var yesterdayKey = localDateKey(new Date(startOfYesterday));

    var entries = readUsageSince(2).filter(function (e: any) {
      var t = new Date(e.t).getTime();
      return t >= startOfYesterday && t < startOfToday;
    });
    if (entries.length === 0) return;

    var toolCounts: Record<string, number> = {};
    var warningCounts: Record<string, number> = {};
    for (var e of entries) {
      toolCounts[e.tool] = (toolCounts[e.tool] || 0) + 1;
      var ins = e.insight || {};
      if (Array.isArray(ins.warnings)) {
        for (var w of ins.warnings) warningCounts[w] = (warningCounts[w] || 0) + 1;
      }
    }
    var topTool = Object.entries(toolCounts).sort(function (a: any, b: any) {
      return b[1] - a[1];
    })[0];
    var topWarnings = Object.entries(warningCounts)
      .sort(function (a: any, b: any) { return b[1] - a[1]; })
      .slice(0, 3)
      .map(function (w) { return w[0] + " (" + w[1] + "×)"; });

    var parts: string[] = [];
    parts.push("☕ Raven daily digest — " + yesterdayKey + ": " + entries.length + " calls");
    if (topTool) parts.push("top tool " + topTool[0] + " (" + topTool[1] + ")");
    if (topWarnings.length) parts.push("recurring " + topWarnings.join(", "));
    parts.push('ask "raven_reflect" for full breakdown');
    pendingDailyDigest = parts.join(" · ");
  } catch (_err) {
    // Silent — digest is best-effort and never blocks tool calls.
  }
}

// ── Server ──────────────────────────────────────────────────────────

// The 31 tools NOT served on a shared remote server (buildServer({remote:true})).
// 20 are stateful/local (per-user ~/.raven files, or the create_generation_job
// subprocess), 5 reach the filesystem/network or have an external side effect,
// and 6 are the DESIGN.md / grab-bridge tools (local file I/O plus a single
// loopback HTTP session). Everything else (45 stateless tools, including the 5
// guarded browser URL audits added in Phase 3) is remote-safe.
// Traced to docs/remote-mcp-scope.md §2; asserted at build time.
const REMOTE_GATED_TOOLS = new Set<string>([
  // stateful / local (20)
  "create_taste_profile", "get_taste_profile", "list_taste_profiles",
  "get_taste_interview", "bind_taste_surface", "record_taste_decision",
  "list_taste_decisions", "generate_taste_portrait", "label_finding", "audit_taste",
  "create_brand_profile", "get_brand_profile", "list_brand_profiles",
  "register_creative_asset", "create_character_profile", "create_generation_job",
  "get_generation_job", "list_generation_jobs", "plan_creative_campaign", "raven_reflect",
  // filesystem/network/side-effect capability tools (5) — read caller-supplied
  // local paths (readFileSync), fetch caller-supplied URLs (SSRF), or trigger an
  // external side effect. A no-auth remote endpoint must not expose a file-read
  // oracle, an outbound-request proxy, or an unauthenticated action, so these are
  // gated off entirely in remote mode. (audit_contract → readFileSync(file_paths);
  // audit_asset_integrity → readFileSync(image_paths); audit_device_frame →
  // readFileSync(frame paths); audit_api_contract → fetch(endpoint_url);
  // raven_register → POSTs caller-controlled email/name to the welcome endpoint,
  // which sends mail + subscribes via Resend with no rate limit/CAPTCHA/auth — a
  // no-auth spam/abuse amplifier if left remote-exposed.)
  "audit_contract", "audit_asset_integrity", "audit_device_frame", "audit_api_contract",
  "raven_register",
  // Talon detector engine (P1, parity-roadmap Gap 1) — talon_scan takes the
  // same url → capturePage() fetch surface as audit_api_contract; gate both
  // it and talon_rules off remote entirely for now to keep the frozen
  // anonymous 45-tool golden hash unchanged. Revisit if/when Talon gets its
  // own remote-safety pass (URL-guard like audit_page, or an authed lane).
  "talon_scan", "talon_rules",
  // DESIGN.md and grab bridge stateful tools.
  "read_design_md", "init_design_md", "update_design_md",
  "start_grab_session", "get_grabbed_elements", "stop_grab_session",
  "get_page_template", "set_template_slot", "list_templates",
  "get_grab_layers", "move_grab_layer", "get_grab_operation"
]);

// Taste tools served to AUTHENTICATED remote users when a per-user store is
// injected into buildServer (P4.2+: api/mcp-user.js passes a
// RedisTasteStore(sub) per request). Gating is store-PRESENCE-based: the
// anonymous endpoint never injects a store, so its 45-tool surface is
// unchanged by construction. P4.2 un-gated the profile trio; P4.3 un-gates
// the remaining 7 taste tools. Remote-safety deltas for the 7 (all runtime
// branches on the authed path — schemas/descriptions shared with stdio stay
// byte-identical): generate_taste_portrait returns HTML inline (no fs);
// bind_taste_surface refuses local .png reference paths and public-URL-guards
// reference captures; audit_taste's url mode gets the Phase-3 public-URL
// guard via REMOTE_URL_GUARDED_TOOLS.
const AUTHED_USER_TASTE_TOOLS = new Set<string>([
  "create_taste_profile", "get_taste_profile", "list_taste_profiles",
  "get_taste_interview", "bind_taste_surface", "record_taste_decision",
  "list_taste_decisions", "generate_taste_portrait", "label_finding", "audit_taste"
]);

// Tools KEPT in remote mode for their safe pasted-content path, but whose `url`
// argument reaches the local filesystem / network via headless capture (incl.
// file:// → server-file oracle). In remote mode we reject the capture param so the
// safe path (html / nodes snapshot) stays available with no local-surface exposure.
// Browser url-capture for the 5 Phase-3 tools gets the public-URL guard below.
// Do NOT lift the audit_page/audit_typography url guards here; those tools are
// outside Phase 3's declared 5-tool browser scope.
//
// Also here: tools that accept a `project`/`profile`/`brand_profile_id` param
// which resolves LOCAL per-machine store state (taste bindings / creative
// records under ~/.raven). Per-user state on the hosted endpoint is a later
// phase, so on the no-auth remote we reject those params with an explicit
// message rather than silently returning an uncalibrated result that looks
// calibrated-attempted. The store-layer latch (isRemoteRuntime) is the actual
// security invariant that makes this arg-guard non-load-bearing; this layer is
// honest API UX on top of it. The stateless audit runs when the param is omitted.
//
// Also here: evaluate_design's before/after screenshot params. Both flow into
// diffScreenshots, which base64-decodes two PNGs and runs a per-pixel loop with
// NO byte or dimension cap — an unbounded compute/memory sink on a no-auth
// endpoint. Unlike the store guards, there is NO deeper latch behind this one, so
// this arg-guard IS the only defense and must reject before the handler runs (the
// wrapper below returns isError pre-handler). evaluate_design's description-based
// principle-matching path is CPU-bounded and stays available when the screenshots
// are omitted. A cap in diffScreenshots would also change the stdio path, so we
// scope the block to remote via the guard rather than touch shared decode code.
const REMOTE_ARG_GUARDS: { [tool: string]: { params: string[]; message: string } } = {
  audit_page: { params: ["url"], message: "audit_page url-capture is disabled on the hosted (remote) endpoint. Pass the page HTML via the 'html' argument instead." },
  audit_typography: { params: ["url"], message: "audit_typography url-capture is disabled on the hosted (remote) endpoint. Pass a 'nodes' snapshot instead of 'url'." },
  audit_swiftui: { params: ["project", "profile"], message: "Taste-profile bindings are not available on the hosted (remote) endpoint (per-user state is a later phase). Omit 'project'/'profile' to run the stateless SwiftUI audit." },
  audit_rn: { params: ["project", "profile"], message: "Taste-profile bindings are not available on the hosted (remote) endpoint (per-user state is a later phase). Omit 'project'/'profile' to run the stateless React Native audit." },
  audit_screen: { params: ["project", "profile"], message: "Taste-profile bindings are not available on the hosted (remote) endpoint (per-user state is a later phase). Omit 'project'/'profile' to run the stateless screen audit." },
  audit_ios_screen: { params: ["project", "profile"], message: "Taste-profile bindings are not available on the hosted (remote) endpoint (per-user state is a later phase). Omit 'project'/'profile' to run the stateless iOS screen audit." },
  score_creative: { params: ["brand_profile_id"], message: "Local brand profiles are not available on the hosted (remote) endpoint (per-user state is a later phase). Omit 'brand_profile_id' to score the pasted creative statelessly." },
  evaluate_design: { params: ["before_screenshot", "after_screenshot"], message: "Screenshot pixel-diff is disabled on the hosted (remote) endpoint (unbounded image decode). Omit 'before_screenshot'/'after_screenshot' and pass a 'description' to evaluate the design against UX principles statelessly." }
};

const REMOTE_URL_GUARDED_TOOLS: { [tool: string]: string } = {
  audit_url: "url",
  audit_contrast: "url",
  audit_tap_targets: "url",
  audit_responsive_visibility: "url",
  audit_video_playback: "url",
  // P4.3: audit_taste is only REACHABLE remotely on the authed store-injected
  // path; when it is, its url-capture mode gets the same public-URL guard as
  // the Phase-3 browser tools. No-op for stdio (guard runs only when remote).
  audit_taste: "url"
};

// buildServer() returns a FRESH McpServer with all 70 tools + the usage-log/
// update-banner wrapper registered. A new instance is required per transport
// connection (SDK #961: one McpServer connects to exactly one transport, ever).
// The stdio entry calls this once; a future HTTP entry calls it per request.
// NOTE: importing this module does NOT start a server — only calling buildServer()
// registers the tools, and only main() (guarded to direct-run) connects stdio.
export function buildServer(opts?: { remote?: boolean; tasteStore?: TasteStore }): McpServer {
// remote = serve only the 45 stateless remote-safe tools (gate off the 20
// stateful/local + 5 fs/network/side-effect capability tools; evaluate_design
// stays but its screenshot pixel-diff is arg-guarded off).
// Defaults from RAVEN_REMOTE env so a serverless entry can set it
// without threading opts. stdio callers pass nothing → remote=false → all 70.
var remote: boolean = (opts && typeof opts.remote === "boolean")
  ? opts.remote
  : (process.env.RAVEN_REMOTE === "1" || process.env.RAVEN_REMOTE === "true");
// Latch the process as remote at the store-access choke point. One-way: stdio
// (remote=false) never sets it, so the local store stays reachable and the
// stdio wire contract is byte-for-byte unchanged; the hosted endpoint sets it
// once (idempotent under Fluid-Compute instance reuse) and every ~/.raven read/
// write below fails closed regardless of which tool or param reached it.
if (remote) setRemoteRuntime();
// A caller-injected store (the authed endpoint's per-user RedisTasteStore)
// un-gates the authed taste subset below. The anonymous endpoint and stdio
// never inject one, so their tool surfaces are unchanged by construction.
var hasUserStore: boolean = !!(opts && opts.tasteStore);
var tasteStore: TasteStore = opts && opts.tasteStore
  ? opts.tasteStore
  : remote ? new ClosedTasteStore() : new FsTasteStore();
var server = new McpServer({
  name: "raven-mcp",
  version: PKG_VERSION
}, {
  instructions: "Raven is a design-intelligence server: audits (page/layout/screen/contrast/tap-targets/typography/consistency), design systems and tokens, brand/content/service-design knowledge, creative scoring, and a Taste Engine that makes a person's design judgment portable and growable.\n\nPROJECT KICKOFF — calibrate taste BEFORE the first design work. Taste is per-surface: the same person wants different rules on a monochrome portfolio than on a product site, and a different voice on each. At the START of a new project (or the first design/copy/UI work in any project), if a taste profile exists (list_taste_profiles), call get_taste_interview with the profile and a project name (mode defaults to 'kickoff'). If it returns existing_binding: null, ask the user its questions conversationally (what kind of surface this is, how typography/spacing/color/layout/motion/imagery/entrance/loading/navigation/aesthetic/libraries should read here — most offer multiple-choice options — how the voice should read (three register examples are given so the user can pick by ear), any per-rule overrides, which URL hosts identify the project), then persist the answers with bind_taste_surface — dimension answers go in design_notes and are echoed in every audit. The interview is a blocking gate: collect the user's answers before committing any design direction, palette, type choice, or name — never answer its questions yourself or start design work while it is pending. Every question carries skippable + priority (core|extended); skipping is fine but leaves that item uncalibrated. A 'references' question takes example links/screenshots and interviews what specifically the person likes about each. The interview ends with an open-ended 'special' question (textures, signature details, motifs — stored as design_notes.special) that suggests the person's choices from their other bound surfaces once it has them. From then on pass project:'<name>' on every audit_taste — bindings also auto-match by URL hostname in url mode. When the surface is a website to be built, suggest building it as a Next.js app by default; if the user prefers another stack, record it in design_notes.libraries. Do NOT wait for an audit to return a calibration_hint; that is the reactive backstop, not the intended flow.\n\nWhen a user dislikes generated/designed output on an ALREADY-calibrated project, that dissatisfaction is a calibration signal, not a dead end — re-run get_taste_interview with mode:'refine' (it re-interviews against the stored binding: what fell short, then each stored design_notes value to keep/tighten/replace, then voice, then an optional reject precedent) and re-bind with bind_taste_surface.\n\nLEARNING LOOP — whenever the user makes, approves, or corrects a taste, direction, or design decision during work (not just at interview time), record it with record_taste_decision: the project, a short dimension name, what was chosen, what was rejected, why, and whether it was user-directed, user-approved, or user-corrected (a user overriding a generated choice is the highest-signal record). Recorded decisions evolve future kickoff interviews — recurring choices return as suggested defaults on their dimension's question, and decision categories no standard question covers become NEW interview questions. Record liberally; every committed decision is calibration data.\n\nJudging work: prefer audit_taste (with the profile + project) for matters of the owner's taste, and the mechanical audits (audit_page, audit_contrast, audit_tap_targets, audit_layout) for objective quality. design_notes are ACCEPTANCE CRITERIA for any build, not mood words: audit_taste verifies each note against the rendered page (note_assessments: present/partial/missing/unverifiable, each with trait-number evidence), compares the target against the binding's captured references, and flags sparse-and-empty pages whose restraint is deletion rather than craft — a build is not done until every note is visibly present or the user is told exactly which notes were dropped and why. When a note names an expensive technique (three.js/WebGL, GSAP scroll choreography, anime.js staggered motion, glassmorphism, a branded loader, lottie, kinetic display type…), bind_taste_surface and audit_taste return build_hints — a concrete recipe + canonical public example sources (threejs.org, gsap.com, animejs.com, Codrops…). The public corpus for these is vast, so an expensive note is NEVER license to drop it: consult the attached build_hints and their sources, and if a technique is genuinely infeasible, tell the user before shipping without it. Prefer url mode for verification: live traits (WebGL, animations, scroll effects) cannot be measured from static html. When a human accepts or rejects a finding, record it with label_finding — accept-verdicts suppress that exact pattern in future audits, which is how the profile learns.\n\nGRAB — click-to-change is ON BY DEFAULT for local servers. Any time you start, restart, or serve a local web page/dev server for the user (a demo, a preview, a dev build, a static file server), automatically start a grab session first (start_grab_session with the project's DESIGN.md if one exists) and make the overlay present WITHOUT the user asking or pasting anything: for a server you are starting anyway, pass proxy_target and give the user the BRIDGE url instead of the raw server url — the overlay is injected into every HTML response; for HTML files you are writing yourself, include the returned script_tag directly. Never hand the user a script tag or console snippet to paste. Mention in one line that the grab overlay is active (Alt+G or the on-page pill). The user clicks elements, swaps DESIGN.md tokens with live preview, edits computed styles inline, and sends instructions; drain them with get_grabbed_elements — while a grab session is active, drain whenever control returns to you (and before ending any turn). When a drain returns selections, respond to the user immediately: summarize each requested change in one line, then ask whether to write a goal/plan and implement the fixes or wait for their direction — never implement unasked and never leave a sent grab unacknowledged. Apply approved token changes with update_design_md. Stop the session (stop_grab_session) when the server comes down. Skip only when the user explicitly asks for a clean page or the server is production."
});

// Wrap every tool handler: log the call to the local usage log, then inject
// the one-time update banner if one is pending.
var originalTool: any = server.tool.bind(server);
(server as any).tool = function () {
  var args = Array.prototype.slice.call(arguments);
  var toolName: string = args[0];
  // Remote mode: silently skip registration of the stateful/local + fs/network/
  // side-effect tools. No registration statement uses the return value, so
  // undefined is safe. Exception (P4.2+): when a per-user store was injected
  // (authenticated endpoint), the authed taste subset registers and runs
  // against that store.
  if (remote && REMOTE_GATED_TOOLS.has(toolName) && !(hasUserStore && AUTHED_USER_TASTE_TOOLS.has(toolName))) {
    return undefined;
  }
  var handler = args[args.length - 1];
  if (typeof handler === "function") {
    args[args.length - 1] = async function () {
      var start = Date.now();
      var input = arguments[0];
      // Remote arg-guard: reject filesystem/network-reaching params (e.g. url →
      // headless capture, incl. file://) for tools kept in remote mode only for
      // their safe pasted-content path. Prevents a file/SSRF oracle without
      // dropping the tool. No-op for stdio (remote=false).
      if (remote) {
        var guard = REMOTE_ARG_GUARDS[toolName];
        if (guard && input) {
          for (var gi = 0; gi < guard.params.length; gi++) {
            var gv = input[guard.params[gi]];
            if (gv !== undefined && gv !== null) {
              return { content: [{ type: "text" as const, text: guard.message }], isError: true };
            }
          }
        }
        var urlParam = REMOTE_URL_GUARDED_TOOLS[toolName];
        if (urlParam && input && typeof input[urlParam] === "string" && input[urlParam] !== "") {
          var urlGuardMessage = await remoteUrlGuardError(input[urlParam]);
          if (urlGuardMessage !== null) {
            return { content: [{ type: "text" as const, text: urlGuardMessage }], isError: true };
          }
        }
      }
      var result = await handler.apply(null, arguments);
      // Usage log + daily digest + update banner mutate module-global state and
      // touch the local filesystem — stdio/local-only. Skipped entirely in remote
      // mode so (a) concurrent Fluid-Compute requests never race on shared banner
      // state and (b) stdio stays byte-for-byte identical without depending on any
      // ambient env (VERCEL/RAVEN_NO_USAGE_LOG). remote=false → runs exactly as before.
      if (!remote) {
        logUsage(toolName, input, result, Date.now() - start);
        maybeComputeDailyDigest();
        // Collect any notices to prepend — daily digest first, then update.
        var notices: string[] = [];
        if (pendingDailyDigest) {
          notices.push(pendingDailyDigest);
          pendingDailyDigest = null;
        }
        if (pendingUpdateNotice && !noticeShown) {
          notices.push(pendingUpdateNotice);
          noticeShown = true;
        }
        if (notices.length > 0 && result && Array.isArray(result.content)) {
          for (var i = 0; i < result.content.length; i++) {
            if (result.content[i] && result.content[i].type === "text") {
              result.content[i].text = notices.join("\n") + "\n\n" + result.content[i].text;
              break;
            }
          }
        }
      }
      return result;
    };
  }
  return originalTool.apply(null, args);
};

// ── Tool 1: get_principles ──────────────────────────────────────────

server.tool(
  "get_principles",
  "Get design principles relevant to a UI context. Returns usability heuristics, laws of UX, Gestalt principles, accessibility requirements, typography rules, and color theory — matched to what you're designing.",
  {
    context: z.string().describe("What you're designing (e.g. 'signup form', 'pricing page', 'mobile nav', 'dark dashboard')"),
    category: z.string().optional().describe("Filter to category: nielsen-heuristics, laws-of-ux, gestalt, accessibility, typography, color-theory, mobile-ux, d4d, color-systems, spacing-systems"),
    platform: z.enum(["web", "ios", "react-native"]).optional().describe("Platform context. 'ios' returns Apple HIG principles (Dynamic Type, 44pt targets, SF Symbols, safe areas, dark-mode, haptics, App Review privacy); 'react-native' returns RN principles (44/48pt+hitSlop, accessibilityLabel/Role, font scaling, SafeAreaView, dark mode, iOS+Android parity, secrets). Both replace the web/CSS-oriented set. Default: web."),
    format: z.enum(["full", "checklist", "brief"]).optional().describe("Output format: full (all details), checklist (implications + violations), brief (just summary). Default: full")
  },
  async ({ context, category, platform, format }) => {
    var fmt = format || "full";

    // Native platforms: return the curated principle set only. The generic
    // principle bank is web/CSS-oriented, so we don't run its matcher here —
    // keeps web artifacts out of native guidance entirely.
    if (platform === "ios" || platform === "react-native") {
      var nativeBank = platform === "react-native" ? RN_HIG_PRINCIPLES : IOS_HIG_PRINCIPLES;
      var nativeSource = platform === "react-native" ? "iOS HIG + Android Material (React Native)" : "Apple Human Interface Guidelines";
      var nativeResults = nativeBank.filter(function (p) {
        return textSearch(p.id + " " + p.name + " " + p.summary + " " + p.verify.join(" "), context);
      });
      if (nativeResults.length === 0) nativeResults = nativeBank.slice();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            context: context,
            platform: platform,
            source: nativeSource,
            count: nativeResults.length,
            principles: nativeResults.map(function (p) {
              return fmt === "brief"
                ? { id: p.id, name: p.name, summary: p.summary }
                : { id: p.id, name: p.name, summary: p.summary, what_to_verify: p.verify };
            }),
            note: "Universal heuristics (Nielsen, Gestalt, Fitts's/Hick's laws) still apply — call get_principles without a native platform for those."
          }, null, 2)
        }]
      };
    }

    var results = allPrinciples.filter(p => {
      if (category && p.category !== category) return false;
      // Match on applies_to tags or text search across fields
      var tagMatch = p.applies_to ? matchesTags(p.applies_to, context) : false;
      var textMatch = textSearch(p.name + " " + p.summary + " " + p.description, context);
      return tagMatch || textMatch;
    });

    // If no specific matches, return all in the category (if specified)
    if (results.length === 0 && category) {
      results = allPrinciples.filter(p => p.category === category);
    }

    // If still nothing, do a broader search
    if (results.length === 0) {
      results = allPrinciples.filter(p =>
        textSearch(
          p.name + " " + p.summary + " " + p.description + " " + (p.applies_to || []).join(" "),
          context
        )
      );
    }

    var formatted = results.map(p => formatPrinciple(p, fmt));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          context,
          count: formatted.length,
          principles: formatted
        }, null, 2)
      }]
    };
  }
);

// ── Tool 2: get_pattern ─────────────────────────────────────────────

server.tool(
  "get_pattern",
  "Get proven UI/UX patterns for a specific design type. Returns do's, don'ts, evidence, and checklists for signup flows, pricing pages, navigation, forms, landing pages, dashboards, modals, empty states, error states, loading states, CTAs, social proof, and mobile conversion.",
  {
    type: z.string().describe("Pattern type (e.g. 'signup-flow', 'pricing-page', 'navigation', 'forms', 'landing-page', 'dashboard', 'modals-dialogs', 'empty-states', 'error-states', 'loading-states', 'cta', 'social-proof', 'mobile-conversion')"),
    platform: z.enum(["desktop", "mobile", "responsive"]).optional().describe("Filter patterns by platform context"),
    goal: z.enum(["conversion", "usability", "accessibility", "delight"]).optional().describe("Filter by primary goal")
  },
  async ({ type, platform, goal }) => {
    // Direct ID match first
    var pattern = allPatterns.find(p => p.id === type);

    // Fuzzy match on name/summary
    if (!pattern) {
      pattern = allPatterns.find(p =>
        textSearch(p.id + " " + p.name + " " + p.summary, type)
      );
    }

    if (!pattern) {
      var available = allPatterns.map(p => p.id);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "Pattern '" + type + "' not found.",
            available_patterns: available,
            hint: "Try one of the available pattern IDs listed above."
          }, null, 2)
        }]
      };
    }

    // Filter patterns by goal if specified
    var result: any = { ...pattern };
    if (goal) {
      result.filtered_by_goal = goal;
    }

    // Add platform-specific notes
    if (platform === "mobile") {
      result.platform_note = "Mobile context: prioritize thumb zones, 44px+ touch targets, bottom sheet patterns, and single-column layouts.";
    } else if (platform === "desktop") {
      result.platform_note = "Desktop context: leverage hover states, keyboard shortcuts, multi-column layouts where appropriate, and command palettes.";
    }

    // Cross-reference principles
    if (pattern.principles_referenced && pattern.principles_referenced.length > 0) {
      result.related_principles = allPrinciples
        .filter(p => pattern!.principles_referenced.includes(p.id))
        .map(p => ({ id: p.id, name: p.name, summary: p.summary }));
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// ── Tool 3: get_business_strategy ───────────────────────────────────

server.tool(
  "get_business_strategy",
  "Get business and monetization strategies for digital products. Covers monetization models, retention strategies, onboarding optimization, growth mechanics, and product metrics frameworks.",
  {
    type: z.string().describe("Strategy type: monetization, retention, onboarding, growth, metrics"),
    stage: z.enum(["startup", "growth", "mature"]).optional().describe("Company stage for contextual filtering")
  },
  async ({ type, stage }) => {
    var strategy = allBusiness.find(b => b.id === type);

    if (!strategy) {
      strategy = allBusiness.find(b =>
        textSearch(b.id + " " + b.name + " " + b.summary, type)
      );
    }

    if (!strategy) {
      var available = allBusiness.map(b => b.id);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "Strategy type '" + type + "' not found.",
            available_types: available
          }, null, 2)
        }]
      };
    }

    var result: any = { ...strategy };

    if (stage) {
      result.stage_context = stage;
      var stageNotes: Record<string, string> = {
        startup: "Focus on finding product-market fit. Prioritize speed to value, user activation, and finding your aha moment. Don't over-optimize monetization yet.",
        growth: "Focus on scalable acquisition channels, retention optimization, and expansion revenue. Build the systems that compound.",
        mature: "Focus on efficiency, net dollar retention, reducing churn, and finding new growth vectors. Optimize unit economics."
      };
      result.stage_guidance = stageNotes[stage] || "";
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// ── Tool 4: evaluate_design ─────────────────────────────────────────

server.tool(
  "evaluate_design",
  "Evaluate a design description against UX principles. Returns relevant principles, potential violations, and improvement suggestions.",
  {
    description: z.string().optional().describe("Description of the design to evaluate"),
    before_screenshot: z.string().optional().describe("Base64 PNG of the BEFORE state"),
    after_screenshot: z.string().optional().describe("Base64 PNG of the AFTER state. When both before+after are provided, returns a structured pixel diff with fix_confirmed."),
    goals: z.array(z.string()).optional().describe("What to evaluate for (e.g. ['conversion', 'accessibility', 'mobile-usability'])"),
    context: z.string().optional().describe("What the design is (e.g. 'pricing page for SaaS product')"),
    compact: z.boolean().optional().describe("Return only ids+names for matched principles/patterns (drop their full bodies) plus counts and any before/after diff. Default false. Use when the full principle library payload would blow the tool-result budget.")
  },
  async function({ description, before_screenshot, after_screenshot, goals, context, compact }) {
    var hasDescription = description !== undefined && description !== null;
    var hasBeforeAfterScreenshots = before_screenshot !== undefined && before_screenshot !== null && after_screenshot !== undefined && after_screenshot !== null;
    var designDescription = description;
    var relevant: Principle[] = [];
    var relevantPatterns: Pattern[] = [];

    if (!hasDescription && hasBeforeAfterScreenshots) {
      designDescription = "(screenshot diff only)";
    }

    if (hasDescription) {
      var searchText = description + " " + (context || "") + " " + (goals || []).join(" ");

      // Find relevant principles
      relevant = allPrinciples.filter(function(p) {
        var tagMatch = p.applies_to ? matchesTags(p.applies_to, searchText) : false;
        var textMatch = textSearch(
          p.name + " " + p.summary + " " + p.description + " " + p.violations.join(" "),
          searchText
        );
        return tagMatch || textMatch;
      });

      // Find relevant patterns
      relevantPatterns = allPatterns.filter(function(p) {
        return textSearch(p.id + " " + p.name + " " + p.summary, searchText);
      });
    }

    // Build evaluation
    var evaluation: any = {
      design_description: designDescription,
      context: context || "Not specified",
      goals: goals || ["general usability"],
      principles_to_check: relevant.map(function(p) { return {
        id: p.id,
        name: p.name,
        summary: p.summary,
        common_violations: p.violations,
        what_to_verify: p.implications
      }; }),
      applicable_patterns: relevantPatterns.map(function(p) { return {
        id: p.id,
        name: p.name,
        checklist: p.checklist
      }; }),
      evaluation_guidance: "Review the design against each principle's common violations and each pattern's checklist. Flag any items that the current design may violate.",
      total_principles: relevant.length,
      total_patterns: relevantPatterns.length
    };

    if (hasBeforeAfterScreenshots) {
      var diffResult = await diffScreenshots(before_screenshot as string, after_screenshot as string);
      evaluation.before_after_diff = diffResult;
      evaluation.fix_confirmed = diffResult.fix_confirmed;
    }

    var evalPayload = compact === true ? compactEvaluation(evaluation) : evaluation;
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(evalPayload, null, 2)
      }]
    };
  }
);

// ── Tool 5: search_knowledge ────────────────────────────────────────

server.tool(
  "search_knowledge",
  "Search across all design principles, UI patterns, and business strategies. Use when you need to find specific guidance or don't know which category to look in.",
  {
    query: z.string().describe("Search term (e.g. 'touch targets', 'pricing psychology', 'color contrast')"),
    layer: z.enum(["principles", "patterns", "business", "all"]).optional().describe("Which layer to search: principles, patterns, business, or all (default)")
  },
  async ({ query, layer }) => {
    var searchLayer = layer || "all";
    var results: any[] = [];

    if (searchLayer === "all" || searchLayer === "principles") {
      var matchedPrinciples = allPrinciples.filter(p =>
        textSearch(
          [p.id, p.name, p.category, p.summary, p.description, ...p.applies_to, ...p.implications, ...p.violations].join(" "),
          query
        )
      );
      results = results.concat(matchedPrinciples.map(p => ({
        layer: "principles",
        id: p.id,
        name: p.name,
        category: p.category,
        summary: p.summary,
        relevance: "principle"
      })));
    }

    if (searchLayer === "all" || searchLayer === "patterns") {
      var matchedPatterns = allPatterns.filter(p => {
        var allText = [p.id, p.name, p.summary, ...p.checklist,
          ...p.patterns.map(pp => pp.name + " " + pp.description + " " + pp.do.join(" ") + " " + pp.dont.join(" "))
        ].join(" ");
        return textSearch(allText, query);
      });
      results = results.concat(matchedPatterns.map(p => ({
        layer: "patterns",
        id: p.id,
        name: p.name,
        category: p.category,
        summary: p.summary,
        relevance: "pattern"
      })));
    }

    if (searchLayer === "all" || searchLayer === "business") {
      var matchedBusiness = allBusiness.filter(b => {
        var allText = [b.id, b.name, b.summary,
          ...b.strategies.map(s => s.name + " " + s.description + " " + s.when_to_use)
        ].join(" ");
        return textSearch(allText, query);
      });
      results = results.concat(matchedBusiness.map(b => ({
        layer: "business",
        id: b.id,
        name: b.name,
        category: b.category,
        summary: b.summary,
        relevance: "strategy"
      })));
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          query,
          layer: searchLayer,
          count: results.length,
          results
        }, null, 2)
      }]
    };
  }
);

// ── Tool 6: get_checklist ───────────────────────────────────────────

server.tool(
  "get_checklist",
  "Get a pre-publish checklist for a specific UI type. Returns actionable yes/no items to verify before shipping.",
  {
    type: z.string().describe("What you're shipping (e.g. 'signup form', 'pricing page', 'dashboard', 'landing page', 'modal')"),
    platform: z.enum(["desktop", "mobile", "responsive", "ios", "react-native"]).optional().describe("Platform context for platform-specific checks. 'ios' = native SwiftUI/iOS (Apple HIG); 'react-native' = RN/Expo (iOS HIG + Android Material: 44/48pt+hitSlop, accessibilityLabel/Role, font scaling, SafeAreaView, dark mode, platform parity, secrets). Both replace the web/mobile-web checks.")
  },
  async ({ type, platform }) => {
    // Gather checklists from matching patterns
    var matchedPatterns = allPatterns.filter(p =>
      textSearch(p.id + " " + p.name + " " + p.summary, type)
    );

    var checklists: Array<{ source: string; items: string[] }> = [];

    // Web idioms that are meaningless on native iOS/RN (px sizing, Mobile-
    // Safari auto-zoom, hover, CSS grid/media queries). Pattern checklists are
    // mostly platform-agnostic conversion/usability guidance, so we keep them
    // but strip the web-only items for native platforms.
    var isNative = platform === "ios" || platform === "react-native";
    var WEB_IDIOM = /\bpx\b|auto-zoom|grid-template|:hover|hover state|\bviewport\b|\bCSS\b|media quer|\bem\b|browser/i;

    for (var pattern of matchedPatterns) {
      var items = pattern.checklist;
      if (isNative) items = items.filter(function (it: string) { return !WEB_IDIOM.test(it); });
      if (items.length > 0) {
        checklists.push({
          source: pattern.name,
          items: items
        });
      }
    }

    // Add universal accessibility checks (native platforms get a VoiceOver/
    // TalkBack-flavored set so no web terms — alt text, focus rings, keyboard
    // nav — leak into a native checklist).
    var accessibilityChecklist = platform === "react-native" ? [
      "Text meets WCAG AA contrast (4.5:1 normal, 3:1 large) in both light and dark?",
      "Every touchable and meaningful image has accessibilityLabel + accessibilityRole?",
      "Decorative imagery sets accessible={false}?",
      "accessibilityState reflects disabled/selected/expanded?",
      "Reduce Motion is honored for non-essential animation?",
      "Touch targets are at least 44pt (iOS) / 48dp (Android)?"
    ] : platform === "ios" ? [
      "Text meets WCAG AA contrast (4.5:1 normal, 3:1 large) in both light and dark?",
      "All interactive and image elements have a VoiceOver accessibilityLabel?",
      "Decorative imagery is hidden from VoiceOver (.accessibilityHidden)?",
      "Controls expose the right traits (.isButton, .isHeader) and grouped sensibly?",
      "Reduce Motion is honored for non-essential animation?",
      "Touch targets are at least 44×44 pt?"
    ] : [
      "Text meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text)?",
      "All interactive elements are keyboard accessible?",
      "All images have appropriate alt text?",
      "Form inputs have associated labels?",
      "Focus indicators are visible?",
      "Touch targets are at least 44x44px on mobile?"
    ];

    // Add platform-specific checks
    var platformChecklist: string[] = [];
    if (platform === "ios") {
      // Native iOS: return HIG items only — none of the web/mobile-web checks
      // (16px iOS-zoom, CSS responsiveness) apply to a SwiftUI app.
      platformChecklist = IOS_HIG_CHECKLIST.slice();
    } else if (platform === "react-native") {
      // RN/Expo: iOS HIG + Android Material items, no web/mobile-web checks.
      platformChecklist = RN_CHECKLIST.slice();
    } else if (platform === "mobile" || platform === "responsive") {
      platformChecklist = [
        "Font size is at least 16px to prevent iOS auto-zoom?",
        "Touch targets are at least 44x44px?",
        "Primary actions are in the thumb zone (bottom half)?",
        "Forms use appropriate input modes (email, tel, number)?",
        "Layout is single-column on small screens?",
        "Page loads in under 3 seconds on mobile?"
      ];
    }
    if (platform === "desktop" || platform === "responsive") {
      platformChecklist = platformChecklist.concat([
        "Hover states on all interactive elements?",
        "Keyboard shortcuts for primary actions?",
        "Responsive at common desktop widths (1024, 1280, 1440, 1920)?",
        "Command palette or search available (Cmd+K)?"
      ]);
    }

    var result = {
      type,
      platform: platform || "responsive",
      pattern_checklists: checklists,
      accessibility_checklist: accessibilityChecklist,
      platform_checklist: platformChecklist.length > 0 ? platformChecklist : undefined,
      total_items: checklists.reduce((sum, c) => sum + c.items.length, 0) + accessibilityChecklist.length + platformChecklist.length
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// ── Tool 7: get_d4d_framework ───────────────────────────────────────

server.tool(
  "get_d4d_framework",
  "Get the Design for Delight (D4D) framework templates. Returns customer problem statement, ideal state, hypothesis, LOFA, and experiment templates for structured product thinking.",
  {
    stage: z.enum(["frame", "empathy", "broad", "narrow", "experiment", "recommendation", "full"]).optional().describe("Which stage of the D4D loop to return. Default: full (all stages)")
  },
  async ({ stage }) => {
    var stageFilter = stage || "full";

    var d4dPrinciple = allPrinciples.find(p => p.id === "d4d-framework");

    if (!d4dPrinciple || !d4dPrinciple.templates) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "D4D framework data not found." }, null, 2)
        }]
      };
    }

    var templates = d4dPrinciple.templates;

    if (stageFilter === "full") {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            framework: "Design for Delight (D4D)",
            description: d4dPrinciple.description,
            templates: {
              customer_problem_statement: templates.customer_problem_statement,
              ideal_state: templates.ideal_state,
              hypothesis_statement: templates.hypothesis_statement,
              lofa: templates.lofa,
              scrappy_experiment: templates.scrappy_experiment
            },
            operating_loop: templates.operating_loop
          }, null, 2)
        }]
      };
    }

    // Return specific stage
    var loopStages = templates.operating_loop?.stages || [];
    var matchedStage = loopStages.find((s: any) => s.stage === stageFilter);

    var stageTemplates: any = {};
    if (stageFilter === "frame") {
      stageTemplates = {
        customer_problem_statement: templates.customer_problem_statement,
        ideal_state: templates.ideal_state
      };
    } else if (stageFilter === "experiment") {
      stageTemplates = {
        hypothesis_statement: templates.hypothesis_statement,
        lofa: templates.lofa,
        scrappy_experiment: templates.scrappy_experiment
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          framework: "Design for Delight (D4D)",
          stage: matchedStage || { stage: stageFilter, name: stageFilter },
          templates: Object.keys(stageTemplates).length > 0 ? stageTemplates : undefined,
          all_stages: loopStages.map((s: any) => s.stage)
        }, null, 2)
      }]
    };
  }
);

// ── Tool 8: list_design_systems ─────────────────────────────────────

server.tool(
  "list_design_systems",
  "Browse available design systems for tokens. Filter by category (fintech, productivity, developer, component-library, design-system) or search by name.",
  {
    category: z.string().optional().describe("Filter by category: fintech, productivity, developer, component-library, design-system"),
    search: z.string().optional().describe("Search by name or description")
  },
  async ({ category, search }) => {
    var registry = loadRegistry();
    var systems = registry.systems;
    var available = getAvailableSystemIds();

    if (category) {
      systems = systems.filter((s: any) => s.category === category);
    }
    if (search) {
      var q = search.toLowerCase();
      systems = systems.filter((s: any) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.tags && s.tags.some((t: string) => t.includes(q)))
      );
    }

    systems = systems.map((s: any) => ({
      ...s,
      tokens_available: available.includes(s.id)
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ count: systems.length, systems }, null, 2)
      }]
    };
  }
);

// ── Tool 9: get_design_system ───────────────────────────────────────

server.tool(
  "get_design_system",
  "Get design tokens for a specific design system. Returns colors, typography, spacing, radii, elevation, and motion tokens in W3C DTCG, CSS custom properties, or flat format.",
  {
    id: z.string().describe("Design system ID (e.g. 'stripe', 'linear')"),
    group: z.string().optional().describe("Filter to a token group: color, color-dark, color-light, typography, spacing, radius, elevation, motion"),
    format: z.enum(["dtcg", "css", "flat"]).optional().describe("Output format: dtcg (W3C standard), css (custom properties), flat (key-value). Default: dtcg")
  },
  async ({ id, group, format }) => {
    var tokens = loadSystem(id);
    if (!tokens) {
      return {
        content: [{
          type: "text" as const,
          text: "Design system '" + id + "' not found. Use list_design_systems to see available systems."
        }]
      };
    }

    var output = tokens;
    if (group) {
      output = filterTokensByGroup(tokens, group);
    }

    var fmt = format || "dtcg";
    var text: string;

    if (fmt === "css") {
      text = group
        ? tokensToCSS(output, id)
        : tokensToCSSByGroup(output, id);
    } else if (fmt === "flat") {
      var flat = flattenTokens(output, "");
      text = JSON.stringify(flat, null, 2);
    } else {
      text = JSON.stringify(output, null, 2);
    }

    return {
      content: [{
        type: "text" as const,
        text
      }]
    };
  }
);

// ── DESIGN.md / grab bridge tools ──────────────────────────────────

server.tool(
  "read_design_md",
  "Parse a DESIGN.md file and return its frontmatter, Markdown body, and flattened token index.",
  {
    path: z.string().describe("Path to DESIGN.md")
  },
  async ({ path }) => {
    try {
      var doc = readDesignMd(path);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            path: doc.path,
            frontmatter: doc.frontmatter,
            body: doc.body,
            tokens: doc.tokens
          }, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: (err as Error).message
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "init_design_md",
  "Initialize a DESIGN.md file from a stored Raven token system, a getdesign.md starter slug, or a blank template.",
  {
    path: z.string().describe("Path to DESIGN.md to create"),
    from: z.any().describe("Source selector: blank, stored system, or starter slug")
  },
  async ({ path, from }) => {
    try {
      var doc = await initDesignMd(path, from);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            path: doc.path,
            source: doc.source,
            frontmatter: doc.frontmatter,
            body: doc.body,
            tokens: doc.tokens
          }, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: (err as Error).message
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "update_design_md",
  "Update one DESIGN.md token surgically while preserving the Markdown body.",
  {
    path: z.string().describe("Path to DESIGN.md"),
    set: z.object({
      group: z.string().describe("Top-level group name"),
      name: z.string().describe("Token name or dotted nested path"),
      value: z.any().describe("New scalar or {group.name} reference")
    }).optional(),
    rename: z.object({
      group: z.string().describe("Top-level group name"),
      from: z.string().optional().describe("Old token name or dotted nested path"),
      name: z.string().optional().describe("Alias for from"),
      to: z.string().optional().describe("New token name or dotted nested path"),
      new_name: z.string().optional().describe("Alias for to")
    }).optional(),
    remove: z.object({
      group: z.string().describe("Top-level group name"),
      name: z.string().optional().describe("Token name or dotted nested path"),
      path: z.string().optional().describe("Alias for name")
    }).optional()
  },
  async ({ path, set, rename, remove }) => {
    try {
      var doc = updateDesignMd(path, { set: set as DesignMdUpdateSet | undefined, rename: rename, remove: remove });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            path: doc.path,
            operation: doc.operation,
            frontmatter: doc.frontmatter,
            body: doc.body,
            tokens: doc.tokens
          }, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: (err as Error).message
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "start_grab_session",
  "Start a capability-keyed Raven grab bridge on loopback. Proxy mode is the preferred zero-paste path: it serves a running local app with the overlay injected into HTML; the manual script tag remains available when needed.",
  {
    path: z.string().describe("Path to DESIGN.md to expose over /tokens"),
    port: z.number().int().positive().optional().describe("Optional port; defaults to an ephemeral loopback port"),
    proxy_target: z.string().optional().describe("URL of a running local dev server; the bridge will serve that app with the grab overlay auto-injected into every HTML page — user opens the bridge URL, zero setup"),
    role: z.enum(["consumer", "maintainer"]).optional().default("consumer").describe("Overlay role; consumer preserves the component-request flow, maintainer enables direct design-system component creation")
  },
  async ({ path, port, proxy_target, role }) => {
    try {
      var session = await startGrabSession(path, port, proxy_target, role);
      var payload: Record<string, unknown> = { ...session };
      payload.agent_protocol = "Tell the user in ONE line that component requests go to this live agent session and are drained with get_grabbed_elements; for teams, briefly mention GitHub routing with COMPONENT_REQUEST_GITHUB_REPO and optional COMPONENT_REQUEST_GITHUB_TOKEN.";
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(payload, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: (err as Error).message
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "get_grabbed_elements",
  "Drain the current grab queue, optionally waiting up to timeout_ms for the next selection. A grabbed element may include an ordered multiSelect array with 1-based indices for spatial instructions such as move 1 above 2.",
  {
    timeout_ms: z.number().int().positive().optional().describe("Optional wait timeout in milliseconds")
  },
  async ({ timeout_ms }) => {
    try {
      var grabbed = await getGrabbedElements(timeout_ms);
      var payload: Record<string, unknown> = { ...grabbed };
      if (grabbed.count > 0) {
        payload.agent_protocol = "Respond to the user NOW about these selections: summarize each requested change in one line (element, ordered multiSelect indices when present, token swaps, style edits, instruction). Treat multiSelect as click-ordered and 1-based, so instructions like move 1 above 2 are grounded in that array. Then ask whether to (a) write a goal/plan and implement the fixes, or (b) wait for direction. Do not implement anything until the user chooses, and do not leave the selections unacknowledged.";
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(payload, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: (err as Error).message
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "stop_grab_session",
  "Stop the current grab bridge and clear its queued selections.",
  {},
  async () => {
    try {
      var stopped = await stopGrabSession();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(stopped, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: (err as Error).message
        }],
        isError: true
      };
    }
  }
);

server.tool(
  "get_page_template",
  "Read the page-scoped template slots from the active grab session's DESIGN.md and merge the overlay's latest selector validation. fixed/flexible roles and allowedTokens are cooperative advisory metadata: display labels only, not enforced.",
  {
    page: z.string().min(1).describe("Page pathname, matching location.pathname")
  },
  async ({ page }) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(getPageTemplate(page), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: (err as Error).message }], isError: true };
    }
  }
);

server.tool(
  "set_template_slot",
  "Persist an array of page-scoped template slots in one batched DESIGN.md update. fixed/flexible roles and allowedTokens are cooperative advisory metadata: display labels only, not enforced.",
  {
    page: z.string().min(1).describe("Page pathname, matching location.pathname"),
    template_id: z.string().min(1).optional().default("default").describe("Template identifier; defaults to default"),
    slots: z.array(z.object({
      slotId: z.string().min(1),
      selector: z.string().min(1),
      role: z.enum(["fixed", "flexible"])
    }).strict()).describe("All template slots to persist in this batched call")
  },
  async ({ page, template_id, slots }) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(setTemplateSlots(page, template_id, slots), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: (err as Error).message }], isError: true };
    }
  }
);

server.tool(
  "list_templates",
  "List templates and their registered page pathnames from the active grab session. Template permissions and allowedTokens are cooperative advisory metadata: display labels only, not enforced.",
  {},
  async () => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(listTemplates(), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: (err as Error).message }], isError: true };
    }
  }
);

server.tool(
  "get_grab_layers",
  "Read the latest non-mutating layer-tree snapshot captured by the active local grab session. Any fixed/flexible permissions are cooperative advisory metadata: display labels only, not enforced.",
  {
    page: z.string().min(1).optional().describe("Optional page pathname; omit to list all latest page snapshots")
  },
  async ({ page }) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(getGrabLayers(page), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: (err as Error).message }], isError: true };
    }
  }
);

server.tool(
  "move_grab_layer",
  "Queue a same-page layer reorder intent (previewed when measuredRects are supplied, otherwise proposed) without mutating the live page. Permissions and fixed/flexible roles are cooperative advisory metadata: display labels only, not enforced; caller-supplied roles are rejected.",
  {
    operation: z.literal("reorder"),
    page: z.string().min(1),
    parentSelector: z.string().min(1),
    fromIndex: z.number().int().min(0),
    toIndex: z.number().int().min(0),
    orderedSelectors: z.array(z.string().min(1)),
    selectionOrder: z.array(z.number().int().min(1)).optional(),
    measuredRects: z.array(z.object({ selector: z.string().min(1), x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict()),
    approximate: z.boolean(),
    domSnapshotHash: z.string().min(1),
    role: z.never().optional().describe("Rejected: roles are never accepted from callers")
  },
  async (intent) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(moveGrabLayer(intent), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: (err as Error).message }], isError: true };
    }
  }
);

server.tool(
  "get_grab_operation",
  "Read queued layer operations or mark a previewed operation applied/rejected after review. This state gate is cooperative bookkeeping, not enforcement, and does not mutate the live page.",
  {
    operation_id: z.string().min(1).optional().describe("Operation ID; omit to list all operations"),
    mark: z.enum(["applied", "rejected"]).optional().describe("Only valid when the operation is currently previewed")
  },
  async ({ operation_id, mark }) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(getGrabOperation(operation_id, mark), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: (err as Error).message }], isError: true };
    }
  }
);

// ── Tool 10: compose_system ─────────────────────────────────────────

server.tool(
  "compose_system",
  "Mix tokens from different design systems to create a custom composite. Example: Linear's colors + Stripe's typography.",
  {
    compositions: z.array(z.object({
      system: z.string().describe("Source design system ID"),
      group: z.string().describe("Token group to take (color, typography, spacing, radius, elevation, motion)")
    })).describe("Array of system-group pairs to compose"),
    format: z.enum(["dtcg", "css"]).optional().describe("Output format. Default: dtcg")
  },
  async ({ compositions, format }) => {
    var composed: Record<string, any> = {
      "$name": "Custom Composition",
      "$description": "Composed from: " + compositions.map(c => c.system + "/" + c.group).join(", ")
    };

    for (var comp of compositions) {
      var tokens = loadSystem(comp.system);
      if (!tokens) {
        return {
          content: [{
            type: "text" as const,
            text: "System '" + comp.system + "' not found. Available: " + getAvailableSystemIds().join(", ")
          }]
        };
      }
      var filtered = filterTokensByGroup(tokens, comp.group);
      for (var key of Object.keys(filtered)) {
        if (!key.startsWith("$")) {
          composed[key] = filtered[key];
        }
      }
    }

    var fmt = format || "dtcg";
    var text: string;

    if (fmt === "css") {
      text = tokensToCSSByGroup(composed, "custom");
    } else {
      text = JSON.stringify(composed, null, 2);
    }

    return {
      content: [{
        type: "text" as const,
        text
      }]
    };
  }
);

// ── Tool 11: audit_page ────────────────────────────────────────────

server.tool(
  "audit_page",
  "Audit HTML/CSS against Raven's design quality standards. Checks typography (min 13px, weight 400+, modular-scale heading ratios, line-height consistency), accessibility (WCAG touch targets, alt text, contrast), responsive patterns (flexbox over grid, clamp sizing, max-width containers), style guide compliance (CSS custom properties, no bare hex), and visual rhythm (4/8px spacing grid, tight spacing scale, palette size). Pass containerMaxWidth (your design system's canonical container token, in px) to make the max-width check token-aware — it then flags containers that diverge from your system (too narrow OR too wide) instead of a generic 1200px heuristic. Returns pass/fail per check with specific fix instructions.",
  {
    html: z.string().optional().describe("The full HTML content of the page to audit"),
    url: z.string().optional().describe("If set, Raven launches headless chromium, renders the page, and audits the RENDERED DOM."),
    scroll_settle: z.boolean().optional().describe("Before capturing, scroll to bottom and settle IntersectionObserver/whileInView reveals (300ms), and play preload=none videos. Prevents blank-section false positives."),
    interactions: z.array(z.object({
      selector: z.string(),
      event: z.enum(["hover", "click", "focus"]),
      delay_ms: z.number()
    })).optional().describe("Before capturing, fire each interaction in order (hover/click/focus the selector, then wait delay_ms). Captures the resulting dynamic state — e.g. an on-hover theme-toggle wash invisible to a static screenshot."),
    viewport: z.object({ w: z.number(), h: z.number() }).optional(),
    strict: z.boolean().optional().describe("Strict mode — also flags warnings as failures. Default: false"),
    containerMaxWidth: z.number().optional().describe("Your design system's canonical content-container width in px (e.g. 1152). When set, the responsive/max-width check flags divergence from this token instead of using the generic 1200px heuristic."),
    adversarial_verify: z.boolean().optional().describe("After generating findings, independently re-check each against the live DOM/network and tag it confirmed / likely-artifact / inconclusive. Surfaces a debunked_count."),
    compact: z.boolean().optional().describe("Return only the decision-grade signal — score, grade, summary, errors, warnings, fix_priority — and drop the embedded base64 screenshot and the passes list (replaced by passes_count). Default false. Use when the full payload would blow the tool-result budget.")
  },
  async function({ html, url, scroll_settle, interactions, viewport, strict, containerMaxWidth, adversarial_verify, compact }) {
    var issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }> = [];
    var passes: string[] = [];
    var capMeta: any = null;
    var videoArtifacts: any[] = [];
    var isStrict = strict || false;

    if (url !== undefined && url !== null) {
      try {
        var cap = await capturePage(url, { scroll_settle: scroll_settle, interactions: interactions, viewport: viewport });
        html = cap.renderedHtml;
        capMeta = { url: url, viewport: cap.viewport, scrolledToBottom: cap.scrolledToBottom, animationsSettled: cap.animationsSettled, screenshot_bytes: cap.screenshotBase64 };
        if (cap.videoArtifacts !== undefined && cap.videoArtifacts !== null) {
          videoArtifacts = cap.videoArtifacts;
        }
      } catch (e) {
        if (e instanceof CaptureUnavailableError) {
          return {
            content: [{
              type: "text" as const,
              text: "Playwright chromium not available. Run: npx playwright install chromium"
            }]
          };
        }
        throw e;
      }
    }

    if (html === undefined || html === null) {
      return {
        content: [{
          type: "text" as const,
          text: "Provide either html or url"
        }]
      };
    }

    // ── Run the shared page-check rule engine (same checks audit_url uses)
    var pageCheckResult = runPageChecks(html, { containerMaxWidth: containerMaxWidth });
    for (var pcPass of pageCheckResult.passes) passes.push(pcPass);
    for (var pcIssue of pageCheckResult.issues) issues.push(pcIssue);

    var errors = issues.filter(function(i) { return i.severity === "error"; });
    var warnings = issues.filter(function(i) { return i.severity === "warning"; });
    var totalChecks = passes.length + issues.length;
    var failCount = isStrict ? issues.length : errors.length;

    var result: any = {
      score: Math.round(((totalChecks - failCount) / totalChecks) * 100),
      grade: failCount === 0 ? "A" : failCount <= 2 ? "B" : failCount <= 4 ? "C" : "D",
      summary: passes.length + "/" + totalChecks + " checks passed" + (failCount > 0 ? " — " + failCount + " issues to fix" : " — all clear"),
      passes: passes,
      errors: errors,
      warnings: isStrict ? warnings.map(function(w) { return Object.assign({}, w, { severity: "error" as const }); }) : warnings,
      fix_priority: errors.concat(warnings).map(function(i) { return i.rule + ": " + i.fix; })
    };

    if (capMeta !== null) {
      result.capture = capMeta;
      result.unloaded_video_artifacts = videoArtifacts;
      if (videoArtifacts.length > 0) {
        var notes: string[] = [];
        for (var videoArtifact of videoArtifacts) {
          var artifactSelector = "video";
          if (videoArtifact.selector !== undefined && videoArtifact.selector !== null) {
            artifactSelector = videoArtifact.selector;
          }
          notes.push("unloaded-video-artifact: " + artifactSelector + " rendered blank because preload=none; not a visual defect");
        }
        result.notes = notes;
      }
    }

    if (adversarial_verify === true) {
      var findings: VerifiableFinding[] = [];
      var findingTargets: any[] = [];

      for (var errorIndex = 0; errorIndex < result.errors.length; errorIndex++) {
        var errorIssue = result.errors[errorIndex];
        findings.push({
          key: errorIssue.rule + ":" + errorIndex,
          kind: "issue",
          rule: errorIssue.rule,
          message: errorIssue.message
        });
        findingTargets.push(errorIssue);
      }

      for (var warningIndex = 0; warningIndex < result.warnings.length; warningIndex++) {
        var warningIssue = result.warnings[warningIndex];
        findings.push({
          key: warningIssue.rule + ":" + warningIndex,
          kind: "issue",
          rule: warningIssue.rule,
          message: warningIssue.message
        });
        findingTargets.push(warningIssue);
      }

      if (result.unloaded_video_artifacts !== undefined && result.unloaded_video_artifacts !== null) {
        for (var artifactIndex = 0; artifactIndex < result.unloaded_video_artifacts.length; artifactIndex++) {
          var videoArtifactForVerify = result.unloaded_video_artifacts[artifactIndex];
          var videoSelector = "video";
          if (videoArtifactForVerify.selector !== undefined && videoArtifactForVerify.selector !== null) {
            videoSelector = videoArtifactForVerify.selector;
          }
          findings.push({
            key: "video:" + videoSelector,
            kind: "video-artifact",
            rule: "video",
            message: "Video rendered blank (preload=none — unloaded-video-artifact)",
            selector: videoSelector
          });
          findingTargets.push(videoArtifactForVerify);
        }
      }

      var verificationResults: any[] = [];
      try {
        verificationResults = await verifyFindings(
          { url: url, html: (url !== undefined && url !== null ? undefined : html) },
          findings,
          { viewport: viewport }
        );
      } catch (verifyError) {
        var verifyErrorMessage = verifyError instanceof Error ? verifyError.message : String(verifyError);
        for (var unavailableIndex = 0; unavailableIndex < findings.length; unavailableIndex++) {
          verificationResults.push({
            key: findings[unavailableIndex].key,
            verdict: "inconclusive",
            evidence: "adversarial verification unavailable: " + verifyErrorMessage
          });
        }
      }

      if (!Array.isArray(verificationResults)) {
        verificationResults = [];
      }

      var debunkedCount = 0;
      var confirmedCount = 0;
      var inconclusiveCount = 0;

      for (var verifyIndex = 0; verifyIndex < findings.length; verifyIndex++) {
        var verification = verificationResults[verifyIndex];
        var verdict = "inconclusive";
        var evidence = "";
        if (verification !== undefined && verification !== null) {
          if (verification.verdict === "confirmed" || verification.verdict === "likely-artifact" || verification.verdict === "inconclusive") {
            verdict = verification.verdict;
          }
          if (verification.evidence !== undefined && verification.evidence !== null) {
            evidence = verification.evidence;
          }
        }

        var findingTarget = findingTargets[verifyIndex];
        if (findingTarget !== undefined && findingTarget !== null) {
          findingTarget.verdict = verdict;
          if (findings[verifyIndex].kind === "issue") {
            findingTarget.verification_evidence = evidence;
          }
        }

        if (verdict === "likely-artifact") {
          debunkedCount++;
        } else if (verdict === "confirmed") {
          confirmedCount++;
        } else {
          inconclusiveCount++;
        }
      }

      result.adversarial_verification = {
        debunked_count: debunkedCount,
        confirmed_count: confirmedCount,
        inconclusive_count: inconclusiveCount,
        total: findings.length
      };
      result.summary = result.summary + " — " + debunkedCount + " likely artifacts (adversarially debunked)";
    }

    const payload = compact === true ? compactAuditPage(result) : result;
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }]
    };
  }
);

// ── Tool 11b: score_page ───────────────────────────────────────────────────

server.tool(
  "score_page",
  "Score an HTML/CSS page across 7 design categories (Structure, Typography, Color & palette, Spacing & rhythm, Accessibility, Responsive layout, Design tokens), each rated 0–10. Scores are derived deterministically from the same checks as audit_page — no browser required. Also returns the same overall 0–100 score and A–D grade audit_page produces, the weakest category, and the three categories Raven does not mechanically assess (brand, conversion, motion) with guidance on which tools to use for those.",
  {
    html: z.string().min(1).describe("The full HTML content of the page to score."),
    strict: z.boolean().optional().describe("Strict mode — count warnings as failures in the overall score. Default: false."),
    containerMaxWidth: z.number().optional().describe("Your design system's canonical content-container width in px (e.g. 1152). Forwarded to the responsive/max-width check.")
  },
  async function({ html, strict, containerMaxWidth }) {
    if (html === undefined || html === null || html.trim() === "") {
      return {
        content: [{
          type: "text" as const,
          text: "Provide html (the page's HTML/CSS) to score."
        }]
      };
    }
    const result = scorePage(html, { strict, containerMaxWidth });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

server.tool(
  "audit_asset_integrity",
  "Detect PNG exports whose content is sliced/cut off at the bottom edge (e.g. a Figma export that ended mid-form). Dimension/ratio checks cannot catch cut content inside a correctly-sized file; this measures per-pixel luminance variance in the bottom strip — uniform background = clean, high-variance UI content running into the edge = likely-sliced. Accepts filesystem paths to PNGs.",
  { image_paths: z.array(z.string()).describe("Filesystem paths to PNG files to check for sliced/cut-off bottom content.") },
  async function({ image_paths }) {
    var results = await auditAssetIntegrity(image_paths || []);
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "audit_asset_integrity", results: results }, null, 2) }] };
  }
);

server.tool(
  "audit_device_frame",
  "Detect cropped content in device-mockup frames (phone/MacBook screenshots, app-preview clips). Three checks: (1) GEOMETRY — call with `frames` (container box + intrinsic media size + object-fit/position; call with NO args for a DevTools snippet) to flag object-fit:cover crop loss when the frame's aspect ratio ≠ the media's; (2) MOTION — pass `clips` (first/last frame PNG paths) to detect baked-in pan/zoom (Ken Burns) that drifts the composition; (3) EDGE — pass `edge_frames` (PNG paths) to flag content truncated at a frame edge. Catches the exact failure where a 16:9 clip in a 1.82-AR screen cutout silently slices the bottom, or a Ken-Burns-zoomed source crops content.",
  {
    frames: z.array(z.object({
      selector: z.string(),
      container: z.object({ w: z.number(), h: z.number() }),
      media: z.object({ w: z.number(), h: z.number() }),
      objectFit: z.enum(["fill", "cover", "contain", "none", "scale-down"]).optional(),
      objectPosition: z.object({ x: z.number(), y: z.number() }).optional()
    })).optional().describe("Device-frame geometry samples (from the DevTools snippet): container box + intrinsic media size + computed object-fit/position. Flags object-fit:cover crop loss."),
    clips: z.array(z.object({
      label: z.string(),
      first_frame: z.string(),
      last_frame: z.string()
    })).optional().describe("Per-clip first/last frame PNG file paths — detects baked-in pan/zoom (Ken Burns)."),
    edge_frames: z.array(z.object({
      label: z.string(),
      frame: z.string()
    })).optional().describe("Frame PNG file paths to check for content truncated at a frame edge (reuses edge-symmetry).")
  },
  async ({ frames, clips, edge_frames }) => {
    var hasFrames = Array.isArray(frames) && frames.length > 0;
    var hasClips = Array.isArray(clips) && clips.length > 0;
    var hasEdges = Array.isArray(edge_frames) && edge_frames.length > 0;

    if (!hasFrames && !hasClips && !hasEdges) {
      var snippet = "// Paste into DevTools console on the page whose device frames you want to audit.\n" +
        "// Copies {frames} JSON to clipboard — pass it back to audit_device_frame.\n" +
        "(() => {\n" +
        "  const frac = (v) => {\n" +
        "    if (!v) return 0.5;\n" +
        "    if (v.endsWith('%')) return parseFloat(v) / 100;\n" +
        "    if (v === 'left' || v === 'top') return 0;\n" +
        "    if (v === 'right' || v === 'bottom') return 1;\n" +
        "    return 0.5;\n" +
        "  };\n" +
        "  const pick = el => {\n" +
        "    const r = el.getBoundingClientRect();\n" +
        "    const cs = getComputedStyle(el);\n" +
        "    const isVideo = el.tagName === 'VIDEO';\n" +
        "    const mw = isVideo ? el.videoWidth : el.naturalWidth;\n" +
        "    const mh = isVideo ? el.videoHeight : el.naturalHeight;\n" +
        "    const op = (cs.objectPosition || '50% 50%').split(/\\s+/);\n" +
        "    const cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';\n" +
        "    const sel = el.id ? '#' + el.id : el.tagName.toLowerCase() + (cls ? '.' + cls : '');\n" +
        "    return {\n" +
        "      selector: sel,\n" +
        "      container: { w: Math.round(r.width), h: Math.round(r.height) },\n" +
        "      media: { w: mw, h: mh },\n" +
        "      objectFit: cs.objectFit || 'fill',\n" +
        "      objectPosition: { x: frac(op[0]), y: frac(op[1] || op[0]) }\n" +
        "    };\n" +
        "  };\n" +
        "  const all = [...document.querySelectorAll('img, video')]\n" +
        "    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8; })\n" +
        "    .map(pick)\n" +
        "    .filter(f => f.media.w > 0 && f.media.h > 0);\n" +
        "  const out = { frames: all };\n" +
        "  try { copy(JSON.stringify(out)); console.log('\\u2713 copied to clipboard \\u2014 ' + all.length + ' device frames'); } catch (_) { console.log(JSON.stringify(out)); }\n" +
        "  return out;\n" +
        "})();";
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            instructions: "Paste the snippet below into DevTools console on your rendered page. It copies a {frames} JSON blob (every <img>/<video> with its container box, intrinsic media size, and object-fit/position) to your clipboard. Call audit_device_frame again with that JSON to flag object-fit:cover crop loss. For pan/zoom and edge-truncation checks, pass `clips`/`edge_frames` with PNG frame paths instead.",
            snippet: snippet,
            example_call: "audit_device_frame({ frames: [...] })  // or { clips: [{label, first_frame, last_frame}] } / { edge_frames: [{label, frame}] }"
          }, null, 2)
        }]
      };
    }

    var frameVerdicts = hasFrames ? auditDeviceFrames(frames as any) : [];
    var clipVerdicts = hasClips
      ? await auditClipMotion((clips as any[]).map(function (c) { return { label: c.label, firstFramePath: c.first_frame, lastFramePath: c.last_frame }; }))
      : [];
    var edgeVerdicts = hasEdges
      ? await auditFrameEdges((edge_frames as any[]).map(function (e) { return { label: e.label, framePath: e.frame }; }))
      : [];

    var croppedCount = frameVerdicts.filter(function (v) { return v.verdict === "cropped" || v.verdict === "distorted" || v.verdict === "letterboxed"; }).length;
    var movingCount = clipVerdicts.filter(function (v) { return v.verdict !== "static" && v.verdict !== "inconclusive"; }).length;
    var slicedCount = edgeVerdicts.filter(function (v) { return v.verdict === "likely-sliced"; }).length;

    var summary = "audit_device_frame — " +
      croppedCount + "/" + frameVerdicts.length + " frames cropped/distorted, " +
      movingCount + "/" + clipVerdicts.length + " clips with baked-in motion, " +
      slicedCount + "/" + edgeVerdicts.length + " frames edge-truncated";

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ tool: "audit_device_frame", frames: frameVerdicts, clips: clipVerdicts, edge_frames: edgeVerdicts, summary }, null, 2)
      }]
    };
  }
);

server.tool(
  "audit_contract",
  "Verify a wire contract (token list / field set / schemaVersion) is identical across N independent source files (iOS Swift, proxy JS, Android Kotlin). Flags missing/inconsistent tokens, schemaVersion drift, and prefix-ordering bugs (a contained token matched before the longer one). BLOCK/PASS verdict.",
  {
    contract_spec: z.object({
      mode: z.enum(["tokens", "envelope"]).optional(),
      tokens: z.array(z.string()).optional(),
      fields: z.array(z.string()).optional(),
      schemaVersionPattern: z.string().optional()
    }),
    file_paths: z.array(z.string())
  },
  async function({ contract_spec, file_paths }) {
    var files: Array<{ path: string; content: string }> = [];
    var read_warnings: string[] = [];

    for (var i = 0; i < file_paths.length; i++) {
      var path = file_paths[i];
      var content = "";
      try {
        content = readFileSync(path, "utf8");
      } catch (error) {
        read_warnings.push(path + ": " + (error as Error).message);
      }
      files.push({ path: path, content: content });
    }

    var result = auditContract(contract_spec, files);
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "audit_contract", ...result, read_warnings }, null, 2) }] };
  }
);

server.tool(
  "audit_api_contract",
  "Run adversarial queries against a live endpoint and return per-query verdict (shape-valid / shape-invalid / confident-wrong / uncertain) vs an expected shape schema + per-query expectations. Catches responses that are shape-valid but wrong.",
  {
    endpoint_url: z.string(),
    queries: z.array(z.object({
      name: z.string(),
      method: z.enum(["GET", "POST"]).optional(),
      path: z.string().optional(),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      expect: z.object({
        contains: z.array(z.string()).optional(),
        equals: z.record(z.any()).optional()
      }).optional()
    })),
    expected_shape_schema: z.object({
      required: z.array(z.string()).optional(),
      types: z.record(z.enum(["string", "number", "boolean", "object", "array"])).optional()
    })
  },
  async function({ endpoint_url, queries, expected_shape_schema }) {
    var result = await runApiContract(endpoint_url, queries || [], expected_shape_schema || {});
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "audit_api_contract", ...result }, null, 2) }] };
  }
);

server.tool(
  "audit_parity",
  "Compare iOS vs Android element snapshots against a checklist of named spatial relationships (vertical centering, baseline/left alignment, equal gap/size, presence, truncation) and flag per-relation match/mismatch/uncertain — catches cross-platform layout drift like status text centered on one platform but top-aligned on the other. Provide ios+android {elements,viewport} snapshots and a checklist[].",
  { ios: z.object({ elements: z.array(z.object({ label: z.string().optional(), id: z.string().optional(), role: z.string().optional(), rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }) })), viewport: z.object({ w: z.number(), h: z.number() }) }), android: z.object({ elements: z.array(z.object({ label: z.string().optional(), id: z.string().optional(), role: z.string().optional(), rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }) })), viewport: z.object({ w: z.number(), h: z.number() }) }), checklist: z.array(z.object({ name: z.string(), a: z.string(), b: z.string().optional(), relation: z.enum(["present", "vertically-centered", "baseline-aligned", "left-aligned", "equal-gap", "equal-size", "same-truncation"]), tolerance: z.number().optional() })) },
  async function({ ios, android, checklist }) {
    var r = auditParity(ios, android, checklist || []);
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "audit_parity", ...r }, null, 2) }] };
  }
);

server.tool(
  "audit_ios_a11y",
  "Score an accessibility-enriched iOS element snapshot — missing accessibilityLabel/value/traits, sub-44pt tap targets, per-text WCAG contrast, Dynamic Type clipping, and VoiceOver reading order. Provide {elements:[{label,value,hint,traits,role,rect,fontPt,fgColor,bgColor,dynamicTypeClipped}],viewport}. Capture via the AccessibilitySnapshot XCUITest / ios-capture harness.",
  { elements: z.array(z.object({ label: z.string().optional(), value: z.string().optional(), hint: z.string().optional(), traits: z.array(z.string()).optional(), role: z.string().optional(), rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }), fontPt: z.number().optional(), fgColor: z.string().optional(), bgColor: z.string().optional(), dynamicTypeClipped: z.boolean().optional() })), viewport: z.object({ w: z.number(), h: z.number() }), options: z.object({ minTarget: z.number().optional() }).optional() },
  async function({ elements, viewport, options }) {
    var r = auditIosA11y({ elements: elements || [], viewport, options });
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "audit_ios_a11y", ...r }, null, 2) }] };
  }
);

// ── Tool 11b: audit_responsive_visibility ──────────────────────────

server.tool(
  "audit_responsive_visibility",
  "Render a URL at multiple breakpoints and flag content elements that are visible on desktop but hidden on mobile (display:none / opacity:0 / visibility:hidden / zero-size). Categorises each flag as 'likely-oversight' (content that vanishes on mobile — the hidden-on-mobile content bug) vs 'intentional' (decorative). Returns a table of selector / hiding-class / mobile-visible / desktop-visible / category. Requires headless chromium.",
  {
    url: z.string().describe("URL to render (http/https or file://)"),
    breakpoints: z.array(z.number()).optional().describe("Viewport widths in px. Default [390, 768, 1440, 2160]"),
    viewportHeight: z.number().optional().describe("Render height in px. Default 900")
  },
  async function({ url, breakpoints, viewportHeight }) {
    try {
      var rv = await captureResponsiveVisibility(url, breakpoints, { viewportHeight: viewportHeight });
      return { content: [{ type: "text" as const, text: JSON.stringify(rv, null, 2) }] };
    } catch (error) {
      if (error instanceof CaptureUnavailableError) {
        return { content: [{ type: "text" as const, text: "audit_responsive_visibility needs headless chromium. Run: npx playwright install chromium" }] };
      }
      throw error;
    }
  }
);

// ── Tool 11c: audit_contrast ───────────────────────────────────────

server.tool(
  "audit_contrast",
  "Compute WCAG contrast ratios for every text element on a rendered page (pass url) or from a supplied dom_snapshot. Reports AA (4.5:1 normal, 3:1 large) and AAA pass/fail per element and surfaces failing pairs with selector, ratio, and delta-to-pass — replacing manual eyedropper + ratio math.",
  {
    url: z.string().optional().describe("URL to render and measure (http/https or file://)"),
    dom_snapshot: z.array(z.object({
      selector: z.string(),
      color: z.string(),
      bgColor: z.string(),
      fontPx: z.number().optional(),
      bold: z.boolean().optional(),
      text: z.string().optional()
    })).optional().describe("Pre-collected text elements to score without rendering"),
    screenshot: z.string().optional().describe("Optional base64 PNG for caller reference; ratios are computed from the DOM, not pixels")
  },
  async function({ url, dom_snapshot, screenshot }) {
    if (url !== undefined && url !== null) {
      try {
        var ct = await auditContrastUrl(url);
        return { content: [{ type: "text" as const, text: JSON.stringify(ct, null, 2) }] };
      } catch (error) {
        if (error instanceof CaptureUnavailableError) {
          return { content: [{ type: "text" as const, text: "audit_contrast url mode needs headless chromium. Run: npx playwright install chromium — or pass a dom_snapshot instead." }] };
        }
        throw error;
      }
    }
    if (dom_snapshot !== undefined && dom_snapshot !== null) {
      var ctSnap = auditContrastSnapshot(dom_snapshot);
      return { content: [{ type: "text" as const, text: JSON.stringify(ctSnap, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: "Provide either url (render + measure) or dom_snapshot (score supplied elements). Each dom_snapshot element: { selector, color, bgColor, fontPx?, bold?, text? }." }] };
  }
);

// ── Tool 11c-r: suggest_contrast_fix ──────────────────────────────

server.tool(
  "suggest_contrast_fix",
  "Given failing WCAG color pairs, return the MINIMAL color change that clears the target ratio. For each {fg,bg} pair, computes the smallest foreground adjustment (and an alternative background adjustment) that reaches AA/AAA — with the achieved ratio and direction. Feeds directly from audit_contrast's failing pairs: pass them here to get concrete passing values instead of brute-forcing colors by hand. Pure offline math.",
  {
    pairs: z.array(z.object({
      selector: z.string().optional(),
      fg: z.string(),
      bg: z.string(),
      fontPx: z.number().optional(),
      bold: z.boolean().optional(),
      targetRatio: z.number().optional()
    })).optional().describe("Color pairs to remediate. Each: { selector?, fg, bg, fontPx?, bold?, targetRatio? }. fontPx/bold pick the large-text threshold; targetRatio overrides the level."),
    level: z.enum(["AA", "AAA"]).optional().describe("WCAG level when targetRatio is not given per-pair. Default AA.")
  },
  async function({ pairs, level }) {
    if (pairs === undefined || pairs === null || pairs.length === 0) {
      return { content: [{ type: "text" as const, text: "Provide pairs: [{ selector?, fg, bg, fontPx?, bold?, targetRatio? }]. Returns the minimal fg/bg change that clears the WCAG target for each pair. Set level to 'AA' (default) or 'AAA'." }] };
    }
    var lvl = level || "AA";
    var results = pairs.map(function(p) {
      var fix = suggestContrastFix(p.fg, p.bg, { targetRatio: p.targetRatio, level: lvl, fontPx: p.fontPx, bold: p.bold });
      if (p.selector !== undefined && p.selector !== null) {
        return Object.assign({ selector: p.selector }, fix);
      }
      return fix;
    });
    var alreadyPassing = results.filter(function(r) { return r.passes; }).length;
    var unreachable = results.filter(function(r) { return !r.passes && !r.reachable; }).length;
    var fixed = results.length - alreadyPassing - unreachable;
    var summary = "suggest_contrast_fix — " + fixed + " fixable, " + alreadyPassing + " already passing, " + unreachable + " unreachable (need both colors changed)";
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "suggest_contrast_fix", level: lvl, results: results, summary: summary }, null, 2) }] };
  }
);

// ── Tool 11d: audit_url ────────────────────────────────────────────

server.tool(
  "audit_url",
  "Layer 0 render-and-capture audit: renders a LIVE URL at each viewport×theme, scroll-settles (fires whileInView/IntersectionObserver reveals; plays preload=none videos), fires hover/click/focus interactions, and captures real pixels + the rendered DOM. Then runs the existing audit_page rule engine, per-element WCAG contrast, responsive-visibility (desktop-shown/mobile-hidden), blank-media detection, sliced-image edge symmetry, and hover-state white-wash detection over the captures. Every finding is tagged confirmed | likely-artifact | inconclusive with its evidence, ranked by severity. This is the tool that catches real-world visual nits invisible to HTML-string/geometry audits: cropped images, blank videos, hover white-wash, sliced exports, and hidden-on-mobile content. Requires headless chromium.",
  {
    url: z.string().describe("URL to render and audit (http/https or file://)"),
    viewports: z.array(z.object({
      w: z.number(),
      h: z.number(),
      label: z.string().optional()
    })).optional().describe("Viewports to render. Default: iphone 393×852, desktop 1440×900, wide 2160×1200"),
    themes: z.array(z.enum(["light", "dark"])).optional().describe("Themes to toggle (prefers-color-scheme + data-theme/class). Default: ['light','dark']"),
    scroll_settle: z.boolean().optional().describe("Scroll to bottom to fire reveal-on-scroll/IntersectionObserver content and play videos before capture. Default: true"),
    interactions: z.array(z.object({
      selector: z.string(),
      event: z.enum(["hover", "click", "focus"]),
      delay_ms: z.number()
    })).optional().describe("Fire each interaction before capture; the resulting state is diffed against baseline to catch hover/click white-wash and obscured content."),
    containerMaxWidth: z.number().optional().describe("Your design system's canonical container width in px — makes the max-width check token-aware."),
    includeScreenshots: z.boolean().optional().describe("Include the base64 full-page PNG per capture in the result. Default: false (screenshots are large)."),
    timeoutMs: z.number().optional().describe("Per-navigation timeout in ms. Default: 30000"),
    compact: z.boolean().optional().describe("Drop per-capture base64 screenshots; keep findings, counts, and summary. Default false. Use when screenshots would blow the tool-result budget.")
  },
  async function({ url, viewports, themes, scroll_settle, interactions, containerMaxWidth, includeScreenshots, timeoutMs, compact }) {
    try {
      var result = await auditUrl(url, {
        viewports: viewports,
        themes: themes,
        scroll_settle: scroll_settle,
        interactions: interactions,
        containerMaxWidth: containerMaxWidth,
        includeScreenshots: includeScreenshots,
        timeoutMs: timeoutMs
      });
      const urlPayload = compact === true ? compactAuditUrl(result) : result;
      return { content: [{ type: "text" as const, text: JSON.stringify(urlPayload, null, 2) }] };
    } catch (error) {
      if (error instanceof CaptureUnavailableError) {
        return { content: [{ type: "text" as const, text: "audit_url needs headless chromium. Run: npx playwright install chromium" }] };
      }
      throw error;
    }
  }
);

// ── Tool 11e: audit_content ────────────────────────────────────────

server.tool(
  "audit_content",
  "Evaluate an array of content items (headings, prose, CTAs, labels, captions, metrics, outcomes) against UX-writing principles and deterministic heuristics. Returns a per-item verdict (pass/warn/fail) with matched principle ids, concrete issues grounded in principle text, a before→after rewrite suggestion, and an aggregate summary. Heuristics: metric items must carry a number+unit; cta/label must be action-led and ≤4 words; prose flags passive voice, jargon, and hedging; headings flag filler openers and buzzwords; captions flag duplication of any heading in the batch. Pure offline — no network or browser. Use this instead of evaluate_design when you need per-item content verdicts rather than the principle library.",
  {
    items: z.array(z.object({
      id: z.string().optional().describe("Optional stable id; auto-generated (item_N) if omitted."),
      type: z.enum(["prose", "caption", "heading", "outcome", "metric", "cta", "label"]).describe("Content type — selects which heuristics apply."),
      text: z.string().describe("The raw content string to evaluate.")
    })).describe("Array of content items to audit."),
    system: z.string().optional().describe("Optional content-system id (e.g. 'ux-writing'); recorded for traceability."),
    goals: z.array(z.string()).optional().describe("Optional content goals (e.g. ['clarity','conversion']); recorded for traceability.")
  },
  async function({ items, system, goals }) {
    var result = auditContent(items || [], { system: system, goals: goals });
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "audit_content", ...result }, null, 2) }] };
  }
);

// ── Tool 11f: audit_typography ─────────────────────────────────────

server.tool(
  "audit_typography",
  "Audit the typographic SCALE of a rendered page (pass url) or a pre-collected snapshot of text nodes. Emits a focused report: (a) MODULAR SCALE — detects the dominant ratio (~1.2/1.25/1.333/1.5) across distinct font sizes and flags off-scale outliers; (b) LINE-HEIGHT CONSISTENCY — unitless lh/fs ratio per node, identifies the body rhythm and flags outliers; (c) WEIGHT LADDER — distinct weights, flags >4 weights or non-standard CSS values. Returns scale, line_height, weight_ladder, nodes_analyzed, and findings[{rule,severity,selector,message,fix}]. Goes beyond audit_page's pass/fail typography checks. url mode requires headless chromium.",
  {
    url: z.string().optional().describe("URL to render and measure (http/https or file://). Requires headless chromium."),
    nodes: z.array(z.object({
      selector: z.string(),
      fontPx: z.number(),
      lineHeightPx: z.number().optional(),
      fontWeight: z.number().optional(),
      tag: z.string().optional(),
      text: z.string().optional()
    })).optional().describe("Pre-collected text nodes to analyze without rendering.")
  },
  async function({ url, nodes }) {
    if (url !== undefined && url !== null) {
      try {
        var typo = await auditTypographyUrl(url);
        return { content: [{ type: "text" as const, text: JSON.stringify(typo, null, 2) }] };
      } catch (error) {
        if (error instanceof CaptureUnavailableError) {
          return { content: [{ type: "text" as const, text: "audit_typography url mode needs headless chromium. Run: npx playwright install chromium — or pass a nodes snapshot instead." }] };
        }
        throw error;
      }
    }
    if (nodes !== undefined && nodes !== null) {
      var typoSnap = auditTypographySnapshot(nodes);
      return { content: [{ type: "text" as const, text: JSON.stringify(typoSnap, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: "Provide either url (render + measure) or nodes (score supplied text nodes). Each node: { selector, fontPx, lineHeightPx?, fontWeight?, tag?, text? }." }] };
  }
);

// ── Tool 11g: audit_tap_targets ────────────────────────────────────

server.tool(
  "audit_tap_targets",
  "WCAG 2.5.5 / Apple 44pt tap-target audit for the web. Collects every interactive element (a, button, [role=button], input[type=submit/button/checkbox/radio], select, summary, label[for], [onclick], [tabindex>=0]) and emits a PER-ELEMENT fix table for any whose rendered width or height is below the minimum (default 44px): selector, role, visible text, measured w/h, pixel deficit per axis, and a concrete CSS fix. Sorted worst-first. Two modes: pass url (renders in headless chromium, measures real getBoundingClientRect) or pass elements[] snapshot (pure, no browser).",
  {
    url: z.string().optional().describe("URL to render and measure. Requires headless chromium."),
    elements: z.array(z.object({
      selector: z.string(),
      w: z.number(),
      h: z.number(),
      x: z.number().optional(),
      y: z.number().optional(),
      role: z.string().optional(),
      text: z.string().optional()
    })).optional().describe("Pre-collected interactive elements to score without rendering."),
    minSize: z.number().optional().describe("Minimum tap-target size in px on each axis. Default 44.")
  },
  async function({ url, elements, minSize }) {
    if (url !== undefined && url !== null) {
      try {
        var tt = await auditTapTargetsUrl(url, { minSize: minSize });
        return { content: [{ type: "text" as const, text: JSON.stringify(tt, null, 2) }] };
      } catch (error) {
        if (error instanceof CaptureUnavailableError) {
          return { content: [{ type: "text" as const, text: "audit_tap_targets url mode needs headless chromium. Run: npx playwright install chromium — or pass an elements snapshot instead." }] };
        }
        throw error;
      }
    }
    if (elements !== undefined && elements !== null) {
      var ttSnap = auditTapTargetsSnapshot(elements, minSize === undefined || minSize === null ? 44 : minSize);
      return { content: [{ type: "text" as const, text: JSON.stringify(ttSnap, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: "Provide either url (render + measure) or elements (score supplied targets). Each element: { selector, w, h, x?, y?, role?, text? }." }] };
  }
);

// ── Tool 12: get_brand_system ──────────────────────────────────────

server.tool(
  "get_brand_system",
  "Get a complete design system for building an app with branding like a specific company. Say 'Make me an app with branding like Spotify' and get the full token set, style guide, and implementation instructions. Matches against 12 known design systems and provides closest match with ready-to-use CSS.",
  {
    company: z.string().describe("The company whose branding to use (e.g. 'Spotify', 'Stripe', 'Apple', 'Linear', 'Airbnb')"),
    format: z.enum(["css", "dtcg", "guide"]).optional().describe("Output format: 'css' for CSS variables, 'dtcg' for W3C tokens, 'guide' for full implementation guide. Default: guide"),
    mode: z.enum(["light", "dark"]).optional().describe("Color mode preference. Default: based on the system's primary mode")
  },
  async ({ company, format, mode }) => {
    var registry = loadRegistry();
    var fmt = format || "guide";
    var searchTerm = company.toLowerCase().trim();

    // Direct match first
    var matchedSystem: any = null;
    for (var sys of registry.systems) {
      if (sys.id === searchTerm ||
          sys.name.toLowerCase() === searchTerm ||
          sys.name.toLowerCase().replace(/[^a-z0-9]/g, "") === searchTerm.replace(/[^a-z0-9]/g, "")) {
        matchedSystem = sys;
        break;
      }
    }

    // Fuzzy match by tags and description
    if (!matchedSystem) {
      var bestScore = 0;
      for (var s of registry.systems) {
        var score = 0;
        var haystack = (s.name + " " + s.description + " " + (s.tags || []).join(" ")).toLowerCase();
        var terms = searchTerm.split(/\s+/);
        for (var term of terms) {
          if (haystack.includes(term)) score += 2;
        }
        if (s.category && s.category.toLowerCase().includes(searchTerm)) score += 3;
        for (var tag of (s.tags || [])) {
          if (tag.includes(searchTerm) || searchTerm.includes(tag)) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          matchedSystem = s;
        }
      }
      if (bestScore === 0) matchedSystem = null;
    }

    if (!matchedSystem) {
      var available = registry.systems.map(function(s: any) { return s.name; });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "No matching design system found for '" + company + "'",
            suggestion: "Try one of the available systems, or describe the aesthetic you want (e.g. 'dark minimal developer tool', 'warm consumer marketplace')",
            available_systems: available,
            tip: "You can also use compose_system to mix tokens from multiple systems — e.g. Linear's colors + Stripe's typography"
          }, null, 2)
        }]
      };
    }

    var tokens = loadSystem(matchedSystem.id);
    if (!tokens) {
      return {
        content: [{
          type: "text" as const,
          text: "System matched (" + matchedSystem.name + ") but token file not found."
        }]
      };
    }

    // If dark mode requested and dark tokens exist, merge them
    if (mode === "dark" && tokens["color-dark"]) {
      var darkColors = tokens["color-dark"];
      for (var dk of Object.keys(darkColors)) {
        if (!dk.startsWith("$")) {
          tokens.color[dk] = darkColors[dk];
        }
      }
    }

    if (fmt === "css") {
      var css = tokensToCSSByGroup(tokens, matchedSystem.id);
      return {
        content: [{
          type: "text" as const,
          text: css
        }]
      };
    }

    if (fmt === "dtcg") {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(tokens, null, 2)
        }]
      };
    }

    // Full implementation guide
    var flat = flattenTokens(tokens, "");
    var primaryColor = flat.find(function(t) { return t.path === "color.primary"; });
    var bgColor = flat.find(function(t) { return t.path === "color.background"; });
    var fontDisplay = flat.find(function(t) { return t.path === "typography.font-family.display"; });
    var fontBody = flat.find(function(t) { return t.path === "typography.font-family.body"; });
    var radiusBase = flat.find(function(t) { return t.path.includes("radius") && t.path.includes("base"); });

    var isDark = false;
    if (bgColor) {
      var hex = String(bgColor.value).replace("#", "");
      if (hex.length >= 6) {
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        isDark = (r + g + b) / 3 < 128;
      }
    }

    var guide = {
      brand: matchedSystem.name,
      description: matchedSystem.description,
      category: matchedSystem.category,
      tags: matchedSystem.tags,
      aesthetic_summary: "Build with " + matchedSystem.name + "'s design language: " + (matchedSystem.tags || []).join(", ") + ".",

      quick_start: {
        primary_color: primaryColor ? primaryColor.value : "See tokens",
        background: bgColor ? bgColor.value : "See tokens",
        font_display: fontDisplay ? fontDisplay.value : "system-ui",
        font_body: fontBody ? fontBody.value : "system-ui",
        border_radius: radiusBase ? radiusBase.value : "See tokens",
        mode: isDark ? "dark-first" : "light-first"
      },

      css_variables: tokensToCSSByGroup(tokens, matchedSystem.id),

      implementation_rules: [
        "Use CSS custom properties (var(--" + matchedSystem.id + "-xxx)) for every visual value — no bare hex, px, or font names",
        "All font sizes minimum 13px, all font weights minimum 400",
        "Use flexbox with flex-wrap for card/grid layouts — no hard breakpoints",
        "Use clamp() for fluid padding: clamp(48px, 8vw, 128px) vertical, clamp(16px, 4vw, 24px) horizontal",
        "Content max-width: 1200px with margin: 0 auto",
        "All interactive elements: minimum 44px touch target (padding: 12px 24px on buttons)",
        "All images need alt attributes",
        "viewport meta tag required",
        isDark ? "Dark background — ensure text contrast ratio >= 4.5:1 (WCAG AA)" : "Light background — ensure text contrast ratio >= 4.5:1 (WCAG AA)"
      ],

      responsive_pattern: {
        layout: "display: flex; flex-wrap: wrap — cards get flex: 1 1 280px; min-width: 280px",
        padding: "clamp(48px, 8vw, 128px) clamp(16px, 4vw, 24px)",
        container: "max-width: 1200px; margin: 0 auto",
        media_queries: "Only for: nav collapse, font scaling, element hiding. Never for grid-template-columns."
      },

      token_count: flat.length + " tokens available",
      groups: Object.keys(tokens).filter(function(k) { return !k.startsWith("$"); })
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(guide, null, 2)
      }]
    };
  }
);

// ── HTML visual export ─────────────────────────────────────────────

function tokensToHTML(tokens: any, systemName: string): string {
  var colorTokens = tokens["color"] || {};
  var darkTokens = tokens["color-dark"] || null;
  var typo = tokens["typography"] || {};
  var spacing = tokens["spacing"] || {};
  var radius = tokens["radius"] || {};
  var elevation = tokens["elevation"] || {};
  var motion = tokens["motion"] || {};
  var systemId = systemName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  var primaryColor = colorTokens["primary"]?.["$value"] || "#3B82F6";
  var bgColor = colorTokens["background"]?.["$value"] || "#FAFAFA";
  var textColor = colorTokens["text-primary"]?.["$value"] || "#111111";
  var textSecondary = colorTokens["text-secondary"]?.["$value"] || "#666666";
  var surfaceColor = colorTokens["surface"]?.["$value"] || "#FFFFFF";
  var borderColor = colorTokens["border"]?.["$value"] || "#E5E5E5";
  var fontDisplay = typo["font-family"]?.["display"]?.["$value"] || "Inter, system-ui, sans-serif";
  var fontBody = typo["font-family"]?.["body"]?.["$value"] || "Inter, system-ui, sans-serif";
  var hasDark = darkTokens !== null;

  // Build color swatches HTML
  var colorSwatches = "";
  for (var ck of Object.keys(colorTokens)) {
    if (ck.startsWith("$")) continue;
    var cv = colorTokens[ck];
    if (!cv || !cv["$value"]) continue;
    var hex = cv["$value"];
    var crWhite = getContrastRatio(hex, "#FFFFFF");
    var crBlack = getContrastRatio(hex, "#000000");
    var gradeWhite = contrastGrade(crWhite);
    var gradeBlack = contrastGrade(crBlack);
    var textOnSwatch = crWhite > crBlack ? "#FFFFFF" : "#000000";
    colorSwatches += '<div class="swatch"><div class="swatch-fill" style="background:' + hex + ';color:' + textOnSwatch + '"><span class="swatch-hex">' + hex + '</span></div><div class="swatch-info"><div class="swatch-name">' + ck + '</div><div class="swatch-var">--' + systemId + '-color-' + ck + '</div><div class="swatch-contrast"><span class="badge badge-' + gradeWhite.toLowerCase().replace("-", "") + '">⬜ ' + crWhite + ':1 ' + gradeWhite + '</span><span class="badge badge-' + gradeBlack.toLowerCase().replace("-", "") + '">⬛ ' + crBlack + ':1 ' + gradeBlack + '</span></div></div></div>';
  }

  // Dark color swatches
  var darkSwatches = "";
  if (hasDark) {
    for (var dk of Object.keys(darkTokens!)) {
      if (dk.startsWith("$")) continue;
      var dv = darkTokens![dk];
      if (!dv || !dv["$value"]) continue;
      var dhex = dv["$value"];
      var dcrW = getContrastRatio(dhex, "#FFFFFF");
      var dcrB = getContrastRatio(dhex, "#000000");
      var dgW = contrastGrade(dcrW);
      var dgB = contrastGrade(dcrB);
      var dtxt = dcrW > dcrB ? "#FFFFFF" : "#000000";
      darkSwatches += '<div class="swatch"><div class="swatch-fill" style="background:' + dhex + ';color:' + dtxt + '"><span class="swatch-hex">' + dhex + '</span></div><div class="swatch-info"><div class="swatch-name">' + dk + '</div><div class="swatch-var">--' + systemId + '-color-dark-' + dk + '</div><div class="swatch-contrast"><span class="badge badge-' + dgW.toLowerCase().replace("-","") + '">⬜ ' + dcrW + ':1 ' + dgW + '</span><span class="badge badge-' + dgB.toLowerCase().replace("-","") + '">⬛ ' + dcrB + ':1 ' + dgB + '</span></div></div></div>';
    }
  }

  // Typography specimens
  var typoHTML = "";
  var fontSizes = typo["font-size"] || {};
  for (var tk of Object.keys(fontSizes)) {
    if (tk.startsWith("$")) continue;
    var tv = fontSizes[tk];
    if (!tv || !tv["$value"]) continue;
    typoHTML += '<div class="type-specimen"><div class="type-sample" style="font-size:' + tv["$value"] + ';font-family:' + fontDisplay + '">The quick brown fox</div><div class="type-meta"><span class="type-name">' + tk + '</span><span class="type-value">' + tv["$value"] + '</span><span class="type-var">--' + systemId + '-typography-font-size-' + tk + '</span></div></div>';
  }

  // Font weight specimens
  var weightHTML = "";
  var fontWeights = typo["font-weight"] || {};
  for (var wk of Object.keys(fontWeights)) {
    if (wk.startsWith("$")) continue;
    var wv = fontWeights[wk];
    if (!wv || !wv["$value"]) continue;
    weightHTML += '<div class="weight-specimen" style="font-weight:' + wv["$value"] + ';font-family:' + fontBody + '">' + wk + ' (' + wv["$value"] + ')</div>';
  }

  // Spacing scale
  var spacingHTML = "";
  for (var sk of Object.keys(spacing)) {
    if (sk.startsWith("$")) continue;
    var sv = spacing[sk];
    if (!sv || !sv["$value"]) continue;
    var px = parseInt(sv["$value"]);
    spacingHTML += '<div class="space-row"><div class="space-label">' + sk + '</div><div class="space-bar" style="width:' + Math.min(px, 400) + 'px"></div><div class="space-value">' + sv["$value"] + '</div></div>';
  }

  // Radius preview
  var radiusHTML = "";
  for (var rk of Object.keys(radius)) {
    if (rk.startsWith("$")) continue;
    var rv = radius[rk];
    if (!rv || !rv["$value"]) continue;
    radiusHTML += '<div class="radius-item"><div class="radius-box" style="border-radius:' + rv["$value"] + '"></div><div class="radius-label">' + rk + '<br><span>' + rv["$value"] + '</span></div></div>';
  }

  // Elevation preview
  var elevationHTML = "";
  for (var ek of Object.keys(elevation)) {
    if (ek.startsWith("$")) continue;
    var ev = elevation[ek];
    if (!ev) continue;
    var shadowVal = ev["$value"] || "";
    elevationHTML += '<div class="elevation-card" style="box-shadow:' + shadowVal + '"><div class="elevation-label">' + ek + '</div></div>';
  }

  // Motion preview
  var motionHTML = "";
  var durations = motion["duration"] || {};
  var easings = motion["easing"] || {};
  for (var mk of Object.keys(easings)) {
    if (mk.startsWith("$")) continue;
    var mv = easings[mk];
    if (!mv || !mv["$value"]) continue;
    var dur = durations["normal"]?.["$value"] || "300ms";
    motionHTML += '<div class="motion-row"><div class="motion-label">' + mk + '<br><span>' + mv["$value"] + '</span></div><div class="motion-track"><div class="motion-dot" style="transition:transform ' + dur + ' ' + mv["$value"] + '"></div></div></div>';
  }

  // CSS variables block
  var cssBlock = tokensToCSSByGroup(tokens, systemId).replace(/</g, "&lt;").replace(/>/g, "&gt;");

  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>' + systemName + ' Design System</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>';

  html += '*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}';
  html += 'html{scroll-behavior:smooth;overflow-x:hidden}';
  html += 'body{font-family:' + fontBody + ';font-size:16px;line-height:1.6;color:' + textColor + ';background:' + bgColor + '}';
  html += '.container{max-width:1100px;margin:0 auto;padding:0 clamp(16px,4vw,32px)}';

  // Header
  html += '.header{padding:clamp(48px,8vw,96px) 0 clamp(32px,4vw,48px);border-bottom:1px solid ' + borderColor + '}';
  html += '.header h1{font-family:' + fontDisplay + ';font-size:clamp(32px,5vw,56px);font-weight:800;letter-spacing:-0.03em;line-height:1.1;margin-bottom:12px}';
  html += '.header h1 .accent{color:' + primaryColor + '}';
  html += '.header .subtitle{font-size:18px;color:' + textSecondary + ';max-width:600px}';
  html += '.header .meta{font-size:13px;color:' + textSecondary + ';margin-top:16px;display:flex;gap:24px;flex-wrap:wrap;align-items:center}';
  html += '.header .meta a{color:' + primaryColor + ';text-decoration:none}';

  // Dark mode toggle
  html += '.toggle-btn{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:9999px;border:1px solid ' + borderColor + ';background:' + surfaceColor + ';font-size:13px;font-weight:600;cursor:pointer;color:' + textColor + ';transition:all 0.2s}';
  html += '.toggle-btn:hover{border-color:' + primaryColor + '}';

  // Section
  html += 'section{padding:clamp(40px,6vw,72px) 0}';
  html += 'section+section{border-top:1px solid ' + borderColor + '}';
  html += 'h2{font-family:' + fontDisplay + ';font-size:clamp(22px,3vw,30px);font-weight:700;letter-spacing:-0.02em;margin-bottom:clamp(20px,3vw,32px);color:' + textColor + '}';
  html += 'h3{font-size:18px;font-weight:600;margin-bottom:16px;margin-top:32px;color:' + textColor + '}';

  // Swatches
  html += '.swatch-grid{display:flex;flex-wrap:wrap;gap:16px}';
  html += '.swatch{width:160px;border-radius:12px;overflow:hidden;border:1px solid ' + borderColor + ';background:' + surfaceColor + '}';
  html += '.swatch-fill{height:80px;display:flex;align-items:flex-end;padding:8px 12px}';
  html += '.swatch-hex{font-family:ui-monospace,monospace;font-size:13px;font-weight:600}';
  html += '.swatch-info{padding:10px 12px}';
  html += '.swatch-name{font-size:14px;font-weight:600;margin-bottom:2px}';
  html += '.swatch-var{font-family:ui-monospace,monospace;font-size:11px;color:' + textSecondary + ';margin-bottom:6px;word-break:break-all}';
  html += '.swatch-contrast{display:flex;gap:6px;flex-wrap:wrap}';
  html += '.badge{font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap}';
  html += '.badge-aaa{background:#22C55E20;color:#16A34A}';
  html += '.badge-aa{background:#F59E0B20;color:#D97706}';
  html += '.badge-aalg{background:#F59E0B20;color:#D97706}';
  html += '.badge-fail{background:#EF444420;color:#DC2626}';

  // Typography
  html += '.type-specimen{margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid ' + borderColor + '}';
  html += '.type-sample{margin-bottom:8px;color:' + textColor + '}';
  html += '.type-meta{display:flex;gap:16px;align-items:center;flex-wrap:wrap}';
  html += '.type-name{font-size:14px;font-weight:600;color:' + primaryColor + '}';
  html += '.type-value{font-family:ui-monospace,monospace;font-size:13px;color:' + textSecondary + '}';
  html += '.type-var{font-family:ui-monospace,monospace;font-size:11px;color:' + textSecondary + '}';
  html += '.weight-grid{display:flex;flex-wrap:wrap;gap:24px;margin-top:16px}';
  html += '.weight-specimen{font-size:20px;color:' + textColor + '}';

  // Spacing
  html += '.space-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}';
  html += '.space-label{font-family:ui-monospace,monospace;font-size:13px;font-weight:600;width:40px;text-align:right;color:' + textSecondary + '}';
  html += '.space-bar{height:16px;background:' + primaryColor + '20;border-left:3px solid ' + primaryColor + ';border-radius:0 4px 4px 0;min-width:2px}';
  html += '.space-value{font-family:ui-monospace,monospace;font-size:12px;color:' + textSecondary + '}';

  // Radius
  html += '.radius-grid{display:flex;flex-wrap:wrap;gap:24px}';
  html += '.radius-item{text-align:center}';
  html += '.radius-box{width:72px;height:72px;background:' + primaryColor + '15;border:2px solid ' + primaryColor + '}';
  html += '.radius-label{font-size:13px;font-weight:600;margin-top:8px;color:' + textColor + '}';
  html += '.radius-label span{font-weight:400;color:' + textSecondary + ';font-family:ui-monospace,monospace;font-size:12px}';

  // Elevation
  html += '.elevation-grid{display:flex;flex-wrap:wrap;gap:32px}';
  html += '.elevation-card{width:120px;height:80px;background:' + surfaceColor + ';border-radius:12px;display:flex;align-items:center;justify-content:center}';
  html += '.elevation-label{font-size:14px;font-weight:600;color:' + textColor + '}';

  // Motion
  html += '.motion-row{display:flex;align-items:center;gap:16px;margin-bottom:16px}';
  html += '.motion-label{font-size:13px;font-weight:600;width:100px;color:' + textColor + '}';
  html += '.motion-label span{font-weight:400;color:' + textSecondary + ';font-size:11px;font-family:ui-monospace,monospace}';
  html += '.motion-track{flex:1;height:32px;background:' + primaryColor + '08;border-radius:16px;position:relative;overflow:hidden}';
  html += '.motion-dot{width:32px;height:32px;background:' + primaryColor + ';border-radius:50%;position:absolute;left:0;top:0}';
  html += '.motion-row:hover .motion-dot{transform:translateX(calc(100% + 200px))}';

  // Code block
  html += '.code-block{position:relative;background:#1a1a2e;border-radius:12px;padding:24px;margin-top:24px;overflow-x:auto}';
  html += '.code-block pre{font-family:ui-monospace,monospace;font-size:13px;line-height:1.7;color:#e0e0e0;white-space:pre;margin:0}';
  html += '.copy-btn{position:absolute;top:12px;right:12px;padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#ccc;font-size:12px;font-weight:600;cursor:pointer}';
  html += '.copy-btn:hover{background:rgba(255,255,255,0.12)}';

  // Print
  html += '@media print{.toggle-btn,.copy-btn{display:none}.motion-dot{display:none}body{background:#fff}}';

  // Responsive
  html += '@media(max-width:768px){.swatch{width:140px}.swatch-grid{gap:12px}.elevation-grid{gap:16px}.elevation-card{width:100px;height:64px}}';
  html += '@media(max-width:480px){.swatch{width:100%}.radius-grid{gap:16px}}';

  html += '</style></head><body><div class="container">';

  // Header
  html += '<header class="header"><h1>' + systemName + ' <span class="accent">Design System</span></h1>';
  html += '<p class="subtitle">Complete design token set with colors, typography, spacing, radius, elevation, and motion.</p>';
  html += '<div class="meta"><span>Generated ' + new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) + '</span><a href="https://ravenmcp.ai" target="_blank">Built with Raven MCP</a>';
  if (hasDark) html += '<button class="toggle-btn" id="darkToggle" onclick="toggleDark()">🌙 Dark Mode</button>';
  html += '</div></header>';

  // Colors
  html += '<section><h2>Color Palette</h2><div class="swatch-grid">' + colorSwatches + '</div>';
  if (hasDark) html += '<h3>Dark Mode Colors</h3><div class="swatch-grid">' + darkSwatches + '</div>';
  html += '</section>';

  // Typography
  html += '<section><h2>Typography Scale</h2>' + typoHTML;
  if (weightHTML) html += '<h3>Font Weights</h3><div class="weight-grid">' + weightHTML + '</div>';
  html += '</section>';

  // Spacing
  if (spacingHTML) html += '<section><h2>Spacing Scale</h2>' + spacingHTML + '</section>';

  // Radius
  if (radiusHTML) html += '<section><h2>Border Radius</h2><div class="radius-grid">' + radiusHTML + '</div></section>';

  // Elevation
  if (elevationHTML) html += '<section><h2>Elevation</h2><div class="elevation-grid">' + elevationHTML + '</div></section>';

  // Motion
  if (motionHTML) html += '<section><h2>Motion &amp; Easing</h2><p style="font-size:14px;color:' + textSecondary + ';margin-bottom:24px">Hover each row to preview the easing curve.</p>' + motionHTML + '</section>';

  // Code
  html += '<section><h2>CSS Variables</h2><p style="margin-bottom:8px;color:' + textSecondary + '">Copy these into your stylesheet to use the full token set.</p>';
  html += '<div class="code-block"><button class="copy-btn" onclick="copyCSS()">Copy</button><pre id="cssCode">' + cssBlock + '</pre></div></section>';

  // Footer
  html += '<footer style="padding:48px 0 64px;text-align:center;font-size:13px;color:' + textSecondary + '"><p>' + systemName + ' Design System &middot; Generated by <a href="https://ravenmcp.ai" style="color:' + primaryColor + ';text-decoration:none">Raven MCP</a></p></footer>';

  html += '</div>';

  // Dark mode JS
  if (hasDark) {
    html += '<script>var isDark=false;function toggleDark(){isDark=!isDark;document.body.style.background=isDark?"' + (darkTokens!["background"]?.["$value"] || "#111") + '":"' + bgColor + '";document.body.style.color=isDark?"' + (darkTokens!["text-primary"]?.["$value"] || "#eee") + '":"' + textColor + '";document.getElementById("darkToggle").textContent=isDark?"☀️ Light Mode":"🌙 Dark Mode"}</script>';
  }

  // Copy JS
  html += '<script>function copyCSS(){var t=document.getElementById("cssCode").textContent;navigator.clipboard.writeText(t).then(function(){var b=document.querySelector(".copy-btn");b.textContent="Copied!";setTimeout(function(){b.textContent="Copy"},2000)})}</script>';

  html += '</body></html>';
  return html;
}

// ── Figma Variables export ─────────────────────────────────────────

function tokensToFigmaVariables(tokens: any, systemName: string): any {
  var variables: any[] = [];
  var hasDark = !!tokens["color-dark"];
  var modes = [{ name: "Light" }];
  if (hasDark) modes.push({ name: "Dark" });

  // Process color tokens
  var colorTokens = tokens["color"] || {};
  var darkTokens = tokens["color-dark"] || {};
  for (var ck of Object.keys(colorTokens)) {
    if (ck.startsWith("$")) continue;
    var cv = colorTokens[ck];
    if (!cv || !cv["$value"]) continue;
    var v: any = { name: "color/" + ck, type: "COLOR", valuesByMode: { Light: hexToRGBNormalized(cv["$value"]) } };
    if (hasDark && darkTokens[ck]?.["$value"]) {
      v.valuesByMode.Dark = hexToRGBNormalized(darkTokens[ck]["$value"]);
    }
    variables.push(v);
  }

  // Process dimension tokens (spacing, radius)
  for (var group of ["spacing", "radius"]) {
    var grp = tokens[group] || {};
    for (var gk of Object.keys(grp)) {
      if (gk.startsWith("$")) continue;
      var gv = grp[gk];
      if (!gv || !gv["$value"]) continue;
      var px = parseFloat(gv["$value"]);
      if (isNaN(px)) continue;
      variables.push({ name: group + "/" + gk, type: "FLOAT", valuesByMode: { Light: px } });
    }
  }

  // Process typography font-size
  var fontSize = tokens["typography"]?.["font-size"] || {};
  for (var fk of Object.keys(fontSize)) {
    if (fk.startsWith("$")) continue;
    var fv = fontSize[fk];
    if (!fv || !fv["$value"]) continue;
    var fpx = parseFloat(fv["$value"]);
    if (isNaN(fpx)) continue;
    variables.push({ name: "typography/font-size/" + fk, type: "FLOAT", valuesByMode: { Light: fpx } });
  }

  return {
    variableCollections: [{
      name: systemName,
      modes: modes,
      variables: variables
    }]
  };
}

// ── SVG palette card ───────────────────────────────────────────────

function tokensToSVGPalette(tokens: any, systemName: string): string {
  var colorTokens = tokens["color"] || {};
  var colors: Array<{ name: string; hex: string }> = [];
  for (var ck of Object.keys(colorTokens)) {
    if (ck.startsWith("$")) continue;
    var cv = colorTokens[ck];
    if (!cv || !cv["$value"]) continue;
    colors.push({ name: ck, hex: cv["$value"] });
  }

  var cols = 5;
  var rows = Math.ceil(colors.length / cols);
  var swatchW = 120;
  var swatchH = 80;
  var gap = 8;
  var padding = 32;
  var headerH = 60;
  var svgW = padding * 2 + cols * swatchW + (cols - 1) * gap;
  var svgH = padding + headerH + rows * (swatchH + 28) + (rows - 1) * gap + padding;

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgW + ' ' + svgH + '" width="' + svgW + '" height="' + svgH + '">';
  svg += '<rect width="100%" height="100%" fill="#FFFFFF" rx="16"/>';
  svg += '<text x="' + padding + '" y="' + (padding + 24) + '" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="700" fill="#111">' + systemName + ' — Color Palette</text>';
  svg += '<text x="' + padding + '" y="' + (padding + 44) + '" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#888">Generated by Raven MCP</text>';

  for (var i = 0; i < colors.length; i++) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    var x = padding + col * (swatchW + gap);
    var y = padding + headerH + row * (swatchH + 28 + gap);
    var c = colors[i];
    var crW = getContrastRatio(c.hex, "#FFFFFF");
    var crB = getContrastRatio(c.hex, "#000000");
    var txtC = crW > crB ? "#FFFFFF" : "#000000";
    svg += '<rect x="' + x + '" y="' + y + '" width="' + swatchW + '" height="' + swatchH + '" rx="8" fill="' + c.hex + '"/>';
    svg += '<text x="' + (x + 8) + '" y="' + (y + swatchH - 10) + '" font-family="ui-monospace, monospace" font-size="11" font-weight="600" fill="' + txtC + '">' + c.hex + '</text>';
    svg += '<text x="' + (x + 2) + '" y="' + (y + swatchH + 16) + '" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="600" fill="#333">' + c.name + '</text>';
  }

  svg += '</svg>';
  return svg;
}

// ── Tool 13: generate_design_system ─────────────────────────────────

server.tool(
  "generate_design_system",
  "Generate a complete, custom design system with full token set. Provide a brand color to auto-generate a harmonious palette, pick a style preset, and export as visual HTML documentation, CSS variables, W3C DTCG JSON, Figma Variables, or SVG palette card. The HTML export is a beautiful, self-contained page suitable for sharing with stakeholders.",
  {
    name: z.string().describe("Name for the design system (e.g. 'Acme Corp', 'NightOwl')"),
    base_system: z.string().optional().describe("Start from an existing system as foundation (e.g. 'stripe', 'linear'). Colors will be replaced by brand_color if provided."),
    brand_color: z.string().optional().describe("Primary brand hex color (e.g. '#FF6B35'). Auto-generates a full harmonious palette using color theory."),
    style: z.enum(["minimal", "bold", "warm", "corporate", "playful", "dark"]).optional().describe("Aesthetic direction — influences spacing, radii, shadows, motion, and typography. Default: minimal"),
    dark_mode: z.boolean().optional().describe("Generate dark mode tokens alongside light. Default: true"),
    format: z.enum(["html", "css", "dtcg", "figma", "svg", "all"]).optional().describe("Export format: html (visual doc page), css (custom properties), dtcg (W3C JSON), figma (Figma Variables JSON), svg (color palette card), all. Default: html")
  },
  async function(params: { name: string; base_system?: string; brand_color?: string; style?: string; dark_mode?: boolean; format?: string }) {
    var tokens = generateTokenSet({
      name: params.name,
      base_system: params.base_system,
      brand_color: params.brand_color,
      style: params.style,
      dark_mode: params.dark_mode
    });

    var fmt = params.format || "html";
    var systemId = params.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    var output: string;

    if (fmt === "css") {
      output = tokensToCSSByGroup(tokens, systemId);
    } else if (fmt === "dtcg") {
      output = JSON.stringify(tokens, null, 2);
    } else if (fmt === "html") {
      output = tokensToHTML(tokens, params.name);
    } else if (fmt === "figma") {
      output = JSON.stringify(tokensToFigmaVariables(tokens, params.name), null, 2);
    } else if (fmt === "svg") {
      output = tokensToSVGPalette(tokens, params.name);
    } else if (fmt === "all") {
      var all = {
        html: tokensToHTML(tokens, params.name),
        css: tokensToCSSByGroup(tokens, systemId),
        dtcg: tokens,
        figma: tokensToFigmaVariables(tokens, params.name),
        svg: tokensToSVGPalette(tokens, params.name)
      };
      output = JSON.stringify(all, null, 2);
    } else {
      output = tokensToHTML(tokens, params.name);
    }

    return {
      content: [{
        type: "text" as const,
        text: output
      }]
    };
  }
);

// ── Tool 14: audit_layout ──────────────────────────────────────────
//
// Evaluates visual rhythm from *rendered* geometry — the things audit_page
// can't see from source alone: alignment, gap consistency across siblings,
// and horizontal optical balance. Stateless: caller runs a snippet in
// DevTools (or a headless browser) to collect bounding rects, then passes
// them back here for scoring.

server.tool(
  "audit_layout",
  "Evaluate visual rhythm from a rendered page's geometry. Call with no arguments to get a DevTools snippet to paste into your page — it prints {elements, viewport} JSON. Call again with that JSON to get alignment, gap-rhythm, and optical-balance scores. This is the complement to audit_page for things only visible once rendered.",
  {
    elements: z.array(z.object({
      selector: z.string(),
      rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
      computed: z.object({
        padding: z.string().optional(),
        margin: z.string().optional(),
        gap: z.string().optional(),
        fontSize: z.string().optional(),
        color: z.string().optional(),
        background: z.string().optional()
      }).optional()
    })).optional().describe("Array of element rects captured from the rendered page via the DevTools snippet"),
    viewport: z.object({ w: z.number(), h: z.number() }).optional().describe("Viewport dimensions {w,h} at capture time")
  },
  async ({ elements, viewport }) => {
    if (!elements || !viewport) {
      var snippet = "// Paste into DevTools console on the page you want to audit.\n" +
        "// Copies {elements, viewport} JSON to clipboard — pass it back to audit_layout.\n" +
        "(() => {\n" +
        "  const pick = el => {\n" +
        "    const r = el.getBoundingClientRect();\n" +
        "    const cs = getComputedStyle(el);\n" +
        "    const cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';\n" +
        "    const sel = el.id ? '#' + el.id : el.tagName.toLowerCase() + (cls ? '.' + cls : '');\n" +
        "    return {\n" +
        "      selector: sel,\n" +
        "      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },\n" +
        "      computed: { padding: cs.padding, margin: cs.margin, gap: cs.gap, fontSize: cs.fontSize, color: cs.color, background: cs.backgroundColor }\n" +
        "    };\n" +
        "  };\n" +
        "  const all = [...document.querySelectorAll('body *')]\n" +
        "    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.width < 4000 && r.height < 4000; })\n" +
        "    .slice(0, 400)\n" +
        "    .map(pick);\n" +
        "  const out = { elements: all, viewport: { w: innerWidth, h: innerHeight } };\n" +
        "  try { copy(JSON.stringify(out)); console.log('✓ copied to clipboard — ' + all.length + ' elements'); } catch (_) { console.log(JSON.stringify(out)); }\n" +
        "  return out;\n" +
        "})();";
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            instructions: "Paste the snippet below into DevTools console on your rendered page. It copies a {elements, viewport} JSON blob to your clipboard. Call audit_layout again with that JSON as arguments.",
            snippet: snippet,
            example_call: "audit_layout({ elements: [...], viewport: { w: 1440, h: 900 } })"
          }, null, 2)
        }]
      };
    }

    var rects = elements.map(function(e) { return e.rect; });

    // ── Alignment: cluster left edges (x) within 2px
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

    // ── Gap rhythm: vertical gaps between horizontally-overlapping siblings
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

    // ── Optical balance: visual weight (area) left vs right of content-bounds midline
    // Measure relative to content's own bounding box, not the viewport — otherwise any
    // intentionally left-anchored content column on a wide viewport registers as "skewed."
    var contentMinX = Infinity, contentMaxX = -Infinity;
    for (var rb of rects) {
      if (rb.x < contentMinX) contentMinX = rb.x;
      if (rb.x + rb.w > contentMaxX) contentMaxX = rb.x + rb.w;
    }
    var contentMid = (contentMinX + contentMaxX) / 2;
    var contentHalfWidth = (contentMaxX - contentMinX) / 2;
    // Torque = area × distance from midline. Normalized against the maximum possible
    // net torque (if all mass were at one extreme edge) so that perfectly centered
    // elements contribute 0 and the score reflects actual imbalance fraction.
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
      if (gapCV <= 0.5) {
        findings.push({ check: "gap-rhythm", status: "pass", message: "Vertical gaps are consistent (median " + Math.round(gapMedian) + "px, CV " + gapCV.toFixed(2) + " across " + vGaps.length + " pairs)" });
      } else {
        findings.push({ check: "gap-rhythm", status: "warn", message: "Inconsistent vertical rhythm — gap coefficient of variation " + gapCV.toFixed(2) + " (median " + Math.round(gapMedian) + "px, σ " + Math.round(gapStdev) + "px across " + vGaps.length + " pairs)", fix: "Siblings should share one gap value. Move spacing from per-child margin-top/bottom to a single gap: on the parent flex/grid container." });
      }
    } else {
      findings.push({ check: "gap-rhythm", status: "pass", message: "Not enough vertical sibling pairs to score (" + vGaps.length + " found)" });
    }

    if (balanceSkew <= 0.2) {
      findings.push({ check: "optical-balance", status: "pass", message: "Horizontal weight is balanced (skew " + Math.round(balanceSkew * 100) + "%)" });
    } else {
      findings.push({ check: "optical-balance", status: "warn", message: "Layout is " + (leftWeight > rightWeight ? "left-heavy" : "right-heavy") + " — visual weight skewed by " + Math.round(balanceSkew * 100) + "%", fix: balanceSkew > 0.4 ? "Redistribute dense blocks (images, tables) toward center, or add counterweight on the lighter side." : "Minor imbalance — review whether it's intentional asymmetry or accidental." });
    }

    var orphanStretch = detectOrphanStretch(elements);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          elements_analyzed: rects.length,
          viewport: viewport,
          findings: findings,
          metrics: {
            alignment: { total_columns: colCounts.size, shared_columns: sharedCols, singleton_columns: singletonCols, aligned_ratio: Number(alignmentRatio.toFixed(2)) },
            gap_rhythm: vGaps.length >= 3 ? { samples: vGaps.length, median_px: Math.round(gapMedian), stdev_px: Math.round(gapStdev), coef_variation: Number(gapCV.toFixed(2)) } : { samples: vGaps.length, note: "not enough horizontally-overlapping vertical sibling pairs" },
            balance: { left_weight: Math.round(leftWeight), right_weight: Math.round(rightWeight), skew_pct: Math.round(balanceSkew * 100) }
          },
          orphan_stretch: orphanStretch
        }, null, 2)
      }]
    };
  }
);

// ════════════════════════════════════════════════════════════════════
// iOS / SwiftUI audit suite (HIG-graded). Purely additive — the web tools
// above are untouched, and none of the web-only rules (lang/title/flex-wrap/
// clamp/max-width/custom-properties/bare-hex) run on iOS input.
// ════════════════════════════════════════════════════════════════════

// Default point sizes for SwiftUI semantic text styles at the standard
// Dynamic Type content size (UIContentSizeCategory.large). Used to flag
// semantic fonts that sit below a comfortable reading floor (~13pt).
var IOS_SEMANTIC_FONT_PT: Record<string, number> = {
  largeTitle: 34, title: 28, title2: 22, title3: 20, headline: 17,
  body: 17, callout: 16, subheadline: 15, footnote: 13, caption: 12, caption2: 11
};

// Light-mode effective hex for common iOS semantic colors (alpha flattened
// over white). secondaryLabel / tertiaryLabel / quaternaryLabel are platform
// standard — Apple ships them, so audit_ios_screen warns rather than hard-
// failing when their contrast dips below WCAG AA.
var IOS_SEMANTIC_COLORS: Record<string, { hex: string; secondary?: boolean }> = {
  label: { hex: "#000000" },
  secondarylabel: { hex: "#8A8A8E", secondary: true },
  tertiarylabel: { hex: "#C4C4C7", secondary: true },
  quaternarylabel: { hex: "#D6D6DA", secondary: true },
  placeholdertext: { hex: "#C4C4C7", secondary: true },
  systembackground: { hex: "#FFFFFF" },
  secondarysystembackground: { hex: "#F2F2F7" },
  tertiarysystembackground: { hex: "#FFFFFF" },
  systemgroupedbackground: { hex: "#F2F2F7" },
  secondarysystemgroupedbackground: { hex: "#FFFFFF" },
  tertiarysystemgroupedbackground: { hex: "#F2F2F7" },
  white: { hex: "#FFFFFF" },
  black: { hex: "#000000" }
};

// Resolve a color field (hex like "#1c1c1e", "rgb(...)", or an iOS semantic
// name like "secondaryLabel") to an effective light-mode hex. Returns null
// when it can't be resolved (then contrast is skipped for that element).
function resolveIosColor(raw: string): { hex: string | null; secondary: boolean } {
  if (!raw || typeof raw !== "string") return { hex: null, secondary: false };
  var c = raw.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return { hex: c, secondary: false };
  var rgbm = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbm) return { hex: rgbToHex(parseInt(rgbm[1]), parseInt(rgbm[2]), parseInt(rgbm[3])), secondary: false };
  var key = c.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (IOS_SEMANTIC_COLORS[key]) return { hex: IOS_SEMANTIC_COLORS[key].hex, secondary: !!IOS_SEMANTIC_COLORS[key].secondary };
  return { hex: null, secondary: false };
}

// Material 3 light-scheme roles → effective hex. onSurfaceVariant / outline are
// the Android analog of iOS secondaryLabel: Material ships them for de-emphasized
// text, so audit_screen({platform:"android"}) warns rather than hard-failing when
// their contrast dips below WCAG AA.
var ANDROID_SEMANTIC_COLORS: Record<string, { hex: string; secondary?: boolean }> = {
  onsurface: { hex: "#1C1B1F" },
  onsurfacevariant: { hex: "#49454F", secondary: true },
  outline: { hex: "#79747E", secondary: true },
  outlinevariant: { hex: "#CAC4D0", secondary: true },
  surface: { hex: "#FFFBFE" },
  surfacevariant: { hex: "#E7E0EC" },
  background: { hex: "#FFFBFE" },
  onbackground: { hex: "#1C1B1F" },
  white: { hex: "#FFFFFF" },
  black: { hex: "#000000" }
};

// Platform-aware color resolver. For Android, Material semantic role names take
// precedence; everything else (hex, rgb()) falls through to the shared resolver.
function resolveScreenColor(raw: string, platform: string): { hex: string | null; secondary: boolean } {
  if (platform === "android" && raw && typeof raw === "string") {
    var akey = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (ANDROID_SEMANTIC_COLORS[akey]) return { hex: ANDROID_SEMANTIC_COLORS[akey].hex, secondary: !!ANDROID_SEMANTIC_COLORS[akey].secondary };
  }
  return resolveIosColor(raw);
}

// HIG-specific principles returned by get_principles({platform:"ios"}) — these
// replace the web/CSS principle matcher entirely so no web artifacts leak in.
var IOS_HIG_PRINCIPLES = [
  { id: "hig-dynamic-type", name: "Dynamic Type", summary: "Use semantic text styles (.body, .headline…) so text scales with the user's chosen size and accessibility sizes.", verify: ["No hardcoded .font(.system(size:)) for body/label text", "Layout survives the largest accessibility text size", "Avoid .caption2/.caption (≈11–12pt) for anything the user must read"] },
  { id: "hig-touch-targets", name: "44pt hit targets", summary: "Every tappable control is at least 44×44 pt, even if its glyph is smaller.", verify: ["Buttons, icons-as-buttons, list affordances ≥ 44×44pt", "Use padding/contentShape to grow the hit area, not just the glyph"] },
  { id: "hig-sf-symbols", name: "SF Symbols", summary: "Prefer SF Symbols for iconography; they align to the text baseline and scale with Dynamic Type.", verify: ["Icons use Image(systemName:)/Label(_, systemImage:)", "Symbol weight/scale matches adjacent text", "Custom icons supplied as symbol images where possible"] },
  { id: "hig-navigation", name: "Navigation & tab bars", summary: "Use standard NavigationStack and a TabView with 2–5 clearly-labelled destinations; don't reinvent system chrome.", verify: ["Tab bar has 2–5 items, each with a symbol + title", "Large titles used where they aid orientation", "Back navigation behaves like the system default"] },
  { id: "hig-safe-areas", name: "Safe areas", summary: "Respect safe areas so content never hides under the notch, Dynamic Island, status bar, or home indicator.", verify: ["Backgrounds may bleed edge-to-edge, but interactive/legible content stays inside the safe area", ".ignoresSafeArea() is scoped to decorative layers only", "Use .safeAreaInset for bars pinned to edges"] },
  { id: "hig-dark-mode", name: "Dark-mode parity", summary: "Source every color from the asset catalog or a semantic system color so the UI adapts to light and dark automatically.", verify: ["No hardcoded Color(red:green:blue:)/hex for surfaces and text", "AccentColor.colorset is defined for both appearances", "Verified visually in both light and dark"] },
  { id: "hig-haptics", name: "Haptics", summary: "Use UIFeedbackGenerator haptics to confirm meaningful state changes — sparingly and consistently.", verify: ["Success/selection/impact haptics map to real events", "No haptics on routine scrolling or every tap"] },
  { id: "hig-privacy", name: "Privacy & App Review", summary: "Be honest and specific about data use; never send personal data off-device by default without disclosing it at the point of choice.", verify: ["Each NS*UsageDescription is specific and matches actual behavior", "A pre-selected/'Recommended' option doesn't silently transmit personal data (App Review §5.1.1)", "No API keys/secrets in Info.plist or source — use the Keychain"] },
  { id: "hig-accessibility", name: "VoiceOver & motion", summary: "Provide accessibility labels and honor Reduce Motion / Increase Contrast.", verify: ["Interactive and image elements have .accessibilityLabel", "Decorative imagery is hidden from VoiceOver", "Animations respect Reduce Motion"] }
];

// HIG-specific pre-publish checklist returned by get_checklist({platform:"ios"}).
var IOS_HIG_CHECKLIST = [
  "All text uses Dynamic Type (semantic fonts) and stays legible at the largest accessibility size?",
  "No body/label text below ~13pt (avoid .caption2/.caption for must-read content)?",
  "Every tappable control is at least 44×44 pt (grow the hit area, not just the glyph)?",
  "Icons use SF Symbols with weight/scale matched to adjacent text?",
  "Tab bar has 2–5 destinations, each with a symbol and a label?",
  "Navigation uses standard NavigationStack / large titles where appropriate?",
  "Content respects safe areas — nothing clipped under the notch, Dynamic Island, or home indicator?",
  "Every color comes from the asset catalog or a semantic system color, verified in BOTH light and dark?",
  "AccentColor.colorset is defined (with color components) for light and dark?",
  "Haptics fire on meaningful state changes only, via UIFeedbackGenerator?",
  "VoiceOver labels on all interactive/image elements; Reduce Motion honored?",
  "Every Info.plist NS*UsageDescription is specific and matches what the code actually does?",
  "No default option silently sends personal data off-device — egress is disclosed at the point of choice (App Review §5.1.1)?",
  "No secrets/API keys shipped in Info.plist or source (keys live in the Keychain)?"
];

// Shared light-weight plist parser: pulls <key>→<string|true|false> pairs.
// Good enough for usage strings, ATS flags, and secret-shaped keys without a
// full XML dependency.
function parsePlistKeys(xml: string): Record<string, string> {
  var out: Record<string, string> = {};
  var re = /<key>([^<]+)<\/key>\s*(?:<string>([\s\S]*?)<\/string>|<(true|false)\s*\/>)/g;
  var m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out[m[1]] = m[2] !== undefined ? m[2] : (m[3] || "");
  }
  return out;
}

// ── Mobile taste fidelity (LEG E) ──────────────────────────────────
//
// Apps have no live browser probe, so the mobile audits get design_notes
// verification through source-code presence checks (audit_swiftui/audit_rn)
// and pixel-derived screenshot traits (audit_screen/audit_ios_screen).
// Resolution is opt-in via a project hint and NEVER throws — a broken taste
// store must not break a plain HIG audit.
async function resolveMobileTaste(tasteStore: TasteStore, project?: string, profile?: string): Promise<{ profile: string; binding: SurfaceBinding } | null> {
  if (typeof project !== "string" || project.trim().length === 0) return null;
  try {
    var profileNames: string[];
    if (typeof profile === "string" && profile.trim().length > 0) {
      profileNames = [profile.trim()];
    } else {
      profileNames = (await listTasteProfiles(tasteStore)).map(function (p: any) { return p.name; });
    }
    for (var pn of profileNames) {
      try {
        var binding = await resolveSurfaceBinding(tasteStore, pn, { project: project });
        if (binding) return { profile: pn, binding: binding };
      } catch { /* skip unreadable profile */ }
    }
  } catch { /* taste store unavailable — audit proceeds without notes */ }
  return null;
}

// Runs the source-code layer for audit_swiftui / audit_rn: resolves the
// binding, assesses each design note against the source, and folds missing
// notes into the audit's issues (warn by default, error when a named library
// or branded loader is wholly absent) so they count toward score/grade the
// same way web fidelity findings count toward audit_taste's verdict.
async function applySourceTasteNotes(
  tasteStore: TasteStore,
  src: string,
  kind: MobileSourceKind,
  issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }>,
  project?: string,
  profile?: string
): Promise<{ profile: string; project: string; surface: string; note_assessments: NoteAssessment[] } | null> {
  var resolved = await resolveMobileTaste(tasteStore, project, profile);
  if (!resolved || Object.keys(resolved.binding.design_notes).length === 0) return null;
  var assessments = assessDesignNotesSource(resolved.binding.design_notes, src, kind);
  for (var ni of noteIssuesFromAssessments(resolved.binding.design_notes, assessments)) issues.push(ni);
  return { profile: resolved.profile, project: resolved.binding.project, surface: resolved.binding.surface, note_assessments: assessments };
}

// ── Tool 14b: audit_swiftui ────────────────────────────────────────
//
// Static-analyzes SwiftUI source against Apple HIG. Same return shape as
// audit_page (score/grade/passes/errors/warnings/fix_priority). Optionally
// takes the AccentColor.colorset Contents.json so it can flag an empty/
// undefined accent color — a real, ship-blocking bug.

server.tool(
  "audit_swiftui",
  "Audit SwiftUI source against Apple's Human Interface Guidelines. Flags hardcoded .font(.system(size:)) below ~13pt and tiny semantic fonts (.caption/.caption2), hardcoded Color(red:green:blue:)/hex instead of asset-catalog or semantic system colors, an empty/undefined AccentColor, interactive frames below 44×44pt, and ad-hoc spacing off the 4/8-pt grid. Rewards semantic Dynamic Type fonts, semantic system colors, SF Symbols, and flexible frames. iOS-native checks only — no web/CSS rules. Returns pass/fail per check with fix instructions.",
  {
    source: z.union([z.string(), z.array(z.string())]).describe("SwiftUI source — a single file/view as a string, or an array of file contents. Concatenated before analysis."),
    accent_color_contents: z.string().optional().describe("Optional raw Contents.json of AccentColor.colorset. When provided, the tool verifies AccentColor actually defines color components (flags an empty/undefined accent color as an error)."),
    strict: z.boolean().optional().describe("Strict mode — also count warnings as failures for grading. Default: false"),
    project: z.string().optional().describe("Project identifier — resolves a saved taste surface binding (see bind_taste_surface). When the binding carries design_notes, each note is verified against the source (animation/material/haptic/font APIs) and returned in note_assessments; missing notes count toward the grade."),
    profile: z.string().optional().describe("Taste profile owning the binding. Omit to search all stored profiles for one bound to the project.")
  },
  async ({ source, accent_color_contents, strict, project, profile }) => {
    var src = Array.isArray(source) ? source.join("\n") : source;
    var isStrict = strict || false;
    var issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }> = [];
    var passes: string[] = [];

    // ── Typography: hardcoded fixed sizes
    var sysFontRe = /\.font\(\s*\.system\(\s*size:\s*(\d+(?:\.\d+)?)/g;
    var fm: RegExpExecArray | null;
    var smallFixed: number[] = [];
    var fixedNonIcon: number[] = [];
    while ((fm = sysFontRe.exec(src)) !== null) {
      var size = parseFloat(fm[1]);
      // Is this fixed size attached to an icon? Icons commonly use fixed
      // point sizes — that's idiomatic, not a Dynamic Type violation.
      var ctx = src.slice(Math.max(0, fm.index - 160), fm.index);
      var isIcon = /Image\(\s*systemName:|Image\(\s*"/.test(ctx);
      if (size < 13) { if (!isIcon) smallFixed.push(size); }
      else if (!isIcon) fixedNonIcon.push(size);
    }
    if (smallFixed.length === 0) passes.push("No text below 13pt fixed size");
    else issues.push({ severity: "error", rule: "ios-typography/min-size", message: "Found " + smallFixed.length + " hardcoded font size(s) below 13pt: " + smallFixed.join(", ") + "pt", fix: "Raise to ≥13pt, and prefer a semantic style (.footnote, .subheadline, .body) so it scales with Dynamic Type." });
    if (fixedNonIcon.length > 0) {
      issues.push({ severity: "warning", rule: "ios-typography/dynamic-type", message: fixedNonIcon.length + " non-icon text element(s) use a fixed .system(size:) (" + fixedNonIcon.join(", ") + "pt) that won't scale with Dynamic Type", fix: "Use a semantic Font (.title, .headline, .body…) or .system(size:, relativeTo:) so the text honors the user's text-size setting." });
    }

    // ── Typography: tiny semantic styles (Dynamic-Type-aware but very small)
    var smallSemantic: string[] = [];
    var semanticUsed = new Set<string>();
    for (var styleName of Object.keys(IOS_SEMANTIC_FONT_PT)) {
      var styleRe = new RegExp("\\.font\\(\\s*\\." + styleName + "\\b", "g");
      if (styleRe.test(src)) {
        semanticUsed.add(styleName);
        if (IOS_SEMANTIC_FONT_PT[styleName] < 13) smallSemantic.push(styleName + " (≈" + IOS_SEMANTIC_FONT_PT[styleName] + "pt)");
      }
    }
    if (semanticUsed.size > 0) passes.push("Uses semantic Dynamic Type fonts (" + Array.from(semanticUsed).join(", ") + ")");
    if (smallSemantic.length > 0) {
      issues.push({ severity: "warning", rule: "ios-typography/small-semantic-font", message: "Uses very small semantic font(s) for visible text: " + smallSemantic.join(", ") + ". These scale with Dynamic Type but start below the ~13pt comfort floor.", fix: "Reserve .caption2/.caption for incidental metadata. For labels/badges users must read, use .footnote (≈13pt) or larger." });
    }

    // ── Color: hardcoded RGB / hex literals
    var rgbLiterals = (src.match(/Color\(\s*(?:\.sRGB\s*,\s*)?red:\s*[\d.]+\s*,\s*green:\s*[\d.]+\s*,\s*blue:/g) || []).length;
    var hexLiterals = (src.match(/Color\(\s*hex:|#colorLiteral\(/g) || []).length;
    var hardColor = rgbLiterals + hexLiterals;
    if (hardColor === 0) passes.push("No hardcoded Color(red:green:blue:)/hex literals");
    else issues.push({ severity: "warning", rule: "ios-color/hardcoded-literal", message: "Found " + hardColor + " hardcoded color literal(s) (" + rgbLiterals + " RGB, " + hexLiterals + " hex). These won't adapt to dark mode or stay in sync with the design system.", fix: "Move colors into the asset catalog (Color(\"Name\") with light+dark) or use semantic system colors (Color(.label), Color(.systemBackground), Color.accentColor)." });

    // ── Color: semantic system colors rewarded
    var semanticColorHits = (src.match(/Color\(\s*\.(?:label|secondaryLabel|tertiaryLabel|systemBackground|secondarySystemBackground|systemGroupedBackground|secondarySystemGroupedBackground|tertiaryLabel|separator|tint)\b/g) || []).length;
    if (semanticColorHits > 0) passes.push("Uses semantic system colors that adapt to dark mode (" + semanticColorHits + ")");

    // ── Color: AccentColor defined?
    var usesAccent = /Color\.accentColor|\.tint\(\s*\.accentColor|Color\(\s*"AccentColor"\s*\)|\.accentColor\b/.test(src);
    if (usesAccent) {
      if (typeof accent_color_contents === "string" && accent_color_contents.length > 0) {
        var accentDefined = false;
        try {
          var parsedAccent = JSON.parse(accent_color_contents);
          var cols = Array.isArray(parsedAccent.colors) ? parsedAccent.colors : [];
          for (var ci = 0; ci < cols.length; ci++) {
            var comp = cols[ci] && cols[ci].color && cols[ci].color.components;
            if (comp && (comp.red !== undefined || comp.white !== undefined)) { accentDefined = true; break; }
          }
        } catch (_e) { accentDefined = false; }
        if (accentDefined) passes.push("AccentColor is defined in the asset catalog");
        else issues.push({ severity: "error", rule: "ios-color/empty-accent", message: "Source uses Color.accentColor but AccentColor.colorset defines no color components — the accent renders as the default system blue (a silent branding bug).", fix: "Open Assets.xcassets → AccentColor and set a color (Any + Dark appearance), or remove the accentColor usage." });
      }
      // If contents weren't supplied we stay silent — no speculative warning.
    }

    // ── Touch targets: interactive frames under 44×44pt
    var frameRe = /\.frame\(\s*width:\s*(\d+(?:\.\d+)?)\s*,\s*height:\s*(\d+(?:\.\d+)?)\s*\)/g;
    var hasInteractive = /Button\s*[\({]|\.onTapGesture|TapGesture|\.buttonStyle/.test(src);
    var tinyTargets: string[] = [];
    var frm: RegExpExecArray | null;
    while ((frm = frameRe.exec(src)) !== null) {
      var fw = parseFloat(frm[1]); var fh = parseFloat(frm[2]);
      var fctx = src.slice(Math.max(0, frm.index - 160), frm.index);
      var frameIsIcon = /Image\(\s*systemName:|Image\(\s*"/.test(fctx);
      if (fw < 44 && fh < 44 && !frameIsIcon && hasInteractive) tinyTargets.push(fw + "×" + fh);
    }
    if (tinyTargets.length === 0) passes.push("No interactive frames below 44×44pt");
    else issues.push({ severity: "error", rule: "ios-touch/min-target", message: "Found " + tinyTargets.length + " fixed frame(s) below the 44×44pt minimum hit target in an interactive view: " + tinyTargets.join(", "), fix: "Grow the hit area to ≥44×44pt with padding or .contentShape(Rectangle()).frame(minWidth:44,minHeight:44) — keep the glyph small if needed." });

    // ── Spacing: 4/8-pt grid adherence + scale tightness
    var spacingValues: number[] = [];
    var spRe = /\bspacing:\s*(\d+(?:\.\d+)?)/g;
    var sp: RegExpExecArray | null;
    while ((sp = spRe.exec(src)) !== null) { var v0 = parseFloat(sp[1]); if (v0 > 0) spacingValues.push(v0); }
    var padRe1 = /\.padding\(\s*(\d+(?:\.\d+)?)\s*\)/g;
    while ((sp = padRe1.exec(src)) !== null) { var v1 = parseFloat(sp[1]); if (v1 > 0) spacingValues.push(v1); }
    var padRe2 = /\.padding\(\s*\.(?:top|bottom|leading|trailing|horizontal|vertical)\s*,\s*(\d+(?:\.\d+)?)\s*\)/g;
    while ((sp = padRe2.exec(src)) !== null) { var v2 = parseFloat(sp[1]); if (v2 > 0) spacingValues.push(v2); }

    if (spacingValues.length >= 3) {
      var onGrid4 = spacingValues.filter(function (n) { return n % 4 === 0; }).length;
      var onGrid8 = spacingValues.filter(function (n) { return n % 8 === 0; }).length;
      var bestGrid = onGrid8 >= onGrid4 * 0.7 ? { base: 8, count: onGrid8 } : { base: 4, count: onGrid4 };
      var gridPct = bestGrid.count / spacingValues.length;
      if (gridPct >= 0.9) passes.push("Spacing on a " + bestGrid.base + "pt grid (" + Math.round(gridPct * 100) + "% of " + spacingValues.length + ")");
      else issues.push({ severity: "warning", rule: "ios-spacing/base-unit", message: "Only " + Math.round(gridPct * 100) + "% of spacing values land on a " + bestGrid.base + "pt grid (" + spacingValues.length + " sampled): " + Array.from(new Set(spacingValues)).sort(function (a, b) { return a - b; }).join(", ") + "pt", fix: "Snap spacing/padding to multiples of 4 or 8. Define a scale (4, 8, 12, 16, 24, 32) and reference it instead of ad-hoc values like 3, 6, 7, 14, 18." });

      var uniqueSp = Array.from(new Set(spacingValues)).sort(function (a, b) { return a - b; });
      if (uniqueSp.length <= 7) passes.push("Spacing scale is tight (" + uniqueSp.length + " unique values)");
      else issues.push({ severity: "warning", rule: "ios-spacing/scale-count", message: uniqueSp.length + " unique spacing values: " + uniqueSp.join(", ") + "pt — visual rhythm frays past ~7", fix: "Consolidate to a 5–7 step spacing scale and round ad-hoc values to the nearest step." });
    }

    // ── Layout: safe areas + flexible frames
    var managesSafeArea = /TabView|NavigationStack|NavigationView|NavigationSplitView|\.safeAreaInset/.test(src);
    var ignoresSafeArea = /\.ignoresSafeArea\(\)/.test(src); // bare, unscoped
    if (managesSafeArea) passes.push("Uses a standard container that manages safe areas (TabView/NavigationStack/safeAreaInset)");
    if (ignoresSafeArea) {
      issues.push({ severity: "warning", rule: "ios-layout/safe-area", message: "Found an unscoped .ignoresSafeArea() — interactive or legible content may slip under the notch, Dynamic Island, or home indicator.", fix: "Scope it to the decorative layer only, e.g. background.ignoresSafeArea(), and keep content inside the safe area (or use .safeAreaInset)." });
    }
    if (/\.frame\(\s*maxWidth:\s*\.infinity/.test(src)) passes.push("Uses flexible frames (maxWidth: .infinity)");
    if (/Image\(\s*systemName:|systemImage:/.test(src)) passes.push("Uses SF Symbols for iconography");

    // ── Taste fidelity: verify the binding's design_notes against the source
    var taste = await applySourceTasteNotes(tasteStore, src, "swiftui", issues, project, profile);

    var errors = issues.filter(function (i) { return i.severity === "error"; });
    var warnings = issues.filter(function (i) { return i.severity === "warning"; });
    var totalChecks = passes.length + issues.length;
    var failCount = isStrict ? issues.length : errors.length;

    var result: any = {
      platform: "ios",
      score: totalChecks > 0 ? Math.round(((totalChecks - failCount) / totalChecks) * 100) : 100,
      grade: failCount === 0 ? "A" : failCount <= 2 ? "B" : failCount <= 4 ? "C" : "D",
      summary: passes.length + "/" + totalChecks + " HIG checks passed" + (failCount > 0 ? " — " + failCount + " issue(s) to fix" : " — all clear"),
      passes: passes,
      errors: errors,
      warnings: isStrict ? warnings.map(function (w) { return Object.assign({}, w, { severity: "error" as const }); }) : warnings,
      fix_priority: errors.concat(warnings).map(function (i) { return i.rule + ": " + i.fix; })
    };
    if (taste) {
      result.taste_binding = { profile: taste.profile, project: taste.project, surface: taste.surface };
      result.note_assessments = taste.note_assessments;
    }

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool 14c: audit_ios_screen ─────────────────────────────────────
//
// The iOS analog of audit_layout. Takes a view-hierarchy / accessibility
// snapshot (the structured equivalent of DevTools rects) plus an optional
// screenshot. Scores touch targets and contrast in points against HIG, and
// runs the same alignment / gap-rhythm / optical-balance geometry checks —
// but treats iOS secondary/tertiary label colors as platform-standard.

// Shared snapshot auditor behind both audit_ios_screen and audit_screen. The
// geometry/contrast/touch logic is framework-agnostic; only the touch-target
// minimum (44pt iOS vs 48dp Android), the muted-text color set, and the fix
// wording differ by platform. iOS output is byte-identical to the original tool.
async function auditScreenSnapshot(elements: any, viewport: any, screenshot: any, platform: string, scroll_settle?: boolean, project?: string, profile?: string) {
  var isAndroid = platform === "android";
  var P = isAndroid ? "android" : "ios";
  var unit = isAndroid ? "dp" : "pt";
  var minTarget = isAndroid ? 48 : 44;

  if (!elements || !viewport) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          instructions: "Provide a structured snapshot of the rendered screen. Capture it with " + (isAndroid ? "UI Automator / Espresso (uiautomator dump) or a Compose semantics tree" : "the Accessibility Inspector, an XCUITest dumping the accessibility tree, or your own view-hierarchy walker") + " — then call " + (isAndroid ? "audit_screen with platform:\"android\"" : "audit_ios_screen") + " with the JSON below. rect units are " + unit + ". fgColor/bgColor accept hex, rgb(), or " + (isAndroid ? "Material semantic role names (e.g. 'onSurfaceVariant')" : "iOS semantic names (e.g. 'secondaryLabel')") + ". role should carry the accessibility trait so interactive elements can be checked for " + minTarget + "×" + minTarget + unit + " hit targets.",
          snapshot_shape: {
            elements: [
              { label: "Start", rect: { x: 24, y: 720, w: 345, h: 50 }, role: "button", fontPt: 17, fgColor: "#FFFFFF", bgColor: "#5B3FC4" },
              { label: "You can change this anytime in Settings.", rect: { x: 24, y: 786, w: 345, h: 16 }, role: "staticText", fontPt: 13, fgColor: isAndroid ? "onSurfaceVariant" : "secondaryLabel", bgColor: "#F2F2F7" }
            ],
            viewport: isAndroid ? { w: 412, h: 915 } : { w: 393, h: 852 }
          },
          example_call: isAndroid ? "audit_screen({ platform: \"android\", elements: [...], viewport: { w: 412, h: 915 } })" : "audit_ios_screen({ elements: [...], viewport: { w: 393, h: 852 } })"
        }, null, 2)
      }]
    };
  }

  var videoArtifacts = annotateVideoArtifacts(elements);
  var issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }> = [];
  var passes: string[] = [];
  var interactiveRoles = ["button", "link", "cell", "tab", "tabbar", "menuitem", "switch", "slider", "stepper", "segmentedcontrol", "textfield", "searchfield", "tappable"];

  // ── Touch targets (44pt iOS / 48dp Android)
  var smallTargets: string[] = [];
  var interactiveCount = 0;
  for (var el of elements) {
    var role = (el.role || "").toLowerCase().replace(/[^a-z]/g, "");
    var isInteractive = interactiveRoles.indexOf(role) >= 0;
    if (!isInteractive) continue;
    interactiveCount++;
    if (el.rect.w < minTarget || el.rect.h < minTarget) {
      smallTargets.push((el.label ? "\"" + el.label + "\" " : "") + Math.round(el.rect.w) + "×" + Math.round(el.rect.h) + unit);
    }
  }
  if (interactiveCount === 0) passes.push("No interactive elements flagged for touch-target sizing");
  else if (smallTargets.length === 0) passes.push("All " + interactiveCount + " interactive elements meet the " + minTarget + "×" + minTarget + unit + " minimum");
  else issues.push({ severity: "error", rule: P + "-touch/min-target", message: smallTargets.length + " interactive element(s) below " + minTarget + "×" + minTarget + unit + ": " + smallTargets.join(", "), fix: isAndroid ? "Apply Modifier.minimumInteractiveComponentSize() or size the target ≥48×48dp — the visual glyph can stay smaller than the touch target." : "Expand the hit target to ≥44×44pt (padding or .contentShape + .frame(minWidth:44,minHeight:44))." });

  // ── Contrast (muted platform text roles warn rather than hard-fail)
  var contrastChecked = 0;
  var contrastFails = 0;
  for (var el2 of elements) {
    if (!el2.fgColor || !el2.bgColor) continue;
    var fg = resolveScreenColor(el2.fgColor, platform);
    var bg = resolveScreenColor(el2.bgColor, platform);
    if (!fg.hex || !bg.hex) continue;
    contrastChecked++;
    var ratio = getContrastRatio(fg.hex, bg.hex);
    var pt = el2.fontPt || 0;
    var isLarge = pt >= 18; // ~24px; HIG/Material/WCAG large-text threshold
    var threshold = isLarge ? 3 : 4.5;
    if (ratio >= threshold) continue;
    contrastFails++;
    var who = (el2.label ? "\"" + el2.label + "\"" : "element") + " (" + ratio + ":1, needs " + threshold + ":1)";
    if (fg.secondary) {
      issues.push({ severity: "warning", rule: P + "-contrast/secondary-label", message: isAndroid ? who + " uses a Material muted role (onSurfaceVariant/outline) — Material ships these for de-emphasized text, so it's acceptable, but verify legibility for critical content." : who + " uses an iOS platform-standard secondary/tertiary label color — Apple ships this, so it's acceptable per HIG, but verify legibility for critical text.", fix: isAndroid ? "For must-read text use onSurface; reserve onSurfaceVariant/outline for de-emphasized metadata." : "For must-read text prefer Color(.label); reserve secondaryLabel/tertiaryLabel for de-emphasized metadata." });
    } else {
      issues.push({ severity: "error", rule: P + "-contrast/wcag", message: who + " falls below contrast minimum.", fix: "Increase contrast to ≥" + threshold + ":1 — darken the text or lighten the background. Verify in both light and dark." });
    }
  }
  if (contrastChecked > 0 && contrastFails === 0) passes.push("All " + contrastChecked + " text/background pairs meet contrast minimums");
  else if (contrastChecked === 0) passes.push("No fg/bg color pairs supplied to score contrast");

  // ── Geometry: alignment / gap rhythm / optical balance (pt or dp)
  var rects = elements.map(function (e: any) { return e.rect; });
  var metrics: any = {};
  if (rects.length >= 3) {
    // Alignment: cluster left edges within 2 units.
    var colCounts = new Map<number, number>();
    for (var r of rects) {
      var matched: number | null = null;
      for (var c of Array.from(colCounts.keys())) { if (Math.abs(r.x - c) <= 2) { matched = c; break; } }
      if (matched !== null) colCounts.set(matched, (colCounts.get(matched) || 0) + 1);
      else colCounts.set(r.x, 1);
    }
    var sharedCols = Array.from(colCounts.values()).filter(function (n) { return n >= 2; }).length;
    var aligned = 0; colCounts.forEach(function (n) { if (n >= 2) aligned += n; });
    var alignRatio = aligned / rects.length;
    metrics.alignment = { shared_columns: sharedCols, aligned_ratio: Number(alignRatio.toFixed(2)) };
    if (alignRatio >= 0.6) passes.push(Math.round(alignRatio * 100) + "% of elements share an alignment column");
    else issues.push({ severity: "warning", rule: P + "-layout/alignment", message: "Weak alignment — only " + Math.round(alignRatio * 100) + "% of elements share a left edge with a sibling.", fix: isAndroid ? "Let a parent Column/LazyColumn dictate alignment; remove ad-hoc start padding that pushes children off the column." : "Let a parent VStack/Grid dictate alignment; remove ad-hoc leading padding that pushes children off the column." });

    // Gap rhythm.
    var vGaps: number[] = [];
    var byY = rects.slice().sort(function (a: any, b: any) { return a.y - b.y; });
    for (var i = 1; i < byY.length; i++) {
      var prev = byY[i - 1]; var cur = byY[i];
      var xo = Math.min(prev.x + prev.w, cur.x + cur.w) - Math.max(prev.x, cur.x);
      if (xo > 0) { var g = cur.y - (prev.y + prev.h); if (g > 0 && g < 200) vGaps.push(g); }
    }
    if (vGaps.length >= 3) {
      var mean = vGaps.reduce(function (a: number, b: number) { return a + b; }, 0) / vGaps.length;
      var variance = vGaps.reduce(function (a: number, b: number) { return a + (b - mean) * (b - mean); }, 0) / vGaps.length;
      var cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      metrics.gap_rhythm = { samples: vGaps.length, coef_variation: Number(cv.toFixed(2)) };
      if (cv <= 0.5) passes.push("Vertical gaps are consistent (CV " + cv.toFixed(2) + ")");
      else issues.push({ severity: "warning", rule: P + "-layout/gap-rhythm", message: "Inconsistent vertical rhythm — gap coefficient of variation " + cv.toFixed(2) + ".", fix: isAndroid ? "Drive spacing from a single Arrangement.spacedBy() on the parent Column so siblings share one gap." : "Move per-child padding into a single VStack(spacing:) on the parent so siblings share one gap." });
    }

    // Optical balance about content midline.
    var minX = Infinity, maxX = -Infinity;
    for (var rb of rects) { if (rb.x < minX) minX = rb.x; if (rb.x + rb.w > maxX) maxX = rb.x + rb.w; }
    var mid = (minX + maxX) / 2; var halfW = (maxX - minX) / 2;
    var lT = 0, rT = 0, area = 0;
    for (var r2 of rects) {
      var a = r2.w * r2.h; var cx = r2.x + r2.w / 2; var d = Math.abs(cx - mid); area += a;
      if (cx < mid) lT += a * d; else if (cx > mid) rT += a * d;
    }
    var maxT = area * halfW; var skew = maxT > 0 ? Math.abs(lT - rT) / maxT : 0;
    metrics.balance = { skew_pct: Math.round(skew * 100) };
    if (skew <= 0.2) passes.push("Horizontal weight is balanced (skew " + Math.round(skew * 100) + "%)");
    else issues.push({ severity: "warning", rule: P + "-layout/optical-balance", message: "Layout is " + (lT > rT ? "left" : "right") + "-heavy — visual weight skewed " + Math.round(skew * 100) + "%.", fix: skew > 0.4 ? "Redistribute dense blocks toward center or add counterweight on the lighter side." : "Minor imbalance — confirm it's intentional." });
  }

  // ── Taste fidelity: pixel-derived screenshot traits vs the binding's
  // design_notes. Only the scheme/luminance subset is verifiable from pixels;
  // everything else answers unverifiable rather than guessed. No screenshot →
  // every note is unverifiable with the reason (never silently skipped).
  var tasteResolved = await resolveMobileTaste(tasteStore, project, profile);
  var noteAssessments: NoteAssessment[] | undefined = undefined;
  var screenTraits: PageTraits | undefined = undefined;
  if (tasteResolved && Object.keys(tasteResolved.binding.design_notes).length > 0) {
    var notes = tasteResolved.binding.design_notes;
    if (typeof screenshot === "string" && screenshot.length > 0) {
      screenTraits = await screenTraitsFromImage(screenshot);
      noteAssessments = assessDesignNotesImage(notes, screenTraits);
      for (var noteIssue of noteIssuesFromAssessments(notes, noteAssessments)) issues.push(noteIssue);
    } else {
      noteAssessments = Object.keys(notes).map(function (key) {
        return { key: key, status: "unverifiable" as const, expectation: "no screenshot to verify against", evidence: "binding has design_notes but no screenshot was provided — pass a base64 PNG screenshot to verify the color scheme, or audit the source with " + (platform === "android" ? "audit_screen/audit_rn" : "audit_swiftui") + " for API-level notes" };
      });
    }
  }

  var errors = issues.filter(function (i) { return i.severity === "error"; });
  var warnings = issues.filter(function (i) { return i.severity === "warning"; });
  var totalChecks = passes.length + issues.length;
  var failCount = errors.length;

  var result: any = {
    platform: platform,
    elements_analyzed: elements.length,
    viewport: viewport,
    screenshot_received: typeof screenshot === "string" ? screenshot.length + " base64 chars (" + (screenTraits ? "pixels decoded for taste-note scheme verification; geometry scored from snapshot" : "not decoded — geometry scored from snapshot") + ")" : false,
    score: totalChecks > 0 ? Math.round(((totalChecks - failCount) / totalChecks) * 100) : 100,
    grade: failCount === 0 ? "A" : failCount <= 2 ? "B" : failCount <= 4 ? "C" : "D",
    summary: passes.length + "/" + totalChecks + " checks passed" + (failCount > 0 ? " — " + failCount + " issue(s) to fix" : " — all clear"),
    passes: passes,
    errors: errors,
    warnings: warnings,
    fix_priority: errors.concat(warnings).map(function (i) { return i.rule + ": " + i.fix; }),
    metrics: metrics
  };

  if (tasteResolved && noteAssessments) {
    result.taste_binding = { profile: tasteResolved.profile, project: tasteResolved.binding.project, surface: tasteResolved.binding.surface };
    result.note_assessments = noteAssessments;
    if (screenTraits) result.screen_traits = { scheme: screenTraits.scheme, bg_luminance: screenTraits.bg_luminance };
  }
  if (videoArtifacts.length > 0) {
    result.unloaded_video_artifacts = videoArtifacts;
  }
  if (scroll_settle) {
    result.capture_guidance = "Scroll to bottom, wait 300ms for IntersectionObserver reveals, then call play() on preload=none videos before snapshotting.";
  }

  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

var screenElementSchema = {
  elements: z.array(z.object({
    label: z.string().optional(),
    rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    role: z.string().optional().describe("Accessibility role/trait, e.g. button, link, cell, staticText, image, tab, textField"),
    fontPt: z.number().optional().describe("Effective font point/dp size, if text"),
    fgColor: z.string().optional().describe("Foreground color — hex (#1c1c1e), rgb(), or a platform semantic name ('secondaryLabel' iOS / 'onSurfaceVariant' Android)"),
    bgColor: z.string().optional().describe("Background color behind this element — hex, rgb(), or semantic name")
  })).optional().describe("Elements captured from the rendered screen via an accessibility/view-hierarchy snapshot"),
  viewport: z.object({ w: z.number(), h: z.number() }).optional().describe("Screen size in pt (iOS) or dp (Android) at capture time, e.g. {w:393,h:852} iPhone 15, {w:412,h:915} Pixel"),
  screenshot: z.string().optional().describe("Optional base64 PNG of the screen, for the caller's reference. Geometry is scored from the snapshot, not decoded pixels.")
};

// Canonical, framework-agnostic snapshot auditor. platform switches the touch
// minimum (44pt iOS / 48dp Android) and the muted-text color semantics.
server.tool(
  "audit_screen",
  "Audit a rendered mobile screen (iOS or Android) from a view-hierarchy/accessibility snapshot. Call with no arguments for the expected snapshot shape and how to capture it. Pass platform:\"android\" to score against the 48dp Material touch minimum and Material muted roles (onSurfaceVariant/outline = warn not fail); default platform:\"ios\" scores 44pt and treats secondaryLabel/tertiaryLabel as platform-standard. Both score touch targets, contrast, and visual rhythm (alignment, gap consistency, optical balance). Same return shape as audit_page.",
  Object.assign({
    platform: z.enum(["ios", "android"]).optional().describe("Target platform — 'ios' (default, 44pt minimum, iOS semantic colors) or 'android' (48dp minimum, Material semantic roles)"),
    scroll_settle: z.boolean().optional(),
    project: z.string().optional().describe("Project identifier — resolves a saved taste surface binding (see bind_taste_surface). When the binding carries design_notes and a screenshot is passed, the screenshot's pixels verify the color-scheme notes; results gain note_assessments."),
    profile: z.string().optional().describe("Taste profile owning the binding. Omit to search all stored profiles for one bound to the project.")
  }, screenElementSchema),
  async function({ elements, viewport, screenshot, platform, scroll_settle, project, profile }) {
    return auditScreenSnapshot(elements, viewport, screenshot, platform || "ios", scroll_settle, project, profile);
  }
);

// Back-compat alias — predates audit_screen. Identical to audit_screen with
// platform:"ios". Kept so existing iOS callers/scripts don't break.
server.tool(
  "audit_ios_screen",
  "Audit a rendered iOS screen from a view-hierarchy/accessibility snapshot (and optional screenshot). Alias of audit_screen with platform:\"ios\". Call with no arguments for the expected snapshot shape. Call with {elements:[{label,rect:{x,y,w,h},role,fontPt,fgColor,bgColor}],viewport:{w,h}} to score 44×44pt touch targets, contrast (with iOS secondaryLabel/tertiaryLabel treated as platform-standard — warn not fail), and visual rhythm (alignment, gap consistency, optical balance) in points. Same return shape as audit_page.",
  Object.assign({
    project: z.string().optional().describe("Project identifier — resolves a saved taste surface binding (see bind_taste_surface). When the binding carries design_notes and a screenshot is passed, the screenshot's pixels verify the color-scheme notes; results gain note_assessments."),
    profile: z.string().optional().describe("Taste profile owning the binding. Omit to search all stored profiles for one bound to the project.")
  }, screenElementSchema),
  async ({ elements, viewport, screenshot, project, profile }) => auditScreenSnapshot(elements, viewport, screenshot, "ios", undefined, project, profile)
);

// ── Tool 14d: audit_ios_privacy ────────────────────────────────────
//
// The "no sketchy issues" gate. Reads Info.plist OR an Expo app.json (+
// optional PRIVACY.md, entitlements, and source) and flags usage strings that
// are vague or contradict the code, unused permissions, ATS/cleartext
// exceptions, secrets shipped in the bundle, and default data-egress paths
// that aren't disclosed at the point of choice. Same return shape as audit_page.

// Serialize a JS value (from Expo app.json's ios.infoPlist) back into plist
// XML so the same regex/key checks the native path uses work uniformly.
function objToPlistXml(val: any): string {
  if (typeof val === "string") return "<string>" + val + "</string>";
  if (typeof val === "boolean") return val ? "<true/>" : "<false/>";
  if (typeof val === "number") return "<integer>" + val + "</integer>";
  if (Array.isArray(val)) return "<array>" + val.map(objToPlistXml).join("") + "</array>";
  if (val && typeof val === "object") {
    var out = "<dict>";
    for (var k of Object.keys(val)) out += "<key>" + k + "</key>" + objToPlistXml(val[k]);
    return out + "</dict>";
  }
  return "<string></string>";
}

server.tool(
  "audit_ios_privacy",
  "Audit an iOS or React Native/Expo app's privacy posture for App Review and user trust. Reads a native Info.plist XML OR an Expo app.json (managed Expo apps have no Info.plist) — plus optional PRIVACY.md, entitlements, and source. Flags: NS*UsageDescription strings that are vague/missing or contradict the code (e.g. a HealthKit write claim the code never fulfills), entitlements/permissions and Android permissions the app doesn't use, ATS cleartext exceptions and non-HTTPS endpoints, secrets/keys shipped in the bundle or app.json, and default data-egress paths not disclosed at the point of choice (a pre-selected 'Recommended' option that silently sends personal data to a server). Same return shape as audit_page.",
  {
    info_plist: z.string().optional().describe("Raw Info.plist XML (native iOS / bare RN). Provide this OR app_json."),
    app_json: z.string().optional().describe("Expo app.json / app.config JSON (managed RN). Its expo.ios.infoPlist, expo.android.permissions, plugins, and extra are audited."),
    privacy_md: z.string().optional().describe("Optional PRIVACY.md / privacy policy text to cross-reference against declared permissions and default behavior"),
    entitlements: z.string().optional().describe("Optional .entitlements XML"),
    source: z.string().optional().describe("Optional concatenated source (Swift or JS/TS) — enables code-vs-declaration contradiction checks and default-egress detection")
  },
  async ({ info_plist, app_json, privacy_md, entitlements, source }) => {
    var issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }> = [];
    var passes: string[] = [];
    var src = source || "";
    var policy = privacy_md || "";
    var ent = entitlements || "";

    if (!info_plist && !app_json) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide either info_plist (native) or app_json (Expo).", platform: "ios" }, null, 2) }] };
    }

    // Build one plist-XML blob the existing checks run against. For Expo, we
    // serialize expo.ios.infoPlist back into plist XML and append the raw
    // app.json (so the secret scan also sees expo.extra/keys), and collect
    // Android permissions + plugins for RN-specific checks.
    var isExpo = !!app_json && !info_plist;
    var androidPerms: string[] = [];
    var expoPlugins: string[] = [];
    var plistXml = info_plist || "";
    if (app_json) {
      try {
        var aj = JSON.parse(app_json);
        var expo = aj.expo || aj;
        if (expo && expo.android && Array.isArray(expo.android.permissions)) androidPerms = expo.android.permissions;
        if (expo && Array.isArray(expo.plugins)) expoPlugins = expo.plugins.map(function (p: any) { return Array.isArray(p) ? p[0] : p; }).filter(function (p: any) { return typeof p === "string"; });
        // Serialize the whole expo config to plist XML so every check runs
        // uniformly: ios.infoPlist (usage strings + ATS), plus extra/config
        // where Expo secrets and Google API keys hide.
        if (expo) plistXml += objToPlistXml(expo);
      } catch (_e) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "app_json is not valid JSON.", platform: "ios" }, null, 2) }] };
      }
    }
    var info_plist_text = plistXml; // alias used by the regex-based checks below
    var plist = parsePlistKeys(plistXml);

    // ── Usage descriptions: present + specific
    var usageKeys = Object.keys(plist).filter(function (k) { return /UsageDescription$/.test(k); });
    var vague: string[] = [];
    for (var uk of usageKeys) {
      var val = (plist[uk] || "").trim();
      if (val.length < 15 || /^\$\(/.test(val) || /\buse[sd]? your data\b/i.test(val)) vague.push(uk);
    }
    if (usageKeys.length > 0 && vague.length === 0) passes.push("All " + usageKeys.length + " usage description(s) are specific");
    if (vague.length > 0) issues.push({ severity: "warning", rule: "ios-privacy/vague-usage", message: "Vague or placeholder usage description(s): " + vague.join(", "), fix: "Write a specific, user-facing reason for each permission that matches what the app actually does." });

    // ── Code-vs-declaration contradiction: HealthKit write
    var declaresHealthWrite = !!plist["NSHealthUpdateUsageDescription"];
    // The authoritative signal for a HealthKit WRITE is a non-empty toShare:
    // set in requestAuthorization — you can't write without requesting share
    // authorization. (A bare .save( would false-positive on Core Data saves.)
    var codeWritesHealth = /toShare:\s*\[\s*[A-Za-z.]/.test(src);
    var codeSharesEmpty = /toShare:\s*\[\s*\]/.test(src);
    var hasHealthKitEntitlement = /com\.apple\.developer\.healthkit/.test(ent);
    if (declaresHealthWrite && src.length > 0 && !codeWritesHealth) {
      if (hasHealthKitEntitlement) {
        // CRITICAL: with the HealthKit entitlement present, Apple's upload
        // validator REQUIRES NSHealthUpdateUsageDescription even when the app
        // never writes (toShare: []). Removing it fails the upload with error
        // 90683 ("Missing purpose string in Info.plist"). The contradiction is
        // real, but deletion breaks the build — the real fix is to drop the
        // write capability so the entitlement matches actual use, not to delete
        // the string. Keep this a warning, never an error.
        issues.push({ severity: "warning", rule: "ios-privacy/unfulfilled-claim", message: "Info.plist declares NSHealthUpdateUsageDescription (write to Health) but the code never writes to HealthKit" + (codeSharesEmpty ? " (requestAuthorization uses toShare: [])" : "") + ". The HealthKit entitlement is present, so Apple's upload validator REQUIRES this string — removing it fails the upload with error 90683 even though the app never writes. App Review (5.1.1) separately scrutinizes capabilities the app doesn't exercise.", fix: "Do NOT remove the usage string while the HealthKit entitlement is present (upload error 90683). The real fix is to drop the write capability so the entitlement matches actual use: stop requesting write authorization (don't pass a non-empty toShare:) and remove the HealthKit-write entitlement, OR implement the write the description promises. Since toShare: [] means the prompt never shows at runtime, you can also word the string conditionally to keep it honest." });
      } else {
        // No HealthKit entitlement: the orphan usage string is safe to remove.
        issues.push({ severity: "error", rule: "ios-privacy/unfulfilled-claim", message: "Info.plist declares NSHealthUpdateUsageDescription (write to Health) but the code never writes to HealthKit" + (codeSharesEmpty ? " (requestAuthorization uses toShare: [])" : "") + ", and there is no HealthKit entitlement. This contradicts the permission prompt and risks App Review rejection.", fix: "Remove NSHealthUpdateUsageDescription — no HealthKit entitlement is present, so removal is safe and will not trigger upload error 90683 — or implement the write the description promises." });
      }
    } else if (declaresHealthWrite) {
      passes.push("HealthKit write permission declared (verify the code actually writes)");
    }
    if (codeWritesHealth && !declaresHealthWrite) {
      issues.push({ severity: "error", rule: "ios-privacy/missing-usage", message: "Code writes to HealthKit (non-empty toShare:) but Info.plist has no NSHealthUpdateUsageDescription — this will crash on the authorization request.", fix: "Add a specific NSHealthUpdateUsageDescription string." });
    }
    if (plist["NSHealthShareUsageDescription"] && src.length > 0) {
      if (/HKHealthStore|HealthKit|requestAuthorization\(/.test(src)) passes.push("HealthKit read permission matches HealthKit usage in code");
    }

    // ── Entitlements not exercised
    if (/com\.apple\.developer\.healthkit/.test(ent) && !/HealthKit|HKHealthStore/.test(src) && src.length > 0) {
      issues.push({ severity: "warning", rule: "ios-privacy/unused-entitlement", message: "HealthKit entitlement present but no HealthKit usage found in the supplied source.", fix: "Remove the entitlement if the app doesn't use HealthKit, or include the source that does." });
    }

    // ── ATS / cleartext
    if (/<key>\s*NSAllowsArbitraryLoads\s*<\/key>\s*<true\s*\/>/.test(info_plist_text)) {
      issues.push({ severity: "error", rule: "ios-privacy/ats-global", message: "NSAllowsArbitraryLoads = true disables App Transport Security app-wide — all cleartext HTTP is allowed.", fix: "Remove the global opt-out. Scope any necessary exception to a specific NSExceptionDomains entry over HTTPS, or justify it in the App Review notes." });
    } else if (/NSExceptionAllowsInsecureHTTPLoads\s*<\/key>\s*<true\s*\/>/.test(info_plist_text)) {
      var domMatch = info_plist_text.match(/<key>([\d.]+|[a-z0-9.-]+\.[a-z]{2,})<\/key>\s*<dict>[\s\S]*?NSExceptionAllowsInsecureHTTPLoads/i);
      issues.push({ severity: "warning", rule: "ios-privacy/ats-exception", message: "Cleartext HTTP is allowed via an ATS exception" + (domMatch ? " for " + domMatch[1] : "") + ". Acceptable when scoped to a known host (e.g. a LAN/Tailscale IP), but confirm no personal data rides over plain HTTP.", fix: "Keep the exception scoped to the single host, document why in App Review notes, and prefer HTTPS even on the local network where possible." });
    } else if (usageKeys.length > 0) {
      passes.push("No global ATS opt-out (no NSAllowsArbitraryLoads)");
    }

    // ── Secrets / keys shipped in the bundle
    var secretRe = /<key>([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|APIKEY|API_KEY|PRIVATE_KEY|CLIENT_SECRET)[A-Za-z0-9_]*)<\/key>\s*<string>([\s\S]*?)<\/string>/gi;
    var secM: RegExpExecArray | null;
    var secretFindings: string[] = [];
    var caughtKeys: Record<string, boolean> = {};
    var realSecret = false;
    while ((secM = secretRe.exec(info_plist_text)) !== null) {
      var skey = secM[1]; var sval = (secM[2] || "").trim();
      var isPlaceholder = sval === "" || sval === skey || /^\$\(/.test(sval) || /^[A-Z_]+$/.test(sval);
      secretFindings.push(skey + (isPlaceholder ? " (placeholder)" : " (LOOKS REAL)"));
      caughtKeys[skey] = true;
      if (!isPlaceholder) realSecret = true;
    }
    var manifestName = isExpo ? "app.json" : "Info.plist";
    if (secretFindings.length > 0) {
      issues.push({ severity: realSecret ? "error" : "warning", rule: "ios-privacy/secret-in-bundle", message: "Secret-shaped key(s) in " + manifestName + " ship inside the app and are trivially extractable: " + secretFindings.join(", ") + ". Client secrets in particular must never live in the app.", fix: "Remove secrets from " + manifestName + ". Keep client secrets server-side (proxy the OAuth token exchange); store per-user tokens in the Keychain / expo-secure-store at runtime." });
    } else {
      passes.push("No secret-shaped keys found in " + manifestName);
    }
    // Bearer/proxy tokens shipped in the binary (build-injected) — softer note,
    // but only for token keys the secret net above didn't already report.
    var tokRe = /<key>([A-Za-z0-9_]*(?:ProxyToken|AuthToken|BearerToken)[A-Za-z0-9_]*)<\/key>/g;
    var tokM: RegExpExecArray | null;
    var tokenKeys: string[] = [];
    while ((tokM = tokRe.exec(info_plist_text)) !== null) { if (!caughtKeys[tokM[1]]) tokenKeys.push(tokM[1]); }
    if (tokenKeys.length > 0) {
      issues.push({ severity: "warning", rule: "ios-privacy/token-in-bundle", message: "Bearer/proxy token key(s) present in Info.plist (" + tokenKeys.join(", ") + "). Even if build-injected, anything in Info.plist ships in the binary and can be read from the IPA.", fix: "Don't ship a shared bearer token in the app. Mint short-lived per-device tokens, or require the user's own credentials." });
    }
    // Hardcoded keys in source.
    if (src && /(sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_\-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (?:RSA )?PRIVATE KEY-----)/.test(src)) {
      issues.push({ severity: "error", rule: "ios-privacy/hardcoded-key", message: "A hardcoded API key / secret appears in the source.", fix: "Remove it from source. Load secrets at runtime from the Keychain / expo-secure-store or a server, never compile them into the app." });
    }

    // ── Android permissions (Expo) — flag dangerous perms not exercised in code
    if (androidPerms.length > 0) {
      var DANGEROUS = ["CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION", "READ_CONTACTS", "WRITE_CONTACTS", "READ_CALENDAR", "READ_SMS", "READ_EXTERNAL_STORAGE", "BODY_SENSORS", "ACTIVITY_RECOGNITION"];
      var dangerousRequested = androidPerms.map(function (p) { return p.split(".").pop() || p; }).filter(function (p) { return DANGEROUS.indexOf(p) >= 0; });
      if (dangerousRequested.length > 0) {
        issues.push({ severity: "warning", rule: "ios-privacy/android-permissions", message: "app.json requests Android runtime permission(s): " + dangerousRequested.join(", ") + ". Each must be justified to the user at request time and have a matching disclosure.", fix: "Request each permission only when the feature is used, with an in-context rationale; remove any the app doesn't actually exercise." });
      } else {
        passes.push("Android permissions are limited to non-dangerous ones");
      }
    }

    // ── Expo: reward secure secret storage
    if (isExpo) {
      if (expoPlugins.indexOf("expo-secure-store") >= 0 || /expo-secure-store|SecureStore\./.test(src)) {
        passes.push("Uses expo-secure-store (Keychain/Keystore) for token storage");
      }
    }

    // ── Default data-egress not disclosed at the point of choice
    if (src) {
      var defaultHosted = /=\s*\.hosted\b|mode:\s*Mode\s*=\s*\.hosted|@State[^\n]*=\s*\.hosted/.test(src);
      var recommendedBadge = /badge:\s*"Recommended"|"Recommended"/.test(src);
      var hostedEgress = /cloud|hosted|proxy|server/i.test(src);
      var weakInlineDisclosure = /change this anytime in Settings|change (?:it|this) (?:later|anytime)/i.test(src);
      var policyConfirmsEgress = /transit our server|sent to .*hosted|hosted proxy|do transit/i.test(policy);
      if (defaultHosted && recommendedBadge && hostedEgress) {
        issues.push({ severity: "warning", rule: "ios-privacy/undisclosed-default-egress", message: "The default-selected onboarding option is a 'Recommended' cloud/hosted mode that sends personal data off-device" + (policyConfirmsEgress ? ", and PRIVACY.md confirms messages 'transit our server'" : "") + (weakInlineDisclosure ? ", yet the only inline disclosure is 'you can change this in Settings'" : "") + ". Defaulting users into off-device data transmission without disclosing it at the point of choice risks App Review §5.1.1 and erodes trust.", fix: "Disclose the data-egress consequence inline on the choice itself (a sentence under 'Just try it', or a 'what leaves your device' line), or don't pre-select the hosted option as the default." });
      } else if (defaultHosted && hostedEgress) {
        passes.push("Default mode sends data off-device — verify it's disclosed at the point of choice");
      }
    }

    // ── Policy coverage sanity (light)
    if (policy) {
      if (plist["NSCameraUsageDescription"] && !/camera|photo|image/i.test(policy)) {
        issues.push({ severity: "warning", rule: "ios-privacy/policy-gap", message: "Info.plist requests camera access but PRIVACY.md doesn't mention the camera or photos.", fix: "Add a line to the privacy policy describing what camera/photo data is used for and where it goes." });
      } else if (plist["NSCameraUsageDescription"]) {
        passes.push("Camera usage is reflected in the privacy policy");
      }
    }

    var errors = issues.filter(function (i) { return i.severity === "error"; });
    var warnings = issues.filter(function (i) { return i.severity === "warning"; });
    var totalChecks = passes.length + issues.length;
    var failCount = errors.length;

    var result = {
      platform: "ios",
      score: totalChecks > 0 ? Math.round(((totalChecks - failCount) / totalChecks) * 100) : 100,
      grade: failCount === 0 ? "A" : failCount <= 2 ? "B" : failCount <= 4 ? "C" : "D",
      summary: passes.length + "/" + totalChecks + " privacy checks passed" + (failCount > 0 ? " — " + failCount + " issue(s) to fix" : " — all clear"),
      passes: passes,
      errors: errors,
      warnings: warnings,
      fix_priority: errors.concat(warnings).map(function (i) { return i.rule + ": " + i.fix; })
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ════════════════════════════════════════════════════════════════════
// React Native / Expo audit. Additive. RN authors JSX that renders to
// native iOS + Android widgets, so audit_ios_screen already scores its
// *rendered* output (an accessibility snapshot is platform-level, not
// framework-level). This tool covers the JSX/StyleSheet *source* layer —
// the RN analog of audit_swiftui — graded against the iOS HIG + Android
// Material conventions RN has to satisfy on both platforms.
// ════════════════════════════════════════════════════════════════════

var RN_TOUCHABLES = ["TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback", "Pressable", "TouchableNativeFeedback"];

// Walk from a JSX element's opening "<" to the ">" that closes its opening
// tag, ignoring ">" that appears inside attribute braces (e.g. onPress={() =>
// ...} or icon={<Foo/>}). Returns the opening-tag attribute span.
function jsxOpenTag(src: string, tagStart: number): string {
  var depth = 0;
  for (var i = tagStart; i < src.length; i++) {
    var ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth <= 0) return src.slice(tagStart, i + 1);
  }
  return src.slice(tagStart, Math.min(src.length, tagStart + 600));
}

// RN principles returned by get_principles({platform:"react-native"}).
var RN_HIG_PRINCIPLES = [
  { id: "rn-touch-targets", name: "44/48pt hit targets", summary: "Touchables must be ≥44pt (iOS) / 48dp (Android). Grow the hit area with padding or hitSlop, not just the glyph.", verify: ["Pressable/Touchable* render ≥44pt, or use hitSlop", "Icon-only buttons especially get an expanded hit area"] },
  { id: "rn-accessibility", name: "Accessibility props", summary: "Every touchable and meaningful image needs accessibilityLabel + accessibilityRole so VoiceOver and TalkBack can announce it.", verify: ["Touchables have accessibilityRole=\"button\" + accessibilityLabel", "Decorative images set accessible={false}", "accessibilityState reflects disabled/selected"] },
  { id: "rn-dynamic-type", name: "Dynamic Type / font scaling", summary: "Leave allowFontScaling on (the default) so text honors the OS text-size setting; never hardcode tiny font sizes.", verify: ["No allowFontScaling={false}", "No fontSize below ~13", "Layout survives the largest accessibility text size"] },
  { id: "rn-safe-areas", name: "Safe areas", summary: "Wrap screens in SafeAreaView / useSafeAreaInsets so content clears the notch, Dynamic Island, status bar, and home indicator on both platforms.", verify: ["Screens use SafeAreaView or useSafeAreaInsets", "edges are scoped where a bar should bleed", "Android edge-to-edge handled"] },
  { id: "rn-dark-mode", name: "Dark mode", summary: "Adapt to the OS appearance with useColorScheme()/Appearance and a theme — unless the app is intentionally single-mode.", verify: ["Colors come from a theme keyed on useColorScheme(), not scattered hex", "Both appearances verified — or userInterfaceStyle pins a single mode on purpose"] },
  { id: "rn-platform-parity", name: "iOS + Android parity", summary: "RN ships to both platforms; respect each one's conventions with Platform.select and platform files.", verify: ["Platform.OS/Platform.select for divergent behavior", "Navigation/back gestures feel native on each", "Material ripple on Android, opacity on iOS"] },
  { id: "rn-secrets", name: "Secrets & permissions", summary: "Keep API keys out of the JS bundle (it's shippable plaintext); store tokens in expo-secure-store / Keychain; request only the permissions you use.", verify: ["No API keys/secrets committed in source or app.json extra", "Tokens in expo-secure-store / Keychain at runtime", "app.json declares only the iOS usage strings + Android permissions actually used"] }
];

var RN_CHECKLIST = [
  "Every touchable is ≥44pt (iOS) / 48dp (Android), or uses hitSlop to expand the hit area?",
  "Touchables have accessibilityRole and accessibilityLabel; decorative images set accessible={false}?",
  "No allowFontScaling={false}, and no fontSize below ~13?",
  "Screens use SafeAreaView / useSafeAreaInsets so content clears the notch, status bar, and home indicator?",
  "Colors adapt to light/dark via useColorScheme() + a theme — unless the app intentionally pins one mode?",
  "Platform.select / platform files handle iOS vs Android differences (ripple vs opacity, navigation)?",
  "VoiceOver (iOS) and TalkBack (Android) both announce every interactive element correctly?",
  "No API keys/secrets in the JS bundle or app.json — tokens live in expo-secure-store / Keychain?",
  "app.json declares only the iOS usage strings and Android permissions the app actually uses?",
  "Tested on a real device on both platforms (Expo Go / dev build), not just one simulator?"
];

// ── Tool 14e: audit_rn ─────────────────────────────────────────────

server.tool(
  "audit_rn",
  "Audit React Native / Expo source (JSX/TSX + StyleSheet) against the iOS HIG + Android Material conventions RN must satisfy. Flags touchables missing accessibilityLabel/accessibilityRole, touchables below 44pt without hitSlop, allowFontScaling={false}, fontSize below ~13, screens without SafeAreaView, and (for multi-mode apps) hardcoded colors with no useColorScheme/Appearance dark-mode handling. Rewards SafeAreaView, hitSlop, Platform-aware code, and a theme. RN-native checks only — no web/CSS or SwiftUI rules. Same return shape as audit_page. (RN renders to native widgets, so audit_ios_screen scores the rendered screen.)",
  {
    source: z.union([z.string(), z.array(z.string())]).describe("React Native source — a single screen/component as a string, or an array of file contents. Concatenated before analysis."),
    color_scheme: z.enum(["light", "dark", "automatic"]).optional().describe("The app's declared appearance (Expo app.json userInterfaceStyle). 'light' or 'dark' means single-mode by design — the dark-mode adaptation check is then suppressed. Default: automatic."),
    strict: z.boolean().optional().describe("Strict mode — also count warnings as failures for grading. Default: false"),
    project: z.string().optional().describe("Project identifier — resolves a saved taste surface binding (see bind_taste_surface). When the binding carries design_notes, each note is verified against the source (Animated/Reanimated, BlurView, haptics, fonts) and returned in note_assessments; missing notes count toward the grade."),
    profile: z.string().optional().describe("Taste profile owning the binding. Omit to search all stored profiles for one bound to the project.")
  },
  async ({ source, color_scheme, strict, project, profile }) => {
    var src = Array.isArray(source) ? source.join("\n") : source;
    var isStrict = strict || false;
    var issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }> = [];
    var passes: string[] = [];

    // ── Touchables: accessibility + touch target
    var touchableCount = 0, missingA11y = 0;
    var tinyTargets: string[] = [];
    var hasHitSlop = /hitSlop/.test(src);
    for (var tname of RN_TOUCHABLES) {
      var tre = new RegExp("<" + tname + "\\b", "g");
      var tm: RegExpExecArray | null;
      while ((tm = tre.exec(src)) !== null) {
        touchableCount++;
        var span = jsxOpenTag(src, tm.index);
        if (!/accessibilityLabel|accessibilityRole|accessible\s*=/.test(span)) missingA11y++;
        // Inline fixed frame under the minimum, with no hitSlop on this element.
        var wMatch = span.match(/\bwidth:\s*(\d+(?:\.\d+)?)/);
        var hMatch = span.match(/\bheight:\s*(\d+(?:\.\d+)?)/);
        if (wMatch && hMatch && parseFloat(wMatch[1]) < 44 && parseFloat(hMatch[1]) < 44 && !/hitSlop/.test(span)) {
          tinyTargets.push(wMatch[1] + "×" + hMatch[1]);
        }
      }
    }
    if (touchableCount > 0) {
      if (missingA11y === 0) passes.push("All " + touchableCount + " touchables expose accessibilityLabel/Role");
      else issues.push({ severity: "warning", rule: "rn-a11y/touchable-label", message: missingA11y + " of " + touchableCount + " touchables have no accessibilityLabel/accessibilityRole — VoiceOver and TalkBack can't announce them.", fix: "Add accessibilityRole=\"button\" and a descriptive accessibilityLabel to each Touchable/Pressable (or accessibilityState for disabled/selected)." });
    }
    if (tinyTargets.length > 0) {
      issues.push({ severity: "error", rule: "rn-touch/min-target", message: tinyTargets.length + " touchable(s) with an inline frame below 44pt and no hitSlop: " + tinyTargets.join(", "), fix: "Grow the hit area to ≥44pt (iOS) / 48dp (Android) with padding, or add hitSlop={{top:8,bottom:8,left:8,right:8}}." });
    }

    // ── Font scaling + tiny sizes
    if (/allowFontScaling\s*=\s*\{?\s*false/.test(src)) {
      issues.push({ severity: "warning", rule: "rn-typography/font-scaling", message: "allowFontScaling={false} disables Dynamic Type — text won't grow for users who need larger sizes.", fix: "Remove allowFontScaling={false} (it defaults to true). If clipping is the worry, fix the layout, not the scaling." });
    } else {
      passes.push("Text honors Dynamic Type (no allowFontScaling={false})");
    }
    var fontSizes: number[] = [];
    var fsRe = /fontSize:\s*(\d+(?:\.\d+)?)/g;
    var fsm: RegExpExecArray | null;
    while ((fsm = fsRe.exec(src)) !== null) fontSizes.push(parseFloat(fsm[1]));
    var smallFonts = Array.from(new Set(fontSizes.filter(function (n) { return n < 13; })));
    if (smallFonts.length === 0 && fontSizes.length > 0) passes.push("All " + fontSizes.length + " fontSize values ≥ 13");
    else if (smallFonts.length > 0) issues.push({ severity: "warning", rule: "rn-typography/min-size", message: "fontSize below the ~13pt readability floor: " + smallFonts.join(", "), fix: "Raise small text to ≥13. Reserve the smallest sizes for incidental metadata, not labels users must read." });

    // ── Safe areas
    var hasSafe = /SafeAreaView|useSafeAreaInsets|SafeAreaProvider/.test(src);
    var looksLikeScreen = /export default function|export default class|export const \w+ = \(\)/.test(src) && /<(View|ScrollView|KeyboardAvoidingView)\b/.test(src);
    if (hasSafe) passes.push("Handles safe areas (SafeAreaView / useSafeAreaInsets)");
    else if (looksLikeScreen) issues.push({ severity: "warning", rule: "rn-layout/safe-area", message: "Screen-level component with no SafeAreaView / useSafeAreaInsets — content can hide under the notch, status bar, or home indicator.", fix: "Wrap the screen in <SafeAreaView> (react-native-safe-area-context) or apply useSafeAreaInsets() padding." });

    // ── Dark mode (suppressed for intentionally single-mode apps)
    var hasScheme = /useColorScheme|Appearance\.|useTheme\s*\(|createTheme/.test(src);
    var hexRe = /(?:color|backgroundColor|borderColor|tintColor|shadowColor)\s*:\s*['"]#[0-9a-fA-F]{3,8}['"]/g;
    var hexCount = (src.match(hexRe) || []).length;
    if (color_scheme === "light" || color_scheme === "dark") {
      passes.push("App pins a single appearance (" + color_scheme + ") by design — dark-mode adaptation not required");
    } else if (hasScheme) {
      passes.push("Adapts to OS appearance (useColorScheme / Appearance)");
    } else if (hexCount >= 6) {
      issues.push({ severity: "warning", rule: "rn-color/dark-mode", message: hexCount + " hardcoded colors and no useColorScheme/Appearance — the UI won't adapt to light/dark.", fix: "Source colors from a theme keyed on useColorScheme(), or set userInterfaceStyle in app.json if single-mode is intended (pass color_scheme to silence this)." });
    }

    // ── Rewards
    if (hasHitSlop) passes.push("Uses hitSlop to expand hit areas");
    if (/Platform\.(OS|select)\b|\.ios\.|\.android\./.test(src)) passes.push("Handles iOS/Android differences (Platform)");

    // ── Taste fidelity: verify the binding's design_notes against the source
    var taste = await applySourceTasteNotes(tasteStore, src, "rn", issues, project, profile);

    var errors = issues.filter(function (i) { return i.severity === "error"; });
    var warnings = issues.filter(function (i) { return i.severity === "warning"; });
    var totalChecks = passes.length + issues.length;
    var failCount = isStrict ? issues.length : errors.length;

    var result: any = {
      platform: "react-native",
      score: totalChecks > 0 ? Math.round(((totalChecks - failCount) / totalChecks) * 100) : 100,
      grade: failCount === 0 ? "A" : failCount <= 2 ? "B" : failCount <= 4 ? "C" : "D",
      summary: passes.length + "/" + totalChecks + " RN checks passed" + (failCount > 0 ? " — " + failCount + " issue(s) to fix" : " — all clear"),
      passes: passes,
      errors: errors,
      warnings: isStrict ? warnings.map(function (w) { return Object.assign({}, w, { severity: "error" as const }); }) : warnings,
      fix_priority: errors.concat(warnings).map(function (i) { return i.rule + ": " + i.fix; })
    };
    if (taste) {
      result.taste_binding = { profile: taste.profile, project: taste.project, surface: taste.surface };
      result.note_assessments = taste.note_assessments;
    }

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Content design systems ─────────────────────────────────────────
// Parallel to tokens/: voice & tone guides from real brands. Content
// principles and patterns are loaded into the regular principles/pattern
// arrays and reachable through get_principles/get_pattern as well — these
// tools are the discoverable shortcuts.

server.tool(
  "list_content_systems",
  "Browse available content design systems — brand voice and tone guides from real companies (Mailchimp, GOV.UK, Shopify Polaris, Atlassian). Filter by category or search by name.",
  {
    category: z.string().optional().describe("Filter by category: marketing-saas, government, commerce-saas, productivity-saas, fintech"),
    search: z.string().optional().describe("Search by name, description, or tag")
  },
  async ({ category, search }) => {
    var registry = loadContentRegistry();
    var systems = registry.systems;
    var available = getAvailableContentSystemIds();

    if (category) {
      systems = systems.filter((s: any) => s.category === category);
    }
    if (search) {
      var q = search.toLowerCase();
      systems = systems.filter((s: any) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.tags && s.tags.some((t: string) => t.includes(q)))
      );
    }

    systems = systems.map((s: any) => ({
      ...s,
      content_available: available.includes(s.id)
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ count: systems.length, systems }, null, 2)
      }]
    };
  }
);

server.tool(
  "get_content_system",
  "Get a brand's content design system — voice attributes, tone shifts by context, vocabulary (use/avoid/never), grammar rules, content patterns for errors/empty-states/buttons/etc., and inclusive language guidance.",
  {
    id: z.string().describe("Content system ID (e.g. 'mailchimp', 'gov-uk', 'shopify-polaris', 'atlassian')"),
    section: z.enum(["all", "voice", "tone_shifts", "vocabulary", "grammar", "content-patterns", "inclusive-language"]).optional().describe("Return just one section. Default: all.")
  },
  async ({ id, section }) => {
    var sys = loadContentSystem(id);
    if (!sys) {
      return {
        content: [{
          type: "text" as const,
          text: "Content system '" + id + "' not found. Use list_content_systems to see available systems."
        }]
      };
    }

    var output: any = sys;
    if (section && section !== "all") {
      var slice: Record<string, any> = {
        "$name": sys["$name"],
        "$description": sys["$description"],
        url: sys.url
      };
      if (sys[section] !== undefined) slice[section] = sys[section];
      output = slice;
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(output, null, 2)
      }]
    };
  }
);

server.tool(
  "get_content_principles",
  "Get UX-writing principles — clarity over cleverness, active voice, error-message anatomy, inclusive language, voice vs tone, and more. Filter by the writing context (e.g. 'error messages', 'notifications', 'form labels').",
  {
    context: z.string().optional().describe("What you're writing for (e.g. 'error messages', 'onboarding copy', 'empty state', 'notification'). Omit to get all UX-writing principles."),
    format: z.enum(["full", "checklist", "brief"]).optional().describe("Output format: full (all details), checklist (implications + violations), brief (just summary). Default: full")
  },
  async ({ context, format }) => {
    var fmt = format || "full";
    var uxWriting = allPrinciples.filter(p => p.category === "ux-writing");

    var results = uxWriting;
    if (context) {
      results = uxWriting.filter(p => {
        var tagMatch = p.applies_to ? matchesTags(p.applies_to, context) : false;
        var textMatch = textSearch(p.name + " " + p.summary + " " + p.description, context);
        return tagMatch || textMatch;
      });
      if (results.length === 0) results = uxWriting;
    }

    var formatted = results.map(p => formatPrinciple(p, fmt));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          context: context || "all ux-writing principles",
          count: formatted.length,
          principles: formatted
        }, null, 2)
      }]
    };
  }
);

server.tool(
  "get_content_pattern",
  "Get content design patterns — copy recipes for error messages, empty-state copy, notifications, and form validation. Returns do's, don'ts, good/bad examples, evidence, and a checklist.",
  {
    type: z.enum(["error-messages", "empty-state-copy", "notifications", "form-validation"]).describe("Content pattern type")
  },
  async ({ type }) => {
    var pattern = allPatterns.find(p => p.id === type && p.category === "content");
    if (!pattern) {
      return {
        content: [{
          type: "text" as const,
          text: "Content pattern '" + type + "' not found. Available: error-messages, empty-state-copy, notifications, form-validation."
        }]
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(pattern, null, 2)
      }]
    };
  }
);

// ── Research / service-design / brand tools ───────────────────────

server.tool(
  "get_research_method",
  "Get research method details — qualitative (interviews, contextual inquiry, diary, field, intercept), quantitative (surveys, analytics, A/B tests, benchmarking, clickstream), or usability (moderated, unmoderated, 5-second, card sort, tree test, heuristic eval). Returns specific protocols, do/don't guidance, evidence, and a checklist. Use when the user is designing a study or asking how to measure something.",
  {
    category: z.enum(["qualitative", "quantitative", "usability", "all"]).optional().describe("Which family of methods. Default: all."),
    search: z.string().optional().describe("Search within methods by name or description.")
  },
  async ({ category, search }) => {
    var methods = loadResearchMethods();
    var result = methods;
    if (category && category !== "all") {
      result = methods.filter((m: any) => m.id && m.id.startsWith(category));
    }
    if (search) {
      var q = search.toLowerCase();
      result = result.filter((m: any) =>
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.summary && m.summary.toLowerCase().includes(q)) ||
        (m.patterns && m.patterns.some((p: any) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
        ))
      );
    }
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ count: result.length, methods: result }, null, 2)
      }]
    };
  }
);

server.tool(
  "get_metrics_framework",
  "Get a product-metrics framework — HEART (Google), AARRR/Pirate (Dave McClure), North Star Metric, Conversion Funnel, RICE Scoring, or OKRs. Returns structure, when-to-use, pitfalls, and examples. Use when the user asks 'how should we measure success?' or 'what metrics should we track?'",
  {
    id: z.string().optional().describe("Framework id (heart, aarrr, north-star-metric, conversion-funnel, rice-scoring, okrs). Omit to list all."),
    search: z.string().optional().describe("Search for a framework by name or summary.")
  },
  async ({ id, search }) => {
    var frameworks = loadMetricsFrameworks();
    var flat: any[] = [];
    for (var file of frameworks) {
      if (Array.isArray(file?.frameworks)) flat = flat.concat(file.frameworks.map((f: any) => ({ ...f, source_file: file.id })));
    }
    if (id) {
      var match = flat.find(f => f.id === id);
      if (!match) {
        return { content: [{ type: "text" as const, text: "Framework '" + id + "' not found. Available: " + flat.map(f => f.id).join(", ") }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(match, null, 2) }] };
    }
    if (search) {
      var q = search.toLowerCase();
      flat = flat.filter(f => (f.name && f.name.toLowerCase().includes(q)) || (f.summary && f.summary.toLowerCase().includes(q)));
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ count: flat.length, frameworks: flat }, null, 2) }] };
  }
);

server.tool(
  "get_service_pattern",
  "Get a service design pattern — service blueprinting, human handoff, signup-as-service, omnichannel continuity, or moments of truth / recovery. Returns patterns, do/don't guidance, evidence, and a checklist. Use when the user is designing a service flow, escalation, cross-channel experience, or moment of truth.",
  {
    type: z.enum(["service-blueprinting", "human-handoff", "signup-as-service", "omnichannel-continuity", "moments-of-truth"]).describe("Service design pattern type")
  },
  async ({ type }) => {
    var pattern = allPatterns.find(p => p.id === type && p.category === "service-design");
    if (!pattern) {
      return {
        content: [{
          type: "text" as const,
          text: "Service pattern '" + type + "' not found. Available: service-blueprinting, human-handoff, signup-as-service, omnichannel-continuity, moments-of-truth."
        }]
      };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(pattern, null, 2) }] };
  }
);

server.tool(
  "get_service_standard",
  "Get the GOV.UK Service Standard — 14 points the UK government uses to assess whether a public service is ready to launch. Widely applicable as a rigorous service-quality checklist beyond government. Use when the user asks how to evaluate a whole service.",
  async () => {
    var frameworks = loadServiceFrameworks();
    var govuk = frameworks.find((f: any) => f.id === "gov-uk-service-standard");
    if (!govuk) {
      return { content: [{ type: "text" as const, text: "GOV.UK service standard not found." }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(govuk, null, 2) }] };
  }
);

server.tool(
  "generate_service_blueprint",
  "Render a service blueprint as a self-contained HTML page. Supports two modes: (1) classic Shostack single-actor blueprint — user action, frontstage, backstage, support, evidence, pain/delight; (2) two-actor HI-loop blueprint — when `actors` is supplied, renders two swim lanes with a line of interaction between them (e.g. customer ↔ lawyer, patient ↔ doctor, buyer ↔ agent). Each actor gets their own actions, frontstage (what they see), and evidence. Optionally accepts an ideal-state to render side-by-side with the current state.",
  {
    service_name: z.string().describe("Name of the service (e.g. 'Free trial signup', 'Client intake', 'Restaurant reservation')"),
    subtitle: z.string().optional().describe("Short description or context line under the title"),
    actors: z.object({
      a: z.object({ label: z.string() }).optional().describe("Actor A label (default: 'User'). Use when you want to name the first side (e.g. 'Customer', 'Patient')."),
      b: z.object({ label: z.string() }).describe("Actor B label (e.g. 'Lawyer', 'Doctor', 'Agent'). Presence of this field switches to two-actor layout.")
    }).optional().describe("Omit for classic single-actor Shostack blueprint. Provide to render a two-swim-lane HI-loop blueprint with a line of interaction between the two sides."),
    current: z.array(z.object({
      label: z.string().describe("Step label (e.g. 'Discover', 'Sign up', 'First use')"),
      user_action: z.string().optional().describe("In single-actor: what the user does. In two-actor: what actor A does."),
      frontstage: z.string().optional().describe("In single-actor: what the user SEES (UI, agent greeting). In two-actor: what actor A sees."),
      backstage: z.string().optional().describe("What neither actor sees directly — shared systems, internal processes, back-office work"),
      support: z.string().optional().describe("Supporting processes, systems, third-party dependencies"),
      evidence: z.string().optional().describe("In single-actor: artifact user receives. In two-actor: artifact actor A has."),
      pain_point: z.string().optional().describe("Known pain point at this step (shown as red callout)"),
      delight: z.string().optional().describe("Designed moment of delight at this step (shown as green callout)"),
      actor_b: z.object({
        action: z.string().optional().describe("What actor B does in this step"),
        frontstage: z.string().optional().describe("What actor B sees — their own UI, tools, views"),
        evidence: z.string().optional().describe("Artifact actor B has — case file, notes, record")
      }).optional().describe("Only used when `actors.b` is provided. Captures the other side of the interaction.")
    })).describe("The current-state blueprint as an array of steps"),
    ideal: z.array(z.object({
      label: z.string(),
      user_action: z.string().optional(),
      frontstage: z.string().optional(),
      backstage: z.string().optional(),
      support: z.string().optional(),
      evidence: z.string().optional(),
      pain_point: z.string().optional(),
      delight: z.string().optional(),
      actor_b: z.object({
        action: z.string().optional(),
        frontstage: z.string().optional(),
        evidence: z.string().optional()
      }).optional()
    })).optional().describe("Optional ideal-state blueprint — if provided, output shows current AND ideal side-by-side")
  },
  async ({ service_name, subtitle, actors, current, ideal }) => {
    var html = generateServiceBlueprintHtml(
      { service_name, subtitle, steps: current as BlueprintStep[], actors: actors as BlueprintActors | undefined },
      ideal ? { service_name, steps: ideal as BlueprintStep[], actors: actors as BlueprintActors | undefined } : null
    );
    return { content: [{ type: "text" as const, text: html }] };
  }
);

server.tool(
  "get_brand_principles",
  "Get brand and visual-design principles — logo usage (clear space, min sizes, variants, placement, restraint), gradient usage (hierarchy, palette, contrast, trend vs signature), imagery (consistency, representation, purpose), visual hierarchy, and brand-as-system thinking. Use when the user asks about branding, logos, gradients, imagery, visual consistency, or how to treat a brand across surfaces.",
  {
    topic: z.string().optional().describe("Filter by topic: 'logo', 'gradient', 'imagery', 'hierarchy', 'system', or a freeform search term. Omit to return all brand principles."),
    format: z.enum(["full", "checklist", "brief"]).optional().describe("Output format. Default: full.")
  },
  async ({ topic, format }) => {
    var fmt = format || "full";
    var brand = allPrinciples.filter(p => p.category === "brand");
    var results = brand;
    if (topic) {
      var q = topic.toLowerCase();
      results = brand.filter(p => {
        var idMatch = p.id.toLowerCase().includes(q);
        var nameMatch = p.name.toLowerCase().includes(q);
        var appliesMatch = p.applies_to ? matchesTags(p.applies_to, topic) : false;
        var textMatch = textSearch(p.name + " " + p.summary + " " + p.description, topic);
        return idMatch || nameMatch || appliesMatch || textMatch;
      });
      if (results.length === 0) results = brand;
    }
    var formatted = results.map(p => formatPrinciple(p, fmt));
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ topic: topic || "all brand principles", count: formatted.length, principles: formatted }, null, 2)
      }]
    };
  }
);

server.tool(
  "get_brand_trends",
  "Get current brand and visual-design trends — what's working in 2026 and where each trend fits or fails. Includes bento grids, monospace type, neon-on-dark-glass, generative patterns, brutalism rebound, AI-generated imagery, lowercase/mixed case. Each trend is time-stamped — treat as a calibration signal, not a prescription.",
  async () => {
    var trends = loadBrandTrends();
    return { content: [{ type: "text" as const, text: JSON.stringify({ count: trends.length, trends: trends }, null, 2) }] };
  }
);

// ── Creative studio tools ───────────────────────────────────────────

server.tool(
  "list_creative_models",
  "Browse Raven's provider-agnostic creative model catalog. These are capability slots for image, video, 3D, audio, character consistency, and creative analysis. Use a configured RAVEN_CREATIVE_RUNNER to route jobs to any local CLI or API wrapper.",
  {
    media_type: z.enum(["image", "video", "audio", "3d", "campaign", "analysis"]).optional().describe("Filter by media type."),
    capability: z.string().optional().describe("Filter by capability, e.g. product-photoshoot, text-to-video, brand-kit, ugc-ad.")
  },
  async function (params: { media_type?: string; capability?: string }) {
    var models = CREATIVE_MODEL_CATALOG.slice();
    if (params.media_type) models = models.filter(function (m) { return m.media_type === params.media_type; });
    if (params.capability) {
      var q = params.capability.toLowerCase();
      models = models.filter(function (m) {
        return (m.capabilities || []).some(function (c: string) { return c.toLowerCase().includes(q); }) ||
          (m.best_for || []).some(function (b: string) { return b.toLowerCase().includes(q); });
      });
    }
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: models.length,
          models: models,
          execution: {
            default: "draft payload only",
            runner_env: "RAVEN_CREATIVE_RUNNER",
            runner_contract: "Executable reads one job JSON object from stdin and returns JSON on stdout."
          }
        }, null, 2)
      }]
    };
  }
);

server.tool(
  "list_creative_presets",
  "Browse Raven creative presets for product photoshoots, marketplace cards, UGC ads, TV spots, cinematic reveals, social launch packs, storyboards, and infographics.",
  {
    media_type: z.enum(["image", "video", "campaign"]).optional().describe("Filter presets by media type."),
    search: z.string().optional().describe("Search preset name or description.")
  },
  async function (params: { media_type?: string; search?: string }) {
    var presets = CREATIVE_PRESETS.slice();
    if (params.media_type) presets = presets.filter(function (p) { return p.media_type === params.media_type; });
    if (params.search) {
      var q = params.search.toLowerCase();
      presets = presets.filter(function (p) { return (p.id + " " + p.description + " " + p.prompt_frame).toLowerCase().includes(q); });
    }
    return { content: [{ type: "text" as const, text: JSON.stringify({ count: presets.length, presets: presets }, null, 2) }] };
  }
);

server.tool(
  "create_brand_profile",
  "Create or update a local brand profile used by Raven creative jobs. Stores colors, fonts, tone, audience, constraints, product notes, and asset references locally under ~/.raven/creative by default.",
  {
    name: z.string().describe("Brand or project name."),
    id: z.string().optional().describe("Optional stable ID. If omitted, Raven creates one from the name."),
    description: z.string().optional().describe("What the brand/product is."),
    colors: z.array(z.string()).optional().describe("Brand colors, preferably hex or token names."),
    fonts: z.array(z.string()).optional().describe("Brand fonts or type guidance."),
    tone: z.string().optional().describe("Voice and tone guidance."),
    audience: z.string().optional().describe("Primary audience/customer."),
    product: z.string().optional().describe("Product or offer notes."),
    constraints: z.array(z.string()).optional().describe("Rules to honor: no claims, legal notes, visual constraints."),
    asset_ids: z.array(z.string()).optional().describe("Existing Raven creative asset IDs tied to this brand.")
  },
  async function (params: any) {
    var id = params.id ? safeRecordId(params.id) : safeRecordId(params.name);
    var record = writeCreativeRecord("brands", {
      id: id,
      name: params.name,
      description: params.description || "",
      colors: params.colors || [],
      fonts: params.fonts || [],
      tone: params.tone || "",
      audience: params.audience || "",
      product: params.product || "",
      constraints: params.constraints || [],
      asset_ids: params.asset_ids || []
    });
    return { content: [{ type: "text" as const, text: JSON.stringify({ brand_profile: record, storage: recordPath("brands", record.id) }, null, 2) }] };
  }
);

server.tool(
  "get_brand_profile",
  "Read a local Raven creative brand profile by ID.",
  {
    id: z.string().describe("Brand profile ID.")
  },
  async function (params: { id: string }) {
    var record = readCreativeRecord("brands", params.id, true);
    if (!record) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Brand profile not found", id: params.id }, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(record, null, 2) }] };
  }
);

server.tool(
  "list_brand_profiles",
  "List local Raven creative brand profiles.",
  async function () {
    var brands = listCreativeRecords("brands");
    return { content: [{ type: "text" as const, text: JSON.stringify({ count: brands.length, brands: brands.map(summarizeCreativeRecord) }, null, 2) }] };
  }
);

server.tool(
  "register_creative_asset",
  "Register a local or remote creative asset for Raven jobs. This is the local-first analog of upload: Raven stores metadata and a URI/path, not the file bytes.",
  {
    uri: z.string().describe("Local path or URL to the asset."),
    type: z.enum(["image", "video", "audio", "document", "3d", "url", "other"]).describe("Asset type."),
    name: z.string().optional().describe("Human-readable name."),
    description: z.string().optional().describe("What this asset should be used for."),
    tags: z.array(z.string()).optional().describe("Search tags."),
    metadata: z.record(z.any()).optional().describe("Optional non-secret metadata.")
  },
  async function (params: any) {
    var isUrl = /^https?:\/\//i.test(params.uri);
    var warnings: string[] = [];
    if (!isUrl && !fsExists(params.uri)) {
      warnings.push("Local path does not exist on this machine right now; record saved as a reference only.");
    }
    var record = writeCreativeRecord("assets", {
      id: makeRecordId("asset", params.name || params.type),
      name: params.name || params.uri.split("/").pop() || params.type,
      uri: params.uri,
      type: params.type,
      description: params.description || "",
      tags: params.tags || [],
      metadata: params.metadata || {},
      warnings: warnings
    });
    return { content: [{ type: "text" as const, text: JSON.stringify({ asset: record, storage: recordPath("assets", record.id) }, null, 2) }] };
  }
);

server.tool(
  "create_character_profile",
  "Create a local character/identity reference profile for consistent image or video generation. Raven stores reference asset IDs and provider-training payloads; actual identity training happens only through a configured provider runner.",
  {
    name: z.string().describe("Character, spokesperson, founder, avatar, or product persona name."),
    reference_asset_ids: z.array(z.string()).min(1).describe("Raven creative asset IDs for reference images/videos."),
    id: z.string().optional().describe("Optional stable ID."),
    description: z.string().optional().describe("Visual/personality description."),
    consistency_notes: z.string().optional().describe("What must stay consistent across generations."),
    provider_training_id: z.string().optional().describe("External provider training/character ID if already trained."),
    metadata: z.record(z.any()).optional().describe("Optional non-secret metadata.")
  },
  async function (params: any) {
    var refs = loadOptionalCreativeRefs("assets", params.reference_asset_ids);
    var missing = params.reference_asset_ids.filter(function (id: string) {
      return !refs.some(function (r) { return r.id === safeRecordId(id); });
    });
    var id = params.id ? safeRecordId(params.id) : makeRecordId("character", params.name);
    var record = writeCreativeRecord("characters", {
      id: id,
      name: params.name,
      reference_asset_ids: params.reference_asset_ids.map(safeRecordId),
      description: params.description || "",
      consistency_notes: params.consistency_notes || "",
      provider_training_id: params.provider_training_id || null,
      status: params.provider_training_id ? "trained_external" : "reference_set_ready",
      missing_reference_asset_ids: missing,
      metadata: params.metadata || {},
      training_payload: {
        name: params.name,
        reference_assets: refs.map(function (r) { return { id: r.id, uri: r.uri, type: r.type }; }),
        description: params.description || "",
        consistency_notes: params.consistency_notes || ""
      }
    });
    return { content: [{ type: "text" as const, text: JSON.stringify({ character_profile: record, storage: recordPath("characters", record.id) }, null, 2) }] };
  }
);

server.tool(
  "create_generation_job",
  "Create a Raven creative generation job for image, video, 3D, audio, campaign, or analysis. Returns a brand-aware provider payload. If execute=true and RAVEN_CREATIVE_RUNNER is configured, Raven submits the job to that local runner.",
  {
    media_type: z.enum(["image", "video", "audio", "3d", "campaign", "analysis"]).describe("Output type."),
    prompt: z.string().describe("Creative request."),
    objective: z.string().optional().describe("Business or audience goal."),
    model: z.string().optional().describe("Raven model slot or external provider model ID."),
    provider: z.string().optional().describe("Provider label for the downstream runner."),
    preset: z.string().optional().describe("Preset ID from list_creative_presets."),
    brand_profile_id: z.string().optional().describe("Local Raven brand profile ID."),
    character_profile_id: z.string().optional().describe("Local Raven character profile ID."),
    reference_asset_ids: z.array(z.string()).optional().describe("Local Raven creative asset IDs."),
    aspect_ratio: z.string().optional().describe("Target aspect ratio, e.g. 1:1, 16:9, 9:16."),
    duration_seconds: z.number().positive().max(600).optional().describe("Video/audio duration."),
    output_count: z.number().int().min(1).max(100).optional().describe("Number of variants to request."),
    quality: z.enum(["draft", "standard", "high", "4k"]).optional().describe("Requested quality tier."),
    channel: z.string().optional().describe("Target channel, e.g. TikTok, YouTube Shorts, blog, marketplace."),
    execute: z.boolean().optional().describe("Submit through RAVEN_CREATIVE_RUNNER now. Default false.")
  },
  async function (params: any) {
    var payload = buildGenerationPayload(params);
    var job = writeCreativeRecord("jobs", {
      id: makeRecordId("job", params.media_type),
      status: params.execute ? "submitting" : "draft",
      media_type: params.media_type,
      prompt: params.prompt,
      objective: params.objective || "",
      model: payload.model,
      provider: payload.provider,
      preset: payload.preset,
      brand_profile_id: params.brand_profile_id ? safeRecordId(params.brand_profile_id) : null,
      character_profile_id: params.character_profile_id ? safeRecordId(params.character_profile_id) : null,
      reference_asset_ids: (params.reference_asset_ids || []).map(safeRecordId),
      provider_payload: payload,
      outputs: []
    });
    if (params.execute) {
      var runnerResult = runCreativeRunner(job);
      job.status = runnerResult.status;
      job.runner = runnerResult;
      if (runnerResult.result && Array.isArray(runnerResult.result.outputs)) job.outputs = runnerResult.result.outputs;
      job = writeCreativeRecord("jobs", job);
    }
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          job: job,
          next_step: job.status === "draft"
            ? "Review provider_payload or call create_generation_job with execute=true after configuring RAVEN_CREATIVE_RUNNER."
            : "Check get_generation_job for status and outputs."
        }, null, 2)
      }]
    };
  }
);

server.tool(
  "get_generation_job",
  "Read a Raven creative generation job by ID.",
  {
    id: z.string().describe("Generation job ID.")
  },
  async function (params: { id: string }) {
    var job = readCreativeRecord("jobs", params.id, true);
    if (!job) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Generation job not found", id: params.id }, null, 2) }] };
    return { content: [{ type: "text" as const, text: JSON.stringify(job, null, 2) }] };
  }
);

server.tool(
  "list_generation_jobs",
  "List local Raven creative generation jobs.",
  {
    status: z.string().optional().describe("Filter by status: draft, needs_runner, submitted, completed, failed."),
    media_type: z.enum(["image", "video", "audio", "3d", "campaign", "analysis"]).optional().describe("Filter by media type."),
    limit: z.number().int().min(1).max(100).optional().describe("Max jobs to return. Default 25.")
  },
  async function (params: { status?: string; media_type?: string; limit?: number }) {
    var jobs = listCreativeRecords("jobs").sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
    if (params.status) jobs = jobs.filter(function (j) { return j.status === params.status; });
    if (params.media_type) jobs = jobs.filter(function (j) { return j.media_type === params.media_type; });
    jobs = jobs.slice(0, params.limit || 25);
    return { content: [{ type: "text" as const, text: JSON.stringify({ count: jobs.length, jobs: jobs.map(summarizeCreativeRecord) }, null, 2) }] };
  }
);

server.tool(
  "plan_creative_campaign",
  "Plan a multi-asset creative campaign and optionally create draft generation jobs. Covers Higgsfield-like workflows: product photos, UGC/video ads, marketplace cards, launch/social packs, storyboards, and channel cutdowns.",
  {
    campaign_name: z.string().describe("Campaign name."),
    product_or_offer: z.string().describe("Product, service, feature, or offer."),
    audience: z.string().describe("Target audience."),
    goal: z.enum(["awareness", "conversion", "retention", "launch", "research", "sales"]).describe("Primary campaign goal."),
    channels: z.array(z.string()).min(1).describe("Target channels: TikTok, Reels, YouTube Shorts, web, marketplace, LinkedIn, etc."),
    brand_profile_id: z.string().optional().describe("Local Raven brand profile ID."),
    source_asset_ids: z.array(z.string()).optional().describe("Raven creative asset IDs to use as source/reference."),
    formats: z.array(z.string()).optional().describe("Preset IDs to force. Defaults inferred from channels."),
    variants_per_format: z.number().int().min(1).max(5).optional().describe("How many draft job variants per format. Default 2."),
    create_jobs: z.boolean().optional().describe("Create draft generation jobs. Default true.")
  },
  async function (params: any) {
    var formats = params.formats && params.formats.length ? params.formats.map(safeRecordId) : channelFormats(params.channels);
    var variants = params.variants_per_format || 2;
    var createJobs = params.create_jobs !== false;
    var brand = params.brand_profile_id ? readCreativeRecord("brands", params.brand_profile_id, true) : null;
    var jobs: any[] = [];
    var shotList: any[] = [];

    for (var format of formats) {
      var preset = getCreativePreset(format) || { id: format, media_type: "image", default_outputs: ["variant"], prompt_frame: "" };
      var outputs = (preset.default_outputs || ["variant"]).slice(0, variants);
      for (var i = 0; i < outputs.length; i++) {
        var beat = outputs[i];
        var prompt = params.product_or_offer + " for " + params.audience + ". Format: " + preset.id + ". Variant: " + beat + ". Goal: " + params.goal + ".";
        var mediaType = preset.media_type === "campaign" ? "image" : preset.media_type;
        var jobParams = {
          media_type: mediaType,
          prompt: prompt,
          objective: params.goal,
          preset: preset.id,
          brand_profile_id: params.brand_profile_id,
          reference_asset_ids: params.source_asset_ids || [],
          channel: params.channels.join(", "),
          output_count: 1,
          quality: "standard"
        };
        var payload = buildGenerationPayload(jobParams);
        var planned = {
          format: preset.id,
          variant: beat,
          media_type: mediaType,
          prompt: prompt,
          provider_payload: payload
        };
        shotList.push(planned);
        if (createJobs) {
          var saved = writeCreativeRecord("jobs", {
            id: makeRecordId("job", preset.id),
            status: "draft",
            media_type: mediaType,
            prompt: prompt,
            objective: params.goal,
            model: payload.model,
            provider: payload.provider,
            preset: preset.id,
            brand_profile_id: params.brand_profile_id ? safeRecordId(params.brand_profile_id) : null,
            character_profile_id: null,
            reference_asset_ids: (params.source_asset_ids || []).map(safeRecordId),
            provider_payload: payload,
            outputs: []
          });
          jobs.push(summarizeCreativeRecord(saved));
        }
      }
    }

    var campaign = writeCreativeRecord("campaigns", {
      id: makeRecordId("campaign", params.campaign_name),
      name: params.campaign_name,
      product_or_offer: params.product_or_offer,
      audience: params.audience,
      goal: params.goal,
      channels: params.channels,
      brand_profile_id: params.brand_profile_id ? safeRecordId(params.brand_profile_id) : null,
      brand_snapshot: brand ? { name: brand.name, tone: brand.tone, colors: brand.colors } : null,
      formats: formats,
      source_asset_ids: (params.source_asset_ids || []).map(safeRecordId),
      shot_list: shotList,
      job_ids: jobs.map(function (j) { return j.id; })
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          campaign: campaign,
          jobs_created: jobs,
          coverage: {
            product_photos: formats.includes("product-photoshoot") || formats.includes("marketplace-cards"),
            short_video_ads: formats.includes("ugc-ad") || formats.includes("tv-spot") || formats.includes("cinematic-reveal"),
            social_launch_pack: formats.includes("social-pack"),
            brand_aware: !!brand
          }
        }, null, 2)
      }]
    };
  }
);

server.tool(
  "score_creative",
  "Score a creative prompt, script, or ad concept for hook strength, benefit clarity, product signal, call-to-action, channel fit, audience fit, and brand fit. This is a transparent heuristic, not a proprietary prediction model.",
  {
    creative_text: z.string().describe("Prompt, script, ad copy, or creative concept to score."),
    channel: z.string().optional().describe("Target channel."),
    brand_profile_id: z.string().optional().describe("Local Raven brand profile ID."),
    audience: z.string().optional().describe("Target audience if not in a brand profile.")
  },
  async function (params: any) {
    var brand = params.brand_profile_id ? readCreativeRecord("brands", params.brand_profile_id, true) : null;
    var audience = params.audience || (brand && brand.audience) || "";
    var result = scoreCreativeText(params.creative_text, params.channel, brand, audience);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ...result, channel: params.channel || null, audience: audience || null, brand_profile_id: brand ? brand.id : null }, null, 2) }] };
  }
);

// ── Cross-page consistency audit ─────────────────────────────────────
// audit_consistency: takes ≥2 pages ({name, html}) and flags divergence in
// content-container width and hero heading tier across the corpus. Addresses
// GitHub issue #9 — the single-blob audit blind spot where each page passes
// audit_page clean but the pages disagree with each other.

server.tool(
  "audit_consistency",
  "Audit multiple pages for cross-page consistency of content-container width and hero heading tier. Pass ≥2 pages ({name, html}) collected from different routes on the same site. Infers the canonical (modal) value from the corpus when no token is supplied, so you need not know the project's design token in advance. Flags the issue #9 single-blob blind spot: pages that each pass audit_page but silently disagree with each other on container width or hero size class. Returns per-page extraction (container_px, container_classes, hero_classes, signatures), consistency dimensions with reference values, outlier page names, issues[], score (100/50/0 → A/C/D), and a plain-text summary. Pure offline — no browser, no network.",
  {
    pages: z.array(
      z.object({
        name: z.string().min(1).describe("Page route or label (e.g. \"/\", \"/changelog\", \"get-started\")."),
        html: z.string().min(1).describe("Full HTML source for the page, including any <style> blocks.")
      })
    ).min(2).describe("At least 2 pages to compare. Each entry is {name, html}."),
    container_token: z.number().optional().describe("Project's canonical container width in px (e.g. 1152). When supplied, container divergence is measured against this token rather than the corpus modal."),
    hero_token: z.string().optional().describe("Canonical hero heading class signature (e.g. \"text-display-xl\" or \"64\"). When supplied, hero divergence is measured against this token rather than the corpus modal.")
  },
  async function(params: { pages: Array<{ name: string; html: string }>; container_token?: number; hero_token?: string }) {
    if (!params.pages || params.pages.length < 2) {
      return {
        content: [{
          type: "text" as const,
          text: "Provide at least 2 pages ({name, html}) to compare for cross-page consistency."
        }]
      };
    }
    var result = auditConsistency(params.pages, {
      container_token: params.container_token,
      hero_token: params.hero_token
    });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// ── Reflection ─────────────────────────────────────────────────────
// Summarize the local usage log so the user (or Claude acting on their
// behalf) can see what Raven is being asked to do, and what it's often
// missing. Feeds the "Raven gets smarter from how you use it" loop —
// nothing leaves the machine unless the user chooses to share.

server.tool(
  "raven_reflect",
  "Summarize how Raven has been used on this machine over the last N days. Reports which tools are called most, which audit warnings fire repeatedly (→ likely gaps in Raven's knowledge), which patterns and design systems you look up, and which companies you ask for brand styles. Call this when the user asks 'what have I been building with Raven' or 'what's Raven missing'. All data is read from a local log ($RAVEN_USAGE_LOG or ~/.raven/usage.jsonl) — nothing is fetched over the network.",
  {
    days: z.number().int().min(1).max(365).optional().describe("How many days back to include. Default: 30.")
  },
  async function (params: { days?: number }) {
    if (!USAGE_LOG_ENABLED) {
      return { content: [{ type: "text" as const, text: "Usage logging is disabled on this machine (RAVEN_NO_USAGE_LOG=1). No data to reflect on." }] };
    }
    var days = params.days || 30;
    var entries = readUsageSince(days);
    if (entries.length === 0) {
      return { content: [{ type: "text" as const, text: "No usage logged in the last " + days + " days. Log path: " + USAGE_LOG_PATH }] };
    }

    var toolCounts: Record<string, number> = {};
    var warningCounts: Record<string, number> = {};
    var patternTypes: Record<string, number> = {};
    var systemsLookedUp: Record<string, number> = {};
    var brandsLookedUp: Record<string, number> = {};
    var searchLayers: Record<string, number> = {};
    var auditScores: number[] = [];

    for (var e of entries) {
      toolCounts[e.tool] = (toolCounts[e.tool] || 0) + 1;
      var ins = e.insight || {};
      if (Array.isArray(ins.warnings)) {
        for (var w of ins.warnings) warningCounts[w] = (warningCounts[w] || 0) + 1;
      }
      if (typeof ins.score === "number") auditScores.push(ins.score);
      if (e.tool === "get_pattern" && ins.type) patternTypes[ins.type] = (patternTypes[ins.type] || 0) + 1;
      if (e.tool === "get_design_system" && ins.system) systemsLookedUp[ins.system] = (systemsLookedUp[ins.system] || 0) + 1;
      if (e.tool === "get_brand_system" && ins.company) brandsLookedUp[ins.company] = (brandsLookedUp[ins.company] || 0) + 1;
      if (e.tool === "search_knowledge" && ins.layer) searchLayers[ins.layer] = (searchLayers[ins.layer] || 0) + 1;
    }

    function topN<T extends string | number>(counts: Record<T, number>, n: number): Array<[T, number]> {
      return Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, n) as Array<[T, number]>;
    }

    var avgScore = auditScores.length ? Math.round(auditScores.reduce((a, b) => a + b, 0) / auditScores.length) : null;

    var firstT = entries[0].t;
    var lastT = entries[entries.length - 1].t;

    var summary = {
      window: { days: days, first_call: firstT, last_call: lastT, total_calls: entries.length },
      tool_usage: Object.fromEntries(topN(toolCounts, 20)),
      audit: {
        calls: auditScores.length,
        avg_score: avgScore,
        recurring_warnings: Object.fromEntries(topN(warningCounts, 15))
      },
      patterns_requested: Object.fromEntries(topN(patternTypes, 10)),
      design_systems_used: Object.fromEntries(topN(systemsLookedUp, 10)),
      brand_styles_requested: Object.fromEntries(topN(brandsLookedUp, 10)),
      search_layers: Object.fromEntries(topN(searchLayers, 5)),
      log_location: USAGE_LOG_PATH,
      gap_hints: (topN(warningCounts, 5) as Array<[string, number]>)
        .filter(([, count]) => count >= Math.max(3, Math.floor(entries.length * 0.05)))
        .map(([rule, count]) => ({
          rule: rule,
          fired_times: count,
          interpretation: "Fires often across your work — may indicate a pattern or principle missing from Raven's knowledge base. Consider filing a knowledge-request issue on GitHub."
        }))
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(summary, null, 2)
      }]
    };
  }
);

// ── Registration ───────────────────────────────────────────────────

var REGISTER_API = "https://ravenmcp.ai/api/welcome";

server.tool(
  "raven_register",
  "Register your email to receive design updates and provide feedback to the Raven creator. Call this when a user wants to register, give feedback, or connect with the Raven team.",
  {
    email: z.string().email().describe("User's email address"),
    name: z.string().optional().describe("User's name (optional)")
  },
  async function(params: { email: string; name?: string }) {
    try {
      var response = await fetch(REGISTER_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: params.email, name: params.name || "" })
      });

      if (!response.ok) {
        var err = await response.json() as { error?: string };
        return {
          content: [{
            type: "text" as const,
            text: "Registration failed: " + (err.error || "Unknown error")
          }]
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: "Registered! A welcome email has been sent to " + params.email + " from Drew Cunliffe (Raven's creator). It includes quick-start tips and a direct line for feedback. Check your inbox."
        }]
      };
    } catch (e) {
      return {
        content: [{
          type: "text" as const,
          text: "Couldn't reach the registration server. The user can email drew@ravenmcp.ai directly for updates and feedback."
        }]
      };
    }
  }
);

// ── Tool 57: audit_video_playback ─────────────────────────────────

server.tool(
  "audit_video_playback",
  "Render a page in headless Chromium and observe whether each <video> actually advances (samples currentTime before/after a play attempt), classifying every clip into playing|paused|stalled|empty|error with a reason. Catches black/non-playing videos that static audits miss — the most common real-world defect on marketing sites with video backgrounds. Pass url to render + observe, or dom_snapshot to classify pre-collected observations without a browser.",
  {
    url: z.string().optional().describe("URL to render and observe (http/https or file://). Requires headless chromium."),
    dom_snapshot: z.array(z.object({
      selector: z.string().describe("CSS selector identifying the video element"),
      hasSource: z.boolean().describe("True if currentSrc is non-empty OR the element has a src attribute or <source> child"),
      readyState: z.number().describe("HTMLMediaElement.readyState (0..4)"),
      networkState: z.number().describe("HTMLMediaElement.networkState (0..3; 3=NETWORK_NO_SOURCE)"),
      errorCode: z.number().describe("MediaError.code (0=none, 1=aborted, 2=network, 3=decode, 4=src-not-supported)"),
      paused: z.boolean().describe("True if the element is paused"),
      autoplayBlocked: z.boolean().describe("True if play() was rejected with NotAllowedError"),
      currentTimeStart: z.number().describe("currentTime recorded before the play attempt"),
      currentTimeEnd: z.number().describe("currentTime recorded after the observe window")
    })).optional().describe("Pre-collected video observations to classify without rendering (deterministic path)"),
    observeMs: z.number().optional().describe("Milliseconds to wait between currentTime samples after play() attempt. Default: 1000")
  },
  async function({ url, dom_snapshot, observeMs }) {
    if (url !== undefined && url !== null) {
      try {
        var vr = await auditVideoPlaybackUrl(url, { observeMs: observeMs });
        return { content: [{ type: "text" as const, text: JSON.stringify(vr, null, 2) }] };
      } catch (error) {
        if (error instanceof CaptureUnavailableError) {
          return { content: [{ type: "text" as const, text: "audit_video_playback url mode needs headless chromium. Run: npx playwright install chromium — or pass a dom_snapshot instead." }] };
        }
        throw error;
      }
    }
    if (dom_snapshot !== undefined && dom_snapshot !== null) {
      // Same aggregator the browser path uses → identical VideoPlaybackResult
      // shape (url is null since no page was rendered).
      var snapResult = auditVideoPlaybackSnapshot(dom_snapshot, null);
      return { content: [{ type: "text" as const, text: JSON.stringify(snapResult, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: "Provide either url (render + observe) or dom_snapshot (classify supplied observations). See tool schema for dom_snapshot field shapes." }] };
  }
);

// ── Taste Engine: profiles, growth loop, and taste audits ──────────────────

server.tool(
  "create_taste_profile",
  "Create (or overwrite) a named taste profile — a portable design-judgment ruleset + precedent corpus persisted locally under ~/.raven/taste/<name>.json (override dir with RAVEN_TASTE_HOME). Pass explicit rules[] (rule_id, clause_text, category, severity_default block|warn|nit, negative_prompt, owner taste|raven, delegate_to), and/or a DESIGN.md-style markdown doc to ingest (## headings = categories; '- ' bullets = rules; '(block)'/'(warn)'/'(nit)' severity markers; '(raven:<tool>)' delegates a rule to an existing Raven audit tool; '(scope:<surface>)' scopes a rule to one surface; 'Do NOT …' sentences become the rule's negative prompt). Ingest RULES-SHAPED docs only (actionable design constraints under category headings) — brand-story/mythology docs produce noise rules, not judgment. Local-first: nothing leaves the machine.",
  {
    name: z.string().min(1).describe("Profile name (becomes <name>.json; lowercase alnum/dash/underscore)."),
    rules: z.array(z.object({
      rule_id: z.string().describe("Stable unique id, e.g. COLOR-no-gradient."),
      clause_text: z.string().describe("The rule stated as a positive clause."),
      category: z.string().describe("color | typography | layout | spacing | voice | tokens | motion | …"),
      severity_default: z.enum(["block", "warn", "nit"]),
      negative_prompt: z.string().optional().describe("'Do NOT …' phrasing. A parenthesized comma-list becomes a deterministic banned-word scan ONLY when its sentence is about vocabulary (use/say/write/words/verbs/phrases…), e.g. 'Do NOT use persuasion verbs (proven, shipped, unlock)'. Descriptive example lists ('project facts (counts, scope)') are ignored."),
      owner: z.enum(["taste", "raven"]).optional().describe("raven = measured by an existing Raven audit tool named in delegate_to."),
      delegate_to: z.string().optional().describe("Raven tool that owns the measurement (required when owner is raven)."),
      scope: z.string().optional().describe("Surface this rule applies to (e.g. portfolio-monochrome). Omit or 'global' = applies everywhere. Scoped rules activate when audit_taste is called with a matching surface, are skipped on a non-matching one, and warn (never block) when surface is omitted.")
    })).optional().describe("Explicit rule objects."),
    corpus: z.array(z.object({
      artifact: z.string(),
      verdict: z.enum(["accept", "revise", "reject"]),
      violated_rule: z.string(),
      severity: z.enum(["block", "warn", "nit"]).optional(),
      wrong: z.string(),
      right: z.string()
    })).optional().describe("Seed precedent records."),
    markdown: z.string().optional().describe("DESIGN.md-style markdown to ingest as rules.")
  },
  async function ({ name, rules, corpus, markdown }) {
    var profile = await createTasteProfile(tasteStore, { name: name, rules: rules, corpus: corpus, markdown: markdown });
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "create_taste_profile", name: profile.name, rules: profile.rules.length, corpus: profile.corpus.length, home: (remote && hasUserStore) ? "cloud:per-user" : (process.env.RAVEN_TASTE_HOME ? "RAVEN_TASTE_HOME" : "~/.raven/taste") }, null, 2) }] };
  }
);

server.tool(
  "get_taste_profile",
  "Load a locally stored taste profile by name — returns its full rule catalog, precedent corpus, and per-project surface bindings. NOT a calibration step: bindings are per-surface and do not transfer — for design work on a project without a binding, call get_taste_interview and ask the user its questions before committing any direction.",
  { name: z.string().min(1).describe("Profile name.") },
  async function ({ name }) {
    var bindingsOut = await listSurfaceBindings(tasteStore, name);
    var profileOut = Object.assign({}, await getTasteProfile(tasteStore, name), {
      surfaces: bindingsOut,
      kickoff_reminder: "Bindings are per-surface and do NOT transfer between projects. Starting design work on a project that is not in `surfaces`? Reading this profile does not calibrate it — call get_taste_interview with the new project name, ask the USER its questions, and bind_taste_surface the answers BEFORE committing any design direction, palette, type choice, or name."
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(profileOut, null, 2) }] };
  }
);

server.tool(
  "get_taste_interview",
  "START HERE on a NEW project: returns a deterministic calibration interview — built from the taste profile's own voice/tone rules and eleven design dimensions (typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries), each grounded in what the profile already enforces and most carrying multiple-choice options — the libraries question names specialty tech (three.js, GSAP, anime.js, framer-motion, lottie, GraphQL, vanilla) in plain outcome language so a non-technical person can choose by what users would see, and states the default build target for sites: a Next.js app, unless the user prefers otherwise — asking how the taste should show up on THIS surface (e.g. a monochrome portfolio wants the one-accent rule at full block; a product site doesn't want monochrome suggestions at all, and may tolerate a warmer voice). The voice question always renders the same message in three registers (formal-technical / warm-conversational / punchy-editorial) so the user picks by ear, not by adjective — asked even when the profile has zero voice rules. Every question carries skippable + priority ('core'|'extended'); only identity is required — skipping the rest is fine but leaves that item uncalibrated and silent in future audits. A 'references' question invites example URLs/screenshots/files, each interviewed with follow-ups about what specifically draws the person (element + quality), folded into the matching design_notes and listed under design_notes.references. The interview closes with an open-ended 'special' question (any texture, signature detail, motif, or easter egg nothing else asked about — stored as design_notes.special); once the person has other bound surfaces, it carries `suggestions` — the special touches they chose elsewhere — so the interview starts proposing their own style back. Ask the user the returned questions conversationally, then persist the answers with bind_taste_surface (dimension answers go in design_notes). Run this BEFORE the first audit_taste on any project that has no binding yet — audit results include a calibration_hint when calibration is missing. When a user dislikes generated/designed output on an ALREADY-calibrated project, re-run with mode:'refine' instead of starting over — dissatisfaction is a calibration signal, not a dead end: it requires an existing binding, then interviews what specifically fell short, offers to keep/tighten/replace each stored design_notes value, re-asks voice, and offers to log a reject precedent via label_finding. mode defaults to 'kickoff'.",
  {
    profile: z.string().min(1).describe("Taste profile name (see list_taste_profiles)."),
    project: z.string().optional().describe("Project identifier the binding will be saved under, e.g. 'raven-mcp' or 'portfolio'. Include it so the interview can show any existing binding."),
    mode: z.enum(["kickoff", "refine"]).optional().describe("'kickoff' (default) calibrates a project with no binding yet. 'refine' re-interviews an ALREADY-bound project after the user rejects generated/designed output — requires an existing binding (throws naming get_taste_interview kickoff otherwise) and asks what fell short, then per-dimension keep/tighten/replace, then voice, then an optional reject precedent.")
  },
  async function ({ profile, project, mode }) {
    return { content: [{ type: "text" as const, text: JSON.stringify(await getTasteInterview(tasteStore, profile, project, mode), null, 2) }] };
  }
);

server.tool(
  "bind_taste_surface",
  "Persist a project's surface calibration for a taste profile — the answers from get_taste_interview. A binding records: the surface string scoped rules match against (e.g. 'product-site'), URL hosts that identify the project in url-mode audits, per-rule severity overrides (block|warn|nit|off — 'off' silences a rule on this surface), an optional voice/tone note, per-dimension design_notes (typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries, special — the interview's design:* answers), and a first-class `references` array — the example sites the person pointed to. References are NOT lossy prose: each url is captured live and its PageTraits (scheme, luminance, animation/scroll motion, text density) are stored on the binding, then design_notes are consistency-checked against what the references ACTUALLY are. A 'dark, cinematic' color note against two references that both render light comes back as a consistency_warning to surface to the user. Upserts by project name (~/.raven/taste/<profile>.surfaces.json). When the design_notes name an expensive technique (three.js/WebGL, GSAP scroll choreography, anime.js staggered motion, glassmorphism, a branded loader, lottie, kinetic display type…), the result carries build_hints — a concrete recipe + canonical public example sources per technique, so the builder sees the HOW at kickoff, BEFORE building; an expensive note is not license to drop it. After binding, audit_taste with project:'<name>' or a bound url applies the calibration automatically: matching scoped rules run at full severity, non-matching ones are skipped, overrides re-tune the rest. ENFORCED: binding a BRAND-NEW surface with no calibration content (no design_notes/voice_note/references/overrides) is REFUSED — that is the fingerprint of a skipped kickoff interview. Run get_taste_interview, ask the USER, and bind their answers; the uncalibrated_ack escape hatch exists only for a user who was interviewed and deliberately skipped every dimension.",
  {
    profile: z.string().min(1).describe("Taste profile name."),
    project: z.string().min(1).describe("Project identifier, e.g. 'raven-mcp', 'portfolio'."),
    surface: z.string().min(1).describe("What this surface IS, in scope-matchable words: 'monochrome portfolio', 'product-site', 'developer docs'. Scoped rules activate when their scope tokens overlap this string."),
    hosts: z.array(z.string()).optional().describe("URL hostnames that identify this project (e.g. ravenmcp.ai) — matched in url-mode audits, subdomains included."),
    overrides: z.array(z.object({
      rule_id: z.string().describe("Must exist in the profile."),
      severity: z.enum(["block", "warn", "nit", "off"]).describe("Severity on this surface; off = rule never runs here.")
    })).optional().describe("Per-rule re-tuning for this surface (e.g. relax a voice rule to nit on a product site)."),
    voice_note: z.string().optional().describe("Short tone guidance for this surface (e.g. 'Product register: benefits may be stated plainly; still no hype verbs'). Echoed as voice_note in audit results."),
    design_notes: z.record(z.string().min(1)).optional().describe("Per-dimension design preferences from the interview's design:* questions — keys are short dimension names (typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries, special; trimmed + lowercased, must match ^[a-z][a-z0-9_-]{0,31}$ after normalization, no two keys may collide), values are the user's non-empty answers. Echoed as design_notes in every audit so generation is shaped by them, and treated as ACCEPTANCE CRITERIA a build must visibly satisfy."),
    references: z.array(z.object({
      url: z.string().describe("Example site URL (http/https), or a local .png screenshot file path for mobile references. URLs are captured live; .png paths are pixel-analyzed (scheme/luminance) — either way traits are stored so they can be consistency-checked against the design_notes."),
      liked: z.string().optional().describe("What specifically the person likes about this reference, mapped to a dimension.")
    })).optional().describe("First-class reference examples the person pointed to. Each url is captured live (traits stored on the binding), and design_notes are consistency-checked against them — contradictions come back as consistency_warnings."),
    uncalibrated_ack: z.string().optional().describe("ESCAPE HATCH — leave unset in the normal flow. Binding a BRAND-NEW surface with no calibration content (no design_notes/voice_note/references/overrides) is REFUSED, because that is the fingerprint of a skipped kickoff interview. Only if the user was genuinely interviewed and chose to skip every optional dimension, set this to a one-line note affirming that (e.g. 'user interviewed 2026-07-04, declined all dimension calibration'). It is recorded on the binding so the deliberate skip is auditable. Never set it to work around asking the user.")
  },
  async function ({ profile, project, surface, hosts, overrides, voice_note, design_notes, references, uncalibrated_ack }) {
    var warnings: string[] = [];
    var capturedRefs: ReferenceCapture[] | undefined = undefined;
    if (references && references.length > 0) {
      capturedRefs = [];
      for (var i = 0; i < references.length; i += 1) {
        var refInput = references[i];
        var entry: ReferenceCapture = { url: refInput.url };
        if (refInput.liked !== undefined && refInput.liked.trim().length > 0) entry.liked = refInput.liked.trim();
        // Remote path (authed): a .png reference is a LOCAL FILE PATH — on a
        // hosted server that is a server-file read oracle, so refuse it
        // outright; URL references must clear the Phase-3 public-URL guard
        // before any capture. Both checks are remote-only — stdio unchanged.
        if (remote) {
          if (isPngPathReference(refInput.url)) {
            warnings.push("reference " + refInput.url + " rejected: local screenshot paths are not available on the hosted endpoint — pass a public URL instead");
            capturedRefs.push(entry);
            continue;
          }
          var refGuardMessage = await remoteUrlGuardError(refInput.url);
          if (refGuardMessage !== null) {
            warnings.push("reference " + refInput.url + " stored uncaptured: " + refGuardMessage);
            capturedRefs.push(entry);
            continue;
          }
        }
        try {
          if (isPngPathReference(refInput.url)) {
            // Screenshot reference (mobile): traits come from the pixels.
            // Only the scheme/luminance subset is derivable from an image —
            // the consistency check is null-safe over the rest.
            var pngBuffer = await readFile(refInput.url);
            entry.traits = await screenTraitsFromImage(pngBuffer);
            entry.captured_at = new Date().toISOString();
          } else {
            var refCap = await capturePage(refInput.url, { scroll_settle: true, collectTraits: true });
            if (refCap.traits) entry.traits = refCap.traits;
            entry.captured_at = new Date().toISOString();
          }
        } catch (err) {
          var reason = err instanceof Error ? err.message : String(err);
          warnings.push("reference " + refInput.url + " stored uncaptured: " + reason);
        }
        capturedRefs.push(entry);
      }
    }
    var binding = await bindTasteSurface(tasteStore, profile, { project: project, surface: surface, hosts: hosts, overrides: overrides, voice_note: voice_note, design_notes: design_notes, references: capturedRefs, uncalibrated_ack: uncalibrated_ack });
    var consistencyWarnings = binding.references ? checkBindingConsistency(binding.design_notes, binding.references) : [];
    var payload: Record<string, unknown> = { tool: "bind_taste_surface", profile: profile, binding: binding };
    if (warnings.length > 0) payload.warnings = warnings;
    if (consistencyWarnings.length > 0) {
      payload.consistency_warnings = consistencyWarnings;
      payload.action_required = "The design_notes contradict what the captured references actually are. Surface each consistency_warning to the USER and re-ask — do not silently keep both the note and the reference. design_notes are acceptance criteria for the build.";
    }
    var hints = buildHints(binding.design_notes);
    if (hints.length > 0) {
      payload.build_hints = hints;
      payload.build_guidance = "The design_notes name expensive techniques. Each build_hint carries a concrete recipe + canonical public example sources (threejs.org, gsap.com, animejs.com, Codrops…) — an expensive note is NOT license to drop it. Build to these at kickoff; if a technique is genuinely infeasible, tell the USER before shipping without it.";
      var wantsAiVideo = false;
      for (var hi = 0; hi < hints.length; hi++) {
        if (hints[hi].technique.indexOf("AI cinematic video") === 0) wantsAiVideo = true;
      }
      if (wantsAiVideo) {
        payload.build_guidance += " The AI-video hero is generated through the Higgsfield MCP running Seedance — a paid external service: confirm with the user that it is connected and has credits before building the hero around it, and if they decline agree on a fallback hero (still photography or licensed film) rather than silently downgrading.";
      }
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
  }
);

server.tool(
  "record_taste_decision",
  "The Taste Engine's learning loop — record a taste, direction, or design decision the MOMENT it is made during real work (an accent chosen, a nav pattern rejected, a name direction picked, a type pairing approved), not just at interview time. Each record carries the project, a short dimension name (a standard one like color/navigation or a new category like iconography/sound), what was chosen in the user's words, the alternatives rejected, why, and a source: 'user-directed' (the user asked for it), 'user-approved' (the user accepted a proposal), or 'user-corrected' (the user overrode a generated choice — the highest-signal record). Recorded decisions evolve every future get_taste_interview kickoff: recurring choices return as suggested defaults on their dimension's question, and decision categories no standard question covers become NEW interview questions. Record liberally — every committed decision is calibration data.",
  {
    profile: z.string().min(1).describe("Taste profile name (see list_taste_profiles)."),
    project: z.string().min(1).describe("Project the decision was made on."),
    dimension: z.string().min(1).describe("Short lowercase dimension name — a standard one (typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries) or a new category the standard set doesn't cover (iconography, sound, naming, …). New categories become new interview questions."),
    decision: z.string().min(1).describe("What was chosen, in the user's words — e.g. 'amber-phosphor accent, period-accurate not decorative'."),
    rejected: z.array(z.string()).optional().describe("Alternatives considered and passed over."),
    why: z.string().optional().describe("The stated reason, if the user gave one."),
    source: z.enum(["user-directed", "user-approved", "user-corrected"]).optional().describe("How the decision was made — defaults to 'user-directed'. 'user-corrected' (user overrode a generated choice) is the highest-signal record."),
  },
  async function ({ profile, project, dimension, decision, rejected, why, source }) {
    var recorded = await recordTasteDecision(tasteStore, profile, { project: project, dimension: dimension, decision: decision, rejected: rejected, why: why, source: source });
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "record_taste_decision", profile: profile, recorded: recorded, next: "This decision now feeds future get_taste_interview kickoffs for '" + profile + "' — recurring choices return as suggested defaults, new categories become new questions." }, null, 2) }] };
  }
);

server.tool(
  "list_taste_decisions",
  "List the taste/direction/design decisions recorded for a profile (see record_taste_decision), optionally filtered by project or dimension — the ledger that evolves the kickoff interview.",
  {
    profile: z.string().min(1).describe("Taste profile name."),
    project: z.string().optional().describe("Only decisions made on this project."),
    dimension: z.string().optional().describe("Only decisions on this dimension."),
  },
  async function ({ profile, project, dimension }) {
    var decisions = await listTasteDecisions(tasteStore, profile, { project: project, dimension: dimension });
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "list_taste_decisions", profile: profile, count: decisions.length, decisions: decisions }, null, 2) }] };
  }
);

server.tool(
  "generate_taste_portrait",
  "Render a bound Taste Engine surface as a self-contained designed HTML portrait. Pass project to render one binding, or omit project to render every binding plus a gallery index.html. Portraits are generated from the local taste store and should be verified with audit_taste against their own surface/project before sharing — pass document_kind:'portrait' on that audit: a portrait is a document ABOUT the surface, so design_notes (three.js scenes, branded loaders…) are not acceptance criteria for it; profile rules still bind in full.",
  {
    profile: z.string().min(1).describe("Taste profile name."),
    project: z.string().optional().describe("Optional bound project name. Omit to render every surface binding in the profile plus a gallery index."),
    output_dir: z.string().min(1).describe("Directory where the generated HTML files should be written."),
  },
  async function ({ profile, project, output_dir }) {
    // Remote authed path (P4.3): serverless filesystems are ephemeral, so the
    // portrait comes back INLINE (size-capped) and output_dir is ignored.
    // stdio keeps the exact fs-writing behavior below.
    if (remote && hasUserStore) {
      var inline = await generateTastePortraitInline({ store: tasteStore, profile: profile, project: project });
      return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "generate_taste_portrait", inline: true, note: "Hosted endpoint returns portrait HTML inline; output_dir is ignored — save the html fields yourself.", files: inline.files, index_html: inline.index_html, total_bytes: inline.total_bytes, warnings: inline.warnings }, null, 2) }] };
    }
    var result = await generateTastePortrait({ store: tasteStore, profile: profile, project: project, output_dir: output_dir });
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "generate_taste_portrait", files: result.files, index_path: result.index_path, warnings: result.warnings }, null, 2) }] };
  }
);

server.tool(
  "list_taste_profiles",
  "List locally stored taste profiles with rule/corpus counts and last-updated timestamps.",
  async function () {
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "list_taste_profiles", profiles: await listTasteProfiles(tasteStore) }, null, 2) }] };
  }
);

server.tool(
  "label_finding",
  "Append a labeled precedent to a taste profile's corpus — the growth loop. Use when a human accepts/revises/rejects an audit_taste finding or labels a new wrong→right example. Append-only: existing records are never rewritten. accept-verdict precedents suppress matching findings in future audit_taste runs.",
  {
    profile: z.string().min(1).describe("Profile name."),
    artifact: z.string().describe("What was judged (path, URL, or short description)."),
    verdict: z.enum(["accept", "revise", "reject"]).describe("accept = the flagged pattern is fine (suppresses future matches); revise/reject = confirmed wrong."),
    violated_rule: z.string().describe("The rule_id the label concerns ('' if none). Must exist in the profile."),
    severity: z.enum(["block", "warn", "nit"]).optional().describe("Severity the human assigns."),
    wrong: z.string().describe("The wrong pattern — use a verbatim snippet so accept-suppression can match it."),
    right: z.string().describe("What right looks like.")
  },
  async function ({ profile, artifact, verdict, violated_rule, severity, wrong, right }) {
    var res = await labelFinding(tasteStore, profile, { artifact: artifact, verdict: verdict, violated_rule: violated_rule, severity: severity || "", wrong: wrong, right: right });
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "label_finding", profile: res.profile, corpus_count: res.corpus_count, record: res.record }, null, 2) }] };
  }
);

server.tool(
  "audit_taste",
  "Judge a target against a taste profile. Pass html (static page/CSS), text (a copy block), or url (rendered headless; also runs delegated WCAG-contrast/tap-target measurements for owner:raven rules). owner:taste rules run deterministic detectors — gradients, glow/neon (large-blur colored shadows), second accent hue, banned-word lists from the rule's negative prompt; clauses with no deterministic detector are reported honestly under not_assessed instead of guessed. owner:raven rules route through Raven's existing audit engines (page checks, contrast, tap targets) and fold results in under the delegating rule_id. Every finding cites an existing rule_id + concrete evidence — the engine prefers silence over a speculative nit. accept-verdict corpus precedents suppress previously-approved patterns. When the resolved binding carries design_notes, audit_taste VERIFIES each note against the artifact instead of only echoing it: url mode measures the rendered page's traits (scheme/luminance, canvas+WebGL, animations, scroll effects, text density, fonts, heading scale, loader, backdrop-filter), html mode extracts what it can statically, and every note comes back in note_assessments as present/partial/missing/unverifiable with trait-number evidence — design_notes are ACCEPTANCE CRITERIA for a build, not mood words. Missing notes become fidelity_findings (NOTE-<key>, warn — block when a named library like three.js/gsap/lottie/anime.js or a branded loader is wholly absent), the target is compared against the binding's captured references (REF-* deltas on scheme, density, motion, type scale), and sparse-and-empty pages are flagged (TASTE-restraint-earned: sparseness must be earned by craft density, not achieved by deletion). fidelity_findings count toward the verdict. When a note names an expensive technique (three.js/WebGL, GSAP scroll choreography, anime.js staggered motion, glassmorphism, a branded loader, lottie, kinetic display type…), the result carries build_hints — a concrete recipe + canonical public example sources for that technique, so a failing audit hands the fix ammunition next to the missing finding; an expensive note is never license to drop it. Rules may carry a scope (e.g. portfolio-monochrome); pass surface to say what you're judging — scoped rules run at full severity on a matching surface, are skipped (reported under skipped_out_of_scope) on a non-matching one, and can warn but never block when surface is omitted. Better: pass project (or audit a bound url host) so a saved surface binding supplies the surface, per-rule overrides, and voice note automatically — on a NEW project with no binding, run get_taste_interview first (results carry a calibration_hint when calibration is missing). Verdict: BLOCK (any block finding) / WARN (any warn) / PASS.",
  {
    profile: z.string().min(1).describe("Taste profile name (see list_taste_profiles)."),
    html: z.string().optional().describe("Full HTML/CSS of the page to judge."),
    text: z.string().optional().describe("A copy/text block to judge (voice/banned-word rules)."),
    url: z.string().optional().describe("Live URL — rendered headless with scroll-settle; enables delegated contrast/tap-target measurement."),
    surface: z.string().optional().describe("What surface is being judged (e.g. 'portfolio', 'product-site', 'deck') — activates/skips scope-tagged rules by token match. Omit if unsure: scoped rules then warn instead of block."),
    project: z.string().optional().describe("Project identifier — resolves a saved surface binding (see get_taste_interview / bind_taste_surface) that supplies the surface and per-rule overrides automatically. url-mode audits also resolve bindings by hostname."),
    document_kind: z.enum(["artifact", "portrait"]).optional().describe("'artifact' (default): the target is a build OF the surface — design_notes bind it as acceptance criteria (note_assessments/fidelity_findings run). 'portrait': the target is a document ABOUT the surface (e.g. generate_taste_portrait output) — note-fidelity is skipped and the result announces it in note_fidelity_skipped. Profile rules run in full either way.")
  },
  async function ({ profile, html, text, url, surface, project, document_kind }) {
    if (typeof url === "string" && url.trim() === "") url = undefined;
    var providedInputs = [html !== undefined, text !== undefined, url !== undefined].filter(Boolean).length;
    if (providedInputs !== 1) {
      return { content: [{ type: "text" as const, text: "Provide exactly one of html, text, or url to judge (got " + providedInputs + ")." }] };
    }
    var prof = await getTasteProfile(tasteStore, profile);
    var targetHtml = html;
    var pageIssues: { rule: string; severity: string; message: string; fix?: string }[] = [];
    // Resolve any surface binding up front: delegate audits must be filtered by
    // the same calibrated surface + off-overrides the rule loop will use.
    var binding = await resolveSurfaceBinding(tasteStore, prof.name, { project: project, url: url });
    var effectiveSurface = typeof surface === "string" && surface.trim().length > 0 ? surface : binding ? binding.surface : undefined;
    var offRuleIds = new Set((binding ? binding.overrides : []).filter(function (o) { return o.severity === "off"; }).map(function (o) { return o.rule_id; }));
    // Out-of-scope and binding-silenced raven rules must not trigger delegated
    // audits: their issues would otherwise fold into unrelated in-scope rules.
    var delegates = new Set(prof.rules.filter(function (r) { return r.owner === "raven" && !offRuleIds.has(r.rule_id) && ruleInScope(r, effectiveSurface); }).map(function (r) { return r.delegate_to; }));

    var liveTraits: PageTraits | undefined = undefined;
    if (url) {
      try {
        var cap = await capturePage(url, { scroll_settle: true, collectTraits: true });
        targetHtml = cap.renderedHtml;
        liveTraits = cap.traits;
        if (delegates.has("audit_contrast")) {
          var c = await auditContrastUrl(url);
          for (var row of c.aa_failures) pageIssues.push({ rule: "contrast/aa", severity: "error", message: row.selector + " \"" + row.text.slice(0, 40) + "\" contrast " + row.ratio + ":1 < required " + row.required_aa + ":1 (fg " + row.foreground + " on bg " + row.background + ")", fix: "Adjust fg/bg to clear " + row.required_aa + ":1 (delta " + row.delta_to_aa + ")." });
        }
        if (delegates.has("audit_tap_targets")) {
          var t = await auditTapTargetsUrl(url);
          for (var trow of t.fix_table) pageIssues.push({ rule: "tap-targets/min-size", severity: "error", message: trow.selector + " (" + trow.role + ") " + trow.w + "x" + trow.h + "px below minimum", fix: trow.fix });
        }
      } catch (error) {
        if (error instanceof CaptureUnavailableError) {
          return { content: [{ type: "text" as const, text: "audit_taste url mode needs headless chromium. Run: npx playwright install chromium — or pass the page's html instead." }] };
        }
        throw error;
      }
    }
    if (targetHtml && delegates.has("audit_page")) {
      var pc = runPageChecks(targetHtml);
      for (var iss of pc.issues) pageIssues.push({ rule: iss.rule, severity: iss.severity, message: iss.message, fix: iss.fix });
    }
    var result = await auditTaste(tasteStore, { profile: prof, html: targetHtml, text: targetHtml === undefined ? text : undefined, page_issues: pageIssues.length > 0 ? pageIssues : undefined, surface: surface, binding: binding, traits: liveTraits, document_kind: document_kind });
    var out: any = result;
    if (url) out = Object.assign({}, result, { target: "url", url: url });
    return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
  }
);

  registerCalls(server, tasteStore, allPrinciples);

server.tool(
  "talon_scan",
  "Run Raven's deterministic detector engine over a page — no LLM, pure measurement. Covers color-system discipline (palette budget, near-duplicate hex, hue diversity), spacing-grid conformance (base-unit, scale count), type-scale/rhythm (size count, body line-height, measure, font-family budget), heading/landmark structure, motion-duration/easing sanity (flashing-animation risk, prefers-reduced-motion coverage), and orphan-stretch/horizontal-overflow geometry. Pass html, url (rendered headless), or pre-measured elements+viewport (the same DevTools-snippet shape audit_layout takes — required for the two geometry rules). Every finding cites the src/data/principles/*.json entry it derives from. Pass project (and profile) to resolve a saved taste surface binding (see bind_taste_surface) — a finding the binding silences via an 'off' override is still returned, flagged waived_by_taste:true, never dropped.",
  {
    html: z.string().optional().describe("Full HTML/CSS of the page to scan."),
    url: z.string().optional().describe("Live URL — rendered headless with scroll-settle."),
    elements: z.array(z.object({
      selector: z.string(),
      rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
      computed: z.object({
        padding: z.string().optional(),
        margin: z.string().optional(),
        gap: z.string().optional(),
        fontSize: z.string().optional(),
        color: z.string().optional(),
        background: z.string().optional()
      }).optional()
    })).optional().describe("Pre-measured element rects (DevTools-snippet shape from audit_layout) — enables the geometry rules (orphan-stretch, horizontal-overflow)."),
    viewport: z.object({ w: z.number(), h: z.number() }).optional().describe("Viewport used for the horizontal-overflow geometry check."),
    surface: z.string().optional().describe("What surface is being scanned — activates/skips scope-tagged rules by token match. Omit if unsure."),
    project: z.string().optional().describe("Project identifier — resolves a saved surface binding (see bind_taste_surface) whose overrides can waive specific TAL-### rules. Requires profile."),
    profile: z.string().optional().describe("Taste profile name to resolve project's binding against (see list_taste_profiles). Only used when project or url is also given.")
  },
  async function ({ html, url, elements, viewport, surface, project, profile }) {
    var targetHtml = html;
    if (url !== undefined && url !== null) {
      try {
        var cap = await capturePage(url, { scroll_settle: true });
        targetHtml = cap.renderedHtml;
      } catch (e) {
        if (e instanceof CaptureUnavailableError) {
          return { content: [{ type: "text" as const, text: "Playwright chromium not available. Run: npx playwright install chromium" }] };
        }
        throw e;
      }
    }
    if ((targetHtml === undefined || targetHtml === null) && (!elements || elements.length === 0)) {
      return { content: [{ type: "text" as const, text: "Provide html, url, or elements to scan." }] };
    }
    var binding: SurfaceBinding | null = null;
    if (typeof profile === "string" && profile.trim().length > 0 && (project || url)) {
      binding = await resolveSurfaceBinding(tasteStore, profile, { project: project, url: url });
    }
    var effectiveSurface = typeof surface === "string" && surface.trim().length > 0 ? surface : (binding ? binding.surface : undefined);
    var result = runTalon(
      { html: targetHtml || "", elements: elements as TalonElement[] | undefined, viewport: viewport },
      { surface: effectiveSurface, binding: binding }
    );
    var waivedCount = result.findings.filter(function (f) { return f.waived_by_taste === true; }).length;
    var out: any = {
      tool: "talon_scan",
      rule_count: listTalonRules().length,
      findings: result.findings,
      passes: result.passes,
      waived_by_taste_count: waivedCount
    };
    if (url) out.url = url;
    if (binding) out.binding = binding.project;
    return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "talon_rules",
  "Enumerate Raven's Talon detector rule corpus — id, category, severity, taste scope, and the src/data/principles/*.json entry each rule cites. No scan required; use this to show a client 'why' before or instead of running talon_scan.",
  {},
  async function () {
    var rules = listTalonRules();
    return { content: [{ type: "text" as const, text: JSON.stringify({ tool: "talon_rules", count: rules.length, rules: rules }, null, 2) }] };
  }
);

  return server;
}

// ── Start ───────────────────────────────────────────────────────────

async function main() {
  // Hardcode remote:false so stdio ALWAYS serves all 70 tools regardless of any
  // ambient RAVEN_REMOTE env — the stdio wire contract stays byte-for-byte
  // unchanged in every runtime condition (additive-only invariant).
  const server = buildServer({ remote: false, tasteStore: new FsTasteStore() });
  var transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("raven-mcp v" + PKG_VERSION + " running on stdio — design intelligence ready");
  // Non-blocking: kicks off, silently no-ops on any failure.
  checkForUpdate();
}

// Only start the stdio server when this module is the direct entry point (the
// npm bin, `node dist/index.js`, tsx dev, or the .mcpb `node .../dist/index.js`
// launch). Importing the module (e.g. a future HTTP entry importing buildServer)
// must NOT spawn stdio. process.argv[1] may be a bin symlink, so resolve it
// through realpath before comparing to import.meta.url.
let isDirectRun = false;
try {
  isDirectRun = !!process.argv[1] &&
    import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
} catch {
  isDirectRun = false;
}

if (isDirectRun) {
  main().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
