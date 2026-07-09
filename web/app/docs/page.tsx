import type { Metadata } from 'next';
import DocsScripts from '@/components/DocsScripts'
import './docs.css'


export const metadata: Metadata = {
  title: 'Docs — RavenMCP',
  description:
    'Install RavenMCP and use its 70 design-intelligence tools with Claude. Full setup for Claude Code, Claude Desktop, and any MCP client.',
  alternates: { canonical: '/docs' },
};

export default function DocsPage() {
  return (
    <>
      <div className="docs-wrapper">
          <aside className="toc">
            <div className="toc-label">On this page</div>
            <ul>
              <li><a href="#quickstart">Get Started</a></li>
              <li><a href="#tools">Tool Reference</a></li>
              <li><a href="#examples">Examples</a></li>
              <li><a href="#data">Data Structure</a></li>
              <li><a href="#tokens">Design Tokens</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </aside>
      
          <div className="docs-content">
          <div className="reveal">
          <h1>RavenMCP <span className="accent">Docs</span></h1>
          <p className="subtitle">Install Raven, then let Claude call design audits, token lookups, UI patterns, and taste checks while it builds.</p>
          </div>
      
          {/* ── Get Started ── */}
          <h2 id="quickstart" className="reveal">Get Started</h2>
          <p>Add Raven to Claude in under 2 minutes. Pick the path that matches how you use Claude.</p>
      
          <h3 className="reveal">Claude Code — one command</h3>
          <p>If you're in the terminal, this is the fastest path:</p>
          <pre><code>claude mcp add raven -- npx -y raven-mcp</code></pre>
      
          <p>Ask Claude to build or check UI; Raven gives it callable tools:</p>
          <pre><code>"Build me a pricing page with 3 tiers"
      "Check this signup form for accessibility issues"
      "Use Stripe's design tokens for the checkout flow"</code></pre>
      
          <div className="callout reveal">
            <strong>No configuration needed.</strong> Once added, Claude can call Raven for pattern guidance, token lookup, accessibility checks, typography checks, and taste verdicts.
          </div>
      
          <h3 className="reveal">Team config (.mcp.json)</h3>
          <p>Add a <code>.mcp.json</code> to your project root so everyone on the team gets Raven automatically:</p>
          <pre><code>{'{'}
        "mcpServers": {'{'}
          "raven": {'{'}
            "command": "npx",
            "args": ["-y", "raven-mcp"]
          {'}'}
        {'}'}
      {'}'}</code></pre>
      
          <h3 className="reveal">Claude Desktop — manual config</h3>
          <p>Add this to your config file (<strong>macOS:</strong> <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> &middot; <strong>Windows:</strong> <code>%APPDATA%\Claude\claude_desktop_config.json</code>):</p>
          <pre><code>{'{'}
        "mcpServers": {'{'}
          "raven": {'{'}
            "command": "npx",
            "args": ["-y", "raven-mcp"]
          {'}'}
        {'}'}
      {'}'}</code></pre>
          <p className="install-note">Requires Node.js 18 or later.</p>
      
          <h3 className="reveal">Claude Desktop — one-click extension</h3>
          <p>Prefer not to edit JSON? Download the extension and double-click it. Claude Desktop installs Raven automatically — no Node, no terminal.</p>
      
          <div className="install-card reveal">
            <div className="install-copy">
              <h4>Raven for Claude Desktop</h4>
              <p>macOS &middot; Windows &middot; Linux &nbsp;•&nbsp; ~4 MB &middot; v1.1.1</p>
            </div>
            <a href="/raven.mcpb" className="install-btn" download>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download .mcpb
            </a>
          </div>
      
          <ol>
            <li>Download the <code>.mcpb</code> file above.</li>
            <li>Double-click it (or drag into Claude Desktop's Settings → Extensions).</li>
            <li>Click <strong>Install</strong> in the dialog and restart Claude Desktop.</li>
          </ol>
      
          <h3 className="reveal">Install from source</h3>
          <pre><code>git clone https://github.com/rhinocap/raven-mcp.git
      cd raven-mcp && npm install && npm run build</code></pre>
      
          {/* ── Tool Reference ── */}
          <h2 id="tools" className="reveal">Tool Reference</h2>
          <p>Raven provides 70 tools across 9 knowledge layers. Claude calls the relevant tool based on the task; the cards below show what each tool returns.</p>
      
          <h3>Principles Layer</h3>
      
          <div className="tool-card reveal">
            <h3>get_principles</h3>
            <p className="tool-desc">Get design principles relevant to a UI context. Returns usability heuristics, Laws of UX, Gestalt principles, accessibility rules, typography, color theory, mobile UX, and responsive layout.</p>
            <dl className="params">
              <dt>context <span className="required">required</span></dt>
              <dd>What you're designing — e.g. "signup form", "pricing page", "mobile nav", "dark dashboard"</dd>
              <dt>category <span className="optional">optional</span></dt>
              <dd>Filter to: nielsen-heuristics, laws-of-ux, gestalt, accessibility, typography, color-theory, mobile-ux, responsive-layout, d4d</dd>
              <dt>format <span className="optional">optional</span></dt>
              <dd>"full" (default) | "checklist" | "brief"</dd>
            </dl>
            <pre><code>// Claude calls this automatically when you say:
      "Build a pricing page"
      "What accessibility rules apply to forms?"
      "Check this against Nielsen's heuristics"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>evaluate_design</h3>
            <p className="tool-desc">Evaluate a design description against UX principles. Returns relevant principles, potential violations, and improvement suggestions.</p>
            <dl className="params">
              <dt>description <span className="required">required</span></dt>
              <dd>Description of the design to evaluate</dd>
              <dt>context <span className="optional">optional</span></dt>
              <dd>What the design is — e.g. "pricing page for SaaS product"</dd>
              <dt>goals <span className="optional">optional</span></dt>
              <dd>Array of evaluation goals — e.g. ["conversion", "accessibility", "mobile-usability"]</dd>
            </dl>
            <pre><code>// Try:
      "This signup form has 8 fields, no social login, and the
       button says Submit. Evaluate it for conversion."</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_d4d_framework</h3>
            <p className="tool-desc">Get Design for Delight (D4D) templates — customer problem statement, ideal state, hypothesis, LOFAs, and experiment design.</p>
            <dl className="params">
              <dt>stage <span className="optional">optional</span></dt>
              <dd>"frame" | "empathy" | "broad" | "narrow" | "experiment" | "recommendation" | "full" (default)</dd>
            </dl>
          </div>
      
          <h3>Patterns Layer</h3>
      
          <div className="tool-card reveal">
            <h3>get_pattern</h3>
            <p className="tool-desc">Get UI/UX pattern guidance for a specific design type. Returns do's, don'ts, evidence, and checklists.</p>
            <dl className="params">
              <dt>type <span className="required">required</span></dt>
              <dd>Pattern type: signup-flow, pricing-page, navigation, forms, landing-page, dashboard, modals-dialogs, empty-states, error-states, loading-states, cta, social-proof, mobile-conversion</dd>
              <dt>platform <span className="optional">optional</span></dt>
              <dd>"desktop" | "mobile" | "responsive"</dd>
              <dt>goal <span className="optional">optional</span></dt>
              <dd>"conversion" | "usability" | "accessibility" | "delight"</dd>
            </dl>
            <pre><code>// Try:
      "Show me the checklist for a mobile signup flow"
      "What does a high-converting pricing page need?"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_checklist</h3>
            <p className="tool-desc">Get a pre-publish checklist for a UI type. Returns actionable yes/no items to verify before shipping.</p>
            <dl className="params">
              <dt>type <span className="required">required</span></dt>
              <dd>What you're shipping — e.g. "signup form", "pricing page", "dashboard"</dd>
              <dt>platform <span className="optional">optional</span></dt>
              <dd>"desktop" | "mobile" | "responsive"</dd>
            </dl>
            <pre><code>// Try:
      "Give me a pre-launch checklist for this landing page"
      "What should I check before shipping this mobile form?"</code></pre>
          </div>
      
          <h3>Business Layer</h3>
      
          <div className="tool-card reveal">
            <h3>get_business_strategy</h3>
            <p className="tool-desc">Get business and monetization strategies for digital products. Covers monetization, retention, onboarding, growth, and metrics.</p>
            <dl className="params">
              <dt>type <span className="required">required</span></dt>
              <dd>Strategy type: monetization, retention, onboarding, growth, metrics</dd>
              <dt>stage <span className="optional">optional</span></dt>
              <dd>"startup" | "growth" | "mature"</dd>
            </dl>
          </div>
      
          <h3>Tokens Layer</h3>
      
          <div className="tool-card reveal">
            <h3>list_design_systems</h3>
            <p className="tool-desc">Browse available design systems. Filter by category or search by name.</p>
            <dl className="params">
              <dt>category <span className="optional">optional</span></dt>
              <dd>fintech, productivity, developer, component-library, design-system</dd>
              <dt>search <span className="optional">optional</span></dt>
              <dd>Search by name or description</dd>
            </dl>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_design_system</h3>
            <p className="tool-desc">Get design tokens for a specific system. Returns colors, typography, spacing, radii, elevation, and motion tokens.</p>
            <dl className="params">
              <dt>id <span className="required">required</span></dt>
              <dd>Design system ID — e.g. "stripe", "linear"</dd>
              <dt>group <span className="optional">optional</span></dt>
              <dd>Filter to: color, color-dark, color-light, typography, spacing, radius, elevation, motion</dd>
              <dt>format <span className="optional">optional</span></dt>
              <dd>"dtcg" (W3C standard, default) | "css" (custom properties) | "flat" (key-value pairs)</dd>
            </dl>
            <pre><code>// Try:
      "Use Stripe's color tokens for this checkout page"
      "Give me Linear's typography scale as CSS variables"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>compose_system</h3>
            <p className="tool-desc">Mix tokens from different design systems to create a custom composite.</p>
            <dl className="params">
              <dt>compositions <span className="required">required</span></dt>
              <dd>Array of {'{'}system, group{'}'} pairs — e.g. Linear's colors + Stripe's typography</dd>
              <dt>format <span className="optional">optional</span></dt>
              <dd>"dtcg" (default) | "css"</dd>
            </dl>
            <pre><code>// Try:
      "Build me a design system with Linear's colors
       and Stripe's typography"</code></pre>
          </div>
      
          <h3>Search</h3>
      
          <div className="tool-card reveal">
            <h3>search_knowledge</h3>
            <p className="tool-desc">Search across all principles, patterns, and strategies. Use when you need to find specific guidance or don't know which category to look in.</p>
            <dl className="params">
              <dt>query <span className="required">required</span></dt>
              <dd>Search term — e.g. "touch targets", "pricing psychology", "color contrast"</dd>
              <dt>layer <span className="optional">optional</span></dt>
              <dd>"principles" | "patterns" | "business" | "all" (default)</dd>
            </dl>
          </div>
      
          <h3>Advanced Tools</h3>
      
          <div className="tool-card reveal">
            <h3>audit_page</h3>
            <p className="tool-desc">Audit an HTML page against design standards. Returns a score, grade, passes, and errors with specific fix recommendations.</p>
            <dl className="params">
              <dt>html <span className="required">required</span></dt>
              <dd>The HTML content to audit</dd>
              <dt>url <span className="optional">optional</span></dt>
              <dd>URL context for the page being audited</dd>
              <dt>checks <span className="optional">optional</span></dt>
              <dd>Array of check categories: "accessibility", "mobile", "performance", "seo", "all" (default)</dd>
            </dl>
            <pre><code>// Try:
      "Audit this landing page HTML for accessibility and mobile issues"
      "Check this signup form for WCAG compliance"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_brand_system</h3>
            <p className="tool-desc">Get a complete brand design system for a well-known company. Returns colors, typography, spacing, CSS variables, and implementation rules.</p>
            <dl className="params">
              <dt>company <span className="required">required</span></dt>
              <dd>Company name — e.g. "Stripe", "Apple", "Spotify", "Nike"</dd>
              <dt>format <span className="optional">optional</span></dt>
              <dd>"full" (default) | "css" | "tokens"</dd>
            </dl>
            <pre><code>// Try:
      "Make me an app with branding like Spotify"
      "Use Apple's design language for this landing page"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>generate_design_system</h3>
            <p className="tool-desc">Generate a complete, custom design system with full token set. Provide a brand color to auto-generate a harmonious palette, pick a style preset, and export as visual HTML documentation, CSS variables, W3C DTCG JSON, Figma Variables, or SVG palette card.</p>
            <dl className="params">
              <dt>name <span className="required">required</span></dt>
              <dd>Name for the design system — e.g. "Acme Corp", "NightOwl"</dd>
              <dt>brand_color <span className="optional">optional</span></dt>
              <dd>Primary brand hex color (e.g. "#FF6B35") — auto-generates a full palette using color theory</dd>
              <dt>base_system <span className="optional">optional</span></dt>
              <dd>Start from an existing system as foundation — e.g. "stripe", "linear"</dd>
              <dt>style <span className="optional">optional</span></dt>
              <dd>"minimal" | "bold" | "warm" | "corporate" | "playful" | "dark"</dd>
              <dt>dark_mode <span className="optional">optional</span></dt>
              <dd>Generate dark mode tokens alongside light (default: true)</dd>
              <dt>format <span className="optional">optional</span></dt>
              <dd>"html" (visual doc page) | "css" | "dtcg" (W3C JSON) | "figma" (Figma Variables) | "svg" (palette card) | "all"</dd>
            </dl>
            <pre><code>// Try:
      "Generate a design system for my startup with #FF6B35 as the brand color"
      "Create a bold design system called NightOwl with dark mode"
      "Export my design system as Figma Variables"</code></pre>
          </div>
      
          <h3>Content Design Layer <span style={{ color: 'var(--accent-blue)', fontSize: '13px', letterSpacing: '0.08em', fontWeight: '600' }}>v1.2</span></h3>
      
          <div className="tool-card reveal">
            <h3>list_content_systems</h3>
            <p className="tool-desc">Browse the registry of brand voice &amp; tone systems. Four live: Mailchimp, GOV.UK, Shopify Polaris, Atlassian. Filter by category or tag.</p>
            <pre><code>"Which brand voice guides does Raven know about?"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_content_system</h3>
            <p className="tool-desc">Full voice &amp; tone system for one brand — attributes, tone shifts by context (onboarding/errors/billing/success), vocabulary (use/avoid/never), grammar rules, content patterns, inclusive language.</p>
            <dl className="params">
              <dt>id <span className="required">required</span></dt>
              <dd>"mailchimp" | "gov-uk" | "shopify-polaris" | "atlassian"</dd>
              <dt>section <span className="optional">optional</span></dt>
              <dd>"all" (default) | "voice" | "tone_shifts" | "vocabulary" | "grammar" | "content-patterns" | "inclusive-language"</dd>
            </dl>
            <pre><code>"Write this error message in Mailchimp's voice"
      "Use GOV.UK plain-language guidelines for these forms"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_content_principles</h3>
            <p className="tool-desc">11 UX-writing principles: clarity over cleverness, front-load meaning, active voice, be specific, acknowledge the user, match words to mental model, consistent terminology, error-message anatomy, scannable structure, inclusive language, voice vs tone.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_content_pattern</h3>
            <p className="tool-desc">Copy recipes — full do/don't with examples and evidence — for error messages, empty-state copy, notifications, form validation.</p>
            <dl className="params">
              <dt>type <span className="required">required</span></dt>
              <dd>"error-messages" | "empty-state-copy" | "notifications" | "form-validation"</dd>
            </dl>
          </div>
      
          <h3>Research &amp; Data Layer <span style={{ color: 'var(--accent-blue)', fontSize: '13px', letterSpacing: '0.08em', fontWeight: '600' }}>v1.3</span></h3>
      
          <div className="tool-card reveal">
            <h3>get_research_method</h3>
            <p className="tool-desc">Qualitative (interviews, contextual inquiry, diary, field, intercepts), quantitative (surveys, analytics, A/B tests, benchmarking, clickstream), or usability (moderated, unmoderated, 5-sec, card sort, tree test, heuristic eval). Each with protocols, do/don'ts, evidence, and checklists.</p>
            <dl className="params">
              <dt>category <span className="optional">optional</span></dt>
              <dd>"qualitative" | "quantitative" | "usability" | "all" (default)</dd>
            </dl>
            <pre><code>"Design a usability study for my mobile onboarding"
      "How do I run a proper A/B test on this pricing change?"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_metrics_framework</h3>
            <p className="tool-desc">Six canonical frameworks: HEART (Google), AARRR / Pirate Metrics (McClure), North Star Metric, Conversion Funnel, RICE Scoring (Intercom), OKRs. Each with structure, when-to-use, pitfalls, and examples.</p>
            <dl className="params">
              <dt>id <span className="optional">optional</span></dt>
              <dd>"heart" | "aarrr" | "north-star-metric" | "conversion-funnel" | "rice-scoring" | "okrs". Omit to list all.</dd>
            </dl>
            <pre><code>"What metrics should we track for this app?"
      "Build me a HEART framework for our onboarding"</code></pre>
          </div>
      
          <h3>Service Design Layer <span style={{ color: 'var(--accent-blue)', fontSize: '13px', letterSpacing: '0.08em', fontWeight: '600' }}>v1.3</span></h3>
      
          <div className="tool-card reveal">
            <h3>get_service_pattern</h3>
            <p className="tool-desc">Service blueprinting, human handoff, signup-as-service, omnichannel continuity, moments of truth / recovery. Each with do/don'ts, evidence, and a checklist.</p>
            <dl className="params">
              <dt>type <span className="required">required</span></dt>
              <dd>"service-blueprinting" | "human-handoff" | "signup-as-service" | "omnichannel-continuity" | "moments-of-truth"</dd>
            </dl>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_service_standard</h3>
            <p className="tool-desc">The GOV.UK Service Standard — 14 points the UK government uses to assess whether a public service is ready to launch. Widely applicable as a rigorous service-quality checklist beyond government.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>generate_service_blueprint</h3>
            <p className="tool-desc">Render a Shostack/Stickdorn-style service blueprint as a self-contained HTML page. Two modes: classic single-actor, or <strong>two-actor HI-loop</strong> (customer&#x2194;lawyer, patient&#x2194;doctor, buyer&#x2194;agent) with swim lanes + line of interaction. Pass <code>ideal</code> for a current-vs-ideal side-by-side.</p>
            <dl className="params">
              <dt>service_name <span className="required">required</span></dt>
              <dd>Name of the service</dd>
              <dt>current <span className="required">required</span></dt>
              <dd>Array of steps with fields: label, user_action, frontstage, backstage, support, evidence, pain_point, delight, actor_b (for two-actor mode)</dd>
              <dt>actors <span className="optional">optional</span></dt>
              <dd><code>{'{'} a: {'{'}label{'}'}, b: {'{'}label{'}'} {'}'}</code> — switches on the two-actor / HI-loop layout</dd>
              <dt>ideal <span className="optional">optional</span></dt>
              <dd>Ideal-state steps rendered side-by-side with current</dd>
            </dl>
            <pre><code>"Map the client intake for a personal-injury firm — customer and
       lawyer as two actors. Show current state and ideal state."</code></pre>
          </div>
      
          <h3>Brand &amp; Visual Layer <span style={{ color: 'var(--accent-blue)', fontSize: '13px', letterSpacing: '0.08em', fontWeight: '600' }}>v1.3</span></h3>
      
          <div className="tool-card reveal">
            <h3>get_brand_principles</h3>
            <p className="tool-desc">Logo usage (clear space, min sizes, variants, placement, restraint), gradient usage (hierarchy, palette, contrast, trend vs signature), imagery (consistency, representation, purpose), visual hierarchy, and brand-as-system thinking.</p>
            <dl className="params">
              <dt>topic <span className="optional">optional</span></dt>
              <dd>"logo" | "gradient" | "imagery" | "hierarchy" | "system" — or a free-form search term</dd>
            </dl>
            <pre><code>"Audit this brand system for logo-usage consistency"
      "What are the rules for gradient overuse?"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>get_brand_trends</h3>
            <p className="tool-desc">Current 2026 brand &amp; visual-design trends with when-it-works / when-it-fails guidance — bento grids, monospace for tone, neon-on-dark-glass, generative patterns, brutalism rebound, AI-generated imagery, aggressive lowercase. Time-stamped (retire-before 2027-04) so it doesn't rot silently.</p>
          </div>
      
          <h3>Mobile &amp; Native Audit Layer <span style={{ color: 'var(--accent-blue)', fontSize: '13px', letterSpacing: '0.08em', fontWeight: '600' }}>v1.5</span></h3>
      
          <div className="tool-card reveal">
            <h3>audit_swiftui</h3>
            <p className="tool-desc">Static-analyze SwiftUI source against Apple's HIG — flags hardcoded <code>.font(.system(size:))</code> below ~13pt and tiny semantic fonts, hardcoded <code>Color(red:green:blue:)</code>/hex vs semantic + asset-catalog colors, an empty/undefined AccentColor, interactive frames under 44×44pt, and spacing off the 4/8-pt grid. None of the web-only rules run on iOS input.</p>
            <dl className="params">
              <dt>source <span className="optional">required</span></dt>
              <dd>SwiftUI source — a string or array of files</dd>
              <dt>accent_color_contents <span className="optional">optional</span></dt>
              <dd>Raw <code>AccentColor.colorset/Contents.json</code> — verifies the accent color actually defines components</dd>
            </dl>
            <pre><code>"Audit this SwiftUI screen against Apple's HIG"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_screen <span className="optional">(alias: audit_ios_screen)</span></h3>
            <p className="tool-desc">Score a rendered iOS or Android screen from a view-hierarchy / accessibility snapshot (<code>{'{'}platform,elements:[{'{'}label,rect,role,fontPt,fgColor,bgColor{'}'}],viewport{'}'}</code>) — touch targets (44pt iOS / 48dp Android), contrast (platform-standard muted roles — iOS <code>secondaryLabel</code>, Material <code>onSurfaceVariant</code> — warn, not fail), and alignment / gap-rhythm / optical balance. Pass <code>platform:"android"</code> for the Material thresholds; defaults to iOS. RN renders native, so this scores RN screens too. <code>audit_ios_screen</code> remains as a back-compat alias.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_ios_privacy</h3>
            <p className="tool-desc">The "no sketchy issues" gate. Reads a native <code>Info.plist</code> or an Expo <code>app.json</code> (+ optional PRIVACY.md, entitlements, source). Flags usage-string claims that contradict the code (e.g. a HealthKit write the app never performs), unused entitlements and Android permissions, ATS cleartext exceptions, secrets shipped in the bundle or <code>expo.extra</code>, and default data-egress not disclosed at the point of choice.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_rn</h3>
            <p className="tool-desc">Audit React Native / Expo source (JSX + StyleSheet) against the iOS HIG + Android Material conventions RN must satisfy — touchables missing <code>accessibilityLabel</code>/<code>accessibilityRole</code>, sub-44pt targets without <code>hitSlop</code>, <code>allowFontScaling={'{'}false{'}'}</code>, fontSize below ~13, screens with no <code>SafeAreaView</code>, and (multi-mode apps) hardcoded colors with no <code>useColorScheme</code>.</p>
            <dl className="params">
              <dt>source <span className="optional">required</span></dt>
              <dd>RN source — a string or array of files</dd>
              <dt>color_scheme <span className="optional">optional</span></dt>
              <dd>"light" | "dark" | "automatic" — single-mode apps suppress the dark-mode check</dd>
            </dl>
            <pre><code>"Audit this Expo screen for accessibility and safe areas"</code></pre>
          </div>
      
          <h3>Render &amp; Audit Layer <span style={{ color: 'var(--accent-blue)', fontSize: '13px', letterSpacing: '0.08em', fontWeight: '600' }}>v1.7–v1.10</span></h3>
      
          <div className="tool-card reveal">
            <h3>audit_url</h3>
            <p className="tool-desc">Layer 0 render-and-capture audit. Renders a live URL at every viewport &amp; theme, scroll-settles reveals and plays videos, fires hover/click/focus, then runs the page-check engine plus pixel checks — sliced-image edge symmetry and hover-state white-wash — tagging each finding <code>confirmed</code> / <code>likely-artifact</code> / <code>inconclusive</code>. Requires headless Chromium.</p>
            <pre><code>"Render and audit https://example.com on mobile and desktop, light and dark"</code></pre>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_contrast</h3>
            <p className="tool-desc">Compute WCAG 2.1 contrast ratios for every text element on a rendered page. Returns per-element ratio, AA/AAA pass-fail, and delta-to-pass for failures. Replaces the manual eyedropper + ratio math.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_responsive_visibility</h3>
            <p className="tool-desc">Render a page at multiple breakpoints and flag content visible on desktop but hidden on mobile — detecting <code>display:none</code> / zero-size and Tailwind <code>hidden md:block</code> patterns. Categorizes each as likely-oversight vs intentional-decorative.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_tap_targets</h3>
            <p className="tool-desc">WCAG 2.5.5 / Apple 44pt web tap-target audit. Collects every interactive element and emits a per-element fix table for any below the minimum — selector, role, measured w/h, per-axis pixel deficit, and a concrete CSS fix, sorted worst-first.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_typography</h3>
            <p className="tool-desc">Typographic-scale report over rendered DOM text. Detects the dominant modular-scale ratio, flags off-scale sizes, checks line-height consistency against the body rhythm, and flags weight ladders with &gt;4 weights or non-standard values.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_content</h3>
            <p className="tool-desc">Per-item content evaluation for UX writing. Each item (heading/prose/cta/label/caption/metric) returns a pass/warn/fail verdict with the matched principle, concrete issues, and a before→after rewrite — metrics need a number+unit, CTAs stay action-led ≤4 words, prose loses passive voice, jargon, and hedging.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_asset_integrity</h3>
            <p className="tool-desc">Given PNG file paths, measures per-pixel luminance variance in the bottom strip and flags high-variance rows as <code>likely-sliced</code> — catching content cut off inside a correctly-sized export that dimension checks cannot detect.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_device_frame</h3>
            <p className="tool-desc">Flags content cropped inside a device-mockup frame: <code>object-fit:cover</code> aspect-ratio crop loss (names the cropped edges and hidden fraction), baked-in pan/zoom (Ken Burns) drift via block-matched displacement, and content truncated at a frame edge. Catches a 16:9 clip silently sliced inside a ~1.82-aspect screen cutout.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_ios_a11y</h3>
            <p className="tool-desc">Score an accessibility-enriched iOS snapshot — missing <code>accessibilityLabel</code>/value/traits on interactive elements, sub-44pt targets, per-text WCAG contrast, Dynamic-Type clipping, and VoiceOver reading order. Returns grade, score, errors, warnings, and <code>voiceover_order</code>.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_parity</h3>
            <p className="tool-desc">Compare an iOS element snapshot to an Android one against a checklist of named spatial relationships (vertically-centered, baseline-aligned, equal-gap, equal-size, present…) and return per-relation match / mismatch / uncertain with measured deltas — catching cross-platform drift past device-verified parity claims.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_contract</h3>
            <p className="tool-desc">Verify a wire contract (ordered token list / field set / <code>schemaVersion</code>) is identical across N source files — iOS Swift, proxy JS, Android Kotlin. Flags tokens missing in some layers, schemaVersion drift, and the prefix-ordering bug that silently corrupts directive parsing. Returns a per-layer report + BLOCK/PASS verdict.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>audit_api_contract</h3>
            <p className="tool-desc">Run adversarial queries against a live endpoint and return a per-query verdict — shape-valid / shape-invalid / confident-wrong / uncertain — against an expected shape schema plus per-query contains/equals expectations. Catches responses that pass shape but are wrong.</p>
          </div>
      
          <h3>Reflection &amp; Registration</h3>
      
          <div className="tool-card reveal">
            <h3>raven_reflect</h3>
            <p className="tool-desc">Summarize your local Raven usage log over the last N days — tool counts, recurring audit warnings (likely knowledge gaps), patterns requested most, design systems reached for. Reads only <code>~/.raven/usage.jsonl</code> locally. Never fetches.</p>
          </div>
      
          <div className="tool-card reveal">
            <h3>raven_register</h3>
            <p className="tool-desc">Register an email to receive release updates from the Raven team. One email per minor/major release — patches stay silent.</p>
          </div>
      
          {/* ── Examples ── */}
          <h2 id="examples" className="reveal">Examples</h2>
          <p>You don't need to call tools directly. Say what you are building or checking, and Claude can call the relevant Raven tool.</p>
      
          <h3>Build a pricing page with Raven guidance</h3>
          <pre><code>"Build me a pricing page with 3 tiers for a developer tool.
       Use Stripe's design tokens."</code></pre>
          <p>Raven can call <code>get_pattern("pricing-page")</code>, <code>get_principles("pricing page")</code>, and <code>get_design_system("stripe")</code>; Claude then builds from those returned rules and tokens.</p>
      
          <h3>Evaluate an existing design</h3>
          <pre><code>"This signup form has 8 fields including phone number and company
       size. No social login. The submit button says 'Submit'. No inline
       validation. Evaluate it for conversion and usability."</code></pre>
          <p>Raven calls <code>evaluate_design</code> and returns matched principles, likely violations, and specific fixes.</p>
      
          <h3>Pre-launch checklist</h3>
          <pre><code>"Give me a pre-launch checklist for this mobile landing page"</code></pre>
          <p>Returns a categorized checklist covering the pattern's requirements, accessibility, and platform-specific items.</p>
      
          <h3>Compose a custom design system</h3>
          <pre><code>"Create a design system that uses Linear's color palette
       with Stripe's typography and spacing"</code></pre>
          <p>Raven calls <code>compose_system</code> to merge tokens from both systems into one set, output as CSS variables or W3C DTCG format.</p>
      
          <h3>Generate a complete design system</h3>
          <pre><code>"Generate a bold design system for my startup called NightOwl.
       Brand color is #8B5CF6. Export as HTML so I can share it."</code></pre>
          <p>Raven calls <code>generate_design_system</code> to create a token set — colors, typography, spacing, radius, elevation, motion — and exports a self-contained HTML documentation page you can open in a browser or print to PDF.</p>
      
          <h3>Search across everything</h3>
          <pre><code>"What does Raven know about color contrast?"</code></pre>
          <p>Searches all 129 principles, 22 patterns, 5 business strategy domains, content voice systems, research methods, service patterns, and brand principles for relevant guidance.</p>
      
          {/* ── Data Structure ── */}
          <h2 id="data" className="reveal">Data Structure</h2>
          <p>All knowledge lives in <code>src/data/</code> as static JSON files. No database, no API calls, no latency.</p>
      
          <pre><code>src/data/
        principles/          # 129 principles across 10 files
          nielsen-heuristics.json   laws-of-ux.json
          gestalt.json              accessibility.json
          typography.json           color-theory.json
          mobile-ux.json            d4d.json
          responsive-layout.json    component-architecture.json
      
        patterns/            # 13 UI patterns
          signup-flow.json          pricing-page.json
          navigation.json           forms.json
          landing-page.json         dashboard.json
          modals-dialogs.json       empty-states.json
          error-states.json         loading-states.json
          cta.json                  social-proof.json
          mobile-conversion.json
      
        business/            # 5 strategy domains
          monetization.json  retention.json  onboarding.json
          growth.json        metrics.json
      
        tokens/              # 12 design system tokens
          registry.json
          systems/stripe.json, linear.json, vercel.json, …
      
        content/             # v1.2 — content design systems
          systems/           # 4 brand voice guides (Mailchimp, GOV.UK,
                             #   Polaris, Atlassian)
          principles/        # 11 UX-writing principles
          patterns/          # 4 content patterns (errors, empty states,
                             #   notifications, form validation)
      
        research/            # v1.3 — research &amp; data analysis
          principles/        # 11 research fundamentals
          methods/           # qualitative, quantitative, usability
          frameworks/        # HEART, AARRR, North Star, funnel, RICE, OKRs
      
        service-design/      # v1.3 — service design
          principles/        # Stickdorn, Shostack, moments of truth,
                             #   peak-end, handoff, human help
          patterns/          # blueprinting, handoff, signup-as-service,
                             #   omnichannel, moments of truth
          frameworks/        # GOV.UK Service Standard (14 points)
      
        brand/               # v1.3 — brand &amp; visual design
          principles/        # logo, gradient, imagery, hierarchy, system
          trends/            # 2026-current-trends.json</code></pre>
      
          {/* ── Design Tokens ── */}
          <h2 id="tokens" className="reveal">Design Tokens</h2>
          <p>Tokens follow the <a href="https://tr.designtokens.org/format/">W3C Design Tokens Community Group (DTCG)</a> format. Each token has:</p>
          <ul>
            <li><code>$value</code> — the token value</li>
            <li><code>$type</code> — color, dimension, fontFamily, fontWeight, number, etc.</li>
            <li><code>$description</code> — what the token is for</li>
          </ul>
      
          <h3>Output formats</h3>
          <p>Request tokens in three formats:</p>
      
          <pre><code>// W3C DTCG (default) — standards-compliant JSON
      get_design_system({'{'} id: "stripe", format: "dtcg" {'}'})
      
      // CSS Custom Properties — drop into your stylesheet
      get_design_system({'{'} id: "stripe", format: "css" {'}'})
      // Output: :root {'{'} --stripe-color-primary: #635bff; ... {'}'}
      
      // Flat — simple key-value pairs
      get_design_system({'{'} id: "stripe", format: "flat" {'}'})
      // Output: [{'{'} path: "color.primary", value: "#635bff", type: "color" {'}'}]</code></pre>
      
          <h3>Available systems</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 'var(--space-6)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left' }}>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-primary)', fontSize: '14px' }}>System</th>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-primary)', fontSize: '14px' }}>ID</th>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-primary)', fontSize: '14px' }}>Status</th>
                <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--text-primary)', fontSize: '14px' }}>Token groups</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: '15px' }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>Stripe</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>stripe</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--accent-green)' }}>Live</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>color, typography, spacing, radius, elevation, motion</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>Linear</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>linear</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--accent-green)' }}>Live</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>color, typography, spacing, radius, elevation, motion</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>Vercel</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>vercel</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--accent-orange)' }}>Planned</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>—</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>Tailwind</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>tailwind</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--accent-orange)' }}>Planned</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>—</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>Radix</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>radix</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--accent-orange)' }}>Planned</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>—</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>shadcn/ui</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>shadcn</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--accent-orange)' }}>Planned</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>—</td>
              </tr>
              <tr>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>Material Design 3</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}><code>material</code></td>
                <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--accent-orange)' }}>Planned</td>
                <td style={{ padding: 'var(--space-2) var(--space-3)' }}>—</td>
              </tr>
            </tbody>
          </table>
      
          {/* ── FAQ ── */}
          <h2 id="faq" className="reveal">FAQ</h2>
      
          <h3>Does Raven make API calls?</h3>
          <p>No. All data is bundled locally in the npm package. No external API calls, no latency, no auth tokens needed. It's 272KB of curated JSON that runs on your machine.</p>
      
          <h3>Does it work with other AI coding tools?</h3>
          <p>Raven works with any MCP-compatible client. Claude Code and Claude Desktop have native MCP support. Other tools are adding MCP support — check your client's documentation.</p>
      
          <h3>Can I add my own design system tokens?</h3>
          <p>Yes. Add a JSON file to <code>src/data/tokens/systems/</code> following the W3C DTCG format, and register it in <code>registry.json</code>. See <code>stripe.json</code> as a reference.</p>
      
          <h3>Can I add custom principles or patterns?</h3>
          <p>Yes. Add JSON files to <code>src/data/principles/</code> or <code>src/data/patterns/</code>. Follow the existing file structure. Raven loads all JSON files in those directories automatically.</p>
      
          <h3>How do I update?</h3>
          <pre><code>npm update -g raven-mcp</code></pre>
      
          <h3>Where does the knowledge come from?</h3>
          <p>129 principles curated from Nielsen Norman Group, Laws of UX, Gestalt psychology, WCAG 2.2, typography and color theory, mobile UX (touch targets, nav consistency, font sizing), responsive layout, component architecture, UX writing (Mailchimp, GOV.UK), research fundamentals, service design (Stickdorn, Shostack, Carlzon's moments of truth, GOV.UK Service Standard), and brand systems (Pentagram, Brand New, public brand guidelines from Stripe, Airbnb, Linear, Vercel). 22 patterns based on conversion research, service-design practice, and copy-design evidence. Design tokens extracted from public-facing design systems. Metrics frameworks from Google, Amplitude, Dave McClure, and Intercom.</p>
      
          </div>
        </div>
      <DocsScripts />
    </>
  )
}
