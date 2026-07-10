import type { Metadata } from 'next'
import Coachmarks from './Coachmarks'

export const metadata: Metadata = {
  title: 'Raven Design — Live Demo | RavenMCP',
  description: 'Pair design with your agent on a live, token-driven product wireframe.',
}

const ravenGrabConfig = {
  mode: 'standalone',
  // cssVar must match the --demo-* custom properties on .playground-wireframe,
  // or the overlay can't map grabbed declarations back to these tokens.
  tokens: {
    'colors.accent': { value: '#00BFFF', cssVar: '--demo-colors-accent' },
    'colors.primary': { value: '#F0F0F2', cssVar: '--demo-colors-primary' },
    'colors.surface': { value: '#212129', cssVar: '--demo-colors-surface' },
    'colors.surface-raised': { value: '#2A2A33', cssVar: '--demo-colors-surface-raised' },
    'colors.muted': { value: '#9498A0', cssVar: '--demo-colors-muted' },
    'colors.line': { value: 'rgba(240, 240, 242, 0.12)', cssVar: '--demo-colors-line' },
    'rounded.sm': { value: '6px', cssVar: '--demo-rounded-sm' },
    'rounded.md': { value: '12px', cssVar: '--demo-rounded-md' },
    'rounded.lg': { value: '20px', cssVar: '--demo-rounded-lg' },
    'spacing.xs': { value: '4px', cssVar: '--demo-spacing-xs' },
    'spacing.sm': { value: '8px', cssVar: '--demo-spacing-sm' },
    'spacing.md': { value: '16px', cssVar: '--demo-spacing-md' },
    'spacing.lg': { value: '24px', cssVar: '--demo-spacing-lg' },
    'spacing.xl': { value: '40px', cssVar: '--demo-spacing-xl' },
    'text.family': { value: 'Arial, sans-serif', cssVar: '--demo-text-family' },
    'text.display.size': { value: '30px', cssVar: '--demo-text-display-size' },
    'text.display.line-height': { value: '1.1', cssVar: '--demo-text-display-line-height' },
    'text.display.weight': { value: '600', cssVar: '--demo-text-display-weight' },
    'text.title.size': { value: '18px', cssVar: '--demo-text-title-size' },
    'text.title.line-height': { value: '1.3', cssVar: '--demo-text-title-line-height' },
    'text.title.weight': { value: '600', cssVar: '--demo-text-title-weight' },
    'text.body.size': { value: '14px', cssVar: '--demo-text-body-size' },
    'text.body.line-height': { value: '1.6', cssVar: '--demo-text-body-line-height' },
    'text.body.weight': { value: '400', cssVar: '--demo-text-body-weight' },
    'text.caption.size': { value: '12px', cssVar: '--demo-text-caption-size' },
    'text.caption.line-height': { value: '1.4', cssVar: '--demo-text-caption-line-height' },
    'text.caption.weight': { value: '400', cssVar: '--demo-text-caption-weight' },
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
          <h1>Raven Design — pair designing with your agent</h1>
          <p>
            Click any element, swap tokens, edit styles, or request a component.
          </p>
        </div>
      </section>

      <section className="playground-stage" aria-labelledby="wireframe-title">
        <div className="container">
          <div className="playground-stage-heading">
            <p className="label">Live wireframe</p>
            <p>Select any block, type style, control, or section to inspect it.</p>
          </div>

          <Coachmarks config={ravenGrabConfig} />

          <article className="playground-wireframe">
            <nav className="wireframe-nav" aria-label="Demo navigation">
              <a className="wireframe-logo" href="#wireframe-title" aria-label="Northstar home">
                <span aria-hidden="true" />
                Northstar
              </a>
              <div className="wireframe-nav__links">
                <a href="#overview">Overview</a>
                <a href="#features">Features</a>
                <a href="#contact">Contact</a>
              </div>
              <a className="wireframe-button wireframe-button--primary" href="#contact">
                Open dashboard
              </a>
            </nav>

            <section className="wireframe-hero" id="overview">
              <div className="wireframe-hero__copy">
                <p className="wireframe-caption">Workspace overview</p>
                <h2 id="wireframe-title">Keep project work in one clear view.</h2>
                <p className="wireframe-body">
                  Review active work, share updates, and collect project notes without switching tools.
                </p>
                <div className="wireframe-actions">
                  <a className="wireframe-button wireframe-button--primary" href="#features">
                    View features
                  </a>
                  <a className="wireframe-button wireframe-button--secondary" href="#contact">
                    Contact team
                  </a>
                </div>
              </div>
              <div className="wireframe-placeholder" aria-label="Dashboard image placeholder">
                <div className="wireframe-placeholder__bar" />
                <div className="wireframe-placeholder__grid">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </section>

            <section className="wireframe-features" id="features" aria-label="Features">
              <article className="wireframe-feature-card">
                <div className="wireframe-icon" aria-hidden="true" />
                <h3>Project status</h3>
                <p>See owners, dates, and progress for each active workstream.</p>
              </article>
              <article className="wireframe-feature-card">
                <div className="wireframe-icon" aria-hidden="true" />
                <h3>Shared notes</h3>
                <p>Keep decisions and working context attached to the project.</p>
              </article>
              <article className="wireframe-feature-card">
                <div className="wireframe-icon" aria-hidden="true" />
                <h3>Weekly updates</h3>
                <p>Send a concise record of what changed and what comes next.</p>
              </article>
            </section>

            <section className="wireframe-form-section" id="contact">
              <div className="wireframe-form-section__intro">
                <p className="wireframe-caption">Project request</p>
                <h3>Start a workspace</h3>
                <p>Share a project name and a short note. The workspace can be adjusted later.</p>
              </div>
              <form className="wireframe-form">
                <div className="wireframe-field">
                  <label htmlFor="project-name">Project name</label>
                  <input id="project-name" name="project-name" type="text" placeholder="Website refresh" />
                </div>
                <div className="wireframe-field">
                  <label htmlFor="project-notes">Project notes</label>
                  <textarea id="project-notes" name="project-notes" rows={4} placeholder="What needs to be tracked?" />
                </div>
                <button className="wireframe-button wireframe-button--primary" type="button">
                  Create workspace
                </button>
                <button className="wireframe-button wireframe-button--secondary" type="button" disabled>
                  Workspace unavailable
                </button>
              </form>
            </section>

            <footer className="wireframe-footer">
              <p>© 2026 Northstar Workspace</p>
              <div className="wireframe-footer__links">
                <span>Privacy</span>
                <span>Terms</span>
                <a href="#contact">Support</a>
              </div>
            </footer>
          </article>
        </div>
      </section>

      {/* dangerouslySetInnerHTML avoids a hydration text mismatch on the raw style child */}
      <style dangerouslySetInnerHTML={{ __html: `
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
          max-width: var(--max-width);
          margin: 0 auto var(--space-6);
        }

        .playground-stage-heading p:last-child {
          color: var(--text-tertiary);
          font-size: 14px;
        }

        .playground-wireframe {
          --demo-colors-accent: #00BFFF;
          --demo-colors-primary: #F0F0F2;
          --demo-colors-surface: #212129;
          --demo-colors-surface-raised: #2A2A33;
          --demo-colors-muted: #9498A0;
          --demo-colors-line: rgba(240, 240, 242, 0.12);
          --demo-rounded-sm: 6px;
          --demo-rounded-md: 12px;
          --demo-rounded-lg: 20px;
          --demo-spacing-xs: 4px;
          --demo-spacing-sm: 8px;
          --demo-spacing-md: 16px;
          --demo-spacing-lg: 24px;
          --demo-spacing-xl: 40px;
          --demo-text-family: Arial, sans-serif;
          --demo-text-display-size: 30px;
          --demo-text-display-line-height: 1.1;
          --demo-text-display-weight: 600;
          --demo-text-title-size: 18px;
          --demo-text-title-line-height: 1.3;
          --demo-text-title-weight: 600;
          --demo-text-body-size: 14px;
          --demo-text-body-line-height: 1.6;
          --demo-text-body-weight: 400;
          --demo-text-caption-size: 12px;
          --demo-text-caption-line-height: 1.4;
          --demo-text-caption-weight: 400;

          width: 100%;
          margin: 0 auto;
          overflow: hidden;
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-lg);
          font-family: var(--demo-text-family);
        }

        .playground-wireframe a,
        .playground-wireframe button,
        .playground-wireframe input,
        .playground-wireframe textarea {
          font-family: var(--demo-text-family);
        }

        .wireframe-nav {
          display: flex;
          align-items: center;
          gap: var(--demo-spacing-lg);
          padding: var(--demo-spacing-md) var(--demo-spacing-lg);
          border-bottom: 1px solid var(--demo-colors-line);
        }

        .wireframe-logo {
          display: inline-flex;
          align-items: center;
          gap: var(--demo-spacing-sm);
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          margin-right: auto;
          color: var(--demo-colors-primary);
          font-size: var(--demo-text-title-size);
          line-height: var(--demo-text-title-line-height);
          font-weight: var(--demo-text-title-weight);
        }

        .wireframe-logo span {
          width: var(--demo-spacing-lg);
          height: var(--demo-spacing-lg);
          background: var(--demo-colors-primary);
          border-radius: var(--demo-rounded-sm);
        }

        .wireframe-nav__links,
        .wireframe-footer__links {
          display: flex;
          align-items: center;
          gap: var(--demo-spacing-lg);
          color: var(--demo-colors-muted);
          font-size: var(--demo-text-caption-size);
          line-height: var(--demo-text-caption-line-height);
          font-weight: var(--demo-text-caption-weight);
        }

        .wireframe-nav__links a:hover,
        .wireframe-footer__links a:hover {
          color: var(--demo-colors-primary);
        }

        .wireframe-nav__links a,
        .wireframe-footer__links a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
        }

        .wireframe-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr);
          align-items: center;
          gap: var(--demo-spacing-xl);
          padding: calc(var(--demo-spacing-xl) * 1.5) var(--demo-spacing-xl);
          border-bottom: 1px solid var(--demo-colors-line);
        }

        .wireframe-hero__copy {
          display: grid;
          gap: var(--demo-spacing-md);
        }

        .wireframe-caption {
          color: var(--demo-colors-accent);
          font-size: var(--demo-text-caption-size);
          line-height: var(--demo-text-caption-line-height);
          font-weight: var(--demo-text-caption-weight);
          text-transform: uppercase;
        }

        .wireframe-hero h2 {
          max-width: 540px;
          color: var(--demo-colors-primary);
          font-size: var(--demo-text-display-size);
          line-height: var(--demo-text-display-line-height);
          font-weight: var(--demo-text-display-weight);
        }

        .wireframe-body {
          max-width: 520px;
          color: var(--demo-colors-muted);
          font-size: var(--demo-text-body-size);
          line-height: var(--demo-text-body-line-height);
          font-weight: var(--demo-text-body-weight);
        }

        .wireframe-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--demo-spacing-sm);
          margin-top: var(--demo-spacing-sm);
        }

        .wireframe-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          padding: var(--demo-spacing-sm) var(--demo-spacing-md);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-sm);
          font-size: var(--demo-text-body-size);
          line-height: var(--demo-text-body-line-height);
          font-weight: var(--demo-text-title-weight);
          cursor: pointer;
        }

        .wireframe-button--primary {
          color: var(--demo-colors-surface);
          background: var(--demo-colors-accent);
          border-color: var(--demo-colors-accent);
        }

        .wireframe-button:hover {
          border-color: var(--demo-colors-accent);
        }

        .wireframe-button--primary:hover {
          color: var(--demo-colors-surface);
          background: var(--demo-colors-primary);
          border-color: var(--demo-colors-primary);
        }

        .wireframe-button--secondary {
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface-raised);
        }

        .wireframe-button--secondary:hover {
          color: var(--demo-colors-accent);
          border-color: var(--demo-colors-accent);
        }

        .wireframe-button:active {
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface-raised);
        }

        .wireframe-button:disabled {
          color: var(--demo-colors-muted);
          background: var(--demo-colors-surface);
          border-color: var(--demo-colors-line);
          cursor: not-allowed;
          opacity: 0.6;
        }

        .wireframe-button:focus-visible,
        .playground-wireframe a:focus-visible,
        .wireframe-field input:focus-visible,
        .wireframe-field textarea:focus-visible {
          outline: 2px solid var(--demo-colors-accent);
          outline-offset: var(--demo-spacing-xs);
        }

        .wireframe-field input:focus {
          border-color: var(--demo-colors-accent);
          outline: 2px solid var(--demo-colors-accent);
          outline-offset: var(--demo-spacing-xs);
        }

        .wireframe-placeholder {
          display: grid;
          gap: var(--demo-spacing-md);
          min-height: 260px;
          padding: var(--demo-spacing-md);
          background: var(--demo-colors-surface-raised);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-md);
        }

        .wireframe-placeholder__bar {
          width: 42%;
          height: var(--demo-spacing-sm);
          background: var(--demo-colors-muted);
          border-radius: var(--demo-rounded-sm);
        }

        .wireframe-placeholder__grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--demo-spacing-sm);
        }

        .wireframe-placeholder__grid span {
          background: var(--demo-colors-surface);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-sm);
        }

        .wireframe-features {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--demo-spacing-md);
          padding: var(--demo-spacing-xl);
          border-bottom: 1px solid var(--demo-colors-line);
        }

        .wireframe-feature-card {
          display: grid;
          align-content: start;
          gap: var(--demo-spacing-md);
          padding: var(--demo-spacing-lg);
          background: var(--demo-colors-surface-raised);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-md);
        }

        .wireframe-icon {
          width: var(--demo-spacing-xl);
          height: var(--demo-spacing-xl);
          background: var(--demo-colors-surface);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-sm);
        }

        .wireframe-feature-card h3,
        .wireframe-form-section h3 {
          color: var(--demo-colors-primary);
          font-size: var(--demo-text-title-size);
          line-height: var(--demo-text-title-line-height);
          font-weight: var(--demo-text-title-weight);
        }

        .wireframe-feature-card p,
        .wireframe-form-section__intro > p:last-child {
          color: var(--demo-colors-muted);
          font-size: var(--demo-text-body-size);
          line-height: var(--demo-text-body-line-height);
          font-weight: var(--demo-text-body-weight);
        }

        .wireframe-form-section {
          display: grid;
          grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
          gap: var(--demo-spacing-xl);
          padding: var(--demo-spacing-xl);
          border-bottom: 1px solid var(--demo-colors-line);
        }

        .wireframe-form-section__intro,
        .wireframe-form {
          display: grid;
          align-content: start;
          gap: var(--demo-spacing-md);
        }

        .wireframe-form {
          padding: var(--demo-spacing-lg);
          background: var(--demo-colors-surface-raised);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-md);
        }

        .wireframe-field {
          display: grid;
          gap: var(--demo-spacing-sm);
        }

        .wireframe-field label {
          display: flex;
          align-items: center;
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          color: var(--demo-colors-primary);
          font-size: var(--demo-text-caption-size);
          line-height: var(--demo-text-caption-line-height);
          font-weight: var(--demo-text-title-weight);
        }

        .wireframe-field input,
        .wireframe-field textarea {
          width: 100%;
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          padding: var(--demo-spacing-sm) var(--demo-spacing-md);
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-sm);
          font-size: var(--demo-text-body-size);
          line-height: var(--demo-text-body-line-height);
          font-weight: var(--demo-text-body-weight);
          resize: vertical;
        }

        .wireframe-field input::placeholder,
        .wireframe-field textarea::placeholder {
          color: var(--demo-colors-muted);
          opacity: 1;
        }

        .wireframe-form .wireframe-button {
          justify-self: start;
          margin-top: var(--demo-spacing-sm);
        }

        .wireframe-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--demo-spacing-lg);
          padding: var(--demo-spacing-lg) var(--demo-spacing-xl);
          color: var(--demo-colors-muted);
          font-size: var(--demo-text-caption-size);
          line-height: var(--demo-text-caption-line-height);
          font-weight: var(--demo-text-caption-weight);
        }

        .playground-controls {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          margin-bottom: var(--space-4);
        }

        @media (min-width: 1440px) {
          /* Make room for the controls pill: narrow the site nav on this page only. */
          raven-nav {
            --max-width: min(1140px, calc(100vw - 704px));
          }

          .playground-controls {
            position: fixed;
            top: 12px;
            left: 16px;
            z-index: 100;
            height: var(--nav-height, 64px);
            margin-bottom: 0;
          }
        }

        .playground-role-toggle {
          display: inline-flex;
          padding: var(--space-1);
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-sm);
        }

        .playground-role-toggle button {
          min-height: 44px;
          padding: 0 var(--space-4);
          color: var(--text-secondary);
          background: transparent;
          border: 0;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        }

        .playground-role-toggle button:hover {
          color: var(--text-primary);
        }

        .playground-role-toggle button[aria-pressed="true"] {
          color: var(--text-primary);
          background: var(--bg-raised);
        }

        .playground-replay {
          padding: 0;
          color: var(--text-secondary);
          background: transparent;
          border: 0;
          cursor: pointer;
          font-size: 13px;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .playground-replay:hover {
          color: var(--accent-blue);
        }

        .playground-tour__backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483640;
          background: rgba(10, 10, 18, 0.55);
        }

        .playground-tour__spotlight {
          position: fixed;
          z-index: 2147483641;
          border: 2px solid var(--accent-blue);
          border-radius: var(--radius-sm);
          box-shadow: 0 0 0 9999px rgba(10, 10, 18, 0.55);
          pointer-events: none;
        }

        .playground-tour__card {
          z-index: 2147483642;
          padding: var(--space-6);
          color: var(--text-primary);
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-md);
          box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.5);
        }

        .playground-tour__card h3 {
          margin: 0 0 var(--space-2);
          font-size: 16px;
          font-weight: 600;
        }

        .playground-tour__card > p:not(.playground-tour__count) {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.6;
        }

        .playground-tour__count {
          margin: 0 0 var(--space-2);
          color: var(--text-secondary);
          font-size: 13px;
        }

        .playground-tour__actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: var(--space-4);
        }

        .playground-tour__actions button {
          min-height: 44px;
          padding: 0 var(--space-4);
          color: var(--text-secondary);
          background: transparent;
          border: 0;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        }

        .playground-tour__actions button:hover {
          color: var(--text-primary);
        }

        .playground-tour__next {
          color: var(--text-on-accent) !important;
          background: var(--accent-blue) !important;
        }

        .playground-tour__next:hover {
          filter: brightness(1.1);
        }

        @media (max-width: 640px) {
          .playground-tour__card {
            right: 16px !important;
            left: 16px !important;
            width: auto !important;
          }

          .playground-intro {
            padding-top: calc(var(--nav-height) + var(--space-12));
          }

          .playground-stage-heading {
            display: block;
          }

          .playground-stage-heading p:last-child {
            margin-top: var(--space-2);
          }

          .wireframe-nav {
            flex-wrap: wrap;
            gap: var(--demo-spacing-md);
            padding: var(--demo-spacing-md);
          }

          .wireframe-nav__links {
            order: 3;
            width: 100%;
            justify-content: space-between;
            padding-top: var(--demo-spacing-sm);
            border-top: 1px solid var(--demo-colors-line);
          }

          .wireframe-hero,
          .wireframe-form-section {
            grid-template-columns: 1fr;
            gap: var(--demo-spacing-lg);
            padding: var(--demo-spacing-lg);
          }

          .wireframe-placeholder {
            min-height: 220px;
          }

          .wireframe-features {
            grid-template-columns: 1fr;
            padding: var(--demo-spacing-lg);
          }

          .wireframe-footer {
            align-items: flex-start;
            flex-direction: column;
            padding: var(--demo-spacing-lg);
          }
        }
      ` }} />

    </main>
  )
}
