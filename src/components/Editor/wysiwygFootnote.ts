import { WidgetType } from '@codemirror/view'
import { collectInlineCodeRanges, findContainingTextRange } from './wysiwygInlineCode.ts'

export interface InlineFootnoteRange {
  from: number
  to: number
  contentFrom: number
  contentTo: number
  label: string
}

export interface BlockFootnoteRange {
  from: number
  to: number
  labelFrom: number
  labelTo: number
  label: string
}

export class InlineFootnoteWidget extends WidgetType {
  readonly label: string
  readonly displayIndex: number

  constructor(label: string, displayIndex: number) {
    super()
    this.label = label
    this.displayIndex = displayIndex
  }

  toDOM() {
    const el = document.createElement('sup')
    el.className = 'cm-wysiwyg-footnote-ref'
    el.textContent = String(this.displayIndex)
    return el
  }

  ignoreEvent() { return false }
  eq(other: InlineFootnoteWidget) { return this.label === other.label && this.displayIndex === other.displayIndex }
}

export class BlockFootnoteTagWidget extends WidgetType {
  readonly label: string
  readonly displayIndex: number | null

  constructor(label: string, displayIndex: number | null) {
    super()
    this.label = label
    this.displayIndex = displayIndex
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-wysiwyg-footnote-def'
    el.textContent = this.displayIndex !== null ? `[${this.displayIndex}]: ` : `[^${this.label}]: `
    return el
  }

  ignoreEvent() { return false }
  eq(other: BlockFootnoteTagWidget) { return this.label === other.label && this.displayIndex === other.displayIndex }
}

// INLINE pattern: [^something]
const INLINE_FOOTNOTE_PATTERN = /\[\^([^\]]+)\]/g
// BLOCK pattern: ^[^1]: ...
// Match start of line, optional spaces, `[^label]: `, and capture the label.
const BLOCK_FOOTNOTE_PATTERN = /^[ \t]*(\[\^([^\]]+)\]:[ \t]*)/gm

export function findInlineFootnoteRanges(text: string, excludedRanges?: readonly { from: number; to: number }[]): InlineFootnoteRange[] {
  const ranges: InlineFootnoteRange[] = []
  const safeExcluded = excludedRanges ?? collectInlineCodeRanges(text)
  
  let match: RegExpExecArray | null
  while ((match = INLINE_FOOTNOTE_PATTERN.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (findContainingTextRange(from, safeExcluded) || findContainingTextRange(to - 1, safeExcluded)) {
      continue
    }

    // Distinguish from block footnote definitions
    // If it's immediately followed by `:` and at the beginning of the line, skip it.
    if (text[to] === ':') {
      const lineStart = text.lastIndexOf('\n', from)
      const textBeforeOnLine = lineStart === -1 ? text.slice(0, from) : text.slice(lineStart + 1, from)
      if (textBeforeOnLine.trim() === '') {
        continue // It's a block footnote label, not an inline reference
      }
    }

    const contentFrom = from + 2 // `[^`
    const contentTo = to - 1 // `]`
    const label = match[1]

    ranges.push({
      from,
      to,
      contentFrom,
      contentTo,
      label
    })
  }

  return ranges
}

export function findBlockFootnoteRanges(text: string, excludedRanges?: readonly { from: number; to: number }[]): BlockFootnoteRange[] {
  const ranges: BlockFootnoteRange[] = []
  const safeExcluded = excludedRanges ?? collectInlineCodeRanges(text)

  let match: RegExpExecArray | null
  while ((match = BLOCK_FOOTNOTE_PATTERN.exec(text)) !== null) {
    const from = match.index
    if (findContainingTextRange(from, safeExcluded)) {
      continue
    }

    const label = match[2]
    
    // match[1] is `[^label]: `
    // match[2] is `label`
    
    // The precise location of `[^label]` inside the match:
    const prefixSpaces = match[0].indexOf('[')
    const actualFrom = from + prefixSpaces
    const actualTo = actualFrom + match[1].length
    
    ranges.push({
      from: actualFrom,
      to: actualTo,
      labelFrom: actualFrom + 2,
      labelTo: actualFrom + 2 + label.length,
      label
    })
  }
  
  return ranges
}

export function collectFootnoteIndices(text: string): Map<string, number> {
  const inlineRanges = findInlineFootnoteRanges(text)
  const map = new Map<string, number>()
  let nextIndex = 1

  for (const range of inlineRanges) {
    if (!map.has(range.label)) {
      map.set(range.label, nextIndex++)
    }
  }

  return map
}
