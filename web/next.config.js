/** @type {import('next').NextConfig} */

// The /api/welcome email function (Resend) keeps living on the `site` project,
// which holds the Sensitive RESEND_API_KEY. We proxy to its stable per-project
// alias (independent of the apex domain, so no loop after the apex moves here).
const SITE_FUNCTIONS = 'https://site-cunliffeandrewc-8712s-projects.vercel.app'

const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/welcome', destination: `${SITE_FUNCTIONS}/api/welcome` },
    ]
  },

  // The static site used .html URLs; this Next app uses clean paths. When this
  // app becomes canonical at the apex, 301 the old URLs so external backlinks,
  // the prior sitemap, and AI-engine citations don't 404.
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/docs.html', destination: '/docs', permanent: true },
      { source: '/about.html', destination: '/about', permanent: true },
      { source: '/changelog.html', destination: '/changelog', permanent: true },
      { source: '/design-system.html', destination: '/design-system', permanent: true },
      { source: '/playground', destination: '/raven-design', permanent: true },
    ]
  },
}

module.exports = nextConfig
