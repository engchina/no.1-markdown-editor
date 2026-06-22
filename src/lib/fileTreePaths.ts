export interface FileTreeTargetLike {
  name: string
  path: string
  type: 'file' | 'dir'
}

export type FileTreeEntryValidationReason = 'empty' | 'reserved' | 'invalid'
export type FileTreeMoveValidationReason = 'same' | 'descendant'
export type FileTreeOperationFailureReason =
  | FileTreeEntryValidationReason
  | FileTreeMoveValidationReason
  | 'exists'
  | 'unknown'

const INVALID_FILE_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/

// Windows compares paths case-insensitively and treats `/` and `\` as the same
// separator; POSIX is case- and separator-sensitive. Normalize only for
// COMPARISON — every stored/returned path keeps its original characters. This is
// deliberately length-preserving (unlike `canonicalFsPathKey`, which strips
// `\\?\` verbatim prefixes) so a matched prefix's length still indexes into the
// original path for suffix extraction.
function comparablePath(path: string): string {
  const slashed = path.replace(/\\/g, '/')
  const isWindowsPath = /^[a-z]:\//i.test(slashed) || slashed.startsWith('//')
  return isWindowsPath ? slashed.toLowerCase() : slashed
}

export function ensureMarkdownFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  if (/\.[A-Za-z0-9]+$/.test(trimmed)) return trimmed
  return `${trimmed}.md`
}

export function validateFileTreeEntryName(name: string): FileTreeEntryValidationReason | null {
  const trimmed = name.trim()
  if (!trimmed) return 'empty'
  if (trimmed === '.' || trimmed === '..') return 'reserved'
  if (INVALID_FILE_NAME_PATTERN.test(trimmed)) return 'invalid'
  return null
}

export function pathMatchesPrefix(path: string, prefix: string): boolean {
  return remapPathPrefix(path, prefix, '__MATCH__') !== null
}

export function remapPathPrefix(path: string, oldPrefix: string, newPrefix: string): string | null {
  if (!path || !oldPrefix) return null
  if (comparablePath(path) === comparablePath(oldPrefix)) return newPrefix

  const suffix = getPathSuffix(path, oldPrefix)
  if (suffix === null) return null
  return `${newPrefix}${suffix}`
}

export function findTreeNodeByPath<T extends FileTreeTargetLike>(
  tree: readonly T[],
  path: string | null
): T | null {
  if (!path) return null
  const target = comparablePath(path)

  for (const node of tree) {
    if (comparablePath(node.path) === target) return node

    const children = 'children' in node && Array.isArray(node.children)
      ? (node.children as readonly T[])
      : []
    const nested = findTreeNodeByPath(children, path)
    if (nested) return nested
  }

  return null
}

export function findTreePathInTree<T extends FileTreeTargetLike & { children?: readonly T[] }>(
  tree: readonly T[],
  path: string | null,
  trail: number[] = []
): number[] | null {
  if (!path) return null
  const target = comparablePath(path)

  for (let index = 0; index < tree.length; index += 1) {
    const node = tree[index]
    const nextTrail = [...trail, index]
    if (comparablePath(node.path) === target) return nextTrail

    if (Array.isArray(node.children)) {
      const nested = findTreePathInTree(node.children, path, nextTrail)
      if (nested) return nested
    }
  }

  return null
}

export function getParentDirectoryPath(path: string): string {
  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return separatorIndex <= 0 ? path : path.slice(0, separatorIndex)
}

export function getPathBaseName(path: string): string {
  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return separatorIndex === -1 ? path : path.slice(separatorIndex + 1)
}

export function validateMoveDestination(
  source: FileTreeTargetLike,
  targetDirectoryPath: string
): FileTreeMoveValidationReason | null {
  if (source.type !== 'dir') return null
  if (comparablePath(targetDirectoryPath) === comparablePath(source.path)) return 'same'
  if (pathMatchesPrefix(targetDirectoryPath, source.path)) return 'descendant'
  return null
}

function getPathSuffix(path: string, prefix: string): string | null {
  // Match the prefix case/separator-insensitively (Windows), but slice the
  // ORIGINAL path so the returned suffix keeps its real casing and separators.
  // `comparablePath` is length-preserving, so `prefix.length` is a valid index
  // into the original path here.
  if (!comparablePath(path).startsWith(comparablePath(prefix))) return null
  const suffix = path.slice(prefix.length)
  if (!suffix) return ''
  if (suffix[0] !== '/' && suffix[0] !== '\\') return null
  return suffix
}
