'use client'

import { useEffect } from 'react'

// Shared, site-wide behavior ported verbatim from the static site:
//  1. Scroll-reveal: add `.visible` to `.reveal` elements as they enter view.
//  2. Clipboard: any `.cta-install` button copies the install command and
//     swaps its `.copy-label` to "Copied!" (delegated, so server-rendered
//     markup needs no inline onclick).
export default function RevealAndCopy() {
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    if (reduce) {
      els.forEach((el) => el.classList.add('visible'))
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    if (!reduce) els.forEach((el) => observer.observe(el))

    // Delegated clipboard for every install button.
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest<HTMLElement>('.cta-install')
      if (!btn) return
      const cmd =
        btn.getAttribute('data-copy') || 'claude mcp add raven -- npx -y raven-mcp'
      navigator.clipboard?.writeText(cmd).then(() => {
        const label = btn.querySelector('.copy-label')
        if (label) label.textContent = 'Copied!'
        btn.setAttribute('aria-label', 'Install command copied')
        const status = document.getElementById('copy-status')
        if (status) status.textContent = 'Install command copied to clipboard.'
        window.setTimeout(() => {
          if (label) label.textContent = 'Copy'
        }, 2000)
      })
    }
    document.addEventListener('click', onClick)

    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick)
    }
  }, [])

  return null
}
