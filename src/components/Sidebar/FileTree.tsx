import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useFileTree, type FileNode } from '../../hooks/useFileTree'
import {
  findTreeNodeByPath,
  findTreePathInTree,
  getParentDirectoryPath,
  validateMoveDestination,
} from '../../lib/fileTreePaths'
import {
  flattenVisibleFileTree,
  getAdjacentVisibleTreePath,
  getFirstChildVisibleTreePath,
  getParentVisibleTreePath,
} from '../../lib/fileTreeNavigation'
import { pushErrorNotice } from '../../lib/notices'
import { useEditorStore } from '../../store/editor'
import { getOkfWorkspaceMode, useFileTreeStore } from '../../store/fileTree'
import { buildOkfBundleProfile, type OkfIssue, type OkfWorkspaceMode } from '../../lib/okf.ts'
import { useWorkspaceIndex } from '../../hooks/useWorkspaceIndex.ts'
import AppIcon from '../Icons/AppIcon'
import { useSidebarDocumentNavigation } from './sidebarShared.tsx'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
type FileTreeActionMode = 'newFile' | 'newFolder' | 'rename' | 'delete'
type FileTreeContextMenuState = { x: number; y: number; targetPath: string | null }

export default function FileTree() {
  const { t } = useTranslation()
  const {
    rootPath,
    tree,
    loading,
    openFolder,
    toggleDir,
    openFile,
    createFile,
    createFolder,
    renameNode,
    deleteNode,
    moveNode,
  } = useFileTree()
  const { tabs, activeTabId } = useEditorStore()
  const okfWorkspaceModes = useFileTreeStore((state) => state.okfWorkspaceModes)
  const setOkfWorkspaceMode = useFileTreeStore((state) => state.setOkfWorkspaceMode)
  const { openDocumentLocation } = useSidebarDocumentNavigation()
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const { snapshot: workspaceSnapshot } = useWorkspaceIndex({
    path: activeTab?.path ?? null,
    content: activeTab?.content ?? '',
  })
  const okfMode = getOkfWorkspaceMode(okfWorkspaceModes, rootPath)
  const okfProfile = useMemo(
    () => buildOkfBundleProfile(workspaceSnapshot, okfMode),
    [okfMode, workspaceSnapshot]
  )
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [okfOpen, setOkfOpen] = useState(false)
  const [actionMode, setActionMode] = useState<FileTreeActionMode | null>(null)
  const [actionValue, setActionValue] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [contextMenu, setContextMenu] = useState<FileTreeContextMenuState | null>(null)
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [rootDropActive, setRootDropActive] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const okfPanelRef = useRef<HTMLDivElement>(null)
  const okfButtonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())
  const dragExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeFilePath = activeTab?.path ?? null
  const selectedNode = useMemo(() => findTreeNodeByPath(tree, selectedPath), [selectedPath, tree])
  const selectedPathInTree = useMemo(() => findTreePathInTree(tree, selectedPath), [selectedPath, tree])
  const visibleNodes = useMemo(() => flattenVisibleFileTree(tree), [tree])
  const draggedNode = useMemo(() => findTreeNodeByPath(tree, draggedPath), [draggedPath, tree])
  const contextTargetNode = useMemo(
    () => findTreeNodeByPath(tree, contextMenu?.targetPath ?? null),
    [contextMenu?.targetPath, tree]
  )
  const focusablePath = selectedPath ?? activeFilePath ?? visibleNodes[0]?.path ?? null
  const okfIssueCounts = useMemo(() => {
    const counts = new Map<string, { errors: number; suggestions: number }>()
    for (const issue of okfProfile.issues) {
      const key = normalizeFileTreePath(issue.path)
      const current = counts.get(key) ?? { errors: 0, suggestions: 0 }
      if (issue.severity === 'error') current.errors += 1
      else current.suggestions += 1
      counts.set(key, current)
    }
    return counts
  }, [okfProfile.issues])

  useEffect(() => {
    if (selectedPath && !selectedNode) {
      setSelectedPath(null)
    }
  }, [selectedNode, selectedPath])

  useEffect(() => {
    setSelectedPath(null)
    setOkfOpen(false)
    setActionMode(null)
    setActionError(null)
    setContextMenu(null)
    setDraggedPath(null)
    setDropTargetPath(null)
    setRootDropActive(false)
  }, [rootPath])

  useEffect(() => {
    if (!okfOpen) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && (okfPanelRef.current?.contains(target) || okfButtonRef.current?.contains(target))) return
      setOkfOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOkfOpen(false)
      okfButtonRef.current?.focus()
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', closeWithEscape)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', closeWithEscape)
    }
  }, [okfOpen])

  useEffect(() => {
    if (!actionMode || actionMode === 'delete') return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [actionMode])

  const canCreate = Boolean(rootPath)
  const canRenameOrDelete = Boolean(selectedNode)

  const openAction = (mode: FileTreeActionMode) => {
    setActionError(null)
    setActionBusy(false)
    setContextMenu(null)
    setActionMode(mode)

    if (mode === 'rename' && selectedNode) {
      setActionValue(selectedNode.name)
      return
    }

    if (mode === 'newFile') {
      setActionValue(t('fileTree.defaultFileName'))
      return
    }

    if (mode === 'newFolder') {
      setActionValue(t('fileTree.defaultFolderName'))
      return
    }

    setActionValue('')
  }

  const closeAction = () => {
    if (actionBusy) return
    setActionMode(null)
    setActionError(null)
  }

  useEffect(() => {
    if (!contextMenu) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target && rootRef.current?.contains(target)) return
      setContextMenu(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    window.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', () => setContextMenu(null), { once: true })
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu])

  const clearDragState = () => {
    setDraggedPath(null)
    setDropTargetPath(null)
    setRootDropActive(false)
    if (dragExpandTimerRef.current) {
      clearTimeout(dragExpandTimerRef.current)
      dragExpandTimerRef.current = null
    }
  }

  const resolveCreateDirectory = () => {
    if (!rootPath) return null
    if (!selectedNode) return rootPath
    return selectedNode.type === 'dir' ? selectedNode.path : getParentDirectoryPath(selectedNode.path)
  }

  const onSubmitAction = async () => {
    if (!actionMode) return

    setActionBusy(true)
    setActionError(null)

    try {
      if (actionMode === 'newFile') {
        const parentDir = resolveCreateDirectory()
        if (!parentDir) return
        const result = await createFile(parentDir, actionValue)
        if (!result.ok) {
          setActionError(t(`fileTree.validation.${result.reason}`))
          return
        }
        setSelectedPath(result.path)
        closeAction()
        return
      }

      if (actionMode === 'newFolder') {
        const parentDir = resolveCreateDirectory()
        if (!parentDir) return
        const result = await createFolder(parentDir, actionValue)
        if (!result.ok) {
          setActionError(t(`fileTree.validation.${result.reason}`))
          return
        }
        setSelectedPath(result.path)
        closeAction()
        return
      }

      if (actionMode === 'rename' && selectedNode) {
        const result = await renameNode(selectedNode, actionValue)
        if (!result.ok) {
          setActionError(t(`fileTree.validation.${result.reason}`))
          return
        }
        setSelectedPath(result.path)
        closeAction()
        return
      }

      if (actionMode === 'delete' && selectedNode) {
        const deleted = await deleteNode(selectedNode)
        if (!deleted) {
          setActionError(t('fileTree.validation.unknown'))
          return
        }
        setSelectedPath(null)
        closeAction()
      }
    } finally {
      setActionBusy(false)
    }
  }

  const focusPath = (path: string | null) => {
    if (!path) return
    const button = buttonRefs.current.get(path)
    button?.focus()
  }

  const selectAndFocusPath = (path: string | null) => {
    if (!path) return
    setSelectedPath(path)
    queueMicrotask(() => focusPath(path))
  }

  const openContextMenu = (x: number, y: number, targetPath: string | null) => {
    clearDragState()
    setSelectedPath(targetPath)
    setContextMenu({
      x: Math.min(x, window.innerWidth - 220),
      y: Math.min(y, window.innerHeight - 220),
      targetPath,
    })
  }

  const openContextMenuForKeyboard = () => {
    const targetPath = selectedPath ?? focusablePath
    if (!targetPath) return
    const button = buttonRefs.current.get(targetPath)
    const rect = button?.getBoundingClientRect()
    openContextMenu(rect ? rect.left + 12 : 160, rect ? rect.bottom + 6 : 160, targetPath)
  }

  const onTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (actionMode) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectAndFocusPath(getAdjacentVisibleTreePath(visibleNodes, selectedPath ?? focusablePath, 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectAndFocusPath(getAdjacentVisibleTreePath(visibleNodes, selectedPath ?? focusablePath, -1))
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (selectedNode?.type === 'dir' && selectedPathInTree) {
        if (!selectedNode.expanded) {
          void toggleDir(selectedNode, selectedPathInTree)
        } else {
          selectAndFocusPath(getFirstChildVisibleTreePath(visibleNodes, selectedNode.path))
        }
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (selectedNode?.type === 'dir' && selectedNode.expanded && selectedPathInTree) {
        void toggleDir(selectedNode, selectedPathInTree)
      } else {
        selectAndFocusPath(getParentVisibleTreePath(visibleNodes, selectedPath ?? focusablePath))
      }
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (!selectedNode) return
      event.preventDefault()
      if (selectedNode.type === 'dir' && selectedPathInTree) {
        void toggleDir(selectedNode, selectedPathInTree)
      } else {
        void openFile(selectedNode)
      }
      return
    }

    if (event.key === 'F2' && canRenameOrDelete) {
      event.preventDefault()
      openAction('rename')
      return
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && canRenameOrDelete) {
      event.preventDefault()
      openAction('delete')
      return
    }

    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      openContextMenuForKeyboard()
    }
  }

  const contextParentDirectory = (() => {
    if (!rootPath) return null
    if (!contextTargetNode) return rootPath
    return contextTargetNode.type === 'dir'
      ? contextTargetNode.path
      : getParentDirectoryPath(contextTargetNode.path)
  })()

  const moveIntoDirectory = async (targetDirectoryPath: string) => {
    if (!draggedNode) return
    const result = await moveNode(draggedNode, targetDirectoryPath)
    if (!result.ok) {
      if (result.reason !== 'same' && result.reason !== 'descendant') {
        pushErrorNotice('notices.fileTreeMoveErrorTitle', `fileTree.validation.${result.reason}`)
      }
      clearDragState()
      return
    }

    setSelectedPath(result.path)
    clearDragState()
    setTimeout(() => {
      buttonRefs.current.get(result.path)?.focus()
    }, 0)
  }

  if (!isTauri) {
    return (
      <div className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <p>{t('sidebar.desktopOnly')}</p>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {rootPath ? rootPath.split(/[\\/]/).pop() : t('sidebar.files')}
          </span>
          {rootPath && (
            <button
              ref={okfButtonRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={okfOpen}
              onClick={() => setOkfOpen((open) => !open)}
              title={t('okf.statusTitle', {
                source: t(`okf.source.${okfProfile.source}`),
                errors: okfProfile.errorCount,
                suggestions: okfProfile.suggestionCount,
              })}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{
                color: okfProfile.enabled ? 'var(--accent)' : 'var(--text-muted)',
                background: okfProfile.enabled
                  ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-primary))'
                  : 'var(--bg-tertiary)',
              }}
            >
              <span>{okfProfile.enabled ? `OKF ${okfProfile.version ?? '0.1'}` : 'OKF'}</span>
              {okfProfile.enabled && okfProfile.issues.length > 0 && (
                <span aria-label={t('okf.issueCount', { count: okfProfile.issues.length })}>
                  {okfProfile.issues.length}
                </span>
              )}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => { void openFolder() }}
          title={t('sidebar.openFolder')}
          className="text-xs rounded px-1.5 py-0.5 transition-colors"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}
        >
          {t('sidebar.openFolder')}
        </button>
      </div>

      {okfOpen && rootPath && (
        <div
          ref={okfPanelRef}
          role="dialog"
          aria-label={t('okf.panelTitle')}
          className="absolute left-2 right-2 top-9 z-50 overflow-hidden rounded-lg border shadow-xl"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('okf.panelTitle')}</p>
                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {t(`okf.source.${okfProfile.source}`)}
                </p>
              </div>
              {okfProfile.enabled && (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {t('okf.summary', { errors: okfProfile.errorCount, suggestions: okfProfile.suggestionCount })}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1" role="radiogroup" aria-label={t('okf.modeLabel')}>
              {(['auto', 'enabled', 'disabled'] as OkfWorkspaceMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={okfMode === mode}
                  onClick={() => setOkfWorkspaceMode(rootPath, mode)}
                  className="rounded px-2 py-1 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    color: okfMode === mode ? 'var(--accent)' : 'var(--text-secondary)',
                    background: okfMode === mode
                      ? 'color-mix(in srgb, var(--accent) 13%, var(--bg-secondary))'
                      : 'var(--bg-secondary)',
                  }}
                >
                  {t(`okf.mode.${mode}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {!okfProfile.enabled && (
              <p className="px-1 py-3 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {t('okf.disabledHint')}
              </p>
            )}
            {okfProfile.enabled && okfProfile.issues.length === 0 && (
              <p className="px-1 py-3 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {t('okf.noIssues')}
              </p>
            )}
            {okfProfile.enabled && okfProfile.issues.map((issue) => (
              <OkfIssueButton
                key={`${issue.path}:${issue.line}:${issue.code}`}
                issue={issue}
                label={t(`okf.issue.${issue.code}`, { defaultValue: issue.message })}
                onClick={() => {
                  setOkfOpen(false)
                  void openDocumentLocation(issue.path, issue.line, 1)
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div
        className="flex items-center gap-1 px-2 py-2"
        style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 72%, transparent)' }}
      >
        <FileTreeActionButton
          icon="filePlus"
          label={t('fileTree.newFile')}
          onClick={() => openAction('newFile')}
          disabled={!canCreate}
        />
        <FileTreeActionButton
          icon="folderPlus"
          label={t('fileTree.newFolder')}
          onClick={() => openAction('newFolder')}
          disabled={!canCreate}
        />
        <FileTreeActionButton
          icon="edit"
          label={t('fileTree.rename')}
          onClick={() => openAction('rename')}
          disabled={!canRenameOrDelete}
        />
        <FileTreeActionButton
          icon="trash"
          label={t('fileTree.delete')}
          onClick={() => openAction('delete')}
          disabled={!canRenameOrDelete}
          danger
        />
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {selectedNode ? selectedNode.name : t('fileTree.noSelection')}
          </p>
        </div>
      </div>

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto py-1"
        role="tree"
        aria-label={t('sidebar.files')}
        onKeyDown={onTreeKeyDown}
        onDragOver={(event) => {
          if (!draggedNode || !rootPath) return
          const target = event.target as HTMLElement | null
          if (target?.closest('[data-file-tree-node="true"]')) return

          const moveValidation = validateMoveDestination(draggedNode, rootPath)
          if (moveValidation === 'same' || moveValidation === 'descendant') {
            event.dataTransfer.dropEffect = 'none'
            return
          }

          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setRootDropActive(true)
          setDropTargetPath(null)
        }}
        onDragLeave={(event) => {
          if (event.target === event.currentTarget) {
            setRootDropActive(false)
          }
        }}
        onDrop={(event) => {
          if (!draggedNode || !rootPath) return
          const target = event.target as HTMLElement | null
          if (target?.closest('[data-file-tree-node="true"]')) return

          event.preventDefault()
          void moveIntoDirectory(rootPath)
        }}
        onContextMenu={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault()
            openContextMenu(event.clientX, event.clientY, null)
          }
        }}
      >
        {loading && (
          <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{t('sidebar.loading')}</div>
        )}
        {!rootPath && !loading && (
          <div className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            <p>{t('sidebar.noFiles')}</p>
            <button
              type="button"
              onClick={() => { void openFolder() }}
              className="mt-2 px-3 py-1 rounded text-xs transition-colors"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {t('sidebar.openFolder')}
            </button>
          </div>
        )}
        {tree.map((node, idx) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            pathInTree={[idx]}
            onToggle={toggleDir}
            onOpen={openFile}
            activeFilePath={activeFilePath}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            focusablePath={focusablePath}
            buttonRefs={buttonRefs}
            onContextMenu={openContextMenu}
            draggedNode={draggedNode}
            draggedPath={draggedPath}
            dropTargetPath={dropTargetPath}
            onDragStart={(path) => {
              setContextMenu(null)
              setDraggedPath(path)
              setSelectedPath(path)
            }}
            onDragEnd={clearDragState}
            onMoveToDirectory={moveIntoDirectory}
            onDropTargetChange={(path) => {
              setDropTargetPath(path)
              setRootDropActive(false)
            }}
            dragExpandTimerRef={dragExpandTimerRef}
            okfIssueCounts={okfIssueCounts}
          />
        ))}
      </div>

      {actionMode && (
        <FileTreeDialog
          mode={actionMode}
          busy={actionBusy}
          error={actionError}
          inputRef={inputRef}
          name={actionValue}
          targetName={selectedNode?.name ?? ''}
          onCancel={closeAction}
          onConfirm={() => { void onSubmitAction() }}
          onNameChange={setActionValue}
        />
      )}

      {contextMenu && (
        <FileTreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canCreate={Boolean(contextParentDirectory)}
          canRenameOrDelete={Boolean(contextTargetNode)}
          onClose={() => setContextMenu(null)}
          onNewFile={() => {
            if (!contextParentDirectory) return
            setSelectedPath(contextTargetNode?.path ?? null)
            openAction('newFile')
          }}
          onNewFolder={() => {
            if (!contextParentDirectory) return
            setSelectedPath(contextTargetNode?.path ?? null)
            openAction('newFolder')
          }}
          onRename={() => {
            if (!contextTargetNode) return
            setSelectedPath(contextTargetNode.path)
            openAction('rename')
          }}
          onDelete={() => {
            if (!contextTargetNode) return
            setSelectedPath(contextTargetNode.path)
            openAction('delete')
          }}
          onOpenFolder={() => { void openFolder() }}
        />
      )}

      {rootDropActive && (
        <div
          className="pointer-events-none absolute inset-x-3 bottom-3 z-10 rounded-xl border px-3 py-2 text-[11px] font-medium"
          style={{
            borderColor: 'color-mix(in srgb, var(--accent) 48%, transparent)',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            color: 'var(--accent)',
          }}
        >
          {t('fileTree.dropToRoot')}
        </div>
      )}
    </div>
  )
}

function OkfIssueButton({
  issue,
  label,
  onClick,
}: {
  issue: OkfIssue
  label: string
  onClick: () => void
}) {
  const isError = issue.severity === 'error'
  const fileName = issue.path.split(/[\\/]/u).pop() ?? issue.path
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 flex w-full gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
      style={{ background: 'var(--bg-secondary)' }}
    >
      <span
        className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ background: isError ? 'var(--danger, #ef4444)' : 'var(--warning, #d97706)' }}
      />
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          {fileName}:{issue.line}
        </span>
        <span className="block text-[10px] leading-4" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </span>
    </button>
  )
}

function normalizeFileTreePath(path: string): string {
  const normalized = path.replace(/\\/gu, '/').replace(/\/+$/u, '')
  return /^[A-Za-z]:\//u.test(normalized) ? normalized.toLowerCase() : normalized
}

function FileTreeActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: 'filePlus' | 'folderPlus' | 'edit' | 'trash'
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        color: danger ? '#ef4444' : 'var(--text-secondary)',
        background: 'var(--bg-tertiary)',
        border: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
      }}
    >
      <AppIcon name={icon} size={15} />
    </button>
  )
}

interface TreeNodeProps {
  node: FileNode
  depth: number
  pathInTree: number[]
  onToggle: (node: FileNode, path: number[]) => void
  onOpen: (node: FileNode) => void
  activeFilePath: string | null
  selectedPath: string | null
  onSelect: (path: string) => void
  focusablePath: string | null
  buttonRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  onContextMenu: (x: number, y: number, targetPath: string | null) => void
  draggedNode: FileNode | null
  draggedPath: string | null
  dropTargetPath: string | null
  onDragStart: (path: string) => void
  onDragEnd: () => void
  onMoveToDirectory: (targetDirectoryPath: string) => Promise<void>
  onDropTargetChange: (path: string | null) => void
  dragExpandTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  okfIssueCounts: Map<string, { errors: number; suggestions: number }>
}

function TreeNode({
  node,
  depth,
  pathInTree,
  onToggle,
  onOpen,
  activeFilePath,
  selectedPath,
  onSelect,
  focusablePath,
  buttonRefs,
  onContextMenu,
  draggedNode,
  draggedPath,
  dropTargetPath,
  onDragStart,
  onDragEnd,
  onMoveToDirectory,
  onDropTargetChange,
  dragExpandTimerRef,
  okfIssueCounts,
}: TreeNodeProps) {
  const { t } = useTranslation()
  const isActive = node.type === 'file' && node.path === activeFilePath
  const isSelected = node.path === selectedPath
  const isDragged = node.path === draggedPath
  const isDropTarget = node.path === dropTargetPath
  const indentPx = 12 + depth * 14
  const okfCounts = okfIssueCounts.get(normalizeFileTreePath(node.path))
  const okfCount = okfCounts ? okfCounts.errors + okfCounts.suggestions : 0

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-expanded={node.type === 'dir' ? node.expanded : undefined}
        aria-current={isActive ? 'true' : undefined}
        data-file-tree-node="true"
        tabIndex={node.path === focusablePath ? 0 : -1}
        draggable={draggedPath === null || isDragged}
        ref={(element) => {
          if (element) {
            buttonRefs.current.set(node.path, element)
          } else {
            buttonRefs.current.delete(node.path)
          }
        }}
        className="mx-1 flex w-full items-center gap-1 rounded py-0.5 text-left transition-colors"
        style={{
          paddingLeft: `${indentPx}px`,
          paddingRight: '8px',
          background: isActive
            ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
            : isSelected
              ? 'color-mix(in srgb, var(--bg-tertiary) 88%, transparent)'
              : 'transparent',
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
          boxShadow: isDropTarget
            ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 44%, transparent)'
            : isSelected
              ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent)'
              : 'none',
          opacity: isDragged ? 0.56 : 1,
        }}
        onClick={() => {
          onSelect(node.path)
          if (node.type === 'dir') onToggle(node, pathInTree)
          else onOpen(node)
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', node.path)
          onDragStart(node.path)
        }}
        onDragEnd={() => {
          onDragEnd()
        }}
        onDragOver={(event) => {
          if (!draggedNode || draggedNode.path === node.path || node.type !== 'dir') return

          const moveValidation = validateMoveDestination(draggedNode, node.path)
          if (moveValidation === 'same' || moveValidation === 'descendant') {
            event.dataTransfer.dropEffect = 'none'
            return
          }

          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          onDropTargetChange(node.path)

          if (!node.expanded && dragExpandTimerRef.current === null) {
            dragExpandTimerRef.current = setTimeout(() => {
              dragExpandTimerRef.current = null
              void onToggle(node, pathInTree)
            }, 720)
          }
        }}
        onDragLeave={(event) => {
          const relatedTarget = event.relatedTarget as Node | null
          if (relatedTarget && event.currentTarget.contains(relatedTarget)) return
          if (dropTargetPath === node.path) {
            onDropTargetChange(null)
          }
          if (dragExpandTimerRef.current) {
            clearTimeout(dragExpandTimerRef.current)
            dragExpandTimerRef.current = null
          }
        }}
        onDrop={(event) => {
          if (!draggedNode || draggedNode.path === node.path || node.type !== 'dir') return

          const moveValidation = validateMoveDestination(draggedNode, node.path)
          if (moveValidation === 'same' || moveValidation === 'descendant') return

          event.preventDefault()
          event.stopPropagation()
          void onMoveToDirectory(node.path)
        }}
        onFocus={() => {
          onSelect(node.path)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onContextMenu(event.clientX, event.clientY, node.path)
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isActive
            ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
            : 'transparent'
        }}
      >
        {node.type === 'dir' ? (
          <span className="flex items-center justify-center" style={{ minWidth: '14px', color: 'var(--text-muted)' }}>
            <AppIcon name={node.expanded ? 'chevronDown' : 'chevronRight'} size={12} />
          </span>
        ) : (
          <span className="text-xs" style={{ minWidth: '14px', opacity: 0 }}>·</span>
        )}
        <span className="flex items-center justify-center" style={{ marginRight: '4px', color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
          <AppIcon
            name={node.type === 'dir' ? (node.expanded ? 'folderOpen' : 'folder') : 'file'}
            size={14}
          />
        </span>
        <span
          className="min-w-0 flex-1 truncate text-xs"
          style={{ fontWeight: node.type === 'dir' ? 500 : 400 }}
        >
          {node.name}
        </span>
        {node.type === 'file' && okfCount > 0 && (
          <span
            className="ml-auto rounded-full px-1.5 text-[9px] font-semibold"
            style={{
              color: okfCounts?.errors ? 'var(--danger, #ef4444)' : 'var(--warning, #d97706)',
              background: okfCounts?.errors
                ? 'color-mix(in srgb, var(--danger, #ef4444) 12%, transparent)'
                : 'color-mix(in srgb, var(--warning, #d97706) 12%, transparent)',
            }}
          >
            {okfCount}
          </span>
        )}
      </button>

      {/* Children */}
      {node.type === 'dir' && node.expanded && node.children && (
        <>
          {node.children.length === 0 && (
            <div
              className="text-xs py-0.5"
              style={{ paddingLeft: `${indentPx + 28}px`, color: 'var(--text-muted)' }}
            >
              {t('sidebar.emptyFolder')}
            </div>
          )}
          {node.children.map((child, i) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              pathInTree={[...pathInTree, i]}
              onToggle={onToggle}
              onOpen={onOpen}
              activeFilePath={activeFilePath}
              selectedPath={selectedPath}
              onSelect={onSelect}
              focusablePath={focusablePath}
              buttonRefs={buttonRefs}
              onContextMenu={onContextMenu}
              draggedNode={draggedNode}
              draggedPath={draggedPath}
              dropTargetPath={dropTargetPath}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMoveToDirectory={onMoveToDirectory}
              onDropTargetChange={onDropTargetChange}
              dragExpandTimerRef={dragExpandTimerRef}
              okfIssueCounts={okfIssueCounts}
            />
          ))}
        </>
      )}
    </>
  )
}

function FileTreeContextMenu({
  x,
  y,
  canCreate,
  canRenameOrDelete,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onOpenFolder,
}: {
  x: number
  y: number
  canCreate: boolean
  canRenameOrDelete: boolean
  onClose: () => void
  onNewFile: () => void
  onNewFolder: () => void
  onRename: () => void
  onDelete: () => void
  onOpenFolder: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      role="menu"
      aria-label={t('sidebar.files')}
      className="glass-panel fixed z-[70] min-w-[196px] overflow-hidden rounded-xl p-1.5 shadow-xl"
      style={{
        top: y,
        left: x,
        background: 'color-mix(in srgb, var(--bg-primary) 94%, transparent)',
        borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)',
      }}
    >
      <ContextMenuItem icon="filePlus" label={t('fileTree.newFile')} onClick={() => { onClose(); onNewFile() }} disabled={!canCreate} />
      <ContextMenuItem icon="folderPlus" label={t('fileTree.newFolder')} onClick={() => { onClose(); onNewFolder() }} disabled={!canCreate} />
      <ContextMenuItem icon="edit" label={t('fileTree.rename')} onClick={() => { onClose(); onRename() }} disabled={!canRenameOrDelete} />
      <ContextMenuItem icon="trash" label={t('fileTree.delete')} onClick={() => { onClose(); onDelete() }} disabled={!canRenameOrDelete} danger />
      <div className="my-1 h-px" style={{ background: 'color-mix(in srgb, var(--border) 78%, transparent)' }} />
      <ContextMenuItem icon="folderOpen" label={t('sidebar.openFolder')} onClick={() => { onClose(); onOpenFolder() }} />
    </div>
  )
}

function ContextMenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: 'filePlus' | 'folderPlus' | 'edit' | 'trash' | 'folderOpen'
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        color: danger ? '#ef4444' : 'var(--text-secondary)',
      }}
      onClick={onClick}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--bg-tertiary)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent'
      }}
      disabled={disabled}
    >
      <AppIcon name={icon} size={15} />
      <span>{label}</span>
    </button>
  )
}

function FileTreeDialog({
  mode,
  busy,
  error,
  inputRef,
  name,
  targetName,
  onCancel,
  onConfirm,
  onNameChange,
}: {
  mode: FileTreeActionMode
  busy: boolean
  error: string | null
  inputRef: RefObject<HTMLInputElement>
  name: string
  targetName: string
  onCancel: () => void
  onConfirm: () => void
  onNameChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const isDelete = mode === 'delete'
  const title =
    mode === 'newFile'
      ? t('fileTree.createFileTitle')
      : mode === 'newFolder'
        ? t('fileTree.createFolderTitle')
        : mode === 'rename'
          ? t('fileTree.renameTitle')
          : t('fileTree.deleteTitle')
  const confirmLabel =
    mode === 'newFile'
      ? t('fileTree.createFileAction')
      : mode === 'newFolder'
        ? t('fileTree.createFolderAction')
        : mode === 'rename'
          ? t('fileTree.renameAction')
          : t('fileTree.deleteAction')

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-3"
      style={{ background: 'color-mix(in srgb, var(--bg-primary) 45%, transparent)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-panel w-full max-w-xs rounded-2xl p-4 shadow-xl"
        style={{
          background: 'color-mix(in srgb, var(--bg-primary) 94%, transparent)',
          borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)',
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
          if (!isDelete && event.key === 'Enter') {
            event.preventDefault()
            onConfirm()
          }
        }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </p>
        {!isDelete ? (
          <div className="mt-3 flex flex-col gap-2">
            <label htmlFor="file-tree-action-name" className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {t('fileTree.nameLabel')}
            </label>
            <input
              id="file-tree-action-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
              }}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            {t('fileTree.deleteMessage', { name: targetName })}
          </p>
        )}
        {error && (
          <p className="mt-3 text-xs" role="alert" style={{ color: '#ef4444' }}>
            {error}
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-45"
            style={{
              color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)',
              border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
            }}
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-45"
            style={{
              color: 'white',
              background: isDelete ? '#dc2626' : 'var(--accent)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
