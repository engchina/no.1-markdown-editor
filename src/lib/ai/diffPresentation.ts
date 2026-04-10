export type MarkdownPreviewLineKind =
  | 'empty'
  | 'heading'
  | 'list'
  | 'quote'
  | 'table'
  | 'fence'
  | 'code'
  | 'paragraph'

export interface MarkdownPreviewLine {
  id: string
  kind: MarkdownPreviewLineKind
  lineNumber: number
  text: string
}

export function buildMarkdownPreviewLines(lines: readonly string[]): MarkdownPreviewLine[] {
  let activeFenceMarker: string | null = null

  return lines.map((line, index) => {
    const text = line.replace(/\r?\n$/u, '')
    const trimmed = text.trim()
    const fenceMarker = trimmed.match(/^(```+|~~~+)/u)?.[1] ?? null
    let kind: MarkdownPreviewLineKind

    if (fenceMarker) {
      kind = 'fence'
      if (activeFenceMarker === fenceMarker) {
        activeFenceMarker = null
      } else if (activeFenceMarker === null) {
        activeFenceMarker = fenceMarker
      }
    } else if (activeFenceMarker) {
      kind = 'code'
    } else if (trimmed.length === 0) {
      kind = 'empty'
    } else if (/^#{1,6}\s/u.test(trimmed)) {
      kind = 'heading'
    } else if (/^\s*>\s?/u.test(text)) {
      kind = 'quote'
    } else if (
      /^\s*[-*+]\s+\[[ xX]\]\s+/u.test(text) ||
      /^\s*(?:[-*+]|\d+[.)])\s+/u.test(text)
    ) {
      kind = 'list'
    } else if (isMarkdownTableLine(text)) {
      kind = 'table'
    } else {
      kind = 'paragraph'
    }

    return {
      id: `markdown-preview-line-${index}`,
      kind,
      lineNumber: index + 1,
      text,
    }
  })
}

export function getMarkdownPreviewLineBadge(kind: MarkdownPreviewLineKind): string {
  switch (kind) {
    case 'heading':
      return 'HDR'
    case 'list':
      return 'LST'
    case 'quote':
      return 'QTE'
    case 'table':
      return 'TBL'
    case 'fence':
      return 'FNC'
    case 'code':
      return 'COD'
    case 'empty':
      return 'EMP'
    case 'paragraph':
    default:
      return 'TXT'
  }
}

function isMarkdownTableLine(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.includes('|')) return false

  const separatorPattern = /^\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/u
  if (separatorPattern.test(trimmed)) return true

  return /^\|.*\|\s*$/u.test(trimmed)
}
