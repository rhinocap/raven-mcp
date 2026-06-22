// ── Cross-page consistency audit ─────────────────────────────────────
//
// Accepts multiple pages (name + HTML string) and flags cross-page
// divergence in (a) content-container width and (b) hero heading tier.
// The canonical (reference) value for each dimension is inferred from the
// corpus modal when no token is supplied, so callers need not know the
// project's token in advance.
//
// Pure HTML-string analysis: no I/O, no browser.
// Reuses `containerScaleWidths` from audit-container.ts; does NOT modify it.
//
// Addresses GitHub issue #9 ("single-blob audit blind spot") — fix #1
// (multi-page / corpus audit mode).

import { containerScaleWidths } from "./audit-container.js";

// ── Result types ─────────────────────────────────────────────────────

export type ConsistencyDimension = {
  reference: string | null;
  source: "token" | "modal" | "none";
  outliers: string[]; // page names
};

export type ConsistencyIssue = {
  severity: "warning";
  rule: string;
  message: string;
  fix: string;
};

export type ConsistencyPageResult = {
  name: string;
  container: {
    px: number | null;
    classes: string[];
    signature: string;
  };
  hero: {
    size_px: number | null;
    classes: string;
    signature: string;
  };
};

export type ConsistencyResult = {
  page_count: number;
  pages: ConsistencyPageResult[];
  consistency: {
    container: ConsistencyDimension;
    hero: ConsistencyDimension;
  };
  issues: ConsistencyIssue[];
  score: number;
  grade: "A" | "B" | "C" | "D";
  summary: string;
};

// ── Per-page extraction helpers ──────────────────────────────────────

var CONTAINER_CLASS_RE = /\b(max-w-[a-z0-9.]+|container[a-z0-9-]*|w-screen|w-full)\b/gi;

/**
 * Extract container-class tokens from the page HTML.
 * Returns a sorted, unique array of class tokens matching the pattern.
 */
function extractContainerClasses(html: string): string[] {
  var found: string[] = [];
  var m: RegExpExecArray | null;
  var re = new RegExp(CONTAINER_CLASS_RE.source, "gi");
  while ((m = re.exec(html)) !== null) {
    found.push(m[0].toLowerCase());
  }
  // Sort + deduplicate
  var unique = Array.from(new Set(found)).sort();
  return unique;
}

/**
 * Largest declared heading font-size in px among h1/h2 CSS rules, or null.
 * Mirrors the approach in page-checks.ts lines ~135-138: regex for h1/h2 CSS
 * rules then pulls the font-size value.
 */
function extractHeroSizePx(html: string): number | null {
  var best: number | null = null;
  var tags = ["h1", "h2"];
  for (var i = 0; i < tags.length; i++) {
    var ht = tags[i];
    var hre = new RegExp("(?:^|[\\s,}])" + ht + "\\b[^{]*\\{[^}]*font-size\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*px", "i");
    var hm = html.match(hre);
    if (hm) {
      var n = parseFloat(hm[1]);
      if (!isNaN(n) && (best === null || n > best)) best = n;
    }
  }
  return best;
}

/**
 * Extract the class attribute of the FIRST <h1 ...> tag in the page.
 * Returns "" if none found or no class attr present.
 */
function extractFirstH1Classes(html: string): string {
  var m = html.match(/<h1\b([^>]*)>/i);
  if (!m) return "";
  var attrs = m[1];
  var classMatch = attrs.match(/\bclass\s*=\s*(?:"([^"]*?)"|'([^']*?)'|([^\s>]*))/i);
  if (!classMatch) return "";
  return (classMatch[1] || classMatch[2] || classMatch[3] || "").trim();
}

var HERO_TYPE_SCALE_RE = /\btext-(display-[a-z0-9]+|[0-9]?xl|xs|sm|base|lg|xl)\b/i;

/**
 * Derive the hero signature for a page.
 * If hero_size_px is known, use that as the signature (e.g. "64").
 * Else find the first type-scale class in hero_classes.
 * Else "".
 */
function heroSignature(heroPx: number | null, heroClasses: string): string {
  if (heroPx !== null) return String(heroPx);
  var m = heroClasses.match(HERO_TYPE_SCALE_RE);
  if (m) return m[0];
  return "";
}

// ── Per-page extraction ───────────────────────────────────────────────

function extractPage(name: string, html: string): ConsistencyPageResult {
  // Container
  var widths = containerScaleWidths(html);
  var containerPx = widths.length > 0 ? Math.max.apply(null, widths) : null;
  var containerClasses = extractContainerClasses(html);
  var containerSignature: string;
  if (containerPx !== null) {
    containerSignature = String(containerPx);
  } else {
    containerSignature = containerClasses.join(" ");
  }

  // Hero
  var heroPx = extractHeroSizePx(html);
  var heroClasses = extractFirstH1Classes(html);
  var herSig = heroSignature(heroPx, heroClasses);

  return {
    name: name,
    container: {
      px: containerPx,
      classes: containerClasses,
      signature: containerSignature
    },
    hero: {
      size_px: heroPx,
      classes: heroClasses,
      signature: herSig
    }
  };
}

// ── Modal inference ───────────────────────────────────────────────────

/**
 * Find the modal (most frequent) value among non-empty strings.
 * Returns null if all are empty, or if there's a tie among ≥2 distinct values.
 */
function findModal(values: string[]): string | null {
  var nonEmpty = values.filter(function(v) { return v !== ""; });
  if (nonEmpty.length === 0) return null;

  var counts: Record<string, number> = {};
  for (var i = 0; i < nonEmpty.length; i++) {
    var v = nonEmpty[i];
    counts[v] = (counts[v] || 0) + 1;
  }

  var maxCount = 0;
  var keys = Object.keys(counts);
  for (var k = 0; k < keys.length; k++) {
    if (counts[keys[k]] > maxCount) maxCount = counts[keys[k]];
  }

  // All values with the max count
  var leaders = keys.filter(function(k) { return counts[k] === maxCount; });

  // Tie among ≥2 distinct values → no modal
  if (leaders.length >= 2) return null;

  return leaders[0];
}

// ── Dimension consistency check ───────────────────────────────────────

type DimResult = {
  reference: string | null;
  source: "token" | "modal" | "none";
  outliers: string[];
};

function checkDimension(
  pageNames: string[],
  signatures: string[],
  token: string | number | undefined
): DimResult {
  // All non-empty signatures
  var nonEmpty = signatures.filter(function(s) { return s !== ""; });

  // 1. Token override
  if (token !== undefined && token !== null) {
    var ref = String(token);
    var outliers: string[] = [];
    for (var i = 0; i < signatures.length; i++) {
      var sig = signatures[i];
      if (sig !== "" && sig !== ref) {
        outliers.push(pageNames[i]);
      }
    }
    return { reference: ref, source: "token", outliers: outliers };
  }

  // 2. All empty → source "none"
  if (nonEmpty.length === 0) {
    return { reference: null, source: "none", outliers: [] };
  }

  // 3. Modal inference
  var modal = findModal(signatures);

  if (modal !== null) {
    // Clear modal: outliers are non-empty pages that differ
    var outliers2: string[] = [];
    for (var j = 0; j < signatures.length; j++) {
      if (signatures[j] !== "" && signatures[j] !== modal) {
        outliers2.push(pageNames[j]);
      }
    }
    return { reference: modal, source: "modal", outliers: outliers2 };
  }

  // 4. Tie (no modal): emit all non-empty differing pages as outliers.
  // reference is null (can't declare canonical without a token), so source is
  // "none" — "modal" always carries a non-null reference, keeping the two fields
  // internally consistent for consumers.
  var allOutliers: string[] = [];
  for (var m = 0; m < signatures.length; m++) {
    if (signatures[m] !== "") {
      allOutliers.push(pageNames[m]);
    }
  }
  return { reference: null, source: "none", outliers: allOutliers };
}

// ── Issue generation ──────────────────────────────────────────────────

function makeContainerIssue(
  outliers: string[],
  reference: string | null
): ConsistencyIssue {
  // Reference may be a numeric px width ("1152") or a class signature ("container-wide");
  // only suffix "px" for the numeric form.
  var refIsNumeric = reference !== null && /^\d+(?:\.\d+)?$/.test(reference);
  var refStr = reference === null ? "(no modal — all values diverge)" : (refIsNumeric ? reference + "px" : reference);
  var pageList = outliers.join(", ");
  return {
    severity: "warning",
    rule: "consistency/container-width",
    message:
      "Container-width inconsistency across pages. Reference: " +
      refStr +
      ". Divergent page(s): " +
      pageList +
      ".",
    fix:
      "Align all pages to the same container token (" +
      (reference === null ? "the project canonical width" : refStr) +
      "). Use a shared layout wrapper so the container is defined once, not per-page."
  };
}

function makeHeroIssue(
  outliers: string[],
  reference: string | null
): ConsistencyIssue {
  var refStr = reference !== null ? reference : "(no modal — all values diverge)";
  var pageList = outliers.join(", ");
  return {
    severity: "warning",
    rule: "consistency/hero-tier",
    message:
      "Hero heading tier inconsistency across pages. Reference: " +
      refStr +
      ". Divergent page(s): " +
      pageList +
      ".",
    fix:
      "Use the same hero heading class/size (" +
      (reference !== null ? reference : "define a canonical tier") +
      ") for the top-level heading on every page. If a page intentionally uses a smaller heading, document the exception in the design system."
  };
}

// ── Main export ───────────────────────────────────────────────────────

export type AuditConsistencyOptions = {
  container_token?: number;
  hero_token?: string;
};

/**
 * Audit multiple pages for cross-page consistency of:
 *   - Content-container width (container_px / container_classes)
 *   - Hero heading tier (hero_size_px / hero_classes)
 *
 * Infers the canonical (modal) value from the corpus when no token is supplied.
 * Pure — no I/O, no browser. Assumes pages.length >= 2.
 */
export function auditConsistency(
  pages: Array<{ name: string; html: string }>,
  opts?: AuditConsistencyOptions
): ConsistencyResult {
  var options = opts || {};

  // Extract per-page data
  var pageResults: ConsistencyPageResult[] = pages.map(function(p) {
    return extractPage(p.name, p.html);
  });

  var pageNames = pageResults.map(function(p) { return p.name; });
  var containerSigs = pageResults.map(function(p) { return p.container.signature; });
  var heroSigs = pageResults.map(function(p) { return p.hero.signature; });

  // Consistency checks
  var containerDim = checkDimension(pageNames, containerSigs, options.container_token);
  var heroDim = checkDimension(pageNames, heroSigs, options.hero_token);

  // Issues
  var issues: ConsistencyIssue[] = [];
  if (containerDim.outliers.length > 0) {
    issues.push(makeContainerIssue(containerDim.outliers, containerDim.reference));
  }
  if (heroDim.outliers.length > 0) {
    issues.push(makeHeroIssue(heroDim.outliers, heroDim.reference));
  }

  // Scoring
  var failCount = (containerDim.outliers.length > 0 ? 1 : 0) +
                  (heroDim.outliers.length > 0 ? 1 : 0);
  var score = Math.round(((2 - failCount) / 2) * 100);
  var grade: "A" | "B" | "C" | "D" = failCount === 0 ? "A" : failCount === 1 ? "C" : "D";

  // Summary
  var summary: string;
  if (failCount === 0) {
    summary =
      "All " +
      pages.length +
      " pages are consistent on container width and hero heading tier. Score: " +
      score +
      "/100 (A).";
  } else {
    var dims: string[] = [];
    if (containerDim.outliers.length > 0) dims.push("container width");
    if (heroDim.outliers.length > 0) dims.push("hero heading tier");
    summary =
      pages.length +
      " pages audited. Inconsistency detected in: " +
      dims.join(", ") +
      ". Score: " +
      score +
      "/100 (" +
      grade +
      ").";
  }

  return {
    page_count: pages.length,
    pages: pageResults,
    consistency: {
      container: containerDim,
      hero: heroDim
    },
    issues: issues,
    score: score,
    grade: grade,
    summary: summary
  };
}
