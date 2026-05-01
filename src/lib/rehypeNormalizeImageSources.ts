interface HastNode {
  type?: string
  tagName?: string
  children?: HastNode[]
  properties?: Record<string, unknown>
}

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/
const LOCAL_SOURCE_PROPERTIES_BY_TAG: Record<string, readonly string[]> = {
  audio: ['src'],
  img: ['src'],
  source: ['src'],
  track: ['src'],
  video: ['poster', 'src'],
}

export function rehypeNormalizeImageSources() {
  return (tree: HastNode) => {
    walk(tree, (node) => {
      if (!isElement(node)) return

      const properties = node.properties ?? (node.properties = {})
      const sourceProperties = LOCAL_SOURCE_PROPERTIES_BY_TAG[node.tagName]
      if (!sourceProperties) return

      for (const propertyName of sourceProperties) {
        const source = readStringProperty(properties[propertyName])?.trim()
        if (!source) continue

        const normalizedSource = normalizeImageSourceForSanitize(source)
        if (!normalizedSource || normalizedSource === source) continue

        properties[propertyName] = normalizedSource
      }
    })
  }
}

function normalizeImageSourceForSanitize(source: string): string {
  if (!WINDOWS_DRIVE_PATH_PATTERN.test(source) && !WINDOWS_UNC_PATH_PATTERN.test(source)) {
    return source
  }

  const normalizedPath = normalizePath(source)
  if (normalizedPath.startsWith('//')) {
    return `file:${encodeURI(normalizedPath)}`
  }

  return `file:///${encodeURI(normalizedPath)}`
}

function normalizePath(value: string): string {
  try {
    return decodeURI(value).replace(/\\/g, '/')
  } catch {
    return value.replace(/\\/g, '/')
  }
}

function isElement(node: HastNode): node is HastNode & { tagName: string; properties: Record<string, unknown> } {
  return node.type === 'element' && typeof node.tagName === 'string'
}

function walk(node: HastNode, visit: (node: HastNode) => void) {
  visit(node)

  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    walk(child, visit)
  }
}

function readStringProperty(value: unknown): string | null {
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string')
    return strings.length === 0 ? null : strings.join(' ')
  }

  return null
}
