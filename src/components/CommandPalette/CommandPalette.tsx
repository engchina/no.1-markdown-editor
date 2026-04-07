import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useCommands, type Command } from '../../hooks/useCommands'
import { useEditorStore } from '../../store/editor'

interface Props {
  mode: 'command' | 'file'
  onClose: () => void
}

const CATEGORY_ORDER = ['file', 'edit', 'view', 'theme', 'export', 'language'] as const
const CATEGORY_LABEL: Record<string, string> = {
  file: 'File',
  edit: 'Edit',
  view: 'View',
  theme: 'Themes',
  export: 'Export',
  language: 'Language',
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  // Fuzzy: every char in query must appear in order in text
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 90
  if (t.includes(q)) return 70
  return 50
}

export default function CommandPalette({ mode, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const commands = useCommands()
  const { tabs } = useEditorStore()

  const filtered = useMemo(() => {
    if (mode === 'file') {
      // File mode: search open tabs
      return tabs
        .filter((t) => fuzzyMatch(query, t.name))
        .map((t) => ({
          id: t.id,
          label: t.name,
          description: t.path ?? 'Unsaved',
          icon: '📄',
          category: 'file' as const,
          shortcut: undefined,
          action: () => {
            useEditorStore.getState().setActiveTab(t.id)
          },
        }))
    }

    // Command mode
    const results = commands
      .filter((c) => fuzzyMatch(query, c.label) || (c.description && fuzzyMatch(query, c.description)))
      .sort((a, b) => fuzzyScore(query, b.label) - fuzzyScore(query, a.label))

    if (!query) {
      // Group by category when no query
      return CATEGORY_ORDER.flatMap((cat) => results.filter((c) => c.category === cat))
    }
    return results
  }, [query, commands, tabs, mode])

  // Reset selection on filter change
  useEffect(() => { setSelectedIndex(0) }, [filtered.length, query])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const execute = useCallback(
    (cmd: Command) => {
      cmd.action()
      onClose()
    },
    [onClose]
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) execute(filtered[selectedIndex])
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [filtered, selectedIndex, execute, onClose]
  )

  // Grouping
  let lastCategory = ''

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden animate-in"
        style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4"
          style={{ borderBottom: '1px solid var(--border)', height: '52px' }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: '18px' }}>
            {mode === 'file' ? '📄' : '>'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === 'file' ? 'Switch to tab...' : 'Type a command...'}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
          />
          <kbd
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <ul ref={listRef} className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No results for &quot;{query}&quot;
            </li>
          )}
          {filtered.map((cmd, idx) => {
            const showHeader = !query && mode === 'command' && cmd.category !== lastCategory
            if (showHeader) lastCategory = cmd.category

            return (
              <div key={cmd.id}>
                {showHeader && (
                  <div
                    className="px-4 py-1 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {CATEGORY_LABEL[cmd.category] ?? cmd.category}
                  </div>
                )}
                <li
                  data-idx={idx}
                  className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
                  style={{
                    background: idx === selectedIndex ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                    color: idx === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => execute(cmd)}
                >
                  {cmd.icon && (
                    <span className="flex-shrink-0 w-5 text-center text-sm">{cmd.icon}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{cmd.label}</div>
                    {cmd.description && (
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {cmd.description}
                      </div>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd
                      className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </li>
              </div>
            )
          })}
        </ul>

        {/* Footer */}
        <div
          className="flex items-center gap-4 px-4 py-2 text-xs"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <span>↑↓ navigate</span>
          <span>↵ execute</span>
          <span>ESC close</span>
          <div className="flex-1" />
          <span>{filtered.length} results</span>
        </div>
      </div>
    </div>
  )
}
