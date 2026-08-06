# Leg B — intent search over the pattern corpus

Implement. Do not ask questions; make the call and state it in a comment.

## The defect

`searchReferences()` in `src/reference-store.ts:204` scores a query by substring
against `note` (4), `app` (3), `tags` (2), `selector` (1). Tags are freeform
(`normalizeTags`). Nothing at capture time binds a captured pattern to a NAME,
so a user searching "scroll cue in a hero" matches nothing unless they happened
to type those exact characters into a note months earlier.

The corpus exists to answer questions like the user's actual words:
  "examples of a scrolling mouse icon in a hero image from around the web"

## Build

### 1. `src/reference-taxonomy.ts` (new)

A controlled vocabulary of UI pattern kinds. Each entry:

    { id, label, aliases: string[], surface?: string[] }

`id` is kebab-case and stable (`scroll-cue`, `hero`, `sticky-nav`,
`pricing-toggle`, `empty-state`, `testimonial-marquee`, ...). `aliases` are the
things a human actually types — for `scroll-cue`: "scroll indicator", "scroll
hint", "mouse wheel icon", "scroll down arrow", "scroll prompt", "mouse scroll".

Seed 25-40 entries covering what a designer browses for. Look at
`src/data/patterns/*.json` (14 files: cta, navigation, forms, pricing-page,
landing-page, modals-dialogs, loading-states, empty-states, error-states,
dashboard, dropdown-menu, signup-flow, social-proof, mobile-conversion) and
reuse their vocabulary where it fits rather than inventing a parallel one — but
this taxonomy is about CAPTURABLE ELEMENTS, which is a finer grain than those
files' page-level categories. Both grains are legitimate; say so in a comment.

Export:
- `PATTERN_TAXONOMY` — the array
- `resolveTaxonomy(term: string): TaxonomyEntry[]` — term -> matching entries,
  matching id, label and aliases, case/whitespace/punctuation insensitive
- `expandQuery(query: string): string[]` — a free-text query -> the set of terms
  to match against, i.e. the original tokens PLUS every alias of every taxonomy
  entry any token resolves to. "scroll cue in a hero" must expand to include
  both the scroll-cue alias set and the hero alias set.

Multi-word aliases must match as phrases, not as loose token soup — "scroll
down arrow" must not be satisfied by a record tagged only "arrow".

### 2. `src/reference-store.ts`

- `searchReferences` routes `opts.query` through `expandQuery`. A record matches
  if ANY expanded term hits any of the existing four fields. KEEP the existing
  field weights; an alias hit scores like the field it hit, but add a small
  penalty so an exact user-typed hit outranks an alias hit on the same field
  (state the number and why).
- `why` must say WHICH term matched when it was an alias rather than the literal
  query — a user who typed "scroll cue" and got a record tagged "mouse wheel"
  needs to see that, or the result looks like a bug.
- Add optional `taxonomy?: string[]` to the reference record: taxonomy ids bound
  at capture. `captureReference` accepts them, validates every id exists in
  PATTERN_TAXONOMY (throw naming the unknown id AND listing near matches), and
  stores them. Search matches them at the `tags` weight.
- Existing records have no `taxonomy` field. They must keep working unchanged.

### 3. `src/index.ts`

`capture_reference` gains an optional `taxonomy` array in its input schema, with
a description telling the calling agent to bind pattern kinds from the
vocabulary. `search_references` results surface the bound ids. Do NOT add a new
tool — the stdio count is frozen at 109 and the anonymous 45-tool hash must not
move. Do NOT touch `REMOTE_GATED_TOOLS`.

### 4. Tests — `test/reference-taxonomy.test.mjs` (new) + additions to
`test/reference-store.test.mjs`

Every test must be falsifiable: for each, name the one-line mutation to the
source that turns THAT test red and no other, and MEASURE it by editing
`dist/` and re-running. A test that passes against the defect is worthless —
this repo has caught three of those. Cover at minimum:
- "scroll cue in a hero" finds a record tagged only "mouse wheel icon"
- a phrase alias is not satisfied by one of its words alone
- an exact hit outranks an alias hit on the same field
- an unknown taxonomy id at capture throws and names near matches
- a pre-existing record with no `taxonomy` field still searches and returns
- `why` distinguishes an alias match from a literal match

## Constraints

- TypeScript, matching the surrounding style EXACTLY: `var` not `const/let` in
  the store's function bodies, `function(x){}` not arrows, no new dependencies.
- `RAVEN_NO_USAGE_LOG=1 npm test` must pass. Current baseline is
  1324 tests / 1321 pass / 0 fail / 3 skipped. Report the new numbers and say
  which files the delta came from.
- SIX test files assert the exact stdio tool count. You are adding NO tools, so
  none should move. If one does, you added a tool — undo it.
- Report what you changed and what you measured. Do not claim done without the
  mutation results.
