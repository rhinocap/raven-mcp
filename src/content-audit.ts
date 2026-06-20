/**
 * content-audit.ts — per-item content quality audit.
 *
 * auditContent() evaluates an array of content items (headings, prose, CTAs,
 * labels, captions, metrics, outcomes) against loaded UX-writing principles
 * and lightweight deterministic heuristics. Returns a per-item verdict plus
 * an aggregate summary.
 *
 * Pure (no network, no browser) — fully unit-testable offline.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// At runtime __dirname is dist/; data lives in src/ alongside it.
// In both the tsc output (dist/) and any hypothetical ts-node run (src/),
// walk up one level to the package root then into src/data.
const PKG_ROOT = join(__dirname, "..");
const CONTENT_PRINCIPLES_DIR = join(PKG_ROOT, "src", "data", "content", "principles");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentItemType =
  | "prose"
  | "caption"
  | "heading"
  | "outcome"
  | "metric"
  | "cta"
  | "label";

export type ContentItem = {
  id?: string;
  type: ContentItemType;
  text: string;
};

export type ContentIssue = {
  principle: string;
  message: string;
};

export type ContentVerdict = "pass" | "warn" | "fail";

export type ContentItemResult = {
  id: string;
  type: ContentItemType;
  text: string;
  verdict: ContentVerdict;
  matched_principles: string[];
  issues: ContentIssue[];
  suggestion: string;
};

export type ContentAuditSummary = {
  total: number;
  pass: number;
  warn: number;
  fail: number;
};

export type ContentAuditResult = {
  items: ContentItemResult[];
  summary: ContentAuditSummary;
  principles_loaded: string[];
  system?: string;
  goals?: string[];
};

export type ContentAuditOptions = {
  /** Optional content-system id (informational; recorded in output). */
  system?: string;
  /** Optional design goals (informational; recorded in output). */
  goals?: string[];
};

// ---------------------------------------------------------------------------
// Principle shape (matches ux-writing.json schema)
// ---------------------------------------------------------------------------

type ContentPrinciple = {
  id: string;
  name: string;
  category: string;
  summary: string;
  description: string;
  implications: string[];
  violations: string[];
  applies_to: string[];
};

// ---------------------------------------------------------------------------
// Principle loader (cached, lazy)
// ---------------------------------------------------------------------------

let _principlesCache: ContentPrinciple[] | null = null;

const loadPrinciples = (): ContentPrinciple[] => {
  if (_principlesCache !== null) return _principlesCache;

  const principles: ContentPrinciple[] = [];

  if (!existsSync(CONTENT_PRINCIPLES_DIR)) {
    _principlesCache = principles;
    return principles;
  }

  const files = readdirSync(CONTENT_PRINCIPLES_DIR).filter((f) =>
    f.endsWith(".json")
  );

  for (const file of files) {
    try {
      const raw = readFileSync(join(CONTENT_PRINCIPLES_DIR, file), "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        principles.push(...(parsed as ContentPrinciple[]));
      } else {
        principles.push(parsed as ContentPrinciple);
      }
    } catch {
      // Skip malformed files
    }
  }

  _principlesCache = principles;
  return principles;
};

/** Exposed for testing — resets the lazy cache so tests can call with a clean state. */
export const _resetPrinciplesCache = (): void => {
  _principlesCache = null;
};

// ---------------------------------------------------------------------------
// Heuristic helpers
// ---------------------------------------------------------------------------

/** Returns true if the string contains a numeric quantity followed by a unit. */
const containsNumberWithUnit = (text: string): boolean => {
  // Matches patterns like: 3.2%, $1.2M, 42 users, 100ms, 2× faster
  return /\d+(\.\d+)?\s*(%|x|×|ms|s\b|px|k|K|M|B|\$|€|£|users?|items?|points?|steps?|days?|weeks?|months?|hours?|mins?|seconds?|fps|rpm|kg|lb|lbs|mi|km|calories?|kcal)/i.test(
    text
  );
};

/** Returns true if the text starts with an action verb (simple heuristic). */
const startsWithActionVerb = (text: string): boolean => {
  const actionVerbs = [
    "add", "apply", "book", "browse", "build", "buy", "cancel", "change",
    "check", "choose", "claim", "clear", "close", "complete", "confirm",
    "connect", "continue", "copy", "create", "customize", "delete", "download",
    "edit", "enable", "explore", "export", "find", "finish", "follow", "get",
    "go", "import", "install", "invite", "join", "launch", "learn", "log",
    "manage", "mark", "move", "open", "pay", "plan", "preview", "print",
    "publish", "read", "remove", "rename", "request", "reset", "restart",
    "review", "revoke", "run", "save", "schedule", "search", "select", "send",
    "set", "share", "show", "sign", "skip", "start", "stop", "submit",
    "switch", "sync", "try", "turn", "update", "upload", "use", "verify",
    "view", "watch", "write",
  ];
  const first = text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return actionVerbs.includes(first);
};

/** Word count. */
const wordCount = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

/** Passive voice signal phrases (be-verb + past participle patterns). */
const PASSIVE_PATTERNS = [
  /\bhas been\b/i,
  /\bhave been\b/i,
  /\bwas\b.{0,20}\b(processed|sent|received|created|deleted|updated|submitted|completed|approved|rejected|loaded|generated|triggered)\b/i,
  /\bwere\b.{0,20}\b(processed|sent|received|created|deleted|updated|submitted|completed|approved|rejected|loaded|generated|triggered)\b/i,
  /\bwill be\b/i,
  /\bcan be\b/i,
  /\bshould be\b/i,
  /\bmust be\b/i,
  /\bis being\b/i,
];

const containsPassiveVoice = (text: string): boolean =>
  PASSIVE_PATTERNS.some((p) => p.test(text));

/** Jargon / hedging signal words. */
const JARGON_WORDS = [
  "leverage", "synergy", "paradigm", "ecosystem", "holistic", "seamless",
  "robust", "scalable", "cutting-edge", "state-of-the-art", "best-in-class",
  "world-class", "innovative", "next-generation", "disruptive", "transformative",
  "empower", "unlock", "supercharge", "turbocharge", "streamline",
];

const HEDGE_WORDS = [
  "might", "may", "could", "perhaps", "possibly", "potentially",
  "arguably", "somewhat", "fairly", "quite", "rather", "pretty",
];

const containsJargon = (text: string): boolean => {
  const lower = text.toLowerCase();
  return JARGON_WORDS.some((w) => lower.includes(w));
};

const containsHedging = (text: string): boolean => {
  const words = text.toLowerCase().split(/\s+/);
  return HEDGE_WORDS.some((w) => words.includes(w));
};

/** Filler opener patterns (anti-front-load). */
const FILLER_OPENERS = [
  /^welcome to\b/i,
  /^introducing\b/i,
  /^let us help\b/i,
  /^how to\b/i,
  /^guide to\b/i,
  /^the future of\b/i,
  /^a look at\b/i,
  /^discover\b/i,
];

const startsWithFiller = (text: string): boolean =>
  FILLER_OPENERS.some((p) => p.test(text.trim()));

/** Generic / vague word patterns. */
const GENERIC_WORDS = [
  /\bsubmit\b/i,
  /\bclick here\b/i,
  /\blearn more\b/i,
  /\bsomething went wrong\b/i,
  /\bplease try again\b/i,
  /\ban error occurred\b/i,
  /\bno data\b/i,
  /\bnothing to show\b/i,
];

const containsGenericLanguage = (text: string): boolean =>
  GENERIC_WORDS.some((p) => p.test(text));

/** Check if two strings share ≥70% of words (caption ≅ heading duplication). */
const tokenOverlapRatio = (a: string, b: string): number => {
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (aWords.size === 0) return 0;
  let shared = 0;
  for (const w of aWords) {
    if (bWords.has(w)) shared++;
  }
  return shared / Math.max(aWords.size, bWords.size);
};

// ---------------------------------------------------------------------------
// Principle lookup helpers
// ---------------------------------------------------------------------------

const principleById = (
  principles: ContentPrinciple[],
  id: string
): ContentPrinciple | undefined => principles.find((p) => p.id === id);

const principleImplication = (p: ContentPrinciple, idx: number): string =>
  p.implications[idx] ?? p.summary;

// ---------------------------------------------------------------------------
// Per-type audit logic
// ---------------------------------------------------------------------------

type AuditIssueAccumulator = {
  issues: ContentIssue[];
  matched: Set<string>;
};

const addIssue = (
  acc: AuditIssueAccumulator,
  principleId: string,
  message: string
): void => {
  acc.matched.add(principleId);
  acc.issues.push({ principle: principleId, message });
};

/** Audit a CTA or label item. */
const auditCta = (
  text: string,
  principles: ContentPrinciple[],
  acc: AuditIssueAccumulator
): void => {
  const wc = wordCount(text);

  if (wc > 4) {
    const p = principleById(principles, "front-load-meaning");
    addIssue(
      acc,
      "front-load-meaning",
      `CTA/label is ${wc} words — keep it ≤4. ${p ? principleImplication(p, 1) : ""}`
    );
  }

  if (!startsWithActionVerb(text)) {
    const p = principleById(principles, "front-load-meaning");
    addIssue(
      acc,
      "front-load-meaning",
      `CTA/label should begin with an action verb (e.g. "Save", "Send invoice"). ${p ? principleImplication(p, 1) : ""}`
    );
  }

  if (containsGenericLanguage(text)) {
    const p = principleById(principles, "be-specific-not-generic");
    addIssue(
      acc,
      "be-specific-not-generic",
      `Generic label detected. ${p ? principleImplication(p, 0) : "Replace with what the action does."}`
    );
  }
};

/** Audit a heading item. */
const auditHeading = (
  text: string,
  principles: ContentPrinciple[],
  acc: AuditIssueAccumulator
): void => {
  if (startsWithFiller(text)) {
    const p = principleById(principles, "front-load-meaning");
    addIssue(
      acc,
      "front-load-meaning",
      `Heading starts with filler ("${text.split(/\s+/).slice(0, 3).join(" ")}…"). ${p ? principleImplication(p, 0) : "Put the key noun or verb first."}`
    );
  }

  if (containsGenericLanguage(text)) {
    const p = principleById(principles, "be-specific-not-generic");
    addIssue(
      acc,
      "be-specific-not-generic",
      `Heading contains generic language. ${p ? principleImplication(p, 0) : "Be specific."}`
    );
  }

  if (containsJargon(text)) {
    const p = principleById(principles, "clarity-over-cleverness");
    addIssue(
      acc,
      "clarity-over-cleverness",
      `Heading uses jargon/buzzwords. ${p ? principleImplication(p, 1) : "Plain language is more trustworthy."}`
    );
  }
};

/** Audit a prose item. */
const auditProse = (
  text: string,
  principles: ContentPrinciple[],
  acc: AuditIssueAccumulator
): void => {
  if (containsPassiveVoice(text)) {
    const p = principleById(principles, "active-voice");
    addIssue(
      acc,
      "active-voice",
      `Passive voice detected. ${p ? principleImplication(p, 0) : "Rewrite to name who does the action."}`
    );
  }

  if (containsJargon(text)) {
    const p = principleById(principles, "clarity-over-cleverness");
    addIssue(
      acc,
      "clarity-over-cleverness",
      `Jargon/buzzwords detected (${JARGON_WORDS.filter((w) => text.toLowerCase().includes(w)).join(", ")}). ${p ? principleImplication(p, 1) : "Prefer plain language."}`
    );
  }

  if (containsHedging(text)) {
    const p = principleById(principles, "be-specific-not-generic");
    addIssue(
      acc,
      "be-specific-not-generic",
      `Hedging language detected. ${p ? principleImplication(p, 2) : "Be concrete and direct."}`
    );
  }

  if (wordCount(text) > 60) {
    const p = principleById(principles, "scannable-structure");
    addIssue(
      acc,
      "scannable-structure",
      `Prose block is long (${wordCount(text)} words). ${p ? principleImplication(p, 1) : "Break into shorter chunks of 3-5 lines."}`
    );
  }
};

/** Audit a metric item. Must contain a number + unit. */
const auditMetric = (
  text: string,
  principles: ContentPrinciple[],
  acc: AuditIssueAccumulator
): void => {
  if (!containsNumberWithUnit(text)) {
    const p = principleById(principles, "be-specific-not-generic");
    addIssue(
      acc,
      "be-specific-not-generic",
      `Metric must include a number and unit (e.g. "42 users", "3.2%", "$1.2M"). ${p ? principleImplication(p, 2) : "Replace vague quantifiers with exact values."}`
    );
  }
};

/** Audit an outcome item. Should be specific, not hedging. */
const auditOutcome = (
  text: string,
  principles: ContentPrinciple[],
  acc: AuditIssueAccumulator
): void => {
  if (containsHedging(text)) {
    const p = principleById(principles, "be-specific-not-generic");
    addIssue(
      acc,
      "be-specific-not-generic",
      `Outcome statement uses hedging language — outcomes should be confident and specific. ${p ? principleImplication(p, 0) : "State the result directly."}`
    );
  }
  if (containsPassiveVoice(text)) {
    const p = principleById(principles, "active-voice");
    addIssue(
      acc,
      "active-voice",
      `Outcome uses passive voice. ${p ? principleImplication(p, 0) : "Prefer active: 'We increased X' over 'X was increased'."}`
    );
  }
};

/** Audit a caption item. Should not duplicate headings found in the batch. */
const auditCaption = (
  text: string,
  _allItems: ContentItem[],
  principles: ContentPrinciple[],
  acc: AuditIssueAccumulator,
  headingTexts: string[]
): void => {
  for (const heading of headingTexts) {
    const overlap = tokenOverlapRatio(text, heading);
    if (overlap >= 0.7) {
      const p = principleById(principles, "scannable-structure");
      addIssue(
        acc,
        "scannable-structure",
        `Caption duplicates a heading (≥70% word overlap with "${heading.slice(0, 50)}"). ${p ? principleImplication(p, 3) : "Captions should add context, not repeat the heading."}`
      );
      break;
    }
  }

  if (wordCount(text) > 25) {
    const p = principleById(principles, "scannable-structure");
    addIssue(
      acc,
      "scannable-structure",
      `Caption is long (${wordCount(text)} words) — captions should be concise. ${p ? principleImplication(p, 1) : "Keep captions under 25 words."}`
    );
  }
};

// ---------------------------------------------------------------------------
// Suggestion builder
// ---------------------------------------------------------------------------

const buildSuggestion = (
  item: ContentItem,
  issues: ContentIssue[]
): string => {
  if (issues.length === 0) return "";

  const text = item.text;
  const type = item.type;

  // Produce a concrete before → after hint based on the first/primary issue
  const firstPrinciple = issues[0]?.principle ?? "";

  switch (firstPrinciple) {
    case "active-voice": {
      // Try to flip common passive constructions
      let suggestion = text
        .replace(/\bhas been received\b/gi, "we received")
        .replace(/\bhas been sent\b/gi, "we sent")
        .replace(/\bhas been submitted\b/gi, "we received")
        .replace(/\bwill be processed\b/gi, "we will process")
        .replace(/\bcan be\b/gi, "you can");
      if (suggestion === text) suggestion = text + " → [rewrite: name who does the action]";
      return `Before: "${text.slice(0, 60)}" → After: "${suggestion.slice(0, 80)}"`;
    }
    case "be-specific-not-generic": {
      if (type === "metric") {
        return `Before: "${text}" → After: include a number + unit, e.g. "${text} — 42 users" or rewrite as "Saved 3.2 hours/week"`;
      }
      if (type === "cta" || type === "label") {
        return `Before: "${text}" → After: describe the specific action, e.g. "Submit" → "Send invoice" or "Continue" → "Save and continue"`;
      }
      return `Before: "${text.slice(0, 60)}" → After: replace vague terms with concrete, measurable language`;
    }
    case "front-load-meaning": {
      if (type === "cta" || type === "label") {
        const firstWord = text.trim().split(/\s+/)[0] ?? "";
        return `Before: "${text}" → After: lead with an action verb. "${firstWord}" may not be an action — try "Save ${text}", "Send ${text}", or name what happens.`;
      }
      const withoutFiller = text.replace(/^(welcome to|introducing|how to|guide to|the future of|let us help you)\s+/i, "");
      return `Before: "${text}" → After: "${withoutFiller.charAt(0).toUpperCase() + withoutFiller.slice(1)}"`;
    }
    case "clarity-over-cleverness": {
      const foundJargon = JARGON_WORDS.find((w) => text.toLowerCase().includes(w));
      if (foundJargon) {
        return `Before: "${text.slice(0, 60)}" → After: replace "${foundJargon}" with a plain word (e.g. "leverage" → "use", "seamless" → "easy", "empower" → "help")`;
      }
      return `Before: "${text.slice(0, 60)}" → After: rewrite using plain, direct language`;
    }
    case "scannable-structure": {
      if (type === "caption") return `Caption duplicates the heading. Rewrite to add context: describe what the reader should notice, not the title.`;
      return `Before: "${text.slice(0, 60)}…" → After: break into ≤3 sentences or use a bullet list`;
    }
    default:
      return `Review against principle "${firstPrinciple}". Rewrite for clarity and directness.`;
  }
};

// ---------------------------------------------------------------------------
// Verdict scoring
// ---------------------------------------------------------------------------

const scoreVerdict = (issues: ContentIssue[]): ContentVerdict => {
  if (issues.length === 0) return "pass";
  // Passive voice + jargon + metric-without-number = fail
  const hardFailPrinciples = new Set(["be-specific-not-generic", "active-voice"]);
  const hasFail = issues.some((i) => hardFailPrinciples.has(i.principle));
  return hasFail ? "fail" : "warn";
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Audit an array of content items against loaded UX-writing principles.
 * Pure — no network, no Playwright, no side effects.
 */
export const auditContent = (
  items: ContentItem[],
  opts: ContentAuditOptions = {}
): ContentAuditResult => {
  const principles = loadPrinciples();
  const principlesLoaded = principles.map((p) => p.id);

  // Collect heading texts for caption duplication check
  const headingTexts = items
    .filter((i) => i.type === "heading")
    .map((i) => i.text);

  const itemResults: ContentItemResult[] = items.map((item, idx) => {
    const itemId = item.id ?? `item_${idx}`;
    const text = item.text ?? "";

    const acc: AuditIssueAccumulator = { issues: [], matched: new Set() };

    switch (item.type) {
      case "cta":
      case "label":
        auditCta(text, principles, acc);
        break;
      case "heading":
        auditHeading(text, principles, acc);
        break;
      case "prose":
        auditProse(text, principles, acc);
        break;
      case "metric":
        auditMetric(text, principles, acc);
        break;
      case "outcome":
        auditOutcome(text, principles, acc);
        break;
      case "caption":
        auditCaption(text, items, principles, acc, headingTexts);
        break;
    }

    const verdict = scoreVerdict(acc.issues);
    const suggestion = buildSuggestion(item, acc.issues);

    return {
      id: itemId,
      type: item.type,
      text,
      verdict,
      matched_principles: Array.from(acc.matched),
      issues: acc.issues,
      suggestion,
    };
  });

  const summary: ContentAuditSummary = {
    total: itemResults.length,
    pass: itemResults.filter((r) => r.verdict === "pass").length,
    warn: itemResults.filter((r) => r.verdict === "warn").length,
    fail: itemResults.filter((r) => r.verdict === "fail").length,
  };

  return {
    items: itemResults,
    summary,
    principles_loaded: principlesLoaded,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.goals ? { goals: opts.goals } : {}),
  };
};
