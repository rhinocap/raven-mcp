// Calls — Raven's server-published vocabulary of MCP Prompts. Each Call is
// assembled at request time from the caller's taste binding (if any) and
// Raven's own cited knowledge layer, then hands back an ordered instruction
// set naming which Raven tools to run. No static text, no file payload: the
// same registration surfaces identically in every MCP host via the prompts
// primitive (Claude Code renders these as /raven:<name>).
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveSurfaceBinding, listTasteDecisions, type SurfaceBinding, type TasteDecision } from "./taste.js";
import type { TasteStore } from "./taste-store.js";

// Structural subset of index.ts's Principle type — Calls only ever cites id/
// name/summary, so it doesn't need the full shape to avoid re-declaring it.
type PrincipleLite = { id: string; name: string; category: string; summary: string };

var callArgs = {
  profile: z.string().optional().describe("Taste profile name (see list_taste_profiles). Omit to run this call uncalibrated."),
  project: z.string().optional().describe("Project/surface name (see bind_taste_surface). Resolves this project's taste calibration when present.")
};

function hasTool(server: McpServer, name: string): boolean {
  return !!(server as any)._registeredTools && !!(server as any)._registeredTools[name];
}

function promptResult(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text: text } }] };
}

async function resolveCallContext(store: TasteStore, profile?: string, project?: string): Promise<{
  profileName?: string;
  binding: SurfaceBinding | null;
  decisions: TasteDecision[];
}> {
  if (typeof profile !== "string" || profile.trim().length === 0) {
    return { binding: null, decisions: [] };
  }
  // Never let a bad profile name or store error surface out of a prompt
  // handler — a Call always degrades to uncalibrated rather than failing.
  try {
    var binding = await resolveSurfaceBinding(store, profile, { project: project });
    var decisions = binding ? await listTasteDecisions(store, profile, { project: binding.project }) : [];
    return { profileName: profile, binding: binding, decisions: decisions };
  } catch {
    return { binding: null, decisions: [] };
  }
}

function contextLines(binding: SurfaceBinding | null, profileName?: string): string[] {
  if (!binding) {
    return [profileName
      ? "No saved taste binding found for profile \"" + profileName + "\" on this project — running uncalibrated. Run get_taste_interview + bind_taste_surface to personalize this call."
      : "No taste profile given — running uncalibrated. Pass profile (and project) to personalize this call."];
  }
  var lines = ["Calibrated: profile \"" + profileName + "\", project \"" + binding.project + "\" (surface: " + binding.surface + ")."];
  if (binding.voice_note) lines.push("Voice note: " + binding.voice_note);
  if (binding.overrides.length > 0) {
    var offCount = binding.overrides.filter(function (o) { return o.severity === "off"; }).length;
    lines.push("Per-rule overrides on this surface: " + binding.overrides.length + " (" + offCount + " disabled).");
  }
  return lines;
}

function priorityLines(decisions: TasteDecision[]): string[] {
  if (decisions.length === 0) {
    return ["No recorded taste decisions yet for this project — rank findings by the profile's own rule severities."];
  }
  var recent = decisions.slice(-8).reverse();
  return ["Recorded priorities (rank findings against these, most recent first):"].concat(
    recent.map(function (d) {
      return "- " + d.dimension + ": " + d.decision + (d.rejected.length > 0 ? " (rejected: " + d.rejected.join(", ") + ")" : "");
    })
  );
}

function citePrinciples(all: PrincipleLite[], ids: string[]): string[] {
  return ids
    .map(function (id) { return all.find(function (p) { return p.id === id; }); })
    .filter(function (p): p is PrincipleLite { return !!p; })
    .map(function (p) { return "- [" + p.id + "] " + p.name + ": " + p.summary; });
}

export function registerCalls(server: McpServer, tasteStore: TasteStore, allPrinciples: PrincipleLite[]): void {
  server.registerPrompt(
    "preen",
    {
      title: "Preen",
      description: "Full grooming pass: mechanical scan, taste audit, and a fix-verification loop.",
      argsSchema: callArgs
    },
    async function ({ profile, project }: { profile?: string; project?: string }) {
      var ctx = await resolveCallContext(tasteStore, profile, project);
      var scanTool = hasTool(server, "talon_scan") ? "talon_scan" : "audit_page";
      var lines = ["Run a full grooming pass on the target.", ""]
        .concat(contextLines(ctx.binding, ctx.profileName))
        .concat([
          "",
          "Steps:",
          "1. Run " + scanTool + " on the target to collect deterministic findings.",
          "2. Run audit_taste" + (ctx.profileName ? " with profile \"" + ctx.profileName + "\"" + (project ? " and project \"" + project + "\"" : "") : " (pass a profile to include taste-scoped findings)") + ".",
          "3. Fix each finding, then re-run the same two tools to confirm it's gone before moving to the next.",
          "4. Stop when both come back clean, or the remaining findings are explicitly waived_by_taste."
        ]);
      return promptResult(lines.join("\n"));
    }
  );

  server.registerPrompt(
    "appraise",
    {
      title: "Appraise",
      description: "Structured critique against the caller's own taste portrait, findings ranked by recorded priorities.",
      argsSchema: callArgs
    },
    async function ({ profile, project }: { profile?: string; project?: string }) {
      var ctx = await resolveCallContext(tasteStore, profile, project);
      var lines = ["Critique the target against the caller's own taste profile.", ""]
        .concat(contextLines(ctx.binding, ctx.profileName))
        .concat([""])
        .concat(priorityLines(ctx.decisions))
        .concat([
          "",
          "Steps:",
          "1. Run audit_taste" + (ctx.profileName ? " with profile \"" + ctx.profileName + "\"" + (project ? " and project \"" + project + "\"" : "") : " (pass a profile for a calibrated critique)") + ".",
          "2. Order the returned findings by the recorded priorities above, most-recent decision first, then by severity.",
          "3. Anything not covered by a recorded decision is new signal — once resolved, record it with record_taste_decision."
        ]);
      return promptResult(lines.join("\n"));
    }
  );

  server.registerPrompt(
    "cadence",
    {
      title: "Cadence",
      description: "Type and rhythm pass: typography audit against Raven's typography principles.",
      argsSchema: callArgs
    },
    async function ({ profile, project }: { profile?: string; project?: string }) {
      var ctx = await resolveCallContext(tasteStore, profile, project);
      var principles = citePrinciples(allPrinciples, ["type-scale", "line-height-spacing", "font-pairing", "text-hierarchy", "measure-line-length"]);
      var lines = ["Run a type and rhythm pass on the target.", ""]
        .concat(contextLines(ctx.binding, ctx.profileName))
        .concat(["", "Governing principles:"])
        .concat(principles)
        .concat([
          "",
          "Steps:",
          "1. Run audit_typography on the target.",
          "2. Weigh each finding against the principles above" + (ctx.profileName ? ", and audit_taste's cadence-relevant rules" : "") + ".",
          "3. Fix scale, line-height, and measure issues before pairing/hierarchy nits."
        ]);
      return promptResult(lines.join("\n"));
    }
  );

  server.registerPrompt(
    "plumage",
    {
      title: "Plumage",
      description: "Color-system pass: contrast plus palette-discipline guidance from Raven's color principles.",
      argsSchema: callArgs
    },
    async function ({ profile, project }: { profile?: string; project?: string }) {
      var ctx = await resolveCallContext(tasteStore, profile, project);
      var principles = citePrinciples(allPrinciples, ["color-palette-discipline"]);
      var lines = ["Run a color-system pass on the target.", ""]
        .concat(contextLines(ctx.binding, ctx.profileName))
        .concat(["", "Governing principles:"])
        .concat(principles)
        .concat([
          "",
          "Steps:",
          "1. Run audit_contrast on the target for WCAG failures.",
          "2. Check the palette against the palette-discipline principle above — count distinct hues in use, flag anything past the surface's calibrated limit.",
          ctx.profileName
            ? "3. Run audit_taste with profile \"" + ctx.profileName + "\" for surface-specific color rules (second-hue bans, gradient bans, etc.)."
            : "3. Pass a profile to also check surface-specific color rules (second-hue bans, gradient bans, etc.)."
        ]);
      return promptResult(lines.join("\n"));
    }
  );

  server.registerPrompt(
    "truesight",
    {
      title: "Truesight",
      description: "Mechanical-only report: deterministic findings, no taste or subjective judgment.",
      argsSchema: callArgs
    },
    async function () {
      var scanTool = hasTool(server, "talon_scan") ? "talon_scan" : "audit_page";
      var lines = [
        "Report deterministic findings only — no taste rules, no subjective judgment.",
        "",
        "Run " + scanTool + " on the target and report its findings verbatim: rule, message, measured value, and fix.",
        "Do not add opinion, ranking, or taste-based framing — this call is the mechanical measurement layer only."
      ];
      return promptResult(lines.join("\n"));
    }
  );
}
