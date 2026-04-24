import type { Plugin } from 'unified'

type HastNode = {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  position?: {
    start?: { offset?: number | null }
    end?: { offset?: number | null }
  }
}

type VFileLike = {
  data?: Record<string, unknown>
  value?: unknown
}

const SUBSCRIPT_MARKER = '~'
const CHARACTER_REFERENCE_PATTERN = /^&(?:#\d+|#x[0-9a-f]+|[A-Za-z][A-Za-z0-9]+);/i
const INLINE_MATH_PATTERN = /(?<!\$)\${1,2}(?!\$)(.+?)(?<!\$)\${1,2}(?!\$)/g
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'textarea', 'sub', 'svg'])

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
  target.push(node)
}

function flushSubscriptBuffer(result: HastNode[], subscriptBuffer: HastNode[] | null): HastNode[] | null {
  if (subscriptBuffer === null) return null

  appendText(result, SUBSCRIPT_MARKER)
  for (const node of subscriptBuffer) {
    appendNode(result, node)
  }

  return null
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

function getSourceSlice(node: HastNode, source: string): string {
  const startOffset = node.position?.start?.offset
  const endOffset = node.position?.end?.offset
  if (typeof startOffset !== 'number' || typeof endOffset !== 'number') return ''
  if (startOffset < 0 || endOffset < startOffset) return ''

  return source.slice(startOffset, endOffset)
}

function getProtectedTildeOffsets(textValue: string, sourceSlice: string): Set<number> {
  const protectedOffsets = new Set<number>()
  if (!textValue.includes(SUBSCRIPT_MARKER) || !sourceSlice) return protectedOffsets

  let textIndex = 0
  let sourceIndex = 0

  while (textIndex < textValue.length && sourceIndex < sourceSlice.length) {
    const textChar = textValue[textIndex]
    const sourceChar = sourceSlice[sourceIndex]

    if (sourceChar === '\\' && sourceSlice[sourceIndex + 1] === textChar) {
      if (textChar === SUBSCRIPT_MARKER) {
        protectedOffsets.add(textIndex)
      }
      sourceIndex += 2
      textIndex += 1
      continue
    }

    if (sourceChar === '&') {
      const characterReference = CHARACTER_REFERENCE_PATTERN.exec(sourceSlice.slice(sourceIndex))
      if (characterReference) {
        if (textChar === SUBSCRIPT_MARKER) {
          protectedOffsets.add(textIndex)
        }
        sourceIndex += characterReference[0].length
        textIndex += 1
        continue
      }
    }

    if (sourceChar === '\r' && sourceSlice[sourceIndex + 1] === '\n' && textChar === '\n') {
      sourceIndex += 2
      textIndex += 1
      continue
    }

    if (sourceChar === textChar) {
      sourceIndex += 1
      textIndex += 1
      continue
    }

    sourceIndex += 1
  }

  return protectedOffsets
}

function protectTildesInsideInlineMath(textValue: string, protectedOffsets: Set<number>): void {
  let match: RegExpExecArray | null

  while ((match = INLINE_MATH_PATTERN.exec(textValue)) !== null) {
    const from = match.index
    const to = from + match[0].length

    for (let index = from; index < to; index += 1) {
      if (textValue[index] === SUBSCRIPT_MARKER) {
        protectedOffsets.add(index)
      }
    }
  }
}

function canOpenSubscript(previousChar: string | null, nextChar: string | null): boolean {
  return previousChar !== SUBSCRIPT_MARKER &&
    nextChar !== null &&
    nextChar !== SUBSCRIPT_MARKER &&
    !/\s/u.test(nextChar)
}

function canCloseSubscript(previousChar: string | null, nextChar: string | null): boolean {
  return previousChar !== null &&
    previousChar !== SUBSCRIPT_MARKER &&
    !/\s/u.test(previousChar) &&
    nextChar !== SUBSCRIPT_MARKER
}

function rewriteSubscriptChildren(children: HastNode[], source: string): HastNode[] {
  const result: HastNode[] = []
  let subscriptBuffer: HastNode[] | null = null

  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex]

    if (child.type === 'element' && child.tagName === 'br' && subscriptBuffer !== null) {
      subscriptBuffer = flushSubscriptBuffer(result, subscriptBuffer)
      appendNode(result, child)
      continue
    }

    if (child.type !== 'text' || typeof child.value !== 'string' || !child.value.includes(SUBSCRIPT_MARKER)) {
      appendNode(subscriptBuffer ?? result, child)
      continue
    }

    const textValue = child.value
    const protectedOffsets = getProtectedTildeOffsets(textValue, getSourceSlice(child, source))
    protectTildesInsideInlineMath(textValue, protectedOffsets)
    let cursor = 0

    while (cursor < textValue.length) {
      const markerIndex = textValue.indexOf(SUBSCRIPT_MARKER, cursor)
      if (markerIndex === -1) {
        appendText(subscriptBuffer ?? result, textValue.slice(cursor))
        break
      }

      const textBeforeMarker = textValue.slice(cursor, markerIndex)
      appendText(subscriptBuffer ?? result, textBeforeMarker)

      if (protectedOffsets.has(markerIndex)) {
        appendText(subscriptBuffer ?? result, SUBSCRIPT_MARKER)
        cursor = markerIndex + SUBSCRIPT_MARKER.length
        continue
      }

      const previousChar = textBeforeMarker
        ? textBeforeMarker[textBeforeMarker.length - 1]
        : getLastVisibleCharFromNodes(subscriptBuffer ?? result)
      const nextChar = findNextVisibleChar(children, childIndex, textValue, markerIndex + SUBSCRIPT_MARKER.length)

      if (subscriptBuffer === null) {
        if (canOpenSubscript(previousChar, nextChar)) {
          subscriptBuffer = []
        } else {
          appendText(result, SUBSCRIPT_MARKER)
        }
      } else if (canCloseSubscript(previousChar, nextChar)) {
        result.push({
          type: 'element',
          tagName: 'sub',
          properties: {},
          children: subscriptBuffer,
        })
        subscriptBuffer = null
      } else {
        appendText(subscriptBuffer, SUBSCRIPT_MARKER)
      }

      cursor = markerIndex + SUBSCRIPT_MARKER.length
    }
  }

  flushSubscriptBuffer(result, subscriptBuffer)
  return result
}

function rewriteSubscriptMarkers(node: HastNode, source: string): void {
  if (node.type !== 'root' && node.type !== 'element') return
  if (shouldSkipNode(node)) return

  const children = node.children
  if (!children?.length) return

  for (const child of children) {
    rewriteSubscriptMarkers(child, source)
  }

  node.children = rewriteSubscriptChildren(children, source)
}

export const rehypeSubscriptMarkers: Plugin = () => {
  return (tree: unknown, file?: VFileLike) => {
    const markdownSource = file?.data?.markdownSource
    rewriteSubscriptMarkers(
      tree as HastNode,
      typeof markdownSource === 'string' ? markdownSource : String(file?.value ?? '')
    )
  }
}
