export function getAIDocumentThreadKey(tabId: string, tabPath: string | null): string {
  const normalizedPath = normalizeThreadPath(tabPath)
  if (normalizedPath) return `path:${normalizedPath}`
  return `draft:${tabId}`
}

export function parseAIDocumentThreadKey(threadKey: string): { kind: 'path' | 'draft'; value: string } | null {
  if (threadKey.startsWith('path:')) {
    const value = threadKey.slice(5)
    return value ? { kind: 'path', value } : null
  }

  if (threadKey.startsWith('draft:')) {
    const value = threadKey.slice(6)
    return value ? { kind: 'draft', value } : null
  }

  return null
}

function normalizeThreadPath(tabPath: string | null): string | null {
  const trimmed = tabPath?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\\/g, '/')
}
