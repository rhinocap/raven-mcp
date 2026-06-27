import type { Config } from 'tailwindcss'

// RavenMCP's visual identity lives entirely in app/globals.css (CSS custom
// properties + hand-authored components, ported verbatim from the static site).
// Tailwind is present to match the family stack but is intentionally dormant —
// globals.css uses NO @tailwind directives, so Preflight never runs and the
// ported design system is the single source of truth.
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [],
}

export default config
