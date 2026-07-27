// Single source of truth for the headline counts shown across the marketing site.
// TOOL_COUNT is the stdio tool count and must match manifest.json, which
// scripts/sync-manifest-tools.mjs regenerates; the guardrail tests that assert the
// exact count live in test/ (audit-dispatch, decision-import, design-review,
// manifest-tools). Nothing asserts this constant, so it has to be updated by hand
// whenever a tool is added or removed.
// LAYER_COUNT is the number of knowledge-layer groups in the Tool Reference.
export const TOOL_COUNT = 104
export const LAYER_COUNT = 19
