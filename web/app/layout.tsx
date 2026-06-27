import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import RevealAndCopy from '@/components/RevealAndCopy'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-jb',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://ravenmcp.ai'),
  title: 'RavenMCP — Design Intelligence MCP for Claude · Open Source',
  description:
    "Odin's ravens brought back knowledge of the world. RavenMCP brings back design intelligence — an open-source design-knowledge MCP server giving AI agents like Claude 55 tools across nine knowledge layers.",
  applicationName: 'RavenMCP',
  authors: [{ name: 'Andrew Cunliffe' }],
  keywords: [
    'RavenMCP',
    'MCP server',
    'Model Context Protocol',
    'design intelligence',
    'Claude',
    'design system tokens',
    'design audit',
    'AEO',
  ],
  openGraph: {
    type: 'website',
    siteName: 'RavenMCP',
    title: 'RavenMCP — Design Intelligence for AI',
    description:
      '129 design principles · 22 UI patterns · 55 tools · 12 design systems · web, iOS, Android & React Native audits · content voice guides · research methods · service blueprints. One install for design-literate AI.',
    url: 'https://ravenmcp.ai',
    images: [
      {
        url: '/assets/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'RavenMCP — Design Intelligence for AI',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RavenMCP — Design Intelligence for AI',
    description:
      '129 principles · 22 patterns · 55 tools · 12 design systems · web, iOS, Android & React Native audits. Design intelligence for AI, in one install.',
    images: ['/assets/og-image.jpg'],
  },
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/',
    types: { 'text/plain': '/llms.txt' },
  },
}

export const viewport: Viewport = {
  themeColor: '#1a1a22',
}

// JSON-LD structured data for AI answer engines + search (AEO "Understandable").
// Organization gives AI a clean entity; SoftwareApplication describes the product;
// FAQPage feeds directly-quotable Q&A. Mirrors gethighlvl-landing's AEO pattern.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://ravenmcp.ai/#organization',
      name: 'RavenMCP',
      alternateName: 'Raven',
      url: 'https://ravenmcp.ai/',
      logo: 'https://ravenmcp.ai/assets/og-image.jpg',
      description:
        'Open-source design intelligence for AI agents, delivered as a Model Context Protocol server.',
      sameAs: [
        'https://github.com/rhinocap/raven-mcp',
        'https://www.npmjs.com/package/raven-mcp',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://ravenmcp.ai/#website',
      url: 'https://ravenmcp.ai/',
      name: 'RavenMCP',
      description:
        'Design intelligence for every prompt. An open-source MCP server giving AI agents design knowledge.',
      publisher: { '@id': 'https://ravenmcp.ai/#organization' },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://ravenmcp.ai/#software',
      name: 'RavenMCP',
      alternateName: 'Raven MCP server',
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Model Context Protocol (MCP) server',
      operatingSystem: 'Cross-platform (Node.js)',
      url: 'https://ravenmcp.ai/',
      downloadUrl: 'https://www.npmjs.com/package/raven-mcp',
      softwareHelp: 'https://ravenmcp.ai/docs',
      description:
        'RavenMCP is an open-source Model Context Protocol server that gives AI agents like Claude design intelligence: 55 tools across nine knowledge layers — 129 design principles, 22 UI patterns, 12 design-system token libraries, content voice, brand, research, service blueprints, and design audits for web, iOS, Android, and React Native.',
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      author: { '@type': 'Person', name: 'Andrew Cunliffe' },
      publisher: { '@id': 'https://ravenmcp.ai/#organization' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: [
        '129 design principles (Nielsen heuristics, Laws of UX, Gestalt, WCAG, typography, color, mobile UX, D4D)',
        '22 reusable UI patterns',
        '12 world-class design systems with W3C DTCG tokens',
        'Design audits for web, iOS/SwiftUI, Android, and React Native',
        'Content voice guides, brand profiles, research methods, and service blueprints',
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://ravenmcp.ai/#faq',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is RavenMCP?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'RavenMCP (Raven) is an open-source Model Context Protocol (MCP) server that gives AI agents like Claude design intelligence — the design knowledge once locked in expert heads. It exposes 55 tools across nine knowledge layers: design principles, UI patterns, design-system tokens, content voice, brand, research methods, service blueprints, business strategy, and multi-platform design audits.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do I install RavenMCP?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Install RavenMCP in one command: claude mcp add raven -- npx -y raven-mcp. It runs through npx, so there is nothing to clone or build. Full setup instructions are in the documentation at ravenmcp.ai/docs.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is RavenMCP free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. RavenMCP is 100% free and open source under the MIT license. Every tool, token, and principle is included — no tiers, no usage limits, no account required.',
          },
        },
        {
          '@type': 'Question',
          name: 'Which AI agents work with RavenMCP?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'RavenMCP works with any client that supports the Model Context Protocol, including Claude (Claude Code and the Claude desktop app). Once installed, the agent can call Raven’s 55 tools directly during a conversation.',
          },
        },
        {
          '@type': 'Question',
          name: 'What platforms can RavenMCP audit?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'RavenMCP can audit web pages and layouts, iOS/SwiftUI screens, Android screens, and React Native interfaces — checking them against design principles and UI patterns and flagging issues with contrast, tap targets, typography, and accessibility.',
          },
        },
        {
          '@type': 'Question',
          name: 'What design systems does RavenMCP support?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'RavenMCP includes production tokens from 12 world-class design systems in W3C DTCG format, all queryable by AI agents. It also exposes 129 design principles and 22 reusable UI patterns.',
          },
        },
      ],
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <p id="copy-status" className="sr-only" role="status" aria-live="polite" />
        <raven-nav></raven-nav>
        {children}
        <raven-footer></raven-footer>
        <Script src="/assets/nav.js" strategy="beforeInteractive" />
        <Script src="/assets/footer.js" strategy="beforeInteractive" />
        <RevealAndCopy />
      </body>
    </html>
  )
}
