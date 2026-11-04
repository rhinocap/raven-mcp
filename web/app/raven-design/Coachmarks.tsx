'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Role = 'consumer' | 'maintainer'

const ROLE_KEY = 'raven-grab-role'
const TOUR_KEY = 'raven-grab-tour-done'
const TOUR_STEP_KEY = 'raven-grab-tour-step'

export type Step = {
  title: string
  body: string
  // 'center' | 'target:<selector>' | 'grab:<selector>' (inside the overlay's shadow root) | 'panel' (right inspector) | 'panel-left' (left panel) | 'panel-left-foot' (left panel, card at its footer)
  anchor: string
}

const TIP_WIDTH = 320
// Distance from the card to the element it points at — the tail lives in this gap.
const TAIL_GAP = 14
// Grab switches to its bottom sheet at this width (raven-grab.js, max-width: 760px).
const PHONE_MAX = 760
// Room kept for the card when a target step pins it to the bottom on a phone.
const PHONE_CARD_ROOM = 330
// A phone sheet taller than this share of the screen leaves no room to show a page
// target (Grab's half snap is 0.5, its full snap nearly 1).
const SHEET_BLOCKS_TARGET = 0.75
// Where an off-screen page target is scrolled to on wider screens: low enough for
// the card (about 300px tall) to sit above it.
const DESKTOP_TARGET_TOP = 340
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
    body: 'The Raven Design panel has three tabs. Layers is the element tree — drag a row to reorder or reparent it. Assets captures a whole component into DESIGN.md: an engineer sends a component request; the design system side adds the component and updates DESIGN.md.',
    anchor: 'panel-left',
  },
  {
    title: 'Motion',
    body: 'The Motion tab tunes how things move. Press Find motion and Raven numbers the spots on the page that should move. Open one, drag a slider until it feels right, then copy the motion for your agent.',
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

type Props = {
  config: Record<string, unknown>
  // Defaults are /raven-design's tour; /motion passes its own steps and keys.
  steps?: Step[]
  tourKey?: string
  stepKey?: string
  showRoles?: boolean
}

// Finds an element inside the overlay's shadow root.
function grabQuery(selector: string): Element | null {
  let found: Element | null = null
  document.querySelectorAll('*').forEach((el) => {
    if (!found && el.shadowRoot) found = el.shadowRoot.querySelector(selector)
  })
  return found
}

export default function Coachmarks({ config, steps = STEPS, tourKey = TOUR_KEY, stepKey = TOUR_STEP_KEY, showRoles = true }: Props) {
  const STEPS = steps
  const TOUR_KEY = tourKey
  const TOUR_STEP_KEY = stepKey
  const [role, setRole] = useState<Role | null>(null)
  const [step, setStep] = useState(-1)
  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  // The visible part of Grab's phone sheet; null on wider screens, before it mounts,
  // or while it is collapsed off-screen. The sheet can dock to the top or bottom.
  const [sheet, setSheet] = useState<{ top: number; bottom: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ w: 1440, h: 900 })
  // The tour renders last in <html>, after Grab's overlay host, so on a phone a card
  // that has to sit over the sheet is drawn above it instead of underneath.
  const [portal, setPortal] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.setAttribute('data-raven-grab-ignore', '')
    document.documentElement.appendChild(el)
    const keepLast = () => {
      if (document.documentElement.lastElementChild !== el) document.documentElement.appendChild(el)
    }
    const observer = new MutationObserver(keepLast)
    observer.observe(document.documentElement, { childList: true })
    setPortal(el)
    const size = () => setViewport({ w: innerWidth, h: innerHeight })
    size()
    addEventListener('resize', size)
    return () => {
      observer.disconnect()
      removeEventListener('resize', size)
      el.remove()
    }
  }, [])

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
      setSheet(null)
      return
    }
    const anchor = STEPS[step].anchor
    const isLeftPanel = anchor === 'panel-left' || anchor === 'panel-left-foot'
    const isGrab = anchor.startsWith('grab:')
    const isPanel = anchor === 'panel' || isLeftPanel || isGrab
    const isPhone = () => innerWidth <= PHONE_MAX
    // Grab's panels, visible ones only: on a phone the second panel is display:none.
    const visiblePanels = (): Element[] => {
      const panels: Element[] = []
      document.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) {
          el.shadowRoot.querySelectorAll('.raven-grab-panel').forEach((p) => {
            if (p.getBoundingClientRect().width > 0) panels.push(p)
          })
        }
      })
      return panels.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
    }
    const readSheet = () => {
      const el = isPhone() ? visiblePanels()[0] : undefined
      const r = el?.getBoundingClientRect()
      const top = r ? Math.max(r.top, 0) : 0
      const bottom = r ? Math.min(r.bottom, innerHeight) : 0
      setSheet(r && bottom - top > 1 ? { top, bottom } : null)
    }
    readSheet()
    if (!anchor.startsWith('target:') && !isPanel) {
      setTargetRect(null)
      let raf = 0
      let tries = 0
      const retry = () => {
        if (isPhone() && tries < 120) {
          tries += 1
          raf = requestAnimationFrame(() => {
            readSheet()
            retry()
          })
        }
      }
      retry()
      // A sheet drag fires no resize; re-read the sheet once its snap has settled.
      let settleTimer = 0
      const settle = () => {
        clearTimeout(settleTimer)
        settleTimer = window.setTimeout(readSheet, 400)
      }
      addEventListener('resize', readSheet)
      addEventListener('pointerup', settle, true)
      addEventListener('pointercancel', settle, true)
      return () => {
        cancelAnimationFrame(raf)
        clearTimeout(settleTimer)
        removeEventListener('resize', readSheet)
        removeEventListener('pointerup', settle, true)
        removeEventListener('pointercancel', settle, true)
      }
    }
    // Bring a page target into view before placing the card. On a phone it goes in
    // the space between the nav and the card pinned at the bottom; wider, it goes low
    // enough that the card fits above it, as long as it isn't already there.
    if (anchor.startsWith('target:')) {
      const el = document.querySelector(anchor.slice(7))
      if (el) {
        const r = el.getBoundingClientRect()
        if (isPhone()) {
          // The card covers the sheet (or the bottom of the screen with no sheet), so
          // the target goes in the space on the other side of it.
          const el = visiblePanels()[0]?.getBoundingClientRect()
          const sheetOnTop = !!el && el.top + el.height / 2 < innerHeight / 2 && el.bottom > 0
          const freeTop = sheetOnTop && el ? Math.max(el.bottom, 0) + EDGE_GAP : 88
          const freeBottom = sheetOnTop ? innerHeight - EDGE_GAP : el && el.top < innerHeight ? el.top : innerHeight - PHONE_CARD_ROOM
          const want = freeTop + Math.max((freeBottom - freeTop - r.height) / 2, 0)
          // A sheet dragged to full height leaves no room; leave the page where it is.
          if (!el || el.height <= innerHeight * SHEET_BLOCKS_TARGET) scrollBy({ top: r.top - want, behavior: 'instant' as ScrollBehavior })
        } else if (r.bottom > innerHeight - EDGE_GAP || r.top < 0) {
          const want = Math.min(DESKTOP_TARGET_TOP, Math.max(innerHeight - EDGE_GAP - r.height, FLIP_THRESHOLD))
          scrollBy({ top: r.top - want, behavior: 'instant' as ScrollBehavior })
        }
      }
    }
    const resolve = (): DOMRect | null => {
      if (anchor.startsWith('target:')) {
        return document.querySelector(anchor.slice(7))?.getBoundingClientRect() ?? null
      }
      // On a phone both panels are one sheet, and anything inside it is in the sheet.
      if (isPhone()) return visiblePanels()[0]?.getBoundingClientRect() ?? null
      if (isGrab) {
        const r = grabQuery(anchor.slice(5))?.getBoundingClientRect()
        return r && (r.width || r.height) ? r : null
      }
      const panels = visiblePanels()
      const el = isLeftPanel ? panels[0] : panels[panels.length - 1]
      return el?.getBoundingClientRect() ?? null
    }
    const apply = () => {
      const r = resolve()
      setTargetRect(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
      readSheet()
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
    // Dragging Grab's phone sheet fires no scroll or resize. Its pointerup reaches the
    // window, so re-measure each frame until the 200ms snap transition has settled.
    let settleRaf = 0
    const settle = () => {
      cancelAnimationFrame(settleRaf)
      const until = performance.now() + 400
      const tick = () => {
        apply()
        if (performance.now() < until) settleRaf = requestAnimationFrame(tick)
      }
      settleRaf = requestAnimationFrame(tick)
    }
    // Scrolling the card's own text must not re-place the card.
    const onScroll = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('.playground-tour')) return
      apply()
    }
    addEventListener('scroll', onScroll, true)
    addEventListener('resize', apply)
    addEventListener('pointerup', settle, true)
    addEventListener('pointercancel', settle, true)
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(settleRaf)
      removeEventListener('scroll', onScroll, true)
      removeEventListener('resize', apply)
      removeEventListener('pointerup', settle, true)
      removeEventListener('pointercancel', settle, true)
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

  // Grab swallows every wheel outside its panels (a capture listener on document) so
  // the page can't move under them, which also froze the card's scrolling text. A
  // window capture listener runs first: wheels over the tour stop there and scroll
  // the text natively; overscroll-behavior keeps the page still at the ends.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest('.playground-tour__card')) e.stopImmediatePropagation()
    }
    addEventListener('wheel', onWheel, { capture: true })
    return () => removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  // Last check after every render: keep the whole card inside the window, whatever
  // the placement above computed (a window resized mid-step, a very short window).
  // The card is never taller than the window, and a card moved this way hides its
  // tail, which no longer lines up with the target.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    card.style.translate = ''
    delete card.dataset.clamped
    // One final cap: the smaller of this render's computed cap and the window, set
    // before measuring so the text's scroll position is never reset.
    const room = innerHeight - 2 * EDGE_GAP
    const cap = cardStyle.maxHeight
    const capPx = typeof cap === 'number' ? cap : typeof cap === 'string' && cap.endsWith('px') ? parseFloat(cap) : Infinity
    card.style.maxHeight = `${Math.min(capPx, room)}px`
    const r = card.getBoundingClientRect()
    let dy = 0
    if (r.bottom > innerHeight - EDGE_GAP) dy = innerHeight - EDGE_GAP - r.bottom
    if (r.top + dy < EDGE_GAP) dy = EDGE_GAP - r.top
    if (Math.abs(dy) >= 1) {
      card.style.translate = `0 ${dy}px`
      card.dataset.clamped = ''
    }
  })

  // Spotlight coachmarks sit ABOVE their target, centred on it, with a tail pointing
  // down at what they describe — matching the panel's icon tooltips. Below-and-
  // left-aligned made the reader hunt for which element the card was about.
  // Below the target when there is too little headroom, unless the space below is
  // smaller still (short windows), so the card and its buttons stay on screen.
  const spotlightBelow = (): boolean => {
    if (!targetRect) return false
    const vh = typeof window === 'undefined' ? 900 : window.innerHeight
    const above = targetRect.top
    const under = vh - (targetRect.top + targetRect.height)
    return targetRect.top < FLIP_THRESHOLD && under >= above
  }
  const spotlightStyle = (): React.CSSProperties => {
    if (!targetRect) return {}
    const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
    const centre = targetRect.left + targetRect.width / 2
    const half = TIP_WIDTH / 2
    // Clamped so a target near either edge doesn't push the card off-screen.
    const left = Math.min(Math.max(centre, half + EDGE_GAP), viewportWidth - half - EDGE_GAP)
    // Not enough headroom (target near the top of the viewport) → flip underneath,
    // and the tail flips with it rather than pointing away from the target.
    const below = spotlightBelow()
    const vh = typeof window === 'undefined' ? 900 : window.innerHeight
    const room = below ? vh - (targetRect.top + targetRect.height) - TAIL_GAP - EDGE_GAP : targetRect.top - TAIL_GAP - EDGE_GAP
    return {
      maxHeight: Math.max(room, 120),
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
      return { position: 'fixed', bottom, left, width: TIP_WIDTH, maxHeight: vh - bottom - EDGE_GAP }
    }
    const top = Math.min(Math.max(targetRect.top + targetRect.height / 2, 150), vh - 150)
    return { position: 'fixed', top, left, width: TIP_WIDTH, transform: 'translateY(-50%)' }
  }

  // Phone (Grab's sheet layout): the card spans the width with a 16px inset, no
  // horizontal transform, and a max height that scrolls on short screens.
  // - Page targets: the card covers the sheet, at whichever edge the sheet is docked
  //   (bottom with no sheet), and the target is scrolled into the space opposite.
  // - Other steps: the card goes in the larger space beside the sheet, tail toward it.
  const isPhoneLayout = viewport.w <= PHONE_MAX
  const sheetOnTop = !!sheet && (sheet.top + sheet.bottom) / 2 < viewport.h / 2
  // If the sheet is dragged up so far that a page target cannot show beside it, the
  // step is placed like a panel step, without a spotlight or tail. Grab has no API
  // for the tour to shrink the sheet.
  const anchorIsTarget = !!current?.anchor.startsWith('target:')
  const targetBlocked = isPhoneLayout && anchorIsTarget && !!sheet && sheet.bottom - sheet.top > viewport.h * SHEET_BLOCKS_TARGET
  const isTargetStep = anchorIsTarget && !targetBlocked
  const phoneCardPlacement = (): { style: React.CSSProperties; tail?: 'top' | 'bottom' } => {
    const base: React.CSSProperties = { position: 'fixed', left: EDGE_GAP, right: EDGE_GAP, width: 'auto' }
    const full = viewport.h - 2 * EDGE_GAP
    // Below this the text has too little room to read, so the card covers more.
    const minCard = Math.min(full, viewport.h * 0.55)
    if (isTargetStep) {
      const tailLeft = targetRect ? targetRect.left + targetRect.width / 2 - EDGE_GAP : 0
      const pin = sheetOnTop ? { top: EDGE_GAP } : { bottom: EDGE_GAP }
      // Leave the target visible: the card may use the room past the target, and on
      // short screens at least 55% of the height, scrolling its text beyond that.
      const room = !targetRect ? full : sheetOnTop
        ? targetRect.top - TAIL_GAP - EDGE_GAP
        : viewport.h - (targetRect.top + targetRect.height) - TAIL_GAP - EDGE_GAP
      return {
        style: { ...base, ...pin, maxHeight: Math.min(full, Math.max(room, minCard)), ['--tail-left' as string]: `${tailLeft}px` },
        tail: targetRect ? (sheetOnTop ? 'bottom' : 'top') : undefined,
      }
    }
    if (!sheet) return { style: { ...base, top: '50%', transform: 'translateY(-50%)', maxHeight: full } }
    const above = sheet.top
    const below = viewport.h - sheet.bottom
    const pointAt = current?.anchor !== 'center' && !anchorIsTarget
    const room = Math.max(above, below) - TAIL_GAP - EDGE_GAP
    if (room < minCard) {
      // Short screens: pin to the far edge from the sheet and overlap it; no tail.
      return { style: { ...base, ...(above >= below ? { top: EDGE_GAP } : { bottom: EDGE_GAP }), maxHeight: minCard } }
    }
    if (above >= below) {
      return {
        style: { ...base, bottom: viewport.h - sheet.top + TAIL_GAP, maxHeight: room, ['--tail-left' as string]: '50%' },
        tail: pointAt ? 'bottom' : undefined,
      }
    }
    return {
      style: { ...base, top: sheet.bottom + TAIL_GAP, maxHeight: room, ['--tail-left' as string]: '50%' },
      tail: pointAt ? 'top' : undefined,
    }
  }
  const phonePlacement = isPhoneLayout ? phoneCardPlacement() : null

  const desktopCardStyle = (): React.CSSProperties => current?.anchor === 'panel'
      ? panelCardStyle('right')
      : current?.anchor === 'panel-left'
        ? panelCardStyle('left')
        : current?.anchor === 'panel-left-foot'
          ? panelCardStyle('left', 'foot')
          : (current?.anchor.startsWith('target:') || current?.anchor.startsWith('grab:')) && targetRect
            ? spotlightStyle()
            : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 360 }
  // Wider screens: no card is taller than the window; its text scrolls past that.
  const cardStyle: React.CSSProperties = phonePlacement
    ? phonePlacement.style
    : { maxHeight: viewport.h - 2 * EDGE_GAP, ...desktopCardStyle() }

  const tailSide = phonePlacement
    ? phonePlacement.tail
    : (current?.anchor.startsWith('target:') || current?.anchor.startsWith('grab:')) && targetRect
      ? spotlightBelow()
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
        {showRoles && (
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
        )}
        <button type="button" className="playground-replay" onClick={() => setStep(0)}>
          Replay tour
        </button>
      </div>

      {current && portal && createPortal(
        <div className="playground-tour" role="dialog" aria-label={current.title} aria-modal="false" data-raven-grab-ignore="">
          <div className="playground-tour__backdrop" />
          {targetRect && !targetBlocked && (
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
          <div ref={cardRef} className="playground-tour__card" style={cardStyle} data-tail={tailSide}>
            <div className="playground-tour__body">
              <p className="playground-tour__count">
                {step + 1} / {STEPS.length}
              </p>
              <h3>{current.title}</h3>
              <p>{current.body}</p>
            </div>
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
        </div>,
        portal,
      )}
    </>
  )
}
