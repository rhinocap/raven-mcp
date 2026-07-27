// src/compact.ts
// Compact response shaping for the heavy audit/eval tools. Pure, no side effects.
// Strips embedded reference bulk (base64 screenshots, principle/pattern bodies, raw DOM)
// while preserving the decision-grade signal: scores, violations, fix_priority.

export function compactAuditPage(result: any): any {
  const out: any = {};
  if ("score" in result) out.score = result.score;
  if ("grade" in result) out.grade = result.grade;
  if ("summary" in result) out.summary = result.summary;
  if ("passes" in result && Array.isArray(result.passes)) {
    out.passes_count = result.passes.length;
  } else if ("passes_count" in result) {
    out.passes_count = result.passes_count;
  }
  if ("errors" in result) out.errors = result.errors;
  if ("warnings" in result) out.warnings = result.warnings;
  if ("capture_warnings" in result) out.capture_warnings = result.capture_warnings;
  if ("fix_priority" in result) out.fix_priority = result.fix_priority;
  if ("notes" in result) out.notes = result.notes;
  if ("unloaded_video_artifacts" in result) out.unloaded_video_artifacts = result.unloaded_video_artifacts;
  if ("adversarial_verification" in result) out.adversarial_verification = result.adversarial_verification;
  if (result.capture && typeof result.capture === "object") {
    const cap: any = {};
    if ("url" in result.capture) cap.url = result.capture.url;
    if ("viewport" in result.capture) cap.viewport = result.capture.viewport;
    if ("scrolledToBottom" in result.capture) cap.scrolledToBottom = result.capture.scrolledToBottom;
    if ("animationsSettled" in result.capture) cap.animationsSettled = result.capture.animationsSettled;
    if ("captureScrollY" in result.capture) cap.captureScrollY = result.capture.captureScrollY;
    if ("capture_warnings" in result.capture) cap.capture_warnings = result.capture.capture_warnings;
    out.capture = cap; // screenshot_bytes (the base64) intentionally dropped
  }
  return out;
}

export function compactEvaluation(evaluation: any): any {
  const out: any = {};
  if ("design_description" in evaluation) out.design_description = evaluation.design_description;
  if ("context" in evaluation) out.context = evaluation.context;
  if ("goals" in evaluation) out.goals = evaluation.goals;
  if ("evaluation_guidance" in evaluation) out.evaluation_guidance = evaluation.evaluation_guidance;
  if (Array.isArray(evaluation.principles_to_check)) {
    out.principles_to_check = evaluation.principles_to_check.map((p: any) => ({ id: p.id, name: p.name }));
  }
  if (Array.isArray(evaluation.applicable_patterns)) {
    out.applicable_patterns = evaluation.applicable_patterns.map((p: any) => ({ id: p.id, name: p.name }));
  }
  if ("total_principles" in evaluation) out.total_principles = evaluation.total_principles;
  if ("total_patterns" in evaluation) out.total_patterns = evaluation.total_patterns;
  if ("before_after_diff" in evaluation) out.before_after_diff = evaluation.before_after_diff;
  if ("fix_confirmed" in evaluation) out.fix_confirmed = evaluation.fix_confirmed;
  return out;
}

export function compactAuditUrl(result: any): any {
  const out: any = {};
  if ("tool" in result) out.tool = result.tool;
  if ("url" in result) out.url = result.url;
  if ("viewports" in result) out.viewports = result.viewports;
  if ("themes" in result) out.themes = result.themes;
  if ("findings" in result) out.findings = result.findings;
  if ("counts" in result) out.counts = result.counts;
  if ("summary" in result) out.summary = result.summary;
  if ("warnings" in result) out.warnings = result.warnings;
  if ("capture_warnings" in result) out.capture_warnings = result.capture_warnings;
  if (Array.isArray(result.captures)) {
    out.captures = result.captures.map((c: any) => {
      const cc: any = {};
      if ("viewport" in c) cc.viewport = c.viewport;
      if ("theme" in c) cc.theme = c.theme;
      if ("scrolledToBottom" in c) cc.scrolledToBottom = c.scrolledToBottom;
      if ("animationsSettled" in c) cc.animationsSettled = c.animationsSettled;
      if ("capture_warnings" in c) cc.capture_warnings = c.capture_warnings;
      if ("screenshot_bytes" in c) cc.screenshot_bytes = c.screenshot_bytes;
      return cc; // base64 `screenshot` intentionally dropped
    });
  }
  return out;
}
