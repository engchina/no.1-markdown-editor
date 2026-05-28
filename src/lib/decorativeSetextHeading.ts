import { collectWysiwygSetextHeadings } from '../components/Editor/wysiwygSetextHeading.ts'

const DECORATIVE_LINE_PATTERN = /^[ ]{0,3}(=+|-+)[ \t]*$/

export interface DecorativeSetextRewriteResult {
  markdown: string
  replacedCount: number
  changes: Array<{ from: number; to: number; insert: string }>
}

/**
 * Convert "decorative" setext headings — those whose content includes a row of
 * `=` or `-` characters that the user clearly intended as a visual border
 * rather than a heading line — into equivalent ATX (`#` / `##`) headings.
 *
 * Plain setext headings (e.g. `title\n=====`) are left alone; only the
 * `=====\ntitle\n=====` style that renders surprisingly under CommonMark gets
 * rewritten.
 */
export function rewriteDecorativeSetextHeadingsToATX(markdown: string): DecorativeSetextRewriteResult {
  const headings = collectWysiwygSetextHeadings(markdown, [])
  if (headings.length === 0) return { markdown, replacedCount: 0, changes: [] }

  let result = ''
  let cursor = 0
  let replacedCount = 0
  const changes: Array<{ from: number; to: number; insert: string }> = []

  for (const heading of headings) {
    const contentSlice = markdown.slice(heading.contentFrom, heading.contentTo)
    const contentLines = contentSlice.split('\n')
    const hasDecorativeLine = contentLines.some((line) => DECORATIVE_LINE_PATTERN.test(line))
    if (!hasDecorativeLine) continue

    const titleParts = contentLines
      .filter((line) => !DECORATIVE_LINE_PATTERN.test(line))
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (titleParts.length === 0) continue

    const title = titleParts.join(' ')
    const prefix = heading.level === 1 ? '# ' : '## '
    const insert = `${prefix}${title}`

    result += markdown.slice(cursor, heading.contentFrom)
    result += insert
    
    changes.push({
      from: heading.contentFrom,
      to: heading.underlineTo,
      insert,
    })

    cursor = heading.underlineTo
    replacedCount += 1
  }

  if (replacedCount === 0) return { markdown, replacedCount: 0, changes: [] }

  result += markdown.slice(cursor)
  return { markdown: result, replacedCount, changes }
}
