export interface TextRange {
  from: number
  to: number
}

const INLINE_CODE_PATTERN = /(`+)(.+?)\1/g

export function collectInlineCodeRanges(text: string): TextRange[] {
  const ranges: TextRange[] = []
  let match: RegExpExecArray | null

  while ((match = INLINE_CODE_PATTERN.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length })
  }

  return ranges
}

export function findContainingTextRange(index: number, ranges: readonly TextRange[]): TextRange | null {
  for (const range of ranges) {
    if (range.from > index) break
    if (index >= range.from && index < range.to) return range
  }

  return null
}

export function rangeIntersectsTextRanges(
  from: number,
  to: number,
  ranges: readonly TextRange[]
): boolean {
  return ranges.some((range) => from < range.to && to > range.from)
}
