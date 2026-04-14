import { findContainingTextRange, type TextRange } from './wysiwygInlineCode.ts'

const INLINE_LITERAL_ESCAPE_TARGETS = new Set(['*', '_', '~', '=', '^', '`', '[', ']', '(', ')', '!'])

export function hasOddTrailingBackslashes(text: string, index: number): boolean {
  let count = 0

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    count += 1
  }

  return count % 2 === 1
}

export function collectInlineLiteralEscapeRanges(
  text: string,
  excludedRanges: readonly TextRange[] = []
): TextRange[] {
  const ranges: TextRange[] = []

  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] !== '\\') continue
    if (hasOddTrailingBackslashes(text, index)) continue
    if (findContainingTextRange(index, excludedRanges) || findContainingTextRange(index + 1, excludedRanges)) {
      continue
    }

    if (!INLINE_LITERAL_ESCAPE_TARGETS.has(text[index + 1] ?? '')) continue

    ranges.push({ from: index, to: index + 1 })
  }

  return ranges
}
