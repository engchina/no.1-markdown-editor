import { invoke } from '@tauri-apps/api/core'
import i18n from '../i18n'
import { useRecentFilesStore } from '../store/recentFiles'
import { useEditorStore } from '../store/editor'
import { isSupportedDocumentName } from './fileTypes'
import { pushErrorNotice } from './notices'

export const SINGLE_INSTANCE_OPEN_FILES_EVENT = 'single-instance-open-files'

function getDocumentNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? i18n.t('app.untitled')
}

export async function openDesktopDocumentPath(path: string): Promise<boolean> {
  if (!path) return false

  const name = getDocumentNameFromPath(path)
  if (!isSupportedDocumentName(name)) return false

  try {
    const content = await invoke<string>('read_file', { path })
    useEditorStore.getState().openDocument({
      path,
      name,
      content,
      savedContent: content,
      isDirty: false,
    })
    useRecentFilesStore.getState().addRecent(path, name)
    return true
  } catch (error) {
    console.error('Open desktop document error:', error)
    pushErrorNotice('notices.openFileErrorTitle', 'notices.openFileErrorMessage')
    return false
  }
}

export async function openDesktopDocumentPaths(paths: readonly string[]): Promise<void> {
  const seenPaths = new Set<string>()

  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0 || seenPaths.has(path)) continue
    seenPaths.add(path)
    await openDesktopDocumentPath(path)
  }
}
