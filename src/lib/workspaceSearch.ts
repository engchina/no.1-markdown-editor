import { ensureFsPathAccess } from './fsAccess.ts'
import { isSupportedDocumentName } from './fileTypes.ts'
import { findDocumentMatches, type DocumentSearchMatch } from './search.ts'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface WorkspaceSearchableTab {
  id: string
  name: string
  path: string | null
  content: string
}

export type WorkspaceDocumentMatchKind = 'exact-path' | 'exact-name' | 'path-suffix' | 'prefix' | 'contains'
export type WorkspaceDocumentConfidence = 'high' | 'medium' | 'low'

export interface WorkspaceSearchResult extends DocumentSearchMatch {
  id: string
  name: string
  path: string | null
  tabId: string | null
  source: 'tab' | 'workspace'
}

export interface WorkspaceDocumentReference {
  name: string
  path: string | null
  tabId: string | null
  source: 'tab' | 'workspace'
  content: string
  score: number
  matchKind: WorkspaceDocumentMatchKind
  confidence: WorkspaceDocumentConfidence
  ambiguous: boolean
}

interface WorkspaceDocumentCandidate {
  name: string
  path: string | null
  tabId: string | null
  source: 'tab' | 'workspace'
  content?: string
  score: number
  matchKind: WorkspaceDocumentMatchKind
  confidence?: WorkspaceDocumentConfidence
  ambiguous?: boolean
}

export async function buildWorkspaceSearchResults({
  query,
  tabs,
  rootPath,
  limit,
}: {
  query: string
  tabs: WorkspaceSearchableTab[]
  rootPath: string | null
  limit: number
}): Promise<WorkspaceSearchResult[]> {
  const results = searchOpenTabs(tabs, query, limit)
  if (!isTauri || !rootPath || results.length >= limit) return results

  const openTabPaths = new Set(
    tabs
      .map((tab) => tab.path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
  )

  const workspaceResults = await searchWorkspaceFiles(rootPath, query, limit - results.length, openTabPaths)
  return [...results, ...workspaceResults].slice(0, limit)
}

export function searchOpenTabs(
  tabs: WorkspaceSearchableTab[],
  query: string,
  limit: number
): WorkspaceSearchResult[] {
  const results: WorkspaceSearchResult[] = []

  for (const tab of tabs) {
    const matches = findDocumentMatches(tab.content, query, limit - results.length)
    for (const match of matches) {
      results.push({
        ...match,
        id: `tab:${tab.id}:${match.line}:${match.column}`,
        name: tab.name,
        path: tab.path,
        tabId: tab.id,
        source: 'tab',
      })
    }

    if (results.length >= limit) break
  }

  return results
}

export async function findWorkspaceDocumentReference({
  query,
  tabs,
  rootPath,
}: {
  query: string
  tabs: WorkspaceSearchableTab[]
  rootPath: string | null
}): Promise<WorkspaceDocumentReference | null> {
  const references = await findWorkspaceDocumentReferences({
    query,
    tabs,
    rootPath,
    limit: 1,
  })

  return references[0] ?? null
}

export async function findWorkspaceDocumentReferences({
  query,
  tabs,
  rootPath,
  limit,
  excludePaths = [],
}: {
  query: string
  tabs: WorkspaceSearchableTab[]
  rootPath: string | null
  limit: number
  excludePaths?: string[]
}): Promise<WorkspaceDocumentReference[]> {
  const normalizedQuery = normalizeLookupValue(query)
  if (!normalizedQuery || limit <= 0) return []

  const excluded = new Set(excludePaths.map(normalizeLookupValue))
  const openTabPaths = new Set(
    tabs
      .map((tab) => tab.path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
  )
  const openCandidates = findOpenTabDocumentCandidates(tabs, normalizedQuery, excluded)
  const workspaceCandidates =
    isTauri && rootPath
      ? await findWorkspaceDocumentCandidates(rootPath, normalizedQuery, openTabPaths, excluded, limit * 4)
      : []

  const mergedCandidates = annotateWorkspaceDocumentCandidates(
    mergeWorkspaceDocumentCandidates([...openCandidates, ...workspaceCandidates])
  ).slice(0, limit)

  if (mergedCandidates.length === 0) return []

  const references = await Promise.all(
    mergedCandidates.map(async (candidate) => {
      if (candidate.source === 'tab') {
        return {
          name: candidate.name,
          path: candidate.path,
          tabId: candidate.tabId,
          source: candidate.source,
          content: candidate.content ?? '',
          score: candidate.score,
          matchKind: candidate.matchKind,
          confidence: candidate.confidence ?? 'low',
          ambiguous: candidate.ambiguous === true,
        } satisfies WorkspaceDocumentReference
      }

      if (!candidate.path) return null

      const [{ readTextFile }] = await Promise.all([import('@tauri-apps/plugin-fs')])
      let content = ''
      try {
        content = await readTextFile(candidate.path)
      } catch {
        content = ''
      }
      if (!content) return null

      return {
        name: candidate.name,
        path: candidate.path,
        tabId: null,
        source: candidate.source,
        content,
        score: candidate.score,
        matchKind: candidate.matchKind,
        confidence: candidate.confidence ?? 'low',
        ambiguous: candidate.ambiguous === true,
      } satisfies WorkspaceDocumentReference
    })
  )

  const resolvedReferences: WorkspaceDocumentReference[] = []
  for (const reference of references) {
    if (reference) resolvedReferences.push(reference)
  }

  return resolvedReferences
}

async function searchWorkspaceFiles(
  rootPath: string,
  query: string,
  limit: number,
  excludedPaths: Set<string>
): Promise<WorkspaceSearchResult[]> {
  if (limit <= 0) return []

  await ensureFsPathAccess(rootPath, { kind: 'dir', recursive: true })

  const [{ readDir, readTextFile }, { join }] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
  ])

  const results: WorkspaceSearchResult[] = []
  const queue = [rootPath]

  while (queue.length > 0 && results.length < limit) {
    const currentDir = queue.shift()
    if (!currentDir) break

    let entries: Awaited<ReturnType<typeof readDir>>
    try {
      entries = await readDir(currentDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith('.')) continue

      const childPath = await join(currentDir, entry.name)
      if (entry.isDirectory) {
        queue.push(childPath)
        continue
      }

      if (!entry.isFile || !isSupportedDocumentName(entry.name) || excludedPaths.has(childPath)) {
        continue
      }

      let content = ''
      try {
        content = await readTextFile(childPath)
      } catch {
        continue
      }

      const matches = findDocumentMatches(content, query, limit - results.length)
      for (const match of matches) {
        results.push({
          ...match,
          id: `workspace:${childPath}:${match.line}:${match.column}`,
          name: entry.name,
          path: childPath,
          tabId: null,
          source: 'workspace',
        })
      }

      if (results.length >= limit) break
    }
  }

  return results
}

function findOpenTabDocumentCandidates(
  tabs: WorkspaceSearchableTab[],
  normalizedQuery: string,
  excluded: Set<string>
): WorkspaceDocumentCandidate[] {
  const candidates: WorkspaceDocumentCandidate[] = []

  for (const tab of tabs) {
    const exclusionKey = normalizeLookupValue(tab.path ?? tab.name)
    if (excluded.has(exclusionKey)) continue

    const match = scoreDocumentQuery(tab.name, tab.path, normalizedQuery)
    if (!match) continue

    candidates.push({
      name: tab.name,
      path: tab.path,
      tabId: tab.id,
      source: 'tab',
      content: tab.content,
      score: match.score,
      matchKind: match.matchKind,
    })
  }

  return candidates
}

async function findWorkspaceDocumentCandidates(
  rootPath: string,
  normalizedQuery: string,
  excludedOpenTabPaths: Set<string>,
  excluded: Set<string>,
  limit: number
): Promise<WorkspaceDocumentCandidate[]> {
  if (limit <= 0) return []

  await ensureFsPathAccess(rootPath, { kind: 'dir', recursive: true })

  const [{ readDir }, { join }] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
  ])

  const queue = [rootPath]
  const candidates: WorkspaceDocumentCandidate[] = []

  while (queue.length > 0) {
    const currentDir = queue.shift()
    if (!currentDir) break

    let entries: Awaited<ReturnType<typeof readDir>>
    try {
      entries = await readDir(currentDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.name || entry.name.startsWith('.')) continue

      const childPath = await join(currentDir, entry.name)
      if (entry.isDirectory) {
        queue.push(childPath)
        continue
      }

      if (!entry.isFile || !isSupportedDocumentName(entry.name) || excludedOpenTabPaths.has(childPath)) {
        continue
      }

      const exclusionKey = normalizeLookupValue(childPath)
      if (excluded.has(exclusionKey)) continue

      const match = scoreDocumentQuery(entry.name, childPath, normalizedQuery)
      if (!match) continue

      candidates.push({
        name: entry.name,
        path: childPath,
        tabId: null,
        source: 'workspace',
        score: match.score,
        matchKind: match.matchKind,
      })
    }
  }

  return mergeWorkspaceDocumentCandidates(candidates).slice(0, limit)
}

function mergeWorkspaceDocumentCandidates(
  candidates: WorkspaceDocumentCandidate[]
): WorkspaceDocumentCandidate[] {
  const merged = new Map<string, WorkspaceDocumentCandidate>()

  for (const candidate of candidates) {
    const key = candidate.path ? `path:${normalizeLookupValue(candidate.path)}` : `tab:${candidate.tabId ?? candidate.name}`
    const existing = merged.get(key)
    if (!existing || candidate.score > existing.score) {
      merged.set(key, candidate)
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score
    return (left.path ?? left.name).localeCompare(right.path ?? right.name)
  })
}

function annotateWorkspaceDocumentCandidates(
  candidates: WorkspaceDocumentCandidate[]
) {
  return candidates.map((candidate, index) => {
    const ambiguous = candidates.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.score === candidate.score &&
        other.matchKind === candidate.matchKind
    )

    return {
      ...candidate,
      ambiguous,
      confidence: resolveWorkspaceDocumentConfidence(candidate.matchKind, candidate.score, ambiguous),
    }
  })
}

function scoreDocumentQuery(
  name: string,
  path: string | null,
  normalizedQuery: string
): { score: number; matchKind: WorkspaceDocumentMatchKind } | null {
  const normalizedName = normalizeLookupValue(name)
  const normalizedPath = normalizeLookupValue(path ?? '')
  const normalizedStem = stripMarkdownExtension(normalizedName)
  const normalizedBaseName = normalizedPath.split('/').pop() ?? normalizedName
  const normalizedBaseStem = stripMarkdownExtension(normalizedBaseName)

  if (normalizedPath === normalizedQuery) return { score: Number.POSITIVE_INFINITY, matchKind: 'exact-path' }
  if (normalizedName === normalizedQuery) return { score: Number.POSITIVE_INFINITY, matchKind: 'exact-name' }
  if (normalizedBaseName === normalizedQuery || normalizedBaseStem === normalizedQuery || normalizedStem === normalizedQuery) {
    return { score: 1200, matchKind: 'exact-name' }
  }
  if (normalizedPath.endsWith(`/${normalizedQuery}`)) return { score: 1100, matchKind: 'path-suffix' }
  if (normalizedBaseName.startsWith(normalizedQuery) || normalizedBaseStem.startsWith(normalizedQuery)) {
    return { score: 900, matchKind: 'prefix' }
  }
  if (normalizedName.includes(normalizedQuery) || normalizedStem.includes(normalizedQuery)) {
    return { score: 720, matchKind: 'contains' }
  }
  if (normalizedPath.includes(normalizedQuery)) return { score: 560, matchKind: 'contains' }

  return null
}

function resolveWorkspaceDocumentConfidence(
  matchKind: WorkspaceDocumentMatchKind,
  score: number,
  ambiguous: boolean
): WorkspaceDocumentConfidence {
  let confidence: WorkspaceDocumentConfidence

  switch (matchKind) {
    case 'exact-path':
    case 'exact-name':
    case 'path-suffix':
      confidence = 'high'
      break
    case 'prefix':
      confidence = 'medium'
      break
    case 'contains':
    default:
      confidence = score >= 720 ? 'medium' : 'low'
      break
  }

  if (!ambiguous) return confidence
  if (confidence === 'high') return 'medium'
  return 'low'
}

function normalizeLookupValue(value: string): string {
  return value
    .trim()
    .replace(/\\/gu, '/')
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .toLowerCase()
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown|mdx|txt)$/iu, '')
}
