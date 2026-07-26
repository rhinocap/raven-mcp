import type { MetadataRoute } from 'next'

// AEO/SEO: a real sitemap lets AI + search crawlers discover every page.
const BASE = 'https://ravenmcp.ai'

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{ path: string; priority: number }> = [
    { path: '/', priority: 1 },
    { path: '/docs', priority: 0.9 },
    { path: '/raven-design', priority: 0.9 },
    { path: '/design-system', priority: 0.7 },
    { path: '/changelog', priority: 0.6 },
    { path: '/privacy', priority: 0.3 },
    { path: '/terms', priority: 0.3 },
  ]

  return routes.map(({ path, priority }) => ({
    url: `${BASE}${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority,
  }))
}
