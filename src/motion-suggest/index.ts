// suggest_motion (Site Motion Spec Part D): capture a page, find the moments where motion could help, build a
// playground for each from the page's own content, and a map that shows where they are.

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { capturePage } from "../capture.js";
import { createMotionPlayground } from "../motion-playground/index.js";
import { findTasteTerms, type TasteTermHit } from "../motion-playground/taste-map.js";
import { registerPlayground } from "../motion-session.js";
import { getTasteProfile, listTasteDecisions, resolveSurfaceBinding } from "../taste.js";
import { tasteHome, type TasteStore } from "../taste-store.js";
import {
  type Box, type MotionCandidate, type MotionGate, type MotionKind,
  cropImages, findMotionCandidates, imageCropRequests, rankCandidates, MAX_SUGGESTIONS,
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
  /** Tests only: treat named hosts as public. */
  classifyHost?: HostClassifier;
};

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
};

export type SuggestMotionResult = {
  tool: "suggest_motion";
  url: string;
  suggestions: MotionSuggestion[];
  map_path: string;
  message?: string;
  customer_used: string | null;
  notes_used: string[];
  warnings: string[];
  next: string[];
};

const NEXT = [
  "Call open_motion_playground with map_path and give the designer the url it returns. Each numbered spot opens that suggestion's playground on the same origin, so Send to your agent reaches you; then call get_motion_sends.",
  "When the designer says no to a suggestion, record it with record_taste_decision on dimension motion, with rejected starting \"motion:<kind>\".",
];

function readArgs(input: SuggestMotionInput): { url: string; profile: string; project: string; max: number; viewport: "desktop" | "mobile" } {
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
  return { url, profile, project, max, viewport };
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

async function resolveFonts(plan: FontPlan, pageUrl: string, classifyHost: HostClassifier | undefined, warnings: string[]): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  const origin = new URL(pageUrl).origin;
  const cacheDir = join(tasteHome(), "fonts");
  const failed = new Set<string>();
  for (const [key, ref] of plan.keys) {
    if (!ref.src) continue;
    const r = await fetchFont(ref.src, origin, { cacheDir, classifyHost });
    if ("path" in r) paths.set(key, r.path);
    else if (!failed.has(ref.family)) {
      failed.add(ref.family);
      warnings.push(`The font “${ref.family}” could not be loaded (${r.error.replace(/\.$/, "")}), so a plain ${fallbackKeyword(ref.family) === "serif" ? "serif" : "sans"} is shown in its place.`);
    }
  }
  return paths;
}

export async function suggestMotion(input: SuggestMotionInput): Promise<SuggestMotionResult> {
  const args = readArgs(input);
  const warnings: string[] = [];

  // Taste: the binding's notes and the recorded motion decisions.
  let notes: Record<string, string> = {};
  let profileName = "";
  let rejectedKinds: MotionKind[] = [];
  let tuned: Partial<Record<MotionKind, Record<string, unknown>>> = {};
  if (args.profile) {
    const profile = await getTasteProfile(input.store, args.profile);
    profileName = profile.name;
    const binding = await resolveSurfaceBinding(input.store, profile.name, { project: args.project });
    if (binding) notes = binding.design_notes || {};
    else warnings.push(`There is no taste binding for project “${args.project}”, so these suggestions use the page alone.`);
    const decisions = await listTasteDecisions(input.store, profile.name, { project: args.project, dimension: "motion" });
    const state = readMotionDecisions(decisions);
    rejectedKinds = state.rejectedKinds;
    tuned = state.tuned;
    warnings.push(...state.warnings);
  } else {
    warnings.push("No profile and project were given, so these suggestions use the page alone. Pass both to tune them to the designer's notes.");
  }
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
    inspect: async (page) => {
      const pass = await findMotionCandidates(page);
      const ranked = rankCandidates(pass.candidates, { max: args.max, rejectedKinds, motionNote });
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

  // Build each suggestion.
  const fontPlan = newFontPlan();
  const built: { c: MotionCandidate; recipe: ReturnType<typeof buildRecipe> }[] = [];
  insp.candidates.forEach((c, i) => {
    try {
      const ctx = newContext(insp.crops, fontPlan);
      built.push({ c, recipe: buildRecipe(c, ctx, { index: i + 1, terms, tuned: tuned[c.kind] }) });
    } catch (e) {
      warnings.push(`The ${c.label.toLowerCase()} suggestion could not be built: ${(e as Error).message}`);
    }
  });
  const fontPaths = await resolveFonts(fontPlan, args.url, input.classifyHost, warnings);

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
    try {
      playground = await createMotionPlayground({ store: input.store, timeline: doc, fragment: recipe.fragment, ...(profileName ? { profile: profileName, project: args.project } : {}) });
    } catch (e) {
      warnings.push(`The ${c.label.toLowerCase()} suggestion could not be built: ${(e as Error).message}`);
      continue;
    }
    // The playground's own note about taste and timelines does not apply: the recipe already used the notes.
    warnings.push(...playground.warnings.filter((w) => !/^Taste notes set defaults on built-in motifs only|^No surface binding/.test(w)), ...recipe.warnings);
    let served: { id: string; url: string } | null = null;
    try { served = await registerPlayground(playground.html_path); } catch (e) { warnings.push(`The playground for ${c.label.toLowerCase()} could not be served: ${(e as Error).message}`); }
    for (const k of why.cites) if (k !== "decisions.motion") notesUsed.add(k);
    const number = suggestions.length + 1;
    suggestions.push({
      id: String(doc.id), kind: c.kind, label: c.label, box: c.box, why: why.why, cites: why.cites,
      trigger: doc.trigger, trigger_words: recipe.triggerWords, timeline: doc, fragment: recipe.fragment,
      approximations: recipe.approximations, html_path: playground.html_path, ...(served ? { url: served.url } : {}),
    });
    mapItems.push({ number, label: c.label, why: why.why, triggerWords: recipe.triggerWords, approximations: recipe.approximations, box: c.box, file: basename(playground.html_path), ...(served ? { served: "/p/" + served.id } : {}) });
  }

  // The map, beside the playgrounds.
  let message = insp.message;
  if (!suggestions.length && !message) message = "Nothing on this page could be turned into a playground. The warnings say why.";
  const shot = insp.shot || { base64: "", width: viewport.w, height: 1 };
  const html = buildMotionMap({ pageUrl: args.url, screenshot: { mime: "image/jpeg", ...shot }, items: mapItems, message: suggestions.length ? undefined : message });
  const dir = join(tasteHome(), "playgrounds");
  mkdirSync(dir, { recursive: true });
  let host = "page";
  try { host = new URL(args.url).hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "page"; } catch { /* keep "page" */ }
  const mapPath = join(dir, `motion-map-${host.slice(0, 40)}-${randomBytes(3).toString("hex")}.html`);
  writeFileSync(mapPath, html, { encoding: "utf8", flag: "wx" });

  const out: SuggestMotionResult = {
    tool: "suggest_motion",
    url: args.url,
    suggestions,
    map_path: mapPath,
    customer_used: customer || null,
    notes_used: [...notesUsed],
    warnings: Array.from(new Set(warnings)),
    next: NEXT,
  };
  if (message && !suggestions.length) out.message = message;
  return out;
}
