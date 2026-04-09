import type { Plugin } from 'unified'

type HastNode = {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const HIGHLIGHT_MARKER = '=='
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'textarea', 'mark', 'svg'])

function appendText(target: HastNode[], value: string): void {
  if (!value) return

  const lastNode = target[target.length - 1]
  if (lastNode?.type === 'text') {
    lastNode.value = (lastNode.value ?? '') + value
    return
  }

  target.push({ type: 'text', value })
}

function appendNode(target: HastNode[], node: HastNode): void {
  if (node.type === 'text') {
    appendText(target, node.value ?? '')
    return
  }

  target.push(node)
}

function getClassNames(properties?: Record<string, unknown>): string[] {
  const className = properties?.className
  if (typeof className === 'string') return className.split(/\s+/).filter(Boolean)
  if (!Array.isArray(className)) return []

  return className
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(/\s+/) : []))
    .filter(Boolean)
}

function shouldSkipNode(node: HastNode): boolean {
  if (node.type !== 'element') return false
  if (node.tagName && SKIP_TAGS.has(node.tagName)) return true

  const classNames = getClassNames(node.properties)
  return classNames.some((className) => (
    className === 'katex' ||
    className === 'katex-display' ||
    className === 'math-inline' ||
    className === 'math-display'
  ))
}

function getFirstVisibleChar(node: HastNode | undefined): string | null {
  if (!node) return null

  if (node.type === 'text') {
    return node.value?.[0] ?? null
  }

  if (node.type === 'element' && node.tagName === 'br') {
    return '\n'
  }

  for (const child of node.children ?? []) {
    const next = getFirstVisibleChar(child)
    if (next !== null) return next
  }

  return null
}

function getLastVisibleChar(node: HastNode | undefined): string | null {
  if (!node) return null

  if (node.type === 'text') {
    return node.value ? node.value[node.value.length - 1] : null
  }

  if (node.type === 'element' && node.tagName === 'br') {
    return '\n'
  }

  const children = node.children ?? []
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const previous = getLastVisibleChar(children[index])
    if (previous !== null) return previous
  }

  return null
}

function getLastVisibleCharFromNodes(nodes: HastNode[]): string | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const previous = getLastVisibleChar(nodes[index])
    if (previous !== null) return previous
  }

  return null
}

function findNextVisibleChar(
  siblings: HastNode[],
  siblingIndex: number,
  textValue: string,
  offset: number
): string | null {
  const remainder = textValue.slice(offset)
  if (remainder) return remainder[0] ?? null

  for (let index = siblingIndex + 1; index < siblings.length; index += 1) {
    const next = getFirstVisibleChar(siblings[index])
    if (next !== null) return next
  }

  return null
}

function canOpenHighlight(nextChar: string | null): boolean {
  return nextChar !== null && nextChar !== '=' && !/\s/.test(nextChar)
}

function canCloseHighlight(previousChar: string | null): boolean {
  return previousChar !== null && previousChar !== '=' && !/\s/.test(previousChar)
}

function rewriteHighlightChildren(children: HastNode[]): HastNode[] {
  const result: HastNode[] = []
  let highlightBuffer: HastNode[] | null = null

  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex]

    if (child.type !== 'text' || typeof child.value !== 'string' || !child.value.includes(HIGHLIGHT_MARKER)) {
      appendNode(highlightBuffer ?? result, child)
      continue
    }

    const textValue = child.value
    let cursor = 0

    while (cursor < textValue.length) {
      const markerIndex = textValue.indexOf(HIGHLIGHT_MARKER, cursor)
      if (markerIndex === -1) {
        appendText(highlightBuffer ?? result, textValue.slice(cursor))
        break
      }

      const textBeforeMarker = textValue.slice(cursor, markerIndex)
      appendText(highlightBuffer ?? result, textBeforeMarker)

      const previousChar = textBeforeMarker
        ? textBeforeMarker[textBeforeMarker.length - 1]
        : getLastVisibleCharFromNodes(highlightBuffer ?? result)
      const nextChar = findNextVisibleChar(children, childIndex, textValue, markerIndex + HIGHLIGHT_MARKER.length)

      if (highlightBuffer === null) {
        if (canOpenHighlight(nextChar)) {
          highlightBuffer = []
        } else {
          appendText(result, HIGHLIGHT_MARKER)
        }
      } else if (canCloseHighlight(previousChar)) {
        result.push({
          type: 'element',
          tagName: 'mark',
          properties: {},
          children: highlightBuffer,
        })
        highlightBuffer = null
      } else {
        appendText(highlightBuffer, HIGHLIGHT_MARKER)
      }

      cursor = markerIndex + HIGHLIGHT_MARKER.length
    }
  }

  if (highlightBuffer !== null) {
    appendText(result, HIGHLIGHT_MARKER)
    for (const node of highlightBuffer) {
      appendNode(result, node)
    }
  }

  return result
}

function rewriteHighlightMarkers(node: HastNode): void {
  if (node.type !== 'root' && node.type !== 'element') return
  if (shouldSkipNode(node)) return

  const children = node.children
  if (!children?.length) return

  for (const child of children) {
    rewriteHighlightMarkers(child)
  }

  node.children = rewriteHighlightChildren(children)
}

export const rehypeHighlightMarkers: Plugin<[], HastNode> = () => {
  return (tree) => {
    rewriteHighlightMarkers(tree)
  }
}
