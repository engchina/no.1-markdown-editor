import type { StateEffect } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export const EDITOR_CURSOR_SCROLL_LINES = 3
export const EDITOR_NAVIGATION_START_MARGIN_PX = 20
export const EDITOR_NAVIGATION_DEFAULT_MARGIN_PX = 5
export type EditorNavigationAlign = 'nearest' | 'start' | 'end' | 'center'

export interface EditorScrollSnapshot {
  scrollTop: number
  scrollLeft: number
}

export interface EditorNavigationScrollOptions {
  align?: EditorNavigationAlign
  margin?: number
}

export function captureEditorScrollSnapshot(view: Pick<EditorView, 'scrollDOM'>): EditorScrollSnapshot {
  return {
    scrollTop: view.scrollDOM.scrollTop,
    scrollLeft: view.scrollDOM.scrollLeft,
  }
}

export function restoreEditorScrollSnapshot(
  view: Pick<EditorView, 'dom' | 'requestMeasure' | 'scrollDOM'>,
  snapshot: EditorScrollSnapshot
): void {
  const applySnapshot = (target: Pick<EditorView, 'scrollDOM'>) => {
    target.scrollDOM.scrollTop = snapshot.scrollTop
    target.scrollDOM.scrollLeft = snapshot.scrollLeft
  }

  view.requestMeasure({
    read: () => null,
    write: (_value, measuredView) => {
      applySnapshot(measuredView)
    },
  })

  requestAnimationFrame(() => {
    if (!view.dom.isConnected) return
    applySnapshot(view)
  })
}

export function createEditorSelectionScrollEffect(
  view: EditorView,
  anchor: number
): StateEffect<unknown> {
  // Keep insertions from yanking an already-visible cursor toward the viewport
  // edge. We still request a margin so off-screen insertions settle with context.
  return EditorView.scrollIntoView(anchor, {
    y: 'nearest',
    yMargin: Math.round(view.defaultLineHeight * EDITOR_CURSOR_SCROLL_LINES),
  })
}

export function appendEditorSelectionScrollEffect(
  view: EditorView,
  effects: readonly StateEffect<unknown>[] | undefined,
  anchor: number
): StateEffect<unknown>[] {
  const scrollEffect = createEditorSelectionScrollEffect(view, anchor)
  return effects ? [...effects, scrollEffect] : [scrollEffect]
}

export function createEditorNavigationScrollEffect(
  anchor: number,
  options: EditorNavigationScrollOptions = {}
): StateEffect<unknown> {
  const align = options.align ?? 'center'
  const margin = resolveEditorNavigationMargin(align, options.margin)

  return EditorView.scrollIntoView(anchor, {
    y: align,
    yMargin: margin,
  })
}

export function scheduleEditorNavigationScroll(
  view: EditorView,
  anchor: number,
  options: EditorNavigationScrollOptions = {}
): void {
  const align = options.align ?? 'center'
  const margin = resolveEditorNavigationMargin(align, options.margin)

  // Re-dispatch after CodeMirror has rendered dynamic-height decorations near
  // the target. Keep the coordinate math inside CodeMirror's own scroll effect.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!view.dom.isConnected) return

      const safeAnchor = clamp(anchor, 0, view.state.doc.length)
      view.dispatch({
        effects: createEditorNavigationScrollEffect(safeAnchor, { align, margin }),
      })
    })
  })
}

function resolveEditorNavigationMargin(
  align: EditorNavigationAlign,
  requestedMargin: number | undefined
): number {
  if (typeof requestedMargin === 'number' && Number.isFinite(requestedMargin)) {
    return Math.max(0, requestedMargin)
  }

  return align === 'start'
    ? EDITOR_NAVIGATION_START_MARGIN_PX
    : EDITOR_NAVIGATION_DEFAULT_MARGIN_PX
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
