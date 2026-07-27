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
      <p>Your source code, design files, and screenshots never leave your machine, except when a tool you invoked explicitly reaches outward — see below. There is no analytics SDK, no telemetry beacon, and no account required to run Raven locally.</p>

      <h2>Taste Engine data</h2>
      <p>Taste profiles and decisions are stored locally at <code>~/.raven/taste</code>. If you connect to the hosted endpoint at <code>mcp.ravenmcp.ai</code>, your taste data is stored per-user, keyed to your OAuth identity. The only personal data that identity carries is the email address and user ID your sign-in provider returns; it is used to keep your taste data separate from everyone else&rsquo;s and for nothing else. Delete it any time with <code>delete_taste_data</code>, which removes the server-side record as well.</p>

      <h2>Who else touches your data</h2>
      <p>Two processors, on the hosted endpoint only: <strong>WorkOS</strong> (AuthKit) handles sign-in and holds your email address and user ID; <strong>Upstash</strong> (Redis) stores the taste data itself. Nothing is sold, and nothing is shared with anyone else. If you only run Raven locally, neither is involved.</p>
      <p>Tools you invoke that reach outward — an audit of a URL you passed, a generation tool calling a provider you configured with your own API key — send data from your machine straight to that destination. Raven does not proxy or store those calls.</p>

      <h2>Retention</h2>
      <p>Local data — taste profiles, the usage log — lives on your machine and persists until you delete it or uninstall Raven. Nothing expires on its own. Hosted taste data persists until you delete it with <code>delete_taste_data</code> or ask us to; that removes the stored record.</p>

      <h2>Contact</h2>
      <p>andrew@ravenmcp.ai — or open an issue at <a href="https://github.com/rhinocap/raven-mcp/issues">github.com/rhinocap/raven-mcp/issues</a>.</p>

      <p className="privacy-updated">Last updated 25 July 2026.</p>
    </main>
  );
}
