import type { MarkdownTableBlock } from './tableBlockRanges.ts'
import type { WysiwygDecorationView } from './wysiwygCodeBlock.ts'

export function collectInactiveWysiwygTables(
  view: WysiwygDecorationView,
  tables: readonly MarkdownTableBlock[]
): MarkdownTableBlock[] {
  return tables.filter((table) =>
    intersectsVisibleRanges(view, table) && !selectionTouchesTable(view, table)
  )
}

function intersectsVisibleRanges(
  view: WysiwygDecorationView,
  table: MarkdownTableBlock
): boolean {
  return view.visibleRanges.some((range) => range.from <= table.to && range.to >= table.from)
}

function selectionTouchesTable(
  view: WysiwygDecorationView,
  table: MarkdownTableBlock
): boolean {
  const { ranges } = view.state.selection
  return ranges.some((range) => range.from <= table.to && range.to >= table.from)
}
