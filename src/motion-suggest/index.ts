// suggest_motion (Site Motion Spec Part D): capture a page, find the moments where motion could help, build a
// playground for each from the page's own content, and a map that shows where they are.

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { CaptureAbortedError, capturePage } from "../capture.js";
import { createMotionPlayground } from "../motion-playground/index.js";
import { findTasteTerms, type TasteTermHit } from "../motion-playground/taste-map.js";
import { registerPlayground, unregisterPlayground } from "../motion-session.js";
import { getTasteProfile, listTasteDecisions, resolveSurfaceBinding } from "../taste.js";
import { tasteHome, type TasteStore } from "../taste-store.js";
import {
  type Box, type MotionCandidate, type MotionGate, type MotionKind, type MotionPart, type MotionTrigger,
  cropImages, findMotionCandidates, imageCropRequests, motionGate, rankCandidates, MAX_SELECTOR_LENGTH, MAX_SUGGESTIONS,
} from "./candidates.js";
import { readMotionDecisions } from "./decisions.js";
import { type FontPlan, type FragmentStyle, type ImageData, fallbackKeyword, newContext, newFontPlan } from "./fragment.js";
import { buildMotionMap, type MapItem } from "./map.js";
import { createCapturePolicy, fetchFont, type HostClassifier } from "./policy.js";
import { buildRecipe } from "./recipes.js";
import { buildWhy } from "./why.js";

export const MAP_MAX_HEIGHT = 6000;
export const MAP_MAX_WIDTH = 2400;
const VIEWPORTS = { desktop: { w: 1440, h: 900 }, mobile: { w: 390, h: 844 } } as const;

export type SuggestMotionInput = {
  store: TasteStore;
  url: string;
  profile?: string;
  project?: string;
  max?: number;
  viewport?: "desktop" | "mobile";
  /** One element to build a playground for. Forces max to 1 and builds no map. */
  selector?: string;
  /** For a selector: when the element moves. */
  trigger?: MotionTrigger;
  /** Aborting stops the work: nothing is written or registered after it, and what was registered is removed. */
  signal?: AbortSignal;
  /** Who the playgrounds belong to (a Grab session id), passed to registration. */
  owner?: string;
  /** Called when the capture is done and the previews start building. */
  onStep?: (step: "building") => void;
  /** Tests only: treat named hosts as public. */
  classifyHost?: HostClassifier;
  /** Tests only: fail every suggestion at this stage. */
  faultAt?: FailStage;
};

export type FailStage = "recipe" | "playground" | "register";
export type FailedSuggestion = { kind: MotionKind; label: string; stage: FailStage; reason: string };

export type MotionSuggestion = {
  id: string;
  kind: MotionKind;
  label: string;
  box: Box;
  why: string;
  cites: string[];
  trigger: unknown;
  trigger_words: string;
  timeline: unknown;
  fragment: string;
  approximations: string[];
  html_path: string;
  url?: string;
  playground_id?: string;
  /** The page elements this animates, for markers on the live page. Page data: compare, never insert. */
  parts: MotionPart[];
};

export type SuggestMotionResult = {
  tool: "suggest_motion";
  url: string;
  suggestions: MotionSuggestion[];
  /** Suggestions that found a place but could not be built, with the stage that failed. */
  failed: FailedSuggestion[];
  /** Absent in selector mode. */
  map_path?: string;
  /** Selector mode: the one playground's URL. */
  preview_url?: string;
  message?: string;
  customer_used: string | null;
  /** Whether a taste binding or recorded motion decisions shaped these suggestions. */
  uses_taste: boolean;
  notes_used: string[];
  warnings: string[];
  next: string[];
};

const NEXT = [
  "Call open_motion_playground with map_path and give the designer the url it returns. Each numbered spot opens that suggestion's playground on the same origin, so Send to your agent reaches you; then call get_motion_sends.",
  "When the designer says no to a suggestion, record it with record_taste_decision on dimension motion, with rejected starting \"motion:<kind>\".",
];

const NEXT_SELECTOR = [
  "Give the designer preview_url: it opens the playground for the element they named, on the same origin, so Send to your agent reaches you; then call get_motion_sends.",
];

type Args = { url: string; profile: string; project: string; max: number; viewport: "desktop" | "mobile"; selector?: string; trigger?: MotionTrigger };

function readArgs(input: SuggestMotionInput): Args {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!url) throw new Error("url is required");
  const profile = typeof input.profile === "string" ? input.profile.trim() : "";
  const project = typeof input.project === "string" ? input.project.trim() : "";
  if ((profile === "") !== (project === "")) throw new Error("profile and project go together: pass both or neither");
  if (project && !/^[a-z0-9][a-z0-9-_.]{0,63}$/i.test(project)) throw new Error("project must match /^[a-z0-9][a-z0-9-_.]{0,63}$/i");
  let max = 5;
  if (input.max !== undefined) {
    if (!Number.isInteger(input.max) || input.max < 1 || input.max > MAX_SUGGESTIONS) throw new Error(`max must be a whole number from 1 to ${MAX_SUGGESTIONS}`);
    max = input.max;
  }
  const viewport = input.viewport === undefined ? "desktop" : input.viewport;
  if (viewport !== "desktop" && viewport !== "mobile") throw new Error("viewport must be desktop or mobile");
  const args: Args = { url, profile, project, max, viewport };
  if (input.selector !== undefined) {
    if (typeof input.selector !== "string" || !input.selector.trim()) throw new Error("selector must be a non-empty string");
    if (input.selector.length > MAX_SELECTOR_LENGTH) throw new Error(`selector must be at most ${MAX_SELECTOR_LENGTH} characters`);
    args.selector = input.selector.trim();
    args.max = 1;
  }
  if (input.trigger !== undefined) {
    if (args.selector === undefined) throw new Error("trigger goes with selector");
    if (input.trigger !== "entrance" && input.trigger !== "hover" && input.trigger !== "scroll") throw new Error("trigger must be entrance, hover or scroll");
    args.trigger = input.trigger;
  }
  return args;
}

type Inspection = {
  candidates: MotionCandidate[];
  gate: MotionGate;
  message?: string;
  passWarnings: string[];
  crops: Map<string, ImageData>;
  shot: { base64: string; width: number; height: number } | null;
};

/** Font keys in a styles map. */
function fontKeys(styles: Record<string, FragmentStyle>): Set<string> {
  const s = new Set<string>();
  for (const st of Object.values(styles)) if (st.font && st.font !== "sans" && st.font !== "serif") s.add(st.font);
  return s;
}

async function resolveFonts(plan: FontPlan, pageUrl: string, classifyHost: HostClassifier | undefined, warnings: string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  const origin = new URL(pageUrl).origin;
  const cacheDir = join(tasteHome(), "fonts");
  const failed = new Set<string>();
  for (const [key, ref] of plan.keys) {
    if (!ref.src) continue;
    if (signal && signal.aborted) break;
    const r = await fetchFont(ref.src, origin, { cacheDir, classifyHost, ...(signal ? { signal } : {}) });
    if (signal && signal.aborted) break;
    if ("path" in r) paths.set(key, r.path);
    else if (!failed.has(ref.family)) {
      failed.add(ref.family);
      warnings.push(`The font “${ref.family}” could not be loaded (${r.error.replace(/\.$/, "")}), so a plain ${fallbackKeyword(ref.family) === "serif" ? "serif" : "sans"} is shown in its place.`);
    }
  }
  return paths;
}

class SuggestAbortedError extends Error {
  constructor() { super("Motion suggestions were stopped."); this.name = "AbortError"; }
}

export async function suggestMotion(input: SuggestMotionInput): Promise<SuggestMotionResult> {
  const args = readArgs(input);
  const warnings: string[] = [];
  const signal = input.signal;
  const registered: string[] = [];
  // Called before every write, registration and return once the capture is done.
  const checkAbort = (): void => {
    if (signal && signal.aborted) {
      for (const id of registered) unregisterPlayground(id);
      registered.length = 0;
      throw new SuggestAbortedError();
    }
  };
  try {
    return await run();
  } catch (e) {
    if (e instanceof CaptureAbortedError || (signal && signal.aborted)) {
      for (const id of registered) unregisterPlayground(id);
      throw new SuggestAbortedError();
    }
    throw e;
  }

  async function run(): Promise<SuggestMotionResult> {

  // Taste: the binding's notes and the recorded motion decisions.
  let notes: Record<string, string> = {};
  let profileName = "";
  let rejectedKinds: MotionKind[] = [];
  let tuned: Partial<Record<MotionKind, Record<string, unknown>>> = {};
  let bound = false;
  if (args.profile) {
    const profile = await getTasteProfile(input.store, args.profile);
    profileName = profile.name;
    const binding = await resolveSurfaceBinding(input.store, profile.name, { project: args.project });
    if (binding) { notes = binding.design_notes || {}; bound = true; }
    else warnings.push(`There is no taste binding for project “${args.project}”, so these suggestions use the page alone.`);
    const decisions = await listTasteDecisions(input.store, profile.name, { project: args.project, dimension: "motion" });
    const state = readMotionDecisions(decisions);
    rejectedKinds = state.rejectedKinds;
    tuned = state.tuned;
    warnings.push(...state.warnings);
  } else {
    warnings.push("No profile and project were given, so these suggestions use the page alone. Pass both to tune them to the designer's notes.");
  }
  const usesTaste = bound || rejectedKinds.length > 0 || Object.keys(tuned).length > 0;
  const customer = typeof notes.customer === "string" && notes.customer.trim() ? notes.customer.trim() : "";
  if (!customer) warnings.push("There is no customer note yet, so the reasons speak only about the page. Run the kickoff's customer question (get_taste_interview) to add one.");
  const motionNote = typeof notes.motion === "string" ? notes.motion : undefined;
  const terms: TasteTermHit[] = findTasteTerms(notes);

  // Capture, under the policy: detection, ranking, crops of the chosen ones only, and the map's screenshot.
  const policy = await createCapturePolicy(args.url, { classifyHost: input.classifyHost });
  const viewport = VIEWPORTS[args.viewport];
  const result = await capturePage<Inspection>(args.url, {
    beforeNavigate: policy.install,
    viewport,
    // Scroll the page first so content that waits to scroll into view is there to read and in the map.
    scroll_settle: true,
    signal,
    inspect: async (page) => {
      const pass = await findMotionCandidates(page, args.selector !== undefined ? { selector: args.selector, ...(args.trigger ? { trigger: args.trigger } : {}) } : undefined);
      // A chosen element skips ranking and rejected kinds; a note that turns motion off still applies.
      let ranked: { candidates: MotionCandidate[]; gate: MotionGate; message?: string };
      if (args.selector !== undefined) {
        const gate = motionGate(motionNote);
        if (gate === "none") ranked = rankCandidates(pass.candidates, { max: 1, motionNote });
        else if (pass.selectorInvalid) ranked = { candidates: [], gate: null, message: "That selector isn't one the page can read, so Raven couldn't find the element." };
        else if (pass.selectorMissing) ranked = { candidates: [], gate: null, message: "Raven loads the page fresh to copy it, and this element wasn't there. Open the state it's in as its own page, or ask your agent." };
        else ranked = { candidates: pass.candidates.slice(0, 1), gate: null };
      } else {
        ranked = rankCandidates(pass.candidates, { max: args.max, rejectedKinds, motionNote });
      }
      const crops = new Map<string, ImageData>();
      for (const c of await cropImages(page, imageCropRequests(ranked.candidates))) {
        crops.set(c.id, "png" in c ? { png: c.png } : { color: c.color, approximation: c.approximation });
      }
      const height = await page.evaluate(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)));
      const width = Math.min(viewport.w, MAP_MAX_WIDTH);
      const h = Math.max(1, Math.min(MAP_MAX_HEIGHT, height));
      const buf: Buffer = await page.screenshot({ clip: { x: 0, y: 0, width, height: h }, fullPage: true, type: "jpeg", quality: 82, scale: "css", animations: "disabled" });
      return { candidates: ranked.candidates, gate: ranked.gate, message: ranked.message, passWarnings: pass.warnings, crops, shot: { base64: buf.toString("base64"), width, height: h } };
    },
  });
  warnings.push(...policy.warnings);
  if (result.inspectionError || !result.inspection) {
    throw new Error("The page could not be read for motion suggestions" + (result.inspectionError ? ": " + String(result.inspectionError) : "."));
  }
  const insp = result.inspection;
  warnings.push(...insp.passWarnings);
  checkAbort();
  if (input.onStep) input.onStep("building");

  // Build each suggestion.
  const fontPlan = newFontPlan();
  const built: { c: MotionCandidate; recipe: ReturnType<typeof buildRecipe> }[] = [];
  const failed: FailedSuggestion[] = [];
  const fail = (c: MotionCandidate, stage: FailStage, e: unknown): void => {
    const reason = e instanceof Error ? e.message : String(e);
    failed.push({ kind: c.kind, label: c.label, stage, reason });
    warnings.push(`The ${c.label.toLowerCase()} suggestion could not be built: ${reason}`);
  };
  insp.candidates.forEach((c, i) => {
    try {
      if (input.faultAt === "recipe") throw new Error("forced failure (test)");
      const ctx = newContext(insp.crops, fontPlan);
      built.push({ c, recipe: buildRecipe(c, ctx, { index: i + 1, terms, tuned: tuned[c.kind] }) });
    } catch (e) {
      fail(c, "recipe", e);
    }
  });
  checkAbort();
  const fontPaths = await resolveFonts(fontPlan, args.url, input.classifyHost, warnings, signal);

  const suggestions: MotionSuggestion[] = [];
  const mapItems: MapItem[] = [];
  const notesUsed = new Set<string>();
  for (const { c, recipe } of built) {
    const doc = recipe.doc as Record<string, unknown> & { styles: Record<string, FragmentStyle> };
    const fonts: Record<string, { path: string }> = {};
    for (const key of fontKeys(doc.styles)) {
      const p = fontPaths.get(key);
      if (p) fonts[key] = { path: p };
      else for (const st of Object.values(doc.styles)) if (st.font === key) st.font = fallbackKeyword(fontPlan.keys.get(key)?.family);
    }
    if (Object.keys(fonts).length) doc.fonts = fonts;
    const why = buildWhy({ candidate: c, customer, motionNote, gate: insp.gate, termsApplied: recipe.termsApplied, values: recipe.values, restored: recipe.restored });
    let playground;
    checkAbort();
    try {
      if (input.faultAt === "playground") throw new Error("forced failure (test)");
      playground = await createMotionPlayground({ store: input.store, timeline: doc, fragment: recipe.fragment, ...(signal ? { signal } : {}), ...(profileName ? { profile: profileName, project: args.project } : {}) });
    } catch (e) {
      fail(c, "playground", e);
      continue;
    }
    // The playground's own note about taste and timelines does not apply: the recipe already used the notes.
    warnings.push(...playground.warnings.filter((w) => !/^Taste notes set defaults on built-in motifs only|^No surface binding/.test(w)), ...recipe.warnings);
    let served: { id: string; url: string } | null = null;
    checkAbort();
    try {
      if (input.faultAt === "register") throw new Error("forced failure (test)");
      served = await registerPlayground(playground.html_path, { ...(input.owner ? { owner: input.owner } : {}), ...(signal ? { signal } : {}) });
      registered.push(served.id);
    } catch (e) {
      fail(c, "register", e);
      continue;
    }
    for (const k of why.cites) if (k !== "decisions.motion") notesUsed.add(k);
    const number = suggestions.length + 1;
    suggestions.push({
      id: String(doc.id), kind: c.kind, label: c.label, box: c.box, why: why.why, cites: why.cites,
      trigger: doc.trigger, trigger_words: recipe.triggerWords, timeline: doc, fragment: recipe.fragment,
      approximations: recipe.approximations, html_path: playground.html_path, url: served.url, playground_id: served.id, parts: c.parts,
    });
    mapItems.push({ number, label: c.label, why: why.why, triggerWords: recipe.triggerWords, approximations: recipe.approximations, box: c.box, file: basename(playground.html_path), served: "/p/" + served.id });
  }
  checkAbort();

  // The map, beside the playgrounds.
  let message = insp.message;
  if (!suggestions.length && failed.length && !message) message = "Raven found places for motion but couldn't build any previews. The warnings say why.";
  if (!suggestions.length && !message) message = "Nothing on this page could be turned into a playground. The warnings say why.";

  if (args.selector !== undefined) {
    const out: SuggestMotionResult = {
      tool: "suggest_motion", url: args.url, suggestions, failed,
      customer_used: customer || null, uses_taste: usesTaste, notes_used: [...notesUsed], warnings: Array.from(new Set(warnings)), next: NEXT_SELECTOR,
    };
    if (suggestions[0] && suggestions[0].url) out.preview_url = suggestions[0].url;
    if (message && !suggestions.length) out.message = message;
    return out;
  }
  const shot = insp.shot || { base64: "", width: viewport.w, height: 1 };
  const html = buildMotionMap({ pageUrl: args.url, screenshot: { mime: "image/jpeg", ...shot }, items: mapItems, message: suggestions.length ? undefined : message });
  const dir = join(tasteHome(), "playgrounds");
  mkdirSync(dir, { recursive: true });
  let host = "page";
  try { host = new URL(args.url).hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "page"; } catch { /* keep "page" */ }
  const mapPath = join(dir, `motion-map-${host.slice(0, 40)}-${randomBytes(3).toString("hex")}.html`);
  checkAbort();
  writeFileSync(mapPath, html, { encoding: "utf8", flag: "wx" });

  const out: SuggestMotionResult = {
    tool: "suggest_motion",
    url: args.url,
    suggestions,
    failed,
    map_path: mapPath,
    customer_used: customer || null, uses_taste: usesTaste,
    notes_used: [...notesUsed],
    warnings: Array.from(new Set(warnings)),
    next: NEXT,
  };
  if (message && !suggestions.length) out.message = message;
  return out;
  }
}
