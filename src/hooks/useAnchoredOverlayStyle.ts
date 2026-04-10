import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

type AnchoredOverlayAlign = 'left' | 'right'

interface AnchoredOverlayOptions {
  width: number
  align?: AnchoredOverlayAlign
  gap?: number
  viewportPadding?: number
}

export function useAnchoredOverlayStyle(
  triggerRef: RefObject<HTMLElement | null>,
  { width, align = 'left', gap = 10, viewportPadding = 12 }: AnchoredOverlayOptions
) {
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    let frameId: number | null = null
    const trigger = triggerRef.current

    const update = () => {
      frameId = null

      const anchor = triggerRef.current
      if (!anchor) {
        setStyle(null)
        return
      }

      const rect = anchor.getBoundingClientRect()
      const resolvedWidth = Math.min(width, Math.max(220, window.innerWidth - viewportPadding * 2))
      const preferredLeft = align === 'right' ? rect.right - resolvedWidth : rect.left
      const maxLeft = Math.max(viewportPadding, window.innerWidth - resolvedWidth - viewportPadding)
      const left = Math.min(Math.max(preferredLeft, viewportPadding), maxLeft)
      const top = Math.min(rect.bottom + gap, window.innerHeight - viewportPadding)

      setStyle({
        left,
        maxHeight: Math.max(160, window.innerHeight - top - viewportPadding),
        position: 'fixed',
        top,
        width: resolvedWidth,
      })
    }

    const scheduleUpdate = () => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(update)
    }

    scheduleUpdate()
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleUpdate) : null
    if (resizeObserver && trigger) resizeObserver.observe(trigger)

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
      resizeObserver?.disconnect()
    }
  }, [align, gap, triggerRef, viewportPadding, width])

  return style
}
