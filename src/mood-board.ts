// Compose a mood board from what the taste engine already holds.
//
// A mood board is the taste interview made LOOKABLE: the binding's design notes
// as chips, the reference sites the person pointed to, and the pattern-library
// thumbnails captured from those same sites, on one self-contained page. It
// exists for the kickoff moment — "get a mood board going" — and for the
// inverse move: showing an EXAMPLE board to someone who has never made one, to
// get their thinking started before the interview binds anything.
//
// Three properties are deliberate and load-bearing:
//
//   1. SELF-CONTAINED. No scripts, no external resource loads. Pattern PNGs are
//      embedded as data URIs read from the local corpus; reference URLs appear
//      as text and plain anchors (a link is navigation the reader chooses, not
//      a load the document performs). The board must render identically opened
//      from disk years later, offline, which is the same property the reference
//      thumbnails themselves hold.
//   2. NOTHING INVENTED. Note text is rendered as text — never converted into
//      color swatches, because a hex value derived from the prose "warm cream"
//      would be this module's own guess wearing the user's clothes. The only
//      visual the board takes a position on is its ground (light or dark), and
//      that comes from the captured references' MEASURED scheme traits, never
//      from prose.
//   3. APPROVAL STOP. The board names generate_design_system as the next step
//      and never runs it. The design system is the core output of the taste
//      engine, and a mood board is the moment a human looks and says "yes,
//      that" — generating past that look would delete the reason to look.
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getTasteProfile,
  resolveSurfaceBinding,
  type SurfaceBinding,
} from "./taste.js";
import { tasteHome, type TasteStore } from "./taste-store.js";
import {
  referenceAttribution,
  referenceImagePath,
  searchReferences,
  type PatternReference,
} from "./reference-store.js";
import { launchAuditChromium } from "./browser-launch.js";

// Data-URI embedding is bounded so a corpus of full-page captures cannot write
// a hundred-megabyte board. Per-image and total caps; whatever is skipped is
// named in warnings rather than silently absent.
const MAX_EMBED_IMAGE_BYTES = 2_500_000;
const MAX_EMBED_TOTAL_BYTES = 8_000_000;
const RENDER_TIMEOUT_MS = 15000;
const RENDER_VIEWPORT_WIDTH = 1280;

export type MoodBoardMode = "board" | "example";

export type MoodBoardInput = {
  store: TasteStore;
  profile: string;
  project?: string;
  mode?: MoodBoardMode;
  output_dir?: string;
};

export type MoodBoardResult = {
  html_path: string;
  // Best-effort full-page PNG of the board itself, rendered offline. null when
  // chromium is unavailable or the render failed — the HTML is the deliverable
  // and must never be lost to a missing browser.
  image_path: string | null;
  example: boolean;
  counts: { notes: number; references: number; patterns: number };
  warnings: string[];
  // The approval stop, stated on the result as well as in the document footer.
  next: string;
};

export type MoodBoardPattern = {
  credit: string;
  source_url: string;
  note?: string;
  png_data_uri?: string;
  width?: number;
  height?: number;
};

export type MoodBoardData = {
  profile: string;
  project: string;
  surface: string;
  generated_at: string;
  example: boolean;
  ground: "light" | "dark";
  voice_note: string;
  notes: { key: string; text: string }[];
  references: { url: string; liked?: string; scheme?: string }[];
  patterns: MoodBoardPattern[];
};

const NEXT_STEP =
  "Look at the board with the user. When they say the direction is right, generate_design_system is the next step — the design system is the core output the taste engine builds toward. Never run it from here without that yes; the board exists so a human can look first.";

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only http(s) URLs become anchors; anything else (javascript:, file:, a bare
// note masquerading as a URL) renders as inert text. The board is opened from
// disk in a browser, so an href is the one place stored third-party text could
// become an action.
function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    return null;
  } catch {
    return null;
  }
}

function safeFilename(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "mood-board";
}

// The ground is the one visual decision the board makes, and it is a
// MEASUREMENT: majority scheme across the binding's captured reference traits.
// No traits, or a tie, defaults light. Prose in design_notes.color never votes
// — see property 2.
export function moodBoardGround(binding: Pick<SurfaceBinding, "references">): "light" | "dark" {
  let dark = 0;
  let light = 0;
  for (const ref of binding.references || []) {
    const scheme = ref.traits ? ref.traits.scheme : undefined;
    if (scheme === "dark") dark += 1;
    else if (scheme === "light") light += 1;
  }
  return dark > light ? "dark" : "light";
}

// Pure document builder — no filesystem, no store, no browser. Everything the
// board shows arrives in `data`, already gathered, so this function can be
// held to the self-containment property in a test with nothing mocked.
export function buildMoodBoardDocument(data: MoodBoardData): string {
  const dark = data.ground === "dark";
  const bg = dark ? "#101014" : "#faf9f7";
  const ink = dark ? "#f2f0ec" : "#1a1a1e";
  const dim = dark ? "#9a97a0" : "#6f6c75";
  const line = dark ? "#2a2a31" : "#e4e1dc";
  const card = dark ? "#18181d" : "#ffffff";

  const chips = data.notes.map(function (note) {
    return '<div class="note"><span class="note-key">' + escapeHtml(note.key) + "</span>"
      + '<span class="note-text">' + escapeHtml(note.text) + "</span></div>";
  }).join("");

  const referenceRows = data.references.map(function (ref) {
    const href = safeHref(ref.url);
    const label = href !== null
      ? '<a href="' + escapeHtml(href) + '">' + escapeHtml(ref.url) + "</a>"
      : escapeHtml(ref.url);
    const liked = ref.liked ? '<span class="ref-liked">' + escapeHtml(ref.liked) + "</span>" : "";
    const scheme = ref.scheme ? '<span class="ref-scheme">' + escapeHtml(ref.scheme) + "</span>" : "";
    return '<div class="ref">' + label + scheme + liked + "</div>";
  }).join("");

  const patternCards = data.patterns.map(function (pattern) {
    // The picture and its credit are one unit — same rule as search_references'
    // nested display object: a pattern is never shown without where it came from.
    // escapeHtml on the data URI too, not just the alt text: the module's own
    // producer only ever builds base64 (which escaping passes through
    // untouched), but this builder is EXPORTED and pure — the self-containment
    // property must hold against any caller's data, not ride on a type-level
    // invariant the runtime never checks. (Kimi adverse pass, 2026-08-07.)
    const picture = pattern.png_data_uri
      ? '<img class="pattern-img" alt="' + escapeHtml(pattern.credit) + '" src="' + escapeHtml(pattern.png_data_uri) + '">'
      : '<div class="pattern-missing">thumbnail not rendered — the record keeps its styles and markup</div>';
    const note = pattern.note ? '<div class="pattern-note">' + escapeHtml(pattern.note) + "</div>" : "";
    return '<figure class="pattern">' + picture + note
      + '<figcaption class="pattern-credit">' + escapeHtml(pattern.credit) + "</figcaption></figure>";
  }).join("");

  const exampleBanner = data.example
    ? '<div class="example-banner">EXAMPLE — this is a sample mood board, not your project. Yours is composed from the references and patterns you actually capture.</div>'
    : "";

  // "Measured from references" is a claim, and with zero scheme-bearing
  // references nothing was measured — the ground is a default and the meta
  // line must say which. (Kimi adverse pass, 2026-08-07: the old line printed
  // "measured" unconditionally.)
  const schemeVotes = data.references.filter(function (ref) {
    return ref.scheme === "dark" || ref.scheme === "light";
  }).length;
  const groundProvenance = schemeVotes > 0
    ? "(measured from references)"
    : "(default — no reference schemes to measure)";

  return "<!doctype html><html><head><meta charset=\"utf-8\">"
    + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
    + "<title>" + escapeHtml(data.project) + " — mood board</title>"
    + "<style>"
    + "html,body{margin:0;padding:0;background:" + bg + ";color:" + ink + ";font:16px/1.55 system-ui,-apple-system,sans-serif;}"
    + "main{max-width:1080px;margin:0 auto;padding:56px 32px 72px;}"
    + ".example-banner{border:1px solid " + line + ";color:" + dim + ";padding:10px 14px;font-size:13px;letter-spacing:.04em;margin-bottom:36px;}"
    + "h1{font-size:34px;line-height:1.15;margin:0 0 6px;font-weight:650;}"
    + ".meta{color:" + dim + ";font-size:14px;margin-bottom:44px;}"
    + "h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:" + dim + ";margin:44px 0 16px;font-weight:600;}"
    + ".notes{display:flex;flex-wrap:wrap;gap:10px;}"
    + ".note{border:1px solid " + line + ";background:" + card + ";padding:10px 14px;max-width:480px;}"
    + ".note-key{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:" + dim + ";margin-bottom:2px;}"
    + ".note-text{font-size:14px;}"
    + ".voice{border-left:2px solid " + line + ";padding:4px 0 4px 16px;color:" + ink + ";font-size:15px;}"
    + ".ref{padding:10px 0;border-bottom:1px solid " + line + ";font-size:14px;}"
    + ".ref a{color:" + ink + ";}"
    + ".ref-liked{display:block;color:" + dim + ";margin-top:2px;}"
    + ".ref-scheme{margin-left:10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:" + dim + ";}"
    + ".patterns{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;}"
    + ".pattern{margin:0;border:1px solid " + line + ";background:" + card + ";padding:12px;}"
    + ".pattern-img{display:block;max-width:100%;height:auto;}"
    + ".pattern-missing{color:" + dim + ";font-size:13px;padding:28px 8px;text-align:center;border:1px dashed " + line + ";}"
    + ".pattern-note{font-size:13px;margin-top:8px;}"
    + ".pattern-credit{font-size:12px;color:" + dim + ";margin-top:8px;}"
    + "footer{margin-top:56px;padding-top:20px;border-top:1px solid " + line + ";color:" + dim + ";font-size:13px;}"
    + "</style></head><body><main>"
    + exampleBanner
    + "<h1>" + escapeHtml(data.project) + "</h1>"
    + '<div class="meta">' + escapeHtml(data.surface) + " · profile " + escapeHtml(data.profile) + " · " + escapeHtml(data.generated_at) + " · " + escapeHtml(data.ground) + " ground " + groundProvenance + "</div>"
    + (data.notes.length > 0 ? "<h2>Design notes</h2><div class=\"notes\">" + chips + "</div>" : "")
    + (data.voice_note.length > 0 ? "<h2>Voice</h2><div class=\"voice\">" + escapeHtml(data.voice_note) + "</div>" : "")
    + (data.references.length > 0 ? "<h2>References</h2>" + referenceRows : "")
    + (data.patterns.length > 0 ? "<h2>Captured patterns</h2><div class=\"patterns\">" + patternCards + "</div>" : "")
    + "<footer>Next step, when this direction feels right: generate_design_system — the taste engine's core output. This board never runs it; a human looks first.</footer>"
    + "</main></body></html>";
}

// The example board is canned and clearly labeled — its job is to show someone
// who has never made a mood board what one looks like, so the interview's
// "want to make one?" question lands on a picture instead of an abstraction.
// No pattern images: an example must not fabricate captures, so its pattern
// cards show the placeholder state honestly.
export function exampleMoodBoardData(profile: string, generatedAt: string): MoodBoardData {
  return {
    profile: profile,
    project: "Example — a night-sky analytics product",
    surface: "product marketing site (example)",
    generated_at: generatedAt,
    example: true,
    ground: "dark",
    voice_note: "Punchy-editorial. Short declaratives. Numbers speak, adjectives stay home.",
    notes: [
      { key: "typography", text: "Grotesque display over a quiet humanist body; one dramatic size jump at the hero, restrained everywhere else." },
      { key: "color", text: "Near-black ground, exactly one electric accent used as punctuation — never as fills." },
      { key: "motion", text: "Subtle: fades and small rises under 400ms. Charts may draw in; chrome never moves." },
      { key: "special", text: "A faint star-field texture behind the hero only — dots, not lines." },
    ],
    references: [
      // Both example references are dark on purpose: the example declares a
      // dark ground, and under moodBoardGround's own rule a 1-1 tie would read
      // light — a canned board must not contradict the policy it demonstrates.
      { url: "https://linear.app", liked: "The restraint — dark ground carried by type and spacing, not effects.", scheme: "dark" },
      { url: "https://vercel.com", liked: "Dense technical content on a near-black ground that still breathes.", scheme: "dark" },
    ],
    patterns: [
      { credit: "Pattern from linear.app — https://linear.app (example placeholder)", source_url: "https://linear.app" },
      { credit: "Pattern from vercel.com — https://vercel.com (example placeholder)", source_url: "https://vercel.com" },
    ],
  };
}

// Best-effort PNG of the board, rendered with the same offline discipline as
// reference thumbnails: scripting off, service workers blocked, every network
// request aborted. The board is self-contained by construction, so the route
// abort should never fire — it is the guard that keeps that claim honest even
// if a future edit slips an external load in. Null on every failure.
async function renderBoardImage(html: string): Promise<Uint8Array | null> {
  let browser: any = null;
  try {
    browser = await launchAuditChromium();
    const page = await browser.newPage({
      viewport: { width: RENDER_VIEWPORT_WIDTH, height: 900 },
      deviceScaleFactor: 2,
      javaScriptEnabled: false,
      serviceWorkers: "block",
    });
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    await page.route("**/*", function (route: any) {
      route.abort().catch(function () { /* already tearing down */ });
    });
    await page.setContent(html, { waitUntil: "load" });
    const png: Uint8Array = await page.screenshot({ type: "png", fullPage: true });
    if (!png || png.length === 0) return null;
    return png;
  } catch {
    return null;
  } finally {
    if (browser !== null) {
      try {
        await browser.close();
      } catch {
        // The PNG must never be the reason the board reports an error.
      }
    }
  }
}

function embeddablePatterns(
  hosts: string[],
  warnings: string[],
): MoodBoardPattern[] {
  const patterns: MoodBoardPattern[] = [];
  const seen = new Set<string>();
  let embeddedBytes = 0;
  for (const host of hosts) {
    let found;
    try {
      found = searchReferences({ host: host });
    } catch (error) {
      warnings.push("Pattern search for host '" + host + "' failed: " + String(error instanceof Error ? error.message : error));
      continue;
    }
    for (const hit of found.results) {
      const reference: PatternReference = hit.reference;
      if (seen.has(reference.ref_id)) continue;
      seen.add(reference.ref_id);
      const attribution = referenceAttribution(reference);
      const pattern: MoodBoardPattern = {
        credit: attribution.credit,
        source_url: attribution.source_url,
      };
      if (reference.note) pattern.note = reference.note;
      if (reference.image) {
        // The record names a file; the disk answers whether it is a picture.
        // statSync().isFile(), not existsSync — a directory at the image path
        // is this codebase's own known failure shape and must read as absent.
        // Belt-and-braces, stated honestly: even without this check the
        // directory case lands in the catch below (readFileSync on a directory
        // throws EISDIR), so no test can turn exactly this clause red — it
        // exists to make the intent explicit, not to change the output.
        const imagePath = referenceImagePath(reference.ref_id);
        try {
          if (statSync(imagePath).isFile()) {
            const bytes = readFileSync(imagePath);
            if (bytes.length > MAX_EMBED_IMAGE_BYTES) {
              warnings.push("Pattern " + reference.ref_id + " thumbnail (" + bytes.length + " bytes) exceeds the per-image embed cap and is shown as a placeholder.");
            } else if (embeddedBytes + bytes.length > MAX_EMBED_TOTAL_BYTES) {
              warnings.push("Pattern " + reference.ref_id + " thumbnail skipped: the board reached its total embed budget.");
            } else {
              embeddedBytes += bytes.length;
              pattern.png_data_uri = "data:image/png;base64," + bytes.toString("base64");
              pattern.width = reference.image.width;
              pattern.height = reference.image.height;
            }
          } else {
            warnings.push("Pattern " + reference.ref_id + " record names a thumbnail but nothing usable is at its path — shown as a placeholder.");
          }
        } catch {
          // "Never a silent drop" covers this path too: a record whose image
          // field is set but whose file is gone (deleted, corpus copied
          // without images) used to fall through here with no warning while
          // the result looked healthy. (Kimi adverse pass, 2026-08-07.)
          warnings.push("Pattern " + reference.ref_id + " record names a thumbnail but nothing usable is at its path — shown as a placeholder.");
        }
      }
      patterns.push(pattern);
    }
    if (found.skipped.length > 0) {
      warnings.push("Pattern corpus for host '" + host + "': " + found.skipped.length + " unreadable record(s) skipped.");
    }
  }
  return patterns;
}

function referenceHosts(binding: SurfaceBinding): string[] {
  const hosts: string[] = [];
  for (const ref of binding.references || []) {
    try {
      const host = new URL(ref.url).hostname.toLowerCase();
      if (host.length > 0 && hosts.indexOf(host) === -1) hosts.push(host);
    } catch {
      // A reference that never parsed as a URL cannot have captures filed under
      // a host; it still appears in the references section as text.
    }
  }
  return hosts;
}

export async function generateMoodBoard(input: MoodBoardInput): Promise<MoodBoardResult> {
  if (typeof input.profile !== "string" || input.profile.trim().length === 0) {
    throw new Error("profile is required");
  }
  const mode: MoodBoardMode = input.mode === "example" ? "example" : "board";
  const profile = await getTasteProfile(input.store, input.profile.trim());
  const warnings: string[] = [];
  const generatedAt = new Date().toISOString();

  let data: MoodBoardData;
  let fileStem: string;
  if (mode === "example") {
    data = exampleMoodBoardData(profile.name, generatedAt);
    fileStem = safeFilename(profile.name) + "--example";
  } else {
    const project = typeof input.project === "string" ? input.project.trim() : "";
    if (project.length === 0) {
      throw new Error("project is required for mode:'board' (pass mode:'example' for the sample board)");
    }
    const binding = await resolveSurfaceBinding(input.store, profile.name, { project: project });
    if (!binding) {
      throw new Error(
        "No surface binding for project '" + project + "' on profile '" + profile.name +
        "' — run get_taste_interview (mode:'kickoff') and bind_taste_surface first; a mood board is composed FROM the binding's notes and references."
      );
    }
    const notes = Object.keys(binding.design_notes).map(function (key) {
      return { key: key, text: binding.design_notes[key] };
    }).filter(function (note) { return note.text.trim().length > 0; });
    const references = (binding.references || []).map(function (ref) {
      const row: { url: string; liked?: string; scheme?: string } = { url: ref.url };
      if (ref.liked) row.liked = ref.liked;
      if (ref.traits && ref.traits.scheme !== "unknown") row.scheme = ref.traits.scheme;
      return row;
    });
    const patterns = embeddablePatterns(referenceHosts(binding), warnings);
    if (notes.length === 0 && references.length === 0 && patterns.length === 0) {
      warnings.push("The binding for '" + binding.project + "' has no design notes, references, or captured patterns yet — the board is a header and a next step. Deepen the interview (more_questions) or capture references first.");
    }
    data = {
      profile: profile.name,
      project: binding.project,
      surface: binding.surface,
      generated_at: generatedAt,
      example: false,
      ground: moodBoardGround(binding),
      voice_note: binding.voice_note,
      notes: notes,
      references: references,
      patterns: patterns,
    };
    // safeFilename is lossy on purpose, and the collision it allows is
    // ACCEPTED: projects "a/b" and "a b" (or two all-punctuation names) land
    // on the same stem and silently overwrite each other's board. The board is
    // a regenerable artifact — one generate_mood_board call away from the
    // binding it was composed from — so a naming scheme (hash suffixes) would
    // trade legibility of every ordinary filename against a loss that costs
    // one re-run. Reopen if boards ever accumulate un-recomposable state.
    fileStem = safeFilename(profile.name) + "--" + safeFilename(binding.project);
  }

  // output_dir is honored wherever it points — this is a LOCAL stdio tool
  // writing to the caller's own disk (same contract as every other file-
  // writing tool here), and the remote endpoint never sees it:
  // generate_mood_board is in REMOTE_GATED_TOOLS.
  const outputDir = typeof input.output_dir === "string" && input.output_dir.trim().length > 0
    ? resolve(input.output_dir)
    : join(tasteHome(), "moodboards");
  mkdirSync(outputDir, { recursive: true });

  const html = buildMoodBoardDocument(data);
  const htmlPath = join(outputDir, fileStem + ".html");
  writeFileSync(htmlPath, html, "utf8");

  let imagePath: string | null = null;
  const png = await renderBoardImage(html);
  if (png !== null) {
    imagePath = join(outputDir, fileStem + ".png");
    try {
      writeFileSync(imagePath, png);
    } catch (error) {
      imagePath = null;
      warnings.push("Board PNG could not be written: " + String(error instanceof Error ? error.message : error));
    }
  } else {
    warnings.push("Board PNG not rendered (no usable chromium, or the render failed) — the HTML file is complete on its own.");
  }

  return {
    html_path: htmlPath,
    image_path: imagePath,
    example: mode === "example",
    counts: { notes: data.notes.length, references: data.references.length, patterns: data.patterns.length },
    warnings: warnings,
    next: NEXT_STEP,
  };
}
