// compose_build_prompt: turns a caller-supplied colorless skeleton plus the
// project's own DESIGN.md tokens, component inventory, taste rules, surface
// binding, and decision graph into one grounded build prompt (spec:
// docs/spec-pattern-library.md §9/§12/§13). No model call, no network, no
// writes — the decision store is read via listActiveDecisions()/
// listDecisions("contested") directly, never through the destructive
// decision_list tool, so the tool's readOnly annotation stays true.
import { existsSync, readFileSync, readdirSync } from "fs";
import { basename, join, resolve, sep } from "path";
import { readDesignMd, type ComponentDecl, type DesignMdValue, type FlattenedDesignToken } from "./designmd.js";
import { diffDesignSystem, inventoryFromDesignMd, listBaselineComponents, readSourceConfig } from "./design-system-diff.js";
import { checkBindingConsistency, getTasteProfile, listTasteDecisions, resolveSurfaceBinding, ruleInScope, type SurfaceBinding } from "./taste.js";
import { type TasteStore } from "./taste-store.js";
import { buildHints, type BuildHint } from "./taste-fidelity.js";
import { decisionsHome, type DecisionGraphStore, type DecisionNode } from "./decision-graph.js";

// ── Skeleton types (§9) ─────────────────────────────────────────────────────
// The skeleton comes IN as an argument — the calling agent authors it from the
// reference it is already looking at. It is strictly colorless, typeless, and
// sizeless; lintSkeleton() enforces that below. `kind`/`source` unions exclude
// "pixel" where a screenshot cannot show the claim (a transition, a copy rule).

export interface Skeleton {
  structure: StructureNode;
  states?: StateMachine;
  content?: ContentSlot[];
  motion?: MotionSpec[];
  provenance?: Provenance[];
}

export interface StructureNode {
  node_id: string;
  role: string;
  archetype: string;
  containment: "stack" | "row" | "overlay" | "inline";
  order: number;
  emphasis: 1 | 2 | 3;
  density: "compact" | "default" | "roomy";
  children: StructureNode[];
}

export interface StateMachine {
  initial: string;
  states: { name: string; terminal?: boolean; note?: string }[];
  transitions: {
    from: string; to: string;
    on: string;
    timeout_ms?: number;
    paused_by?: ("hover" | "focus-within")[];
    kind: "note" | "pattern" | "inferred" | "designer";
    pattern_ref?: string;
  }[];
}

export interface ContentSlot {
  node_id: string;
  slot: string;
  copy: string;
  voice_constraint?: string;
  max_chars?: number;
  kind: "note" | "pattern" | "inferred" | "designer";
}

export interface MotionSpec {
  node_id: string; on: string;
  properties: ("opacity" | "translateY" | "translateX" | "scale" | "height")[];
  from: Record<string, number>; to: Record<string, number>;
  duration_ms: number; delay_ms: number;
  easing: string | null;
  source: "observed" | "pattern-knowledge" | "designer" | "default";
  reduced_motion: "none" | "opacity-only" | "instant";
}

export interface Provenance {
  claim: string;
  kind: "pixel" | "note" | "pattern" | "inferred";
  ref_id?: string; bbox?: [number, number, number, number];
  pattern_ref?: string;
}

// ── Tool contract (§12) ─────────────────────────────────────────────────────

export interface ComposeBuildPromptArgs {
  intent: string;
  project_dir: string;
  profile: string;
  skeleton?: Skeleton;
  reference_url?: string;
  session_id?: string;
  ref_ids?: string[];
  surface?: string;
  project?: string;
  design_file_path?: string;
  inventory_source?: "auto" | "design-md" | "registry" | "scan" | "none";
  components?: ComponentDecl[];
}

export interface SkeletonComponentBinding {
  kind: "component";
  node_id: string;
  archetype: string;
  component: string | null;
  confidence: "alias" | "canonical" | "fuzzy" | "unresolved";
  emphasis_token: string | null;
  density_token: string | null;
}

export interface SkeletonMotionBinding {
  kind: "motion";
  node_id: string;
  on: string;
  duration_token: string | null;
  duration_literal_ms: number;
  easing_token: string | null;
}

export type SkeletonBinding = SkeletonComponentBinding | SkeletonMotionBinding;

export interface AcceptanceCriterion {
  id: string;
  claim: string;
  check: string;
  verified_by: string;
}

export interface ComposeBuildPromptResult {
  prompt: string;
  grounding: {
    design_md: string;
    design_md_resolved_via: "design_file_path" | "source-config" | "default";
    token_count: number;
    inventory_source: string;
    component_count: number;
    binding_resolved: boolean;
    decisions_scope: string;
    decisions_consulted: string[];
    contested_decisions: string[];
  };
  skeleton: Skeleton | null;
  skeleton_required: boolean;
  bindings: SkeletonBinding[];
  gaps: string[];
  acceptance: AcceptanceCriterion[];
}

interface PromptComponent extends ComponentDecl {
  evidence: "declared" | "registry" | "filename" | "caller";
}

// ── Skeleton lint (§9): colorless, typeless, sizeless ───────────────────────
// A hex value, a font name, or an absolute px other than a motion distance
// fails — if the skeleton can express brand, brand gets smuggled through it.
// MotionSpec from/to are numeric CSS-px distances by contract, which is the
// one sanctioned place a pixel magnitude lives; they are numbers, not strings,
// so the string-level px scan never sees them.

var HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
var PX_RE = /\b\d+(?:\.\d+)?px\b/i;
var FONT_DECL_RE = /font-family\s*[:=]/i;
var KNOWN_FONT_NAMES = [
  "inter", "helvetica", "arial", "roboto", "sf pro", "san francisco", "segoe ui",
  "georgia", "times new roman", "untitled sans", "geist", "domaine", "futura",
  "gotham", "circular std", "graphik", "soehne", "söhne", "ibm plex", "space grotesk",
  "poppins", "montserrat", "lato", "open sans", "source sans", "work sans", "dm sans",
  "jetbrains mono", "fira code", "menlo", "monaco", "courier new"
];

function lintString(where: string, value: string, findings: string[]): void {
  if (HEX_RE.test(value)) findings.push(where + ": hex color literal \"" + value.match(HEX_RE)![0] + "\" — the skeleton is colorless; colors come from the project's tokens");
  if (PX_RE.test(value)) findings.push(where + ": absolute px literal \"" + value.match(PX_RE)![0] + "\" — the skeleton is sizeless; only MotionSpec from/to carry pixel distances");
  if (FONT_DECL_RE.test(value)) findings.push(where + ": font-family declaration — the skeleton is typeless; type comes from the project's tokens");
  var lower = value.toLowerCase();
  for (var i = 0; i < KNOWN_FONT_NAMES.length; i++) {
    if (new RegExp("\\b" + KNOWN_FONT_NAMES[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(lower)) {
      findings.push(where + ": font name \"" + KNOWN_FONT_NAMES[i] + "\" — the skeleton is typeless; type comes from the project's tokens");
      break;
    }
  }
}

// `transient` is inherited: a node inside a toast is still inside a toast, so the
// emphasis cap has to follow the subtree rather than test each node in isolation.
function walkStructure(node: StructureNode, visit: (node: StructureNode, transient: boolean) => void, transient?: boolean): void {
  var inTransient = transient === true || isTransientSurface(node);
  visit(node, inTransient);
  var children = Array.isArray(node.children) ? node.children : [];
  for (var i = 0; i < children.length; i++) walkStructure(children[i], visit, inTransient);
}

export function lintSkeleton(skeleton: Skeleton): string[] {
  var findings: string[] = [];
  if (!skeleton || typeof skeleton !== "object" || !skeleton.structure || typeof skeleton.structure !== "object") {
    return ["skeleton.structure is required — a single StructureNode root"];
  }

  var nodeIds = new Set<string>();
  walkStructure(skeleton.structure, function(node) {
    var where = "structure node \"" + String(node.node_id) + "\"";
    if (!node.node_id || typeof node.node_id !== "string") findings.push("structure: every node needs a string node_id");
    else if (nodeIds.has(node.node_id)) findings.push(where + ": duplicate node_id");
    else nodeIds.add(node.node_id);
    for (var key of ["role", "archetype"] as const) {
      if (typeof node[key] === "string") lintString(where + "." + key, node[key], findings);
    }
    if (node.emphasis !== 1 && node.emphasis !== 2 && node.emphasis !== 3) findings.push(where + ": emphasis must be 1|2|3 (relative weight, never a px size)");
    if (["compact", "default", "roomy"].indexOf(node.density) === -1) findings.push(where + ": density must be compact|default|roomy");
  });

  var states = skeleton.states;
  if (states) {
    var stateNames = new Set((states.states || []).map(function(s) { return s.name; }));
    if (!stateNames.has(states.initial)) findings.push("states.initial \"" + states.initial + "\" is not a member of states[]");
    for (var sn = 0; sn < (states.states || []).length; sn++) {
      var st = states.states[sn];
      var swhere = "state \"" + st.name + "\"";
      if (typeof st.name === "string") lintString(swhere + ".name", st.name, findings);
      if (typeof st.note === "string") lintString(swhere + ".note", st.note, findings);
    }
    for (var t = 0; t < (states.transitions || []).length; t++) {
      var tr = states.transitions[t];
      var twhere = "transition " + tr.from + "→" + tr.to;
      if (typeof tr.on === "string") lintString(twhere + ".on", tr.on, findings);
      if ((tr as any).kind === "pixel") findings.push(twhere + ": kind \"pixel\" is not allowed — a screenshot cannot show a transition");
      if (["note", "pattern", "inferred", "designer"].indexOf(tr.kind) === -1) findings.push(twhere + ": kind must be note|pattern|inferred|designer");
      if (tr.kind === "pattern" && !tr.pattern_ref) findings.push(twhere + ": kind \"pattern\" requires pattern_ref");
      if (tr.timeout_ms !== undefined && tr.on !== "timeout") findings.push(twhere + ": timeout_ms is only valid when on === \"timeout\"");
      if (!stateNames.has(tr.from)) findings.push(twhere + ": from-state \"" + tr.from + "\" is not in states[]");
      if (!stateNames.has(tr.to)) findings.push(twhere + ": to-state \"" + tr.to + "\" is not in states[]");
    }
  }

  var content = skeleton.content || [];
  for (var c = 0; c < content.length; c++) {
    var slot = content[c];
    var cwhere = "content slot \"" + slot.slot + "\"";
    if ((slot as any).kind === "pixel") findings.push(cwhere + ": kind \"pixel\" is not allowed — a screenshot cannot show a copy rule");
    if (["note", "pattern", "inferred", "designer"].indexOf(slot.kind) === -1) findings.push(cwhere + ": kind must be note|pattern|inferred|designer");
    if (!nodeIds.has(slot.node_id)) findings.push(cwhere + ": node_id \"" + slot.node_id + "\" does not resolve against the structure tree");
    if (typeof slot.slot === "string") lintString(cwhere + ".slot", slot.slot, findings);
    if (typeof slot.copy === "string") lintString(cwhere + ".copy", slot.copy, findings);
    if (typeof slot.voice_constraint === "string") lintString(cwhere + ".voice_constraint", slot.voice_constraint, findings);
  }

  var motion = skeleton.motion || [];
  for (var m = 0; m < motion.length; m++) {
    var spec = motion[m];
    var mwhere = "motion spec " + spec.node_id + " on " + spec.on;
    if (["observed", "pattern-knowledge", "designer", "default"].indexOf(spec.source) === -1) findings.push(mwhere + ": source must be observed|pattern-knowledge|designer|default — it has no default");
    if (spec.easing !== null && spec.source !== "observed") findings.push(mwhere + ": easing must be null unless source is \"observed\" — nothing else can have measured a curve");
    if (!nodeIds.has(spec.node_id)) findings.push(mwhere + ": node_id does not resolve against the structure tree");
    if (typeof spec.easing === "string") lintString(mwhere + ".easing", spec.easing, findings);
    if (typeof spec.on === "string") lintString(mwhere + ".on", spec.on, findings);
  }

  var provenance = skeleton.provenance || [];
  for (var p = 0; p < provenance.length; p++) {
    if (["pixel", "note", "pattern", "inferred"].indexOf(provenance[p].kind) === -1) findings.push("provenance \"" + provenance[p].claim + "\": kind must be pixel|note|pattern|inferred");
    if (typeof provenance[p].claim === "string") lintString("provenance claim \"" + provenance[p].claim + "\"", provenance[p].claim, findings);
    if (typeof provenance[p].pattern_ref === "string") lintString("provenance pattern_ref \"" + provenance[p].pattern_ref + "\"", provenance[p].pattern_ref!, findings);
  }

  return findings;
}

// ── Binding helpers (§9) ────────────────────────────────────────────────────

// Normalized Levenshtein similarity: 1 - distance/max(len). Named because an
// unnamed "string similarity" is untunable; the ≥0.8 threshold is bindSkeleton's.
export function normalizedLevenshtein(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  var prev = new Array(b.length + 1);
  var curr = new Array(b.length + 1);
  for (var j = 0; j <= b.length; j++) prev[j] = j;
  for (var i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (var k = 1; k <= b.length; k++) {
      curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    }
    var swap = prev; prev = curr; curr = swap;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

// Parse a token value into a sortable number. Ramp ORDER is what matters, so
// units are normalized only enough to sort a homogeneous group: bare numbers
// pass through, "200ms"/"0.2s" become ms, "1.5rem"/"1.5em" become px at 16.
// A ref token returns null — a ref chain makes the ramp ambiguous (§9).
function parseTokenNumber(token: FlattenedDesignToken): number | null {
  if (token.kind === "ref") return null;
  var value: DesignMdValue = token.value;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  var match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|rem|em|ms|s)?$/);
  if (!match) return null;
  var num = parseFloat(match[1]);
  if (match[2] === "s") return num * 1000;
  if (match[2] === "rem" || match[2] === "em") return num * 16;
  return num;
}

function tokensInGroup(tokens: FlattenedDesignToken[], prefix: string): FlattenedDesignToken[] {
  return tokens.filter(function(token) {
    return token.group === prefix || token.path === prefix || token.path.indexOf(prefix + ".") === 0;
  });
}

interface RampEntry { token: FlattenedDesignToken; num: number }

function rampEntries(tokens: FlattenedDesignToken[], prefix: string): RampEntry[] {
  return tokensInGroup(tokens, prefix)
    .map(function(token) { return { token: token, num: parseTokenNumber(token) }; })
    .filter(function(entry): entry is RampEntry { return entry.num !== null; })
    .sort(function(a, b) { return a.num - b.num; });
}

// Sort the group's parseable scalars ascending and pick by quantile — never by
// declaration order, which carries no semantics in a YAML block (§9). Fewer
// than two parseable values is not a ramp: unresolved, reported as a gap.
function rampPick(tokens: FlattenedDesignToken[], prefix: string, quantile: number): string | null {
  var ramp = rampEntries(tokens, prefix);
  if (ramp.length < 2) return null;
  return ramp[quantileIndex(ramp.length, quantile)].token.path;
}

function quantileIndex(length: number, quantile: number): number {
  return Math.min(length - 1, Math.max(0, Math.round((length - 1) * quantile)));
}

// A toast, tooltip or inline banner is read in passing and must not carry display
// type. The quantile ramp is role-blind, so on a scale that mixes body and display
// sizes (13/16/20/27/56/96) emphasis 2 lands on the 4th entry — a 27px heading
// token inside a snackbar, which is the defect this guard exists to stop.
var TRANSIENT_ARCHETYPES = /\b(toast|snackbar|tooltip|popover|flash|banner|badge|chip|pill|status\s*bar|inline\s*alert|transient)\b/i;

function isTransientSurface(node: StructureNode): boolean {
  if (TRANSIENT_ARCHETYPES.test(node.archetype || "")) return true;
  if (TRANSIENT_ARCHETYPES.test(node.role || "")) return true;
  // Not every design system names its toast "toast". An overlay that is also
  // compact is transient by construction: it floats above the page and is sized
  // to be glanced at.
  return node.containment === "overlay" && node.density === "compact";
}

// Cap the emphasis pick at the ramp's body entry (by token name, falling back to
// the entry nearest 16px) so a transient surface cannot resolve above it. Returns
// whether the cap actually moved the pick, so the caller can report the clamp
// rather than silently re-scaling a level the skeleton asked for.
function rampPickCapped(
  tokens: FlattenedDesignToken[],
  prefix: string,
  quantile: number
): { path: string | null; clamped: string | null } {
  var ramp = rampEntries(tokens, prefix);
  if (ramp.length < 2) return { path: null, clamped: null };
  var requested = quantileIndex(ramp.length, quantile);
  var cap = bodyIndex(ramp);
  if (requested <= cap) return { path: ramp[requested].token.path, clamped: null };
  return { path: ramp[cap].token.path, clamped: ramp[requested].token.path };
}

function bodyIndex(ramp: RampEntry[]): number {
  for (var i = 0; i < ramp.length; i++) {
    if (/(^|\.)body$/i.test(ramp[i].token.path)) return i;
  }
  var nearest = 0;
  for (var j = 1; j < ramp.length; j++) {
    if (Math.abs(ramp[j].num - 16) < Math.abs(ramp[nearest].num - 16)) nearest = j;
  }
  return nearest;
}

var EMPHASIS_QUANTILE: Record<number, number> = { 1: 0.25, 2: 0.5, 3: 0.85 };
var DENSITY_QUANTILE: Record<string, number> = { compact: 0.25, default: 0.5, roomy: 0.75 };

interface CanonicalComponent { id: string; aliases: string[]; states: string[]; variants: string[]; }

function bindArchetype(archetype: string, components: PromptComponent[], canonical: CanonicalComponent[]): { component: string | null; confidence: SkeletonComponentBinding["confidence"] } {
  var lower = archetype.toLowerCase();
  var direct = components.find(function(comp) {
    return comp.id.toLowerCase() === lower || comp.aliases.some(function(alias) { return alias.toLowerCase() === lower; });
  });
  if (direct) return { component: direct.id, confidence: "alias" };

  var canon = canonical.find(function(entry) {
    return entry.id === lower || entry.aliases.indexOf(lower) !== -1;
  });
  if (canon) {
    var names = [canon.id].concat(canon.aliases);
    var viaCanon = components.find(function(comp) {
      var compNames = [comp.id.toLowerCase()].concat(comp.aliases.map(function(alias) { return alias.toLowerCase(); }));
      return compNames.some(function(name) { return names.indexOf(name) !== -1; });
    });
    if (viaCanon) return { component: viaCanon.id, confidence: "canonical" };
  }

  var best: { id: string; score: number } | null = null;
  for (var i = 0; i < components.length; i++) {
    var score = normalizedLevenshtein(lower, components[i].id.toLowerCase());
    if (!best || score > best.score) best = { id: components[i].id, score: score };
  }
  if (best && best.score >= 0.8) return { component: best.id, confidence: "fuzzy" };
  return { component: null, confidence: "unresolved" };
}

export function bindSkeleton(
  skeleton: Skeleton,
  components: PromptComponent[],
  tokens: FlattenedDesignToken[],
  canonical: CanonicalComponent[]
): { bindings: SkeletonBinding[]; gaps: string[] } {
  var bindings: SkeletonBinding[] = [];
  var gaps: string[] = [];
  var emphasisGapReported = false;
  var densityGapReported = false;

  walkStructure(skeleton.structure, function(node, transient) {
    var bound = bindArchetype(node.archetype, components, canonical);
    if (bound.confidence === "unresolved" && components.length > 0) {
      gaps.push("Archetype \"" + node.archetype + "\" (node " + node.node_id + ") matched no component in your system — name your equivalent or create one, and report which.");
    }
    var emphasisToken: string | null;
    if (transient) {
      var capped = rampPickCapped(tokens, "type", EMPHASIS_QUANTILE[node.emphasis]);
      emphasisToken = capped.path;
      if (capped.clamped !== null) {
        gaps.push(
          "Node " + node.node_id + " (\"" + node.archetype + "\") sits in a transient surface, where emphasis " +
          node.emphasis + " would have bound " + capped.clamped + " — display type in a surface that is glanced at. " +
          "Clamped to " + capped.path + ". Carry the emphasis with weight or colour instead of size, and say which you used."
        );
      }
    } else {
      emphasisToken = rampPick(tokens, "type", EMPHASIS_QUANTILE[node.emphasis]);
    }
    if (emphasisToken === null && !emphasisGapReported) {
      gaps.push("type.* has no parseable numeric ramp, so emphasis could not be bound to a token. Name the type token you used for each emphasis level.");
      emphasisGapReported = true;
    }
    var densityToken = rampPick(tokens, "space", DENSITY_QUANTILE[node.density]);
    if (densityToken === null && !densityGapReported) {
      gaps.push("space.* has no parseable numeric ramp, so density could not be bound to a token. Name the spacing token you used.");
      densityGapReported = true;
    }
    bindings.push({
      kind: "component",
      node_id: node.node_id,
      archetype: node.archetype,
      component: bound.component,
      confidence: bound.confidence,
      emphasis_token: emphasisToken,
      density_token: densityToken
    });
  });

  var durationTokens = tokensInGroup(tokens, "motion.duration")
    .map(function(token) { return { token: token, num: parseTokenNumber(token) }; })
    .filter(function(entry): entry is { token: FlattenedDesignToken; num: number } { return entry.num !== null; });
  var easingTokens = tokensInGroup(tokens, "motion.easing");

  var motion = skeleton.motion || [];
  for (var m = 0; m < motion.length; m++) {
    var spec = motion[m];
    var nearest: { path: string; num: number } | null = null;
    for (var d = 0; d < durationTokens.length; d++) {
      var delta = Math.abs(durationTokens[d].num - spec.duration_ms);
      if (delta <= 40 && (!nearest || delta < Math.abs(nearest.num - spec.duration_ms))) {
        nearest = { path: durationTokens[d].token.path, num: durationTokens[d].num };
      }
    }
    if (!nearest) {
      gaps.push("motion_token_gap: " + spec.duration_ms + "ms (" + spec.node_id + " on " + spec.on + ") is not within ±40ms of any motion.duration.* token — the literal is kept; add a token or pick the nearest and report which.");
    }
    var easingToken: string | null = null;
    if (spec.easing !== null) {
      var easingMatch = easingTokens.find(function(token) { return String(token.value) === spec.easing; });
      if (easingMatch) easingToken = easingMatch.path;
    }
    bindings.push({
      kind: "motion",
      node_id: spec.node_id,
      on: spec.on,
      duration_token: nearest ? nearest.path : null,
      duration_literal_ms: spec.duration_ms,
      easing_token: easingToken
    });
  }

  return { bindings: bindings, gaps: gaps };
}

// ── Inventory ladder (§9) ───────────────────────────────────────────────────
// DESIGN.md manifest → shadcn registry.json → repo scan → unbound. Storybook
// (open-world fetch) and Figma (an MCP server cannot call another MCP server)
// were deliberately dropped; caller-supplied `components` covers enrichment.

var SCAN_EXTENSIONS = [".tsx", ".jsx", ".vue", ".svelte"];
var SCAN_FILE_CAP = 2000;

function emptyDecl(id: string): ComponentDecl {
  return { id: id, aliases: [], variants: [], states: [], anatomy: [], tokens: {} };
}

function inventoryFromRegistry(projectDir: string): PromptComponent[] {
  var registryPath = join(projectDir, "registry.json");
  if (!existsSync(registryPath)) return [];
  var parsed: any;
  try { parsed = JSON.parse(readFileSync(registryPath, "utf8")); } catch { return []; }
  var items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  var components: PromptComponent[] = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i] && typeof items[i].name === "string") {
      components.push(Object.assign(emptyDecl(items[i].name), { evidence: "registry" as const }));
    }
  }
  return components;
}

// Names only, evidence "filename" — a scan cannot tell whether Toast supports
// an action slot, which is why it sits below the declared rungs.
function inventoryFromScan(projectDir: string): PromptComponent[] {
  var root = join(projectDir, "src", "components");
  if (!existsSync(root)) return [];
  var files: string[] = [];
  var queue = [root];
  while (queue.length > 0 && files.length < SCAN_FILE_CAP) {
    var dir = queue.shift()!;
    var entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (var e = 0; e < entries.length; e++) {
      var entry = entries[e];
      var full = join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (SCAN_EXTENSIONS.some(function(ext) { return entry.name.endsWith(ext); })) files.push(full);
    }
  }
  var names = new Set<string>();
  for (var f = 0; f < files.length; f++) {
    var base = basename(files[f]).replace(/\.[a-z]+$/, "");
    if (/^[A-Z][A-Za-z0-9]*$/.test(base)) names.add(base);
    var source: string;
    try { source = readFileSync(files[f], "utf8"); } catch { continue; }
    var exportRe = /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let|var)\s+([A-Z][A-Za-z0-9]*)/g;
    var match;
    while ((match = exportRe.exec(source)) !== null) names.add(match[1]);
    var braceRe = /export\s*\{([^}]*)\}/g;
    while ((match = braceRe.exec(source)) !== null) {
      var parts = match[1].split(",");
      for (var p = 0; p < parts.length; p++) {
        var name = parts[p].split(/\s+as\s+/).pop()!.trim();
        if (/^[A-Z][A-Za-z0-9]*$/.test(name)) names.add(name);
      }
    }
  }
  return Array.from(names).sort().map(function(id) {
    return Object.assign(emptyDecl(id), { evidence: "filename" as const });
  });
}

function resolveInventory(
  projectDir: string,
  designPath: string,
  mode: NonNullable<ComposeBuildPromptArgs["inventory_source"]>,
  callerComponents: ComponentDecl[] | undefined
): { source: string; components: PromptComponent[]; diagnostics: string[] } {
  var components: PromptComponent[] = [];
  var diagnostics: string[] = [];
  var source = "none";

  function fromDesignMd(): PromptComponent[] {
    var inventory = inventoryFromDesignMd(designPath);
    diagnostics = diagnostics.concat(inventory.diagnostics);
    return inventory.components;
  }

  if (mode === "design-md") { components = fromDesignMd(); source = "DESIGN.md"; }
  else if (mode === "registry") { components = inventoryFromRegistry(projectDir); source = "registry.json"; }
  else if (mode === "scan") { components = inventoryFromScan(projectDir); source = "repo scan"; }
  else if (mode === "auto") {
    components = fromDesignMd();
    source = "DESIGN.md";
    if (components.length === 0) { components = inventoryFromRegistry(projectDir); if (components.length > 0) source = "registry.json"; }
    if (components.length === 0) { components = inventoryFromScan(projectDir); if (components.length > 0) source = "repo scan"; }
    if (components.length === 0) source = "none";
  }

  if (callerComponents && callerComponents.length > 0) {
    var known = new Set(components.map(function(comp) { return comp.id.toLowerCase(); }));
    for (var i = 0; i < callerComponents.length; i++) {
      if (!known.has(callerComponents[i].id.toLowerCase())) {
        components.push(Object.assign(emptyDecl(callerComponents[i].id), callerComponents[i], { evidence: "caller" as const }));
      }
    }
    source = components.length === callerComponents.length ? "caller-supplied" : source + " + caller-supplied";
  }

  return { source: source, components: components, diagnostics: diagnostics };
}

// ── Prompt assembly ─────────────────────────────────────────────────────────

var TOKENS_PER_GROUP_CAP = 16;

function renderTokensSection(tokens: FlattenedDesignToken[]): string[] {
  var lines: string[] = ["## Tokens to use"];
  var groups: Record<string, string[]> = {};
  var order: string[] = [];
  for (var i = 0; i < tokens.length; i++) {
    if (!groups[tokens[i].group]) { groups[tokens[i].group] = []; order.push(tokens[i].group); }
    groups[tokens[i].group].push("`" + tokens[i].path + "` (`" + tokens[i].cssVar + "`)");
  }
  for (var g = 0; g < order.length; g++) {
    var entries = groups[order[g]];
    var shown = entries.slice(0, TOKENS_PER_GROUP_CAP);
    var suffix = entries.length > shown.length ? " +" + (entries.length - shown.length) + " more" : "";
    lines.push("- " + order[g] + ": " + shown.join(", ") + suffix);
  }
  if (order.length === 0) lines.push("- (DESIGN.md declares no tokens — every value used is a decision to report)");
  lines.push("No hex, no px, no font-family literals — every literal is a defect the acceptance criteria below will catch.");
  return lines;
}

function renderStructureSection(skeleton: Skeleton, bindings: SkeletonBinding[], hints: BuildHint[]): string[] {
  var byNode: Record<string, SkeletonComponentBinding> = {};
  for (var i = 0; i < bindings.length; i++) {
    var binding = bindings[i];
    if (binding.kind === "component") byNode[binding.node_id] = binding;
  }
  var lines: string[] = ["## Structure"];
  function renderNode(node: StructureNode, depth: number): void {
    var bound = byNode[node.node_id];
    var target = bound && bound.component
      ? "<" + bound.component + "> (" + bound.confidence + ")"
      : "<" + node.archetype + "> (no component found in your system — create it or name your equivalent)";
    var detail: string[] = ["emphasis " + node.emphasis + (bound && bound.emphasis_token ? " → `" + bound.emphasis_token + "`" : ""), "density " + node.density + (bound && bound.density_token ? " → `" + bound.density_token + "`" : "")];
    lines.push("  ".repeat(depth) + "- " + node.role + " [" + node.containment + "] → " + target + " [" + detail.join(", ") + "]");
    var children = (node.children || []).slice().sort(function(a, b) { return a.order - b.order; });
    for (var c = 0; c < children.length; c++) renderNode(children[c], depth + 1);
  }
  renderNode(skeleton.structure, 0);
  for (var h = 0; h < hints.length; h++) {
    lines.push("Technique (" + hints[h].note_key + " → " + hints[h].technique + "): " + hints[h].recipe);
  }
  return lines;
}

function renderStatesSection(states: StateMachine | undefined): string[] {
  if (!states) return [];
  var lines: string[] = ["## States"];
  lines.push("Initial: `" + states.initial + "`. States: " + states.states.map(function(s) { return "`" + s.name + "`" + (s.terminal ? " (terminal)" : "") + (s.note ? " — " + s.note : ""); }).join(" · "));
  for (var t = 0; t < states.transitions.length; t++) {
    var tr = states.transitions[t];
    var line = "`" + tr.from + "` → `" + tr.to + "` on " + tr.on;
    if (tr.timeout_ms !== undefined) line += " " + tr.timeout_ms + "ms";
    if (tr.paused_by && tr.paused_by.length > 0) line += ", paused by " + tr.paused_by.join(" and ");
    line += " [source: " + tr.kind + (tr.pattern_ref ? " " + tr.pattern_ref : "") + "]";
    lines.push("- " + line);
  }
  return lines;
}

function renderMotionSection(motion: MotionSpec[] | undefined, bindings: SkeletonBinding[], easingTokenPaths: string[]): string[] {
  if (!motion || motion.length === 0) return [];
  var lines: string[] = ["## Motion"];
  for (var m = 0; m < motion.length; m++) {
    var spec = motion[m];
    var motionBinding = bindings.find(function(binding): binding is SkeletonMotionBinding {
      return binding.kind === "motion" && binding.node_id === spec.node_id && binding.on === spec.on;
    });
    var props = spec.properties.map(function(prop) {
      var from = spec.from[prop]; var to = spec.to[prop];
      return prop + (from !== undefined && to !== undefined ? " " + from + "→" + to : "");
    }).join(", ");
    var line = spec.node_id + " on " + spec.on + ": " + props + ", " + spec.duration_ms + "ms" + (spec.delay_ms ? " +" + spec.delay_ms + "ms delay" : "") + ", easing " + (spec.easing === null ? "`null`" : "`" + spec.easing + "`") + " — **source: " + spec.source + "**.";
    if (spec.source !== "observed") line += " " + spec.duration_ms + "ms is a " + spec.source + " value, not observed in the reference.";
    if (motionBinding && motionBinding.duration_token) line += " Use `" + motionBinding.duration_token + "`.";
    if (motionBinding && motionBinding.easing_token) line += " Easing matches `" + motionBinding.easing_token + "`.";
    else if (spec.easing === null && easingTokenPaths.length > 0) line += " Pick the easing from " + easingTokenPaths.map(function(path) { return "`" + path + "`"; }).join(" / ") + " and report which.";
    lines.push("- " + line);
    lines.push("- `prefers-reduced-motion`: " + spec.reduced_motion + ".");
  }
  return lines;
}

function renderContentSection(content: ContentSlot[] | undefined, voiceNote: string): string[] {
  if (!content || content.length === 0) return [];
  var lines: string[] = ["## Content"];
  for (var c = 0; c < content.length; c++) {
    var slot = content[c];
    var line = slot.node_id + "." + slot.slot + ": \"" + slot.copy + "\"";
    if (slot.max_chars !== undefined) line += " (max " + slot.max_chars + " chars)";
    var voice = slot.voice_constraint || voiceNote;
    if (voice) line += " — voice: " + voice;
    line += " [source: " + slot.kind + "]";
    lines.push("- " + line);
  }
  return lines;
}

function renderCopyingSection(provenance: Provenance[] | undefined): string[] {
  var lines: string[] = ["## What we're copying (and what we are not)"];
  var entries = provenance || [];
  for (var p = 0; p < entries.length; p++) {
    var entry = entries[p];
    var cite = entry.ref_id ? "From `" + entry.ref_id + "` " : "";
    var box = entry.bbox ? " box [" + entry.bbox.join(",") + "]" : "";
    lines.push("- " + cite + "[kind: " + entry.kind + (entry.pattern_ref ? " " + entry.pattern_ref : "") + "]" + box + " — " + entry.claim);
  }
  lines.push("We are **not** copying the reference's color, radius, type, or brand surfaces — brand comes only from the tokens below.");
  return lines;
}

// The standing criteria table, with the §10 discipline baked into the wording:
// a criterion cites the check that proves it or says agent-asserted, and a
// criterion about a post-interaction state says how that state reaches the tool.
function standingAcceptance(hasStates: boolean): AcceptanceCriterion[] {
  var rows: AcceptanceCriterion[] = [
    { id: "A1", claim: "No bare hex, font-size, font-family, or margin/padding/gap literal on an added line of a recognized UI file", check: "review_diff verdict `pass` with `checks_skipped` empty", verified_by: "tool, bounded — it reads only added lines of UI-extension files and does not check arbitrary dimension literals; read `checks_skipped` with the verdict" },
    { id: "A2", claim: "Clears the deterministic color/spacing/motion detectors", check: "talon_scan → 0 findings ≥ warning", verified_by: "tool, on an agent-supplied post-interaction elements+viewport snapshot — talon_scan takes no interactions, so a url-mode run would audit the default state" },
    { id: "A3", claim: "Every interactive target ≥ 44 CSS px on both axes", check: "audit_tap_targets (minSize 44 CSS px)", verified_by: "tool, on an agent-supplied post-interaction elements[] snapshot" },
    { id: "A4", claim: "Text contrast ≥ 4.5:1 (AA normal text)", check: "audit_contrast", verified_by: "tool, on an agent-supplied post-interaction dom_snapshot" },
    { id: "A6", claim: "Semantic roles and live regions from the Structure section are present in the markup", check: "manual read of the diff", verified_by: "agent-asserted — audit_page has no live-region rule" },
    { id: "A7", claim: "Taste verdict not BLOCK and every design_note present", check: "audit_taste → note_assessments + verdict", verified_by: "tool — scoped to the page's default state; audit_taste takes no interactions, so post-interaction elements are covered by A2–A4, not A7" }
  ];
  if (hasStates) {
    rows.splice(4, 0, { id: "A5", claim: "The component appears and transitions per the States section", check: "a Playwright assertion the building agent writes and reports (e.g. toBeVisible() after the trigger)", verified_by: "agent-asserted — audit_url drives interactions but asserts nothing about any selector; its settled captures are corroboration. Duration and easing remain UNVERIFIED until a motion sampler exists" });
  }
  return rows;
}

// ── The composer ────────────────────────────────────────────────────────────

export interface ComposeDeps {
  tasteStore: TasteStore;
  decisionStore: Pick<DecisionGraphStore, "listActiveDecisions" | "listDecisions">;
}

export async function composeBuildPrompt(args: ComposeBuildPromptArgs, deps: ComposeDeps): Promise<ComposeBuildPromptResult> {
  if (!args || typeof args.intent !== "string" || args.intent.trim().length === 0) throw new Error("intent is required — it names the build");
  if (typeof args.project_dir !== "string" || args.project_dir.trim().length === 0) throw new Error("project_dir is required — nothing else can resolve a DESIGN.md path");
  if (typeof args.profile !== "string" || args.profile.trim().length === 0) throw new Error("profile is required — there is no default taste profile, and composing without one would emit an empty Prohibitions block");

  var projectDir = resolve(args.project_dir);

  // DESIGN.md resolution ladder (§9): design_file_path verbatim → the project's
  // .raven/design-system-source.json → <project_dir>/DESIGN.md. readSourceConfig
  // is a bare readFileSync that throws ENOENT on projects that never ran
  // configure_design_system_source; that throw selects the third rung.
  var designPath: string;
  var resolvedVia: ComposeBuildPromptResult["grounding"]["design_md_resolved_via"];
  var platform = "web-pointer";
  if (args.design_file_path) {
    designPath = resolve(args.design_file_path);
    resolvedVia = "design_file_path";
  } else {
    try {
      var config = readSourceConfig(projectDir);
      designPath = resolve(projectDir, config.source.path);
      platform = config.platform || platform;
      resolvedVia = "source-config";
    } catch (err) {
      // Only the absent-config ENOENT selects the default rung (§9). A corrupt
      // or unreadable config must surface — silently falling back would ground
      // the build against a file the project explicitly configured away from.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Unreadable .raven/design-system-source.json in " + projectDir + ": " + (err as Error).message + ". Fix or remove it — the composer only falls back to <project_dir>/DESIGN.md when no config exists at all.");
      }
      designPath = resolve(projectDir, "DESIGN.md");
      resolvedVia = "default";
    }
  }

  var doc;
  try {
    doc = readDesignMd(designPath);
  } catch (err) {
    // No fallback system: grounding in someone else's tokens is the exact
    // failure this tool exists to prevent (§9).
    throw new Error("No readable DESIGN.md at " + designPath + " (" + (err as Error).message + "). Run init_design_md to create one — composing without the project's own tokens would ground the build in nothing.");
  }
  var tokens = doc.tokens;

  var profile = await getTasteProfile(deps.tasteStore, args.profile);

  var projectName = args.project || basename(projectDir);
  // reference_url is NEVER passed as the url hint — it points at someone
  // else's site, and matching it against the profile's hosts would bind the
  // wrong surface (§9).
  var binding: SurfaceBinding | null = await resolveSurfaceBinding(deps.tasteStore, args.profile, { project: projectName });
  var surface = (binding && binding.surface) || args.surface || "";
  var voiceNote = binding ? binding.voice_note : "";
  var designNotes = binding ? binding.design_notes : {};
  var hints: BuildHint[] = binding ? buildHints(designNotes) : [];

  var tasteDecisions = await listTasteDecisions(deps.tasteStore, args.profile, { project: projectName });

  var active: DecisionNode[] = await deps.decisionStore.listActiveDecisions();
  var contested: DecisionNode[] = await deps.decisionStore.listDecisions("contested");
  var decisionsScope = decisionsHome();
  var scopeInsideProject = resolve(decisionsScope) === projectDir || resolve(decisionsScope).indexOf(projectDir + sep) === 0;

  var inventory = resolveInventory(projectDir, designPath, args.inventory_source || "auto", args.components);
  var unbound = inventory.components.length === 0;

  var gaps: string[] = [];
  if (!binding) {
    gaps.push("No surface binding matched project \"" + projectName + "\" for profile \"" + args.profile + "\" — no design_notes, voice_note, or technique hints could be composed. Run get_taste_interview + bind_taste_surface, or pass the bound project name via `project`.");
  }
  if (!scopeInsideProject) {
    gaps.push("Decision scope mismatch: decisions were read from " + decisionsScope + ", which is outside " + projectDir + " — the Decision Graph store is resolved globally and project_dir cannot move it.");
  }
  if (unbound) {
    gaps.push("No component inventory resolved (source: none) — archetypes are emitted as raven-canonical ids. Run configure_design_system_source (or declare components in DESIGN.md) and re-synthesize.");
    // Keep inventory_design_system's own epistemics (§9 rung 1): "no component
    // declarations found — component coverage is unknown, not missing".
    for (var dg = 0; dg < inventory.diagnostics.length; dg++) gaps.push(inventory.diagnostics[dg]);
  }
  if (binding) {
    var consistency = checkBindingConsistency(designNotes, binding.references || []);
    for (var w = 0; w < consistency.length; w++) gaps.push("Binding consistency: " + consistency[w]);
  }
  for (var ct = 0; ct < contested.length; ct++) {
    gaps.push("Contested decision `" + contested[ct].id + "`: \"" + contested[ct].statement + "\"" + (contested[ct].contested_reason ? " — contested because: " + contested[ct].contested_reason : "") + ". Open question — do not silently resolve it; flag it in your report.");
  }

  // Canonical alias table for binding rung 2. listBaselineComponents throws
  // only on an unknown id, and "raven-canonical" is a shipped data file.
  var canonical: CanonicalComponent[] = listBaselineComponents("raven-canonical").components;

  var skeleton = args.skeleton || null;
  var bindings: SkeletonBinding[] = [];
  var bindingResolved = binding !== null;

  if (skeleton) {
    var lint = lintSkeleton(skeleton);
    if (lint.length > 0) {
      throw new Error("Skeleton failed lint — it must stay colorless, typeless, and sizeless:\n- " + lint.join("\n- "));
    }
    var bound = bindSkeleton(skeleton, inventory.components, tokens, canonical);
    bindings = bound.bindings;
    gaps = gaps.concat(bound.gaps);

    // Missing canonical states/variants for the components the skeleton
    // actually binds — only meaningful on a declared inventory, where states
    // are stated rather than unknown.
    if (inventory.components.some(function(comp) { return comp.evidence === "declared"; })) {
      var boundIds = new Set(bindings.filter(function(b): b is SkeletonComponentBinding { return b.kind === "component" && b.component !== null; }).map(function(b) { return (b as SkeletonComponentBinding).component!.toLowerCase(); }));
      var declared = inventory.components.filter(function(comp): comp is PromptComponent & { evidence: "declared" } { return comp.evidence === "declared"; });
      var diff = diffDesignSystem({ source: designPath, tokens: tokens, components: declared as any, diagnostics: [] }, "raven-canonical", { platform: platform });
      var findings = (diff.errors || []).concat(diff.warnings || []);
      for (var fi = 0; fi < findings.length; fi++) {
        var finding = findings[fi];
        if ((finding.type === "missing_state" || finding.type === "missing_variant") && boundIds.has(String(finding.component).toLowerCase())) {
          gaps.push(finding.component + ": " + finding.detail + " (diff_design_system). Add and register it, or state the substitute you used.");
        }
      }
    }
  }

  var acceptance = standingAcceptance(Boolean(skeleton && skeleton.states));

  // ── Assemble the prompt in the fixed §9 section order ──
  var lines: string[] = [];
  lines.push("# Build: " + args.intent);
  if (!skeleton) {
    lines.push("Derive the Structure/States skeleton from the reference you are holding and call compose_build_prompt again with it as `skeleton` — this response is the grounding half only.");
  }
  lines.push("Grounded in: `" + designPath + "` (resolved via " + resolvedVia + ") · taste `" + args.profile + "/" + (surface || "(unbound)") + "` · inventory " + inventory.source + " (" + inventory.components.length + " components)");
  var refs: string[] = [];
  if (args.ref_ids) for (var r = 0; r < args.ref_ids.length; r++) refs.push("`" + args.ref_ids[r] + "`");
  if (args.reference_url) refs.push(args.reference_url + " (provenance only — never fetched by this tool)");
  if (refs.length > 0) lines.push("Reference: " + refs.join(" + "));
  if (!scopeInsideProject) {
    lines.push("Note: decisions were read from `" + decisionsScope + "`, which is outside the project you named.");
  }
  lines.push("");

  if (skeleton) {
    lines = lines.concat(renderCopyingSection(skeleton.provenance), [""]);
    lines = lines.concat(renderStructureSection(skeleton, bindings, hints), [""]);
    var stateLines = renderStatesSection(skeleton.states);
    if (stateLines.length > 0) lines = lines.concat(stateLines, [""]);
    var easingPaths = tokensInGroup(tokens, "motion.easing").map(function(token) { return token.path; });
    var motionLines = renderMotionSection(skeleton.motion, bindings, easingPaths);
    if (motionLines.length > 0) lines = lines.concat(motionLines, [""]);
    var contentLines = renderContentSection(skeleton.content, voiceNote);
    if (contentLines.length > 0) lines = lines.concat(contentLines, [""]);
  }

  lines = lines.concat(renderTokensSection(tokens));
  if (!skeleton && hints.length > 0) {
    for (var nh = 0; nh < hints.length; nh++) {
      lines.push("Technique (" + hints[nh].note_key + " → " + hints[nh].technique + "): " + hints[nh].recipe);
    }
  }
  lines.push("");

  lines.push("## Prohibitions");
  var prohibitionCount = 0;
  var offRules = new Set<string>();
  if (binding) {
    for (var ov = 0; ov < binding.overrides.length; ov++) {
      if (binding.overrides[ov].severity === "off") offRules.add(binding.overrides[ov].rule_id);
    }
  }
  for (var ru = 0; ru < profile.rules.length; ru++) {
    var rule = profile.rules[ru];
    if (offRules.has(rule.rule_id)) continue;
    if (!ruleInScope(rule, surface || undefined)) continue;
    if (!rule.negative_prompt) continue;
    lines.push("- `" + rule.rule_id + "`: \"" + rule.negative_prompt + "\"");
    prohibitionCount++;
  }
  for (var td = 0; td < tasteDecisions.length; td++) {
    if (tasteDecisions[td].rejected.length === 0) continue;
    lines.push("- rejected for " + tasteDecisions[td].dimension + " (taste decision `" + tasteDecisions[td].id + "`): " + tasteDecisions[td].rejected.join(", ") + " — " + tasteDecisions[td].why);
    prohibitionCount++;
  }
  for (var ad = 0; ad < active.length; ad++) {
    if (active[ad].alternatives_rejected.length === 0) continue;
    lines.push("- rejected in the Decision Graph (`" + active[ad].id + "`, active — read via listActiveDecisions(), not decision_list): " + active[ad].alternatives_rejected.join(", ") + (active[ad].rationale ? " — \"" + active[ad].rationale + "\"" : ""));
    prohibitionCount++;
  }
  if (prohibitionCount === 0) lines.push("- (no negative prompts, rejected alternatives, or rejected decisions apply to this surface)");
  lines.push("");

  lines.push("## Gaps / decisions for you");
  if (gaps.length === 0) lines.push("- none — every archetype, ramp, and motion value bound to your system");
  for (var gp = 0; gp < gaps.length; gp++) lines.push((gp + 1) + ". " + gaps[gp]);
  lines.push("");

  lines.push("## Acceptance criteria");
  lines.push("A criterion cites the check that proves it, or it is marked agent-asserted — never left implying a tool checks something it does not.");
  lines.push("| # | Claim | Check | Verified by |");
  lines.push("|---|---|---|---|");
  for (var ac = 0; ac < acceptance.length; ac++) {
    lines.push("| " + acceptance[ac].id + " | " + acceptance[ac].claim + " | " + acceptance[ac].check + " | " + acceptance[ac].verified_by + " |");
  }
  var noteKeys = Object.keys(designNotes || {});
  if (noteKeys.length > 0) {
    lines.push("");
    lines.push("Design notes are acceptance criteria too — audit_taste verifies each as present/partial/missing on the built surface:");
    for (var nk = 0; nk < noteKeys.length; nk++) {
      lines.push("- " + noteKeys[nk] + ": " + (designNotes as Record<string, string>)[noteKeys[nk]]);
    }
  }

  return {
    prompt: lines.join("\n"),
    grounding: {
      design_md: designPath,
      design_md_resolved_via: resolvedVia,
      token_count: tokens.length,
      inventory_source: inventory.source,
      component_count: inventory.components.length,
      binding_resolved: bindingResolved,
      decisions_scope: decisionsScope,
      decisions_consulted: active.map(function(node) { return node.id; }),
      contested_decisions: contested.map(function(node) { return node.id; })
    },
    skeleton: skeleton,
    skeleton_required: !skeleton,
    bindings: bindings,
    gaps: gaps,
    acceptance: acceptance
  };
}
