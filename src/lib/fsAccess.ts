import { invoke } from '@tauri-apps/api/core'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type FsAccessKind = 'file' | 'dir'

const grantedPathKeys = new Set<string>()

function getAccessCacheKey(path: string, kind: FsAccessKind, recursive: boolean): string {
  return `${kind}:${recursive ? 'recursive' : 'single'}:${path}`
}

export async function ensureFsPathAccess(
  path: string,
  options: {
    kind?: FsAccessKind
    recursive?: boolean
  } = {}
): Promise<void> {
  if (!isTauri) return

  const trimmedPath = path.trim()
  if (!trimmedPath) return

  const kind = options.kind ?? 'file'
  const recursive = options.recursive ?? kind === 'dir'
  const cacheKey = getAccessCacheKey(trimmedPath, kind, recursive)

  if (grantedPathKeys.has(cacheKey)) return

  await invoke('allow_fs_scope_path', {
    path: trimmedPath,
    directory: kind === 'dir',
    recursive,
  })

  grantedPathKeys.add(cacheKey)
}

export async function ensureFsPathAccessBatch(
  paths: Iterable<string>,
  options: {
    kind?: FsAccessKind
    recursive?: boolean
  } = {}
): Promise<void> {
  const uniquePaths = Array.from(new Set(Array.from(paths).map((path) => path.trim()).filter(Boolean)))
  if (uniquePaths.length === 0) return

  await Promise.all(uniquePaths.map((path) => ensureFsPathAccess(path, options)))
}
