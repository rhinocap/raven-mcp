import type { Metadata } from 'next';
import '../docs/docs.css';
import './motion.css';
import MotionFrame from './MotionFrame';

export const metadata: Metadata = {
  title: 'Motion playground — RavenMCP',
  description: 'A motion playground built by create_motion_playground: live controls in designer language and copyable exports.',
  alternates: { canonical: '/motion' },
};

export default function MotionPage() {
  return (
    <main id="main" className="motion-wrap">
      <div className="reveal">
        <h1>Motion playground</h1>
        <p className="subtitle">
          One self-contained page for tuning an animation with live controls, then copying the result out as an embed, settings JSON, an SVG frame or a taste decision.
          Ask your agent for one with <code>create_motion_playground</code>; it starts from your taste binding&rsquo;s motion notes.
        </p>
      </div>

      <MotionFrame src="/playgrounds/keyfob.html" title="Motion playground: key hover-jingle" />

      <h2>The call that made it</h2>
      <pre className="motion-call"><code>create_motion_playground({'{'} motif: &quot;keyfob&quot; {'}'})</code></pre>
    </main>
  );
}
