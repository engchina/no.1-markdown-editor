import { useState, useEffect, useRef, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '@codemirror/search'

interface Props {
  editorView: EditorView | null
  showReplace: boolean
  onClose: () => void
}

export default function SearchBar({ editorView, showReplace, onClose }: Props) {
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [matchCount, setMatchCount] = useState<string>('')
  const [hasReplace, setHasReplace] = useState(showReplace)

  const findRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setHasReplace(showReplace) }, [showReplace])
  useEffect(() => { findRef.current?.focus() }, [])

  // Build query and run search
  const runSearch = useCallback(
    (find: string, opts?: { cs?: boolean; re?: boolean; ww?: boolean }) => {
      if (!editorView) return
      const cs = opts?.cs ?? caseSensitive
      const re = opts?.re ?? useRegex
      const ww = opts?.ww ?? wholeWord

      let valid = true
      if (re && find) {
        try { new RegExp(find) } catch { valid = false }
      }

      if (!find || !valid) {
        setMatchCount('')
        return
      }

      const query = new SearchQuery({ search: find, caseSensitive: cs, regexp: re, wholeWord: ww, replace: replaceText })
      editorView.dispatch({ effects: setSearchQuery.of(query) })

      // Count matches in document
      const doc = editorView.state.doc.toString()
      let count = 0
      if (re) {
        try {
          const flags = cs ? 'g' : 'gi'
          const matches = doc.match(new RegExp(find, flags))
          count = matches?.length ?? 0
        } catch { /* ignore */ }
      } else {
        const needle = cs ? find : find.toLowerCase()
        const hay = cs ? doc : doc.toLowerCase()
        let pos = 0
        while ((pos = hay.indexOf(needle, pos)) !== -1) { count++; pos++ }
      }
      setMatchCount(count === 0 ? 'No matches' : `${count} match${count !== 1 ? 'es' : ''}`)
    },
    [editorView, caseSensitive, useRegex, wholeWord, replaceText]
  )

  useEffect(() => { runSearch(findText) }, [findText, caseSensitive, useRegex, wholeWord])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!editorView) return
        if (e.shiftKey) {
          findPrevious(editorView)
        } else {
          findNext(editorView)
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [editorView, onClose]
  )

  const toggleOpt = (opt: 'cs' | 're' | 'ww') => {
    if (opt === 'cs') setCaseSensitive((v) => { runSearch(findText, { cs: !v }); return !v })
    if (opt === 're') setUseRegex((v) => { runSearch(findText, { re: !v }); return !v })
    if (opt === 'ww') setWholeWord((v) => { runSearch(findText, { ww: !v }); return !v })
  }

  const btnStyle = (active: boolean) => ({
    background: active ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: '4px',
    padding: '1px 6px',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  })

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 flex-shrink-0"
      style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Find row */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)', minWidth: '52px' }}>Find</span>
        <div
          className="flex-1 flex items-center gap-1 rounded px-2"
          style={{ background: 'var(--editor-bg)', border: '1px solid var(--border)', height: '26px' }}
        >
          <input
            ref={findRef}
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search..."
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--text-primary)' }}
          />
          {matchCount && (
            <span className="text-xs flex-shrink-0" style={{ color: matchCount === 'No matches' ? '#ef4444' : 'var(--text-muted)' }}>
              {matchCount}
            </span>
          )}
        </div>
        {/* Options */}
        <button style={btnStyle(caseSensitive)} onClick={() => toggleOpt('cs')} title="Case Sensitive">Aa</button>
        <button style={btnStyle(wholeWord)} onClick={() => toggleOpt('ww')} title="Whole Word">W</button>
        <button style={btnStyle(useRegex)} onClick={() => toggleOpt('re')} title="Use Regex">.*</button>
        {/* Nav */}
        <button
          title="Previous (Shift+Enter)"
          onClick={() => editorView && findPrevious(editorView)}
          className="w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >↑</button>
        <button
          title="Next (Enter)"
          onClick={() => editorView && findNext(editorView)}
          className="w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >↓</button>
        {/* Toggle replace */}
        <button
          onClick={() => setHasReplace((v) => !v)}
          className="text-xs px-2 h-6 rounded"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >{hasReplace ? 'Hide' : 'Replace'}</button>
        {/* Close */}
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-sm"
          style={{ color: 'var(--text-muted)' }}
          title="Close (Esc)"
        >×</button>
      </div>

      {/* Replace row */}
      {hasReplace && (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)', minWidth: '52px' }}>Replace</span>
          <div
            className="flex-1 flex items-center gap-1 rounded px-2"
            style={{ background: 'var(--editor-bg)', border: '1px solid var(--border)', height: '26px' }}
          >
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
              placeholder="Replace with..."
              className="flex-1 bg-transparent outline-none text-xs"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
          <button
            onClick={() => {
              if (!editorView) return
              const q = new SearchQuery({ search: findText, caseSensitive, regexp: useRegex, wholeWord, replace: replaceText })
              editorView.dispatch({ effects: setSearchQuery.of(q) })
              replaceNext(editorView)
            }}
            className="text-xs px-2 h-6 rounded"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >Replace</button>
          <button
            onClick={() => {
              if (!editorView) return
              const q = new SearchQuery({ search: findText, caseSensitive, regexp: useRegex, wholeWord, replace: replaceText })
              editorView.dispatch({ effects: setSearchQuery.of(q) })
              replaceAll(editorView)
              runSearch(findText)
            }}
            className="text-xs px-2 h-6 rounded"
            style={{ background: 'var(--accent)', color: 'white', border: 'none' }}
          >All</button>
        </div>
      )}
    </div>
  )
}
