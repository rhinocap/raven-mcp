import type { Metadata } from 'next';
import DocsScripts from '@/components/DocsScripts'
import './docs.css'
import { TOOL_COUNT, LAYER_COUNT } from '@/lib/counts'

export const metadata: Metadata = {
  title: 'Docs — RavenMCP',
  description: `Install RavenMCP and use its ${TOOL_COUNT} design-intelligence tools with Claude. Full setup for Claude Code, Claude Desktop, and any MCP client.`,
  alternates: { canonical: '/docs' },
};

export default function DocsPage() {
  return (
    <div id="raven-docs-v3">

      <nav className="rd-nav" aria-label="Documentation sections">
        <div className="rd-nav-inner">
          <p className="rd-kicker">Field index / 06</p>
          <ol>
            <li><a href="#quickstart" aria-current="true"><span className="rd-nav-num">01</span><span className="rd-nav-label">Get Started</span></a></li>
            <li><a href="#tools"><span className="rd-nav-num">02</span><span className="rd-nav-label">Tool Reference</span></a></li>
            <li><a href="#examples"><span className="rd-nav-num">03</span><span className="rd-nav-label">Examples</span></a></li>
            <li><a href="#data"><span className="rd-nav-num">04</span><span className="rd-nav-label">Data Structure</span></a></li>
            <li><a href="#tokens"><span className="rd-nav-num">05</span><span className="rd-nav-label">Design Tokens</span></a></li>
            <li><a href="#faq"><span className="rd-nav-num">06</span><span className="rd-nav-label">FAQ</span></a></li>
          </ol>
          <div className="rd-nav-meta"><strong>{TOOL_COUNT} tools · {LAYER_COUNT} layers</strong>Human-readable / agent-addressable<br />Direct file · no runtime required</div>
        </div>
      </nav>

      <nav className="rd-mobile-nav" aria-label="Documentation sections on mobile">
        <ol>
          <li><a href="#quickstart" aria-current="true">01 Start</a></li><li><a href="#tools">02 Tools</a></li><li><a href="#examples">03 Examples</a></li><li><a href="#data">04 Data</a></li><li><a href="#tokens">05 Tokens</a></li><li><a href="#faq">06 FAQ</a></li>
        </ol>
      </nav>

      <aside className="rd-agent-rail" aria-label="Agent reading rail">
        <div>
          <p className="rd-agent-label">Machine register</p>
          <h2 className="rd-agent-title">Give the agent the same page.</h2>
          <p className="rd-agent-copy">Section anchors, compact schemas, and copyable packets keep the documentation useful inside a coding session.</p>
        </div>
        <dl className="rd-agent-packet">
          <div><dt>section</dt><dd id="rd-packet-section">quickstart</dd></div>
          <div><dt>intent</dt><dd id="rd-packet-intent">install_connect_use</dd></div>
          <div><dt>format</dt><dd>html &middot; anchored sections</dd></div>
          <div><dt>tools</dt><dd>{TOOL_COUNT} / {LAYER_COUNT} layers</dd></div>
        </dl>
        <p className="rd-agent-command">Agent route<br /><code id="rd-agent-route">/docs#quickstart</code></p>
      </aside>

      <main className="rd-main">
        {/* ── 01 · Get Started ── */}
        <section className="rd-section" id="quickstart" data-title="Get Started" data-intent="install_connect_use">
          <div className="rd-section-inner">
            <p className="rd-overline" data-index="01">Orientation</p>
            <h1>Design judgment,<br />available at the prompt.</h1>
            <p className="rd-lede">Install Raven, then let Claude call design audits, token lookups, UI patterns, and taste checks while it builds. Add it in under 2 minutes — pick the path that matches how you use Claude.</p>

            <div className="rd-quickstart" style={{ marginTop: 'var(--space-16)' }}>
              <article className="rd-step"><span className="rd-step-num">01</span><h3>Install</h3><p><code>claude mcp add raven -- npx -y raven-mcp</code> (or add to your MCP client config manually)</p></article>
              <article className="rd-step"><span className="rd-step-num">02</span><h3>Connect</h3><p>restart your agent — Raven&rsquo;s {TOOL_COUNT} tools are now available</p></article>
              <article className="rd-step"><span className="rd-step-num">03</span><h3>Use it</h3><p>ask your agent to audit a page, generate a design system, or check contrast; it calls the right tool automatically.</p></article>
            </div>

            <div className="rd-body">
              <h3>Claude Code — one command</h3>
              <p>If you&rsquo;re in the terminal, this is the fastest path:</p>
              <div className="rd-code-shell"><div className="rd-code-top"><span>terminal</span><button className="rd-copy" type="button" data-copy>Copy</button></div><pre><code>claude mcp add raven -- npx -y raven-mcp</code></pre></div>

              <p>Ask Claude to build or check UI; Raven gives it callable tools:</p>
              <div className="rd-code-shell"><div className="rd-code-top"><span>example prompts</span><button className="rd-copy" type="button" data-copy>Copy</button></div><pre><code>{`"Build me a pricing page with 3 tiers"
"Check this signup form for accessibility issues"
"Use Stripe's design tokens for the checkout flow"`}</code></pre></div>

              <div className="rd-callout">
                <strong>No configuration needed.</strong> Once added, Claude can call Raven for pattern guidance, token lookup, accessibility checks, typography checks, and taste verdicts.
              </div>

              <h3>Team config (.mcp.json)</h3>
              <p>Add a <code>.mcp.json</code> to your project root so everyone on the team gets Raven automatically:</p>
              <div className="rd-code-shell"><div className="rd-code-top"><span>.mcp.json</span><button className="rd-copy" type="button" data-copy>Copy</button></div><pre><code>{'{'}
  <span className="rd-code-key">"mcpServers"</span>: {'{'}
    <span className="rd-code-key">"raven"</span>: {'{'}
      <span className="rd-code-key">"command"</span>: <span className="rd-code-string">"npx"</span>,
      <span className="rd-code-key">"args"</span>: [<span className="rd-code-string">"-y"</span>, <span className="rd-code-string">"raven-mcp"</span>]
    {'}'}
  {'}'}
{'}'}</code></pre></div>

              <h3>Claude Desktop — manual config</h3>
              <p>Add this to your config file (<strong>macOS:</strong> <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> &middot; <strong>Windows:</strong> <code>%APPDATA%\Claude\claude_desktop_config.json</code>):</p>
              <div className="rd-code-shell"><div className="rd-code-top"><span>claude_desktop_config.json</span><button className="rd-copy" type="button" data-copy>Copy</button></div><pre><code>{'{'}
  <span className="rd-code-key">"mcpServers"</span>: {'{'}
    <span className="rd-code-key">"raven"</span>: {'{'}
      <span className="rd-code-key">"command"</span>: <span className="rd-code-string">"npx"</span>,
      <span className="rd-code-key">"args"</span>: [<span className="rd-code-string">"-y"</span>, <span className="rd-code-string">"raven-mcp"</span>]
    {'}'}
  {'}'}
{'}'}</code></pre></div>
              <p className="rd-note-line">Requires Node.js 18 or later.</p>

              <h3>Claude Desktop — one-click extension</h3>
              <p>Prefer not to edit JSON? Download the extension and double-click it. Claude Desktop installs Raven automatically — no Node, no terminal.</p>

              <div className="rd-install-card">
                <div>
                  <h4>Raven for Claude Desktop</h4>
                  <p>macOS &middot; Windows &middot; Linux &nbsp;•&nbsp; ~4.7 MB &middot; v1.12.1</p>
                </div>
                <a href="/raven.mcpb" className="rd-install-btn" download>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Download .mcpb
                </a>
              </div>

              <ol>
                <li>Download the <code>.mcpb</code> file above.</li>
                <li>Double-click it (or drag into Claude Desktop&rsquo;s Settings → Extensions).</li>
                <li>Click <strong>Install</strong> in the dialog and restart Claude Desktop.</li>
              </ol>

              <h3>Install from source</h3>
              <div className="rd-code-shell"><div className="rd-code-top"><span>terminal</span><button className="rd-copy" type="button" data-copy>Copy</button></div><pre><code>{`git clone https://github.com/rhinocap/raven-mcp.git
cd raven-mcp && npm install && npm run build`}</code></pre></div>
            </div>
          </div>
        </section>

        {/* ── 02 · Tool Reference ── */}
        <section className="rd-section" id="tools" data-title="Tool Reference" data-intent="inspect_tool_contracts">
          <div className="rd-section-inner">
            <div className="rd-section-head"><div><p className="rd-overline" data-index="02">Reference</p><h2>Tool Reference</h2><p className="rd-section-intro">Raven provides {TOOL_COUNT} tools across {LAYER_COUNT} knowledge layers. Claude calls the relevant tool based on the task; the cards below show what each tool returns.</p></div><span className="rd-section-route">route / tools</span></div>

            <div className="rd-layer-head"><h3>Principles Layer</h3><span className="rd-layer-count">4 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-get_principles">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_principles" aria-label="Link to get_principles">#</a><code>get_principles</code></h3>
                <p className="rd-tool-desc">Get design principles relevant to a UI context. Returns usability heuristics, laws of UX, Gestalt principles, accessibility requirements, typography rules, and color theory — matched to what you’re designing.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>context</code><span className="rd-required">required</span></dt><dd>What you’re designing (e.g. ’signup form’, ’pricing page’, ’mobile nav’, ’dark dashboard’)</dd></div>
                  <div className="rd-param"><dt><code>category</code><span className="rd-optional">optional</span></dt><dd>Filter to category: nielsen-heuristics, laws-of-ux, gestalt, accessibility, typography, color-theory, mobile-ux, d4d, color-systems, spacing-systems</dd></div>
                  <div className="rd-param"><dt><code>platform</code><span className="rd-optional">optional</span></dt><dd>Platform context. ’ios’ returns Apple HIG principles (Dynamic Type, 44pt targets, SF Symbols, safe areas, dark-mode, haptics, App Review privacy); ’react-native’ returns RN principles (44/48pt+hitSlop, accessibilityLabel/Role, font scaling, SafeAreaView, dark mode, iOS+Android parity, secrets). Both replace the web/CSS-oriented set. Default: web.</dd></div>
                  <div className="rd-param"><dt><code>format</code><span className="rd-optional">optional</span></dt><dd>Output format: full (all details), checklist (implications + violations), brief (just summary). Default: full</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-evaluate_design">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-evaluate_design" aria-label="Link to evaluate_design">#</a><code>evaluate_design</code></h3>
                <p className="rd-tool-desc">Evaluate a design description against UX principles. Returns relevant principles, potential violations, and improvement suggestions.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>description</code><span className="rd-optional">optional</span></dt><dd>Description of the design to evaluate</dd></div>
                  <div className="rd-param"><dt><code>before_screenshot</code><span className="rd-optional">optional</span></dt><dd>Base64 PNG of the BEFORE state</dd></div>
                  <div className="rd-param"><dt><code>after_screenshot</code><span className="rd-optional">optional</span></dt><dd>Base64 PNG of the AFTER state. When both before+after are provided, returns a structured pixel diff with fix_confirmed.</dd></div>
                  <div className="rd-param"><dt><code>goals</code><span className="rd-optional">optional</span></dt><dd>What to evaluate for (e.g. [’conversion’, ’accessibility’, ’mobile-usability’])</dd></div>
                  <div className="rd-param"><dt><code>context</code><span className="rd-optional">optional</span></dt><dd>What the design is (e.g. ’pricing page for SaaS product’)</dd></div>
                  <div className="rd-param"><dt><code>compact</code><span className="rd-optional">optional</span></dt><dd>Return only ids+names for matched principles/patterns (drop their full bodies) plus counts and any before/after diff. Default false. Use when the full principle library payload would blow the tool-result budget.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_checklist">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_checklist" aria-label="Link to get_checklist">#</a><code>get_checklist</code></h3>
                <p className="rd-tool-desc">Get a pre-publish checklist for a specific UI type. Returns actionable yes/no items to verify before shipping.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>type</code><span className="rd-required">required</span></dt><dd>What you’re shipping (e.g. ’signup form’, ’pricing page’, ’dashboard’, ’landing page’, ’modal’)</dd></div>
                  <div className="rd-param"><dt><code>platform</code><span className="rd-optional">optional</span></dt><dd>Platform context for platform-specific checks. ’ios’ = native SwiftUI/iOS (Apple HIG); ’react-native’ = RN/Expo (iOS HIG + Android Material: 44/48pt+hitSlop, accessibilityLabel/Role, font scaling, SafeAreaView, dark mode, platform parity, secrets). Both replace the web/mobile-web checks. — “desktop” | “mobile” | “responsive” | “ios” | “react-native”</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_d4d_framework">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_d4d_framework" aria-label="Link to get_d4d_framework">#</a><code>get_d4d_framework</code></h3>
                <p className="rd-tool-desc">Get the Design for Delight (D4D) framework templates. Returns customer problem statement, ideal state, hypothesis, LOFA, and experiment templates for structured product thinking.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>stage</code><span className="rd-optional">optional</span></dt><dd>Which stage of the D4D loop to return. Default: full (all stages) — “frame” | “empathy” | “broad” | “narrow” | “experiment” | “recommendation” | “full”</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Patterns Layer</h3><span className="rd-layer-count">1 tool</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-get_pattern">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_pattern" aria-label="Link to get_pattern">#</a><code>get_pattern</code></h3>
                <p className="rd-tool-desc">Get proven UI/UX patterns for a specific design type. Returns do’s, don’ts, evidence, and checklists for signup flows, pricing pages, navigation, forms, landing pages, dashboards, modals, empty states, error states, loading states, CTAs, social proof, and mobile conversion.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>type</code><span className="rd-required">required</span></dt><dd>Pattern type (e.g. ’signup-flow’, ’pricing-page’, ’navigation’, ’forms’, ’landing-page’, ’dashboard’, ’modals-dialogs’, ’empty-states’, ’error-states’, ’loading-states’, ’cta’, ’social-proof’, ’mobile-conversion’)</dd></div>
                  <div className="rd-param"><dt><code>platform</code><span className="rd-optional">optional</span></dt><dd>Filter patterns by platform context — “desktop” | “mobile” | “responsive”</dd></div>
                  <div className="rd-param"><dt><code>goal</code><span className="rd-optional">optional</span></dt><dd>Filter by primary goal — “conversion” | “usability” | “accessibility” | “delight”</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Business Layer</h3><span className="rd-layer-count">1 tool</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-get_business_strategy">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_business_strategy" aria-label="Link to get_business_strategy">#</a><code>get_business_strategy</code></h3>
                <p className="rd-tool-desc">Get business and monetization strategies for digital products. Covers monetization models, retention strategies, onboarding optimization, growth mechanics, and product metrics frameworks.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>type</code><span className="rd-required">required</span></dt><dd>Strategy type: monetization, retention, onboarding, growth, metrics</dd></div>
                  <div className="rd-param"><dt><code>stage</code><span className="rd-optional">optional</span></dt><dd>Company stage for contextual filtering — “startup” | “growth” | “mature”</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Tokens Layer</h3><span className="rd-layer-count">4 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-list_design_systems">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-list_design_systems" aria-label="Link to list_design_systems">#</a><code>list_design_systems</code></h3>
                <p className="rd-tool-desc">Browse available design systems for tokens. Filter by category (fintech, productivity, developer, component-library, design-system) or search by name.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>category</code><span className="rd-optional">optional</span></dt><dd>Filter by category: fintech, productivity, developer, component-library, design-system</dd></div>
                  <div className="rd-param"><dt><code>search</code><span className="rd-optional">optional</span></dt><dd>Search by name or description</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_design_system">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_design_system" aria-label="Link to get_design_system">#</a><code>get_design_system</code></h3>
                <p className="rd-tool-desc">Get design tokens for a specific design system. Returns colors, typography, spacing, radii, elevation, and motion tokens in W3C DTCG, CSS custom properties, or flat format.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>id</code><span className="rd-required">required</span></dt><dd>Design system ID (e.g. ’stripe’, ’linear’)</dd></div>
                  <div className="rd-param"><dt><code>group</code><span className="rd-optional">optional</span></dt><dd>Filter to a token group: color, color-dark, color-light, typography, spacing, radius, elevation, motion</dd></div>
                  <div className="rd-param"><dt><code>format</code><span className="rd-optional">optional</span></dt><dd>Output format: dtcg (W3C standard), css (custom properties), flat (key-value). Default: dtcg</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-generate_design_system">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-generate_design_system" aria-label="Link to generate_design_system">#</a><code>generate_design_system</code></h3>
                <p className="rd-tool-desc">Generate a complete, custom design system with full token set. Provide a brand color to auto-generate a harmonious palette, pick a style preset, and export as visual HTML documentation, CSS variables, W3C DTCG JSON, Figma Variables, or SVG palette card. The HTML export is a beautiful, self-contained page suitable for sharing with stakeholders.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>name</code><span className="rd-required">required</span></dt><dd>Name for the design system (e.g. ’Acme Corp’, ’NightOwl’)</dd></div>
                  <div className="rd-param"><dt><code>base_system</code><span className="rd-optional">optional</span></dt><dd>Start from an existing system as foundation (e.g. ’stripe’, ’linear’). Colors will be replaced by brand_color if provided.</dd></div>
                  <div className="rd-param"><dt><code>brand_color</code><span className="rd-optional">optional</span></dt><dd>Primary brand hex color (e.g. ’#FF6B35’). Auto-generates a full harmonious palette using color theory.</dd></div>
                  <div className="rd-param"><dt><code>style</code><span className="rd-optional">optional</span></dt><dd>Aesthetic direction — influences spacing, radii, shadows, motion, and typography. Default: minimal — “minimal” | “bold” | “warm” | “corporate” | “playful” | “dark”</dd></div>
                  <div className="rd-param"><dt><code>dark_mode</code><span className="rd-optional">optional</span></dt><dd>Generate dark mode tokens alongside light. Default: true</dd></div>
                  <div className="rd-param"><dt><code>format</code><span className="rd-optional">optional</span></dt><dd>Export format: html (visual doc page), css (custom properties), dtcg (W3C JSON), figma (Figma Variables JSON), svg (color palette card), all. Default: html</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-compose_system">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-compose_system" aria-label="Link to compose_system">#</a><code>compose_system</code></h3>
                <p className="rd-tool-desc">Mix tokens from different design systems to create a custom composite. Example: Linear’s colors + Stripe’s typography.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>compositions</code><span className="rd-required">required</span></dt><dd>Array of system-group pairs to compose</dd></div>
                  <div className="rd-param"><dt><code>format</code><span className="rd-optional">optional</span></dt><dd>Output format. Default: dtcg — “dtcg” | “css”</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Content Design Layer <span className="rd-layer-ver">v1.2</span></h3><span className="rd-layer-count">5 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-list_content_systems">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-list_content_systems" aria-label="Link to list_content_systems">#</a><code>list_content_systems</code></h3>
                <p className="rd-tool-desc">Browse available content design systems — brand voice and tone guides from real companies (Mailchimp, GOV.UK, Shopify Polaris, Atlassian). Filter by category or search by name.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>category</code><span className="rd-optional">optional</span></dt><dd>Filter by category: marketing-saas, government, commerce-saas, productivity-saas, fintech</dd></div>
                  <div className="rd-param"><dt><code>search</code><span className="rd-optional">optional</span></dt><dd>Search by name, description, or tag</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_content_system">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_content_system" aria-label="Link to get_content_system">#</a><code>get_content_system</code></h3>
                <p className="rd-tool-desc">Get a brand’s content design system — voice attributes, tone shifts by context, vocabulary (use/avoid/never), grammar rules, content patterns for errors/empty-states/buttons/etc., and inclusive language guidance.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>id</code><span className="rd-required">required</span></dt><dd>Content system ID (e.g. ’mailchimp’, ’gov-uk’, ’shopify-polaris’, ’atlassian’)</dd></div>
                  <div className="rd-param"><dt><code>section</code><span className="rd-optional">optional</span></dt><dd>Return just one section. Default: all. — “all” | “voice” | “tone_shifts” | “vocabulary” | “grammar” | “content-patterns” | “inclusive-language”</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_content_principles">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_content_principles" aria-label="Link to get_content_principles">#</a><code>get_content_principles</code></h3>
                <p className="rd-tool-desc">Get UX-writing principles — clarity over cleverness, active voice, error-message anatomy, inclusive language, voice vs tone, and more. Filter by the writing context (e.g. ’error messages’, ’notifications’, ’form labels’).</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>context</code><span className="rd-optional">optional</span></dt><dd>What you’re writing for (e.g. ’error messages’, ’onboarding copy’, ’empty state’, ’notification’). Omit to get all UX-writing principles.</dd></div>
                  <div className="rd-param"><dt><code>format</code><span className="rd-optional">optional</span></dt><dd>Output format: full (all details), checklist (implications + violations), brief (just summary). Default: full</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_content_pattern">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_content_pattern" aria-label="Link to get_content_pattern">#</a><code>get_content_pattern</code></h3>
                <p className="rd-tool-desc">Get content design patterns — copy recipes for error messages, empty-state copy, notifications, and form validation. Returns do’s, don’ts, good/bad examples, evidence, and a checklist.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>type</code><span className="rd-required">required</span></dt><dd>Content pattern type — “error-messages” | “empty-state-copy” | “notifications” | “form-validation”</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_content">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_content" aria-label="Link to audit_content">#</a><code>audit_content</code></h3>
                <p className="rd-tool-desc">Evaluate an array of content items (headings, prose, CTAs, labels, captions, metrics, outcomes) against UX-writing principles and deterministic heuristics. Returns a per-item verdict (pass/warn/fail) with matched principle ids, concrete issues grounded in principle text, a before→after rewrite suggestion, and an aggregate summary. Heuristics: metric items must carry a number+unit; cta/label must be action-led and ≤4 words; prose flags passive voice, jargon, and hedging; headings flag filler openers and buzzwords; captions flag duplication of any heading in the batch. Pure offline — no network or browser. Use this instead of evaluate_design when you need per-item content verdicts rather than the principle library.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>items</code><span className="rd-required">required</span></dt><dd>Array of content items to audit.</dd></div>
                  <div className="rd-param"><dt><code>system</code><span className="rd-optional">optional</span></dt><dd>Optional content-system id (e.g. ’ux-writing’); recorded for traceability.</dd></div>
                  <div className="rd-param"><dt><code>goals</code><span className="rd-optional">optional</span></dt><dd>Optional content goals (e.g. [’clarity’,’conversion’]); recorded for traceability.</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Research &amp; Data Layer <span className="rd-layer-ver">v1.3</span></h3><span className="rd-layer-count">2 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-get_research_method">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_research_method" aria-label="Link to get_research_method">#</a><code>get_research_method</code></h3>
                <p className="rd-tool-desc">Get research method details — qualitative (interviews, contextual inquiry, diary, field, intercept), quantitative (surveys, analytics, A/B tests, benchmarking, clickstream), or usability (moderated, unmoderated, 5-second, card sort, tree test, heuristic eval). Returns specific protocols, do/don’t guidance, evidence, and a checklist. Use when the user is designing a study or asking how to measure something.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>category</code><span className="rd-optional">optional</span></dt><dd>Which family of methods. Default: all. — “qualitative” | “quantitative” | “usability” | “all”</dd></div>
                  <div className="rd-param"><dt><code>search</code><span className="rd-optional">optional</span></dt><dd>Search within methods by name or description.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_metrics_framework">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_metrics_framework" aria-label="Link to get_metrics_framework">#</a><code>get_metrics_framework</code></h3>
                <p className="rd-tool-desc">Get a product-metrics framework — HEART (Google), AARRR/Pirate (Dave McClure), North Star Metric, Conversion Funnel, RICE Scoring, or OKRs. Returns structure, when-to-use, pitfalls, and examples. Use when the user asks ’how should we measure success?’ or ’what metrics should we track?’</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>id</code><span className="rd-optional">optional</span></dt><dd>Framework id (heart, aarrr, north-star-metric, conversion-funnel, rice-scoring, okrs). Omit to list all.</dd></div>
                  <div className="rd-param"><dt><code>search</code><span className="rd-optional">optional</span></dt><dd>Search for a framework by name or summary.</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Service Design Layer <span className="rd-layer-ver">v1.3</span></h3><span className="rd-layer-count">3 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-get_service_pattern">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_service_pattern" aria-label="Link to get_service_pattern">#</a><code>get_service_pattern</code></h3>
                <p className="rd-tool-desc">Get a service design pattern — service blueprinting, human handoff, signup-as-service, omnichannel continuity, or moments of truth / recovery. Returns patterns, do/don’t guidance, evidence, and a checklist. Use when the user is designing a service flow, escalation, cross-channel experience, or moment of truth.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>type</code><span className="rd-required">required</span></dt><dd>Service design pattern type — “service-blueprinting” | “human-handoff” | “signup-as-service” | “omnichannel-continuity” | “moments-of-truth”</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_service_standard">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_service_standard" aria-label="Link to get_service_standard">#</a><code>get_service_standard</code></h3>
                <p className="rd-tool-desc">Get the GOV.UK Service Standard — 14 points the UK government uses to assess whether a public service is ready to launch. Widely applicable as a rigorous service-quality checklist beyond government. Use when the user asks how to evaluate a whole service.</p>
                <p className="rd-param-heading rd-param-none">No parameters</p>
              </article>
              <article className="rd-tool" id="tool-generate_service_blueprint">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-generate_service_blueprint" aria-label="Link to generate_service_blueprint">#</a><code>generate_service_blueprint</code></h3>
                <p className="rd-tool-desc">Render a service blueprint as a self-contained HTML page. Supports two modes: (1) classic Shostack single-actor blueprint — user action, frontstage, backstage, support, evidence, pain/delight; (2) two-actor HI-loop blueprint — when `actors` is supplied, renders two swim lanes with a line of interaction between them (e.g. customer ↔ lawyer, patient ↔ doctor, buyer ↔ agent). Each actor gets their own actions, frontstage (what they see), and evidence. Optionally accepts an ideal-state to render side-by-side with the current state.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>service_name</code><span className="rd-required">required</span></dt><dd>Name of the service (e.g. ’Free trial signup’, ’Client intake’, ’Restaurant reservation’)</dd></div>
                  <div className="rd-param"><dt><code>subtitle</code><span className="rd-optional">optional</span></dt><dd>Short description or context line under the title</dd></div>
                  <div className="rd-param"><dt><code>actors</code><span className="rd-optional">optional</span></dt><dd>Omit for classic single-actor Shostack blueprint. Provide to render a two-swim-lane HI-loop blueprint with a line of interaction between the two sides.</dd></div>
                  <div className="rd-param"><dt><code>current</code><span className="rd-required">required</span></dt><dd>The current-state blueprint as an array of steps</dd></div>
                  <div className="rd-param"><dt><code>ideal</code><span className="rd-optional">optional</span></dt><dd>Optional ideal-state blueprint — if provided, output shows current AND ideal side-by-side</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Brand &amp; Visual Layer <span className="rd-layer-ver">v1.3</span></h3><span className="rd-layer-count">3 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-get_brand_system">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_brand_system" aria-label="Link to get_brand_system">#</a><code>get_brand_system</code></h3>
                <p className="rd-tool-desc">Get a complete design system for building an app with branding like a specific company. Say ’Make me an app with branding like Spotify’ and get the full token set, style guide, and implementation instructions. Matches against 12 known design systems and provides closest match with ready-to-use CSS.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>company</code><span className="rd-required">required</span></dt><dd>The company whose branding to use (e.g. ’Spotify’, ’Stripe’, ’Apple’, ’Linear’, ’Airbnb’)</dd></div>
                  <div className="rd-param"><dt><code>format</code><span className="rd-optional">optional</span></dt><dd>Output format: ’css’ for CSS variables, ’dtcg’ for W3C tokens, ’guide’ for full implementation guide. Default: guide</dd></div>
                  <div className="rd-param"><dt><code>mode</code><span className="rd-optional">optional</span></dt><dd>Color mode preference. Default: based on the system’s primary mode — “light” | “dark”</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_brand_principles">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_brand_principles" aria-label="Link to get_brand_principles">#</a><code>get_brand_principles</code></h3>
                <p className="rd-tool-desc">Get brand and visual-design principles — logo usage (clear space, min sizes, variants, placement, restraint), gradient usage (hierarchy, palette, contrast, trend vs signature), imagery (consistency, representation, purpose), visual hierarchy, and brand-as-system thinking. Use when the user asks about branding, logos, gradients, imagery, visual consistency, or how to treat a brand across surfaces.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>topic</code><span className="rd-optional">optional</span></dt><dd>Filter by topic: ’logo’, ’gradient’, ’imagery’, ’hierarchy’, ’system’, or a freeform search term. Omit to return all brand principles.</dd></div>
                  <div className="rd-param"><dt><code>format</code><span className="rd-optional">optional</span></dt><dd>Output format. Default: full. — “full” | “checklist” | “brief”</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_brand_trends">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_brand_trends" aria-label="Link to get_brand_trends">#</a><code>get_brand_trends</code></h3>
                <p className="rd-tool-desc">Get current brand and visual-design trends — what’s working in 2026 and where each trend fits or fails. Includes bento grids, monospace type, neon-on-dark-glass, generative patterns, brutalism rebound, AI-generated imagery, lowercase/mixed case. Each trend is time-stamped — treat as a calibration signal, not a prescription.</p>
                <p className="rd-param-heading rd-param-none">No parameters</p>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Mobile &amp; Native Audit Layer <span className="rd-layer-ver">v1.5</span></h3><span className="rd-layer-count">9 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-audit_swiftui">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_swiftui" aria-label="Link to audit_swiftui">#</a><code>audit_swiftui</code></h3>
                <p className="rd-tool-desc">Audit SwiftUI source against Apple’s Human Interface Guidelines. Flags hardcoded .font(.system(size:)) below ~13pt and tiny semantic fonts (.caption/.caption2), hardcoded Color(red:green:blue:)/hex instead of asset-catalog or semantic system colors, an empty/undefined AccentColor, interactive frames below 44×44pt, and ad-hoc spacing off the 4/8-pt grid. Rewards semantic Dynamic Type fonts, semantic system colors, SF Symbols, and flexible frames. iOS-native checks only — no web/CSS rules. Returns pass/fail per check with fix instructions.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>source</code><span className="rd-required">required</span></dt><dd>SwiftUI source — a single file/view as a string, or an array of file contents. Concatenated before analysis.</dd></div>
                  <div className="rd-param"><dt><code>accent_color_contents</code><span className="rd-optional">optional</span></dt><dd>Optional raw Contents.json of AccentColor.colorset. When provided, the tool verifies AccentColor actually defines color components (flags an empty/undefined accent color as an error).</dd></div>
                  <div className="rd-param"><dt><code>strict</code><span className="rd-optional">optional</span></dt><dd>Strict mode — also count warnings as failures for grading. Default: false</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Project identifier — resolves a saved taste surface binding (see bind_taste_surface). When the binding carries design_notes, each note is verified against the source (animation/material/haptic/font APIs) and returned in note_assessments; missing notes count toward the grade.</dd></div>
                  <div className="rd-param"><dt><code>profile</code><span className="rd-optional">optional</span></dt><dd>Taste profile owning the binding. Omit to search all stored profiles for one bound to the project.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_rn">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_rn" aria-label="Link to audit_rn">#</a><code>audit_rn</code></h3>
                <p className="rd-tool-desc">Audit React Native / Expo source (JSX/TSX + StyleSheet) against the iOS HIG + Android Material conventions RN must satisfy. Flags touchables missing accessibilityLabel/accessibilityRole, touchables below 44pt without hitSlop, allowFontScaling=&#123;false&#125;, fontSize below ~13, screens without SafeAreaView, and (for multi-mode apps) hardcoded colors with no useColorScheme/Appearance dark-mode handling. Rewards SafeAreaView, hitSlop, Platform-aware code, and a theme. RN-native checks only — no web/CSS or SwiftUI rules. Same return shape as audit_page. (RN renders to native widgets, so audit_ios_screen scores the rendered screen.)</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>source</code><span className="rd-required">required</span></dt><dd>React Native source — a single screen/component as a string, or an array of file contents. Concatenated before analysis.</dd></div>
                  <div className="rd-param"><dt><code>color_scheme</code><span className="rd-optional">optional</span></dt><dd>The app’s declared appearance (Expo app.json userInterfaceStyle). ’light’ or ’dark’ means single-mode by design — the dark-mode adaptation check is then suppressed. Default: automatic.</dd></div>
                  <div className="rd-param"><dt><code>strict</code><span className="rd-optional">optional</span></dt><dd>Strict mode — also count warnings as failures for grading. Default: false</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Project identifier — resolves a saved taste surface binding (see bind_taste_surface). When the binding carries design_notes, each note is verified against the source (Animated/Reanimated, BlurView, haptics, fonts) and returned in note_assessments; missing notes count toward the grade.</dd></div>
                  <div className="rd-param"><dt><code>profile</code><span className="rd-optional">optional</span></dt><dd>Taste profile owning the binding. Omit to search all stored profiles for one bound to the project.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_ios_screen">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_ios_screen" aria-label="Link to audit_ios_screen">#</a><code>audit_ios_screen</code></h3>
                <p className="rd-tool-desc">Audit a rendered iOS screen from a view-hierarchy/accessibility snapshot (and optional screenshot). Alias of audit_screen with platform:"ios". Call with no arguments for the expected snapshot shape. Call with &#123;elements:[&#123;label,rect:&#123;x,y,w,h&#125;,role,fontPt,fgColor,bgColor&#125;],viewport:&#123;w,h&#125;&#125; to score 44×44pt touch targets, contrast (with iOS secondaryLabel/tertiaryLabel treated as platform-standard — warn not fail), and visual rhythm (alignment, gap consistency, optical balance) in points. Same return shape as audit_page.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Project identifier — resolves a saved taste surface binding (see bind_taste_surface). When the binding carries design_notes and a screenshot is passed, the screenshot’s pixels verify the color-scheme notes; results gain note_assessments.</dd></div>
                  <div className="rd-param"><dt><code>profile</code><span className="rd-optional">optional</span></dt><dd>Taste profile owning the binding. Omit to search all stored profiles for one bound to the project.</dd></div>
                  <div className="rd-param"><dt><code>elements</code><span className="rd-optional">optional</span></dt><dd>Elements captured from the rendered screen via an accessibility/view-hierarchy snapshot</dd></div>
                  <div className="rd-param"><dt><code>viewport</code><span className="rd-optional">optional</span></dt><dd>Screen size in pt (iOS) or dp (Android) at capture time, e.g. &#123;w:393,h:852&#125; iPhone 15, &#123;w:412,h:915&#125; Pixel</dd></div>
                  <div className="rd-param"><dt><code>screenshot</code><span className="rd-optional">optional</span></dt><dd>Optional base64 PNG of the screen, for the caller’s reference. Geometry is scored from the snapshot, not decoded pixels.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_ios_privacy">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_ios_privacy" aria-label="Link to audit_ios_privacy">#</a><code>audit_ios_privacy</code></h3>
                <p className="rd-tool-desc">Audit an iOS or React Native/Expo app’s privacy posture for App Review and user trust. Reads a native Info.plist XML OR an Expo app.json (managed Expo apps have no Info.plist) — plus optional PRIVACY.md, entitlements, and source. Flags: NS*UsageDescription strings that are vague/missing or contradict the code (e.g. a HealthKit write claim the code never fulfills), entitlements/permissions and Android permissions the app doesn’t use, ATS cleartext exceptions and non-HTTPS endpoints, secrets/keys shipped in the bundle or app.json, and default data-egress paths not disclosed at the point of choice (a pre-selected ’Recommended’ option that silently sends personal data to a server). Same return shape as audit_page.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>info_plist</code><span className="rd-optional">optional</span></dt><dd>Raw Info.plist XML (native iOS / bare RN). Provide this OR app_json.</dd></div>
                  <div className="rd-param"><dt><code>app_json</code><span className="rd-optional">optional</span></dt><dd>Expo app.json / app.config JSON (managed RN). Its expo.ios.infoPlist, expo.android.permissions, plugins, and extra are audited.</dd></div>
                  <div className="rd-param"><dt><code>privacy_md</code><span className="rd-optional">optional</span></dt><dd>Optional PRIVACY.md / privacy policy text to cross-reference against declared permissions and default behavior</dd></div>
                  <div className="rd-param"><dt><code>entitlements</code><span className="rd-optional">optional</span></dt><dd>Optional .entitlements XML</dd></div>
                  <div className="rd-param"><dt><code>source</code><span className="rd-optional">optional</span></dt><dd>Optional concatenated source (Swift or JS/TS) — enables code-vs-declaration contradiction checks and default-egress detection</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_ios_a11y">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_ios_a11y" aria-label="Link to audit_ios_a11y">#</a><code>audit_ios_a11y</code></h3>
                <p className="rd-tool-desc">Score an accessibility-enriched iOS element snapshot — missing accessibilityLabel/value/traits, sub-44pt tap targets, per-text WCAG contrast, Dynamic Type clipping, and VoiceOver reading order. Provide &#123;elements:[&#123;label,value,hint,traits,role,rect,fontPt,fgColor,bgColor,dynamicTypeClipped&#125;],viewport&#125;. Capture via the AccessibilitySnapshot XCUITest / ios-capture harness.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>elements</code><span className="rd-required">required</span></dt><dd>array</dd></div>
                  <div className="rd-param"><dt><code>viewport</code><span className="rd-required">required</span></dt><dd>object</dd></div>
                  <div className="rd-param"><dt><code>options</code><span className="rd-optional">optional</span></dt><dd>object</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_screen">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_screen" aria-label="Link to audit_screen">#</a><code>audit_screen</code></h3>
                <p className="rd-tool-desc">Audit a rendered mobile screen (iOS or Android) from a view-hierarchy/accessibility snapshot. Call with no arguments for the expected snapshot shape and how to capture it. Pass platform:"android" to score against the 48dp Material touch minimum and Material muted roles (onSurfaceVariant/outline = warn not fail); default platform:"ios" scores 44pt and treats secondaryLabel/tertiaryLabel as platform-standard. Both score touch targets, contrast, and visual rhythm (alignment, gap consistency, optical balance). Same return shape as audit_page.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>platform</code><span className="rd-optional">optional</span></dt><dd>Target platform — ’ios’ (default, 44pt minimum, iOS semantic colors) or ’android’ (48dp minimum, Material semantic roles)</dd></div>
                  <div className="rd-param"><dt><code>scroll_settle</code><span className="rd-optional">optional</span></dt><dd>boolean</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Project identifier — resolves a saved taste surface binding (see bind_taste_surface). When the binding carries design_notes and a screenshot is passed, the screenshot’s pixels verify the color-scheme notes; results gain note_assessments.</dd></div>
                  <div className="rd-param"><dt><code>profile</code><span className="rd-optional">optional</span></dt><dd>Taste profile owning the binding. Omit to search all stored profiles for one bound to the project.</dd></div>
                  <div className="rd-param"><dt><code>elements</code><span className="rd-optional">optional</span></dt><dd>Elements captured from the rendered screen via an accessibility/view-hierarchy snapshot</dd></div>
                  <div className="rd-param"><dt><code>viewport</code><span className="rd-optional">optional</span></dt><dd>Screen size in pt (iOS) or dp (Android) at capture time, e.g. &#123;w:393,h:852&#125; iPhone 15, &#123;w:412,h:915&#125; Pixel</dd></div>
                  <div className="rd-param"><dt><code>screenshot</code><span className="rd-optional">optional</span></dt><dd>Optional base64 PNG of the screen, for the caller’s reference. Geometry is scored from the snapshot, not decoded pixels.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_device_frame">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_device_frame" aria-label="Link to audit_device_frame">#</a><code>audit_device_frame</code></h3>
                <p className="rd-tool-desc">Detect cropped content in device-mockup frames (phone/MacBook screenshots, app-preview clips). Three checks: (1) GEOMETRY — call with `frames` (container box + intrinsic media size + object-fit/position; call with NO args for a DevTools snippet) to flag object-fit:cover crop loss when the frame’s aspect ratio ≠ the media’s; (2) MOTION — pass `clips` (first/last frame PNG paths) to detect baked-in pan/zoom (Ken Burns) that drifts the composition; (3) EDGE — pass `edge_frames` (PNG paths) to flag content truncated at a frame edge. Catches the exact failure where a 16:9 clip in a 1.82-AR screen cutout silently slices the bottom, or a Ken-Burns-zoomed source crops content.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>frames</code><span className="rd-optional">optional</span></dt><dd>Device-frame geometry samples (from the DevTools snippet): container box + intrinsic media size + computed object-fit/position. Flags object-fit:cover crop loss.</dd></div>
                  <div className="rd-param"><dt><code>clips</code><span className="rd-optional">optional</span></dt><dd>Per-clip first/last frame PNG file paths — detects baked-in pan/zoom (Ken Burns).</dd></div>
                  <div className="rd-param"><dt><code>edge_frames</code><span className="rd-optional">optional</span></dt><dd>Frame PNG file paths to check for content truncated at a frame edge (reuses edge-symmetry).</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_parity">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_parity" aria-label="Link to audit_parity">#</a><code>audit_parity</code></h3>
                <p className="rd-tool-desc">Compare iOS vs Android element snapshots against a checklist of named spatial relationships (vertical centering, baseline/left alignment, equal gap/size, presence, truncation) and flag per-relation match/mismatch/uncertain — catches cross-platform layout drift like status text centered on one platform but top-aligned on the other. Provide ios+android &#123;elements,viewport&#125; snapshots and a checklist[].</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>ios</code><span className="rd-required">required</span></dt><dd>object</dd></div>
                  <div className="rd-param"><dt><code>android</code><span className="rd-required">required</span></dt><dd>object</dd></div>
                  <div className="rd-param"><dt><code>checklist</code><span className="rd-required">required</span></dt><dd>array</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_video_playback">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_video_playback" aria-label="Link to audit_video_playback">#</a><code>audit_video_playback</code></h3>
                <p className="rd-tool-desc">Render a page in headless Chromium and observe whether each &lt;video&gt; actually advances (samples currentTime before/after a play attempt), classifying every clip into playing|paused|stalled|empty|error with a reason. Catches black/non-playing videos that static audits miss — the most common real-world defect on marketing sites with video backgrounds. Pass url to render + observe, or dom_snapshot to classify pre-collected observations without a browser.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>url</code><span className="rd-optional">optional</span></dt><dd>URL to render and observe (http/https or file://). Requires headless chromium.</dd></div>
                  <div className="rd-param"><dt><code>dom_snapshot</code><span className="rd-optional">optional</span></dt><dd>Pre-collected video observations to classify without rendering (deterministic path)</dd></div>
                  <div className="rd-param"><dt><code>observeMs</code><span className="rd-optional">optional</span></dt><dd>Milliseconds to wait between currentTime samples after play() attempt. Default: 1000</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Render &amp; Audit Layer <span className="rd-layer-ver">v1.7–v1.10</span></h3><span className="rd-layer-count">13 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-audit_page">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_page" aria-label="Link to audit_page">#</a><code>audit_page</code></h3>
                <p className="rd-tool-desc">Audit HTML/CSS against Raven’s design quality standards. Checks typography (min 13px, weight 400+, modular-scale heading ratios, line-height consistency), accessibility (WCAG touch targets, alt text, contrast), responsive patterns (flexbox over grid, clamp sizing, max-width containers), style guide compliance (CSS custom properties, no bare hex), and visual rhythm (4/8px spacing grid, tight spacing scale, palette size). Pass containerMaxWidth (your design system’s canonical container token, in px) to make the max-width check token-aware — it then flags containers that diverge from your system (too narrow OR too wide) instead of a generic 1200px heuristic. Returns pass/fail per check with specific fix instructions.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>html</code><span className="rd-optional">optional</span></dt><dd>The full HTML content of the page to audit</dd></div>
                  <div className="rd-param"><dt><code>url</code><span className="rd-optional">optional</span></dt><dd>If set, Raven launches headless chromium, renders the page, and audits the RENDERED DOM.</dd></div>
                  <div className="rd-param"><dt><code>scroll_settle</code><span className="rd-optional">optional</span></dt><dd>Before capturing, scroll to bottom and settle IntersectionObserver/whileInView reveals (300ms), and play preload=none videos. Prevents blank-section false positives.</dd></div>
                  <div className="rd-param"><dt><code>interactions</code><span className="rd-optional">optional</span></dt><dd>Before capturing, fire each interaction in order (hover/click/focus the selector, then wait delay_ms). Captures the resulting dynamic state — e.g. an on-hover theme-toggle wash invisible to a static screenshot.</dd></div>
                  <div className="rd-param"><dt><code>viewport</code><span className="rd-optional">optional</span></dt><dd>object</dd></div>
                  <div className="rd-param"><dt><code>strict</code><span className="rd-optional">optional</span></dt><dd>Strict mode — also flags warnings as failures. Default: false</dd></div>
                  <div className="rd-param"><dt><code>containerMaxWidth</code><span className="rd-optional">optional</span></dt><dd>Your design system’s canonical content-container width in px (e.g. 1152). When set, the responsive/max-width check flags divergence from this token instead of using the generic 1200px heuristic.</dd></div>
                  <div className="rd-param"><dt><code>adversarial_verify</code><span className="rd-optional">optional</span></dt><dd>After generating findings, independently re-check each against the live DOM/network and tag it confirmed / likely-artifact / inconclusive. Surfaces a debunked_count.</dd></div>
                  <div className="rd-param"><dt><code>compact</code><span className="rd-optional">optional</span></dt><dd>Return only the decision-grade signal — score, grade, summary, errors, warnings, fix_priority — and drop the embedded base64 screenshot and the passes list (replaced by passes_count). Default false. Use when the full payload would blow the tool-result budget.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_url">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_url" aria-label="Link to audit_url">#</a><code>audit_url</code></h3>
                <p className="rd-tool-desc">Layer 0 render-and-capture audit: renders a LIVE URL at each viewport×theme, scroll-settles (fires whileInView/IntersectionObserver reveals; plays preload=none videos), fires hover/click/focus interactions, and captures real pixels + the rendered DOM. Then runs the existing audit_page rule engine, per-element WCAG contrast, responsive-visibility (desktop-shown/mobile-hidden), blank-media detection, sliced-image edge symmetry, and hover-state white-wash detection over the captures. Every finding is tagged confirmed | likely-artifact | inconclusive with its evidence, ranked by severity. This is the tool that catches real-world visual nits invisible to HTML-string/geometry audits: cropped images, blank videos, hover white-wash, sliced exports, and hidden-on-mobile content. Requires headless chromium.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>url</code><span className="rd-required">required</span></dt><dd>URL to render and audit (http/https or file://)</dd></div>
                  <div className="rd-param"><dt><code>viewports</code><span className="rd-optional">optional</span></dt><dd>Viewports to render. Default: iphone 393×852, desktop 1440×900, wide 2160×1200</dd></div>
                  <div className="rd-param"><dt><code>themes</code><span className="rd-optional">optional</span></dt><dd>Themes to toggle (prefers-color-scheme + data-theme/class). Default: [’light’,’dark’]</dd></div>
                  <div className="rd-param"><dt><code>scroll_settle</code><span className="rd-optional">optional</span></dt><dd>Scroll to bottom to fire reveal-on-scroll/IntersectionObserver content and play videos before capture. Default: true</dd></div>
                  <div className="rd-param"><dt><code>interactions</code><span className="rd-optional">optional</span></dt><dd>Fire each interaction before capture; the resulting state is diffed against baseline to catch hover/click white-wash and obscured content.</dd></div>
                  <div className="rd-param"><dt><code>containerMaxWidth</code><span className="rd-optional">optional</span></dt><dd>Your design system’s canonical container width in px — makes the max-width check token-aware.</dd></div>
                  <div className="rd-param"><dt><code>includeScreenshots</code><span className="rd-optional">optional</span></dt><dd>Include the base64 full-page PNG per capture in the result. Default: false (screenshots are large).</dd></div>
                  <div className="rd-param"><dt><code>timeoutMs</code><span className="rd-optional">optional</span></dt><dd>Per-navigation timeout in ms. Default: 30000</dd></div>
                  <div className="rd-param"><dt><code>compact</code><span className="rd-optional">optional</span></dt><dd>Drop per-capture base64 screenshots; keep findings, counts, and summary. Default false. Use when screenshots would blow the tool-result budget.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-score_page">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-score_page" aria-label="Link to score_page">#</a><code>score_page</code></h3>
                <p className="rd-tool-desc">Score an HTML/CSS page across 7 design categories (Structure, Typography, Color &amp; palette, Spacing &amp; rhythm, Accessibility, Responsive layout, Design tokens), each rated 0–10. Scores are derived deterministically from the same checks as audit_page — no browser required. Also returns the same overall 0–100 score and A–D grade audit_page produces, the weakest category, and the three categories Raven does not mechanically assess (brand, conversion, motion) with guidance on which tools to use for those.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>html</code><span className="rd-required">required</span></dt><dd>The full HTML content of the page to score.</dd></div>
                  <div className="rd-param"><dt><code>strict</code><span className="rd-optional">optional</span></dt><dd>Strict mode — count warnings as failures in the overall score. Default: false.</dd></div>
                  <div className="rd-param"><dt><code>containerMaxWidth</code><span className="rd-optional">optional</span></dt><dd>Your design system’s canonical content-container width in px (e.g. 1152). Forwarded to the responsive/max-width check.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_layout">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_layout" aria-label="Link to audit_layout">#</a><code>audit_layout</code></h3>
                <p className="rd-tool-desc">Evaluate visual rhythm from a rendered page’s geometry. Call with no arguments to get a DevTools snippet to paste into your page — it prints &#123;elements, viewport&#125; JSON. Call again with that JSON to get alignment, gap-rhythm, and optical-balance scores. This is the complement to audit_page for things only visible once rendered.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>elements</code><span className="rd-optional">optional</span></dt><dd>Array of element rects captured from the rendered page via the DevTools snippet</dd></div>
                  <div className="rd-param"><dt><code>viewport</code><span className="rd-optional">optional</span></dt><dd>Viewport dimensions &#123;w,h&#125; at capture time</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_typography">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_typography" aria-label="Link to audit_typography">#</a><code>audit_typography</code></h3>
                <p className="rd-tool-desc">Audit the typographic SCALE of a rendered page (pass url) or a pre-collected snapshot of text nodes. Emits a focused report: (a) MODULAR SCALE — detects the dominant ratio (~1.2/1.25/1.333/1.5) across distinct font sizes and flags off-scale outliers; (b) LINE-HEIGHT CONSISTENCY — unitless lh/fs ratio per node, identifies the body rhythm and flags outliers; (c) WEIGHT LADDER — distinct weights, flags &gt;4 weights or non-standard CSS values. Returns scale, line_height, weight_ladder, nodes_analyzed, and findings[&#123;rule,severity,selector,message,fix&#125;]. Goes beyond audit_page’s pass/fail typography checks. url mode requires headless chromium.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>url</code><span className="rd-optional">optional</span></dt><dd>URL to render and measure (http/https or file://). Requires headless chromium.</dd></div>
                  <div className="rd-param"><dt><code>nodes</code><span className="rd-optional">optional</span></dt><dd>Pre-collected text nodes to analyze without rendering.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_tap_targets">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_tap_targets" aria-label="Link to audit_tap_targets">#</a><code>audit_tap_targets</code></h3>
                <p className="rd-tool-desc">WCAG 2.5.5 / Apple 44pt tap-target audit for the web. Collects every interactive element (a, button, [role=button], input[type=submit/button/checkbox/radio], select, summary, label[for], [onclick], [tabindex&gt;=0]) and emits a PER-ELEMENT fix table for any whose rendered width or height is below the minimum (default 44px): selector, role, visible text, measured w/h, pixel deficit per axis, and a concrete CSS fix. Sorted worst-first. Two modes: pass url (renders in headless chromium, measures real getBoundingClientRect) or pass elements[] snapshot (pure, no browser).</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>url</code><span className="rd-optional">optional</span></dt><dd>URL to render and measure. Requires headless chromium.</dd></div>
                  <div className="rd-param"><dt><code>elements</code><span className="rd-optional">optional</span></dt><dd>Pre-collected interactive elements to score without rendering.</dd></div>
                  <div className="rd-param"><dt><code>minSize</code><span className="rd-optional">optional</span></dt><dd>Minimum tap-target size in px on each axis. Default 44.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_contrast">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_contrast" aria-label="Link to audit_contrast">#</a><code>audit_contrast</code></h3>
                <p className="rd-tool-desc">Compute WCAG contrast ratios for every text element on a rendered page (pass url) or from a supplied dom_snapshot. Reports AA (4.5:1 normal, 3:1 large) and AAA pass/fail per element and surfaces failing pairs with selector, ratio, and delta-to-pass — replacing manual eyedropper + ratio math.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>url</code><span className="rd-optional">optional</span></dt><dd>URL to render and measure (http/https or file://)</dd></div>
                  <div className="rd-param"><dt><code>dom_snapshot</code><span className="rd-optional">optional</span></dt><dd>Pre-collected text elements to score without rendering</dd></div>
                  <div className="rd-param"><dt><code>screenshot</code><span className="rd-optional">optional</span></dt><dd>Optional base64 PNG for caller reference; ratios are computed from the DOM, not pixels</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-suggest_contrast_fix">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-suggest_contrast_fix" aria-label="Link to suggest_contrast_fix">#</a><code>suggest_contrast_fix</code></h3>
                <p className="rd-tool-desc">Given failing WCAG color pairs, return the MINIMAL color change that clears the target ratio. For each &#123;fg,bg&#125; pair, computes the smallest foreground adjustment (and an alternative background adjustment) that reaches AA/AAA — with the achieved ratio and direction. Feeds directly from audit_contrast’s failing pairs: pass them here to get concrete passing values instead of brute-forcing colors by hand. Pure offline math.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>pairs</code><span className="rd-optional">optional</span></dt><dd>Color pairs to remediate. Each: &#123; selector?, fg, bg, fontPx?, bold?, targetRatio? &#125;. fontPx/bold pick the large-text threshold; targetRatio overrides the level.</dd></div>
                  <div className="rd-param"><dt><code>level</code><span className="rd-optional">optional</span></dt><dd>WCAG level when targetRatio is not given per-pair. Default AA. — “AA” | “AAA”</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_responsive_visibility">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_responsive_visibility" aria-label="Link to audit_responsive_visibility">#</a><code>audit_responsive_visibility</code></h3>
                <p className="rd-tool-desc">Render a URL at multiple breakpoints and flag content elements that are visible on desktop but hidden on mobile (display:none / opacity:0 / visibility:hidden / zero-size). Categorises each flag as ’likely-oversight’ (content that vanishes on mobile — the hidden-on-mobile content bug) vs ’intentional’ (decorative). Returns a table of selector / hiding-class / mobile-visible / desktop-visible / category. Requires headless chromium.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>url</code><span className="rd-required">required</span></dt><dd>URL to render (http/https or file://)</dd></div>
                  <div className="rd-param"><dt><code>breakpoints</code><span className="rd-optional">optional</span></dt><dd>Viewport widths in px. Default [390, 768, 1440, 2160]</dd></div>
                  <div className="rd-param"><dt><code>viewportHeight</code><span className="rd-optional">optional</span></dt><dd>Render height in px. Default 900</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_consistency">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_consistency" aria-label="Link to audit_consistency">#</a><code>audit_consistency</code></h3>
                <p className="rd-tool-desc">Audit multiple pages for cross-page consistency of content-container width and hero heading tier. Pass ≥2 pages (&#123;name, html&#125;) collected from different routes on the same site. Infers the canonical (modal) value from the corpus when no token is supplied, so you need not know the project’s design token in advance. Flags the issue #9 single-blob blind spot: pages that each pass audit_page but silently disagree with each other on container width or hero size class. Returns per-page extraction (container_px, container_classes, hero_classes, signatures), consistency dimensions with reference values, outlier page names, issues[], score (100/50/0 → A/C/D), and a plain-text summary. Pure offline — no browser, no network.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>pages</code><span className="rd-required">required</span></dt><dd>At least 2 pages to compare. Each entry is &#123;name, html&#125;.</dd></div>
                  <div className="rd-param"><dt><code>container_token</code><span className="rd-optional">optional</span></dt><dd>Project’s canonical container width in px (e.g. 1152). When supplied, container divergence is measured against this token rather than the corpus modal.</dd></div>
                  <div className="rd-param"><dt><code>hero_token</code><span className="rd-optional">optional</span></dt><dd>Canonical hero heading class signature (e.g. "text-display-xl" or "64"). When supplied, hero divergence is measured against this token rather than the corpus modal.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_asset_integrity">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_asset_integrity" aria-label="Link to audit_asset_integrity">#</a><code>audit_asset_integrity</code></h3>
                <p className="rd-tool-desc">Detect PNG exports whose content is sliced/cut off at the bottom edge (e.g. a Figma export that ended mid-form). Dimension/ratio checks cannot catch cut content inside a correctly-sized file; this measures per-pixel luminance variance in the bottom strip — uniform background = clean, high-variance UI content running into the edge = likely-sliced. Accepts filesystem paths to PNGs.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>image_paths</code><span className="rd-required">required</span></dt><dd>Filesystem paths to PNG files to check for sliced/cut-off bottom content.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_contract">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_contract" aria-label="Link to audit_contract">#</a><code>audit_contract</code></h3>
                <p className="rd-tool-desc">Verify a wire contract (token list / field set / schemaVersion) is identical across N independent source files (iOS Swift, proxy JS, Android Kotlin). Flags missing/inconsistent tokens, schemaVersion drift, and prefix-ordering bugs (a contained token matched before the longer one). BLOCK/PASS verdict.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>contract_spec</code><span className="rd-required">required</span></dt><dd>object</dd></div>
                  <div className="rd-param"><dt><code>file_paths</code><span className="rd-required">required</span></dt><dd>array</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_api_contract">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_api_contract" aria-label="Link to audit_api_contract">#</a><code>audit_api_contract</code></h3>
                <p className="rd-tool-desc">Run adversarial queries against a live endpoint and return per-query verdict (shape-valid / shape-invalid / confident-wrong / uncertain) vs an expected shape schema + per-query expectations. Catches responses that are shape-valid but wrong.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>endpoint_url</code><span className="rd-required">required</span></dt><dd>string</dd></div>
                  <div className="rd-param"><dt><code>queries</code><span className="rd-required">required</span></dt><dd>array</dd></div>
                  <div className="rd-param"><dt><code>expected_shape_schema</code><span className="rd-required">required</span></dt><dd>object</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Search</h3><span className="rd-layer-count">1 tool</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-search_knowledge">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-search_knowledge" aria-label="Link to search_knowledge">#</a><code>search_knowledge</code></h3>
                <p className="rd-tool-desc">Search across all design principles, UI patterns, and business strategies. Use when you need to find specific guidance or don’t know which category to look in.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>query</code><span className="rd-required">required</span></dt><dd>Search term (e.g. ’touch targets’, ’pricing psychology’, ’color contrast’)</dd></div>
                  <div className="rd-param"><dt><code>layer</code><span className="rd-optional">optional</span></dt><dd>Which layer to search: principles, patterns, business, or all (default)</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Taste Engine</h3><span className="rd-layer-count">10 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-create_taste_profile">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-create_taste_profile" aria-label="Link to create_taste_profile">#</a><code>create_taste_profile</code></h3>
                <p className="rd-tool-desc">Create (or overwrite) a named taste profile — a portable design-judgment ruleset + precedent corpus persisted locally under ~/.raven/taste/&lt;name&gt;.json (override dir with RAVEN_TASTE_HOME). Pass explicit rules[] (rule_id, clause_text, category, severity_default block|warn|nit, negative_prompt, owner taste|raven, delegate_to), and/or a DESIGN.md-style markdown doc to ingest (## headings = categories; ’- ’ bullets = rules; ’(block)’/’(warn)’/’(nit)’ severity markers; ’(raven:&lt;tool&gt;)’ delegates a rule to an existing Raven audit tool; ’(scope:&lt;surface&gt;)’ scopes a rule to one surface; ’Do NOT …’ sentences become the rule’s negative prompt). Ingest RULES-SHAPED docs only (actionable design constraints under category headings) — brand-story/mythology docs produce noise rules, not judgment. Local-first: nothing leaves the machine.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>name</code><span className="rd-required">required</span></dt><dd>Profile name (becomes &lt;name&gt;.json; lowercase alnum/dash/underscore).</dd></div>
                  <div className="rd-param"><dt><code>rules</code><span className="rd-optional">optional</span></dt><dd>Explicit rule objects.</dd></div>
                  <div className="rd-param"><dt><code>corpus</code><span className="rd-optional">optional</span></dt><dd>Seed precedent records.</dd></div>
                  <div className="rd-param"><dt><code>markdown</code><span className="rd-optional">optional</span></dt><dd>DESIGN.md-style markdown to ingest as rules.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_taste_profile">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_taste_profile" aria-label="Link to get_taste_profile">#</a><code>get_taste_profile</code></h3>
                <p className="rd-tool-desc">Load a locally stored taste profile by name — returns its full rule catalog, precedent corpus, and per-project surface bindings. NOT a calibration step: bindings are per-surface and do not transfer — for design work on a project without a binding, call get_taste_interview and ask the user its questions before committing any direction.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>name</code><span className="rd-required">required</span></dt><dd>Profile name.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_taste_interview">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_taste_interview" aria-label="Link to get_taste_interview">#</a><code>get_taste_interview</code></h3>
                <p className="rd-tool-desc">START HERE on a NEW project: returns a deterministic calibration interview — built from the taste profile’s own voice/tone rules and eleven design dimensions (typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries), each grounded in what the profile already enforces and most carrying multiple-choice options — the libraries question names specialty tech (three.js, GSAP, anime.js, framer-motion, lottie, GraphQL, vanilla) in plain outcome language so a non-technical person can choose by what users would see, and states the default build target for sites: a Next.js app, unless the user prefers otherwise — asking how the taste should show up on THIS surface (e.g. a monochrome portfolio wants the one-accent rule at full block; a product site doesn’t want monochrome suggestions at all, and may tolerate a warmer voice). The voice question always renders the same message in three registers (formal-technical / warm-conversational / punchy-editorial) so the user picks by ear, not by adjective — asked even when the profile has zero voice rules. Every question carries skippable + priority (’core’|’extended’); only identity is required — skipping the rest is fine but leaves that item uncalibrated and silent in future audits. A ’references’ question invites example URLs/screenshots/files, each interviewed with follow-ups about what specifically draws the person (element + quality), folded into the matching design_notes and listed under design_notes.references. The interview closes with an open-ended ’special’ question (any texture, signature detail, motif, or easter egg nothing else asked about — stored as design_notes.special); once the person has other bound surfaces, it carries `suggestions` — the special touches they chose elsewhere — so the interview starts proposing their own style back. Ask the user the returned questions conversationally, then persist the answers with bind_taste_surface (dimension answers go in design_notes). Run this BEFORE the first audit_taste on any project that has no binding yet — audit results include a calibration_hint when calibration is missing. When a user dislikes generated/designed output on an ALREADY-calibrated project, re-run with mode:’refine’ instead of starting over — dissatisfaction is a calibration signal, not a dead end: it requires an existing binding, then interviews what specifically fell short, offers to keep/tighten/replace each stored design_notes value, re-asks voice, and offers to log a reject precedent via label_finding. mode defaults to ’kickoff’.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>profile</code><span className="rd-required">required</span></dt><dd>Taste profile name (see list_taste_profiles).</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Project identifier the binding will be saved under, e.g. ’raven-mcp’ or ’portfolio’. Include it so the interview can show any existing binding.</dd></div>
                  <div className="rd-param"><dt><code>mode</code><span className="rd-optional">optional</span></dt><dd>’kickoff’ (default) calibrates a project with no binding yet. ’refine’ re-interviews an ALREADY-bound project after the user rejects generated/designed output — requires an existing binding (throws naming get_taste_interview kickoff otherwise) and asks what fell short, then per-dimension keep/tighten/replace, then voice, then an optional reject precedent.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-bind_taste_surface">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-bind_taste_surface" aria-label="Link to bind_taste_surface">#</a><code>bind_taste_surface</code></h3>
                <p className="rd-tool-desc">Persist a project’s surface calibration for a taste profile — the answers from get_taste_interview. A binding records: the surface string scoped rules match against (e.g. ’product-site’), URL hosts that identify the project in url-mode audits, per-rule severity overrides (block|warn|nit|off — ’off’ silences a rule on this surface), an optional voice/tone note, per-dimension design_notes (typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries, special — the interview’s design:* answers), and a first-class `references` array — the example sites the person pointed to. References are NOT lossy prose: each url is captured live and its PageTraits (scheme, luminance, animation/scroll motion, text density) are stored on the binding, then design_notes are consistency-checked against what the references ACTUALLY are. A ’dark, cinematic’ color note against two references that both render light comes back as a consistency_warning to surface to the user. Upserts by project name (~/.raven/taste/&lt;profile&gt;.surfaces.json). When the design_notes name an expensive technique (three.js/WebGL, GSAP scroll choreography, anime.js staggered motion, glassmorphism, a branded loader, lottie, kinetic display type…), the result carries build_hints — a concrete recipe + canonical public example sources per technique, so the builder sees the HOW at kickoff, BEFORE building; an expensive note is not license to drop it. After binding, audit_taste with project:’&lt;name&gt;’ or a bound url applies the calibration automatically: matching scoped rules run at full severity, non-matching ones are skipped, overrides re-tune the rest. ENFORCED: binding a BRAND-NEW surface with no calibration content (no design_notes/voice_note/references/overrides) is REFUSED — that is the fingerprint of a skipped kickoff interview. Run get_taste_interview, ask the USER, and bind their answers; the uncalibrated_ack escape hatch exists only for a user who was interviewed and deliberately skipped every dimension.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>profile</code><span className="rd-required">required</span></dt><dd>Taste profile name.</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-required">required</span></dt><dd>Project identifier, e.g. ’raven-mcp’, ’portfolio’.</dd></div>
                  <div className="rd-param"><dt><code>surface</code><span className="rd-required">required</span></dt><dd>What this surface IS, in scope-matchable words: ’monochrome portfolio’, ’product-site’, ’developer docs’. Scoped rules activate when their scope tokens overlap this string.</dd></div>
                  <div className="rd-param"><dt><code>hosts</code><span className="rd-optional">optional</span></dt><dd>URL hostnames that identify this project (e.g. ravenmcp.ai) — matched in url-mode audits, subdomains included.</dd></div>
                  <div className="rd-param"><dt><code>overrides</code><span className="rd-optional">optional</span></dt><dd>Per-rule re-tuning for this surface (e.g. relax a voice rule to nit on a product site).</dd></div>
                  <div className="rd-param"><dt><code>voice_note</code><span className="rd-optional">optional</span></dt><dd>Short tone guidance for this surface (e.g. ’Product register: benefits may be stated plainly; still no hype verbs’). Echoed as voice_note in audit results.</dd></div>
                  <div className="rd-param"><dt><code>design_notes</code><span className="rd-optional">optional</span></dt><dd>Per-dimension design preferences from the interview’s design:* questions — keys are short dimension names (typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries, special; trimmed + lowercased, must match ^[a-z][a-z0-9_-]&#123;0,31&#125;$ after normalization, no two keys may collide), values are the user’s non-empty answers. Echoed as design_notes in every audit so generation is shaped by them, and treated as ACCEPTANCE CRITERIA a build must visibly satisfy.</dd></div>
                  <div className="rd-param"><dt><code>references</code><span className="rd-optional">optional</span></dt><dd>First-class reference examples the person pointed to. Each url is captured live (traits stored on the binding), and design_notes are consistency-checked against them — contradictions come back as consistency_warnings.</dd></div>
                  <div className="rd-param"><dt><code>uncalibrated_ack</code><span className="rd-optional">optional</span></dt><dd>ESCAPE HATCH — leave unset in the normal flow. Binding a BRAND-NEW surface with no calibration content (no design_notes/voice_note/references/overrides) is REFUSED, because that is the fingerprint of a skipped kickoff interview. Only if the user was genuinely interviewed and chose to skip every optional dimension, set this to a one-line note affirming that (e.g. ’user interviewed 2026-07-04, declined all dimension calibration’). It is recorded on the binding so the deliberate skip is auditable. Never set it to work around asking the user.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-record_taste_decision">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-record_taste_decision" aria-label="Link to record_taste_decision">#</a><code>record_taste_decision</code></h3>
                <p className="rd-tool-desc">The Taste Engine’s learning loop — record a taste, direction, or design decision the MOMENT it is made during real work (an accent chosen, a nav pattern rejected, a name direction picked, a type pairing approved), not just at interview time. Each record carries the project, a short dimension name (a standard one like color/navigation or a new category like iconography/sound), what was chosen in the user’s words, the alternatives rejected, why, and a source: ’user-directed’ (the user asked for it), ’user-approved’ (the user accepted a proposal), or ’user-corrected’ (the user overrode a generated choice — the highest-signal record). Recorded decisions evolve every future get_taste_interview kickoff: recurring choices return as suggested defaults on their dimension’s question, and decision categories no standard question covers become NEW interview questions. Record liberally — every committed decision is calibration data.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>profile</code><span className="rd-required">required</span></dt><dd>Taste profile name (see list_taste_profiles).</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-required">required</span></dt><dd>Project the decision was made on.</dd></div>
                  <div className="rd-param"><dt><code>dimension</code><span className="rd-required">required</span></dt><dd>Short lowercase dimension name — a standard one (typography, spacing, color, layout, motion, imagery, entrance, loading, navigation, aesthetic, libraries) or a new category the standard set doesn’t cover (iconography, sound, naming, …). New categories become new interview questions.</dd></div>
                  <div className="rd-param"><dt><code>decision</code><span className="rd-required">required</span></dt><dd>What was chosen, in the user’s words — e.g. ’amber-phosphor accent, period-accurate not decorative’.</dd></div>
                  <div className="rd-param"><dt><code>rejected</code><span className="rd-optional">optional</span></dt><dd>Alternatives considered and passed over.</dd></div>
                  <div className="rd-param"><dt><code>why</code><span className="rd-optional">optional</span></dt><dd>The stated reason, if the user gave one.</dd></div>
                  <div className="rd-param"><dt><code>source</code><span className="rd-optional">optional</span></dt><dd>How the decision was made — defaults to ’user-directed’. ’user-corrected’ (user overrode a generated choice) is the highest-signal record. — “user-directed” | “user-approved” | “user-corrected”</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-list_taste_decisions">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-list_taste_decisions" aria-label="Link to list_taste_decisions">#</a><code>list_taste_decisions</code></h3>
                <p className="rd-tool-desc">List the taste/direction/design decisions recorded for a profile (see record_taste_decision), optionally filtered by project or dimension — the ledger that evolves the kickoff interview.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>profile</code><span className="rd-required">required</span></dt><dd>Taste profile name.</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Only decisions made on this project.</dd></div>
                  <div className="rd-param"><dt><code>dimension</code><span className="rd-optional">optional</span></dt><dd>Only decisions on this dimension.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-list_taste_profiles">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-list_taste_profiles" aria-label="Link to list_taste_profiles">#</a><code>list_taste_profiles</code></h3>
                <p className="rd-tool-desc">List locally stored taste profiles with rule/corpus counts and last-updated timestamps.</p>
                <p className="rd-param-heading rd-param-none">No parameters</p>
              </article>
              <article className="rd-tool" id="tool-generate_taste_portrait">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-generate_taste_portrait" aria-label="Link to generate_taste_portrait">#</a><code>generate_taste_portrait</code></h3>
                <p className="rd-tool-desc">Render a bound Taste Engine surface as a self-contained designed HTML portrait. Pass project to render one binding, or omit project to render every binding plus a gallery index.html. Portraits are generated from the local taste store and should be verified with audit_taste against their own surface/project before sharing — pass document_kind:’portrait’ on that audit: a portrait is a document ABOUT the surface, so design_notes (three.js scenes, branded loaders…) are not acceptance criteria for it; profile rules still bind in full.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>profile</code><span className="rd-required">required</span></dt><dd>Taste profile name.</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Optional bound project name. Omit to render every surface binding in the profile plus a gallery index.</dd></div>
                  <div className="rd-param"><dt><code>output_dir</code><span className="rd-required">required</span></dt><dd>Directory where the generated HTML files should be written.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-audit_taste">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-audit_taste" aria-label="Link to audit_taste">#</a><code>audit_taste</code></h3>
                <p className="rd-tool-desc">Judge a target against a taste profile. Pass html (static page/CSS), text (a copy block), or url (rendered headless; also runs delegated WCAG-contrast/tap-target measurements for owner:raven rules). owner:taste rules run deterministic detectors — gradients, glow/neon (large-blur colored shadows), second accent hue, banned-word lists from the rule’s negative prompt; clauses with no deterministic detector are reported honestly under not_assessed instead of guessed. owner:raven rules route through Raven’s existing audit engines (page checks, contrast, tap targets) and fold results in under the delegating rule_id. Every finding cites an existing rule_id + concrete evidence — the engine prefers silence over a speculative nit. accept-verdict corpus precedents suppress previously-approved patterns. When the resolved binding carries design_notes, audit_taste VERIFIES each note against the artifact instead of only echoing it: url mode measures the rendered page’s traits (scheme/luminance, canvas+WebGL, animations, scroll effects, text density, fonts, heading scale, loader, backdrop-filter), html mode extracts what it can statically, and every note comes back in note_assessments as present/partial/missing/unverifiable with trait-number evidence — design_notes are ACCEPTANCE CRITERIA for a build, not mood words. Missing notes become fidelity_findings (NOTE-&lt;key&gt;, warn — block when a named library like three.js/gsap/lottie/anime.js or a branded loader is wholly absent), the target is compared against the binding’s captured references (REF-* deltas on scheme, density, motion, type scale), and sparse-and-empty pages are flagged (TASTE-restraint-earned: sparseness must be earned by craft density, not achieved by deletion). fidelity_findings count toward the verdict. When a note names an expensive technique (three.js/WebGL, GSAP scroll choreography, anime.js staggered motion, glassmorphism, a branded loader, lottie, kinetic display type…), the result carries build_hints — a concrete recipe + canonical public example sources for that technique, so a failing audit hands the fix ammunition next to the missing finding; an expensive note is never license to drop it. Rules may carry a scope (e.g. portfolio-monochrome); pass surface to say what you’re judging — scoped rules run at full severity on a matching surface, are skipped (reported under skipped_out_of_scope) on a non-matching one, and can warn but never block when surface is omitted. Better: pass project (or audit a bound url host) so a saved surface binding supplies the surface, per-rule overrides, and voice note automatically — on a NEW project with no binding, run get_taste_interview first (results carry a calibration_hint when calibration is missing). Verdict: BLOCK (any block finding) / WARN (any warn) / PASS.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>profile</code><span className="rd-required">required</span></dt><dd>Taste profile name (see list_taste_profiles).</dd></div>
                  <div className="rd-param"><dt><code>html</code><span className="rd-optional">optional</span></dt><dd>Full HTML/CSS of the page to judge.</dd></div>
                  <div className="rd-param"><dt><code>text</code><span className="rd-optional">optional</span></dt><dd>A copy/text block to judge (voice/banned-word rules).</dd></div>
                  <div className="rd-param"><dt><code>url</code><span className="rd-optional">optional</span></dt><dd>Live URL — rendered headless with scroll-settle; enables delegated contrast/tap-target measurement.</dd></div>
                  <div className="rd-param"><dt><code>surface</code><span className="rd-optional">optional</span></dt><dd>What surface is being judged (e.g. ’portfolio’, ’product-site’, ’deck’) — activates/skips scope-tagged rules by token match. Omit if unsure: scoped rules then warn instead of block.</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Project identifier — resolves a saved surface binding (see get_taste_interview / bind_taste_surface) that supplies the surface and per-rule overrides automatically. url-mode audits also resolve bindings by hostname.</dd></div>
                  <div className="rd-param"><dt><code>document_kind</code><span className="rd-optional">optional</span></dt><dd>’artifact’ (default): the target is a build OF the surface — design_notes bind it as acceptance criteria (note_assessments/fidelity_findings run). ’portrait’: the target is a document ABOUT the surface (e.g. generate_taste_portrait output) — note-fidelity is skipped and the result announces it in note_fidelity_skipped. Profile rules run in full either way.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-label_finding">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-label_finding" aria-label="Link to label_finding">#</a><code>label_finding</code></h3>
                <p className="rd-tool-desc">Append a labeled precedent to a taste profile’s corpus — the growth loop. Use when a human accepts/revises/rejects an audit_taste finding or labels a new wrong→right example. Append-only: existing records are never rewritten. accept-verdict precedents suppress matching findings in future audit_taste runs.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>profile</code><span className="rd-required">required</span></dt><dd>Profile name.</dd></div>
                  <div className="rd-param"><dt><code>artifact</code><span className="rd-required">required</span></dt><dd>What was judged (path, URL, or short description).</dd></div>
                  <div className="rd-param"><dt><code>verdict</code><span className="rd-required">required</span></dt><dd>accept = the flagged pattern is fine (suppresses future matches); revise/reject = confirmed wrong.</dd></div>
                  <div className="rd-param"><dt><code>violated_rule</code><span className="rd-required">required</span></dt><dd>The rule_id the label concerns (’’ if none). Must exist in the profile.</dd></div>
                  <div className="rd-param"><dt><code>severity</code><span className="rd-optional">optional</span></dt><dd>Severity the human assigns. — “block” | “warn” | “nit”</dd></div>
                  <div className="rd-param"><dt><code>wrong</code><span className="rd-required">required</span></dt><dd>The wrong pattern — use a verbatim snippet so accept-suppression can match it.</dd></div>
                  <div className="rd-param"><dt><code>right</code><span className="rd-required">required</span></dt><dd>What right looks like.</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>DESIGN.md &amp; Grab</h3><span className="rd-layer-count">6 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-read_design_md">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-read_design_md" aria-label="Link to read_design_md">#</a><code>read_design_md</code></h3>
                <p className="rd-tool-desc">Parse a DESIGN.md file and return its frontmatter, Markdown body, and flattened token index.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>path</code><span className="rd-required">required</span></dt><dd>Path to DESIGN.md</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-init_design_md">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-init_design_md" aria-label="Link to init_design_md">#</a><code>init_design_md</code></h3>
                <p className="rd-tool-desc">Initialize a DESIGN.md file from a stored Raven token system, a getdesign.md starter slug, or a blank template.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>path</code><span className="rd-required">required</span></dt><dd>Path to DESIGN.md to create</dd></div>
                  <div className="rd-param"><dt><code>from</code><span className="rd-optional">optional</span></dt><dd>Source selector: blank, stored system, or starter slug</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-update_design_md">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-update_design_md" aria-label="Link to update_design_md">#</a><code>update_design_md</code></h3>
                <p className="rd-tool-desc">Update one DESIGN.md token surgically while preserving the Markdown body.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>path</code><span className="rd-required">required</span></dt><dd>Path to DESIGN.md</dd></div>
                  <div className="rd-param"><dt><code>set</code><span className="rd-optional">optional</span></dt><dd>object</dd></div>
                  <div className="rd-param"><dt><code>rename</code><span className="rd-optional">optional</span></dt><dd>object</dd></div>
                  <div className="rd-param"><dt><code>remove</code><span className="rd-optional">optional</span></dt><dd>object</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-start_grab_session">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-start_grab_session" aria-label="Link to start_grab_session">#</a><code>start_grab_session</code></h3>
                <p className="rd-tool-desc">Start a capability-keyed Raven grab bridge on loopback. Proxy mode is the preferred zero-paste path: it serves a running local app with the overlay injected into HTML; the manual script tag remains available when needed.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>path</code><span className="rd-required">required</span></dt><dd>Path to DESIGN.md to expose over /tokens</dd></div>
                  <div className="rd-param"><dt><code>port</code><span className="rd-optional">optional</span></dt><dd>Optional port; defaults to an ephemeral loopback port</dd></div>
                  <div className="rd-param"><dt><code>proxy_target</code><span className="rd-optional">optional</span></dt><dd>URL of a running local dev server; the bridge will serve that app with the grab overlay auto-injected into every HTML page — user opens the bridge URL, zero setup</dd></div>
                  <div className="rd-param"><dt><code>role</code><span className="rd-optional">optional</span></dt><dd>Overlay role; consumer preserves the component-request flow, maintainer enables direct design-system component creation</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_grabbed_elements">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_grabbed_elements" aria-label="Link to get_grabbed_elements">#</a><code>get_grabbed_elements</code></h3>
                <p className="rd-tool-desc">Drain the current grab queue, optionally waiting up to timeout_ms for the next selection.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>timeout_ms</code><span className="rd-optional">optional</span></dt><dd>Optional wait timeout in milliseconds</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-stop_grab_session">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-stop_grab_session" aria-label="Link to stop_grab_session">#</a><code>stop_grab_session</code></h3>
                <p className="rd-tool-desc">Stop the current grab bridge and clear its queued selections.</p>
                <p className="rd-param-heading rd-param-none">No parameters</p>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Creative Studio</h3><span className="rd-layer-count">12 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-list_creative_models">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-list_creative_models" aria-label="Link to list_creative_models">#</a><code>list_creative_models</code></h3>
                <p className="rd-tool-desc">Browse Raven’s provider-agnostic creative model catalog. These are capability slots for image, video, 3D, audio, character consistency, and creative analysis. Use a configured RAVEN_CREATIVE_RUNNER to route jobs to any local CLI or API wrapper.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>media_type</code><span className="rd-optional">optional</span></dt><dd>Filter by media type. — “image” | “video” | “audio” | “3d” | “campaign” | “analysis”</dd></div>
                  <div className="rd-param"><dt><code>capability</code><span className="rd-optional">optional</span></dt><dd>Filter by capability, e.g. product-photoshoot, text-to-video, brand-kit, ugc-ad.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-list_creative_presets">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-list_creative_presets" aria-label="Link to list_creative_presets">#</a><code>list_creative_presets</code></h3>
                <p className="rd-tool-desc">Browse Raven creative presets for product photoshoots, marketplace cards, UGC ads, TV spots, cinematic reveals, social launch packs, storyboards, and infographics.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>media_type</code><span className="rd-optional">optional</span></dt><dd>Filter presets by media type. — “image” | “video” | “campaign”</dd></div>
                  <div className="rd-param"><dt><code>search</code><span className="rd-optional">optional</span></dt><dd>Search preset name or description.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-create_brand_profile">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-create_brand_profile" aria-label="Link to create_brand_profile">#</a><code>create_brand_profile</code></h3>
                <p className="rd-tool-desc">Create or update a local brand profile used by Raven creative jobs. Stores colors, fonts, tone, audience, constraints, product notes, and asset references locally under ~/.raven/creative by default.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>name</code><span className="rd-required">required</span></dt><dd>Brand or project name.</dd></div>
                  <div className="rd-param"><dt><code>id</code><span className="rd-optional">optional</span></dt><dd>Optional stable ID. If omitted, Raven creates one from the name.</dd></div>
                  <div className="rd-param"><dt><code>description</code><span className="rd-optional">optional</span></dt><dd>What the brand/product is.</dd></div>
                  <div className="rd-param"><dt><code>colors</code><span className="rd-optional">optional</span></dt><dd>Brand colors, preferably hex or token names.</dd></div>
                  <div className="rd-param"><dt><code>fonts</code><span className="rd-optional">optional</span></dt><dd>Brand fonts or type guidance.</dd></div>
                  <div className="rd-param"><dt><code>tone</code><span className="rd-optional">optional</span></dt><dd>Voice and tone guidance.</dd></div>
                  <div className="rd-param"><dt><code>audience</code><span className="rd-optional">optional</span></dt><dd>Primary audience/customer.</dd></div>
                  <div className="rd-param"><dt><code>product</code><span className="rd-optional">optional</span></dt><dd>Product or offer notes.</dd></div>
                  <div className="rd-param"><dt><code>constraints</code><span className="rd-optional">optional</span></dt><dd>Rules to honor: no claims, legal notes, visual constraints.</dd></div>
                  <div className="rd-param"><dt><code>asset_ids</code><span className="rd-optional">optional</span></dt><dd>Existing Raven creative asset IDs tied to this brand.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_brand_profile">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_brand_profile" aria-label="Link to get_brand_profile">#</a><code>get_brand_profile</code></h3>
                <p className="rd-tool-desc">Read a local Raven creative brand profile by ID.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>id</code><span className="rd-required">required</span></dt><dd>Brand profile ID.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-list_brand_profiles">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-list_brand_profiles" aria-label="Link to list_brand_profiles">#</a><code>list_brand_profiles</code></h3>
                <p className="rd-tool-desc">List local Raven creative brand profiles.</p>
                <p className="rd-param-heading rd-param-none">No parameters</p>
              </article>
              <article className="rd-tool" id="tool-register_creative_asset">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-register_creative_asset" aria-label="Link to register_creative_asset">#</a><code>register_creative_asset</code></h3>
                <p className="rd-tool-desc">Register a local or remote creative asset for Raven jobs. This is the local-first analog of upload: Raven stores metadata and a URI/path, not the file bytes.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>uri</code><span className="rd-required">required</span></dt><dd>Local path or URL to the asset.</dd></div>
                  <div className="rd-param"><dt><code>type</code><span className="rd-required">required</span></dt><dd>Asset type. — “image” | “video” | “audio” | “document” | “3d” | “url” | “other”</dd></div>
                  <div className="rd-param"><dt><code>name</code><span className="rd-optional">optional</span></dt><dd>Human-readable name.</dd></div>
                  <div className="rd-param"><dt><code>description</code><span className="rd-optional">optional</span></dt><dd>What this asset should be used for.</dd></div>
                  <div className="rd-param"><dt><code>tags</code><span className="rd-optional">optional</span></dt><dd>Search tags.</dd></div>
                  <div className="rd-param"><dt><code>metadata</code><span className="rd-optional">optional</span></dt><dd>Optional non-secret metadata.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-create_character_profile">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-create_character_profile" aria-label="Link to create_character_profile">#</a><code>create_character_profile</code></h3>
                <p className="rd-tool-desc">Create a local character/identity reference profile for consistent image or video generation. Raven stores reference asset IDs and provider-training payloads; actual identity training happens only through a configured provider runner.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>name</code><span className="rd-required">required</span></dt><dd>Character, spokesperson, founder, avatar, or product persona name.</dd></div>
                  <div className="rd-param"><dt><code>reference_asset_ids</code><span className="rd-required">required</span></dt><dd>Raven creative asset IDs for reference images/videos.</dd></div>
                  <div className="rd-param"><dt><code>id</code><span className="rd-optional">optional</span></dt><dd>Optional stable ID.</dd></div>
                  <div className="rd-param"><dt><code>description</code><span className="rd-optional">optional</span></dt><dd>Visual/personality description.</dd></div>
                  <div className="rd-param"><dt><code>consistency_notes</code><span className="rd-optional">optional</span></dt><dd>What must stay consistent across generations.</dd></div>
                  <div className="rd-param"><dt><code>provider_training_id</code><span className="rd-optional">optional</span></dt><dd>External provider training/character ID if already trained.</dd></div>
                  <div className="rd-param"><dt><code>metadata</code><span className="rd-optional">optional</span></dt><dd>Optional non-secret metadata.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-create_generation_job">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-create_generation_job" aria-label="Link to create_generation_job">#</a><code>create_generation_job</code></h3>
                <p className="rd-tool-desc">Create a Raven creative generation job for image, video, 3D, audio, campaign, or analysis. Returns a brand-aware provider payload. If execute=true and RAVEN_CREATIVE_RUNNER is configured, Raven submits the job to that local runner.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>media_type</code><span className="rd-required">required</span></dt><dd>Output type. — “image” | “video” | “audio” | “3d” | “campaign” | “analysis”</dd></div>
                  <div className="rd-param"><dt><code>prompt</code><span className="rd-required">required</span></dt><dd>Creative request.</dd></div>
                  <div className="rd-param"><dt><code>objective</code><span className="rd-optional">optional</span></dt><dd>Business or audience goal.</dd></div>
                  <div className="rd-param"><dt><code>model</code><span className="rd-optional">optional</span></dt><dd>Raven model slot or external provider model ID.</dd></div>
                  <div className="rd-param"><dt><code>provider</code><span className="rd-optional">optional</span></dt><dd>Provider label for the downstream runner.</dd></div>
                  <div className="rd-param"><dt><code>preset</code><span className="rd-optional">optional</span></dt><dd>Preset ID from list_creative_presets.</dd></div>
                  <div className="rd-param"><dt><code>brand_profile_id</code><span className="rd-optional">optional</span></dt><dd>Local Raven brand profile ID.</dd></div>
                  <div className="rd-param"><dt><code>character_profile_id</code><span className="rd-optional">optional</span></dt><dd>Local Raven character profile ID.</dd></div>
                  <div className="rd-param"><dt><code>reference_asset_ids</code><span className="rd-optional">optional</span></dt><dd>Local Raven creative asset IDs.</dd></div>
                  <div className="rd-param"><dt><code>aspect_ratio</code><span className="rd-optional">optional</span></dt><dd>Target aspect ratio, e.g. 1:1, 16:9, 9:16.</dd></div>
                  <div className="rd-param"><dt><code>duration_seconds</code><span className="rd-optional">optional</span></dt><dd>Video/audio duration.</dd></div>
                  <div className="rd-param"><dt><code>output_count</code><span className="rd-optional">optional</span></dt><dd>Number of variants to request.</dd></div>
                  <div className="rd-param"><dt><code>quality</code><span className="rd-optional">optional</span></dt><dd>Requested quality tier. — “draft” | “standard” | “high” | “4k”</dd></div>
                  <div className="rd-param"><dt><code>channel</code><span className="rd-optional">optional</span></dt><dd>Target channel, e.g. TikTok, YouTube Shorts, blog, marketplace.</dd></div>
                  <div className="rd-param"><dt><code>execute</code><span className="rd-optional">optional</span></dt><dd>Submit through RAVEN_CREATIVE_RUNNER now. Default false.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-get_generation_job">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-get_generation_job" aria-label="Link to get_generation_job">#</a><code>get_generation_job</code></h3>
                <p className="rd-tool-desc">Read a Raven creative generation job by ID.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>id</code><span className="rd-required">required</span></dt><dd>Generation job ID.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-list_generation_jobs">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-list_generation_jobs" aria-label="Link to list_generation_jobs">#</a><code>list_generation_jobs</code></h3>
                <p className="rd-tool-desc">List local Raven creative generation jobs.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>status</code><span className="rd-optional">optional</span></dt><dd>Filter by status: draft, needs_runner, submitted, completed, failed.</dd></div>
                  <div className="rd-param"><dt><code>media_type</code><span className="rd-optional">optional</span></dt><dd>Filter by media type. — “image” | “video” | “audio” | “3d” | “campaign” | “analysis”</dd></div>
                  <div className="rd-param"><dt><code>limit</code><span className="rd-optional">optional</span></dt><dd>Max jobs to return. Default 25.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-plan_creative_campaign">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-plan_creative_campaign" aria-label="Link to plan_creative_campaign">#</a><code>plan_creative_campaign</code></h3>
                <p className="rd-tool-desc">Plan a multi-asset creative campaign and optionally create draft generation jobs. Covers Higgsfield-like workflows: product photos, UGC/video ads, marketplace cards, launch/social packs, storyboards, and channel cutdowns.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>campaign_name</code><span className="rd-required">required</span></dt><dd>Campaign name.</dd></div>
                  <div className="rd-param"><dt><code>product_or_offer</code><span className="rd-required">required</span></dt><dd>Product, service, feature, or offer.</dd></div>
                  <div className="rd-param"><dt><code>audience</code><span className="rd-required">required</span></dt><dd>Target audience.</dd></div>
                  <div className="rd-param"><dt><code>goal</code><span className="rd-required">required</span></dt><dd>Primary campaign goal. — “awareness” | “conversion” | “retention” | “launch” | “research” | “sales”</dd></div>
                  <div className="rd-param"><dt><code>channels</code><span className="rd-required">required</span></dt><dd>Target channels: TikTok, Reels, YouTube Shorts, web, marketplace, LinkedIn, etc.</dd></div>
                  <div className="rd-param"><dt><code>brand_profile_id</code><span className="rd-optional">optional</span></dt><dd>Local Raven brand profile ID.</dd></div>
                  <div className="rd-param"><dt><code>source_asset_ids</code><span className="rd-optional">optional</span></dt><dd>Raven creative asset IDs to use as source/reference.</dd></div>
                  <div className="rd-param"><dt><code>formats</code><span className="rd-optional">optional</span></dt><dd>Preset IDs to force. Defaults inferred from channels.</dd></div>
                  <div className="rd-param"><dt><code>variants_per_format</code><span className="rd-optional">optional</span></dt><dd>How many draft job variants per format. Default 2.</dd></div>
                  <div className="rd-param"><dt><code>create_jobs</code><span className="rd-optional">optional</span></dt><dd>Create draft generation jobs. Default true.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-score_creative">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-score_creative" aria-label="Link to score_creative">#</a><code>score_creative</code></h3>
                <p className="rd-tool-desc">Score a creative prompt, script, or ad concept for hook strength, benefit clarity, product signal, call-to-action, channel fit, audience fit, and brand fit. This is a transparent heuristic, not a proprietary prediction model.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>creative_text</code><span className="rd-required">required</span></dt><dd>Prompt, script, ad copy, or creative concept to score.</dd></div>
                  <div className="rd-param"><dt><code>channel</code><span className="rd-optional">optional</span></dt><dd>Target channel.</dd></div>
                  <div className="rd-param"><dt><code>brand_profile_id</code><span className="rd-optional">optional</span></dt><dd>Local Raven brand profile ID.</dd></div>
                  <div className="rd-param"><dt><code>audience</code><span className="rd-optional">optional</span></dt><dd>Target audience if not in a brand profile.</dd></div>
                </dl>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Talon</h3><span className="rd-layer-count">2 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-talon_scan">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-talon_scan" aria-label="Link to talon_scan">#</a><code>talon_scan</code></h3>
                <p className="rd-tool-desc">Run Raven’s deterministic detector engine over a page — no LLM, pure measurement. Covers color-system discipline (palette budget, near-duplicate hex, hue diversity), spacing-grid conformance (base-unit, scale count), type-scale/rhythm (size count, body line-height, measure, font-family budget), heading/landmark structure, motion-duration/easing sanity (flashing-animation risk, prefers-reduced-motion coverage), and orphan-stretch/horizontal-overflow geometry. Pass html, url (rendered headless), or pre-measured elements+viewport (the same DevTools-snippet shape audit_layout takes — required for the two geometry rules). Every finding cites the src/data/principles/*.json entry it derives from. Pass project (and profile) to resolve a saved taste surface binding (see bind_taste_surface) — a finding the binding silences via an ’off’ override is still returned, flagged waived_by_taste:true, never dropped.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>html</code><span className="rd-optional">optional</span></dt><dd>Full HTML/CSS of the page to scan.</dd></div>
                  <div className="rd-param"><dt><code>url</code><span className="rd-optional">optional</span></dt><dd>Live URL — rendered headless with scroll-settle.</dd></div>
                  <div className="rd-param"><dt><code>elements</code><span className="rd-optional">optional</span></dt><dd>Pre-measured element rects (DevTools-snippet shape from audit_layout) — enables the geometry rules (orphan-stretch, horizontal-overflow).</dd></div>
                  <div className="rd-param"><dt><code>viewport</code><span className="rd-optional">optional</span></dt><dd>Viewport used for the horizontal-overflow geometry check.</dd></div>
                  <div className="rd-param"><dt><code>surface</code><span className="rd-optional">optional</span></dt><dd>What surface is being scanned — activates/skips scope-tagged rules by token match. Omit if unsure.</dd></div>
                  <div className="rd-param"><dt><code>project</code><span className="rd-optional">optional</span></dt><dd>Project identifier — resolves a saved surface binding (see bind_taste_surface) whose overrides can waive specific TAL-### rules. Requires profile.</dd></div>
                  <div className="rd-param"><dt><code>profile</code><span className="rd-optional">optional</span></dt><dd>Taste profile name to resolve project’s binding against (see list_taste_profiles). Only used when project or url is also given.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-talon_rules">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-talon_rules" aria-label="Link to talon_rules">#</a><code>talon_rules</code></h3>
                <p className="rd-tool-desc">Enumerate Raven’s Talon detector rule corpus — id, category, severity, taste scope, and the src/data/principles/*.json entry each rule cites. No scan required; use this to show a client ’why’ before or instead of running talon_scan.</p>
                <p className="rd-param-heading rd-param-none">No parameters</p>
              </article>
            </div>

            <div className="rd-layer-head"><h3>Reflection &amp; Registration</h3><span className="rd-layer-count">2 tools</span></div>
            <div className="rd-tool-list">
              <article className="rd-tool" id="tool-raven_reflect">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-raven_reflect" aria-label="Link to raven_reflect">#</a><code>raven_reflect</code></h3>
                <p className="rd-tool-desc">Summarize how Raven has been used on this machine over the last N days. Reports which tools are called most, which audit warnings fire repeatedly (→ likely gaps in Raven’s knowledge), which patterns and design systems you look up, and which companies you ask for brand styles. Call this when the user asks ’what have I been building with Raven’ or ’what’s Raven missing’. All data is read from a local log ($RAVEN_USAGE_LOG or ~/.raven/usage.jsonl) — nothing is fetched over the network.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>days</code><span className="rd-optional">optional</span></dt><dd>How many days back to include. Default: 30.</dd></div>
                </dl>
              </article>
              <article className="rd-tool" id="tool-raven_register">
                <h3 className="rd-tool-name"><a className="rd-tool-anchor" href="#tool-raven_register" aria-label="Link to raven_register">#</a><code>raven_register</code></h3>
                <p className="rd-tool-desc">Register your email to receive design updates and provide feedback to the Raven creator. Call this when a user wants to register, give feedback, or connect with the Raven team.</p>
                <p className="rd-param-heading">Parameters</p>
                <dl className="rd-params">
                  <div className="rd-param"><dt><code>email</code><span className="rd-required">required</span></dt><dd>User’s email address</dd></div>
                  <div className="rd-param"><dt><code>name</code><span className="rd-optional">optional</span></dt><dd>User’s name (optional)</dd></div>
                </dl>
              </article>
            </div>
          </div>
        </section>

        {/* ── 03 · Examples ── */}
        <section className="rd-section" id="examples" data-title="Examples" data-intent="compare_request_response">
          <div className="rd-section-inner">
            <div className="rd-section-head"><div><p className="rd-overline" data-index="03">Transcripts</p><h2>Examples</h2><p className="rd-section-intro">You don&rsquo;t need to call tools directly. Say what you are building or checking, and Claude can call the relevant Raven tool.</p></div><span className="rd-section-route">route / examples</span></div>
            <div className="rd-transcripts">
              <article className="rd-transcript">
                <div><p className="rd-prompt-label">Build a pricing page with Raven guidance</p><p className="rd-prompt">&ldquo;Build me a pricing page with 3 tiers for a developer tool. Use Stripe&rsquo;s design tokens.&rdquo;</p></div>
                <div><p>Raven can call <code>get_pattern(&quot;pricing-page&quot;)</code>, <code>get_principles(&quot;pricing page&quot;)</code>, and <code>get_design_system(&quot;stripe&quot;)</code>; Claude then builds from those returned rules and tokens.</p></div>
              </article>
              <article className="rd-transcript">
                <div><p className="rd-prompt-label">Evaluate an existing design</p><p className="rd-prompt">&ldquo;This signup form has 8 fields including phone number and company size. No social login. The submit button says &lsquo;Submit&rsquo;. No inline validation. Evaluate it for conversion and usability.&rdquo;</p></div>
                <div><p>Raven calls <code>evaluate_design</code> and returns matched principles, likely violations, and specific fixes.</p></div>
              </article>
              <article className="rd-transcript">
                <div><p className="rd-prompt-label">Pre-launch checklist</p><p className="rd-prompt">&ldquo;Give me a pre-launch checklist for this mobile landing page&rdquo;</p></div>
                <div><p>Returns a categorized checklist covering the pattern&rsquo;s requirements, accessibility, and platform-specific items.</p></div>
              </article>
              <article className="rd-transcript">
                <div><p className="rd-prompt-label">Compose a custom design system</p><p className="rd-prompt">&ldquo;Create a design system that uses Linear&rsquo;s color palette with Stripe&rsquo;s typography and spacing&rdquo;</p></div>
                <div><p>Raven calls <code>compose_system</code> to merge tokens from both systems into one set, output as CSS variables or W3C DTCG format.</p></div>
              </article>
              <article className="rd-transcript">
                <div><p className="rd-prompt-label">Generate a complete design system</p><p className="rd-prompt">&ldquo;Generate a bold design system for my startup called NightOwl. Brand color is #8B5CF6. Export as HTML so I can share it.&rdquo;</p></div>
                <div><p>Raven calls <code>generate_design_system</code> to create a token set — colors, typography, spacing, radius, elevation, motion — and exports a self-contained HTML documentation page you can open in a browser or print to PDF.</p></div>
              </article>
              <article className="rd-transcript">
                <div><p className="rd-prompt-label">Search across everything</p><p className="rd-prompt">&ldquo;What does Raven know about color contrast?&rdquo;</p></div>
                <div><p>Searches the full corpus — 132 design principles (UX, content, research, service-design, and brand), 23 UI and content pattern sets, and 5 business-strategy domains — for relevant guidance.</p></div>
              </article>
            </div>
          </div>
        </section>

        {/* ── 04 · Data Structure ── */}
        <section className="rd-section" id="data" data-title="Data Structure" data-intent="parse_audit_response">
          <div className="rd-section-inner">
            <div className="rd-section-head"><div><p className="rd-overline" data-index="04">Contract</p><h2>Data Structure</h2></div><span className="rd-section-route">route / schema</span></div>
            <div className="rd-split">
              <div><p className="rd-lede" style={{ marginTop: 0 }}>The design knowledge lives in <code>src/data/</code> as static JSON, loaded into memory when the server starts. No database, no external service — a knowledge lookup runs in-process.</p><p className="rd-note">Knowledge tools answer from the bundle with no network round-trip, so an agent gets the same answer every time. The render audits (<code>audit_url</code>, <code>audit_page</code>) fetch the page you point them at.</p></div>
              <div className="rd-code-shell"><div className="rd-code-top"><span>src/data/</span><button className="rd-copy" type="button" data-copy>Copy</button></div><pre><code>{`src/data/
  principles/          # 76 principles across 12 files
    nielsen-heuristics.json   laws-of-ux.json
    gestalt.json              accessibility.json
    typography.json           color-theory.json
    color-systems.json        spacing-systems.json
    mobile-ux.json            d4d.json
    responsive-layout.json    component-architecture.json

  patterns/            # 14 UI patterns
    signup-flow.json          pricing-page.json
    navigation.json           forms.json
    landing-page.json         dashboard.json
    modals-dialogs.json       empty-states.json
    error-states.json         loading-states.json
    cta.json                  social-proof.json
    mobile-conversion.json    dropdown-menu.json

  business/            # 5 strategy domains
    monetization.json  retention.json  onboarding.json
    growth.json        metrics.json

  tokens/              # 12 design systems
    registry.json
    systems/stripe.json, linear.json, apple-hig.json, …

  content/             # v1.2 — content design systems
    systems/           # 4 brand voice guides (Mailchimp, GOV.UK,
                       #   Polaris, Atlassian)
    principles/        # 11 UX-writing principles
    patterns/          # 4 content patterns (errors, empty states,
                       #   notifications, form validation)

  research/            # v1.3 — research & data analysis
    principles/        # 11 research fundamentals
    methods/           # qualitative, quantitative, usability
    frameworks/        # HEART, AARRR, North Star, funnel, RICE, OKRs

  service-design/      # v1.3 — service design
    principles/        # Stickdorn, Shostack, moments of truth,
                       #   peak-end, handoff, human help
    patterns/          # blueprinting, handoff, signup-as-service,
                       #   omnichannel, moments of truth
    frameworks/        # GOV.UK Service Standard (14 points)

  brand/               # v1.3 — brand & visual design
    principles/        # logo, gradient, imagery, hierarchy, system
    trends/            # 2026-current-trends.json`}</code></pre></div>
            </div>
          </div>
        </section>

        {/* ── 05 · Design Tokens ── */}
        <section className="rd-section" id="tokens" data-title="Design Tokens" data-intent="generate_token_system">
          <div className="rd-section-inner">
            <div className="rd-section-head"><div><p className="rd-overline" data-index="05">System output</p><h2>Design Tokens</h2><p className="rd-section-intro">Tokens follow the <a href="https://tr.designtokens.org/format/">W3C Design Tokens Community Group (DTCG)</a> format.</p></div><span className="rd-section-route">route / tokens</span></div>
            <div className="rd-body">
              <p>Each token has:</p>
              <ul>
                <li><code>$value</code> — the token value</li>
                <li><code>$type</code> — color, dimension, fontFamily, fontWeight, number, etc.</li>
                <li><code>$description</code> — what the token is for</li>
              </ul>

              <h3>Output formats</h3>
              <p>Request tokens in three formats:</p>
              <div className="rd-code-shell"><div className="rd-code-top"><span>get_design_system · formats</span><button className="rd-copy" type="button" data-copy>Copy</button></div><pre><code>{`// W3C DTCG (default) — standards-compliant JSON
get_design_system({ id: "stripe", format: "dtcg" })

// CSS Custom Properties — drop into your stylesheet
get_design_system({ id: "stripe", format: "css" })
// Output: :root { --stripe-color-primary: #635bff; ... }

// Flat — simple key-value pairs
get_design_system({ id: "stripe", format: "flat" })
// Output: [{ path: "color.primary", value: "#635bff", type: "color" }]`}</code></pre></div>

              <h3>Available systems</h3>
              <div className="rd-table-wrap">
                <table className="rd-table">
                  <thead>
                    <tr>
                      <th>System</th>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Stripe</td><td><code>stripe</code></td><td className="rd-status-live">Live</td><td>fintech</td></tr>
                    <tr><td>Linear</td><td><code>linear</code></td><td className="rd-status-live">Live</td><td>productivity</td></tr>
                    <tr><td>Apple HIG</td><td><code>apple-hig</code></td><td className="rd-status-live">Live</td><td>platform</td></tr>
                    <tr><td>Material Design 3</td><td><code>material-design</code></td><td className="rd-status-live">Live</td><td>platform</td></tr>
                    <tr><td>Vercel</td><td><code>vercel</code></td><td className="rd-status-live">Live</td><td>developer</td></tr>
                    <tr><td>shadcn/ui</td><td><code>shadcn</code></td><td className="rd-status-live">Live</td><td>component-library</td></tr>
                    <tr><td>GitHub Primer</td><td><code>github-primer</code></td><td className="rd-status-live">Live</td><td>developer</td></tr>
                    <tr><td>Notion</td><td><code>notion</code></td><td className="rd-status-live">Live</td><td>productivity</td></tr>
                    <tr><td>Supabase</td><td><code>supabase</code></td><td className="rd-status-live">Live</td><td>developer</td></tr>
                    <tr><td>Tailwind CSS</td><td><code>tailwind</code></td><td className="rd-status-live">Live</td><td>framework</td></tr>
                    <tr><td>Spotify</td><td><code>spotify</code></td><td className="rd-status-live">Live</td><td>consumer</td></tr>
                    <tr><td>Airbnb</td><td><code>airbnb</code></td><td className="rd-status-live">Live</td><td>consumer</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ── 06 · FAQ ── */}
        <section className="rd-section" id="faq" data-title="FAQ" data-intent="resolve_common_questions">
          <div className="rd-section-inner">
            <div className="rd-section-head"><div><p className="rd-overline" data-index="06">Notes</p><h2>FAQ</h2></div><span className="rd-section-route">route / faq</span></div>
            <div className="rd-faq">
              <details><summary>Does Raven make API calls?</summary><p>The design knowledge — principles, patterns, tokens, business and service-design guidance — is bundled locally: ~640KB of curated JSON that runs on your machine with no network round-trip. The render audits (<code>audit_url</code>, <code>audit_page</code>) fetch the page you point them at, and <code>raven_register</code> posts your email only if you opt into release updates. No auth tokens are required to use the knowledge tools.</p></details>
              <details><summary>Does it work with other AI coding tools?</summary><p>Raven works with any MCP-compatible client. Claude Code and Claude Desktop have native MCP support. Other tools are adding MCP support — check your client&rsquo;s documentation.</p></details>
              <details><summary>Can I add my own design system tokens?</summary><p>Yes. Add a JSON file to <code>src/data/tokens/systems/</code> following the W3C DTCG format, and register it in <code>registry.json</code>. See <code>stripe.json</code> as a reference.</p></details>
              <details><summary>Can I add custom principles or patterns?</summary><p>Yes. Add JSON files to <code>src/data/principles/</code> or <code>src/data/patterns/</code>. Follow the existing file structure. Raven loads all JSON files in those directories automatically.</p></details>
              <details><summary>How do I update?</summary><div className="rd-code-shell"><div className="rd-code-top"><span>terminal</span><button className="rd-copy" type="button" data-copy>Copy</button></div><pre><code>npm update -g raven-mcp</code></pre></div></details>
              <details><summary>Where does the knowledge come from?</summary><p>132 principles curated from Nielsen Norman Group, Laws of UX, Gestalt psychology, WCAG 2.2, typography and color theory, mobile UX (touch targets, nav consistency, font sizing), responsive layout, component architecture, UX writing (Mailchimp, GOV.UK), research fundamentals, service design (Stickdorn, Shostack, Carlzon&rsquo;s moments of truth, GOV.UK Service Standard), and brand systems (Pentagram, Brand New, public brand guidelines from Stripe, Airbnb, Linear, Vercel). 23 pattern sets based on conversion research, service-design practice, and copy-design evidence. Design tokens extracted from public-facing design systems. Metrics frameworks from Google, Amplitude, Dave McClure, and Intercom.</p></details>
            </div>
          </div>
        </section>
      </main>

      <DocsScripts />
    </div>
  )
}
