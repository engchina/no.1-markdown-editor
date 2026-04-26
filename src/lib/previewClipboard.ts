import { normalizeClipboardPlainText } from './clipboardHtml.ts'
import { convertClipboardHtmlToMarkdown } from './pasteHtml.ts'

export interface PreviewSelectionFragment {
  html: string
  plainText: string
}

export function extractPreviewSelectionFragment(
  selection: Selection,
  preview: HTMLElement
): PreviewSelectionFragment | null {
  if (selection.isCollapsed || selection.rangeCount !== 1) return null

  const range = selection.getRangeAt(0)
  if (!preview.contains(range.commonAncestorContainer)) return null

  const copyRange = expandPreviewSelectionRangeForClosedDetails(range, preview)
  const container = preview.ownerDocument.createElement('div')
  container.append(copyRange.cloneContents())

  return {
    html: container.innerHTML,
    plainText: selection.toString(),
  }
}

export function convertPreviewSelectionHtmlToMarkdown(selectionHtml: string, plainText: string): string {
  const normalizedPlainText = normalizeClipboardPlainText(plainText)
  return convertClipboardHtmlToMarkdown(selectionHtml, normalizedPlainText) ?? normalizedPlainText
}

function expandPreviewSelectionRangeForClosedDetails(range: Range, preview: HTMLElement): Range {
  const detailsElements = Array.from(preview.querySelectorAll<HTMLDetailsElement>('details')).filter((details) =>
    shouldExpandClosedDetailsSelection(range, details)
  )
  if (detailsElements.length === 0) return range

  const expandedRange = range.cloneRange()
  for (const details of detailsElements) {
    expandRangeToIncludeNode(expandedRange, details)
  }

  return expandedRange
}

export function shouldExpandClosedDetailsSelection(range: Range, details: HTMLDetailsElement): boolean {
  if (details.open) return false

  const summary = details.querySelector<HTMLElement>(':scope > summary')
  if (!summary) return false

  try {
    return range.intersectsNode(summary)
  } catch {
    return false
  }
}

function expandRangeToIncludeNode(range: Range, node: Node): void {
  const nodeRange = node.ownerDocument?.createRange()
  if (!nodeRange) return

  nodeRange.selectNode(node)

  if (range.compareBoundaryPoints(Range.START_TO_START, nodeRange) > 0) {
    range.setStartBefore(node)
  }

  if (range.compareBoundaryPoints(Range.END_TO_END, nodeRange) < 0) {
    range.setEndAfter(node)
  }
}
