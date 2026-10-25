import type { TabViewportAnchor } from './editorStateCache.ts'
import {
  buildSourceLineMap,
  lineFromScrollTop,
  scrollTopForLine,
  type SourceLineEntry,
} from './scrollSync.ts'
import { pinViewportWhileSettling, type ViewportPin } from './viewportPin.ts'

export function readSourceLineEntries(container: HTMLElement): SourceLineEntry[] {
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

export function capturePreviewViewportAnchor(preview: HTMLElement): TabViewportAnchor | null {
  const map = buildSourceLineMap(readSourceLineEntries(preview))
  if (map.entries.length === 0) return null
  return lineFromScrollTop(map, preview.scrollTop)
}

export function previewScrollTopForAnchor(preview: HTMLElement, anchor: TabViewportAnchor): number | null {
  const map = buildSourceLineMap(readSourceLineEntries(preview))
  if (map.entries.length === 0) return null
  const first = map.entries[0]
  // At (or above) the first block, show the document top with its padding.
  if (anchor.line < first.line || (anchor.line === first.line && anchor.fraction === 0)) return 0
  return scrollTopForLine(map, anchor)
}

function applyPreviewViewportAnchor(preview: HTMLElement, anchor: TabViewportAnchor): void {
  const top = previewScrollTopForAnchor(preview, anchor)
  if (top !== null && Math.abs(preview.scrollTop - top) > 0.5) preview.scrollTop = top
}

export function pinPreviewToViewportAnchor(preview: HTMLElement, anchor: TabViewportAnchor): ViewportPin {
  return pinViewportWhileSettling(
    () => Array.from(preview.children),
    () => applyPreviewViewportAnchor(preview, anchor)
  )
}
