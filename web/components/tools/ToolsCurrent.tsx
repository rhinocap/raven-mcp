export default function ToolsCurrent() {
  return (
        <section id="tools" className="tools-section">
          <div className="container">
            <div className="section-header">
              <p className="label reveal">Seventy Tools</p>
              <h2 className="reveal reveal-delay-1">Seventy tools, organized by job</h2>
              <p className="subtitle reveal reveal-delay-2">Seventy focused calls, grouped by what they do&mdash;<strong>know</strong>, <strong>create</strong>, <strong>audit</strong>, <strong>judge</strong>. Claude calls them automatically, with no special syntax.</p>
            </div>

            {/* ponytail: hero cards + name-only chips; full per-tool descriptions live in /docs and in each chip's title tooltip */}
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">01</span>
                <h3 className="tool-act-title">Know</h3>
                <p className="tool-act-desc">Ask for the source material Raven uses: principles, patterns, research methods, metrics frameworks, and token libraries.</p>
                <span className="tool-act-count">18 tools</span>
              </div>
              <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3"/><circle cx="8" cy="11" r="0.5" fill="currentColor"/></svg></div>
                  <div><div className="tool-name">get_principles</div><div className="tool-desc">Design principles matched to your UI context&mdash;heuristics, laws, accessibility, color theory</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 6h6M5 8h4M5 10h5"/></svg></div>
                  <div><div className="tool-name">get_design_system</div><div className="tool-desc">Full tokens&mdash;colors, typography, spacing, radii, elevation, motion</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/></svg></div>
                  <div><div className="tool-name">search_knowledge</div><div className="tool-desc">Full-text search across all principles, patterns, and business strategy</div></div>
                </div>
              </div>
              <div className="tool-chips">
                <span className="tool-chip" title="Field-tested patterns with do's, don'ts, and evidence across UI, content, and service-design types">get_pattern</span>
                <span className="tool-chip" title="Pre-publish quality checklist for any UI type—forms, dashboards, landing pages, mobile">get_checklist</span>
                <span className="tool-chip" title="Design for Delight—customer empathy, hypothesis, and experiment templates">get_d4d_framework</span>
                <span className="tool-chip" title="Monetization, retention, onboarding, growth, and metrics frameworks">get_business_strategy</span>
                <span className="tool-chip" title="HEART, AARRR, North Star, conversion funnel, RICE, OKRs—with examples">get_metrics_framework</span>
                <span className="tool-chip" title="Qualitative, quantitative, and usability methods—with protocols and bias traps">get_research_method</span>
                <span className="tool-chip" title="Browse the registry of 12 design systems with tokens and metadata">list_design_systems</span>
                <span className="tool-chip" title="Browse brand voice & tone systems—Mailchimp, GOV.UK, Polaris, Atlassian">list_content_systems</span>
                <span className="tool-chip" title="A brand's full voice—attributes, tone shifts, vocabulary, grammar, content patterns">get_content_system</span>
                <span className="tool-chip" title="UX-writing principles—clarity, active voice, error anatomy, inclusive language">get_content_principles</span>
                <span className="tool-chip" title="Copy recipes for error messages, empty states, notifications, form validation">get_content_pattern</span>
                <span className="tool-chip" title="Blueprinting, human handoff, signup-as-service, omnichannel, moments of truth">get_service_pattern</span>
                <span className="tool-chip" title="The GOV.UK Service Standard—14 points for service-quality assessment">get_service_standard</span>
                <span className="tool-chip" title="Logo usage, gradient rules, imagery, visual hierarchy, brand-as-system">get_brand_principles</span>
                <span className="tool-chip" title="2026 visual trends—bento, monospace, neon-on-glass, brutalism, AI imagery">get_brand_trends</span>
              </div>
            </div>
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">02</span>
                <h3 className="tool-act-title">Create</h3>
                <p className="tool-act-desc">Create token sets, brand profiles, service blueprints, and provider-ready creative job payloads from explicit inputs.</p>
                <span className="tool-act-count">15 tools</span>
              </div>
              <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 8a5 5 0 0110 0"/><path d="M8 3v5l3 2"/></svg></div>
                  <div><div className="tool-name">generate_design_system</div><div className="tool-desc">Generate a complete design system from a brand color&mdash;export as HTML, CSS, Figma, or SVG</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 12l3-4 3 2 4-6"/><path d="M10 4h3v3"/></svg></div>
                  <div><div className="tool-name">plan_creative_campaign</div><div className="tool-desc">Plan a multi-asset campaign across photos, cards, UGC ads, TV spots, social packs, and storyboards</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="5" height="4"/><rect x="9" y="3" width="5" height="4"/><rect x="2" y="9" width="5" height="4"/><rect x="9" y="9" width="5" height="4"/></svg></div>
                  <div><div className="tool-name">generate_service_blueprint</div><div className="tool-desc">Render a service blueprint as HTML&mdash;current vs. ideal, with two-actor HI-loop mode</div></div>
                </div>
              </div>
              <div className="tool-chips">
                <span className="tool-chip" title="Mix tokens from multiple design systems into a custom composition">compose_system</span>
                <span className="tool-chip" title="Get a complete design system for building an app with branding like any company">get_brand_system</span>
                <span className="tool-chip" title="Store local brand memory: colors, fonts, tone, audience, constraints, product notes, and asset references">create_brand_profile</span>
                <span className="tool-chip" title="Read a saved local creative brand profile for reuse in generation and campaign jobs">get_brand_profile</span>
                <span className="tool-chip" title="List saved creative brand profiles under the local Raven creative workspace">list_brand_profiles</span>
                <span className="tool-chip" title="Create a character or identity reference profile for consistent image and video generation">create_character_profile</span>
                <span className="tool-chip" title="Create a provider-ready image, video, audio, 3D, campaign, or analysis job payload">create_generation_job</span>
                <span className="tool-chip" title="Read a generation job, its provider payload, status, and runner output if execution was enabled">get_generation_job</span>
                <span className="tool-chip" title="List local creative generation jobs by status, media type, or brand profile">list_generation_jobs</span>
                <span className="tool-chip" title="Browse provider-agnostic model slots for image, video, 3D, audio, character consistency, and analysis">list_creative_models</span>
                <span className="tool-chip" title="Browse presets for product photos, marketplace cards, UGC ads, TV spots, social packs, storyboards, and infographics">list_creative_presets</span>
                <span className="tool-chip" title="Register a local path or remote URL as an asset reference; Raven stores metadata, not file bytes">register_creative_asset</span>
              </div>
            </div>
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">03</span>
                <h3 className="tool-act-title">Audit</h3>
                <p className="tool-act-desc">Check the work &mdash; web, native, and cross-platform &mdash; against the standards, with evidence.</p>
                <span className="tool-act-count">25 tools</span>
              </div>
              <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg></div>
                  <div><div className="tool-name">audit_url</div><div className="tool-desc">Render a live URL at every viewport &amp; theme, then catch cropped images, blank videos, hover white-wash, and hidden-on-mobile content</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 000 12z" fill="currentColor"/></svg></div>
                  <div><div className="tool-name">audit_contrast</div><div className="tool-desc">WCAG 2.1 contrast ratios for every text element on a rendered page&mdash;AA/AAA pass-fail with delta-to-pass</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="8" height="12" rx="1.5"/><path d="M6 5h4M6 8h4M7 11h2"/></svg></div>
                  <div><div className="tool-name">audit_swiftui</div><div className="tool-desc">Audit SwiftUI source against Apple's HIG&mdash;Dynamic Type, semantic colors, 44pt targets, AccentColor</div></div>
                </div>
              </div>
              <div className="tool-chips">
                <span className="tool-chip" title="Score any HTML page against Raven's design quality standards — typography, accessibility, responsive, tokens">audit_page</span>
                <span className="tool-chip" title="Evaluate a rendered page's visual rhythm, alignment, and optical balance">audit_layout</span>
                <span className="tool-chip" title="Flag content visible on desktop but hidden on mobile across breakpoints—catches responsive-hiding bugs that only surface on real devices">audit_responsive_visibility</span>
                <span className="tool-chip" title="WCAG 2.5.5 / 44px tap-target audit—a per-element fix table with the exact CSS to reach the minimum, worst-first">audit_tap_targets</span>
                <span className="tool-chip" title="Typographic-scale report—detects the modular ratio, off-scale sizes, line-height drift, and bloated weight ladders">audit_typography</span>
                <span className="tool-chip" title="Per-item UX-writing verdicts—metrics need a number, CTAs stay action-led, prose drops passive voice and jargon, with rewrites">audit_content</span>
                <span className="tool-chip" title="Detect content sliced off inside a correctly-sized export—luminance variance flags a Figma export that ended mid-form">audit_asset_integrity</span>
                <span className="tool-chip" title="Catch content cropped inside a device mockup—aspect-ratio cover loss, baked-in pan/zoom drift, and edges sliced at the frame">audit_device_frame</span>
                <span className="tool-chip" title="Audit multiple routes for cross-page consistency—content-container width and hero heading tier against the inferred canonical">audit_consistency</span>
                <span className="tool-chip" title="Render in headless Chromium and check every <video> actually advances—classifies each clip playing, paused, stalled, empty, or error">audit_video_playback</span>
                <span className="tool-chip" title="Given failing WCAG pairs, return the minimal color change that clears the target ratio—the smallest foreground shift, with a background alternative">suggest_contrast_fix</span>
                <span className="tool-chip" title="Score a rendered iOS or Android screen from an accessibility snapshot—44/48pt targets, contrast, visual rhythm">audit_screen</span>
                <span className="tool-chip" title="Score a captured iOS screen snapshot—44pt targets, contrast, visual rhythm—with device-capable capture orchestration">audit_ios_screen</span>
                <span className="tool-chip" title="Score an iOS accessibility snapshot—missing labels/traits, sub-44pt targets, per-text contrast, Dynamic-Type clipping, VoiceOver order">audit_ios_a11y</span>
                <span className="tool-chip" title="Audit Info.plist or Expo app.json—usage-string honesty, ATS, bundled secrets, undisclosed data-egress">audit_ios_privacy</span>
                <span className="tool-chip" title="Audit React Native / Expo source—touchable a11y, 44/48pt targets, font scaling, safe areas, dark mode">audit_rn</span>
                <span className="tool-chip" title="Compare iOS and Android snapshots against named spatial relationships—catches cross-platform layout drift past device-verified claims">audit_parity</span>
                <span className="tool-chip" title="Verify a wire contract is identical across iOS, proxy, and Android—flags missing tokens, schemaVersion drift, and prefix-ordering bugs">audit_contract</span>
                <span className="tool-chip" title="Run adversarial queries against a live endpoint—flags responses that pass shape but are confidently wrong">audit_api_contract</span>
                <span className="tool-chip" title="Score a design description against relevant principles and patterns">evaluate_design</span>
                <span className="tool-chip" title="Score prompts, scripts, and concepts for hook strength, benefit clarity, channel fit, audience fit, and brand fit">score_creative</span>
                <span className="tool-chip" title="Score a page across 7 categories—structure, type, color, spacing, accessibility, responsive, tokens—each rated 0–10, derived deterministically">score_page</span>
              </div>
            </div>
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">04</span>
                <h3 className="tool-act-title">Judge</h3>
                <p className="tool-act-desc">The Taste Engine &mdash; calibrate a person's design judgment once, then hold every build to it, with the rule behind each verdict.</p>
                <span className="tool-act-count">10 tools</span>
              </div>
              <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2l5 2.5v4c0 3-2.2 4.8-5 5.5-2.8-.7-5-2.5-5-5.5v-4z"/><path d="M6 8l1.5 1.5L10.5 6"/></svg></div>
                  <div><div className="tool-name">audit_taste</div><div className="tool-desc">Judge HTML, text, or a URL against a profile&mdash;verdict BLOCK/WARN/PASS, every finding citing a rule_id and its evidence</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 3h8v10l-4-2-4 2z"/><path d="M6 6h4M6 8h3"/></svg></div>
                  <div><div className="tool-name">get_taste_interview</div><div className="tool-desc">A kickoff question set built from the profile's own rules&mdash;asks how each surface should read before the first design decision</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8l2.5 2.5L8 5"/><path d="M8 8l2 2 4-5"/></svg></div>
                  <div><div className="tool-name">label_finding</div><div className="tool-desc">Append a labeled precedent&mdash;accept, revise, or reject; accepted patterns suppress that finding in future audits</div></div>
                </div>
              </div>
              <div className="tool-chips">
                <span className="tool-chip" title="Build a ruleset and precedent corpus from explicit rules or a DESIGN.md doc—stored locally under ~/.raven/taste">create_taste_profile</span>
                <span className="tool-chip" title="Read a profile's rules, scopes, voice, and its surface bindings">get_taste_profile</span>
                <span className="tool-chip" title="Browse every taste profile on this machine">list_taste_profiles</span>
                <span className="tool-chip" title="Bind a profile to a surface—scoped overrides, URL hosts, a voice note, and per-dimension design notes">bind_taste_surface</span>
                <span className="tool-chip" title="Log a chosen-vs-rejected decision so recurring choices become interview defaults">record_taste_decision</span>
                <span className="tool-chip" title="Review the decision history behind a profile's evolving taste">list_taste_decisions</span>
                <span className="tool-chip" title="Render a bound surface as a self-contained designed page built from its own taste store">generate_taste_portrait</span>
              </div>
            </div>
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">05</span>
                <h3 className="tool-act-title">Meta</h3>
                <p className="tool-act-desc">Local usage reflection and release registration.</p>
                <span className="tool-act-count">2 tools</span>
              </div>
              <div className="tool-chips">
                <span className="tool-chip" title="Summarize your local Raven usage log—tool counts, recurring warnings, gaps">raven_reflect</span>
                <span className="tool-chip" title="Register an email for Raven updates and a direct feedback line to the creator">raven_register</span>
              </div>
            </div>
          </div>
        </section>
  );
}
