'use client'

// Before/after comparison slider — interaction core ported from the
// portfolio's RavenMCP case study (BeforeAfter.tsx), chrome retokenized
// to this site's design tokens. Base layer is the AFTER image; the
// clipped overlay reveals the BEFORE on the left of the divider.

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import {
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useRef,
  useState,
} from 'react'

type BeforeAfterProps = {
  beforeSrc: string
  beforeAlt: string
  afterSrc: string
  afterAlt: string
  caption: string
  aspectRatio?: string
  className?: string
}

const KEYBOARD_STEP = 2

// Matches --ease-out in globals.css (cubic-bezier(0.16, 1, 0.3, 1)) —
// framer-motion needs the raw control points, not the CSS var.
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

function clamp(value: number) {
  return Math.min(100, Math.max(0, value))
}

export default function BeforeAfter({
  beforeSrc,
  beforeAlt,
  afterSrc,
  afterAlt,
  caption,
  aspectRatio = '16 / 9',
  className = '',
}: BeforeAfterProps) {
  const [position, setPosition] = useState(50)
  const draggingRef = useRef(false)
  const captionId = useId()
  const descriptionId = useId()
  const reduceMotion = useReducedMotion()

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width === 0) return
    setPosition(clamp(((event.clientX - bounds.left) / bounds.width) * 100))
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
    updateFromPointer(event)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    updateFromPointer(event)
  }

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextPosition: number | undefined

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextPosition = position - KEYBOARD_STEP
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextPosition = position + KEYBOARD_STEP
    } else if (event.key === 'Home') {
      nextPosition = 0
    } else if (event.key === 'End') {
      nextPosition = 100
    }

    if (nextPosition === undefined) return
    event.preventDefault()
    setPosition(clamp(nextPosition))
  }

  return (
    <figure className={`ba-figure ${className}`} data-before-after>
      <div
        role="slider"
        tabIndex={0}
        aria-labelledby={captionId}
        aria-describedby={descriptionId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${Math.round(position)}% before image visible`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={() => {
          draggingRef.current = false
        }}
        onKeyDown={handleKeyDown}
        className="ba-stage"
        style={{ aspectRatio }}
      >
        <Image
          src={afterSrc}
          alt={afterAlt}
          fill
          sizes="(min-width: 768px) 60vw, 100vw"
          className="ba-img"
          draggable={false}
        />

        <div
          className="ba-clip"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <Image
            src={beforeSrc}
            alt={beforeAlt}
            fill
            sizes="(min-width: 768px) 60vw, 100vw"
            className="ba-img"
            draggable={false}
          />
        </div>

        <motion.div
          aria-hidden
          initial={{ x: 0 }}
          whileInView={reduceMotion ? { x: 0 } : { x: [0, -8, 8, 0] }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
          className="ba-divider"
          style={{ left: `${position}%` }}
        >
          <span className="ba-line" />
          <span className="ba-pill ba-pill-before">Before</span>
          <span className="ba-pill ba-pill-after">After</span>
          <span className="ba-handle">
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6.5 5-4 4 4 4" />
              <path d="m11.5 5 4 4-4 4" />
            </svg>
          </span>
        </motion.div>
      </div>

      {/* role="slider" flattens descendant alt text for assistive tech —
          expose the before/after descriptions explicitly. */}
      <p id={descriptionId} className="sr-only">
        Before: {beforeAlt} After: {afterAlt}
      </p>

      {/* Caption is a11y-only — visible captions read as noise under the sliders. */}
      <figcaption id={captionId} className="sr-only">
        {caption}
      </figcaption>

      <style jsx>{`
        .ba-figure {
          width: 100%;
          margin: 0;
        }
        .ba-stage {
          position: relative;
          width: 100%;
          cursor: ew-resize;
          user-select: none;
          -webkit-user-select: none;
          touch-action: pan-y;
          overflow: hidden;
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
          border: 1px solid var(--border);
          outline: none;
        }
        .ba-stage:focus-visible {
          border-color: var(--accent-blue);
          box-shadow: 0 0 0 1px var(--accent-blue);
        }
        .ba-figure :global(.ba-img) {
          pointer-events: none;
          object-fit: cover;
        }
        .ba-clip {
          pointer-events: none;
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        /* motion.div doesn't receive the styled-jsx scope class — target globally
           within the figure, same as .ba-img. */
        .ba-figure :global(.ba-divider) {
          pointer-events: none;
          position: absolute;
          top: 0;
          bottom: 0;
          z-index: 2;
        }
        .ba-line {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: 1px;
          transform: translateX(-50%);
          background: rgba(255, 255, 255, 0.85);
        }
        .ba-pill {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          border-radius: var(--radius-full);
          background: var(--bg-raised);
          border: 1px solid var(--border-strong);
          color: var(--text-primary);
          padding: 6px 12px;
          font-family: var(--font-mono);
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          line-height: 1;
          white-space: nowrap;
        }
        .ba-pill-before {
          right: 50%;
          margin-right: 36px;
        }
        .ba-pill-after {
          left: 50%;
          margin-left: 36px;
        }
        .ba-handle {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: var(--radius-full);
          background: var(--bg-raised);
          border: 1px solid var(--border-strong);
          color: var(--text-primary);
        }
        .ba-stage:hover .ba-handle,
        .ba-stage:focus-visible .ba-handle {
          color: var(--accent-blue);
          border-color: var(--accent-blue);
        }
        @media (max-width: 640px) {
          .ba-pill {
            display: none;
          }
        }
      `}</style>
    </figure>
  )
}
