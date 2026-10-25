import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OkfWorkspaceMode } from '../lib/okf.ts'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
  expanded?: boolean
}

interface FileTreeState {
  rootPath: string | null
  tree: FileNode[]
  loading: boolean
  okfWorkspaceModes: Record<string, OkfWorkspaceMode>
  setRootPath: (path: string | null) => void
  setTree: (tree: FileNode[]) => void
  setLoading: (loading: boolean) => void
  setOkfWorkspaceMode: (rootPath: string, mode: OkfWorkspaceMode) => void
}

export const useFileTreeStore = create<FileTreeState>()(
  persist(
    (set) => ({
      rootPath: null,
      tree: [],
      loading: false,
      okfWorkspaceModes: {},
      setRootPath: (rootPath) => set({ rootPath }),
      setTree: (tree) => set({ tree }),
      setLoading: (loading) => set({ loading }),
      setOkfWorkspaceMode: (rootPath, mode) => set((state) => ({
        okfWorkspaceModes: {
          ...state.okfWorkspaceModes,
          [normalizeWorkspaceModeKey(rootPath)]: mode,
        },
      })),
    }),
    {
      name: 'file-tree',
      partialize: (state) => ({
        rootPath: state.rootPath,
        okfWorkspaceModes: state.okfWorkspaceModes,
      }),
    }
  )
)

export function getOkfWorkspaceMode(
  modes: Record<string, OkfWorkspaceMode>,
  rootPath: string | null | undefined
): OkfWorkspaceMode {
  if (!rootPath) return 'auto'
  return modes[normalizeWorkspaceModeKey(rootPath)] ?? 'auto'
}

function normalizeWorkspaceModeKey(path: string): string {
  const normalized = path.replace(/\\/gu, '/').replace(/\/+$/u, '')
  return /^[A-Za-z]:\//u.test(normalized) ? normalized.toLowerCase() : normalized
}
