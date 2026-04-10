export type ExternalFileChangeResolution = 'noop' | 'conflict' | 'reload'

export interface ExternalFileSnapshot {
  content: string
  savedContent: string
  isDirty: boolean
}

export function resolveExternalFileContentChange(
  tab: ExternalFileSnapshot,
  diskContent: string
): ExternalFileChangeResolution {
  if (diskContent === tab.content) {
    return 'noop'
  }

  if (!tab.isDirty) {
    return 'reload'
  }

  return diskContent === tab.savedContent ? 'noop' : 'conflict'
}
