export interface SelectionBubbleRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface SelectionBubblePosition {
  top: number
  left: number
}

export interface SelectionBubbleSize {
  width: number
  height: number
}

export interface SelectionBubblePositionOptions {
  gap?: number
  edgePadding?: number
}

export const DEFAULT_AI_SELECTION_BUBBLE_SIZE: SelectionBubbleSize = {
  width: 224,
  height: 40,
}

const DEFAULT_BUBBLE_GAP = 4
const DEFAULT_EDGE_PADDING = 4

export function mergeSelectionBubbleRects(
  ...rects: Array<SelectionBubbleRect | null | undefined>
): SelectionBubbleRect | null {
  let mergedRect: SelectionBubbleRect | null = null

  for (const rect of rects) {
    if (!isFiniteSelectionBubbleRect(rect)) continue

    if (!mergedRect) {
      mergedRect = { ...rect }
      continue
    }

    mergedRect = {
      top: Math.min(mergedRect.top, rect.top),
      bottom: Math.max(mergedRect.bottom, rect.bottom),
      left: Math.min(mergedRect.left, rect.left),
      right: Math.max(mergedRect.right, rect.right),
    }
  }

  return mergedRect
}

export function computeAISelectionBubblePosition(
  targetRect: SelectionBubbleRect,
  wrapperRect: SelectionBubbleRect,
  bubbleSize: SelectionBubbleSize = DEFAULT_AI_SELECTION_BUBBLE_SIZE,
  options: SelectionBubblePositionOptions = {}
): SelectionBubblePosition {
  const edgePadding = resolveFiniteNonNegativeNumber(options.edgePadding, DEFAULT_EDGE_PADDING)
  const gap = resolveFiniteNonNegativeNumber(options.gap, DEFAULT_BUBBLE_GAP)
  const wrapperWidth = wrapperRect.right - wrapperRect.left
  const wrapperHeight = wrapperRect.bottom - wrapperRect.top
  const bubbleWidth = Math.max(
    resolveFiniteNumber(bubbleSize.width, DEFAULT_AI_SELECTION_BUBBLE_SIZE.width),
    1
  )
  const bubbleHeight = Math.max(
    resolveFiniteNumber(bubbleSize.height, DEFAULT_AI_SELECTION_BUBBLE_SIZE.height),
    1
  )
  const centerX = (targetRect.left + targetRect.right) / 2 - wrapperRect.left
  const minLeft = bubbleWidth / 2 + edgePadding
  const maxLeft = wrapperWidth - bubbleWidth / 2 - edgePadding
  const left = maxLeft >= minLeft ? clamp(centerX, minLeft, maxLeft) : wrapperWidth / 2

  const minTop = edgePadding
  const maxTop = wrapperHeight - bubbleHeight - edgePadding
  const preferredTop = targetRect.top - wrapperRect.top - bubbleHeight - gap
  const fallbackTop = targetRect.bottom - wrapperRect.top + gap

  let desiredTop = fallbackTop
  if (preferredTop >= minTop) {
    desiredTop = preferredTop
  } else if (fallbackTop > maxTop) {
    const spaceAbove = targetRect.top - wrapperRect.top
    const spaceBelow = wrapperRect.bottom - targetRect.bottom
    desiredTop = spaceAbove >= spaceBelow ? minTop : maxTop
  }

  const top = maxTop >= minTop ? clamp(desiredTop, minTop, maxTop) : minTop

  return {
    top,
    left,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isFiniteSelectionBubbleRect(
  rect: SelectionBubbleRect | null | undefined
): rect is SelectionBubbleRect {
  return Boolean(
    rect &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right)
  )
}

function resolveFiniteNonNegativeNumber(value: number | undefined, fallback: number): number {
  return Math.max(resolveFiniteNumber(value, fallback), 0)
}

function resolveFiniteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}
