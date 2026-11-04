// The reason given for each suggestion (Site Motion Spec D2, Revision 14).
//
// A reason is built from the page and from the stored notes, nothing else. Every note it relies on is named
// in `cites` and quoted word for word, so a test can check the quote against the note. With no customer
// note, the reason says nothing about who visits the site.

import type { MotionCandidate } from "./candidates.js";
import type { TasteTermHit } from "../motion-playground/taste-map.js";
import type { MotionGate } from "./candidates.js";

export type WhyInput = {
  candidate: MotionCandidate;
  customer?: string;
  /** design_notes.motion, for the ranking gate. */
  motionNote?: string;
  gate: MotionGate;
  termsApplied: TasteTermHit[];
  values: Record<string, unknown>;
  /** Param ids restored from a recorded decision. */
  restored: string[];
};

export type Why = { why: string; cites: string[] };

/** A verbatim phrase from a note: its first clause, cut at a word boundary to at most `max` characters. */
export function quotePhrase(note: string, max = 60): string {
  const flat = note.replace(/\s+/g, " ").trim();
  const clause = (flat.split(/[.;:!?\n]|\s[–—-]\s/)[0] || flat).trim();
  if (clause.length <= max) return clause;
  const cut = clause.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max / 3 ? cut.slice(0, sp) : cut).replace(/[,\s]+$/, "");
}

/** The page's reason, as a clause that can follow "and" (lower-case start). */
function pageReason(c: MotionCandidate): string {
  switch (c.kind) {
    case "hero-entrance":
      return "this is the first thing people read on the page, so it can arrive as the page opens";
    case "cta-hover":
      if (c.signals.mainAction) return "this is the page's main button, so it should answer the pointer quickly";
      return c.signals.firstViewport ? "this button is in the first screen, so a small hover makes it feel ready to press" : "a small hover makes this button feel ready to press";
    case "card-hover":
      return c.count && c.count > 1
        ? `there are ${c.count} cards like this one, so one lift carries across all of them and shows which card the pointer is on`
        : "a lift shows which card the pointer is on";
    case "section-reveal":
      return "this section starts below the first screen, so it can arrive as it scrolls into view";
    case "nav-hover":
      return "these are the page's main links, and a line under the one the pointer is on shows where it goes";
    case "image-reveal":
      return "this is a large image below the first screen, so it can open as it scrolls into view";
    case "element-entrance":
      return "you picked this element, so it can arrive as the page opens";
    case "element-hover":
      return "you picked this element, so a small lift shows the pointer is on it";
    case "element-reveal":
      return "you picked this element, so it can arrive as it scrolls into view";
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ms(v: unknown): string {
  return typeof v === "number" ? `${Math.round(v)} ms` : "";
}

const TERM_EFFECT: Record<TasteTermHit["id"], (values: Record<string, unknown>) => string> = {
  restrained: () => "the movement is a third smaller",
  snappy: (v) => (typeof v.timing === "number" ? `this starts at ${ms(v.timing)}` : "the timing is a quarter shorter"),
  "no-bounce": () => "it settles without overshooting",
};

/** At most two sentences: who and where (customer and page), then what the notes changed. */
export function buildWhy(input: WhyInput): Why {
  const c = input.candidate;
  const cites: string[] = [];
  const customer = typeof input.customer === "string" ? input.customer.trim() : "";
  let first: string;
  if (customer) {
    first = `You're designing for “${quotePhrase(customer)}”, and ${pageReason(c)}.`;
    cites.push("customer");
  } else {
    first = cap(pageReason(c)) + ".";
  }

  const clauses: string[] = [];
  // The ranking gate changed what is offered: always cited.
  const motionNote = typeof input.motionNote === "string" ? input.motionNote : "";
  const gateWord = input.gate && input.gate !== "none" ? new RegExp(input.gate === "restrained" ? "restrained|subtle" : "cinematic", "i").exec(motionNote) : null;
  const gateEffect = gateWord
    ? input.gate === "restrained"
      ? "this is a hover or a reveal rather than an entrance"
      : c.kind === "hero-entrance" ? "the hero entrance comes first" : ""
    : "";

  // Taste terms that changed a default, grouped by the note they came from.
  const byKey = new Map<string, TasteTermHit[]>();
  for (const t of input.termsApplied) {
    if (!byKey.has(t.key)) byKey.set(t.key, []);
    byKey.get(t.key)!.push(t);
  }
  if (gateWord && !byKey.has("motion")) byKey.set("motion", []);
  for (const [key, hits] of byKey) {
    const quotes = hits.map((h) => h.match);
    const effects = hits.map((h) => TERM_EFFECT[h.id](input.values));
    if (key === "motion" && gateWord) {
      if (!quotes.some((q) => q.toLowerCase() === gateWord[0].toLowerCase())) quotes.unshift(gateWord[0]);
      if (gateEffect) effects.unshift(gateEffect);
    }
    if (!quotes.length) continue;
    const said = quotes.map((q) => `“${q}”`).join(" and ");
    clauses.push(effects.length ? `your ${key} note says ${said}, so ${effects.join(" and ")}` : `your ${key} note says ${said}`);
    cites.push("notes." + key);
  }
  if (input.restored.length) {
    clauses.push("it starts from the values you sent last time");
    cites.push("decisions.motion");
  }
  const second = clauses.length ? " " + cap(clauses.join("; ")) + "." : "";
  return { why: first + second, cites };
}
