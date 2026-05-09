import type { Plugin } from 'unified'

type HastNode = {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function getClassNames(properties?: Record<string, unknown>): string[] {
  const className = properties?.className
  if (typeof className === 'string') return className.split(/\s+/).filter(Boolean)
  if (!Array.isArray(className)) return []

  return className
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(/\s+/) : []))
    .filter(Boolean)
}

function findFirstElementChild(node: HastNode): HastNode | null {
  if (!Array.isArray(node.children)) return null
  for (const child of node.children) {
    if (child.type === 'element') return child
  }
  return null
}

function isMathDisplayPre(node: HastNode): boolean {
  if (node.type !== 'element' || node.tagName !== 'pre') return false
  const code = findFirstElementChild(node)
  if (!code || code.tagName !== 'code') return false
  return getClassNames(code.properties).includes('math-display')
}

export const rehypeWrapMathPreForSourceLine: Plugin = () => {
  return (tree: unknown) => {
    rewriteChildren(tree as HastNode)
  }
}

function rewriteChildren(node: HastNode): void {
  if (!Array.isArray(node.children)) return

  const next: HastNode[] = []
  for (const child of node.children) {
    if (child.type === 'element') rewriteChildren(child)

    if (!isMathDisplayPre(child)) {
      next.push(child)
      continue
    }

    const properties = (child.properties ?? (child.properties = {}))
    const sourceLine = properties.dataSourceLine
    if (typeof sourceLine !== 'string' || !sourceLine) {
      next.push(child)
      continue
    }

    delete properties.dataSourceLine
    next.push({
      type: 'element',
      tagName: 'div',
      properties: {
        className: ['math-source-line-wrap'],
        dataSourceLine: sourceLine,
      },
      children: [child],
    })
  }

  node.children = next
}
