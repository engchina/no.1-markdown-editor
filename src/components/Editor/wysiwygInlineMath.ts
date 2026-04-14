import { collectInlineCodeRanges, rangeIntersectsTextRanges } from './wysiwygInlineCode.ts'

export interface InlineMathRange {
  from: number
  to: number
  latex: string
  editAnchor: number
}

const INLINE_MATH_PATTERN = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g

export function findInlineMathRanges(text: string): InlineMathRange[] {
  const ranges: InlineMathRange[] = []
  const excludedRanges = collectInlineCodeRanges(text)
  let match: RegExpExecArray | null

  while ((match = INLINE_MATH_PATTERN.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (rangeIntersectsTextRanges(from, to, excludedRanges)) continue

    const latex = match[1] ?? ''
    if (!latex) continue

    ranges.push({
      from,
      to,
      latex,
      editAnchor: from + 1,
    })
  }

  return ranges
}
