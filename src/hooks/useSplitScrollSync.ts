import { useEffect, useRef } from 'react'
import {
  buildSourceLineMap,
  createScrollSyncGuard,
  lineFromScrollTop,
  scrollTopForLine,
  type ScrollSyncGuard,
  type SourceLineEntry,
  type SourceLineMap,
} from '../lib/scrollSync'
import { useEditorStore } from '../store/editor'
import { useScrollSyncStore } from '../store/scrollSync'

const COOLDOWN_MS = 150

function readSourceLineEntries(container: HTMLElement): SourceLineEntry[] {
  const elements = container.querySelectorAll<HTMLElement>('[data-source-line]')
  const entries: SourceLineEntry[] = []
  for (const element of elements) {
    const raw = element.getAttribute('data-source-line')
    if (!raw) continue
    const line = Number.parseInt(raw, 10)
    if (!Number.isFinite(line) || line <= 0) continue
    entries.push({
      line,
      offsetTop: element.offsetTop,
      offsetHeight: element.offsetHeight,
    })
  }
  return entries
}

export function useSplitScrollSync(): void {
  const viewMode = useEditorStore((state) => state.viewMode)
  const enabled = useEditorStore((state) => state.splitScrollSyncEnabled)
  const editorView = useScrollSyncStore((state) => state.editorView)
  const previewContainer = useScrollSyncStore((state) => state.previewContainer)
  const guardRef = useRef<ScrollSyncGuard | null>(null)
  const mapRef = useRef<SourceLineMap | null>(null)

  useEffect(() => {
    if (!enabled || viewMode !== 'split' || !editorView || !previewContainer) return

    const guard = createScrollSyncGuard(COOLDOWN_MS)
    guardRef.current = guard

    const editorScroller = editorView.scrollDOM

    const rebuildMap = () => {
      mapRef.current = buildSourceLineMap(readSourceLineEntries(previewContainer))
    }

    const ensureMap = (): SourceLineMap => {
      if (!mapRef.current) rebuildMap()
      return mapRef.current ?? { entries: [] }
    }

    let editorScrollFrame = 0
    const onEditorScroll = () => {
      if (!guard.canDrive('editor')) return
      if (editorScrollFrame) cancelAnimationFrame(editorScrollFrame)
      editorScrollFrame = requestAnimationFrame(() => {
        editorScrollFrame = 0
        if (!editorView.dom.isConnected) return
        const scrollTop = editorScroller.scrollTop
        // Use CodeMirror's coordinate APIs to find the source-document line at
        // the top of the viewport. We resolve via lineBlockAtHeight for precision.
        const block = editorView.lineBlockAtHeight(scrollTop)
        const line = editorView.state.doc.lineAt(block.from).number
        const fractionalProgress =
          block.bottom > block.top ? (scrollTop - block.top) / (block.bottom - block.top) : 0

        const map = ensureMap()
        if (map.entries.length === 0) return
        const targetTop = scrollTopForLine(map, { line, fraction: fractionalProgress })
        guard.noteDrove('editor')
        previewContainer.scrollTo({ top: targetTop, behavior: 'auto' })
      })
    }

    let previewScrollFrame = 0
    const onPreviewScroll = () => {
      if (!guard.canDrive('preview')) return
      if (previewScrollFrame) cancelAnimationFrame(previewScrollFrame)
      previewScrollFrame = requestAnimationFrame(() => {
        previewScrollFrame = 0
        if (!previewContainer.isConnected) return
        const map = ensureMap()
        if (map.entries.length === 0) return
        const lookup = lineFromScrollTop(map, previewContainer.scrollTop)
        const docLineCount = editorView.state.doc.lines
        const safeLine = Math.max(1, Math.min(lookup.line, docLineCount))
        const lineBlock = editorView.lineBlockAt(editorView.state.doc.line(safeLine).from)
        const targetTop = lineBlock.top + (lineBlock.bottom - lineBlock.top) * lookup.fraction
        guard.noteDrove('preview')
        editorScroller.scrollTo({ top: targetTop, behavior: 'auto' })
      })
    }

    // Map gets stale on content changes (re-render replaces innerHTML), images
    // loading (height changes), and KaTeX/Shiki async typesetting. A
    // MutationObserver covers content swaps; load events on bubbling and a
    // ResizeObserver on the preview container itself cover async layout shifts.
    const mutationObserver = new MutationObserver(() => {
      mapRef.current = null
    })
    mutationObserver.observe(previewContainer, { childList: true, subtree: true })

    const resizeObserver = new ResizeObserver(() => {
      mapRef.current = null
    })
    resizeObserver.observe(previewContainer)

    const onLoad = () => {
      mapRef.current = null
    }
    previewContainer.addEventListener('load', onLoad, true)

    rebuildMap()
    editorScroller.addEventListener('scroll', onEditorScroll, { passive: true })
    previewContainer.addEventListener('scroll', onPreviewScroll, { passive: true })

    return () => {
      editorScroller.removeEventListener('scroll', onEditorScroll)
      previewContainer.removeEventListener('scroll', onPreviewScroll)
      previewContainer.removeEventListener('load', onLoad, true)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      if (editorScrollFrame) cancelAnimationFrame(editorScrollFrame)
      if (previewScrollFrame) cancelAnimationFrame(previewScrollFrame)
      guardRef.current = null
      mapRef.current = null
    }
  }, [enabled, viewMode, editorView, previewContainer])
}
