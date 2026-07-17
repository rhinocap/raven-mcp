/**
 * page-checks.ts — the shared audit_page rule engine.
 *
 * Extracted verbatim from the inline audit_page handler so that audit_page AND
 * audit_url run the EXACT same checks over (rendered) HTML — one implementation,
 * never forked. audit_page passes raw or rendered HTML; audit_url passes the
 * rendered DOM captured at each viewport/theme.
 */

import { auditContainerWidth } from "./audit-container.js";

export type PageIssue = {
  severity: "error" | "warning";
  rule: string;
  message: string;
  fix: string;
};

export type PageChecksResult = {
  passes: string[];
  issues: PageIssue[];
};

export type PageChecksOptions = {
  containerMaxWidth?: number;
};

/**
 * Run Raven's design-quality checks over a block of HTML/CSS.
 * Pure (no I/O, no browser) — operates on the HTML string only.
 */
export function runPageChecks(html: string, opts?: PageChecksOptions): PageChecksResult {
  var containerMaxWidth = opts ? opts.containerMaxWidth : undefined;
  var issues: PageIssue[] = [];
  var passes: string[] = [];

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
  // flex-wrap only matters for multi-column card/grid layouts — a single-column
  // full-bleed marketing page has nothing that needs to wrap, so don't nag it.
  var hasGridTemplateColumns = /grid-template-columns/.test(html);
  var cardLikeClassMatches = html.match(/class\s*=\s*"[^"]*\b(?:card|grid-item|tile|column)s?\b[^"]*"/gi) || [];
  var suggestsMultiColumnLayout = hasGridTemplateColumns || cardLikeClassMatches.length >= 3;
  if (hasFlexWrap) passes.push("Uses flex-wrap for fluid layout");
  else if (suggestsMultiColumnLayout) issues.push({ severity: "warning", rule: "responsive/flex-wrap", message: "No flex-wrap detected. Cards and grids should use display:flex; flex-wrap:wrap with min-width on children", fix: "Replace grid-template-columns with display:flex; flex-wrap:wrap and flex:1 1 280px; min-width:280px on children" });
  else passes.push("No multi-column card layout detected — flex-wrap not required");

  var gridInMedia = html.match(/@media[\s\S]*?grid-template-columns/g) || [];
  if (gridInMedia.length === 0) passes.push("No grid-template-columns in media queries");
  else issues.push({ severity: "warning", rule: "responsive/no-grid-breakpoints", message: gridInMedia.length + " grid-template-columns overrides found in media queries", fix: "Remove grid-template-columns from media queries. Use flexbox with min-width instead — it wraps naturally" });

  var hasClamp = /clamp\s*\(/.test(html);
  if (hasClamp) passes.push("Uses clamp() for fluid sizing");
  else issues.push({ severity: "warning", rule: "responsive/clamp", message: "No clamp() detected for fluid sizing", fix: "Use clamp(48px, 8vw, 128px) for section padding and clamp(16px, 4vw, 24px) for container padding" });

  var containerAudit = auditContainerWidth(html, containerMaxWidth);
  if (containerAudit.pass) passes.push(containerAudit.pass);
  else if (containerAudit.issue) issues.push(containerAudit.issue);

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

  // ── SVG icon color compliance (design-system icons should use currentColor/token)
  var svgBlocks = html.match(/<svg[\s\S]*?<\/svg>/gi) || [];
  var svgColorValues: string[] = [];          // all fill/stroke color values seen
  var svgHardcoded: string[] = [];            // the subset that hardcode a color
  function isHardcodedColor(v: string): boolean {
    var s = v.trim().toLowerCase();
    if (s === "currentcolor" || s === "none" || s === "transparent" || s === "inherit" || s === "unset" || s === "initial") return false;
    if (/^url\(/.test(s) || /var\(\s*--/.test(s)) return false;
    return /#[0-9a-fA-F]{3,8}\b/.test(s) || /\brgba?\(/.test(s) || /\bhsla?\(/.test(s);
  }
  for (var svg of svgBlocks) {
    // presentation attributes: fill="..." / stroke="..."
    var attrRe = /\b(?:fill|stroke)\s*=\s*"([^"]*)"/gi;
    var attrM;
    while ((attrM = attrRe.exec(svg)) !== null) {
      svgColorValues.push(attrM[1]);
      if (isHardcodedColor(attrM[1])) svgHardcoded.push(attrM[1].trim());
    }
    // inline style fill:/stroke:
    var styleRe = /style\s*=\s*"([^"]*)"/gi;
    var styleM;
    while ((styleM = styleRe.exec(svg)) !== null) {
      var declRe = /\b(?:fill|stroke)\s*:\s*([^;"]+)/gi;
      var declM;
      while ((declM = declRe.exec(styleM[1])) !== null) {
        svgColorValues.push(declM[1]);
        if (isHardcodedColor(declM[1])) svgHardcoded.push(declM[1].trim());
      }
    }
  }
  if (svgHardcoded.length > 0) {
    var uniqHardcoded = Array.from(new Set(svgHardcoded.map(function(v){ return v.toLowerCase(); })));
    issues.push({
      severity: "warning",
      rule: "tokens/svg-hardcoded-color",
      message: svgHardcoded.length + " inline SVG fill/stroke attribute(s) hardcode a color (" + uniqHardcoded.slice(0, 8).join(", ") + ") instead of currentColor/token",
      fix: "Use fill=\"currentColor\" (or stroke=\"currentColor\") so icons inherit text color and theme; for multi-color brand logos that must keep fixed colors, this warning is expected."
    });
  } else if (svgColorValues.length > 0) {
    passes.push("SVG icons use currentColor/tokens (" + svgColorValues.length + " color attrs, 0 hardcoded)");
  }

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

  return { passes: passes, issues: issues };
}
