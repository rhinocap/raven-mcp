import type { Metadata } from 'next';
import DesignSystemScripts from '@/components/DesignSystemScripts'
import './design-system.css'
import { TOOL_COUNT, LAYER_COUNT } from '@/lib/counts'


export const metadata: Metadata = {
  title: 'Design System — RavenMCP',
  description:
    'The tokens, type, motion, and voice behind RavenMCP — generated from the live site and the canonical brand profile, scored for WCAG AA.',
  alternates: { canonical: '/design-system' },
};

export default function DesignSystemPage() {
  return (
    <>
      <div className="wrap">

        <header className="hero">
          <h1>The system behind <span className="g">every prompt</span></h1>
          <p>The tokens, type, motion, and voice that define RavenMCP — generated from the live site <span className="mono">:root</span> and the canonical brand profile. Every text/surface pairing below is scored for WCAG AA in your browser, live.</p>
          <div className="meta-row">
            <span className="pill">brand: ravenmcp</span>
            <span className="pill">dark · neon-on-glass</span>
            <span className="pill" id="aa-summary">AA: scoring…</span>
          </div>
        </header>

        {/* 01 COLOR */}
        <section>
          <div className="sec-head"><span className="sec-num">01</span><h2>Color</h2><span className="desc">Dark grey base — never pure black. Neon blue is the single primary; the rest are accents, not a rainbow.</span></div>

          <div className="eyebrow" style={{ color: 'var(--text-tertiary)' }}>Surfaces</div>
          <div className="grid g-surfaces" id="surfaces"></div>

          <div className="eyebrow" style={{ color: 'var(--text-tertiary)', marginTop: 'var(--space-10)' }}>Accents</div>
          <div className="grid g-accents" id="accents"></div>

          <div className="eyebrow" style={{ color: 'var(--text-tertiary)', marginTop: 'var(--space-10)' }}>Text on surfaces — live WCAG AA</div>
          <table className="aa"><thead><tr><th>Text token</th><th>On surface</th><th>Sample</th><th>Ratio</th><th>AA</th></tr></thead><tbody id="aa-body"></tbody></table>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginTop: 'var(--space-4)', maxWidth: '72ch' }}>Raw token pairings. <b style={{ color: 'var(--text-primary)' }}>Red = avoid this combination</b> — muted text on the lightest <span className="mono">--bg-overlay</span> dips below AA, so keep secondary/tertiary text on base/surface/raised. The live site composites these correctly and ships <b style={{ color: '#00E676' }}>0</b> real AA failures.</p>
        </section>

        {/* 02 TYPOGRAPHY */}
        <section>
          <div className="sec-head"><span className="sec-num">02</span><h2>Typography</h2><span className="desc">Inter for product UI; monospace carries the technical tone in eyebrows, tool names, and code.</span></div>
          <div id="type-scale"></div>
          <div style={{ marginTop: 'var(--space-8)', display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '240px' }}><div className="eyebrow" style={{ color: 'var(--text-tertiary)' }}>--font-body</div><div style={{ fontSize: '28px', fontWeight: '700' }}>Inter</div><div style={{ color: 'var(--text-secondary)' }}>The quick brown fox jumps over the lazy dog. 0123456789</div></div>
            <div style={{ flex: '1', minWidth: '240px' }}><div className="eyebrow" style={{ color: 'var(--text-tertiary)' }}>--font-mono</div><div className="mono" style={{ fontSize: '28px', fontWeight: '700' }}>SF Mono</div><div className="mono" style={{ color: 'var(--text-secondary)' }}>claude mcp add raven 0123456789</div></div>
          </div>
        </section>

        {/* 03 SPACING */}
        <section>
          <div className="sec-head"><span className="sec-num">03</span><h2>Spacing</h2><span className="desc">A 4 / 8 px rhythm. Whitespace is a signal, not leftover.</span></div>
          <div id="spacing"></div>
        </section>

        {/* 04 RADIUS */}
        <section>
          <div className="sec-head"><span className="sec-num">04</span><h2>Radius</h2><span className="desc">Soft, consistent corners; full-round for pills and chips.</span></div>
          <div className="grid g-radius" id="radius"></div>
        </section>

        {/* 05 MOTION */}
        <section>
          <div className="sec-head"><span className="sec-num">05</span><h2>Motion</h2><span className="desc">One spring easing, three durations. Click a card to replay.</span></div>
          <div className="grid g-motion" id="motion"></div>
        </section>

        {/* 06 VOICE */}
        <section>
          <div className="sec-head"><span className="sec-num">06</span><h2>Voice &amp; Tone</h2><span className="desc">Bold but clear. Lead with the noun or verb that matters; never trade clarity for cleverness.</span></div>
          <div className="voice-grid">
            <div className="voice-card do"><h3>Do</h3><ul>
              <li><b>Front-load meaning.</b> "{TOOL_COUNT} tools, organized by job."</li>
              <li><b>Be specific.</b> "Render a live URL at every viewport" beats "powerful auditing."</li>
              <li><b>Speak to "you,"</b> the developer driving the agent.</li>
              <li><b>Punchy is fine.</b> "No Figma file. No designer."</li>
            </ul></div>
            <div className="voice-card dont"><h3>Don't</h3><ul>
              <li><b>No clever-over-clear.</b> Not "The full flight across all realms."</li>
              <li><b>No mythology in functional labels.</b> Keep "realms / banner" to the story section.</li>
              <li><b>No drifting terms.</b> Groupings are "layers" — not disciplines / realms / acts.</li>
              <li><b>No "the user."</b> Say "you."</li>
            </ul></div>
          </div>
          <div className="attrs">
            <span className="attr">Bold</span><span className="attr">Clear</span><span className="attr">Technical</span>
            <span className="attr">Precise</span><span className="attr">Confident — no hype</span>
          </div>
        </section>

        {/* 07 GUARDRAILS */}
        <section>
          <div className="sec-head"><span className="sec-num">07</span><h2>Guardrails</h2><span className="desc">Constraints from the brand profile that every surface must honor.</span></div>
          <div className="guard">
            <div className="guard-item"><span className="k">contrast</span><span className="v">Body text <b>≥ 4.5:1</b>, large <b>≥ 3:1</b>. Never sacrifice contrast for a neon-on-dark gradient.</span></div>
            <div className="guard-item"><span className="k">one primary focus</span><span className="v">Exactly <b>one</b> high-contrast primary CTA (a real verb — Install / Get started). Everything else is ghost/secondary.</span></div>
            <div className="guard-item"><span className="k">consistent terms</span><span className="v">One word per concept. Groupings are <b>layers</b>. Keep counts current — <b>{TOOL_COUNT} tools, {LAYER_COUNT} layers</b>.</span></div>
            <div className="guard-item"><span className="k">tap targets</span><span className="v">Every interactive target <b>≥ 44px</b>.</span></div>
            <div className="guard-item"><span className="k">limit the palette</span><span className="v">Five supporting accents are <b>accents</b>, not a rainbow.</span></div>
            <div className="guard-item"><span className="k">logo restraint</span><span className="v">The brand shows through <b>type, color, and voice</b> without leaning on the mark.</span></div>
          </div>
        </section>

        <footer id="footer">RavenMCP design system · generated from site/index.html :root + ~/.raven/creative/brands/ravenmcp.json</footer>

      </div>

      <DesignSystemScripts />
    </>
  )
}
