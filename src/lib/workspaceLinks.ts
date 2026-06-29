import { MARKDOWN_FILE_EXTENSIONS } from './fileTypes.ts'

export interface WorkspaceLinkTarget {
  pathTarget: string
  anchor: string | null
  query: string | null
}

export interface WorkspaceDocumentLinkResolution {
  kind: 'document' | 'anchor' | 'external' | 'broken' | 'outside-workspace'
  path: string | null
  anchor: string | null
  ambiguous: boolean
}

export function resolveWorkspaceDocumentLink(
  rootPath: string,
  documentPath: string,
  href: string,
  availableDocumentPaths: readonly string[]
): WorkspaceDocumentLinkResolution {
  const { pathTarget, anchor } = splitWorkspaceLinkTarget(href)
  if (isExternalWorkspaceLink(href)) {
    return { kind: 'external', path: null, anchor, ambiguous: false }
  }
  if (!pathTarget) {
    return anchor
      ? { kind: 'anchor', path: normalizeWorkspacePath(documentPath), anchor, ambiguous: false }
      : { kind: 'broken', path: null, anchor, ambiguous: false }
  }

  const basePath = resolveWorkspacePathTarget(rootPath, documentPath, pathTarget)
  if (!basePath) {
    return { kind: 'outside-workspace', path: null, anchor, ambiguous: false }
  }

  const pathMap = new Map(availableDocumentPaths.map((path) => [workspacePathKey(path), normalizeWorkspacePath(path)]))
  const candidates = buildWorkspaceDocumentCandidates(basePath, pathTarget)
  const matches = Array.from(
    new Set(candidates.map((candidate) => pathMap.get(workspacePathKey(candidate))).filter(isPresent))
  )

  if (matches.length === 1) {
    return { kind: 'document', path: matches[0], anchor, ambiguous: false }
  }
  return { kind: 'broken', path: null, anchor, ambiguous: matches.length > 1 }
}

export function resolveWorkspacePathTarget(
  rootPath: string,
  documentPath: string,
  rawTarget: string
): string | null {
  const { pathTarget } = splitWorkspaceLinkTarget(rawTarget)
  if (!pathTarget || isExternalWorkspaceLink(pathTarget)) return null

  const decodedTarget = decodePath(pathTarget).replace(/\\/gu, '/')
  const normalizedRoot = normalizeWorkspacePath(rootPath)
  const joined = decodedTarget.startsWith('/')
    ? `${normalizedRoot}/${decodedTarget.replace(/^\/+/, '')}`
    : `${getDirectoryPath(documentPath)}/${decodedTarget}`
  const normalizedTarget = normalizeWorkspacePath(joined)
  return isWorkspacePathWithinRoot(normalizedTarget, normalizedRoot) ? normalizedTarget : null
}

export function splitWorkspaceLinkTarget(value: string): WorkspaceLinkTarget {
  const trimmed = value.trim().replace(/^<|>$/gu, '')
  const hashIndex = trimmed.indexOf('#')
  const pathWithQuery = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex)
  const rawAnchor = hashIndex === -1 ? '' : trimmed.slice(hashIndex + 1).trim()
  const queryIndex = pathWithQuery.indexOf('?')
  const rawQuery = queryIndex === -1 ? '' : pathWithQuery.slice(queryIndex + 1)

  return {
    pathTarget: (queryIndex === -1 ? pathWithQuery : pathWithQuery.slice(0, queryIndex)).trim(),
    anchor: rawAnchor ? decodePath(rawAnchor) : null,
    query: rawQuery || null,
  }
}

export function normalizeWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/gu, '/')
  const driveMatch = normalized.match(/^([A-Za-z]:)(?:\/|$)/u)
  const drivePrefix = driveMatch?.[1] ?? ''
  const absolute = normalized.startsWith('/')
  const source = drivePrefix ? normalized.slice(drivePrefix.length) : normalized
  const stack: string[] = []

  for (const segment of source.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (stack.length > 0) stack.pop()
      else stack.push('..')
      continue
    }
    stack.push(segment)
  }

  const prefix = drivePrefix ? `${drivePrefix}/` : absolute ? '/' : ''
  return `${prefix}${stack.join('/')}`.replace(/\/+$/u, '')
}

export function isWorkspacePathWithinRoot(path: string, rootPath: string): boolean {
  const normalizedPath = workspacePathKey(path)
  const normalizedRoot = workspacePathKey(rootPath)
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
}

export function isExternalWorkspaceLink(value: string): boolean {
  const target = value.trim()
  return /^(?:[A-Za-z][A-Za-z\d+.-]*:|\/\/)/u.test(target)
}

function buildWorkspaceDocumentCandidates(basePath: string, rawTarget: string): string[] {
  const normalizedBase = normalizeWorkspacePath(basePath)
  const directoryFirst = /[\\/]$/u.test(rawTarget)
  if (directoryFirst) return [`${normalizedBase}/index.md`]

  if (hasFileExtension(normalizedBase)) return [normalizedBase]
  return [
    normalizedBase,
    ...MARKDOWN_FILE_EXTENSIONS.map((extension) => `${normalizedBase}.${extension}`),
    `${normalizedBase}/index.md`,
  ]
}

function getDirectoryPath(path: string): string {
  const normalized = normalizeWorkspacePath(path)
  const separatorIndex = normalized.lastIndexOf('/')
  return separatorIndex === -1 ? '' : normalized.slice(0, separatorIndex)
}

function hasFileExtension(path: string): boolean {
  return /\.[A-Za-z\d]+$/u.test(path)
}

function workspacePathKey(path: string): string {
  const normalized = normalizeWorkspacePath(path)
  return /^[A-Za-z]:\//u.test(normalized) ? normalized.toLowerCase() : normalized
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
