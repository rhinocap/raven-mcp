import type { Metadata } from 'next';
import '../docs/docs.css';
import './privacy.css';

export const metadata: Metadata = {
  title: 'Privacy — RavenMCP',
  description: 'What Raven collects, what it does not, and how Taste Engine data is stored.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <main id="main" className="privacy-wrap">
      <div className="reveal">
        <h1>Privacy</h1>
        <p className="subtitle">What Raven collects, what it doesn&rsquo;t, and where your data lives.</p>
      </div>

      <h2>What Raven collects</h2>
      <p>Raven runs locally as an MCP server on your machine. It reads what you point it at — a URL, a screenshot, a DESIGN.md — and returns design findings. It writes an anonymous local usage log (which tools ran, how often, whether they succeeded) to your own machine. Nothing in that log is transmitted. <code>RAVEN_NO_USAGE_LOG=1</code> turns it off.</p>

      <h2>What Raven does not collect</h2>
      <p>Your source code, design files, and screenshots never leave your machine, except when a tool you invoked explicitly fetches something — an audit of a URL you passed, or a generation tool calling a provider you configured with your own API key. Those calls go from your machine to that provider directly. Raven does not proxy or store them.</p>

      <h2>Taste Engine data</h2>
      <p>Taste profiles and decisions are stored locally at <code>~/.raven/taste</code>. If you connect to the hosted endpoint at <code>mcp.ravenmcp.ai</code>, your taste data is stored per-user, keyed to your OAuth identity (WorkOS AuthKit for sign-in, Upstash Redis for storage). Delete it any time with <code>delete_taste_data</code>, which removes the server-side record as well.</p>

      <h2>Third-party sharing</h2>
      <p>None beyond the explicit calls above that you initiate.</p>

      <h2>Retention</h2>
      <p>Local data persists until you delete it or uninstall. Hosted data persists until you delete it.</p>

      <h2>Contact</h2>
      <p>andrew@ravenmcp.ai — or open an issue at <a href="https://github.com/rhinocap/raven-mcp/issues">github.com/rhinocap/raven-mcp/issues</a>.</p>
    </main>
  );
}
