import type { Plugin } from 'unified'

type HastNode = {
  type: string
  tagName?: string
  position?: { start?: { line?: number | null } }
  properties?: Record<string, unknown>
  children?: HastNode[]
}

// Block-level tags worth annotating for split-mode scroll sync. Inline tags
// (em, strong, span, sub, sup, u, mark, code, a, ...) are intentionally
// excluded — they add noise without improving line-level mapping.
const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'pre',
  'table', 'thead', 'tbody', 'tr',
  'div', 'section', 'article', 'aside', 'nav', 'header', 'footer',
  'details', 'summary',
  'figure', 'figcaption',
  'hr',
  'audio', 'video', 'iframe',
])

function walk(node: HastNode, visitor: (node: HastNode) => void): void {
  visitor(node)
  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    walk(child, visitor)
  }
}

export const rehypeSourceLineFromPosition: Plugin = () => {
  return (tree: unknown) => {
    walk(tree as HastNode, (node) => {
      if (node.type !== 'element') return
      if (typeof node.tagName !== 'string' || !BLOCK_TAGS.has(node.tagName)) return
      const line = node.position?.start?.line
      if (typeof line !== 'number' || line <= 0) return

      const properties = node.properties ?? (node.properties = {})
      if (properties.dataSourceLine) return

      properties.dataSourceLine = String(line)
    })
  }
}
