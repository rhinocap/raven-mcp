"use client";

import { useEffect, useRef, useState } from "react";

type Tool = { name: string; desc: string; act: number };

const ACTS = [
  { title: "Know", desc: "Ask for the source material Raven uses: principles, patterns, research methods, metrics frameworks, and token libraries." },
  { title: "Create", desc: "Create token sets, brand profiles, service blueprints, and provider-ready creative job payloads from explicit inputs." },
  { title: "Audit", desc: "Check the work — web, native, and cross-platform — against the standards, with evidence." },
  { title: "Judge", desc: "The Taste Engine — calibrate a person's design judgment once, then hold every build to it, with the rule behind each verdict." },
  { title: "Meta", desc: "Local usage reflection and release registration." },
];

const TOOLS: Tool[] = [
  // Know — 18
  { act: 0, name: "get_principles", desc: "Design principles matched to your UI context — heuristics, laws, accessibility, color theory" },
  { act: 0, name: "get_design_system", desc: "Full tokens — colors, typography, spacing, radii, elevation, motion" },
  { act: 0, name: "search_knowledge", desc: "Full-text search across all principles, patterns, and business strategy" },
  { act: 0, name: "get_pattern", desc: "Field-tested patterns with do's, don'ts, and evidence across UI, content, and service-design types" },
  { act: 0, name: "get_checklist", desc: "Pre-publish quality checklist for any UI type — forms, dashboards, landing pages, mobile" },
  { act: 0, name: "get_d4d_framework", desc: "Design for Delight — customer empathy, hypothesis, and experiment templates" },
  { act: 0, name: "get_business_strategy", desc: "Monetization, retention, onboarding, growth, and metrics frameworks" },
  { act: 0, name: "get_metrics_framework", desc: "HEART, AARRR, North Star, conversion funnel, RICE, OKRs — with examples" },
  { act: 0, name: "get_research_method", desc: "Qualitative, quantitative, and usability methods — with protocols and bias traps" },
  { act: 0, name: "list_design_systems", desc: "Browse the registry of 12 design systems with tokens and metadata" },
  { act: 0, name: "list_content_systems", desc: "Browse brand voice & tone systems — Mailchimp, GOV.UK, Polaris, Atlassian" },
  { act: 0, name: "get_content_system", desc: "A brand's full voice — attributes, tone shifts, vocabulary, grammar, content patterns" },
  { act: 0, name: "get_content_principles", desc: "UX-writing principles — clarity, active voice, error anatomy, inclusive language" },
  { act: 0, name: "get_content_pattern", desc: "Copy recipes for error messages, empty states, notifications, form validation" },
  { act: 0, name: "get_service_pattern", desc: "Blueprinting, human handoff, signup-as-service, omnichannel, moments of truth" },
  { act: 0, name: "get_service_standard", desc: "The GOV.UK Service Standard — 14 points for service-quality assessment" },
  { act: 0, name: "get_brand_principles", desc: "Logo usage, gradient rules, imagery, visual hierarchy, brand-as-system" },
  { act: 0, name: "get_brand_trends", desc: "2026 visual trends — bento, monospace, neon-on-glass, brutalism, AI imagery" },

  // Create — 15
  { act: 1, name: "generate_design_system", desc: "Generate a complete design system from a brand color — export as HTML, CSS, Figma, or SVG" },
  { act: 1, name: "plan_creative_campaign", desc: "Plan a multi-asset campaign across photos, cards, UGC ads, TV spots, social packs, and storyboards" },
  { act: 1, name: "generate_service_blueprint", desc: "Render a service blueprint as HTML — current vs. ideal, with two-actor HI-loop mode" },
  { act: 1, name: "compose_system", desc: "Mix tokens from multiple design systems into a custom composition" },
  { act: 1, name: "get_brand_system", desc: "Get a complete design system for building an app with branding like any company" },
  { act: 1, name: "create_brand_profile", desc: "Store local brand memory: colors, fonts, tone, audience, constraints, product notes, and asset references" },
  { act: 1, name: "get_brand_profile", desc: "Read a saved local creative brand profile for reuse in generation and campaign jobs" },
  { act: 1, name: "list_brand_profiles", desc: "List saved creative brand profiles under the local Raven creative workspace" },
  { act: 1, name: "create_character_profile", desc: "Create a character or identity reference profile for consistent image and video generation" },
  { act: 1, name: "create_generation_job", desc: "Create a provider-ready image, video, audio, 3D, campaign, or analysis job payload" },
  { act: 1, name: "get_generation_job", desc: "Read a generation job, its provider payload, status, and runner output if execution was enabled" },
  { act: 1, name: "list_generation_jobs", desc: "List local creative generation jobs by status, media type, or brand profile" },
  { act: 1, name: "list_creative_models", desc: "Browse provider-agnostic model slots for image, video, 3D, audio, character consistency, and analysis" },
  { act: 1, name: "list_creative_presets", desc: "Browse presets for product photos, marketplace cards, UGC ads, TV spots, social packs, storyboards, and infographics" },
  { act: 1, name: "register_creative_asset", desc: "Register a local path or remote URL as an asset reference; Raven stores metadata, not file bytes" },

  // Audit — 25
  { act: 2, name: "audit_url", desc: "Render a live URL at every viewport & theme, then catch cropped images, blank videos, hover white-wash, and hidden-on-mobile content" },
  { act: 2, name: "audit_contrast", desc: "WCAG 2.1 contrast ratios for every text element on a rendered page — AA/AAA pass-fail with delta-to-pass" },
  { act: 2, name: "audit_swiftui", desc: "Audit SwiftUI source against Apple's HIG — Dynamic Type, semantic colors, 44pt targets, AccentColor" },
  { act: 2, name: "audit_page", desc: "Score any HTML page against Raven's design quality standards — typography, accessibility, responsive, tokens" },
  { act: 2, name: "audit_layout", desc: "Evaluate a rendered page's visual rhythm, alignment, and optical balance" },
  { act: 2, name: "audit_responsive_visibility", desc: "Flag content visible on desktop but hidden on mobile across breakpoints — catches responsive-hiding bugs that only surface on real devices" },
  { act: 2, name: "audit_tap_targets", desc: "WCAG 2.5.5 / 44px tap-target audit — a per-element fix table with the exact CSS to reach the minimum, worst-first" },
  { act: 2, name: "audit_typography", desc: "Typographic-scale report — detects the modular ratio, off-scale sizes, line-height drift, and bloated weight ladders" },
  { act: 2, name: "audit_content", desc: "Per-item UX-writing verdicts — metrics need a number, CTAs stay action-led, prose drops passive voice and jargon, with rewrites" },
  { act: 2, name: "audit_asset_integrity", desc: "Detect content sliced off inside a correctly-sized export — luminance variance flags a Figma export that ended mid-form" },
  { act: 2, name: "audit_device_frame", desc: "Catch content cropped inside a device mockup — aspect-ratio cover loss, baked-in pan/zoom drift, and edges sliced at the frame" },
  { act: 2, name: "audit_consistency", desc: "Audit multiple routes for cross-page consistency — content-container width and hero heading tier against the inferred canonical" },
  { act: 2, name: "audit_video_playback", desc: "Render in headless Chromium and check every <video> actually advances — classifies each clip playing, paused, stalled, empty, or error" },
  { act: 2, name: "suggest_contrast_fix", desc: "Given failing WCAG pairs, return the minimal color change that clears the target ratio — the smallest foreground shift, with a background alternative" },
  { act: 2, name: "audit_screen", desc: "Score a rendered iOS or Android screen from an accessibility snapshot — 44/48pt targets, contrast, visual rhythm" },
  { act: 2, name: "audit_ios_screen", desc: "Score a captured iOS screen snapshot — 44pt targets, contrast, visual rhythm — with device-capable capture orchestration" },
  { act: 2, name: "audit_ios_a11y", desc: "Score an iOS accessibility snapshot — missing labels/traits, sub-44pt targets, per-text contrast, Dynamic-Type clipping, VoiceOver order" },
  { act: 2, name: "audit_ios_privacy", desc: "Audit Info.plist or Expo app.json — usage-string honesty, ATS, bundled secrets, undisclosed data-egress" },
  { act: 2, name: "audit_rn", desc: "Audit React Native / Expo source — touchable a11y, 44/48pt targets, font scaling, safe areas, dark mode" },
  { act: 2, name: "audit_parity", desc: "Compare iOS and Android snapshots against named spatial relationships — catches cross-platform layout drift past device-verified claims" },
  { act: 2, name: "audit_contract", desc: "Verify a wire contract is identical across iOS, proxy, and Android — flags missing tokens, schemaVersion drift, and prefix-ordering bugs" },
  { act: 2, name: "audit_api_contract", desc: "Run adversarial queries against a live endpoint — flags responses that pass shape but are confidently wrong" },
  { act: 2, name: "evaluate_design", desc: "Score a design description against relevant principles and patterns" },
  { act: 2, name: "score_creative", desc: "Score prompts, scripts, and concepts for hook strength, benefit clarity, channel fit, audience fit, and brand fit" },
  { act: 2, name: "score_page", desc: "Score a page across 7 categories — structure, type, color, spacing, accessibility, responsive, tokens — each rated 0–10, derived deterministically" },

  // Judge — 10
  { act: 3, name: "audit_taste", desc: "Judge HTML, text, or a URL against a profile — verdict BLOCK/WARN/PASS, every finding citing a rule_id and its evidence" },
  { act: 3, name: "get_taste_interview", desc: "A kickoff question set built from the profile's own rules — asks how each surface should read before the first design decision" },
  { act: 3, name: "label_finding", desc: "Append a labeled precedent — accept, revise, or reject; accepted patterns suppress that finding in future audits" },
  { act: 3, name: "create_taste_profile", desc: "Build a ruleset and precedent corpus from explicit rules or a DESIGN.md doc — stored locally under ~/.raven/taste" },
  { act: 3, name: "get_taste_profile", desc: "Read a profile's rules, scopes, voice, and its surface bindings" },
  { act: 3, name: "list_taste_profiles", desc: "Browse every taste profile on this machine" },
  { act: 3, name: "bind_taste_surface", desc: "Bind a profile to a surface — scoped overrides, URL hosts, a voice note, and per-dimension design notes" },
  { act: 3, name: "record_taste_decision", desc: "Log a chosen-vs-rejected decision so recurring choices become interview defaults" },
  { act: 3, name: "list_taste_decisions", desc: "Review the decision history behind a profile's evolving taste" },
  { act: 3, name: "generate_taste_portrait", desc: "Render a bound surface as a self-contained designed page built from its own taste store" },

  // Meta — 2
  { act: 4, name: "raven_reflect", desc: "Summarize your local Raven usage log — tool counts, recurring warnings, gaps" },
  { act: 4, name: "raven_register", desc: "Register an email for Raven updates and a direct feedback line to the creator" },
];

export default function ToolsExplorationC() {
  const [activeAct, setActiveAct] = useState(0);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const editable = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !editable) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && el === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? TOOLS.filter((t) => t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)) : null;
  const visible = filtered ?? TOOLS.filter((t) => t.act === activeAct);

  return (
    <section id="tools" className="tools-section">
      <div className="container">
        <div className="section-header">
          <p className="label reveal">Seventy Tools</p>
          <h2 className="reveal reveal-delay-1">Seventy tools, organized by job</h2>
          <p className="subtitle reveal reveal-delay-2">
            Know, create, audit, judge — Claude calls them automatically, no special syntax. Browse by job, or filter across all seventy.
          </p>
        </div>

        <div className="txc-controls reveal">
          <div className="txc-tabs" role="tablist" aria-label="Tool categories">
            {ACTS.map((a, i) => {
              const count = TOOLS.filter((t) => t.act === i).length;
              return (
                <button
                  key={a.title}
                  type="button"
                  role="tab"
                  aria-selected={!filtered && activeAct === i}
                  className={"txc-tab" + (!filtered && activeAct === i ? " txc-tab-active" : "")}
                  onClick={() => {
                    setActiveAct(i);
                    setQuery("");
                  }}
                >
                  {a.title}
                  <span className="txc-tab-count">{count}</span>
                </button>
              );
            })}
          </div>
          <label className="txc-filter">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="7" cy="7" r="4" />
              <path d="M10 10l4 4" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter 70 tools…"
              className="txc-filter-input"
              aria-label="Filter tools by name or description"
            />
            <kbd className="txc-filter-key">/</kbd>
          </label>
        </div>

        <p className="txc-act-desc reveal">
          {filtered ? `${filtered.length} of 70 tools match “${query}”` : ACTS[activeAct].desc}
        </p>

        <div className="txc-grid">
          {visible.map((t) => (
            <div className="txc-row" key={t.name}>
              <span className="txc-dot" aria-hidden="true" />
              <div className="txc-row-body">
                <div className="txc-row-head">
                  <span className="txc-name">{t.name}</span>
                  {filtered && <span className="txc-act-badge">{ACTS[t.act].title}</span>}
                </div>
                <span className="txc-desc">{t.desc}</span>
              </div>
            </div>
          ))}
          {filtered && filtered.length === 0 && <p className="txc-empty">No tools match. Try a different word.</p>}
        </div>
      </div>

      <style>{`
        .txc-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: var(--space-4);
          margin-top: var(--space-10);
        }
        .txc-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .txc-tab {
          font-family: var(--font-mono);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          background: transparent;
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-full);
          padding: 8px 16px;
          min-height: 44px;
          cursor: pointer;
          transition: color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
        }
        .txc-tab:hover {
          color: var(--text-primary);
          border-color: var(--border-accent);
        }
        .txc-tab-active {
          color: var(--text-accent);
          background: var(--bg-accent-subtle);
          border-color: var(--border-accent);
        }
        .txc-tab-count {
          margin-left: 6px;
          opacity: 0.6;
          font-weight: 500;
        }
        .txc-filter {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex: 1 1 260px;
          min-width: 0;
          max-width: 340px;
          padding: 8px 14px;
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-full);
          background: var(--bg-surface);
          color: var(--text-tertiary);
          transition: border-color var(--duration-fast) var(--ease-out);
        }
        .txc-filter:focus-within {
          border-color: var(--border-accent);
          color: var(--text-accent);
        }
        .txc-filter svg { flex-shrink: 0; }
        .txc-filter-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: 0;
          outline: 0;
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 14px;
        }
        .txc-filter-input::placeholder { color: var(--text-tertiary); }
        .txc-filter-key {
          flex-shrink: 0;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-muted-deep);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 1px 6px;
        }
        .txc-act-desc {
          margin: var(--space-5) 0 0;
          font-size: 15px;
          color: var(--text-secondary);
          max-width: 640px;
        }
        .txc-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 0 var(--space-8);
          margin-top: var(--space-6);
          border-top: 1px solid var(--border);
        }
        .txc-row {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-4) 0;
          border-bottom: 1px solid var(--border);
        }
        .txc-dot {
          width: 6px;
          height: 6px;
          margin-top: 8px;
          border-radius: 50%;
          background: var(--text-accent);
          flex-shrink: 0;
        }
        .txc-row-body { min-width: 0; }
        .txc-row-head {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .txc-name {
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .txc-act-badge {
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-tertiary);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-sm);
          padding: 1px 6px;
        }
        .txc-desc {
          display: block;
          margin-top: 2px;
          font-size: 14px;
          line-height: var(--leading-copy);
          color: var(--text-secondary);
        }
        .txc-empty {
          grid-column: 1 / -1;
          padding: var(--space-10) 0;
          text-align: center;
          color: var(--text-tertiary);
          font-size: 14px;
        }
        @media (max-width: 640px) {
          .txc-controls { flex-direction: column; align-items: stretch; }
          .txc-filter { max-width: none; flex: 0 0 auto; }
          .txc-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
