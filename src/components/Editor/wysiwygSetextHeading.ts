import { isThematicBreakLine } from './thematicBreak.ts'

export interface WysiwygSetextHeading {
  from: number
  to: number
  contentFrom: number
  contentTo: number
  underlineFrom: number
  underlineTo: number
  level: 1 | 2
}

const SETEXT_UNDERLINE_PATTERN = /^ {0,3}(=+|-+)[ \t]*$/
const ATX_HEADING_PREFIX_PATTERN = /^ {0,3}#{1,6}(\s|$)/

interface LineSpan {
  from: number
  to: number
  text: string
}

function splitMarkdownIntoLines(markdown: string): LineSpan[] {
  const lines: LineSpan[] = []
  let from = 0
  for (let i = 0; i <= markdown.length; i += 1) {
    if (i === markdown.length || markdown.charCodeAt(i) === 10) {
      lines.push({ from, to: i, text: markdown.slice(from, i) })
      from = i + 1
    }
  }
  return lines
}

function rangeIntersectsAny(
  range: { from: number; to: number },
  ignored: readonly { from: number; to: number }[]
): boolean {
  for (const candidate of ignored) {
    if (range.from <= candidate.to && range.to >= candidate.from) return true
  }
  return false
}

export function collectWysiwygSetextHeadings(
  markdown: string,
  ignoredRanges: readonly { from: number; to: number }[]
): WysiwygSetextHeading[] {
  const lines = splitMarkdownIntoLines(markdown)
  const blocks: WysiwygSetextHeading[] = []
  let consumedUntilIndex = -1

  let i = 1
  while (i < lines.length) {
    const line = lines[i]
    const match = SETEXT_UNDERLINE_PATTERN.exec(line.text)
    if (!match || rangeIntersectsAny(line, ignoredRanges)) {
      i += 1
      continue
    }

    let contentStart = -1
    let j = i - 1
    while (j > consumedUntilIndex) {
      const prev = lines[j]
      if (prev.text.trim() === '') break
      if (rangeIntersectsAny(prev, ignoredRanges)) break
      if (ATX_HEADING_PREFIX_PATTERN.test(prev.text)) break
      if (isThematicBreakLine(prev.text)) break
      contentStart = j
      j -= 1
    }

    if (contentStart === -1) {
      i += 1
      continue
    }

    const level: 1 | 2 = match[1].charCodeAt(0) === 61 /* '=' */ ? 1 : 2
    const contentLine = lines[contentStart]
    const lastContentLine = lines[i - 1]
    const underlineLine = lines[i]

    blocks.push({
      from: contentLine.from,
      to: underlineLine.to,
      contentFrom: contentLine.from,
      contentTo: lastContentLine.to,
      underlineFrom: underlineLine.from,
      underlineTo: underlineLine.to,
      level,
    })

    consumedUntilIndex = i
    i += 1
  }

  return blocks
}
