import { useState, useCallback } from 'react'
import { useEditorStore } from '../store/editor'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
  expanded?: boolean
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function readDirTauri(dirPath: string): Promise<FileNode[]> {
  const { readDir } = await import('@tauri-apps/plugin-fs')
  const entries = await readDir(dirPath)
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue
    const childPath = `${dirPath}/${entry.name}`
    // In Tauri v2 fs plugin, directories don't have a `children` field in readDir results
    // We check if the name has no extension to guess it's a directory, or use isDirectory
    const isDir = !entry.name.includes('.') || ('isDirectory' in entry && (entry as { isDirectory: boolean }).isDirectory)
    if (isDir) {
      nodes.push({ name: entry.name, path: childPath, type: 'dir', children: undefined, expanded: false })
    } else {
      if (/\.(md|markdown|txt|mdx)$/i.test(entry.name)) {
        nodes.push({ name: entry.name, path: childPath, type: 'file' })
      }
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function useFileTree() {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const { addTab } = useEditorStore()

  const openFolder = useCallback(async () => {
    if (!isTauri) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== 'string') return

      setLoading(true)
      setRootPath(selected)
      const nodes = await readDirTauri(selected)
      setTree(nodes)
    } catch (e) {
      console.error('Open folder error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleDir = useCallback(async (node: FileNode, pathInTree: number[]) => {
    if (!isTauri) return

    setTree((prev) => {
      const next = structuredClone(prev)
      let target = next
      let found: FileNode | null = null
      for (let i = 0; i < pathInTree.length; i++) {
        const idx = pathInTree[i]
        if (i === pathInTree.length - 1) {
          found = target[idx]
        } else {
          target = target[idx].children ?? []
        }
      }
      if (!found) return prev

      if (!found.expanded && !found.children) {
        // Load children lazily — mark as loading
        found.expanded = true
        found.children = []
      } else {
        found.expanded = !found.expanded
      }
      return next
    })

    // Actually load children
    if (!node.expanded && !node.children?.length) {
      try {
        const children = await readDirTauri(node.path)
        setTree((prev) => {
          const next = structuredClone(prev)
          let target = next
          let found: FileNode | null = null
          for (let i = 0; i < pathInTree.length; i++) {
            const idx = pathInTree[i]
            if (i === pathInTree.length - 1) {
              found = target[idx]
            } else {
              target = target[idx].children ?? []
            }
          }
          if (found) found.children = children
          return next
        })
      } catch (e) {
        console.error('Read dir error:', e)
      }
    }
  }, [])

  const openFile = useCallback(async (node: FileNode) => {
    if (!isTauri) return
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const content = await readTextFile(node.path)
      addTab({ path: node.path, name: node.name, content, savedContent: content, isDirty: false })
    } catch (e) {
      console.error('Open file error:', e)
    }
  }, [addTab])

  return { rootPath, tree, loading, openFolder, toggleDir, openFile }
}
