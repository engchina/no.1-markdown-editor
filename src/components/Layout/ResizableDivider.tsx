import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

interface Props {
  onResize: (delta: number, totalWidth: number) => void
  onReset?: () => void
  ariaLabel: string
  ariaValueMin?: number
  ariaValueMax?: number
  ariaValueNow?: number
  ariaValueText?: string
  hint?: string
  variant?: 'sidebar' | 'pane'
}

export const SIDEBAR_DIVIDER_SIZE_PX = 14
export const PANE_DIVIDER_SIZE_PX = 12

const KEYBOARD_STEP_PX = 24
const KEYBOARD_STEP_FAST_PX = 72

function getViewportWidth() {
  return typeof window === 'undefined' ? 0 : window.innerWidth
}

function applyDragCursor() {
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function resetDragCursor() {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

export default function ResizableDivider({
  onResize,
  onReset,
  ariaLabel,
  ariaValueMin,
  ariaValueMax,
  ariaValueNow,
  ariaValueText,
  hint,
  variant = 'pane',
}: Props) {
  const dividerRef = useRef<HTMLDivElement | null>(null)
  const startX = useRef(0)
  const containerWidth = useRef<number>(getViewportWidth())
  const cleanupDragRef = useRef<(() => void) | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(
    () => () => {
      cleanupDragRef.current?.()
    },
    []
  )

  const getContainerWidth = useCallback(() => dividerRef.current?.parentElement?.clientWidth ?? getViewportWidth(), [])

  const handleDoubleClick = useCallback(() => {
    if (!onReset) return
    onReset()
  }, [onReset])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (!onReset) return
        event.preventDefault()
        onReset()
        return
      }

      const step = event.shiftKey ? KEYBOARD_STEP_FAST_PX : KEYBOARD_STEP_PX
      const totalWidth = Math.max(getContainerWidth(), 1)

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onResize(-step, totalWidth)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onResize(step, totalWidth)
      }
    },
    [getContainerWidth, onReset, onResize]
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      cleanupDragRef.current?.()
      event.preventDefault()
      event.currentTarget.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      startX.current = event.clientX
      containerWidth.current = getContainerWidth()
      applyDragCursor()
      setDragging(true)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX.current
        if (delta === 0) return
        startX.current = moveEvent.clientX
        onResize(delta, Math.max(containerWidth.current, 1))
      }

      const finishDrag = () => {
        setDragging(false)
        resetDragCursor()
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', finishDrag)
        window.removeEventListener('pointercancel', finishDrag)
        cleanupDragRef.current = null
      }

      cleanupDragRef.current = finishDrag
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', finishDrag)
      window.addEventListener('pointercancel', finishDrag)
    },
    [getContainerWidth, onResize]
  )

  const sizePx = variant === 'sidebar' ? SIDEBAR_DIVIDER_SIZE_PX : PANE_DIVIDER_SIZE_PX
  const separatorValueProps =
    ariaValueNow === undefined
      ? {}
      : {
          'aria-valuemin': ariaValueMin,
          'aria-valuemax': ariaValueMax,
          'aria-valuenow': ariaValueNow,
          'aria-valuetext': ariaValueText,
        }

  return (
    <div
      ref={dividerRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      data-divider-variant={variant}
      data-dragging={dragging ? 'true' : 'false'}
      className={`panel-divider panel-divider--${variant}`}
      style={{ width: `${sizePx}px`, minWidth: `${sizePx}px` }}
      title={hint ? `${ariaLabel}. ${hint}` : ariaLabel}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      {...separatorValueProps}
    >
      <span className="panel-divider__line" aria-hidden="true" />
      <span className="panel-divider__grip" aria-hidden="true">
        <span className="panel-divider__dot" />
        <span className="panel-divider__dot" />
        <span className="panel-divider__dot" />
      </span>
      {hint ? (
        <span className="panel-divider__hint" aria-hidden="true">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
