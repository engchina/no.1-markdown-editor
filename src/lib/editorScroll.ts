import type { EditorState, StateEffect } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { TabViewportAnchor } from './editorStateCache.ts'
import { pinViewportWhileSettling, type ViewportPin } from './viewportPin.ts'

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

// Read the anchor from the rendered DOM, not the height map: block widgets
// (WYSIWYG tables, images, math) can leave the height map a few px stale.
export function captureEditorViewportAnchor(view: EditorView): TabViewportAnchor | null {
  const viewportTop = view.scrollDOM.getBoundingClientRect().top
  for (const element of Array.from(view.contentDOM.children)) {
    const rect = element.getBoundingClientRect()
    if (rect.height <= 0 || rect.bottom <= viewportTop) continue

    const pos = view.posAtDOM(element)
    return {
      line: view.state.doc.lineAt(pos).number,
      fraction: clamp((viewportTop - rect.top) / rect.height, 0, 1),
      editor: { pos, offset: rect.top - viewportTop },
    }
  }
  return null
}

// A line-level anchor (from the preview) the editor still shows unchanged at
// the top: keep it rather than overwrite it with an equivalent editor anchor,
// so preview -> source -> preview returns to the exact preview position.
export function isSameLineViewport(
  saved: TabViewportAnchor | undefined,
  current: TabViewportAnchor
): boolean {
  return (
    !!saved &&
    !saved.editor &&
    saved.line === current.line &&
    Math.abs(current.editor?.offset ?? Number.POSITIVE_INFINITY) <= 1
  )
}

// Coarse scroll for the EditorView `scrollTo` option. CodeMirror measures the
// target with coordsAtPos, which can disagree with the line element's box for
// decorated lines, so pinEditorToViewportAnchor() finishes the job.
export function createEditorViewportAnchorScroll(
  state: EditorState,
  anchor: TabViewportAnchor
): StateEffect<unknown> {
  // `y: 'start'` puts the target at viewport top + yMargin, so a negative
  // offset reproduces a line that was partly scrolled past the top.
  if (anchor.editor && anchor.editor.pos <= state.doc.length) {
    return EditorView.scrollIntoView(anchor.editor.pos, { y: 'start', yMargin: anchor.editor.offset })
  }

  const line = state.doc.line(clamp(anchor.line, 1, state.doc.lines))
  return EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 0 })
}

export function pinEditorToViewportAnchor(view: EditorView, anchor: TabViewportAnchor): ViewportPin {
  const target = anchor.editor && anchor.editor.pos <= view.state.doc.length ? anchor.editor : null

  const align = () => {
    // Line-level anchors rely on the `scrollTo` option alone.
    if (!target || !view.dom.isConnected) return
    const element = Array.from(view.contentDOM.children).find(
      (child) => child.getBoundingClientRect().height > 0 && view.posAtDOM(child) === target.pos
    )
    if (!element) return
    const delta =
      element.getBoundingClientRect().top - view.scrollDOM.getBoundingClientRect().top - target.offset
    if (Math.abs(delta) > 0.5) view.scrollDOM.scrollTop += delta
  }
  return pinViewportWhileSettling(() => [view.contentDOM], align, view.scrollDOM)
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
