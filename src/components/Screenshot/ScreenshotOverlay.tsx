import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { clampScreenshotRect, normalizeScreenshotRect, type ScreenshotRect } from '../../lib/screenshot.ts'
import AppIcon from '../Icons/AppIcon.tsx'
import ScreenshotEditor from './ScreenshotEditor.tsx'
import type { ScreenshotEditSnapshot } from './screenshotModel.ts'

interface OverlayParams {
  sessionId: string
  monitorId: string
}

function readOverlayParams(): OverlayParams {
  const params = new URLSearchParams(window.location.search)
  return {
    sessionId: params.get('sessionId') ?? '',
    monitorId: params.get('monitorId') ?? '',
  }
}

async function readCaptureWhenReady(
  sessionId: string,
  monitorId: string,
  isDisposed: () => boolean
): Promise<ArrayBuffer> {
  while (!isDisposed()) {
    try {
      return await invoke<ArrayBuffer>('screenshot_capture_read', { sessionId, monitorId })
    } catch (error) {
      if (!String(error).includes('capture_monitor_pending')) throw error
      await new Promise((resolve) => window.setTimeout(resolve, 8))
    }
  }
  throw new Error('capture_cancelled')
}

export default function ScreenshotOverlay() {
  const { t } = useTranslation()
  const [{ sessionId, monitorId }] = useState(readOverlayParams)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })
  const [selection, setSelection] = useState<ScreenshotRect>({ x: 0, y: 0, width: 1, height: 1 })
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const claimedRef = useRef(false)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let url: string | null = null
    let disposed = false
    void readCaptureWhenReady(sessionId, monitorId, () => disposed)
      .then((bytes) => {
        if (disposed) return
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/bmp' }))
        setImageUrl(url)
      })
      .catch(() => {
        if (!disposed) void invoke('screenshot_capture_cancel', { sessionId })
      })
    return () => {
      disposed = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [monitorId, sessionId])

  const pointFromEvent = useCallback((event: { clientX: number; clientY: number }) => {
    const surface = surfaceRef.current
    if (!surface) return { x: 0, y: 0 }
    const rect = surface.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(imageSize.width, (event.clientX - rect.left) * imageSize.width / rect.width)),
      y: Math.max(0, Math.min(imageSize.height, (event.clientY - rect.top) * imageSize.height / rect.height)),
    }
  }, [imageSize.height, imageSize.width])

  const claim = useCallback(async (): Promise<boolean> => {
    if (claimedRef.current) return true
    try {
      await invoke('screenshot_capture_claim', { sessionId, monitorId })
      claimedRef.current = true
      return true
    } catch {
      setBusy(true)
      return false
    }
  }, [monitorId, sessionId])

  const enterEditing = useCallback(async (nextSelection: ScreenshotRect) => {
    if (busy) return
    if (!await claim()) return
    setSelection(clampScreenshotRect(nextSelection, imageSize.width, imageSize.height))
    setEditing(true)
  }, [busy, claim, imageSize.height, imageSize.width])

  const cancel = useCallback(() => {
    if (busy) return
    setBusy(true)
    void invoke('screenshot_capture_cancel', { sessionId }).catch(() => setBusy(false))
  }, [busy, sessionId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        void enterEditing(selection)
        return
      }
      if (!event.key.startsWith('Arrow')) return

      event.preventDefault()
      void claim()
      const step = event.ctrlKey || event.metaKey ? 10 : 1
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      setSelection((current) => clampScreenshotRect(
        event.shiftKey
          ? { ...current, width: current.width + dx, height: current.height + dy }
          : { ...current, x: current.x + dx, y: current.y + dy },
        imageSize.width,
        imageSize.height
      ))
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [cancel, claim, editing, enterEditing, imageSize.height, imageSize.width, selection])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    void claim()
    const point = pointFromEvent(event)
    setDragStart(point)
    setSelection({ x: point.x, y: point.y, width: 1, height: 1 })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart) return
    const rect = normalizeScreenshotRect(dragStart, pointFromEvent(event))
    setSelection(clampScreenshotRect(rect, imageSize.width, imageSize.height))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart) return
    const nextSelection = clampScreenshotRect(
      normalizeScreenshotRect(dragStart, pointFromEvent(event)),
      imageSize.width,
      imageSize.height
    )
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragStart(null)
    if (nextSelection.width >= 2 && nextSelection.height >= 2) void enterEditing(nextSelection)
  }

  const selectionStyle = {
    left: `${selection.x / imageSize.width * 100}%`,
    top: `${selection.y / imageSize.height * 100}%`,
    width: `${selection.width / imageSize.width * 100}%`,
    height: `${selection.height / imageSize.height * 100}%`,
  }

  if (editing && imageUrl) {
    return (
      <ScreenshotEditor
        imageUrl={imageUrl}
        width={imageSize.width}
        height={imageSize.height}
        initialCrop={selection}
        onCancel={cancel}
        onConfirm={(edit: ScreenshotEditSnapshot) => invoke('screenshot_capture_finish', {
          sessionId,
          monitorId,
          edit,
        })}
      />
    )
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white" aria-label={t('screenshot.capture.title')}>
      {imageUrl && (
        <div
          ref={surfaceRef}
          className="absolute inset-0 cursor-crosshair select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="h-full w-full"
            onLoad={(event) => {
              const width = event.currentTarget.naturalWidth
              const height = event.currentTarget.naturalHeight
              setImageSize({ width, height })
              setSelection({ x: 0, y: 0, width, height })
              const overlay = getCurrentWindow()
              void overlay.show()
                .then(() => {
                  void invoke('screenshot_hide_main').catch(() => undefined)
                  void overlay.setFocus().catch(() => undefined)
                  cancelButtonRef.current?.focus()
                })
                .catch(() => invoke('screenshot_capture_cancel', { sessionId }))
            }}
            onError={() => void invoke('screenshot_capture_cancel', { sessionId })}
          />
          <div
            className="pointer-events-none absolute border-2 border-[#1685ff] shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]"
            style={selectionStyle}
          >
            <span className="absolute -top-7 left-0 rounded bg-black/80 px-2 py-1 text-xs tabular-nums">
              {Math.round(selection.width)} × {Math.round(selection.height)}
            </span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-2.5 text-sm font-medium tracking-wide text-white/90 shadow-2xl backdrop-blur-md">
        {t('screenshot.capture.hint')}
      </div>
      <div className="absolute right-4 top-4 z-10">
        <button
          ref={cancelButtonRef}
          type="button"
          onClick={cancel}
          disabled={busy}
          aria-label={t('screenshot.actions.cancel')}
          title={t('screenshot.actions.cancel')}
          className="cursor-pointer rounded-xl border border-white/20 bg-black/40 p-2.5 text-white shadow-2xl backdrop-blur-xl transition-all duration-200 hover:bg-black/60 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <AppIcon name="x" size={18} />
        </button>
      </div>
    </main>
  )
}
