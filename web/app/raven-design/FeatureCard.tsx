'use client'

import type { PointerEvent, ReactNode } from 'react'

type FeatureCardProps = {
  title: string
  children: ReactNode
}

/**
 * Repeated playground component — three instances share class `wireframe-feature-card`
 * so Raven Design shows Scope → "All 3 like this". Styles resolve through --demo-* tokens.
 */
export default function FeatureCard({ title, children }: FeatureCardProps) {
  function announceComponent(_event: PointerEvent<HTMLElement>) {
    try {
      window.dispatchEvent(
        new CustomEvent('react-grab:element-selected', {
          detail: {
            componentName: 'FeatureCard',
            filePath: 'web/app/raven-design/FeatureCard.tsx',
          },
        })
      )
    } catch {
      /* ignore */
    }
  }

  return (
    <article
      className="wireframe-feature-card"
      data-raven-component="FeatureCard"
      onPointerDown={announceComponent}
    >
      <div className="wireframe-icon" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  )
}
