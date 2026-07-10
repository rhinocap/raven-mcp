'use client'

import { useEffect, useState } from 'react'

type Role = 'consumer' | 'maintainer'

const ROLE_KEY = 'raven-grab-role'
const TOUR_KEY = 'raven-grab-tour-done'
const TOUR_STEP_KEY = 'raven-grab-tour-step'

type Step = {
  title: string
  body: string
  // 'center' | 'target:<selector>' | 'panel' (fixed top-right panel area)
  anchor: string
}

const STEPS: Step[] = [
  {
    title: 'Raven Design',
    body: 'Pair designing with your agent. Click any element on the page, describe a change, and the request goes straight to your coding agent with the exact selector, tokens, and styles attached.',
    anchor: 'center',
  },
  {
    title: 'Click to inspect',
    body: 'Try any block — a button, heading, or section. A cyan box tracks what you’re pointing at; clicking selects it and opens the panel.',
    anchor: 'target:.wireframe-button--primary',
  },
  {
    title: 'Design tokens',
    body: 'The panel lists the design tokens the element resolves to — including HOVER, FOCUS, ACTIVE, and DISABLED state groups. Swap a token to preview the change live.',
    anchor: 'panel',
  },
  {
    title: 'Computed styles',
    body: 'Everything that is not tokenized shows up under Computed Styles, so you can see exactly what a token does not cover yet.',
    anchor: 'panel',
  },
  {
    title: 'Send to your agent',
    body: 'Type an instruction and press Enter to send (Cmd+Enter for a new line). The payload carries the selector, token intents, and style edits.',
    anchor: 'panel',
  },
  {
    title: 'Two roles, two second tabs',
    body: 'Engineers get "Request Component" — a request that goes to the design team. The design system side gets "Add to Design System" — instructions to create the component and update DESIGN.md.',
    anchor: 'panel',
  },
  {
    title: 'Switch roles here',
    body: 'This toggle switches the panel between the Engineer view and the Design system view — same element, two workflows.',
    anchor: 'target:.playground-role-toggle',
  },
  {
    title: 'Collapse and reopen',
    body: 'The caret in the panel header tucks it away to the right edge — no overlay chrome while it’s closed. Drag the panel by its header, or the edge tab up and down, if either is in your way.',
    anchor: 'panel',
  },
]

function readRole(): Role {
  try {
    const param = new URLSearchParams(location.search).get('role')
    if (param === 'maintainer' || param === 'consumer') return param
    return localStorage.getItem(ROLE_KEY) === 'maintainer' ? 'maintainer' : 'consumer'
  } catch {
    return 'consumer'
  }
}

export default function Coachmarks({ config }: { config: Record<string, unknown> }) {
  const [role, setRole] = useState<Role | null>(null)
  const [step, setStep] = useState(-1)
  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  // Boot: set config (with role) BEFORE loading the overlay script.
  useEffect(() => {
    const r = readRole()
    setRole(r)
    const w = window as unknown as { RavenGrabConfig?: unknown; __RAVEN_GRAB__?: boolean }
    w.RavenGrabConfig = { ...config, role: r }
    if (!document.querySelector('script[data-raven-grab-src]')) {
      const s = document.createElement('script')
      s.src = '/raven-grab.js'
      s.setAttribute('data-raven-grab-src', '')
      document.body.appendChild(s)
    }
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        const saved = localStorage.getItem(TOUR_STEP_KEY)
        const stepNum = saved ? parseInt(saved, 10) : 0
        if (!isNaN(stepNum) && stepNum >= 0 && stepNum < STEPS.length) {
          setStep(stepNum)
        } else {
          setStep(0)
        }
      }
    } catch {
      /* tour stays off */
    }
    // ponytail: config prop is static per page load; effect runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track the anchor target's rect for spotlight steps.
  useEffect(() => {
    if (step < 0) {
      setTargetRect(null)
      return
    }
    const anchor = STEPS[step].anchor
    if (!anchor.startsWith('target:')) {
      setTargetRect(null)
      return
    }
    const el = document.querySelector(anchor.slice(7))
    if (!el) {
      setTargetRect(null)
      return
    }
    const update = () => {
      const r = el.getBoundingClientRect()
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    update()
    addEventListener('scroll', update, true)
    addEventListener('resize', update)
    return () => {
      removeEventListener('scroll', update, true)
      removeEventListener('resize', update)
    }
  }, [step])

  // Persist current tour step to localStorage so it survives a role change reload.
  useEffect(() => {
    if (step >= 0) {
      try {
        localStorage.setItem(TOUR_STEP_KEY, String(step))
      } catch {
        /* ignore */
      }
    }
  }, [step])

  function chooseRole(next: Role) {
    if (next === role) return
    try {
      localStorage.setItem(ROLE_KEY, next)
    } catch {
      /* param fallback below */
    }
    const url = new URL(location.href)
    url.searchParams.set('role', next)
    location.href = url.toString()
  }

  function endTour() {
    try {
      localStorage.setItem(TOUR_KEY, '1')
    } catch {
      /* ignore */
    }
    setStep(-1)
  }

  const current = step >= 0 ? STEPS[step] : null
  const cardStyle: React.CSSProperties =
    current?.anchor === 'panel'
      ? { position: 'fixed', top: 96, right: 400, width: 320 }
      : current?.anchor.startsWith('target:') && targetRect
        ? { position: 'fixed', top: targetRect.top + targetRect.height + 16, left: Math.max(16, targetRect.left), width: 320 }
        : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 360 }

  return (
    <>
      <div className="playground-controls" data-raven-grab-ignore="">
        <div className="playground-role-toggle" role="group" aria-label="Role">
          {(['consumer', 'maintainer'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => chooseRole(r)}
            >
              {r === 'consumer' ? 'Engineer' : 'Design system'}
            </button>
          ))}
        </div>
        <button type="button" className="playground-replay" onClick={() => setStep(0)}>
          Replay tour
        </button>
      </div>

      {current && (
        <div className="playground-tour" role="dialog" aria-label={current.title} aria-modal="false" data-raven-grab-ignore="">
          <div className="playground-tour__backdrop" />
          {targetRect && (
            <div
              className="playground-tour__spotlight"
              style={{
                top: targetRect.top - 6,
                left: targetRect.left - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12,
              }}
            />
          )}
          <div className="playground-tour__card" style={cardStyle}>
            <p className="playground-tour__count">
              {step + 1} / {STEPS.length}
            </p>
            <h3>{current.title}</h3>
            <p>{current.body}</p>
            <div className="playground-tour__actions">
              <button type="button" className="playground-tour__skip" onClick={endTour}>
                Skip
              </button>
              <span>
                {step > 0 && (
                  <button type="button" onClick={() => setStep(step - 1)}>
                    Back
                  </button>
                )}
                {step < STEPS.length - 1 ? (
                  <button type="button" className="playground-tour__next" onClick={() => setStep(step + 1)}>
                    Next
                  </button>
                ) : (
                  <button type="button" className="playground-tour__next" onClick={endTour}>
                    Done
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
