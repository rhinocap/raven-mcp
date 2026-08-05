# B1 reference store report

## Exported API signatures

```ts
export function referenceHome(): string
export function saveReference(input: SaveReferenceInput): PatternReference
export function getReference(ref_id: string): PatternReference | null
export function listReferences(opts: ReferenceFilters = {}): ReferenceListResult
export function searchReferences(opts: SearchReferenceOptions): ReferenceSearchResult
export function deleteReference(ref_id: string): boolean
```

The module also exports the `PatternReference`, `SaveReferenceInput`, `ReferenceFilters`, `SearchReferenceOptions`, `ReferenceListResult`, and `ReferenceSearchResult` TypeScript interfaces.

## Store location

Records are stored one per JSON file under:

```ts
process.env.RAVEN_REFERENCE_HOME || join(homedir(), ".raven", "references")
```

The same directory contains `index.json`, with `{ version: 1, ref_ids: string[] }`. Record and index writes use a temporary file followed by `renameSync`.

## Brief discrepancies

- `src/taste-store.ts` provides the requested dynamic home-directory and filesystem error-handling shape, but its writes are direct `writeFileSync` calls, not atomic writes. The atomic temp-write/rename implementation is in `src/decision-graph.ts` and was copied from there.
- `RAVEN_VERSION` is not exported by `src/grab-bridge.ts`, so it cannot be imported. `src/reference-store.ts` mirrors grab-bridge's package-root resolution and `package.json` read instead.
- `src/decision-graph.ts` owns the store but does not generate IDs; its call sites in `src/index.ts` generate timestamp-plus-random URL-safe IDs. The reference IDs match that shape.

## Decisions not covered by the brief

- `index.json` stores reference IDs only. Listing consults the index and also discovers unindexed record files so a corrupt file written directly into the store is still reported in `skipped[]` as required. A corrupt index is itself reported in `skipped[]`, while valid record files remain listable through directory discovery.
- List results use the same stable secondary ordering as search: `captured_at` descending, then `ref_id` ascending.
- Text-match weights are note `4`, app name `3`, tags `2`, and selector `1`; `why` names every field that contributed.
- A tag filter containing multiple tags requires every requested tag to be present, preserving AND semantics within the tag filter as well as across host/owner/tag filters.
- Invalid caller-supplied IDs are rejected before path construction, preventing path traversal through `getReference` or `deleteReference`.
- Generated IDs follow the decision tools' timestamp-plus-random shape and are collision-checked against existing record files before use.
- Record reads validate the stored shape, canonical ISO timestamp, and agreement between `ref_id` and the record filename; parseable corruption is skipped alongside malformed JSON.

Per the brief, build, tests, TypeScript compilation, and git commands were not run.
