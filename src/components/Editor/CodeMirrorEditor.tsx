import { useEffect, useRef, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { buildExtensions } from './extensions'
import { useEditorStore, useActiveTab } from '../../store/editor'
import SearchBar from '../Search/SearchBar'
import { useState } from 'react'

interface Props {
  content: string
  onChange: (content: string) => void
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export default function CodeMirrorEditor({ content, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isUpdatingRef = useRef(false)

  const { lineNumbers, wordWrap, fontSize, typewriterMode, wysiwygMode, setCursorPos } = useEditorStore()
  const activeTab = useActiveTab()

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchReplace, setSearchReplace] = useState(false)

  const handleCursorChange = useCallback(
    (line: number, col: number) => {
      setCursorPos({ line, col })
    },
    [setCursorPos]
  )

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return

    const extensions = buildExtensions({
      lineNumbers,
      wordWrap,
      wysiwyg: wysiwygMode,
      onChange: (newContent) => {
        if (!isUpdatingRef.current) {
          onChange(newContent)
        }
      },
      onCursorChange: handleCursorChange,
    })

    const state = EditorState.create({
      doc: content,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineNumbers, wordWrap, wysiwygMode])

  // Sync content changes from outside (file open, new tab, etc.)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (currentContent === content) return

    isUpdatingRef.current = true
    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: content },
    })
    isUpdatingRef.current = false
  }, [content])

  // Image paste handler
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePaste = async (e: ClipboardEvent) => {
      const view = viewRef.current
      if (!view) return

      const items = e.clipboardData?.items
      if (!items) return

      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        e.preventDefault()

        const file = item.getAsFile()
        if (!file) continue

        let markdownText = ''

        if (isTauri && activeTab?.path) {
          // Save image next to the markdown file
          try {
            const { writeFile } = await import('@tauri-apps/plugin-fs')
            const dir = activeTab.path.replace(/[\\/][^\\/]+$/, '')
            const assetsDir = `${dir}/_assets`
            const imgName = `image-${Date.now()}.png`
            const imgPath = `${assetsDir}/${imgName}`
            const buf = await file.arrayBuffer()
            await writeFile(imgPath, new Uint8Array(buf))
            markdownText = `![image](_assets/${imgName})`
          } catch {
            // Fallback to base64
            markdownText = await fileToBase64Markdown(file)
          }
        } else {
          markdownText = await fileToBase64Markdown(file)
        }

        // Insert at cursor
        const { from } = view.state.selection.main
        view.dispatch({
          changes: { from, insert: markdownText },
          selection: { anchor: from + markdownText.length },
        })
        break
      }
    }

    container.addEventListener('paste', handlePaste)
    return () => container.removeEventListener('paste', handlePaste)
  }, [activeTab?.path])

  // Global keyboard shortcuts & events
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'f') { e.preventDefault(); setSearchOpen(true); setSearchReplace(false) }
      if (mod && e.key === 'h') { e.preventDefault(); setSearchOpen(true); setSearchReplace(true) }
    }
    const searchEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { replace: boolean }
      setSearchOpen(true)
      setSearchReplace(detail.replace)
    }
    document.addEventListener('keydown', handler)
    document.addEventListener('editor:search', searchEvent)
    return () => {
      document.removeEventListener('keydown', handler)
      document.removeEventListener('editor:search', searchEvent)
    }
  }, [])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {searchOpen && (
        <SearchBar
          editorView={viewRef.current}
          showReplace={searchReplace}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ fontSize: `${fontSize}px` }}
        data-typewriter={typewriterMode}
      />
    </div>
  )
}

async function fileToBase64Markdown(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      resolve(`![image](${dataUrl})`)
    }
    reader.readAsDataURL(file)
  })
}
