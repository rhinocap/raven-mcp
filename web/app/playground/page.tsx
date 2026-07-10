import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Raven Grab — Live Demo | RavenMCP',
  description: 'Try Raven Grab on a live, token-driven product card.',
}

const ravenGrabConfig = {
  mode: 'standalone',
  // cssVar must match the --demo-* custom properties on .playground-demo-card,
  // or the overlay can't map grabbed declarations back to these tokens.
  tokens: {
    'colors.accent': { value: '#00BFFF', cssVar: '--demo-colors-accent' },
    'colors.primary': { value: '#F0F0F2', cssVar: '--demo-colors-primary' },
    'colors.surface': { value: '#212129', cssVar: '--demo-colors-surface' },
    'colors.muted': { value: '#9498A0', cssVar: '--demo-colors-muted' },
    'rounded.md': { value: '12px', cssVar: '--demo-rounded-md' },
    'rounded.lg': { value: '20px', cssVar: '--demo-rounded-lg' },
    'spacing.sm': { value: '8px', cssVar: '--demo-spacing-sm' },
    'spacing.md': { value: '16px', cssVar: '--demo-spacing-md' },
    'spacing.lg': { value: '24px', cssVar: '--demo-spacing-lg' },
  },
  grabEndpoint: null,
  componentRequestEndpoint: '/api/component-request',
}

export default function PlaygroundPage() {
  return (
    <main id="main" className="playground-page">
      <section className="playground-intro">
        <div className="container">
          <p className="label">Playground</p>
          <h1>Raven Grab — live demo</h1>
          <p>
            Click any element, swap tokens, edit styles, or request a component.
          </p>
        </div>
      </section>

      <section className="playground-stage" aria-labelledby="demo-card-title">
        <div className="container">
          <div className="playground-stage-heading">
            <p className="label">Grabbable demo</p>
            <p>Select the card, its copy, or either button to inspect it.</p>
          </div>

          <article className="playground-demo-card">
            <div className="playground-demo-card__eyebrow">Raven Cloud</div>
            <div className="playground-demo-card__heading">
              <div>
                <h2 id="demo-card-title">Design review, on demand.</h2>
                <p>Audit one live product surface with evidence your team can act on.</p>
              </div>
              <div className="playground-demo-card__price" aria-label="$24 per month">
                <strong>$24</strong>
                <span>/ month</span>
              </div>
            </div>

            <ul className="playground-demo-card__features">
              <li><span aria-hidden="true">✓</span> One production URL</li>
              <li><span aria-hidden="true">✓</span> Token and accessibility checks</li>
              <li><span aria-hidden="true">✓</span> A prioritized fix list</li>
            </ul>

            <div className="playground-demo-card__actions">
              <button type="button" className="playground-demo-card__primary">Start review</button>
              <button type="button" className="playground-demo-card__secondary">See sample</button>
            </div>
          </article>
        </div>
      </section>

      <style>{`
        .playground-page {
          min-height: 100vh;
          padding-bottom: var(--space-24);
        }

        .playground-intro {
          padding: calc(var(--nav-height) + var(--space-20)) 0 var(--space-12);
          text-align: center;
        }

        .playground-intro .label {
          margin-bottom: var(--space-3);
        }

        .playground-intro h1 {
          color: var(--text-primary);
          font-size: clamp(42px, 6vw, 72px);
          line-height: var(--leading-heading);
          letter-spacing: -0.045em;
        }

        .playground-intro p:last-child {
          max-width: 640px;
          margin: var(--space-5) auto 0;
          color: var(--text-secondary);
        }

        .playground-stage {
          padding: var(--space-10) 0 var(--space-20);
        }

        .playground-stage-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-6);
          max-width: 760px;
          margin: 0 auto var(--space-6);
        }

        .playground-stage-heading p:last-child {
          color: var(--text-tertiary);
          font-size: 14px;
        }

        .playground-demo-card {
          --demo-colors-accent: #00BFFF;
          --demo-colors-primary: #F0F0F2;
          --demo-colors-surface: #212129;
          --demo-colors-muted: #9498A0;
          --demo-rounded-md: 12px;
          --demo-rounded-lg: 20px;
          --demo-spacing-sm: 8px;
          --demo-spacing-md: 16px;
          --demo-spacing-lg: 24px;

          width: min(100%, 760px);
          margin: 0 auto;
          padding: calc(var(--demo-spacing-lg) * 1.5);
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface);
          border: 1px solid color-mix(in srgb, var(--demo-colors-primary) 10%, transparent);
          border-radius: var(--demo-rounded-lg);
          box-shadow: 0 24px 70px color-mix(in srgb, var(--color-black) 42%, transparent);
        }

        .playground-demo-card__eyebrow {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 0 var(--demo-spacing-sm);
          color: var(--demo-colors-accent);
          background: color-mix(in srgb, var(--demo-colors-accent) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--demo-colors-accent) 28%, transparent);
          border-radius: calc(var(--demo-rounded-md) / 2);
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .playground-demo-card__heading {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: calc(var(--demo-spacing-lg) * 2);
          align-items: start;
          padding: calc(var(--demo-spacing-lg) * 1.25) 0;
          border-bottom: 1px solid color-mix(in srgb, var(--demo-colors-primary) 8%, transparent);
        }

        .playground-demo-card h2 {
          max-width: 520px;
          color: var(--demo-colors-primary);
          font-size: clamp(30px, 4.5vw, 48px);
          line-height: 1.05;
          letter-spacing: -0.04em;
        }

        .playground-demo-card__heading p {
          max-width: 500px;
          margin-top: var(--demo-spacing-md);
          color: var(--demo-colors-muted);
          font-size: 16px;
          line-height: 1.6;
        }

        .playground-demo-card__price {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          color: var(--demo-colors-muted);
          font-size: 13px;
          white-space: nowrap;
        }

        .playground-demo-card__price strong {
          color: var(--demo-colors-primary);
          font-size: 32px;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .playground-demo-card__features {
          display: grid;
          gap: var(--demo-spacing-md);
          padding: calc(var(--demo-spacing-lg) * 1.25) 0;
          color: var(--demo-colors-muted);
          font-size: 15px;
        }

        .playground-demo-card__features li {
          display: flex;
          align-items: center;
          gap: var(--demo-spacing-md);
        }

        .playground-demo-card__features span {
          color: var(--demo-colors-accent);
          font-family: var(--font-mono);
        }

        .playground-demo-card__actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--demo-spacing-md);
        }

        .playground-demo-card__actions button {
          min-height: 48px;
          padding: 0 var(--demo-spacing-lg);
          border-radius: var(--demo-rounded-md);
          font: 600 14px/1 var(--font-body);
          cursor: pointer;
          transition: transform var(--duration-fast) var(--ease-out), background var(--duration-fast), border-color var(--duration-fast);
        }

        .playground-demo-card__actions button:hover {
          transform: translateY(-2px);
        }

        .playground-demo-card__primary {
          color: var(--text-on-accent);
          background: var(--demo-colors-accent);
          border: 1px solid var(--demo-colors-accent);
        }

        .playground-demo-card__secondary {
          color: var(--demo-colors-primary);
          background: transparent;
          border: 1px solid color-mix(in srgb, var(--demo-colors-primary) 14%, transparent);
        }

        .playground-demo-card__secondary:hover {
          border-color: color-mix(in srgb, var(--demo-colors-accent) 45%, transparent);
          background: color-mix(in srgb, var(--demo-colors-accent) 6%, transparent);
        }

        @media (max-width: 640px) {
          .playground-intro {
            padding-top: calc(var(--nav-height) + var(--space-12));
          }

          .playground-stage-heading,
          .playground-demo-card__heading {
            display: block;
          }

          .playground-stage-heading p:last-child {
            margin-top: var(--space-2);
          }

          .playground-demo-card {
            padding: var(--demo-spacing-lg);
          }

          .playground-demo-card__price {
            align-items: flex-start;
            margin-top: var(--demo-spacing-lg);
          }

          .playground-demo-card__actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <Script id="raven-grab-config" strategy="afterInteractive">
        {`window.RavenGrabConfig = ${JSON.stringify(ravenGrabConfig)};`}
      </Script>
      <Script src="/raven-grab.js" strategy="afterInteractive" />
    </main>
  )
}
