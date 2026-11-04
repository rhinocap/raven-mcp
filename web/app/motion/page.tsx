import type { Metadata } from 'next'
import Coachmarks, { type Step } from '../raven-design/Coachmarks'
import NorthstarWireframe from '../_northstar/NorthstarWireframe'
import { PLAYGROUND_CSS } from '../_northstar/playgroundCss'
import { ravenGrabConfig } from '../_northstar/grabConfig'

export const metadata: Metadata = {
  title: 'Raven Motion — Live Demo | RavenMCP',
  description: 'Find the spots on a page that should move, tune each one by hand, and copy the motion into your code.',
  alternates: { canonical: '/motion' },
  openGraph: {
    url: 'https://ravenmcp.ai/motion',
    title: 'Raven Motion — Live Demo | RavenMCP',
    description: 'Find the spots on a page that should move, tune each one by hand, and copy the motion into your code.',
  },
}

// Static: the suggestions and playgrounds were built from this wireframe ahead of
// time (scripts/build-motion-playground.mjs), so nothing here needs a local bridge.
const motionGrabConfig = { ...ravenGrabConfig, motion: 'static', openTab: 'motion' }

const MOTION_STEPS: Step[] = [
  {
    title: 'Raven Motion',
    body: 'Raven looks at a page, picks the spots where motion would help, and builds a playground for each one. Drag a slider, watch it change, then copy the motion into your code.',
    anchor: 'center',
  },
  {
    title: 'Find motion',
    body: 'Press Find motion. Raven numbers the spots on the Northstar page and says why each one should move. Open any suggestion to tune it.',
    anchor: 'grab:[data-motion-find]',
  },
]

export default function MotionPlaygroundPage() {
  return (
    <main id="main" className="playground-page">
      <section className="playground-intro">
        <div className="container">
          <h1>Raven Motion — tune it until it feels right</h1>
          <p>
            Find the spots that should move, drag a slider to tune each one, then copy the motion into your code.
          </p>
        </div>
      </section>

      <section className="playground-stage" aria-labelledby="wireframe-title">
        <div className="container">
          <div className="playground-stage-heading">
            <p>Press Find motion in the Raven Design panel, then open a numbered suggestion.</p>
          </div>

          <Coachmarks
            config={motionGrabConfig}
            steps={MOTION_STEPS}
            tourKey="raven-motion-tour-done"
            stepKey="raven-motion-tour-step"
            showRoles={false}
          />

          <NorthstarWireframe />
        </div>
      </section>

      {/* dangerouslySetInnerHTML avoids a hydration text mismatch on the raw style child */}
      <style dangerouslySetInnerHTML={{ __html: PLAYGROUND_CSS }} />
    </main>
  )
}
