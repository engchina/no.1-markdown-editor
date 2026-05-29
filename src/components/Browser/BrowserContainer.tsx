import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEditorStore } from '../../store/editor'

interface BrowserContainerProps {
  tab: {
    id: string
    url?: string
    name: string
  }
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const logDebug = async (msg: string) => {
  console.log('[BrowserContainer]', msg)
  if (isTauri) {
    try {
      await invoke('log_debug', { msg: `[JS] ${msg}` })
    } catch (_) {}
  }
}

export default function BrowserContainer({ tab }: BrowserContainerProps) {
  const label = `browser-${tab.id}`
  const initialUrl = tab.url || 'https://google.com'
  const [urlInput, setUrlInput] = useState(initialUrl)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const viewportRef = useRef<HTMLDivElement>(null)

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
      void logDebug('Failed to navigate: ' + e)
    }
  }

  // Go back
  const goBack = async () => {
    if (!isTauri) return
    try {
      await invoke('browser_go_back', { label })
    } catch (e) {
      void logDebug('Failed goBack: ' + e)
    }
  }

  // Go forward
  const goForward = async () => {
    if (!isTauri) return
    try {
      await invoke('browser_go_forward', { label })
    } catch (e) {
      void logDebug('Failed goForward: ' + e)
    }
  }

  // Reload page
  const reload = async () => {
    if (!isTauri) return
    try {
      await invoke('browser_reload', { label })
    } catch (e) {
      void logDebug('Failed reload: ' + e)
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
        void logDebug('Listen failed: ' + e)
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
    void logDebug("BrowserContainer useEffect mounted for " + label)

    const syncPosition = async () => {
      if (!active) return
      const rect = viewport.getBoundingClientRect()
      
      // Skip if size is zero (unrendered or hidden tab)
      if (rect.width <= 0 || rect.height <= 0) {
        void logDebug("syncPosition skipped due to 0 size: w=" + rect.width + ", h=" + rect.height)
        return
      }

      const x = rect.left
      const y = rect.top
      const width = rect.width
      const height = rect.height

      void logDebug(`syncPosition calling create_browser_webview: x=${x}, y=${y}, w=${width}, h=${height}`)

      try {
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
      } catch (e) {
        void logDebug("syncPosition invoke ERROR: " + e)
      }
    }

    // Set up ResizeObserver to sync webview bounds on size changes
    const resizeObserver = new ResizeObserver(() => {
      void logDebug("ResizeObserver triggered")
      void syncPosition()
    })
    resizeObserver.observe(viewport)

    // Trigger initial positioning sync
    void syncPosition()

    // Handle scroll/layout shifts
    window.addEventListener('resize', syncPosition)

    return () => {
      void logDebug("BrowserContainer useEffect cleanup for " + label)
      active = false
      resizeObserver.disconnect()
      window.removeEventListener('resize', syncPosition)

      // Hide or destroy based on tab existence (switch vs close)
      void (async () => {
        try {
          const tabs = useEditorStore.getState().tabs
          const tabExists = tabs.some((t) => t.id === tab.id)

          if (tabExists) {
            void logDebug("tabExists is true, calling show_browser_webview(false)")
            await invoke('show_browser_webview', { label, visible: false })
          } else {
            void logDebug("tabExists is false, calling destroy_browser_webview")
            await invoke('destroy_browser_webview', { label })
          }
        } catch (e) {
          void logDebug("cleanup invoke ERROR: " + e)
        }
      })()
    }
  }, [label, tab.id, currentUrl])

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
          title="Back"
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
          title="Forward"
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
          title="Reload"
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
          onClick={() => navigateTo('https://google.com')}
          title="Home"
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
            placeholder="Search or enter website URL..."
            className="w-full h-7 px-3 rounded-md text-xs transition-all focus:outline-none focus:ring-1 focus:ring-[var(--accent)] border"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </form>
      </div>

      {/* Webview Position Viewport Placeholder */}
      <div ref={viewportRef} className="flex-1 w-full h-full relative" style={{ background: '#ffffff' }}>
        {!isTauri && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center" style={{ color: 'var(--text-muted)' }}>
            <svg className="mb-4 opacity-40 animate-bounce" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <p className="text-sm font-semibold">Tauri Native Webview Placeholder</p>
            <p className="text-xs opacity-75 mt-1 max-w-sm">
              Native webviews only render in the desktop app environment. Run the app inside Tauri to browse external sites.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
