import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import AppIcon from '../Icons/AppIcon.tsx'
import { clampScreenshotRect, normalizeScreenshotRect, type ScreenshotRect } from '../../lib/screenshot.ts'
import {
  annotationBounds,
  createScreenshotEditSnapshot,
  drawScreenshotRasterPreview,
  moveAnnotation,
  moveScreenshotCrop,
  removeAnnotation,
  resizeAnnotation,
  resizeScreenshotCrop,
  screenshotToolForKey,
  updateAnnotation,
  type ScreenshotAnnotation,
  type ScreenshotCropHandle,
  type ScreenshotEditSnapshot,
  type ScreenshotTool,
} from './screenshotModel.ts'

interface Props {
  imageUrl: string
  width: number
  height: number
  initialCrop: ScreenshotRect
  onCancel: () => void
  onConfirm: (snapshot: ScreenshotEditSnapshot, image: HTMLImageElement) => Promise<void>
}

interface Point {
  x: number
  y: number
}

interface DragState {
  mode: 'draw' | 'text' | 'move' | 'resize' | 'crop-move' | 'crop-resize'
  start: Point
  base: ScreenshotEditSnapshot
  annotationId?: string
  cropHandle?: ScreenshotCropHandle
}

interface TextDraft {
  annotationId: string | null
  x: number
  y: number
  value: string
}

const TOOLS: ScreenshotTool[] = ['select', 'crop', 'arrow', 'rectangle', 'text', 'mosaic']
const TOOL_ICONS = {
  select: 'cursor',
  crop: 'crop',
  arrow: 'arrowUpRight',
  rectangle: 'rectangle',
  text: 'text',
  mosaic: 'mosaic',
} as const

function annotationId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function replaceAnnotation(snapshot: ScreenshotEditSnapshot, annotation: ScreenshotAnnotation): ScreenshotEditSnapshot {
  return updateAnnotation(snapshot, annotation)
}

export default function ScreenshotEditor({ imageUrl, width, height, initialCrop, onCancel, onConfirm }: Props) {
  const { t } = useTranslation()
  const initial = useMemo(() => createScreenshotEditSnapshot(width, height, initialCrop), [height, initialCrop, width])
  const [history, setHistory] = useState<ScreenshotEditSnapshot[]>([initial])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [preview, setPreview] = useState<ScreenshotEditSnapshot | null>(null)
  const [tool, setTool] = useState<ScreenshotTool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [color, setColor] = useState('#ff3b30')
  const [size, setSize] = useState(4)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)
  const textDraftRef = useRef<TextDraft | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [stageScale, setStageScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstToolRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  const updateTextDraft = (next: TextDraft | null) => {
    textDraftRef.current = next
    setTextDraft(next)
  }

  const committed = history[historyIndex]
  const snapshot = preview ?? committed
  const selected = snapshot.annotations.find((annotation) => annotation.id === selectedId) ?? null

  const commit = useCallback((next: ScreenshotEditSnapshot) => {
    setHistory((current) => [...current.slice(0, historyIndex + 1), next])
    setHistoryIndex((current) => current + 1)
    setPreview(null)
  }, [historyIndex])

  const undo = useCallback(() => {
    if (historyIndex === 0) return
    setHistoryIndex((current) => current - 1)
    setSelectedId(null)
  }, [historyIndex])

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    setHistoryIndex((current) => current + 1)
    setSelectedId(null)
  }, [history.length, historyIndex])

  useEffect(() => {
    const nextImage = new Image()
    nextImage.onload = () => setImage(nextImage)
    nextImage.src = imageUrl
  }, [imageUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return
    drawScreenshotRasterPreview(context, image, width, height, snapshot)
  }, [height, image, snapshot, width])

  useLayoutEffect(() => {
    const updateScale = () => {
      const maxWidth = Math.max(320, window.innerWidth - 24)
      const maxHeight = Math.max(240, window.innerHeight - 24)
      setStageScale(Math.min(1, maxWidth / width, maxHeight / height))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [height, width])

  useEffect(() => {
    firstToolRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    textInputRef.current?.focus({ preventScroll: true })
  }, [textDraft])

  const pointFromEvent = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: Math.max(0, Math.min(width, (event.clientX - rect.left) * width / rect.width)),
      y: Math.max(0, Math.min(height, (event.clientY - rect.top) * height / rect.height)),
    }
  }

  const createDefaultAnnotation = useCallback((requestedTool: ScreenshotTool) => {
    const crop = committed.crop
    const rect = {
      x: crop.x + crop.width * 0.3,
      y: crop.y + crop.height * 0.3,
      width: Math.max(24, crop.width * 0.4),
      height: Math.max(18, crop.height * 0.25),
    }
    if (requestedTool === 'text') {
      updateTextDraft({ annotationId: null, x: rect.x, y: rect.y + Math.max(14, size * 5), value: '' })
      return
    }
    if (requestedTool === 'crop') {
      setSelectedId(null)
      return
    }
    if (requestedTool === 'select') return

    const id = annotationId()
    const annotation: ScreenshotAnnotation = requestedTool === 'arrow'
      ? { id, type: 'arrow', color, size, x1: rect.x, y1: rect.y + rect.height, x2: rect.x + rect.width, y2: rect.y }
      : requestedTool === 'rectangle'
        ? { id, type: 'rectangle', color, size, rect }
        : { id, type: 'mosaic', color, size, rect }
    commit({ ...committed, annotations: [...committed.annotations, annotation] })
    setSelectedId(id)
  }, [color, commit, committed, size])

  const applyKeyboardTransform = useCallback((dx: number, dy: number, resize: boolean) => {
    if (tool === 'crop' && !selected) {
      commit({
        ...committed,
        crop: clampScreenshotRect(
          resize
            ? { ...committed.crop, width: committed.crop.width + dx, height: committed.crop.height + dy }
            : moveScreenshotCrop(committed.crop, dx, dy, width, height),
          width,
          height
        ),
      })
      return
    }
    if (!selected) return
    const next = resize
      ? resizeAnnotation(selected, dx, dy, width, height)
      : moveAnnotation(selected, dx, dy, width, height)
    commit(replaceAnnotation(committed, next))
  }, [commit, committed, height, selected, tool, width])

  const confirm = useCallback(async (snapshotOverride?: ScreenshotEditSnapshot) => {
    if (busy || !image) return
    setBusy(true)
    setStatus(t('screenshot.editor.exporting'))
    try {
      await onConfirm(snapshotOverride ?? committed, image)
    } finally {
      setBusy(false)
      setStatus('')
    }
  }, [busy, committed, image, onConfirm, t])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      const target = event.target
      const editingText = target instanceof HTMLInputElement && target.type !== 'color' && target.type !== 'range'
      const interactiveControl = target instanceof Element && Boolean(target.closest('button, input, select, textarea'))
      const primary = event.metaKey || event.ctrlKey

      if (editingText || event.isComposing) return

      if (event.key === 'Enter' && interactiveControl) return
      if (event.key === 'Enter') {
        event.preventDefault()
        void confirm()
        return
      }
      if (primary && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (primary && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      const nextTool = screenshotToolForKey(event.key)
      if (nextTool && !primary && !event.altKey) {
        event.preventDefault()
        setTool(nextTool)
        setStatus(t(`screenshot.tools.${nextTool}`))
        return
      }
      if (event.key === ' ' && !primary && !interactiveControl) {
        event.preventDefault()
        if (selected?.type === 'text') {
          startTextEdit(selected)
          return
        }
        createDefaultAnnotation(tool)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        commit(removeAnnotation(committed, selectedId))
        setSelectedId(null)
        return
      }
      if (!event.key.startsWith('Arrow')) return
      event.preventDefault()
      const step = primary ? 10 : 1
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      applyKeyboardTransform(dx, dy, event.shiftKey)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [applyKeyboardTransform, commit, committed, confirm, createDefaultAnnotation, onCancel, redo, selected, selectedId, t, tool, undo])

  useEffect(() => {
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [])

  const beginDraw = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || tool === 'select') {
      if (event.target === event.currentTarget) setSelectedId(null)
      return
    }
    const point = pointFromEvent(event)
    if (tool === 'text') {
      event.currentTarget.setPointerCapture(event.pointerId)
      setDrag({ mode: 'text', start: point, base: committed })
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ mode: 'draw', start: point, base: committed })
  }

  const beginAnnotationDrag = (
    event: ReactPointerEvent<SVGElement>,
    annotation: ScreenshotAnnotation,
    mode: 'move' | 'resize'
  ) => {
    event.stopPropagation()
    if (annotation.type === 'text' && event.detail > 1) {
      startTextEdit(annotation)
      return
    }
    const svg = event.currentTarget.ownerSVGElement
    svg?.setPointerCapture(event.pointerId)
    setSelectedId(annotation.id)
    setColor(annotation.color)
    setSize(annotation.type === 'text' ? Math.max(2, Math.min(20, annotation.size / 5)) : annotation.size)
    setTool('select')
    setDrag({ mode, start: pointFromEvent(event), base: committed, annotationId: annotation.id })
  }

  const beginCropDrag = (
    event: ReactPointerEvent<SVGElement>,
    mode: 'crop-move' | 'crop-resize',
    cropHandle?: ScreenshotCropHandle
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const svg = event.currentTarget.ownerSVGElement
    svg?.setPointerCapture(event.pointerId)
    setSelectedId(null)
    setTool('crop')
    setDrag({ mode, start: pointFromEvent(event), base: committed, cropHandle })
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return
    const point = pointFromEvent(event)
    const dx = point.x - drag.start.x
    const dy = point.y - drag.start.y
    if (drag.mode === 'text') return
    if (drag.mode === 'crop-move') {
      setPreview({
        ...drag.base,
        crop: moveScreenshotCrop(drag.base.crop, dx, dy, width, height),
      })
      return
    }
    if (drag.mode === 'crop-resize' && drag.cropHandle) {
      setPreview({
        ...drag.base,
        crop: resizeScreenshotCrop(drag.base.crop, drag.cropHandle, point, width, height),
      })
      return
    }
    if (drag.mode === 'draw') {
      const rect = clampScreenshotRect(normalizeScreenshotRect(drag.start, point), width, height)
      if (tool === 'crop') {
        setPreview({ ...drag.base, crop: rect })
        return
      }
      const id = 'drawing'
      const annotation: ScreenshotAnnotation = tool === 'arrow'
        ? { id, type: 'arrow', color, size, x1: drag.start.x, y1: drag.start.y, x2: point.x, y2: point.y }
        : tool === 'rectangle'
          ? { id, type: 'rectangle', color, size, rect }
          : { id, type: 'mosaic', color, size, rect }
      setPreview({ ...drag.base, annotations: [...drag.base.annotations, annotation] })
      return
    }

    const annotation = drag.base.annotations.find((item) => item.id === drag.annotationId)
    if (!annotation) return
    const next = drag.mode === 'move'
      ? moveAnnotation(annotation, dx, dy, width, height)
      : resizeAnnotation(annotation, dx, dy, width, height)
    setPreview(replaceAnnotation(drag.base, next))
  }

  const endPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag.mode === 'text') {
      setDrag(null)
      updateTextDraft({ annotationId: null, x: drag.start.x, y: drag.start.y, value: '' })
      return
    }
    const next = preview
    setDrag(null)
    if (!next) return

    if (drag.mode === 'draw' && tool !== 'crop') {
      const drawn = next.annotations[next.annotations.length - 1]
      const bounds = drawn ? annotationBounds(drawn) : null
      const largeEnough = drawn?.type === 'arrow'
        ? Math.hypot(drawn.x2 - drawn.x1, drawn.y2 - drawn.y1) >= 2
        : !!bounds && bounds.width >= 2 && bounds.height >= 2
      if (!drawn || !largeEnough) {
        setPreview(null)
        return
      }
      const id = annotationId()
      const finished = { ...drawn, id } as ScreenshotAnnotation
      commit({ ...next, annotations: [...next.annotations.slice(0, -1), finished] })
      setSelectedId(id)
      return
    }
    commit(next)
  }

  const commitText = () => {
    const draft = textDraftRef.current
    if (!draft) return committed
    textDraftRef.current = null
    const value = draft.value.trim()
    if (!value) {
      if (draft.annotationId) {
        const next = removeAnnotation(committed, draft.annotationId)
        commit(next)
        setSelectedId(null)
        setTextDraft(null)
        return next
      }
      setTextDraft(null)
      return committed
    }
    const id = draft.annotationId ?? annotationId()
    const annotation = moveAnnotation({
      id,
      type: 'text',
      x: draft.x,
      y: draft.y,
      text: value,
      color,
      size: Math.max(14, size * 5),
    }, 0, 0, width, height)
    const next = draft.annotationId
      ? replaceAnnotation(committed, annotation)
      : { ...committed, annotations: [...committed.annotations, annotation] }
    commit(next)
    setSelectedId(id)
    setTextDraft(null)
    return next
  }

  function startTextEdit(annotation: Extract<ScreenshotAnnotation, { type: 'text' }>) {
    setDrag(null)
    setSelectedId(annotation.id)
    setColor(annotation.color)
    setSize(Math.max(2, Math.min(20, annotation.size / 5)))
    updateTextDraft({
      annotationId: annotation.id,
      x: annotation.x,
      y: annotation.y,
      value: annotation.text,
    })
  }

  const editTextAnnotation = (event: ReactMouseEvent<SVGElement>, annotation: Extract<ScreenshotAnnotation, { type: 'text' }>) => {
    event.preventDefault()
    event.stopPropagation()
    startTextEdit(annotation)
  }

  const changeColor = (nextColor: string) => {
    setColor(nextColor)
    if (selected) commit(replaceAnnotation(committed, { ...selected, color: nextColor }))
  }

  const changeSize = (nextSize: number) => {
    setSize(nextSize)
    if (!selected) return
    commit(replaceAnnotation(committed, {
      ...selected,
      size: selected.type === 'text' ? Math.max(14, nextSize * 5) : nextSize,
    }))
  }

  const selectedBounds = selected ? annotationBounds(selected) : null
  const canSelectAnnotations = tool === 'select'
  const crop = snapshot.crop
  const cropPath = `M0 0H${width}V${height}H0Z M${crop.x} ${crop.y}V${crop.y + crop.height}H${crop.x + crop.width}V${crop.y}Z`
  const cropHandles: Array<{ handle: ScreenshotCropHandle; x: number; y: number; cursor: string }> = [
    { handle: 'nw', x: crop.x, y: crop.y, cursor: 'nwse-resize' },
    { handle: 'n', x: crop.x + crop.width / 2, y: crop.y, cursor: 'ns-resize' },
    { handle: 'ne', x: crop.x + crop.width, y: crop.y, cursor: 'nesw-resize' },
    { handle: 'e', x: crop.x + crop.width, y: crop.y + crop.height / 2, cursor: 'ew-resize' },
    { handle: 'se', x: crop.x + crop.width, y: crop.y + crop.height, cursor: 'nwse-resize' },
    { handle: 's', x: crop.x + crop.width / 2, y: crop.y + crop.height, cursor: 'ns-resize' },
    { handle: 'sw', x: crop.x, y: crop.y + crop.height, cursor: 'nesw-resize' },
    { handle: 'w', x: crop.x, y: crop.y + crop.height / 2, cursor: 'ew-resize' },
  ]
  const stageWidth = width * stageScale
  const stageHeight = height * stageScale
  const toolbarWidth = Math.min(560, Math.max(300, window.innerWidth - 24))
  const cropCenter = (crop.x + crop.width / 2) * stageScale
  const toolbarLeft = stageWidth <= toolbarWidth
    ? stageWidth / 2
    : Math.max(toolbarWidth / 2, Math.min(cropCenter, stageWidth - toolbarWidth / 2))
  const cropBottom = (crop.y + crop.height) * stageScale
  const stageTop = (window.innerHeight - stageHeight) / 2
  const toolbarTop = stageTop + cropBottom + 58 <= window.innerHeight - 8
    ? cropBottom + 10
    : stageTop + crop.y * stageScale >= 58
      ? crop.y * stageScale - 52
      : Math.max(8, stageHeight - 50)

  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-editor-title"
        className="flex h-full w-full items-center justify-center overflow-hidden p-3"
      >
        <h2 id="screenshot-editor-title" className="sr-only">{t('screenshot.editor.title')}</h2>
        <div
          className="relative flex-none overflow-visible bg-black shadow-2xl"
          style={{ width: stageWidth, height: stageHeight }}
        >
          <div className="absolute inset-0 overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            <svg
              className="absolute inset-0 h-full w-full touch-none"
              viewBox={`0 0 ${width} ${height}`}
              onPointerDown={beginDraw}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              aria-label={t('screenshot.editor.canvasLabel')}
              role="application"
            >
              <defs>
                <filter id="handle-shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000" flood-opacity="0.35"/>
                </filter>
              </defs>
              {snapshot.annotations.map((annotation) => {
                if (annotation.type === 'arrow') {
                  return <line key={annotation.id} x1={annotation.x1} y1={annotation.y1} x2={annotation.x2} y2={annotation.y2} stroke="transparent" strokeWidth={Math.max(annotation.size, 12 / stageScale)} strokeLinecap="round" pointerEvents={canSelectAnnotations ? 'stroke' : 'none'} onPointerDown={(event) => beginAnnotationDrag(event, annotation, 'move')} />
                }
                if (annotation.type === 'rectangle') {
                  return <rect key={annotation.id} {...annotation.rect} fill="transparent" stroke="transparent" strokeWidth={Math.max(annotation.size, 12 / stageScale)} pointerEvents={canSelectAnnotations ? 'all' : 'none'} onPointerDown={(event) => beginAnnotationDrag(event, annotation, 'move')} />
                }
                if (annotation.type === 'mosaic') {
                  return <rect key={annotation.id} {...annotation.rect} fill="transparent" stroke={selectedId === annotation.id ? '#1685ff' : 'transparent'} strokeWidth={2 / stageScale} pointerEvents={canSelectAnnotations ? 'all' : 'none'} onPointerDown={(event) => beginAnnotationDrag(event, annotation, 'move')} />
                }
                const bounds = annotationBounds(annotation)
                return <rect key={annotation.id} {...bounds} fill="transparent" pointerEvents={canSelectAnnotations ? 'all' : 'none'} onPointerDown={(event) => beginAnnotationDrag(event, annotation, 'move')} onDoubleClick={(event) => editTextAnnotation(event, annotation)} />
              })}
              <path d={cropPath} fill="rgba(0,0,0,0.44)" fillRule="evenodd" pointerEvents="none" />
              <rect x={crop.x} y={crop.y} width={crop.width} height={crop.height} fill="none" stroke="#1685ff" strokeWidth={Math.max(2, 2 / stageScale)} pointerEvents="none" />
              <rect
                x={crop.x}
                y={crop.y}
                width={crop.width}
                height={crop.height}
                fill="none"
                stroke="transparent"
                strokeWidth={14 / stageScale}
                pointerEvents="stroke"
                className="cursor-move"
                onPointerDown={(event) => beginCropDrag(event, 'crop-move')}
              />
              {cropHandles.map(({ handle, x, y, cursor }) => (
                <circle
                  key={handle}
                  cx={x}
                  cy={y}
                  r={6 / stageScale}
                  fill="#fff"
                  stroke="#1685ff"
                  strokeWidth={2 / stageScale}
                  filter="url(#handle-shadow)"
                  style={{ cursor }}
                  onPointerDown={(event) => beginCropDrag(event, 'crop-resize', handle)}
                />
              ))}
              {canSelectAnnotations && selected && selectedBounds && (
                <g>
                  <rect x={selectedBounds.x} y={selectedBounds.y} width={selectedBounds.width} height={selectedBounds.height} fill="none" stroke="#1685ff" strokeWidth={Math.max(1, 1 / stageScale)} strokeDasharray={`${5 / stageScale} ${3 / stageScale}`} pointerEvents="none" />
                  <rect
                    x={selectedBounds.x + selectedBounds.width - 6 / stageScale}
                    y={selectedBounds.y + selectedBounds.height - 6 / stageScale}
                    width={12 / stageScale}
                    height={12 / stageScale}
                    rx={6 / stageScale}
                    fill="#fff"
                    stroke="#1685ff"
                    strokeWidth={2 / stageScale}
                    filter="url(#handle-shadow)"
                    className="cursor-nwse-resize"
                    onPointerDown={(event) => beginAnnotationDrag(event, selected, 'resize')}
                  />
                </g>
              )}
            </svg>
            <div
              className="pointer-events-none absolute rounded-full border border-white/10 bg-neutral-950/90 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white/95 shadow-lg backdrop-blur-md"
              style={{
                left: Math.max(0, crop.x * stageScale),
                top: Math.max(4, crop.y * stageScale - 28),
              }}
            >
              {Math.round(crop.width)} × {Math.round(crop.height)}
            </div>
            {textDraft && (
              <input
                ref={textInputRef}
                type="text"
                value={textDraft.value}
                onChange={(event) => updateTextDraft({ ...textDraft, value: event.target.value })}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    onCancel()
                    return
                  }
                  if (event.nativeEvent.isComposing) return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    const next = commitText()
                    if (event.metaKey || event.ctrlKey) void confirm(next)
                  }
                }}
                onBlur={commitText}
                aria-label={t('screenshot.editor.textInput')}
                placeholder={t('screenshot.editor.textPlaceholder')}
                size={Math.max(12, Math.min(40, Array.from(textDraft.value).length + 1))}
                autoFocus
                className="pointer-events-auto absolute z-30 rounded-lg border border-[#1685ff] bg-white/95 px-2 py-1 text-slate-950 shadow-2xl backdrop-blur-md outline-none ring-4 ring-[#1685ff]/20 transition-all duration-200"
                style={{
                  left: Math.min(textDraft.x * stageScale, Math.max(4, stageWidth - 140)),
                  top: Math.max(4, (textDraft.y - Math.max(14, size * 5)) * stageScale),
                  maxWidth: `calc(100% - ${Math.min(textDraft.x * stageScale, Math.max(4, stageWidth - 140)) + 4}px)`,
                  fontSize: Math.max(14, size * 5) * stageScale,
                }}
              />
            )}
          </div>

          <div
            className="absolute z-20 flex max-w-[calc(100vw-24px)] items-center gap-1.5 overflow-x-auto rounded-2xl bg-neutral-900/90 p-1.5 text-neutral-200 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl transition-all duration-300 ease-out"
            role="toolbar"
            aria-label={t('screenshot.editor.toolsLabel')}
            style={{ left: toolbarLeft, top: toolbarTop, transform: 'translateX(-50%)' }}
          >
            {TOOLS.map((item, index) => (
              <button
                key={item}
                ref={index === 0 ? firstToolRef : undefined}
                type="button"
                aria-pressed={tool === item}
                aria-label={t(`screenshot.tools.${item}`)}
                title={`${t(`screenshot.tools.${item}`)} (${item === 'select' ? 'V' : item[0].toUpperCase()})`}
                onClick={() => setTool(item)}
                className={`flex h-10 w-10 p-0 flex-none cursor-pointer items-center justify-center rounded-xl transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1685ff] ${tool === item ? 'bg-[#1685ff] text-white shadow-md shadow-[#1685ff]/35' : 'hover:bg-neutral-800 hover:text-white'}`}
              >
                <AppIcon name={TOOL_ICONS[item]} size={19} />
              </button>
            ))}
            <span className="mx-1 h-6 w-px flex-none bg-neutral-800" aria-hidden="true" />
            <input
              type="color"
              value={color}
              onChange={(event) => changeColor(event.target.value)}
              aria-label={t('screenshot.editor.color')}
              title={t('screenshot.editor.color')}
              className="h-9 w-9 flex-none cursor-pointer rounded-lg border border-neutral-700 bg-transparent p-0.5 shadow-sm transition-transform duration-200 hover:scale-110 active:scale-95"
            />
            <label className="flex h-10 w-20 flex-none items-center px-1" title={t('screenshot.editor.size')}>
              <span className="sr-only">{t('screenshot.editor.size')}</span>
              <input
                type="range"
                min="2"
                max="20"
                value={size}
                onChange={(event) => changeSize(Number(event.target.value))}
                aria-label={t('screenshot.editor.size')}
                className="w-full cursor-pointer accent-[#1685ff]"
              />
            </label>
            <span className="mx-1 h-6 w-px flex-none bg-neutral-800" aria-hidden="true" />
            {selected?.type === 'text' && (
              <button type="button" onClick={() => startTextEdit(selected)} aria-label={t('screenshot.actions.editText')} title={t('screenshot.actions.editText')} className="flex h-10 w-10 p-0 flex-none cursor-pointer items-center justify-center rounded-xl transition-all duration-200 hover:bg-neutral-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1685ff]">
                <AppIcon name="edit" size={18} />
              </button>
            )}
            <button type="button" onClick={undo} disabled={historyIndex === 0} aria-label={t('commands.undo')} title={t('commands.undo')} className="flex h-10 w-10 p-0 flex-none cursor-pointer items-center justify-center rounded-xl transition-all duration-200 hover:bg-neutral-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1685ff] disabled:cursor-default disabled:opacity-30">
              <AppIcon name="undo" size={18} />
            </button>
            <button type="button" onClick={redo} disabled={historyIndex >= history.length - 1} aria-label={t('commands.redo')} title={t('commands.redo')} className="flex h-10 w-10 p-0 flex-none cursor-pointer items-center justify-center rounded-xl transition-all duration-200 hover:bg-neutral-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1685ff] disabled:cursor-default disabled:opacity-30">
              <AppIcon name="redo" size={18} />
            </button>
            <span className="mx-1 h-6 w-px flex-none bg-neutral-800" aria-hidden="true" />
            <button type="button" onClick={onCancel} disabled={busy} aria-label={t('screenshot.actions.cancel')} title={t('screenshot.actions.cancel')} className="flex h-10 w-10 p-0 flex-none cursor-pointer items-center justify-center rounded-xl transition-all duration-200 hover:bg-red-950/50 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1685ff] disabled:opacity-40">
              <AppIcon name="x" size={19} />
            </button>
            <button type="button" onClick={() => void confirm()} disabled={busy || !image} aria-label={t('screenshot.actions.insert')} aria-keyshortcuts="Enter" title={`${t('screenshot.actions.insert')} (Enter)`} className="flex h-10 w-10 p-0 flex-none cursor-pointer items-center justify-center rounded-xl transition-all duration-200 bg-[#1685ff] text-white shadow-md shadow-[#1685ff]/30 hover:bg-[#087be8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1685ff] disabled:opacity-40 hover:scale-105 active:scale-95">
              <AppIcon name="checkCircle" size={19} />
            </button>
          </div>
        </div>
        <div className="sr-only" aria-live="polite">{status}</div>
      </div>
    </div>,
    document.body
  )
}
