import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

type AnchoredOverlayAlign = 'left' | 'right'
export const DEFAULT_OVERLAY_BOUNDARY_SELECTOR = '[data-overlay-boundary="true"]'

interface AnchoredOverlayOptions {
  width: number
  align?: AnchoredOverlayAlign
  gap?: number
  viewportPadding?: number
  bottomViewportPadding?: number
  zoom?: number
  boundarySelector?: string | null
}

interface OverlayAnchorRect {
  left: number
  right: number
  bottom: number
}

interface OverlayBoundaryRect {
  top: number
  left: number
  right: number
  bottom: number
}

interface ResolveAnchoredOverlayStyleOptions extends AnchoredOverlayOptions {
  anchorRect: OverlayAnchorRect
  viewportWidth: number
  viewportHeight: number
  boundaryRect?: OverlayBoundaryRect | null
}

export function resolveAnchoredOverlayStyle({
  anchorRect,
  boundaryRect = null,
  viewportWidth,
  viewportHeight,
  width,
  align = 'left',
  gap = 10,
  viewportPadding = 12,
  bottomViewportPadding,
  zoom = 100,
}: ResolveAnchoredOverlayStyleOptions): CSSProperties {
  const scale = zoom > 0 ? zoom / 100 : 1
  const logicalViewportWidth = viewportWidth / scale
  const logicalViewportHeight = viewportHeight / scale
  const logicalRect = {
    left: anchorRect.left / scale,
    right: anchorRect.right / scale,
    bottom: anchorRect.bottom / scale,
  }
  const logicalBoundaryRect = boundaryRect
    ? {
        top: boundaryRect.top / scale,
        left: boundaryRect.left / scale,
        right: boundaryRect.right / scale,
        bottom: boundaryRect.bottom / scale,
      }
    : {
        top: 0,
        left: 0,
        right: logicalViewportWidth,
        bottom: logicalViewportHeight,
      }
  const resolvedBottomViewportPadding = bottomViewportPadding ?? (boundaryRect ? viewportPadding + gap : viewportPadding)
  const minLeft = logicalBoundaryRect.left + viewportPadding
  const maxRight = logicalBoundaryRect.right - viewportPadding
  const minTop = logicalBoundaryRect.top + viewportPadding
  const maxBottom = logicalBoundaryRect.bottom - resolvedBottomViewportPadding
  const availableWidth = Math.max(0, maxRight - minLeft)
  const resolvedWidth = boundaryRect
    ? Math.min(width, availableWidth)
    : Math.min(width, Math.max(220, availableWidth))
  const preferredLeft = align === 'right' ? logicalRect.right - resolvedWidth : logicalRect.left
  const maxLeft = Math.max(minLeft, maxRight - resolvedWidth)
  const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft)
  const maxTop = Math.max(minTop, maxBottom)
  const top = Math.min(Math.max(logicalRect.bottom + gap, minTop), maxTop)
  const availableHeight = Math.max(0, maxBottom - top)
  const maxHeight = boundaryRect ? availableHeight : Math.max(160, availableHeight)

  return {
    left,
    maxHeight,
    position: 'fixed',
    top,
    width: resolvedWidth,
    zoom: `${zoom}%`,
  }
}

export function useAnchoredOverlayStyle(
  triggerRef: RefObject<HTMLElement | null>,
  {
    width,
    align = 'left',
    gap = 10,
    viewportPadding = 12,
    bottomViewportPadding,
    zoom = 100,
    boundarySelector = DEFAULT_OVERLAY_BOUNDARY_SELECTOR,
  }: AnchoredOverlayOptions
) {
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    let frameId: number | null = null
    const trigger = triggerRef.current
    const boundary =
      boundarySelector && typeof document !== 'undefined'
        ? document.querySelector(boundarySelector)
        : null

    const update = () => {
      frameId = null

      const anchor = triggerRef.current
      if (!anchor) {
        setStyle(null)
        return
      }

      const rect = anchor.getBoundingClientRect()
      const resolvedBoundaryRect =
        boundary instanceof HTMLElement ? boundary.getBoundingClientRect() : null
      const boundaryRect =
        resolvedBoundaryRect
          ? {
              bottom: resolvedBoundaryRect.bottom,
              left: resolvedBoundaryRect.left,
              right: resolvedBoundaryRect.right,
              top: resolvedBoundaryRect.top,
            }
          : null
      setStyle(
        resolveAnchoredOverlayStyle({
          align,
          anchorRect: {
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
          },
          boundaryRect,
          gap,
          bottomViewportPadding,
          viewportHeight: window.innerHeight,
          viewportPadding,
          viewportWidth: window.innerWidth,
          width,
          zoom,
        })
      )
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
    if (resizeObserver && boundary instanceof HTMLElement) resizeObserver.observe(boundary)

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
      resizeObserver?.disconnect()
    }
  }, [align, boundarySelector, gap, triggerRef, viewportPadding, bottomViewportPadding, width, zoom])

  return style
}
