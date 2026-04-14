import { Decoration, type EditorView } from '@codemirror/view'
import type { FencedCodeBlock } from './fencedCodeRanges.ts'
import type { RangeSpec } from './sortedRangeSet.ts'

export interface WysiwygDecorationView {
  state: Pick<EditorView['state'], 'doc' | 'selection'>
  visibleRanges: readonly { from: number; to: number }[]
}

export type WysiwygCodeBlockDecorationSpec = RangeSpec<Decoration>

function queueDecoration(
  decorations: WysiwygCodeBlockDecorationSpec[],
  from: number,
  to: number,
  value: Decoration
): void {
  decorations.push({ from, to, value })
}

function queueLineDecoration(
  decorations: WysiwygCodeBlockDecorationSpec[],
  at: number,
  attributes: Record<string, string>
): void {
  queueDecoration(decorations, at, at, Decoration.line({ attributes }))
}

function formatCodeBlockLanguageLabel(language: string | null): string {
  return language ? `Code (${language})` : 'Code'
}

function selectionTouchesFencedCodeBlock(
  view: WysiwygDecorationView,
  fencedCodeBlock: FencedCodeBlock
): boolean {
  const { ranges } = view.state.selection
  return ranges.some((range) => range.from <= fencedCodeBlock.to && range.to >= fencedCodeBlock.from)
}

function decorateInactiveFencedCodeBlockLine(
  decorations: WysiwygCodeBlockDecorationSpec[],
  lineFrom: number,
  lineTo: number,
  fencedCodeBlock: FencedCodeBlock
): void {
  if (lineFrom === fencedCodeBlock.openingLineFrom) {
    queueLineDecoration(decorations, lineFrom, {
      class: 'cm-wysiwyg-codeblock-meta-line',
      'data-code-language-label': formatCodeBlockLanguageLabel(fencedCodeBlock.language),
    })
    queueDecoration(decorations, lineFrom, lineTo, Decoration.replace({}))
    return
  }

  if (fencedCodeBlock.closingLineFrom !== null && lineFrom === fencedCodeBlock.closingLineFrom) {
    queueLineDecoration(decorations, lineFrom, {
      class: 'cm-wysiwyg-codeblock-close-line',
    })
    queueDecoration(decorations, lineFrom, lineTo, Decoration.replace({}))
    return
  }

  queueLineDecoration(decorations, lineFrom, {
    class: 'cm-wysiwyg-codeblock-line',
  })
}

export function collectWysiwygCodeBlockDecorations(
  view: WysiwygDecorationView,
  fencedCodeBlocks: readonly FencedCodeBlock[]
): WysiwygCodeBlockDecorationSpec[] {
  const decorations: WysiwygCodeBlockDecorationSpec[] = []
  const { doc } = view.state
  let fenceIndex = 0

  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      const lineFrom = line.from
      const lineTo = line.to

      while (fenceIndex < fencedCodeBlocks.length && fencedCodeBlocks[fenceIndex].to < lineFrom) {
        fenceIndex += 1
      }

      const fencedCodeBlock = fencedCodeBlocks[fenceIndex]
      if (fencedCodeBlock && lineFrom >= fencedCodeBlock.from && lineFrom <= fencedCodeBlock.to) {
        if (!selectionTouchesFencedCodeBlock(view, fencedCodeBlock)) {
          decorateInactiveFencedCodeBlockLine(decorations, lineFrom, lineTo, fencedCodeBlock)
        }
      }

      pos = line.to + 1
    }
  }

  return decorations
}
