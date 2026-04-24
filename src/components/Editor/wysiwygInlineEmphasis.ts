import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { collectInlineCodeRanges, findContainingTextRange } from './wysiwygInlineCode.ts'
import { hasOddTrailingBackslashes } from './wysiwygInlineLiterals.ts'
import { isThematicBreakLine } from './thematicBreak.ts'

export interface InlineItalicRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

export interface InlineBoldItalicRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

const ASTERISK_ITALIC_PATTERN = /(?<!\*)(\*)(?!\*)((?:[^*])+?)(\*)(?!\*)/g
const UNDERSCORE_ITALIC_PATTERN =
  /(?<![\p{Letter}\p{Number}_])(_)(?![_\s])(.+?)(?<!\s)(_)(?![\p{Letter}\p{Number}_])/gu
const COMBINED_ASTERISK_PATTERN = /^\*\*\*(?=\S)[\s\S]+(?<=\S)\*\*\*$/u
const COMBINED_UNDERSCORE_PATTERN = /^___(?![_\s])[\s\S]+(?<!\s)___$/u
const COMBINED_EMPHASIS_DELIMITER_LENGTH = 3
const combinedEmphasisCache = new Map<string, InlineBoldItalicRange[]>()
const inlineEmphasisAstParser = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)

interface MarkdownAstNode {
  type: string
  children?: MarkdownAstNode[]
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
}

export function findInlineItalicRanges(text: string): InlineItalicRange[] {
  if (isThematicBreakLine(text)) return []

  const ranges: InlineItalicRange[] = []
  const excludedRanges = collectInlineCodeRanges(text)

  collectInlineItalicRanges(text, ASTERISK_ITALIC_PATTERN, ranges, excludedRanges)
  collectInlineItalicRanges(text, UNDERSCORE_ITALIC_PATTERN, ranges, excludedRanges)

  return ranges.sort((left, right) => left.from - right.from || left.to - right.to)
}

export function findInlineBoldItalicRanges(text: string): InlineBoldItalicRange[] {
  if (isThematicBreakLine(text)) return []
  if (!text.includes('***') && !text.includes('___')) return []

  const cached = combinedEmphasisCache.get(text)
  if (cached !== undefined) return cached

  const ranges: InlineBoldItalicRange[] = []
  const tree = inlineEmphasisAstParser.parse(text) as MarkdownAstNode
  collectInlineBoldItalicRanges(tree, text, ranges)

  const sorted = ranges.sort((left, right) => left.from - right.from || left.to - right.to)
  combinedEmphasisCache.set(text, sorted)
  return sorted
}

function collectInlineItalicRanges(
  text: string,
  pattern: RegExp,
  ranges: InlineItalicRange[],
  excludedRanges: readonly { from: number; to: number }[]
): void {
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (findContainingTextRange(from, excludedRanges) || findContainingTextRange(to - 1, excludedRanges)) {
      continue
    }

    const openingMarker = match[1] ?? ''
    const closingMarker = match[3] ?? openingMarker
    const closingMarkerStart = to - closingMarker.length
    const contentFrom = from + openingMarker.length
    const contentTo = to - closingMarker.length

    if (hasOddTrailingBackslashes(text, from) || hasOddTrailingBackslashes(text, closingMarkerStart)) {
      continue
    }

    if (contentFrom >= contentTo) continue

    ranges.push({
      from,
      to,
      contentFrom,
      contentTo,
    })
  }
}

function collectInlineBoldItalicRanges(
  node: MarkdownAstNode,
  text: string,
  ranges: InlineBoldItalicRange[]
): void {
  if (node.type === 'emphasis' && hasStrongDescendant(node)) {
    const offsets = getNodeOffsets(node)
    if (offsets !== null) {
      const { from, to } = offsets
      if (to - from > COMBINED_EMPHASIS_DELIMITER_LENGTH * 2) {
        const slice = text.slice(from, to)
        if (isCombinedEmphasisSlice(slice)) {
          ranges.push({
            from,
            to,
            contentFrom: from + COMBINED_EMPHASIS_DELIMITER_LENGTH,
            contentTo: to - COMBINED_EMPHASIS_DELIMITER_LENGTH,
          })
        }
      }
    }
  }

  for (const child of node.children ?? []) {
    collectInlineBoldItalicRanges(child, text, ranges)
  }
}

function hasStrongDescendant(node: MarkdownAstNode): boolean {
  if (node.type === 'strong') return true
  return (node.children ?? []).some((child) => hasStrongDescendant(child))
}

function getNodeOffsets(node: MarkdownAstNode): { from: number; to: number } | null {
  const from = node.position?.start?.offset
  const to = node.position?.end?.offset

  if (typeof from !== 'number' || typeof to !== 'number' || from >= to) {
    return null
  }

  return { from, to }
}

function isCombinedEmphasisSlice(slice: string): boolean {
  return COMBINED_ASTERISK_PATTERN.test(slice) || COMBINED_UNDERSCORE_PATTERN.test(slice)
}
