// Single source of truth for the headline counts shown across the marketing site.
//
// TOOL_COUNT is the count a VISITOR CAN INSTALL — the published npm package, not
// what `main` happens to hold. Those are two different claims and they diverge:
// repo main carried 110 while npm 2.3.0 shipped 105. Bump this when a release
// cuts, not when a tool lands.
//
// It is asserted at build time: components/tools/ToolsSection.tsx counts its own
// enumeration and throws if it disagrees, so the heading and the list below it
// cannot state two different totals. That guard is the reason this file no longer
// says "nothing asserts this" — three surfaces once read 99, "one hundred" and 104
// on one page. LAYER_COUNT (knowledge-layer groups in the Tool Reference) is still
// hand-maintained; the docs page declares per-layer counts that sum to TOOL_COUNT.
export const TOOL_COUNT = 105
export const LAYER_COUNT = 19
