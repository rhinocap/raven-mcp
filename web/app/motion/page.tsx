import type { Metadata } from 'next';
import '../docs/docs.css';
import './motion.css';
import MotionFrame from './MotionFrame';
import TryMotion from './TryMotion';

export const metadata: Metadata = {
  title: 'Motion playground — RavenMCP',
  description: 'Find where motion would help on a page, then tune it with live controls in plain designer language and copy the result out.',
  alternates: { canonical: '/motion' },
};

export default function MotionPage() {
  return (
    <main id="main" className="motion-wrap">
      <div className="reveal">
        <h1>Motion playground</h1>
        <p className="subtitle">
          In Raven Grab, the Motion tab looks at the page you are on, finds where motion would help, and opens a playground for each place.
          Drag a control and the motion changes as you drag; copy the result out as code, or send it to your agent.
        </p>
      </div>

      <TryMotion />

      <h2>Start from a motif</h2>
      <p className="subtitle">
        Ask your agent for a playground with <code>create_motion_playground</code>; it starts from your taste binding&rsquo;s motion notes.
      </p>

      <MotionFrame src="/playgrounds/keyfob.html" title="Motion playground: key hover-jingle" />

      <h2>The call that made it</h2>
      <pre className="motion-call"><code>create_motion_playground({'{'} motif: &quot;keyfob&quot; {'}'})</code></pre>
    </main>
  );
}
