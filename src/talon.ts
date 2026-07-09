/**
 * talon.ts — Raven's deterministic detector engine.
 *
 * A pure, browser-free measurement layer: every rule runs over an HTML/CSS
 * string and (optionally) pre-measured DOM geometry — no browser is launched
 * here. Callers that want live-DOM geometry capture it themselves (the same
 * DevTools-snippet pattern audit_layout already uses) and pass it in via
 * `elements`; a URL is resolved to `html` upstream via capture.ts before
 * reaching this module.
 *
 * Every finding carries a `source` field citing a `src/data/principles/*.json`
 * entry id — this is a hard schema requirement (see docs/parity-roadmap.md
 * Gap 1), not prose. Thresholds are derived from that cited principle's own
 * content, never from an external rule set.
 *
 * Taste integration: each rule declares a `scope` (see taste.ts's
 * ruleInScope — "global" unless a future rule is surface-restricted) and can
 * be silenced per-project the same way any taste rule is — via a surface
 * binding's `overrides` list (severity:"off" for that TAL-### id). A finding
 * a binding waives is still returned, flagged `waived_by_taste: true`, never
 * silently dropped.
 */

import { detectOrphanStretch, type OrphanElement } from "./layout-orphans.js";
import { ruleInScope, type TasteRule, type SurfaceBinding } from "./taste.js";

export type TalonSeverity = "error" | "warning";

export type TalonElement = OrphanElement & {
  computed?: {
    padding?: string;
    margin?: string;
    gap?: string;
    fontSize?: string;
    color?: string;
    background?: string;
  };
};

export type TalonFinding = {
  rule: string;          // TAL-###
  severity: TalonSeverity;
  message: string;
  fix: string;
  source: string;        // principles/*.json entry id — mandatory citation
  // Present only when a resolved surface binding waives this rule (an
  // explicit override, or the rule's scope excludes the resolved surface) —
  // the finding is still returned, never dropped.
  waived_by_taste?: true;
};

export type TalonRuleInfo = {
  id: string;
  category: "color" | "spacing" | "typography" | "structure" | "motion" | "layout";
  severity: TalonSeverity;
  scope: string;
  source: string;
  message_template: string;
};

export type TalonScanInput = {
  html?: string;
  elements?: TalonElement[];
  viewport?: { w: number; h: number };
};

export type TalonScanOptions = {
  surface?: string;
  binding?: SurfaceBinding | null;
};

export type TalonScanResult = {
  findings: TalonFinding[];
  passes: string[];
};

type TalonContext = { html: string; elements: TalonElement[]; viewport?: { w: number; h: number } };
type TalonCheckResult = { fired: boolean; message?: string; fix?: string; pass_message?: string };

type TalonRuleDef = TalonRuleInfo & {
  check: (ctx: TalonContext) => TalonCheckResult;
};

// ── Color helpers ───────────────────────────────────────────────────

function uniqueHexColors(html: string): string[] {
  var matches = html.match(/#[0-9a-fA-F]{3,8}(?![-\w])/g) || [];
  var normalized = matches.map(function (h) {
    var hh = h.toLowerCase();
    if (hh.length === 4) hh = "#" + hh[1] + hh[1] + hh[2] + hh[2] + hh[3] + hh[3];
    if (hh.length === 9) hh = hh.substring(0, 7);
    return hh;
  });
  return Array.from(new Set(normalized));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  var r = parseInt(hex.substring(1, 3), 16) / 255;
  var g = parseInt(hex.substring(3, 5), 16) / 255;
  var b = parseInt(hex.substring(5, 7), 16) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var l = (max + min) / 2;
  var h = 0, s = 0;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: h, s: s * 100, l: l * 100 };
}

function hueDelta(a: number, b: number): number {
  var d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ── Rule corpus ─────────────────────────────────────────────────────

var TALON_RULES: TalonRuleDef[] = [
  {
    id: "TAL-001",
    category: "color",
    severity: "warning",
    scope: "global",
    source: "color-palette-discipline",
    message_template: "More than 10 distinct rendered colors — hierarchy breaks down past ~10 (color-palette-discipline).",
    check: function (ctx) {
      var hexes = uniqueHexColors(ctx.html);
      if (hexes.length === 0) return { fired: false };
      if (hexes.length <= 10) return { fired: false, pass_message: "Color palette is tight (" + hexes.length + " distinct colors)" };
      return {
        fired: true,
        message: hexes.length + " distinct hex colors found — hierarchy breaks down past ~10 (" + hexes.slice(0, 12).join(", ") + (hexes.length > 12 ? ", …" : "") + ")",
        fix: "Consolidate to a role-based token set: 1 primary, 1 accent, 3-4 neutrals, 1-2 semantic colors. Derive hover/active/disabled from those via opacity/lightness, not new hexes."
      };
    }
  },
  {
    id: "TAL-002",
    category: "color",
    severity: "warning",
    scope: "global",
    source: "color-palette-discipline",
    message_template: "Every rendered color is a neutral (gray/near-black/near-white) — no primary or accent hue carries the page's role-based signal (color-palette-discipline).",
    check: function (ctx) {
      var hexes = uniqueHexColors(ctx.html);
      if (hexes.length < 3) return { fired: false };
      var chromaticBuckets = new Set<number>();
      for (var hex of hexes) {
        var hsl = hexToHsl(hex);
        if (hsl.s >= 12 && hsl.l > 8 && hsl.l < 92) chromaticBuckets.add(Math.round(hsl.h / 20) * 20);
      }
      if (chromaticBuckets.size > 0) return { fired: false };
      return {
        fired: true,
        message: hexes.length + " distinct colors rendered, all neutral (gray/near-black/near-white) — no primary or accent hue found",
        fix: "Map at least one color to accent (CTAs/emphasis) and one to primary brand per color-palette-discipline's role-based token set: surface, border, text, accent, accent-hover."
      };
    }
  },
  {
    id: "TAL-003",
    category: "color",
    severity: "warning",
    scope: "global",
    source: "color-palette-discipline",
    message_template: "Two hex colors sit within ~5% lightness and a similar hue — near-duplicate noise that dilutes the palette (color-palette-discipline).",
    check: function (ctx) {
      var hexes = uniqueHexColors(ctx.html).slice(0, 40); // ponytail: cap pairwise scan, palettes this large already fail TAL-001
      var hsls = hexes.map(function (h) { return { hex: h, hsl: hexToHsl(h) }; });
      var pairs: string[] = [];
      for (var i = 0; i < hsls.length; i++) {
        for (var j = i + 1; j < hsls.length; j++) {
          var a = hsls[i], b = hsls[j];
          var lDelta = Math.abs(a.hsl.l - b.hsl.l);
          if (lDelta > 5) continue;
          var bothNeutral = a.hsl.s < 12 && b.hsl.s < 12;
          if (!bothNeutral && hueDelta(a.hsl.h, b.hsl.h) > 15) continue;
          pairs.push(a.hex + " / " + b.hex);
        }
      }
      if (pairs.length === 0) return { fired: false };
      return {
        fired: true,
        message: pairs.length + " near-duplicate color pair(s) within ~5% lightness: " + pairs.slice(0, 5).join(", ") + (pairs.length > 5 ? ", …" : ""),
        fix: "Collapse near-duplicate hexes into a single token — e.g. #333 and #363636 are noise, not two colors."
      };
    }
  },
  {
    id: "TAL-004",
    category: "spacing",
    severity: "warning",
    scope: "global",
    source: "spacing-base-unit",
    message_template: "Spacing values (gap/padding/margin) that aren't a multiple of the 4px base unit (spacing-base-unit).",
    check: function (ctx) {
      var values = extractSpacingValues(ctx.html);
      if (values.length < 3) return { fired: false };
      var onGrid = values.filter(function (n) { return n % 4 === 0; });
      var pct = onGrid.length / values.length;
      if (pct >= 0.9) return { fired: false, pass_message: "Spacing values on the 4px base grid (" + Math.round(pct * 100) + "% of " + values.length + ")" };
      var offGrid = Array.from(new Set(values.filter(function (n) { return n % 4 !== 0; })));
      return {
        fired: true,
        message: "Only " + Math.round(pct * 100) + "% of " + values.length + " spacing values are a multiple of the 4px base unit. Off-grid: " + offGrid.slice(0, 10).join(", "),
        fix: "Snap every gap/padding/margin to a multiple of 4px. Express spacing as tokens (--space-1:4px … --space-7:48px), not raw pixels."
      };
    }
  },
  {
    id: "TAL-005",
    category: "spacing",
    severity: "warning",
    scope: "global",
    source: "spacing-scale-count",
    message_template: "More than 7 unique spacing values in use — past that, a spacing system stops reading as a system (spacing-scale-count).",
    check: function (ctx) {
      var values = Array.from(new Set(extractSpacingValues(ctx.html)));
      if (values.length === 0) return { fired: false };
      if (values.length <= 7) return { fired: false, pass_message: "Spacing scale is tight (" + values.length + " unique values)" };
      return {
        fired: true,
        message: values.length + " unique spacing values found: " + values.sort(function (a, b) { return a - b; }).join(", ") + "px — a tight scale is at most 7",
        fix: "Consolidate to the canonical scale 4, 8, 12, 16, 24, 32, 48 (extend with 64/96/128 only for section-level spacing)."
      };
    }
  },
  {
    id: "TAL-006",
    category: "typography",
    severity: "warning",
    scope: "global",
    source: "type-scale",
    message_template: "More than 7 distinct font-size values declared — a type scale should stay to 5-7 sizes (type-scale).",
    check: function (ctx) {
      var matches = ctx.html.match(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/g) || [];
      var sizes = Array.from(new Set(matches.map(function (m) { return parseFloat(m.replace(/font-size\s*:\s*/, "").replace(/\s*px/, "")); })));
      if (sizes.length === 0) return { fired: false };
      if (sizes.length <= 7) return { fired: false, pass_message: "Type scale is tight (" + sizes.length + " unique font sizes)" };
      return {
        fired: true,
        message: sizes.length + " unique font-size values found: " + sizes.sort(function (a, b) { return a - b; }).join(", ") + "px — limit to 5-7 sizes",
        fix: "Derive all text sizes from one modular scale (e.g. base 16px x 1.25^n) and reuse across headings, body, captions, labels."
      };
    }
  },
  {
    id: "TAL-007",
    category: "typography",
    severity: "warning",
    scope: "global",
    source: "line-height-spacing",
    message_template: "Body text line-height outside the 1.4-1.6 readability range (line-height-spacing).",
    check: function (ctx) {
      var bodyBlock = ctx.html.match(/(?:^|[\s,}])body\b[^{]*\{([^}]*)\}/i);
      if (!bodyBlock) return { fired: false };
      var lh = bodyBlock[1].match(/line-height\s*:\s*(\d+(?:\.\d+)?)(?!px)/);
      if (!lh) return { fired: false };
      var val = parseFloat(lh[1]);
      if (val >= 1.4 && val <= 1.6) return { fired: false, pass_message: "Body line-height (" + val + ") is in the 1.4-1.6 readability range" };
      return {
        fired: true,
        message: "Body line-height is " + val + " — WCAG recommends 1.5 (range 1.4-1.6) for body text",
        fix: "Set body { line-height: 1.5 }. Tighter (1.1-1.3) is for headings only."
      };
    }
  },
  {
    id: "TAL-008",
    category: "typography",
    severity: "warning",
    scope: "global",
    source: "measure-line-length",
    message_template: "A text container's max-width (in ch) sits outside the 45-75ch optimal measure (measure-line-length).",
    check: function (ctx) {
      var matches = Array.from(ctx.html.matchAll(/max-width\s*:\s*(\d+(?:\.\d+)?)ch/g));
      if (matches.length === 0) return { fired: false };
      var offMeasure = matches.map(function (m) { return parseFloat(m[1]); }).filter(function (n) { return n < 45 || n > 75; });
      if (offMeasure.length === 0) return { fired: false, pass_message: "Text measure (max-width in ch) is within 45-75ch" };
      return {
        fired: true,
        message: offMeasure.length + " text container(s) set max-width outside 45-75ch: " + offMeasure.join(", ") + "ch",
        fix: "Set body-text containers to max-width: 65ch (45-75ch range). Short-form text (cards/labels) can run narrower, 20-40 characters."
      };
    }
  },
  {
    id: "TAL-009",
    category: "typography",
    severity: "warning",
    scope: "global",
    source: "font-pairing",
    message_template: "More than 3 distinct font-family stacks declared — a product should use at most 2-3 typefaces (font-pairing).",
    check: function (ctx) {
      var matches = Array.from(ctx.html.matchAll(/font-family\s*:\s*([^;}\n]+)/g));
      if (matches.length === 0) return { fired: false };
      var families = new Set<string>();
      for (var m of matches) {
        var first = m[1].split(",")[0].trim().replace(/["']/g, "").toLowerCase();
        if (first.length > 0) families.add(first);
      }
      if (families.size <= 3) return { fired: false, pass_message: "Font-family budget is tight (" + families.size + " distinct families)" };
      return {
        fired: true,
        message: families.size + " distinct font-family stacks declared: " + Array.from(families).join(", "),
        fix: "Use at most 2-3 typefaces: one for headings/display, one for body/UI (or one variable family with enough weights)."
      };
    }
  },
  {
    id: "TAL-010",
    category: "structure",
    severity: "error",
    scope: "global",
    source: "screen-reader-support",
    message_template: "Heading levels skip (e.g. h1 straight to h3 with no h2) — breaks a logical heading hierarchy (screen-reader-support).",
    check: function (ctx) {
      var matches = Array.from(ctx.html.matchAll(/<h([1-6])\b/gi));
      if (matches.length === 0) return { fired: false };
      var skips: string[] = [];
      var prevLevel = 0;
      for (var m of matches) {
        var level = parseInt(m[1], 10);
        if (prevLevel > 0 && level - prevLevel > 1) skips.push("h" + prevLevel + " → h" + level);
        prevLevel = level;
      }
      if (skips.length === 0) return { fired: false, pass_message: "Heading hierarchy has no level skips (" + matches.length + " headings)" };
      return {
        fired: true,
        message: skips.length + " heading level skip(s): " + skips.join(", "),
        fix: "Use headings in strict descending order with no gaps (h1 > h2 > h3 …) — never skip a level for visual sizing; style with CSS instead."
      };
    }
  },
  {
    id: "TAL-011",
    category: "structure",
    severity: "error",
    scope: "global",
    source: "screen-reader-support",
    message_template: "No semantic landmark elements (nav/main/header/footer or ARIA landmark roles) found on a substantial page (screen-reader-support).",
    check: function (ctx) {
      if (ctx.html.length < 500) return { fired: false };
      var hasLandmark = /<(nav|main|header|footer)\b/i.test(ctx.html) || /role\s*=\s*"(navigation|main|banner|contentinfo)"/i.test(ctx.html);
      if (hasLandmark) return { fired: false, pass_message: "Semantic landmark elements present" };
      return {
        fired: true,
        message: "No <nav>/<main>/<header>/<footer> or ARIA landmark roles found",
        fix: "Wrap primary regions in semantic elements: <header>, <nav>, <main>, <footer> (or role=\"banner\"/\"navigation\"/\"main\"/\"contentinfo\") so assistive tech can jump between regions."
      };
    }
  },
  {
    id: "TAL-012",
    category: "motion",
    severity: "error",
    scope: "global",
    source: "motion-sensitivity",
    message_template: "An infinitely-repeating animation with a cycle under ~334ms flashes faster than 3 times per second (motion-sensitivity).",
    check: function (ctx) {
      var blocks = ctx.html.match(/[^{}]+\{[^{}]*\}/g) || [];
      for (var block of blocks) {
        if (!/infinite/i.test(block)) continue;
        var dur = block.match(/animation(?:-duration)?\s*:\s*[^;]*?(\d+(?:\.\d+)?)(ms|s)\b/);
        if (!dur) continue;
        var ms = parseFloat(dur[1]) * (dur[2] === "s" ? 1000 : 1);
        if (ms > 0 && ms < 334) {
          return {
            fired: true,
            message: "Infinite animation with a " + ms + "ms cycle flashes faster than 3 times/second (" + Math.round(1000 / ms) + "Hz) — seizure risk",
            fix: "Slow the cycle to 334ms+ (under 3 flashes/second), or make the animation non-infinite / trigger it once."
          };
        }
      }
      return { fired: false };
    }
  },
  {
    id: "TAL-013",
    category: "motion",
    severity: "warning",
    scope: "global",
    source: "motion-sensitivity",
    message_template: "Animations/transitions are present with no @media (prefers-reduced-motion: reduce) fallback (motion-sensitivity).",
    check: function (ctx) {
      var hasMotion = /@keyframes/i.test(ctx.html) || /\btransition\s*:/i.test(ctx.html) || /\banimation\s*:/i.test(ctx.html);
      if (!hasMotion) return { fired: false };
      if (/prefers-reduced-motion/i.test(ctx.html)) return { fired: false, pass_message: "Respects prefers-reduced-motion" };
      return {
        fired: true,
        message: "CSS animations/transitions are present but no @media (prefers-reduced-motion: reduce) rule was found",
        fix: "Wrap or gate motion with @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } } (or reduce, not eliminate, if motion carries meaning)."
      };
    }
  },
  {
    id: "TAL-014",
    category: "layout",
    severity: "warning",
    scope: "global",
    source: "gestalt-similarity",
    message_template: "A lone last-row grid item stretches far wider than its siblings, breaking the group's shared size/shape similarity (gestalt-similarity).",
    check: function (ctx) {
      if (ctx.elements.length === 0) return { fired: false };
      var result = detectOrphanStretch(ctx.elements);
      if (!result.has_orphan) return { fired: false, pass_message: "No orphan-stretch grid items detected" };
      return {
        fired: true,
        message: result.issues.map(function (i) { return i.message; }).join(" "),
        fix: result.issues[0] ? result.issues[0].fix : "Use grid-template-columns: repeat(auto-fill, <card-width>) or cap item max-width to the card width."
      };
    }
  },
  {
    id: "TAL-015",
    category: "layout",
    severity: "error",
    scope: "global",
    source: "mobile-overflow-control",
    message_template: "A measured element extends past the viewport width, risking horizontal scroll (mobile-overflow-control).",
    check: function (ctx) {
      if (ctx.elements.length === 0 || !ctx.viewport) return { fired: false };
      var overflowing = ctx.elements.filter(function (el) { return el.rect.x + el.rect.w > ctx.viewport!.w * 1.02; });
      if (overflowing.length === 0) return { fired: false, pass_message: "No elements overflow the viewport width" };
      return {
        fired: true,
        message: overflowing.length + " element(s) extend past the " + ctx.viewport.w + "px viewport: " + overflowing.slice(0, 5).map(function (el) { return el.selector; }).join(", "),
        fix: "Clip overflow at the html/body level and constrain decorative elements (fixed-width children, negative margins, unconstrained images) to the viewport."
      };
    }
  }
];

function extractSpacingValues(html: string): number[] {
  var regex = /\b(?:gap|padding(?:-(?:top|right|bottom|left|inline|block))?|margin(?:-(?:top|right|bottom|left|inline|block))?)\s*:\s*([^;}\n]+)/g;
  var values: number[] = [];
  var match;
  while ((match = regex.exec(html)) !== null) {
    var px = match[1].match(/-?\d+(?:\.\d+)?\s*px/g) || [];
    for (var p of px) {
      var n = parseFloat(p);
      if (!isNaN(n) && n > 0) values.push(n);
    }
  }
  return values;
}

// ── Public API ──────────────────────────────────────────────────────

export function listTalonRules(): TalonRuleInfo[] {
  return TALON_RULES.map(function (r) {
    return { id: r.id, category: r.category, severity: r.severity, scope: r.scope, source: r.source, message_template: r.message_template };
  });
}

export function runTalon(input: TalonScanInput, opts?: TalonScanOptions): TalonScanResult {
  var ctx: TalonContext = { html: input.html || "", elements: input.elements || [], viewport: input.viewport };
  var surface = opts ? opts.surface : undefined;
  var binding = opts ? opts.binding : undefined;
  var offRuleIds = new Set((binding ? binding.overrides : []).filter(function (o) { return o.severity === "off"; }).map(function (o) { return o.rule_id; }));

  var findings: TalonFinding[] = [];
  var passes: string[] = [];

  for (var rule of TALON_RULES) {
    var result = rule.check(ctx);
    if (!result.fired) {
      if (result.pass_message) passes.push(result.pass_message);
      continue;
    }
    var stub: TasteRule = {
      rule_id: rule.id,
      clause_text: "",
      category: rule.category,
      severity_default: "warn",
      negative_prompt: "",
      owner: "raven",
      delegate_to: "",
      scope: rule.scope
    };
    var inScope = ruleInScope(stub, surface);
    var waived = !inScope || offRuleIds.has(rule.id);
    var finding: TalonFinding = {
      rule: rule.id,
      severity: rule.severity,
      message: result.message || "",
      fix: result.fix || "",
      source: rule.source
    };
    if (waived) finding.waived_by_taste = true;
    findings.push(finding);
  }

  return { findings: findings, passes: passes };
}
