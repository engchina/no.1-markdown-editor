import { useEditorStore } from '../../store/editor.ts'

const BROWSER_TAB_PROTOCOLS = new Set(['http:', 'https:'])

export interface BrowserTabLink {
  url: string
  name: string
}

export function buildBrowserTabLink(rawUrl: string): BrowserTabLink | null {
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) return null

  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    return null
  }

  if (!BROWSER_TAB_PROTOCOLS.has(parsed.protocol)) return null

  const hostname = parsed.hostname.replace(/^www\./i, '')
  return {
    url: parsed.toString(),
    name: hostname || parsed.host || 'Browser',
  }
}

export function openWebUrlInNewBrowserTab(rawUrl: string): string | null {
  const link = buildBrowserTabLink(rawUrl)
  if (!link) return null

  return useEditorStore.getState().addTab({
    type: 'browser',
    url: link.url,
    name: link.name,
  })
}
