import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type TasteSeverity = "block" | "warn" | "nit";
export type TasteRule = {
  rule_id: string;
  clause_text: string;
  category: string;
  severity_default: TasteSeverity;
  negative_prompt: string;
  owner: "taste" | "raven";
  delegate_to: string;
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
  verdict: "BLOCK" | "WARN" | "PASS";
  verdict_line: string;
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
    .filter(function(file) { return file.endsWith(".json"); })
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

export function auditTaste(input: {
  profile: string | TasteProfile;
  html?: string;
  text?: string;
  page_issues?: PageIssueInput[];
}): TasteAuditResult {
  const supplied = [input.html !== undefined, input.text !== undefined].filter(Boolean).length;
  if (supplied !== 1) throw new Error("Exactly one of html or text is required");

  const profile = typeof input.profile === "string" ? getTasteProfile(input.profile) : validateStoredProfile(input.profile, input.profile.name);
  const targetKind: "html" | "text" = input.html !== undefined ? "html" : "text";
  const target = input.html !== undefined ? input.html : input.text || "";
  const findings: TasteFinding[] = [];
  const notAssessed: { rule_id: string; reason: string }[] = [];
  const attachedIssueIndexes = new Set<number>();

  for (const rule of profile.rules) {
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

  const blockCount = activeFindings.filter(function(finding) { return finding.severity === "block"; }).length;
  const warnCount = activeFindings.filter(function(finding) { return finding.severity === "warn"; }).length;
  const verdict: "BLOCK" | "WARN" | "PASS" = blockCount > 0 ? "BLOCK" : warnCount > 0 ? "WARN" : "PASS";
  const verdict_line =
    verdict === "BLOCK" ? "Verdict: BLOCK (" + blockCount + " block, " + warnCount + " warn)" :
    verdict === "WARN" ? "Verdict: WARN (0 block, " + warnCount + " warn)" :
    "Verdict: PASS (no findings)";

  return {
    tool: "audit_taste",
    profile: profile.name,
    target: targetKind,
    findings: activeFindings,
    suppressed,
    not_assessed: notAssessed.filter(function(row) { return ruleIds.has(row.rule_id); }),
    verdict,
    verdict_line,
  };
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
  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < pageIssues.length; i += 1) {
    if (attachedIssueIndexes.has(i)) continue;
    const issue = pageIssues[i];
    // The issue's rule name (e.g. "tokens/no-bare-hex") must share vocabulary with the
    // taste rule itself — overlap on message words alone is not evidence the issue
    // belongs to this rule, and a misattributed issue is a false positive (prefer silence).
    let ruleNameMatches = false;
    for (const nameToken of normalizedTokens(issue.rule)) {
      if (ruleTokens.has(nameToken)) { ruleNameMatches = true; break; }
    }
    if (!ruleNameMatches) continue;
    let score = 0;
    for (const token of normalizedTokens(issue.rule + " " + issue.message)) {
      if (ruleTokens.has(token)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || bestScore < 2) return;

  attachedIssueIndexes.add(bestIndex);
  const issue = pageIssues[bestIndex];
  // An advisory page issue must not surface as a block: cap at the issue's own weight.
  const severity: TasteSeverity =
    issue.severity === "warning" && rule.severity_default === "block" ? "warn" : rule.severity_default;
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
