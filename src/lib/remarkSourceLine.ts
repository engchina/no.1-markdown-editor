import type { Plugin } from 'unified'

type MdastNode = {
  type: string
  position?: { start?: { line?: number | null } }
  data?: Record<string, unknown> & {
    hProperties?: Record<string, unknown>
  }
  children?: MdastNode[]
}

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'list',
  'listItem',
  'code',
  'thematicBreak',
  'table',
  'tableRow',
  'html',
  'math',
])

function walk(node: MdastNode, visitor: (node: MdastNode) => void): void {
  visitor(node)
  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    walk(child, visitor)
  }
}

export const remarkSourceLine: Plugin = () => {
  return (tree: unknown) => {
    walk(tree as MdastNode, (node) => {
      if (!BLOCK_TYPES.has(node.type)) return
      const line = node.position?.start?.line
      if (typeof line !== 'number' || line <= 0) return

      const data = (node.data ?? (node.data = {})) as { hProperties?: Record<string, unknown> }
      const props = (data.hProperties ?? (data.hProperties = {})) as Record<string, unknown>
      props.dataSourceLine = String(line)
    })
  }
}
