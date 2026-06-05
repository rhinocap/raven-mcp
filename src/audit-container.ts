// ── Container-width auditing ────────────────────────────────────────
//
// The `responsive/max-width` check used to hardcode ~1200px: it passed if the
// HTML contained `max-width: 11xx/12xx px` and warned otherwise. That has two
// blind spots, both reported in issue #9:
//
//   1. It rewards *any* ~1200px max-width and is blind to a project's own
//      canonical container token. A page throttled to 768px while the rest of
//      the design system sits on, say, 1152px is not flagged — the divergence
//      that actually breaks cross-page alignment is invisible.
//   2. `responsive/max-width` is the single most-fired warning in practice, yet
//      it only ever nudges *toward* adding a max-width, never toward matching
//      the system.
//
// When the caller passes `containerMaxWidth` (their canonical container token),
// this module reframes the rule to flag *divergence from that token* — too
// narrow OR too wide — instead of a generic 1200px heuristic. With no token
// passed, the original heuristic is preserved exactly, so existing callers are
// unaffected.
//
// Limitation (shared with the rest of audit_page): this reads *declared* CSS
// (`max-width: Npx` in <style>/inline). Utility-class-only markup (e.g. a
// Tailwind `max-w-3xl` with no compiled CSS in the blob) carries no declared
// max-width to read; pass the compiled stylesheet for those.

export type AuditIssue = {
  severity: "error" | "warning";
  rule: string;
  message: string;
  fix: string;
};

export type ContainerAuditResult = { pass?: string; issue?: AuditIssue };

// Pull every *declared* `max-width: Npx` out of the markup. Media-query
// preludes (`@media (max-width: 768px) {`) are stripped first so a responsive
// breakpoint condition is never mistaken for a container constraint.
export function extractDeclaredMaxWidths(html: string): number[] {
  var stripped = html.replace(/@media[^{]*\{/g, "{");
  var out: number[] = [];
  var re = /max-width\s*:\s*(\d+(?:\.\d+)?)\s*px/g;
  var m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    var n = parseFloat(m[1]);
    if (!isNaN(n) && n > 0) out.push(n);
  }
  return out;
}

// Container-scale widths only. Floor at 700px so legitimate nested prose/
// reading measures (Tailwind max-w-2xl ≈ 672, max-w-prose ≈ 65ch, etc.) — which
// are correctly narrower than the page container by design — aren't mistaken
// for an off-system container throttle. The defect this catches is a *content
// container* (≥700px tier) that diverges from the system token.
var CONTAINER_FLOOR_PX = 700;

export function containerScaleWidths(html: string): number[] {
  return extractDeclaredMaxWidths(html).filter(function (w) {
    return w >= CONTAINER_FLOOR_PX;
  });
}

// Token tolerance: 5% of the token, floored at 16px, so 1152px ± ~58px still
// reads as "on token" but 768 vs 1152 does not.
function tokenTolerance(expectedPx: number): number {
  return Math.max(16, expectedPx * 0.05);
}

// Audit a page's content-container width. Token-aware when `expectedPx` is
// given; otherwise falls back to the original 1200px heuristic verbatim.
export function auditContainerWidth(
  html: string,
  expectedPx?: number
): ContainerAuditResult {
  if (typeof expectedPx === "number" && expectedPx > 0) {
    var containers = containerScaleWidths(html);
    var tol = tokenTolerance(expectedPx);

    // Worst offender first: any container-scale width outside tolerance is a
    // divergence, even when the token width ALSO appears elsewhere in the
    // markup (e.g. a shared stylesheet defines the token, but the page itself
    // overrides to an off-system width — exactly the issue-#9 case).
    var divergent = containers
      .filter(function (w) {
        return Math.abs(w - expectedPx) > tol;
      })
      .sort(function (a, b) {
        return Math.abs(b - expectedPx) - Math.abs(a - expectedPx);
      });

    if (divergent.length > 0) {
      var worst = divergent[0];
      var dir = worst < expectedPx ? "narrower" : "wider";
      var deltaPx = Math.round(Math.abs(worst - expectedPx));
      return {
        issue: {
          severity: "warning",
          rule: "responsive/max-width",
          message:
            "Content container max-width " +
            worst +
            "px diverges from your " +
            expectedPx +
            "px container token (" +
            dir +
            " by " +
            deltaPx +
            "px). Off-system container widths break cross-page alignment.",
          fix:
            "Use the project's canonical container token (" +
            expectedPx +
            "px) for top-level content. If the content should read narrower, nest it inside the " +
            expectedPx +
            "px container rather than replacing the container's max-width."
        }
      };
    }

    var onToken = containers.filter(function (w) {
      return Math.abs(w - expectedPx) <= tol;
    });
    if (onToken.length > 0) {
      return { pass: "Content container matches the " + expectedPx + "px container token" };
    }

    return {
      issue: {
        severity: "warning",
        rule: "responsive/max-width",
        message:
          "No content container max-width detected — expected your " +
          expectedPx +
          "px container token.",
        fix: "Add max-width: " + expectedPx + "px; margin: 0 auto to top-level content containers."
      }
    };
  }

  // ── No token passed: preserve the original heuristic exactly.
  var hasMaxWidth = /max-width\s*:\s*(1[12]\d{2}|1200)\s*px/.test(html);
  if (hasMaxWidth) return { pass: "Content has max-width constraint" };
  return {
    issue: {
      severity: "warning",
      rule: "responsive/max-width",
      message: "No 1200px max-width constraint detected on content containers",
      fix:
        "Add max-width: 1200px; margin: 0 auto to content containers. " +
        "Pass containerMaxWidth to audit_page to check against your design system's own container token instead."
    }
  };
}
