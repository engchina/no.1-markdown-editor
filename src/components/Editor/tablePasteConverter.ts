import { encodeMarkdownTableCellText } from './wysiwygTable.ts'

export interface ClipboardTableSource {
  text?: string | null
  html?: string | null
}

export function convertClipboardToMarkdownTable(source: ClipboardTableSource): string | null {
  const fromHtml = source.html ? convertHtmlTableToMarkdown(source.html) : null
  if (fromHtml) return fromHtml

  return source.text ? convertTsvToMarkdownTable(source.text) : null
}

export function convertTsvToMarkdownTable(text: string): string | null {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n+$/u, '')
  if (!normalized.includes('\t')) return null

  const lines = normalized.split('\n')
  if (lines.length === 0) return null

  const rows = lines.map((line) => line.split('\t'))
  const columnCount = Math.max(...rows.map((row) => row.length))
  if (columnCount < 2) return null

  const normalizedRows = rows.map((row) =>
    row.length === columnCount ? row : [...row, ...Array<string>(columnCount - row.length).fill('')]
  )

  return buildMarkdownTable(normalizedRows)
}

export function convertHtmlTableToMarkdown(html: string): string | null {
  const tableMatch = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/iu)
  if (!tableMatch) return null

  const tableHtml = tableMatch[0]
  const rows: string[][] = []
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/giu
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1]
    const cells: string[] = []
    const cellPattern = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/giu
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push(normalizeHtmlCellContent(cellMatch[2]))
    }

    if (cells.length > 0) rows.push(cells)
  }

  if (rows.length === 0) return null
  const columnCount = Math.max(...rows.map((row) => row.length))
  if (columnCount < 1) return null

  const normalizedRows = rows.map((row) =>
    row.length === columnCount ? row : [...row, ...Array<string>(columnCount - row.length).fill('')]
  )

  return buildMarkdownTable(normalizedRows)
}

export interface ClipboardTablePastePlan {
  from: number
  to: number
  insert: string
}

// Shared planner for "paste spreadsheet cells as a markdown table". Returns
// null when the clipboard does not look like a table, or when the selection
// sits inside an existing table (cell-level paste handles that case).
export function planClipboardTablePaste(options: {
  docText: string
  selectionFrom: number
  selectionTo: number
  clipboard: ClipboardTableSource
  tableRanges?: readonly { from: number; to: number }[]
}): ClipboardTablePastePlan | null {
  const markdownTable = convertClipboardToMarkdownTable(options.clipboard)
  if (!markdownTable) return null

  const { docText, selectionFrom, selectionTo } = options
  const insideTable = (options.tableRanges ?? []).some(
    (table) => selectionFrom >= table.from && selectionTo <= table.to
  )
  if (insideTable) return null

  const needsLeadingNewline = selectionFrom > 0 && docText[selectionFrom - 1] !== '\n'
  const followingText = docText.slice(selectionTo, selectionTo + 1)
  const needsTrailingNewline = followingText !== '\n' && selectionTo !== docText.length
  const insert = `${needsLeadingNewline ? '\n\n' : ''}${markdownTable}${needsTrailingNewline ? '\n\n' : '\n'}`

  return { from: selectionFrom, to: selectionTo, insert }
}

function buildMarkdownTable(rows: string[][]): string {
  const [header, ...body] = rows
  const columnCount = header.length
  const headerLine = formatMarkdownRow(header)
  const separator = `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`
  const bodyLines = body.map((row) => formatMarkdownRow(row))
  return [headerLine, separator, ...bodyLines].join('\n')
}

function formatMarkdownRow(cells: string[]): string {
  const formatted = cells.map((cell) => {
    const trimmed = cell.replace(/^\s+|\s+$/gu, '')
    const singleLine = trimmed.replace(/\r?\n/g, '<br />')
    return encodeMarkdownTableCellText(singleLine)
  })
  return `| ${formatted.join(' | ')} |`
}

function normalizeHtmlCellContent(rawHtml: string): string {
  return rawHtml
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(p|div|li|tr)>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\r\n?/g, '\n')
}
