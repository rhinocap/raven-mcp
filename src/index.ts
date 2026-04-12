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
