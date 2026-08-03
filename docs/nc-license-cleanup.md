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
- **Replaced with:** 21 original one-line summaries written from the primary literature
  each entry already cites — Fitts (1954), Hick (1952) / Hyman (1953), Miller (1956),
  Doherty & Thadani (1982), Kahneman et al. (1993), Wertheimer (1923), Palmer (1992),
  Palmer & Rock (1994), von Restorff (1933), Zeigarnik (1927), Hull (1932), Ebbinghaus
  (1885), Postel (RFC 761/793), Parkinson (1955), Pareto (1896), Tesler (c. 1984),
  Nielsen (2000).
- **Kept:** the entries themselves, their descriptions, implications, violations, and
  primary-source citations. The `category` id `laws-of-ux` is retained as a short factual
  label (titles and short names are not copyrightable expression); the file's selection
  and ordering (20 entries, alphabetical) does not reproduce any source's arrangement.

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
- **NC-derived:** the whole record — named after, and structured as a paraphrase of, the
  CC BY-NC 4.0 Mailchimp guide (its voice-attribute taxonomy, tone shifts, and vocabulary
  guidance).
- **Decision:** rebuilt under a generic name (option b) rather than deleted. The tool
  surface (`list_content_systems` / `get_content_system`) is registry-driven and would
  tolerate deletion, but this was the knowledge base's only conversational-SaaS voice
  reference — deleting it would leave a category gap the other three systems
  (government, commerce, productivity) don't cover.
- **Replaced with:** `conversational-product-voice.json` — original prose describing the
  generic friendly/plain-spoken product register, written from plainlanguage.gov, GOV.UK
  style guidance, the Microsoft Writing Style Guide, and Shopify Polaris. Field set
  mirrors the sibling `atlassian.json`. Registered in `registry.json` under the new id;
  the old `mailchimp` id now returns the standard not-found message pointing to
  `list_content_systems`.

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

### `src/index.ts` (one line, required by the rename)
- The `get_content_system` id example string listed `'mailchimp'`; now lists
  `'conversational-product-voice'`.

## Verification
See the branch's test run: `grep -ril "lawsofux|styleguide.mailchimp" src/ NOTICE` returns
nothing; the build and full test suite pass; every touched JSON loads through the same
code paths the server uses (`get_principles`, `list_content_systems`,
`get_content_system`, brand principles, service patterns). Each rewritten summary was
mechanically compared against the phrasing it replaced for surviving word sequences.
