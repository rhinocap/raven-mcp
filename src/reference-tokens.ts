import type { DesignMdValue, FlattenedDesignToken } from "./designmd.js";
import { parseKnownColor } from "./contrast.js";

export type BindingVerdict = "exact" | "near" | "none";

export interface Thresholds {
  color: number;
  length: number;
  unitless: number;
  rootPx: number;
}

export interface TokenBinding {
  property: string;
  captured: string;
  token?: string;
  css_var?: string;
  token_value?: string;
  verdict: BindingVerdict;
  delta?: number;
  delta_unit?: "px" | "rgb" | "ratio" | "unitless";
  why: string;
}

export interface ReferenceTokenMap {
  bindings: TokenBinding[];
  gaps: Array<{ property: string; captured: string; why: string }>;
  /** Bound and total count only properties eligible for deterministic matching. */
  coverage: { bound: number; total: number; ratio: number };
  ramps_used: string[];
  /** Design-system problems found while resolving tokens, independent of any one property. */
  diagnostics: string[];
}

type ResolvedToken = FlattenedDesignToken & { resolved?: string; error?: string };
type Match = {
  token: ResolvedToken;
  verdict: Exclude<BindingVerdict, "none">;
  delta: number;
  delta_unit: "px" | "rgb" | "ratio" | "unitless";
  why: string;
};

const DEFAULT_THRESHOLDS: Thresholds = {
  color: 12,
  length: 2,
  unitless: 0.01,
  rootPx: 16,
};

export function mapReferenceToTokens(
  captured: Record<string, string>,
  tokens: FlattenedDesignToken[],
  opts?: { thresholds?: Partial<Thresholds>; properties?: string[] }
): ReferenceTokenMap {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...opts?.thresholds };
  const properties = (opts?.properties || Object.keys(captured)).filter((property) => property in captured);
  const bindings: TokenBinding[] = [];
  const gaps: ReferenceTokenMap["gaps"] = [];
  let total = 0;

  if (tokens.length === 0) {
    for (const property of properties) {
      if (propertyKind(property, captured[property]) !== "other") total++;
      gaps.push({ property, captured: captured[property], why: "The project has no tokens to match." });
    }
    return { bindings, gaps, coverage: { bound: 0, total, ratio: 0 }, ramps_used: [], diagnostics: [] };
  }

  const tokensByPath = new Map(tokens.map((token) => [token.path, token]));
  const resolved = tokens.map((token) => resolveToken(token, tokensByPath));
  const broken = resolved.filter((token) => token.error).sort(compareTokenPath);

  for (const property of properties) {
    const value = captured[property];
    const kind = propertyKind(property, value);
    if (kind === "other") {
      gaps.push({ property, captured: value, why: property + " is not a deterministically matchable property class." });
      continue;
    }
    total++;

    const invalid = capturedValueProblem(kind, value, thresholds.rootPx);
    if (invalid) {
      gaps.push({ property, captured: value, why: invalid });
      continue;
    }

    const matches = resolved
      .filter((token) => token.resolved !== undefined)
      .map((token) => compareValue(kind, value, token, thresholds))
      .filter((match): match is Match => match !== null)
      .sort((a, b) => compareMatches(a, b, property));

    // Numeric proximity alone crosses token families: font-size 16px binds
    // exactly to space.4 when the type ramp is 17px, and the agent then writes
    // font-size: var(--space-4). Exact, deterministic, and the wrong ramp. So a
    // property that declares a family only ever binds inside it — and when the
    // project has no token in that family, the near-miss is reported rather than
    // taken, because a named gap is recoverable and a wrong binding is not.
    const familyMatches = hasAffinityFamily(property)
      ? matches.filter((candidate) => affinityRank(property, candidate.token.path) <= 2)
      : matches;
    const winner = familyMatches[0];

    if (!winner) {
      let why = "No project token is within the " + thresholdDescription(kind, thresholds) + ".";
      if (matches.length > 0) {
        why = "No " + property + " token is within the " + thresholdDescription(kind, thresholds)
          + ". The closest token by value is " + matches[0].token.path + " (" + matches[0].token.resolved
          + "), but it belongs to a different family — binding " + property + " to it would be the wrong ramp.";
      } else if (kind === "color") {
        // Alpha counts toward the distance, so an opaque token loses to nothing at
        // all when the capture is translucent. Say which token the colour came
        // from rather than leaving a bare "no token matched".
        const alphaMiss = nearestByRgbOnly(value, resolved, thresholds.color);
        if (alphaMiss) {
          why = "No colour token matches at this opacity. " + alphaMiss.token.path + " (" + alphaMiss.token.resolved
            + ") is the same colour but differs in alpha by " + formatNumber(alphaMiss.alphaDelta)
            + " — add an alpha variant to the palette rather than binding this one.";
        }
      }
      if (broken.length > 0) why += " " + broken.map((token) => token.error).join("; ") + ".";
      gaps.push({ property, captured: value, why });
      continue;
    }

    bindings.push({
      property,
      captured: value,
      token: winner.token.path,
      css_var: winner.token.cssVar,
      token_value: winner.token.resolved,
      verdict: winner.verdict,
      delta: winner.delta,
      delta_unit: winner.delta_unit,
      why: winner.why,
    });
  }

  const ramps = Array.from(new Set(bindings.map((binding) => tokens.find((token) => token.path === binding.token)?.group || "")))
    .filter(Boolean)
    .sort();
  return {
    bindings,
    gaps,
    coverage: { bound: bindings.length, total, ratio: total === 0 ? 0 : bindings.length / total },
    ramps_used: ramps,
    // A broken token chain is a fact about the design system, not about one
    // property. Reporting it only when nothing else matched meant a single valid
    // winner elsewhere silently swallowed it.
    diagnostics: broken.map((token) => token.error as string),
  };
}

function propertyKind(property: string, value: string): "color" | "length" | "unitless" | "font-family" | "other" {
  const name = property.toLowerCase();
  if (name === "color" || name.endsWith("-color") || ["fill", "stroke"].includes(name)) return "color";
  if (name === "font-family") return "font-family";
  if (["font-weight", "opacity", "z-index"].includes(name) || (name === "line-height" && isUnitless(value))) return "unitless";
  if (
    ["font-size", "line-height", "letter-spacing", "gap", "row-gap", "column-gap", "border-radius", "border-width"].includes(name) ||
    /^(?:padding|margin)(?:-|$)/.test(name) ||
    /^(?:min-|max-)?(?:width|height)$/.test(name) ||
    /^(?:min-|max-)?(?:inline-size|block-size)$/.test(name)
  ) return "length";
  return "other";
}

function resolveToken(token: FlattenedDesignToken, byPath: Map<string, FlattenedDesignToken>): ResolvedToken {
  const chain: string[] = [];
  let current = token;
  while (current.kind === "ref") {
    if (chain.includes(current.path)) {
      const cycle = chain.slice(chain.indexOf(current.path)).concat(current.path);
      return { ...token, error: "Broken token reference cycle " + cycle.join(" -> ") };
    }
    chain.push(current.path);
    const ref = normalizeRef(current.ref || "");
    const next = byPath.get(ref);
    if (!next) return { ...token, error: "Broken token reference " + current.path + " -> " + (ref || "(missing path)") };
    current = next;
  }
  const resolved = scalarString(current.value);
  return resolved === null
    ? { ...token, error: "Broken token value at " + current.path }
    : { ...token, resolved };
}

function compareValue(kind: ReturnType<typeof propertyKind>, captured: string, token: ResolvedToken, thresholds: Thresholds): Match | null {
  const value = token.resolved as string;
  if (kind === "color") {
    const from = parseColorValue(captured);
    const to = parseColorValue(value);
    if (!from || !to) return null;
    // Channels are premultiplied by alpha before the distance is taken, because
    // an unmultiplied metric measures a difference the eye cannot see: fully
    // transparent red and fully transparent black are both nothing on screen, yet
    // raw RGB puts them 255 apart and reports a gap where the token is exact.
    // Premultiplying keeps the case this ranking was written for — rgba(0,0,0,0.1)
    // against an opaque black still separates, on alpha rather than on RGB.
    const rgbDelta = Math.sqrt(
      (from[0] * from[3] - to[0] * to[3]) ** 2
      + (from[1] * from[3] - to[1] * to[3]) ** 2
      + (from[2] * from[3] - to[2] * to[3]) ** 2
    );
    // Alpha has to enter the ranking, not just the wording. Ranking on RGB alone
    // let rgba(0,0,0,0.1) bind to an opaque black at delta 0 and beat a token
    // that was one unit off in RGB but right on alpha — a visibly wrong colour
    // chosen over the correct one. Scaling alpha to the 0–255 channel range makes
    // the two commensurate.
    const alphaDelta = Math.abs(from[3] - to[3]) * 255;
    const delta = Math.sqrt(rgbDelta ** 2 + alphaDelta ** 2);
    if (delta === 0) return match(token, "exact", 0, "rgb", "Exact colour match.");
    if (delta < thresholds.color) {
      const alpha = alphaDelta > Number.EPSILON
        ? "; RGB distance " + formatNumber(rgbDelta) + " and alpha differs by " + formatNumber(Math.abs(from[3] - to[3]))
        : "";
      return match(token, "near", delta, "rgb", "Nearest colour token, distance " + formatNumber(delta) + alpha + ".");
    }
    return null;
  }

  if (kind === "length") {
    const from = parseLength(captured, thresholds.rootPx);
    const to = parseLength(value, thresholds.rootPx);
    if (from === null || to === null) return null;
    const delta = Math.abs(from - to);
    if (delta === 0) return match(token, "exact", 0, "px", "Exact length match.");
    if (delta < thresholds.length) {
      const direction = to > from ? "larger" : "smaller";
      return match(token, "near", delta, "px", "Nearest length step, " + formatNumber(delta) + "px " + direction + ".");
    }
    return null;
  }

  if (kind === "unitless") {
    const from = parseUnitless(captured);
    const to = parseUnitless(value);
    if (from === null || to === null) return null;
    const absolute = Math.abs(from - to);
    const delta = absolute === 0 ? 0 : from === 0 ? Infinity : absolute / Math.abs(from);
    if (delta === 0) return match(token, "exact", 0, "ratio", "Exact unitless value match.");
    if (delta <= thresholds.unitless) return match(token, "near", delta, "ratio", "Nearest unitless token, " + formatNumber(delta * 100) + "% relative difference.");
    return null;
  }

  if (kind === "font-family") {
    const from = fontFamilies(captured);
    const to = fontFamilies(value);
    if (from.length === 0 || to.length === 0) return null;
    if (from[0] === to[0]) return match(token, "exact", 0, "unitless", "Exact first font-family match.");
    const index = to.indexOf(from[0], 1);
    if (index >= 1) return match(token, "near", index, "unitless", "Captured first family appears at position " + (index + 1) + " in the token stack.");
  }
  return null;
}

function nearestByRgbOnly(captured: string, resolved: ResolvedToken[], colorThreshold: number): { token: ResolvedToken; alphaDelta: number } | null {
  const from = parseColorValue(captured);
  if (!from) return null;
  let best: { token: ResolvedToken; alphaDelta: number; rgbDelta: number } | null = null;
  for (const token of resolved) {
    if (token.resolved === undefined) continue;
    const to = parseColorValue(token.resolved);
    if (!to) continue;
    const rgbDelta = Math.sqrt((from[0] - to[0]) ** 2 + (from[1] - to[1]) ** 2 + (from[2] - to[2]) ** 2);
    if (rgbDelta >= colorThreshold) continue;
    const alphaDelta = Math.abs(from[3] - to[3]);
    if (alphaDelta <= Number.EPSILON) continue;
    if (!best || rgbDelta < best.rgbDelta || (rgbDelta === best.rgbDelta && compareTokenPath(token, best.token) < 0)) {
      best = { token, alphaDelta, rgbDelta };
    }
  }
  return best ? { token: best.token, alphaDelta: best.alphaDelta } : null;
}

function match(token: ResolvedToken, verdict: "exact" | "near", delta: number, delta_unit: Match["delta_unit"], why: string): Match {
  return { token, verdict, delta, delta_unit, why };
}

// Token paths a property should prefer when two candidates are equally close.
// Without this, a line-height of 64px binds to type.size.hero instead of
// type.leading.hero whenever both are 64px and the font-size path is shorter —
// deterministic, exact, and semantically wrong, which is worse than a gap
// because the agent writes line-height: var(--type-size-hero) and it looks fine.
//
// A family is matched one path SEGMENT at a time, not as a substring of the
// whole path, because substring matching was wrong in both directions and the
// two errors are hard to notice from the outside:
//   - `radii.sm` never matched /radius/, so a correctly named radius scale was
//     reported as a gap. `radii` is the spelling Chakra, Tamagui and
//     styled-system all ship, so this failed on the common case, not the odd one.
//   - `type.letter-spacing.none` DID match /spacing/, so `padding-top: 0` bound
//     to a tracking token as an EXACT match — the precise class of wrong binding
//     this table exists to prevent, produced by the table itself.
// `names` is the segment vocabulary; `loose` is the old substring test, kept as a
// fallback for paths that declare no family at all (`brand.cornerRadius`), so
// unconventional naming still binds rather than turning into a wall of gaps.
const FAMILIES: Array<{ id: string; property: RegExp; names: string[]; loose: RegExp }> = [
  { id: "leading", property: /^line-height$/, names: ["lead", "leads", "leading", "leadings", "line-height", "lineheight", "lineheights", "lh"], loose: /lead|line-?height|lh/ },
  { id: "fontsize", property: /^font-size$/, names: ["size", "sizes", "fontsize", "fontsizes", "font-size", "font-sizes", "text", "texts", "type", "typography", "typescale"], loose: /(^|\.)(size|font-?size|text|type)(\.|$)/ },
  { id: "tracking", property: /^letter-spacing$/, names: ["track", "tracks", "tracking", "trackings", "letterspacing", "letter-spacing", "ls"], loose: /track|letter-?spacing/ },
  { id: "weight", property: /^font-weight$/, names: ["weight", "weights", "fontweight", "fontweights", "font-weight", "font-weights", "fw"], loose: /weight/ },
  { id: "family", property: /^font-family$/, names: ["family", "families", "fontfamily", "fontfamilies", "font-family", "face", "faces", "font", "fonts"], loose: /family|face|font(?!-size)/ },
  { id: "radius", property: /^border-radius$/, names: ["radius", "radii", "radiuses", "borderradius", "border-radius", "corner", "corners", "round", "rounded", "rounding"], loose: /radius|corner|round/ },
  { id: "borderwidth", property: /^border-width$/, names: ["border", "borders", "borderwidth", "border-width", "stroke", "strokes", "outline", "outlines"], loose: /border|stroke|outline/ },
  { id: "space", property: /^(?:row-|column-)?gap$|^(?:padding|margin)(?:-|$)/, names: ["space", "spaces", "spacing", "spacings", "gap", "gaps", "inset", "insets", "pad", "padding", "paddings", "margin", "margins"], loose: /space|spacing|gap|inset|pad/ },
  { id: "opacity", property: /^opacity$/, names: ["opacity", "opacities", "alpha", "alphas"], loose: /opacity|alpha/ },
  { id: "zindex", property: /^z-index$/, names: ["zindex", "z-index", "z", "layer", "layers", "elevation", "elevations", "depth", "depths"], loose: /z-?index|layer|elevation|depth/ }
];

/**
 * The spellings one segment can wear. Real token files write the same idea as
 * `letterSpacings`, `letter-spacings`, `letterspacing` and `letter_spacing`, and
 * a vocabulary list can only ever enumerate some of them. Chakra ships
 * `letterSpacings.wide` — camel-case AND plural — which matched no name, so the
 * path declared no family, fell to the loose tier, and bound `padding-top: 0px`
 * to a tracking token at 0.4px. Normalising here is what keeps that vocabulary
 * from having to guess every author's casing.
 */
function segmentVariants(segment: string): string[] {
  var lower = segment.toLowerCase();
  var hyphenated = segment.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();
  var collapsed = hyphenated.replace(/-/g, "");
  var variants = new Set<string>([lower, hyphenated, collapsed]);
  for (var form of Array.from(variants)) {
    if (form.endsWith("ies")) variants.add(form.slice(0, -3) + "y");
    if (form.endsWith("es")) variants.add(form.slice(0, -2));
    if (form.endsWith("s")) variants.add(form.slice(0, -1));
  }
  return Array.from(variants);
}

/** Every family a token path names outright, one dot-separated segment at a time. */
function declaredFamilies(tokenPath: string): Set<string> {
  var declared = new Set<string>();
  for (var segment of tokenPath.split(".")) {
    var variants = segmentVariants(segment);
    for (var family of FAMILIES) {
      if (variants.some((variant) => family.names.indexOf(variant) !== -1)) declared.add(family.id);
    }
  }
  return declared;
}

function familyFor(property: string): { id: string; names: string[]; loose: RegExp } | undefined {
  var name = property.toLowerCase();
  return FAMILIES.find((family) => family.property.test(name));
}

// 0 = names this family and nothing else; 1 = names it alongside another;
// 2 = names no family at all but reads like this one; 3 = out of family.
// The three passing grades matter for ordering as well as filtering: for
// font-size both `type.size.hero` and `type.leading.hero` are in family (both
// contain `type`), and only the finer rank puts the size path first.
function affinityRank(property: string, tokenPath: string): number {
  var family = familyFor(property);
  if (!family) return 0;
  var declared = declaredFamilies(tokenPath);
  if (declared.has(family.id)) return declared.size === 1 ? 0 : 1;
  if (declared.size > 0) return 3;
  // The loose tier is a guess, and a guess that fits two families is not a
  // guess worth acting on — `spacing` alone reads as both tracking and gap.
  // Ambiguity here is what turned the fallback into a cross-family binder, so an
  // ambiguous path is a gap the designer can see rather than a wrong token they
  // cannot.
  var lowered = tokenPath.toLowerCase();
  var looseHits = FAMILIES.filter((candidate) => candidate.loose.test(lowered));
  if (looseHits.length !== 1) return 3;
  return looseHits[0].id === family.id ? 2 : 3;
}

/** Whether the property declares a token family at all — most do not. */
function hasAffinityFamily(property: string): boolean {
  return familyFor(property) !== undefined;
}

function compareMatches(a: Match, b: Match, property: string): number {
  return a.delta - b.delta
    || affinityRank(property, a.token.path) - affinityRank(property, b.token.path)
    || compareTokenPath(a.token, b.token);
}

function compareTokenPath(a: Pick<FlattenedDesignToken, "path">, b: Pick<FlattenedDesignToken, "path">): number {
  return a.path.length - b.path.length || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

// The contrast auditor's parser covers hex, comma-form rgb/rgba, and three
// keywords. That is enough for captured values — getComputedStyle normalises
// everything to rgb()/rgba() — but not for the token side, where a DESIGN.md
// legitimately says `red`, `hsl(0 100% 50%)`, or `rgb(255 0 0 / 50%)`. Without
// these, an exact token match was reported as "no token within the threshold".
// Extended here rather than in contrast.ts so the contrast audits keep their
// current behaviour exactly.
const NAMED_COLORS: Record<string, string> = Object.fromEntries(
  ("aliceblue f0f8ff,antiquewhite faebd7,aqua 00ffff,aquamarine 7fffd4,azure f0ffff,beige f5f5dc,bisque ffe4c4,black 000000,"
    + "blanchedalmond ffebcd,blue 0000ff,blueviolet 8a2be2,brown a52a2a,burlywood deb887,cadetblue 5f9ea0,chartreuse 7fff00,"
    + "chocolate d2691e,coral ff7f50,cornflowerblue 6495ed,cornsilk fff8dc,crimson dc143c,cyan 00ffff,darkblue 00008b,"
    + "darkcyan 008b8b,darkgoldenrod b8860b,darkgray a9a9a9,darkgreen 006400,darkgrey a9a9a9,darkkhaki bdb76b,"
    + "darkmagenta 8b008b,darkolivegreen 556b2f,darkorange ff8c00,darkorchid 9932cc,darkred 8b0000,darksalmon e9967a,"
    + "darkseagreen 8fbc8f,darkslateblue 483d8b,darkslategray 2f4f4f,darkslategrey 2f4f4f,darkturquoise 00ced1,"
    + "darkviolet 9400d3,deeppink ff1493,deepskyblue 00bfff,dimgray 696969,dimgrey 696969,dodgerblue 1e90ff,"
    + "firebrick b22222,floralwhite fffaf0,forestgreen 228b22,fuchsia ff00ff,gainsboro dcdcdc,ghostwhite f8f8ff,gold ffd700,"
    + "goldenrod daa520,gray 808080,green 008000,greenyellow adff2f,grey 808080,honeydew f0fff0,hotpink ff69b4,"
    + "indianred cd5c5c,indigo 4b0082,ivory fffff0,khaki f0e68c,lavender e6e6fa,lavenderblush fff0f5,lawngreen 7cfc00,"
    + "lemonchiffon fffacd,lightblue add8e6,lightcoral f08080,lightcyan e0ffff,lightgoldenrodyellow fafad2,lightgray d3d3d3,"
    + "lightgreen 90ee90,lightgrey d3d3d3,lightpink ffb6c1,lightsalmon ffa07a,lightseagreen 20b2aa,lightskyblue 87cefa,"
    + "lightslategray 778899,lightslategrey 778899,lightsteelblue b0c4de,lightyellow ffffe0,lime 00ff00,limegreen 32cd32,"
    + "linen faf0e6,magenta ff00ff,maroon 800000,mediumaquamarine 66cdaa,mediumblue 0000cd,mediumorchid ba55d3,"
    + "mediumpurple 9370db,mediumseagreen 3cb371,mediumslateblue 7b68ee,mediumspringgreen 00fa9a,mediumturquoise 48d1cc,"
    + "mediumvioletred c71585,midnightblue 191970,mintcream f5fffa,mistyrose ffe4e1,moccasin ffe4b5,navajowhite ffdead,"
    + "navy 000080,oldlace fdf5e6,olive 808000,olivedrab 6b8e23,orange ffa500,orangered ff4500,orchid da70d6,"
    + "palegoldenrod eee8aa,palegreen 98fb98,paleturquoise afeeee,palevioletred db7093,papayawhip ffefd5,peachpuff ffdab9,"
    + "peru cd853f,pink ffc0cb,plum dda0dd,powderblue b0e0e6,purple 800080,rebeccapurple 663399,red ff0000,"
    + "rosybrown bc8f8f,royalblue 4169e1,saddlebrown 8b4513,salmon fa8072,sandybrown f4a460,seagreen 2e8b57,"
    + "seashell fff5ee,sienna a0522d,silver c0c0c0,skyblue 87ceeb,slateblue 6a5acd,slategray 708090,slategrey 708090,"
    + "snow fffafa,springgreen 00ff7f,steelblue 4682b4,tan d2b48c,teal 008080,thistle d8bfd8,tomato ff6347,"
    + "turquoise 40e0d0,violet ee82ee,wheat f5deb3,white ffffff,whitesmoke f5f5f5,yellow ffff00,yellowgreen 9acd32")
    .split(",").map((entry) => entry.trim().split(" ")).map(([name, hex]) => [name, "#" + hex])
);

export function parseColorValue(value: string): [number, number, number, number] | null {
  const known = parseKnownColor(value);
  if (known) return known;
  const text = value.trim().toLowerCase();

  const named = NAMED_COLORS[text];
  if (named) return parseKnownColor(named);

  // Space-separated rgb(): rgb(255 0 0) and rgb(255 0 0 / 50%).
  const rgb = /^rgba?\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(text);
  if (rgb) {
    const channel = (raw: string) => raw.endsWith("%") ? (Number(raw.slice(0, -1)) / 100) * 255 : Number(raw);
    const parsed: [number, number, number, number] = [channel(rgb[1]), channel(rgb[2]), channel(rgb[3]), alphaChannel(rgb[4])];
    if (parsed.some((component) => !Number.isFinite(component))) return null;
    // CSS clamps out-of-range channels to the rendered colour rather than
    // discarding the declaration, so rgb(300 0 0) IS red. Returning 300 here
    // makes it a colour no token can be near and the mapper reports a gap for a
    // value the browser paints as an exact match for `color.red`.
    return [clamp(parsed[0], 0, 255), clamp(parsed[1], 0, 255), clamp(parsed[2], 0, 255), clamp(parsed[3], 0, 1)];
  }

  // hsl()/hsla(), comma or space separated, with an optional alpha. The hue
  // carries any of the four CSS angle units — `hsl(.5turn 100% 50%)` is valid and
  // is what a token file written by a designer tool is liable to contain.
  const hsl = /^hsla?\(\s*(-?[\d.]+)(deg|grad|rad|turn)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(text);
  if (hsl) {
    const hue = toDegrees(Number(hsl[1]), hsl[2]);
    const saturation = Number(hsl[3]) / 100;
    const lightness = Number(hsl[4]) / 100;
    const alpha = alphaChannel(hsl[5]);
    if (![hue, saturation, lightness, alpha].every(Number.isFinite)) return null;
    const rgbChannels = hslToRgb(hue, clamp(saturation, 0, 1), clamp(lightness, 0, 1));
    return [...rgbChannels, clamp(alpha, 0, 1)] as [number, number, number, number];
  }
  return null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function toDegrees(value: number, unit: string | undefined): number {
  if (unit === "turn") return value * 360;
  if (unit === "rad") return (value * 180) / Math.PI;
  if (unit === "grad") return value * 0.9;
  return value;
}

function alphaChannel(raw: string | undefined): number {
  if (raw === undefined) return 1;
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = lightness - chroma / 2;
  const [red, green, blue] = sector < 1 ? [chroma, second, 0]
    : sector < 2 ? [second, chroma, 0]
    : sector < 3 ? [0, chroma, second]
    : sector < 4 ? [0, second, chroma]
    : sector < 5 ? [second, 0, chroma]
    : [chroma, 0, second];
  return [Math.round((red + base) * 255), Math.round((green + base) * 255), Math.round((blue + base) * 255)];
}

function parseLength(value: string, rootPx: number): number | null {
  const parsed = value.trim().toLowerCase().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)$/);
  if (!parsed) return null;
  const number = Number(parsed[1]);
  return parsed[2] === "px" ? number : number * rootPx;
}

function parseUnitless(value: string): number | null {
  if (!isUnitless(value)) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isUnitless(value: string): boolean {
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim());
}

function fontFamilies(value: string): string[] {
  return value.split(",").map((family) => family.trim().replace(/^(?:['"])(.*)(?:['"])$/, "$1").toLowerCase()).filter(Boolean);
}

function capturedValueProblem(kind: ReturnType<typeof propertyKind>, value: string, rootPx: number): string | null {
  if (kind === "length") {
    const unit = value.trim().toLowerCase().match(/[a-z%]+$/)?.[0];
    if (unit === "%") return "Percent lengths need a containing size and cannot be converted to px deterministically.";
    if (unit && ["vw", "vh", "vmin", "vmax", "svw", "svh", "lvw", "lvh", "dvw", "dvh"].includes(unit)) {
      return "Viewport lengths need viewport dimensions and cannot be converted to px deterministically.";
    }
    if (parseLength(value, rootPx) === null) return "The captured length is not a single px, rem, or em value.";
  }
  if (kind === "color" && !parseColorValue(value)) {
    return "The captured colour is not a CSS syntax Raven can parse deterministically (hex, rgb/rgba, hsl/hsla, and named colours are supported; colour spaces such as oklch/lab are not).";
  }
  if (kind === "unitless" && parseUnitless(value) === null) return "The captured value is not a unitless number.";
  if (kind === "font-family" && fontFamilies(value).length === 0) return "The captured font-family stack is empty.";
  return null;
}

function thresholdDescription(kind: ReturnType<typeof propertyKind>, thresholds: Thresholds): string {
  if (kind === "color") return "RGB distance threshold of " + thresholds.color;
  if (kind === "length") return "length threshold of " + thresholds.length + "px";
  if (kind === "unitless") return "relative threshold of " + formatNumber(thresholds.unitless * 100) + "%";
  return "font-family matching rules";
}

function scalarString(value: DesignMdValue): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function normalizeRef(ref: string): string {
  const trimmed = ref.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}
