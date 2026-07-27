"use client";

import { useState } from "react";

type Tool = { name: string; desc: string };

type Act = {
  num: string;
  title: string;
  purpose: string;
  marquee: string[];
  tools: Tool[];
};

const ACTS: Act[] = [
  {
    num: "01",
    title: "Know",
    purpose: "The source material Raven draws on — principles, patterns, research methods, token libraries.",
    marquee: ["get_principles", "get_design_system", "search_knowledge"],
    tools: [
      { name: "get_principles", desc: "Design principles matched to your UI context—heuristics, laws, accessibility, color theory" },
      { name: "get_design_system", desc: "Full tokens—colors, typography, spacing, radii, elevation, motion" },
      { name: "search_knowledge", desc: "Full-text search across all principles, patterns, and business strategy" },
      { name: "get_pattern", desc: "Field-tested patterns with do's, don'ts, and evidence across UI, content, and service-design types" },
      { name: "get_checklist", desc: "Pre-publish quality checklist for any UI type—forms, dashboards, landing pages, mobile" },
      { name: "get_d4d_framework", desc: "Design for Delight—customer empathy, hypothesis, and experiment templates" },
      { name: "get_business_strategy", desc: "Monetization, retention, onboarding, growth, and metrics frameworks" },
      { name: "get_metrics_framework", desc: "HEART, AARRR, North Star, conversion funnel, RICE, OKRs—with examples" },
      { name: "get_research_method", desc: "Qualitative, quantitative, and usability methods—with protocols and bias traps" },
      { name: "list_design_systems", desc: "Browse the registry of 12 design systems with tokens and metadata" },
      { name: "list_content_systems", desc: "Browse brand voice & tone systems—Mailchimp, GOV.UK, Polaris, Atlassian" },
      { name: "get_content_system", desc: "A brand's full voice—attributes, tone shifts, vocabulary, grammar, content patterns" },
      { name: "get_content_principles", desc: "UX-writing principles—clarity, active voice, error anatomy, inclusive language" },
      { name: "get_content_pattern", desc: "Copy recipes for error messages, empty states, notifications, form validation" },
      { name: "get_service_pattern", desc: "Blueprinting, human handoff, signup-as-service, omnichannel, moments of truth" },
      { name: "get_service_standard", desc: "The GOV.UK Service Standard—14 points for service-quality assessment" },
      { name: "get_brand_principles", desc: "Logo usage, gradient rules, imagery, visual hierarchy, brand-as-system" },
      { name: "get_brand_trends", desc: "2026 visual trends—bento, monospace, neon-on-glass, brutalism, AI imagery" },
    ],
  },
  {
    num: "02",
    title: "Create",
    purpose: "Token sets, brand profiles, service blueprints, and provider-ready creative job payloads from explicit inputs.",
    marquee: ["generate_design_system", "plan_creative_campaign", "generate_service_blueprint"],
    tools: [
      { name: "generate_design_system", desc: "Generate a complete design system from a brand color—export as HTML, CSS, Figma, or SVG" },
      { name: "plan_creative_campaign", desc: "Plan a multi-asset campaign across photos, cards, UGC ads, TV spots, social packs, and storyboards" },
      { name: "generate_service_blueprint", desc: "Render a service blueprint as HTML—current vs. ideal, with two-actor HI-loop mode" },
      { name: "compose_system", desc: "Mix tokens from multiple design systems into a custom composition" },
      { name: "get_brand_system", desc: "Get a complete design system for building an app with branding like any company" },
      { name: "create_brand_profile", desc: "Store local brand memory: colors, fonts, tone, audience, constraints, product notes, and asset references" },
      { name: "get_brand_profile", desc: "Read a saved local creative brand profile for reuse in generation and campaign jobs" },
      { name: "list_brand_profiles", desc: "List saved creative brand profiles under the local Raven creative workspace" },
      { name: "create_character_profile", desc: "Create a character or identity reference profile for consistent image and video generation" },
      { name: "create_generation_job", desc: "Create a provider-ready image, video, audio, 3D, campaign, or analysis job payload" },
      { name: "get_generation_job", desc: "Read a generation job, its provider payload, status, and runner output if execution was enabled" },
      { name: "list_generation_jobs", desc: "List local creative generation jobs by status, media type, or brand profile" },
      { name: "list_creative_models", desc: "Browse provider-agnostic model slots for image, video, 3D, audio, character consistency, and analysis" },
      { name: "list_creative_presets", desc: "Browse presets for product photos, marketplace cards, UGC ads, TV spots, social packs, storyboards, and infographics" },
      { name: "register_creative_asset", desc: "Register a local path or remote URL as an asset reference; Raven stores metadata, not file bytes" },
    ],
  },
  {
    num: "03",
    title: "Design",
    purpose: "Raven Design — click any element on your running page, edit its tokens, styles, and layout, and package the change against your DESIGN.md for your agent.",
    marquee: ["start_grab_session", "review_diff", "get_page_template"],
    tools: [
      { name: "start_grab_session", desc: "Start the local grab bridge on loopback—click an element on your dev server and send it to your agent" },
      { name: "get_grabbed_elements", desc: "Read what you clicked—selector, computed styles, matching DESIGN.md tokens, and the change you asked for" },
      { name: "get_grab_layers", desc: "Read the layer tree captured around the clicked element, drilled to that node" },
      { name: "get_grab_operation", desc: "Read or update one saved grab change, or request the unified style-and-reorder batch" },
      // v2.2.3: layer drags live-move the host DOM; the old measured-preview description is no longer accurate.
      { name: "move_grab_layer", desc: "Live-move a same-page layer reorder or reparent in the host DOM while keeping the change queued for the agent" },
      { name: "get_page_template", desc: "Read the page's template slots from DESIGN.md, merged with the overlay's latest selections" },
      { name: "set_template_slot", desc: "Persist page-scoped template slots in one batched DESIGN.md update—fixed/flexible roles and allowed tokens" },
      { name: "list_templates", desc: "List the page templates and their registered routes from the active session" },
      { name: "init_design_md", desc: "Create a DESIGN.md from a stored Raven token system, a getdesign.md starter, or a blank template" },
      { name: "read_design_md", desc: "Parse a DESIGN.md—its frontmatter, Markdown body, and flattened token index" },
      { name: "update_design_md", desc: "Change one DESIGN.md token surgically, leaving the rest of the file untouched" },
      { name: "review_diff", desc: "CI-shaped review of a code diff against the project's DESIGN.md tokens and recorded decisions—with fail_on_governed" },
      { name: "polish_diff", desc: "Turn design findings into deterministic token substitutions, ready to apply—no files written" },
      { name: "talon_scan", desc: "Run the deterministic detector engine over a page—pure measurement, no LLM" },
      { name: "talon_rules", desc: "Enumerate the detector rule corpus—id, category, severity, and taste scope" },
      { name: "stop_grab_session", desc: "Stop the grab bridge and clear its queued selections" },
    ],
  },
  {
    num: "04",
    title: "Audit",
    purpose: "Check the work — web, native, and cross-platform — against the standards, with evidence.",
    marquee: ["audit_url", "audit_contrast", "audit_swiftui"],
    tools: [
      { name: "audit", desc: "Choose the relevant checks for a web page, iOS screen, React Native source, code diff, or video, then return one merged report" },
      { name: "audit_url", desc: "Render a live URL at every viewport & theme, then catch cropped images, blank videos, hover white-wash, and hidden-on-mobile content" },
      { name: "audit_contrast", desc: "WCAG 2.1 contrast ratios for every text element on a rendered page—AA/AAA pass-fail with delta-to-pass" },
      { name: "audit_swiftui", desc: "Audit SwiftUI source against Apple's HIG—Dynamic Type, semantic colors, 44pt targets, AccentColor" },
      { name: "audit_page", desc: "Score any HTML page against Raven's design quality standards—typography, accessibility, responsive, tokens" },
      { name: "audit_layout", desc: "Evaluate a rendered page's visual rhythm, alignment, and optical balance" },
      { name: "audit_responsive_visibility", desc: "Flag content visible on desktop but hidden on mobile across breakpoints—catches responsive-hiding bugs that only surface on real devices" },
      { name: "audit_tap_targets", desc: "WCAG 2.5.5 / 44px tap-target audit—a per-element fix table with the exact CSS to reach the minimum, worst-first" },
      { name: "audit_typography", desc: "Typographic-scale report—detects the modular ratio, off-scale sizes, line-height drift, and bloated weight ladders" },
      { name: "audit_content", desc: "Per-item UX-writing verdicts—metrics need a number, CTAs stay action-led, prose drops passive voice and jargon, with rewrites" },
      { name: "audit_asset_integrity", desc: "Detect content sliced off inside a correctly-sized export—luminance variance flags a Figma export that ended mid-form" },
      { name: "audit_device_frame", desc: "Catch content cropped inside a device mockup—aspect-ratio cover loss, baked-in pan/zoom drift, and edges sliced at the frame" },
      { name: "audit_consistency", desc: "Audit multiple routes for cross-page consistency—content-container width and hero heading tier against the inferred canonical" },
      { name: "audit_video_playback", desc: "Render in headless Chromium and check every <video> actually advances—classifies each clip playing, paused, stalled, empty, or error" },
      { name: "suggest_contrast_fix", desc: "Given failing WCAG pairs, return the minimal color change that clears the target ratio—the smallest foreground shift, with a background alternative" },
      { name: "audit_screen", desc: "Score a rendered iOS or Android screen from an accessibility snapshot—44/48pt targets, contrast, visual rhythm" },
      { name: "audit_ios_screen", desc: "Score a captured iOS screen snapshot—44pt targets, contrast, visual rhythm—with device-capable capture orchestration" },
      { name: "audit_ios_a11y", desc: "Score an iOS accessibility snapshot—missing labels/traits, sub-44pt targets, per-text contrast, Dynamic-Type clipping, VoiceOver order" },
      { name: "audit_ios_privacy", desc: "Audit Info.plist or Expo app.json—usage-string honesty, ATS, bundled secrets, undisclosed data-egress" },
      { name: "audit_rn", desc: "Audit React Native / Expo source—touchable a11y, 44/48pt targets, font scaling, safe areas, dark mode" },
      { name: "audit_parity", desc: "Compare iOS and Android snapshots against named spatial relationships—catches cross-platform layout drift past device-verified claims" },
      { name: "audit_contract", desc: "Verify a wire contract is identical across iOS, proxy, and Android—flags missing tokens, schemaVersion drift, and prefix-ordering bugs" },
      { name: "audit_api_contract", desc: "Run adversarial queries against a live endpoint—flags responses that pass shape but are confidently wrong" },
      { name: "evaluate_design", desc: "Score a design description against relevant principles and patterns" },
      { name: "score_creative", desc: "Score prompts, scripts, and concepts for hook strength, benefit clarity, channel fit, audience fit, and brand fit" },
      { name: "score_page", desc: "Score a page across 7 categories—structure, type, color, spacing, accessibility, responsive, tokens—each rated 0–10, derived deterministically" },
    ],
  },
  {
    num: "05",
    title: "Judge",
    purpose: "The Taste Engine — calibrate a person's design judgment once, then hold every build to it, with the rule behind each verdict.",
    marquee: ["audit_taste", "get_taste_interview", "label_finding"],
    tools: [
      { name: "audit_taste", desc: "Judge HTML, text, or a URL against a profile—verdict BLOCK/WARN/PASS, every finding citing a rule_id and its evidence" },
      { name: "get_taste_interview", desc: "A kickoff question set built from the profile's own rules—asks how each surface should read before the first design decision" },
      { name: "label_finding", desc: "Append a labeled precedent—accept, revise, or reject; accepted patterns suppress that finding in future audits" },
      { name: "create_taste_profile", desc: "Build a ruleset and precedent corpus from explicit rules or a DESIGN.md doc—stored locally under ~/.raven/taste" },
      { name: "get_taste_profile", desc: "Read a profile's rules, scopes, voice, and its surface bindings" },
      { name: "list_taste_profiles", desc: "Browse every taste profile on this machine" },
      { name: "bind_taste_surface", desc: "Bind a profile to a surface—scoped overrides, URL hosts, a voice note, and per-dimension design notes" },
      { name: "record_taste_decision", desc: "Log a chosen-vs-rejected decision so recurring choices become interview defaults" },
      { name: "list_taste_decisions", desc: "Review the decision history behind a profile's evolving taste" },
      { name: "generate_taste_portrait", desc: "Render a bound surface as a self-contained designed page built from its own taste store" },
    ],
  },
  {
    num: "06",
    title: "Decide",
    purpose: "The Decision Graph — a queryable design-decision memory that a project's people and agents both consult, so decisions stop getting re-litigated and lost, with provenance and evidence on every node.",
    marquee: ["decision_add", "decision_import", "gap_scan"],
    tools: [
      { name: "decision_add", desc: "Record an active decision with its scope, component, rationale, and the alternatives you rejected" },
      { name: "decision_draft", desc: "Capture a decision now and confirm the why later" },
      { name: "decision_commit", desc: "Confirm a draft's rationale—and surface similar active decisions for review" },
      { name: "decision_get", desc: "Read one decision, its attached evidence, and every node connected to it" },
      { name: "decision_list", desc: "List active, superseded, contested, or candidate decisions" },
      { name: "decision_history", desc: "Trace a decision's full supersession lineage, oldest to newest" },
      { name: "decision_scope", desc: "Narrow two decisions to distinct scopes so both can stay active" },
      { name: "decision_supersede", desc: "Replace a decision while keeping both nodes and their lineage" },
      { name: "decision_evidence", desc: "Attach quantitative or qualitative evidence to a decision" },
      { name: "decision_import", desc: "Cold-start the graph from local git history and decision-bearing Markdown, as source-tagged extraction prompts" },
      { name: "ingest_transcript", desc: "Store a transcript and return an extraction prompt for your model" },
      { name: "ingest_transcript_results", desc: "Turn extracted JSON into reviewable candidate decisions linked to their source" },
      { name: "gap_scan", desc: "Scan the graph for uncovered components, thin rationales, contested decisions, and stale derivations" },
    ],
  },
  {
    num: "07",
    title: "Meta",
    purpose: "Local usage reflection and release registration.",
    marquee: ["raven_reflect", "raven_register"],
    tools: [
      { name: "raven_reflect", desc: "Summarize your local Raven usage log—tool counts, recurring warnings, gaps" },
      { name: "raven_register", desc: "Register an email for Raven updates and a direct feedback line to the creator" },
    ],
  },
];

export default function ToolsSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section id="tools" className="tools-section">
      <div className="container">
        <div className="section-header">
          <h2 className="reveal reveal-delay-1">One hundred tools, organized by job</h2>
          <p className="subtitle reveal reveal-delay-2">
            One hundred focused calls, grouped by what they do&mdash;<strong>know</strong>, <strong>create</strong>,{" "}
            <strong>design</strong>, <strong>audit</strong>, <strong>judge</strong>, <strong>decide</strong>. Claude calls them automatically, with no special syntax.
          </p>
        </div>

        <div className="txb-list">
          {ACTS.map((act, i) => {
            const open = openIdx === i;
            return (
              <div className="txb-act" key={act.num} data-open={open}>
                <button
                  className="txb-act-head"
                  onClick={() => setOpenIdx(open ? null : i)}
                  aria-expanded={open}
                  aria-controls={"txb-panel-" + act.num}
                >
                  <span className="txb-num">{act.num}</span>
                  <span className="txb-head-main">
                    <span className="txb-head-top">
                      <span className="txb-title">{act.title}</span>
                      <span className="txb-count">{act.tools.length} tools</span>
                    </span>
                    <span className="txb-purpose">{act.purpose}</span>
                    <span className="txb-marquee">
                      {act.marquee.map((m) => (
                        <span className="txb-marquee-item" key={m}>{m}</span>
                      ))}
                    </span>
                  </span>
                  <span className="txb-chevron" aria-hidden="true">
                    <svg width="26" height="26" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </span>
                </button>

                <div className="txb-panel" id={"txb-panel-" + act.num} role="region" aria-label={act.title + " tools"} hidden={!open}>
                  <div className="txb-grid">
                    {act.tools.map((t) => (
                      <div className="txb-tool" key={t.name}>
                        <div className="txb-tool-name">{t.name}</div>
                        <div className="txb-tool-desc">{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </section>
  );
}
