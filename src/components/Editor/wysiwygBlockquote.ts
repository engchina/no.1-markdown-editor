export interface WysiwygBlockquoteLine {
  prefix: string
  content: string
  depth: number
  isEmpty: boolean
}

export function parseWysiwygBlockquoteLine(text: string): WysiwygBlockquoteLine | null {
  const match = /^(\s*(?:>\s*)+)(.*)$/.exec(text)
  if (!match) return null

  const prefix = match[1] ?? ''
  const content = match[2] ?? ''

  return {
    prefix,
    content,
    depth: (prefix.match(/>/g) ?? []).length,
    isEmpty: content.trim().length === 0,
  }
}
