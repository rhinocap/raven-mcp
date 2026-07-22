'use client'

import { useEffect, useState } from 'react'

type Role = 'consumer' | 'maintainer'

const ROLE_KEY = 'raven-grab-role'
const TOUR_KEY = 'raven-grab-tour-done'
const TOUR_STEP_KEY = 'raven-grab-tour-step'

type Step = {
  title: string
  body: string
  // 'center' | 'target:<selector>' | 'panel' (right inspector) | 'panel-left' (left panel) | 'panel-left-foot' (left panel, card at its footer)
  anchor: string
}

const TIP_WIDTH = 320
// Distance from the card to the element it points at — the tail lives in this gap.
const TAIL_GAP = 14
const EDGE_GAP = 16
// Below this much headroom the card would clip the top of the viewport, so it flips.
const FLIP_THRESHOLD = 220

const STEPS: Step[] = [
  {
    title: 'Raven Design',
    body: 'Pair designing with your agent. Click any element on the page, describe a change, and the request goes straight to your coding agent with the exact selector, tokens, and styles attached.',
    anchor: 'center',
  },
  {
    title: 'Click to inspect',
    body: 'Click a feature card under Features — three FeatureCard instances share the same styles. The inspector panel fills in: Scope shows “All 3 like this,” and Styles lists the --demo-* tokens on that card.',
    anchor: 'target:.wireframe-feature-card',
  },
  {
    title: 'Styles',
    body: 'In the inspector panel, Styles opens by default — Layout, Size, Spacing, Typography, Fill and more. Tokenized properties show as name · value; open one to swap tokens or edit the raw value. Hover, focus, active, and disabled states stack underneath.',
    anchor: 'panel',
  },
  {
    title: 'Layers and Assets',
    body: 'The Raven Design panel has two tabs. Layers is the element tree — drag a row to reorder or reparent it. Assets captures a whole component into DESIGN.md: an engineer sends a component request; the design system side adds the component and updates DESIGN.md.',
    anchor: 'panel-left',
  },
  {
    title: 'Arrange the panels',
    body: 'The tiles in each panel header set the layout — open both, show just one, or close both (Cmd+. toggles while grab is armed). A closed panel leaves a tab on the screen edge; click it to reopen. Drag a panel by its header, or an edge tab, to move it out of your way.',
    anchor: 'panel',
  },
  {
    title: 'Switch roles here',
    body: 'This toggle switches between the Engineer and Design system views — same element, two workflows. It also changes what the Assets tab does.',
    anchor: 'target:.playground-role-toggle',
  },
  {
    title: 'Settings and feedback',
    body: 'The footer at the bottom of the Raven Design panel shows the project Raven is running in — here that is Northstar Workspace, on your machine it is yours. Click it, or press Cmd+K with a panel focused, for text size, the shortcut list, and a box that tells us what is wrong or missing.',
    anchor: 'panel-left-foot',
  },
  {
    title: 'Send to your agent',
    body: 'At the bottom of the inspector, type an instruction and press Enter to send (Cmd+Enter for a new line). The payload carries the selector, token intents, and style edits.',
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

  // Track the rect the current step points at — a real element for target:
  // steps, or the live grab panel (resolved through its shadow root, since the
  // overlay renders in a shadow DOM) for the panel / panel-left steps. Anchoring
  // to the panel's real position keeps the card attached at any viewport width
  // instead of a fixed offset that floated or overlapped the panel.
  useEffect(() => {
    if (step < 0) {
      setTargetRect(null)
      return
    }
    const anchor = STEPS[step].anchor
    const isLeftPanel = anchor === 'panel-left' || anchor === 'panel-left-foot'
    const isPanel = anchor === 'panel' || isLeftPanel
    if (!anchor.startsWith('target:') && !isPanel) {
      setTargetRect(null)
      return
    }
    const resolve = (): DOMRect | null => {
      if (anchor.startsWith('target:')) {
        return document.querySelector(anchor.slice(7))?.getBoundingClientRect() ?? null
      }
      const panels: Element[] = []
      document.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) {
          el.shadowRoot.querySelectorAll('.raven-grab-panel').forEach((p) => panels.push(p))
        }
      })
      panels.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      const el = isLeftPanel ? panels[0] : panels[panels.length - 1]
      return el?.getBoundingClientRect() ?? null
    }
    const apply = () => {
      const r = resolve()
      setTargetRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
    }
    apply()
    // The grab panels mount asynchronously after the overlay script loads, so a
    // panel step reached early may resolve null on the first pass — retry briefly.
    let raf = 0
    let tries = 0
    const retry = () => {
      if (isPanel && !resolve() && tries < 120) {
        tries += 1
        raf = requestAnimationFrame(() => {
          apply()
          retry()
        })
      }
    }
    retry()
    addEventListener('scroll', apply, true)
    addEventListener('resize', apply)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', apply, true)
      removeEventListener('resize', apply)
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

  // Spotlight coachmarks sit ABOVE their target, centred on it, with a tail pointing
  // down at what they describe — matching the panel's icon tooltips. Below-and-
  // left-aligned made the reader hunt for which element the card was about.
  const spotlightStyle = (): React.CSSProperties => {
    if (!targetRect) return {}
    const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
    const centre = targetRect.left + targetRect.width / 2
    const half = TIP_WIDTH / 2
    // Clamped so a target near either edge doesn't push the card off-screen.
    const left = Math.min(Math.max(centre, half + EDGE_GAP), viewportWidth - half - EDGE_GAP)
    // Not enough headroom (target near the top of the viewport) → flip underneath,
    // and the tail flips with it rather than pointing away from the target.
    const below = targetRect.top < FLIP_THRESHOLD
    return {
      position: 'fixed',
      top: below ? targetRect.top + targetRect.height + TAIL_GAP : targetRect.top - TAIL_GAP,
      left,
      width: TIP_WIDTH,
      transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
      // The tail tracks the target's real centre, so it still points correctly
      // once the card has been clamped away from that centre.
      ['--tail-left' as string]: `${centre - (left - half)}px`,
    }
  }

  // Panel steps sit the card beside the live panel, vertically centred on it,
  // with a tail pointing sideways at the panel. If the panel can't be resolved
  // (overlay not mounted yet), fall back to a fixed inset on the right/left.
  const panelCardStyle = (side: 'left' | 'right', vAlign: 'center' | 'foot' = 'center'): React.CSSProperties => {
    const vw = typeof window === 'undefined' ? 1440 : window.innerWidth
    const vh = typeof window === 'undefined' ? 900 : window.innerHeight
    if (!targetRect) {
      const y = vAlign === 'foot' ? { bottom: 40 } : { top: 96 }
      return side === 'left'
        ? { position: 'fixed', ...y, left: 400, width: TIP_WIDTH }
        : { position: 'fixed', ...y, right: 400, width: TIP_WIDTH }
    }
    const rawLeft =
      side === 'left'
        ? targetRect.left + targetRect.width + TAIL_GAP
        : targetRect.left - TAIL_GAP - TIP_WIDTH
    const left = Math.min(Math.max(rawLeft, EDGE_GAP), vw - TIP_WIDTH - EDGE_GAP)
    // 'foot' anchors the card to the panel's bottom (where the settings gear
    // lives), pinning its bottom edge just inside the viewport so a tall card
    // grows upward instead of clipping off-screen. Its tail still points at the
    // panel — the gear sits inside the panel's high-z shadow DOM, so a ring or
    // card placed over it would be occluded; we point at the panel foot instead.
    if (vAlign === 'foot') {
      const bottom = Math.max(vh - (targetRect.top + targetRect.height) + EDGE_GAP, EDGE_GAP)
      return { position: 'fixed', bottom, left, width: TIP_WIDTH }
    }
    const top = Math.min(Math.max(targetRect.top + targetRect.height / 2, 150), vh - 150)
    return { position: 'fixed', top, left, width: TIP_WIDTH, transform: 'translateY(-50%)' }
  }

  const cardStyle: React.CSSProperties =
    current?.anchor === 'panel'
      ? panelCardStyle('right')
      : current?.anchor === 'panel-left'
        ? panelCardStyle('left')
        : current?.anchor === 'panel-left-foot'
          ? panelCardStyle('left', 'foot')
          : current?.anchor.startsWith('target:') && targetRect
            ? spotlightStyle()
            : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 360 }

  const tailSide =
    current?.anchor.startsWith('target:') && targetRect
      ? targetRect.top < FLIP_THRESHOLD
        ? 'top'
        : 'bottom'
      : current?.anchor === 'panel' && targetRect
        ? 'right'
        : (current?.anchor === 'panel-left' || current?.anchor === 'panel-left-foot') && targetRect
          ? 'left'
          : undefined

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
          <div className="playground-tour__card" style={cardStyle} data-tail={tailSide}>
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
