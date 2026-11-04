import type { Metadata } from 'next'
import Coachmarks from './Coachmarks'
import NorthstarWireframe from '../_northstar/NorthstarWireframe'
import { PLAYGROUND_CSS } from '../_northstar/playgroundCss'
import { ravenGrabConfig } from '../_northstar/grabConfig'

export const metadata: Metadata = {
  title: 'Raven Design — Live Demo | RavenMCP',
  description: 'Pair design with your agent on a live, token-driven product wireframe.',
  alternates: { canonical: '/raven-design' },
  openGraph: {
    url: 'https://ravenmcp.ai/raven-design',
    title: 'Raven Design — Live Demo | RavenMCP',
    description: 'Pair design with your agent on a live, token-driven product wireframe.',
  },
}

// The Motion tab reads the prebuilt suggestions for this wireframe (see /motion), so it
// needs no local bridge. Layers stays the tab that opens first.
const designGrabConfig = { ...ravenGrabConfig, motion: 'static' }

export default function PlaygroundPage() {
  return (
    <main id="main" className="playground-page">
      <section className="playground-intro">
        <div className="container">
          <h1>Raven Design — pair designing with your agent</h1>
          <p>
            Click any element, swap tokens, edit styles, or request a component.
          </p>
        </div>
      </section>

      <section className="playground-stage" aria-labelledby="wireframe-title">
        <div className="container">
          <div className="playground-stage-heading">
            <p>Select a FeatureCard under Features to see Scope (“All 3 like this”) and tokenized Styles.</p>
          </div>

          <Coachmarks config={designGrabConfig} />

          <NorthstarWireframe />
        </div>
      </section>

      {/* dangerouslySetInnerHTML avoids a hydration text mismatch on the raw style child */}
      <style dangerouslySetInnerHTML={{ __html: PLAYGROUND_CSS }} />

    </main>
  )
}
