'use client'

import { useEffect, useRef } from 'react'

// The home #motion demo. It renders without the autoplay attribute, so with
// prefers-reduced-motion: reduce it never starts and stays on its poster. Otherwise
// it starts muted and loops, and it stops if the setting changes while the page is open.
export default function MotionDemoVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      if (query.matches) {
        video.pause()
        video.currentTime = 0
      } else {
        // HomeScripts drops loop under reduced motion; put it back when playback resumes.
        video.loop = true
        video.muted = true
        video.play().catch(() => {})
      }
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  return <video ref={ref} src={src} poster={poster} muted loop playsInline preload="metadata" aria-label={label} />
}
