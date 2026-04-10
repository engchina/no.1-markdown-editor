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

export const DEFAULT_AI_SELECTION_BUBBLE_SIZE: SelectionBubbleSize = {
  width: 224,
  height: 40,
}

const BUBBLE_MARGIN = 10

export function computeAISelectionBubblePosition(
  anchorRect: SelectionBubbleRect,
  wrapperRect: SelectionBubbleRect,
  bubbleSize: SelectionBubbleSize = DEFAULT_AI_SELECTION_BUBBLE_SIZE
): SelectionBubblePosition {
  const wrapperWidth = wrapperRect.right - wrapperRect.left
  const wrapperHeight = wrapperRect.bottom - wrapperRect.top
  const bubbleWidth = Math.max(bubbleSize.width, 1)
  const bubbleHeight = Math.max(bubbleSize.height, 1)
  const centerX = (anchorRect.left + anchorRect.right) / 2 - wrapperRect.left
  const minLeft = bubbleWidth / 2 + BUBBLE_MARGIN
  const maxLeft = wrapperWidth - bubbleWidth / 2 - BUBBLE_MARGIN
  const left = maxLeft >= minLeft ? clamp(centerX, minLeft, maxLeft) : wrapperWidth / 2

  const preferredTop = anchorRect.top - wrapperRect.top - bubbleHeight - BUBBLE_MARGIN
  const fallbackTop = anchorRect.bottom - wrapperRect.top + BUBBLE_MARGIN
  const desiredTop = preferredTop >= BUBBLE_MARGIN ? preferredTop : fallbackTop
  const minTop = BUBBLE_MARGIN
  const maxTop = wrapperHeight - bubbleHeight - BUBBLE_MARGIN
  const top = maxTop >= minTop ? clamp(desiredTop, minTop, maxTop) : minTop

  return {
    top,
    left,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
