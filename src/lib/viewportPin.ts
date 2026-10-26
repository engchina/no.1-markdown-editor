// Late layout changes (syntax-tree driven WYSIWYG widgets, images, math,
// diagrams) resize content after a scroll position is restored. Keep
// re-applying the anchor while observed elements resize or `scroller` scrolls
// on its own (CodeMirror compensates scrollTop when measured heights replace
// its estimates); any user scroll intent, or the settle window ending,
// releases the pin.
const VIEWPORT_PIN_SETTLE_MS = 10_000
const USER_SCROLL_INTENT_EVENTS = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const

export interface ViewportPin {
  /** Re-observe and re-apply, e.g. after the pinned DOM was replaced. */
  reapply: () => void
  stop: () => void
  /** True until released: the anchor is still the truth, not the live scroll. */
  isSettling: () => boolean
}

export function pinViewportWhileSettling(
  getObservedElements: () => Element[],
  apply: () => void,
  scroller?: Element
): ViewportPin {
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => apply())
  const observe = () => {
    if (!observer) return
    observer.disconnect()
    for (const element of getObservedElements()) observer.observe(element)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let settling = true
  const stop = () => {
    settling = false
    observer?.disconnect()
    if (timer !== undefined) clearTimeout(timer)
    for (const type of USER_SCROLL_INTENT_EVENTS) document.removeEventListener(type, stop, true)
    scroller?.removeEventListener('scroll', apply)
  }
  timer = setTimeout(stop, VIEWPORT_PIN_SETTLE_MS)
  for (const type of USER_SCROLL_INTENT_EVENTS) {
    document.addEventListener(type, stop, { capture: true, passive: true })
  }
  scroller?.addEventListener('scroll', apply, { passive: true })

  observe()
  apply()
  return {
    reapply: () => {
      observe()
      apply()
    },
    stop,
    isSettling: () => settling,
  }
}
