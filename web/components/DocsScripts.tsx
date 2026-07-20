'use client'

import { useEffect } from 'react'

export default function DocsScripts() {
  useEffect(() => {
    const root = document.getElementById('raven-docs-v3')
    if (!root) return

    const sections = Array.from(root.querySelectorAll<HTMLElement>('.rd-section[id]'))
    const navLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('.rd-nav a, .rd-mobile-nav a'))
    const packetSection = root.querySelector<HTMLElement>('#rd-packet-section')
    const packetIntent = root.querySelector<HTMLElement>('#rd-packet-intent')
    const agentRoute = root.querySelector<HTMLElement>('#rd-agent-route')

    let activeId = ''
    function setActive(section: HTMLElement) {
      if (section.id === activeId) return
      activeId = section.id
      const intent = section.getAttribute('data-intent') || ''
      if (packetSection) packetSection.textContent = section.id
      if (packetIntent) packetIntent.textContent = intent
      if (agentRoute) agentRoute.textContent = '/docs#' + section.id
      navLinks.forEach(function (link) {
        const on = link.getAttribute('href') === '#' + section.id
        if (on) link.setAttribute('aria-current', 'true')
        else link.removeAttribute('aria-current')
      })
    }

    function onScroll() {
      let candidate = sections[0]
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= 150) candidate = s
      }
      if (candidate) setActive(candidate)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    // Copy handlers on code-shell blocks
    const timers = new Set<ReturnType<typeof setTimeout>>()
    function legacyCopy(text: string) {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      let ok = false
      try { ok = document.execCommand('copy') } catch (_) { ok = false }
      document.body.removeChild(ta)
      return ok
    }
    function onClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest('[data-copy]') as HTMLButtonElement | null
      if (!btn) return
      const shell = btn.closest('.rd-code-shell')
      const code = shell ? shell.querySelector('code') : null
      if (!code) return
      const text = (code as HTMLElement).innerText
      const flash = function (label: string) {
        const prev = btn.textContent
        btn.textContent = label
        btn.classList.add('rd-copied')
        const t = setTimeout(function () { btn.textContent = prev; btn.classList.remove('rd-copied'); timers.delete(t) }, 1400)
        timers.add(t)
      }
      const done = function () { flash('Copied') }
      const fail = function () { flash(legacyCopy(text) ? 'Copied' : 'Copy failed') }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fail)
      } else {
        flash(legacyCopy(text) ? 'Copied' : 'Copy failed')
      }
    }
    root.addEventListener('click', onClick)

    return function () {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      root.removeEventListener('click', onClick)
      timers.forEach(clearTimeout)
    }
  }, [])

  return null
}
