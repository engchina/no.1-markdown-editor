import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  TAURI_SCREENSHOT_OVERLAY_BEGIN_EVENT,
  clampScreenshotRect,
  findTopmostScreenshotWindow,
  isCurrentScreenshotTarget,
  normalizeScreenshotRect,
  screenshotRectContainsPoint,
  type SmartScreenshotTarget,
  type ScreenshotRect,
  type ScreenshotWindowTarget,
} from '../../lib/screenshot.ts'
import { isWindowsPlatform } from '../../lib/platform.ts'
import AppIcon from '../Icons/AppIcon.tsx'
import ScreenshotEditor from './ScreenshotEditor.tsx'
import type { ScreenshotEditSnapshot } from './screenshotModel.ts'

// The overlay window is reused across captures, so its URL no longer carries a
// session id — only the (monitor-stable) monitor id. The active session id
// arrives per-capture via the `screenshot-overlay-begin` event / a mount query.
function readMonitorId(): string {
  return new URLSearchParams(window.location.search).get('monitorId') ?? ''
}

// Brand accent, matching the editor surface. The overlay is its own webview and
// does not inherit a theme class, so the accent stays explicit (PixPin/Snipaste
// are likewise always dark-immersive regardless of app theme).
const ACCENT = '#1685ff'
// Magnifier: pixel-accurate loupe so the user can aim to the exact pixel.
const LOUPE_SIZE = 132
const LOUPE_ZOOM = 8

interface CursorInfo {
  imgX: number
  imgY: number
  clientX: number
  clientY: number
}

interface ElementQuery extends SmartScreenshotTarget {
  sessionId: string
  monitorId: string
  x: number
  y: number
}

// L-shaped accent marks at the four selection corners (decorative, not handles —
// the real resize handles live in the editor that opens on release).
const CORNERS = [
  { k: 'tl', cls: '-left-px -top-px border-l-2 border-t-2 rounded-tl-sm' },
  { k: 'tr', cls: '-right-px -top-px border-r-2 border-t-2 rounded-tr-sm' },
  { k: 'bl', cls: '-left-px -bottom-px border-l-2 border-b-2 rounded-bl-sm' },
  { k: 'br', cls: '-right-px -bottom-px border-r-2 border-b-2 rounded-br-sm' },
] as const

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
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
  const [monitorId] = useState(readMonitorId)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })
  const [selection, setSelection] = useState<ScreenshotRect>({ x: 0, y: 0, width: 1, height: 1 })
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [cursor, setCursor] = useState<CursorInfo | null>(null)
  const [colorHex, setColorHex] = useState<string | null>(null)
  const [windowTargets, setWindowTargets] = useState<ScreenshotWindowTarget[]>([])
  const [smartTarget, setSmartTarget] = useState<SmartScreenshotTarget | null>(null)
  const claimedRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const moveRafRef = useRef<number | null>(null)
  const pendingSelectionRef = useRef<ScreenshotRect | null>(null)
  const pendingCursorRef = useRef<CursorInfo | null>(null)
  const smartTargetRef = useRef<SmartScreenshotTarget | null>(null)
  const pressedTargetRef = useRef<SmartScreenshotTarget | null>(null)
  const aimRevisionRef = useRef(0)
  const elementQueryRunningRef = useRef(false)
  const pendingElementQueryRef = useRef<ElementQuery | null>(null)
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const cancellingRef = useRef(false)

  // Re-arm the overlay for a new capture: drop the previous frame and adopt the
  // new session id, which re-runs the capture-read effect below.
  const activate = useCallback((nextSessionId: string) => {
    if (sessionIdRef.current === nextSessionId) return
    sessionIdRef.current = nextSessionId
    setImageUrl(null)
    setImageSize({ width: 1, height: 1 })
    setSelection({ x: 0, y: 0, width: 1, height: 1 })
    setDragStart(null)
    setEditing(false)
    setBusy(false)
    setCursor(null)
    setColorHex(null)
    setWindowTargets([])
    setSmartTarget(null)
    smartTargetRef.current = null
    pressedTargetRef.current = null
    activePointerIdRef.current = null
    cancellingRef.current = false
    aimRevisionRef.current += 1
    if (moveRafRef.current != null) {
      window.cancelAnimationFrame(moveRafRef.current)
      moveRafRef.current = null
    }
    pendingSelectionRef.current = null
    pendingCursorRef.current = null
    pendingElementQueryRef.current = null
    imageCanvasRef.current = null
    claimedRef.current = false
    setSessionId(nextSessionId)
  }, [])

  useEffect(() => {
    let disposed = false
    const unlistenPromise = listen<{ sessionId: string }>(
      TAURI_SCREENSHOT_OVERLAY_BEGIN_EVENT,
      (event) => { if (!disposed) activate(event.payload.sessionId) }
    )
    // Cold-boot catch-up: a session may already be active by the time we mount
    // (first capture, or right after a layout rebuild), so we miss the broadcast.
    void invoke<string | null>('screenshot_active_session')
      .then((active) => { if (!disposed && active) activate(active) })
      .catch(() => undefined)
    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [activate])

  useEffect(() => {
    if (!sessionId) return
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

  // Redraw the magnifier from the frozen frame whenever the cursor moves.
  useEffect(() => {
    const source = imageCanvasRef.current
    const loupe = loupeCanvasRef.current
    if (!source || !loupe || !cursor) return
    const ctx = loupe.getContext('2d')
    if (!ctx) return
    const srcSize = Math.round(LOUPE_SIZE / LOUPE_ZOOM)
    const half = Math.floor(srcSize / 2)
    const cx = Math.round(cursor.imgX)
    const cy = Math.round(cursor.imgY)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE)
    ctx.drawImage(source, cx - half, cy - half, srcSize, srcSize, 0, 0, LOUPE_SIZE, LOUPE_SIZE)
    // Highlight the exact center pixel + faint cross guides.
    const center = Math.floor(LOUPE_SIZE / 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = 1
    ctx.strokeRect(center - LOUPE_ZOOM / 2 - 0.5, center - LOUPE_ZOOM / 2 - 0.5, LOUPE_ZOOM + 1, LOUPE_ZOOM + 1)
    ctx.strokeStyle = ACCENT
    ctx.strokeRect(center - LOUPE_ZOOM / 2 + 0.5, center - LOUPE_ZOOM / 2 + 0.5, LOUPE_ZOOM - 1, LOUPE_ZOOM - 1)
    try {
      const [r, g, b] = source.getContext('2d')!.getImageData(cx, cy, 1, 1).data
      setColorHex(toHex(r, g, b))
    } catch {
      // getImageData can throw if the canvas is empty mid-rebuild; ignore.
    }
  }, [cursor])

  const pointFromEvent = useCallback((event: { clientX: number; clientY: number }) => {
    const surface = surfaceRef.current
    if (!surface) return { x: 0, y: 0 }
    const rect = surface.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(imageSize.width, (event.clientX - rect.left) * imageSize.width / rect.width)),
      y: Math.max(0, Math.min(imageSize.height, (event.clientY - rect.top) * imageSize.height / rect.height)),
    }
  }, [imageSize.height, imageSize.width])

  // xcap returns native z-order, so the first containing window is the visible one.
  const findWindowTargetAt = useCallback((x: number, y: number) => (
    findTopmostScreenshotWindow(windowTargets, x, y)
  ), [windowTargets])

  const updateSmartTarget = useCallback((target: SmartScreenshotTarget | null) => {
    smartTargetRef.current = target
    setSmartTarget(target)
  }, [])

  const queueElementQuery = useCallback((query: ElementQuery) => {
    pendingElementQueryRef.current = query
    if (elementQueryRunningRef.current) return
    elementQueryRunningRef.current = true
    void (async () => {
      try {
        while (pendingElementQueryRef.current) {
          const current = pendingElementQueryRef.current
          pendingElementQueryRef.current = null
          const rect = await invoke<ScreenshotRect | null>('screenshot_element_rect', {
            sessionId: current.sessionId,
            monitorId: current.monitorId,
            windowId: current.windowId,
            x: current.x,
            y: current.y,
          }).catch(() => null)
          const target = rect
            ? { windowId: current.windowId, rect, revision: current.revision }
            : null
          if (isCurrentScreenshotTarget(
            target,
            aimRevisionRef.current,
            current.windowId,
            current.x,
            current.y
          )) {
            updateSmartTarget(target)
          }
        }
      } finally {
        elementQueryRunningRef.current = false
      }
    })()
  }, [updateSmartTarget])

  const aimAt = useCallback((nextCursor: CursorInfo) => {
    const revision = ++aimRevisionRef.current
    const windowTarget = findWindowTargetAt(nextCursor.imgX, nextCursor.imgY)
    if (!windowTarget || !sessionId) {
      pendingElementQueryRef.current = null
      updateSmartTarget(null)
      return
    }
    const fallback = { windowId: windowTarget.id, rect: windowTarget.rect, revision }
    updateSmartTarget(fallback)
    if (isWindowsPlatform()) {
      queueElementQuery({
        ...fallback,
        sessionId,
        monitorId,
        x: Math.floor(nextCursor.imgX),
        y: Math.floor(nextCursor.imgY),
      })
    }
  }, [findWindowTargetAt, monitorId, queueElementQuery, sessionId, updateSmartTarget])

  const claim = useCallback(async (): Promise<boolean> => {
    if (claimedRef.current) return true
    if (!sessionId) return false
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
    if (cancellingRef.current || !sessionId) return
    cancellingRef.current = true
    setBusy(true)
    if (moveRafRef.current != null) {
      window.cancelAnimationFrame(moveRafRef.current)
      moveRafRef.current = null
    }
    pendingSelectionRef.current = null
    pendingCursorRef.current = null
    pressedTargetRef.current = null
    setDragStart(null)

    const pointerId = activePointerIdRef.current
    activePointerIdRef.current = null
    const surface = surfaceRef.current
    if (pointerId != null && surface?.hasPointerCapture(pointerId)) {
      surface.releasePointerCapture(pointerId)
    }

    void invoke('screenshot_capture_cancel', { sessionId }).catch(() => {
      cancellingRef.current = false
      setBusy(false)
    })
  }, [sessionId])

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
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [cancel, claim, editing, enterEditing, imageSize.height, imageSize.width, selection])

  // One rAF coalesces both cursor (loupe/crosshair) and selection updates so a
  // fast drag or aim can't outrun React's render.
  const flushPointer = useCallback(() => {
    if (moveRafRef.current != null) return
    moveRafRef.current = window.requestAnimationFrame(() => {
      moveRafRef.current = null
      const nextCursor = pendingCursorRef.current
      pendingCursorRef.current = null
      if (nextCursor) {
        setCursor(nextCursor)
        if (!dragStart) aimAt(nextCursor)
      }
      const nextSelection = pendingSelectionRef.current
      pendingSelectionRef.current = null
      if (nextSelection) setSelection(nextSelection)
    })
  }, [aimAt, dragStart])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerIdRef.current = event.pointerId
    void claim()
    const point = pointFromEvent(event)
    const target = smartTargetRef.current
    pressedTargetRef.current = target && screenshotRectContainsPoint(target.rect, point.x, point.y)
      ? target
      : null
    aimRevisionRef.current += 1
    pendingElementQueryRef.current = null
    updateSmartTarget(null)
    setCursor({ imgX: point.x, imgY: point.y, clientX: event.clientX, clientY: event.clientY })
    setDragStart(point)
    setSelection({ x: point.x, y: point.y, width: 1, height: 1 })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Read synchronously — the pointer event is recycled after the handler.
    const point = pointFromEvent(event)
    pendingCursorRef.current = { imgX: point.x, imgY: point.y, clientX: event.clientX, clientY: event.clientY }
    if (dragStart) {
      pendingSelectionRef.current = clampScreenshotRect(
        normalizeScreenshotRect(dragStart, point),
        imageSize.width,
        imageSize.height
      )
    }
    flushPointer()
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart || activePointerIdRef.current !== event.pointerId) return
    activePointerIdRef.current = null
    if (moveRafRef.current != null) {
      window.cancelAnimationFrame(moveRafRef.current)
      moveRafRef.current = null
    }
    pendingSelectionRef.current = null
    const upPoint = pointFromEvent(event)
    const nextSelection = clampScreenshotRect(
      normalizeScreenshotRect(dragStart, upPoint),
      imageSize.width,
      imageSize.height
    )
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragStart(null)
    if (nextSelection.width >= 2 && nextSelection.height >= 2) {
      pressedTargetRef.current = null
      void enterEditing(nextSelection)
      return
    }
    // A click without a drag uses the exact highlighted element when it is still
    // valid, otherwise it safely falls back to the visible top-level window.
    const windowTarget = findWindowTargetAt(upPoint.x, upPoint.y)
    const pressedTarget = pressedTargetRef.current
    pressedTargetRef.current = null
    const targetRect = pressedTarget && windowTarget?.id === pressedTarget.windowId &&
      screenshotRectContainsPoint(pressedTarget.rect, upPoint.x, upPoint.y)
      ? pressedTarget.rect
      : windowTarget?.rect
    if (targetRect) void enterEditing(targetRect)
  }

  const onPointerInterrupted = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current === event.pointerId) cancel()
  }

  const onPointerLeave = () => {
    if (dragStart) return
    aimRevisionRef.current += 1
    pendingElementQueryRef.current = null
    updateSmartTarget(null)
    pendingCursorRef.current = null
    setCursor(null)
  }

  const selectionStyle = {
    left: `${selection.x / imageSize.width * 100}%`,
    top: `${selection.y / imageSize.height * 100}%`,
    width: `${selection.width / imageSize.width * 100}%`,
    height: `${selection.height / imageSize.height * 100}%`,
  }
  // While aiming (no drag, selection still covers the whole frame) we dim the
  // whole screen; once a region is being drawn the selection box cuts it out.
  const showSelectionBox =
    dragStart != null || selection.width < imageSize.width || selection.height < imageSize.height
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
  const badgeAbove = (selection.y / imageSize.height) * viewportHeight > 34
  const loupeStyle = (() => {
    if (!cursor) return undefined
    const margin = 22
    const panelW = LOUPE_SIZE + 2
    const panelH = LOUPE_SIZE + 30
    const vw = typeof window === 'undefined' ? 0 : window.innerWidth
    const vh = viewportHeight
    let left = cursor.clientX + margin
    let top = cursor.clientY + margin
    if (left + panelW > vw - 8) left = cursor.clientX - margin - panelW
    if (top + panelH > vh - 8) top = cursor.clientY - margin - panelH
    return { left: Math.max(8, left), top: Math.max(8, top) }
  })()
  const hoveredWindow = !dragStart && cursor && smartTarget &&
    screenshotRectContainsPoint(smartTarget.rect, cursor.imgX, cursor.imgY)
    ? smartTarget.rect
    : null

  if (editing && imageUrl) {
    return (
      <ScreenshotEditor
        imageUrl={imageUrl}
        width={imageSize.width}
        height={imageSize.height}
        initialCrop={selection}
        onCancel={cancel}
        onCopyDismiss={() => { if (sessionId) void invoke('screenshot_capture_dismiss', { sessionId }) }}
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
          onPointerCancel={onPointerInterrupted}
          onLostPointerCapture={onPointerInterrupted}
          onPointerLeave={onPointerLeave}
        >
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="h-full w-full"
            onLoad={(event) => {
              const img = event.currentTarget
              const width = img.naturalWidth
              const height = img.naturalHeight
              setImageSize({ width, height })
              setSelection({ x: 0, y: 0, width, height })
              // Offscreen copy of the frozen frame powers the pixel-accurate loupe.
              const canvas = document.createElement('canvas')
              canvas.width = width
              canvas.height = height
              const context = canvas.getContext('2d', { willReadFrequently: true })
              if (context) {
                context.drawImage(img, 0, 0)
                imageCanvasRef.current = canvas
              }
              const overlay = getCurrentWindow()
              const activeSession = sessionId
              void overlay.show()
                .then(async () => {
                  await invoke('screenshot_hide_main').catch(() => undefined)
                  await overlay.setFocus().catch(() => undefined)
                  cancelButtonRef.current?.focus()
                  // Fetch window rects after the editor is hidden so it isn't listed.
                  if (activeSession) {
                    void invoke<ScreenshotWindowTarget[]>('screenshot_window_targets', { sessionId: activeSession, monitorId })
                      .then(setWindowTargets)
                      .catch(() => setWindowTargets([]))
                  }
                })
                .catch(() => invoke('screenshot_capture_cancel', { sessionId }))
            }}
            onError={() => void invoke('screenshot_capture_cancel', { sessionId })}
          />

          {!showSelectionBox && <div className="pointer-events-none absolute inset-0 bg-black/45" />}

          {hoveredWindow && !showSelectionBox && (
            <div
              className="pointer-events-none absolute border border-[#1685ff]/80 bg-[#1685ff]/10 ring-1 ring-[#1685ff]/25"
              style={{
                left: `${hoveredWindow.x / imageSize.width * 100}%`,
                top: `${hoveredWindow.y / imageSize.height * 100}%`,
                width: `${hoveredWindow.width / imageSize.width * 100}%`,
                height: `${hoveredWindow.height / imageSize.height * 100}%`,
              }}
            />
          )}

          {cursor && !dragStart && (
            <>
              <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/40 mix-blend-difference" style={{ left: cursor.clientX }} />
              <div className="pointer-events-none absolute left-0 right-0 h-px bg-white/40 mix-blend-difference" style={{ top: cursor.clientY }} />
            </>
          )}

          {showSelectionBox && (
            <div
              className="pointer-events-none absolute shadow-[0_0_0_1.5px_#1685ff,0_0_0_9999px_rgba(0,0,0,0.5)]"
              style={selectionStyle}
            >
              <div className="absolute inset-0 opacity-50">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
              </div>
              {CORNERS.map((corner) => (
                <span
                  key={corner.k}
                  className={`absolute h-3 w-3 ${corner.cls}`}
                  style={{ borderColor: ACCENT }}
                />
              ))}
              <span
                className={`absolute left-0 rounded-md bg-black/80 px-2 py-1 text-xs font-semibold tabular-nums text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm ${badgeAbove ? '-top-8' : 'top-1.5 left-1.5'}`}
              >
                {Math.round(selection.width)} × {Math.round(selection.height)}
              </span>
            </div>
          )}

          {cursor && (
            <div className="pointer-events-none absolute z-20" style={loupeStyle}>
              <div className="overflow-hidden rounded-xl border border-white/15 bg-neutral-950/80 shadow-2xl ring-1 ring-black/50 backdrop-blur-md">
                <canvas
                  ref={loupeCanvasRef}
                  width={LOUPE_SIZE}
                  height={LOUPE_SIZE}
                  className="block"
                  style={{ width: LOUPE_SIZE, height: LOUPE_SIZE, imageRendering: 'pixelated' }}
                />
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-medium tabular-nums text-white/90">
                  <span>{Math.round(cursor.imgX)}, {Math.round(cursor.imgY)}</span>
                  {colorHex && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm border border-white/30" style={{ backgroundColor: colorHex }} />
                      <span className="uppercase tracking-wide">{colorHex}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {imageUrl && !showSelectionBox && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-neutral-950/70 px-4 py-2.5 text-sm font-medium tracking-wide text-white/90 shadow-2xl ring-1 ring-black/40 backdrop-blur-md">
          {t('screenshot.capture.hint')}
        </div>
      )}
      <div className="absolute right-4 top-4 z-30">
        <button
          ref={cancelButtonRef}
          type="button"
          onClick={cancel}
          disabled={busy}
          aria-label={t('screenshot.actions.cancel')}
          title={t('screenshot.actions.cancel')}
          className="cursor-pointer rounded-xl border border-white/15 bg-neutral-950/60 p-2.5 text-white shadow-2xl ring-1 ring-black/40 backdrop-blur-xl transition-all duration-200 hover:bg-neutral-900/80 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1685ff]"
        >
          <AppIcon name="x" size={18} />
        </button>
      </div>
    </main>
  )
}
