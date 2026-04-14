import {
  collectInlineCodeRanges,
  findContainingTextRange,
  type TextRange,
} from './wysiwygInlineCode.ts'

export interface InlineSuperscriptRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

const INLINE_MATH_PATTERN = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g

function hasOddTrailingBackslashes(text: string, index: number): boolean {
  let count = 0

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    count += 1
  }

  return count % 2 === 1
}

function collectExcludedRanges(text: string): TextRange[] {
  const ranges = collectInlineCodeRanges(text)
  let match: RegExpExecArray | null

  while ((match = INLINE_MATH_PATTERN.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length })
  }

  return ranges.sort((left, right) => left.from - right.from)
}

export function findInlineSuperscriptRanges(text: string): InlineSuperscriptRange[] {
  const ranges: InlineSuperscriptRange[] = []
  const excludedRanges = collectExcludedRanges(text)

  for (let index = 0; index < text.length; index += 1) {
    const excludedRange = findContainingTextRange(index, excludedRanges)
    if (excludedRange) {
      index = excludedRange.to - 1
      continue
    }

    if (text[index] !== '^' || hasOddTrailingBackslashes(text, index)) {
      continue
    }

    const previousChar = index > 0 ? text[index - 1] : null
    const nextChar = text[index + 1] ?? null
    if (previousChar === '[' || nextChar === null || nextChar === '^' || nextChar === '[' || /\s/u.test(nextChar)) {
      continue
    }

    let closingIndex = -1
    for (let cursor = index + 1; cursor < text.length; cursor += 1) {
      const nestedExcludedRange = findContainingTextRange(cursor, excludedRanges)
      if (nestedExcludedRange) {
        closingIndex = -1
        break
      }

      if (text[cursor] === '^' && !hasOddTrailingBackslashes(text, cursor)) {
        closingIndex = cursor
        break
      }
    }

    if (closingIndex === -1) continue

    const content = text.slice(index + 1, closingIndex)
    if (!content || /^\s/u.test(content) || /\s$/u.test(content) || content.includes('\n')) {
      continue
    }

    ranges.push({
      from: index,
      to: closingIndex + 1,
      contentFrom: index + 1,
      contentTo: closingIndex,
    })
    index = closingIndex
  }

  return ranges
}
