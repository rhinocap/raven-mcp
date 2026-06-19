import { contrastRatio, parseColor } from "./contrast.js";

export type A11yEl = {
  label?: string;
  value?: string | number | boolean;
  hint?: string;
  traits?: string[];
  role?: string;
  rect?: { x: number; y: number; w: number; h: number };
  fontPt?: number;
  fgColor?: string;
  bgColor?: string;
  dynamicTypeClipped?: boolean;
};

export type A11ySnapshot = {
  elements: A11yEl[];
  viewport: { w: number; h: number };
  options?: { minTarget?: number };
};

type A11yIssue = {
  rule: string;
  message: string;
  fix: string;
};

export type A11yResult = {
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;
  summary: string;
  errors: A11yIssue[];
  warnings: A11yIssue[];
  voiceover_order: string[];
  elements_analyzed: number;
};

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "cell",
  "tab",
  "menuitem",
  "switch",
  "slider",
  "stepper",
  "segmentedcontrol",
  "textfield",
  "searchfield",
]);

const VALUE_BEARING_ROLES = new Set([
  "switch",
  "slider",
  "stepper",
  "segmentedcontrol",
]);

const IOS_SEMANTIC_COLORS: Record<string, string> = {
  label: "#000000",
  secondarylabel: "#8A8A8E",
  tertiarylabel: "#C4C4C7",
  quaternarylabel: "#D6D6DA",
  placeholdertext: "#C4C4C7",
  systembackground: "#FFFFFF",
  secondarysystembackground: "#F2F2F7",
  tertiarysystembackground: "#FFFFFF",
  systemgroupedbackground: "#F2F2F7",
  secondarysystemgroupedbackground: "#FFFFFF",
  tertiarysystemgroupedbackground: "#F2F2F7",
  systemfill: "#E4E4E6",
  secondarysystemfill: "#E9E9EB",
  tertiarysystemfill: "#EFEFF0",
  quaternarysystemfill: "#F4F4F5",
  separator: "#C6C6C8",
  opaqueseparator: "#C6C6C8",
  tint: "#007AFF",
  tintcolor: "#007AFF",
  link: "#007AFF",
  systemblue: "#007AFF",
  systembrown: "#A2845E",
  systemcyan: "#32ADE6",
  systemgreen: "#34C759",
  systemindigo: "#5856D6",
  systemmint: "#00C7BE",
  systemorange: "#FF9500",
  systempink: "#FF2D55",
  systempurple: "#AF52DE",
  systemred: "#FF3B30",
  systemteal: "#30B0C7",
  systemyellow: "#FFCC00",
  systemgray: "#8E8E93",
  systemgray2: "#AEAEB2",
  systemgray3: "#C7C7CC",
  systemgray4: "#D1D1D6",
  systemgray5: "#E5E5EA",
  systemgray6: "#F2F2F7",
  white: "#FFFFFF",
  black: "#000000",
};

function normalizeRole(role: string | undefined): string {
  return (role || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeColorName(color: string): string {
  return color.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValue(value: string | number | boolean | undefined): boolean {
  return value !== undefined && String(value).trim().length > 0;
}

function elementName(el: A11yEl, index: number): string {
  if (hasText(el.label)) return "\"" + el.label!.trim() + "\"";
  if (hasText(el.role)) return "<" + el.role!.trim() + ">";
  return "element " + (index + 1);
}

function voiceoverName(el: A11yEl): string {
  if (hasText(el.label)) return el.label!.trim();
  if (hasText(el.role)) return "<" + el.role!.trim() + ">";
  return "<unknown>";
}

function isIosSemanticColor(color: string): boolean {
  const raw = color.trim();
  if (raw.length === 0) return false;

  const compact = normalizeColorName(raw);
  return (
    compact.indexOf("label") >= 0 ||
    compact.indexOf("background") >= 0 ||
    compact.indexOf("fill") >= 0 ||
    compact.indexOf("separator") >= 0 ||
    compact.indexOf("tint") >= 0 ||
    compact.startsWith("system")
  );
}

function resolveColor(color: string): string {
  const semantic = IOS_SEMANTIC_COLORS[normalizeColorName(color)];
  return semantic || color;
}

function flatten(
  rgba: [number, number, number, number],
  backdrop: [number, number, number]
): [number, number, number] {
  const alpha = Math.max(0, Math.min(1, rgba[3]));
  if (alpha >= 1) return [rgba[0], rgba[1], rgba[2]];
  return [
    Math.round(rgba[0] * alpha + backdrop[0] * (1 - alpha)),
    Math.round(rgba[1] * alpha + backdrop[1] * (1 - alpha)),
    Math.round(rgba[2] * alpha + backdrop[2] * (1 - alpha)),
  ];
}

function colorToRgb(color: string, backdrop: [number, number, number]): [number, number, number] {
  return flatten(parseColor(resolveColor(color)), backdrop);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function gradeFor(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function auditIosA11y(snap: A11ySnapshot): A11yResult {
  const elements = Array.isArray(snap.elements) ? snap.elements : [];
  const minTarget = snap.options && typeof snap.options.minTarget === "number"
    ? snap.options.minTarget
    : 44;

  const errors: A11yIssue[] = [];
  const warnings: A11yIssue[] = [];
  const voiceover_order = elements.map(voiceoverName);

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const role = normalizeRole(el.role);
    const name = elementName(el, i);
    const interactive = INTERACTIVE_ROLES.has(role);

    if (interactive && !hasText(el.label)) {
      errors.push({
        rule: "a11y/missing-label",
        message: name + " is interactive but has no accessibility label.",
        fix: "Add a concise accessibilityLabel that names the action or destination.",
      });
    }

    if (interactive && (!Array.isArray(el.traits) || el.traits.length === 0)) {
      warnings.push({
        rule: "a11y/missing-traits",
        message: name + " is interactive but has no accessibility traits.",
        fix: "Set the appropriate accessibility traits so VoiceOver announces the control type.",
      });
    }

    if (role === "statictext" && !hasText(el.label)) {
      warnings.push({
        rule: "a11y/unlabeled-text",
        message: "Static text at element " + (i + 1) + " has no accessibility label.",
        fix: "Provide the visible text as the accessibility label, or hide decorative text from accessibility.",
      });
    }

    if (VALUE_BEARING_ROLES.has(role) && !hasValue(el.value)) {
      warnings.push({
        rule: "a11y/missing-value",
        message: name + " is a value-bearing control but has no accessibility value.",
        fix: "Set accessibilityValue to the current state, position, or selected segment.",
      });
    }

    if (interactive && el.rect && (el.rect.w < minTarget || el.rect.h < minTarget)) {
      errors.push({
        rule: "a11y/touch-target",
        message: name + " touch target is " + round2(el.rect.w) + "x" + round2(el.rect.h) + "px; minimum is " + minTarget + "x" + minTarget + "px.",
        fix: "Increase the tappable frame or hit area to at least " + minTarget + "x" + minTarget + "px.",
      });
    }

    if (hasText(el.fgColor) && hasText(el.bgColor)) {
      const bgRgb = colorToRgb(el.bgColor!, [255, 255, 255]);
      const fgRgb = colorToRgb(el.fgColor!, bgRgb);
      const ratio = contrastRatio(fgRgb, bgRgb);
      const threshold = typeof el.fontPt === "number" && el.fontPt >= 18 ? 3 : 4.5;

      if (ratio < threshold) {
        const roundedRatio = round2(ratio);
        const delta = round2(threshold - ratio);
        const issue = {
          rule: "a11y/contrast",
          message: name + " contrast ratio is " + roundedRatio + ":1; needs " + threshold + ":1; delta-to-pass " + delta + ".",
          fix: "Increase foreground/background contrast to at least " + threshold + ":1 and verify in light and dark mode.",
        };

        if (isIosSemanticColor(el.fgColor!) || isIosSemanticColor(el.bgColor!)) {
          warnings.push(issue);
        } else {
          errors.push(issue);
        }
      }
    }

    if (el.dynamicTypeClipped === true) {
      errors.push({
        rule: "a11y/dynamic-type-clipping",
        message: name + " clips when Dynamic Type is enlarged.",
        fix: "Allow the text container to grow, wrap, or scroll at accessibility text sizes.",
      });
    }
  }

  const score = Math.max(0, 100 - errors.length * 8 - warnings.length * 3);
  const grade = gradeFor(score);
  const summary = errors.length + " error(s), " + warnings.length + " warning(s) across " + elements.length + " element(s).";

  return {
    grade,
    score,
    summary,
    errors,
    warnings,
    voiceover_order,
    elements_analyzed: elements.length,
  };
}
