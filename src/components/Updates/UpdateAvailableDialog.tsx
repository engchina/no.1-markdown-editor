import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { downloadAvailableRelease } from '../../lib/updateActions'
import { formatPublishedAt, normalizeReleaseNotes } from '../../lib/update'
import { focusElementWithoutScroll, useDialogFocusRestore } from '../../hooks/useDialogFocusRestore'
import { useUpdateStore } from '../../store/update'
import AppIcon from '../Icons/AppIcon'

interface UpdateDialogFrameBounds {
  top: number
  bottom: number
}

const UPDATE_DIALOG_FRAME_SELECTOR = '[data-overlay-boundary="true"]'
const UPDATE_DIALOG_EDGE_GAP_PX = 16
const DEFAULT_UPDATE_DIALOG_FRAME_BOUNDS: UpdateDialogFrameBounds = { top: 0, bottom: 0 }

export default function UpdateAvailableDialog() {
  const { t, i18n } = useTranslation()
  const dialogOpen = useUpdateStore((state) => state.dialogOpen)
  const release = useUpdateStore((state) => state.availableRelease)
  const closeUpdateDialog = useUpdateStore((state) => state.closeUpdateDialog)
  const skipVersion = useUpdateStore((state) => state.skipVersion)
  const dialogRef = useRef<HTMLDivElement>(null)
  const downloadButtonRef = useRef<HTMLButtonElement>(null)
  const [dialogFrameBounds, setDialogFrameBounds] = useState<UpdateDialogFrameBounds>(() =>
    resolveUpdateDialogFrameBounds()
  )

  useDialogFocusRestore(downloadButtonRef)

  useLayoutEffect(() => {
    if (!dialogOpen) return

    let resizeObserver: ResizeObserver | null = null
    let rafId: number | null = null

    const updateFrameBounds = () => {
      rafId = null
      const nextBounds = resolveUpdateDialogFrameBounds()
      setDialogFrameBounds((currentBounds) =>
        areUpdateDialogFrameBoundsEqual(currentBounds, nextBounds) ? currentBounds : nextBounds
      )
    }

    const scheduleFrameBoundsUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(updateFrameBounds)
    }

    updateFrameBounds()
    window.addEventListener('resize', scheduleFrameBoundsUpdate)
    window.addEventListener('orientationchange', scheduleFrameBoundsUpdate)

    const frameSurface = getUpdateDialogFrameSurface()
    if (frameSurface && typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(scheduleFrameBoundsUpdate)
      resizeObserver.observe(frameSurface)
    }

    return () => {
      window.removeEventListener('resize', scheduleFrameBoundsUpdate)
      window.removeEventListener('orientationchange', scheduleFrameBoundsUpdate)
      resizeObserver?.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [dialogOpen])

  useEffect(() => {
    if (!dialogOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (trapUpdateDialogTabFocus(event, dialogRef.current)) return

      if (event.key !== 'Escape') return
      event.preventDefault()
      closeUpdateDialog()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeUpdateDialog, dialogOpen])

  useEffect(() => {
    if (!dialogOpen) return
    focusElementWithoutScroll(downloadButtonRef.current)
  }, [dialogOpen])

  const releaseNotes = useMemo(() => {
    if (!release) return ''
    return normalizeReleaseNotes(release.releaseNotes)
  }, [release])

  if (!dialogOpen || !release) return null

  const publishedAt = formatPublishedAt(release.publishedAt, i18n.language)
  const dialogFrameStyle: CSSProperties = {
    top: `${dialogFrameBounds.top}px`,
    bottom: `${dialogFrameBounds.bottom}px`,
    paddingTop: `${UPDATE_DIALOG_EDGE_GAP_PX}px`,
    paddingBottom: `${UPDATE_DIALOG_EDGE_GAP_PX}px`,
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[130] overflow-hidden"
      style={{ background: 'color-mix(in srgb, var(--bg-primary) 34%, rgba(0, 0, 0, 0.44))' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeUpdateDialog()
      }}
    >
      <div
        data-update-dialog-frame="editor"
        className="pointer-events-none fixed inset-x-0 flex items-center justify-center px-3 sm:px-4"
        style={dialogFrameStyle}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-dialog-title"
          aria-describedby="update-dialog-description"
          tabIndex={-1}
          className="pointer-events-auto glass-panel animate-in flex w-full max-w-[min(640px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.5rem] shadow-2xl"
          style={{
            maxHeight: '100%',
            background: 'color-mix(in srgb, var(--bg-primary) 96%, transparent)',
            borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)',
          }}
        >
          <div
            className="flex flex-shrink-0 items-start gap-4 px-5 py-3.5"
            style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' }}
          >
            <div
              className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                color: 'var(--accent)',
              }}
            >
              <AppIcon name="download" size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="update-dialog-title" className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('updates.dialogTitle')}
              </h2>
              <p id="update-dialog-description" className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                {t('updates.dialogMessage')}
              </p>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
            style={{ scrollbarGutter: 'stable' }}
          >
            <div className="grid grid-cols-2 gap-3">
              <UpdateVersionCard
                label={t('updates.currentVersion')}
                value={release.currentVersion}
              />
              <UpdateVersionCard
                label={t('updates.latestVersion')}
                value={release.latestVersion}
                accent
              />
            </div>

            {publishedAt && (
              <div
                className="rounded-2xl px-4 py-2.5 text-sm"
                style={{
                  border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
                  background: 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{t('updates.publishedAt')}</span>
                <span className="ml-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {publishedAt}
                </span>
              </div>
            )}

            <section
              className="rounded-[1.25rem] px-4 py-3.5"
              style={{
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
                background: 'color-mix(in srgb, var(--bg-secondary) 72%, transparent)',
              }}
            >
              <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
                <h3 className="flex-shrink-0 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t('updates.releaseNotes')}
                </h3>
                {release.assetName && (
                  <span
                    className="min-w-0 max-w-[65%] truncate rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                      color: 'var(--accent)',
                    }}
                  >
                    {release.assetName}
                  </span>
                )}
              </div>
              <div
                className="overflow-y-auto rounded-xl px-3 py-3 text-sm leading-6"
                style={{
                  maxHeight: 'clamp(96px, 26dvh, 220px)',
                  background: 'color-mix(in srgb, var(--bg-primary) 72%, transparent)',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {releaseNotes || t('updates.releaseNotesEmpty')}
              </div>
            </section>
          </div>

          <div
            className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' }}
          >
            <button
              ref={downloadButtonRef}
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    await downloadAvailableRelease(release)
                    closeUpdateDialog()
                  } catch {
                    // Error notice is already handled in the download helper.
                  }
                })()
              }}
              className="min-h-[38px] rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'var(--accent)',
                color: 'white',
              }}
            >
              {t('updates.downloadLatest')}
            </button>
            <button
              type="button"
              onClick={() => skipVersion(release.latestVersion)}
              className="min-h-[38px] rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)',
                color: 'var(--text-secondary)',
                border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
              }}
            >
              {t('updates.skipVersion')}
            </button>
            <button
              type="button"
              onClick={closeUpdateDialog}
              className="min-h-[38px] rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: 'transparent',
                color: 'var(--text-muted)',
              }}
            >
              {t('updates.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function UpdateVersionCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div
      className="rounded-[1.25rem] px-4 py-3.5"
      style={{
        border: accent
          ? '1px solid color-mix(in srgb, var(--accent) 42%, transparent)'
          : '1px solid color-mix(in srgb, var(--border) 78%, transparent)',
        background: accent
          ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary))'
          : 'color-mix(in srgb, var(--bg-secondary) 78%, transparent)',
      }}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold" style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function getUpdateDialogFrameSurface(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(UPDATE_DIALOG_FRAME_SELECTOR)
}

function resolveUpdateDialogFrameBounds(): UpdateDialogFrameBounds {
  if (typeof window === 'undefined') return DEFAULT_UPDATE_DIALOG_FRAME_BOUNDS

  const frameSurface = getUpdateDialogFrameSurface()
  if (!frameSurface) return DEFAULT_UPDATE_DIALOG_FRAME_BOUNDS

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return DEFAULT_UPDATE_DIALOG_FRAME_BOUNDS
  }

  const rect = frameSurface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return DEFAULT_UPDATE_DIALOG_FRAME_BOUNDS
  }

  const top = clampUpdateDialogFrameInset(Math.round(rect.top), viewportHeight)
  const bottom = clampUpdateDialogFrameInset(Math.round(viewportHeight - rect.bottom), viewportHeight)

  if (top + bottom >= viewportHeight) return DEFAULT_UPDATE_DIALOG_FRAME_BOUNDS
  return { top, bottom }
}

function clampUpdateDialogFrameInset(value: number, viewportHeight: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), viewportHeight)
}

function areUpdateDialogFrameBoundsEqual(
  currentBounds: UpdateDialogFrameBounds,
  nextBounds: UpdateDialogFrameBounds
): boolean {
  return currentBounds.top === nextBounds.top && currentBounds.bottom === nextBounds.bottom
}

function getUpdateDialogFocusableElements(dialog: HTMLElement): HTMLElement[] {
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false
    return element.getClientRects().length > 0
  })
}

function trapUpdateDialogTabFocus(event: KeyboardEvent, dialog: HTMLElement | null): boolean {
  if (event.key !== 'Tab' || !dialog) return false

  const focusableElements = getUpdateDialogFocusableElements(dialog)
  const fallbackFocusTarget = focusableElements[0] ?? dialog
  const activeElement = document.activeElement

  if (!(activeElement instanceof HTMLElement) || !dialog.contains(activeElement)) {
    event.preventDefault()
    focusElementWithoutScroll(fallbackFocusTarget)
    return true
  }

  if (focusableElements.length === 0) {
    event.preventDefault()
    focusElementWithoutScroll(dialog)
    return true
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault()
    focusElementWithoutScroll(lastElement)
    return true
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault()
    focusElementWithoutScroll(firstElement)
    return true
  }

  return false
}
