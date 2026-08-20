import { readFileSync, writeFileSync } from "node:fs";
const P = "src/index.ts";
let s = readFileSync(P, "utf8");
function sub(find, repl, tag) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error(`${tag}: expected 1 occurrence, found ${n}`);
  s = s.replace(find, repl);
  console.log("ok", tag);
}

// 0) One shared envelope for the whole class. The three existing refusals
//    (audit_ios_a11y / audit_swiftui / audit_rn) were hand-written inline and
//    six more sites were found scoring empty input as a pass, so the SHAPE of
//    the refusal gets one copy. The message stays per-tool because what the
//    caller must supply differs; the envelope must not.
sub(
`// MCP annotations are injected at the shared registration boundary below.`,
`// An EMPTY or BLANK input is never a clean bill of health. A schema can only
// say a field is present; it cannot say there is anything IN it, and every
// tool below computes its grade from a denominator that is zero when the
// input is empty — which is what manufactured 100/A on an empty snapshot,
// 77/C on empty markup and 70/C on empty creative. Refusing is the only
// answer that is not an affirmative false claim about work nobody did. This
// is the "test cases did not produce correct results" half of OpenAI's
// 2026-08-19 rejection (see conversations/2026-08-19-openai-rejection.md).
// Whitespace counts as empty: {source:"   \\n  "} was MEASURED at 100/A.
function refuseEmptyInput(error: string, extra?: { [k: string]: any }) {
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: error, ...(extra || {}) }, null, 2) }] };
}
function isBlankString(v: any) {
  return typeof v !== "string" || v.trim().length === 0;
}

// MCP annotations are injected at the shared registration boundary below.`,
"helper");

// 1) audit_screen + audit_ios_screen — ONE shared function backs both, so one
//    guard covers two tools. \`!elements\` is false for [], which is exactly how
//    an empty array reached the scorer and came back 100/A.
sub(
`  if (!elements || !viewport) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          instructions: "Provide a structured snapshot of the rendered screen.`,
`  if (Array.isArray(elements) && elements.length === 0) {
    return refuseEmptyInput(
      "No elements to audit. Provide a non-empty 'elements' array from " + (isAndroid ? "UI Automator / Espresso or a Compose semantics tree" : "the Accessibility Inspector, an XCUITest accessibility-tree dump, or your own view-hierarchy walker") + " — an empty snapshot cannot be scored, and is not a pass.",
      { platform: P }
    );
  }
  if (!elements || !viewport) {
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          instructions: "Provide a structured snapshot of the rendered screen.`,
"screen");

// 2) audit_page — the schema accepts "" and the existing refusal tests only
//    null/undefined, so blank markup was scored against 13 checks that all
//    pass vacuously on no content.
sub(
`  async function({ html, url, scroll_settle, interactions, viewport, strict, containerMaxWidth, adversarial_verify, compact }) {
    var issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }> = [];`,
`  async function({ html, url, scroll_settle, interactions, viewport, strict, containerMaxWidth, adversarial_verify, compact }) {
    // Blank markup is not a page. Most of the 13 checks pass VACUOUSLY on no
    // content ("all font sizes >= 13px" over zero elements), so an empty
    // string scored 77/C — a grade about nothing.
    if (html !== undefined && html !== null && isBlankString(html) && !url) {
      return refuseEmptyInput("No markup to audit. Provide non-empty 'html', or a 'url' to capture — blank markup cannot be scored, and is not a pass.", { tool: "audit_page" });
    }
    var issues: Array<{ severity: "error" | "warning"; rule: string; message: string; fix: string }> = [];`,
"page");

// 3) score_creative — absent channel/audience/brand each award points, so an
//    empty string collected 70/C with every content component at zero.
sub(
`  async function (params: any) {
    var brand = params.brand_profile_id ? readCreativeRecord("brands", params.brand_profile_id, true) : null;`,
`  async function (params: any) {
    if (isBlankString(params.creative_text)) {
      return refuseEmptyInput("No creative to score. Provide non-empty 'creative_text' — blank copy cannot be scored, and is not a 70/C.", { tool: "score_creative" });
    }
    var brand = params.brand_profile_id ? readCreativeRecord("brands", params.brand_profile_id, true) : null;`,
"creative");

// 4) generate_design_system — a blank name emitted a real token set titled
//    " Design System", which is a generated artifact nobody can identify.
sub(
`  async function(params: { name: string; base_system?: string; brand_color?: string; style?: string; dark_mode?: boolean; format?: string; save?: boolean }) {`,
`  async function(params: { name: string; base_system?: string; brand_color?: string; style?: string; dark_mode?: boolean; format?: string; save?: boolean }) {
    if (isBlankString(params.name)) {
      return refuseEmptyInput("No system name. Provide a non-empty 'name' — a generated system with a blank name cannot be identified, saved, or referenced.", { tool: "generate_design_system" });
    }`,
"gends");

// 5) generate_service_blueprint — blank name AND no steps produced a titled
//    HTML document describing no service.
sub(
`  async ({ service_name, subtitle, actors, current, ideal }) => {
    var html = generateServiceBlueprintHtml(`,
`  async ({ service_name, subtitle, actors, current, ideal }) => {
    if (isBlankString(service_name) || !Array.isArray(current) || current.length === 0) {
      return refuseEmptyInput("No service to map. Provide a non-empty 'service_name' and at least one step in 'current' — a blueprint of zero steps is a document about nothing.", { tool: "generate_service_blueprint" });
    }
    var html = generateServiceBlueprintHtml(`,
"blueprint");

// 6) compose_system — an empty composition list returned a valid-looking
//    token document reading "Composed from: " with no tokens in it.
sub(
`  async ({ compositions, format }) => {`,
`  async ({ compositions, format }) => {
    if (!Array.isArray(compositions) || compositions.length === 0) {
      return refuseEmptyInput("Nothing to compose. Provide at least one {system, group} entry in 'compositions' — an empty composition yields a token set with no tokens in it.", { tool: "compose_system" });
    }`,
"compose");

writeFileSync(P, s);
console.log("applied 7 edits");
