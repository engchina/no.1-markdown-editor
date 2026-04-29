type HastNode = {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  position?: {
    start?: { line?: number }
  }
}

type ProcessorFile = {
  data?: Record<string, unknown>
}

const HTML_BREAK_LINE_PATTERN = /^<br\s*\/?>$/iu
const ORDERED_LIST_MARKER_PATTERN = /^\s*(\d+)[.)]\s+/u

export function rehypeSplitHtmlBreakOrderedLists() {
  return (tree: HastNode, file?: ProcessorFile) => {
    const markdownSource = readMarkdownSource(file)
    if (!markdownSource) return

    const sourceLines = markdownSource.split(/\r\n|\n|\r/u)
    splitOrderedListsAfterStandaloneBreaks(tree, sourceLines)
  }
}

function splitOrderedListsAfterStandaloneBreaks(node: HastNode, sourceLines: readonly string[]): void {
  if (!node.children?.length) return

  for (const child of node.children) {
    splitOrderedListsAfterStandaloneBreaks(child, sourceLines)
  }

  const rewrittenChildren: HastNode[] = []
  let changed = false

  for (const child of node.children) {
    if (isElement(child, 'ol')) {
      const splitNodes = splitOrderedList(child, sourceLines)
      if (splitNodes.length > 1) changed = true
      rewrittenChildren.push(...splitNodes)
      continue
    }

    rewrittenChildren.push(child)
  }

  if (changed) {
    node.children = rewrittenChildren
  }
}

function splitOrderedList(listNode: HastNode, sourceLines: readonly string[]): HastNode[] {
  const children = listNode.children
  if (!children?.length) return [listNode]

  const result: HastNode[] = []
  let segmentChildren: HastNode[] = []
  let split = false

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    segmentChildren.push(child)

    if (!isElement(child, 'li') || !hasFollowingListItem(children, index + 1)) {
      continue
    }

    const splitBreak = findTrailingStandaloneBreak(child, sourceLines)
    if (!splitBreak) continue

    split = true
    removeTrailingBreakFromListItem(child, splitBreak.index)
    result.push(buildOrderedListSegment(listNode, segmentChildren, sourceLines))
    result.push(splitBreak.node)
    segmentChildren = []
  }

  if (!split) return [listNode]

  if (hasListItem(segmentChildren)) {
    result.push(buildOrderedListSegment(listNode, segmentChildren, sourceLines))
  }

  return result
}

function findTrailingStandaloneBreak(
  listItem: HastNode,
  sourceLines: readonly string[]
): { index: number; node: HastNode } | null {
  const children = listItem.children
  if (!children?.length) return null

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (!isElement(child, 'br') || !isStandaloneHtmlBreakLine(child, sourceLines)) continue
    if (!children.slice(index + 1).every(isWhitespaceText)) continue

    return { index, node: child }
  }

  return null
}

function removeTrailingBreakFromListItem(listItem: HastNode, breakIndex: number): void {
  const children = listItem.children
  if (!children) return

  let removeFrom = breakIndex
  while (removeFrom > 0 && isWhitespaceText(children[removeFrom - 1])) {
    removeFrom -= 1
  }

  listItem.children = children.slice(0, removeFrom)
}

function buildOrderedListSegment(
  template: HastNode,
  children: HastNode[],
  sourceLines: readonly string[]
): HastNode {
  const properties = { ...(template.properties ?? {}) }
  const start = resolveFirstOrderedListMarker(children, sourceLines)

  if (start === null) {
    return { ...template, properties, children }
  }

  if (start > 1) {
    properties.start = start
  } else {
    delete properties.start
  }

  return { ...template, properties, children }
}

function resolveFirstOrderedListMarker(children: readonly HastNode[], sourceLines: readonly string[]): number | null {
  const firstListItem = children.find((child) => isElement(child, 'li'))
  const lineNumber = firstListItem?.position?.start?.line
  if (typeof lineNumber !== 'number') return null

  const line = sourceLines[lineNumber - 1] ?? ''
  const markerMatch = line.match(ORDERED_LIST_MARKER_PATTERN)
  if (!markerMatch) return null

  const marker = Number.parseInt(markerMatch[1], 10)
  return Number.isSafeInteger(marker) && marker > 0 ? marker : null
}

function hasFollowingListItem(children: readonly HastNode[], startIndex: number): boolean {
  for (let index = startIndex; index < children.length; index += 1) {
    if (isElement(children[index], 'li')) return true
  }

  return false
}

function hasListItem(children: readonly HastNode[]): boolean {
  return children.some((child) => isElement(child, 'li'))
}

function isStandaloneHtmlBreakLine(node: HastNode, sourceLines: readonly string[]): boolean {
  const lineNumber = node.position?.start?.line
  if (typeof lineNumber !== 'number') return false

  const line = sourceLines[lineNumber - 1] ?? ''
  return HTML_BREAK_LINE_PATTERN.test(line.trim())
}

function isWhitespaceText(node: HastNode | undefined): boolean {
  return node?.type === 'text' && typeof node.value === 'string' && node.value.trim() === ''
}

function isElement(node: HastNode | undefined, tagName: string): node is HastNode & { tagName: string } {
  return node?.type === 'element' && node.tagName === tagName
}

function readMarkdownSource(file: ProcessorFile | undefined): string | null {
  const source = file?.data?.markdownSource
  return typeof source === 'string' ? source : null
}
