import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useEditorStore, type ViewMode } from '../../store/editor.ts'
import { pushErrorNotice, pushInfoNotice } from '../../lib/notices.ts'
import {
  SCREENSHOT_CONTEXT_REQUEST_EVENT,
  SCREENSHOT_CONTEXT_RESPONSE_EVENT,
  SCREENSHOT_INSERT_EVENT,
  SCREENSHOT_FIXTURE_EVENT,
  SCREENSHOT_REQUEST_EVENT,
  SCREENSHOT_RETURN_FOCUS_EVENT,
  TAURI_SCREENSHOT_CANCELLED_EVENT,
  TAURI_SCREENSHOT_CAPTURED_EVENT,
  TAURI_SCREENSHOT_REQUEST_EVENT,
  offsetFromLineColumn,
  type ScreenshotBeginResult,
  type ScreenshotCapturedPayload,
  type ScreenshotContextResponseDetail,
  type ScreenshotInsertionTarget,
  type ScreenshotFixtureDetail,
} from '../../lib/screenshot.ts'
import ScreenshotEditor from './ScreenshotEditor.tsx'
import { renderScreenshotPng, type ScreenshotEditSnapshot } from './screenshotModel.ts'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

interface EditSession {
  imageUrl: string
  width: number
  height: number
  crop: ScreenshotCapturedPayload['selection']
  target: ScreenshotInsertionTarget
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isCancellation(error: unknown): boolean {
  return /capture_cancelled|cancelled|canceled/iu.test(errorCode(error))
}

async function requestEditorContext(): Promise<ScreenshotInsertionTarget | null> {
  const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      document.removeEventListener(SCREENSHOT_CONTEXT_RESPONSE_EVENT, onResponse)
      resolve(null)
    }, 180)
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<ScreenshotContextResponseDetail>).detail
      if (detail.requestId !== requestId) return
      window.clearTimeout(timeoutId)
      document.removeEventListener(SCREENSHOT_CONTEXT_RESPONSE_EVENT, onResponse)
      resolve(detail.target)
    }
    document.addEventListener(SCREENSHOT_CONTEXT_RESPONSE_EVENT, onResponse)
    document.dispatchEvent(new CustomEvent(SCREENSHOT_CONTEXT_REQUEST_EVENT, { detail: { requestId } }))
  })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('capture_decode_failed'))
    image.src = url
  })
}

export default function ScreenshotController() {
  const [editSession, setEditSession] = useState<EditSession | null>(null)
  const phaseRef = useRef<'idle' | 'capturing' | 'editing' | 'inserting'>('idle')
  const sessionIdRef = useRef<string | null>(null)
  const targetRef = useRef<ScreenshotInsertionTarget | null>(null)
  const restoreViewModeRef = useRef<ViewMode | null>(null)
  const editSessionRef = useRef<EditSession | null>(null)

  useEffect(() => {
    editSessionRef.current = editSession
  }, [editSession])

  const restoreEditor = useCallback(() => {
    const restoreMode = restoreViewModeRef.current
    restoreViewModeRef.current = null
    if (restoreMode) useEditorStore.getState().setViewMode(restoreMode)
    window.requestAnimationFrame(() => {
      document.dispatchEvent(new CustomEvent(SCREENSHOT_RETURN_FOCUS_EVENT))
    })
  }, [])

  const clearEditSession = useCallback(() => {
    const current = editSessionRef.current
    if (current) URL.revokeObjectURL(current.imageUrl)
    editSessionRef.current = null
    setEditSession(null)
    targetRef.current = null
    sessionIdRef.current = null
    phaseRef.current = 'idle'
    restoreEditor()
  }, [restoreEditor])

  const failCapture = useCallback((error: unknown) => {
    if (!isCancellation(error)) {
      const permissionDenied = /permission|not authorized|denied/iu.test(errorCode(error))
      if (permissionDenied) {
        pushErrorNotice('screenshot.notices.permissionDeniedTitle', 'screenshot.notices.permissionDeniedMessage')
      } else {
        pushErrorNotice('screenshot.notices.captureFailedTitle', 'screenshot.notices.captureFailedMessage', {
          values: { reason: errorCode(error) },
        })
      }
    }
    phaseRef.current = 'idle'
    sessionIdRef.current = null
    targetRef.current = null
    restoreEditor()
  }, [restoreEditor])

  const beginCapture = useCallback(async () => {
    if (phaseRef.current !== 'idle') return
    if (!isTauri) {
      pushInfoNotice('screenshot.notices.desktopOnlyTitle', 'screenshot.notices.desktopOnlyMessage')
      return
    }

    phaseRef.current = 'capturing'
    try {
      const initialState = useEditorStore.getState()
      const initialTab = initialState.tabs.find((tab) => tab.id === initialState.activeTabId) ?? null
      const needsDraft = !initialTab || initialTab.type === 'browser'
      const startsInPreview = !needsDraft && initialState.viewMode === 'preview'
      if (needsDraft) {
        initialState.addTab({ type: 'markdown' })
        if (initialState.viewMode === 'preview') initialState.setViewMode('source')
        await nextFrame()
        await nextFrame()
      } else if (startsInPreview) {
        restoreViewModeRef.current = 'preview'
      }

      const context = startsInPreview ? null : await requestEditorContext()
      const currentState = useEditorStore.getState()
      const tab = currentState.tabs.find((item) => item.id === currentState.activeTabId)
      if (!tab || tab.type === 'browser') throw new Error('capture_target_missing')
      const fallbackOffset = offsetFromLineColumn(
        tab.content,
        currentState.cursorPos.line,
        currentState.cursorPos.col
      )
      targetRef.current = context ?? {
        tabId: tab.id,
        tabPath: tab.path,
        docText: tab.content,
        selectionFrom: fallbackOffset,
        selectionTo: fallbackOffset,
        anchorOffset: fallbackOffset,
        scrollTop: 0,
        scrollLeft: 0,
      }

      const result = await invoke<ScreenshotBeginResult>('screenshot_capture_begin')
      if (phaseRef.current === 'capturing') sessionIdRef.current = result.sessionId
    } catch (error) {
      failCapture(error)
    }
  }, [failCapture])

  const persistFile = useCallback(async (file: File, target: ScreenshotInsertionTarget) => {
    const store = useEditorStore.getState()
    const targetStillExists = store.tabs.some((tab) => tab.id === target.tabId && tab.type !== 'browser')
    if (!targetStillExists) throw new Error('capture_target_closed')
    store.setActiveTab(target.tabId)
    if (store.viewMode === 'preview') store.setViewMode('source')
    await nextFrame()
    await nextFrame()

    const result = await new Promise<{ stale: boolean }>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error('capture_editor_unavailable')), 30_000)
      document.dispatchEvent(new CustomEvent(SCREENSHOT_INSERT_EVENT, {
        detail: {
          target,
          file,
          resolve: (value: { stale: boolean }) => {
            window.clearTimeout(timeoutId)
            resolve(value)
          },
          reject: (error: unknown) => {
            window.clearTimeout(timeoutId)
            reject(error)
          },
        },
      }))
    })

    if (result.stale) {
      pushInfoNotice('screenshot.notices.documentChangedTitle', 'screenshot.notices.documentChangedMessage')
    }
  }, [])

  const acceptCapture = useCallback(async (payload: ScreenshotCapturedPayload) => {
    if (phaseRef.current !== 'capturing' || !targetRef.current) return
    const target = targetRef.current
    const completedInOverlay = payload.edit != null
    try {
      const bytes = await invoke<ArrayBuffer>('screenshot_capture_read', {
        sessionId: payload.sessionId,
        monitorId: payload.monitorId,
      })
      const imageUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/bmp' }))
      try {
        const image = await loadImage(imageUrl)
        if (completedInOverlay) {
          phaseRef.current = 'inserting'
          const blob = await renderScreenshotPng(
            image,
            image.naturalWidth,
            image.naturalHeight,
            payload.edit as ScreenshotEditSnapshot
          )
          await persistFile(new File([blob], 'screenshot.png', { type: 'image/png' }), target)
          URL.revokeObjectURL(imageUrl)
          clearEditSession()
          await nextFrame()
          await invoke('screenshot_capture_release', { sessionId: payload.sessionId })
          return
        }

        await invoke('screenshot_capture_release', { sessionId: payload.sessionId })
        sessionIdRef.current = null
        const next: EditSession = {
          imageUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
          crop: payload.selection,
          target,
        }
        editSessionRef.current = next
        setEditSession(next)
        phaseRef.current = 'editing'
      } catch (error) {
        URL.revokeObjectURL(imageUrl)
        throw error
      }
    } catch (error) {
      try {
        await invoke('screenshot_capture_release', { sessionId: payload.sessionId })
      } catch {
        // The session may already have been released by another window.
      }
      if (completedInOverlay) {
        pushErrorNotice('screenshot.notices.insertFailedTitle', 'screenshot.notices.insertFailedMessage', {
          values: { reason: errorCode(error) },
        })
        clearEditSession()
      } else {
        failCapture(error)
      }
    }
  }, [clearEditSession, failCapture, persistFile])

  const cancel = useCallback(() => {
    const sessionId = sessionIdRef.current
    if (sessionId && phaseRef.current === 'capturing') {
      void invoke('screenshot_capture_cancel', { sessionId }).catch(() => undefined)
    }
    clearEditSession()
  }, [clearEditSession])

  const insert = useCallback(async (snapshot: ScreenshotEditSnapshot, image: HTMLImageElement) => {
    const current = editSessionRef.current
    if (!current || phaseRef.current !== 'editing') return
    phaseRef.current = 'inserting'
    try {
      const blob = await renderScreenshotPng(image, current.width, current.height, snapshot)
      await persistFile(new File([blob], 'screenshot.png', { type: 'image/png' }), current.target)
      clearEditSession()
    } catch (error) {
      phaseRef.current = 'editing'
      pushErrorNotice('screenshot.notices.insertFailedTitle', 'screenshot.notices.insertFailedMessage', {
        values: { reason: errorCode(error) },
      })
    }
  }, [clearEditSession, persistFile])

  useEffect(() => {
    const onRequest = () => void beginCapture()
    document.addEventListener(SCREENSHOT_REQUEST_EVENT, onRequest)
    return () => document.removeEventListener(SCREENSHOT_REQUEST_EVENT, onRequest)
  }, [beginCapture])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('screenshotTest') !== '1') return

    const openFixture = (event: Event) => {
      if (phaseRef.current !== 'idle') return
      const detail = (event as CustomEvent<ScreenshotFixtureDetail>).detail
      phaseRef.current = 'capturing'
      void (async () => {
        try {
          const context = await requestEditorContext()
          const store = useEditorStore.getState()
          const tab = store.tabs.find((item) => item.id === store.activeTabId)
          if (!tab || tab.type === 'browser') throw new Error('capture_target_missing')
          const offset = offsetFromLineColumn(tab.content, store.cursorPos.line, store.cursorPos.col)
          const target = context ?? {
            tabId: tab.id,
            tabPath: tab.path,
            docText: tab.content,
            selectionFrom: offset,
            selectionTo: offset,
            anchorOffset: offset,
            scrollTop: 0,
            scrollLeft: 0,
          }
          targetRef.current = target
          const next: EditSession = {
            imageUrl: detail.imageUrl,
            width: detail.width,
            height: detail.height,
            crop: detail.selection,
            target,
          }
          editSessionRef.current = next
          setEditSession(next)
          phaseRef.current = 'editing'
        } catch (error) {
          failCapture(error)
        }
      })()
    }

    document.addEventListener(SCREENSHOT_FIXTURE_EVENT, openFixture)
    return () => document.removeEventListener(SCREENSHOT_FIXTURE_EVENT, openFixture)
  }, [failCapture])

  useEffect(() => {
    if (!isTauri) return
    const unlisteners: UnlistenFn[] = []
    let disposed = false

    void Promise.all([
      listen(TAURI_SCREENSHOT_REQUEST_EVENT, () => void beginCapture()),
      listen<ScreenshotCapturedPayload>(TAURI_SCREENSHOT_CAPTURED_EVENT, (event) => void acceptCapture(event.payload)),
      listen(TAURI_SCREENSHOT_CANCELLED_EVENT, () => {
        if (phaseRef.current === 'capturing') clearEditSession()
      }),
    ]).then(async (items) => {
      if (disposed) {
        items.forEach((unlisten) => unlisten())
        return
      }
      unlisteners.push(...items)
      try {
        await invoke<boolean>('screenshot_register_global_shortcut')
      } catch {
        pushInfoNotice('screenshot.notices.shortcutConflictTitle', 'screenshot.notices.shortcutConflictMessage')
      }
    }).catch((error) => console.error('Screenshot event setup failed:', error))

    return () => {
      disposed = true
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [acceptCapture, beginCapture, clearEditSession])

  if (!editSession) return null

  return (
    <ScreenshotEditor
      imageUrl={editSession.imageUrl}
      width={editSession.width}
      height={editSession.height}
      initialCrop={editSession.crop}
      onCancel={cancel}
      onConfirm={insert}
    />
  )
}
