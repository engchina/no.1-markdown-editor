import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import rehypeKatex from 'rehype-katex'
import type { TextRange } from './fencedCodeRanges.ts'
import type { WysiwygDecorationView } from './wysiwygCodeBlock.ts'
import { normalizeSelfClosingRawHtmlBlocks, sanitizeSchema } from '../../lib/markdownShared.ts'
import { rehypeHighlightMarkers } from '../../lib/rehypeHighlightMarkers.ts'
import { rehypeSubscriptMarkers } from '../../lib/rehypeSubscriptMarkers.ts'
import { rehypeSuperscriptMarkers } from '../../lib/rehypeSuperscriptMarkers.ts'
import { rehypeHardenRawHtml, rehypePrepareRawHtmlForSanitize } from '../../lib/rehypeHardenRawHtml.ts'

interface MarkdownLine extends TextRange {
  text: string
}

interface PendingDetailsBlock {
  from: number
  openingLineTo: number
  open: boolean
  depth: number
  summaryMarkdown: string | null
  summaryLineFrom: number | null
  summaryContentFrom: number | null
  bodyFrom: number | null
}

export interface WysiwygDetailsBlock extends TextRange {
  openingLineFrom: number
  openingLineTo: number
  closingLineFrom: number
  closingLineTo: number
  open: boolean
  summaryMarkdown: string
  bodyMarkdown: string
  editAnchor: number
}

const detailsClosingLinePattern = /^\s{0,3}<\/details\s*>\s*$/iu
const summaryClosingLinePattern = /<\/summary\s*>\s*$/iu

const detailsBodyProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSubscriptMarkers)
  .use(rehypeSuperscriptMarkers)
  .use(rehypeHighlightMarkers)
  .use(rehypePrepareRawHtmlForSanitize)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHardenRawHtml)
  .use(rehypeKatex)
  .use(rehypeStringify)

export function collectWysiwygDetailsBlocks(
  markdown: string,
  ignoredRanges: readonly TextRange[] = []
): WysiwygDetailsBlock[] {
  const blocks: WysiwygDetailsBlock[] = []
  const sortedIgnoredRanges = [...ignoredRanges].sort((left, right) => left.from - right.from || left.to - right.to)
  const lines = splitMarkdownLines(markdown)
  let pending: PendingDetailsBlock | null = null
  let ignoredRangeIndex = 0

  for (const line of lines) {
    while (ignoredRangeIndex < sortedIgnoredRanges.length && sortedIgnoredRanges[ignoredRangeIndex].to < line.from) {
      ignoredRangeIndex += 1
    }

    const insideIgnoredRange = lineIntersectsRange(line, sortedIgnoredRanges[ignoredRangeIndex])
    if (insideIgnoredRange) continue

    if (!pending) {
      const opening = parseDetailsOpeningLine(line.text)
      if (!opening) continue

      pending = {
        from: line.from,
        openingLineTo: line.to,
        open: opening.open,
        depth: 1,
        summaryMarkdown: null,
        summaryLineFrom: null,
        summaryContentFrom: null,
        bodyFrom: null,
      }
      continue
    }

    if (parseDetailsOpeningLine(line.text)) {
      pending.depth += 1
      continue
    }

    if (detailsClosingLinePattern.test(line.text)) {
      pending.depth -= 1
      if (pending.depth === 0) {
        if (pending.summaryMarkdown !== null && pending.bodyFrom !== null) {
          const bodyMarkdown = normalizeDetailsBodyMarkdown(markdown.slice(pending.bodyFrom, line.from))
          blocks.push({
            from: pending.from,
            to: line.to,
            openingLineFrom: pending.from,
            openingLineTo: pending.openingLineTo,
            closingLineFrom: line.from,
            closingLineTo: line.to,
            open: pending.open,
            summaryMarkdown: pending.summaryMarkdown,
            bodyMarkdown,
            editAnchor: pending.summaryContentFrom ?? pending.summaryLineFrom ?? pending.from,
          })
        }
        pending = null
      }
      continue
    }

    if (pending.depth === 1 && pending.summaryMarkdown === null) {
      const summary = parseSummaryLine(line)
      if (!summary) continue

      pending.summaryMarkdown = summary.markdown
      pending.summaryLineFrom = line.from
      pending.summaryContentFrom = summary.contentFrom
      pending.bodyFrom = nextLineStart(markdown, line.to)
    }
  }

  return blocks
}

export function collectInactiveWysiwygDetailsBlocks(
  view: WysiwygDecorationView,
  detailsBlocks: readonly WysiwygDetailsBlock[]
): WysiwygDetailsBlock[] {
  return detailsBlocks.filter((detailsBlock) =>
    intersectsVisibleRanges(view, detailsBlock) && !selectionTouchesDetailsBlock(view, detailsBlock)
  )
}

export function renderWysiwygDetailsMarkdown(markdown: string): string {
  const source = String(markdown ?? '').trim()
  if (!source) return ''
  try {
    return String(detailsBodyProcessor.processSync(normalizeSelfClosingRawHtmlBlocks(source))).trim()
  } catch {
    return `<pre><code>${escapeHtml(source)}</code></pre>`
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function parseDetailsOpeningLine(text: string): { open: boolean } | null {
  const openingTag = parseWholeLineOpeningTag(text, 'details')
  if (!openingTag) return null

  return {
    open: hasOpenAttribute(openingTag.attributes),
  }
}

function hasOpenAttribute(attributes: string): boolean {
  return /(?:^|\s)open(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?(?=\s|$)/iu.test(attributes)
}

function parseSummaryLine(line: MarkdownLine): { markdown: string; contentFrom: number } | null {
  const openingTag = parseLineOpeningTag(line.text, 'summary')
  if (!openingTag) return null

  const closingMatch = summaryClosingLinePattern.exec(line.text)
  if (!closingMatch || closingMatch.index < openingTag.tagEnd) return null

  const markdown = line.text.slice(openingTag.tagEnd, closingMatch.index)
  return {
    markdown: markdown.trim(),
    contentFrom: line.from + openingTag.tagEnd,
  }
}

function parseWholeLineOpeningTag(text: string, tagName: string): { attributes: string } | null {
  const openingTag = parseLineOpeningTag(text, tagName)
  if (!openingTag) return null
  if (text.slice(openingTag.tagEnd).trim().length > 0) return null

  return {
    attributes: openingTag.attributes,
  }
}

function parseLineOpeningTag(
  text: string,
  tagName: string
): { attributes: string; tagEnd: number } | null {
  const indentMatch = /^\s{0,3}/u.exec(text)
  const tagStart = indentMatch?.[0].length ?? 0
  const tagMatch = new RegExp(`^<${tagName}\\b`, 'iu').exec(text.slice(tagStart))
  if (!tagMatch) return null

  const attributesStart = tagStart + tagMatch[0].length
  const tagEnd = findHtmlTagEnd(text, attributesStart)
  if (tagEnd === null) return null

  return {
    attributes: text.slice(attributesStart, tagEnd - 1),
    tagEnd,
  }
}

function findHtmlTagEnd(text: string, start: number): number | null {
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

function normalizeDetailsBodyMarkdown(markdown: string): string {
  return markdown
    .replace(/^\r?\n/u, '')
    .replace(/\r?\n$/u, '')
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

function nextLineStart(markdown: string, lineTo: number): number {
  if (lineTo >= markdown.length) return lineTo
  return markdown[lineTo] === '\n' ? lineTo + 1 : lineTo
}

function lineIntersectsRange(line: MarkdownLine, range: TextRange | undefined): boolean {
  return Boolean(range && line.from <= range.to && line.to >= range.from)
}

function intersectsVisibleRanges(
  view: WysiwygDecorationView,
  detailsBlock: WysiwygDetailsBlock
): boolean {
  return view.visibleRanges.some((range) => range.from <= detailsBlock.to && range.to >= detailsBlock.from)
}

function selectionTouchesDetailsBlock(
  view: WysiwygDecorationView,
  detailsBlock: WysiwygDetailsBlock
): boolean {
  const { ranges } = view.state.selection
  return ranges.some((range) => range.from <= detailsBlock.to && range.to >= detailsBlock.from)
}
