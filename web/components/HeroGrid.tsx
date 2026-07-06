'use client'

import { useEffect, useRef } from 'react'

/**
 * Interactive full-site background grid — Beacon variant only.
 *
 * A fixed viewport-sized canvas (see .hero-grid-canvas: position:fixed;
 * z-index:-1) that sits behind the entire page. The cursor-following spotlight
 * tracks the pointer across the whole document, not just the hero. Content
 * scrolls over the fixed grid.
 *
 * Ported verbatim (constants + math) from the static site's canvas engine
 * (site/index.html), reduced to the single shipped variant: a soft
 * cursor-following spotlight over a faint base grid. No time/trail state —
 * Beacon is purely cursor-driven, so the render loop only lerps the pointer
 * toward its target and redraws.
 *
 * StrictMode-safe: every mutable value lives inside the effect, and the
 * cleanup cancels the RAF and removes all listeners, so the dev
 * mount→cleanup→mount double-invoke is harmless (no double-speed/ghost draw).
 */
export default function HeroGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 0
    let H = 0
    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    const CELL = 46
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false }
    let rafId = 0

    function resize() {
      W = canvas!.offsetWidth
      H = canvas!.offsetHeight
      canvas!.width = Math.floor(W * DPR)
      canvas!.height = Math.floor(H * DPR)
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
    }

    function onPointerMove(e: PointerEvent) {
      // Touch guard: don't let the spotlight chase thumbs during touch-scroll.
      if (e.pointerType !== 'mouse') return
      // Fixed canvas rect == viewport, so clientX/clientY map 1:1 (no scroll math).
      mouse.tx = e.clientX
      mouse.ty = e.clientY
      mouse.active = true
    }
    function onPointerLeave() {
      mouse.active = false
    }

    function lerp(a: number, b: number, n: number) {
      return a + (b - a) * n
    }

    function baseGrid(alpha: number, cell: number) {
      ctx!.strokeStyle = 'rgba(255,255,255,' + alpha + ')'
      ctx!.lineWidth = 1
      ctx!.beginPath()
      for (let x = 0; x <= W; x += cell) {
        ctx!.moveTo(x + 0.5, 0)
        ctx!.lineTo(x + 0.5, H)
      }
      for (let y = 0; y <= H; y += cell) {
        ctx!.moveTo(0, y + 0.5)
        ctx!.lineTo(W, y + 0.5)
      }
      ctx!.stroke()
    }

    function softSpotlightGrid(
      mx: number,
      my: number,
      R: number,
      cell: number,
      rgb: string,
      peak: number
    ) {
      ctx!.lineWidth = 1
      const x0 = Math.floor((mx - R) / cell) * cell
      const y0 = Math.floor((my - R) / cell) * cell
      for (let x = x0; x <= mx + R; x += cell) {
        const dx = Math.abs(x - mx)
        if (dx > R) continue
        const half = Math.sqrt(R * R - dx * dx)
        const a = (1 - dx / R) * peak
        const gr = ctx!.createLinearGradient(0, my - half, 0, my + half)
        gr.addColorStop(0, 'rgba(' + rgb + ',0)')
        gr.addColorStop(0.5, 'rgba(' + rgb + ',' + a + ')')
        gr.addColorStop(1, 'rgba(' + rgb + ',0)')
        ctx!.strokeStyle = gr
        ctx!.beginPath()
        ctx!.moveTo(x + 0.5, my - half)
        ctx!.lineTo(x + 0.5, my + half)
        ctx!.stroke()
      }
      for (let y = y0; y <= my + R; y += cell) {
        const dy = Math.abs(y - my)
        if (dy > R) continue
        const halfh = Math.sqrt(R * R - dy * dy)
        const a2 = (1 - dy / R) * peak
        const g2 = ctx!.createLinearGradient(mx - halfh, 0, mx + halfh, 0)
        g2.addColorStop(0, 'rgba(' + rgb + ',0)')
        g2.addColorStop(0.5, 'rgba(' + rgb + ',' + a2 + ')')
        g2.addColorStop(1, 'rgba(' + rgb + ',0)')
        ctx!.strokeStyle = g2
        ctx!.beginPath()
        ctx!.moveTo(mx - halfh, y + 0.5)
        ctx!.lineTo(mx + halfh, y + 0.5)
        ctx!.stroke()
      }
    }

    function radialFill(
      mx: number,
      my: number,
      R: number,
      inner: string,
      outer: string
    ) {
      const gr = ctx!.createRadialGradient(mx, my, 0, mx, my, R)
      gr.addColorStop(0, inner)
      gr.addColorStop(1, outer)
      ctx!.fillStyle = gr
      ctx!.fillRect(mx - R, my - R, R * 2, R * 2)
    }

    function drawBeacon(mx: number, my: number, active: boolean) {
      baseGrid(0.02, 40)
      if (!active) return
      radialFill(mx, my, 320, 'rgba(0,191,255,0.032)', 'rgba(0,191,255,0)')
      softSpotlightGrid(mx, my, 300, 40, '214,224,240', 0.36)
    }

    function frame() {
      mouse.x = lerp(mouse.x < -9000 ? mouse.tx : mouse.x, mouse.tx, 0.18)
      mouse.y = lerp(mouse.y < -9000 ? mouse.ty : mouse.y, mouse.ty, 0.18)
      ctx!.clearRect(0, 0, W, H)
      drawBeacon(mouse.x, mouse.y, mouse.active)
      rafId = requestAnimationFrame(frame)
    }

    resize()
    window.addEventListener('resize', resize)

    if (reduced) {
      // Static single draw — no pointer tracking, no animation loop.
      drawBeacon(-9999, -9999, false)
      return () => {
        window.removeEventListener('resize', resize)
      }
    }

    // Track the pointer across the whole page. pointerleave on window is
    // unreliable, so listen on documentElement (fires when the cursor exits
    // the page) and also drop the spotlight when the window loses focus.
    window.addEventListener('pointermove', onPointerMove)
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('blur', onPointerLeave)
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('blur', onPointerLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="hero-grid-canvas"
      id="hero-grid"
      aria-hidden="true"
    />
  )
}
