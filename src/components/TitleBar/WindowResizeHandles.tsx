import { useCallback } from 'react'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Tauri's ResizeDirection enum values (strings). Kept inline so this module does
// not statically import the window plugin in the browser (dev:web) build.
type ResizeDir =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'NorthEast'
  | 'NorthWest'
  | 'SouthEast'
  | 'SouthWest'

const EDGE = 5
const CORNER = 12

interface HandleSpec {
  dir: ResizeDir
  cursor: string
  style: React.CSSProperties
}

// The window uses `decorations: false` for a custom title bar, which on Windows
// removes the native resize border entirely (macOS/Linux behave similarly for
// undecorated windows). These thin strips pinned to the window edges restore
// edge/corner resizing via Tauri's startResizeDragging. Only the strips capture
// pointer events; the rest of the overlay is click-through.
const HANDLES: HandleSpec[] = [
  { dir: 'North', cursor: 'ns-resize', style: { top: 0, left: CORNER, right: CORNER, height: EDGE } },
  { dir: 'South', cursor: 'ns-resize', style: { bottom: 0, left: CORNER, right: CORNER, height: EDGE } },
  { dir: 'West', cursor: 'ew-resize', style: { left: 0, top: CORNER, bottom: CORNER, width: EDGE } },
  { dir: 'East', cursor: 'ew-resize', style: { right: 0, top: CORNER, bottom: CORNER, width: EDGE } },
  { dir: 'NorthWest', cursor: 'nwse-resize', style: { top: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: 'NorthEast', cursor: 'nesw-resize', style: { top: 0, right: 0, width: CORNER, height: CORNER } },
  { dir: 'SouthWest', cursor: 'nesw-resize', style: { bottom: 0, left: 0, width: CORNER, height: CORNER } },
  { dir: 'SouthEast', cursor: 'nwse-resize', style: { bottom: 0, right: 0, width: CORNER, height: CORNER } },
]

export default function WindowResizeHandles() {
  const startResize = useCallback(
    (dir: ResizeDir) => (event: React.MouseEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
        getCurrentWindow().startResizeDragging(dir)
      )
    },
    []
  )

  if (!isTauri) return null

  return (
    <div aria-hidden className="fixed inset-0 z-[9999]" style={{ pointerEvents: 'none' }}>
      {HANDLES.map((handle) => (
        <div
          key={handle.dir}
          onMouseDown={startResize(handle.dir)}
          style={{
            position: 'fixed',
            cursor: handle.cursor,
            pointerEvents: 'auto',
            ...handle.style,
          }}
        />
      ))}
    </div>
  )
}
