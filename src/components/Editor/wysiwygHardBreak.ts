import { rangeIntersectsTextRanges, type TextRange } from './wysiwygInlineCode.ts'
import { hasOddTrailingBackslashes } from './wysiwygInlineLiterals.ts'

export interface InlineHardBreakToken {
  from: number
  to: number
  renderWidget: boolean
}

const INLINE_HTML_HARD_BREAK_PATTERN = /<br\s*\/?>/giu
const TRAILING_SPACE_HARD_BREAK_PATTERN = / {2,}$/u

export function collectInlineHardBreakTokens(
  text: string,
  excludedRanges: readonly TextRange[] = [],
  options: {
    hasFollowingLine?: boolean
  } = {}
): InlineHardBreakToken[] {
  const { hasFollowingLine = true } = options
  const tokens: InlineHardBreakToken[] = []
  let match: RegExpExecArray | null

  while ((match = INLINE_HTML_HARD_BREAK_PATTERN.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (rangeIntersectsTextRanges(from, to, excludedRanges)) continue

    tokens.push({
      from,
      to,
      renderWidget: to !== text.length || !hasFollowingLine,
    })
  }

  INLINE_HTML_HARD_BREAK_PATTERN.lastIndex = 0

  if (!hasFollowingLine) return tokens

  const trailingBackslashToken = findTrailingBackslashHardBreakToken(text, excludedRanges)
  if (trailingBackslashToken) {
    tokens.push(trailingBackslashToken)
  }

  const trailingSpaceToken = findTrailingSpaceHardBreakToken(text, excludedRanges)
  if (trailingSpaceToken) {
    tokens.push(trailingSpaceToken)
  }

  return tokens.sort((left, right) => left.from - right.from || left.to - right.to)
}

function findTrailingBackslashHardBreakToken(
  text: string,
  excludedRanges: readonly TextRange[]
): InlineHardBreakToken | null {
  const from = text.length - 1
  if (from < 0 || text[from] !== '\\') return null
  if (hasOddTrailingBackslashes(text, from)) return null
  if (rangeIntersectsTextRanges(from, text.length, excludedRanges)) return null

  return {
    from,
    to: text.length,
    renderWidget: false,
  }
}

function findTrailingSpaceHardBreakToken(
  text: string,
  excludedRanges: readonly TextRange[]
): InlineHardBreakToken | null {
  const match = text.match(TRAILING_SPACE_HARD_BREAK_PATTERN)
  if (!match) return null

  const from = text.length - match[0].length
  if (rangeIntersectsTextRanges(from, text.length, excludedRanges)) return null

  return {
    from,
    to: text.length,
    renderWidget: false,
  }
}
