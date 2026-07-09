import HomeScripts from '@/components/HomeScripts'
import HeroGrid from '@/components/HeroGrid'

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
            <div className="hero-badge reveal">
              Open-source MCP Server · MIT
            </div>
            <h1 className="reveal reveal-delay-1"><span className="line-glow">Design audits</span><span className="line-accent">for AI-built UI</span></h1>
            <p className="subtitle reveal reveal-delay-2">Raven is an open-source MCP server that lets coding agents audit a page, name the broken design rule, and return the fix with evidence. The first case study is this homepage.</p>
            <div className="hero-cta reveal reveal-delay-3">
              <button className="cta-install" aria-label="Copy install command to clipboard" data-copy="claude mcp add raven -- npx -y raven-mcp">
                <span className="copy-label">claude mcp add raven -- npx -y raven-mcp</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5" /><path d="M2 10V3a1 1 0 011-1h7" /></svg>
              </button>
            </div>
            <div className="hero-text-links reveal reveal-delay-3">
              <a href="#work" className="btn-text-link">See the self-audit →</a>
              <a href="/docs.html" className="btn-text-link">Docs →</a>
              <a href="https://github.com/rhinocap/raven-mcp" className="btn-text-link">View on GitHub →</a>
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
                <div className="raven-stat-num" id="rs-dl">—<span className="unit">/wk</span></div>
                <div className="raven-stat-label">npm Downloads</div>
              </div>
            </div>
            
            

          </div>
        </section>

        {/* SELF-AUDIT CASE STUDY */}
        <section id="work" className="self-audit">
          <div className="container">
            <div className="case-hero reveal">
              <div className="case-hero-copy">
                <p className="label">Case study</p>
                <h2>We audited our own homepage.</h2>
                <p>Raven's strongest proof is a self-critique: run the audit, fix the findings, and show exactly what changed. This section turns the report into a reproducible before/after instead of another claim about design quality.</p>
              </div>
              <div className="case-command terminal">
                <div className="terminal-header">
                  <span className="terminal-dot"></span>
                  <span className="terminal-dot"></span>
                  <span className="terminal-dot"></span>
                  <span className="terminal-title">run it on your site</span>
                </div>
                <div className="static-term-body">
                  <pre aria-label="Raven audit command" dangerouslySetInnerHTML={{ __html: `<span class="g">$</span> claude mcp add raven -- npx -y raven-mcp
<span class="g">$</span> audit_page <span class="k">url</span>:<span class="v">'https://ravenmcp.ai'</span>
<span class="g">$</span> audit_taste <span class="k">project</span>:<span class="v">'raven-mcp'</span> <span class="k">url</span>:<span class="v">'https://ravenmcp.ai'</span>` }} />
                </div>
              </div>
            </div>

            <div className="case-phases">
              <article className="case-phase reveal">
                <span className="case-num">01</span>
                <h3>Audit</h3>
                <p>The report flagged the page on the exact issues a design-intelligence product has to clear: color discipline, nested cards, line-height drift, broad persuasion copy, and a too-small FAQ target.</p>
                <ul className="finding-list">
                  <li><span>audit_taste</span><strong>BLOCK</strong></li>
                  <li><span>Hardcoded SVG hues</span><strong>6</strong></li>
                  <li><span>Persuasion-language hits</span><strong>22</strong></li>
                  <li><span>Sub-44px tap targets</span><strong>1</strong></li>
                </ul>
              </article>

              <article className="case-phase reveal reveal-delay-1">
                <span className="case-num">02</span>
                <h3>Fix</h3>
                <p>The homepage now exposes the fix path as content: one accent-led comparison, a flatter proof section, a named Work nav anchor, and concrete command output instead of another set of demo tiles.</p>
                <div className="case-diff" aria-label="Representative token and copy changes">
                  <div><span className="diff-minus">-</span> six independent icon colors</div>
                  <div><span className="diff-plus">+</span> one accent token for wayfinding</div>
                  <div><span className="diff-minus">-</span> strongest proof hidden below the fold</div>
                  <div><span className="diff-plus">+</span> self-audit linked from hero and nav</div>
                </div>
              </article>

              <article className="case-phase reveal reveal-delay-2">
                <span className="case-num">03</span>
                <h3>Verify</h3>
                <p>Raven's natural close is not a testimonial. It is a command a builder can paste into Claude and point at a real URL, then compare the returned findings to the page in front of them.</p>
                <div className="verify-block">
                  <span>next step</span>
                  <code>audit_page → audit_taste → fix → rerun</code>
                </div>
              </article>
            </div>

            <div className="changed-grid">
              <article className="changed-card reveal">
                <span>Color discipline</span>
                <h3>Six accent hues became one rule.</h3>
                <p>The comparison shows the audit finding as a visual defect: independent icon colors read as decoration, while one accent value makes the evidence easier to scan.</p>
              </article>
              <article className="changed-card reveal reveal-delay-1">
                <span>Layout density</span>
                <h3>Proof moved ahead of inventory.</h3>
                <p>The homepage now explains what Raven does through a concrete self-audit before the visitor reaches long tool lists or example galleries.</p>
              </article>
              <article className="changed-card reveal reveal-delay-2">
                <span>Voice</span>
                <h3>The page shows the workflow.</h3>
                <p>The case study names the findings and commands directly, matching the skeptical builder who wants evidence before committing time.</p>
              </article>
            </div>

            <div className="before-after reveal" aria-label="Before and after visual comparison of the Raven homepage audit">
              <article className="site-shot before-shot">
                <div className="shot-header">
                  <span>Before</span>
                  <strong>audit_taste: BLOCK</strong>
                </div>
                <div className="shot-window">
                  <div className="shot-nav"><span></span><span></span><span></span></div>
                  <div className="shot-page">
                    <div className="shot-hero">
                      <div className="shot-pill">Design intelligence</div>
                      <div className="shot-title wide"></div>
                      <div className="shot-title short"></div>
                      <div className="shot-copy"></div>
                    </div>
                    <div className="shot-rainbow-grid">
                      <span className="hue-1"></span>
                      <span className="hue-2"></span>
                      <span className="hue-3"></span>
                      <span className="hue-4"></span>
                      <span className="hue-5"></span>
                      <span className="hue-6"></span>
                    </div>
                    <div className="shot-stack">
                      <div></div>
                      <div></div>
                      <div></div>
                    </div>
                  </div>
                </div>
                <p>Icon tiles used six separate accent values, the strongest proof was a gallery of single-state examples, and the audit result lived outside the page.</p>
              </article>

              <article className="site-shot after-shot">
                <div className="shot-header">
                  <span>After this pass</span>
                  <strong>self-audit visible</strong>
                </div>
                <div className="shot-window">
                  <div className="shot-nav"><span></span><span></span><span></span></div>
                  <div className="shot-page">
                    <div className="shot-hero">
                      <div className="shot-pill">Case study</div>
                      <div className="shot-title wide"></div>
                      <div className="shot-title short accent"></div>
                      <div className="shot-copy"></div>
                    </div>
                    <div className="shot-proof-row">
                      <span>Audit</span>
                      <span>Fix</span>
                      <span>Verify</span>
                    </div>
                    <div className="shot-accent-grid">
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
                <p>The homepage now links to a self-audit, shows the before/after treatment, and closes with the same command path a visitor can run against their own URL.</p>
              </article>
            </div>

            <div className="case-scoreboard reveal">
              <div className="score-row score-head">
                <span>Finding</span>
                <span>Before report</span>
                <span>This pass</span>
              </div>
              <div className="score-row">
                <span>Primary proof path</span>
                <span>Static output tiles</span>
                <span>Self-audit case study</span>
              </div>
              <div className="score-row">
                <span>Homepage Work entry</span>
                <span>Absent</span>
                <span>Hero + nav anchor</span>
              </div>
              <div className="score-row">
                <span>Before/after evidence</span>
                <span>Absent</span>
                <span>Visual comparison + deltas</span>
              </div>
              <div className="score-row">
                <span>Try-it path</span>
                <span>Install only</span>
                <span>Install + audit command</span>
              </div>
            </div>
          </div>
        </section>

        {/* SIZZLE REEL */}
        <section style={{ padding: 'clamp(80px, 9vw, 144px) 0 clamp(24px, 3vw, 40px)' }}>
          <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="hero-visual reveal" style={{ marginTop: '0' }}>
              <div className="terminal">
                <div className="terminal-header">
                  <span className="terminal-dot"></span>
                  <span className="terminal-dot"></span>
                  <span className="terminal-dot"></span>
                  <span className="terminal-title">claude &mdash; raven-mcp</span>
                </div>
                <div className="terminal-body" id="sizzle-reel"></div>
              </div>
              <div className="sizzle-progress">
                <span className="sizzle-dot active" data-scene="0"></span>
                <span className="sizzle-dot" data-scene="1"></span>
                <span className="sizzle-dot" data-scene="2"></span>
                <span className="sizzle-dot" data-scene="3"></span>
                <span className="sizzle-dot" data-scene="4"></span>
                <span className="sizzle-dot" data-scene="5"></span>
                <span className="sizzle-dot" data-scene="6"></span>
              </div>
            </div>
          </div>
        </section>

        <section id="judge" className="judge">
          <div className="container">
            <div className="section-header">
              <p className="label reveal">The Taste Engine</p>
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

              <p className="replay-caption">Recorded replays&mdash;taste profiles live locally under <code>~/.raven/taste/</code>, so these are captured runs, not live calls.</p>
            </div>
          </div>
        </section>

        <section id="cinematic" className="cinematic">
          <div className="container">
            <div className="section-header">
              <p className="label reveal">Cinematic builds</p>
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
              <p className="label reveal">Nine Knowledge Layers</p>
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
        <section id="tools" className="tools-section">
          <div className="container">
            <div className="section-header">
              <p className="label reveal">Seventy Tools</p>
              <h2 className="reveal reveal-delay-1">Seventy tools, organized by job</h2>
              <p className="subtitle reveal reveal-delay-2">Seventy focused calls, grouped by what they do&mdash;<strong>know</strong>, <strong>create</strong>, <strong>audit</strong>, <strong>judge</strong>. Claude calls them automatically, with no special syntax.</p>
            </div>
        
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">01</span>
                <h3 className="tool-act-title">Know</h3>
                <p className="tool-act-desc">Ask for the source material Raven uses: principles, patterns, research methods, metrics frameworks, and token libraries.</p>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Principles &amp; patterns</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3"/><circle cx="8" cy="11" r="0.5" fill="currentColor"/></svg></div>
                  <div><div className="tool-name">get_principles</div><div className="tool-desc">Design principles matched to your UI context&mdash;heuristics, laws, accessibility, color theory</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg></div>
                  <div><div className="tool-name">get_pattern</div><div className="tool-desc">Field-tested patterns with do's, don'ts, and evidence across UI, content, and service-design types</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3h10v10H3z"/><path d="M3 7h10M7 3v10"/></svg></div>
                  <div><div className="tool-name">get_checklist</div><div className="tool-desc">Pre-publish quality checklist for any UI type&mdash;forms, dashboards, landing pages, mobile</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v4l3 2"/><circle cx="8" cy="8" r="6"/></svg></div>
                  <div><div className="tool-name">get_d4d_framework</div><div className="tool-desc">Design for Delight&mdash;customer empathy, hypothesis, and experiment templates</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/></svg></div>
                  <div><div className="tool-name">search_knowledge</div><div className="tool-desc">Full-text search across all principles, patterns, and business strategy</div></div>
                </div>
                </div>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Strategy, metrics &amp; research</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 12l4-4 3 3 5-5"/><path d="M10 6h4v4"/></svg></div>
                  <div><div className="tool-name">get_business_strategy</div><div className="tool-desc">Monetization, retention, onboarding, growth, and metrics frameworks</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 13V3M3 13h10"/><path d="M5 10l2-4 2 3 3-6"/></svg></div>
                  <div><div className="tool-name">get_metrics_framework</div><div className="tool-desc">HEART, AARRR, North Star, conversion funnel, RICE, OKRs&mdash;with examples</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/><path d="M5 7h4"/></svg></div>
                  <div><div className="tool-name">get_research_method</div><div className="tool-desc">Qualitative, quantitative, and usability methods&mdash;with protocols and bias traps</div></div>
                </div>
                </div>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Reference libraries</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h8M2 12h10"/></svg></div>
                  <div><div className="tool-name">list_design_systems</div><div className="tool-desc">Browse the registry of 12 design systems with tokens and metadata</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 6h6M5 8h4M5 10h5"/></svg></div>
                  <div><div className="tool-name">get_design_system</div><div className="tool-desc">Full tokens&mdash;colors, typography, spacing, radii, elevation, motion</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 3h8v10H4z"/><path d="M6 7h4M6 10h4"/></svg></div>
                  <div><div className="tool-name">list_content_systems</div><div className="tool-desc">Browse brand voice &amp; tone systems&mdash;Mailchimp, GOV.UK, Polaris, Atlassian</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="5" r="2"/><path d="M5 13c0-2 1-4 3-4s3 2 3 4"/></svg></div>
                  <div><div className="tool-name">get_content_system</div><div className="tool-desc">A brand's full voice&mdash;attributes, tone shifts, vocabulary, grammar, content patterns</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3v10h10"/><path d="M6 10l2-3 2 2 3-4"/></svg></div>
                  <div><div className="tool-name">get_content_principles</div><div className="tool-desc">UX-writing principles&mdash;clarity, active voice, error anatomy, inclusive language</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M6 8l1.5 1.5L11 6"/></svg></div>
                  <div><div className="tool-name">get_content_pattern</div><div className="tool-desc">Copy recipes for error messages, empty states, notifications, form validation</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="5" cy="8" r="2"/><circle cx="11" cy="8" r="2"/><path d="M7 8h2"/></svg></div>
                  <div><div className="tool-name">get_service_pattern</div><div className="tool-desc">Blueprinting, human handoff, signup-as-service, omnichannel, moments of truth</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="10" height="10" rx="1"/><path d="M6 6l1.5 1.5L10 5"/></svg></div>
                  <div><div className="tool-name">get_service_standard</div><div className="tool-desc">The GOV.UK Service Standard&mdash;14 points for service-quality assessment</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/></svg></div>
                  <div><div className="tool-name">get_brand_principles</div><div className="tool-desc">Logo usage, gradient rules, imagery, visual hierarchy, brand-as-system</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5l2-2 2 2M11 5l2-2 2 2M3 11l2 2 2-2M11 11l2 2 2-2"/><rect x="6" y="6" width="4" height="4"/></svg></div>
                  <div><div className="tool-name">get_brand_trends</div><div className="tool-desc">2026 visual trends&mdash;bento, monospace, neon-on-glass, brutalism, AI imagery</div></div>
                </div>
                </div>
              </div>
            </div>
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">02</span>
                <h3 className="tool-act-title">Create</h3>
                <p className="tool-act-desc">Create token sets, brand profiles, service blueprints, and provider-ready creative job payloads from explicit inputs.</p>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Design systems &amp; tokens</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 8a5 5 0 0110 0"/><path d="M8 3v5l3 2"/></svg></div>
                  <div><div className="tool-name">generate_design_system</div><div className="tool-desc">Generate a complete design system from a brand color&mdash;export as HTML, CSS, Figma, or SVG</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l4 4-4 4"/><path d="M12 4l-4 4 4 4"/></svg></div>
                  <div><div className="tool-name">compose_system</div><div className="tool-desc">Mix tokens from multiple design systems into a custom composition</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M5 8h6M8 5v6"/></svg></div>
                  <div><div className="tool-name">get_brand_system</div><div className="tool-desc">Get a complete design system for building an app with branding like any company</div></div>
                </div>
                </div>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Brand &amp; creative</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="5" r="2.5"/><path d="M3 14c1-3 3-5 5-5s4 2 5 5"/></svg></div>
                  <div><div className="tool-name">create_brand_profile</div><div className="tool-desc">Store local brand memory: colors, fonts, tone, audience, constraints, product notes, and asset references</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/></svg></div>
                  <div><div className="tool-name">get_brand_profile</div><div className="tool-desc">Read a saved local creative brand profile for reuse in generation and campaign jobs</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4h8M4 8h8M4 12h8"/></svg></div>
                  <div><div className="tool-name">list_brand_profiles</div><div className="tool-desc">List saved creative brand profiles under the local Raven creative workspace</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="5" r="2.5"/><path d="M5 13c0-2 1-4 3-4s3 2 3 4"/><path d="M12 3l1 1M3 12l1 1"/></svg></div>
                  <div><div className="tool-name">create_character_profile</div><div className="tool-desc">Create a character or identity reference profile for consistent image and video generation</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 12l3-4 3 2 4-6"/><path d="M10 4h3v3"/></svg></div>
                  <div><div className="tool-name">plan_creative_campaign</div><div className="tool-desc">Plan a multi-asset campaign across photos, cards, UGC ads, TV spots, social packs, and storyboards</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4h10v8H3z"/><path d="M6 7l2 2 3-4"/></svg></div>
                  <div><div className="tool-name">create_generation_job</div><div className="tool-desc">Create a provider-ready image, video, audio, 3D, campaign, or analysis job payload</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1"/></svg></div>
                  <div><div className="tool-name">get_generation_job</div><div className="tool-desc">Read a generation job, its provider payload, status, and runner output if execution was enabled</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h10M3 8h10M3 11h10"/></svg></div>
                  <div><div className="tool-name">list_generation_jobs</div><div className="tool-desc">List local creative generation jobs by status, media type, or brand profile</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 6h6M5 9h4"/></svg></div>
                  <div><div className="tool-name">list_creative_models</div><div className="tool-desc">Browse provider-agnostic model slots for image, video, 3D, audio, character consistency, and analysis</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3h10v10H3z"/><path d="M5 6h6M5 9h4M5 12h5"/></svg></div>
                  <div><div className="tool-name">list_creative_presets</div><div className="tool-desc">Browse presets for product photos, marketplace cards, UGC ads, TV spots, social packs, storyboards, and infographics</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="10" height="10" rx="1.5"/><path d="M5 11l2-2 2 1 2-3"/></svg></div>
                  <div><div className="tool-name">register_creative_asset</div><div className="tool-desc">Register a local path or remote URL as an asset reference; Raven stores metadata, not file bytes</div></div>
                </div>
                </div>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Service design</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="5" height="4"/><rect x="9" y="3" width="5" height="4"/><rect x="2" y="9" width="5" height="4"/><rect x="9" y="9" width="5" height="4"/></svg></div>
                  <div><div className="tool-name">generate_service_blueprint</div><div className="tool-desc">Render a service blueprint as HTML&mdash;current vs. ideal, with two-actor HI-loop mode</div></div>
                </div>
                </div>
              </div>
            </div>
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">03</span>
                <h3 className="tool-act-title">Audit</h3>
                <p className="tool-act-desc">Check the work — web, native, and cross-platform — against the standards, with evidence.</p>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Web</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 3h12M2 7h8M2 11h10M13 7l-2 2 2 2"/></svg></div>
                  <div><div className="tool-name">audit_page</div><div className="tool-desc">Score any HTML page against Raven's design quality standards &mdash; typography, accessibility, responsive, tokens</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg></div>
                  <div><div className="tool-name">audit_url</div><div className="tool-desc">Render a live URL at every viewport &amp; theme, then catch cropped images, blank videos, hover white-wash, and hidden-on-mobile content</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 13l4-4M8 8l2 2M3 3l10 10"/></svg></div>
                  <div><div className="tool-name">audit_layout</div><div className="tool-desc">Evaluate a rendered page's visual rhythm, alignment, and optical balance</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 000 12z" fill="currentColor"/></svg></div>
                  <div><div className="tool-name">audit_contrast</div><div className="tool-desc">WCAG 2.1 contrast ratios for every text element on a rendered page&mdash;AA/AAA pass-fail with delta-to-pass</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="12" height="8" rx="1"/><rect x="6" y="11" width="4" height="2"/><path d="M2 9h12"/></svg></div>
                  <div><div className="tool-name">audit_responsive_visibility</div><div className="tool-desc">Flag content visible on desktop but hidden on mobile across breakpoints&mdash;catches responsive-hiding bugs that only surface on real devices</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="2"/><rect x="2" y="2" width="12" height="12" rx="2"/></svg></div>
                  <div><div className="tool-name">audit_tap_targets</div><div className="tool-desc">WCAG 2.5.5 / 44px tap-target audit&mdash;a per-element fix table with the exact CSS to reach the minimum, worst-first</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4h10M5 4v9M7 13h-4"/><path d="M10 7h3M11.5 7v6M13 13h-3"/></svg></div>
                  <div><div className="tool-name">audit_typography</div><div className="tool-desc">Typographic-scale report&mdash;detects the modular ratio, off-scale sizes, line-height drift, and bloated weight ladders</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3h10v10H3z"/><path d="M5 6h6M5 8h6M5 10h4"/></svg></div>
                  <div><div className="tool-name">audit_content</div><div className="tool-desc">Per-item UX-writing verdicts&mdash;metrics need a number, CTAs stay action-led, prose drops passive voice and jargon, with rewrites</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M2 11l3-3 2 2 3-4 4 5"/></svg></div>
                  <div><div className="tool-name">audit_asset_integrity</div><div className="tool-desc">Detect content sliced off inside a correctly-sized export&mdash;luminance variance flags a Figma export that ended mid-form</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4.5" y="1.5" width="7" height="13" rx="1.5"/><path d="M2 11h12"/><path d="M6.5 13h3"/></svg></div>
                  <div><div className="tool-name">audit_device_frame</div><div className="tool-desc">Catch content cropped inside a device mockup&mdash;aspect-ratio cover loss, baked-in pan/zoom drift, and edges sliced at the frame</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="5" height="12" rx="1"/><rect x="9" y="2" width="5" height="12" rx="1"/><path d="M4.5 5v6M11.5 5v6"/></svg></div>
                  <div><div className="tool-name">audit_consistency</div><div className="tool-desc">Audit multiple routes for cross-page consistency&mdash;content-container width and hero heading tier against the inferred canonical</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M7 6l3 2-3 2z" fill="currentColor"/></svg></div>
                  <div><div className="tool-name">audit_video_playback</div><div className="tool-desc">Render in headless Chromium and check every &lt;video&gt; actually advances&mdash;classifies each clip playing, paused, stalled, empty, or error</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 000 12z" fill="currentColor"/><path d="M8 5v6" stroke="var(--bg-base)"/></svg></div>
                  <div><div className="tool-name">suggest_contrast_fix</div><div className="tool-desc">Given failing WCAG pairs, return the minimal color change that clears the target ratio&mdash;the smallest foreground shift, with a background alternative</div></div>
                </div>
                </div>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Native — iOS &amp; React Native</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="8" height="12" rx="1.5"/><path d="M6 5h4M6 8h4M7 11h2"/></svg></div>
                  <div><div className="tool-name">audit_swiftui</div><div className="tool-desc">Audit SwiftUI source against Apple's HIG&mdash;Dynamic Type, semantic colors, 44pt targets, AccentColor</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="8" height="12" rx="1.5"/><path d="M8 4v8M5.5 7l2.5-2 2.5 2"/></svg></div>
                  <div><div className="tool-name">audit_screen</div><div className="tool-desc">Score a rendered iOS or Android screen from an accessibility snapshot&mdash;44/48pt targets, contrast, visual rhythm</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="8" height="12" rx="1.5"/><path d="M6 5h4M6 8h4M7 11h2"/></svg></div>
                  <div><div className="tool-name">audit_ios_screen</div><div className="tool-desc">Score a captured iOS screen snapshot&mdash;44pt targets, contrast, visual rhythm&mdash;with device-capable capture orchestration</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="8" height="12" rx="1.5"/><circle cx="8" cy="8" r="2"/><path d="M8 4v1M8 11v1"/></svg></div>
                  <div><div className="tool-name">audit_ios_a11y</div><div className="tool-desc">Score an iOS accessibility snapshot&mdash;missing labels/traits, sub-44pt targets, per-text contrast, Dynamic-Type clipping, VoiceOver order</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4z"/><path d="M6 8l1.5 1.5L10.5 6.5"/></svg></div>
                  <div><div className="tool-name">audit_ios_privacy</div><div className="tool-desc">Audit Info.plist or Expo app.json&mdash;usage-string honesty, ATS, bundled secrets, undisclosed data-egress</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="1"/><ellipse cx="8" cy="8" rx="6.5" ry="2.5"/><ellipse cx="8" cy="8" rx="6.5" ry="2.5" transform="rotate(60 8 8)"/><ellipse cx="8" cy="8" rx="6.5" ry="2.5" transform="rotate(120 8 8)"/></svg></div>
                  <div><div className="tool-name">audit_rn</div><div className="tool-desc">Audit React Native / Expo source&mdash;touchable a11y, 44/48pt targets, font scaling, safe areas, dark mode</div></div>
                </div>
                </div>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Cross-platform &amp; contracts</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="5" height="10" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/><path d="M7 8h2"/></svg></div>
                  <div><div className="tool-name">audit_parity</div><div className="tool-desc">Compare iOS and Android snapshots against named spatial relationships&mdash;catches cross-platform layout drift past device-verified claims</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 3h6M8 3v10M5 13h6"/><path d="M3 6l2-2 2 2M9 10l2 2 2-2"/></svg></div>
                  <div><div className="tool-name">audit_contract</div><div className="tool-desc">Verify a wire contract is identical across iOS, proxy, and Android&mdash;flags missing tokens, schemaVersion drift, and prefix-ordering bugs</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l-2 4 2 4M12 4l2 4-2 4"/><path d="M9 3l-2 10"/></svg></div>
                  <div><div className="tool-name">audit_api_contract</div><div className="tool-desc">Run adversarial queries against a live endpoint&mdash;flags responses that pass shape but are confidently wrong</div></div>
                </div>
                </div>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Scoring</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z"/></svg></div>
                  <div><div className="tool-name">evaluate_design</div><div className="tool-desc">Score a design description against relevant principles and patterns</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2l1.7 3.8 4.1.4-3.1 2.7.9 4.1L8 10.9 4.4 13l.9-4.1-3.1-2.7 4.1-.4z"/></svg></div>
                  <div><div className="tool-name">score_creative</div><div className="tool-desc">Score prompts, scripts, and concepts for hook strength, benefit clarity, channel fit, audience fit, and brand fit</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 13V3M2 13h12"/><rect x="4" y="8" width="2" height="3"/><rect x="7" y="5" width="2" height="6"/><rect x="10" y="6" width="2" height="5"/></svg></div>
                  <div><div className="tool-name">score_page</div><div className="tool-desc">Score a page across 7 categories&mdash;structure, type, color, spacing, accessibility, responsive, tokens&mdash;each rated 0&ndash;10, derived deterministically</div></div>
                </div>
                </div>
              </div>
            </div>
        
            {/* Act 04 — Judge (Taste Engine) */}
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">04</span>
                <h3 className="tool-act-title">Judge</h3>
                <p className="tool-act-desc">The Taste Engine — calibrate a person's design judgment once, then hold every build to it, with the rule behind each verdict.</p>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Calibrate</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v3M8 11v3M2 8h3M11 8h3"/><circle cx="8" cy="8" r="2.5"/></svg></div>
                  <div><div className="tool-name">create_taste_profile</div><div className="tool-desc">Build a ruleset and precedent corpus from explicit rules or a DESIGN.md doc&mdash;stored locally under ~/.raven/taste</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 6h6M5 8h4M5 10h5"/></svg></div>
                  <div><div className="tool-name">get_taste_profile</div><div className="tool-desc">Read a profile's rules, scopes, voice, and its surface bindings</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h8M2 12h10"/></svg></div>
                  <div><div className="tool-name">list_taste_profiles</div><div className="tool-desc">Browse every taste profile on this machine</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 3h8v10l-4-2-4 2z"/><path d="M6 6h4M6 8h3"/></svg></div>
                  <div><div className="tool-name">get_taste_interview</div><div className="tool-desc">A kickoff question set built from the profile's own rules&mdash;asks how each surface should read before the first design decision</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 8l2 2 4-5"/><rect x="2" y="2" width="12" height="12" rx="2"/></svg></div>
                  <div><div className="tool-name">bind_taste_surface</div><div className="tool-desc">Bind a profile to a surface&mdash;scoped overrides, URL hosts, a voice note, and per-dimension design notes</div></div>
                </div>
                </div>
              </div>
              <div className="tool-sub">
                <span className="tool-sub-label">Judge &amp; learn</span>
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2l5 2.5v4c0 3-2.2 4.8-5 5.5-2.8-.7-5-2.5-5-5.5v-4z"/><path d="M6 8l1.5 1.5L10.5 6"/></svg></div>
                  <div><div className="tool-name">audit_taste</div><div className="tool-desc">Judge HTML, text, or a URL against a profile&mdash;verdict BLOCK/WARN/PASS, every finding citing a rule_id and its evidence</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8l2.5 2.5L8 5"/><path d="M8 8l2 2 4-5"/></svg></div>
                  <div><div className="tool-name">label_finding</div><div className="tool-desc">Append a labeled precedent&mdash;accept, revise, or reject; accepted patterns suppress that finding in future audits</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 2h6l2 2v10H4z"/><path d="M6 6h4M6 8h4M6 10h2"/></svg></div>
                  <div><div className="tool-name">record_taste_decision</div><div className="tool-desc">Log a chosen-vs-rejected decision so recurring choices become interview defaults</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3v10h10"/><path d="M6 10l2-3 2 2 3-4"/></svg></div>
                  <div><div className="tool-name">list_taste_decisions</div><div className="tool-desc">Review the decision history behind a profile's evolving taste</div></div>
                </div>
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="6" cy="6" r="1.5"/><path d="M3 12l3-3 2 2 3-4 2 2.5"/></svg></div>
                  <div><div className="tool-name">generate_taste_portrait</div><div className="tool-desc">Render a bound surface as a self-contained designed page built from its own taste store</div></div>
                </div>
                </div>
              </div>
            </div>
        
            <div className="tool-act">
              <div className="tool-act-head">
                <span className="tool-act-num">05</span>
                <h3 className="tool-act-title">Meta</h3>
                <p className="tool-act-desc">Local usage reflection and release registration.</p>
              </div>
              <div className="tool-sub">
                <div className="tools-grid">
                <div className="tool-card reveal">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1"/></svg></div>
                  <div><div className="tool-name">raven_reflect</div><div className="tool-desc">Summarize your local Raven usage log&mdash;tool counts, recurring warnings, gaps</div></div>
                </div>
                <div className="tool-card reveal reveal-delay-1">
                  <div className="tool-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4h10M3 8h6M3 12h10"/><path d="M11 6l2 2-2 2"/></svg></div>
                  <div><div className="tool-name">raven_register</div><div className="tool-desc">Register an email for Raven updates and a direct feedback line to the creator</div></div>
                </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WATCH IT WORK — MacBook feature grid */}
        <section id="watch" className="watch-section" style={{ padding: 'clamp(80px, 9vw, 144px) 0' }}>
          <div className="container">
            <div className="section-header">
              <p className="label reveal">Watch it work</p>
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
              <p className="label reveal">Illustrative Outputs</p>
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
              <p className="label reveal">Token Registry</p>
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
                <p className="label">The Story</p>
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
              <p className="label reveal">Open Source</p>
              <h2 className="reveal reveal-delay-1">Free. All of it.</h2>
              <p className="subtitle reveal reveal-delay-2">Every tool, token, and principle is included under the MIT license. No account, hosted plan, or usage meter.</p>
            </div>

            <div className="pricing-open-source reveal reveal-delay-3">
              <div className="glow-card pricing-open-card">
                <div className="pricing-open-stats">
                  <div className="pricing-open-stat">
                    <span className="pricing-open-num">70</span>
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
              <p className="label reveal">Questions</p>
              <h2 className="reveal reveal-delay-1">Frequently asked questions</h2>
              <p className="subtitle reveal reveal-delay-2">Everything you need to know about Raven, the design-intelligence MCP server.</p>
            </div>
            <div className="faq-list reveal reveal-delay-3">
              <div className="faq-item">
                <h3>What is RavenMCP?</h3>
                <p>RavenMCP (Raven) is an open-source <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">Model Context Protocol</a> (MCP) server. Add it to Claude or Cursor, and your agent can call 70 local tools for design principles, UI patterns, design-system tokens, content voice, research methods, service blueprints, multi-platform audits, and project-specific taste checks.</p>
              </div>
              <div className="faq-item">
                <h3>How do I install RavenMCP?</h3>
                <p>Install Raven in one command: <code>claude mcp add raven -- npx -y raven-mcp</code>. It runs through npx, so there's nothing to clone or build. Full setup instructions are in the <a href="/docs.html">documentation</a>.</p>
              </div>
              <div className="faq-item">
                <h3>Is RavenMCP free?</h3>
                <p>Yes. RavenMCP is 100% free and open source under the MIT license. Every tool, token, and principle is included &mdash; no tiers, no usage limits, and no account required.</p>
              </div>
              <div className="faq-item">
                <h3>Which AI agents work with RavenMCP?</h3>
                <p>Raven works with any client that supports the Model Context Protocol &mdash; Claude (Claude Code and the Claude desktop app), Cursor, and any other MCP client. Once installed, the agent can call Raven's 70 tools directly during a conversation.</p>
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
            <p className="label reveal">Get Started</p>
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
