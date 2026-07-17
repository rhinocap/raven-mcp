/**
 * audit-url.ts — Layer 0 render-and-capture transport.
 *
 * Renders a live URL at each viewport×theme, scroll-settles, fires interactions,
 * captures real pixels + DOM, then runs the EXISTING checks (audit_page rule
 * engine, contrast, responsive-visibility, video-blank, screenshot diff) plus
 * pixel checks (image edge symmetry) over the captured output. Every finding is
 * tagged confirmed | likely-artifact | inconclusive with its evidence, and
 * ranked by severity.
 *
 * This tool does NOT reimplement the checks — it reuses:
 *   · runPageChecks            (the audit_page rule engine, shared verbatim)
 *   · verifyFindings           (the adversarial confirmed/likely-artifact tagger)
 *   · captureResponsiveVisibility (desktop-visible / mobile-hidden divergence)
 *   · auditContrastUrl         (per-element WCAG AA/AAA)
 *   · capturePage video-blank detection
 *   · auditImageEdges          (sliced/cropped image edge symmetry)
 *   · diffScreenshots          (baseline vs post-interaction state diff)
 */

import { capturePage, verifyFindings, CaptureUnavailableError } from "./capture.js";
import type { Interaction, Theme, VerifiableFinding, FindingVerdict } from "./capture.js";
import { runPageChecks } from "./page-checks.js";
import { captureResponsiveVisibility } from "./responsive.js";
import { auditContrastUrl, collapseShortTextContrastFailures } from "./contrast.js";
import { auditImageEdges } from "./asset-integrity.js";
import { diffScreenshots } from "./image-diff.js";

export type ViewportSpec = { w: number; h: number; label?: string };
export type Verdict = "confirmed" | "likely-artifact" | "inconclusive";
export type FindingSource =
  | "page"
  | "contrast"
  | "responsive-visibility"
  | "video"
  | "asset-integrity"
  | "hover-state";

export type AuditUrlFinding = {
  source: FindingSource;
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  fix: string;
  selector?: string;
  viewport: string;
  theme: Theme;
  verdict: Verdict;
  evidence: string;
};

export type AuditUrlCapture = {
  viewport: string;
  theme: Theme;
  scrolledToBottom: boolean;
  animationsSettled: boolean;
  screenshot_bytes: number;
  screenshot?: string;
};

export type AuditUrlResult = {
  tool: "audit_url";
  url: string;
  viewports: ViewportSpec[];
  themes: Theme[];
  findings: AuditUrlFinding[];
  counts: {
    total: number;
    confirmed: number;
    likely_artifact: number;
    inconclusive: number;
    errors: number;
    warnings: number;
  };
  summary: string;
  captures: AuditUrlCapture[];
  warnings: string[];
};

export type AuditUrlOptions = {
  viewports?: ViewportSpec[];
  themes?: Theme[];
  scroll_settle?: boolean;
  interactions?: Interaction[];
  containerMaxWidth?: number;
  timeoutMs?: number;
  includeScreenshots?: boolean;
};

const DEFAULT_VIEWPORTS: ViewportSpec[] = [
  { w: 393, h: 852, label: "iphone" },
  { w: 1440, h: 900, label: "desktop" },
  { w: 2160, h: 1200, label: "wide" }
];

const DEFAULT_THEMES: Theme[] = ["light", "dark"];

const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

function viewportLabel(v: ViewportSpec): string {
  return (v.label ? v.label : "vp") + " " + v.w + "×" + v.h;
}

export async function auditUrl(url: string, opts: AuditUrlOptions = {}): Promise<AuditUrlResult> {
  const viewports = opts.viewports && opts.viewports.length > 0 ? opts.viewports : DEFAULT_VIEWPORTS;
  const themes = opts.themes && opts.themes.length > 0 ? opts.themes : DEFAULT_THEMES;
  const scrollSettle = opts.scroll_settle !== false; // default true
  const interactions = Array.isArray(opts.interactions) ? opts.interactions : [];
  const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 30000;
  const includeScreenshots = opts.includeScreenshots === true;

  const findings: AuditUrlFinding[] = [];
  const captures: AuditUrlCapture[] = [];
  const warnings: string[] = [];

  // ── Responsive visibility (run ONCE across all viewport widths) ─────────────
  try {
    const widths = viewports.map((v) => v.w);
    const rv = await captureResponsiveVisibility(url, widths, { timeoutMs });
    const rvLabel = "responsive " + Math.min(...rv.breakpoints) + "→" + Math.max(...rv.breakpoints);
    for (const row of rv.flagged) {
      const oversight = row.category === "likely-oversight";
      findings.push({
        source: "responsive-visibility",
        rule: "responsive/hidden-on-mobile",
        severity: oversight ? "error" : "info",
        message:
          (oversight ? "Content element" : "Decorative element") +
          " is visible on desktop but hidden on mobile" +
          (row.hidingClass ? " (" + row.hidingClass + ")" : ""),
        fix: oversight
          ? "This is real content invisible on mobile — remove the responsive-hide or provide a mobile equivalent."
          : "Decorative element intentionally hidden on mobile — no action needed.",
        selector: row.selector,
        viewport: rvLabel,
        theme: themes[0],
        verdict: oversight ? "confirmed" : "likely-artifact",
        evidence:
          "computed visibility across breakpoints: " +
          row.visibleAt.map((b) => b.breakpoint + "px=" + (b.visible ? "shown" : "hidden")).join(", ")
      });
    }
  } catch (error) {
    if (error instanceof CaptureUnavailableError) {
      return unavailableResult(url, viewports, themes);
    }
    warnings.push("responsive-visibility failed: " + errorMessage(error));
  }

  // ── Per viewport × theme ────────────────────────────────────────────────────
  let firstPass = true;
  for (const vp of viewports) {
    for (const theme of themes) {
      const vpLabel = viewportLabel(vp);

      let cap;
      try {
        cap = await capturePage(url, {
          viewport: { w: vp.w, h: vp.h },
          theme,
          scroll_settle: scrollSettle,
          interactions,
          collectImageEdges: firstPass, // image slicing is source-level — sample once
          timeoutMs
        });
      } catch (error) {
        if (error instanceof CaptureUnavailableError) {
          return unavailableResult(url, viewports, themes);
        }
        warnings.push("capture failed (" + vpLabel + "/" + theme + "): " + errorMessage(error));
        continue;
      }

      captures.push({
        viewport: vpLabel,
        theme,
        scrolledToBottom: cap.scrolledToBottom,
        animationsSettled: cap.animationsSettled,
        screenshot_bytes: cap.screenshotBase64 ? cap.screenshotBase64.length : 0,
        screenshot: includeScreenshots ? cap.screenshotBase64 : undefined
      });
      for (const w of cap.warnings) warnings.push(vpLabel + "/" + theme + ": " + w);

      // ── Page checks over the rendered DOM, then adversarially verify ─────────
      const pageResult = runPageChecks(cap.renderedHtml, { containerMaxWidth: opts.containerMaxWidth });
      const verifiable: VerifiableFinding[] = pageResult.issues.map((iss, i) => ({
        key: iss.rule + ":" + i,
        kind: "issue" as const,
        rule: iss.rule,
        message: iss.message
      }));

      let verdicts: FindingVerdict[] = [];
      try {
        verdicts = await verifyFindings(
          { html: cap.renderedHtml },
          verifiable,
          { viewport: { w: vp.w, h: vp.h }, timeoutMs }
        );
      } catch (error) {
        warnings.push("page-check verification failed (" + vpLabel + "/" + theme + "): " + errorMessage(error));
      }

      pageResult.issues.forEach((iss, i) => {
        const v = verdicts[i];
        findings.push({
          source: "page",
          rule: iss.rule,
          severity: iss.severity,
          message: iss.message,
          fix: iss.fix,
          viewport: vpLabel,
          theme,
          verdict: normalizeVerdict(v ? v.verdict : undefined),
          evidence: v && v.evidence ? v.evidence : "rendered-DOM check (no independent re-check available)"
        });
      });

      // ── Blank / empty media containers ───────────────────────────────────────
      for (const va of cap.videoArtifacts) {
        findings.push({
          source: "video",
          rule: "media/blank-container",
          severity: "warning",
          message: "Media element rendered blank after scroll + play attempt",
          fix:
            "If this is a real video, ensure a valid source loads (and preload allows it); if it is a lazy preload=none clip, this is expected.",
          selector: va.selector,
          viewport: vpLabel,
          theme,
          // preload=none that we actively played and still got nothing back is a
          // genuinely empty/broken container, not merely lazy — surface it.
          verdict: "confirmed",
          evidence:
            "video readyState stayed < 2 (HAVE_CURRENT_DATA) after scrollIntoView + play(); preload=\"" +
            va.preload +
            "\""
        });
      }

      // ── Image edge symmetry (sliced/cropped) — first pass only ───────────────
      if (firstPass && cap.imageEdges && cap.imageEdges.length > 0) {
        const edgeVerdicts = auditImageEdges(cap.imageEdges);
        for (const ev of edgeVerdicts) {
          if (ev.verdict === "clean") continue;
          findings.push({
            source: "asset-integrity",
            rule: "asset/sliced-edge",
            severity: ev.verdict === "likely-sliced" ? "warning" : "info",
            message:
              ev.verdict === "likely-sliced"
                ? "Image content appears cut off at the " + ev.cut_edge + " edge"
                : "Image edges could not be analysed",
            fix:
              ev.verdict === "likely-sliced"
                ? "Re-export the image so content does not run into the " + ev.cut_edge + " frame edge."
                : "Serve the image same-origin (or with CORS) so its pixels can be sampled.",
            selector: ev.selector,
            viewport: vpLabel,
            theme,
            verdict: ev.verdict === "likely-sliced" ? "confirmed" : "inconclusive",
            evidence: ev.reason
          });
        }
      }

      // ── Hover/interaction state diff (white-wash etc.) ───────────────────────
      if (interactions.length > 0) {
        try {
          const baseline = await capturePage(url, {
            viewport: { w: vp.w, h: vp.h },
            theme,
            scroll_settle: scrollSettle,
            timeoutMs
          });
          const diff = await diffScreenshots(baseline.screenshotBase64, cap.screenshotBase64);
          const brightness = diff.dimensions.find((d) => d.dimension === "brightness");
          const before = brightness ? brightness.before : 0;
          const after = brightness ? brightness.after : 0;
          const wash = diff.changed_ratio > 0.3 && after - before > 0.2 && after > 0.7;
          if (wash) {
            findings.push({
              source: "hover-state",
              rule: "interaction/state-wash",
              severity: "warning",
              message:
                "Firing the interaction(s) washed a large region toward white — content may be obscured in this state",
              fix:
                "Check the interaction's resulting state (e.g. an overlay/filter at full opacity) — it should not white-out underlying content.",
              viewport: vpLabel,
              theme,
              verdict: "confirmed",
              evidence:
                Math.round(diff.changed_ratio * 100) +
                "% of pixels changed and mean brightness rose " +
                before.toFixed(2) +
                " → " +
                after.toFixed(2) +
                " after the interaction (near-white)"
            });
          }
        } catch (error) {
          warnings.push("hover-state diff failed (" + vpLabel + "/" + theme + "): " + errorMessage(error));
        }
      }

      // ── Per-element WCAG contrast ────────────────────────────────────────────
      try {
        const contrast = await auditContrastUrl(url, { viewport: { w: vp.w, h: vp.h }, theme, timeoutMs });
        const contrastGroups = collapseShortTextContrastFailures(contrast.aa_failures);
        for (const group of contrastGroups) {
          const rep = group.rows[0];
          if (group.isShortTextGroup) {
            const sampleTexts = group.rows.slice(0, 5).map((r) => JSON.stringify(r.text));
            findings.push({
              source: "contrast",
              rule: "contrast/aa",
              severity: "warning",
              message:
                group.rows.length +
                (group.rows.length === 1 ? " short text fragment fails" : " short text fragments fail") +
                " WCAG AA contrast (ratio " +
                rep.ratio +
                ":1, needs " +
                rep.required_aa +
                ":1) — likely motion-split or icon glyphs; inspect parent, not each letter",
              fix:
                "Check contrast on the parent element or shared style rule (not each fragment) — darken text or lighten background until the ratio reaches " +
                rep.required_aa +
                ":1. If this is a deliberate icon glyph, no action is needed.",
              selector: rep.selector,
              viewport: vpLabel,
              theme,
              verdict: "likely-artifact",
              evidence:
                "computed ratio " +
                rep.ratio +
                ":1 between " +
                rep.foreground +
                " on " +
                rep.background +
                " across " +
                group.rows.length +
                " short text fragment(s); sample texts: " +
                sampleTexts.join(", ")
            });
          } else {
            findings.push({
              source: "contrast",
              rule: "contrast/aa",
              severity: "error",
              message:
                "Text fails WCAG AA contrast (" +
                rep.ratio +
                ":1, needs " +
                rep.required_aa +
                ":1)" +
                (rep.text ? ': "' + rep.text + '"' : ""),
              fix:
                "Increase contrast by " +
                rep.delta_to_aa +
                " — darken the text or lighten the background until the ratio reaches " +
                rep.required_aa +
                ":1.",
              selector: rep.selector,
              viewport: vpLabel,
              theme,
              verdict: "confirmed",
              evidence:
                "computed ratio " +
                rep.ratio +
                ":1 between " +
                rep.foreground +
                " on " +
                rep.background +
                " at " +
                rep.fontPx +
                "px (required AA " +
                rep.required_aa +
                ":1)"
            });
          }
        }
      } catch (error) {
        if (error instanceof CaptureUnavailableError) {
          return unavailableResult(url, viewports, themes);
        }
        warnings.push("contrast audit failed (" + vpLabel + "/" + theme + "): " + errorMessage(error));
      }

      firstPass = false;
    }
  }

  // ── Rank by severity, then group by source ──────────────────────────────────
  findings.sort((a, b) => {
    const sr = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (sr !== 0) return sr;
    return a.source.localeCompare(b.source);
  });

  const counts = {
    total: findings.length,
    confirmed: findings.filter((f) => f.verdict === "confirmed").length,
    likely_artifact: findings.filter((f) => f.verdict === "likely-artifact").length,
    inconclusive: findings.filter((f) => f.verdict === "inconclusive").length,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length
  };

  const summary =
    findings.length +
    " findings across " +
    viewports.length +
    " viewport(s) × " +
    themes.length +
    " theme(s) — " +
    counts.confirmed +
    " confirmed, " +
    counts.likely_artifact +
    " likely-artifact, " +
    counts.inconclusive +
    " inconclusive";

  return {
    tool: "audit_url",
    url,
    viewports,
    themes,
    findings,
    counts,
    summary,
    captures,
    warnings
  };
}

function normalizeVerdict(v: string | undefined): Verdict {
  if (v === "confirmed" || v === "likely-artifact" || v === "inconclusive") return v;
  return "inconclusive";
}

function unavailableResult(url: string, viewports: ViewportSpec[], themes: Theme[]): AuditUrlResult {
  return {
    tool: "audit_url",
    url,
    viewports,
    themes,
    findings: [],
    counts: { total: 0, confirmed: 0, likely_artifact: 0, inconclusive: 0, errors: 0, warnings: 0 },
    summary: "audit_url needs headless chromium. Run: npx playwright install chromium",
    captures: [],
    warnings: ["Playwright chromium not available. Run: npx playwright install chromium"]
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
