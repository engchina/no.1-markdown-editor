import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/editor'
import { useFileTreeStore } from '../store/fileTree'
import { buildWorkspaceSearchResults, type WorkspaceSearchResult } from '../lib/workspaceSearch'
const MAX_RESULTS = 120

export function useWorkspaceSearch(query: string) {
  const tabs = useEditorStore((state) => state.tabs)
  const rootPath = useFileTreeStore((state) => state.rootPath)
  const deferredQuery = useDeferredValue(query.trim())
  const [results, setResults] = useState<WorkspaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!deferredQuery) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)

    void buildWorkspaceSearchResults({
      query: deferredQuery,
      tabs,
      rootPath,
      limit: MAX_RESULTS,
    })
      .then((nextResults) => {
        if (requestIdRef.current !== requestId) return
        setResults(nextResults)
      })
      .catch((error) => {
        console.error('Workspace search error:', error)
        if (requestIdRef.current !== requestId) return
        setResults([])
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setSearching(false)
      })
  }, [deferredQuery, rootPath, tabs])

  return { results, searching, rootPath, query: deferredQuery }
}
