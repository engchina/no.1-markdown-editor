import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/editor'
import { useFileOps } from './useFileOps'

const AUTOSAVE_DELAY = 2000
const AUTOSAVE_RETRY_DELAY = 15000
const MAX_AUTOSAVE_ATTEMPTS = 3

export function useAutoSave() {
  const tabs = useEditorStore((state) => state.tabs)
  const externalFileConflicts = useEditorStore((state) => state.externalFileConflicts)
  const { saveTabById } = useFileOps()
  const [saving, setSaving] = useState(false)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingContentRef = useRef<Map<string, string>>(new Map())
  const failedAttemptsRef = useRef<Map<string, number>>(new Map())
  const activeSavesRef = useRef(0)
  const saveTabByIdRef = useRef(saveTabById)

  useEffect(() => {
    saveTabByIdRef.current = saveTabById
  }, [saveTabById])

  useEffect(() => {
    function scheduleSave(tabId: string, delay: number) {
      const existingTimer = timersRef.current.get(tabId)
      if (existingTimer) clearTimeout(existingTimer)

      const timer = setTimeout(() => {
        timersRef.current.delete(tabId)
        void runSave(tabId)
      }, delay)

      timersRef.current.set(tabId, timer)
    }

    async function runSave(tabId: string) {
      const state = useEditorStore.getState()
      const tab = state.tabs.find((entry) => entry.id === tabId)
      if (!tab || !tab.isDirty || !tab.path) {
        pendingContentRef.current.delete(tabId)
        failedAttemptsRef.current.delete(tabId)
        return
      }

      // Never write over a file with a pending external conflict — the user
      // must resolve it first, otherwise the external edit is silently lost.
      // Resolving updates the tab, which reschedules through the effect below.
      if (state.externalFileConflicts.some((conflict) => conflict.tabId === tabId)) {
        pendingContentRef.current.delete(tabId)
        return
      }

      activeSavesRef.current += 1
      setSaving(true)

      let saved = false
      try {
        saved = await saveTabByIdRef.current(tabId)
      } finally {
        activeSavesRef.current = Math.max(0, activeSavesRef.current - 1)
        if (activeSavesRef.current === 0) {
          setTimeout(() => {
            if (activeSavesRef.current === 0) setSaving(false)
          }, 300)
        }
      }

      if (saved) {
        pendingContentRef.current.delete(tabId)
        failedAttemptsRef.current.delete(tabId)
        return
      }

      // Keep pendingContentRef so the unchanged content is not rescheduled by
      // the effect; retry a bounded number of times, then wait for the next
      // edit (which resets the attempt counter).
      const attempts = (failedAttemptsRef.current.get(tabId) ?? 0) + 1
      failedAttemptsRef.current.set(tabId, attempts)
      if (attempts < MAX_AUTOSAVE_ATTEMPTS) {
        scheduleSave(tabId, AUTOSAVE_RETRY_DELAY)
      }
    }

    const conflictTabIds = new Set(externalFileConflicts.map((conflict) => conflict.tabId))
    const pendingTabIds = new Set<string>()

    for (const tab of tabs) {
      if (!tab.isDirty || !tab.path || conflictTabIds.has(tab.id)) continue

      pendingTabIds.add(tab.id)
      const lastScheduledContent = pendingContentRef.current.get(tab.id)
      if (lastScheduledContent === tab.content) continue

      pendingContentRef.current.set(tab.id, tab.content)
      failedAttemptsRef.current.delete(tab.id)
      scheduleSave(tab.id, AUTOSAVE_DELAY)
    }

    for (const [tabId, timer] of timersRef.current.entries()) {
      if (pendingTabIds.has(tabId)) continue
      clearTimeout(timer)
      timersRef.current.delete(tabId)
      pendingContentRef.current.delete(tabId)
      failedAttemptsRef.current.delete(tabId)
    }
  }, [externalFileConflicts, tabs])

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
      pendingContentRef.current.clear()
      failedAttemptsRef.current.clear()
    }
  }, [])

  return { saving }
}
