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

// ── Server ──────────────────────────────────────────────────────────

var server = new McpServer({
  name: "raven-mcp",
  version: "1.0.0"
});

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
  "Audit HTML/CSS against Raven's design quality standards. Checks typography (min 13px, weight 400+), accessibility (WCAG touch targets, alt text, contrast), responsive patterns (flexbox over grid, clamp sizing, max-width containers), and style guide compliance (CSS custom properties, no bare hex). Returns pass/fail per check with specific fix instructions.",
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
  console.error("raven-mcp server running on stdio — design intelligence ready");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
