import { collectInlineCodeRanges, findContainingTextRange, type TextRange } from './wysiwygInlineCode.ts'
import { hasOddTrailingBackslashes } from './wysiwygInlineLiterals.ts'
import { findInlineMathRanges } from './wysiwygInlineMath.ts'

export interface InlineSubscriptRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

type BoundaryCharacterGroup = 'whitespace' | 'punctuation' | 'other'

const ASCII_PUNCTUATION_PATTERN = /[!-/:-@[-`{-~]/u

function classifyBoundaryCharacter(char: string | null): BoundaryCharacterGroup {
  if (char === null || /\s/u.test(char)) return 'whitespace'
  if (ASCII_PUNCTUATION_PATTERN.test(char) || /\p{P}/u.test(char)) return 'punctuation'
  return 'other'
}

function canOpenSubscript(
  before: BoundaryCharacterGroup,
  after: BoundaryCharacterGroup
): boolean {
  return after === 'other' || (after === 'punctuation' && before !== 'other')
}

function canCloseSubscript(
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

export function findInlineSubscriptRanges(text: string): InlineSubscriptRange[] {
  const ranges: InlineSubscriptRange[] = []
  const excludedRanges = collectExcludedRanges(text)
  const openers: number[] = []

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
    if (markerLength !== 1) {
      index += markerLength - 1
      continue
    }

    const before = classifyBoundaryCharacter(index > 0 ? text[index - 1] : null)
    const after = classifyBoundaryCharacter(text[index + 1] ?? null)
    const canOpen = canOpenSubscript(before, after)
    const canClose = canCloseSubscript(before, after)

    if (canClose) {
      const opener = openers[openers.length - 1]
      if (typeof opener === 'number' && opener + 1 < index) {
        openers.pop()
        ranges.push({
          from: opener,
          to: index + 1,
          contentFrom: opener + 1,
          contentTo: index,
        })
        continue
      }
    }

    if (canOpen) {
      openers.push(index)
    }
  }

  return ranges.sort((left, right) => left.from - right.from || left.to - right.to)
}
