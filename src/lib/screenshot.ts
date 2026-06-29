import { isMacPlatform } from './platform.ts'

export const SCREENSHOT_REQUEST_EVENT = 'app:screenshot-request'
export const SCREENSHOT_CONTEXT_REQUEST_EVENT = 'editor:screenshot-context-request'
export const SCREENSHOT_CONTEXT_RESPONSE_EVENT = 'editor:screenshot-context-response'
export const SCREENSHOT_INSERT_EVENT = 'editor:screenshot-insert'
export const SCREENSHOT_RETURN_FOCUS_EVENT = 'editor:screenshot-return-focus'
export const SCREENSHOT_FIXTURE_EVENT = 'app:screenshot-fixture'

export const TAURI_SCREENSHOT_REQUEST_EVENT = 'screenshot-requested'
export const TAURI_SCREENSHOT_CAPTURED_EVENT = 'screenshot-captured'
export const TAURI_SCREENSHOT_CANCELLED_EVENT = 'screenshot-cancelled'
export const TAURI_SCREENSHOT_OVERLAY_BEGIN_EVENT = 'screenshot-overlay-begin'

export interface ScreenshotRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotMonitorDescriptor {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
}

export interface ScreenshotBeginResult {
  sessionId: string
  mode: 'overlay' | 'portal'
  monitors: ScreenshotMonitorDescriptor[]
}

export interface ScreenshotCapturedPayload {
  sessionId: string
  monitorId: string
  selection: ScreenshotRect
  edit?: unknown
}

export interface ScreenshotInsertionTarget {
  tabId: string
  tabPath: string | null
  docText: string
  selectionFrom: number
  selectionTo: number
  anchorOffset: number
  scrollTop: number
  scrollLeft: number
}

export function offsetFromLineColumn(
  content: string,
  line: number,
  column: number
): number {
  const lines = content.split('\n')
  const lineIndex = Math.max(0, Math.min(Math.trunc(line) - 1, lines.length - 1))
  let offset = 0
  for (let index = 0; index < lineIndex; index += 1) {
    offset += lines[index].length + 1
  }
  return Math.min(content.length, offset + Math.max(0, Math.min(Math.trunc(column), lines[lineIndex].length)))
}

export interface ScreenshotContextRequestDetail {
  requestId: string
}

export interface ScreenshotContextResponseDetail {
  requestId: string
  target: ScreenshotInsertionTarget
}

export interface ScreenshotInsertDetail {
  target: ScreenshotInsertionTarget
  file: File
  resolve: (result: { stale: boolean }) => void
  reject: (error: unknown) => void
}

export interface ScreenshotFixtureDetail {
  imageUrl: string
  width: number
  height: number
  selection: ScreenshotRect
}

export function getScreenshotShortcutLabel(): string {
  return isMacPlatform() ? '⌥A' : 'Alt+A'
}

export function dispatchScreenshotRequest(): boolean {
  return document.dispatchEvent(new CustomEvent(SCREENSHOT_REQUEST_EVENT))
}

export function clampScreenshotRect(rect: ScreenshotRect, width: number, height: number): ScreenshotRect {
  const x = Math.max(0, Math.min(Math.round(rect.x), Math.max(0, width - 1)))
  const y = Math.max(0, Math.min(Math.round(rect.y), Math.max(0, height - 1)))
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(rect.width), width - x)),
    height: Math.max(1, Math.min(Math.round(rect.height), height - y)),
  }
}

export function normalizeScreenshotRect(
  start: { x: number; y: number },
  end: { x: number; y: number }
): ScreenshotRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

export function resolveScreenshotInsertionRange(
  target: ScreenshotInsertionTarget,
  currentDoc: string
): { from: number; to: number; stale: boolean } {
  if (target.docText === currentDoc) {
    return {
      from: Math.max(0, Math.min(target.selectionFrom, currentDoc.length)),
      to: Math.max(0, Math.min(target.selectionTo, currentDoc.length)),
      stale: false,
    }
  }

  const anchor = Math.max(0, Math.min(target.anchorOffset, currentDoc.length))
  return { from: anchor, to: anchor, stale: true }
}
