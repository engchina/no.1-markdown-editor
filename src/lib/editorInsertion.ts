export interface EditorInsertionRange {
  from: number
  to: number
}

export interface SafeEditorInsertion {
  range: EditorInsertionRange
  selectionAnchor: number
}

export function resolveSafeEditorInsertion(
  docLength: number,
  range: EditorInsertionRange,
  insertedTextLength: number,
  selectionAnchor: number
): SafeEditorInsertion {
  const safeDocLength = clampOffset(docLength, Number.MAX_SAFE_INTEGER)
  const safeFrom = clampOffset(range.from, safeDocLength)
  const safeTo = clampOffset(range.to, safeDocLength)
  const normalizedRange = {
    from: Math.min(safeFrom, safeTo),
    to: Math.max(safeFrom, safeTo),
  }
  const safeInsertedTextLength = Math.max(0, Math.trunc(insertedTextLength))
  const nextDocLength =
    safeDocLength - (normalizedRange.to - normalizedRange.from) + safeInsertedTextLength

  return {
    range: normalizedRange,
    selectionAnchor: clampOffset(selectionAnchor, nextDocLength),
  }
}

function clampOffset(value: number, max: number): number {
  const safeMax = Math.max(0, Math.trunc(max))
  const safeValue = Number.isFinite(value) ? Math.trunc(value) : 0

  return Math.min(Math.max(safeValue, 0), safeMax)
}
