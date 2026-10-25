import { openDesktopDocumentPath } from './desktopFileOpen.ts'
import { pushInfoNotice } from './notices.ts'
import { slugifyHeading } from './outline.ts'
import { normalizeWorkspacePath, resolveWorkspaceDocumentLink } from './workspaceLinks.ts'
import type { WorkspaceIndexSnapshot } from './workspaceIndex/types.ts'
import { useEditorStore } from '../store/editor.ts'

export type WorkspaceNavigationResult = 'opened' | 'anchor' | 'broken' | 'external'

export async function openWorkspaceDocumentHref(options: {
  href: string
  rootPath: string
  documentPath: string
  snapshot: WorkspaceIndexSnapshot
  warnOnBroken?: boolean
}): Promise<WorkspaceNavigationResult> {
  const resolution = resolveWorkspaceDocumentLink(
    options.rootPath,
    options.documentPath,
    options.href,
    options.snapshot.documents.map((document) => document.path)
  )
  if (resolution.kind === 'external') return 'external'
  if (resolution.kind === 'broken' || resolution.kind === 'outside-workspace') {
    if (options.warnOnBroken !== false) {
      pushInfoNotice('notices.workspaceLinkUnavailableTitle', 'notices.workspaceLinkUnavailableMessage', {
        values: { target: options.href },
      })
    }
    return 'broken'
  }

  const targetPath = resolution.kind === 'anchor'
    ? normalizeWorkspacePath(options.documentPath)
    : resolution.path
  if (!targetPath) return 'broken'

  const targetDocument = options.snapshot.documents.find(
    (document) => pathKey(document.path) === pathKey(targetPath)
  )
  const line = resolveAnchorLine(targetDocument, resolution.anchor)
  const editor = useEditorStore.getState()
  let targetTab = editor.tabs.find((tab) => tab.path && pathKey(tab.path) === pathKey(targetPath))

  if (!targetTab) {
    const opened = await openDesktopDocumentPath(targetPath)
    if (!opened) return 'broken'
    targetTab = useEditorStore.getState().tabs.find((tab) => tab.path && pathKey(tab.path) === pathKey(targetPath))
  } else if (editor.activeTabId !== targetTab.id) {
    editor.setActiveTab(targetTab.id)
  }

  if (targetTab && line !== null) {
    useEditorStore.getState().setPendingNavigation({
      tabId: targetTab.id,
      line,
      column: 1,
      align: 'start',
    })
  }
  return resolution.kind === 'anchor' ? 'anchor' : 'opened'
}

function resolveAnchorLine(
  document: WorkspaceIndexSnapshot['documents'][number] | undefined,
  anchor: string | null
): number | null {
  if (!document || !anchor) return null
  const normalizedAnchor = normalizeAnchor(anchor)
  const heading = document.headings.find((entry) =>
    entry.id.toLowerCase() === normalizedAnchor
    || slugifyHeading(entry.text) === normalizedAnchor
    || entry.text.trim().toLowerCase() === normalizedAnchor
  )
  return heading?.line ?? null
}

function normalizeAnchor(anchor: string): string {
  try {
    return decodeURIComponent(anchor).trim().replace(/^#/u, '').toLowerCase()
  } catch {
    return anchor.trim().replace(/^#/u, '').toLowerCase()
  }
}

function pathKey(path: string): string {
  const normalized = normalizeWorkspacePath(path)
  return /^[A-Za-z]:\//u.test(normalized) ? normalized.toLowerCase() : normalized
}
