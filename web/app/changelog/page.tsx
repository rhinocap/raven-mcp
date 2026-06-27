import type { Metadata } from 'next';
import './changelog.css'


export const metadata: Metadata = {
  title: 'Changelog — RavenMCP',
  description:
    'Every RavenMCP release and what changed — new tools, audits, and design-system updates.',
  alternates: { canonical: '/changelog' },
};

export default function ChangelogPage() {
  return (
    <main className="wrap">
      <header className="hero">
        <h1>What&apos;s new in <span className="accent">Raven</span></h1>
        <p>We ship a new release every Friday with fresh design knowledge, new patterns, and fixes. Follow along here.</p>
      </header>

      <article className="release">
        <header className="release-head">
          <h2>v1.6.2</h2>
          <span className="badge badge-patch">patch</span>
          <time dateTime="2026-06-12T19:15:05Z">June 12, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.6.2 — patch release</p>

          <h3>Changes</h3>
          <ul>
            <li>audit_page: token-aware container-width check (#9, part 1) (#10)</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.6.2" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.6.1</h2>
          <span className="badge badge-patch">patch</span>
          <time dateTime="2026-05-29T19:37:31Z">May 29, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.6.1 — patch release</p>

          <h3>Changes</h3>
          <ul>
            <li>46f0fc7 Update changelog for v1.6.0</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.6.1" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.6.0</h2>
          <span className="badge badge-minor">minor</span>
          <time dateTime="2026-05-25T21:43:49Z">May 25, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.6.0 — minor release</p>

          <h3>Changes</h3>
          <ul>
            <li>9f59589 docs: audit_compose spec; handoff; gitignore .gstack/</li>
            <li>d55d083 site: 32 tools, cross-platform audit_screen, Android in audits list</li>
            <li>b5ecffe Fix ios-privacy HealthKit advice; add cross-platform audit_screen</li>
            <li>06363bf site: surface the mobile/native audit tools</li>
            <li>dbdd2c2 CI: bump checkout/setup-node to v5 (Node 24)</li>
            <li>484e013 Update changelog for v1.5.0</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.6.0" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.5.0</h2>
          <span className="badge badge-minor">minor</span>
          <time dateTime="2026-05-25T19:05:45Z">May 25, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.5.0 — minor release</p>

          <h3>Changes</h3>
          <ul>
            <li>fe69624 Add React Native / Expo audit (audit_rn + Expo privacy)</li>
            <li>01e003a Add iOS/SwiftUI audit suite (audit_swiftui, audit_ios_screen, audit_ios_privacy)</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.5.0" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.4.1</h2>
          <span className="badge badge-patch">patch</span>
          <time dateTime="2026-05-22T18:58:41Z">May 22, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.4.1 — patch release</p>

          <h3>Changes</h3>
          <ul>
            <li>cc81189 Refresh site changelog from GitHub release notes</li>
            <li>a9d8937 Reword v1.4.0 changelog entry</li>
            <li>823a04b Update changelog for v1.4.0</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.4.1" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.4.0</h2>
          <span className="badge badge-minor">minor</span>
          <time dateTime="2026-05-19T18:43:45Z">May 19, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.4.0 — minor release</p>

          <h3>Changes</h3>
          <ul>
            <li>Content design systems registry tightened to four canonical references: Mailchimp, GOV.UK, Shopify Polaris, Atlassian. <code>list_content_systems</code> now returns 4 systems.</li>
            <li>Refreshed Laws of UX entries — descriptions tightened and source citations point to primary academic references (Fitts 1954, Hick 1952, Miller 1956, Doherty &amp; Thadani 1982, and others).</li>
            <li>Refreshed Mailchimp content system — original commentary on the publicly documented voice with an explicit attribution field.</li>
            <li>Added <code>NOTICE</code> file at repo root — third-party attribution for every upstream source referenced in <code>src/data/</code>.</li>
            <li>Added <code>CONTRIBUTING.md</code>, <code>CODE_OF_CONDUCT.md</code>, <code>CODEOWNERS</code>, <code>CHANGELOG.md</code>.</li>
            <li>New &quot;License &amp; attribution&quot; section in README pointing to <code>NOTICE</code>.</li>
          </ul>

          <p><strong>Install:</strong> <code>claude mcp add raven -- npx -y raven-mcp@latest</code></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.4.0" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.3.6</h2>
          <span className="badge badge-patch">patch</span>
          <time dateTime="2026-05-15T18:26:18Z">May 15, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.3.6 — patch release</p>

          <h3>Changes</h3>
          <ul>
            <li>Sync server.json to v1.3.5 + auto-sync in release.sh (#6)</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.6" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.3.5</h2>
          <span className="badge badge-patch">patch</span>
          <time dateTime="2026-05-08T18:20:40Z">May 8, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.3.5 — patch release</p>

          <h3>Changes</h3>
          <ul>
            <li>Security: bump @modelcontextprotocol/sdk + @anthropic-ai/sdk, harden data loading (#5)</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.5" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.3.3</h2>
          <span className="badge badge-patch">patch</span>
          <time dateTime="2026-05-04T17:25:01Z">May 4, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.3.3 — patch release</p>

          <h3>Changes</h3>
          <ul>
            <li>32e730c Add MCP Registry metadata (mcpName + server.json)</li>
            <li>92165a1 Update changelog for v1.3.2</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.3" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.3.2</h2>
          <span className="badge badge-patch">patch</span>
          <time dateTime="2026-05-01T18:04:25Z">May 1, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.3.2 — patch release</p>

          <h3>Changes</h3>
          <ul>
            <li>51feb07 Equal-height pricing cards</li>
            <li>ca21b81 Full terminal/video swap: terminal at hero, video lower</li>
            <li>a0116ce Swap terminal and video positions — terminal now comes first, before mythology section</li>
            <li>7638a41 Audit fixes + live install stats card</li>
            <li>0f13f6f Session log — 2026-04-24</li>
            <li>636a8c8 Update changelog for v1.3.1</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.2" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.3.1</h2>
          <span className="badge badge-patch">patch</span>
          <time dateTime="2026-04-24T17:54:51Z">April 24, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.3.1 — patch release</p>

          <h3>Changes</h3>
          <ul>
            <li>a6303e3 Site content refresh for v1.2 + v1.3</li>
            <li>9201bdd Update changelog for v1.3.0</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.1" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.3.0</h2>
          <span className="badge badge-minor">minor</span>
          <time dateTime="2026-04-23T20:53:01Z">April 23, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.3.0 — minor release</p>

          <h3>Changes</h3>
          <ul>
            <li>e6a70fd Blueprint: match row order across both lanes</li>
            <li>3709cec Blueprint: let row-type colors carry the row semantics in both lanes</li>
            <li>0110fdf Blueprint: stronger actor differentiation</li>
            <li>dc1ff35 Blueprint: persona avatars next to lane labels</li>
            <li>ed7ac55 Blueprint: render empty cells as blank, not em-dash placeholders</li>
            <li>aa3bc76 Two-actor / HI-loop service blueprints</li>
            <li>3c00624 v1.3 knowledge: research, service design, brand/visual layers</li>
            <li>9373cbe Session log + revisit — 2026-04-22</li>
            <li>6ed5071 Docs H1 + meta to RavenMCP wordmark</li>
            <li>6b4930b Rebrand site header + metadata to RavenMCP</li>
            <li>89b6914 Nav link to Updates section</li>
            <li>9620cf4 Mailing list CTAs on the three surfaces users see</li>
            <li>dae1d81 Add --debug flag to dump logs.list/logs.get shape</li>
            <li>8478d8b Backfill script — walk logs.list instead of emails.list</li>
            <li>959a76a Resend audience backfill script</li>
            <li>d494403 Update changelog for v1.2.0</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.3.0" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>

      <article className="release">
        <header className="release-head">
          <h2>v1.2.0</h2>
          <span className="badge badge-initial">initial</span>
          <time dateTime="2026-04-22T22:39:50Z">April 22, 2026</time>
        </header>
        <div className="release-body">
          <p>Raven v1.2.0 — minor release</p>

          <h3>Changes</h3>
          <ul>
            <li>6e98d29 Release via npm OIDC trusted publishing</li>
            <li>6e5fafc Content design systems — voice, writing principles, copy patterns</li>
            <li>a51eb76 Session logs — 2026-04-11 and 2026-04-17</li>
            <li>b5dbd65 OG card + wallpaper design experiments</li>
            <li>5046f6e Welcome email — dark-mode hardening for Gmail/Outlook</li>
            <li>4c59ac6 Daily digest — in-server injection + launchd agent at 18:00 local</li>
            <li>ed23f42 Raven learns from local usage — passive, insight-only, never leaves the machine</li>
            <li>c79fece End-to-end release automation</li>
            <li>26107e0 Route gh/git content through tmpfiles to avoid shell interpretation</li>
            <li>91a63e5 Map RAVEN_KNOWLEDGE_PR secret to ANTHROPIC_API_KEY env var</li>
            <li>86609b1 Bump workflow runtime to Node.js 24</li>
            <li>92692ce Add weekly knowledge-PR pipeline + release script</li>
            <li>f53f8b9 Lead docs install with npm/CLI, keep .mcpb as secondary</li>
            <li>d137355 Package Raven as a Claude Desktop Extension (.mcpb)</li>
            <li>0f06086 Add build prompt clip to sizzle reel</li>
            <li>35f5c5f Test Vercel auto-deploy from git push</li>
            <li>0c71445 Re-render sizzle reel with OffthreadVideo for smooth playback</li>
            <li>2ee3a6c Add sizzle reel video to homepage</li>
            <li>9005f8a Switch OG image to compressed JPEG (827KB→80KB), add dimension meta tags</li>
            <li>3b7db99 Add missing --space-7 token, use tokens not hardcoded values</li>
          </ul>

          <p><strong>Install:</strong></p>
          <p><strong>Claude Desktop:</strong> <a href="https://ravenmcp.ai/raven.mcpb">download raven.mcpb</a></p>
        </div>
        <footer className="release-foot">
          <a href="https://github.com/rhinocap/raven-mcp/releases/tag/v1.2.0" target="_blank" rel="noopener">View on GitHub &rarr;</a>
        </footer>
      </article>
    </main>
  )
}
