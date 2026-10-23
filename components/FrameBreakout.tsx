'use client'
import {useEffect} from 'react'

/** If HMS is embedded on another origin (iframes break session cookies), jump the top window to this app. */
export default function FrameBreakout() {
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (window.top && window.top !== window.self) {
        const topOrigin = window.top.location.origin
        // same-origin embed (rare) — leave alone
        if (topOrigin === window.location.origin) return
      }
    } catch {
      // Cross-origin parent: cannot read top.location — break out
      try {
        window.top!.location.href = window.location.href
      } catch {
        /* ignore */
      }
    }
  }, [])
  return null
}
