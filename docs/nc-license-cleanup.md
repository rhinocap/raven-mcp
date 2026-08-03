# NonCommercial-source cleanup — src/data/

**Date:** 2026-08-02
**Why:** `NOTICE` declared two upstream sources licensed for non-commercial use only —
Laws of UX (lawsofux.com, CC BY-NC-ND 4.0) and the Mailchimp Content Style Guide
(styleguide.mailchimp.com, CC BY-NC 4.0). The underlying *concepts* (Fitts's Law,
plain-language writing, etc.) are public academic and professional knowledge and stay;
anything traceable to those two sources' *expression* — their phrasing, groupings, and
taxonomies — has been removed or rewritten from primary sources. After this change,
nothing in the repository derives from a non-commercially-licensed source.

## Per-file changes

### `src/data/principles/laws-of-ux.json`
- **NC-derived:** all 21 `summary` fields carried lawsofux.com's one-line law statements
  near-verbatim (e.g. "The time to acquire a target is a function of the distance to and
  size of the target."). Descriptions and `sources` were already original and cited primary
  literature; no lawsofux.com URL appeared in the file.
- **Replaced with:** 21 original one-line summaries written from the literature each
  entry already cites — primary papers where one exists (Fitts 1954, Hick 1952 / Hyman
  1953, Miller 1956, Doherty & Thadani 1982, Kahneman et al. 1993, Wertheimer 1923,
  Palmer 1992, Palmer & Rock 1994, von Restorff 1933, Zeigarnik 1927, Hull 1932,
  Ebbinghaus 1885, Postel RFC 761/793, Parkinson 1955, Pareto 1896, Nielsen 2000), and
  the earliest documented attribution for the two principles with no primary paper
  (Tesler's Law, c. 1984, via Saffer 2010; Occam's Razor via Sober 2015).
- **Kept:** the entries themselves, their descriptions, implications, violations, and
  citations. The `category` id `laws-of-ux` is retained as a short factual label
  (titles and short names are not copyrightable expression); ordering is alphabetical,
  which reproduces no source's arrangement. The *selection* of these 21 principles
  overlaps Yablonski's curation — see Residual risk below.

### `src/data/brand/principles/visual-hierarchy.json`
- **NC-derived:** one `sources` URL (`lawsofux.com/visual-hierarchy/`). Prose was original.
- **Replaced with:** URL removed; the entry keeps its NN/g citation.

### `src/data/content/principles/ux-writing.json`
- **NC-derived:** three entries cited `styleguide.mailchimp.com/voice-and-tone/` as a
  source. Prose was original.
- **Replaced with:** citations to plainlanguage.gov (US federal plain-language guidelines,
  public domain), GOV.UK content design (OGL v3.0), Shopify Polaris content docs, and
  NN/g's tone-of-voice research — each matched to the entry's actual claim.

### `src/data/content/systems/mailchimp.json` → `conversational-product-voice.json`
- **NC-derived:** the record was named for, attributed to, and organized after the
  CC BY-NC 4.0 Mailchimp guide. Its prose was the project's own commentary, but its
  voice attributes restated Mailchimp's published ones ("plain-spoken", "genuine",
  "translator", "dry humor") and its grammar/mechanics sections condensed the guide's
  corresponding sections — a paraphrase-level derivation, not a copy.
- **Decision:** rebuilt under a generic name (option b) rather than deleted. The tool
  surface (`list_content_systems` / `get_content_system`) is registry-driven and would
  tolerate deletion, but this was the knowledge base's only conversational-SaaS voice
  reference — deleting it would leave a category gap the other systems don't cover.
- **Replaced with:** `conversational-product-voice.json` — original prose describing the
  generic friendly/plain-spoken product register. The conventions it records are common
  professional practice documented in public standards (plainlanguage.gov, GOV.UK,
  Microsoft Writing Style Guide — listed as references, not as licensed inputs). Field
  names mirror the sibling `atlassian.json` schema. The record survived two adversarial
  review rounds: the first found multi-word phrasing carried from the old record
  (fixed by a full prose rewrite), the second found structural traceability — same
  identity metaphor, same ordered "never" taxonomy, same content-pattern selection and
  bad-button examples (fixed by re-architecting: new tone contexts, new never-list
  membership, a destructive-confirmations pattern present in neither predecessor,
  reordered sections, new framings throughout). The final version's only mechanical
  overlap with the old record is one 4-word run spanning JSON keys. Registered in
  `registry.json` under the new id; the old `mailchimp` id returns the standard
  not-found message.

### `src/data/content/systems/registry.json`
- Mailchimp entry replaced by the `conversational-product-voice` entry (same category and
  tags, new description and URL).

### `src/data/brand/principles/brand-as-system.json`
- **NC-derived:** the `voice-is-brand` entry named Mailchimp's guide as "the canonical
  example" and cited `styleguide.mailchimp.com`.
- **Replaced with:** GOV.UK, Shopify Polaris, and Atlassian named as public voice-guide
  examples; sources now Polaris + Atlassian content docs.

### `src/data/service-design/patterns/omnichannel-continuity.json`
- **NC-derived:** nothing licensed — a nominative mention of Mailchimp as an example brand
  (plus an unsourced "trust metrics" claim in the same sentence).
- **Replaced with:** example set now Intercom, Atlassian, GOV.UK services; the evidence
  sentence restated without the unverifiable metrics claim.

### `NOTICE`
- Both NC blocks (Laws of UX, Mailchimp) removed — nothing derived from either source
  remains. Added: a permissive-block entry for the UX/psychology laws as public academic
  concepts cited to primary literature, plainlanguage.gov (US government work, public
  domain), and a referenced-only entry for the Microsoft Writing Style Guide. All existing
  permissive attributions (W3C, GOV.UK, Polaris, NN/g, Atlassian, etc.) unchanged.

### `CONTRIBUTING.md`
- Licensing section updated from stale "MIT" wording (leftover from the #46 relicense) to
  Apache-2.0, and extended into a short contributor agreement: contributions are licensed
  inbound under Apache-2.0 **and** the contributor grants the maintainer the right to
  relicense or dual-license, so future licensing changes are never blocked by an outside
  PR. Third-party-source rules now name Apache-2.0 + commercial use as the bar.

### `src/index.ts` (two description strings, required by the rename)
- The `get_content_system` id example string and the `list_content_systems` tool
  description listed Mailchimp; both now name the current system set. These are
  anon-served tool descriptions, so the remote metadata hash in
  `test/taste-remote-full.test.mjs` was regenerated (tool NAMES unchanged — the
  golden 45-name hash is untouched). `manifest.json` was re-synced and its
  hand-maintained `long_description` updated.

### `README.md` and `LAUNCHGUIDE.md` (scope amendment, required by the change)
- README's licensing section declared "Laws of UX (CC BY-NC-ND 4.0)" and "Mailchimp
  (CC BY-NC 4.0)" as paraphrased upstreams — a standing claim of NC derivation that
  contradicted this cleanup; restated to name the primary literature and permissive
  sources. Both files also advertised the removed `mailchimp` content-system id;
  updated to the current system list. The marketing site (`site/`, `web/`) carries the
  same stale references but deploys separately and is handled as a follow-up.

## Verification (actual outputs, 2026-08-02)
- `grep -ril "lawsofux\|styleguide.mailchimp" src/ NOTICE` → no matches (exit 1). The
  same sweep over README.md and LAUNCHGUIDE.md is also empty after the follow-up commit.
- `RAVEN_NO_USAGE_LOG=1 npm test` → `tests 1153 / pass 1150 / fail 0 / skipped 3`
  (duration ~44s). An earlier run had two Playwright-teardown failures
  (`audit-fidelity`, `capture`); both pass in isolation (47 tests, 46 pass, 1 skipped) —
  environment flake, not a regression.
- Loader smoke through the built stdio server (`dist/index.js`, JSON-RPC): 7/7 PASS —
  `get_principles` (laws-of-ux rewrites present, old phrasing absent),
  `list_content_systems` (new id listed, mailchimp absent), `get_content_system`
  for the new id (content present) and for `mailchimp` (graceful not-found),
  `get_brand_principles`, `get_content_principles`, `get_service_pattern`
  (omnichannel-continuity, Intercom example present).
- Phrase-overlap check (longest shared word-run, old vs new, `git show main:` baseline):
  laws-of-ux summaries — 21 entries, worst surviving run 3 generic words;
  mailchimp → conversational-product-voice — worst surviving run 5 words, all of them
  JSON schema key sequences (`example-bad` / `buttons` / `rules`), no prose.

## Residual risk and follow-ups (for Andrew)
- **Selection overlap with Yablonski's curation.** The 21 principles kept under
  `category: laws-of-ux` are the set popularized by lawsofux.com. Each is an
  independently documented public concept, the prose and ordering are ours, and short
  titles are not protectable — but the *selection* mirrors his curation, and the
  category id itself is his site's brand. Renaming the category (e.g.
  `ux-psychology`) and dropping "21 Laws of UX" phrasing in README/marketing would
  remove the residue; it changes a user-facing tool enum, so it is a deliberate
  follow-up, not part of this change.
- **CLA depth.** The CONTRIBUTING.md paragraph is a click-through-style inbound grant,
  not an ICLA: no signature record, no explicit patent grant, no employer-ownership
  representation. Sufficient for small doc/data PRs; before accepting substantial
  outside code contributions, adopt a recorded CLA flow (e.g. cla-assistant) or DCO +
  ICLA.
- **Marketing surfaces still reference the old names.** `site/` and `web/` (separate
  Vercel projects, manual deploys) still link lawsofux.com and advertise the
  `mailchimp` system (`web/app/page.tsx`, `web/app/docs/page.tsx`,
  `web/components/tools/ToolsSection.tsx`, `site/index.html`, `site/docs.html`).
  Update alongside the next site deploy. Historical changelog entries are left as
  history.
- **Shopify Polaris record.** `shopify-polaris.json` (out of this change's scope — not
  an NC source) is original commentary on Polaris's public docs, but Polaris's content
  license is Shopify-specific rather than plainly permissive. Same posture as the old
  Mailchimp record, milder terms. Worth the same rebuild-or-confirm treatment before
  charging money.
