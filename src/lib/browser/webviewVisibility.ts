import { invoke } from '@tauri-apps/api/core'
import { useEditorStore, type FileTab } from '../../store/editor.ts'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function getBrowserWebviewLabel(tabId: string): string {
  return `browser-${tabId}`
}

export function getBrowserWebviewLabels(tabs: readonly Pick<FileTab, 'id' | 'type'>[]): string[] {
  return tabs
    .filter((tab) => tab.type === 'browser')
    .map((tab) => getBrowserWebviewLabel(tab.id))
}

async function hideBrowserWebview(label: string): Promise<void> {
  try {
    await invoke('show_browser_webview', { label, visible: false })
  } catch (error) {
    console.error('Hide browser webview error:', error)
  }
}

export async function hideBrowserWebviews(labels: readonly string[]): Promise<void> {
  if (!isTauri || labels.length === 0) return

  await Promise.all(labels.map((label) => hideBrowserWebview(label)))
}

export async function hideAllBrowserWebviews(): Promise<void> {
  const labels = getBrowserWebviewLabels(useEditorStore.getState().tabs)
  await hideBrowserWebviews(labels)
}

export async function hideInactiveBrowserWebviews(visibleActiveTabId?: string | null): Promise<void> {
  const { activeTabId: stateActiveTabId, tabs } = useEditorStore.getState()
  const visibleTabId = visibleActiveTabId ?? stateActiveTabId
  const labels = tabs
    .filter((tab) => tab.type === 'browser' && tab.id !== visibleTabId)
    .map((tab) => getBrowserWebviewLabel(tab.id))

  await hideBrowserWebviews(labels)
}
