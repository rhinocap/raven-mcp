// Taste fidelity — presence verification for a binding's design_notes against
// the measured PageTraits of the artifact being judged, plus the restraint
// guard (sparseness must be earned by craft) and reference-delta findings.
//
// Contract: every verifier is deterministic and conservative. A "missing"
// status is only ever produced with citable trait numbers in evidence; when a
// note has no deterministic observable form (or the trait it needs is a
// live-only null on a static capture) the honest answer is "unverifiable",
// never a guess. False positives destroy trust in the whole engine.

import { Buffer } from "node:buffer";
import { relativeLuminance } from "./contrast.js";
import type { PageTraits } from "./capture.js";
import type { ReferenceCapture, TasteFinding } from "./taste.js";

export type NoteAssessment = {
  key: string;
  status: "present" | "partial" | "missing" | "unverifiable";
  expectation: string;
  evidence: string;
};

// Word lists mirror checkBindingConsistency in taste.ts — same vocabulary,
// same confidence bar.
const DARK_WORDS = /\b(dark|black|cinematic|graphite|charcoal|noir|midnight)\b/i;
const LIGHT_WORDS = /\b(bone|white|cream|paper|airy-light)\b/i;
const THREE_WORDS = /\b(three(\.?js)?|3js|3d|webgl)\b/i;
const GSAP_WORDS = /\b(gsap|choreograph\w*|scroll\w*)\b/i;
const LOTTIE_WORDS = /\blottie\b/i;
const VANILLA_WORDS = /\b(none|vanilla)\b/i;
const MOTION_STATIC_WORDS = /\b(none|minimal|static)\b/i;
const MOTION_DYNAMIC_WORDS = /\b(cinematic|immersive|choreograph\w*|scroll)\b/i;
const GLASS_WORDS = /\b(glassmorph\w*|frosted|translucent)\b/i;
const NEON_WORDS = /\bneon\b/i;
const FLAT_WHITE_WORDS = /\bflat[- ]white\b/i;
const JUDGMENT_AESTHETIC_WORDS = /\b(brutalist|editorial)\b/i;
const LOADER_WANT_WORDS = /\b(branded|spinner|progress\w*|skeleton)\b/i;
const IMAGERY_WORDS = /\b(photo\w*|render\w*|screenshot\w*|story|sequence\w*|scene\w*)\b/i;
const MONO_WORDS = /\bmono\w*\b/i;
const DISPLAY_TYPE_WORDS = /\b(display|dramatic|huge)\b|\b9\d+px\b/i;
const AIRY_WORDS = /\b(airy|sparse|generous)\b/i;
const DENSE_WORDS = /\b(compact|dense)\b/i;
const ENTRANCE_STAGED_WORDS = /\b(cinematic|staged)\b/i;

const STATIC_REASON = "static HTML — render the url for a live check";

// Keys whose notes have no deterministic, trait-observable form.
const UNVERIFIABLE_KEY_REASONS: Record<string, string> = {
  navigation: "navigation patterns require layout judgment, not trait counting",
  special: "free-form special notes require human or LLM judgment",
  references: "reference prose is consistency-checked at bind time, not against the artifact",
  voice: "voice/tone is judged by the profile's voice rules, not page traits",
  identity: "identity is descriptive context, not a verifiable page trait",
};

function mediaTotal(traits: PageTraits): number {
  return traits.image_count + traits.video_count + traits.canvas_count;
}

function num(value: number | null): string {
  if (value === null) return "null";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function assessment(
  key: string,
  status: NoteAssessment["status"],
  expectation: string,
  evidence: string
): NoteAssessment {
  return { key: key, status: status, expectation: expectation, evidence: evidence };
}

// Combine sub-checks for a key that named several verifiable things (e.g. a
// libraries note naming both three.js and GSAP): worst status wins, evidence
// concatenates. Rank: missing > partial > unverifiable > present — a promised
// technique that is absent must not be averaged away by a sibling that landed.
const STATUS_RANK: Record<NoteAssessment["status"], number> = {
  missing: 3,
  partial: 2,
  unverifiable: 1,
  present: 0,
};

function combine(key: string, parts: NoteAssessment[]): NoteAssessment {
  if (parts.length === 1) return parts[0];
  let worst = parts[0];
  for (const part of parts) {
    if (STATUS_RANK[part.status] > STATUS_RANK[worst.status]) worst = part;
  }
  return assessment(
    key,
    worst.status,
    parts.map(function (p) { return p.expectation; }).join("; "),
    parts.map(function (p) { return p.evidence; }).join("; ")
  );
}

export function assessDesignNotes(notes: Record<string, string>, traits: PageTraits): NoteAssessment[] {
  const out: NoteAssessment[] = [];
  for (const key of Object.keys(notes)) {
    out.push(assessNote(key, notes[key], traits));
  }
  return out;
}

function assessNote(key: string, note: string, traits: PageTraits): NoteAssessment {
  const reserved = UNVERIFIABLE_KEY_REASONS[key];
  if (reserved !== undefined) return assessment(key, "unverifiable", "no trait expectation", reserved);
  switch (key) {
    case "color": return assessColor(note, traits);
    case "libraries": return assessLibraries(note, traits);
    case "motion": return assessMotion(note, traits);
    case "aesthetic": return assessAesthetic(note, traits);
    case "loading": return assessLoading(note, traits);
    case "imagery": return assessImagery(note, traits);
    case "typography": return assessTypography(note, traits);
    case "spacing": return assessSpacing(note, traits);
    case "entrance": return assessEntrance(note, traits);
    default:
      return assessment(key, "unverifiable", "no trait expectation", "no deterministic verifier for this dimension");
  }
}

function assessColor(note: string, traits: PageTraits): NoteAssessment {
  const wantsDark = DARK_WORDS.test(note);
  const wantsLight = LIGHT_WORDS.test(note);
  if (wantsDark === wantsLight) {
    // Neither vocabulary (or both — a note that reads both ways is not a
    // deterministic expectation).
    return assessment("color", "unverifiable", "no single light/dark expectation",
      wantsDark ? "note reads both light and dark — no single scheme to verify" : "note has no light/dark words to verify deterministically");
  }
  const want: "dark" | "light" = wantsDark ? "dark" : "light";
  const cite = "scheme=" + traits.scheme + ", bg_luminance=" + num(traits.bg_luminance);
  if (traits.scheme === "unknown") {
    return assessment("color", "unverifiable", "scheme " + want, "background scheme could not be measured (" + cite + ")");
  }
  if (traits.scheme === "mixed") {
    return assessment("color", "partial", "scheme " + want, "page renders mixed, not clearly " + want + " (" + cite + ")");
  }
  if (traits.scheme === want) {
    return assessment("color", "present", "scheme " + want, cite);
  }
  return assessment("color", "missing", "scheme " + want, "note reads " + want + " but the page renders " + traits.scheme + " (" + cite + ")");
}

function assessLibraries(note: string, traits: PageTraits): NoteAssessment {
  const parts: NoteAssessment[] = [];
  if (THREE_WORDS.test(note)) {
    const cite = "canvas_count=" + traits.canvas_count + ", webgl=" + String(traits.webgl);
    if (traits.canvas_count === 0) {
      parts.push(assessment("libraries", "missing", "a <canvas> WebGL scene (three.js/WebGL named)",
        "no <canvas> element for a three.js/WebGL scene (" + cite + ")"));
    } else if (traits.webgl === true) {
      parts.push(assessment("libraries", "present", "a <canvas> WebGL scene (three.js/WebGL named)", cite));
    } else {
      parts.push(assessment("libraries", "partial", "a <canvas> WebGL scene (three.js/WebGL named)",
        "canvas exists but no WebGL context was confirmed (" + cite + ")"));
    }
  }
  if (GSAP_WORDS.test(note)) {
    const cite = "scroll_effects=" + String(traits.scroll_effects) + ", animation_count=" + num(traits.animation_count);
    if (traits.scroll_effects === null && traits.animation_count === null) {
      parts.push(assessment("libraries", "unverifiable", "scroll choreography (gsap/scroll named)", STATIC_REASON));
    } else if (traits.scroll_effects === true || (traits.animation_count !== null && traits.animation_count > 3)) {
      parts.push(assessment("libraries", "present", "scroll choreography (gsap/scroll named)", cite));
    } else {
      parts.push(assessment("libraries", "missing", "scroll choreography (gsap/scroll named)",
        "no scroll-gated effects and no meaningful animation activity (" + cite + ")"));
    }
  }
  if (LOTTIE_WORDS.test(note)) {
    const cite = "canvas_count=" + traits.canvas_count + ", animation_count=" + num(traits.animation_count);
    if (traits.animation_count === null && traits.canvas_count === 0) {
      parts.push(assessment("libraries", "unverifiable", "a lottie animation surface", STATIC_REASON));
    } else if (traits.canvas_count > 0 || (traits.animation_count !== null && traits.animation_count > 0)) {
      // Lottie cannot be distinguished from other animation deterministically — partial at best.
      parts.push(assessment("libraries", "partial", "a lottie animation surface",
        "animation surface exists but lottie itself is not deterministically identifiable (" + cite + ")"));
    } else {
      parts.push(assessment("libraries", "missing", "a lottie animation surface",
        "no canvas and no running animations for a lottie player (" + cite + ")"));
    }
  }
  if (parts.length > 0) return combine("libraries", parts);
  if (VANILLA_WORDS.test(note)) {
    return assessment("libraries", "unverifiable", "no specialty libraries", "note asks for vanilla/none — nothing to verify for presence");
  }
  return assessment("libraries", "unverifiable", "no trait expectation", "no verifiable library named in the note");
}

function assessMotion(note: string, traits: PageTraits): NoteAssessment {
  const wantsStill = MOTION_STATIC_WORDS.test(note);
  const wantsMotion = MOTION_DYNAMIC_WORDS.test(note);
  if (wantsStill && wantsMotion) {
    return assessment("motion", "unverifiable", "no single motion expectation", "note reads both static and dynamic — no single expectation to verify");
  }
  const cite = "animation_count=" + num(traits.animation_count) + ", scroll_effects=" + String(traits.scroll_effects);
  if (wantsStill) {
    if (traits.animation_count === null) {
      return assessment("motion", "unverifiable", "no animation", STATIC_REASON);
    }
    if (traits.animation_count === 0) return assessment("motion", "present", "no animation", cite);
    if (traits.animation_count > 3) {
      return assessment("motion", "missing", "no animation", "note reads static/minimal but the page runs " + traits.animation_count + " animations (" + cite + ")");
    }
    return assessment("motion", "partial", "no animation", "a few animations run on a page whose note reads static/minimal (" + cite + ")");
  }
  if (wantsMotion) {
    if (traits.animation_count === null && traits.scroll_effects === null) {
      return assessment("motion", "unverifiable", "scroll/cinematic motion", STATIC_REASON);
    }
    if (traits.scroll_effects === true || (traits.animation_count !== null && traits.animation_count > 3)) {
      return assessment("motion", "present", "scroll/cinematic motion", cite);
    }
    // Only a note that promises SCROLL-driven motion can be called missing from
    // a post-settle capture: finite entrance choreography (cinematic transitions
    // with no scroll hook) may have completed before traits were sampled.
    if (/scroll/i.test(note)) {
      return assessment("motion", "missing", "scroll/cinematic motion",
        "note promises choreographed/scroll motion but none was measured (" + cite + ")");
    }
    return assessment("motion", "partial", "scroll/cinematic motion",
      "no motion measured post-settle (" + cite + ") — finite cinematic transitions may have completed before capture; verify eyes-on or with an unsettled capture");
  }
  return assessment("motion", "unverifiable", "no trait expectation", "no static/dynamic motion words to verify deterministically");
}

function assessAesthetic(note: string, traits: PageTraits): NoteAssessment {
  const parts: NoteAssessment[] = [];
  if (GLASS_WORDS.test(note)) {
    const cite = "backdrop_filter=" + String(traits.backdrop_filter);
    if (traits.backdrop_filter) {
      parts.push(assessment("aesthetic", "present", "glassmorphism (backdrop-filter)", cite));
    } else {
      parts.push(assessment("aesthetic", "missing", "glassmorphism (backdrop-filter)",
        "no backdrop-filter anywhere in the page styles (" + cite + ")"));
    }
  }
  if (NEON_WORDS.test(note)) {
    const cite = "scheme=" + traits.scheme + ", gradient_count=" + traits.gradient_count;
    if (traits.scheme === "unknown") {
      parts.push(assessment("aesthetic", "unverifiable", "neon (dark ground + glow gradients)", "background scheme could not be measured (" + cite + ")"));
    } else {
      const dark = traits.scheme === "dark";
      const glow = traits.gradient_count > 0;
      if (dark && glow) parts.push(assessment("aesthetic", "present", "neon (dark ground + glow gradients)", cite));
      else if (dark || glow) parts.push(assessment("aesthetic", "partial", "neon (dark ground + glow gradients)", "only one of dark ground / gradients holds (" + cite + ")"));
      else parts.push(assessment("aesthetic", "missing", "neon (dark ground + glow gradients)", "neither a dark ground nor gradients (" + cite + ")"));
    }
  }
  if (FLAT_WHITE_WORDS.test(note)) {
    const cite = "scheme=" + traits.scheme + ", bg_luminance=" + num(traits.bg_luminance);
    if (traits.scheme === "unknown") parts.push(assessment("aesthetic", "unverifiable", "flat-white (light ground)", "background scheme could not be measured (" + cite + ")"));
    else if (traits.scheme === "light") parts.push(assessment("aesthetic", "present", "flat-white (light ground)", cite));
    else if (traits.scheme === "mixed") parts.push(assessment("aesthetic", "partial", "flat-white (light ground)", "page renders mixed, not clearly light (" + cite + ")"));
    else parts.push(assessment("aesthetic", "missing", "flat-white (light ground)", "note reads flat-white but the page renders dark (" + cite + ")"));
  }
  if (parts.length > 0) return combine("aesthetic", parts);
  if (JUDGMENT_AESTHETIC_WORDS.test(note)) {
    return assessment("aesthetic", "unverifiable", "no trait expectation", "brutalist/editorial reads require judgment, not trait counting");
  }
  return assessment("aesthetic", "unverifiable", "no trait expectation", "no deterministically verifiable aesthetic family named");
}

function assessLoading(note: string, traits: PageTraits): NoteAssessment {
  const cite = "loader_hint=" + String(traits.loader_hint);
  if (LOADER_WANT_WORDS.test(note)) {
    if (traits.loader_hint) return assessment("loading", "present", "a loader/progress surface", cite);
    return assessment("loading", "missing", "a loader/progress surface",
      "no loader overlay, progressbar role, or loader-named element detected (" + cite + ")");
  }
  if (/\bnone\b/i.test(note)) {
    if (!traits.loader_hint) return assessment("loading", "present", "no loader surface", cite);
    return assessment("loading", "missing", "no loader surface", "note asks for no loading state but a loader surface exists (" + cite + ")");
  }
  return assessment("loading", "unverifiable", "no trait expectation", "no loader words to verify deterministically");
}

function assessImagery(note: string, traits: PageTraits): NoteAssessment {
  const total = mediaTotal(traits);
  const cite = "image_count=" + traits.image_count + ", video_count=" + traits.video_count + ", canvas_count=" + traits.canvas_count;
  if (/\bnone\b/i.test(note) && !IMAGERY_WORDS.test(note)) {
    if (traits.image_count + traits.video_count === 0) return assessment("imagery", "present", "no imagery", cite);
    return assessment("imagery", "missing", "no imagery", "note asks for no imagery but media elements exist (" + cite + ")");
  }
  if (IMAGERY_WORDS.test(note)) {
    if (total >= 3) return assessment("imagery", "present", "a substantial imagery story (3+ media surfaces)", cite);
    if (total >= 1) return assessment("imagery", "partial", "a substantial imagery story (3+ media surfaces)",
      "only " + total + " media surface" + (total === 1 ? "" : "s") + " for an imagery-led note (" + cite + ")");
    return assessment("imagery", "missing", "a substantial imagery story (3+ media surfaces)",
      "no images, video, or canvas at all for an imagery-led note (" + cite + ")");
  }
  return assessment("imagery", "unverifiable", "no trait expectation", "no imagery words to verify deterministically");
}

// Family-name recognition must know the classic faces — "Times" and "Courier"
// carry no "serif"/"mono" substring, and flagging Times as not-serif is exactly
// the false positive this module must never produce.
const SERIF_FACE_RE = /serif|times|georgia|garamond|baskerville|playfair|merriweather|lora|caslon|didot|bodoni|charter|spectral|freight|tiempos|canela|reckless|palatino|book antiqua|cambria|pt serif|source serif|crimson|libre caslon|cormorant|eb garamond|newsreader|fraunces|domine|bitter|zilla|rockwell|clarendon/i;
const MONO_FACE_RE = /mono|courier|consolas|menlo|monaco|jetbrains|fira code|inconsolata|source code|code pro|hack|input|pragmata|iosevka|cascadia|andale|letter gothic|lucida console|overpass mono|space grotesk mono/i;

function assessTypography(note: string, traits: PageTraits): NoteAssessment {
  const parts: NoteAssessment[] = [];
  const families = traits.font_families;
  const famCite = "font_families=[" + families.join(", ") + "]";
  if (MONO_WORDS.test(note)) {
    if (families.length === 0) {
      parts.push(assessment("typography", "unverifiable", "a mono face in use", "no font families captured (" + famCite + ")"));
    } else if (families.some(function (f) { return MONO_FACE_RE.test(f); })) {
      parts.push(assessment("typography", "present", "a mono face in use", famCite));
    } else {
      parts.push(assessment("typography", "missing", "a mono face in use", "no recognizably mono family among the faces in use (" + famCite + ")"));
    }
  }
  // "sans-serif" in the note must not read as a serif expectation.
  if (/serif/i.test(note.replace(/sans[- ]?serif/gi, ""))) {
    if (families.length === 0) {
      parts.push(assessment("typography", "unverifiable", "a serif face in use", "no font families captured (" + famCite + ")"));
    } else if (families.some(function (f) { return !/sans-serif/i.test(f) && SERIF_FACE_RE.test(f); })) {
      parts.push(assessment("typography", "present", "a serif face in use", famCite));
    } else {
      parts.push(assessment("typography", "missing", "a serif face in use", "no recognizably serif family among the faces in use (" + famCite + ")"));
    }
  }
  if (DISPLAY_TYPE_WORDS.test(note)) {
    const cite = "max_heading_px=" + num(traits.max_heading_px);
    if (traits.max_heading_px === null) {
      parts.push(assessment("typography", "unverifiable", "display-scale headings (>=64px)", "heading size not measured — " + STATIC_REASON));
    } else if (traits.max_heading_px >= 64) {
      parts.push(assessment("typography", "present", "display-scale headings (>=64px)", cite));
    } else {
      parts.push(assessment("typography", "missing", "display-scale headings (>=64px)",
        "note promises display/dramatic scale but the largest heading is " + traits.max_heading_px + "px (" + cite + ")"));
    }
  }
  if (parts.length > 0) return combine("typography", parts);
  return assessment("typography", "unverifiable", "no trait expectation", "no mono/serif/display words to verify deterministically");
}

function assessSpacing(note: string, traits: PageTraits): NoteAssessment {
  const wantsAiry = AIRY_WORDS.test(note);
  const wantsDense = DENSE_WORDS.test(note);
  if (wantsAiry === wantsDense) {
    return assessment("spacing", "unverifiable", "no single density expectation",
      wantsAiry ? "note reads both airy and dense — no single expectation to verify" : "no density words to verify deterministically");
  }
  if (traits.text_density === null) {
    return assessment("spacing", "unverifiable", wantsAiry ? "low text density (<1.2)" : "high text density (>1.2)", "text density not measured — " + STATIC_REASON);
  }
  const cite = "text_density=" + traits.text_density.toFixed(2);
  if (wantsAiry) {
    if (traits.text_density < 1.2) {
      // Airy only PASSES when the sparseness is earned — an empty-sparse page
      // is unfinished, not airy (see restraintGuard).
      const restraint = restraintGuard(traits);
      if (restraint !== null) {
        return assessment("spacing", "partial", "low text density (<1.2), earned by craft",
          "density is low but the sparseness is unearned — " + restraint.evidence);
      }
      return assessment("spacing", "present", "low text density (<1.2), earned by craft", cite);
    }
    return assessment("spacing", "missing", "low text density (<1.2)", "note reads airy/sparse but the page is text-dense (" + cite + ")");
  }
  if (traits.text_density > 1.2) return assessment("spacing", "present", "high text density (>1.2)", cite);
  return assessment("spacing", "missing", "high text density (>1.2)", "note reads compact/dense but the page is sparse (" + cite + ")");
}

function assessEntrance(note: string, traits: PageTraits): NoteAssessment {
  // Live capture happens post-settle, so the entrance is usually already over.
  // Honest ceiling: partial. NEVER report an entrance note as missing solely
  // from a settled capture.
  if (ENTRANCE_STAGED_WORDS.test(note)) {
    if (traits.animation_count === null) {
      return assessment("entrance", "unverifiable", "a staged/cinematic entrance", STATIC_REASON);
    }
    return assessment("entrance", "partial", "a staged/cinematic entrance",
      "animation_count=" + traits.animation_count + " post-settle; entrance animations may have completed before capture — verify the entrance with an unsettled capture or eyes-on");
  }
  return assessment("entrance", "unverifiable", "no trait expectation",
    "entrance timing cannot be verified from a post-settle capture");
}

// Sparse-and-empty guard: restraint (low density, almost no media) only reads
// as taste when craft is present somewhere — motion, a canvas, glass, a real
// type scale, gradients, or at least a second face. Sparse WITHOUT any of
// those reads as unfinished.
export function restraintGuard(traits: PageTraits): TasteFinding | null {
  const media = mediaTotal(traits);
  const sparse = traits.text_density !== null && traits.text_density < 0.8 && media <= 1;
  if (!sparse) return null;
  const craft =
    (traits.animation_count !== null && traits.animation_count > 0) ||
    traits.canvas_count > 0 ||
    traits.backdrop_filter ||
    traits.font_families.length >= 2 ||
    (traits.max_heading_px !== null && traits.max_heading_px >= 64) ||
    traits.gradient_count > 0;
  if (craft) return null;
  return {
    rule_id: "TASTE-restraint-earned",
    clause_cited: "Sparseness must be earned by craft density — sparse and empty reads as unfinished, not restrained.",
    severity: "warn",
    owner: "taste",
    source: "raven",
    evidence:
      "text_density=" + (traits.text_density as number).toFixed(2) +
      ", media(image+video+canvas)=" + media +
      ", animation_count=" + num(traits.animation_count) +
      ", backdrop_filter=" + String(traits.backdrop_filter) +
      ", font_families=" + traits.font_families.length +
      ", max_heading_px=" + num(traits.max_heading_px) +
      ", gradient_count=" + traits.gradient_count,
    fix: "Add the craft the notes promise (motion, imagery, type scale) or tighten the layout — do not ship empty sparseness.",
  };
}

// Deltas between the audited target and the binding's captured references —
// one deduped finding per dimension; evidence lists every reference that
// triggers it. Only fires on citable numbers from BOTH sides.
export function referenceDeltas(target: PageTraits, refs: ReferenceCapture[]): TasteFinding[] {
  const withTraits = refs.filter(function (r): r is ReferenceCapture & { traits: PageTraits } {
    return !!r.traits;
  });
  if (withTraits.length === 0) return [];

  const scheme: string[] = [];
  const density: string[] = [];
  const motion: string[] = [];
  const typeScale: string[] = [];

  for (const ref of withTraits) {
    const rt = ref.traits;
    if (
      (target.scheme === "dark" && rt.scheme === "light") ||
      (target.scheme === "light" && rt.scheme === "dark")
    ) {
      scheme.push(ref.url + " renders " + rt.scheme + " (luminance=" + num(rt.bg_luminance) + ") vs target " + target.scheme + " (luminance=" + num(target.bg_luminance) + ")");
    }
    if (target.text_density !== null && rt.text_density !== null && target.text_density > 0 && rt.text_density > 0) {
      const ratio = Math.max(target.text_density, rt.text_density) / Math.min(target.text_density, rt.text_density);
      if (ratio > 3) {
        density.push(ref.url + " text_density=" + rt.text_density.toFixed(2) + " vs target " + target.text_density.toFixed(2) + " (" + ratio.toFixed(1) + "x apart)");
      }
    }
    const refAnimated = rt.scroll_effects === true || (rt.animation_count !== null && rt.animation_count > 3);
    const targetStill = target.animation_count === 0 && target.scroll_effects !== true;
    if (refAnimated && targetStill) {
      motion.push(ref.url + " (animation_count=" + num(rt.animation_count) + ", scroll_effects=" + String(rt.scroll_effects) + ") vs target (animation_count=0, scroll_effects=" + String(target.scroll_effects) + ")");
    }
    if (rt.max_heading_px !== null && target.max_heading_px !== null && target.max_heading_px > 0 && rt.max_heading_px >= 2 * target.max_heading_px) {
      typeScale.push(ref.url + " max_heading_px=" + rt.max_heading_px + " vs target " + target.max_heading_px);
    }
  }

  const findings: TasteFinding[] = [];
  if (scheme.length > 0) {
    findings.push(refFinding("REF-scheme-mismatch",
      "The target's color scheme contradicts the bound references.",
      scheme.join("; "),
      "Match the scheme the references establish, or re-bind with references that reflect the intended ground."));
  }
  if (density.length > 0) {
    findings.push(refFinding("REF-density-delta",
      "The target's text density is far from the bound references.",
      density.join("; "),
      "Bring the layout's density toward the register the references establish."));
  }
  if (motion.length > 0) {
    findings.push(refFinding("REF-motion-missing",
      "The bound references are animated; the target has no motion.",
      motion.join("; "),
      "Add the motion the references establish (scroll choreography, ambient animation) — stillness here is a drop, not restraint."));
  }
  if (typeScale.length > 0) {
    findings.push(refFinding("REF-type-scale",
      "The bound references use a much larger type scale than the target.",
      typeScale.join("; "),
      "Scale the display type toward the references' headline sizes."));
  }
  return findings;
}

function refFinding(ruleId: string, clause: string, evidence: string, fix: string): TasteFinding {
  return {
    rule_id: ruleId,
    clause_cited: clause,
    severity: "warn",
    owner: "taste",
    source: "raven",
    evidence: evidence,
    fix: fix,
  };
}

// ── Technique recipes (build hints) ─────────────────────────────────────
// Expensive design_notes (three.js, GSAP scroll choreography, glassmorphism,
// branded loaders…) are dropped partly because nothing hands the builder the
// HOW. When a note names an expensive technique, Raven attaches a concrete,
// named recipe plus canonical PUBLIC example sources so an expensive note is
// never license to silently drop it — the reference corpus for these is vast.
//
// `trigger` is a list of RegExp SOURCE strings; each is compiled case-
// insensitively and tested against the note text. Table order is the output
// order; each technique is emitted at most once (deduped) across all notes.
export type TechniqueRecipe = { technique: string; trigger: string[]; recipe: string; examples: string[] };

export const TECHNIQUE_RECIPES: TechniqueRecipe[] = [
  {
    technique: "three.js hero scene",
    // "three" alone must NOT trigger — "three-column layout" / "three sections"
    // is not a WebGL request. Require the library name or the medium.
    trigger: ["three\\.?js\\b", "\\b3js\\b", "\\b3[- ]?d\\b", "\\bwebgl\\b"],
    recipe:
      "Stand up a Scene + PerspectiveCamera + WebGLRenderer sized to the hero, and drive a slow ambient rotation in requestAnimationFrame (no OrbitControls, or damped with drag disabled). Load a single GLTF model or compose primitives, then sell depth with fog and soft three-point lighting (one key, low ambient, a rim). Cap devicePixelRatio at ~2 and pause the render loop when the canvas scrolls out of view.",
    examples: [
      "three.js official examples — https://threejs.org/examples/",
      "Bruno Simon, Three.js Journey showcase — https://threejs-journey.com/",
      "Codrops WebGL tutorials — https://tympanus.net/codrops/",
    ],
  },
  {
    technique: "GSAP scroll choreography",
    trigger: ["gsap", "scroll.?(choreograph|led|driven|trigger)", "cinematic scroll"],
    recipe:
      "Register ScrollTrigger and build one timeline per section, pinning the section and scrubbing transforms to scroll progress (scrub: true) so motion is tied to the wheel, not a fixed duration. Stagger element reveals with gsap.from(..., { stagger }) and tune with start/end markers. Wrap it in gsap.matchMedia so the choreography relaxes on mobile and honors prefers-reduced-motion.",
    examples: [
      "GSAP ScrollTrigger demos — https://gsap.com/demos/",
      "GSAP ScrollTrigger docs — https://gsap.com/docs/v3/Plugins/ScrollTrigger/",
      "Codrops scroll-animation tutorials — https://tympanus.net/codrops/",
    ],
  },
  {
    technique: "glassmorphism",
    trigger: ["glassmorph", "frosted", "translucent"],
    recipe:
      "Apply backdrop-filter: blur(16px) saturate(140%) to a semi-transparent panel (background rgba at ~0.1 alpha), add a 1px translucent border and a soft inset highlight for the frosted edge, and layer z-depth so the glass sits above imagery or a gradient. Caveat: glass needs something BEHIND it — over a flat solid it reads as a plain gray box. Ship a -webkit-backdrop-filter fallback.",
    examples: [
      "backdrop-filter (MDN) — https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter",
      "Josh Comeau, next-level frosted glass — https://www.joshwcomeau.com/css/backdrop-filter/",
      "Glassmorphism generator — https://glassmorphism.com/",
    ],
  },
  {
    technique: "branded loader",
    trigger: ["branded.?load", "loader anim"],
    recipe:
      "Render a position:fixed full-viewport overlay first in the DOM with the logo/wordmark, animate the mark (draw-on SVG stroke, mask wipe, or a counter) and tie a progress bar to REAL asset loads via Promise.all on your critical images/fonts, not a fake timer. On complete, transition the overlay out (fade or curtain) so it hands off into the hero entrance rather than cutting. Give reduced-motion an instant reveal.",
    examples: [
      "Codrops page-preloader demos — https://tympanus.net/codrops/",
      "GSAP loader-animation demos — https://gsap.com/demos/",
      "Awwwards loading-animation collection — https://www.awwwards.com/awwwards/collections/loading/",
    ],
  },
  {
    technique: "scroll-snap scene narrative",
    trigger: ["story", "sequence", "scene", "immersive"],
    recipe:
      "Lay out full-viewport (100svh) sections, optionally with scroll-snap-type: y mandatory on the scroller. Give each scene an entrance cascade triggered by an IntersectionObserver, with a scroll-position fallback so jumped-to or bot-rendered scenes still resolve to their final state. Keep one clear focal beat per scene and let whitespace carry the pacing.",
    examples: [
      "CSS scroll-snap (MDN) — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll_snap",
      "IntersectionObserver reveal patterns (Codrops) — https://tympanus.net/codrops/",
      "Apple product pages — https://www.apple.com/",
    ],
  },
  {
    technique: "particle / dot field",
    trigger: ["particle", "dot.?field", "starfield"],
    recipe:
      "Render points in a canvas 2D field or a three.js Points/BufferGeometry with an additive material for glow. Vary size and alpha by depth so the field reads volumetric, and add a subtle pointer-parallax offset. Cap the particle count, reuse a typed-array buffer, throttle to devicePixelRatio<=2, and pause when off-screen.",
    examples: [
      "tsParticles — https://particles.js.org/",
      "three.js points/sprites example — https://threejs.org/examples/#webgl_points_sprites",
      "Codrops particle demos — https://tympanus.net/codrops/",
    ],
  },
  {
    technique: "lottie animation",
    trigger: ["lottie"],
    recipe:
      "Export the animation as JSON from After Effects (Bodymovin) and play it with lottie-web or the dotLottie player, lazy-loading both the player and the JSON off the main thread / below the fold. Prefer a .lottie bundle for size and gate playback on visibility to save CPU. Provide a static poster for reduced-motion.",
    examples: [
      "LottieFiles — https://lottiefiles.com/",
      "lottie-web (Airbnb) — https://github.com/airbnb/lottie-web",
      "dotLottie player — https://dotlottie.io/",
    ],
  },
  {
    technique: "kinetic / display typography",
    trigger: ["kinetic", "display type", "dramatic (type|scale)", "9\\d+px"],
    recipe:
      "Set headlines with clamp() so they scale from ~40px to 96px+ across the viewport, and reveal them per line behind an overflow:hidden mask (translateY(100%) → 0, staggered). Use a variable font and animate the weight or optical axis for kinetic emphasis. Keep line-height tight (~0.95) at display size and let the type be the composition.",
    examples: [
      "Variable fonts guide (MDN) — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/Variable_fonts_guide",
      "Codrops typography demos — https://tympanus.net/codrops/",
      "Utopia fluid type/scale — https://utopia.fyi/",
    ],
  },
  {
    technique: "shader / gradient atmosphere",
    trigger: ["shader", "aurora", "gradient (mesh|atmosphere)"],
    recipe:
      "Animate a mesh gradient with a WebGL fragment shader (or the lightweight Stripe-style gradient) for an aurora that drifts over time, or approximate it in CSS with @property --hue and a rotating conic/linear gradient. Keep it low-frequency and desaturated behind content so it never fights the type. Pause off-screen and honor reduced-motion.",
    examples: [
      "Stripe mesh-gradient breakdown — https://kevinhufnagl.com/how-to-stripe-website-gradient-effect/",
      "The Book of Shaders — https://thebookofshaders.com/",
      "CSS @property gradient demos (Codrops) — https://tympanus.net/codrops/",
    ],
  },
  {
    technique: "parallax product frame",
    trigger: ["parallax", "floating (device|product|frame)"],
    recipe:
      "Drive the device/product frame with transform: translate3d() (plus a little rotate) bound to scroll progress, smoothing it with a spring/lerp toward the target so it never snaps. Use will-change: transform and translate3d to stay on the compositor, and layer foreground/background at different rates for depth. Dampen or disable on touch and for reduced-motion.",
    examples: [
      "Lenis smooth scroll — https://github.com/darkroomengineering/lenis",
      "GSAP parallax demos — https://gsap.com/demos/",
      "Codrops parallax tutorials — https://tympanus.net/codrops/",
    ],
  },
];

export type BuildHint = { note_key: string; technique: string; recipe: string; examples: string[] };

// For each recipe whose triggers match any design_note, emit one hint attributed
// to the FIRST note that triggered it. Output is in recipe-table order; each
// technique appears at most once even if several notes name it (deduped). A note
// that names no expensive technique (vanilla/none) yields nothing.
export function buildHints(notes: Record<string, string>): BuildHint[] {
  const keys = Object.keys(notes);
  const out: BuildHint[] = [];
  for (const recipe of TECHNIQUE_RECIPES) {
    const patterns = recipe.trigger.map(function (src) { return new RegExp(src, "i"); });
    let hitKey: string | null = null;
    for (const key of keys) {
      const value = notes[key];
      if (typeof value !== "string") continue;
      if (patterns.some(function (re) { return re.test(value); })) { hitKey = key; break; }
    }
    if (hitKey !== null) {
      out.push({ note_key: hitKey, technique: recipe.technique, recipe: recipe.recipe, examples: recipe.examples });
    }
  }
  return out;
}

// ── LEG E: mobile parity ─────────────────────────────────────────────
// Apps have no live browser probe, so mobile gets the same fidelity
// guarantees through two honest layers: pixel-derived traits from a
// screenshot (scheme/luminance only — everything else stays null rather
// than fake), and source-code presence verifiers for the expensive notes.
// The conservatism contract is identical: a wrong trait is worse than a
// null one, and every "missing" cites exactly what was searched and not
// found.

function imageTraitsBase(): PageTraits {
  return {
    source: "static",
    scheme: "unknown",
    bg_luminance: null,
    text_density: null,
    section_count: 0,
    image_count: 0,
    video_count: 0,
    canvas_count: 0,
    webgl: null,
    backdrop_filter: false,
    animation_count: null,
    scroll_effects: null,
    font_families: [],
    max_heading_px: null,
    gradient_count: 0,
    loader_hint: false,
    viewport_fill: null,
  };
}

type DecodedPngLike = { width: number; height: number; data: Uint8Array };
type PngModuleLike = { PNG?: { sync?: { read?: (buffer: Buffer) => DecodedPngLike } } };

const PNG_DATA_URL_PREFIX = /^data:image\/png;base64,/i;

// Pixel-derived trait subset from a screenshot PNG (a screen capture of an app,
// or an image reference on a mobile binding). Accepts a Buffer/Uint8Array or a
// base64 string (data: prefix tolerated). Decoding reuses the repo's optional
// pngjs path (same as image-diff.ts); luminance math reuses the WCAG
// relativeLuminance from contrast.ts. Only scheme + bg_luminance are ever
// asserted — and only when the border-ring samples AGREE. Counts stay 0 and
// live-only fields stay null: pixel traits must never be fed to the full
// assessDesignNotes (use assessDesignNotesImage, which gates to the honest
// subset). Never throws — any failure returns the all-unknown base.
export async function screenTraitsFromImage(png: Buffer | Uint8Array | string): Promise<PageTraits> {
  const traits = imageTraitsBase();
  try {
    let buf: Buffer;
    if (typeof png === "string") {
      buf = Buffer.from(png.replace(PNG_DATA_URL_PREFIX, ""), "base64");
    } else {
      buf = Buffer.isBuffer(png) ? png : Buffer.from(png);
    }
    // Decode guards: cap the encoded size and pre-read IHDR dimensions before
    // handing untrusted bytes to the synchronous decoder — a decompression-bomb
    // PNG must return unknown traits, not exhaust memory.
    const MAX_PNG_BYTES = 32 * 1024 * 1024;
    const MAX_PNG_DIM = 8192;
    if (buf.length < 33 || buf.length > MAX_PNG_BYTES) return traits;
    const ihdrW = buf.readUInt32BE(16);
    const ihdrH = buf.readUInt32BE(20);
    if (!(ihdrW >= 1 && ihdrW <= MAX_PNG_DIM && ihdrH >= 1 && ihdrH <= MAX_PNG_DIM)) return traits;
    // @ts-ignore pngjs is intentionally optional; absence yields null traits.
    const pngModule = (await import("pngjs").catch(function () { return null; })) as PngModuleLike | null;
    const readPng = pngModule && pngModule.PNG && pngModule.PNG.sync ? pngModule.PNG.sync.read : undefined;
    if (!readPng) return traits;
    const decoded = readPng(buf);
    const w = decoded.width;
    const h = decoded.height;
    if (!(w >= 8 && h >= 8) || !decoded.data || decoded.data.length < w * h * 4) return traits;

    // Border-ring sampling: the pixels along the edges (inset ~1.5% so a hairline
    // bezel/antialiased border doesn't dominate) are the best cheap proxy for
    // the screen's ground color. Stride caps the sample count.
    const inset = Math.max(1, Math.round(Math.min(w, h) * 0.015));
    const strideX = Math.max(1, Math.floor(w / 256));
    const strideY = Math.max(1, Math.floor(h / 256));
    let light = 0;
    let dark = 0;
    let mid = 0;
    let total = 0;
    let lumSum = 0;
    const sample = function (x: number, y: number): void {
      const idx = (y * w + x) * 4;
      const a = decoded.data[idx + 3] / 255;
      // Composite over white — same convention as the contrast module.
      const r = Math.round(decoded.data[idx] * a + 255 * (1 - a));
      const g = Math.round(decoded.data[idx + 1] * a + 255 * (1 - a));
      const b = Math.round(decoded.data[idx + 2] * a + 255 * (1 - a));
      const lum = relativeLuminance([r, g, b]);
      lumSum += lum;
      total += 1;
      if (lum > 0.6) light += 1;
      else if (lum < 0.35) dark += 1;
      else mid += 1;
    };
    for (let x = inset; x < w - inset; x += strideX) {
      sample(x, inset);
      sample(x, h - 1 - inset);
    }
    for (let y = inset; y < h - inset; y += strideY) {
      sample(inset, y);
      sample(w - 1 - inset, y);
    }
    if (total === 0) return traits;

    const lightShare = light / total;
    const darkShare = dark / total;
    const midShare = mid / total;
    const mean = lumSum / total;
    // Assert a scheme only when the ring agrees; disagreement without a clear
    // light/dark split stays "unknown" — a wrong trait is worse than a null one.
    if (lightShare >= 0.7) {
      traits.scheme = "light";
      traits.bg_luminance = Math.round(mean * 1000) / 1000;
    } else if (darkShare >= 0.7) {
      traits.scheme = "dark";
      traits.bg_luminance = Math.round(mean * 1000) / 1000;
    } else if ((lightShare >= 0.25 && darkShare >= 0.25) || midShare >= 0.7) {
      traits.scheme = "mixed";
      traits.bg_luminance = Math.round(mean * 1000) / 1000;
    }
    // text_density / imagery share: edge-density heuristics are not confident
    // enough to assert — left null on purpose (null over fake).
    return traits;
  } catch {
    return imageTraitsBase();
  }
}

// The honest subset of assessDesignNotes for PIXEL-DERIVED traits. Only the
// scheme/luminance verifiers are trustworthy from a screenshot; every other
// key answers "unverifiable" with the reason, instead of reading the base
// traits' zero-counts as evidence of absence.
export function assessDesignNotesImage(notes: Record<string, string>, traits: PageTraits): NoteAssessment[] {
  const out: NoteAssessment[] = [];
  for (const key of Object.keys(notes)) {
    const note = notes[key];
    if (key === "color") {
      out.push(assessColor(note, traits));
      continue;
    }
    if (key === "aesthetic" && FLAT_WHITE_WORDS.test(note) && !GLASS_WORDS.test(note) && !NEON_WORDS.test(note)) {
      // flat-white is purely a scheme claim — the one aesthetic verifiable
      // from pixels. Glass/neon need backdrop_filter/gradient counts a
      // screenshot cannot supply, so mixed notes stay unverifiable.
      out.push(assessAesthetic(note, traits));
      continue;
    }
    out.push(assessment(key, "unverifiable", "no pixel-verifiable expectation",
      "pixel-derived screenshot traits verify color scheme only — " + key + " requires source code or a live render"));
  }
  return out;
}

// ── Source-code presence verifiers (swiftui / rn / compose) ─────────

export type MobileSourceKind = "swiftui" | "rn" | "compose";

// Per-kind API vocabularies. Pattern strings are kept as sources so a
// "missing" can cite exactly what was searched. Compiled case-SENSITIVELY —
// these are API identifiers; case flexibility is encoded per pattern.
const SOURCE_VOCAB: Record<MobileSourceKind, Record<string, string[]>> = {
  swiftui: {
    animation: ["withAnimation", "Animation\\.", "TimelineView", "matchedGeometryEffect", "\\.animation\\(", "PhaseAnimator", "KeyframeAnimator"],
    glass: ["\\.ultraThinMaterial", "\\.regularMaterial", "\\.thinMaterial", "\\.thickMaterial", "\\.blur\\("],
    branded_loader: ["LaunchScreen", "[Ss]plash", "[Ll]oader", "progressViewStyle"],
    spinner: ["ProgressView", "UIActivityIndicatorView"],
    scene3d: ["Canvas\\s*\\{", "TimelineView", "SpriteKit", "SceneKit", "RealityKit", "\\bMetal\\b", "MTKView"],
    mono: ["\\.monospaced", "fontDesign\\(\\s*\\.monospaced", "Font\\.custom\\(\\s*\"[^\"]*[Mm]ono"],
    serif: ["fontDesign\\(\\s*\\.serif", "Font\\.custom\\(\\s*\"[^\"]*[Ss]erif"],
    haptics: ["sensoryFeedback", "UIImpactFeedbackGenerator", "UINotificationFeedbackGenerator", "UISelectionFeedbackGenerator", "CoreHaptics"],
  },
  rn: {
    animation: ["Animated\\.", "Reanimated", "useAnimatedStyle", "withTiming\\(", "withSpring\\(", "LayoutAnimation"],
    glass: ["BlurView", "expo-blur", "@react-native-community/blur"],
    branded_loader: ["SplashScreen", "[Ss]plash", "[Ll]oader"],
    spinner: ["ActivityIndicator"],
    scene3d: ["expo-gl", "@react-three", "\\bthree\\b", "react-native-skia", "@shopify/react-native-skia", "expo-three"],
    mono: ["fontFamily\\s*:\\s*['\"][^'\"]*[Mm]ono", "monospace"],
    serif: ["fontFamily\\s*:\\s*['\"](?![^'\"]*sans-serif)[^'\"]*[Ss]erif"],
    haptics: ["expo-haptics", "HapticFeedback", "ReactNativeHapticFeedback", "Haptics\\."],
  },
  compose: {
    animation: ["animate[A-Za-z]*AsState", "updateTransition", "AnimatedVisibility", "rememberInfiniteTransition", "animateContentSize", "Animatable"],
    glass: ["Modifier\\.blur", "\\.blur\\(", "[Hh]aze"],
    branded_loader: ["[Ss]plash", "[Ll]oader"],
    spinner: ["CircularProgressIndicator", "LinearProgressIndicator"],
    scene3d: ["Canvas\\s*[({]", "graphicsLayer", "drawBehind", "drawWithCache"],
    mono: ["FontFamily\\.Monospace", "[Mm]onospace"],
    serif: ["FontFamily\\.Serif\\b"],
    haptics: ["HapticFeedback", "performHapticFeedback", "LocalHapticFeedback"],
  },
};

// Explicit font-size declarations per kind, for the "dramatic scale" check.
const SOURCE_SIZE_PATTERNS: Record<MobileSourceKind, string[]> = {
  swiftui: ["\\.system\\(\\s*size:\\s*(\\d+(?:\\.\\d+)?)", "Font\\.custom\\([^)]*size:\\s*(\\d+(?:\\.\\d+)?)"],
  rn: ["fontSize\\s*:\\s*(\\d+(?:\\.\\d+)?)"],
  compose: ["fontSize\\s*=\\s*(\\d+(?:\\.\\d+)?)\\.sp"],
};

const SCENE3D_NOTE_WORDS = /\b(3d|webgl|three(\.?js)?|3js|particle\w*|starfield|scene\s?kit|sprite\s?kit|reality\s?kit|metal|skia)\b/i;
const HAPTIC_NOTE_WORDS = /\bhaptic\w*\b/i;

// Commented-out code must not count as "present": strip block comments and
// full-line // comments before probing. Inline trailing // is left alone so
// string literals containing URLs (https://…) are never mangled — the cost is
// a rare trailing commented API call still matching, which errs toward
// "present" only in code that at least once existed on that line.
function stripSourceComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function probeSource(source: string, kind: MobileSourceKind, vocabName: string): { matched: string[]; searched: string[] } {
  const sources = SOURCE_VOCAB[kind][vocabName] || [];
  const stripped = stripSourceComments(source);
  const matched: string[] = [];
  for (const patternSource of sources) {
    if (new RegExp(patternSource).test(stripped)) matched.push(patternSource);
  }
  return { matched: matched, searched: sources };
}

function searchedCite(kind: MobileSourceKind, searched: string[]): string {
  return "searched " + kind + " source for " + searched.join(", ") + " — no match";
}

function matchedCite(matched: string[]): string {
  return "matched: " + matched.join(", ");
}

// Source-code presence verification for a binding's design_notes against
// SwiftUI / React Native / Compose source. Same contract as assessDesignNotes:
// deterministic, conservative, every "missing" cites the exact patterns
// searched and not found; notes with no source-observable form are
// "unverifiable" with the reason, never guessed.
export function assessDesignNotesSource(
  notes: Record<string, string>,
  source: string,
  kind: MobileSourceKind
): NoteAssessment[] {
  const src = typeof source === "string" ? source : "";
  const out: NoteAssessment[] = [];
  for (const key of Object.keys(notes)) {
    out.push(assessNoteSource(key, notes[key], src, kind));
  }
  return out;
}

function assessNoteSource(key: string, note: string, src: string, kind: MobileSourceKind): NoteAssessment {
  switch (key) {
    case "motion": return assessMotionSource(note, src, kind);
    case "aesthetic": return assessAestheticSource(note, src, kind);
    case "loading": return assessLoadingSource(note, src, kind);
    case "imagery":
    case "libraries": return assessSceneSource(key, note, src, kind);
    case "typography": return assessTypographySource(note, src, kind);
    case "haptics": return assessHapticsSource("haptics", note, src, kind);
    case "special":
      if (HAPTIC_NOTE_WORDS.test(note)) return assessHapticsSource("special", note, src, kind);
      return assessment("special", "unverifiable", "no source expectation", "free-form special notes require human or LLM judgment");
    case "color":
      return assessment("color", "unverifiable", "no source expectation", "color literals in source do not prove the rendered scheme — verify with a screenshot (screenTraitsFromImage) or eyes-on");
    case "spacing":
      return assessment("spacing", "unverifiable", "no source expectation", "text density is a rendered property — verify with a live render or screenshot");
    case "entrance":
      return assessment("entrance", "unverifiable", "no source expectation", "entrance timing is runtime behavior — verify on a device or simulator");
    default:
      return assessment(key, "unverifiable", "no source expectation", "no deterministic source verifier for this dimension in " + kind + " code");
  }
}

function assessMotionSource(note: string, src: string, kind: MobileSourceKind): NoteAssessment {
  const wantsStill = MOTION_STATIC_WORDS.test(note);
  const wantsMotion = MOTION_DYNAMIC_WORDS.test(note);
  if (wantsStill && wantsMotion) {
    return assessment("motion", "unverifiable", "no single motion expectation", "note reads both static and dynamic — no single expectation to verify");
  }
  const p = probeSource(src, kind, "animation");
  if (wantsMotion) {
    if (p.matched.length > 0) {
      return assessment("motion", "present", "animation APIs in " + kind + " source", matchedCite(p.matched));
    }
    return assessment("motion", "missing", "animation APIs in " + kind + " source",
      "note promises choreographed/cinematic motion but no animation API is used — " + searchedCite(kind, p.searched));
  }
  if (wantsStill) {
    if (p.matched.length === 0) {
      return assessment("motion", "present", "no animation APIs in " + kind + " source", searchedCite(kind, p.searched));
    }
    // Animation APIs existing does not prove the motion exceeds "minimal" —
    // partial, never a confident violation from source alone.
    return assessment("motion", "partial", "no animation APIs in " + kind + " source",
      "animation APIs are present (" + matchedCite(p.matched) + ") though the note reads static/minimal — verify the motion stays minimal");
  }
  return assessment("motion", "unverifiable", "no source expectation", "no static/dynamic motion words to verify deterministically");
}

function assessAestheticSource(note: string, src: string, kind: MobileSourceKind): NoteAssessment {
  if (GLASS_WORDS.test(note)) {
    const p = probeSource(src, kind, "glass");
    if (p.matched.length > 0) {
      return assessment("aesthetic", "present", "glass/blur APIs in " + kind + " source (glassmorphism named)", matchedCite(p.matched));
    }
    return assessment("aesthetic", "missing", "glass/blur APIs in " + kind + " source (glassmorphism named)",
      "no material/blur API anywhere in the source — " + searchedCite(kind, p.searched));
  }
  return assessment("aesthetic", "unverifiable", "no source expectation",
    "only glassmorphism has a deterministic source form (" + kind + " material/blur APIs) — verify this aesthetic with a screenshot or eyes-on");
}

function assessLoadingSource(note: string, src: string, kind: MobileSourceKind): NoteAssessment {
  const loader = probeSource(src, kind, "branded_loader");
  const spinner = probeSource(src, kind, "spinner");
  if (/\bnone\b/i.test(note) && !LOADER_WANT_WORDS.test(note)) {
    if (spinner.matched.length === 0 && loader.matched.length === 0) {
      return assessment("loading", "present", "no loading UI in " + kind + " source",
        searchedCite(kind, loader.searched.concat(spinner.searched)));
    }
    return assessment("loading", "missing", "no loading UI in " + kind + " source",
      "note asks for no loading state but loading UI exists — " + matchedCite(loader.matched.concat(spinner.matched)));
  }
  if (/\bbranded\b/i.test(note)) {
    if (loader.matched.length > 0) {
      return assessment("loading", "present", "a branded launch/loader surface in " + kind + " source", matchedCite(loader.matched));
    }
    if (spinner.matched.length > 0) {
      return assessment("loading", "partial", "a branded launch/loader surface in " + kind + " source",
        "only a stock spinner was found (" + matchedCite(spinner.matched) + ") — nothing branded; " + searchedCite(kind, loader.searched));
    }
    return assessment("loading", "missing", "a branded launch/loader surface in " + kind + " source",
      "no launch/splash/loader surface and no spinner — " + searchedCite(kind, loader.searched.concat(spinner.searched)));
  }
  if (LOADER_WANT_WORDS.test(note)) {
    const all = loader.matched.concat(spinner.matched);
    if (all.length > 0) {
      return assessment("loading", "present", "a loading/progress surface in " + kind + " source", matchedCite(all));
    }
    return assessment("loading", "missing", "a loading/progress surface in " + kind + " source",
      searchedCite(kind, loader.searched.concat(spinner.searched)));
  }
  return assessment("loading", "unverifiable", "no source expectation", "no loader words to verify deterministically");
}

function assessSceneSource(key: string, note: string, src: string, kind: MobileSourceKind): NoteAssessment {
  if (SCENE3D_NOTE_WORDS.test(note)) {
    const p = probeSource(src, kind, "scene3d");
    if (p.matched.length > 0) {
      return assessment(key, "present", "a drawing/3D surface in " + kind + " source (3d/particles named)", matchedCite(p.matched));
    }
    return assessment(key, "missing", "a drawing/3D surface in " + kind + " source (3d/particles named)",
      "no canvas/3D/graphics API anywhere in the source — " + searchedCite(kind, p.searched));
  }
  if (key === "libraries" && VANILLA_WORDS.test(note)) {
    return assessment("libraries", "unverifiable", "no specialty libraries", "note asks for vanilla/none — nothing to verify for presence");
  }
  if (key === "imagery" && IMAGERY_WORDS.test(note)) {
    return assessment("imagery", "unverifiable", "no source expectation",
      "photo/story imagery is content, not source-observable — verify with a screenshot or eyes-on");
  }
  return assessment(key, "unverifiable", "no source expectation", "no source-verifiable technique named in the note");
}

function assessTypographySource(note: string, src: string, kind: MobileSourceKind): NoteAssessment {
  const parts: NoteAssessment[] = [];
  if (MONO_WORDS.test(note)) {
    const p = probeSource(src, kind, "mono");
    if (p.matched.length > 0) parts.push(assessment("typography", "present", "a mono face in " + kind + " source", matchedCite(p.matched)));
    else parts.push(assessment("typography", "missing", "a mono face in " + kind + " source", searchedCite(kind, p.searched)));
  }
  if (/serif/i.test(note.replace(/sans[- ]?serif/gi, ""))) {
    const p = probeSource(src, kind, "serif");
    if (p.matched.length > 0) parts.push(assessment("typography", "present", "a serif face in " + kind + " source", matchedCite(p.matched)));
    else parts.push(assessment("typography", "missing", "a serif face in " + kind + " source", searchedCite(kind, p.searched)));
  }
  if (DISPLAY_TYPE_WORDS.test(note)) {
    const sizes: number[] = [];
    for (const patternSource of SOURCE_SIZE_PATTERNS[kind]) {
      const re = new RegExp(patternSource, "g");
      let m: RegExpExecArray | null = re.exec(src);
      while (m !== null) {
        const v = parseFloat(m[1]);
        if (!Number.isNaN(v)) sizes.push(v);
        m = re.exec(src);
      }
    }
    if (sizes.length === 0) {
      parts.push(assessment("typography", "unverifiable", "display-scale type (>=40pt) in " + kind + " source",
        "no explicit font-size declarations found (searched " + SOURCE_SIZE_PATTERNS[kind].join(", ") + ") — semantic styles may still render large; verify with a screenshot"));
    } else {
      const max = Math.max.apply(null, sizes);
      if (max >= 40) parts.push(assessment("typography", "present", "display-scale type (>=40pt) in " + kind + " source", "max declared font size " + max + "pt"));
      else parts.push(assessment("typography", "missing", "display-scale type (>=40pt) in " + kind + " source",
        "note promises display/dramatic scale but the largest declared font size is " + max + "pt across " + sizes.length + " declaration(s)"));
    }
  }
  if (parts.length > 0) return combine("typography", parts);
  return assessment("typography", "unverifiable", "no source expectation", "no mono/serif/display words to verify deterministically");
}

function assessHapticsSource(key: string, note: string, src: string, kind: MobileSourceKind): NoteAssessment {
  if (/\bnone\b/i.test(note) && !HAPTIC_NOTE_WORDS.test(note.replace(/\bno haptics?\b/gi, ""))) {
    const pNone = probeSource(src, kind, "haptics");
    if (pNone.matched.length === 0) return assessment(key, "present", "no haptic APIs in " + kind + " source", searchedCite(kind, pNone.searched));
    return assessment(key, "missing", "no haptic APIs in " + kind + " source", "note asks for no haptics but haptic APIs exist — " + matchedCite(pNone.matched));
  }
  const p = probeSource(src, kind, "haptics");
  if (p.matched.length > 0) return assessment(key, "present", "haptic feedback APIs in " + kind + " source", matchedCite(p.matched));
  return assessment(key, "missing", "haptic feedback APIs in " + kind + " source",
    "note names haptics but no haptic API is used — " + searchedCite(kind, p.searched));
}

// ── Shared missing-note → audit-issue mapper ─────────────────────────
// The mobile audits (audit_swiftui / audit_rn / audit_screen /
// audit_ios_screen) report {severity, rule, message, fix} issues that count
// toward their score/grade. Missing notes fold in the same way the web
// fidelity findings count toward audit_taste's verdict: warn ("warning") by
// default, escalated ("error") only when a named library or a branded loader
// is wholly absent — the notes builders silently drop.
export type NoteIssue = { severity: "error" | "warning"; rule: string; message: string; fix: string };

export function noteIssuesFromAssessments(
  notes: Record<string, string>,
  assessments: NoteAssessment[]
): NoteIssue[] {
  const out: NoteIssue[] = [];
  for (const a of assessments) {
    if (a.status !== "missing") continue;
    const noteText = notes[a.key] || "";
    const escalate =
      (a.key === "libraries" && /\b(three(\.?js)?|3js|gsap|lottie)\b/i.test(noteText)) ||
      (a.key === "loading" && /\bbranded\b/i.test(noteText));
    out.push({
      severity: escalate ? "error" : "warning",
      rule: "taste-note/" + a.key,
      message: "design note '" + a.key + "' (" + noteText + ") is not visibly present: " + a.evidence,
      fix: "Make the " + a.key + " note visibly true in the app, or report to the user which notes were dropped and why — design_notes are acceptance criteria, not mood words.",
    });
  }
  return out;
}
