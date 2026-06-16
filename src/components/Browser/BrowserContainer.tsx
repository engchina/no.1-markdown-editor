import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../../store/editor'
import {
  BROWSER_EXTRACTION_MODES,
  collectPageContent,
  type BrowserExtractionMode,
} from '../../lib/browser/agentBridge'
import {
  buildWebClipMarkdown,
  buildWebpageAttachment,
} from '../../lib/browser/webClip'
import { DEFAULT_BROWSER_URL } from '../../lib/browser/defaults'
import { dispatchEditorAIOpen } from '../../lib/ai/events'
import { pushErrorNotice, pushSuccessNotice } from '../../lib/notices'

interface BrowserContainerProps {
  tab: {
    id: string
    url?: string
    name: string
  }
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export default function BrowserContainer({ tab }: BrowserContainerProps) {
  const { t } = useTranslation()
  const label = `browser-${tab.id}`
  const initialUrl = tab.url || DEFAULT_BROWSER_URL
  const [urlInput, setUrlInput] = useState(initialUrl)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const viewportRef = useRef<HTMLDivElement>(null)
  const newTabMenuOpen = useEditorStore((state) => state.newTabMenuOpen)
  const zoom = useEditorStore((state) => state.zoom)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [shouldHideWebview, setShouldHideWebview] = useState(false)
  const [agentBusy, setAgentBusy] = useState<null | 'clip' | 'ask'>(null)
  const [extractionMode, setExtractionMode] = useState<BrowserExtractionMode>('auto')
  const isCapturingRef = useRef(false)

  // Clip the current page into its own Markdown draft so web research never
  // mutates the note the writer already has open.
  const clipPageToMarkdown = async () => {
    if (!isTauri || agentBusy) return
    setAgentBusy('clip')
    try {
      const snapshot = await collectPageContent(label, { extractionMode })
      const clip = buildWebClipMarkdown(snapshot)
      useEditorStore.getState().addTab({
        type: 'markdown',
        content: clip,
        savedContent: '',
        isDirty: true,
      })
      pushSuccessNotice('browser.agent.clipSuccess')
    } catch (e) {
      console.error('Browser clip error:', e)
      pushErrorNotice('browser.agent.clipError', 'browser.agent.clipError')
    } finally {
      setAgentBusy(null)
    }
  }

  // Ask AI about the current page (scenario 2). Captures the page and opens the
  // shared AI composer with the page content injected as a `webpage` context
  // attachment; the composer's occlusion detector hides the native webview so
  // the overlay is visible.
  const askAboutPage = async () => {
    if (!isTauri || agentBusy) return
    setAgentBusy('ask')
    try {
      const snapshot = await collectPageContent(label, { extractionMode })
      dispatchEditorAIOpen({
        source: 'command-palette',
        intent: 'ask',
        outputTarget: 'chat-only',
        explicitContextAttachments: [buildWebpageAttachment(snapshot)],
      })
    } catch (e) {
      console.error('Browser ask error:', e)
      pushErrorNotice('browser.agent.askError', 'browser.agent.askError')
    } finally {
      setAgentBusy(null)
    }
  }

  // Webview occlusion detector (checks for modal overlays and dropdown panels overlapping the viewport).
  // Native child webviews always paint above DOM, so before hiding we capture a
  // screenshot of the page to show as a placeholder, preventing a white flash.
  useEffect(() => {
    if (!isTauri) return

    const checkOverlays = () => {
      const viewport = viewportRef.current
      if (!viewport) return

      const viewportRect = viewport.getBoundingClientRect()
      if (viewportRect.width <= 0 || viewportRect.height <= 0) return

      let shouldHide = false

      // Query for settings panels, dialogs, and the command palette backdrop overlay
      const overlays = document.querySelectorAll('.glass-panel, [role="dialog"], .command-palette__backdrop')

      for (const overlay of Array.from(overlays)) {
        if (overlay.getAttribute('role') === 'toolbar') continue
        if (overlay.getAttribute('data-new-tab-menu') === 'true') continue

        const rect = overlay.getBoundingClientRect()
        // Check if there is actual intersection with the viewport
        const intersects = !(
          rect.right <= viewportRect.left ||
          rect.left >= viewportRect.right ||
          rect.bottom <= viewportRect.top ||
          rect.top >= viewportRect.bottom
        )

        if (intersects) {
          shouldHide = true
          break
        }
      }

      if (shouldHide) {
        if (!screenshotUrl && !isCapturingRef.current) {
          isCapturingRef.current = true
          invoke<string>('capture_browser_webview', { label })
            .then((b64) => {
              setScreenshotUrl(b64)
              setShouldHideWebview(true)
            })
            .catch((err) => {
              console.error('Browser screenshot capture error:', err)
              setShouldHideWebview(true)
            })
            .finally(() => {
              isCapturingRef.current = false
            })
          return
        }

        if (screenshotUrl) {
          setShouldHideWebview(true)
        }
      } else {
        setScreenshotUrl(null)
        setShouldHideWebview(false)
      }
    }

    // Initial run
    checkOverlays()

    // Observe child insertions and removals in body
    const observer = new MutationObserver(() => {
      checkOverlays()
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [screenshotUrl, label])

  // Navigate to url helper
  const navigateTo = async (targetUrl: string) => {
    if (!isTauri) return
    let url = targetUrl.trim()
    if (!url) return

    // Auto-search fallback or prepend protocol
    if (!/^https?:\/\//i.test(url)) {
      if (url.includes('.') && !url.includes(' ')) {
        url = `https://${url}`
      } else {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`
      }
    }

    setUrlInput(url)
    try {
      await invoke('browser_navigate', { label, url })
    } catch (e) {
      console.error('Browser navigate error:', e)
    }
  }

  // Go back
  const goBack = async () => {
    if (!isTauri) return
    try {
      await invoke('browser_go_back', { label })
    } catch (e) {
      console.error('Browser go back error:', e)
    }
  }

  // Go forward
  const goForward = async () => {
    if (!isTauri) return
    try {
      await invoke('browser_go_forward', { label })
    } catch (e) {
      console.error('Browser go forward error:', e)
    }
  }

  // Reload page
  const reload = async () => {
    if (!isTauri) return
    try {
      await invoke('browser_reload', { label })
    } catch (e) {
      console.error('Browser reload error:', e)
    }
  }

  // Listen for navigation events from Rust backend to update the URL input bar
  useEffect(() => {
    if (!isTauri) return
    let unlisten: (() => void) | undefined

    void (async () => {
      try {
        unlisten = await listen<string>(`browser-url-changed-${label}`, (event) => {
          const newUrl = event.payload
          setCurrentUrl(newUrl)
          setUrlInput(newUrl)
          // Dynamically update the Zustand store so the tab remembers the current URL and name
          const store = useEditorStore.getState()
          if (typeof (store as any).updateTabUrl === 'function') {
            ;(store as any).updateTabUrl(tab.id, newUrl)
          }
        })
      } catch (e) {
        console.error('Browser URL change listener error:', e)
      }
    })()

    return () => {
      if (unlisten) unlisten()
    }
  }, [label, tab.id])

  // Manage Webview Lifecycle (Mount, Position, Resize, Unmount)
  useEffect(() => {
    if (!isTauri || !viewportRef.current) return

    let active = true
    const viewport = viewportRef.current
    const isActiveBrowserTab = () =>
      active && useEditorStore.getState().activeTabId === tab.id

    const syncPosition = async () => {
      if (!isActiveBrowserTab()) return

      if (shouldHideWebview) {
        try {
          await invoke('show_browser_webview', { label, visible: false })
        } catch (_) {}
        return
      }

      const rect = viewport.getBoundingClientRect()

      // Skip if size is zero (unrendered or hidden tab)
      if (rect.width <= 0 || rect.height <= 0) return

      let x = rect.left
      let y = rect.top
      let width = rect.width
      let height = rect.height

      if (newTabMenuOpen) {
        const offset = 80
        y += offset
        height -= offset
      }

      try {
        if (!isActiveBrowserTab()) return
        // This command will create the webview if it doesn't exist,
        // or show and reposition it if it already does.
        await invoke('create_browser_webview', {
          label,
          url: currentUrl,
          x,
          y,
          width,
          height,
        })
        if (!isActiveBrowserTab()) {
          await invoke('show_browser_webview', { label, visible: false })
          return
        }
        // Make sure it is visible when overlays disappear
        await invoke('show_browser_webview', { label, visible: true })
        if (!isActiveBrowserTab()) {
          await invoke('show_browser_webview', { label, visible: false })
          return
        }
        // Set zoom level
        const currentZoom = useEditorStore.getState().zoom
        await invoke('browser_set_zoom', { label, zoom: currentZoom / 100 })
      } catch (e) {
        console.error('Browser webview position sync error:', e)
      }
    }

    // Set up ResizeObserver to sync webview bounds on size changes
    const resizeObserver = new ResizeObserver(() => {
      void syncPosition()
    })
    resizeObserver.observe(viewport)

    // Trigger initial positioning sync
    void syncPosition()

    // Handle scroll/layout shifts
    window.addEventListener('resize', syncPosition)

    return () => {
      active = false
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncPosition)

      // Hide or destroy based on tab existence (switch vs close)
      void (async () => {
        try {
          const tabs = useEditorStore.getState().tabs
          const tabExists = tabs.some((t) => t.id === tab.id)

          if (tabExists) {
            await invoke('show_browser_webview', { label, visible: false })
          } else {
            await invoke('destroy_browser_webview', { label })
          }
        } catch (e) {
          console.error('Browser webview cleanup error:', e)
        }
      })()
    }
  }, [label, tab.id, currentUrl, newTabMenuOpen, shouldHideWebview])

  // Sync Webview zoom level when store zoom changes
  useEffect(() => {
    if (!isTauri) return
    let active = true
    const updateZoom = async () => {
      try {
        if (active) {
          await invoke('browser_set_zoom', { label, zoom: zoom / 100 })
        }
      } catch (e) {
        console.error('Browser zoom sync error:', e)
      }
    }
    void updateZoom()
    return () => {
      active = false
    }
  }, [label, zoom])

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: 'var(--editor-bg)' }}>
      {/* Browser Navigation Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0"
        style={{
          background: 'color-mix(in srgb, var(--bg-secondary) 88%, transparent)',
          borderColor: 'var(--border)',
          height: '42px',
        }}
      >
        {/* Back Button */}
        <button
          type="button"
          onClick={goBack}
          title={t('browser.navigation.back')}
          aria-label={t('browser.navigation.back')}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Forward Button */}
        <button
          type="button"
          onClick={goForward}
          title={t('browser.navigation.forward')}
          aria-label={t('browser.navigation.forward')}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Reload Button */}
        <button
          type="button"
          onClick={reload}
          title={t('browser.navigation.reload')}
          aria-label={t('browser.navigation.reload')}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>

        {/* Home Button */}
        <button
          type="button"
          onClick={() => navigateTo(DEFAULT_BROWSER_URL)}
          title={t('browser.navigation.home')}
          aria-label={t('browser.navigation.home')}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-tertiary)] transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>

        {/* Address Input Bar */}
        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault()
            void navigateTo(urlInput)
          }}
        >
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={t('browser.navigation.addressPlaceholder')}
            className="w-full h-7 px-3 rounded-md text-xs transition-all focus:outline-none focus:ring-1 focus:ring-[var(--accent)] border"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </form>

        <select
          value={extractionMode}
          onChange={(event) => setExtractionMode(event.target.value as BrowserExtractionMode)}
          disabled={agentBusy !== null}
          title={t('browser.agent.modeLabel')}
          aria-label={t('browser.agent.modeLabel')}
          className="h-7 max-w-[7.5rem] rounded-md border px-2 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {BROWSER_EXTRACTION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`browser.agent.modes.${mode}`)}
            </option>
          ))}
        </select>

        {/* Clip page to Markdown (scenario 1) */}
        <button
          type="button"
          onClick={clipPageToMarkdown}
          disabled={agentBusy !== null}
          title={t('browser.agent.clip')}
          aria-label={t('browser.agent.clip')}
          className="h-7 px-2 flex items-center gap-1 rounded-md text-xs hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span className="hidden sm:inline">{agentBusy === 'clip' ? t('browser.agent.working') : t('browser.agent.clip')}</span>
        </button>

        {/* Ask AI about this page (scenario 2) */}
        <button
          type="button"
          onClick={askAboutPage}
          disabled={agentBusy !== null}
          title={t('browser.agent.ask')}
          aria-label={t('browser.agent.ask')}
          className="h-7 px-2 flex items-center gap-1 rounded-md text-xs hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="hidden sm:inline">{agentBusy === 'ask' ? t('browser.agent.working') : t('browser.agent.ask')}</span>
        </button>
      </div>

      {/* Webview Position Viewport Placeholder */}
      <div ref={viewportRef} className="flex-1 w-full h-full relative" style={{ background: '#ffffff' }}>
        {/* Screenshot stand-in shown while the native webview is hidden behind an overlay */}
        {isTauri && shouldHideWebview && screenshotUrl && (
          <img
            src={screenshotUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-top pointer-events-none select-none"
          />
        )}
        {!isTauri && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center" style={{ color: 'var(--text-muted)' }}>
            <svg className="mb-4 opacity-40 animate-bounce" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <p className="text-sm font-semibold">{t('browser.desktopOnly.title')}</p>
            <p className="text-xs opacity-75 mt-1 max-w-sm">
              {t('browser.desktopOnly.message')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
