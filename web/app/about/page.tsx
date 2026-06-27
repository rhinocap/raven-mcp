import type { Metadata } from 'next';
import './about.css';
import AboutScripts from '@/components/AboutScripts';


export const metadata: Metadata = {
  title: 'About — RavenMCP',
  description:
    'The story behind RavenMCP — an open-source design-intelligence MCP server for AI agents — and its creator, Andrew Cunliffe.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      {/* HERO */}
      <section className="hero reveal">
        <div className="hero-photo">
          <img src="/assets/IMG_2046.JPG" alt="Andrew Cunliffe" />
        </div>
        <div className="hero-text">
          <div className="hero-eyebrow">Creator of Raven MCP</div>
          <h1 className="hero-name">Andrew<br />Cunliffe</h1>
          <p className="hero-title">Senior Staff Designer & Product Strategist</p>
          <p className="hero-bio">I drive platform visions and make company-wide AI+Human experiences a reality. Design strategy at the enterprise scale — setting the direction for how millions of customers interact with AI, then making sure those experiences actually ship and thrive.</p>
          <p className="hero-bio">Raven MCP was born from a simple frustration: AI can write code, but it can't <em>design</em>. It doesn't know Nielsen's heuristics. It doesn't understand Gestalt. It reaches for Comic Sans when it should reach for Inter. I built Raven to fix that — permanently.</p>
          <div className="hero-links">
            <a href="/" className="hero-link primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
              Explore Raven
            </a>
            <a href="https://github.com/rhinocap/raven-mcp" target="_blank" className="hero-link secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.38.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.08-.73.08-.73 1.2.08 1.84 1.23 1.84 1.23 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 016.02 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58A12.01 12.01 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* WHAT I DO */}
      <section className="what-section reveal">
        <div className="section-label">What I Do</div>
        <h2 className="section-title">Platform vision meets enterprise execution</h2>
        <div className="skills-grid">
          <div className="skill-card reveal reveal-delay-1">
            <div className="skill-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" /></svg>
            </div>
            <h3>Design Strategy</h3>
            <p>Setting the vision for how products evolve. I connect business goals to customer outcomes through design — not just pixels, but the decisions behind them.</p>
          </div>
          <div className="skill-card reveal reveal-delay-2">
            <div className="skill-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
            </div>
            <h3>AI + Human Experiences</h3>
            <p>Designing enterprise-scale experiences where AI and humans work together seamlessly. Smart handoffs, trust calibration, and interfaces that make AI actually useful.</p>
          </div>
          <div className="skill-card reveal reveal-delay-3">
            <div className="skill-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
            </div>
            <h3>Platform Vision</h3>
            <p>I define the design direction for entire platforms — not individual features. Systems-level thinking that shapes how millions of customers experience a product.</p>
          </div>
          <div className="skill-card reveal reveal-delay-4">
            <div className="skill-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
            </div>
            <h3>AI Design Intelligence</h3>
            <p>Building the tools that give AI real design taste. RavenMCP is the proof — 129 principles, 22 patterns, 12 design systems, 5 brand voice guides, research methods, service blueprints, and a framework that turns Claude into a design-literate partner.</p>
          </div>
          <div className="skill-card reveal reveal-delay-1">
            <div className="skill-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
            </div>
            <h3>Design Systems</h3>
            <p>Tokens, patterns, standards — the shared language that makes consistent experiences possible at scale. I think in systems because one-off decisions don't survive contact with reality.</p>
          </div>
          <div className="skill-card reveal reveal-delay-2">
            <div className="skill-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="14" y1="4" x2="10" y2="20" /></svg>
            </div>
            <h3>Concept to Code</h3>
            <p>I don't hand off — I ship. From strategy to working product in the same brain. AI is the force multiplier, taste is the filter.</p>
          </div>
        </div>
      </section>

      {/* WHY RAVEN */}
      <section className="why-section reveal">
        <div className="why-inner">
          <div className="why-text">
            <div className="section-label">Why I Built Raven</div>
            <h2 className="section-title">Design knowledge shouldn't be locked in people's heads</h2>
            <p><strong>The problem is simple:</strong> AI can generate UI, but it doesn't understand <em>why</em> one layout works and another doesn't. It doesn't know that cards need consistent padding, that contrast ratios have legal minimums, or that Fitts's Law governs every button you've ever clicked.</p>
            <p>Senior designers carry decades of this knowledge. When they review AI output, they see dozens of violations instantly. But that expertise doesn't transfer to the AI — it just gets corrected and forgotten.</p>
            <p><strong>Raven changes that.</strong> It gives Claude access to 129 design principles, 22 UI + content + service patterns, 12 design system token sets, 5 brand voice guides, research methods with protocols, service-design patterns with a two-actor blueprint generator, brand-and-visual guidance with current trends, and strategic frameworks — all through MCP. The AI doesn't guess at design anymore. It knows.</p>
          </div>
          <div className="why-terminal">
            <div className="why-terminal-header">
              <span className="why-terminal-dot"></span>
              <span className="why-terminal-dot"></span>
              <span className="why-terminal-dot"></span>
            </div>
            <div className="why-terminal-body">
              <span className="prompt">~</span> <span className="cmd">claude "build a dashboard"</span><br />
              <span className="comment"># Without Raven:</span><br />
              <span className="output">→ Generic layout, random colors, no system</span><br /><br />
              <span className="prompt">~</span> <span className="cmd">claude "build a dashboard" --mcp raven</span><br />
              <span className="comment"># With Raven:</span><br />
              <span className="output">→ Calls get_design_system("linear")</span><br />
              <span className="output">→ Calls get_principles("hierarchy")</span><br />
              <span className="output">→ Calls get_pattern("data-table")</span><br />
              <span className="output">→ Calls evaluate_design()</span><br />
              <span className="output">→ Ships pixel-perfect, accessible UI</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section reveal">
        <h2>Ready to give AI<br /><span>real design taste?</span></h2>
        <p>Raven MCP is open source, free forever, and installs in 30 seconds.</p>
        <div style={{ display: 'flex', gap: 'var(--space-4,16px)', justifyContent: 'center' }}>
          <a href="/" className="hero-link primary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2v8M5 7l3 3 3-3M3 12h10" /></svg>
            Get Raven MCP
          </a>
          <a href="https://github.com/rhinocap/raven-mcp" target="_blank" className="hero-link secondary">View on GitHub</a>
        </div>
      </section>

      <AboutScripts />
    </>
  );
}
