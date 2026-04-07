import { useEffect, useState, useCallback } from 'react'
import { useEditorStore } from './store/editor'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import EditorPane from './components/Editor/EditorPane'
import MarkdownPreview from './components/Preview/MarkdownPreview'
import StatusBar from './components/StatusBar/StatusBar'
import ResizableDivider from './components/Layout/ResizableDivider'
import CommandPalette from './components/CommandPalette/CommandPalette'

export default function App() {
  const { theme, viewMode, sidebarWidth, sidebarOpen, editorRatio, setEditorRatio } = useEditorStore()
  const [paletteMode, setPaletteMode] = useState<'command' | 'file' | null>(null)

  // Apply theme class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Global keyboard shortcuts for command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.shiftKey && e.key === 'p') {
        e.preventDefault()
        setPaletteMode('command')
      } else if (mod && e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        setPaletteMode('file')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const closePalette = useCallback(() => setPaletteMode(null), [])

  const showSidebar = viewMode !== 'focus' && sidebarOpen
  const showEditor = viewMode !== 'preview'
  const showPreview = viewMode !== 'source'

  return (
    <div
      className="flex flex-col h-screen overflow-hidden p-3 gap-3 transition-colors duration-300"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {/* Command Palette (portal-like, above everything) */}
      {paletteMode && (
        <CommandPalette mode={paletteMode} onClose={closePalette} />
      )}

      {/* Toolbar (Floating Glass Panel) */}
      <div 
        className="rounded-xl shadow-sm border flex-shrink-0 glass-panel animate-in"
        style={{ borderColor: 'var(--glass-border)' }}
      >
        <Toolbar onOpenPalette={() => setPaletteMode('command')} />
      </div>

      {/* Main workspace container */}
      <div 
        className="flex flex-1 min-h-0 rounded-2xl overflow-hidden shadow-sm border transition-shadow duration-300" 
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
      >
        {/* Sidebar */}
        {showSidebar && (
          <>
            <Sidebar width={sidebarWidth} />
            <div className="flex-shrink-0" style={{ width: '1px', background: 'var(--border)' }} />
          </>
        )}

        {/* Editor + Preview */}
        <div className="flex flex-1 min-w-0 bg-transparent">
          {showEditor && (
            <div
              className="flex-shrink-0 overflow-hidden h-full"
              style={{ width: showPreview ? `${editorRatio * 100}%` : '100%' }}
            >
              <EditorPane />
            </div>
          )}

          {showEditor && showPreview && (
            <ResizableDivider
              onResize={(delta, totalWidth) => {
                const newRatio = Math.max(0.2, Math.min(0.8, editorRatio + delta / totalWidth))
                setEditorRatio(newRatio)
              }}
            />
          )}

          {showPreview && (
            <div className="flex-1 min-w-0 overflow-hidden h-full">
              <MarkdownPreview />
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0">
        <StatusBar />
      </div>
    </div>
  )
}
