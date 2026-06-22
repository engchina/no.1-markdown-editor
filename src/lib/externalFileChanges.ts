import { toLf } from './textFormat.ts'

export type ExternalFileChangeResolution = 'noop' | 'conflict' | 'reload'

/**
 * Watcher events may report a path that differs textually from the tab path
 * that registered the watch — on Windows the same file can come back with a
 * `\\?\` verbatim prefix, different separators, or different casing. Reduce
 * both sides to a canonical key before comparing so those events still map
 * back to their tab.
 */
export function canonicalFsPathKey(path: string): string {
  let normalized = path.trim().replace(/\\/g, '/')

  if (normalized.startsWith('//?/UNC/')) {
    normalized = `//${normalized.slice('//?/UNC/'.length)}`
  } else if (normalized.startsWith('//?/')) {
    normalized = normalized.slice('//?/'.length)
  }

  // Drive-letter and UNC paths are Windows filesystems, which compare
  // case-insensitively; POSIX paths keep their case.
  const isWindowsPath = /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
  return isWindowsPath ? normalized.toLowerCase() : normalized
}

export interface ExternalFileSnapshot {
  content: string
  savedContent: string
  isDirty: boolean
}

export function resolveExternalFileContentChange(
  tab: ExternalFileSnapshot,
  diskContent: string
): ExternalFileChangeResolution {
  // In-memory content is always LF (CodeMirror strips `\r`), while disk content
  // keeps its original EOL. Compare EOL-insensitively so a CRLF file does not
  // look like an endless external change against its LF in-memory twin.
  const disk = toLf(diskContent)
  const content = toLf(tab.content)
  const savedContent = toLf(tab.savedContent)

  if (disk === content) {
    return 'noop'
  }

  if (!tab.isDirty) {
    return 'reload'
  }

  return disk === savedContent ? 'noop' : 'conflict'
}
