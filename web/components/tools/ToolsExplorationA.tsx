type Tool = { name: string; desc: string };
type Act = { num: string; title: string; desc: string; tools: Tool[] };

const ACTS: Act[] = [
  {
    num: "01",
    title: "Know",
    desc: "The source material Raven uses: principles, patterns, research methods, metrics frameworks, and token libraries.",
    tools: [
      { name: "get_principles", desc: "Design principles matched to your UI context — heuristics, laws, accessibility, color theory" },
      { name: "get_design_system", desc: "Full tokens — colors, typography, spacing, radii, elevation, motion" },
      { name: "search_knowledge", desc: "Full-text search across all principles, patterns, and business strategy" },
      { name: "get_pattern", desc: "Field-tested patterns with do's, don'ts, and evidence across UI, content, and service-design types" },
      { name: "get_checklist", desc: "Pre-publish quality checklist for any UI type — forms, dashboards, landing pages, mobile" },
      { name: "get_d4d_framework", desc: "Design for Delight — customer empathy, hypothesis, and experiment templates" },
      { name: "get_business_strategy", desc: "Monetization, retention, onboarding, growth, and metrics frameworks" },
      { name: "get_metrics_framework", desc: "HEART, AARRR, North Star, conversion funnel, RICE, OKRs — with examples" },
      { name: "get_research_method", desc: "Qualitative, quantitative, and usability methods — with protocols and bias traps" },
      { name: "list_design_systems", desc: "Browse the registry of 12 design systems with tokens and metadata" },
      { name: "list_content_systems", desc: "Browse brand voice and tone systems — Mailchimp, GOV.UK, Polaris, Atlassian" },
      { name: "get_content_system", desc: "A brand's full voice — attributes, tone shifts, vocabulary, grammar, content patterns" },
      { name: "get_content_principles", desc: "UX-writing principles — clarity, active voice, error anatomy, inclusive language" },
      { name: "get_content_pattern", desc: "Copy recipes for error messages, empty states, notifications, form validation" },
      { name: "get_service_pattern", desc: "Blueprinting, human handoff, signup-as-service, omnichannel, moments of truth" },
      { name: "get_service_standard", desc: "The GOV.UK Service Standard — 14 points for service-quality assessment" },
      { name: "get_brand_principles", desc: "Logo usage, gradient rules, imagery, visual hierarchy, brand-as-system" },
      { name: "get_brand_trends", desc: "2026 visual trends — bento, monospace, neon-on-glass, brutalism, AI imagery" },
    ],
  },
  {
    num: "02",
    title: "Create",
    desc: "Token sets, brand profiles, service blueprints, and provider-ready creative job payloads from explicit inputs.",
    tools: [
      { name: "generate_design_system", desc: "Generate a complete design system from a brand color — export as HTML, CSS, Figma, or SVG" },
      { name: "plan_creative_campaign", desc: "Plan a multi-asset campaign across photos, cards, UGC ads, TV spots, social packs, and storyboards" },
      { name: "generate_service_blueprint", desc: "Render a service blueprint as HTML — current vs. ideal, with two-actor HI-loop mode" },
      { name: "compose_system", desc: "Mix tokens from multiple design systems into a custom composition" },
      { name: "get_brand_system", desc: "Get a complete design system for building an app with branding like any company" },
      { name: "create_brand_profile", desc: "Store local brand memory: colors, fonts, tone, audience, constraints, product notes, asset references" },
      { name: "get_brand_profile", desc: "Read a saved local creative brand profile for reuse in generation and campaign jobs" },
      { name: "list_brand_profiles", desc: "List saved creative brand profiles under the local Raven creative workspace" },
      { name: "create_character_profile", desc: "Create a character or identity reference profile for consistent image and video generation" },
      { name: "create_generation_job", desc: "Create a provider-ready image, video, audio, 3D, campaign, or analysis job payload" },
      { name: "get_generation_job", desc: "Read a generation job, its provider payload, status, and runner output if execution was enabled" },
      { name: "list_generation_jobs", desc: "List local creative generation jobs by status, media type, or brand profile" },
      { name: "list_creative_models", desc: "Browse provider-agnostic model slots for image, video, 3D, audio, character consistency, analysis" },
      { name: "list_creative_presets", desc: "Browse presets for product photos, marketplace cards, UGC ads, TV spots, social packs, storyboards" },
      { name: "register_creative_asset", desc: "Register a local path or remote URL as an asset reference; Raven stores metadata, not file bytes" },
    ],
  },
  {
    num: "03",
    title: "Audit",
    desc: "Check the work — web, native, and cross-platform — against the standards, with evidence.",
    tools: [
      { name: "audit_url", desc: "Render a live URL at every viewport and theme; catch cropped images, blank videos, hover white-wash, hidden-on-mobile content" },
      { name: "audit_contrast", desc: "WCAG 2.1 contrast ratios for every text element on a rendered page — AA/AAA pass-fail with delta-to-pass" },
      { name: "audit_swiftui", desc: "Audit SwiftUI source against Apple's HIG — Dynamic Type, semantic colors, 44pt targets, AccentColor" },
      { name: "audit_page", desc: "Score any HTML page against Raven's design quality standards — typography, accessibility, responsive, tokens" },
      { name: "audit_layout", desc: "Evaluate a rendered page's visual rhythm, alignment, and optical balance" },
      { name: "audit_responsive_visibility", desc: "Flag content visible on desktop but hidden on mobile across breakpoints — catches responsive-hiding bugs" },
      { name: "audit_tap_targets", desc: "WCAG 2.5.5 / 44px tap-target audit — a per-element fix table with the exact CSS to reach the minimum" },
      { name: "audit_typography", desc: "Typographic-scale report — detects the modular ratio, off-scale sizes, line-height drift, bloated weight ladders" },
      { name: "audit_content", desc: "Per-item UX-writing verdicts — metrics need a number, CTAs stay action-led, prose drops passive voice, with rewrites" },
      { name: "audit_asset_integrity", desc: "Detect content sliced off inside a correctly-sized export — luminance variance flags a mid-form export" },
      { name: "audit_device_frame", desc: "Catch content cropped inside a device mockup — aspect-ratio cover loss, baked-in pan/zoom drift, sliced edges" },
      { name: "audit_consistency", desc: "Audit multiple routes for cross-page consistency — content-container width and hero heading tier vs. canonical" },
      { name: "audit_video_playback", desc: "Render in headless Chromium and check every video actually advances — playing, paused, stalled, empty, or error" },
      { name: "suggest_contrast_fix", desc: "Given a failing WCAG pair, return the minimal color change that clears the target ratio" },
      { name: "audit_screen", desc: "Score a rendered iOS or Android screen from an accessibility snapshot — 44/48pt targets, contrast, rhythm" },
      { name: "audit_ios_screen", desc: "Score a captured iOS screen snapshot — 44pt targets, contrast, visual rhythm — with capture orchestration" },
      { name: "audit_ios_a11y", desc: "Score an iOS accessibility snapshot — missing labels/traits, sub-44pt targets, contrast, VoiceOver order" },
      { name: "audit_ios_privacy", desc: "Audit Info.plist or Expo app.json — usage-string honesty, ATS, bundled secrets, undisclosed data-egress" },
      { name: "audit_rn", desc: "Audit React Native / Expo source — touchable a11y, 44/48pt targets, font scaling, safe areas, dark mode" },
      { name: "audit_parity", desc: "Compare iOS and Android snapshots against named spatial relationships — catches cross-platform layout drift" },
      { name: "audit_contract", desc: "Verify a wire contract is identical across iOS, proxy, and Android — missing tokens, schema drift" },
      { name: "audit_api_contract", desc: "Run adversarial queries against a live endpoint — flags responses that pass shape but are confidently wrong" },
      { name: "evaluate_design", desc: "Score a design description against relevant principles and patterns" },
      { name: "score_creative", desc: "Score prompts, scripts, and concepts for hook strength, benefit clarity, channel fit, brand fit" },
      { name: "score_page", desc: "Score a page across 7 categories, each rated 0–10, derived deterministically" },
    ],
  },
  {
    num: "04",
    title: "Judge",
    desc: "The Taste Engine — calibrate a person's design judgment once, then hold every build to it, with the rule behind each verdict.",
    tools: [
      { name: "audit_taste", desc: "Judge HTML, text, or a URL against a profile — verdict BLOCK/WARN/PASS, every finding citing a rule and its evidence" },
      { name: "get_taste_interview", desc: "A kickoff question set built from the profile's own rules — asks how a surface should read before the first decision" },
      { name: "label_finding", desc: "Append a labeled precedent — accept, revise, or reject; accepted patterns suppress that finding in future audits" },
      { name: "create_taste_profile", desc: "Build a ruleset and precedent corpus from explicit rules or a DESIGN.md doc — stored locally" },
      { name: "get_taste_profile", desc: "Read a profile's rules, scopes, voice, and its surface bindings" },
      { name: "list_taste_profiles", desc: "Browse every taste profile on this machine" },
      { name: "bind_taste_surface", desc: "Bind a profile to a surface — scoped overrides, URL hosts, a voice note, per-dimension design notes" },
      { name: "record_taste_decision", desc: "Log a chosen-vs-rejected decision so recurring choices become interview defaults" },
      { name: "list_taste_decisions", desc: "Review the decision history behind a profile's evolving taste" },
      { name: "generate_taste_portrait", desc: "Render a bound surface as a self-contained designed page built from its own taste store" },
    ],
  },
  {
    num: "05",
    title: "Meta",
    desc: "Local usage reflection and release registration.",
    tools: [
      { name: "raven_reflect", desc: "Summarize your local Raven usage log — tool counts, recurring warnings, gaps" },
      { name: "raven_register", desc: "Register an email for Raven updates and a direct feedback line to the creator" },
    ],
  },
];

export default function ToolsExplorationA() {
  return (
    <section id="tools" className="tools-section">
      <div className="container">
        <div className="section-header">
          <p className="label reveal">Seventy Tools</p>
          <h2 className="reveal reveal-delay-1">Seventy tools, organized by job</h2>
          <p className="subtitle reveal reveal-delay-2">
            Seventy focused calls, grouped by what they do&mdash;<strong>know</strong>, <strong>create</strong>,{" "}
            <strong>audit</strong>, <strong>judge</strong>. Claude calls them automatically, with no special syntax.
          </p>
        </div>

        {ACTS.map((act) => (
          <div className="txa-act reveal" key={act.title}>
            <div className="txa-head">
              <span className="txa-num">{act.num}</span>
              <h3 className="txa-title">{act.title}</h3>
              <p className="txa-desc">{act.desc}</p>
              <span className="txa-count">{act.tools.length} tools</span>
            </div>
            <ul className="txa-list">
              {act.tools.map((t) => (
                <li className="txa-row" key={t.name}>
                  <code className="txa-name">{t.name}</code>
                  <span className="txa-line">{t.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <style>{`
        .txa-act { margin-top: var(--space-16); }
        .section-header + .txa-act { margin-top: var(--space-10); }

        .txa-head {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: var(--space-2) var(--space-4);
          padding-bottom: var(--space-4);
          margin-bottom: var(--space-2);
          border-bottom: 1px solid var(--border-strong);
        }
        .txa-num {
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 600;
          color: var(--text-accent);
        }
        .txa-title {
          font-size: clamp(22px, 2.4vw, 28px);
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          margin: 0;
        }
        .txa-desc {
          font-size: 15px;
          color: var(--text-secondary);
          margin: 0;
          flex: 1 1 320px;
          min-width: 0;
        }
        .txa-count {
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-tertiary);
          white-space: nowrap;
        }

        .txa-list {
          list-style: none;
          margin: 0;
          padding: 0;
          column-count: 1;
          column-gap: var(--space-10);
        }
        .txa-row {
          display: grid;
          grid-template-columns: minmax(160px, 240px) 1fr;
          align-items: baseline;
          gap: var(--space-2) var(--space-5);
          padding: var(--space-3) 0;
          border-bottom: 1px solid var(--border);
          break-inside: avoid;
          transition: background var(--duration-fast) var(--ease-out);
        }
        .txa-row:hover {
          background: var(--bg-accent-subtle);
        }
        .txa-name {
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .txa-line {
          font-size: 14px;
          line-height: var(--leading-copy);
          color: var(--text-secondary);
        }
        .txa-row:hover .txa-name { color: var(--text-accent); }
        .txa-row:hover .txa-line { color: var(--text-primary); }

        @media (min-width: 1024px) {
          .txa-list { column-count: 2; }
        }

        @media (max-width: 640px) {
          .txa-row {
            grid-template-columns: 1fr;
            gap: 2px;
            padding: var(--space-3) 0;
          }
          .txa-desc { flex-basis: 100%; }
        }
      `}</style>
    </section>
  );
}
