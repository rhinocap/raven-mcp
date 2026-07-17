// Single source of truth for headline counts shown across the marketing site.
// TOOL_COUNT is verified against the live registry: test/redis-taste-store.test.mjs
// asserts `names.length === TOOL_COUNT` for the local stdio server (all tools, no gating).
// LAYER_COUNT is the count of top-level knowledge-layer sections in the Tool Reference
// (Principles, Patterns, Business, Tokens, Content Design, Research & Data, Service Design,
// Brand & Visual, Mobile & Native Audit, Render & Audit).
export const TOOL_COUNT = 78
export const LAYER_COUNT = 10
