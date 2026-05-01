import type { TextRange } from './fencedCodeRanges.ts'
import type { WysiwygDecorationView } from './wysiwygCodeBlock.ts'

interface MarkdownLine extends TextRange {
  text: string
}

interface PendingRawHtmlBlock {
  from: number
  tagName: string
  depth: number
  editAnchor: number
}

interface RawHtmlTagToken extends TextRange {
  tagName: string
  closing: boolean
  selfClosing: boolean
}

export interface WysiwygRawHtmlBlock extends TextRange {
  html: string
  editAnchor: number
}

const RENDERED_RAW_HTML_BLOCK_TAGS = new Set(['audio', 'figure', 'iframe', 'img', 'picture', 'video'])

export function collectWysiwygRawHtmlBlocks(
  markdown: string,
  ignoredRanges: readonly TextRange[] = []
): WysiwygRawHtmlBlock[] {
  const blocks: WysiwygRawHtmlBlock[] = []
  const sortedIgnoredRanges = [...ignoredRanges].sort((left, right) => left.from - right.from || left.to - right.to)
  const lines = splitMarkdownLines(markdown)
  let ignoredRangeIndex = 0
  let pending: PendingRawHtmlBlock | null = null

  for (const line of lines) {
    while (ignoredRangeIndex < sortedIgnoredRanges.length && sortedIgnoredRanges[ignoredRangeIndex].to < line.from) {
      ignoredRangeIndex += 1
    }

    if (lineIntersectsRange(line, sortedIgnoredRanges[ignoredRangeIndex])) {
      pending = null
      continue
    }

    if (pending) {
      const close = parseRawHtmlBlockContinuationLine(line.text, pending.tagName, pending.depth)
      if (!close) {
        pending = null
        continue
      }

      if (close.closed) {
        blocks.push({
          from: pending.from,
          to: line.to,
          html: markdown.slice(pending.from, line.to),
          editAnchor: pending.editAnchor,
        })
        pending = null
      } else {
        pending.depth = close.depth
      }
      continue
    }

    const blockStart = parseRenderableRawHtmlBlockStart(line.text)
    if (!blockStart) continue

    const leadingWhitespace = line.text.match(/^\s*/u)?.[0].length ?? 0
    if (blockStart.closed) {
      blocks.push({
        from: line.from,
        to: line.to,
        html: line.text.trim(),
        editAnchor: line.from + leadingWhitespace,
      })
    } else {
      pending = {
        from: line.from,
        tagName: blockStart.tagName,
        depth: blockStart.depth,
        editAnchor: line.from + leadingWhitespace,
      }
    }
  }

  return blocks
}

export function collectInactiveWysiwygRawHtmlBlocks(
  view: WysiwygDecorationView,
  rawHtmlBlocks: readonly WysiwygRawHtmlBlock[]
): WysiwygRawHtmlBlock[] {
  return rawHtmlBlocks.filter((rawHtmlBlock) =>
    intersectsVisibleRanges(view, rawHtmlBlock) && !selectionTouchesRawHtmlBlock(view, rawHtmlBlock)
  )
}

function parseRenderableRawHtmlBlockStart(
  text: string
): { tagName: string; depth: number; closed: boolean } | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('\\<')) return null

  const tokens = collectRawHtmlTagTokens(trimmed)
  const openingTag = tokens[0]
  if (!openingTag || openingTag.from !== 0 || openingTag.closing) return null

  const tagName = openingTag.tagName
  if (!RENDERED_RAW_HTML_BLOCK_TAGS.has(tagName)) return null

  if (tagName === 'img' || openingTag.selfClosing) {
    return openingTag.to === trimmed.length ? { tagName, depth: 0, closed: true } : null
  }

  const close = walkRawHtmlBlockLine(trimmed, tagName, 0)
  return close.closed ? { tagName, depth: 0, closed: true } : { tagName, depth: close.depth, closed: false }
}

function parseRawHtmlBlockContinuationLine(
  text: string,
  tagName: string,
  depth: number
): { depth: number; closed: boolean } | null {
  const close = walkRawHtmlBlockLine(text, tagName, depth)
  if (close.closed) return close.trailingIsBlank ? { depth: 0, closed: true } : null
  return { depth: close.depth, closed: false }
}

function walkRawHtmlBlockLine(
  text: string,
  tagName: string,
  initialDepth: number
): { depth: number; closed: boolean; trailingIsBlank: boolean } {
  let depth = initialDepth

  for (const token of collectRawHtmlTagTokens(text)) {
    if (token.tagName !== tagName) continue

    if (!token.closing) {
      if (!token.selfClosing) depth += 1
      continue
    }

    depth -= 1
    if (depth <= 0) {
      return {
        depth: 0,
        closed: true,
        trailingIsBlank: text.slice(token.to).trim().length === 0,
      }
    }
  }

  return { depth, closed: false, trailingIsBlank: true }
}

function collectRawHtmlTagTokens(text: string): RawHtmlTagToken[] {
  const tokens: RawHtmlTagToken[] = []
  let index = 0

  while (index < text.length) {
    const tagStart = text.indexOf('<', index)
    if (tagStart === -1) break

    const tag = parseRawHtmlTagTokenAt(text, tagStart)
    if (!tag) {
      index = tagStart + 1
      continue
    }

    tokens.push(tag)
    index = tag.to
  }

  return tokens
}

function parseRawHtmlTagTokenAt(text: string, tagStart: number): RawHtmlTagToken | null {
  const tagNameMatch = /^<\/?\s*([A-Za-z][\w:-]*)\b/iu.exec(text.slice(tagStart))
  if (!tagNameMatch) return null

  const tagEnd = findRawHtmlTagEnd(text, tagStart + tagNameMatch[0].length)
  if (tagEnd === null) return null

  const rawTag = text.slice(tagStart, tagEnd)
  return {
    from: tagStart,
    to: tagEnd,
    tagName: tagNameMatch[1].toLowerCase(),
    closing: /^<\//u.test(rawTag),
    selfClosing: /\/\s*>$/u.test(rawTag),
  }
}

function findRawHtmlTagEnd(text: string, start: number): number | null {
  let quote: '"' | "'" | null = null

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '>') return index + 1
  }

  return null
}

function splitMarkdownLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = []
  let from = 0

  while (from <= markdown.length) {
    let to = markdown.indexOf('\n', from)
    if (to === -1) to = markdown.length
    const raw = markdown.slice(from, to)
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    lines.push({ from, to, text })
    if (to === markdown.length) break
    from = to + 1
  }

  return lines
}

function lineIntersectsRange(line: MarkdownLine, range: TextRange | undefined): boolean {
  return Boolean(range && line.from <= range.to && line.to >= range.from)
}

function intersectsVisibleRanges(
  view: WysiwygDecorationView,
  rawHtmlBlock: WysiwygRawHtmlBlock
): boolean {
  return view.visibleRanges.some((range) => range.from <= rawHtmlBlock.to && range.to >= rawHtmlBlock.from)
}

function selectionTouchesRawHtmlBlock(
  view: WysiwygDecorationView,
  rawHtmlBlock: WysiwygRawHtmlBlock
): boolean {
  const { ranges } = view.state.selection
  return ranges.some((range) => range.from <= rawHtmlBlock.to && range.to >= rawHtmlBlock.from)
}
