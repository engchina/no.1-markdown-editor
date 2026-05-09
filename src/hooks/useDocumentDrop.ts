import { useEffect } from 'react'
import { useEditorStore } from '../store/editor'
import { isSupportedDocumentName } from '../lib/fileTypes'
import { openDesktopDocumentPaths } from '../lib/desktopFileOpen'
import { pushErrorNotice } from '../lib/notices'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function useDocumentDrop() {
  const openDocument = useEditorStore((state) => state.openDocument)

  useEffect(() => {
    if (isTauri) return

    const handleDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = async (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
        isSupportedDocumentName(file.name)
      )
      if (files.length === 0) return

      event.preventDefault()

      try {
        for (const file of files) {
          const text = await file.text()
          openDocument({
            path: null,
            name: file.name,
            content: text,
            savedContent: text,
            isDirty: false,
          })
        }
      } catch (error) {
        console.error('Document drop error:', error)
        pushErrorNotice('notices.openFileErrorTitle', 'notices.openFileErrorMessage')
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [openDocument])

  useEffect(() => {
    if (!isTauri) return

    let cancelled = false
    let unlisten: (() => void) | undefined

    void (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        const off = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type !== 'drop') return
          const paths = event.payload.paths.filter((path) => isSupportedDocumentName(path))
          if (paths.length === 0) return
          void openDesktopDocumentPaths(paths)
        })
        if (cancelled) off()
        else unlisten = off
      } catch (error) {
        console.error('Register Tauri drag-drop listener error:', error)
      }
    })()

    return () => {
      cancelled = true
      if (unlisten) unlisten()
    }
  }, [])
}
