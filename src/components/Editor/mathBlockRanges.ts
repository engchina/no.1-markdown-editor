import type { TextRange } from './fencedCodeRanges.ts'

export interface MathBlock extends TextRange {
  latex: string
  editAnchor: number
}

interface PendingMathBlock {
  from: number
  openingLineTo: number
}

const blockMathDelimiterPattern = /^\s{0,3}\$\$\s*$/
const singleLineMathBlockPattern = /^\s{0,3}\$\$(.+?)\$\$\s*$/

export function collectMathBlocks(
  markdown: string,
  ignoredRanges: readonly TextRange[] = []
): MathBlock[] {
  const blocks: MathBlock[] = []
  let pendingBlock: PendingMathBlock | null = null
  let ignoredRangeIndex = 0
  let from = 0

  while (from <= markdown.length) {
    let to = markdown.indexOf('\n', from)
    if (to === -1) to = markdown.length

    const rawText = markdown.slice(from, to)
    const text = rawText.endsWith('\r') ? rawText.slice(0, -1) : rawText

    while (ignoredRangeIndex < ignoredRanges.length && ignoredRanges[ignoredRangeIndex].to < from) {
      ignoredRangeIndex += 1
    }

    const ignoredRange = ignoredRanges[ignoredRangeIndex]
    const insideIgnoredRange = Boolean(ignoredRange && from >= ignoredRange.from && from <= ignoredRange.to)

    if (!insideIgnoredRange) {
      if (pendingBlock) {
        if (blockMathDelimiterPattern.test(text)) {
          const latex = normalizeBlockMathLatex(markdown.slice(pendingBlock.openingLineTo, from))
          if (latex.trim().length > 0) {
            blocks.push({
              from: pendingBlock.from,
              to,
              latex,
              editAnchor: pendingBlock.openingLineTo + 1,
            })
          }
          pendingBlock = null
        }
      } else {
        const singleLineLatex = parseSingleLineMathBlock(text)
        if (singleLineLatex) {
          blocks.push({
            from,
            to,
            latex: singleLineLatex,
            editAnchor: resolveSingleLineMathEditAnchor(text, from, singleLineLatex),
          })
        } else if (blockMathDelimiterPattern.test(text)) {
          pendingBlock = {
            from,
            openingLineTo: to,
          }
        }
      }
    }

    if (to === markdown.length) break
    from = to + 1
  }

  return blocks
}

function parseSingleLineMathBlock(text: string): string | null {
  const match = text.match(singleLineMathBlockPattern)
  const latex = match?.[1]?.trim() ?? ''
  return latex.length > 0 ? latex : null
}

function resolveSingleLineMathEditAnchor(text: string, from: number, latex: string): number {
  const openingOffset = text.indexOf('$$')
  const contentOffset = text.indexOf(latex, openingOffset + 2)
  return from + (contentOffset >= 0 ? contentOffset : openingOffset + 2)
}

function normalizeBlockMathLatex(rawLatex: string): string {
  return rawLatex
    .replace(/^\r?\n/, '')
    .replace(/\r?\n$/, '')
}
