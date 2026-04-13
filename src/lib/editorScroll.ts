import type { StateEffect } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export const EDITOR_CURSOR_SCROLL_LINES = 3

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

export function resolveEditorCursorBottomGapScrollTop(options: {
  currentScrollTop: number
  clientHeight: number
  scrollHeight: number
  lineBottom: number
  bottomMargin: number
}): number | null {
  const maxScrollTop = Math.max(0, options.scrollHeight - options.clientHeight)
  const threshold = options.currentScrollTop + options.clientHeight - options.bottomMargin
  if (options.lineBottom <= threshold) return null

  const nextScrollTop = Math.min(
    maxScrollTop,
    Math.max(0, Math.ceil(options.lineBottom - options.clientHeight + options.bottomMargin))
  )

  if (Math.abs(nextScrollTop - options.currentScrollTop) < 1) return null

  return nextScrollTop
}

export function keepEditorCursorBottomGap(
  view: EditorView,
  options: {
    force?: boolean
  } = {}
): void {
  if (view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) return
  if (!options.force && !view.hasFocus) return

  const bottomMargin = Math.round(view.defaultLineHeight * EDITOR_CURSOR_SCROLL_LINES)
  const head = view.state.selection.main.head
  const force = options.force ?? false

  // Use requestMeasure so the read runs after CodeMirror finishes its own
  // layout pass.  This guarantees that scroller.scrollHeight reflects the
  // newly-added content (e.g. a line appended by pressing Enter at the bottom
  // of the document), so maxScrollTop is never stale-clamped.
  view.requestMeasure({
    read(v) {
      if (!force && !v.hasFocus) return null
      const line = v.lineBlockAt(head)
      const scroller = v.scrollDOM
      return resolveEditorCursorBottomGapScrollTop({
        currentScrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        lineBottom: line.bottom,
        bottomMargin,
      })
    },
    write(nextScrollTop, v) {
      if (typeof nextScrollTop === 'number') {
        v.scrollDOM.scrollTop = nextScrollTop
      }
    },
  })
}
