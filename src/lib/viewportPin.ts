// Late layout changes (syntax-tree driven WYSIWYG widgets, images, math,
// diagrams) resize content after a scroll position is restored. Keep
// re-applying the anchor while observed elements resize; any user scroll
// intent, or the settle window ending, releases the pin.
const VIEWPORT_PIN_SETTLE_MS = 10_000
const USER_SCROLL_INTENT_EVENTS = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const

export interface ViewportPin {
  /** Re-observe and re-apply, e.g. after the pinned DOM was replaced. */
  reapply: () => void
  stop: () => void
}

export function pinViewportWhileSettling(
  getObservedElements: () => Element[],
  apply: () => void
): ViewportPin {
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => apply())
  const observe = () => {
    if (!observer) return
    observer.disconnect()
    for (const element of getObservedElements()) observer.observe(element)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    observer?.disconnect()
    if (timer !== undefined) clearTimeout(timer)
    for (const type of USER_SCROLL_INTENT_EVENTS) document.removeEventListener(type, stop, true)
  }
  timer = setTimeout(stop, VIEWPORT_PIN_SETTLE_MS)
  for (const type of USER_SCROLL_INTENT_EVENTS) {
    document.addEventListener(type, stop, { capture: true, passive: true })
  }

  observe()
  apply()
  return {
    reapply: () => {
      observe()
      apply()
    },
    stop,
  }
}
