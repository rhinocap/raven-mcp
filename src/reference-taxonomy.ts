export interface TaxonomyEntry {
  id: string;
  label: string;
  aliases: string[];
  surface?: string[];
}

// Words that carry no pattern intent. They are DROPPED, not down-weighted, and
// that distinction is the whole point: search matches a term against a field by
// word-start, and before this existed "in" and "a" were emitted as ordinary
// query terms at full exact-match weight.
//
// Measured on a three-record corpus (a scroll cue, a pricing table, a footer),
// the query "scroll cue in a hero" matched 3 of 3 and ranked `.pricing-table`
// at 7.0 ABOVE the `.scroll-cue` record it actually named at 6.9 — "in" is
// inside "pricing", "a" is inside "annual", both scored as exact hits, while
// the one correct record reached its tag through an alias and paid the 0.1
// alias penalty. The penalty was punishing the right answer. A stop word that
// survives into the term list makes every query match the entire corpus, which
// is indistinguishable from having no search at all.
//
// Only words consumed as STANDALONE tokens are dropped. Phrase resolution runs
// first, so a stop word inside a recognized alias ("cmd k menu") is already
// atomic by the time this applies and is never split out.
export var QUERY_STOP_WORDS = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "but", "by", "can", "do",
  "for", "from", "has", "have", "how", "i", "if", "in", "into", "is", "it",
  "its", "like", "me", "my", "of", "on", "or", "show", "some", "that", "the",
  "their", "them", "then", "there", "these", "this", "to", "us", "was", "we",
  "what", "when", "which", "with", "you", "your",
]);

export function isStopWord(word: string): boolean {
  return QUERY_STOP_WORDS.has(word);
}

// The JSON pattern library names page-level categories; captured references are
// individual elements inside those pages. Both grains are useful, so this finer
// vocabulary reuses the library's language without pretending they are the same.
export var PATTERN_TAXONOMY: TaxonomyEntry[] = [
  { id: "scroll-cue", label: "Scroll cue", aliases: ["scroll indicator", "scroll hint", "mouse wheel icon", "scrolling mouse icon", "scroll down arrow", "scroll prompt", "mouse scroll"], surface: ["hero", "landing-page"] },
  { id: "hero", label: "Hero section", aliases: ["hero", "hero image", "hero banner", "masthead"], surface: ["landing-page"] },
  { id: "sticky-nav", label: "Sticky navigation", aliases: ["sticky nav", "fixed navigation", "persistent header", "sticky header"], surface: ["navigation"] },
  { id: "top-nav", label: "Top navigation bar", aliases: ["top nav", "navbar", "site header", "header navigation"], surface: ["navigation"] },
  { id: "sidebar-nav", label: "Sidebar navigation", aliases: ["sidebar", "side nav", "left navigation", "navigation rail"], surface: ["navigation", "dashboard"] },
  { id: "breadcrumbs", label: "Breadcrumbs", aliases: ["breadcrumb trail", "page trail", "hierarchy path"], surface: ["navigation"] },
  { id: "command-palette", label: "Command palette", aliases: ["command menu", "quick actions", "keyboard launcher", "cmd k menu"], surface: ["navigation"] },
  { id: "dropdown-menu", label: "Dropdown menu", aliases: ["select menu", "action menu", "overflow menu", "context menu"], surface: ["dropdown-menu"] },
  { id: "mobile-menu", label: "Mobile menu", aliases: ["hamburger menu", "mobile nav", "navigation drawer", "off canvas menu"], surface: ["navigation", "mobile-conversion"] },
  { id: "cta-button", label: "Call to action button", aliases: ["cta", "primary button", "action button", "conversion button"], surface: ["cta", "landing-page"] },
  { id: "sticky-cta", label: "Sticky call to action", aliases: ["sticky cta", "fixed cta", "sticky mobile cta", "floating action bar"], surface: ["cta", "mobile-conversion"] },
  { id: "pricing-card", label: "Pricing card", aliases: ["plan card", "pricing tier", "subscription card", "recommended plan"], surface: ["pricing-page"] },
  { id: "pricing-toggle", label: "Pricing toggle", aliases: ["billing toggle", "annual monthly toggle", "billing period switch", "monthly yearly switch"], surface: ["pricing-page"] },
  { id: "comparison-table", label: "Feature comparison table", aliases: ["pricing comparison", "plan comparison", "feature matrix", "comparison grid"], surface: ["pricing-page"] },
  { id: "testimonial", label: "Testimonial", aliases: ["customer quote", "user quote", "testimonial card", "customer story"], surface: ["social-proof"] },
  { id: "testimonial-marquee", label: "Testimonial marquee", aliases: ["testimonial carousel", "quote carousel", "testimonial slider", "scrolling testimonials"], surface: ["social-proof"] },
  { id: "logo-cloud", label: "Customer logo cloud", aliases: ["customer logos", "client logos", "logo wall", "trusted by logos"], surface: ["social-proof", "landing-page"] },
  { id: "star-rating", label: "Star rating", aliases: ["review stars", "rating stars", "aggregate rating", "customer rating"], surface: ["social-proof"] },
  { id: "signup-form", label: "Signup form", aliases: ["registration form", "create account form", "sign up fields", "account creation"], surface: ["forms", "signup-flow"] },
  { id: "social-login", label: "Social login", aliases: ["sign in with google", "oauth login", "third party login", "social sign in"], surface: ["signup-flow"] },
  { id: "stepper", label: "Step-through flow", aliases: ["form stepper", "multi step form", "progress steps", "wizard steps"], surface: ["forms", "signup-flow"] },
  { id: "inline-validation", label: "Inline validation", aliases: ["field validation", "validation message", "input error", "form feedback"], surface: ["forms"] },
  { id: "empty-state", label: "Empty state", aliases: ["blank state", "first use state", "no content state", "zero data state"], surface: ["empty-states", "dashboard"] },
  { id: "no-results", label: "No results state", aliases: ["no matches", "empty search results", "nothing found", "zero results"], surface: ["empty-states"] },
  { id: "error-message", label: "Error message", aliases: ["error alert", "failure message", "error notice", "problem message"], surface: ["error-states"] },
  { id: "error-page", label: "Error page", aliases: ["404 page", "500 page", "not found page", "server error page"], surface: ["error-states"] },
  { id: "skeleton-loader", label: "Skeleton screen", aliases: ["skeleton loader", "loading skeleton", "content placeholder", "shimmer loader"], surface: ["loading-states"] },
  { id: "progress-indicator", label: "Progress indicator", aliases: ["loading indicator", "progress bar", "spinner", "loading progress"], surface: ["loading-states"] },
  { id: "modal", label: "Modal dialog", aliases: ["dialog", "overlay dialog", "popup modal", "form modal"], surface: ["modals-dialogs"] },
  { id: "confirmation-dialog", label: "Confirmation dialog", aliases: ["confirm modal", "confirmation modal", "are you sure dialog", "destructive confirmation"], surface: ["modals-dialogs"] },
  { id: "toast", label: "Toast notification", aliases: ["snackbar", "status toast", "success message", "temporary notification"], surface: ["modals-dialogs"] },
  { id: "bottom-sheet", label: "Bottom sheet", aliases: ["action sheet", "mobile sheet", "slide up panel", "bottom drawer"], surface: ["mobile-conversion"] },
  { id: "kpi-card", label: "KPI card", aliases: ["metric card", "stat card", "dashboard metric", "summary card"], surface: ["dashboard"] },
  { id: "activity-feed", label: "Activity feed", aliases: ["recent activity", "event feed", "updates feed", "audit feed"], surface: ["dashboard"] },
  { id: "feature-block", label: "Feature block", aliases: ["feature section", "benefit block", "feature row", "product feature"], surface: ["landing-page"] },
  { id: "footer-cta", label: "Final call to action", aliases: ["final cta", "bottom cta", "closing cta", "footer conversion"], surface: ["cta", "landing-page"] },
];

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function entryTerms(entry: TaxonomyEntry): string[] {
  return [entry.id, entry.label].concat(entry.aliases);
}

export function resolveTaxonomy(term: string): TaxonomyEntry[] {
  var target = normalized(term);
  if (!target) return [];
  return PATTERN_TAXONOMY.filter(function(entry) {
    return entryTerms(entry).some(function(candidate) { return normalized(candidate) === target; });
  });
}

export function expandQuery(query: string): string[] {
  var words = normalized(query).split(" ").filter(Boolean);
  var phrases = PATTERN_TAXONOMY.flatMap(function(entry) {
    return entryTerms(entry).map(function(term) { return normalized(term); });
  }).filter(Boolean).sort(function(a, b) { return b.split(" ").length - a.split(" ").length; });
  // Bare query words seed the term list, minus stop words — see QUERY_STOP_WORDS
  // for the measurement that made this mandatory rather than tidy.
  var terms: string[] = words.filter(function(word) { return !isStopWord(word); });
  var i = 0;
  while (i < words.length) {
    var phrase = phrases.find(function(candidate) {
      var parts = candidate.split(" ");
      return parts.every(function(part, offset) { return words[i + offset] === part; });
    });
    if (!phrase) {
      i += 1;
      continue;
    }
    // A recognized phrase is atomic from here on — its own words are never
    // re-tested as stop words, which is why "cmd k menu" survives intact.
    terms.push(phrase);
    for (var entry of resolveTaxonomy(phrase)) terms.push(...entryTerms(entry).map(normalized));
    i += phrase.split(" ").length;
  }
  return Array.from(new Set(terms.filter(Boolean)));
}
