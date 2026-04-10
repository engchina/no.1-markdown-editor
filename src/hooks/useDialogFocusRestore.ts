import { type RefObject, useEffect, useRef } from 'react'

interface FocusReturnSnapshot {
  element: HTMLElement | null
  editorScroller: HTMLElement | null
  editorScrollTop: number
  editorScrollLeft: number
}

function captureFocusReturnSnapshot(): FocusReturnSnapshot {
  if (typeof document === 'undefined') {
    return {
      element: null,
      editorScroller: null,
      editorScrollTop: 0,
      editorScrollLeft: 0,
    }
  }

  const element = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const editorRoot = element?.closest('.cm-editor')
  const editorScroller =
    editorRoot instanceof HTMLElement
      ? editorRoot.querySelector<HTMLElement>('.cm-scroller')
      : null

  return {
    element,
    editorScroller,
    editorScrollTop: editorScroller?.scrollTop ?? 0,
    editorScrollLeft: editorScroller?.scrollLeft ?? 0,
  }
}

export function focusElementWithoutScroll(element: HTMLElement | null | undefined): void {
  if (!element || !element.isConnected) return

  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
}

function restoreFocusReturnSnapshot(snapshot: FocusReturnSnapshot | null): void {
  if (!snapshot) return

  focusElementWithoutScroll(snapshot.element)

  const scroller = snapshot.editorScroller
  if (!scroller || !scroller.isConnected) return

  const applyScroll = () => {
    if (!scroller.isConnected) return
    scroller.scrollTop = snapshot.editorScrollTop
    scroller.scrollLeft = snapshot.editorScrollLeft
  }

  applyScroll()
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(applyScroll)
  }
}

export function useDialogFocusRestore<T extends HTMLElement>(focusTargetRef?: RefObject<T | null>): void {
  const previousFocusRef = useRef<FocusReturnSnapshot | null>(null)

  useEffect(() => {
    previousFocusRef.current = captureFocusReturnSnapshot()

    if (focusTargetRef?.current) {
      focusElementWithoutScroll(focusTargetRef.current)
    }

    return () => {
      restoreFocusReturnSnapshot(previousFocusRef.current)
    }
  }, [focusTargetRef])
}
