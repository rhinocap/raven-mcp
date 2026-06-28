/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ]
  },
}

module.exports = nextConfig
