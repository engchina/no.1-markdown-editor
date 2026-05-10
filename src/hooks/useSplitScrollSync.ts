import { useEffect, useRef } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  buildSourceLineMap,
  createScrollSyncGuard,
  lineFromScrollTop,
  scrollTopForLine,
  type ScrollSyncGuard,
  type SourceLineEntry,
} from '../lib/scrollSync'
import { useEditorStore } from '../store/editor'
import { useScrollSyncStore } from '../store/scrollSync'

const COOLDOWN_MS = 150

function readSourceLineEntries(container: HTMLElement): SourceLineEntry[] {
  const elements = container.querySelectorAll<HTMLElement>('[data-source-line]')
  const entries: SourceLineEntry[] = []
  // Use rect math instead of `element.offsetTop` so the position is always
  // measured against the scroll container itself, regardless of which ancestor
  // happens to be the offsetParent.
  const containerRect = container.getBoundingClientRect()
  const containerScrollTop = container.scrollTop
  for (const element of elements) {
    const raw = element.getAttribute('data-source-line')
    if (!raw) continue
    const line = Number.parseInt(raw, 10)
    if (!Number.isFinite(line) || line <= 0) continue
    const elementRect = element.getBoundingClientRect()
    const offsetTop = elementRect.top - containerRect.top + containerScrollTop
    entries.push({
      line,
      offsetTop,
      offsetHeight: elementRect.height,
    })
  }
  return entries
}

// Convert screen-y at the top of the editor viewport to a source line. Using
// posAtCoords avoids any assumption about CM6's internal "documentTop" /
// "documentPadding" properties and keeps the math symmetric with the
// rect-based preview side.
function lineAtEditorViewportTop(view: EditorView): { line: number; fraction: number } {
  const rect = view.scrollDOM.getBoundingClientRect()
  // Probe a few pixels in from the left edge so gutters/line-numbers don't
  // intercept the hit-test.
  const probeX = rect.left + Math.max(8, rect.width * 0.05)
  // Probe a single pixel below the top so we always land inside content.
  const probeY = rect.top + 1
  const pos = view.posAtCoords({ x: probeX, y: probeY }, false)
  if (pos === null) return { line: 1, fraction: 0 }
  const docLine = view.state.doc.lineAt(pos)
  const lineCoords = view.coordsAtPos(docLine.from)
  if (!lineCoords) return { line: docLine.number, fraction: 0 }
  const lineHeight = lineCoords.bottom - lineCoords.top
  const fraction =
    lineHeight > 0
      ? Math.max(0, Math.min(1, (rect.top - lineCoords.top) / lineHeight))
      : 0
  return { line: docLine.number, fraction }
}

// Scroll the editor so the requested source line lands at the top of the
// viewport. Uses screen coords end-to-end so we never depend on CM6's
// documentTop. Adjusts by the actual delta between the target line's screen
// position and the viewport's current screen position.
function scrollEditorToLine(view: EditorView, line: number, fraction: number): void {
  const docLineCount = view.state.doc.lines
  const safeLine = Math.max(1, Math.min(line, docLineCount))
  const docLine = view.state.doc.line(safeLine)
  const coords = view.coordsAtPos(docLine.from)
  if (!coords) return
  const rect = view.scrollDOM.getBoundingClientRect()
  const lineHeight = coords.bottom - coords.top
  // Position the line so that `fraction` of it has scrolled past the top.
  const desiredScreenTop = rect.top - lineHeight * Math.max(0, Math.min(1, fraction))
  const delta = coords.top - desiredScreenTop
  view.scrollDOM.scrollTop = view.scrollDOM.scrollTop + delta
}

export function useSplitScrollSync(): void {
  const viewMode = useEditorStore((state) => state.viewMode)
  const enabled = useEditorStore((state) => state.splitScrollSyncEnabled)
  const editorView = useScrollSyncStore((state) => state.editorView)
  const previewContainer = useScrollSyncStore((state) => state.previewContainer)
  const guardRef = useRef<ScrollSyncGuard | null>(null)

  useEffect(() => {
    if (!enabled || viewMode !== 'split' || !editorView || !previewContainer) return

    const guard = createScrollSyncGuard(COOLDOWN_MS)
    guardRef.current = guard

    const editorScroller = editorView.scrollDOM

    let editorScrollFrame = 0
    const onEditorScroll = () => {
      if (!guard.canDrive('editor')) return
      if (editorScrollFrame) cancelAnimationFrame(editorScrollFrame)
      editorScrollFrame = requestAnimationFrame(() => {
        editorScrollFrame = 0
        if (!editorView.dom.isConnected || !previewContainer.isConnected) return
        // Rebuild the map JIT — getBoundingClientRect on a few-hundred entries
        // is fast enough and eliminates every stale-map class of bug we hit
        // when caching across mutations / async layout shifts.
        const map = buildSourceLineMap(readSourceLineEntries(previewContainer))
        if (map.entries.length === 0) return
        const { line, fraction } = lineAtEditorViewportTop(editorView)
        const targetTop = scrollTopForLine(map, { line, fraction })
        guard.noteDrove('editor')
        previewContainer.scrollTop = targetTop
      })
    }

    let previewScrollFrame = 0
    const onPreviewScroll = () => {
      if (!guard.canDrive('preview')) return
      if (previewScrollFrame) cancelAnimationFrame(previewScrollFrame)
      previewScrollFrame = requestAnimationFrame(() => {
        previewScrollFrame = 0
        if (!previewContainer.isConnected || !editorView.dom.isConnected) return
        const map = buildSourceLineMap(readSourceLineEntries(previewContainer))
        if (map.entries.length === 0) return
        const lookup = lineFromScrollTop(map, previewContainer.scrollTop)
        guard.noteDrove('preview')
        scrollEditorToLine(editorView, lookup.line, lookup.fraction)
      })
    }

    editorScroller.addEventListener('scroll', onEditorScroll, { passive: true })
    previewContainer.addEventListener('scroll', onPreviewScroll, { passive: true })

    return () => {
      editorScroller.removeEventListener('scroll', onEditorScroll)
      previewContainer.removeEventListener('scroll', onPreviewScroll)
      if (editorScrollFrame) cancelAnimationFrame(editorScrollFrame)
      if (previewScrollFrame) cancelAnimationFrame(previewScrollFrame)
      guardRef.current = null
    }
  }, [enabled, viewMode, editorView, previewContainer])
}
