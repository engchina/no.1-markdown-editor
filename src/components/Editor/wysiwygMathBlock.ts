import type { MathBlock } from './mathBlockRanges.ts'
import type { WysiwygDecorationView } from './wysiwygCodeBlock.ts'

export function collectInactiveWysiwygMathBlocks(
  view: WysiwygDecorationView,
  mathBlocks: readonly MathBlock[]
): MathBlock[] {
  return mathBlocks.filter((mathBlock) =>
    intersectsVisibleRanges(view, mathBlock) && !selectionTouchesMathBlock(view, mathBlock)
  )
}

function intersectsVisibleRanges(
  view: WysiwygDecorationView,
  mathBlock: MathBlock
): boolean {
  return view.visibleRanges.some((range) => range.from <= mathBlock.to && range.to >= mathBlock.from)
}

function selectionTouchesMathBlock(
  view: WysiwygDecorationView,
  mathBlock: MathBlock
): boolean {
  const { ranges } = view.state.selection
  return ranges.some((range) => range.from <= mathBlock.to && range.to >= mathBlock.from)
}
