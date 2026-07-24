import HomeScripts from '@/components/HomeScripts'
import ToolsSection from "@/components/tools/ToolsSection";
import HeroGrid from '@/components/HeroGrid'
import BeforeAfter from '@/components/BeforeAfter'

export default function Home() {
  return (
    <>
      {/* NAV (shared component) */}
      <main id="main">

        {/* Full-site interactive backdrop — fixed canvas behind all content.
            Rendered outside .hero so its z-index:-1 isn't trapped by the
            hero's overflow:hidden / .reveal transform stacking contexts. */}
        <HeroGrid />

        {/* HERO */}
        <section className="hero">
          <div className="glow glow-1"></div>
          <div className="glow glow-2"></div>
          <div className="glow glow-3"></div>
          <div className="container">
            <h1 className="reveal reveal-delay-1"><span className="line-glow">Pair-design</span><span className="line-accent">with your coding agent</span></h1>
            <p className="subtitle reveal reveal-delay-2">Raven is an open-source MCP server. Click any element on your running page, edit its tokens and styles with real controls, and package the change for your agent &mdash; backed by audits that name the broken design rule and return the fix with evidence.</p>
            <div className="hero-cta reveal reveal-delay-3">
              <button className="cta-install" aria-label="Copy install command to clipboard" data-copy="claude mcp add raven -- npx -y raven-mcp">
                <span className="copy-label">claude mcp add raven -- npx -y raven-mcp</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5" /><path d="M2 10V3a1 1 0 011-1h7" /></svg>
              </button>
            </div>
      {/* Live install stats — three-card row with big numbers + monospace labels */}
            <div className="raven-stats-row reveal reveal-delay-3" aria-live="polite">
              <div className="raven-stat-card">
                <div className="raven-stat-num" id="rs-ver">v—</div>
                <div className="raven-stat-label">Latest</div>
              </div>
              <div className="raven-stat-card">
                <div className="raven-stat-num" id="rs-rel">—</div>
                <div className="raven-stat-label">Releases</div>
              </div>
              <div className="raven-stat-card">
                <div className="raven-stat-num" id="rs-dl">—</div>
                <div className="raven-stat-label">Installs</div>
              </div>
            </div>



          </div>
        </section>

        {/* RAVEN DESIGN — the playground, live */}
        <section id="raven-design" className="raven-design">
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">Select an element. Edit its tokens and styles.</h2>
              <p className="subtitle reveal reveal-delay-2">Edits land on the page as you make them, then get packaged for your agent.</p>
            </div>

            <div className="pg-demo-cta reveal">
              <a href="/raven-design" className="btn btn-primary">Try the playground</a>
            </div>

            <figure className="ba-featured pg-demo reveal">
              <video
                src="/playground-demo.mp4"
                poster="/playground-demo-poster.jpg"
                autoPlay
                muted
                loop
                playsInline
                aria-label="Screen recording of Raven Design editing the Northstar Workspace: configuring a reusable component, reordering a layer, preparing an agent change, then selecting a heading and typing a mobile instruction."
              />
            </figure>
          </div>
        </section>

        <section id="before-after" className="raven-design">
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">Without Raven, and with it.</h2>
              <p className="subtitle reveal reveal-delay-2">Each pair is a real brief before Raven and after it &mdash; a fresh build, a rebuild, and a taste-profile pass.</p>
            </div>

            <div className="ba-featured reveal">
              <BeforeAfter
                beforeSrc="/raven-design-before-after/with-without-before.png"
                beforeAlt="A landscape-architecture brief built without Raven — a dense illustrated hero with full navigation and a thermal-model data card."
                afterSrc="/raven-design-before-after/fogline-scroll-after.png"
                afterAlt="The same brief built with Raven — a fog-wrapped coastal house under the serif headline 'Where the fog line ends, the garden begins.'"
                caption="A landscape-architecture brief, without Raven and with it."
                aspectRatio="2050 / 1126"
              />
            </div>

            <div className="ba-grid">
              <div className="reveal">
                <BeforeAfter
                  beforeSrc="/raven-design-before-after/oddlot-before.png"
                  beforeAlt="Oddlot v1 editorial page."
                  afterSrc="/raven-design-before-after/oddlot-after.png"
                  afterAlt="Oddlot v2 3D workshop rebuild."
                  caption="Oddlot — the v1 page and the v2 rebuild."
                  aspectRatio="16 / 10"
                />
              </div>
              <div className="reveal reveal-delay-1">
                <BeforeAfter
                  beforeSrc="/raven-design-before-after/nexus-before.png"
                  beforeAlt="Nexus product page before applying the bound taste profile."
                  afterSrc="/raven-design-before-after/nexus-after.png"
                  afterAlt="Nexus product page rebuilt under the bound taste profile."
                  caption="Nexus — a generic AI page, rebuilt under a bound taste profile."
                  aspectRatio="16 / 10"
                />
              </div>
            </div>
          </div>
        </section>

        <section id="judge" className="judge">
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">Turn your taste into audit rules</h2>
              <p className="subtitle reveal reveal-delay-2">Raven asks how a project should look and sound, stores that surface profile locally, then <code>audit_taste</code> returns BLOCK/WARN/PASS findings with rule IDs and evidence.</p>
            </div>

            <div className="recipe reveal">
              <div className="lifecycle-step">
                <p className="step-label"><span className="step-num">01</span> Calibrate</p>
                <div className="terminal">
                  <div className="terminal-header">
                    <span className="terminal-dot"></span>
                    <span className="terminal-dot"></span>
                    <span className="terminal-dot"></span>
                    <span className="terminal-title">get_taste_interview &mdash; fieldnotes</span>
                  </div>
                  <div className="static-term-body">
                    <pre data-taste-quote aria-label="Recorded get_taste_interview output starting a calibration interview" dangerouslySetInnerHTML={{ __html: `<span class="g">$</span> get_taste_interview <span class="k">profile</span>:<span class="v">'andrew'</span> <span class="k">project</span>:<span class="v">'fieldnotes'</span>

  <span class="k">existing_binding</span>  <span class="v">null</span>   <span class="c">— new surface, calibration starts</span>

  · <span class="k">identity</span>     what is fieldnotes, in a phrase — and what
                 family: portfolio, product site, docs, app UI?
  · <span class="k">references</span>   links you want this surface to sit near
  · <span class="k">typography</span>   editorial serif / neutral sans / mono-forward
  · <span class="k">motion</span>       none / restrained reveals / choreographed
  · <span class="k">voice</span>        pick a register by ear — three samples given

  <span class="c">12 dimensions · blocking — answers land before design work</span>` }} />
                  </div>
                </div>
              </div>

              <div className="lifecycle-step">
                <p className="step-label"><span className="step-num">02</span> Audit</p>
                <div className="terminal">
                  <div className="terminal-header">
                    <span className="terminal-dot"></span>
                    <span className="terminal-dot"></span>
                    <span className="terminal-dot"></span>
                    <span className="terminal-title">audit_taste &mdash; raven-mcp</span>
                  </div>
                  <div className="static-term-body">
                    <pre data-taste-quote aria-label="Recorded audit_taste output showing a BLOCK verdict" dangerouslySetInnerHTML={{ __html: `<span class="g">$</span> audit_taste <span class="k">project</span>:<span class="v">'raven-mcp'</span>

  <span class="k">verdict</span>       <span class="block">BLOCK</span>
  <span class="k">verdict_line</span>  2 blocking findings — fix before ship.

  <span class="k">findings</span>
    · <span class="v">voice-no-hype</span>   "make every screen better"   <span class="c">→ name the check performed</span>
    · <span class="v">voice-no-hype</span>   "built for modern teams"     <span class="c">→ name the user and task</span>

  <span class="k">suppressed</span>             1   <span class="c">accepted precedent</span>
  <span class="k">not_assessed</span>           1   <span class="c">clause needs a live capture</span>
  <span class="k">quoted_evidence_exempt</span> <span class="c">{ elements: 1, chars: 512 }</span>` }} />
                  </div>
                </div>
              </div>

              <div className="lifecycle-step">
                <p className="step-label"><span className="step-num">03</span> Kick off</p>
                <div className="terminal">
                  <div className="terminal-header">
                    <span className="terminal-dot"></span>
                    <span className="terminal-dot"></span>
                    <span className="terminal-dot"></span>
                    <span className="terminal-title">bind_taste_surface &mdash; fieldnotes</span>
                  </div>
                  <div className="static-term-body">
                    <pre data-taste-quote aria-label="Recorded bind_taste_surface output binding a new project surface" dangerouslySetInnerHTML={{ __html: `<span class="g">$</span> bind_taste_surface <span class="k">surface</span>:<span class="v">'fieldnotes'</span> <span class="k">profile</span>:<span class="v">'andrew'</span>

  <span class="k">bound</span>          fieldnotes — docs · hosts: fieldnotes.dev

  <span class="k">design_notes</span>   typography   editorial serif, wide measure
                 color        near-monochrome, one accent
                 motion       none — pages arrive settled
  <span class="k">overrides</span>      voice-no-hype → strict
  <span class="k">references</span>     2 captured, with what to keep from each

  <span class="c">design_notes are acceptance criteria — echoed in every</span>
  <span class="c">audit_taste project:'fieldnotes' from here on</span>` }} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        <section id="cinematic" className="cinematic">
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">A recipe that names its price</h2>
              <p className="subtitle reveal reveal-delay-2">When a surface's taste calls for an AI-generated video hero, Raven returns the build recipe&mdash;and the recipe declares its paid dependency before your agent spends anything.</p>
            </div>

            <div className="recipe reveal">
              <div className="terminal">
                <div className="terminal-header">
                  <span className="terminal-dot"></span>
                  <span className="terminal-dot"></span>
                  <span className="terminal-dot"></span>
                  <span className="terminal-title">build_hint &mdash; ai-video-hero</span>
                </div>
                <div className="static-term-body">
                  <pre data-taste-quote aria-label="Recorded build_hint recipe for an AI-generated video hero" dangerouslySetInnerHTML={{ __html: `<span class="k">build_hint</span>: <span class="v">ai-video-hero</span>
  <span class="k">technique</span>    AI-generated video hero over a poster frame
  <span class="k">chain</span>        one hero still → short clips around one
               consistent subject → reserve 4K for a single
               final shot, then web-compress; autoplay muted + inline
  <span class="k">depends_on</span>   Higgsfield MCP (Seedance model) <span class="c">&mdash; paid, external</span>
  <span class="k">cost</span>         confirm the spend with the user before running
  <span class="k">fallback</span>     still photography or licensed film, agreed first
  <span class="block">never</span>        a surface that opted out of AI → no paid tool` }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* KNOWLEDGE LAYERS */}
        <section id="layers" className="layers">
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">Nine layers, one MCP server</h2>
              <p className="subtitle reveal reveal-delay-2">Raven exposes principles, UI patterns, content voice, research methods, service blueprints, strategy frameworks, design tokens, and audit tools as MCP calls.</p>
            </div>

            <div className="layers-grid">
              <div className="glow-card layer-card reveal">
                <div className="layer-icon blue">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="M11 7v4l3 2" /></svg>
                </div>
                <div className="stat">129</div>
                <div className="stat-label">Design principles</div>
                <h3>Principles</h3>
                <p><a href="https://www.nngroup.com/articles/ten-usability-heuristics/" target="_blank" rel="noopener noreferrer">Nielsen's Heuristics</a>, <a href="https://lawsofux.com/" target="_blank" rel="noopener noreferrer">Laws of UX</a>, Gestalt, <a href="https://www.w3.org/WAI/standards-guidelines/wcag/" target="_blank" rel="noopener noreferrer">WCAG accessibility</a>, typography, color theory, mobile UX, responsive layout, and D4D&mdash;with violations and checklists.</p>
                <div className="layer-tags">
                  <span className="tag">Accessibility</span>
                  <span className="tag">Nielsen</span>
                  <span className="tag">Gestalt</span>
                  <span className="tag">Laws of UX</span>
                  <span className="tag">Mobile UX</span>
                  <span className="tag">Responsive</span>
                </div>
              </div>

              <div className="glow-card layer-card card-raised reveal reveal-delay-1">
                <div className="layer-icon cyan">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="13" y="3" width="6" height="6" rx="1.5" /><rect x="3" y="13" width="6" height="6" rx="1.5" /><rect x="13" y="13" width="6" height="6" rx="1.5" /></svg>
                </div>
                <div className="stat">22</div>
                <div className="stat-label">Pattern libraries</div>
                <h3>Patterns</h3>
                <p>Field-tested UI patterns for signup, pricing, dashboards, forms, navigation, CTAs&mdash;plus content patterns (errors, empty states, notifications) and service patterns (blueprinting, handoff).</p>
                <div className="layer-tags">
                  <span className="tag">Landing Pages</span>
                  <span className="tag">Pricing</span>
                  <span className="tag">Forms</span>
                  <span className="tag">Handoff</span>
                </div>
              </div>

              <div className="glow-card layer-card reveal reveal-delay-2">
                <div className="layer-icon accent">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 5h14M4 10h10M4 15h12" /></svg>
                </div>
                <div className="stat">4</div>
                <div className="stat-label">Brand voice systems</div>
                <h3>Content Systems</h3>
                <p>Voice &amp; tone from Mailchimp, GOV.UK, Shopify Polaris, and Atlassian. Plus eleven UX-writing principles and content patterns for errors, empty states, notifications, and form validation.</p>
                <div className="layer-tags">
                  <span className="tag">Mailchimp</span>
                  <span className="tag">GOV.UK</span>
                  <span className="tag">Polaris</span>
                  <span className="tag">Atlassian</span>
                </div>
              </div>

              <div className="glow-card layer-card reveal">
                <div className="layer-icon accent">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5l4 4" /></svg>
                </div>
                <div className="stat">6</div>
                <div className="stat-label">Metrics frameworks</div>
                <h3>Research &amp; Data</h3>
                <p>Qualitative, quantitative, and usability methods with protocols, sample-size guidance, and bias traps. Metrics frameworks: HEART, AARRR, North Star, conversion funnel, RICE, OKRs.</p>
                <div className="layer-tags">
                  <span className="tag">HEART</span>
                  <span className="tag">AARRR</span>
                  <span className="tag">Usability</span>
                  <span className="tag">A/B Tests</span>
                </div>
              </div>

              <div className="glow-card layer-card card-raised reveal reveal-delay-1">
                <div className="layer-icon green">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 6h7M3 11h10M3 16h8" /><path d="M15 6h4v10h-4z" /></svg>
                </div>
                <div className="stat">14</div>
                <div className="stat-label">GOV.UK standard</div>
                <h3>Service Design</h3>
                <p>Stickdorn, Shostack, moments of truth, peak-end, human-handoff patterns. Plus an HTML service-blueprint generator with two-actor (HI-loop) mode for customer&#x2194;lawyer, patient&#x2194;doctor flows.</p>
                <div className="layer-tags">
                  <span className="tag">Blueprinting</span>
                  <span className="tag">Handoff</span>
                  <span className="tag">HI-loop</span>
                  <span className="tag">GOV.UK</span>
                </div>
              </div>

              <div className="glow-card layer-card reveal reveal-delay-2">
                <div className="layer-icon accent">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><circle cx="11" cy="11" r="3" /></svg>
                </div>
                <div className="stat">7</div>
                <div className="stat-label">2026 visual trends</div>
                <h3>Brand &amp; Visual</h3>
                <p>Logo usage, gradient systems, imagery, visual hierarchy, brand-as-system thinking&mdash;plus a time-stamped 2026 trends file (bento grids, monospace for tone, neon-on-glass, brutalism rebound).</p>
                <div className="layer-tags">
                  <span className="tag">Logo</span>
                  <span className="tag">Gradient</span>
                  <span className="tag">Imagery</span>
                  <span className="tag">2026 Trends</span>
                </div>
              </div>

              <div className="glow-card layer-card reveal">
                <div className="layer-icon green">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 16l5-5 4 4 7-7" /><path d="M14 8h5v5" /></svg>
                </div>
                <div className="stat">5</div>
                <div className="stat-label">Strategy domains</div>
                <h3>Business Strategy</h3>
                <p>Monetization, retention, onboarding, growth, and metrics&mdash;the business context that shapes every design decision.</p>
                <div className="layer-tags">
                  <span className="tag">Monetization</span>
                  <span className="tag">Retention</span>
                  <span className="tag">Growth</span>
                  <span className="tag">Metrics</span>
                </div>
              </div>

              <div className="glow-card layer-card card-raised reveal reveal-delay-1">
                <div className="layer-icon accent">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="16" height="16" rx="2" /><path d="M7 8h8M7 11h5M7 14h7" /></svg>
                </div>
                <div className="stat">12</div>
                <div className="stat-label">Design systems</div>
                <h3>Tokens</h3>
                <p>Production design system tokens in W3C DTCG format. Compose tokens across systems, export as CSS variables, Figma Variables, or JSON. Generate custom systems from a brand color.</p>
                <div className="layer-tags">
                  <span className="tag">Stripe</span>
                  <span className="tag">Linear</span>
                  <span className="tag">DTCG</span>
                  <span className="tag">Figma</span>
                </div>
              </div>

              <div className="glow-card layer-card reveal reveal-delay-2">
                <div className="layer-icon blue">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="9" cy="9" r="6" /><path d="M13.5 13.5l4 4" /><path d="M6.5 9l2 2 4-4" /></svg>
                </div>
                <div className="stat">20</div>
                <div className="stat-label">Audit tools</div>
                <h3>Render &amp; Audit</h3>
                <p>Render any live URL or screen and grade it&mdash;contrast, typography, tap targets, responsive visibility, asset integrity. Native SwiftUI and React Native, plus parity and API-contract checks.</p>
                <div className="layer-tags">
                  <span className="tag">Web</span>
                  <span className="tag">SwiftUI</span>
                  <span className="tag">Contrast</span>
                  <span className="tag">Parity</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TOOLS */}
        <ToolsSection />

        {/* WATCH IT WORK — MacBook feature grid */}
        <section id="watch" className="watch-section" style={{ padding: 'clamp(80px, 9vw, 144px) 0' }}>
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">No Figma file. No designer.</h2>
              <p className="subtitle reveal reveal-delay-2">One prompt builds a real SwiftUI app&mdash;then Raven audits every screen against 73 principles and 13 patterns, flags the issues, and guides the fixes. Recorded live on the iPhone 17 Pro simulator.</p>
            </div>
          </div>

          <div className="watch-rows">
              <div className="watch-row reveal">
                <div className="watch-text">
                  <span className="wc-tool">get_principles &middot; evaluate_design</span>
                  <h3>Build from a prompt, design-guided</h3>
                  <p>A single prompt scaffolds a full SwiftUI app&mdash;Raven's principles steer layout, color, and type from the first line of code.</p>
                </div>
                <div className="watch-media">
                  <div className="mb">
                    <div className="mb-lid"><div className="mb-bezel"><div className="mb-screen">
                      <video className="watch-video" muted loop playsInline preload="none" poster="assets/video/clips/01-build.jpg" data-mp4="assets/video/clips/01-build.mp4" aria-label="Claude Code scaffolding a SwiftUI fitness app from a prompt with Raven design guidance"></video>
                      <div className="mb-gloss"></div><div className="mb-notch"></div>
                    </div></div></div>
                    <div className="mb-hinge"><div className="mb-groove"></div></div>
                  </div>
                </div>
              </div>

              <div className="watch-row reveal">
                <div className="watch-text">
                  <span className="wc-tool">get_design_system &middot; get_pattern</span>
                  <h3>Design system applied, not guessed</h3>
                  <p>Activity rings, KPI cards, dark-theme elevation&mdash;every choice traced to a principle: 44px targets, 60/30/10 color, Miller's Law.</p>
                </div>
                <div className="watch-media">
                  <div className="mb">
                    <div className="mb-lid"><div className="mb-bezel"><div className="mb-screen">
                      <video className="watch-video" muted loop playsInline preload="none" poster="assets/video/clips/02-layout.jpg" data-mp4="assets/video/clips/02-layout.mp4" aria-label="The built home screen with activity rings and KPI cards, with Raven's applied principles listed"></video>
                      <div className="mb-gloss"></div><div className="mb-notch"></div>
                    </div></div></div>
                    <div className="mb-hinge"><div className="mb-groove"></div></div>
                  </div>
                </div>
              </div>

              <div className="watch-row reveal">
                <div className="watch-text">
                  <span className="wc-tool">audit_ios_screen &middot; audit_screen</span>
                  <h3>Real screens, audited live</h3>
                  <p>The Workouts tab built and verified end-to-end&mdash;progressive disclosure, smart defaults, and 44pt targets checked against the HIG.</p>
                </div>
                <div className="watch-media">
                  <div className="mb">
                    <div className="mb-lid"><div className="mb-bezel"><div className="mb-screen">
                      <video className="watch-video" muted loop playsInline preload="none" poster="assets/video/clips/03-screen.jpg" data-mp4="assets/video/clips/03-screen.mp4" aria-label="The Workouts screen built and verified end to end"></video>
                      <div className="mb-gloss"></div><div className="mb-notch"></div>
                    </div></div></div>
                    <div className="mb-hinge"><div className="mb-groove"></div></div>
                  </div>
                </div>
              </div>

              <div className="watch-row reveal">
                <div className="watch-text">
                  <span className="wc-tool">get_pattern &middot; audit_typography</span>
                  <h3>Patterns with checklists</h3>
                  <p>Need a dashboard or streak system? Raven returns the relevant pattern, its do's and don'ts, and the research notes before a pixel is drawn.</p>
                </div>
                <div className="watch-media">
                  <div className="mb">
                    <div className="mb-lid"><div className="mb-bezel"><div className="mb-screen">
                      <video className="watch-video" muted loop playsInline preload="none" poster="assets/video/clips/04-pattern.jpg" data-mp4="assets/video/clips/04-pattern.mp4" aria-label="An AI coach detail view alongside Raven returning a dashboard pattern"></video>
                      <div className="mb-gloss"></div><div className="mb-notch"></div>
                    </div></div></div>
                    <div className="mb-hinge"><div className="mb-groove"></div></div>
                  </div>
                </div>
              </div>

              <div className="watch-row reveal">
                <div className="watch-text">
                  <span className="wc-tool">audit_ios_a11y &middot; audit_contrast &middot; audit_tap_targets</span>
                  <h3>Accessibility checked after build</h3>
                  <p>Raven audits VoiceOver labels, Dynamic Type, contrast ratios, tap-target sizes, and per-screen scores after the UI exists.</p>
                </div>
                <div className="watch-media">
                  <div className="mb">
                    <div className="mb-lid"><div className="mb-bezel"><div className="mb-screen">
                      <video className="watch-video" muted loop playsInline preload="none" poster="assets/video/clips/05-a11y.jpg" data-mp4="assets/video/clips/05-a11y.mp4" aria-label="Raven running a full accessibility audit across the app's screens"></video>
                      <div className="mb-gloss"></div><div className="mb-notch"></div>
                    </div></div></div>
                    <div className="mb-hinge"><div className="mb-groove"></div></div>
                  </div>
                </div>
              </div>

              <div className="watch-row reveal">
                <div className="watch-text">
                  <span className="wc-tool">evaluate_design</span>
                  <h3>Evaluated against 73 principles</h3>
                  <p>The finished app scored against 73 principles and 13 patterns. Raven flags pure-black backgrounds, color-only indicators, and motion gaps&mdash;then fixes them.</p>
                </div>
                <div className="watch-media">
                  <div className="mb">
                    <div className="mb-lid"><div className="mb-bezel"><div className="mb-screen">
                      <video className="watch-video" muted loop playsInline preload="none" poster="assets/video/clips/06-evaluate.jpg" data-mp4="assets/video/clips/06-evaluate.mp4" aria-label="Raven evaluating the finished app against 73 principles and 13 patterns"></video>
                      <div className="mb-gloss"></div><div className="mb-notch"></div>
                    </div></div></div>
                    <div className="mb-hinge"><div className="mb-groove"></div></div>
                  </div>
                </div>
              </div>
            </div>
        </section>

        {/* EXAMPLES */}
        <section id="examples" className="examples-section" style={{ padding: 'clamp(80px, 9vw, 144px) 0' }}>
          <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">Example pages Raven can guide</h2>
              <p className="subtitle reveal reveal-delay-2">Six demo pages showing different Raven-guided prompts. They are examples, not customer proof.</p>
            </div>
            <div className="demo-showcase reveal reveal-delay-3" style={{ marginTop: '0', width: '100%' }}>
              <div className="demo-grid">
                <a href="/demos/law-firm.html" className="demo-card">
                  <div className="demo-card-thumb"><video className="demo-video" muted loop playsInline preload="none" poster="assets/video/demos/law-firm.jpg" data-mp4="assets/video/demos/law-firm.mp4" aria-label="Harrison &amp; Cole, a litigation-firm site built with Raven"></video></div>
                  <div className="demo-card-overlay">
                    <div className="demo-card-industry">Legal</div>
                    <div className="demo-card-name">Harrison &amp; Cole</div>
                    <div className="demo-card-desc">Full-service litigation firm</div>
                  </div>
                  <div className="demo-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h8M9 4l4 4-4 4" /></svg>
                  </div>
                </a>
                <a href="/demos/wedding.html" className="demo-card">
                  <div className="demo-card-thumb"><video className="demo-video" muted loop playsInline preload="none" poster="assets/video/demos/wedding.jpg" data-mp4="assets/video/demos/wedding.mp4" aria-label="Elara &amp; Co., a luxury wedding-planning site built with Raven"></video></div>
                  <div className="demo-card-overlay">
                    <div className="demo-card-industry">Wedding</div>
                    <div className="demo-card-name">Elara &amp; Co.</div>
                    <div className="demo-card-desc">Luxury wedding planning</div>
                  </div>
                  <div className="demo-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h8M9 4l4 4-4 4" /></svg>
                  </div>
                </a>
                <a href="/demos/coffee-shop.html" className="demo-card">
                  <div className="demo-card-thumb"><video className="demo-video" muted loop playsInline preload="none" poster="assets/video/demos/coffee-shop.jpg" data-mp4="assets/video/demos/coffee-shop.mp4" aria-label="Ember &amp; Grain, a specialty coffee-roaster site built with Raven"></video></div>
                  <div className="demo-card-overlay">
                    <div className="demo-card-industry">Food &amp; Beverage</div>
                    <div className="demo-card-name">Ember &amp; Grain</div>
                    <div className="demo-card-desc">Specialty coffee roaster</div>
                  </div>
                  <div className="demo-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h8M9 4l4 4-4 4" /></svg>
                  </div>
                </a>
                <a href="/demos/saas.html" className="demo-card">
                  <div className="demo-card-thumb"><video className="demo-video" muted loop playsInline preload="none" poster="assets/video/demos/saas.jpg" data-mp4="assets/video/demos/saas.mp4" aria-label="Flux, a real-time analytics SaaS site built with Raven"></video></div>
                  <div className="demo-card-overlay">
                    <div className="demo-card-industry">SaaS</div>
                    <div className="demo-card-name">Flux</div>
                    <div className="demo-card-desc">Real-time analytics platform</div>
                  </div>
                  <div className="demo-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h8M9 4l4 4-4 4" /></svg>
                  </div>
                </a>
                <a href="/demos/fitness.html" className="demo-card">
                  <div className="demo-card-thumb"><video className="demo-video" muted loop playsInline preload="none" poster="assets/video/demos/fitness.jpg" data-mp4="assets/video/demos/fitness.mp4" aria-label="FORGE, a performance training-studio site built with Raven"></video></div>
                  <div className="demo-card-overlay">
                    <div className="demo-card-industry">Fitness</div>
                    <div className="demo-card-name">FORGE</div>
                    <div className="demo-card-desc">Performance training studio</div>
                  </div>
                  <div className="demo-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h8M9 4l4 4-4 4" /></svg>
                  </div>
                </a>
                <a href="/demos/real-estate.html" className="demo-card">
                  <div className="demo-card-thumb"><video className="demo-video" muted loop playsInline preload="none" poster="assets/video/demos/real-estate.jpg" data-mp4="assets/video/demos/real-estate.mp4" aria-label="Oleander Residence, a luxury real-estate listing site built with Raven"></video></div>
                  <div className="demo-card-overlay">
                    <div className="demo-card-industry">Real Estate</div>
                    <div className="demo-card-name">Oleander Residence</div>
                    <div className="demo-card-desc">Estate listing concept</div>
                  </div>
                  <div className="demo-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h8M9 4l4 4-4 4" /></svg>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* DESIGN SYSTEMS */}
        <section id="systems" className="systems-section">
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">Twelve design-system token sets, queryable</h2>
              <p className="subtitle reveal reveal-delay-2">Ask for Apple HIG, Material, Stripe, Linear, Vercel, GitHub Primer, and more as W3C DTCG tokens or CSS variables.</p>
            </div>

            <div className="systems-grid">
              <div className="glow-card system-card reveal">
                <span className="system-status live"></span>
                <div className="system-name">Apple HIG</div>
                <div className="system-category">Platform</div>
                <div className="system-tags"><span>iOS</span><span>macOS</span><span>premium</span></div>
              </div>
              <div className="glow-card system-card card-raised reveal reveal-delay-1">
                <span className="system-status live"></span>
                <div className="system-name">Material Design 3</div>
                <div className="system-category">Platform</div>
                <div className="system-tags"><span>Android</span><span>dynamic-color</span></div>
              </div>
              <div className="glow-card system-card reveal reveal-delay-2">
                <span className="system-status live"></span>
                <div className="system-name">Stripe</div>
                <div className="system-category">Fintech</div>
                <div className="system-tags"><span>professional</span><span>clean</span></div>
              </div>
              <div className="glow-card system-card reveal reveal-delay-3">
                <span className="system-status live"></span>
                <div className="system-name">Linear</div>
                <div className="system-category">Productivity</div>
                <div className="system-tags"><span>dark</span><span>minimal</span></div>
              </div>
              <div className="glow-card system-card card-raised reveal">
                <span className="system-status live"></span>
                <div className="system-name">Airbnb</div>
                <div className="system-category">Consumer</div>
                <div className="system-tags"><span>warm</span><span>trustworthy</span></div>
              </div>
              <div className="glow-card system-card reveal reveal-delay-1">
                <span className="system-status live"></span>
                <div className="system-name">Spotify</div>
                <div className="system-category">Consumer</div>
                <div className="system-tags"><span>dark</span><span>vibrant</span></div>
              </div>
              <div className="glow-card system-card reveal reveal-delay-2">
                <span className="system-status live"></span>
                <div className="system-name">Vercel</div>
                <div className="system-category">Developer</div>
                <div className="system-tags"><span>monochrome</span><span>minimal</span></div>
              </div>
              <div className="glow-card system-card card-raised reveal reveal-delay-3">
                <span className="system-status live"></span>
                <div className="system-name">GitHub Primer</div>
                <div className="system-category">Developer</div>
                <div className="system-tags"><span>enterprise</span><span>accessible</span></div>
              </div>
              <div className="glow-card system-card reveal">
                <span className="system-status live"></span>
                <div className="system-name">Notion</div>
                <div className="system-category">Productivity</div>
                <div className="system-tags"><span>warm</span><span>content-first</span></div>
              </div>
              <div className="glow-card system-card reveal reveal-delay-1">
                <span className="system-status live"></span>
                <div className="system-name">shadcn/ui</div>
                <div className="system-category">Component Library</div>
                <div className="system-tags"><span>tailwind</span><span>radix</span></div>
              </div>
              <div className="glow-card system-card card-raised reveal reveal-delay-2">
                <span className="system-status live"></span>
                <div className="system-name">Tailwind CSS</div>
                <div className="system-category">Framework</div>
                <div className="system-tags"><span>utility-first</span><span>comprehensive</span></div>
              </div>
              <div className="glow-card system-card reveal reveal-delay-3">
                <span className="system-status live"></span>
                <div className="system-name">Supabase</div>
                <div className="system-category">Developer</div>
                <div className="system-tags"><span>dark</span><span>green-accent</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* MYTHOLOGY — the brand story */}
        <section id="story" className="mythology-section">
          <div className="container">
            <div className="mythology-inner">
              <div className="mythology-text reveal">
                <h2>Named for the creature that bridges worlds</h2>
                <p>Across Norse, Celtic, and Native American traditions, the raven carries knowledge from hidden places and brings it into the light.</p>
                <p>Odin's ravens Huginn and Muninn&mdash;Thought and Memory&mdash;fly across all nine realms at dawn and return to whisper everything they've seen. The Morr&iacute;gan takes raven form to decide fate. Y&eacute;il stole the sun from darkness and gave it to everyone.</p>
                <p style={{ color: 'var(--text-accent)', fontWeight: '500' }}>Raven MCP: principles, tokens, audits, and taste rules exposed as tools your coding agent can call.</p>
              </div>
              <div className="mythology-visual reveal reveal-delay-2">
                <img src="assets/raven-logo.png" alt="Raven" />
              </div>
            </div>

            <div className="mythology-realms">
              <div className="glow-card realm reveal">
                <div className="realm-tradition">Norse</div>
                <h4>Huginn &amp; Muninn</h4>
                <p>Thought &amp; Memory&mdash;Odin's ravens that fly across all nine realms and return with knowledge</p>
              </div>
              <div className="glow-card card-raised realm reveal reveal-delay-1">
                <div className="realm-tradition">Celtic</div>
                <h4>The Morr&iacute;gan</h4>
                <p>Sovereignty &amp; Prophecy&mdash;the triple goddess who takes raven form to decide fate</p>
              </div>
              <div className="glow-card realm reveal reveal-delay-2">
                <div className="realm-tradition">Tlingit</div>
                <h4>Y&eacute;il the Transformer</h4>
                <p>Light from Darkness&mdash;Raven stole the sun, moon, and stars and gave them to everyone</p>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="pricing-section">
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">Free. All of it.</h2>
              <p className="subtitle reveal reveal-delay-2">Every tool, token, and principle is included under the Apache 2.0 license. No account, hosted plan, or usage meter.</p>
            </div>

            <div className="pricing-open-source reveal reveal-delay-3">
              <div className="glow-card pricing-open-card">
                <div className="pricing-open-stats">
                  <div className="pricing-open-stat">
                    <span className="pricing-open-num">99</span>
                    <span className="pricing-open-label">Tools</span>
                  </div>
                  <div className="pricing-open-stat">
                    <span className="pricing-open-num">129</span>
                    <span className="pricing-open-label">Principles</span>
                  </div>
                  <div className="pricing-open-stat">
                    <span className="pricing-open-num">9</span>
                    <span className="pricing-open-label">Knowledge Layers</span>
                  </div>
                  <div className="pricing-open-stat">
                    <span className="pricing-open-num">22</span>
                    <span className="pricing-open-label">Patterns</span>
                  </div>
                </div>
                <p className="pricing-open-desc">Use Raven to audit AI-generated interfaces, fetch token systems, score design choices, and cite the rule behind each finding. Install in 30 seconds.</p>
              </div>

              <div className="glow-card pricing-services-card">
                <p className="pricing-services-label">Need something custom?</p>
                <h3 className="pricing-services-title">Custom Design Systems</h3>
                <p className="pricing-services-desc">Get a Raven-compatible design system for your brand: tokens, principles, and evaluation rules matched to your product.</p>
                <a href="mailto:andrew@ravenmcp.ai" className="pricing-services-link">Get in touch &rarr;</a>
              </div>
            </div>
          </div>
        </section>


        <section id="faq" className="faq-section">
          <div className="container">
            <div className="section-header">
              <h2 className="reveal reveal-delay-1">Frequently asked questions</h2>
              <p className="subtitle reveal reveal-delay-2">Everything you need to know about Raven, the design-intelligence MCP server.</p>
            </div>
            <div className="faq-list reveal reveal-delay-3">
              <div className="faq-item">
                <h3>What is RavenMCP?</h3>
                <p>RavenMCP (Raven) is an open-source <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">Model Context Protocol</a> (MCP) server. Add it to Claude or Cursor, and your agent can call 99 local tools for design principles, UI patterns, design-system tokens, content voice, research methods, service blueprints, multi-platform audits, click-to-edit Raven Design, a local Decision Graph, and project-specific taste checks.</p>
              </div>
              <div className="faq-item">
                <h3>How do I install RavenMCP?</h3>
                <p>Install Raven in one command: <code>claude mcp add raven -- npx -y raven-mcp</code>. It runs through npx, so there's nothing to clone or build. Full setup instructions are in the <a href="/docs.html">documentation</a>.</p>
              </div>
              <div className="faq-item">
                <h3>Is RavenMCP free?</h3>
                <p>Yes. RavenMCP is 100% free and open source under the Apache 2.0 license. Every tool, token, and principle is included &mdash; no tiers, no usage limits, and no account required.</p>
              </div>
              <div className="faq-item">
                <h3>Which AI agents work with RavenMCP?</h3>
                <p>Raven works with any client that supports the Model Context Protocol &mdash; Claude (Claude Code and the Claude desktop app), Cursor, and any other MCP client. Once installed, the agent can call Raven's 100 tools directly during a conversation.</p>
              </div>
              <div className="faq-item">
                <h3>What platforms can RavenMCP audit?</h3>
                <p>Raven can audit web pages and layouts, iOS/SwiftUI screens, Android screens, and React Native interfaces &mdash; checking them against design principles and UI patterns, and flagging issues with contrast, tap targets, typography, and accessibility.</p>
              </div>
              <div className="faq-item">
                <h3>What design systems does RavenMCP support?</h3>
                <p>Raven includes tokens from 12 named systems in W3C DTCG format, including Apple HIG, Material, Stripe, Linear, Vercel, GitHub Primer, Tailwind, and shadcn/ui. It also exposes 129 design principles and 22 reusable UI patterns.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="get-started" className="cta-section">
          <div className="glow"></div>
          <div className="container">
            <h2 className="reveal reveal-delay-1">Add design checks<br />to Claude</h2>
            <p className="subtitle reveal reveal-delay-2">Open source. Zero runtime dependencies. One MCP install for Claude Code, Claude Desktop, Cursor, and compatible clients.</p>
            <div className="cta-actions reveal reveal-delay-3">
              <a href="/docs.html" className="btn btn-primary">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v8M5 7l3 3 3-3M3 12h10" /></svg>
                Install Raven
              </a>
              <button className="cta-install" data-copy="claude mcp add raven -- npx -y raven-mcp">
                <span className="copy-label">claude mcp add raven -- npx -y raven-mcp</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="4" width="8" height="8" rx="1.5" /><path d="M2 10V3a1 1 0 011-1h7" /></svg>
              </button>
            </div>
          </div>
        </section>

        </main>

        {/* FOOTER (shared component) */}
      <HomeScripts />
    </>
  )
}
