import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DecisionNode {
  node_kind: "decision";
  id: string;
  statement: string;
  rationale: string | null;
  rationale_trust?: "extracted" | "confirmed" | null;
  rationale_missing: boolean;
  scope: string;
  component_ref: string;
  alternatives_rejected: string[];
  status: "active" | "superseded" | "contested";
  superseded_by: string | null;
  created_at: string;
  embedding?: number[] | null;
}

export interface EvidenceNode {
  node_kind: "evidence";
  id: string;
  type: "quant" | "qual";
  source_ref: string;
  result_summary: string;
  confidence: number;
  confounds: string[];
  timestamp: string;
}

export interface SourceNode {
  node_kind: "source";
  id: string;
  kind: string;
  ref: string;
  created_at: string;
}

export type GraphNode = DecisionNode | EvidenceNode | SourceNode;

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: "supersedes" | "scoped_alongside" | "supports" | "contradicts" | "derived_from";
  created_at: string;
}

export interface Embedder {
  embed(text: string): Promise<number[] | null>;
}

export class NullEmbedder implements Embedder {
  async embed(_text: string): Promise<number[] | null> {
    return null;
  }
}

export class LexicalEmbedder implements Embedder {
  private dimensions: number;

  constructor(dimensions: number = 256) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    var vector = new Array<number>(this.dimensions).fill(0);
    var tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(function(token) {
      return token.length >= 2;
    });
    for (var token of tokens) {
      var hash = 2166136261;
      for (var i = 0; i < token.length; i += 1) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      vector[(hash >>> 0) % this.dimensions] += 1;
    }
    var magnitude = Math.sqrt(vector.reduce(function(sum, value) {
      return sum + value * value;
    }, 0));
    if (magnitude === 0) return vector;
    return vector.map(function(value) { return value / magnitude; });
  }
}

export function cosineSimilarity(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  var dot = 0;
  var magnitudeA = 0;
  var magnitudeB = 0;
  for (var i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

export function similarityThreshold(): number {
  var parsed = parseFloat(process.env.RAVEN_DECISION_SIMILARITY_THRESHOLD || "");
  if (Number.isNaN(parsed)) return 0.8;
  return Math.max(0, Math.min(1, parsed));
}

export interface DecisionGraphStore {
  addNode(node: GraphNode): Promise<GraphNode>;
  getNode(id: string): Promise<GraphNode | null>;
  updateNode(id: string, patch: Partial<GraphNode>): Promise<GraphNode | null>;
  addEdge(edge: GraphEdge): Promise<GraphEdge>;
  listEdges(edgeType?: GraphEdge["type"]): Promise<GraphEdge[]>;
  neighbors(nodeId: string, edgeType?: GraphEdge["type"]): Promise<GraphNode[]>;
  listActiveDecisions(): Promise<DecisionNode[]>;
  listDecisions(status: DecisionNode["status"]): Promise<DecisionNode[]>;
  findSimilarActiveDecisions(node: DecisionNode, threshold: number, excludeId?: string): Promise<Array<{ decision: DecisionNode; similarity: number }>>;
}

export interface GapScanConfig {
  staleAfterDays: number;
  thinRationaleMinChars: number;
  weights: {
    coverage_gap: number;
    contested_with_evidence: number;
    contested: number;
    missing_rationale: number;
    thin_rationale: number;
    stale: number;
  };
}

export interface GapFinding {
  gap_type: "coverage_gap" | "missing_rationale" | "thin_rationale" | "contested" | "contested_with_evidence" | "stale";
  what: string;
  surfaced_by: string;
  decision_id: string | null;
  suggested_action: string;
  score: number;
}

function envNumber(name: string, fallback: number): number {
  var parsed = parseFloat(process.env[name] || "");
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function gapScanConfig(): GapScanConfig {
  return {
    staleAfterDays: envNumber("RAVEN_DECISION_STALE_DAYS", 90),
    thinRationaleMinChars: envNumber("RAVEN_DECISION_THIN_RATIONALE_CHARS", 20),
    weights: {
      coverage_gap: envNumber("RAVEN_GAP_WEIGHT_COVERAGE_GAP", 100),
      contested_with_evidence: envNumber("RAVEN_GAP_WEIGHT_CONTESTED_WITH_EVIDENCE", 90),
      contested: envNumber("RAVEN_GAP_WEIGHT_CONTESTED", 60),
      missing_rationale: envNumber("RAVEN_GAP_WEIGHT_MISSING_RATIONALE", 50),
      thin_rationale: envNumber("RAVEN_GAP_WEIGHT_THIN_RATIONALE", 40),
      stale: envNumber("RAVEN_GAP_WEIGHT_STALE", 30),
    },
  };
}

var USE_CASE_STOP_WORDS = new Set(["and", "for", "from", "into", "the", "this", "that", "use", "using", "with"]);

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(function(token) {
    return token.length >= 3 && !USE_CASE_STOP_WORDS.has(token);
  });
}

function decisionCovers(decision: DecisionNode, term: string): boolean {
  // Whole-token matching only — substring matching let "Discard" cover "Card".
  var haystackTokens = new Set(
    (decision.component_ref + " " + decision.statement).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  );
  var termTokens = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return termTokens.length > 0 && termTokens.every(function(token) { return haystackTokens.has(token); });
}

export async function scanGaps(
  store: DecisionGraphStore,
  opts: {
    use_cases?: string[];
    reference_components: Array<{ name: string; source: string; traffic?: "high" | "normal" }>;
    config: GapScanConfig;
  }
): Promise<GapFinding[]> {
  var findings: GapFinding[] = [];
  var active = await store.listActiveDecisions();
  var contested = await store.listDecisions("contested");
  var edges = await store.listEdges();
  var references = opts.reference_components.slice();
  for (var useCase of opts.use_cases || []) {
    for (var token of tokens(useCase)) {
      if (!references.some(function(reference) { return reference.name.toLowerCase() === token; })) {
        references.push({ name: token, source: useCase });
      }
    }
  }

  for (var reference of references) {
    if (!active.some(function(decision) { return decisionCovers(decision, reference.name); })) {
      findings.push({
        gap_type: "coverage_gap",
        what: "No active decision covers " + reference.name + ".",
        surfaced_by: reference.source,
        decision_id: null,
        suggested_action: "Draft a decision with decision_draft",
        score: opts.config.weights.coverage_gap * (reference.traffic === "high" ? 1.5 : 1),
      });
    }
  }

  for (var decision of active) {
    if (decision.rationale_missing) {
      findings.push({
        gap_type: "missing_rationale",
        what: "Decision has no rationale: " + decision.statement,
        surfaced_by: "graph",
        decision_id: decision.id,
        suggested_action: "Fill the why with decision_commit",
        score: opts.config.weights.missing_rationale,
      });
    } else if (decision.rationale !== null && decision.rationale.trim().length < opts.config.thinRationaleMinChars) {
      findings.push({
        gap_type: "thin_rationale",
        what: "Decision rationale is too thin: " + decision.statement,
        surfaced_by: "graph",
        decision_id: decision.id,
        suggested_action: "Expand the why with decision_commit",
        score: opts.config.weights.thin_rationale,
      });
    }

    var createdAt = new Date(decision.created_at).getTime();
    var ageDays = (Date.now() - createdAt) / (24 * 60 * 60 * 1000);
    var supersedesActivity = edges.some(function(edge) {
      return edge.type === "supersedes" && edge.to === decision.id && new Date(edge.created_at).getTime() >= createdAt;
    });
    if (Number.isFinite(createdAt) && ageDays > opts.config.staleAfterDays && !supersedesActivity) {
      findings.push({
        gap_type: "stale",
        what: "Decision is older than " + opts.config.staleAfterDays + " days: " + decision.statement,
        surfaced_by: "graph",
        decision_id: decision.id,
        suggested_action: "Review and supersede, scope, or reaffirm the decision",
        score: opts.config.weights.stale,
      });
    }
  }

  for (var decision of contested) {
    var evidenceConnected = false;
    for (var edge of edges) {
      if ((edge.type !== "supports" && edge.type !== "contradicts") || (edge.from !== decision.id && edge.to !== decision.id)) continue;
      var otherId = edge.from === decision.id ? edge.to : edge.from;
      var other = await store.getNode(otherId);
      if (other !== null && other.node_kind === "evidence") {
        evidenceConnected = true;
        break;
      }
    }
    findings.push({
      gap_type: evidenceConnected ? "contested_with_evidence" : "contested",
      what: "Decision is contested: " + decision.statement,
      surfaced_by: "graph",
      decision_id: decision.id,
      suggested_action: evidenceConnected ? "Review the attached evidence and resolve the decision" : "Run an experiment and attach evidence",
      score: evidenceConnected ? opts.config.weights.contested_with_evidence : opts.config.weights.contested,
    });
  }

  return findings.sort(function(a, b) { return b.score - a.score; });
}

export function buildGapDigest(findings: GapFinding[]): { actionable: boolean; summary: string; findings: GapFinding[] } {
  if (findings.length === 0) {
    return { actionable: false, summary: "Decision graph healthy — no gaps.", findings: findings };
  }
  return {
    actionable: true,
    summary: findings.length + " decision graph gap" + (findings.length === 1 ? "" : "s") + " found.",
    findings: findings,
  };
}

export async function buildConflictPayload(
  a: DecisionNode,
  b: DecisionNode,
  similarity: number,
  evidenceFor: (id: string) => Promise<string[]>
): Promise<{
  decision_a: object;
  decision_b: object;
  similarity: number;
  resolution_note: string;
}> {
  function side(decision: DecisionNode, evidence_summaries: string[]): object {
    return {
      id: decision.id,
      statement: decision.statement,
      rationale: decision.rationale,
      scope: decision.scope,
      created_at: decision.created_at,
      evidence_summaries: evidence_summaries,
    };
  }
  var evidenceA = await evidenceFor(a.id);
  var evidenceB = await evidenceFor(b.id);
  return {
    decision_a: side(a, evidenceA),
    decision_b: side(b, evidenceB),
    similarity: similarity,
    resolution_note: "Potential conflict only; Raven never auto-resolves. Use decision_supersede or decision_scope to resolve explicitly.",
  };
}

export function decisionsHome(): string {
  return process.env.RAVEN_DECISIONS_HOME || join(homedir(), ".raven", "decisions");
}

export function flagRationaleMissing<T extends { rationale?: string | null }>(input: T): T & { rationale_missing: boolean } {
  return Object.assign({}, input, {
    rationale_missing: input.rationale == null || input.rationale.trim().length === 0,
  });
}

export type ExtractionItem = {
  statement: string;
  rationale: string | null;
  alternatives_rejected: string[];
};

export type ExtractionParseResult =
  | { ok: true; items: ExtractionItem[]; skipped: number }
  | { ok: false; error: string };

export function parseExtractionJson(raw: string): ExtractionParseResult {
  var cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  var parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    return { ok: false, error: "Could not parse extraction JSON: " + (error as Error).message };
  }

  var candidates: unknown = parsed;
  if (!Array.isArray(candidates) && candidates !== null && typeof candidates === "object") {
    candidates = (candidates as { decisions?: unknown }).decisions;
  }
  if (!Array.isArray(candidates)) {
    return { ok: false, error: "Extraction JSON must be an array or an object with a decisions array." };
  }

  var items: ExtractionItem[] = [];
  var skipped = 0;
  for (var candidate of candidates) {
    if (candidate === null || typeof candidate !== "object") {
      skipped += 1;
      continue;
    }
    var input = candidate as Record<string, unknown>;
    if (typeof input.statement !== "string" || input.statement.trim().length === 0) {
      skipped += 1;
      continue;
    }
    var rationale: string | null = null;
    if (typeof input.rationale === "string" && input.rationale.trim().length > 0) {
      rationale = input.rationale.trim();
    }
    var alternatives = Array.isArray(input.alternatives_rejected)
      ? input.alternatives_rejected.filter(function(value): value is string { return typeof value === "string"; })
      : [];
    items.push({
      statement: input.statement.trim(),
      rationale: rationale,
      alternatives_rejected: alternatives,
    });
  }

  if (items.length === 0) {
    return { ok: false, error: "Extraction JSON contained zero valid decisions (skipped " + skipped + ")." };
  }
  return { ok: true, items: items, skipped: skipped };
}

export function buildExtractionPrompt(transcript: string): string {
  return [
    "Extract DISTINCT genuine design decisions only from the transcript below.",
    "Discard chatter, questions, and unresolved debates.",
    "Return a STRICT JSON array of objects with exactly these fields:",
    '{"statement":"...","rationale":"... or null","alternatives_rejected":["..."]}',
    "Use rationale null when the transcript never states why the decision was made.",
    "Return no prose outside the JSON.",
    "",
    "TRANSCRIPT:",
    transcript,
  ].join("\n");
}

export class FsDecisionGraphStore implements DecisionGraphStore {
  private embedder: Embedder;
  // ponytail: in-process serialization only; cross-process file lock if multi-instance teams need it
  private writeLock: Promise<void> = Promise.resolve();

  constructor(embedder: Embedder = new NullEmbedder()) {
    this.embedder = embedder;
  }

  async addNode(node: GraphNode): Promise<GraphNode> {
    return this.withWriteLock(async () => {
      var nodes = readNodes();
      var stored = node;
      if (node.node_kind === "decision") {
        stored = await this.prepareDecision(flagRationaleMissing(node));
      }
      nodes.push(stored);
      writeNodes(nodes);
      return stored;
    });
  }

  async getNode(id: string): Promise<GraphNode | null> {
    var nodes = readNodes();
    return nodes.find(function(node) { return node.id === id; }) || null;
  }

  async updateNode(id: string, patch: Partial<GraphNode>): Promise<GraphNode | null> {
    return this.withWriteLock(async () => {
      var nodes = readNodes();
      var index = nodes.findIndex(function(node) { return node.id === id; });
      if (index === -1) return null;

      var current = nodes[index];
      var updated = Object.assign({}, current, patch) as GraphNode;
      if (updated.node_kind === "decision") {
        updated = flagRationaleMissing(updated);
        if (current.node_kind !== "decision" || "statement" in patch || "rationale" in patch) {
          updated = await this.prepareDecision(updated);
        }
      }

      nodes[index] = updated;
      writeNodes(nodes);
      return updated;
    });
  }

  async addEdge(edge: GraphEdge): Promise<GraphEdge> {
    return this.withWriteLock(async () => {
      var edges = readEdges();
      edges.push(edge);
      writeEdges(edges);
      return edge;
    });
  }

  async listEdges(edgeType?: GraphEdge["type"]): Promise<GraphEdge[]> {
    return readEdges().filter(function(edge) {
      return edgeType === undefined || edge.type === edgeType;
    });
  }

  async neighbors(nodeId: string, edgeType?: GraphEdge["type"]): Promise<GraphNode[]> {
    var connectedIds = new Set<string>();
    var edges = readEdges();
    for (var edge of edges) {
      if (edgeType !== undefined && edge.type !== edgeType) continue;
      if (edge.from === nodeId) connectedIds.add(edge.to);
      if (edge.to === nodeId) connectedIds.add(edge.from);
    }
    return readNodes().filter(function(node) { return connectedIds.has(node.id); });
  }

  async listActiveDecisions(): Promise<DecisionNode[]> {
    return readNodes().filter(function(node): node is DecisionNode {
      return node.node_kind === "decision" && node.status === "active";
    });
  }

  async findSimilarActiveDecisions(node: DecisionNode, threshold: number, excludeId?: string): Promise<Array<{ decision: DecisionNode; similarity: number }>> {
    var nodeEmbedding = node.embedding;
    if (!nodeEmbedding || nodeEmbedding.length === 0) {
      nodeEmbedding = await this.embedder.embed(node.statement + "\n" + (node.rationale || ""));
    }
    if (!nodeEmbedding || nodeEmbedding.length === 0) return [];
    var matches: Array<{ decision: DecisionNode; similarity: number }> = [];
    var active = await this.listActiveDecisions();
    for (var decision of active) {
      if (decision.id === excludeId) continue;
      var embedding = decision.embedding;
      if (!embedding || embedding.length === 0) {
        embedding = await this.embedder.embed(decision.statement + "\n" + (decision.rationale || ""));
      }
      var similarity = cosineSimilarity(nodeEmbedding, embedding);
      if (similarity >= threshold) matches.push({ decision: decision, similarity: similarity });
    }
    return matches.sort(function(a, b) { return b.similarity - a.similarity; });
  }

  async listDecisions(status: DecisionNode["status"]): Promise<DecisionNode[]> {
    return readNodes().filter(function(node): node is DecisionNode {
      return node.node_kind === "decision" && node.status === status;
    });
  }

  private async prepareDecision(node: DecisionNode): Promise<DecisionNode> {
    var text = node.statement + "\n" + (node.rationale || "");
    return Object.assign({}, node, { embedding: await this.embedder.embed(text) });
  }

  private withWriteLock<T>(mutation: () => Promise<T>): Promise<T> {
    var result = this.writeLock.then(mutation);
    this.writeLock = result.then(function() {}, function() {});
    return result;
  }
}

function nodesPath(): string {
  return join(decisionsHome(), "nodes.json");
}

function edgesPath(): string {
  return join(decisionsHome(), "edges.json");
}

function readNodes(): GraphNode[] {
  var file = nodesPath();
  if (!existsSync(file)) return [];
  var parsed = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(parsed.nodes) ? parsed.nodes : [];
}

function writeNodes(nodes: GraphNode[]): void {
  mkdirSync(decisionsHome(), { recursive: true });
  writeFileSync(nodesPath(), JSON.stringify({ version: 1, nodes: nodes }, null, 2) + "\n", "utf8");
}

function readEdges(): GraphEdge[] {
  var file = edgesPath();
  if (!existsSync(file)) return [];
  var parsed = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(parsed.edges) ? parsed.edges : [];
}

function writeEdges(edges: GraphEdge[]): void {
  mkdirSync(decisionsHome(), { recursive: true });
  writeFileSync(edgesPath(), JSON.stringify({ version: 1, edges: edges }, null, 2) + "\n", "utf8");
}
