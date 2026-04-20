import type { MarkdownTableBlock, MarkdownTableCell, MarkdownTableRow, TableAlignment } from './tableBlockRanges.ts'
import type { WysiwygDecorationView } from './wysiwygCodeBlock.ts'

export interface MarkdownTableCellLocation {
  section: 'head' | 'body'
  rowIndex: number
  columnIndex: number
}

export interface ActiveWysiwygTableCell extends MarkdownTableCellLocation {
  tableFrom: number
  selectionStart: number
  selectionEnd: number
}

export type WysiwygTableCellSelectionBehavior = 'preserve' | 'start' | 'end'

export type WysiwygTableKeyCommand =
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right'
  | 'backspace'
  | 'delete'
  | 'enter'
  | 'tab'
  | 'shift-tab'
  | 'ctrl-enter'
  | 'shift-enter'
  | 'escape'

export interface WysiwygTableRowInsertionPlan {
  insertFrom: number
  insertText: string
  focusAnchor: number
  focusLocation: MarkdownTableCellLocation
}

export type WysiwygTableKeyAction =
  | {
    kind: 'focus-cell'
    location: MarkdownTableCellLocation
    selectionBehavior: WysiwygTableCellSelectionBehavior
  }
  | {
    kind: 'insert-body-row-below'
    plan: WysiwygTableRowInsertionPlan
  }
  | {
    kind: 'insert-inline-break'
    insertText: '<br />'
  }
  | {
    kind: 'noop'
  }
  | {
    kind: 'exit-table'
    direction: 'before' | 'after'
  }

export function collectInactiveWysiwygTables(
  view: WysiwygDecorationView,
  tables: readonly MarkdownTableBlock[]
): MarkdownTableBlock[] {
  return tables.filter((table) => intersectsVisibleRanges(view, table))
}

function intersectsVisibleRanges(
  view: WysiwygDecorationView,
  table: MarkdownTableBlock
): boolean {
  return view.visibleRanges.some((range) => range.from <= table.to && range.to >= table.from)
}

const TABLE_NAVIGATION_ROWS_CACHE = new WeakMap<MarkdownTableBlock, readonly MarkdownTableRow[]>()

function getTableNavigationRows(table: MarkdownTableBlock): readonly MarkdownTableRow[] {
  const cached = TABLE_NAVIGATION_ROWS_CACHE.get(table)
  if (cached) return cached

  const rows = [table.header, ...table.rows]
  TABLE_NAVIGATION_ROWS_CACHE.set(table, rows)
  return rows
}

export function resolveTableCell(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation
): MarkdownTableCell | null {
  const row = location.section === 'head'
    ? table.header
    : table.rows[location.rowIndex]

  return row?.cells[location.columnIndex] ?? null
}

export function resolveTableCellLocation(
  table: MarkdownTableBlock,
  position: number
): MarkdownTableCellLocation | null {
  for (const [columnIndex, cell] of table.header.cells.entries()) {
    if (position >= cell.from && position <= cell.to) {
      return { section: 'head', rowIndex: 0, columnIndex }
    }
  }

  for (const [rowIndex, row] of table.rows.entries()) {
    for (const [columnIndex, cell] of row.cells.entries()) {
      if (position >= cell.from && position <= cell.to) {
        return { section: 'body', rowIndex, columnIndex }
      }
    }
  }

  return null
}

export function resolveNearestTableCellLocation(
  table: MarkdownTableBlock,
  position: number
): MarkdownTableCellLocation | null {
  const directMatch = resolveTableCellLocation(table, position)
  if (directMatch) return directMatch

  let closestLocation: MarkdownTableCellLocation | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  const visitCell = (location: MarkdownTableCellLocation, cell: MarkdownTableCell) => {
    const distance =
      position < cell.from
        ? cell.from - position
        : position > cell.to
          ? position - cell.to
          : 0

    if (distance >= closestDistance) return

    closestDistance = distance
    closestLocation = location
  }

  table.header.cells.forEach((cell, columnIndex) => {
    visitCell({ section: 'head', rowIndex: 0, columnIndex }, cell)
  })

  table.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, columnIndex) => {
      visitCell({ section: 'body', rowIndex, columnIndex }, cell)
    })
  })

  return closestLocation
}

export function resolveAdjacentTableCellLocation(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation,
  direction: 'next' | 'previous' | 'up' | 'down'
): MarkdownTableCellLocation | null {
  const rows = getTableNavigationRows(table)
  const currentRowIndex = location.section === 'head' ? 0 : location.rowIndex + 1

  const toLocation = (rowIndex: number, columnIndex: number): MarkdownTableCellLocation | null => {
    const row = rows[rowIndex]
    if (!row || !row.cells[columnIndex]) return null

    return rowIndex === 0
      ? { section: 'head', rowIndex: 0, columnIndex }
      : { section: 'body', rowIndex: rowIndex - 1, columnIndex }
  }

  switch (direction) {
    case 'up':
      return toLocation(currentRowIndex - 1, location.columnIndex)
    case 'down':
      return toLocation(currentRowIndex + 1, location.columnIndex)
    case 'previous': {
      const previousColumn = location.columnIndex - 1
      if (previousColumn >= 0) return toLocation(currentRowIndex, previousColumn)

      const previousRow = currentRowIndex - 1
      if (previousRow < 0) return null
      const row = rows[previousRow]
      return row ? toLocation(previousRow, row.cells.length - 1) : null
    }
    case 'next': {
      const nextColumn = location.columnIndex + 1
      if (nextColumn < rows[currentRowIndex]?.cells.length) {
        return toLocation(currentRowIndex, nextColumn)
      }

      return toLocation(currentRowIndex + 1, 0)
    }
  }
}

export function resolveTableBodyRowInsertionPlan(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation
): WysiwygTableRowInsertionPlan | null {
  const rowText = buildEmptyMarkdownTableBodyRow(table.header.cells.length)
  if (!rowText) return null

  if (location.section === 'head') {
    if (table.rows.length > 0) {
      return {
        insertFrom: table.rows[0].from,
        insertText: `${rowText}\n`,
        focusAnchor: table.rows[0].from + 1,
        focusLocation: { section: 'body', rowIndex: 0, columnIndex: 0 },
      }
    }

    return {
      insertFrom: table.to,
      insertText: `\n${rowText}`,
      focusAnchor: table.to + 2,
      focusLocation: { section: 'body', rowIndex: 0, columnIndex: 0 },
    }
  }

  const currentRow = table.rows[location.rowIndex]
  if (!currentRow) return null

  return {
    insertFrom: currentRow.to,
    insertText: `\n${rowText}`,
    focusAnchor: currentRow.to + 2,
    focusLocation: { section: 'body', rowIndex: location.rowIndex + 1, columnIndex: 0 },
  }
}

export function resolveTableKeyAction(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation,
  command: WysiwygTableKeyCommand
): WysiwygTableKeyAction | null {
  switch (command) {
    case 'arrow-up': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'up')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'preserve' }
        : null
    }
    case 'backspace': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'previous')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'end' }
        : { kind: 'noop' }
    }
    case 'arrow-down': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'down')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'preserve' }
        : { kind: 'exit-table', direction: 'after' }
    }
    case 'enter': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'down')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'end' }
        : { kind: 'exit-table', direction: 'after' }
    }
    case 'tab': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'next')
      if (nextLocation) {
        return { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'preserve' }
      }

      const plan = resolveTableBodyRowInsertionPlan(table, location)
      return plan ? { kind: 'insert-body-row-below', plan } : null
    }
    case 'shift-tab': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'previous')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'preserve' }
        : { kind: 'exit-table', direction: 'before' }
    }
    case 'ctrl-enter': {
      const plan = resolveTableBodyRowInsertionPlan(table, location)
      return plan ? { kind: 'insert-body-row-below', plan } : null
    }
    case 'shift-enter':
      return { kind: 'insert-inline-break', insertText: '<br />' }
    case 'arrow-left': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'previous')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'end' }
        : { kind: 'noop' }
    }
    case 'arrow-right': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'next')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'start' }
        : { kind: 'noop' }
    }
    case 'delete': {
      const nextLocation = resolveAdjacentTableCellLocation(table, location, 'next')
      return nextLocation
        ? { kind: 'focus-cell', location: nextLocation, selectionBehavior: 'start' }
        : { kind: 'noop' }
    }
    case 'escape':
      return { kind: 'exit-table', direction: 'after' }
  }
}

export function isBlankLineBelowTableSelection(
  doc: Pick<WysiwygDecorationView['state']['doc'], 'lineAt' | 'line' | 'lines'>,
  tables: readonly MarkdownTableBlock[],
  position: number
): boolean {
  const line = doc.lineAt(position)
  if (line.text.length !== 0) return false

  return tables.some((table) => {
    const closingLine = doc.lineAt(table.to)
    if (closingLine.number >= doc.lines) return false

    const nextLine = doc.line(closingLine.number + 1)
    return nextLine.from <= position && position <= nextLine.to
  })
}

export function isActiveTableCellLocation(
  activeCell: ActiveWysiwygTableCell | null,
  tableFrom: number,
  location: MarkdownTableCellLocation
): boolean {
  return Boolean(
    activeCell &&
    activeCell.tableFrom === tableFrom &&
    activeCell.section === location.section &&
    activeCell.rowIndex === location.rowIndex &&
    activeCell.columnIndex === location.columnIndex
  )
}

const MARKDOWN_TABLE_BOUNDARY_SPACE_ENTITY = '&nbsp;'
const MARKDOWN_TABLE_CELL_LINE_BREAK_MARKUP = '<br />'
const markdownTableSpaceEntityPattern = /^(?:&nbsp;|&#160;|&#xa0;)/iu
const markdownTableLineBreakPattern = /^<br\s*\/?\s*>/iu

interface MarkdownTableCellEscapeToken {
  displayText: '|' | ' ' | '\n'
  rawLength: number
}

export function decodeMarkdownTableCellText(text: string): string {
  let output = ''

  for (let index = 0; index < text.length;) {
    const escape = readMarkdownTableCellEscape(text, index)
    if (escape) {
      output += escape.displayText
      index += escape.rawLength
      continue
    }

    output += text[index]
    index += 1
  }

  return output
}

export function encodeMarkdownTableCellText(value: string): string {
  const text = String(value ?? '')
  const leadingSpaces = countLeadingMarkdownTableBoundarySpaces(text)
  const trailingSpaces = countTrailingMarkdownTableBoundarySpaces(text)
  let output = ''

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '|') {
      output += '\\|'
      continue
    }

    if (char === '\n') {
      output += MARKDOWN_TABLE_CELL_LINE_BREAK_MARKUP
      continue
    }

    const isBoundarySpace = char === ' ' &&
      (index < leadingSpaces || index >= text.length - trailingSpaces)
    output += isBoundarySpace ? MARKDOWN_TABLE_BOUNDARY_SPACE_ENTITY : char
  }

  return output
}

export function resolveDecodedTableCellOffset(rawText: string, rawOffset: number): number {
  const cappedOffset = Math.max(0, Math.min(rawOffset, rawText.length))
  let rawIndex = 0
  let displayIndex = 0

  while (rawIndex < cappedOffset) {
    const escape = readMarkdownTableCellEscape(rawText, rawIndex)
    if (escape) {
      rawIndex += Math.min(escape.rawLength, cappedOffset - rawIndex)
      displayIndex += 1
      continue
    }

    rawIndex += 1
    displayIndex += 1
  }

  return displayIndex
}

export function resolveEncodedTableCellOffset(displayText: string, displayOffset: number): number {
  const cappedOffset = Math.max(0, Math.min(displayOffset, displayText.length))
  const leadingSpaces = countLeadingMarkdownTableBoundarySpaces(displayText)
  const trailingSpaces = countTrailingMarkdownTableBoundarySpaces(displayText)
  let rawOffset = 0

  for (let index = 0; index < cappedOffset; index += 1) {
    const char = displayText[index]
    if (char === '|') {
      rawOffset += 2
      continue
    }

    if (char === '\n') {
      rawOffset += MARKDOWN_TABLE_CELL_LINE_BREAK_MARKUP.length
      continue
    }

    const isBoundarySpace = char === ' ' &&
      (index < leadingSpaces || index >= displayText.length - trailingSpaces)
    rawOffset += isBoundarySpace ? MARKDOWN_TABLE_BOUNDARY_SPACE_ENTITY.length : 1
  }

  return rawOffset
}

function buildEmptyMarkdownTableBodyRow(columnCount: number): string {
  if (columnCount < 1) return ''
  return `| ${Array.from({ length: columnCount }, () => '').join(' | ')} |`
}

export interface TableStructuralEditPlan {
  from: number
  to: number
  insert: string
  focusLocation: MarkdownTableCellLocation
}

interface TableDraft {
  header: string[]
  rows: string[][]
  alignments: TableAlignment[]
}

function toTableDraft(table: MarkdownTableBlock): TableDraft {
  return {
    header: table.header.cells.map((cell) => cell.text),
    rows: table.rows.map((row) => row.cells.map((cell) => cell.text)),
    alignments: [...table.alignments],
  }
}

function serializeTableDraft(draft: TableDraft): string {
  const headerLine = `| ${draft.header.map((text) => text.length === 0 ? '' : text).join(' | ')} |`
  const separatorLine = `| ${draft.alignments.map(serializeAlignmentMarker).join(' | ')} |`
  const bodyLines = draft.rows.map((row) => `| ${row.map((text) => text.length === 0 ? '' : text).join(' | ')} |`)
  return [headerLine, separatorLine, ...bodyLines].join('\n')
}

function serializeAlignmentMarker(alignment: TableAlignment): string {
  switch (alignment) {
    case 'left':
      return ':---'
    case 'center':
      return ':---:'
    case 'right':
      return '---:'
    default:
      return '---'
  }
}

function buildStructuralEditPlan(
  table: MarkdownTableBlock,
  draft: TableDraft,
  focusLocation: MarkdownTableCellLocation
): TableStructuralEditPlan {
  return {
    from: table.from,
    to: table.to,
    insert: serializeTableDraft(draft),
    focusLocation,
  }
}

export function resolveInsertTableRow(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation,
  position: 'above' | 'below'
): TableStructuralEditPlan | null {
  const columnCount = table.header.cells.length
  if (columnCount < 1) return null

  const draft = toTableDraft(table)
  const emptyRow = Array<string>(columnCount).fill('')

  let insertIndex: number
  if (location.section === 'head') {
    insertIndex = 0
  } else {
    insertIndex = position === 'above' ? location.rowIndex : location.rowIndex + 1
  }

  draft.rows.splice(insertIndex, 0, emptyRow)
  return buildStructuralEditPlan(table, draft, {
    section: 'body',
    rowIndex: insertIndex,
    columnIndex: location.columnIndex,
  })
}

export function resolveInsertTableColumn(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation,
  side: 'left' | 'right'
): TableStructuralEditPlan | null {
  const columnCount = table.header.cells.length
  if (columnCount < 1) return null

  const insertIndex = side === 'left' ? location.columnIndex : location.columnIndex + 1
  const draft = toTableDraft(table)
  draft.header.splice(insertIndex, 0, '')
  draft.alignments.splice(insertIndex, 0, null)
  draft.rows.forEach((row) => row.splice(insertIndex, 0, ''))

  return buildStructuralEditPlan(table, draft, {
    section: location.section,
    rowIndex: location.rowIndex,
    columnIndex: insertIndex,
  })
}

export function resolveDeleteTableRow(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation
): TableStructuralEditPlan | null {
  if (location.section === 'head') return null
  if (location.rowIndex < 0 || location.rowIndex >= table.rows.length) return null

  const draft = toTableDraft(table)
  draft.rows.splice(location.rowIndex, 1)

  const remainingRowCount = draft.rows.length
  const focusLocation: MarkdownTableCellLocation = remainingRowCount === 0
    ? { section: 'head', rowIndex: 0, columnIndex: location.columnIndex }
    : {
      section: 'body',
      rowIndex: Math.min(location.rowIndex, remainingRowCount - 1),
      columnIndex: location.columnIndex,
    }

  return buildStructuralEditPlan(table, draft, focusLocation)
}

export function resolveDeleteTableColumn(
  table: MarkdownTableBlock,
  location: MarkdownTableCellLocation
): TableStructuralEditPlan | null {
  const columnCount = table.header.cells.length
  if (columnCount <= 2) return null
  if (location.columnIndex < 0 || location.columnIndex >= columnCount) return null

  const draft = toTableDraft(table)
  draft.header.splice(location.columnIndex, 1)
  draft.alignments.splice(location.columnIndex, 1)
  draft.rows.forEach((row) => row.splice(location.columnIndex, 1))

  const nextColumnIndex = Math.min(location.columnIndex, draft.header.length - 1)
  return buildStructuralEditPlan(table, draft, {
    section: location.section,
    rowIndex: location.rowIndex,
    columnIndex: nextColumnIndex,
  })
}

export function resolveSetTableColumnAlignment(
  table: MarkdownTableBlock,
  columnIndex: number,
  alignment: TableAlignment
): TableStructuralEditPlan | null {
  if (columnIndex < 0 || columnIndex >= table.alignments.length) return null
  if (table.alignments[columnIndex] === alignment) return null

  const draft = toTableDraft(table)
  draft.alignments[columnIndex] = alignment

  return buildStructuralEditPlan(table, draft, {
    section: 'head',
    rowIndex: 0,
    columnIndex,
  })
}

function readMarkdownTableCellEscape(text: string, index: number): MarkdownTableCellEscapeToken | null {
  if (text[index] === '\\' && text[index + 1] === '|') {
    return { displayText: '|', rawLength: 2 }
  }

  if (text[index] === '<' || text[index] === '&') {
    const remainder = text.slice(index)
    const lineBreakMatch = remainder.match(markdownTableLineBreakPattern)
    if (lineBreakMatch) {
      return { displayText: '\n', rawLength: lineBreakMatch[0].length }
    }
    const spaceMatch = remainder.match(markdownTableSpaceEntityPattern)
    if (spaceMatch) {
      return { displayText: ' ', rawLength: spaceMatch[0].length }
    }
    return null
  }

  return null
}

function countLeadingMarkdownTableBoundarySpaces(text: string): number {
  let count = 0
  while (count < text.length && text[count] === ' ') {
    count += 1
  }
  return count
}

function countTrailingMarkdownTableBoundarySpaces(text: string): number {
  let count = 0
  while (count < text.length && text[text.length - count - 1] === ' ') {
    count += 1
  }
  return count
}
