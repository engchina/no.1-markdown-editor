import type { Plugin } from 'unified'

type MdastNode = {
  type: string
  position?: { start?: { line?: number | null } }
  data?: Record<string, unknown> & {
    hProperties?: Record<string, unknown>
  }
  children?: MdastNode[]
}

type SourceLineFile = {
  data?: {
    sourceLineOffset?: unknown
  }
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

// Parsing runs on the front-matter-stripped body, so node positions are
// body-relative. Callers pass `data.sourceLineOffset` (the number of stripped
// lines) on the processed file so emitted markers stay full-document based.
export function resolveSourceLineOffset(file: unknown): number {
  const offset = (file as SourceLineFile | undefined)?.data?.sourceLineOffset
  return typeof offset === 'number' && Number.isFinite(offset) && offset > 0
    ? Math.floor(offset)
    : 0
}

export const remarkSourceLine: Plugin = () => {
  return (tree: unknown, file: unknown) => {
    const lineOffset = resolveSourceLineOffset(file)
    walk(tree as MdastNode, (node) => {
      if (!BLOCK_TYPES.has(node.type)) return
      const line = node.position?.start?.line
      if (typeof line !== 'number' || line <= 0) return

      const data = (node.data ?? (node.data = {})) as { hProperties?: Record<string, unknown> }
      const props = (data.hProperties ?? (data.hProperties = {})) as Record<string, unknown>
      props.dataSourceLine = String(line + lineOffset)
    })
  }
}
