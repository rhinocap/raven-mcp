import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getTasteProfile,
  listSurfaceBindings,
  resolveSurfaceBinding,
  listTasteDecisions,
  ruleInScope,
  type SurfaceBinding,
  type TasteCorpusRecord,
  type TasteDecision,
  type TasteProfile,
  type TasteRule,
} from "./taste.js";
import type { TasteStore } from "./taste-store.js";

export type TastePortraitInput = {
  store: TasteStore;
  profile: string;
  project?: string;
  output_dir: string;
};

export type TastePortraitResult = {
  files: { path: string; surface: string; project: string }[];
  index_path?: string;
  warnings: string[];
};

type PortraitFamily = "editorial-light" | "dark-product" | "atmosphere";

type PortraitPage = {
  profile: TasteProfile;
  binding: SurfaceBinding;
  family: PortraitFamily;
  familyLabel: string;
  rules: TasteRule[];
  corpus: TasteCorpusRecord[];
  decisions: TasteDecision[];
  warnings: string[];
  generatedAt: string;
};

export async function generateTastePortrait(input: TastePortraitInput): Promise<TastePortraitResult> {
  if (typeof input.profile !== "string" || input.profile.trim().length === 0) {
    throw new Error("profile is required");
  }
  if (typeof input.output_dir !== "string" || input.output_dir.trim().length === 0) {
    throw new Error("output_dir is required");
  }

  const profile = await getTasteProfile(input.store, input.profile.trim());
  const project = typeof input.project === "string" && input.project.trim().length > 0 ? input.project.trim() : undefined;
  const bindings = project === undefined
    ? await listSurfaceBindings(input.store, profile.name)
    : [await resolveProjectBinding(input.store, profile.name, project)];

  if (bindings.length === 0) {
    throw new Error("No bound taste surfaces found for profile: " + profile.name);
  }

  const outputDir = resolve(input.output_dir);
  mkdirSync(outputDir, { recursive: true });

  const files: { path: string; surface: string; project: string }[] = [];
  const warnings: string[] = [];
  const generatedAt = new Date().toISOString();

  for (const binding of bindings) {
    const family = chooseFamily(binding);
    const page = await buildPageModel(input.store, profile, binding, family, generatedAt);
    warnings.push(...page.warnings);
    const filename = safeFilename(binding.project) + ".html";
    const outPath = join(outputDir, filename);
    writeFileSync(outPath, renderPortraitPage(page), "utf8");
    files.push({ path: outPath, surface: binding.surface, project: binding.project });
  }

  let indexPath: string | undefined;
  if (project === undefined) {
    indexPath = join(outputDir, "index.html");
    writeFileSync(indexPath, renderGalleryIndex(profile.name, files, bindings, generatedAt), "utf8");
  }

  const result: TastePortraitResult = { files, warnings };
  if (indexPath !== undefined) result.index_path = indexPath;
  return result;
}

async function resolveProjectBinding(store: TasteStore, profileName: string, project: string): Promise<SurfaceBinding> {
  const binding = await resolveSurfaceBinding(store, profileName, { project });
  if (binding === null) {
    throw new Error("No bound taste surface found for profile '" + profileName + "' and project '" + project + "'");
  }
  return binding;
}

async function buildPageModel(store: TasteStore, profile: TasteProfile, binding: SurfaceBinding, family: PortraitFamily, generatedAt: string): Promise<PortraitPage> {
  const warnings: string[] = [];
  const rules = profile.rules.filter(function(rule) { return ruleInScope(rule, binding.surface); });
  const corpus = profile.corpus.slice();
  const decisions = await listTasteDecisions(store, profile.name, { project: binding.project });

  if (rules.length === 0) warnings.push(binding.project + ": no in-scope taste rules for surface '" + binding.surface + "'; omitted rules section.");
  if (corpus.length === 0) warnings.push(binding.project + ": no corpus wrong/right records; omitted corrections section.");
  if (decisions.length === 0) warnings.push(binding.project + ": no recorded decisions for this project; omitted decisions section.");
  if (Object.keys(binding.design_notes).length === 0 && binding.voice_note.trim().length === 0) {
    warnings.push(binding.project + ": no design_notes or voice_note; rendered the surface header without a surface-rules section.");
  }

  return {
    profile,
    binding,
    family,
    familyLabel: familyLabel(family),
    rules,
    corpus,
    decisions,
    warnings,
    generatedAt,
  };
}

function chooseFamily(binding: SurfaceBinding): PortraitFamily {
  // Family follows the surface's explicit COLOR permissions, never adjacent
  // vocabulary: "glassmorphic" exists on light grounds, "lens black" is not a
  // dark ground, and a surface whose notes say "no gradients" must never get
  // the saturated atmosphere treatment.
  const notes = binding.design_notes;
  const groundText = ((notes.color || "") + " " + (notes.aesthetic || "") + " " + (notes.special || "") + " " + binding.surface).toLowerCase();
  const forbidsGradients = /no gradients?|no glow/.test(groundText);
  if (!forbidsGradients && /\b(saturated|multi-?hue|orbs?|color wash(es)?|atmospheric|navy ground)\b/.test(groundText)) {
    return "atmosphere";
  }
  if (/\bnear-black\b|\b(dark|black|charcoal)\s+(neutral\s+)?(ground|surface|page)\b|\bproduct site dark\b/.test(groundText)) {
    return "dark-product";
  }
  return "editorial-light";
}

function familyLabel(family: PortraitFamily): string {
  if (family === "atmosphere") return "atmosphere / saturated product surface";
  if (family === "dark-product") return "dark-product / award-layer";
  return "editorial-light";
}

// Glass is opt-in by the surface's own words: only when the notes name
// glassmorphism/frosted glass do editorial-light cards become real glass
// (translucent fill + backdrop-filter over soft single-hue tint fields).
function wantsLightGlass(family: PortraitFamily, binding: SurfaceBinding): boolean {
  if (family !== "editorial-light") return false;
  const notes = binding.design_notes;
  const text = ((notes.aesthetic || "") + " " + (notes.special || "") + " " + (notes.color || "")).toLowerCase();
  const glass = /glassmorph|frosted[ -]glass|glass panel|glass over/g;
  let match: RegExpExecArray | null;
  while ((match = glass.exec(text)) !== null) {
    // A negation token in the short window before the glass phrase FORBIDS it:
    // "no frosted glass" / "avoid glass panels" / "never glassmorphic" must not
    // turn glass on. Only a genuinely un-negated mention opts in.
    const preceding = text.slice(Math.max(0, match.index - 24), match.index);
    if (!/\b(no|not|never|without|avoid|non-?|anti)\b[^.;]*$/.test(preceding)) return true;
  }
  return false;
}

function renderPortraitPage(page: PortraitPage): string {
  const glass = wantsLightGlass(page.family, page.binding);
  const bodyClass = "portrait family-" + page.family + (glass ? " glass-light" : "");
  const title = page.binding.project + " taste portrait";
  const notes = Object.entries(page.binding.design_notes).sort(function(a, b) { return a[0].localeCompare(b[0]); });
  const heroQuote = pickHeroQuote(page);
  const hasSurfaceRules = notes.length > 0 || page.binding.voice_note.trim().length > 0;

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>" + escapeHtml(title) + "</title>",
    "<meta name=\"description\" content=\"" + escapeAttribute("Generated Raven taste portrait for " + page.binding.project) + "\">",
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
    "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
    fontLink(page.family),
    "<style>",
    renderCss(page.family, page.binding),
    "</style>",
    "</head>",
    "<body class=\"" + bodyClass + "\">",
    page.family === "atmosphere" ? renderAtmosphereField() : "",
    "<div class=\"page-shell\">",
    renderHeader(page),
    "<main>",
    renderHero(page, heroQuote),
    hasSurfaceRules ? renderSurfaceRules(page, notes) : "",
    page.rules.length > 0 ? renderRulesSection(page.rules) : "",
    page.corpus.length > 0 ? renderCorrectionsSection(page.corpus) : "",
    page.decisions.length > 0 ? renderDecisionsSection(page.decisions) : "",
    renderSpecimenSection(page),
    "</main>",
    renderFooter(page.profile.name, page.generatedAt),
    "</div>",
    renderMotionScript(page.family),
    "</body>",
    "</html>",
  ].filter(function(part) { return part.length > 0; }).join("\n");
}

function fontLink(family: PortraitFamily): string {
  if (family === "atmosphere") {
    return "<link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\">";
  }
  return "<link href=\"https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;1,9..144,500&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\">";
}

function renderHeader(page: PortraitPage): string {
  return [
    "<header class=\"site-header reveal-block\">",
    "<span class=\"mono-label\">" + escapeHtml(page.profile.name) + " / generated portrait</span>",
    "<span class=\"mono-label\">" + escapeHtml(page.familyLabel) + "</span>",
    "</header>",
  ].join("\n");
}

function renderHero(page: PortraitPage, quote: { text: string; source: string }): string {
  return [
    "<section class=\"hero reveal-block\">",
    "<p class=\"eyebrow\">" + escapeHtml(page.binding.surface) + "</p>",
    renderTitle("h1", page.binding.project),
    "<blockquote class=\"hero-quote\" data-taste-quote>" + escapeHtml(quote.text) + "</blockquote>",
    "<cite class=\"source\">— " + escapeHtml(quote.source) + "</cite>",
    "<p class=\"hero-lede\">A bound taste surface rendered as its own design rule: the page uses the surface family, voice, color permissions, and evidence it describes.</p>",
    "</section>",
  ].join("\n");
}

function renderSurfaceRules(page: PortraitPage, notes: [string, string][]): string {
  const noteRows = notes.map(function(entry) {
    return [
      "<article class=\"note-card reveal-block\">",
      "<p class=\"note-key\">" + escapeHtml(entry[0]) + "</p>",
      "<p data-taste-quote>" + escapeHtml(entry[1]) + "</p>",
      "</article>",
    ].join("\n");
  }).join("\n");

  const voice = page.binding.voice_note.trim().length > 0
    ? [
      "<article class=\"note-card voice-card reveal-block\">",
      "<p class=\"note-key\">voice register</p>",
      "<blockquote data-taste-quote>" + escapeHtml(page.binding.voice_note) + "</blockquote>",
      "<cite class=\"source\">— surface binding</cite>",
      "</article>",
    ].join("\n")
    : "";

  return [
    "<section class=\"section surface-section\">",
    renderTitle("h2", "Surface rules"),
    "<div class=\"note-grid\">",
    noteRows,
    voice,
    "</div>",
    "</section>",
  ].filter(function(part) { return part.length > 0; }).join("\n");
}

function renderRulesSection(rules: TasteRule[]): string {
  return [
    "<section class=\"section rules-section\">",
    renderTitle("h2", "In-scope laws"),
    "<div class=\"law-grid\">",
    rules.map(function(rule, index) {
      return [
        "<article class=\"law-card reveal-block\">",
        "<p class=\"law-num\">" + pad2(index + 1) + "</p>",
        "<h3>" + escapeHtml(rule.rule_id) + "</h3>",
        "<p data-taste-quote>" + escapeHtml(rule.clause_text) + "</p>",
        "<p class=\"meta-line\">" + escapeHtml(rule.category) + " · " + escapeHtml(rule.severity_default) + " · " + escapeHtml(rule.scope || "global") + "</p>",
        "</article>",
      ].join("\n");
    }).join("\n"),
    "</div>",
    "</section>",
  ].join("\n");
}

function renderCorrectionsSection(corpus: TasteCorpusRecord[]): string {
  return [
    "<section class=\"section corrections-section\">",
    renderTitle("h2", "Wrong → right ledger"),
    "<div class=\"ledger-head\"><span>No.</span><span>Wrong</span><span>Right</span></div>",
    "<div class=\"ledger\">",
    corpus.map(function(record, index) {
      const quote = record.artifact.trim().length > 0 ? record.artifact : record.violated_rule;
      return [
        "<article class=\"correction-row reveal-row\" data-target=\"" + String(index + 1) + "\">",
        "<div class=\"wipe\" aria-hidden=\"true\"></div>",
        "<div class=\"row-inner\">",
        "<div class=\"row-num\">" + pad2(index + 1) + "</div>",
        "<div class=\"wrong\"><p data-taste-quote>" + escapeHtml(record.wrong) + "</p></div>",
        "<div class=\"right\"><p data-taste-quote>" + escapeHtml(record.right) + "</p></div>",
        quote.trim().length > 0 ? "<p class=\"quote\" data-taste-quote>“" + escapeHtml(quote) + "” <span>— " + escapeHtml(record.violated_rule || "taste corpus") + "</span></p>" : "",
        "</div>",
        "</article>",
      ].filter(function(part) { return part.length > 0; }).join("\n");
    }).join("\n"),
    "</div>",
    "</section>",
  ].join("\n");
}

function renderDecisionsSection(decisions: TasteDecision[]): string {
  return [
    "<section class=\"section decisions-section\">",
    renderTitle("h2", "Decision evidence"),
    "<div class=\"decision-stack\">",
    decisions.map(function(decision) {
      const rejected = decision.rejected.length > 0 ? decision.rejected.join("; ") : "none recorded";
      return [
        "<article class=\"decision-block reveal-block\">",
        "<p class=\"note-key\">" + escapeHtml(decision.dimension) + " · " + escapeHtml(decision.source) + "</p>",
        "<blockquote data-taste-quote>“" + escapeHtml(decision.decision) + "”</blockquote>",
        "<dl>",
        "<div><dt>Rejected</dt><dd data-taste-quote>" + escapeHtml(rejected) + "</dd></div>",
        decision.why.trim().length > 0 ? "<div><dt>Why</dt><dd data-taste-quote>" + escapeHtml(decision.why) + "</dd></div>" : "",
        "</dl>",
        "<cite class=\"source\">— recorded " + escapeHtml(decision.recorded_at) + "</cite>",
        "</article>",
      ].filter(function(part) { return part.length > 0; }).join("\n");
    }).join("\n"),
    "</div>",
    "</section>",
  ].join("\n");
}

function renderSpecimenSection(page: PortraitPage): string {
  return [
    "<section class=\"section specimen-section\">",
    renderTitle("h2", "Rendered contract"),
    "<div class=\"spec-grid reveal-block\">",
    "<article><p class=\"note-key\">palette</p><div class=\"swatches\"><span class=\"swatch ink\"></span><span class=\"swatch soft\"></span><span class=\"swatch faint\"></span><span class=\"swatch accent\"></span></div><p class=\"spec\">ink / soft / faint / accent are the only repeated color roles used by this page family.</p></article>",
    "<article><p class=\"note-key\">type</p><p class=\"type-sample\">Inter carries structure.</p><p class=\"quote-sample\">Fraunces is reserved for quoted evidence.</p><p class=\"spec\">IBM Plex Mono labels every source and datum.</p></article>",
    "<article><p class=\"note-key\">motion</p><p class=\"spec\">IntersectionObserver reveals are progressive-enhancement only: content is visible by default, JS opts into motion, and reduced motion disables transforms.</p></article>",
    "</div>",
    "</section>",
  ].join("\n");
}

function renderTitle(tag: "h1" | "h2", text: string): string {
  return [
    "<div class=\"title-wrap reveal-title\">",
    "<" + tag + ">" + escapeHtml(text) + "</" + tag + ">",
    "<div class=\"curtain\" aria-hidden=\"true\"></div>",
    "</div>",
  ].join("\n");
}

function renderFooter(profile: string, generatedAt: string): string {
  return [
    "<footer class=\"site-footer reveal-block\">",
    "<span>Generated by Raven · " + escapeHtml(profile) + " · " + escapeHtml(generatedAt) + "</span>",
    "</footer>",
  ].join("\n");
}

function pickHeroQuote(page: PortraitPage): { text: string; source: string } {
  if (page.binding.voice_note.trim().length > 0) return { text: page.binding.voice_note.trim(), source: "surface voice note" };
  if (page.decisions.length > 0) return { text: page.decisions[0].decision, source: "record_taste_decision" };
  if (page.corpus.length > 0) return { text: page.corpus[0].right, source: "taste corpus" };
  return { text: "Taste is per-surface. Same eye, different room.", source: "Raven generated fallback" };
}

function renderCss(family: PortraitFamily, binding: SurfaceBinding): string {
  return [
    ":root{",
    renderRootTokens(family, binding),
    "}",
    commonCss(),
    family === "atmosphere" ? atmosphereCss() : "",
    wantsLightGlass(family, binding) ? lightGlassCss() : "",
  ].filter(function(part) { return part.length > 0; }).join("\n");
}

// Light glass keeps the surface's color law: single-hue tint fields (solid
// accent, blurred — no gradient syntax, no glow shadows) sit behind frosted
// cards so the backdrop-filter has something real to distort.
function lightGlassCss(): string {
  return [
    ".glass-light::before{content:\"\";position:fixed;top:12%;right:-8%;width:560px;height:560px;border-radius:50%;background:var(--accent);opacity:.07;filter:blur(110px);pointer-events:none;z-index:0}",
    ".glass-light::after{content:\"\";position:fixed;bottom:-12%;left:-8%;width:480px;height:480px;border-radius:50%;background:var(--accent);opacity:.05;filter:blur(120px);pointer-events:none;z-index:0}",
    ".glass-light .note-card,.glass-light .law-card,.glass-light .decision-block,.glass-light .spec-grid article{background:rgba(255,255,255,.55);border-color:rgba(20,20,18,.1);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%)}",
  ].join("\n");
}

function renderRootTokens(family: PortraitFamily, binding: SurfaceBinding): string {
  if (family === "atmosphere") {
    return [
      "--ground:#0a0a14;",
      "--ground-soft:#101529;",
      "--ink:#f4f4f8;",
      "--ink-soft:#a3a3ba;",
      "--ink-faint:#6b6b85;",
      "--hairline:rgba(244,244,248,.14);",
      "--accent:#22d3ee;",
      "--accent-2:#d946ef;",
      "--accent-3:#34d399;",
      "--glass-fill:rgba(10,10,25,.48);",
      "--glass-border:rgba(34,211,238,.24);",
      rootScaleTokens("'Inter',-apple-system,BlinkMacSystemFont,sans-serif", "'IBM Plex Mono',ui-monospace,monospace", "'Inter',-apple-system,BlinkMacSystemFont,sans-serif"),
    ].join("\n");
  }
  if (family === "dark-product") {
    return [
      "--ground:#050505;",
      "--ground-soft:#111111;",
      "--ink:#ffffff;",
      "--ink-soft:#b8b8b2;",
      "--ink-faint:#6f6f6a;",
      "--hairline:rgba(255,255,255,.16);",
      "--accent:#c1401f;",
      rootScaleTokens("'Inter',-apple-system,BlinkMacSystemFont,sans-serif", "'IBM Plex Mono',ui-monospace,monospace", "'Fraunces',ui-serif,Georgia,serif"),
    ].join("\n");
  }
  const combined = (binding.surface + " " + Object.values(binding.design_notes).join(" ")).toLowerCase();
  const accent = /\b(accent none|zero hue|no hue|no color|monochrome)\b/.test(combined) ? "#141412" : "#c75b1e";
  return [
    "--ground:#faf7f2;",
    "--ground-soft:#f4f1ea;",
    "--ink:#141412;",
    "--ink-soft:#4a4742;",
    "--ink-faint:#7d7870;",
    "--hairline:rgba(20,20,18,.14);",
    "--accent:" + accent + ";",
    rootScaleTokens("'Inter',-apple-system,BlinkMacSystemFont,sans-serif", "'IBM Plex Mono',ui-monospace,monospace", "'Fraunces',ui-serif,Georgia,serif"),
  ].join("\n");
}

function rootScaleTokens(sans: string, mono: string, serif: string): string {
  return [
    "--font-sans:" + sans + ";",
    "--font-mono:" + mono + ";",
    "--font-serif:" + serif + ";",
    "--type-display:clamp(2.4rem,1.5rem + 4vw,5.25rem);",
    "--type-title:clamp(1.7rem,1.25rem + 1.6vw,2.8rem);",
    "--type-lede:clamp(1.05rem,1rem + .35vw,1.25rem);",
    "--type-body:1rem;",
    "--type-quote:clamp(1.35rem,1.1rem + 1vw,2rem);",
    "--type-caption:.8125rem;",
    "--type-micro:.75rem;",
    "--space-1:8px;",
    "--space-2:16px;",
    "--space-3:24px;",
    "--space-4:32px;",
    "--space-5:40px;",
    "--space-6:48px;",
    "--space-7:64px;",
    "--space-8:80px;",
    "--space-9:96px;",
    "--space-10:128px;",
    "--container:min(1180px,92vw);",
    "--ease:cubic-bezier(.16,.84,.44,1);",
  ].join("\n");
}

function commonCss(): string {
  return `
*,*::before,*::after{box-sizing:border-box}
html{background:var(--ground);color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--font-sans);font-size:var(--type-body);line-height:1.58;overflow-x:hidden}
p,h1,h2,h3,blockquote,dl,dd{margin:0}
.page-shell{width:var(--container);margin-inline:auto;position:relative;z-index:2}
.site-header,.site-footer{display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3);padding-block:var(--space-5);min-width:0}
.site-footer{border-top:1px solid var(--hairline);color:var(--ink-faint);font-family:var(--font-mono);font-size:var(--type-caption);margin-top:var(--space-8)}
.mono-label,.eyebrow,.source,.note-key,.meta-line,.spec,.law-num,dt{font-family:var(--font-mono);font-size:var(--type-micro);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint);font-style:normal}
.hero{padding:var(--space-7) 0 var(--space-10);max-width:880px}
.eyebrow{color:var(--accent);margin-bottom:var(--space-4)}
h1,h2{font-weight:650;letter-spacing:0;line-height:1.04}
h1{font-size:var(--type-display);max-width:13ch}
h2{font-size:var(--type-title)}
h3{font-size:var(--type-lede);font-weight:650;line-height:1.2}
.title-wrap{position:relative;display:inline-block;max-width:100%;overflow:hidden}
.curtain{position:absolute;inset:0;background:var(--ground);transform:translateX(101%);pointer-events:none}
.hero-quote{font-family:var(--font-serif);font-size:var(--type-quote);font-weight:500;line-height:1.32;color:var(--ink-soft);max-width:34ch;margin-top:var(--space-5)}
.source{display:block;margin-top:var(--space-2)}
.hero-lede{font-size:var(--type-lede);color:var(--ink-soft);max-width:46ch;margin-top:var(--space-5)}
.section{padding:var(--space-8) 0;border-top:1px solid var(--hairline)}
.note-grid,.law-grid,.spec-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-4);margin-top:var(--space-5)}
.note-card,.law-card,.decision-block,.spec-grid article{border:1px solid var(--hairline);background:var(--ground-soft);padding:var(--space-4);min-width:0}
.family-editorial-light .note-card,.family-editorial-light .law-card,.family-editorial-light .decision-block,.family-editorial-light .spec-grid article{background:transparent}
.note-key{color:var(--accent);margin-bottom:var(--space-3)}
.voice-card blockquote,.decision-block blockquote{font-family:var(--font-serif);font-size:var(--type-quote);line-height:1.35;color:var(--ink)}
.law-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.law-card p:not(.law-num):not(.meta-line){margin-top:var(--space-3);color:var(--ink-soft)}
.law-num{color:var(--ink);margin-bottom:var(--space-4);font-variant-numeric:tabular-nums}
.meta-line{margin-top:var(--space-4)}
.ledger-head{display:grid;grid-template-columns:88px 1fr 1fr;gap:var(--space-4);border-bottom:1px solid var(--hairline);padding-bottom:var(--space-2);margin-top:var(--space-5)}
.ledger-head span{font-family:var(--font-mono);font-size:var(--type-micro);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint)}
.correction-row{position:relative;overflow:hidden;border-bottom:1px solid var(--hairline)}
.row-inner{display:grid;grid-template-columns:88px 1fr 1fr;gap:var(--space-4);padding:var(--space-4) 0;align-items:start}
.row-num{font-size:var(--type-title);font-weight:750;font-variant-numeric:tabular-nums;line-height:1}
.wrong,.right{min-width:0}
.wrong p{font-family:var(--font-mono);color:var(--ink-faint);text-decoration-line:line-through;text-decoration-color:var(--accent);text-decoration-thickness:2px;text-underline-offset:2px;overflow-wrap:anywhere}
.right p{font-family:var(--font-mono);font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.quote{grid-column:1 / -1;padding-left:calc(88px + var(--space-4));font-family:var(--font-mono);font-size:var(--type-caption);font-style:italic;color:var(--ink-faint);max-width:76ch}
.quote span{font-style:normal;opacity:.8}
.wipe{position:absolute;inset:0;background:var(--ground);transform:scaleY(0);transform-origin:bottom;pointer-events:none;z-index:2}
.decision-stack{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-4);margin-top:var(--space-5)}
.decision-block dl{display:grid;gap:var(--space-3);margin-top:var(--space-4)}
.decision-block div{min-width:0}
dt{margin-bottom:var(--space-1)}
dd{color:var(--ink-soft);overflow-wrap:anywhere}
.swatches{display:grid;grid-template-columns:repeat(4,minmax(44px,1fr));gap:var(--space-2);margin-bottom:var(--space-3)}
.swatch{display:block;min-height:64px;border:1px solid var(--hairline)}
.swatch.ink{background:var(--ink)}
.swatch.soft{background:var(--ink-soft)}
.swatch.faint{background:var(--ink-faint)}
.swatch.accent{background:var(--accent)}
.type-sample{font-size:var(--type-title);font-weight:650;line-height:1.08;color:var(--ink)}
.quote-sample{font-family:var(--font-serif);font-size:var(--type-quote);color:var(--ink-soft);margin-top:var(--space-2)}
.spec{line-height:1.6;letter-spacing:.04em;text-transform:none}
@media (prefers-reduced-motion:no-preference){
  html.js-portrait .reveal-block.pre,html.js-portrait .reveal-row.pre .row-inner{opacity:0;transform:translateY(14px)}
  html.js-portrait .reveal-block.pre.in-view,html.js-portrait .reveal-row.pre.in-view .row-inner{opacity:1;transform:none;transition:opacity .55s var(--ease),transform .55s var(--ease)}
  html.js-portrait .reveal-title.pre .curtain{transform:translateX(0)}
  html.js-portrait .reveal-title.pre.in-view .curtain{transform:translateX(101%);transition:transform .72s var(--ease)}
  html.js-portrait .reveal-row.pre .wipe{transform:scaleY(1)}
  html.js-portrait .reveal-row.pre.in-view .wipe{transform:scaleY(0);transition:transform .62s var(--ease)}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none !important;animation:none !important}
  .curtain,.wipe{display:none !important}
}
@media (max-width:1024px){
  .note-grid,.law-grid,.spec-grid,.decision-stack{grid-template-columns:1fr}
}
@media (max-width:640px){
  .site-header,.site-footer{flex-direction:column;align-items:flex-start;gap:var(--space-1)}
  .hero{padding-top:var(--space-5)}
  .ledger-head{display:none}
  .row-inner{grid-template-columns:1fr;gap:var(--space-2)}
  .quote{padding-left:0}
}
`;
}

function atmosphereCss(): string {
  return `
body.family-atmosphere{background:
  radial-gradient(circle at 18% 10%,rgba(34,211,238,.24),transparent 32%),
  radial-gradient(circle at 85% 38%,rgba(217,70,239,.20),transparent 34%),
  radial-gradient(circle at 52% 82%,rgba(52,211,153,.15),transparent 36%),
  var(--ground)}
.atmosphere-field{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.orb{position:absolute;border-radius:50%;filter:blur(100px);opacity:.34}
.orb-one{width:360px;height:360px;right:6%;top:8%;background:var(--accent)}
.orb-two{width:430px;height:430px;right:2%;top:52%;background:var(--accent-2)}
.orb-three{width:300px;height:300px;left:6%;bottom:6%;background:var(--accent-3)}
.family-atmosphere .note-card,.family-atmosphere .law-card,.family-atmosphere .decision-block,.family-atmosphere .spec-grid article{background:var(--glass-fill);border-color:var(--glass-border);backdrop-filter:blur(18px) saturate(150%)}
@media (prefers-reduced-motion:no-preference){
  .orb-one{animation:drift-a 22s var(--ease) infinite alternate}
  .orb-two{animation:drift-b 26s var(--ease) infinite alternate}
  .orb-three{animation:drift-c 19s var(--ease) infinite alternate}
  @keyframes drift-a{to{transform:translate(48px,34px) scale(1.08)}}
  @keyframes drift-b{to{transform:translate(-52px,46px) scale(1.04)}}
  @keyframes drift-c{to{transform:translate(22px,-42px) scale(1.12)}}
}
@media (min-width:1600px){
  .orb{opacity:.44;filter:blur(120px)}
  .orb-one{width:520px;height:520px}
  .orb-two{width:620px;height:620px}
  .orb-three{width:420px;height:420px}
}
`;
}

function renderAtmosphereField(): string {
  return [
    "<div class=\"atmosphere-field\" aria-hidden=\"true\">",
    "<div class=\"orb orb-one\"></div>",
    "<div class=\"orb orb-two\"></div>",
    "<div class=\"orb orb-three\"></div>",
    "</div>",
  ].join("\n");
}

function renderMotionScript(family: PortraitFamily): string {
  const unusedFamily = family;
  void unusedFamily;
  return `<script>
(function(){
  "use strict";
  var reduce = false;
  try{ reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
  if(reduce) return;
  document.documentElement.classList.add("js-portrait");
  var targets = Array.prototype.slice.call(document.querySelectorAll(".reveal-block,.reveal-title,.reveal-row"));
  targets.forEach(function(el){ el.classList.add("pre"); });
  if(!("IntersectionObserver" in window)){
    targets.forEach(function(el){ el.classList.add("in-view"); });
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add("in-view");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
  targets.forEach(function(el){ io.observe(el); });
  setTimeout(function(){ targets.forEach(function(el){ el.classList.add("in-view"); }); }, 4000);
})();
</script>`;
}

function renderGalleryIndex(profileName: string, files: { path: string; surface: string; project: string }[], bindings: SurfaceBinding[], generatedAt: string): string {
  const rows = files.map(function(file, index) {
    const binding = bindings[index];
    const family = binding ? familyLabel(chooseFamily(binding)) : "taste surface";
    const href = file.path.split("/").pop() || file.path;
    return [
      "<li>",
      "<a href=\"" + escapeAttribute(href) + "\">",
      "<span class=\"num\">" + pad2(index + 1) + "</span>",
      "<span class=\"t\">" + escapeHtml(file.project) + "</span>",
      "<span class=\"d\">" + escapeHtml(file.surface) + " · " + escapeHtml(family) + "</span>",
      "</a>",
      "</li>",
    ].join("");
  }).join("\n");

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>" + escapeHtml(profileName) + " taste portraits</title>",
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
    "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
    "<link href=\"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap\" rel=\"stylesheet\">",
    "<style>",
    galleryCss(),
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<header>",
    "<p class=\"kicker\">" + escapeHtml(profileName) + " · generated Raven portraits</p>",
    "<h1>Bound taste surfaces</h1>",
    "<p class=\"lede\">Taste is per-surface. Same eye, different room.</p>",
    "</header>",
    "<ol>",
    rows,
    "</ol>",
    "<footer>Generated by Raven · " + escapeHtml(profileName) + " · " + escapeHtml(generatedAt) + " · " + String(files.length) + " surfaces</footer>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function galleryCss(): string {
  return `
:root{--bg:#101012;--ink:#e8e6e1;--ink-strong:#ffffff;--ink-mid:#8f8d88;--ink-faint:#55534f;--rule:rgba(232,230,225,.12);--font-sans:'Inter',-apple-system,sans-serif;--font-mono:'IBM Plex Mono',ui-monospace,monospace;--font-serif:'Fraunces',ui-serif,serif;--type-display:clamp(2.2rem,5vw,3.6rem);--type-title:clamp(1.25rem,2.2vw,1.6rem);--type-body:1rem;--type-caption:.78rem;--space-1:8px;--space-2:16px;--space-3:24px;--space-4:32px;--space-6:48px;--space-8:64px;--space-12:96px;--container:min(960px,92vw);--ease:cubic-bezier(.16,.84,.44,1)}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--font-sans);font-size:var(--type-body);line-height:1.55;-webkit-font-smoothing:antialiased}
main{width:var(--container);margin:0 auto;padding:var(--space-12) 0}
header{margin-bottom:var(--space-12)}
.kicker{font-family:var(--font-mono);font-size:var(--type-caption);color:var(--ink-mid);letter-spacing:.08em;margin-bottom:var(--space-3)}
h1{font-size:var(--type-display);font-weight:600;letter-spacing:0;line-height:1.08;margin-bottom:var(--space-3)}
.lede{font-family:var(--font-serif);font-size:var(--type-title);font-weight:500;color:var(--ink-mid);max-width:34ch;letter-spacing:0}
ol{list-style:none;border-top:1px solid var(--rule)}
li a{display:grid;grid-template-columns:72px 1fr auto;gap:var(--space-3);align-items:baseline;min-height:44px;padding:var(--space-4) 0;border-bottom:1px solid var(--rule);text-decoration:none;color:inherit;transition:padding-left .25s var(--ease)}
li a:hover{padding-left:var(--space-2)}
li a:hover .t{color:var(--ink-strong)}
.num{font-family:var(--font-mono);font-size:var(--type-caption);color:var(--ink-faint)}
.t{font-size:var(--type-title);font-weight:500;letter-spacing:0;transition:color .25s var(--ease);min-width:0}
.d{font-family:var(--font-mono);font-size:var(--type-caption);color:var(--ink-mid);text-align:right;min-width:0}
footer{margin-top:var(--space-12);font-family:var(--font-mono);font-size:var(--type-caption);color:var(--ink-faint)}
@media(max-width:640px){li a{grid-template-columns:48px 1fr}.d{grid-column:2;font-size:.72rem;text-align:left}}
@media(prefers-reduced-motion:no-preference){li{opacity:0;transform:translateY(8px);animation:rise .5s var(--ease) forwards}li:nth-child(1){animation-delay:.05s}li:nth-child(2){animation-delay:.1s}li:nth-child(3){animation-delay:.15s}li:nth-child(4){animation-delay:.2s}li:nth-child(5){animation-delay:.25s}li:nth-child(6){animation-delay:.3s}@keyframes rise{to{opacity:1;transform:none}}}
`;
}

function safeFilename(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "taste-surface";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
