#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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
    var raw = readFileSync(join(dir, file), "utf-8");
    var parsed = JSON.parse(raw);
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

function loadSystem(id: string) {
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
      actorBRow("Frontstage (sees)", "row-frontstage", "frontstage") +
      actorBRow("Actions", "row-user", "action") +
      actorBRow("Physical evidence", "row-evidence", "evidence") +
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
} catch {}

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
  } catch {
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

import { appendFileSync, mkdirSync, readFileSync as fsReadFile, existsSync as fsExists, statSync } from "fs";
import { homedir } from "os";

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
      case "generate_design_system":
        insight = { style: input?.style, has_brand_color: !!input?.brand_color, format: input?.format };
        break;
      case "raven_register":
      case "raven_reflect":
        insight = { action: toolName };
        break;
      default:
        insight = {};
    }
  } catch {
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
  } catch {
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
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
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
  } catch {
    // Silent.
  }
}

// ── Server ──────────────────────────────────────────────────────────

var server = new McpServer({
  name: "raven-mcp",
  version: PKG_VERSION
});

// Wrap every tool handler: log the call to the local usage log, then inject
// the one-time update banner if one is pending.
var originalTool: any = server.tool.bind(server);
(server as any).tool = function () {
  var args = Array.prototype.slice.call(arguments);
  var toolName: string = args[0];
  var handler = args[args.length - 1];
  if (typeof handler === "function") {
    args[args.length - 1] = async function () {
      var start = Date.now();
      var input = arguments[0];
      var result = await handler.apply(null, arguments);
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
    category: z.string().optional().describe("Filter to category: nielsen-heuristics, laws-of-ux, gestalt, accessibility, typography, color-theory, mobile-ux, d4d"),
    format: z.enum(["full", "checklist", "brief"]).optional().describe("Output format: full (all details), checklist (implications + violations), brief (just summary). Default: full")
  },
  async ({ context, category, format }) => {
    var fmt = format || "full";
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
    description: z.string().describe("Description of the design to evaluate"),
    goals: z.array(z.string()).optional().describe("What to evaluate for (e.g. ['conversion', 'accessibility', 'mobile-usability'])"),
    context: z.string().optional().describe("What the design is (e.g. 'pricing page for SaaS product')")
  },
  async ({ description, goals, context }) => {
    var searchText = description + " " + (context || "") + " " + (goals || []).join(" ");

    // Find relevant principles
    var relevant = allPrinciples.filter(p => {
      var tagMatch = p.applies_to ? matchesTags(p.applies_to, searchText) : false;
      var textMatch = textSearch(
        p.name + " " + p.summary + " " + p.description + " " + p.violations.join(" "),
        searchText
      );
      return tagMatch || textMatch;
    });

    // Find relevant patterns
    var relevantPatterns = allPatterns.filter(p =>
      textSearch(p.id + " " + p.name + " " + p.summary, searchText)
    );

    // Build evaluation
    var evaluation = {
      design_description: description,
      context: context || "Not specified",
      goals: goals || ["general usability"],
      principles_to_check: relevant.map(p => ({
        id: p.id,
        name: p.name,
        summary: p.summary,
        common_violations: p.violations,
        what_to_verify: p.implications
      })),
      applicable_patterns: relevantPatterns.map(p => ({
        id: p.id,
        name: p.name,
        checklist: p.checklist
      })),
      evaluation_guidance: "Review the design against each principle's common violations and each pattern's checklist. Flag any items that the current design may violate.",
      total_principles: relevant.length,
      total_patterns: relevantPatterns.length
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(evaluation, null, 2)
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
    platform: z.enum(["desktop", "mobile", "responsive"]).optional().describe("Platform context for platform-specific checks")
  },
  async ({ type, platform }) => {
    // Gather checklists from matching patterns
    var matchedPatterns = allPatterns.filter(p =>
      textSearch(p.id + " " + p.name + " " + p.summary, type)
    );

    var checklists: Array<{ source: string; items: string[] }> = [];

    for (var pattern of matchedPatterns) {
      checklists.push({
        source: pattern.name,
        items: pattern.checklist
      });
    }

    // Add universal accessibility checks
    var accessibilityChecklist = [
      "Text meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text)?",
      "All interactive elements are keyboard accessible?",
      "All images have appropriate alt text?",
      "Form inputs have associated labels?",
      "Focus indicators are visible?",
      "Touch targets are at least 44x44px on mobile?"
    ];

    // Add platform-specific checks
    var platformChecklist: string[] = [];
    if (platform === "mobile" || platform === "responsive") {
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
  "Audit HTML/CSS against Raven's design quality standards. Checks typography (min 13px, weight 400+, modular-scale heading ratios, line-height consistency), accessibility (WCAG touch targets, alt text, contrast), responsive patterns (flexbox over grid, clamp sizing, max-width containers), style guide compliance (CSS custom properties, no bare hex), and visual rhythm (4/8px spacing grid, tight spacing scale, palette size). Returns pass/fail per check with specific fix instructions.",
  {
    html: z.string().describe("The full HTML content of the page to audit"),
    strict: z.boolean().optional().describe("Strict mode — also flags warnings as failures. Default: false")
  },
  async ({ html, strict }) => {
    var issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }> = [];
    var passes: string[] = [];
    var isStrict = strict || false;

    // ── Structure checks
    if (/<html[^>]*lang=/.test(html)) passes.push("html[lang] attribute present");
    else issues.push({ severity: "error", rule: "structure/lang", message: "Missing lang attribute on <html>", fix: "Add lang=\"en\" to the <html> tag" });

    if (/<meta[^>]*viewport/.test(html)) passes.push("viewport meta tag present");
    else issues.push({ severity: "error", rule: "structure/viewport", message: "Missing viewport meta tag", fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">" });

    if (/<title>[^<]+<\/title>/.test(html)) passes.push("title tag present with content");
    else issues.push({ severity: "error", rule: "structure/title", message: "Missing or empty <title> tag", fix: "Add a descriptive <title> element in <head>" });

    // ── Typography checks
    var fontSizeMatches = html.match(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/g) || [];
    var tooSmall = fontSizeMatches.filter(function(m) {
      var num = parseFloat(m.replace(/font-size\s*:\s*/, "").replace(/\s*px/, ""));
      return num < 13 && num > 0;
    });
    if (tooSmall.length === 0) passes.push("All font sizes >= 13px");
    else issues.push({ severity: "error", rule: "typography/min-size", message: "Found " + tooSmall.length + " font-size declarations below 13px: " + tooSmall.join(", "), fix: "Increase all font sizes to minimum 13px per Nielsen Norman standards" });

    var fontWeightMatches = html.match(/font-weight\s*:\s*(\d+)/g) || [];
    var tooThin = fontWeightMatches.filter(function(m) {
      var num = parseInt(m.replace(/font-weight\s*:\s*/, ""));
      return num < 400 && num > 0;
    });
    if (tooThin.length === 0) passes.push("All font weights >= 400");
    else issues.push({ severity: "error", rule: "typography/min-weight", message: "Found " + tooThin.length + " font-weight declarations below 400: " + tooThin.join(", "), fix: "Use font-weight 400+ for all text. 300 is too thin for screen readability" });

    // ── Accessibility checks
    var imgTags = html.match(/<img\b[^>]*>/g) || [];
    var missingAlt = imgTags.filter(function(t) { return !/alt\s*=/.test(t); });
    if (missingAlt.length === 0) passes.push("All images have alt attributes");
    else issues.push({ severity: "error", rule: "a11y/img-alt", message: missingAlt.length + " <img> tags missing alt attribute", fix: "Add descriptive alt text to all images. Use alt=\"\" for decorative images" });

    // ── Responsive checks
    var hasFlexWrap = /flex-wrap\s*:\s*wrap/.test(html);
    if (hasFlexWrap) passes.push("Uses flex-wrap for fluid layout");
    else issues.push({ severity: "warning", rule: "responsive/flex-wrap", message: "No flex-wrap detected. Cards and grids should use display:flex; flex-wrap:wrap with min-width on children", fix: "Replace grid-template-columns with display:flex; flex-wrap:wrap and flex:1 1 280px; min-width:280px on children" });

    var gridInMedia = html.match(/@media[\s\S]*?grid-template-columns/g) || [];
    if (gridInMedia.length === 0) passes.push("No grid-template-columns in media queries");
    else issues.push({ severity: "warning", rule: "responsive/no-grid-breakpoints", message: gridInMedia.length + " grid-template-columns overrides found in media queries", fix: "Remove grid-template-columns from media queries. Use flexbox with min-width instead — it wraps naturally" });

    var hasClamp = /clamp\s*\(/.test(html);
    if (hasClamp) passes.push("Uses clamp() for fluid sizing");
    else issues.push({ severity: "warning", rule: "responsive/clamp", message: "No clamp() detected for fluid sizing", fix: "Use clamp(48px, 8vw, 128px) for section padding and clamp(16px, 4vw, 24px) for container padding" });

    var hasMaxWidth = /max-width\s*:\s*(1[12]\d{2}|1200)\s*px/.test(html);
    if (hasMaxWidth) passes.push("Content has max-width constraint");
    else issues.push({ severity: "warning", rule: "responsive/max-width", message: "No 1200px max-width constraint detected on content containers", fix: "Add max-width: 1200px; margin: 0 auto to content containers" });

    // ── Style guide checks
    var hasCustomProps = /var\s*\(\s*--/.test(html);
    if (hasCustomProps) passes.push("Uses CSS custom properties");
    else issues.push({ severity: "warning", rule: "tokens/custom-properties", message: "No CSS custom properties (var(--xxx)) detected", fix: "Use CSS custom properties for all colors, spacing, and typography values" });

    var styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
    var bareHexCount = 0;
    for (var block of styleBlocks) {
      var cssLines = block.split("\n");
      for (var cssLine of cssLines) {
        if (/^\s*--/.test(cssLine) || /^\s*\/[/*]/.test(cssLine)) continue;
        if (/var\s*\(/.test(cssLine)) continue;
        if (/stroke|fill/.test(cssLine)) continue;
        var hexMatches = cssLine.match(/#[0-9a-fA-F]{3,8}(?![-\w])/g) || [];
        bareHexCount += hexMatches.length;
      }
    }
    if (bareHexCount <= 5) passes.push("Minimal bare hex colors (" + bareHexCount + ")");
    else issues.push({ severity: "warning", rule: "tokens/no-bare-hex", message: bareHexCount + " bare hex color values found outside custom property definitions", fix: "Define colors as --color-name: #hex in :root, then use var(--color-name) throughout" });

    // ── Rhythm & scale checks
    var spacingRegex = /\b(?:gap|padding(?:-(?:top|right|bottom|left|inline|block))?|margin(?:-(?:top|right|bottom|left|inline|block))?)\s*:\s*([^;}\n]+)/g;
    var spacingValues: number[] = [];
    var spacingMatch;
    while ((spacingMatch = spacingRegex.exec(html)) !== null) {
      var spacingPx = spacingMatch[1].match(/-?\d+(?:\.\d+)?\s*px/g) || [];
      for (var sv of spacingPx) {
        var svNum = parseFloat(sv);
        if (!isNaN(svNum) && svNum > 0) spacingValues.push(svNum);
      }
    }

    if (spacingValues.length >= 3) {
      var onGrid4 = spacingValues.filter(function(n) { return n % 4 === 0; }).length;
      var onGrid8 = spacingValues.filter(function(n) { return n % 8 === 0; }).length;
      var bestGrid = onGrid8 >= onGrid4 * 0.7 ? { base: 8, count: onGrid8 } : { base: 4, count: onGrid4 };
      var gridPct = bestGrid.count / spacingValues.length;
      if (gridPct >= 0.9) passes.push("Spacing values on " + bestGrid.base + "px base grid (" + Math.round(gridPct * 100) + "% of " + spacingValues.length + ")");
      else issues.push({ severity: "warning", rule: "spacing/base-unit", message: "Only " + Math.round(gridPct * 100) + "% of spacing values on a " + bestGrid.base + "px grid (" + spacingValues.length + " sampled)", fix: "Snap gap/padding/margin values to multiples of 4 or 8. Define as tokens: --space-1:4px, --space-2:8px, --space-3:12px, --space-4:16px, --space-5:24px, --space-6:32px, --space-7:48px." });

      var uniqueSpacings = Array.from(new Set(spacingValues)).sort(function(a, b) { return a - b; });
      if (uniqueSpacings.length <= 7) passes.push("Spacing scale is tight (" + uniqueSpacings.length + " unique values)");
      else issues.push({ severity: "warning", rule: "spacing/scale-count", message: uniqueSpacings.length + " unique spacing values found: " + uniqueSpacings.join(", ") + "px — visual rhythm breaks down past ~7", fix: "Consolidate to a 5–7 token scale (e.g. 4, 8, 12, 16, 24, 32, 48). Round ad-hoc values to the nearest token." });
    }

    // ── Modular scale check — heading font sizes
    var headingSizes: { tag: string; size: number }[] = [];
    var headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"];
    for (var ht of headingTags) {
      var hre = new RegExp("(?:^|[\\s,}])" + ht + "\\b[^{]*\\{[^}]*font-size\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*px", "i");
      var hm = html.match(hre);
      if (hm) headingSizes.push({ tag: ht, size: parseFloat(hm[1]) });
    }
    if (headingSizes.length >= 2) {
      var hRatios: number[] = [];
      for (var hi = 1; hi < headingSizes.length; hi++) {
        hRatios.push(headingSizes[hi - 1].size / headingSizes[hi].size);
      }
      var standardScales = [
        { name: "minor second (1.067)", v: 1.067 },
        { name: "major second (1.125)", v: 1.125 },
        { name: "minor third (1.2)", v: 1.2 },
        { name: "major third (1.25)", v: 1.25 },
        { name: "perfect fourth (1.333)", v: 1.333 },
        { name: "augmented fourth (1.414)", v: 1.414 },
        { name: "perfect fifth (1.5)", v: 1.5 },
        { name: "golden ratio (1.618)", v: 1.618 }
      ];
      var bestScale = standardScales[0];
      var bestDev = Infinity;
      for (var ss of standardScales) {
        var dev = 0;
        for (var r of hRatios) dev += Math.abs(r - ss.v) / ss.v;
        dev = dev / hRatios.length;
        if (dev < bestDev) { bestDev = dev; bestScale = ss; }
      }
      if (bestDev <= 0.05) passes.push("Heading scale matches " + bestScale.name + " (avg deviation " + (bestDev * 100).toFixed(1) + "%)");
      else issues.push({ severity: "warning", rule: "typography/modular-scale", message: "Heading sizes don't follow a consistent modular scale. Closest: " + bestScale.name + ", avg deviation " + (bestDev * 100).toFixed(1) + "%. Ratios: " + hRatios.map(function(r) { return r.toFixed(2); }).join(", "), fix: "Pick one ratio (1.25 major-third is a safe default) and derive h1→h6 from a base size. Example with base 16px × 1.25^n: 16, 20, 25, 31, 39, 49." });
    }

    // ── Line-height consistency
    var lhMatches = html.match(/line-height\s*:\s*(\d+(?:\.\d+)?)(?!px)/g) || [];
    var lhValues = lhMatches
      .map(function(m) { return parseFloat(m.replace(/line-height\s*:\s*/, "")); })
      .filter(function(n) { return n > 0 && n < 3; });
    var uniqueLh = Array.from(new Set(lhValues));
    if (uniqueLh.length > 0) {
      if (uniqueLh.length <= 4) passes.push("Line-height scale is tight (" + uniqueLh.length + " unique values)");
      else issues.push({ severity: "warning", rule: "typography/line-height-scale", message: uniqueLh.length + " unique line-height values: " + uniqueLh.map(function(n) { return n.toFixed(2); }).join(", "), fix: "Use at most 3–4 line-heights: tight (~1.1) for display, normal (1.4–1.5) for body, relaxed (1.6–1.7) for long-form." });
    }

    // ── Palette size
    var allHex = html.match(/#[0-9a-fA-F]{3,8}(?![-\w])/g) || [];
    var normalizedHex = allHex.map(function(h) {
      var hh = h.toLowerCase();
      if (hh.length === 4) hh = "#" + hh[1] + hh[1] + hh[2] + hh[2] + hh[3] + hh[3];
      if (hh.length === 9) hh = hh.substring(0, 7);
      return hh;
    });
    var uniqueHex = Array.from(new Set(normalizedHex));
    if (uniqueHex.length > 0) {
      if (uniqueHex.length <= 10) passes.push("Color palette is tight (" + uniqueHex.length + " distinct colors)");
      else issues.push({ severity: "warning", rule: "color/palette-size", message: uniqueHex.length + " distinct hex colors found — hierarchy breaks down past ~10", fix: "Consolidate to 6–10 colors: 1 primary, 1 accent, 4 neutrals, plus semantic (success/warning/error). Reuse with opacity/alpha for variation instead of adding new hues." });
    }

    // ── Touch target check
    var btnPadding = html.match(/\.btn[^{]*\{[^}]*padding\s*:\s*(\d+)px/g) || [];
    var smallButtons = btnPadding.filter(function(m) {
      var match = m.match(/padding\s*:\s*(\d+)px/);
      return match && parseInt(match[1]) < 10;
    });
    if (smallButtons.length === 0) passes.push("Button padding adequate for touch targets");
    else issues.push({ severity: "error", rule: "a11y/touch-target", message: "Button padding too small for 44px WCAG touch targets", fix: "Use minimum padding: 12px 24px on all buttons" });

    var errors = issues.filter(function(i) { return i.severity === "error"; });
    var warnings = issues.filter(function(i) { return i.severity === "warning"; });
    var totalChecks = passes.length + issues.length;
    var failCount = isStrict ? issues.length : errors.length;

    var result = {
      score: Math.round(((totalChecks - failCount) / totalChecks) * 100),
      grade: failCount === 0 ? "A" : failCount <= 2 ? "B" : failCount <= 4 ? "C" : "D",
      summary: passes.length + "/" + totalChecks + " checks passed" + (failCount > 0 ? " — " + failCount + " issues to fix" : " — all clear"),
      passes: passes,
      errors: errors,
      warnings: isStrict ? warnings.map(function(w) { return Object.assign({}, w, { severity: "error" as const }); }) : warnings,
      fix_priority: errors.concat(warnings).map(function(i) { return i.rule + ": " + i.fix; })
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
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
          }
        }, null, 2)
      }]
    };
  }
);

// ── Content design systems ─────────────────────────────────────────
// Parallel to tokens/: voice & tone guides from real brands. Content
// principles and patterns are loaded into the regular principles/pattern
// arrays and reachable through get_principles/get_pattern as well — these
// tools are the discoverable shortcuts.

server.tool(
  "list_content_systems",
  "Browse available content design systems — brand voice and tone guides from real companies (Mailchimp, GOV.UK, Shopify Polaris, Atlassian, Intuit). Filter by category or search by name.",
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
    id: z.string().describe("Content system ID (e.g. 'mailchimp', 'gov-uk', 'shopify-polaris', 'atlassian', 'intuit')"),
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
  {},
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
  {},
  async () => {
    var trends = loadBrandTrends();
    return { content: [{ type: "text" as const, text: JSON.stringify({ count: trends.length, trends: trends }, null, 2) }] };
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

// ── Start ───────────────────────────────────────────────────────────

async function main() {
  var transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("raven-mcp v" + PKG_VERSION + " running on stdio — design intelligence ready");
  // Non-blocking: kicks off, silently no-ops on any failure.
  checkForUpdate();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
