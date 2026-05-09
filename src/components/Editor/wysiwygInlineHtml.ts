import { findContainingTextRange, type TextRange } from './wysiwygInlineCode.ts'

export interface InlineHtmlTagRange extends TextRange {
  contentFrom: number
  contentTo: number
}

interface InlineHtmlTagToken extends TextRange {
  tagName: string
  closing: boolean
  selfClosing: boolean
}

const HTML_TAG_PATTERN = /<\/?([A-Za-z][\w:-]*)\b(?:[^>"']+|"[^"]*"|'[^']*')*\s*>/gu

export function collectInlineHtmlTagRanges(
  text: string,
  tagNames: readonly string[],
  excludedRanges: readonly TextRange[] = []
): InlineHtmlTagRange[] {
  if (tagNames.length === 0) return []

  const ranges: InlineHtmlTagRange[] = []
  const allowedTagNames = new Set(tagNames.map((tagName) => tagName.toLowerCase()))
  const openTagsByName = new Map<string, InlineHtmlTagToken[]>()

  for (const token of collectInlineHtmlTagTokens(text, allowedTagNames)) {
    if (findContainingTextRange(token.from, excludedRanges)) {
      continue
    }

    if (!token.closing) {
      if (!token.selfClosing) {
        const openTags = openTagsByName.get(token.tagName) ?? []
        openTags.push(token)
        openTagsByName.set(token.tagName, openTags)
      }
      continue
    }

    const openTags = openTagsByName.get(token.tagName)
    const openingTag = openTags?.pop()
    if (!openingTag) continue

    ranges.push({
      from: openingTag.from,
      to: token.to,
      contentFrom: openingTag.to,
      contentTo: token.from,
    })
  }

  return ranges.sort((left, right) => left.from - right.from || right.to - left.to)
}

function collectInlineHtmlTagTokens(
  text: string,
  allowedTagNames: ReadonlySet<string>
): InlineHtmlTagToken[] {
  const tokens: InlineHtmlTagToken[] = []
  let match: RegExpExecArray | null

  while ((match = HTML_TAG_PATTERN.exec(text)) !== null) {
    const rawTag = match[0]
    const tagName = match[1].toLowerCase()
    if (!allowedTagNames.has(tagName)) continue

    tokens.push({
      from: match.index,
      to: match.index + rawTag.length,
      tagName,
      closing: /^<\//u.test(rawTag),
      selfClosing: /\/\s*>$/u.test(rawTag),
    })
  }

  return tokens
}
