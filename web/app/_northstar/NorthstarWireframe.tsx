import FeatureCard from '../raven-design/FeatureCard'

// The Northstar sample product page. /raven-design and /motion both stage it, so
// Grab's suggestions and selectors line up with the same markup on both pages.
export default function NorthstarWireframe() {
  return (
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
        <FeatureCard title="Project status">
          See owners, dates, and progress for each active workstream.
        </FeatureCard>
        <FeatureCard title="Shared notes">
          Keep decisions and working context attached to the project.
        </FeatureCard>
        <FeatureCard title="Weekly updates">
          Send a concise record of what changed and what comes next.
        </FeatureCard>
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
  )
}
