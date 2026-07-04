import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractStaticTraits, type PageTraits } from "./capture.js";
import { assessDesignNotes, referenceDeltas, restraintGuard, buildHints, type NoteAssessment, type BuildHint } from "./taste-fidelity.js";

export type TasteSeverity = "block" | "warn" | "nit";
export type TasteRule = {
  rule_id: string;
  clause_text: string;
  category: string;
  severity_default: TasteSeverity;
  negative_prompt: string;
  owner: "taste" | "raven";
  delegate_to: string;
  scope: string;
};
export type TasteCorpusRecord = {
  artifact: string;
  verdict: "accept" | "revise" | "reject";
  violated_rule: string;
  severity: TasteSeverity | "";
  wrong: string;
  right: string;
  id: string;
  labeled_at: string;
};
export type TasteProfile = {
  name: string;
  version: 1;
  created_at: string;
  updated_at: string;
  rules: TasteRule[];
  corpus: TasteCorpusRecord[];
};
export type TasteFinding = {
  rule_id: string;
  clause_cited: string;
  severity: TasteSeverity;
  owner: "taste" | "raven";
  source: "taste" | "raven";
  evidence: string;
  fix: string;
};
export type TasteAuditResult = {
  tool: "audit_taste";
  profile: string;
  target: "html" | "text";
  findings: TasteFinding[];
  suppressed: { rule_id: string; corpus_id: string; evidence: string }[];
  not_assessed: { rule_id: string; reason: string }[];
  skipped_out_of_scope: { rule_id: string; scope: string }[];
  disabled_by_binding: { rule_id: string; severity: "off" }[];
  binding: string;
  surface_applied: string;
  voice_note?: string;
  design_notes?: Record<string, string>;
  // Present only when a binding with design_notes was applied AND traits were
  // available (live capture or static extraction from html) — each note is
  // VERIFIED against the artifact, not just echoed.
  note_assessments?: NoteAssessment[];
  // Engine findings from note verification (NOTE-<key>), the restraint guard
  // (TASTE-restraint-earned), and reference deltas (REF-*). They count toward
  // the verdict but never pass through corpus suppression or rule filtering.
  fidelity_findings?: TasteFinding[];
  // Concrete build recipes + canonical public example sources for any expensive
  // technique named in the design_notes — so a failing audit hands the builder
  // the HOW next to the missing finding. Present only when a note triggers one.
  build_hints?: BuildHint[];
  calibration_hint?: string;
  verdict: "BLOCK" | "WARN" | "PASS";
  verdict_line: string;
};

export type SurfaceOverride = { rule_id: string; severity: TasteSeverity | "off" };
// A reference (an example site the person pointed to) is a first-class captured
// artifact, not lossy prose in design_notes: its live PageTraits are stored so
// the notes can be consistency-checked against what the reference actually is.
export type ReferenceCapture = { url: string; liked?: string; traits?: PageTraits; captured_at?: string };
export type SurfaceBinding = {
  project: string;
  surface: string;
  hosts: string[];
  overrides: SurfaceOverride[];
  voice_note: string;
  design_notes: Record<string, string>;
  references?: ReferenceCapture[];
  bound_at: string;
};

// The per-dimension preference questions every interview asks. Each is
// grounded in the profile's own rules for that dimension (matched by category)
// so the user calibrates against what the profile already enforces; where the
// profile has no rules yet, the answer is the only guidance and says so.
// Dimensions may carry multiple-choice options so the user can pick instead
// of composing prose — the options are advisory, not exhaustive.
const DESIGN_DIMENSIONS: { key: string; match: RegExp; ask: string; options?: string[] }[] = [
  { key: "typography", match: /typ|font/i,
    ask: "Typeface family and feel (grotesque, humanist, geometric, serif, mono — or a named face), scale contrast (restrained editorial vs dramatic display), weight range, and anything type must never do here." },
  { key: "spacing", match: /spac|density|rhythm|whitespace/i,
    ask: "Density and rhythm: airy-editorial, balanced, or compact-utilitarian? Name the base unit and section rhythm if you have one (e.g. 8px grid, 64px+ section gaps)." },
  { key: "color", match: /color|colour|palette/i,
    ask: "Ground (light or dark), palette temperature (warm/cool/neutral), how many accents and which hues, and where accent may appear (punctuation only vs fills)." },
  { key: "layout", match: /layout|grid|structure/i,
    ask: "Structure: editorial single-column, marketing grid, dense app chrome? Max-width feel, card usage, and how sections divide." },
  { key: "motion", match: /motion|animat|transition/i,
    ask: "None, subtle (fades/reveals), or expressive? What may animate, what must never, and any duration/easing conventions." },
  { key: "imagery", match: /asset|imag|icon|illustration|photo/i,
    ask: "Photography, illustration, product screenshots, abstract shapes, or none? Icon style (stroke vs filled) and any treatments (duotone, borders, shadows)." },
  { key: "entrance", match: /entrance|hero.?anim|launch|intro|reveal/i,
    ask: "How should the hero/first screen enter — on a website hero and on a mobile app launch?",
    options: [
      "none-instant: content is just there, zero entrance motion",
      "subtle: single fade/rise, under 400ms",
      "staged: orchestrated per-element reveal (headline, then sub, then art)",
      "cinematic: expressive full-scene entrance, motion is part of the brand",
    ] },
  { key: "loading", match: /load(ing|er)|skeleton|spinner|progress/i,
    ask: "What do users see while content loads (web + mobile app)?",
    options: [
      "none: never show intermediate state, hold until ready",
      "skeleton: grey placeholder blocks in final layout",
      "spinner: minimal indeterminate spinner",
      "progress: determinate progress bar/percentage",
      "branded: custom branded loader animation",
    ] },
  { key: "navigation", match: /nav|menu|header|tab.?bar/i,
    ask: "What is the primary navigation pattern?",
    options: [
      "centered: horizontal links centered in header",
      "right-aligned: logo left, links right",
      "hamburger: collapsed behind a menu icon",
      "tabs: top or bottom tab bar",
      "side-panel: persistent vertical side panel",
      "fab: floating action button anchoring key actions",
    ] },
  { key: "aesthetic", match: /aesthetic|style.?preset|brutal|neon|flat|minimal/i,
    ask: "Which aesthetic family is this surface closest to? Pick one or blend two.",
    options: [
      "brutalist: raw, hard edges, exposed structure, system fonts",
      "neon: dark ground, glow accents, saturated highlights",
      "flat-white: white ground, minimal ornament, generous whitespace",
      "editorial: type-led, magazine rhythm, restrained palette",
      "glassmorphic: translucent layers, blur, depth",
      "retro-terminal: mono type, scanline/CRT cues",
    ] },
  { key: "libraries", match: /librar|three\.?js|gsap|framer|lottie|graphql|webgl|stack|tech|next\.?js|framework/i,
    ask: "Some builds lean on specialty libraries you may not know by name — each described by what users would see. Want any? Pick any that fit, or keep it simple. (Sites built with Raven default to a Next.js app — a React framework with fast loading and good SEO out of the box; say so if you'd rather have something else, and it goes in this note.)",
    options: [
      "three-js: real 3D in the browser — spinning products, immersive scenes; heavy wow-factor, heavier pages",
      "gsap: precision scripted animation — timeline-choreographed motion sequences that fire exactly on cue",
      "framer-motion: springy, physical-feeling UI transitions (React apps)",
      "lottie: designer-made vector animations exported straight from After Effects",
      "graphql: a data layer for apps juggling lots of interrelated data — invisible to users, shapes engineering",
      "none-vanilla: standard CSS/JS only — simplest, lightest, fastest to load",
    ] },
];

// The voice question always shows the same message rendered in
// three registers, so the user picks by ear instead of by adjective.
const VOICE_REGISTER_EXAMPLES: { register: string; sample: string }[] = [
  { register: "formal-technical", sample: "Three contrast violations were detected on the pricing page and require remediation." },
  { register: "warm-conversational", sample: "Heads up — I found three contrast issues on your pricing page. All quick fixes." },
  { register: "punchy-editorial", sample: "Three contrast misses. Pricing page. Fix them." },
];

export type TasteDecisionSource = "user-directed" | "user-approved" | "user-corrected";
export type TasteDecision = {
  id: string;
  project: string;
  dimension: string;
  decision: string;
  rejected: string[];
  why: string;
  source: TasteDecisionSource;
  recorded_at: string;
};

export type TasteInterviewQuestion = {
  id: string;
  question: string;
  skippable: boolean;
  priority: "core" | "extended";
  options?: string[];
  examples?: { register: string; sample: string }[];
  suggestions?: string[];
};

type PageIssueInput = { rule: string; severity: string; message: string; fix?: string };

const SEVERITIES: TasteSeverity[] = ["block", "warn", "nit"];
const RULE_OWNERS = ["taste", "raven"];
const CORPUS_VERDICTS = ["accept", "revise", "reject"];
const HEDGING_RE = /\b(might|maybe|possibly|could be|i think|appears to|hard to tell)\b/i;
const STOPWORDS = new Set([
  "and", "are", "but", "can", "for", "from", "has", "have", "into", "not", "of", "the",
  "this", "that", "then", "there", "these", "those", "use", "with", "your",
]);

export function tasteHome(): string {
  return process.env.RAVEN_TASTE_HOME || join(homedir(), ".raven", "taste");
}

export function createTasteProfile(input: {
  name: string;
  rules?: unknown[];
  corpus?: unknown[];
  markdown?: string;
}): TasteProfile {
  const name = validateProfileName(input.name);
  const now = new Date().toISOString();
  const rules: TasteRule[] = [];
  const seen = new Set<string>();

  if (input.rules !== undefined) {
    if (!Array.isArray(input.rules)) throw new Error("rules must be an array when supplied");
    for (let i = 0; i < input.rules.length; i += 1) {
      const rule = validateRule(input.rules[i], "rules[" + i + "]");
      if (seen.has(rule.rule_id)) throw new Error("duplicate rule_id: " + rule.rule_id);
      seen.add(rule.rule_id);
      rules.push(rule);
    }
  }

  if (input.markdown !== undefined) {
    if (typeof input.markdown !== "string") throw new Error("markdown must be a string when supplied");
    const generated = parseMarkdownRules(input.markdown, seen);
    for (const rule of generated) {
      seen.add(rule.rule_id);
      rules.push(rule);
    }
  }

  const ruleIds = new Set(rules.map(function(rule) { return rule.rule_id; }));
  const corpus: TasteCorpusRecord[] = [];
  if (input.corpus !== undefined) {
    if (!Array.isArray(input.corpus)) throw new Error("corpus must be an array when supplied");
    for (let i = 0; i < input.corpus.length; i += 1) {
      const raw = input.corpus[i];
      // Seed records may omit bookkeeping fields — callers only need
      // {artifact, verdict, violated_rule, wrong, right}.
      const seeded = isRecord(raw) ? Object.assign({}, raw) : raw;
      if (isRecord(seeded)) {
        if (seeded.severity === undefined) seeded.severity = "";
        if (typeof seeded.id !== "string" || seeded.id.length === 0) seeded.id = "rec_" + String(i + 1).padStart(4, "0");
        if (typeof seeded.labeled_at !== "string" || seeded.labeled_at.length === 0) seeded.labeled_at = now;
      }
      corpus.push(validateCorpusRecord(seeded, ruleIds, "corpus[" + i + "]"));
    }
  }

  const profile: TasteProfile = {
    name,
    version: 1,
    created_at: now,
    updated_at: now,
    rules,
    corpus,
  };
  writeProfile(profile);
  return profile;
}

export function getTasteProfile(name: string): TasteProfile {
  const safeName = validateProfileName(name);
  const file = profilePath(safeName);
  if (!existsSync(file)) {
    const available = listTasteProfiles().map(function(profile) { return profile.name; });
    const suffix = available.length > 0 ? available.join(", ") : "(none)";
    throw new Error("Taste profile not found: " + safeName + ". Available profiles: " + suffix);
  }
  return validateStoredProfile(JSON.parse(readFileSync(file, "utf8")), safeName);
}

export function listTasteProfiles(): { name: string; rules: number; corpus: number; updated_at: string }[] {
  const home = tasteHome();
  if (!existsSync(home)) return [];
  return readdirSync(home)
    .filter(function(file) {
      // Sidecar stores live alongside profiles: <name>.surfaces.json, <name>.decisions.json.
      return file.endsWith(".json") && !file.endsWith(".surfaces.json") && !file.endsWith(".decisions.json");
    })
    .map(function(file) {
      const raw = JSON.parse(readFileSync(join(home, file), "utf8"));
      const profile = validateStoredProfile(raw, file.slice(0, -5));
      return {
        name: profile.name,
        rules: profile.rules.length,
        corpus: profile.corpus.length,
        updated_at: profile.updated_at,
      };
    })
    .sort(function(a, b) { return a.name.localeCompare(b.name); });
}

export function labelFinding(
  profileName: string,
  rec: { artifact: string; verdict: string; violated_rule: string; severity: string; wrong: string; right: string }
): { profile: string; corpus_count: number; record: TasteCorpusRecord } {
  const profile = getTasteProfile(profileName);
  const ruleIds = new Set(profile.rules.map(function(rule) { return rule.rule_id; }));
  const record = validateLabelInput(rec, ruleIds, profile.corpus.length + 1);

  profile.corpus.push(record);
  profile.updated_at = new Date().toISOString();
  writeProfile(profile);

  return { profile: profile.name, corpus_count: profile.corpus.length, record };
}

// True unless the rule carries a non-global scope AND a surface was stated
// that doesn't match it. With no surface, scoped rules stay in (demoted later).
// Matching is normalized-token overlap; scopes whose tokens are all short/stopwords
// ("ui", "ds") fall back to exact raw-word equality — never substring containment,
// so scope "ui" matches surface "app-ui" but not "guidelines".
export function ruleInScope(rule: TasteRule, surface?: string): boolean {
  const scope = rule.scope.trim().toLowerCase();
  if (scope.length === 0 || scope === "global") return true;
  if (typeof surface !== "string" || surface.trim().length === 0) return true;
  const scopeTokens = normalizedTokens(scope);
  if (scopeTokens.size === 0) {
    const surfaceWords = rawWords(surface);
    for (const word of rawWords(scope)) {
      if (surfaceWords.has(word)) return true;
    }
    return false;
  }
  const surfaceTokens = normalizedTokens(surface);
  for (const token of scopeTokens) {
    if (surfaceTokens.has(token)) return true;
  }
  return false;
}

function rawWords(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) || []);
}

// ── Surface calibration: the kickoff interview + per-project bindings ───────
// A binding records how a taste profile shows up on ONE project: which surface
// string scoped rules match against, which rules are re-tuned or silenced, and
// any voice/tone note. The interview is deterministic — built from the
// profile's own scopes and voice rules — and is asked by the agent, not here.

export function getTasteInterview(profileName: string, project?: string, mode?: "kickoff" | "refine"): {
  tool: "get_taste_interview";
  profile: string;
  project: string;
  existing_binding: SurfaceBinding | null;
  scopes: { scope: string; rules: { rule_id: string; clause_text: string; severity_default: TasteSeverity }[] }[];
  voice_rules: { rule_id: string; clause_text: string; severity_default: TasteSeverity }[];
  rule_ids: string[];
  questions: TasteInterviewQuestion[];
  then: string;
} {
  const interviewMode = mode === "refine" ? "refine" : "kickoff";
  const profile = getTasteProfile(profileName);
  const projectName = typeof project === "string" && project.trim().length > 0 ? project.trim() : "";
  const scopeMap = new Map<string, { rule_id: string; clause_text: string; severity_default: TasteSeverity }[]>();
  for (const rule of profile.rules) {
    const scope = rule.scope.trim().toLowerCase();
    if (scope.length === 0 || scope === "global") continue;
    if (!scopeMap.has(scope)) scopeMap.set(scope, []);
    scopeMap.get(scope)!.push({ rule_id: rule.rule_id, clause_text: rule.clause_text, severity_default: rule.severity_default });
  }
  const scopes = Array.from(scopeMap.entries()).map(function(entry) { return { scope: entry[0], rules: entry[1] }; });
  const voiceRules = profile.rules
    .filter(function(rule) { return /voice|tone/.test(rule.category.toLowerCase()); })
    .map(function(rule) { return { rule_id: rule.rule_id, clause_text: rule.clause_text, severity_default: rule.severity_default }; });

  const label = projectName || "this project";
  const ruleIds = profile.rules.map(function(rule) { return rule.rule_id; });
  const existingBinding = projectName ? resolveSurfaceBinding(profile.name, { project: projectName }) : null;

  if (interviewMode === "refine") {
    if (!existingBinding) {
      throw new Error(
        "No existing surface binding for project '" + (projectName || "<none>") +
        "' — run get_taste_interview with mode:'kickoff' first to calibrate this project before refining it."
      );
    }
    const questions: TasteInterviewQuestion[] = [
      {
        id: "complaint",
        question: "What specifically fell short — name the element/section and what you expected instead of what you got.",
        skippable: false,
        priority: "core",
      },
    ];
    for (const key of Object.keys(existingBinding.design_notes)) {
      const storedNote = existingBinding.design_notes[key];
      questions.push({
        id: "revise:" + key,
        question: "For " + key + " you said: '" + storedNote + "'. Keep, tighten, or replace? If the output followed the note but still felt wrong, say what the note should have said.",
        skippable: true,
        priority: "core",
      });
    }
    questions.push({
      id: "revise:voice",
      question: (existingBinding.voice_note.length > 0
        ? "Your voice note says: '" + existingBinding.voice_note + "'. "
        : "No voice note is set yet. ") +
        "Which register fits " + label + " now, or how does it deviate?",
      skippable: true,
      priority: "core",
      examples: VOICE_REGISTER_EXAMPLES,
    });
    questions.push({
      id: "precedent",
      question: "Should the rejected output be recorded as a reject precedent so audits flag this pattern next time? Name the pattern in one line.",
      skippable: true,
      priority: "extended",
    });

    return {
      tool: "get_taste_interview",
      profile: profile.name,
      project: projectName,
      existing_binding: existingBinding,
      scopes,
      voice_rules: voiceRules,
      rule_ids: ruleIds,
      questions,
      then: "Ask the user these questions conversationally, then persist the updated answers with bind_taste_surface (it upserts by project, so revised design_notes/voice_note replace the stale ones) and, if a precedent answer was given, record it with label_finding (verdict:'reject', citing the complaint). Skipped questions leave that item's prior calibration unchanged — encourage answering, never force.",
    };
  }

  const questions: TasteInterviewQuestion[] = [
    {
      id: "identity",
      question: "What is " + label + ", in a phrase — and what family is it (portfolio, product site, docs, app UI, deck, …)? The answer becomes the binding's surface string that scope-tagged rules match against.",
      skippable: false,
      priority: "core",
    },
  ];
  questions.push({
    id: "references",
    question: "Have examples? Share links, screenshots, or file paths of work that feels right for " + label + " — sites, apps, posters, anything. Each example gets a short follow-up interview: what specifically draws you — the type, the color, the spacing, the motion, the voice? Name the element and the quality; the specifics fold into the matching design notes.",
    skippable: true,
    priority: "core",
  });
  for (const entry of scopes) {
    questions.push({
      id: "scope:" + entry.scope,
      question: "Scope '" + entry.scope + "' carries: " +
        entry.rules.map(function(rule) { return rule.rule_id + " (" + rule.severity_default + ") — " + rule.clause_text; }).join("; ") +
        ". Does " + label + " belong to this scope? If no, these rules are skipped here.",
      skippable: true,
      priority: "core",
    });
  }
  // Learning loop: decisions recorded on OTHER projects feed this interview.
  // Recurring choices return as suggestions on their dimension's question, and
  // decision categories no standard dimension covers spawn NEW questions below
  // — the interview evolves from decisions actually made, never invented.
  const priorDecisions = listTasteDecisions(profile.name).filter(function(decision) {
    return !projectName || decision.project.toLowerCase() !== projectName.toLowerCase();
  });
  const decisionsByDimension = new Map<string, TasteDecision[]>();
  for (const decision of priorDecisions) {
    if (!decisionsByDimension.has(decision.dimension)) decisionsByDimension.set(decision.dimension, []);
    decisionsByDimension.get(decision.dimension)!.push(decision);
  }
  const learnedSuggestions = function(key: string): string[] {
    const entries = decisionsByDimension.get(key) || [];
    const distinct: string[] = [];
    for (let i = entries.length - 1; i >= 0 && distinct.length < 3; i -= 1) {
      const text = entries[i].decision;
      if (distinct.indexOf(text) === -1) distinct.push(text);
    }
    return distinct;
  };
  const quoteLearned = function(items: string[]): string {
    return items.map(function(s) { return "'" + s.replace(/\s+/g, " ").replace(/'/g, "’") + "'"; }).join("; ");
  };

  for (const dimension of DESIGN_DIMENSIONS) {
    const dimensionRules = profile.rules.filter(function(rule) { return dimension.match.test(rule.category); });
    const enforced = dimensionRules.length > 0
      ? "Profile already enforces: " + dimensionRules.slice(0, 4).map(function(rule) { return rule.rule_id + " (" + rule.severity_default + ")"; }).join(", ") +
        (dimensionRules.length > 4 ? " +" + (dimensionRules.length - 4) + " more" : "") + "."
      : "The profile has no " + dimension.key + " rules yet — this answer is the only " + dimension.key + " guidance on " + label + ".";
    const question: TasteInterviewQuestion = {
      id: "design:" + dimension.key,
      question: "How should " + dimension.key + " read on " + label + "? " + dimension.ask + " " + enforced +
        " The answer is stored as design_notes." + dimension.key + " and echoed in every audit.",
      skippable: true,
      priority: "extended",
    };
    if (dimension.options !== undefined) question.options = dimension.options;
    const learned = learnedSuggestions(dimension.key);
    if (learned.length > 0) {
      question.question += " On past projects you decided: " + quoteLearned(learned) + " — still right here?";
      question.suggestions = learned;
    }
    questions.push(question);
  }
  // Dimensions the interview LEARNED: decision categories recorded during real
  // work that no standard question covers become questions of their own.
  const knownDimensionKeys = new Set(DESIGN_DIMENSIONS.map(function(d) { return d.key; }));
  ["special", "references", "voice", "identity"].forEach(function(reserved) { knownDimensionKeys.add(reserved); });
  const learnedDimensionKeys = Array.from(decisionsByDimension.keys()).filter(function(key) { return !knownDimensionKeys.has(key); }).sort();
  for (const learnedKey of learnedDimensionKeys) {
    const learned = learnedSuggestions(learnedKey);
    questions.push({
      id: "design:" + learnedKey,
      question: "A question this interview learned from your past decisions — " + learnedKey + ": on other projects you decided " + quoteLearned(learned) +
        ". How should " + learnedKey + " read on " + label + "? The answer is stored as design_notes." + learnedKey + " and echoed in every audit.",
      skippable: true,
      priority: "extended",
      suggestions: learned,
    });
  }
  questions.push({
    id: "voice",
    question: (voiceRules.length > 0
      ? "Voice/tone rules: " +
        voiceRules.map(function(rule) { return rule.rule_id + " (" + rule.severity_default + ") — " + rule.clause_text; }).join("; ") +
        ". Should any read differently on " + label + " — relaxed (warn/nit), silenced (off), or stricter (block)? Add a short voice note if the register shifts here."
      : "The profile has no voice/tone rules yet — which register fits " + label + ", or how does it deviate? Add a short voice note either way.") +
      " The same message rendered three ways — formal-technical / warm-conversational / punchy-editorial — is given below — pick by ear, not by adjective.",
    skippable: true,
    priority: "core",
    examples: VOICE_REGISTER_EXAMPLES,
  });
  questions.push({
    id: "exceptions",
    question: "Any other rules to override on " + label + "? Each override is {rule_id, severity: block|warn|nit|off}.",
    skippable: true,
    priority: "extended",
  });
  questions.push({
    id: "matchers",
    question: "Which URL hosts identify " + label + " (for url-mode audits), e.g. ravenmcp.ai? The project name itself matches whenever audits pass project:'" + (projectName || "<name>") + "'.",
    skippable: true,
    priority: "core",
  });
  // Open-ended closer. Suggestions are learned, not invented: distinct
  // design_notes.special values the same person chose on their OTHER bound
  // surfaces — the interview starts proposing their own signatures back.
  const specialSuggestions: string[] = [];
  for (const binding of listSurfaceBindings(profile.name)) {
    if (projectName && binding.project.toLowerCase() === projectName.toLowerCase()) continue;
    const note = binding.design_notes.special;
    if (typeof note === "string" && note.trim().length > 0 && specialSuggestions.indexOf(note.trim()) === -1) {
      specialSuggestions.push(note.trim());
    }
  }
  const specialQuestion: TasteInterviewQuestion = {
    id: "special",
    question: "Last one, open-ended: anything special you want " + label + " to have that nothing above asked about — a texture (a field of tiny dots, faint grid lines), a signature detail, a recurring motif, an easter egg? Describe it in your own words; it is stored as design_notes.special and echoed in every audit." +
      (specialSuggestions.length > 0
        ? " On your other surfaces you asked for: " + specialSuggestions.map(function(s) { return "'" + s.replace(/\s+/g, " ").replace(/'/g, "\u2019") + "'"; }).join("; ") + " — want anything similar here?"
        : ""),
    skippable: true,
    priority: "extended",
  };
  if (specialSuggestions.length > 0) specialQuestion.suggestions = specialSuggestions;
  questions.push(specialQuestion);

  return {
    tool: "get_taste_interview",
    profile: profile.name,
    project: projectName,
    existing_binding: existingBinding,
    scopes,
    voice_rules: voiceRules,
    rule_ids: ruleIds,
    questions,
    then: "Ask the user these questions conversationally. This interview is a blocking gate: collect the user's answers BEFORE committing any design direction, palette, type choice, or name — never answer the questions yourself, and never proceed with design work 'while the interview runs.' If references were given, interview each example briefly — what specifically the person likes, mapped to a dimension — fold those specifics into the matching design_notes values, AND pass the examples as the structured `references` array to bind_taste_surface (a list of {url, liked?}), not only as prose in design_notes.references: Raven captures each reference's live traits and consistency-checks your design_notes against what the reference ACTUALLY is (a 'dark, cinematic' color note against two references that both render light is flagged back to you — surface such contradictions to the USER and re-ask, never silently keep both). When the surface is a website to be built, suggest building it as a Next.js app by default (record a different choice in design_notes.libraries if the user prefers one). Then persist with bind_taste_surface — dimension answers (design:*) go in design_notes as {typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries} and the open-ended closer as design_notes.special. design_notes are ACCEPTANCE CRITERIA for any build, not mood words: a build is not done until every note is visibly present in the rendered result, or the client reports to the user exactly which notes were dropped and why. When a note names an expensive technique (three.js/WebGL, GSAP scroll choreography, glassmorphism, a branded loader, lottie, kinetic display type…), bind_taste_surface and audit_taste return build_hints — a concrete recipe plus canonical public example sources (threejs.org, gsap.com, Codrops…) for that technique. An expensive note is NEVER license to drop it: the public corpus for these is vast, so consult the attached build_hints and their sources; if a technique is genuinely infeasible, say so to the USER before shipping without it. Future audit_taste calls with project:'" + (projectName || "<name>") + "' (or a matching url host) apply the binding automatically and echo the notes. Skipped questions leave that dimension uncalibrated and audits stay silent on it — encourage answering, never force. From then on, whenever the user makes, approves, or corrects a taste/direction/design decision during the work (an accent chosen, a nav pattern rejected, a name direction, a type pairing), record it with record_taste_decision — recorded decisions evolve future kickoff interviews: recurring choices return as suggested defaults on their dimension's question, and decision categories no standard question covers become new interview questions.",
  };
}

export function bindTasteSurface(profileName: string, input: {
  project: string;
  surface: string;
  hosts?: unknown;
  overrides?: unknown;
  voice_note?: unknown;
  design_notes?: unknown;
  references?: unknown;
}): SurfaceBinding {
  const profile = getTasteProfile(profileName);
  if (typeof input.project !== "string" || !/^[a-z0-9][a-z0-9-_.]{0,63}$/i.test(input.project)) {
    throw new Error("project must match /^[a-z0-9][a-z0-9-_.]{0,63}$/i");
  }
  if (typeof input.surface !== "string" || input.surface.trim().length === 0) {
    throw new Error("surface is required — the phrase scoped rules match against (e.g. 'product-site')");
  }
  const hosts: string[] = [];
  if (input.hosts !== undefined) {
    if (!Array.isArray(input.hosts)) throw new Error("hosts must be an array of hostnames");
    for (const raw of input.hosts) {
      if (typeof raw !== "string" || raw.trim().length === 0) throw new Error("hosts entries must be non-empty strings");
      hosts.push(normalizeHost(raw));
    }
  }
  const ruleIds = new Set(profile.rules.map(function(rule) { return rule.rule_id; }));
  const overrides: SurfaceOverride[] = [];
  if (input.overrides !== undefined) {
    if (!Array.isArray(input.overrides)) throw new Error("overrides must be an array of {rule_id, severity}");
    const seen = new Set<string>();
    for (let i = 0; i < input.overrides.length; i += 1) {
      const raw = input.overrides[i];
      if (!isRecord(raw)) throw new Error("overrides[" + i + "] must be an object");
      const ruleId = readNonEmptyString(raw, "rule_id", "overrides[" + i + "]");
      if (!ruleIds.has(ruleId)) throw new Error("overrides[" + i + "].rule_id does not exist in profile.rules: " + ruleId);
      if (seen.has(ruleId)) throw new Error("duplicate override for rule_id: " + ruleId);
      seen.add(ruleId);
      const severity = raw.severity;
      if (severity !== "off" && !isSeverity(severity)) throw new Error("overrides[" + i + "].severity must be block, warn, nit, or off");
      overrides.push({ rule_id: ruleId, severity: severity as TasteSeverity | "off" });
    }
  }
  const voiceNote = optionalString(input.voice_note);
  const designNotes = validateDesignNotes(input.design_notes, "design_notes");
  const references = validateReferences(input.references, "references");

  const binding: SurfaceBinding = {
    project: input.project,
    surface: input.surface.trim(),
    hosts,
    overrides,
    voice_note: voiceNote,
    design_notes: designNotes,
    bound_at: new Date().toISOString(),
  };
  if (references !== undefined) binding.references = references;
  const bindings = listSurfaceBindings(profile.name).filter(function(existing) {
    return existing.project.toLowerCase() !== binding.project.toLowerCase();
  });
  bindings.push(binding);
  bindings.sort(function(a, b) { return a.project.localeCompare(b.project); });
  mkdirSync(tasteHome(), { recursive: true });
  writeFileSync(surfacesPath(profile.name), JSON.stringify({ version: 1, bindings }, null, 2) + "\n", "utf8");
  return binding;
}

const DECISION_SOURCES: TasteDecisionSource[] = ["user-directed", "user-approved", "user-corrected"];

// The Taste Engine's learning loop: every taste/direction/design decision made
// during real work — not just interview answers — is recorded here, and
// getTasteInterview mines the ledger so future kickoffs propose the person's
// own past choices back (and grow new questions for decision categories no
// standard dimension covers).
export function recordTasteDecision(profileName: string, input: {
  project: string;
  dimension: string;
  decision: string;
  rejected?: unknown;
  why?: unknown;
  source?: unknown;
}): TasteDecision {
  const profile = getTasteProfile(profileName);
  if (typeof input.project !== "string" || !/^[a-z0-9][a-z0-9-_.]{0,63}$/i.test(input.project)) {
    throw new Error("project must match /^[a-z0-9][a-z0-9-_.]{0,63}$/i");
  }
  const dimension = typeof input.dimension === "string" ? input.dimension.trim().toLowerCase() : "";
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(dimension)) {
    throw new Error("dimension must be a short lowercase name (color, navigation, iconography, …): " + String(input.dimension));
  }
  if (typeof input.decision !== "string" || input.decision.trim().length === 0) {
    throw new Error("decision is required — what was chosen, in the user's words");
  }
  const rejected: string[] = [];
  if (input.rejected !== undefined) {
    if (!Array.isArray(input.rejected)) throw new Error("rejected must be an array of the alternatives passed over");
    for (const raw of input.rejected) {
      if (typeof raw !== "string" || raw.trim().length === 0) throw new Error("rejected entries must be non-empty strings");
      rejected.push(raw.trim());
    }
  }
  const source = input.source === undefined ? "user-directed" : input.source;
  if (DECISION_SOURCES.indexOf(source as TasteDecisionSource) === -1) {
    throw new Error("source must be user-directed, user-approved, or user-corrected");
  }
  const decisions = listTasteDecisions(profile.name);
  const record: TasteDecision = {
    id: "dec_" + (decisions.length + 1),
    project: input.project,
    dimension,
    decision: input.decision.trim(),
    rejected,
    why: optionalString(input.why),
    source: source as TasteDecisionSource,
    recorded_at: new Date().toISOString(),
  };
  decisions.push(record);
  mkdirSync(tasteHome(), { recursive: true });
  writeFileSync(decisionsPath(profile.name), JSON.stringify({ version: 1, decisions }, null, 2) + "\n", "utf8");
  return record;
}

export function listTasteDecisions(profileName: string, filter?: { project?: string; dimension?: string }): TasteDecision[] {
  const file = decisionsPath(validateProfileName(profileName));
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.decisions)) {
    throw new Error("Stored taste decisions must be {version: 1, decisions: []}: " + file);
  }
  const decisions = raw.decisions.map(function(entry, index) { return validateStoredDecision(entry, "decisions[" + index + "]"); });
  return decisions.filter(function(decision) {
    if (filter && typeof filter.project === "string" && decision.project.toLowerCase() !== filter.project.toLowerCase()) return false;
    if (filter && typeof filter.dimension === "string" && decision.dimension !== filter.dimension.trim().toLowerCase()) return false;
    return true;
  });
}

function validateStoredDecision(entry: unknown, where: string): TasteDecision {
  if (!isRecord(entry)) throw new Error(where + " must be an object");
  const id = readNonEmptyString(entry, "id", where);
  const project = readNonEmptyString(entry, "project", where);
  const dimension = readNonEmptyString(entry, "dimension", where);
  const decision = readNonEmptyString(entry, "decision", where);
  if (!Array.isArray(entry.rejected) || entry.rejected.some(function(item) { return typeof item !== "string"; })) {
    throw new Error(where + ".rejected must be an array of strings");
  }
  if (DECISION_SOURCES.indexOf(entry.source as TasteDecisionSource) === -1) {
    throw new Error(where + ".source must be user-directed, user-approved, or user-corrected");
  }
  return {
    id,
    project,
    dimension,
    decision,
    rejected: entry.rejected as string[],
    why: optionalString(entry.why),
    source: entry.source as TasteDecisionSource,
    recorded_at: readNonEmptyString(entry, "recorded_at", where),
  };
}

export function listSurfaceBindings(profileName: string): SurfaceBinding[] {
  const file = surfacesPath(validateProfileName(profileName));
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.bindings)) {
    throw new Error("Stored surface bindings must be {version: 1, bindings: []}: " + file);
  }
  return raw.bindings.map(function(entry, index) { return validateStoredBinding(entry, "bindings[" + index + "]"); });
}

// Precedence: explicit project name beats url-host match; hosts match exactly
// or as a parent domain (www.ravenmcp.ai matches a ravenmcp.ai binding).
export function resolveSurfaceBinding(profileName: string, hints: { project?: string; url?: string }): SurfaceBinding | null {
  const bindings = listSurfaceBindings(profileName);
  if (bindings.length === 0) return null;
  const project = typeof hints.project === "string" ? hints.project.trim().toLowerCase() : "";
  if (project.length > 0) {
    const byName = bindings.find(function(binding) { return binding.project.toLowerCase() === project; });
    if (byName) return byName;
  }
  if (typeof hints.url === "string" && hints.url.trim().length > 0) {
    let host = "";
    try { host = new URL(hints.url).hostname.toLowerCase(); } catch { host = ""; }
    if (host.length > 0) {
      for (const binding of bindings) {
        for (const bound of binding.hosts) {
          if (host === bound || host.endsWith("." + bound)) return binding;
        }
      }
    }
  }
  return null;
}

function surfacesPath(name: string): string {
  return join(tasteHome(), name + ".surfaces.json");
}

function decisionsPath(name: string): string {
  return join(tasteHome(), name + ".decisions.json");
}

// URL-parse the entry (handles userinfo, ports, paths, IPv6 brackets) so the
// stored value is exactly what resolveSurfaceBinding compares URL.hostname
// against. Single-label hosts ("ai") are rejected — a bare TLD would match
// every site under it via the subdomain suffix rule.
function normalizeHost(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) throw new Error("hosts entry is empty");
  let host = "";
  try { host = new URL(trimmed.includes("://") ? trimmed : "http://" + trimmed).hostname; } catch {
    throw new Error("hosts entry is not a valid hostname: " + raw);
  }
  if (host.length === 0) throw new Error("hosts entry has no hostname: " + raw);
  const isIpLiteral = (host.startsWith("[") && host.endsWith("]")) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (!isIpLiteral && host !== "localhost" && !host.includes(".")) {
    throw new Error("hosts entry must be a full hostname, not a single label: " + raw);
  }
  return host;
}

// Mirrors bind-time validation so a hand-edited or corrupt surfaces file can't
// smuggle in what bind_taste_surface would reject. Override rule_ids are NOT
// checked against the profile here: a binding legitimately outlives rule
// renames/removals, and unknown ids are inert at audit time.
function validateStoredBinding(raw: unknown, where: string): SurfaceBinding {
  if (!isRecord(raw)) throw new Error(where + " must be an object");
  const project = readNonEmptyString(raw, "project", where);
  if (!/^[a-z0-9][a-z0-9-_.]{0,63}$/i.test(project)) {
    throw new Error(where + ".project must match /^[a-z0-9][a-z0-9-_.]{0,63}$/i");
  }
  const surface = readNonEmptyString(raw, "surface", where);
  if (!Array.isArray(raw.hosts) || raw.hosts.some(function(host) { return typeof host !== "string"; })) {
    throw new Error(where + ".hosts must be an array of strings");
  }
  const hosts = raw.hosts.map(function(host) {
    const normalized = normalizeHost(host as string);
    if (normalized !== host) throw new Error(where + ".hosts contains an unnormalized entry: " + host);
    return normalized;
  });
  if (!Array.isArray(raw.overrides)) throw new Error(where + ".overrides must be an array");
  const seenOverrides = new Set<string>();
  const overrides = raw.overrides.map(function(entry, index) {
    if (!isRecord(entry)) throw new Error(where + ".overrides[" + index + "] must be an object");
    const ruleId = readNonEmptyString(entry, "rule_id", where + ".overrides[" + index + "]");
    if (seenOverrides.has(ruleId)) throw new Error(where + ".overrides has a duplicate rule_id: " + ruleId);
    seenOverrides.add(ruleId);
    const severity = entry.severity;
    if (severity !== "off" && !isSeverity(severity)) {
      throw new Error(where + ".overrides[" + index + "].severity must be block, warn, nit, or off");
    }
    return { rule_id: ruleId, severity: severity as TasteSeverity | "off" };
  });
  if (raw.voice_note !== undefined && typeof raw.voice_note !== "string") {
    throw new Error(where + ".voice_note must be a string when present");
  }
  const binding: SurfaceBinding = {
    project,
    surface,
    hosts,
    overrides,
    voice_note: optionalString(raw.voice_note),
    // Missing on pre-design_notes bindings — default {} keeps them valid.
    design_notes: validateDesignNotes(raw.design_notes, where + ".design_notes"),
    bound_at: readNonEmptyString(raw, "bound_at", where),
  };
  // references is absent on all pre-references bindings — undefined keeps them
  // valid and unchanged on disk.
  const references = validateReferences(raw.references, where + ".references");
  if (references !== undefined) binding.references = references;
  return binding;
}

// Shared validation for reference arrays — used for both bindTasteSurface input
// (url required, must parse as http(s)) and stored bindings loaded from disk.
// undefined -> undefined (backward compat); traits/captured_at pass through so
// the index.ts handler can enrich each reference with its captured PageTraits
// before persisting.
// A reference entry pointing at a screenshot file rather than a live site:
// ends in .png and is not an http(s) URL. Exported so the bind handler routes
// these through screenTraitsFromImage instead of a live page capture.
export function isPngPathReference(url: string): boolean {
  return /\.png$/i.test(url.trim()) && !/^https?:\/\//i.test(url.trim());
}

function validateReferences(raw: unknown, where: string): ReferenceCapture[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error(where + " must be an array of {url, liked?} references");
  const refs: ReferenceCapture[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!isRecord(entry)) throw new Error(where + "[" + i + "] must be an object");
    const url = readNonEmptyString(entry, "url", where + "[" + i + "]");
    // Mobile bindings may reference screenshots instead of sites: a local .png
    // file path is accepted alongside http(s) URLs (its traits come from
    // screenTraitsFromImage at bind time instead of a live capture).
    if (!isPngPathReference(url)) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(where + "[" + i + "].url must be a valid http(s) URL or a .png image path: " + url);
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(where + "[" + i + "].url must be an http(s) URL or a .png image path: " + url);
      }
    }
    const ref: ReferenceCapture = { url };
    if (entry.liked !== undefined) {
      if (typeof entry.liked !== "string") throw new Error(where + "[" + i + "].liked must be a string when present");
      const liked = entry.liked.trim();
      if (liked.length > 0) ref.liked = liked;
    }
    if (entry.traits !== undefined) {
      if (!isRecord(entry.traits)) throw new Error(where + "[" + i + "].traits must be an object when present");
      ref.traits = sanitizeStoredTraits(entry.traits);
    }
    if (entry.captured_at !== undefined) {
      if (typeof entry.captured_at !== "string") throw new Error(where + "[" + i + "].captured_at must be a string when present");
      ref.captured_at = entry.captured_at;
    }
    refs.push(ref);
  }
  return refs;
}

// Stored/hand-edited traits are untrusted: coerce every field to its declared
// shape (finite number or null, boolean or null, string[], enum'd scheme) so a
// corrupted store degrades to "unknown" instead of crashing a later audit's
// .toFixed()/arithmetic on a non-number.
function sanitizeStoredTraits(raw: Record<string, unknown>): PageTraits {
  const numOrNull = function (v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const boolOrNull = function (v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
  };
  const countOf = function (v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  };
  const scheme = raw.scheme === "light" || raw.scheme === "dark" || raw.scheme === "mixed" ? raw.scheme : "unknown";
  return {
    source: raw.source === "live" ? "live" : "static",
    scheme,
    bg_luminance: numOrNull(raw.bg_luminance),
    text_density: numOrNull(raw.text_density),
    section_count: countOf(raw.section_count),
    image_count: countOf(raw.image_count),
    video_count: countOf(raw.video_count),
    canvas_count: countOf(raw.canvas_count),
    webgl: boolOrNull(raw.webgl),
    backdrop_filter: raw.backdrop_filter === true,
    animation_count: numOrNull(raw.animation_count),
    scroll_effects: boolOrNull(raw.scroll_effects),
    font_families: Array.isArray(raw.font_families) ? raw.font_families.filter(function (f): f is string { return typeof f === "string"; }) : [],
    max_heading_px: numOrNull(raw.max_heading_px),
    gradient_count: countOf(raw.gradient_count),
    loader_hint: raw.loader_hint === true,
    viewport_fill: numOrNull(raw.viewport_fill),
  };
}

// Deterministic, high-confidence contradiction warnings between a binding's
// design_notes and its captured references. ONLY fires when there are citable
// numbers — prefers silence over speculation. Returns [] when no reference has
// captured traits.
export function checkBindingConsistency(
  design_notes: Record<string, string>,
  references: ReferenceCapture[]
): string[] {
  const withTraits = references.filter(function (r): r is ReferenceCapture & { traits: PageTraits } {
    return !!r.traits;
  });
  if (withTraits.length === 0) return [];
  const warnings: string[] = [];

  const fmtScheme = function (): string {
    return withTraits
      .map(function (r) {
        const lum = r.traits.bg_luminance === null ? "n/a" : r.traits.bg_luminance.toFixed(2);
        return r.url + " (scheme=" + r.traits.scheme + ", luminance=" + lum + ")";
      })
      .join("; ");
  };

  const color = design_notes.color || "";
  const darkWords = /\b(dark|black|cinematic|graphite|charcoal|noir|midnight)\b/i;
  const lightWords = /\b(bone|white|cream|paper|airy-light)\b/i;
  const allLight = withTraits.every(function (r) { return r.traits.scheme === "light"; });
  const allDark = withTraits.every(function (r) { return r.traits.scheme === "dark"; });
  if (color && darkWords.test(color) && allLight) {
    warnings.push(
      'color note "' + color + '" reads dark, but every captured reference renders LIGHT: ' + fmtScheme() + "."
    );
  }
  if (color && lightWords.test(color) && allDark) {
    warnings.push(
      'color note "' + color + '" reads light, but every captured reference renders DARK: ' + fmtScheme() + "."
    );
  }

  const motion = design_notes.motion || "";
  const staticWords = /\b(none|minimal|static)\b/i;
  const dynamicWords = /\b(choreograph|cinematic|immersive|scroll)\b/i;
  if (motion && staticWords.test(motion)) {
    const busy = withTraits.filter(function (r) {
      return (r.traits.animation_count !== null && r.traits.animation_count > 5) || r.traits.scroll_effects === true;
    });
    if (busy.length > 0) {
      const detail = busy
        .map(function (r) {
          const ac = r.traits.animation_count === null ? "n/a" : String(r.traits.animation_count);
          return r.url + " (animations=" + ac + ", scroll_effects=" + String(r.traits.scroll_effects) + ")";
        })
        .join("; ");
      warnings.push(
        'motion note "' + motion + '" reads static/minimal, but references are animated: ' + detail + "."
      );
    }
  }
  if (motion && dynamicWords.test(motion)) {
    // scroll_effects counts as motion evidence on BOTH branches: a scroll-driven
    // reference legitimately idles at animation_count=0 between scroll inputs.
    const allStill = withTraits.every(function (r) {
      return r.traits.animation_count === 0 && r.traits.scroll_effects !== true;
    });
    if (allStill) {
      warnings.push(
        'motion note "' + motion + '" promises choreography/scroll motion, but every captured reference is still (animation_count=0, no scroll effects): ' +
          withTraits.map(function (r) { return r.url; }).join("; ") + "."
      );
    }
  }

  const spacing = design_notes.spacing || "";
  const airyWords = /\b(airy|sparse|generous)\b/i;
  const denseWords = /\b(compact|dense)\b/i;
  const withDensity = withTraits.filter(function (r) { return typeof r.traits.text_density === "number"; });
  const fmtDensity = function (): string {
    return withDensity
      .map(function (r) { return r.url + " (text_density=" + (r.traits.text_density as number).toFixed(2) + ")"; })
      .join("; ");
  };
  if (spacing && airyWords.test(spacing) && withDensity.length > 0 &&
    withDensity.every(function (r) { return (r.traits.text_density as number) > 2.0; })) {
    warnings.push('spacing note "' + spacing + '" reads airy/sparse, but references are text-dense: ' + fmtDensity() + ".");
  }
  if (spacing && denseWords.test(spacing) && withDensity.length > 0 &&
    withDensity.every(function (r) { return (r.traits.text_density as number) < 0.5; })) {
    warnings.push('spacing note "' + spacing + '" reads compact/dense, but references are sparse: ' + fmtDensity() + ".");
  }

  return warnings;
}

function validateDesignNotes(raw: unknown, where: string): Record<string, string> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw new Error(where + " must be an object of {dimension: note} strings");
  const notes: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    const dimension = key.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(dimension)) {
      throw new Error(where + " keys must be short dimension names (typography, spacing, color, …): " + key);
    }
    const value = raw[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(where + "." + key + " must be a non-empty string");
    }
    if (Object.prototype.hasOwnProperty.call(notes, dimension)) {
      throw new Error(where + " has two keys that normalize to the same dimension: " + dimension);
    }
    notes[dimension] = value.trim();
  }
  return notes;
}

export function auditTaste(input: {
  profile: string | TasteProfile;
  html?: string;
  text?: string;
  page_issues?: PageIssueInput[];
  surface?: string;
  project?: string;
  binding?: SurfaceBinding | null;
  // Live PageTraits from capturePage(url, {collectTraits:true}) — enables
  // design_notes presence verification. In html mode, traits are extracted
  // statically from the html when this is omitted.
  traits?: PageTraits;
}): TasteAuditResult {
  const supplied = [input.html !== undefined, input.text !== undefined].filter(Boolean).length;
  if (supplied !== 1) throw new Error("Exactly one of html or text is required");

  const profile = typeof input.profile === "string" ? getTasteProfile(input.profile) : validateStoredProfile(input.profile, input.profile.name);
  const targetKind: "html" | "text" = input.html !== undefined ? "html" : "text";
  const target = input.html !== undefined ? input.html : input.text || "";
  const findings: TasteFinding[] = [];
  const notAssessed: { rule_id: string; reason: string }[] = [];
  const skippedOutOfScope: { rule_id: string; scope: string }[] = [];
  const disabledByBinding: { rule_id: string; severity: "off" }[] = [];
  const attachedIssueIndexes = new Set<number>();
  // undefined binding = "resolve from the project hint"; null = "already
  // resolved upstream, none found" (the url-mode handler resolves early so
  // delegate audits are filtered the same way).
  const binding = input.binding !== undefined
    ? input.binding
    : resolveSurfaceBinding(profile.name, { project: input.project });
  const explicitSurface = typeof input.surface === "string" && input.surface.trim().length > 0 ? input.surface : undefined;
  const surface = explicitSurface !== undefined ? explicitSurface : binding ? binding.surface : undefined;
  const surfaceProvided = surface !== undefined;
  const overrideById = new Map<string, TasteSeverity | "off">();
  if (binding) for (const override of binding.overrides) overrideById.set(override.rule_id, override.severity);

  for (const originalRule of profile.rules) {
    let rule = originalRule;
    const override = overrideById.get(rule.rule_id);
    if (override === "off") {
      disabledByBinding.push({ rule_id: rule.rule_id, severity: "off" });
      continue;
    }
    if (!ruleInScope(rule, surface)) {
      skippedOutOfScope.push({ rule_id: rule.rule_id, scope: rule.scope });
      continue;
    }
    if (override !== undefined) {
      // Calibrated severity from the surface binding beats the default AND
      // the no-surface demotion — the human already said how it reads here.
      rule = Object.assign({}, rule, { severity_default: override });
    } else {
      const scope = rule.scope.trim().toLowerCase();
      if (scope.length > 0 && scope !== "global" && !surfaceProvided && rule.severity_default === "block") {
        // Surface unstated: a scoped rule still runs, but may not apply to
        // whatever this artifact is — so it can nudge, never block.
        rule = Object.assign({}, rule, { severity_default: "warn" as TasteSeverity });
      }
    }
    if (rule.owner === "raven") {
      if (input.page_issues === undefined) {
        notAssessed.push({
          rule_id: rule.rule_id,
          reason: "delegated to " + rule.delegate_to + " — no delegated results supplied (url/html render required)",
        });
      } else {
        foldRavenRule(rule, input.page_issues, attachedIssueIndexes, findings);
      }
      continue;
    }
    auditTasteRule(rule, target, findings, notAssessed);
  }

  const ruleIds = new Set(profile.rules.map(function(rule) { return rule.rule_id; }));
  const concreteFindings = findings.filter(function(finding) {
    return ruleIds.has(finding.rule_id) && finding.evidence.trim().length > 0 && !HEDGING_RE.test(finding.evidence);
  });
  const suppressed: { rule_id: string; corpus_id: string; evidence: string }[] = [];
  const activeFindings: TasteFinding[] = [];
  for (const finding of concreteFindings) {
    const record = profile.corpus.find(function(corpusRecord) {
      // Evidence-scoped only: an accept suppresses the specific flagged pattern,
      // never sibling findings of the same rule elsewhere on the page.
      return corpusRecord.verdict === "accept" &&
        corpusRecord.violated_rule === finding.rule_id &&
        corpusRecord.wrong.trim().length > 0 &&
        normalizeText(finding.evidence).includes(normalizeText(corpusRecord.wrong));
    });
    if (record) {
      suppressed.push({ rule_id: finding.rule_id, corpus_id: record.id, evidence: finding.evidence });
    } else {
      activeFindings.push(finding);
    }
  }

  // Fidelity verification: when a binding carries design_notes and traits are
  // available (passed from a live capture, or extracted statically in html
  // mode), each note is VERIFIED against the artifact instead of only echoed.
  // The generated findings are engine findings — they skip the profile-rule
  // filter and corpus suppression above, but keep the hedging discipline and
  // COUNT toward the verdict.
  let noteAssessments: NoteAssessment[] | undefined = undefined;
  let fidelityFindings: TasteFinding[] | undefined = undefined;
  if (binding && Object.keys(binding.design_notes).length > 0) {
    let fidelityTraits = input.traits;
    if (fidelityTraits === undefined && targetKind === "html") fidelityTraits = extractStaticTraits(target);
    if (fidelityTraits !== undefined) {
      noteAssessments = assessDesignNotes(binding.design_notes, fidelityTraits);
      const generated: TasteFinding[] = [];
      for (const noteAssessment of noteAssessments) {
        if (noteAssessment.status !== "missing") continue;
        const noteText = binding.design_notes[noteAssessment.key] || "";
        // warn by default; block only when a NAMED library (three.js/gsap/
        // lottie) or a branded loader is wholly absent — those are the notes
        // builders silently drop.
        const escalate =
          (noteAssessment.key === "libraries" && /\b(three(\.?js)?|3js|gsap|lottie)\b/i.test(noteText)) ||
          (noteAssessment.key === "loading" && /\bbranded\b/i.test(noteText));
        generated.push({
          rule_id: "NOTE-" + noteAssessment.key,
          clause_cited: noteText,
          severity: escalate ? "block" : "warn",
          owner: "taste",
          source: "raven",
          evidence: noteAssessment.evidence,
          fix: "Make the " + noteAssessment.key + " note visibly true in the artifact, or report to the user which notes were dropped and why — design_notes are acceptance criteria, not mood words.",
        });
      }
      const restraint = restraintGuard(fidelityTraits);
      if (restraint !== null) generated.push(restraint);
      if (binding.references && binding.references.length > 0) {
        for (const delta of referenceDeltas(fidelityTraits, binding.references)) generated.push(delta);
      }
      fidelityFindings = generated.filter(function(finding) {
        return finding.evidence.trim().length > 0 && !HEDGING_RE.test(finding.evidence);
      });
    }
  }

  const countable = fidelityFindings === undefined ? activeFindings : activeFindings.concat(fidelityFindings);
  const blockCount = countable.filter(function(finding) { return finding.severity === "block"; }).length;
  const warnCount = countable.filter(function(finding) { return finding.severity === "warn"; }).length;
  const verdict: "BLOCK" | "WARN" | "PASS" = blockCount > 0 ? "BLOCK" : warnCount > 0 ? "WARN" : "PASS";
  const verdict_line =
    verdict === "BLOCK" ? "Verdict: BLOCK (" + blockCount + " block, " + warnCount + " warn)" :
    verdict === "WARN" ? "Verdict: WARN (0 block, " + warnCount + " warn)" :
    "Verdict: PASS (no findings)";

  const hasScopedRules = profile.rules.some(function(rule) {
    const scope = rule.scope.trim().toLowerCase();
    return scope.length > 0 && scope !== "global";
  });
  const result: TasteAuditResult = {
    tool: "audit_taste",
    profile: profile.name,
    target: targetKind,
    findings: activeFindings,
    suppressed,
    not_assessed: notAssessed.filter(function(row) { return ruleIds.has(row.rule_id); }),
    skipped_out_of_scope: skippedOutOfScope,
    disabled_by_binding: disabledByBinding,
    binding: binding ? binding.project : "",
    surface_applied: surface || "",
    verdict,
    verdict_line,
  };
  if (binding && binding.voice_note.trim().length > 0) result.voice_note = binding.voice_note;
  if (binding && Object.keys(binding.design_notes).length > 0) result.design_notes = binding.design_notes;
  if (noteAssessments !== undefined) result.note_assessments = noteAssessments;
  if (fidelityFindings !== undefined) result.fidelity_findings = fidelityFindings;
  // Attach build recipes for any expensive technique named in the notes — this
  // does not need traits, so a failing audit ALWAYS carries the fix ammunition.
  if (binding && Object.keys(binding.design_notes).length > 0) {
    const hints = buildHints(binding.design_notes);
    if (hints.length > 0) result.build_hints = hints;
  }
  if (!surfaceProvided && !binding && hasScopedRules) {
    result.calibration_hint =
      "This profile has scope-tagged rules but no surface or binding was given — scoped block rules were demoted to warn. " +
      "For a new project, run get_taste_interview, ask the user the questions, and persist with bind_taste_surface; " +
      "then pass project:'<name>' (or audit a bound url host) so the calibration applies automatically.";
  }
  return result;
}

function validateProfileName(name: unknown): string {
  if (typeof name !== "string") throw new Error("profile name must be a string");
  if (!/^[a-z0-9][a-z0-9-_]{0,63}$/i.test(name)) {
    throw new Error("Invalid profile name: must match /^[a-z0-9][a-z0-9-_]{0,63}$/i and contain no path separators");
  }
  if (name.includes("/") || name.includes("\\")) throw new Error("Invalid profile name: path separators are not allowed");
  return name;
}

function profilePath(name: string): string {
  return join(tasteHome(), name + ".json");
}

function writeProfile(profile: TasteProfile): void {
  const home = tasteHome();
  mkdirSync(home, { recursive: true });
  writeFileSync(profilePath(profile.name), JSON.stringify(profile, null, 2) + "\n", "utf8");
}

function validateRule(rule: unknown, where: string): TasteRule {
  if (!isRecord(rule)) throw new Error(where + " must be an object");
  const ruleId = readNonEmptyString(rule, "rule_id", where);
  const clauseText = readString(rule, "clause_text", where);
  const category = readString(rule, "category", where);
  const severity = rule.severity_default;
  if (!isSeverity(severity)) throw new Error(where + ".severity_default must be one of block, warn, nit");
  const owner = rule.owner === undefined ? "taste" : rule.owner;
  if (owner !== "taste" && owner !== "raven") throw new Error(where + ".owner must be taste or raven");
  const negativePrompt = optionalString(rule.negative_prompt);
  const delegateTo = optionalString(rule.delegate_to);
  const scope = optionalString(rule.scope);
  if (owner === "raven" && delegateTo.trim().length === 0) {
    throw new Error(where + ".delegate_to is required when owner is raven");
  }
  return {
    rule_id: ruleId,
    clause_text: clauseText,
    category,
    severity_default: severity,
    negative_prompt: negativePrompt,
    owner,
    delegate_to: delegateTo,
    scope,
  };
}

function validateStoredProfile(raw: unknown, expectedName: string): TasteProfile {
  if (!isRecord(raw)) throw new Error("Stored taste profile must be an object");
  const name = validateProfileName(raw.name);
  if (name !== expectedName) throw new Error("Stored taste profile name does not match file name: " + expectedName);
  if (raw.version !== 1) throw new Error("Stored taste profile version must be 1");
  const createdAt = readString(raw, "created_at", "profile");
  const updatedAt = readString(raw, "updated_at", "profile");
  if (!Array.isArray(raw.rules)) throw new Error("Stored taste profile rules must be an array");
  const rules: TasteRule[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.rules.length; i += 1) {
    const rule = validateRule(raw.rules[i], "profile.rules[" + i + "]");
    if (seen.has(rule.rule_id)) throw new Error("duplicate rule_id: " + rule.rule_id);
    seen.add(rule.rule_id);
    rules.push(rule);
  }
  if (!Array.isArray(raw.corpus)) throw new Error("Stored taste profile corpus must be an array");
  const ruleIds = new Set(rules.map(function(rule) { return rule.rule_id; }));
  const corpus = raw.corpus.map(function(record, index) {
    return validateCorpusRecord(record, ruleIds, "profile.corpus[" + index + "]");
  });
  return { name, version: 1, created_at: createdAt, updated_at: updatedAt, rules, corpus };
}

function validateCorpusRecord(record: unknown, ruleIds: Set<string>, where: string): TasteCorpusRecord {
  if (!isRecord(record)) throw new Error(where + " must be an object");
  const verdict = record.verdict;
  if (verdict !== "accept" && verdict !== "revise" && verdict !== "reject") {
    throw new Error(where + ".verdict must be accept, revise, or reject");
  }
  const severity = record.severity;
  if (!(severity === "" || isSeverity(severity))) throw new Error(where + ".severity must be block, warn, nit, or empty string");
  const violatedRule = readString(record, "violated_rule", where);
  if (violatedRule !== "" && !ruleIds.has(violatedRule)) {
    throw new Error(where + ".violated_rule does not exist in profile.rules: " + violatedRule);
  }
  return {
    artifact: readString(record, "artifact", where),
    verdict,
    violated_rule: violatedRule,
    severity,
    wrong: readString(record, "wrong", where),
    right: readString(record, "right", where),
    id: readNonEmptyString(record, "id", where),
    labeled_at: readNonEmptyString(record, "labeled_at", where),
  };
}

function validateLabelInput(
  rec: { artifact: string; verdict: string; violated_rule: string; severity: string; wrong: string; right: string },
  ruleIds: Set<string>,
  nextIndex: number
): TasteCorpusRecord {
  if (!CORPUS_VERDICTS.includes(rec.verdict)) throw new Error("verdict must be accept, revise, or reject");
  if (!(rec.severity === "" || isSeverity(rec.severity))) throw new Error("severity must be block, warn, nit, or empty string");
  if (rec.violated_rule !== "" && !ruleIds.has(rec.violated_rule)) {
    throw new Error("violated_rule does not exist in profile.rules: " + rec.violated_rule);
  }
  return {
    artifact: String(rec.artifact),
    verdict: rec.verdict as "accept" | "revise" | "reject",
    violated_rule: String(rec.violated_rule),
    severity: rec.severity as TasteSeverity | "",
    wrong: String(rec.wrong),
    right: String(rec.right),
    id: "rec_" + String(nextIndex).padStart(4, "0"),
    labeled_at: new Date().toISOString(),
  };
}

function parseMarkdownRules(markdown: string, existingRuleIds: Set<string>): TasteRule[] {
  const rules: TasteRule[] = [];
  const localIds = new Set(existingRuleIds);
  let category = "general";
  let fenceMarker: "" | "```" | "~~~" = "";
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    // Bullets inside fenced code blocks are examples, not rules.
    // A fence only closes on the same marker family that opened it.
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const marker = fence[1] as "```" | "~~~";
      if (fenceMarker === "") fenceMarker = marker;
      else if (fenceMarker === marker) fenceMarker = "";
      continue;
    }
    if (fenceMarker !== "") continue;
    const heading = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      category = categoryFromHeading(heading[2]);
      continue;
    }
    const bullet = /^\s*-\s+(.+?)\s*$/.exec(line);
    if (!bullet) continue;

    let clause = bullet[1].trim();
    let severity: TasteSeverity = "warn";
    const severityMatch = /\((block|warn|nit)\)/i.exec(clause);
    if (severityMatch) {
      severity = severityMatch[1].toLowerCase() as TasteSeverity;
      clause = clause.replace(severityMatch[0], "").replace(/\s+/g, " ").trim();
    }

    let owner: "taste" | "raven" = "taste";
    let delegateTo = "";
    const ownerMatch = /\(raven:([a-z0-9_-]+)\)/i.exec(clause);
    if (ownerMatch) {
      owner = "raven";
      delegateTo = ownerMatch[1];
      clause = clause.replace(ownerMatch[0], "").replace(/\s+/g, " ").trim();
    }

    let scope = "";
    const scopeMatch = /\(scope:([a-z0-9_-]+)\)/i.exec(clause);
    if (scopeMatch) {
      scope = scopeMatch[1].toLowerCase();
      clause = clause.replace(scopeMatch[0], "").replace(/\s+/g, " ").trim();
    }

    const negativePrompt = extractNegativePrompt(clause);
    const baseId = category.toUpperCase() + "-" + slugFromSignificantWords(clause);
    const ruleId = uniqueRuleId(baseId, localIds);
    localIds.add(ruleId);
    rules.push({
      rule_id: ruleId,
      clause_text: clause,
      category,
      severity_default: severity,
      negative_prompt: negativePrompt,
      owner,
      delegate_to: delegateTo,
      scope,
    });
  }

  return rules;
}

function singular(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function normalizedTokens(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of tokenize(value)) tokens.add(singular(token));
  return tokens;
}

function foldRavenRule(
  rule: TasteRule,
  pageIssues: PageIssueInput[],
  attachedIssueIndexes: Set<number>,
  findings: TasteFinding[]
): void {
  const ruleTokens = normalizedTokens(
    rule.rule_id + " " + rule.clause_text + " " + rule.negative_prompt + " " + rule.delegate_to
  );
  const delegateTokens = normalizedTokens(rule.delegate_to);
  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < pageIssues.length; i += 1) {
    if (attachedIssueIndexes.has(i)) continue;
    const issue = pageIssues[i];
    // Ownership evidence, strongest first:
    // (a) the issue's namespace names the tool domain this rule delegates to
    //     ("contrast/aa" belongs to the rule that delegates to audit_contrast) — even a
    //     terse issue message can't hide that; or
    // (b) the issue's rule name shares vocabulary with the taste rule AND total overlap
    //     clears a threshold — overlap on message words alone is not evidence the issue
    //     belongs to this rule, and a misattributed issue is a false positive.
    let delegateDomainMatch = false;
    for (const nsToken of normalizedTokens(issue.rule.split("/")[0])) {
      if (delegateTokens.has(nsToken)) { delegateDomainMatch = true; break; }
    }
    let ruleNameMatches = false;
    for (const nameToken of normalizedTokens(issue.rule)) {
      if (ruleTokens.has(nameToken)) { ruleNameMatches = true; break; }
    }
    if (!delegateDomainMatch && !ruleNameMatches) continue;
    let score = 0;
    for (const token of normalizedTokens(issue.rule + " " + issue.message)) {
      if (ruleTokens.has(token)) score += 1;
    }
    if (!delegateDomainMatch && score < 2) continue;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return;

  attachedIssueIndexes.add(bestIndex);
  const issue = pageIssues[bestIndex];
  // Only a hard "error" issue earns the rule's full severity; anything else — advisory
  // "warning" or an unrecognized severity string from an external caller — caps at warn,
  // so a suggestion can never surface as a block.
  const severity: TasteSeverity =
    issue.severity !== "error" && rule.severity_default === "block" ? "warn" : rule.severity_default;
  findings.push({
    rule_id: rule.rule_id,
    clause_cited: rule.clause_text,
    severity,
    owner: rule.owner,
    source: "raven",
    evidence: issue.rule + ": " + issue.message,
    fix: issue.fix || fixFromNegativePrompt(rule.negative_prompt),
  });
}

function auditTasteRule(
  rule: TasteRule,
  target: string,
  findings: TasteFinding[],
  notAssessed: { rule_id: string; reason: string }[]
): void {
  const trigger = (rule.clause_text + " " + rule.negative_prompt).toLowerCase();
  let assessed = false;

  if (/gradient/.test(trigger)) {
    assessed = true;
    for (const match of matchAllWithLine(target, /(linear|radial|conic)-gradient\s*\(/gi)) {
      findings.push(makeFinding(rule, "taste", match.snippet));
    }
  }

  if (/glow|neon/.test(trigger)) {
    assessed = true;
    for (const match of detectGlow(target)) {
      findings.push(makeFinding(rule, "taste", match));
    }
  }

  if (/second hue|one accent|single accent/.test(trigger)) {
    assessed = true;
    const evidence = detectSecondHue(target);
    if (evidence !== "") findings.push(makeFinding(rule, "taste", evidence));
  }

  if (/faux|synthetic/.test(trigger)) {
    notAssessed.push({ rule_id: rule.rule_id, reason: "faux-font detection requires rendered font metrics" });
    return;
  }

  const bannedTerms = extractBannedTerms(rule.negative_prompt + " " + rule.clause_text);
  if (bannedTerms.length > 0) {
    assessed = true;
    const stripped = stripHtml(target);
    for (const evidence of detectBannedTerms(stripped, bannedTerms).slice(0, 5)) {
      findings.push(makeFinding(rule, "taste", evidence));
    }
  }

  if (!assessed) {
    notAssessed.push({
      rule_id: rule.rule_id,
      reason: "no deterministic detector for this clause — requires judgment (use an LLM layer such as a design-judge skill)",
    });
  }
}

function makeFinding(rule: TasteRule, source: "taste" | "raven", evidence: string): TasteFinding {
  return {
    rule_id: rule.rule_id,
    clause_cited: rule.clause_text,
    severity: rule.severity_default,
    owner: rule.owner,
    source,
    evidence,
    fix: fixFromNegativePrompt(rule.negative_prompt),
  };
}

function detectGlow(target: string): string[] {
  const findings: string[] = [];
  const re = /\b(?:box-shadow|text-shadow)\s*:\s*([^;}{]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(target)) !== null) {
    const declaration = match[0];
    const value = match[1];
    if (!hasGlowColor(value)) continue;
    const blurRadii = Array.from(value.matchAll(/(?:^|[\s,(])(-?\d+(?:\.\d+)?)px\b/gi)).map(function(px) {
      return Number(px[1]);
    });
    const maxBlur = blurRadii.length >= 3 ? Math.max.apply(null, blurRadii.slice(2)) : Math.max.apply(null, blurRadii);
    if (Number.isFinite(maxBlur) && maxBlur >= 16) {
      findings.push(snippetAround(target, match.index, declaration.length));
    }
  }
  return findings;
}

function hasGlowColor(value: string): boolean {
  const lower = value.toLowerCase();
  if (/\btransparent\b/.test(lower)) return false;
  if (/rgba?\(\s*0\s*,\s*0\s*,\s*0(?:\s*,\s*(?:0|0?\.\d+))?\s*\)/.test(lower)) return false;
  if (/#(?:000|000000|00000000)\b/i.test(value)) return false;
  // Only an EXPLICIT color counts — a colorless shadow (currentColor/var())
  // cannot be judged statically, and silence beats a speculative glow flag.
  if (/#[0-9a-f]{3,8}\b/i.test(value)) return true;
  if (/rgba?\(|hsla?\(/.test(lower)) return true;
  return /\b(?:dark|light|medium|pale|deep|hot|dodger|royal|slate|sky|lawn|forest|sea|spring|midnight|rebecca|powder|steel|cadet|cornflower|sandy|rosy|indian|fire)?(white|red|blue|green|cyan|magenta|yellow|orange|purple|pink|lime|aqua|fuchsia|gold|goldenrod|violet|indigo|teal|crimson|coral|salmon|turquoise|chartreuse|tomato|orchid|plum|khaki|lavender|brick|brown)\b/.test(lower);
}

function detectSecondHue(target: string): string {
  const colorValues = extractColors(target);
  const chromatic = colorValues
    .map(function(value) { return { value, hsl: colorToHsl(value) }; })
    .filter(function(row): row is { value: string; hsl: { h: number; s: number; l: number } } {
      return row.hsl !== null && row.hsl.s >= 0.25 && row.hsl.l > 0.08 && row.hsl.l < 0.97;
    });

  const clusters: Array<{ hue: number; values: string[] }> = [];
  for (const row of chromatic) {
    const existing = clusters.find(function(cluster) {
      return hueDistance(cluster.hue, row.hsl.h) <= 40;
    });
    if (existing) {
      if (!existing.values.includes(row.value)) existing.values.push(row.value);
    } else {
      clusters.push({ hue: row.hsl.h, values: [row.value] });
    }
  }
  if (clusters.length < 2) return "";
  return "color hue clusters: " + clusters.map(function(cluster) {
    return cluster.values[0] + " at " + Math.round(cluster.hue) + "deg";
  }).join("; ");
}

function extractColors(target: string): string[] {
  const matches: string[] = [];
  const re = /#[0-9a-f]{3,8}\b|rgba?\(\s*[^)]+\)|hsla?\(\s*[^)]+\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(target)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

function colorToHsl(value: string): { h: number; s: number; l: number } | null {
  const lower = value.toLowerCase();
  if (lower.startsWith("#")) return hexToHsl(lower);
  if (lower.startsWith("rgb")) return rgbToHslFromString(lower);
  if (lower.startsWith("hsl")) return hslFromString(lower);
  return null;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  let raw = hex.slice(1);
  if (raw.length === 3 || raw.length === 4) {
    raw = raw.split("").map(function(ch) { return ch + ch; }).join("");
  }
  if (raw.length !== 6 && raw.length !== 8) return null;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return rgbToHsl(r, g, b);
}

function rgbToHslFromString(value: string): { h: number; s: number; l: number } | null {
  const parts = value.match(/-?\d+(?:\.\d+)?%?/g);
  if (!parts || parts.length < 3) return null;
  const nums = parts.slice(0, 3).map(function(part) {
    return part.endsWith("%") ? Math.round(Number(part.slice(0, -1)) * 2.55) : Number(part);
  });
  return rgbToHsl(nums[0], nums[1], nums[2]);
}

function hslFromString(value: string): { h: number; s: number; l: number } | null {
  const parts = value.match(/-?\d+(?:\.\d+)?%?/g);
  if (!parts || parts.length < 3) return null;
  return {
    h: ((Number(parts[0]) % 360) + 360) % 360,
    s: Number(parts[1].replace("%", "")) / 100,
    l: Number(parts[2].replace("%", "")) / 100,
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = Math.max(0, Math.min(255, r)) / 255;
  const gn = Math.max(0, Math.min(255, g)) / 255;
  const bn = Math.max(0, Math.min(255, b)) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

// A comma-list is only a banned-word list when the sentence introducing it is about
// vocabulary ("Never use persuasion verbs (proven, shipped)"). Lists that merely
// enumerate what a prohibition applies to ("project facts (counts, scope)") are
// descriptive examples — scanning a page for those words is a false-positive storm.
const VOCAB_CUE_RE = /\b(use|using|say|saying|write|writing|word|words|term|terms|verb|verbs|phrase|phrases|language|copy|vocabulary)\b/i;

function isVocabularyList(text: string, listIndex: number): boolean {
  // Dots inside abbreviations are not sentence boundaries.
  const before = text.slice(0, listIndex).replace(/\b(e\.g\.|i\.e\.|etc\.|vs\.)/gi, function(abbr) {
    return abbr.replace(/\./g, " ");
  });
  const boundary = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"));
  const sentence = before.slice(boundary + 1);
  return VOCAB_CUE_RE.test(sentence);
}

function extractBannedTerms(text: string): string[] {
  const terms: string[] = [];
  const parenList = /\(([^()]*,[^()]*)\)/g;
  let parenMatch: RegExpExecArray | null;
  while ((parenMatch = parenList.exec(text)) !== null) {
    if (!isVocabularyList(text, parenMatch.index)) continue;
    const pieces = parenMatch[1].split(",").map(cleanTerm).filter(function(term) { return term.length >= 3; });
    if (pieces.length >= 2) terms.push(...pieces);
  }

  const quotedList = /["“]([^"”]*,[^"”]*)["”]/g;
  let quoteMatch: RegExpExecArray | null;
  while ((quoteMatch = quotedList.exec(text)) !== null) {
    if (!isVocabularyList(text, quoteMatch.index)) continue;
    const pieces = quoteMatch[1].split(",").map(cleanTerm).filter(function(term) { return term.length >= 3; });
    if (pieces.length >= 2) terms.push(...pieces);
  }

  return Array.from(new Set(terms));
}

function cleanTerm(term: string): string {
  return term.replace(/^[\s'"“”‘’`]+|[\s'"“”‘’`.]+$/g, "").trim();
}

function detectBannedTerms(target: string, terms: string[]): string[] {
  const findings: string[] = [];
  for (const term of terms) {
    const re = new RegExp("\\b" + escapeRegExp(term) + "\\b", "i");
    const match = re.exec(target);
    if (!match) continue;
    const start = Math.max(0, match.index - 30);
    const end = Math.min(target.length, match.index + term.length + 30);
    findings.push("term \"" + term + "\": " + target.slice(start, end).replace(/\s+/g, " ").trim());
  }
  return findings;
}

function matchAllWithLine(target: string, re: RegExp): Array<{ snippet: string }> {
  const matches: Array<{ snippet: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(target)) !== null) {
    matches.push({ snippet: snippetAround(target, match.index, match[0].length) });
  }
  return matches;
}

function snippetAround(target: string, index: number, length: number): string {
  const line = target.slice(0, index).split(/\r?\n/).length;
  const start = Math.max(0, index - 45);
  const end = Math.min(target.length, index + length + 45);
  return "line " + line + ": " + target.slice(start, end).replace(/\s+/g, " ").trim();
}

function stripHtml(target: string): string {
  return target.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string): Set<string> {
  const tokens = new Set<string>();
  const matches = value.toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const token of matches) {
    if (token.length >= 3 && !STOPWORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

const HEADING_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "for", "from", "has", "have",
  "how", "in", "into", "is", "it", "its", "not", "of", "on", "or", "our", "the", "then", "there",
  "these", "this", "that", "those", "to", "use", "we", "what", "when", "where", "who", "why",
  "with", "you", "your",
]);

function categoryFromHeading(heading: string): string {
  // "### Why it works" must not become category "why" — take the first content word.
  const words = heading.toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const word of words) {
    if (!HEADING_STOPWORDS.has(word)) return word;
  }
  return "general";
}

function slugFromSignificantWords(value: string): string {
  const words = (value.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(function(word) { return word.length >= 3 && !STOPWORDS.has(word); })
    .slice(0, 6);
  return words.length > 0 ? words.join("-") : "rule";
}

function uniqueRuleId(baseId: string, seen: Set<string>): string {
  let candidate = baseId;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = baseId + "-" + suffix;
    suffix += 1;
  }
  return candidate;
}

function extractNegativePrompt(clause: string): string {
  const match = /\b(Do NOT|Never)\b[^.?!]*(?:[.?!]|$)/i.exec(clause);
  return match ? match[0].trim() : "";
}

function fixFromNegativePrompt(negativePrompt: string): string {
  if (negativePrompt.trim().length === 0) return "";
  return negativePrompt.replace(/\bDo NOT\b/i, "Avoid").replace(/\bNever\b/i, "Avoid").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, where: string): string {
  if (typeof record[key] !== "string") throw new Error(where + "." + key + " must be a string");
  return record[key];
}

function readNonEmptyString(record: Record<string, unknown>, key: string, where: string): string {
  const value = readString(record, key, where);
  if (value.trim().length === 0) throw new Error(where + "." + key + " must be non-empty");
  return value;
}

function optionalString(value: unknown): string {
  return value === undefined ? "" : String(value);
}

function isSeverity(value: unknown): value is TasteSeverity {
  return typeof value === "string" && SEVERITIES.includes(value as TasteSeverity);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
