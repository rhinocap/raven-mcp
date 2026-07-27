import type { Metadata } from 'next'
import './changelog.css'
import ChangelogFeed from './ChangelogFeed'

export const metadata: Metadata = {
  title: 'Changelog — RavenMCP',
  description:
    'Everything shipping to RavenMCP — new tools, audits, design-system knowledge, and fixes, in one stream.',
  alternates: { canonical: '/changelog' },
}

export default function ChangelogPage() {
  return (
    <main id="main" className="cl-wrap">
      <section className="cl-hero" aria-labelledby="cl-hero-heading">
        <div className="cl-hero-glow" aria-hidden="true" />
        <h1 id="cl-hero-heading" className="cl-headline">
          Everything
          <span className="cl-headline-accent">we&rsquo;re shipping.</span>
        </h1>
        <p className="cl-lede">
          We ship a new release every Friday. New tools, sharper audits, fresh design
          knowledge, and fixes land constantly — here&rsquo;s every update, in one place.
        </p>
      </section>

      <section className="cl-feed">
        <ChangelogFeed />
        <footer className="cl-foot">
          <a href="/" className="cl-foot-primary">&larr; Back to RavenMCP</a>
          <a href="/docs" className="cl-foot-secondary">Get started</a>
        </footer>
      </section>
    </main>
  )
}
