import { collectInlineCodeRanges, findContainingTextRange, type TextRange } from './wysiwygInlineCode.ts'
import { hasOddTrailingBackslashes } from './wysiwygInlineLiterals.ts'
import { findInlineMathRanges } from './wysiwygInlineMath.ts'

export interface InlineStrikethroughRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

type MarkerLength = 1 | 2
type BoundaryCharacterGroup = 'whitespace' | 'punctuation' | 'other'

const ASCII_PUNCTUATION_PATTERN = /[!-/:-@[-`{-~]/u

function classifyBoundaryCharacter(char: string | null): BoundaryCharacterGroup {
  if (char === null || /\s/u.test(char)) return 'whitespace'
  if (ASCII_PUNCTUATION_PATTERN.test(char) || /\p{P}/u.test(char)) return 'punctuation'
  return 'other'
}

function canOpenStrikethrough(
  before: BoundaryCharacterGroup,
  after: BoundaryCharacterGroup
): boolean {
  return after === 'other' || (after === 'punctuation' && before !== 'other')
}

function canCloseStrikethrough(
  before: BoundaryCharacterGroup,
  after: BoundaryCharacterGroup
): boolean {
  return before === 'other' || (before === 'punctuation' && after !== 'other')
}

function collectExcludedRanges(text: string): TextRange[] {
  return [
    ...collectInlineCodeRanges(text),
    ...findInlineMathRanges(text).map(({ from, to }) => ({ from, to })),
  ].sort((left, right) => left.from - right.from || left.to - right.to)
}

function countTildeRun(text: string, index: number): number {
  let size = 0

  while (text[index + size] === '~') {
    size += 1
  }

  return size
}

export function findInlineStrikethroughRanges(text: string): InlineStrikethroughRange[] {
  const ranges: InlineStrikethroughRange[] = []
  const excludedRanges = collectExcludedRanges(text)
  const openers: Record<MarkerLength, number[]> = { 1: [], 2: [] }

  for (let index = 0; index < text.length; index += 1) {
    const excludedRange = findContainingTextRange(index, excludedRanges)
    if (excludedRange) {
      index = excludedRange.to - 1
      continue
    }

    if (text[index] !== '~' || hasOddTrailingBackslashes(text, index)) {
      continue
    }

    if (text[index - 1] === '~') {
      continue
    }

    const markerLength = countTildeRun(text, index)
    if (markerLength > 2) {
      index += markerLength - 1
      continue
    }

    const markerSize = markerLength as MarkerLength
    const before = classifyBoundaryCharacter(index > 0 ? text[index - 1] : null)
    const after = classifyBoundaryCharacter(text[index + markerSize] ?? null)
    const canOpen = canOpenStrikethrough(before, after)
    const canClose = canCloseStrikethrough(before, after)

    if (canClose) {
      const opener = openers[markerSize][openers[markerSize].length - 1]
      if (typeof opener === 'number' && opener + markerSize < index) {
        openers[markerSize].pop()
        ranges.push({
          from: opener,
          to: index + markerSize,
          contentFrom: opener + markerSize,
          contentTo: index,
        })
        index += markerSize - 1
        continue
      }
    }

    if (canOpen) {
      openers[markerSize].push(index)
    }

    index += markerSize - 1
  }

  return ranges.sort((left, right) => left.from - right.from || left.to - right.to)
}
