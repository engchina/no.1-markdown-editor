import type { Plugin } from 'unified'

type HastNode = {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const LANGUAGE_CLASS_PREFIX = 'language-'

function extractLanguage(codeNode: HastNode): string | null {
  const raw = codeNode.properties?.className
  const names = Array.isArray(raw)
    ? raw.map((entry) => String(entry))
    : typeof raw === 'string'
      ? raw.split(/\s+/u).filter(Boolean)
      : []

  for (const name of names) {
    if (name.startsWith(LANGUAGE_CLASS_PREFIX)) {
      const language = name.slice(LANGUAGE_CLASS_PREFIX.length)
      return language || null
    }
  }
  return null
}

function annotate(node: HastNode): void {
  if (node.type === 'element' && node.tagName === 'pre') {
    const codeChild = node.children?.find(
      (child) => child.type === 'element' && child.tagName === 'code'
    )
    if (codeChild) {
      const language = extractLanguage(codeChild)
      node.properties = node.properties ?? {}
      node.properties['data-code-language-label'] = language ? `Code (${language})` : 'Code'
    }
  }

  for (const child of node.children ?? []) {
    annotate(child)
  }
}

export const rehypeCodeBlockLanguageLabel: Plugin<[], HastNode> = () => {
  return (tree) => {
    annotate(tree)
  }
}
