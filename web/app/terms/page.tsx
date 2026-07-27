import type { Metadata } from 'next';
import '../docs/docs.css';
import '../privacy/privacy.css';

export const metadata: Metadata = {
  title: 'Terms — RavenMCP',
  description: 'Terms of service for the Raven MCP server, the hosted endpoint, and the marketing site.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <main id="main" className="privacy-wrap">
      <div className="reveal">
        <h1>Terms of Service</h1>
        <p className="subtitle">What you may do with Raven, and what we promise (and don&rsquo;t).</p>
      </div>

      <h2>What these terms cover</h2>
      <p>They cover three things: the <strong>Raven MCP server</strong> you install and run yourself, the <strong>hosted endpoint</strong> at <code>mcp.ravenmcp.ai</code>, and this site. Using any of them means you accept these terms. If you don&rsquo;t, don&rsquo;t use them.</p>

      <h2>The software</h2>
      <p>Raven is open source under the <a href="https://github.com/rhinocap/raven-mcp/blob/main/LICENSE">Apache License 2.0</a>. That license governs the code — copying, modifying, redistributing, patent grant, and the attribution and NOTICE requirements. Nothing here narrows the rights it gives you. Where these terms and the Apache License disagree about the code, the license wins.</p>

      <h2>The hosted endpoint</h2>
      <p>The hosted endpoint is free and provided as-is while in beta. To use it you sign in, which creates an account keyed to the email address and user ID your sign-in provider returns. You are responsible for what happens under your account. Requests are rate-limited and request bodies are capped; those limits can change without notice. We may suspend or remove an account that is abusing the service, and we may change or discontinue the hosted endpoint at any time. The self-hosted server keeps working regardless — it does not depend on us.</p>

      <h2>Acceptable use</h2>
      <p>Don&rsquo;t use Raven to break the law, to attack or overload systems you don&rsquo;t control, to circumvent the rate limits, or to point audit tools at sites you have no right to test. Don&rsquo;t upload content you don&rsquo;t have the rights to.</p>

      <h2>Your content</h2>
      <p>You keep every right you have in the pages, screenshots, design systems, and taste data you put through Raven. We claim no ownership of it. We use it only to run the tool you invoked and, on the hosted endpoint, to store your taste data so you can read it back. See the <a href="/privacy">Privacy page</a> for what is stored and where, and for how to delete it.</p>

      <h2>What Raven&rsquo;s output is and isn&rsquo;t</h2>
      <p>Raven returns design findings and suggested fixes. They are advisory. Accessibility findings — contrast ratios, tap-target sizes — are measurements of what was rendered, not a legal compliance certification, and no automated tool can substitute for human accessibility testing. Review the output before you act on it.</p>

      <h2>No warranty</h2>
      <p>Raven and the hosted endpoint are provided &ldquo;as is&rdquo;, without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the service will be uninterrupted, error-free, or that its findings are complete or correct.</p>

      <h2>Limitation of liability</h2>
      <p>To the maximum extent the law allows, we are not liable for any indirect, incidental, special, consequential, or exemplary damages, or for lost profits, data, or goodwill, arising from your use of Raven or the hosted endpoint. Our total liability for any claim relating to them is limited to the amount you paid us for them, which for the free tier is zero.</p>

      <h2>Changes</h2>
      <p>We may update these terms. Material changes will be noted by the date below. Continuing to use the hosted endpoint after a change means you accept the updated terms.</p>

      <h2>Contact</h2>
      <p>andrew@ravenmcp.ai — or open an issue at <a href="https://github.com/rhinocap/raven-mcp/issues">github.com/rhinocap/raven-mcp/issues</a>.</p>

      <p className="privacy-updated">Last updated 26 July 2026.</p>
    </main>
  );
}
